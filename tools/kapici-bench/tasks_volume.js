#!/usr/bin/env node
// X-406 — the task-store half of the volume count (read-only): supervised
// retry incidents (M-13) and trigger-fired tasks, last N days, with what each
// trigger firing produced. Reads farm-tasks.json + task-history/.
//   node tools/kapici-bench/tasks_volume.js [days=30]
'use strict';
const fs = require('fs');
const path = require('path');

const days = Number(process.argv[2] || 30);
const since = Date.now() - days * 86400e3;
const store = path.join(process.env.APPDATA || '', 'Code', 'User', 'globalStorage', 'muvusoft.agent-farm');

function rows() {
    const out = [];
    const take = (j) => {
        const list = Array.isArray(j) ? j : (j && (j.tasks || j.rows || j.items)) || [];
        for (const t of list) { if (t && typeof t === 'object') { out.push(t); } }
    };
    try { take(JSON.parse(fs.readFileSync(path.join(store, 'farm-tasks.json'), 'utf8'))); } catch (e) { console.error('farm-tasks:', e.message); }
    const hist = path.join(store, 'task-history');
    try {
        for (const f of fs.readdirSync(hist)) {
            const p = path.join(hist, f);
            try {
                const raw = fs.readFileSync(p, 'utf8');
                if (f.endsWith('.jsonl')) { for (const l of raw.split('\n')) { if (l.trim()) { try { out.push(JSON.parse(l)); } catch { /* skip */ } } } }
                else if (f.endsWith('.json')) { take(JSON.parse(raw)); }
            } catch { /* skip */ }
        }
    } catch { /* no history */ }
    const byId = new Map();
    for (const t of out) { if (t.id) { byId.set(t.id, t); } }
    return [...byId.values()];
}

const all = rows();
const when = (t) => t.createdAt || t.startedAt || t.endedAt || 0;
const recent = all.filter(t => when(t) >= since);
const sup = recent.filter(t => t.supervision);
const supStates = {};
for (const t of sup) { const s = t.supervision.state + (t.supervision.decision ? ':' + t.supervision.decision.action : ''); supStates[s] = (supStates[s] || 0) + 1; }
const trig = recent.filter(t => t.fromTrigger);
const byTrig = {};
for (const t of trig) {
    const k = t.fromTrigger;
    const b = byTrig[k] || (byTrig[k] = { n: 0, status: {}, title: String(t.title || '').slice(0, 60) });
    b.n++; b.status[t.status || '?'] = (b.status[t.status || '?'] || 0) + 1;
}
const fields = {};
for (const t of all.slice(0, 400)) { for (const k of Object.keys(t)) { fields[k] = (fields[k] || 0) + 1; } }
console.log(JSON.stringify({
    days, rowsAll: all.length, rowsRecent: recent.length,
    supervisedIncidents: sup.length, supStates,
    triggerFired: trig.length, byTrigger: byTrig,
    retryBehaviours: recent.reduce((m, t) => { const r = t.retry && (t.retry.behavior || t.retry.mode); if (r) { m[r] = (m[r] || 0) + 1; } return m; }, {}),
    fieldNames: Object.keys(fields).sort().join(',')
}, null, 1));
