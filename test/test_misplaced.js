// X-474 — A MISPLACED RUN IS SAID. A relay leg's / sentry round's FIRST guard
// quota reading at or past the handover line marks the placement that put it
// there (the hop's `misplaced`, the round's 'misplaced' event) and one Notice
// goes out per placement. No time window: the definition is the first reading.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const M = require(path.join(ROOT, 'out', 'core', 'misplaced.js'));
const G = require(path.join(ROOT, 'out', 'core', 'contextGuard.js'));
const V = require(path.join(ROOT, 'out', 'core', 'batonView.js'));
const B = require(path.join(ROOT, 'out', 'core', 'batonBridge.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const wall = { value: 70, why: '70% — defaultAccountCeiling' };
const hop = (id, h, from, to, extra) => Object.assign({
    id, chainId: 'chn_x', hop: h, prompt: 'go on', state: 'started', why: 'w', createdAt: 1000 + h, updatedAt: 1000 + h,
    from: { sessionId: from, agentId: 'd:/agents/developer', engine: 'claude', cwd: 'D:\\repo' },
    inherit: { surface: 'console' }, want: { surface: 'inherit', account: '@emptiest' }, toSessionId: to
}, extra || {});

console.log('\n== the verdict ==');
{
    const m = M.misplacedVerdict({ pct: 92, ts: 5, account: 'murvietnam', line: 90 }, wall);
    ok('a first reading at or past the handover line is misplaced, with slot, figure, wall, line and time',
        m && m.slot === 'murvietnam' && m.pct === 92 && m.wall === 70 && m.line === 90 && m.at === 5 && /first reading/.test(m.why));
    ok('…exactly on the line counts', !!M.misplacedVerdict({ pct: 90, ts: 5, account: 'a', line: 90 }, wall));
    ok('under the line is not', M.misplacedVerdict({ pct: 89, ts: 5, account: 'a', line: 90 }, wall) === undefined);
    ok('a handover line that is off (0) judges nothing', M.misplacedVerdict({ pct: 99, ts: 5, account: 'a', line: 0 }, wall) === undefined);
    ok('no reading judges nothing', M.misplacedVerdict(undefined, wall) === undefined);
}

console.log('\n== the guard keeps the FIRST reading ==');
{
    let quota;
    const t = { convergePct: 35, handoverPct: 40, quotaConvergePct: 0, quotaHandoverPct: 90 };
    const g = new G.ContextGuard({ thresholds: () => t, read: () => undefined, quota: () => quota, channelFor: () => ({ channel: 'claude-hook' }), now: () => 7000 });
    quota = { pct: 92, account: 'kate' };
    g.check('s1', { event: 'PostToolUse' });
    quota = { pct: 40, account: 'kate' };
    g.check('s1', { event: 'PostToolUse' });
    const f = g.record('s1').quota.first;
    ok('the first reading is kept as it was read, with the line in force', f && f.pct === 92 && f.account === 'kate' && f.line === 90 && f.ts === 7000);
    ok('…and a later reading never replaces it', g.record('s1').quota.lastPct === 40 && g.record('s1').quota.first.pct === 92);
}

console.log('\n== the watch ==');
{
    // ‼️ the incident: session 2190d4d4 was born at 92% on the slot its pass placed it on; it was only marked starved when it passed
    const seal = hop('btn_0', 0, 's0', 's0');
    const leg2 = hop('btn_1', 1, 's0', 's1');
    const leg3 = hop('btn_2', 2, 's1', 's2');
    const store = new Map([seal, leg2, leg3].map(b => [b.id, b]));
    const firsts = { s0: { pct: 95, ts: 1, account: 'mine', line: 90 }, s1: { pct: 92, ts: 2, account: 'murvietnam', line: 90 } };
    const notes = [];
    const rounds = [{ taskId: 't9', sessionId: 'r9', sentryOf: 'snt_1', said: false }];
    const marked = [];
    const w = new M.MisplacedWatch({
        batons: () => [...store.values()], put: b => store.set(b.id, b), first: sid => firsts[sid],
        wall: r => r ? { value: 60, why: 'the campaign\'s Ceiling' } : wall,
        rounds: () => rounds, markRound: (id, m) => marked.push([id, m]),
        notify: (title, body, key) => notes.push({ title, body, key })
    });
    w.sweep();
    ok('‼️ 2190d4d4 replayed: a relay leg whose first reading stood at 92% marks the pass that placed it, and one Notice says so',
        store.get('btn_1').misplaced && store.get('btn_1').misplaced.pct === 92 && store.get('btn_1').misplaced.slot === 'murvietnam'
        && notes.filter(n => n.key === 'misplaced:btn_1').length === 1 && /leg 2/.test(notes[0].body));
    ok('a chain\'s first leg (the seal) is a person\'s placement: never judged', !store.get('btn_0').misplaced);
    ok('a leg with no reading yet waits', !store.get('btn_2').misplaced);
    w.sweep();
    ok('one Notice per placement: a second sweep says nothing again', notes.length === 1);
    firsts.s2 = { pct: 30, ts: 3, account: 'kate', line: 90 };
    w.sweep();
    firsts.s2 = { pct: 99, ts: 3, account: 'kate', line: 90 };
    w.sweep();
    ok('a first reading under the line is final: the leg is judged once', !store.get('btn_2').misplaced && notes.length === 1);
    firsts.r9 = { pct: 95, ts: 4, account: 'aicozums', line: 90 };
    w.sweep();
    ok('a sentry round born past the line is marked on its row, under the campaign\'s wall, with one Notice',
        marked.length === 1 && marked[0][0] === 't9' && marked[0][1].wall === 60 && notes.filter(n => n.key === 'misplaced:t9').length === 1);
    rounds[0].said = true;
    w.sweep();
    ok('…a row that already says it is not said again', marked.length === 1);
    firsts.s2 = { pct: 30, ts: 3, account: 'kate', line: 90 };
    const reborn = new M.MisplacedWatch({
        batons: () => [...store.values()], put: b => store.set(b.id, b), first: sid => firsts[sid], wall: () => wall,
        rounds: () => rounds, markRound: (id, m) => marked.push([id, m]), notify: (title, body, key) => notes.push({ title, body, key })
    });
    reborn.sweep();
    ok('‼️ after a reload the records answer: no hop or round is said a second time', marked.length === 1 && notes.length === 2);

    const card = V.batonCardView([...store.values()], 's1');
    ok('the relay bar of the misplaced leg says so', card && card.lines.some(l => /^Misplaced: murvietnam read 92%/.test(l)));
    const clean = V.batonCardView([...store.values()], 's2');
    ok('…and a leg placed well says nothing of it', clean && !clean.lines.some(l => /^Misplaced:/.test(l)));
    ok('baton.status carries it', B.batonView(store.get('btn_1')).misplaced.pct === 92 && B.batonView(store.get('btn_2')).misplaced === undefined);
}

console.log('\n== the host wiring ==');
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const ops = fs.readFileSync(path.join(ROOT, 'src', 'core', 'chainOps.ts'), 'utf8');
    ok('the host sweeps on the relay tick and reads the guard\'s first reading',
        /misplacedWatch\.sweep\(\)/.test(ext) && /first: sid => contextGuard\.record\(sid\)\?\.quota\?\.first/.test(ext));
    ok('a running round is judged under its campaign\'s wall and marked on its row once',
        /camp\?\.id === r\.sentryOf \? campaignWall\(camp\) : accountCeiling\(\)/.test(ext) && /t\.sentryOf && t\.status === 'running' \? successorSessionOf\(t\)/.test(ext)
        && /markRound: \(id, m\) => taskManager\.noteMisplaced\(id, m\.why\)/.test(ext)
        && /some\(e => e\.kind === 'misplaced'\)\) \{ return; \}/.test(fs.readFileSync(path.join(ROOT, 'src', 'core', 'tasks.ts'), 'utf8')));
    ok('baton.legs carries each leg\'s misplaced', /misplaced: deps\.misplacedOf\?\.\(l\.sessionId\) \?\? null/.test(ops));
}

console.log(`test_misplaced: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
