// S-67 — THE BATON'S DECISIONS, PINNED WITHOUT A WINDOW.
//
// The baton is the words one run leaves for the next. What must not go wrong
// quietly: the successor's setup is the predecessor's SEALED manifest and never
// a guess; a second pass replaces the first rather than opening two successors;
// a finished baton can never be moved back into play; and the store never drops
// a live one to make room.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const B = require(path.join(OUT, 'baton.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));

const NOW = 1790000000000;
const manifest = (o) => Object.assign({
    launchId: 'lch_abc123def', at: NOW - 1000, engine: 'claude',
    identity: { engine: 'claude', providerId: 'anthropic', origin: 'builtin', scope: 'machine' },
    requested: { model: 'opus', effort: 'high', permissionMode: 'bypassPermissions', tier: 'opus' },
    agentId: 'dev', agentName: 'developer', projectId: 'prj_9ujsbtzr', mechanism: 'session',
    cwd: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm', account: 'claude-kate', surface: 'console', superpowers: true
}, o);
const input = (o) => Object.assign({
    prompt: 'Continue K-44 from step 3.', sessionId: '6c692567-8bc5-416b-bb77-44b18d0c2a25',
    launchId: 'lch_abc123def', manifest: manifest(), prior: [], now: NOW, rnd: () => 0.5
}, o);

// ---- inheritance: the manifest, and nothing else ---------------------------
{
    ok('no session named is refused', !B.inheritFrom('', 'lch_abc123def', manifest()).ok);
    const noLaunch = B.inheritFrom('6c692567xx', undefined, manifest());
    ok('‼️ a session with no launch id is refused, and the refusal says it will not guess',
        !noLaunch.ok && /no launch id/.test(noLaunch.why) && /will not guess/.test(noLaunch.why));
    const wrong = B.inheritFrom('6c692567xx', 'lch_other00000', manifest());
    ok('‼️ a manifest for ANOTHER launch is not borrowed', !wrong.ok && /no launch manifest/.test(wrong.why));
    ok('…nor is a missing one', !B.inheritFrom('6c692567xx', 'lch_abc123def', undefined).ok);
    const r = B.inheritFrom('6c692567xx', 'lch_abc123def', manifest());
    ok('the predecessor is read off its manifest: engine, agent, folder, project, launch',
        r.ok && r.from.engine === 'claude' && r.from.agentId === 'dev' && /vsc_AgentFarm$/.test(r.from.cwd)
        && r.from.projectId === 'prj_9ujsbtzr' && r.from.launchId === 'lch_abc123def');
    ok('…and the whole setup travels: model, effort, permission, tier, provider, superpowers, surface, slot',
        r.ok && r.inherit.model === 'opus' && r.inherit.effort === 'high'
        && r.inherit.permissionMode === 'bypassPermissions' && r.inherit.tier === 'opus'
        && r.inherit.providerId === 'anthropic' && r.inherit.superpowers === true
        && r.inherit.surface === 'console' && r.inherit.account === 'claude-kate');
    const bare = B.inheritFrom('6c692567xx', 'lch_abc123def', manifest({ requested: {}, projectId: undefined, superpowers: undefined, account: undefined }));
    ok('what the manifest does not say is left unsaid, not filled in',
        bare.ok && !('model' in bare.inherit) && !('projectId' in bare.from) && !('superpowers' in bare.inherit)
        && !('account' in bare.inherit));
}

