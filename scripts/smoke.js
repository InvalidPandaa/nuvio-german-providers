#!/usr/bin/env node
// node scripts/smoke.js [provider...]   runs the BUNDLED providers against known titles (needs TMDB_API_KEY and network)
// Writes smoke-report.md and prints it. Exit code 0 even when providers are down: the workflow reads smoke-failures.txt.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
globalThis.TMDB_API_KEY = process.env.TMDB_API_KEY;
if (!globalThis.TMDB_API_KEY) { console.error('TMDB_API_KEY is not set'); process.exit(2); }

const TIMEOUT_MS = 90000;
const candidates = JSON.parse(fs.readFileSync(path.join(__dirname, 'smoke.json'), 'utf8'));
delete candidates._comment;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const wanted = process.argv.slice(2);
const ids = manifest.scrapers.map(s => s.id).filter(id => !wanted.length || wanted.includes(id));
const tmdbBroken = [];

const withTimeout = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS))]);

async function check(id) {
    const list = candidates[id];
    if (!list) return { id, ok: false, note: 'no smoke candidates in scripts/smoke.json' };
    const { getStreams } = require(path.join(root, 'providers', `${id}.js`));
    const errors = [];
    for (const c of list) {
        const label = `${c.type} ${c.tmdbId}${c.season ? ` S${c.season}E${c.episode}` : ''}`;
        try {
            const streams = await withTimeout(getStreams(String(c.tmdbId), c.type, c.season || null, c.episode || null));
            if (streams && streams.length && /^https?:/.test(streams[0].url)) return { id, ok: true, note: `${streams.length} stream(s) for ${label}` };
            errors.push(`${label}: no streams`);
        } catch (e) {
            errors.push(`${label}: ${e.message}`);
        }
    }
    return { id, ok: false, note: errors.join('; ') };
}

(async () => {
    // fetches that outlive a timed-out provider must not crash the process
    process.on('unhandledRejection', () => {});
    const results = [];
    // sequential per provider keeps hosts (e.g. s.to captchas) from seeing bursts; providers themselves run in small batches
    const queue = ids.slice();
    await Promise.all(Array.from({ length: 4 }, async () => {
        while (queue.length) results.push(await check(queue.shift()));
    }));
    results.sort((a, b) => a.id.localeCompare(b.id));

    const failed = results.filter(r => !r.ok);
    const names = Object.fromEntries(manifest.scrapers.map(s => [s.id, s.name]));
    let md = `# Provider smoke test\n\nRun: ${new Date().toISOString()}\n\n| Provider | Status | Details |\n|---|---|---|\n`;
    for (const r of results) md += `| ${names[r.id]} | ${r.ok ? '✅' : '❌'} | ${r.note.replace(/\|/g, '/')} |\n`;
    md += `\n${results.length - failed.length}/${results.length} providers returned streams.\n`;
    fs.writeFileSync(path.join(root, 'smoke-report.md'), md);
    fs.writeFileSync(path.join(root, 'smoke-failures.txt'), failed.map(r => names[r.id]).join('\n'));
    console.log(md);
    process.exit(0);
})();
