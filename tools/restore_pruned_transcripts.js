// Restore every file Claude Code's 30-day prune removed from the transcript pool,
// straight out of the agent repo's git history. Idempotent: a path already in the
// pool is skipped. mtime is set to the transcript's last message so tables sort it
// where it belongs and a future prune (now 36500d) measures the true age.
const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const REPO = 'D:/zone/agent';
const POOL_PREFIX = '_run_folder_move/claude/projects/';
const SLOT_RE = /^_run_folder_move\/vscode\/muvusoft\.agent-farm\/accounts\/[^/]+\/projects\//;
const dry = process.argv.includes('--dry');
process.chdir(REPO);

const log = execFileSync('git',
    ['log', '--diff-filter=D', '--name-only', '--format=%h|%ad', '--date=iso', '--',
        '_run_folder_move/claude/projects/', '_run_folder_move/vscode/muvusoft.agent-farm/accounts/*/projects/'],
    { encoding: 'utf8', maxBuffer: 1 << 28 }
).split(/\r?\n/);

let commit = '', cdate = '';
const wanted = new Map(); // poolPath -> { commit, cdate, orig }
for (const l of log) {
    if (/^[0-9a-f]{7,}\|/.test(l)) { [commit, cdate] = l.split('|'); continue; }
    if (!l) { continue; }
    let pool = l;
    if (SLOT_RE.test(l)) { pool = l.replace(SLOT_RE, POOL_PREFIX); }
    if (!pool.startsWith(POOL_PREFIX)) { continue; }
    if (!wanted.has(pool)) { wanted.set(pool, { commit, cdate, orig: l }); }
}

let restored = 0, skipped = 0, failed = 0, bytes = 0;
const kinds = {};
for (const [pool, w] of wanted) {
    if (fs.existsSync(pool)) { skipped++; continue; }
    let buf;
    try {
        buf = execFileSync('git', ['cat-file', 'blob', `${w.commit}~1:${w.orig}`], { maxBuffer: 1 << 29 });
    } catch (e) {
        failed++; console.log('FAIL', pool, String(e.message).split('\n')[0].slice(0, 120)); continue;
    }
    const ext = path.extname(pool) || '(none)';
    kinds[ext] = (kinds[ext] || 0) + 1;
    bytes += buf.length;
    if (dry) { restored++; continue; }
    fs.mkdirSync(path.dirname(pool), { recursive: true });
    fs.writeFileSync(pool, buf);
    let when = new Date(w.cdate);
    if (ext === '.jsonl') {
        const txt = buf.toString('utf8');
        const m = [...txt.matchAll(/"timestamp":"([^"]+)"/g)].pop();
        if (m) { const d = new Date(m[1]); if (!isNaN(d)) { when = d; } }
    }
    try { fs.utimesSync(pool, when, when); } catch { /* keep now */ }
    restored++;
}
console.log(JSON.stringify({ dry, candidates: wanted.size, restored, skipped, failed, mb: +(bytes / 1048576).toFixed(1), kinds }, null, 1));
