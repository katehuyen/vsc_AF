// S-71 — the door: the successor's task row and the words it wakes up to.
//
// What must not go wrong quietly: the header is the system's and the
// predecessor's prompt is underneath untouched; every surface maps to the one
// door (tasks.add) with the right mode/target; the project travels from the
// manifest and is STATED even when absent; a run elsewhere than the agent's
// folder says so; the successor's setup is the sealed one.
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const { passBaton } = require(path.join(OUT, 'baton.js'));
const { successorPrompt, successorRow } = require(path.join(OUT, 'batonDoor.js'));

const NOW = 1790000000000;
function baton(o = {}) {
    const manifest = {
        launchId: 'lch_x', at: NOW - 1, engine: o.engine || 'claude',
        identity: { engine: o.engine || 'claude', providerId: 'anthropic', origin: 'builtin', scope: 'machine' },
        requested: { model: 'opus', effort: 'xhigh', permissionMode: 'bypassPermissions' },
        agentId: 'd:/agents/developer', agentName: 'developer', mechanism: 'session',
        cwd: o.cwd || 'D:\\agents\\developer', surface: o.surface || 'console',
        superpowers: false, account: 'claude-a',
        ...(o.projectId ? { projectId: o.projectId } : {})
    };
    const r = passBaton({
        prompt: o.prompt || 'Continue S-72: the quota brake reads the resolved account.',
        sessionId: 'aaaaaaaa-1111', launchId: 'lch_x', manifest,
        surface: o.want, account: o.account, prior: o.prior || [], now: NOW
    });
    if (!r.ok) { throw new Error(r.why); }
    return r.baton;
}

