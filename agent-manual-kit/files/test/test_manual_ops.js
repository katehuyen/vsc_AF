// X-536 — THE AGENT MANUAL ON THE BRIDGE: farm.guide / farm.find / farm.ops / farm.brief and manual.*.
//
// Registered on a real BridgeRegistry with a scratch bridge folder and home, so
// what is tested is the dispatch an agent's request goes through: the replaced
// farm.ops, the did-you-mean on an unknown op, the skill install that plans
// before it writes and never touches a foreign file, the gap log, and a brief
// composed from the fleet's own public ops.
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
const { registerManualOps, QUIET_MANUAL_OPS } = require(path.join(ROOT, 'out', 'core', 'manualOps.js'));
const { appendGap } = require(path.join(ROOT, 'out', 'core', 'manualGaps.js'));
const S = require(path.join(ROOT, 'out', 'core', 'manualSource.js'));
const C = require(path.join(ROOT, 'out', 'core', 'manualBuild.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-manual-ops-'));
const home = path.join(tmp, 'home');
const bridgeDir = path.join(tmp, 'bridge');
fs.mkdirSync(home, { recursive: true });

(async () => {
    const reg = new BridgeRegistry();
    // the fleet's own ops the brief is composed from, as fakes
    reg.register([
        { op: 'sessions.whoami', describe: 'x', handler: (_a, from) => ({ sessionId: from && from.sessionId || 'abcdef1234', source: 'env', cwd: '/agents/dev/src' }) },
        { op: 'agents.list', describe: 'x', handler: () => [{ id: '1', name: 'dev', dir: '/agents/dev' }, { id: '2', name: 'writer', dir: '/agents/writer' }] },
        { op: 'now.get', describe: 'x', handler: () => ({ running: [{ id: 'c1' }], waiting: [{ key: 'k' }], waitingMore: 0, today: { cost: 1.5, quotas: [{ account: 'main', engine: 'claude', percent: 42 }] } }) },
        { op: 'automations.status', describe: 'x', handler: () => ({ gate: { blocked: false } }) },
        { op: 'projects.current', describe: 'x', handler: () => ({ id: 'prj_1', name: 'App' }) },
        { op: 'engines.status', describe: 'x', handler: () => ({ engines: [{ id: 'claude', ready: true }, { id: 'gemini', ready: false }] }) },
        { op: 'notices.list', describe: 'x', handler: (a) => a.agent === 'dev' ? [{ id: 'n1' }] : [] },
        { op: 'queue.list', describe: 'x', handler: (a) => a.sourceNoticeAgent === 'dev' ? [{ id: 'q1' }, { id: 'q2' }] : [] },
        { op: 'a2a.status', describe: 'x', handler: () => ({ unreadNotes: 3, claimable: 1, held: [] }) },
        { op: 'tasks.add', describe: 'Queue a task. args: agent, title, prompt', handler: () => ({ id: 't1' }) }
    ]);
    const src = S.readManualSource(path.join(ROOT, 'manual'));
    const manual = C.compileManual(src, reg.catalog(), '9.9.9').manual;
    const gaps = [];
    reg.onUnknownOp((op, near) => { gaps.push({ op, near }); appendGap(bridgeDir, { ts: Date.now(), kind: 'unknown-op', what: op, near }); });
    registerManualOps(reg, {
        manual: () => manual, problems: () => [], stage: () => undefined, startCardMode: () => 'card',
        bridgeDir, home: () => home, env: {},
        brief: { dispatch: (op, args, from) => reg.dispatch(op, args, from), version: '9.9.9', userLanguage: () => 'tr', command: () => 'node "x"' }
    });

    // ------------------------------------------------------------ reads
    const g = await reg.dispatch('farm.guide', {});
    ok('farm.guide answers the map as text over the bridge', g.ok && g.result.format === 'markdown' && /map for agents/.test(g.result.text));
    const ops = await reg.dispatch('farm.ops', {});
    ok('farm.ops is replaced: the compact index, not the dump', ops.ok && ops.result.format === 'markdown' && /by area/.test(ops.result.text));
    const full = await reg.dispatch('farm.ops', { full: true });
    ok('farm.ops full=true keeps the old shape for tools', full.ok && Array.isArray(full.result) && full.result.some(r => r.op === 'tasks.add'));
    const one = await reg.dispatch('farm.ops', { op: 'tasks.add' });
    ok('farm.ops op=<name> answers its contract', one.ok && /Queue a task/.test(one.result.text));
    const f = await reg.dispatch('farm.find', { q: 'start a baton chain for this job' });
    ok('farm.find answers ranked hits', f.ok && /baton-relay/.test(f.result.text));
    const bad = await reg.dispatch('farm.guide', { id: 'no-such-guide' });
    ok('an unknown guide is a refusal, not an exception', !bad.ok && /No guide/.test(bad.error));

    // ------------------------------------------------------------ the unknown op
    const u = await reg.dispatch('tasks.ad', {});
    ok('an unknown op names the likeliest ops and the search', !u.ok && /Did you mean tasks\.add/.test(u.error) && /farm\.find/.test(u.error));
    ok('…and still names farm.ops, as callers expect', /farm\.ops/.test(u.error));
    ok('…and the listener heard it', gaps.length === 1 && gaps[0].op === 'tasks.ad' && gaps[0].near.includes('tasks.add'));

    // ------------------------------------------------------------ the brief
    const b = await reg.dispatch('farm.brief', { format: 'json' }, { sessionId: 'sess-1234567' });
    ok('farm.brief says who the caller is', b.ok && b.result.you.sessionId === 'sess-1234567');
    ok('…finds its agent from the folder, and says it is a hint', b.result.you.agent === 'dev' && /hint/.test(b.result.you.agentFrom));
    ok('…counts what waits for it', b.result.waitingForYou.openQuestions === 1 && b.result.waitingForYou.answeredIntoQueue === 2
        && b.result.waitingForYou.a2aUnreadNotes === 3);
    ok('…and reports the fleet, engines, automations and the user\'s language',
        b.result.fleet.runningConsole === 1 && b.result.fleet.needsUser === 1 && b.result.engines.ready.join() === 'claude'
        && b.result.automations.blocked === false && b.result.userLanguage === 'tr');
    const bt = await reg.dispatch('farm.brief', {}, { sessionId: 'sess-1234567' });
    ok('farm.brief as text reads in a few lines', bt.ok && /# Brief: Agent Farm 9\.9\.9/.test(bt.result.text)
        && /User language: tr/.test(bt.result.text) && /Waiting for you: 1 open question/.test(bt.result.text));

    // ------------------------------------------------------------ skills
    const plan = await reg.dispatch('manual.install', {});
    ok('manual.install plans first and writes nothing', plan.ok && plan.result.planned && !fs.existsSync(path.join(home, '.claude')));
    ok('…measured targets are planned, unmeasured ones are not', plan.result.rows.find(r => r.engine === 'claude').action === 'create'
        && plan.result.rows.find(r => r.engine === 'gemini').action === 'unmeasured' && plan.result.rows.find(r => r.engine === 'opencode').action === 'via');
    const inst = await reg.dispatch('manual.install', { confirm: true });
    const claudeSkill = path.join(home, '.claude', 'skills', 'agent-farm', 'SKILL.md');
    const codexSkill = path.join(home, '.codex', 'skills', 'agent-farm', 'SKILL.md');
    ok('confirm=true writes the Claude and Codex skills', inst.ok && fs.existsSync(claudeSkill) && fs.existsSync(codexSkill));
    const text = fs.readFileSync(claudeSkill, 'utf8');
    ok('the skill has a name and a description an engine can index, and the portable command',
        /^---\nname: agent-farm\ndescription: /.test(text) && text.includes('node "$HOME/.agentfarm/af.js"'));
    const again = await reg.dispatch('manual.install', {});
    ok('a second plan finds them current', again.result.rows.find(r => r.engine === 'claude').action === 'same');
    const geminiDir = path.join(home, '.gemini', 'skills', 'agent-farm');
    fs.mkdirSync(geminiDir, { recursive: true });
    fs.writeFileSync(path.join(geminiDir, 'SKILL.md'), '---\nname: agent-farm\n---\nthe user\'s own', 'utf8');
    const foreign = await reg.dispatch('manual.install', { engines: 'gemini', confirm: true });
    ok('a foreign skill of the same name is never overwritten', foreign.result.rows[0].action === 'foreign'
        && fs.readFileSync(path.join(geminiDir, 'SKILL.md'), 'utf8').includes('the user\'s own'));
    const st = await reg.dispatch('manual.status', {});
    ok('manual.status reports the skills as installed and current', st.ok && st.result.skills.find(s => s.engine === 'claude').current);
    const rm = await reg.dispatch('manual.remove', {});
    ok('manual.remove takes ours and keeps the foreign one', rm.ok && !fs.existsSync(claudeSkill) && !fs.existsSync(codexSkill)
        && rm.result.kept.some(f => f.includes('.gemini')));

    // ------------------------------------------------------------ gaps and quiet
    await reg.dispatch('farm.find', { q: 'banana smoothie recipe' });
    const gp = await reg.dispatch('manual.gaps', {});
    ok('manual.gaps counts unknown ops and weak searches', gp.ok && gp.result.summary.some(s => s.kind === 'unknown-op' && s.what === 'tasks.ad')
        && gp.result.summary.some(s => s.kind === 'weak-find'));
    const cl = await reg.dispatch('manual.gaps', { clear: true });
    ok('manual.gaps clear=true empties the log', cl.ok && cl.result.cleared && (await reg.dispatch('manual.gaps', {})).result.total === 0);
    ok('only reads are quiet', QUIET_MANUAL_OPS.has('farm.guide') && QUIET_MANUAL_OPS.has('farm.brief')
        && !QUIET_MANUAL_OPS.has('manual.install') && !QUIET_MANUAL_OPS.has('manual.remove'));

    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
