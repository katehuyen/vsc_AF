/**
 * X-129 — WHAT THE SESSION INDEX COSTS THE EXTENSION HOST, MEASURED.
 *
 * `SessionIndex` (core/sessions.ts) holds the WHOLE `SessionInfo` of every
 * session it has ever seen in a `Map`, for the life of the window, and five of
 * those fields are unbounded in the length of the conversation: `events`,
 * `turns`, `recentMsgs`, `daily` and `heat`. That memory sits in the ONE
 * extension host every extension in the window shares, on a machine that is
 * not new — so the failure it walks towards is GC pauses, which look exactly
 * like the freeze X-126 fixed and have a different cause.
 *
 * ‼️ THIS MEASURES RETAINED HEAP, NOT CHARACTERS. A JSON file's size is the
 * cost of the TEXT; what an object costs once parsed is a different number and
 * is the one that matters here (strings are interned, small arrays carry
 * per-object overhead, a `Record` is a hidden class). So: build the real
 * structure, collect, and read `heapUsed` on either side of it. The tool
 * re-execs itself with `--expose-gc` when it has to, because a measurement
 * taken without a forced collection is reading whatever the collector had not
 * got to yet.
 *
 * Usage:
 *   node tools/measure_session_heap.js                 # the live index
 *   node tools/measure_session_heap.js --index <path>
 *   node tools/measure_session_heap.js --at 1000,3000,10000
 *
 * What it answers: bytes per session as the index holds one TODAY, bytes per
 * session if only the summary fields stayed resident, and both curves at the
 * session counts the item argues about. Re-run it after the change and the two
 * runs are comparable, which is the whole point of writing it down.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { spawnSync } = require('child_process');

/** The five fields that grow with the CONVERSATION rather than with the fleet. */
const HEAVY = ['events', 'turns', 'recentMsgs', 'daily', 'heat'];

function defaultIndex() {
    const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appdata, 'Code', 'User', 'globalStorage', 'muvusoft.agent-farm', 'session-index.jsonl');
}

function arg(name, fallback) {
    const i = process.argv.indexOf('--' + name);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
        ? process.argv[i + 1] : fallback;
}

/** Collect twice — the second pass sweeps what the first one made reachable-no-more. */
function settle() {
    global.gc();
    global.gc();
}

/**
 * Retained bytes of whatever `build` returns, with its own garbage collected.
 * The caller keeps the returned `held` alive for as long as it wants the
 * number to stay true.
 */
function retained(build) {
    settle();
    const before = process.memoryUsage().heapUsed;
    const held = build();
    settle();
    const after = process.memoryUsage().heapUsed;
    return { bytes: after - before, held };
}

const fmtMB = b => (b / 1048576).toFixed(1) + ' MB';
const fmtB = b => (b / 1024).toFixed(1) + ' KB';

async function readLines(file) {
    const lines = [];
    const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
    for await (const line of rl) { if (line.trim()) { lines.push(line); } }
    return lines;
}