// ---- the header ----
{
    const b = baton({ projectId: 'prj_1' });
    const p = successorPrompt(b, { agentName: 'developer' });
    const lines = p.split('\n');
    ok('the header names the chain and the hop', lines[0] === `=== BATON RELAY — chain ${b.chainId} · hop 1 ===`);
    ok('the predecessor is named by session, agent, engine/model and project',
        /Predecessor: session aaaaaaaa \(developer · claude\/opus · project prj_1\) ended its run/.test(lines[1]));
    ok('‼️ it teaches the successor to pass the baton itself, by the file recipe', /baton\.pass "@<file>"/.test(p) && /_REF\/handover\.md/.test(p));
    ok('…and that nothing starts while it is alive', /Nothing starts while you are alive/.test(p));
    ok('the predecessor\'s own words are underneath, after the rule, untouched',
        lines[lines.length - 2] === '---' && lines[lines.length - 1] === b.prompt);
    ok('with a ceiling the hop reads n/N', /hop 1\/6 ===/.test(successorPrompt(b, { maxHops: 6 })));
    ok('without an agent name the id stands in', /\(d:\/agents\/developer · /.test(successorPrompt(b)));
    const multi = baton({ prompt: 'line one\n\nline `two` with "quotes"' });
    ok('a multi-line prompt with quotes and backticks survives whole', successorPrompt(multi).endsWith('line one\n\nline `two` with "quotes"'));
}

// ---- the row, surface by surface ----
{
    const ctx = { agentName: 'developer', agentDir: 'D:\\agents\\developer' };
    const con = successorRow(baton({ surface: 'console', projectId: 'prj_1' }), ctx);
    ok('console → an interactive row hosted by the Console that stays open',
        con.mode === 'interactive' && con.extra.interactiveTarget === 'console' && con.extra.interactiveClose === 'stay-open');
    ok('the row carries the sealed setup', con.extra.model === 'opus' && con.extra.effort === 'xhigh'
        && con.extra.permissionMode === 'bypassPermissions' && con.extra.providerId === 'anthropic' && con.extra.superpowers === false);
    ok('the account is the WANT (@emptiest by default), never the predecessor\'s slot', con.extra.account === '@emptiest');
    ok('the project travels from the manifest', con.extra.projectId === 'prj_1');
    ok('the title names the hop and the chain', /^Baton — hop 1 of chain chn_/.test(con.title));
    ok('the prompt is the header + the words', con.prompt.startsWith('=== BATON RELAY') && con.prompt.endsWith('resolved account.'));
    ok('a run in the agent\'s own folder states no workDir', !('workDir' in con.extra));
    ok('claude is the default engine and is not stated', !('engine' in con.extra));

    const head = successorRow(baton({ surface: 'headless' }), ctx);
    ok('headless → a headless row, no target', head.mode === 'headless' && !('interactiveTarget' in head.extra));
    ok('‼️ no project is STATED as none — a system-made row is never in "the window\'s active project"',
        'projectId' in head.extra && head.extra.projectId === undefined);

    const term = successorRow(baton({ surface: 'terminal' }), ctx);
    ok('terminal → the VS Code terminal', term.mode === 'interactive' && term.extra.interactiveTarget === 'vscode');
    const ext = successorRow(baton({ surface: 'external-terminal' }), ctx);
    ok('external-terminal → an external window', ext.extra.interactiveTarget === 'external');

    const want = successorRow(baton({ surface: 'console', want: 'headless' }), ctx);
    ok('a wanted surface overrides the inherited one', want.mode === 'headless');
    const acct = successorRow(baton({ account: 'claude-b' }), ctx);
    ok('a named account is the one asked for', acct.extra.account === 'claude-b');

    const wt = successorRow(baton({ cwd: 'D:\\agents\\developer\\.worktrees\\x' }), ctx);
    ok('a run elsewhere (a worktree) says where', wt.extra.workDir === 'D:\\agents\\developer\\.worktrees\\x');
    const slash = successorRow(baton({ cwd: 'd:/agents/developer/' }), ctx);
    ok('the agent folder in another spelling is still the agent folder', !('workDir' in slash.extra));
    const codex = successorRow(baton({ engine: 'codex' }), ctx);
    ok('another engine is stated on the row', codex.extra.engine === 'codex');
}

// ---- S-73: every account is full at the release ----
{
    const { wakeMoment } = require(path.join(OUT, 'batonDoor.js'));
    const ctx = { agentName: 'developer', agentDir: 'D:\\agents\\developer' };
    const resetsAt = NOW + 40 * 60_000;
    const parked = successorRow(baton({ surface: 'console' }), { ...ctx, park: { resetsAt, bufferMin: 3, refusal: 'every claude account is at 100%' } });
    ok('the row waits until the first reset plus the buffer, visibly', parked.wakeAt === resetsAt + 3 * 60_000 && parked.extra.notBefore === parked.wakeAt);
    ok('…and says why on the row itself', /baton parked — every account is full: every claude account is at 100%; first reset \+ 3 min buffer/.test(parked.extra.notBeforeWhy));
    ok('wakeMoment is reset + buffer, and a negative buffer is no buffer', wakeMoment({ resetsAt, bufferMin: 3 }) === resetsAt + 180_000 && wakeMoment({ resetsAt, bufferMin: -5 }) === resetsAt);
    const noReset = successorRow(baton({}), { ...ctx, park: { resetsAt: 0, bufferMin: 3 } });
    ok('a park with no measured reset writes no wait (the account gate holds the row instead)', !('wakeAt' in noReset) && !('notBefore' in noReset.extra));
    const room = successorRow(baton({}), ctx);
    ok('with room there is no wait on the row', !('wakeAt' in room) && !('notBefore' in room.extra));
    const head = successorRow(baton({ surface: 'headless' }), { ...ctx, park: { resetsAt, bufferMin: 0 } });
    ok('a headless row parks the same way', head.mode === 'headless' && head.wakeAt === resetsAt);
}

// ‼️ X-355 — measured live (S-79): every leg met the per-agent lock for a
// second and the generic "Task parked" line fired on each. The relay's own
// hand-off is not news; anything else holding its row still is.
{
    const { relayHandoffHold } = require(path.join(OUT, 'batonDoor.js'));
    const batons = [{ id: 'b1', taskId: 'task-2' }];
    ok('X-355: a successor row on the per-agent lock is the hand-off — quiet',
        relayHandoffHold({ id: 'task-2', deferredCode: 'concurrency:agent:basit' }, batons) === true);
    ok('…the same row held by anything else still speaks',
        relayHandoffHold({ id: 'task-2', deferredCode: 'concurrency:fleet' }, batons) === false
        && relayHandoffHold({ id: 'task-2', deferredCode: 'budget:fleet' }, batons) === false
        && relayHandoffHold({ id: 'task-2' }, batons) === false);
    ok('…and a row no baton opened is never silenced', relayHandoffHold({ id: 'task-9', deferredCode: 'concurrency:agent:basit' }, batons) === false);
    const ext = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const scan = ext.slice(ext.indexOf("if (t.status !== 'queued' || !t.autoStart || !t.deferredReason) { continue; }"), ext.indexOf('postNewsOnce(parkNoticeKey(t)'));
    ok('…and the farm-news park scan asks it before posting', /if \(relayHandoffHold\(t, batonStore\.all\(\)\)\) \{ continue; \}/.test(scan));
}

// ---- S-82 (4/4): the user's header and standing rule (agentFarm.batonHandoverTemplate / batonInjectedDirective)
{
    const D = require(path.join(OUT, 'batonDoor.js'));
    const b = baton({ prompt: 'Carry on with S-83.' });
    const plain = successorPrompt(b, { agentName: 'developer', maxHops: 6 });
    ok('S-82: with neither set, the built-in header is unchanged — and names the ceiling', /^=== BATON RELAY — chain chn_\w+ · hop 1\/6 ===/.test(plain)
        && !/Standing directive/.test(plain) && plain.endsWith('---\nCarry on with S-83.'));
    const ruled = successorPrompt(b, { agentName: 'developer', directive: '  Run npm test before passing.  ' });
    ok('…a standing directive rides the built-in header, trimmed, ABOVE the predecessor\'s words',
        /Standing directive \(the user's, on every leg\): Run npm test before passing\.\n---\nCarry on with S-83\.$/.test(ruled));
    ok('…a blank one adds nothing', !/Standing directive/.test(successorPrompt(b, { directive: '   ' })));
    const tpl = 'LEG {hop}/{maxHops} of {chain} for {agentId} after {fromSessionId}\nWhy: {why}\nRule: {userDirective}\n{agentPrompt}\nkeep {unknown}';
    const mine = successorPrompt(b, { agentName: 'developer', maxHops: 4, template: tpl, directive: 'Be brief.' });
    ok('‼️ a template REPLACES the header and fills every variable',
        mine.startsWith(`LEG 1/4 of ${b.chainId} for developer after aaaaaaaa-1111\nWhy: ${b.why}\nRule: Be brief.\nCarry on with S-83.`)
        && !/BATON RELAY/.test(mine));
    ok('…an unknown {name} is left as typed', /keep \{unknown\}$/.test(mine));
    ok('…no ceiling reads "none"', /^LEG 1\/none/.test(successorPrompt(b, { template: tpl })));
    const bare = successorPrompt(b, { template: 'Hop {hop}. Go.', directive: 'Be brief.' });
    ok('‼️ a template that forgets the directive and the words still carries both — directive first, words last',
        bare === 'Hop 1. Go.\nStanding directive: Be brief.\n---\nCarry on with S-83.');
    ok('…a whitespace-only template is no template', /^=== BATON RELAY/.test(successorPrompt(b, { template: ' \n ' })));
    ok('the variable list is the one the setting documents', D.HANDOVER_TEMPLATE_VARS.join() === 'fromSessionId,agentId,chain,hop,maxHops,why,userDirective,agentPrompt');
    const pkg = require(path.join(__dirname, '..', 'package.json')).contributes.configuration;
    const props = Object.assign({}, ...(Array.isArray(pkg) ? pkg : [pkg]).map(c => c.properties || {}));
    const tplSetting = props['agentFarm.batonHandoverTemplate'];
    ok('…and every one of them is named in that setting\'s description',
        !!tplSetting && D.HANDOVER_TEMPLATE_VARS.every(v => tplSetting.description.includes('{' + v + '}')));
    ok('both settings are text boxes, empty by default', tplSetting && tplSetting.editPresentation === 'multilineText' && tplSetting.default === ''
        && props['agentFarm.batonInjectedDirective'] && props['agentFarm.batonInjectedDirective'].editPresentation === 'multilineText');
    const ext = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('‼️ the door reads both settings and the chain\'s own ceiling for every successor row',
        /maxHops: chainMaxLegs\(batonStore\.all\(\), b\.chainId, normalizeMaxLegs\(cfg\(\)\.get<unknown>\('batonMaxHops'\)\)\)/.test(ext)
        && /template: cfg\(\)\.get<string>\('batonHandoverTemplate', ''\)/.test(ext) && /directive: cfg\(\)\.get<string>\('batonInjectedDirective', ''\)/.test(ext));
}

console.log(`test_baton_door: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
