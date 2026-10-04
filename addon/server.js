#!/usr/bin/env node
// Stremio-compatible addon: runs the same bundled providers (providers/*.js) as the Nuvio plugins, but on a server,
// for clients without plugin support (Nuvio on Tizen 5.x). Settings via environment, see README ("Addon-Variante").
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const proxy = require('./proxy.js');

const ROOT = path.join(__dirname, '..');
const env = process.env;
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const list = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
const keyFile = path.join(ROOT, '.tmdb_key');
// the bundles read globalThis.TMDB_API_KEY (Nuvio injects its own key in the app)
globalThis.TMDB_API_KEY = env.TMDB_API_KEY || (fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8').trim() : '');
const PORT = num(env.PORT, 7000);
const TOKEN = env.ADDON_TOKEN || '';
const PROXY_MODE = env.PROXY_MODE || 'auto';
// DMAX/TELE 5/TLC links carry the resolving IP ("uip" in their JWT) and come without headers, so they need the proxy explicitly
const PROXY_PROVIDERS = list(env.PROXY_PROVIDERS === undefined ? 'dmax,tele5,tlc' : env.PROXY_PROVIDERS);
const TIMEOUT_MS = num(env.PROVIDER_TIMEOUT_MS, 30000);
const CACHE_TTL_MS = num(env.CACHE_TTL_S, 180) * 1000;
const RATE_LIMIT = num(env.RATE_LIMIT_PER_MIN, 30);

const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const disabled = list(env.PROVIDERS_DISABLED);
const scrapers = plugin.scrapers.filter(s => !disabled.includes(s.id));
const DEFAULTS = scrapers.filter(s => s.enabled !== false).map(s => s.id);

// Each bundle keeps request bookkeeping in module scope (shared/http.js), so it is compiled once and instantiated
// per call: concurrent requests get their own module state, and fetch/console are injected per call.
const runners = {};
for (const s of scrapers) {
    const code = fs.readFileSync(path.join(ROOT, s.filename), 'utf8');
    runners[s.id] = new vm.Script(`(function (module, exports, require, fetch, console) {${code}\n})`, { filename: s.filename }).runInThisContext();
}

async function runProvider(s, tmdbId, type, season, episode) {
    const t0 = Date.now();
    const ac = new AbortController();
    const log = (...a) => console.log(`[${s.id}]`, ...a);
    const mod = { exports: {} };
    runners[s.id](mod, mod.exports, require, (url, opts) => fetch(url, Object.assign({}, opts, { signal: ac.signal })),
        { log, info: log, warn: log, error: log, debug: () => {} });
    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), TIMEOUT_MS); });
    try {
        const streams = await Promise.race([mod.exports.getStreams(tmdbId, type, season, episode), timeout]);
        log(streams ? `${streams.length} stream(s)` : 'timeout', `${Date.now() - t0} ms`);
        return streams || [];
    } finally {
        clearTimeout(timer);
        ac.abort(); // stops whatever a timed-out provider still has running
    }
}

// in-memory TTL cache that also shares in-flight promises; empty results and errors are not kept
const cache = new Map();
function cached(key, ttl, fn) {
    const hit = cache.get(key);
    if (hit && hit.until > Date.now()) return hit.value;
    const value = fn();
    cache.set(key, { until: Date.now() + ttl, value });
    const drop = () => { if ((cache.get(key) || {}).value === value) cache.delete(key); };
    value.then(v => { if (!v || v.length === 0) drop(); }, drop);
    return value;
}

// fixed one-minute window per client IP, /stream only (proxy requests are many per video, and signed anyway)
const hits = new Map();
function limited(ip) {
    if (!RATE_LIMIT) return false;
    const min = Math.floor(Date.now() / 60000);
    const h = hits.get(ip);
    if (!h || h.min !== min) {
        hits.set(ip, { min, n: 1 });
        return false;
    }
    return ++h.n > RATE_LIMIT;
}

