#!/usr/bin/env node
// X-408 — bench.js rows → a markdown table and the go / no-go per consumer.
// Go = Jev's accuracy at most 3 points below Haiku's AND Jev's p50 latency at least 5x better.
'use strict';
const fs = require('fs');
const rows = process.argv.slice(2).flatMap(f => JSON.parse(fs.readFileSync(f, 'utf8')));

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '—');
const q = (xs, p) => { if (!xs.length) { return null; } const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const BUCKETS = [[0.9, 1.01, '0.9+'], [0.75, 0.9, '.75-.9'], [0.6, 0.75, '.6-.75'], [0, 0.6, '<.6']];

function stats(rs) {
    const n = rs.length;
    const answered = rs.filter(r => r.got !== null);
    const ok = rs.filter(r => r.ok).length;
    const covered = answered.filter(r => r.confidence !== null && r.confidence >= r.minConfidence);
    const lat = rs.map(r => r.latencyMs ?? r.wall).filter(x => typeof x === 'number');
    const cost = rs.reduce((s, r) => s + (r.costUsd || 0), 0);
    const cal = BUCKETS.map(([lo, hi, name]) => { const b = answered.filter(r => r.confidence >= lo && r.confidence < hi); return `${name}:${b.filter(r => r.ok).length}/${b.length}`; }).join(' ');
    return { n, acc: n ? 100 * ok / n : 0, ok, errors: n - answered.length, cov: pct(covered.length, n), accCov: pct(covered.filter(r => r.ok).length, covered.length), p50: q(lat, 0.5), p95: q(lat, 0.95), cost, cal };
}

const keys = [...new Set(rows.map(r => r.rule + '|' + r.layout))];
const lines = ['| Rule | Lang | Arm | n | Accuracy | Errors | Covered ≥ minConf | Acc. when covered | p50 ms | p95 ms | Cost $ | Calibration (right/answered per confidence bucket) |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
const verdicts = [];
for (const k of keys) {
    const [rule, layout] = k.split('|');
    const by = {};
    for (const arm of ['jev', 'haiku']) {
        const rs = rows.filter(r => r.rule === rule && r.layout === layout && r.arm === arm);
        if (!rs.length) { continue; }
        const s = by[arm] = stats(rs);
        lines.push(`| ${rule} | ${layout} | ${arm} | ${s.n} | ${s.acc.toFixed(1)}% | ${s.errors} | ${s.cov}% | ${s.accCov}% | ${s.p50} | ${s.p95} | ${s.cost.toFixed(5)} | ${s.cal} |`);
    }
    if (by.jev && by.haiku) {
        // The verdict compares the two arms on the same cases only — a strided Haiku run covers a subset.
        const pick = arm => rows.filter(r => r.rule === rule && r.layout === layout && r.arm === arm);
        const both = new Set(pick('haiku').map(r => r.i).filter(i => pick('jev').some(r => r.i === i)));
        const j = stats(pick('jev').filter(r => both.has(r.i)));
        const h = stats(pick('haiku').filter(r => both.has(r.i)));
        const accOk = j.acc >= h.acc - 3;
        const latOk = j.p50 * 5 <= h.p50;
        verdicts.push(`- **${rule} (${layout})**, ${both.size} paired cases: ${accOk && latOk ? 'GO' : 'NO-GO'} — accuracy Jev ${j.acc.toFixed(1)}% vs Haiku ${h.acc.toFixed(1)}% (${accOk ? 'within' : 'outside'} 3 points), p50 ${j.p50} ms vs ${h.p50} ms (${(h.p50 / j.p50).toFixed(1)}x; needs 5x).`);
    }
}
const tot = arm => rows.filter(r => r.arm === arm).reduce((s, r) => s + (r.costUsd || 0), 0);
console.log(lines.join('\n'));
console.log('\n' + verdicts.join('\n'));
console.log(`\nTotal cost: Jev $${tot('jev').toFixed(5)} (${rows.filter(r => r.arm === 'jev').length} calls), Haiku $${tot('haiku').toFixed(4)} (${rows.filter(r => r.arm === 'haiku').length} calls).`);
