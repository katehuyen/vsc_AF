#!/usr/bin/env node
// X-406 — how often each one-shot judge ran in the last N days, read off the
// transcripts it left (a judge is `claude -p`: one prompt, no tool call).
// Read-only. Clusters by prompt prefix; psikolog content is skipped.
//   node tools/kapici-bench/volume.js [days=30] [--out file.json] [--samples prefixRegex]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const days = Number(args.find(a => /^\d+$/.test(a)) || 30);
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? args[outAt + 1] : '';
const since = Date.now() - days * 86400e3;

function roots() {
    const r = [path.join(os.homedir(), '.claude', 'projects')];
    const acc = path.join(process.env.APPDATA || '', 'Code', 'User', 'globalStorage', 'muvusoft.agent-farm', 'accounts');
    try { for (const d of fs.readdirSync(acc)) { r.push(path.join(acc, d, 'projects')); } } catch { /* none */ }
    return r.filter(p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } });
}

function textOf(content) {
    if (typeof content === 'string') { return content; }
    if (!Array.isArray(content)) { return ''; }
    return content.filter(c => c && c.type === 'text').map(c => c.text).join('\n');
}

function readOne(file) {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); } catch { return null; }
    let prompts = 0, tools = 0, prompt = '', reply = '', ts = 0, cwd = '', model = '';
    for (const line of raw.split('\n')) {
        if (!line.trim()) { continue; }
        let j; try { j = JSON.parse(line); } catch { continue; }
        if (!ts && j.timestamp) { ts = Date.parse(j.timestamp) || 0; }
        if (!cwd && j.cwd) { cwd = j.cwd; }
        const m = j.message;
        if (!m) { continue; }
        if (j.type === 'user' && m.role === 'user') {
            const t = textOf(m.content);
            if (t && !(Array.isArray(m.content) && m.content.some(c => c && c.type === 'tool_result'))) {
                prompts++; if (!prompt) { prompt = t; }
            }
        } else if (j.type === 'assistant') {
            if (!model && m.model) { model = m.model; }
            if (Array.isArray(m.content)) {
                tools += m.content.filter(c => c && c.type === 'tool_use').length;
                const t = textOf(m.content); if (t) { reply = t; }
            }
        }
    }
    return { prompts, tools, prompt, reply, ts, cwd, model };
}

const clusters = new Map();
const seen = new Set();
let scanned = 0, judges = 0;
for (const root of roots()) {
    for (const proj of fs.readdirSync(root)) {
        const dir = path.join(root, proj);
        let files; try { files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')); } catch { continue; }
        for (const f of files) {
            const file = path.join(dir, f);
            // slot homes share one projects folder by symlink: a session is counted once
            if (seen.has(f)) { continue; }
            seen.add(f);
            let st; try { st = fs.statSync(file); } catch { continue; }
            if (st.mtimeMs < since || st.size > 400e3) { continue; }
            scanned++;
            const r = readOne(file);
            // --tools: judges that may read files (visual judge, retry supervisor) count too
            if (!r || r.prompts !== 1 || (r.tools !== 0 && !args.includes('--tools')) || !r.prompt) { continue; }
            if (r.ts && r.ts < since) { continue; }
            if (/psikolog/i.test(r.cwd) || /psikolog/i.test(proj)) { continue; }
            judges++;
            const flat = r.prompt.replace(/\s+/g, ' ').trim();
            const key = flat.slice(0, 64);
            const c = clusters.get(key) || { key, sample: flat.slice(0, 200), n: 0, first: Infinity, last: 0, models: {}, cwds: {}, files: [] };
            c.n++; c.first = Math.min(c.first, r.ts || st.mtimeMs); c.last = Math.max(c.last, r.ts || st.mtimeMs);
            c.models[r.model || '?'] = (c.models[r.model || '?'] || 0) + 1;
            c.cwds[r.cwd || '?'] = (c.cwds[r.cwd || '?'] || 0) + 1;
            if (c.files.length < 60) { c.files.push(file); }
            clusters.set(key, c);
        }
    }
}

const list = [...clusters.values()].sort((a, b) => b.n - a.n);
const summary = { days, scanned, judges, clusters: list.length, at: new Date().toISOString(), list };
if (out) { fs.writeFileSync(out, JSON.stringify(summary, null, 1), 'utf8'); }
console.log(`days=${days} scanned=${scanned} oneShotJudges=${judges} clusters=${list.length}`);
for (const c of list.slice(0, 40)) {
    console.log(String(c.n).padStart(5) + '  ' + new Date(c.last).toISOString().slice(0, 10) + '  '
        + Object.keys(c.models).join(',').slice(0, 30).padEnd(30) + '  ' + JSON.stringify(c.key));
}
