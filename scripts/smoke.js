#!/usr/bin/env node
// node scripts/smoke.js [provider...]   runs the BUNDLED providers against known titles (needs TMDB_API_KEY and network)
// Writes smoke-report.md and smoke-failures.txt. Exit code is 0 even when providers are down: the workflow reads the files.
//   ✅ streams found   ❌ real failure   ⚠️ blocked from this IP/region   ⚪ optional provider, nothing found
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
globalThis.TMDB_API_KEY = process.env.TMDB_API_KEY;
if (!globalThis.TMDB_API_KEY) { console.error('TMDB_API_KEY is not set'); process.exit(2); }

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'smoke.json'), 'utf8'));
delete config._comment;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const wanted = process.argv.slice(2);
const ids = manifest.scrapers.map(s => s.id).filter(id => !wanted.length || wanted.includes(id));

// providers swallow their errors and return [], so their console.error output is the only hint why nothing came back
const logged = [];
console.error = (...args) => { logged.push(args.map(String).join(' ').replace(/\s+/g, ' ').replace(/\?\S*/g, '')); };
const BLOCKED = /HTTP (401|403|429|451|503)|captcha|cloudflare|challenge|timeout|ECONNRESET|ENOTFOUND|ETIMEDOUT|fetch failed/i;
const withTimeout = (p, s) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), s * 1000))]);

async function check(id) {
    const entry = config[id];
    if (!entry) return { id, status: 'fail', note: 'no smoke candidates in scripts/smoke.json' };
    const { getStreams } = require(path.join(root, 'providers', `${id}.js`));
    const notes = [];
    let blocked = false;
    for (const c of entry.candidates) {
        const label = `${c.type} ${c.tmdbId}${c.season ? ` S${c.season}E${c.episode}` : ''}`;
        logged.length = 0;
        try {
            const streams = await withTimeout(getStreams(String(c.tmdbId), c.type, c.season || null, c.episode || null), entry.timeout || 90);
            if (streams && streams.length && /^https?:/.test(streams[0].url)) return { id, status: 'ok', note: `${streams.length} stream(s) for ${label}` };
        } catch (e) {
            logged.push(e.message);
        }
        const why = [...new Set(logged)].slice(0, 2).map(l => l.slice(0, 110)).join(' / ');
        if (BLOCKED.test(why)) blocked = true;
        notes.push(`${label}: ${why || 'no match'}`);
    }
    const status = blocked ? 'blocked' : entry.optional ? 'optional' : 'fail';
    return { id, status, note: notes.join('; ') };
}

(async () => {
    // fetches that outlive a timed-out provider must not crash the process
    process.on('unhandledRejection', () => {});
    const results = [];
    // one provider at a time: the log lines have to belong to one provider, and hosts like s.to dislike bursts
    for (const id of ids) results.push(await check(id));

    const icon = { ok: '✅', fail: '❌', blocked: '⚠️', optional: '⚪' };
    const names = Object.fromEntries(manifest.scrapers.map(s => [s.id, s.name]));
    let md = `# Provider smoke test\n\nRun: ${new Date().toISOString()}\n\n| Provider | Status | Details |\n|---|---|---|\n`;
    for (const r of results) md += `| ${names[r.id]} | ${icon[r.status]} | ${r.note.replace(/\|/g, '/')} |\n`;
    const count = s => results.filter(r => r.status === s).length;
    md += `\n✅ ${count('ok')} · ❌ ${count('fail')} · ⚠️ ${count('blocked')} (von dieser IP/Region blockiert oder zu langsam, nicht eindeutig) · ⚪ ${count('optional')} (Katalog wechselt, kein Treffer für den Testtitel)\n`;
    fs.writeFileSync(path.join(root, 'smoke-report.md'), md);
    fs.writeFileSync(path.join(root, 'smoke-failures.txt'), results.filter(r => r.status === 'fail').map(r => names[r.id]).join('\n'));
    process.stdout.write(md + '\n');
    process.exit(0);
})();
