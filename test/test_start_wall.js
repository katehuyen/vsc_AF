// X-469 — ONE ANSWER TO "MAY A SESSION START ON THIS ACCOUNT NOW?" (src/core/startRoom.ts).
// The verdict and its wall, the factory default read from one place, and THE GATE: src/ is read and a
// door that states a wall of its own — a number, a wall constant, or no wall at all — fails the build
// unless test/startwall.manifest.json lists it (exempt with a why, or pending under its item; the
// pending budget only shrinks). Measured reason: 2026-10-02, chn_muqifjzc001n2b — five doors answered
// this one question with five lines (70, 90, 95, 95, none) and a relay leg opened at 89%.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const W = require(path.join(ROOT, 'out', 'core', 'startRoom.js'));
const P = require(path.join(ROOT, 'out', 'core', 'accountPolicy.js'));
const { callsOf, codeOnly } = require('./pinlex');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const NOW = Date.UTC(2026, 9, 2, 6, 30, 0);
const HOUR = 3600 * 1000;
const slot = (id, pct, o = {}) => Object.assign({ slotId: id, engine: 'claude', state: 'ok', percent: pct, resetsAt: NOW + 2 * HOUR, fetchedAt: NOW - 60000 }, o);

console.log('\n== the wall ==');
{
    const w = W.startWall({ setting: 70, handoverPct: 90 });
    ok('‼️ the user\'s Account ceiling is the wall (70 of 70 / 90)', w.value === 70 && /defaultAccountCeiling/.test(w.why));
    ok('…never above the quota handover line', W.startWall({ setting: 95, handoverPct: 90 }).value === 90 && /quota handover line/.test(W.startWall({ setting: 95, handoverPct: 90 }).why));
    ok('a wall the caller names for itself replaces the Account ceiling, and is named', W.startWall({ setting: 70, handoverPct: 90, own: 80, ownWhy: 'the campaign\'s wall' }).value === 80
        && /the campaign's wall/.test(W.startWall({ setting: 70, handoverPct: 90, own: 80, ownWhy: 'the campaign\'s wall' }).why));
    ok('‼️ …but never above the quota handover line either (95 → 90)', W.startWall({ setting: 70, handoverPct: 90, own: 95, ownWhy: 'the campaign\'s wall' }).value === 90);
    ok('an own wall that is no percentage is ignored', W.startWall({ setting: 70, handoverPct: 90, own: 0 }).value === 70 && W.startWall({ setting: 70, handoverPct: 90, own: 'x' }).value === 70);
    ok('the handover line off (0) leaves the wall alone', W.startWall({ setting: 85, handoverPct: 0 }).value === 85);
}

console.log('\n== the verdict ==');
{
    const w = W.startWall({ setting: 70, handoverPct: 90 });
    ok('‼️ 89% on a 70 wall: no start, and the sentence says the figure and the wall', !W.startRoom(slot('a', 89), w, NOW).ok && /89%.*70% wall/.test(W.startRoom(slot('a', 89), w, NOW).why));
    ok('69% starts', W.startRoom(slot('a', 69), w, NOW).ok && W.startRoom(slot('a', 69), w, NOW).pct === 69);
    ok('at the wall itself (70) it does not', !W.startRoom(slot('a', 70), w, NOW).ok);
    ok('a floor a failed read left counts (X-462)', !W.startRoom(slot('a', -1, { state: 'error', floor: { percent: 95, resetsAt: NOW + HOUR, readAt: NOW - HOUR } }), w, NOW).ok);
    ok('a window that has turned over is fresh', W.startRoom(slot('a', 95, { resetsAt: NOW - 1000 }), w, NOW).ok);
    ok('a rejected sign-in never starts', !W.startRoom(slot('a', 1, { state: 'expired' }), w, NOW).ok && /rejected/.test(W.startRoom(slot('a', 1, { state: 'expired' }), w, NOW).why));
    ok('no figure known: room by the doctrine, and said', W.startRoom(undefined, w, NOW).ok && W.startRoom(undefined, w, NOW).pct === -1 && /doctrine/.test(W.startRoom(undefined, w, NOW).why));
}