setInterval(() => {
    const now = Date.now();
    for (const [k, v] of cache) if (v.until < now) cache.delete(k);
    for (const [k, v] of hits) if (v.min < Math.floor(now / 60000)) hits.delete(k);
}, 60000).unref();

// ponytail: trusts the last X-Forwarded-For entry (the one Traefik/Dokploy appends); without a reverse proxy in front it is client-controlled
const clientIp = req => String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress;

// tt123 / tmdb:123, series with :season:episode; Nuvio URL-encodes the id, Stremio does not
function parseId(type, raw) {
    if (type !== 'movie' && type !== 'series') return null;
    const m = decodeURIComponent(raw).match(/^(tt\d+|tmdb:\d+)(?::(\d+):(\d+))?$/);
    if (!m) return null;
    return { type: type === 'movie' ? 'movie' : 'tv', ref: m[1], season: m[2] ? Number(m[2]) : null, episode: m[3] ? Number(m[3]) : null };
}

function toTmdb(ref, type) {
    if (ref.startsWith('tmdb:')) return Promise.resolve(ref.slice(5));
    return cached(`find|${type}|${ref}`, 24 * 3600 * 1000, async () => {
        const res = await fetch(`https://api.themoviedb.org/3/find/${ref}?api_key=${globalThis.TMDB_API_KEY}&external_source=imdb_id`);
        if (!res.ok) throw new Error(`TMDB find ${res.status}`);
        const d = await res.json();
        const hit = (type === 'movie' ? d.movie_results : d.tv_results)[0];
        return hit ? String(hit.id) : null;
    });
}

function toStremio(s, providerId, base) {
    const headers = s.headers && Object.keys(s.headers).length ? s.headers : null;
    const proxied = PROXY_MODE === 'all' || (PROXY_MODE === 'auto' && (headers || PROXY_PROVIDERS.includes(providerId)));
    const out = {
        name: s.name,
        description: [s.title, (s.title || '').includes(s.quality) ? null : s.quality].filter(Boolean).join(' · '),
        quality: s.quality, // Nuvio shows it next to the name, Stremio ignores it
        url: proxied ? proxy.proxyUrl(base, s.url, headers) : s.url,
        behaviorHints: { bingeGroup: `german-providers|${s.name}` },
    };
    if (!proxied && headers) Object.assign(out.behaviorHints, { notWebReady: true, proxyHeaders: { request: headers } });
    return out;
}

async function getStreams(type, rawId, enabled, base) {
    const p = parseId(type, rawId);
    if (!p) return [];
    const tmdbId = await toTmdb(p.ref, p.type);
    if (!tmdbId) return [];
    const t0 = Date.now();
    const active = scrapers.filter(s => enabled.includes(s.id) && s.supportedTypes.includes(p.type));
    const results = await Promise.all(active.map(s => cached(`${s.id}|${p.type}|${tmdbId}|${p.season}|${p.episode}`, CACHE_TTL_MS,
        () => runProvider(s, tmdbId, p.type, p.season, p.episode)).catch(() => [])));
    const streams = [].concat(...results.map((r, i) => r.map(s => toStremio(s, active[i].id, base))));
    console.log(`${type} ${decodeURIComponent(rawId)} (tmdb ${tmdbId}): ${streams.length} stream(s) from ${active.length} provider(s) in ${Date.now() - t0} ms`);
    return streams;
}

function manifest() {
    return {
        id: 'community.german-providers',
        version: plugin.version,
        name: plugin.name,
        description: 'Deutsche Quellen (Mediatheken und Hoster) – Server-Variante der German-Providers-Plugins für Nuvio',
        resources: ['stream'],
        types: ['movie', 'series'],
        idPrefixes: ['tt', 'tmdb:'],
        catalogs: [],
        behaviorHints: { configurable: true },
    };
}

