/**
 * X-131 — WHAT THE SEARCH CORPUS COSTS ON DISK, and how far it is from a bound.
 *
 * The corpus (`src/core/textSearchCorpus.ts`) is a cache, so losing it is never
 * data loss — but it had no ceiling. Its only pruning rule dropped an entry
 * whose SOURCE TRANSCRIPT had been deleted, and transcripts are never deleted,
 * so the rule existed and never fired once. It therefore grew 1:1 with the
 * corpus of transcripts, for ever, on the same drive as everything else.
 *
 * This reads the manifest — the sizes are already recorded there (`r[role].c`),
 * so nothing is re-read and nothing is parsed — and answers four questions:
 *
 *   1. how big is it now, on disk and in the manifest's own figures;
 *   2. where the weight is (the tool trail, or the dialogue people search);
 *   3. what the age curve looks like, i.e. what a size budget would evict;
 *   4. what the first query pays to discover there is nothing to prune;
 *   5. what the trail horizon (`agentFarm.searchToolTrailDays`) has aged out
 *      and what it still would — dated by the same signature the corpus
 *      dates by, so this and the extension name the same sessions.
 *
 * Usage: node tools/measure_search_corpus.js [--root <globalStorage dir>] [--days 60]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
// The shipped reader, so the tool and the extension cannot date an entry
// differently — compiled, so `npm run compile` must have run.
const { signatureMtime } = require('../out/core/search.js');

const CORPUS_DIR = 'search-corpus-v1';

function defaultRoot() {
    const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appdata, 'Code', 'User', 'globalStorage', 'muvusoft.agent-farm');
}

function arg(name, fallback) {
    const i = process.argv.indexOf('--' + name);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
        ? process.argv[i + 1] : fallback;
}

const fmtMB = b => `${(b / 1048576).toFixed(1)} MB`;
const fmtMC = c => `${(c / 1e6).toFixed(1)} Mchars`;

function main() {
    const root = path.join(arg('root', defaultRoot()), CORPUS_DIR);
    const manFile = path.join(root, 'manifest.json');
    if (!fs.existsSync(manFile)) {
        console.error(`no corpus at ${root} — open the Search page once and it builds itself`);
        process.exitCode = 1;
        return;
    }
    const man = JSON.parse(fs.readFileSync(manFile, 'utf8'));
    const entries = Object.entries(man.entries || {});
    if (!entries.length) { console.error('the manifest is empty'); process.exitCode = 1; return; }

    // ---- 1. on disk, and what the manifest thinks it wrote ----
    const shardDir = path.join(root, 'sh');
    let files = 0, bytes = 0;
    for (const f of fs.readdirSync(shardDir)) {
        try { bytes += fs.statSync(path.join(shardDir, f)).size; files++; } catch { /* raced */ }
    }

    // ---- 2. the weight, by role ----
    const byRole = {};
    const rows = [];
    let chars = 0;
    for (const [key, e] of entries) {
        let c = 0, trail = 0;
        for (const [role, i] of Object.entries((e && e.r) || {})) {
            c += i.c || 0;
            byRole[role] = (byRole[role] || 0) + (i.c || 0);
            if (role === 'tool' || role === 'toolResult') { trail += i.c || 0; }
        }
        chars += c;
        rows.push({ key, chars: c, trail, aged: !!(e && e.aged), mtime: signatureMtime(e && e.sig) });
    }

    console.log(`corpus ${root}`);
    console.log(`  ${fmtMB(bytes)} in ${files} shard files · ${entries.length} manifest entries`);
    console.log(`  ${fmtMC(chars)} by the manifest's own figures · manifest itself ${fmtMB(fs.statSync(manFile).size)}\n`);

    console.log('where the weight is');
    for (const [r, c] of Object.entries(byRole).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${r.padEnd(12)} ${fmtMC(c).padStart(11)}   ${(c / chars * 100).toFixed(1)}%`);
    }
    const trail = (byRole.tool || 0) + (byRole.toolResult || 0);
    console.log(`  the tool trail is ${(trail / chars * 100).toFixed(1)}% of it; the dialogue people search by default is ${((chars - trail) / chars * 100).toFixed(1)}%\n`);

    // ---- 3. the age curve: what a budget evicts, oldest first ----
    rows.sort((a, b) => b.mtime - a.mtime);
    console.log('newest first — what a size budget would keep');
    let acc = 0;
    const marks = [];
    for (let i = 0; i < rows.length; i++) {
        acc += rows[i].chars;
        marks.push(acc);
    }
    for (const n of [50, 100, 200, 400, 800, rows.length]) {
        if (n > rows.length) { continue; }
        const at = rows[n - 1];
        console.log(`  newest ${String(n).padStart(5)} sessions   ${fmtMC(marks[n - 1]).padStart(11)}   back to ${at.mtime ? new Date(at.mtime).toISOString().slice(0, 10) : 'unknown'}`);
    }
    const sizes = rows.map(r => r.chars).sort((a, b) => b - a);
    console.log(`  per session: mean ${Math.round(chars / rows.length).toLocaleString()} · median ${sizes[Math.floor(sizes.length / 2)].toLocaleString()} · largest ${sizes[0].toLocaleString()} chars\n`);

    // ---- 4. what the pruning rule actually does ----
    const t0 = Date.now();
    let missing = 0;
    for (const [, e] of entries) {
        if (e && e.p && !fs.existsSync(e.p)) { missing++; }
    }
    const ms = Date.now() - t0;
    console.log('the gone-transcript rule (asynchronous with a yield since X-131 — this is what a synchronous pass would cost)');
    console.log(`  ${entries.length} existence checks in ${ms} ms synchronously — the cost the async pass keeps off the window`);
    console.log(`  ${missing} entr${missing === 1 ? 'y' : 'ies'} would be dropped by it\n`);

    console.log('projected at the same cost per session');
    const per = chars / rows.length;
    console.log('  sessions     corpus');
    for (const k of [1000, 3000, 10000]) {
        console.log(`  ${String(k).padStart(8)}  ${fmtMC(per * k).padStart(11)}`);
    }

    // ---- 5. the trail horizon (X-131): what it has aged out, what it still would ----
    const days = Number(arg('days', 60));
    const horizon = days > 0 ? Date.now() - days * 86400000 : 0;
    const agedRows = rows.filter(r => r.aged);
    const past = rows.filter(r => horizon && r.mtime > 0 && r.mtime < horizon);
    const pending = past.filter(r => r.trail > 0);
    const pendingChars = pending.reduce((a, r) => a + r.trail, 0);
    console.log(`\nthe trail horizon, at ${days} day${days === 1 ? '' : 's'} (agentFarm.searchToolTrailDays; --days to try another)`);
    if (!horizon) {
        console.log('  0 — every trail is kept for ever');
    } else {
        console.log(`  ${past.length} of ${rows.length} sessions are past it (last written before ${new Date(horizon).toISOString().slice(0, 10)})`);
        console.log(`  ${agedRows.length} already carry no trail (aged out, or built without one)`);
        console.log(`  ${pending.length} still hold ${fmtMC(pendingChars)} of trail the next window's first search will drop`);
        const young = rows.filter(r => !(r.mtime > 0 && r.mtime < horizon));
        const youngTrail = young.reduce((a, r) => a + r.trail, 0);
        console.log(`  what stays: ${fmtMC(chars - pendingChars)} — the dialogue of every session plus ${fmtMC(youngTrail)} of trail on the ${young.length} inside the horizon`);
    }
}

main();
