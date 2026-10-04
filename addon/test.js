#!/usr/bin/env node
// node addon/test.js [--offline]   offline asserts for the addon, then live /stream queries against an in-process server
// (live needs TMDB_API_KEY in the environment or in .tmdb_key). Probes the first streams of every title.
const assert = require('assert');
delete process.env.ADDON_TOKEN; // the live part calls the routes without token prefix
const proxy = require('./proxy.js');
const { server, parseId, pickProviders, manifest } = require('./server.js');

assert.deepStrictEqual(parseId('series', 'tt5753856%3A1%3A2'), { type: 'tv', ref: 'tt5753856', season: 1, episode: 2 });
assert.deepStrictEqual(parseId('series', 'tmdb:1399:3:10'), { type: 'tv', ref: 'tmdb:1399', season: 3, episode: 10 });
assert.deepStrictEqual(parseId('movie', 'tt0816692'), { type: 'movie', ref: 'tt0816692', season: null, episode: null });
assert.strictEqual(parseId('movie', 'kitsu:1'), null);
assert.strictEqual(parseId('channel', 'tt0816692'), null);

const defaults = pickProviders(null);
assert.ok(defaults.includes('ard') && !defaults.includes('kinoger') && !defaults.includes('einschaltenin'));
assert.deepStrictEqual(pickProviders('ard,nope,dmax'), ['ard', 'dmax']);
assert.deepStrictEqual(pickProviders('nope'), defaults);
assert.deepStrictEqual(manifest().idPrefixes, ['tt', 'tmdb:']);

const playlist = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-STREAM-INF:BANDWIDTH=1\nlow/index.m3u8\nhttps://cdn.example/abs.ts\n';
assert.strictEqual(proxy.rewritePlaylist(playlist, 'https://h.example/hls/master.m3u8?t=1', u => `P(${u})`),
    '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="P(https://h.example/hls/key.bin)"\n#EXT-X-STREAM-INF:BANDWIDTH=1\nP(https://h.example/hls/low/index.m3u8)\nP(https://cdn.example/abs.ts)\n');

const link = proxy.proxyUrl('http://x', 'https://h.example/v.mp4?sig=1', { Referer: 'https://h.example/' });
assert.ok(link.endsWith('/v.mp4'), link);
const token = link.split('/')[4];
assert.deepStrictEqual(proxy.verify(token).h, { Referer: 'https://h.example/' });
const [data, sig] = token.split('.');
const forged = Buffer.from(JSON.stringify({ u: 'https://evil.example/', h: {}, exp: Date.now() + 1e6 })).toString('base64url');
assert.strictEqual(proxy.verify(`${forged}.${sig}`), null);
assert.strictEqual(proxy.verify(`${data}.${sig.slice(0, -1)}`), null);
assert.strictEqual(proxy.verify('garbage'), null);
console.log('offline ok');

async function probe(s) {
    try {
        const headers = Object.assign({ Range: 'bytes=0-2047' }, (s.behaviorHints.proxyHeaders || {}).request);
        const res = await fetch(s.url, { headers });
        const type = res.headers.get('content-type') || '';
        const body = Buffer.from(await res.arrayBuffer()).toString('latin1', 0, 16);
        const ok = res.status < 400 && (/video|mpegurl|octet|mp4|binary/i.test(type) || body.startsWith('#EXTM3U'));
        return `${ok ? 'PLAYABLE' : 'CHECK'} ${res.status} ${type}`;
    } catch (e) {
        return `ERROR ${e.message}`;
    }
}

if (!process.argv.includes('--offline')) {
    server.listen(0, async () => {
        const base = `http://127.0.0.1:${server.address().port}`;
        let failed = 0;
        try {
            const m = await (await fetch(`${base}/manifest.json`)).json();
            assert.strictEqual(m.id, 'community.german-providers');
            const cases = [['movie', 'tt0816692'], ['series', 'tt5753856:1:1'], ['series', 'tt0121955:1:1'], ['movie', 'tmdb:157336']];
            for (const [type, id] of cases) {
                const t0 = Date.now();
                const res = await fetch(`${base}/stream/${type}/${encodeURIComponent(id)}.json`);
                assert.strictEqual(res.headers.get('access-control-allow-origin'), '*');
                const { streams } = await res.json();
                console.log(`${type} ${id}: ${streams.length} stream(s) in ${Date.now() - t0} ms`);
                if (!streams.length) failed++;
                for (const s of streams.slice(0, 4)) console.log(`  ${await probe(s)}  ${s.name}  ${s.url.slice(0, 90)}`);
            }
        } catch (e) {
            console.error(e);
            failed++;
        }
        server.closeAllConnections();
        server.close();
        process.exit(failed ? 1 : 0);
    });
}