// ---- the pass ------------------------------------------------------------
{
    ok('an empty prompt is refused — the baton IS the words', !B.passBaton(input({ prompt: '   ' })).ok);
    ok('a prompt that is not text is refused', !B.passBaton(input({ prompt: 42 })).ok);
    const bad = B.passBaton(input({ surface: 'tmux' }));
    ok('an unknown surface is refused with the list', !bad.ok && /inherit · console · terminal · headless/.test(bad.why));
    ok('a refusal from inheritance is passed through unchanged',
        /no launch id/.test(B.passBaton(input({ launchId: '' })).why));

    const r = B.passBaton(input());
    ok('‼️ an accepted pass WAITS for the session to end — it starts nothing',
        r.ok && r.baton.state === 'waiting-end' && /session to end/.test(r.baton.why));
    ok('a first pass opens hop 1 of a new chain', r.ok && r.baton.hop === 1 && /^chn_/.test(r.baton.chainId) && /^btn_/.test(r.baton.id));
    ok('the prompt is kept as written, trimmed', r.ok && r.baton.prompt === 'Continue K-44 from step 3.');
    ok('no surface and no account → inherit on @emptiest',
        r.ok && r.baton.want.surface === 'inherit' && r.baton.want.account === B.BATON_DEFAULT_ACCOUNT
        && B.BATON_DEFAULT_ACCOUNT === '@emptiest');
    ok('inherit resolves to the manifest\'s surface; a stated one wins',
        B.successorSurface(r.baton) === 'console'
        && B.successorSurface(B.passBaton(input({ surface: 'headless' })).baton) === 'headless');
    ok('the times are the caller\'s clock', r.ok && r.baton.createdAt === NOW && r.baton.updatedAt === NOW);

    // chain continuation: this session was itself started by a baton
    const parent = Object.assign({}, r.baton, {
        id: 'btn_parent', chainId: 'chn_seven', hop: 2, state: 'started', toSessionId: 'succ-1111'
    });
    const child = B.passBaton(input({ sessionId: 'succ-1111', prior: [parent] }));
    ok('‼️ a session STARTED by a baton continues that chain at the next hop',
        child.ok && child.baton.chainId === 'chn_seven' && child.baton.hop === 3);
    const unrelated = B.passBaton(input({ sessionId: 'other-2222', prior: [parent] }));
    ok('…and any other session starts its own', unrelated.ok && unrelated.baton.chainId !== 'chn_seven' && unrelated.baton.hop === 1);
    const notStarted = Object.assign({}, parent, { state: 'parked' });
    ok('a baton that never started its successor is not a parent',
        B.passBaton(input({ sessionId: 'succ-1111', prior: [notStarted] })).baton.hop === 1);

    // a second pass replaces the first
    const first = r.baton;
    const doneSame = Object.assign({}, first, { id: 'btn_old', state: 'started' });
    const liveOther = Object.assign({}, first, { id: 'btn_x', from: Object.assign({}, first.from, { sessionId: 'other-2222' }) });
    const again = B.passBaton(input({ prompt: 'second thoughts', prior: [first, doneSame, liveOther], now: NOW + 5000 }));
    ok('‼️ a second pass from the same session replaces the first, which is stopped and says by what',
        again.ok && again.superseded.length === 1 && again.superseded[0].id === first.id
        && again.superseded[0].state === 'stopped' && again.superseded[0].why.includes(again.baton.id));
    ok('…a finished baton of that session and a live one of another are left alone',
        again.ok && !again.superseded.some(b => b.id === 'btn_old' || b.id === 'btn_x'));
}

// ---- the state machine -----------------------------------------------------
{
    const b = B.passBaton(input()).baton;
    ok('waiting → parked, with a wake time', (() => {
        const m = B.moveBaton(b, 'parked', 'all accounts full', NOW + 1, { wakeAt: NOW + 3600000 });
        return m.ok && m.baton.state === 'parked' && m.baton.wakeAt === NOW + 3600000 && m.baton.updatedAt === NOW + 1;
    })());
    const parked = B.moveBaton(b, 'parked', 'full', NOW + 1, { wakeAt: NOW + 10 }).baton;
    ok('a park can be moved to a later wake', B.moveBaton(parked, 'parked', 'still full', NOW + 2, { wakeAt: NOW + 20 }).ok);
    const started = B.moveBaton(parked, 'started', 'opened', NOW + 3, { toSessionId: 'succ', taskId: 't1' });
    ok('parked → started carries the successor and the task, and forgets the wake time',
        started.ok && started.baton.toSessionId === 'succ' && started.baton.taskId === 't1' && !('wakeAt' in started.baton));
    const back = B.moveBaton(started.baton, 'waiting-end', 'again', NOW + 4);
    ok('‼️ a started baton can never be put back into play — that would be a second successor',
        !back.ok && /started cannot become waiting-end/.test(back.why));
    for (const done of B.BATON_DONE) {
        ok(`${done} is terminal`, ['armed', 'waiting-end', 'parked', 'started', 'stopped', 'refused'].every(t => !B.canMove(done, t)));
    }
    ok('armed may only be accepted, stopped or refused',
        B.canMove('armed', 'waiting-end') && !B.canMove('armed', 'started') && !B.canMove('armed', 'parked'));
    ok('isLive reads the terminal set', B.isLive(b) && !B.isLive(started.baton) && !B.isLive(undefined));
}

