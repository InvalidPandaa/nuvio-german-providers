#!/usr/bin/env node
const fs = require('fs');
const cp = require('child_process');
const run = (cmd) => cp.execSync(cmd, { encoding: 'utf8' }).trim();
const oldSha = JSON.parse(fs.readFileSync('.upstream.json', 'utf8')).commit;
const newSha = run('git rev-parse upstream/master');
if (oldSha === newSha) process.exit(0);
const range = oldSha + '..' + newSha;
const commits = run('git log --format=%h%x09%s ' + range).split('\n').filter(Boolean);
const files = run('git diff --name-status ' + range + ' -- "*.kt" "*.kts"').split('\n').filter(Boolean);
const localProviders = fs.readdirSync('src', { withFileTypes: true }).filter(e => e.isDirectory() && fs.existsSync('src/' + e.name + '/index.js')).map(e => e.name);
function providerMatches(path) {
  const lower = path.toLowerCase();
  return localProviders.filter(p => {
    const n = p.toLowerCase();
    return lower.includes('/' + n + '/') || lower.includes('/' + n + '.') || lower.endsWith('/' + n + '.kt') || lower.endsWith('/' + n + '.kts');
  });
}
const grouped = new Map();
for (const line of files) {
  const parts = line.split('\t');
  const status = parts[0];
  const paths = parts.slice(1);
  const path = paths[paths.length - 1];
  const matches = providerMatches(path);
  const key = matches.length ? matches.join(', ') : 'Unmapped / needs review';
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push({ status, path, previous: paths[0] !== path ? paths[0] : null });
}
let md = '# Upstream update: Bnyro/GermanProviders\n\n';
md += '> This file is generated automatically. The Nuvio JavaScript providers are NOT overwritten automatically.\n\n';
md += '## Commits\n\n';
for (const c of commits) md += '- ' + c + '\n';
md += '\n## Changed Kotlin files\n\n';
if (!files.length) md += '_No Kotlin source files changed; the upstream update may be documentation/configuration only._\n';
for (const [provider, entries] of grouped) {
  md += '### ' + provider + '\n\n';
  for (const e of entries) {
    md += '- ' + e.status + ' ' + e.path;
    if (e.previous) md += ' (from ' + e.previous + ')';
    md += '\n';
  }
  md += '\n';
}
md += '## Nuvio files to review\n\n';
for (const p of localProviders) {
  if ([...grouped.keys()].some(k => k.split(', ').includes(p))) md += '- src/' + p + '/index.js → likely review target\n';
}
md += '\n## Upstream comparison\n\n';
md += '- Previous: ' + oldSha + '\n- Current: ' + newSha + '\n';
md += '- Compare: https://github.com/Bnyro/GermanProviders/compare/' + oldSha + '...' + newSha + '\n';
md += '\n## Porting procedure\n\n1. Review the upstream Kotlin diff.\n2. Check the corresponding src/<provider>/index.js.\n3. Port only the functional changes that apply to Nuvio.\n4. Run npm ci && npm run build && node check.js.\n5. Test the affected provider in Nuvio before merging.\n';
fs.writeFileSync('UPSTREAM_UPDATE.md', md);
const state = JSON.parse(fs.readFileSync('.upstream.json', 'utf8'));
state.commit = newSha;
state.checkedAt = new Date().toISOString();
fs.writeFileSync('.upstream.json', JSON.stringify(state, null, 2) + '\n');