// config path segment = comma-separated provider ids; missing or nothing valid -> the plugin manifest's defaults
function pickProviders(config) {
    const ids = config ? decodeURIComponent(config).split(',').filter(id => runners[id]) : [];
    return ids.length ? ids : DEFAULTS;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function configurePage(base, enabled) {
    const rows = scrapers.map(s => `<label title="${esc(s.description)}"><input type="checkbox" value="${s.id}"${enabled.includes(s.id) ? ' checked' : ''}>
        ${esc(s.name)}${s.enabled === false ? ' <small>(standardmäßig aus)</small>' : ''}</label>`).join('\n');
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>German Providers – Addon</title><style>
:root{color-scheme:light dark}body{font:16px system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem}
label{display:block;padding:.3rem 0}small{opacity:.6}input[type=text]{width:100%;font:inherit;padding:.4rem;box-sizing:border-box}
button,a.btn{font:inherit;padding:.4rem .8rem;margin:.5rem .5rem 0 0;display:inline-block}</style></head><body>
<h1>German Providers</h1><p>Provider auswählen, dann die Addon-URL in Nuvio unter <b>Einstellungen → Addons</b> einfügen.</p>
<form id="f">${rows}</form>
<p><input type="text" id="url" readonly></p><button id="copy" type="button">URL kopieren</button><a class="btn" id="install">In Stremio installieren</a>
<script>
const base = ${JSON.stringify(base)}, defaults = ${JSON.stringify(DEFAULTS.join(','))};
function update() {
    const ids = [...document.querySelectorAll('#f input:checked')].map(i => i.value).join(',');
    const url = base + (ids && ids !== defaults ? '/' + ids : '') + '/manifest.json';
    document.getElementById('url').value = url;
    document.getElementById('install').href = url.replace(/^https?:/, 'stremio:');
}
document.getElementById('f').onchange = update;
document.getElementById('copy').onclick = () => { const u = document.getElementById('url'); u.select(); navigator.clipboard ? navigator.clipboard.writeText(u.value) : document.execCommand('copy'); };
update();
</script></body></html>`;
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
    res.writeHead(status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function route(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' });
        return res.end();
    }
    let parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
    if (parts[0] === 'health' && parts.length === 1) return send(res, 200, { ok: true });
    let prefix = '';
    if (TOKEN) {
        if (parts[0] !== TOKEN) return send(res, 404, { err: 'not found' });
        parts = parts.slice(1);
        prefix = '/' + TOKEN;
    }
    const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const base = `${proto}://${req.headers.host}${prefix}`;
    if (parts[0] === 'p' && parts.length >= 2) return proxy.handle(req, res, parts[1], base);

    const config = parts.length && !/^(manifest\.json|configure|stream)$/.test(parts[0]) ? parts.shift() : null;
    const enabled = pickProviders(config);
    const [what, type, file] = parts;
    if (!what || (what === 'configure' && parts.length === 1)) return send(res, 200, configurePage(base, enabled), 'text/html; charset=utf-8');
    if (what === 'manifest.json' && parts.length === 1) return send(res, 200, manifest());
    if (what === 'stream' && parts.length === 3 && file.endsWith('.json')) {
        if (limited(clientIp(req))) return send(res, 429, { streams: [], err: 'rate limited' });
        return send(res, 200, { streams: await getStreams(type, file.slice(0, -5), enabled, base) });
    }
    return send(res, 404, { err: 'not found' });
}

const server = http.createServer((req, res) => {
    route(req, res).catch(e => {
        console.error(e);
        if (res.headersSent) res.destroy();
        else send(res, 500, { err: 'internal error' });
    });
});

if (require.main === module) {
    if (!globalThis.TMDB_API_KEY) {
        console.error('TMDB_API_KEY fehlt (Env-Variable oder .tmdb_key)');
        process.exit(1);
    }
    process.on('SIGTERM', () => process.exit(0)); // node as PID 1 in Docker ignores SIGTERM otherwise
    server.listen(PORT, () => console.log(`German Providers addon on :${PORT}, ${DEFAULTS.length}/${scrapers.length} providers on by default, proxy ${PROXY_MODE}`));
}

module.exports = { server, parseId, pickProviders, manifest };
