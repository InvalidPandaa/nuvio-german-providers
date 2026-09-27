#!/usr/bin/env node
// Offline self-check of the extractor logic that has no live-network test: node check.js
const assert = require('assert');
const esbuild = require('esbuild');

esbuild.buildSync({ entryPoints: ['shared/extractors/util.js'], outdir: 'node_modules/.cache/check', bundle: true, format: 'cjs', platform: 'neutral', external: ['cheerio', 'crypto-js'] });
const { unpack, jwplayer } = require('./node_modules/.cache/check/util.js');

const packed = `<script>eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('0 1=\\'2\\';3.4({5:[{6:"7://8.9/a.b"}]})',12,12,'var|x|h\\u00e9llo|jwplayer|setup|sources|file|https|cdn|example|master|m3u8'.split('|'),0,{}))</script>`;
const code = unpack(packed);
assert.ok(code.startsWith("var x='"), code);
assert.deepStrictEqual(jwplayer(code, 'https://host.tld/e/1'), [{ url: 'https://cdn.example/master.m3u8', quality: 'auto' }]);
assert.deepStrictEqual(jwplayer('sources: [{file:"/v.mp4",label:"720p"}]', 'https://h.tld/x'), [{ url: 'https://h.tld/v.mp4', quality: '720p' }]);

console.log('check ok');