// ---- the sentence the passing agent reads ----------------------------------
{
    const b = B.passBaton(input()).baton;
    const hm = t => new Date(t).toISOString().slice(11, 16);
    const room = B.batonPlanSentence(b, { account: 'kate', usedPct: 12.4 }, hm);
    ok('‼️ the plan says nothing starts while this session lives, and to end the run',
        /Nothing starts while session 6c692567 is alive/.test(room) && /end your run now/.test(room));
    ok('…with room: the engine, the surface, the rule, the slot and its use, the folder',
        /fresh claude session opens as a Console card on @emptiest \(kate, 12% of 5h used\)/.test(room)
        && /vsc_AgentFarm/.test(room));
    const parked = B.batonPlanSentence(b, { resetsAt: Date.UTC(2026, 8, 21, 14, 37) }, hm);
    ok('…all full: parked until the first reset, at its time', /parked until 14:37/.test(parked));
    const refused = B.batonPlanSentence(b, { refusal: 'no slot is signed in for claude' }, hm);
    ok('…refused: the policy\'s own reason', /no slot is signed in for claude/.test(refused));
    ok('…and a continued chain names its hop',
        /hop 3 of chain chn_seven/.test(B.batonPlanSentence(Object.assign({}, b, { hop: 3, chainId: 'chn_seven' }))));
    ok('a headless successor is called one', /background \(headless\) run/.test(
        B.batonPlanSentence(B.passBaton(input({ surface: 'headless' })).baton)));
}

// ---- what the store keeps ----------------------------------------------------
{
    const mk = (id, state, t) => ({ id, state, updatedAt: t, from: { sessionId: id }, chainId: 'c', hop: 1 });
    const live = [1, 2, 3, 4, 5].map(i => mk('L' + i, 'waiting-end', i));
    const done = [1, 2, 3, 4, 5].map(i => mk('D' + i, 'started', 100 + i));
    const a = B.pruneBatons([...done, ...live], 3);
    ok('‼️ every live baton survives the cap, even past it — dropping one cancels a successor',
        a.length === 5 && a.every(b => b.id.startsWith('L')));
    const c = B.pruneBatons([live[0], ...done], 3);
    ok('…then the newest finished ones fill what is left',
        c.length === 3 && c[0].id === 'L1' && c[1].id === 'D5' && c[2].id === 'D4');
    ok('the default cap is 200', B.BATON_STORE_CAP === 200);
}

// ---- the store ----------------------------------------------------------------
{
    const mem = new BatonStore();
    const r = B.passBaton(input());
    mem.put(r.baton);
    ok('memory store: put, get, the session\'s live baton, its chain',
        mem.get(r.baton.id) === r.baton && mem.liveFrom(r.baton.from.sessionId) === r.baton
        && mem.chain(r.baton.chainId).length === 1);
    const stopped = B.moveBaton(r.baton, 'stopped', 'user', NOW + 1).baton;
    mem.put(stopped);
    ok('a stopped baton is no longer the session\'s live one', mem.liveFrom(r.baton.from.sessionId) === undefined);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-baton-'));
    try {
        const file = path.join(dir, 'batons.json');
        const disk = new BatonStore(file);
        disk.put(r.baton);
        disk.flush();
        const again = new BatonStore(file);
        ok('the file survives a reload, record for record',
            again.all().length === 1 && JSON.stringify(again.get(r.baton.id)) === JSON.stringify(r.baton));
        fs.writeFileSync(file, '{ torn', 'utf8');
        ok('a torn file is an empty store, not a crash', new BatonStore(file).all().length === 0);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

// ---- the core stays pure -------------------------------------------------------
{
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'baton.ts'), 'utf8');
    ok('‼️ baton.ts reads and writes nothing: no fs, no path, no vscode, no Date.now',
        !/from 'fs'|from 'path'|require\('fs'\)|from 'vscode'|Date\.now\(/.test(src));
}

console.log(`test_baton.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
