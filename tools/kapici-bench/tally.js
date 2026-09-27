#!/usr/bin/env node
// X-406 — the known judges' counts out of a volume.js --out file.
//   node tools/kapici-bench/tally.js <volume.json>
'use strict';
const j = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
const MARKERS = [
    ['dispatch classifier (M-57)', 'Sen bir iş dağıtıcısısın'],
    ['retry supervisor (M-58)', 'You are a SUPERVISOR'],
    ['quality judge — evals expectation', 'ÇIKTI şu BEKLENT'],
    ['quality judge — workflow step criterion', 'ÇIKTI şu ÖLÇÜT'],
    ['quality judge — quality.sample', 'Aşağıda bir kullanıcı isteği'],
    ['visual quality judge', 'Sen bir görsel kalite'],
    ['sentry leader', 'You are the LEADER'],
    ['workflow checkpoint supervisor', 'Checkpoint:'],
    ['weekly summary (text)', 'Sen yerel bir yapay zekâ ajan filosunun'],
    ['command bar planner (text)', 'Sen bir görev planlayıcısısın']
];
const day = (t) => (t ? new Date(t).toISOString().slice(0, 10) : '-');
console.log(`window ${j.days}d · scanned ${j.scanned} · single-prompt sessions ${j.judges}`);
for (const [name, key] of MARKERS) {
    let n = 0, first = 0, last = 0;
    for (const c of j.list) {
        if (!c.key.includes(key) && !(c.sample || '').includes(key)) { continue; }
        n += c.n; first = first ? Math.min(first, c.first) : c.first; last = Math.max(last, c.last);
    }
    console.log(String(n).padStart(4) + '  ' + day(first) + ' .. ' + day(last) + '  ' + name);
}
