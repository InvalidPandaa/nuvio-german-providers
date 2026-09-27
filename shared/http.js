export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export async function request(url, opts = {}) {
    const res = await fetch(url, Object.assign({}, opts, { headers: Object.assign({ 'User-Agent': UA }, opts.headers) }));
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
