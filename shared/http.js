export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Nuvio on iOS closes the QuickJS runtime as soon as getStreams settles (or after its 60 s timeout); a fetch still
// in flight at that moment aborts the whole app. So every request goes through send(), and provider() only
// answers once none is running. After DEADLINE_MS no new request starts, to stay clear of Nuvio's timeout.
const DEADLINE_MS = 40000;
let running = 0, idle = [], deadline = Infinity;

export function send(url, opts) {
    if (Date.now() > deadline) return Promise.reject(new Error(`deadline reached, skipped ${url}`));
    running++;
    const done = () => { if (--running === 0) idle.splice(0).forEach(resolve => resolve()); };
    return fetch(url, opts).then(res => { done(); return res; }, err => { done(); throw err; });
}

// Nuvio mobile/desktop show only `name` and `quality` (not `title`), Nuvio TV shows `name - quality` plus `title`,
// so the language goes into the name and 'auto' becomes the stream format.
const LANGS = [[/ger-?sub/i, 'Ger-Sub'], [/eng-?sub/i, 'Eng-Sub'], [/\bomu\b/i, 'OmU'], [/\bov\b/i, 'OV'],
    [/englisch|\ben\b/i, 'Englisch'], [/franz|\bfr\b/i, 'Französisch'], [/deutsch|\bde\b/i, 'Deutsch']];

function decorate(s) {
    const lang = (LANGS.find(([re]) => re.test(s.title || '')) || [])[1] || 'Deutsch';
    const quality = s.quality && s.quality !== 'auto' ? s.quality : (/\.m3u8|\/hls|master/i.test(s.url) ? 'HLS' : 'MP4');
    const host = ((s.title || '').split(' · ')[0].match(/^[\w-]+\.[a-z]{2,}$/) || [])[0];
    return Object.assign({}, s, { name: [s.name, lang, host].filter(Boolean).join(' · '), quality });
}

export function provider(getStreams) {
    return {
        async getStreams(tmdbId, mediaType, season, episode) {
            deadline = Date.now() + DEADLINE_MS;
            // Nuvio's "Test provider" passes 'series' where playback passes 'tv'
            if (mediaType !== 'movie') mediaType = 'tv';
            let streams = [];
            try {
                streams = (await getStreams(tmdbId, mediaType, season, episode)) || [];
            } catch (e) {
                console.error(e.message);
            }
            if (running) await new Promise(resolve => idle.push(resolve));
            return streams.map(decorate);
        },
    };
}

export async function request(url, opts = {}) {
    const res = await send(url, Object.assign({}, opts, { headers: Object.assign({ 'User-Agent': UA }, opts.headers) }));
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return res;
}

export const getText = async (url, opts) => (await request(url, opts)).text();

export const getJson = async (url, opts) => JSON.parse(await getText(url, opts));

export const postJson = (url, body, opts = {}) => getJson(url, Object.assign({}, opts, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers),
}));

export const postForm = (url, form, opts = {}) => getText(url, Object.assign({}, opts, {
    method: 'POST',
    body: Object.keys(form).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(form[k])).join('&'),
    headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded' }, opts.headers),
}));

export function absolute(url, base) {
    if (!url) return url;
    if (url.startsWith('//')) return 'https:' + url;
    if (/^https?:/.test(url)) return url;
    const origin = base.match(/^https?:\/\/[^/]+/)[0];
    return url.startsWith('/') ? origin + url : base.replace(/[^/]*$/, '') + url;
}
