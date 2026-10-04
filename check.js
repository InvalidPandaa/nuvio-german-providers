#!/usr/bin/env node
// Offline self-check of the extractor logic that has no live-network test: node check.js
const assert = require('assert');
const esbuild = require('esbuild');

esbuild.buildSync({ entryPoints: ['shared/extractors/util.js', 'shared/http.js'], outdir: 'node_modules/.cache/check', bundle: true, format: 'cjs', platform: 'neutral', external: ['cheerio', 'crypto-js'] });
const { unpack, jwplayer } = require('./node_modules/.cache/check/extractors/util.js');

const packed = `<script>eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('0 1=\\'2\\';3.4({5:[{6:"7://8.9/a.b"}]})',12,12,'var|x|h\\u00e9llo|jwplayer|setup|sources|file|https|cdn|example|master|m3u8'.split('|'),0,{}))</script>`;
const code = unpack(packed);
assert.ok(code.startsWith("var x='"), code);
assert.deepStrictEqual(jwplayer(code, 'https://host.tld/e/1'), [{ url: 'https://cdn.example/master.m3u8', quality: 'auto' }]);
assert.deepStrictEqual(jwplayer('sources: [{file:"/v.mp4",label:"720p"}]', 'https://h.tld/x'), [{ url: 'https://h.tld/v.mp4', quality: '720p' }]);


// a provider that fails early while a request is still running must not answer before that request is done
(async () => {
    const { provider, send } = require('./node_modules/.cache/check/http.js');
    let finished = false;
    globalThis.fetch = () => new Promise(resolve => setTimeout(() => { finished = true; resolve({ ok: true }); }, 50));
    console.error = () => {};
    const streams = await provider(async () => { send('https://slow.example'); throw new Error('early'); }).getStreams('1', 'movie');
    assert.deepStrictEqual(streams, []);
    assert.ok(finished, 'getStreams answered while a request was still running');

    // TMDB counts Re:ZERO as one season of 85 episodes, the sites as four seasons of 25/25/16/19
    esbuild.buildSync({ entryPoints: ['src/serienstream/common.js'], outfile: 'node_modules/.cache/check/common.js', bundle: true, format: 'cjs', platform: 'neutral' });
    const { splitSeasonPath } = require('./node_modules/.cache/check/common.js');
    globalThis.fetch = async url => {
        const s = Number(url.match(/staffel-(\d+)$/)[1]);
        const row = i => `<a href="/anime/stream/x/staffel-${s}/episode-${i + 1}">${i + 1}</a>`;
        // every episode is linked twice (number and title column)
        return { ok: true, text: async () => Array.from({ length: [25, 25, 16, 19][s - 1] || 0 }, (_, i) => row(i) + row(i)).join('') };
    };
    assert.strictEqual(await splitSeasonPath('https://a.example', '/anime/stream/x', 1, 78), '/anime/stream/x/staffel-4/episode-12');
    assert.strictEqual(await splitSeasonPath('https://a.example', '/anime/stream/x', 2, 26), '/anime/stream/x/staffel-3/episode-1');
    assert.strictEqual(await splitSeasonPath('https://a.example', '/anime/stream/x', 1, 5), null);
    assert.strictEqual(await splitSeasonPath('https://a.example', '/anime/stream/x', 1, 999), null);
    console.log('check ok');
})();