console.log('\n== the factory default lives in one place ==');
{
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).contributes.configuration;
    const props = Object.assign({}, ...(Array.isArray(pkg) ? pkg : [pkg]).map(c => c.properties || {}));
    const pol = fs.readFileSync(path.join(ROOT, 'src', 'core', 'accountPolicy.ts'), 'utf8');
    ok('‼️ POLICY_DEFAULT_CEILING is READ from the Account ceiling flex point, not written as a number',
        /export const POLICY_DEFAULT_CEILING: number = Number\(flexPoint\('accounts\.defaultCeiling'\)\?\.default\);/.test(pol));
    ok('…and equals the shipped default of the box', P.POLICY_DEFAULT_CEILING === props['agentFarm.defaultAccountCeiling'].default && Number.isFinite(P.POLICY_DEFAULT_CEILING));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8').replace(/\r\n/g, '\n');
    ok('the host\'s accountCeiling() answers startWall, and the handover line\'s default is the context guard\'s',
        /return startWall\(\{ setting: set, handoverPct: handoverLine\(\)/.test(ext) && /return cfg\(\)\.get<number>\('quotaHandoverPct', DEFAULT_CONTEXT_THRESHOLDS\.quotaHandoverPct\);/.test(ext)
        && !/'quotaHandoverPct', \d/.test(codeOnly(ext, true)));
}

console.log('\n== X-471: the doors that walked 95 ask the one wall ==');
{
    const rule = (ceiling, step) => ({ name: 'night', chain: [Object.assign({ account: 'a' }, step || {})], ...(ceiling ? { ceiling } : {}) });
    const world = (o) => Object.assign({ engine: 'claude', usage: [slot('a', 92), slot('b', 10)], ceiling: 70, handoverPct: 90, stored: ['a', 'b'], now: NOW }, o);
    const r95 = P.resolvePolicy('@night', world({ policies: [rule(95)] }));
    ok('‼️ a rule\'s own wall above the quota handover line acts AT that line (a at 92 under 95 → 90 is passed over)', r95.id !== 'a');
    ok('…and with the handover line off the rule\'s own 95 stands (a at 92 starts)', P.resolvePolicy('@night', world({ policies: [rule(95)], handoverPct: 0 })).id === 'a');
    ok('…a step\'s own wall likewise', P.resolvePolicy('@night', world({ policies: [rule(0, { ceiling: 95 })] })).id !== 'a');
    const pool = (c) => world({ usage: [slot('a', 92)], pool: { accounts: ['a'], ceiling: c } });
    ok('…and the campaign pool\'s wall (@pool) likewise', !!P.resolvePolicy('@pool', pool(95)).refusal && P.resolvePolicy('@pool', Object.assign(pool(95), { handoverPct: 0 })).id === 'a');

    const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').replace(/\r\n/g, '\n');
    const ext = src('extension.ts');
    ok('‼️ the sentry keeps no wall of its own anywhere in src (SENTRY_DEFAULT_CEILING is gone)',
        !/SENTRY_DEFAULT_CEILING/.test(codeOnly(ext, true) + codeOnly(src('core/sentryRun.ts'), true) + codeOnly(src('core/sentryDriver.ts'), true) + codeOnly(src('core/tasks.ts'), true)));
    ok('the campaign\'s wall is the host\'s accountCeiling given the campaign\'s own ceiling',
        /function campaignWall\(rec: \{ ceiling\?: unknown \}\): StartWall \{\n\s*return accountCeiling\(\{ value: rec\.ceiling, why: 'the campaign\\'s wall' \}\);/.test(ext));
    ok('…and the tick reads it once, for the facts, the leader\'s seat and the round',
        /const wall = campaignWall\(rec\);/.test(ext) && /slotIsUsable\(u, wall\.value\)\)\.length/.test(ext)
        && /const ceiling = wall\.value;\n\s*const shape = \{/.test(ext) && /running: taskManager\.sentryBusy\(\),\n\s*wall,\n\s*now: Date\.now\(\)/.test(ext));
    ok('the carry, accounts.best, the policies and the Accounts card ask the same wall',
        /accountWall: own => accountCeiling\(own\),/.test(ext)
        && /const wall = accountCeiling\(own \? \{ value: own, why: 'the caller\\'s ceiling' \} : undefined\);/.test(ext)
        && /ceiling: accountCeiling\(\)\.value,\n\s*handoverPct: handoverLine\(\),/.test(ext)
        && /accountOrder\(pool, \{\n\s*ceiling: accountCeiling\(\)\.value, engine: slot\.engine/.test(ext));
    ok('the surfaces say the wall in force (sentry payload, sentry.status, the empty box\'s default)',
        (ext.match(/wall: campaignWall\(rec\),/g) || []).length === 2 && /ceilingWhy: accountCeiling\(\)\.why,/.test(ext));
}

const TWO = ['slotIsUsable', 'mostRoom', 'roomOrder', 'nextResetAt'];
const OPTS = { accountOrder: 1, pickAccount: 1, carryOnAccount: 0 };
const ALLOWED_CONST = new Set(['POLICY_DEFAULT_CEILING']);
// X-471 — a record's own optional field handed straight in: absent, it falls to the primitive's default 100 (the sentry's facts did)
const RAW_CEILING = /^\w+\??\.ceiling$/;
const RAW_KIND = 'a record\'s optional ceiling passed raw (absent = no wall)';

/** Every place in one source file that states a wall of its own. */
function offendersOf(file, src) {
    const out = [];
    for (const c of callsOf(src, [...TWO, ...Object.keys(OPTS)])) {
        let kind = '';
        if (TWO.includes(c.name)) {
            const a = c.args[1];
            kind = a === undefined ? 'states no wall' : /^\d/.test(a) ? 'a wall written as a number' : /\b\w*(DEFAULT|WALL)_CEILING\b/.test(a) && !ALLOWED_CONST.has(a) ? 'a wall constant'
                : RAW_CEILING.test(a) ? RAW_KIND : '';
        } else {
            const o = c.args[OPTS[c.name]] || '';
            kind = !/\bceiling\b/.test(o) ? 'states no wall' : /\bceiling\s*:\s*\d/.test(o) ? 'a wall written as a number'
                : /\bceiling\s*:\s*(\w*(DEFAULT|WALL)_CEILING)\b/.test(o) && !ALLOWED_CONST.has(/\bceiling\s*:\s*(\w+)/.exec(o)[1]) ? 'a wall constant'
                    : /\bceiling\s*:\s*\w+\??\.ceiling\s*[,}]/.test(o) ? RAW_KIND : '';
        }
        if (kind) { out.push({ file, kind, line: c.line, text: c.text }); }
    }
    codeOnly(src, true).split('\n').forEach((l, i) => {
        const consts = (l.match(/\b\w*(DEFAULT|WALL)_CEILING\b/g) || []).filter(n => !ALLOWED_CONST.has(n));
        if (consts.length) { out.push({ file, kind: 'a wall constant', line: i + 1, text: l.trim() }); }
        if (/\bceiling\s*[:=]\s*\d|['"]ceiling['"]\s*,\s*\d/.test(l)) { out.push({ file, kind: 'a wall written as a number', line: i + 1, text: l.trim() }); }
    });
    return out;
}

/** What is wrong, given every offender and the manifest. */
function judge(offenders, manifest) {
    const problems = [];
    const entries = [...(manifest.exempt || []).map(e => ({ ...e, as: 'exempt' })), ...(manifest.pending || []).map(e => ({ ...e, as: 'pending' }))];
    const used = new Set();
    for (const o of offenders) {
        const hit = entries.find(e => e.file === o.file && o.text.includes(e.match));
        if (hit) { used.add(hit); continue; }
        problems.push(`${o.file}:${o.line} — ${o.kind}: ${o.text.slice(0, 140)} — a start asks startWall (src/core/startRoom.ts); a line of a door's own is how one fix kept leaving the next door open`);
    }
    for (const e of entries) {
        if (!used.has(e)) { problems.push(`${e.file} — the ${e.as} entry "${e.match}" matches nothing: remove it${e.as === 'pending' ? ` and lower pendingBudget (${e.item} fixed it)` : ''}`); }
        if (!String(e.why || '').trim()) { problems.push(`${e.file} — the ${e.as} entry "${e.match}" gives no why`); }
        if (e.as === 'pending' && !/^[A-Z]{1,2}-\d+$/.test(String(e.item || ''))) { problems.push(`${e.file} — the pending entry "${e.match}" names no backlog item`); }
    }
    const budget = Number(manifest.pendingBudget);
    if ((manifest.pending || []).length > budget) { problems.push(`pending ${(manifest.pending || []).length} > pendingBudget ${budget}: the list of doors on their own line only shrinks`); }
    return problems;
}

console.log('\n== the gate: every start asks the one wall ==');
{
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'startwall.manifest.json'), 'utf8'));
    const files = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); } else if (/\.ts$/.test(e.name)) { files.push(p); }
        }
    })(path.join(ROOT, 'src'));
    const offenders = files.flatMap(f => offendersOf(path.relative(ROOT, f).replace(/\\/g, '/'), fs.readFileSync(f, 'utf8')));
    const problems = judge(offenders, manifest);
    for (const p of problems) { console.log('    ' + p); }
    console.log(`    ${files.length} files read · ${offenders.length} known places · ${(manifest.pending || []).length} pending`);
    ok('‼️ no door states a wall of its own outside the manifest', problems.length === 0 && files.length > 100);
    ok('the budget is the pending list itself — it shrinks as the doors are moved', Number(manifest.pendingBudget) === (manifest.pending || []).length);
}

console.log('\n== the gate bites (fixtures) ==');
{
    const empty = { exempt: [], pending: [], pendingBudget: 0 };
    const at = src => offendersOf('src/core/fixture.ts', src);
    ok('a new door with a number is caught', judge(at('const s = slotIsUsable(u, 90, now);'), empty).length === 1);
    ok('…with a constant', judge(at('const s = roomOrder(list, SENTRY_DEFAULT_CEILING, now);'), empty).length >= 1);
    ok('…stating no wall at all', judge(at('const best = mostRoom(usage);'), empty).length === 1 && /states no wall/.test(judge(at('const best = mostRoom(usage);'), empty)[0]));
    ok('…an options call without a ceiling', judge(at('const o = accountOrder(pool, { engine: e });'), empty).length === 1);
    ok('…with a literal ceiling option', judge(at('const o = pickAccount(pool, { ceiling: 95, engine });'), empty).length >= 1);
    ok('…an op default written as a number', judge(at("const c = optNum(args, 'ceiling', 95);"), empty).length === 1);
    ok('‼️ …a record\'s optional ceiling handed in raw, which falls to 100 when unset (X-471)',
        judge(at('const n = usage.filter(u => slotIsUsable(u, rec.ceiling)).length;'), empty).length === 1
        && judge(at('const o = accountOrder(list, { ceiling: pool.ceiling, now });'), empty).length === 1);
    ok('a wall from startWall passes', judge(at('const s = slotIsUsable(u, wall.value, now); const o = accountOrder(p, { ceiling: wall.value });'), empty).length === 0);
    ok('the Account ceiling\'s own default constant passes', judge(at('const c = n > 0 ? n : POLICY_DEFAULT_CEILING;'), empty).length === 0);
    ok('a comment or a string that names one is not a door', judge(at('// slotIsUsable(u, 90)\nconst s = "roomOrder(list, 95)";'), empty).length === 0);
    ok('a method declaration is not a call', judge(at('class H { pickAccount(engine: string, stated?: string) { return 1; } }'), empty).length === 0);
    const listed = { exempt: [], pending: [{ file: 'src/core/fixture.ts', match: 'slotIsUsable(u, 90', item: 'X-471', why: 'w' }], pendingBudget: 1 };
    ok('a listed pending door passes', judge(at('const s = slotIsUsable(u, 90, now);'), listed).length === 0);
    ok('‼️ a pending entry whose door was fixed fails as stale (the list shrinks)', judge(at('const s = slotIsUsable(u, wall.value, now);'), listed).some(p => /matches nothing/.test(p)));
    ok('‼️ a pending list longer than its budget fails', judge(at('const s = slotIsUsable(u, 90, now);'), { ...listed, pendingBudget: 0 }).some(p => /only shrinks/.test(p)));
    ok('an entry with no why, or a pending one with no item, fails', judge(at('const s = slotIsUsable(u, 90, now);'), { exempt: [], pending: [{ file: 'src/core/fixture.ts', match: 'slotIsUsable', item: '', why: '' }], pendingBudget: 1 }).length === 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