async function main() {
    const file = arg('index', defaultIndex());
    if (!fs.existsSync(file)) {
        console.error(`no index at ${file} — pass --index <path>`);
        process.exitCode = 1;
        return;
    }
    const at = String(arg('at', '1000,3000,10000')).split(',').map(Number).filter(n => n > 0);

    const stat = fs.statSync(file);
    const lines = await readLines(file);
    // The header line is the format/signature, not a session.
    const rows = lines.slice(1);
    console.log(`index ${file}`);
    console.log(`  ${fmtMB(stat.size)} on disk · ${rows.length} stored sessions\n`);

    // ---- what the index holds TODAY: the whole SessionInfo, per session ----
    const whole = retained(() => {
        const m = new Map();
        for (const line of rows) {
            let e;
            try { e = JSON.parse(line); } catch { continue; }
            if (e && e.info && e.info.sessionId) { m.set(e.info.sessionId, e.info); }
        }
        return m;
    });
    const n = whole.held.size;
    if (!n) { console.error('no parsable sessions in that index'); process.exitCode = 1; return; }

    // ---- what it would hold if the heavy five were loaded on demand ----
    const summary = retained(() => {
        const m = new Map();
        for (const line of rows) {
            let e;
            try { e = JSON.parse(line); } catch { continue; }
            const info = e && e.info;
            if (!info || !info.sessionId) { continue; }
            const lean = {};
            for (const k of Object.keys(info)) { if (HEAVY.indexOf(k) < 0) { lean[k] = info[k]; } }
            m.set(info.sessionId, lean);
        }
        return m;
    });

    // ---- and the heavy five on their own, so the saving has a name ----
    const heavy = retained(() => {
        const m = new Map();
        for (const line of rows) {
            let e;
            try { e = JSON.parse(line); } catch { continue; }
            const info = e && e.info;
            if (!info || !info.sessionId) { continue; }
            const part = {};
            for (const k of HEAVY) { if (info[k] !== undefined) { part[k] = info[k]; } }
            m.set(info.sessionId, part);
        }
        return m;
    });

    // ---- and each of them on its own, because they are not one problem.
    // `events`, `turns` and `recentMsgs` grow with the CONVERSATION and have no
    // ceiling; `heat` is a fixed-length array and `daily` grows with the days a
    // session spans, so those two are bounded and may be worth keeping resident.
    const each = {};
    for (const field of HEAVY) {
        each[field] = retained(() => {
            const m = new Map();
            for (const line of rows) {
                let e;
                try { e = JSON.parse(line); } catch { continue; }
                const info = e && e.info;
                if (!info || !info.sessionId || info[field] === undefined) { continue; }
                m.set(info.sessionId, info[field]);
            }
            return m;
        });
    }

    const perWhole = whole.bytes / n;
    const perLean = summary.bytes / n;
    const perHeavy = heavy.bytes / n;

    console.log(`retained heap over ${n} sessions`);
    console.log(`  whole SessionInfo (today)   ${fmtMB(whole.bytes).padStart(9)}   ${fmtB(perWhole)} / session`);
    console.log(`  summary only (X-129 target) ${fmtMB(summary.bytes).padStart(9)}   ${fmtB(perLean)} / session`);
    console.log(`  the heavy five alone        ${fmtMB(heavy.bytes).padStart(9)}   ${fmtB(perHeavy)} / session`);
    console.log(`  saving ${(100 - perLean / perWhole * 100).toFixed(1)}% of the resident index\n`);

    console.log('the heavy five, one at a time');
    for (const field of HEAVY) {
        const per = each[field].bytes / n;
        console.log(`  ${field.padEnd(12)} ${fmtMB(each[field].bytes).padStart(9)}   ${fmtB(per).padStart(9)} / session   ${(per / perWhole * 100).toFixed(1)}%`);
    }
    console.log('');

    console.log('projected, at the same per-session cost');
    console.log('  sessions      today      after   saved');
    for (const k of at) {
        console.log(`  ${String(k).padStart(8)}  ${fmtMB(perWhole * k).padStart(9)}  ${fmtMB(perLean * k).padStart(9)}  ${fmtMB((perWhole - perLean) * k).padStart(9)}`);
    }

    // Keep both alive to the end, or the numbers above describe a heap that
    // had already been collected while it was being printed.
    if (!whole.held.size || !summary.held.size || !heavy.held.size
        || Object.keys(each).some(k => !each[k].held.size)) { console.log(''); }
}

if (typeof global.gc !== 'function') {
    // ‼️ Re-exec rather than warn. A run without --expose-gc silently reports
    // whatever the collector had not reached, and it reads like a measurement.
    const r = spawnSync(process.execPath, ['--expose-gc', __filename, ...process.argv.slice(2)],
        { stdio: 'inherit' });
    process.exit(r.status === null ? 1 : r.status);
} else {
    main().catch(e => { console.error(e); process.exitCode = 1; });
}
