import { getText } from '../../shared/http.js';
import { getMeta } from '../../shared/tmdb.js';
import { pickBest } from '../../shared/match.js';
import { load, all } from '../../shared/dom.js';
import { resolveAll } from '../../shared/extractors/index.js';

// Behind a Cloudflare managed challenge (CloudStream uses a WebView CloudflareKiller); plain requests only pass where CF doesn't challenge.
const BASE = 'https://kinoger.com';
// fsst.online (redirects to incvideo*.online) is a PlayerJS page: file:"[360p]url,[720p]url"; CloudStream has no extractor for it
async function fsst(url) {
    const file = ((await getText(url, { headers: { Referer: BASE + '/' } })).match(/file:\s*"([^"]+)"/) || [])[1] || '';
    return file.split(',').map(f => f.match(/^\[(\d+p)\](.+)$/)).filter(Boolean)
        .map(m => ({ url: m[2], quality: m[1], host: 'fsst.online' }));
}

const HEADERS = { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'de-DE,de;q=0.9' };

async function search(meta) {
    for (const q of meta.titles) {
        const $ = load(await getText(`${BASE}/?do=search&subaction=search&titleonly=3&story=${encodeURIComponent(q)}&x=0&y=0&submit=submit`, { headers: HEADERS }));
        const items = all($, 'div#dle-content div.titlecontrol').map(e => {
            let url = e.find('a').first().attr('href') || '';
            const m = url.match(/^https?:\/\/[^/]+\/(.+)-ep/);
            if (url.includes('-episode-') && m) url = `${BASE}/series/${m[1]}`;
            const raw = e.find('a').first().text().trim().replace(/ Film$/, '');
            return {
                url,
                // series years on the site are often wrong, so only movies use them for matching
                year: meta.type === 'movie' ? (raw.match(/\((\d{4})\)/) || [])[1] : undefined,
                title: raw.replace(/\s*\(\d{4}\)/, '').replace(/\s+Staffel\s.*$/i, ''),
            };
        }).filter(i => i.url && !/kinoger/i.test(i.title));
        const hit = pickBest(items, meta);
        if (hit) return hit.url;
    }
    return null;
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        const meta = await getMeta(tmdbId, mediaType);
        const url = await search(meta);
        if (!url) return [];
        const html = await getText(url, { headers: Object.assign({ Referer: BASE + '/' }, HEADERS) });
        // one <script>X.show(n, [[s1e1, s1e2..], [s2e1..]], 0.2)</script> per hoster; a trailing 0.2 marks a movie
        const re = /\w+\.show\(\s*\d+\s*,\s*(\[\s*\[[\s\S]*?\]\s*\])\s*(?:,\s*([\d.]+)\s*)?\)/g;
        const embeds = [];
        let m;
        while ((m = re.exec(html))) {
            if ((m[2] === '0.2') !== (mediaType === 'movie')) continue;
            try {
                const seasons = JSON.parse(m[1].replace(/'/g, '"'));
                const link = mediaType === 'movie' ? (seasons[0] || [])[0] : (seasons[season - 1] || [])[episode - 1];
                if (link && link.trim()) embeds.push(link.trim());
            } catch (e) { /* malformed hoster array, skip it */ }
        }
        const fs = embeds.filter(e => /fsst\.online/.test(e));
        const streams = [].concat(await resolveAll(embeds.filter(e => fs.indexOf(e) < 0), BASE + '/'), ...await Promise.all(fs.map(e => fsst(e).catch(() => []))));
        return streams.map(s => ({
            name: 'Kinoger',
            title: `${s.host} · Deutsch · ${s.quality}`,
            url: s.url,
            quality: s.quality,
            headers: s.headers,
        }));
    } catch (e) {
        console.error(`[Kinoger] ${e.message}`);
    }
    return [];
}

module.exports = { getStreams };
