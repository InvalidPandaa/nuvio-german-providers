// Stream proxy for the addon: Tizen's AVPlay only applies Cookie and User-Agent from proxyHeaders (no Referer), and
// hoster URLs are often bound to the IP that resolved them, so such streams are played through the server instead.
// Links are HMAC-signed and expire, so this only ever proxies URLs the server resolved itself.
const crypto = require('crypto');
const { Readable } = require('stream');

const SECRET = process.env.PROXY_SECRET || crypto.randomBytes(32).toString('hex');
const TTL_MS = 6 * 3600 * 1000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const sign = data => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

// the trailing file name is ignored by the server, it only hints the format (index.m3u8, video.mp4) to players
function proxyUrl(base, url, headers) {
    const data = Buffer.from(JSON.stringify({ u: url, h: headers || {}, exp: Date.now() + TTL_MS })).toString('base64url');
    const file = new URL(url).pathname.split('/').pop().replace(/[^\w.-]/g, '') || 'stream';
    return `${base}/p/${data}.${sign(data)}/${file}`;
}

function verify(token) {
    const [data, sig] = String(token).split('.');
    if (!data || !sig) return null;
    const expected = Buffer.from(sign(data));
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), expected)) return null;
    const t = JSON.parse(Buffer.from(data, 'base64url').toString());
    return t.exp > Date.now() ? t : null;
}

// every URI in a playlist (variant/segment lines and URI="..." of EXT-X-KEY/MEDIA/MAP/I-FRAME) -> wrap(absolute URI)
function rewritePlaylist(text, playlistUrl, wrap) {
    const abs = u => new URL(u, playlistUrl).href;
    return text.split(/\r?\n/).map(line => {
        const l = line.trim();
        if (!l) return line;
        if (l.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${wrap(abs(u))}"`);
        return wrap(abs(l));
    }).join('\n');
}

async function handle(req, res, token, base) {
    const t = verify(token);
    if (!t) {
        res.writeHead(403, { 'Access-Control-Allow-Origin': '*' });
        return res.end();
    }
    // identity: Node's fetch would gunzip the body and the upstream content-length would no longer match
    const headers = Object.assign({ 'User-Agent': UA, 'Accept-Encoding': 'identity' }, t.h);
    // playlists are rewritten whole, so a byte range of them makes no sense
    if (req.headers.range && !/\.m3u8$/i.test(new URL(t.u).pathname)) headers.Range = req.headers.range;
    const ac = new AbortController();
    res.on('close', () => ac.abort());
    let up;
    try {
        up = await fetch(t.u, { method: req.method === 'HEAD' ? 'HEAD' : 'GET', headers, signal: ac.signal });
    } catch (e) {
        res.writeHead(502, { 'Access-Control-Allow-Origin': '*' });
        return res.end();
    }
    const type = up.headers.get('content-type') || '';
    // ponytail: playlists detected by content type / .m3u8 path only; sniff the body if a hoster serves them as text/plain without .m3u8
    if (up.ok && req.method !== 'HEAD' && (/mpegurl/i.test(type) || /\.m3u8$/i.test(new URL(up.url).pathname))) {
        const text = rewritePlaylist(await up.text(), up.url, u => proxyUrl(base, u, t.h));
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Access-Control-Allow-Origin': '*' });
        return res.end(text);
    }
    const out = { 'Access-Control-Allow-Origin': '*' };
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const v = up.headers.get(h);
        if (v) out[h] = v;
    }
    if (up.headers.get('content-encoding')) delete out['content-length'];
    res.writeHead(up.status, out);
    if (!up.body || req.method === 'HEAD') return res.end();
    Readable.fromWeb(up.body).on('error', () => res.destroy()).pipe(res);
}

module.exports = { proxyUrl, verify, rewritePlaylist, handle };
