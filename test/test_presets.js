// U-52 — THE NAMED SUBSETS, WHEREVER A LIST HAS A WORD FOR ONE.
//
// `AFFilter.multi` has had `presets` since the Console needed `Dialog`, and for
// three versions exactly one picker in the extension used it — because a preset
// is per-picker DATA and the component deliberately does not know what any of
// the words mean, so nothing prompts a page to declare one. This file is the
// sweep that keeps the ones that were found.
//
// The bar for adding one, so this list does not grow into decoration:
//   · the subset needs a NAME somebody would use out loud;
//   · it must be two options or more — a single option is already one click,
//     on its own name (that gesture is what `clickName` is);
//   · and the page must actually PASS it through, which is the bug the backlog
//     had for three versions: `presets` declared in a list and dropped on the
//     way to the component.
'use strict';
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------------------------------------------------------------- Notices
{
    const now = Date.parse('2026-08-13T09:00:00Z');
    const notice = (o) => Object.assign({
        id: 'n' + Math.random().toString(36).slice(2, 8), title: 't', body: 'b',
        agentName: 'developer', type: 'update', level: 1, ts: now, read: true,
        tags: [], stars: 0
    }, o);
    const r = runPage('notices.js', {
        notices: [
            notice({ id: 'a', level: 4, type: 'question', status: 'open', read: false }),
            notice({ id: 'b', level: 3, type: 'warning' }),
            notice({ id: 'c', level: 2 }),
            notice({ id: 'd', level: 1, type: 'question', status: 'answered' }),
            notice({ id: 'e', level: 1, type: 'question', status: 'declined' })
        ],
        agents: ['developer', 'manager'], projects: [],
        unread: 1, openQuestions: 1
    });

    ok('the level axis names the top two', r.ms.presets('nt-level').join() === 'urgent');
    r.ms.preset('nt-level', 'urgent');
    ok('‼️ Urgent is L4 and L3, in one press', r.ms.ticked('nt-level').join() === '4,3');

    // "Waiting" is one option, so its name is already one click; the thing that
    // had no name is its opposite, which is two.
    ok('the question-status axis names the settled pair',
        r.ms.presets('nt-status').join() === 'settled');
    r.ms.preset('nt-status', 'settled');
    ok('‼️ Settled is answered and declined, and nothing still waiting on you',
        r.ms.ticked('nt-status').join() === 'answered,declined');

    ok('…and a picker with no natural subset declares none — a preset per axis '
        + 'would be decoration, and Agents is a list of names, not a vocabulary',
        r.ms.presets('nt-agent').length === 0 && r.ms.presets('nt-type').length === 0);
}

// ---------------------------------------------------------------- Work queue
{
    const now = Date.parse('2026-08-13T09:00:00Z');
    const item = (o) => Object.assign({
        id: 'q' + Math.random().toString(36).slice(2, 8), text: 'do a thing',
        author: 'user', target: 'repoA', status: 'captured', urgency: 'normal',
        ts: now, tags: []
    }, o);
    const r = runPage('queue.js', {
        items: [
            item({ id: 'a' }),
            item({ id: 'b', author: 'developer' }),
            item({ id: 'c', author: 'manager' })
        ],
        targets: ['repoA'], agents: ['developer', 'manager'], projects: []
    });

    ok('the author axis names everything the fleet put here',
        r.ms.presets('q-author').join() === 'agents');
    r.ms.preset('q-author', 'agents');
    ok('‼️ …which is every agent and nothing you wrote yourself',
        r.ms.ticked('q-author').join() === 'developer,manager');
}

// ---------------------------------------------------------------- Tasks
// The control panel needs its header figures and its form vocabulary before it
// will render at all; nothing here is under test, so it is the smallest shape
// that draws (the full fixture lives in test_tasks_webview.js).
const TASKS_SHELL = () => ({
    generatedAt: Date.now(),
    gate: { paused: false, pauseReason: '', quietFrom: '', quietTo: '', blocked: false, blockReason: '', runsQueue: true },
    summary: {
        running: 0, runLimit: 2, queued: 0, needsYou: 0, plansOn: 0, plansSwitchable: 0,
        doneToday: 0, failedToday: 0, cost7d: 0, savedWakeups7d: 0, issues: 0
    },
    perAgentLimit: 1, workflows: [], scenes: [],
    launch: {
        models: [], efforts: [], permissions: [],
        defaults: { model: '', effort: '', permissionMode: '' },
        engineModels: {}, engines: [], clis: [], projects: [], activeProjectId: ''
    }
});

// ---------------------------------------------------------------- Tasks: Plan
{
    const task = (o) => Object.assign({
        id: 't' + Math.random().toString(36).slice(2, 8), kind: 'schedule',
        title: 'a thing', when: 'every day 05:00', agentName: 'developer', model: '',
        guard: '', hasGuard: false, switchable: true, enabled: true,
        cost7d: 0, runs7d: 0, skipped7d: 0, skipRate: 0, lastNote: '', issues: [],
        overdue: '', detail: { prompt: 'p', target: '', timing: '', steps: [], setup: [] }
    }, o);
    const r = runPage('tasksPage.js', Object.assign(TASKS_SHELL(), {
        tab: 'plan', agents: ['developer', 'manager'], runs: [], undoable: 0,
        plan: [
            task({ kind: 'schedule' }), task({ kind: 'trigger' }),
            task({ kind: 'workflow' }), task({ kind: 'template' })
        ]
    }));
    ok('the Plan tab names the kinds that start on their own',
        r.ms.presets('tf-plan-kind').join() === 'auto');
    r.ms.preset('tf-plan-kind', 'auto');
    ok('‼️ Automatic is schedule · trigger · workflow, and not the template you launch',
        r.ms.ticked('tf-plan-kind').join() === 'schedule,trigger,workflow');
    // ‼️ The bar, on the same page: two options is already one click per name.
    ok('…and a two-option axis (State, Guard) names no subset',
        r.ms.presets('tf-plan-state').length === 0
        && r.ms.presets('tf-plan-guard').length === 0);
    ok('…nor does a list of agent NAMES', r.ms.presets('tf-plan-agent').length === 0);
}

// ---------------------------------------------------------------- Tasks: Runs
{
    const run = (o) => Object.assign({
        id: 'r' + Math.random().toString(36).slice(2, 8), title: 'a run', prompt: 'p',
        agentName: 'developer', status: 'done', sourceKind: 'manual', source: 'you',
        engine: 'claude', startedAt: 0, endedAt: 0, cost: 0, tokens: 0
    }, o);
    const r = runPage('tasksPage.js', Object.assign(TASKS_SHELL(), {
        tab: 'run', agents: ['developer'], plan: [], undoable: 0,
        runs: [
            run({ status: 'running', sourceKind: 'schedule', engine: 'claude' }),
            run({ status: 'queued', sourceKind: 'trigger', engine: 'codex' }),
            run({ status: 'parked', sourceKind: 'workflow', engine: 'gemini' }),
            run({ status: 'done', sourceKind: 'manual', engine: 'claude' }),
            run({ status: 'failed', sourceKind: 'schedule', engine: 'codex' }),
            run({ status: 'cancelled', sourceKind: 'manual', engine: 'claude' })
        ]
    }));

    ok('the status axis names both readings of it',
        r.ms.presets('tf-run-status').join() === 'live,finished');
    r.ms.preset('tf-run-status', 'finished');
    ok('‼️ Finished is everything that is over, however it ended',
        r.ms.ticked('tf-run-status').join() === 'done,failed,cancelled');
    r.ms.preset('tf-run-status', 'live');
    ok('…and Still going is its complement, in one press',
        r.ms.ticked('tf-run-status').join() === 'running,queued,parked');

    ok('the From axis names everything the farm started itself',
        r.ms.presets('tf-run-source').join() === 'auto');
    r.ms.preset('tf-run-source', 'auto');
    ok('‼️ Automation is schedule · trigger · workflow, and not the runs you pressed',
        r.ms.ticked('tf-run-source').join() === 'schedule,trigger,workflow');

    ok('the engine axis carries the same subset it carries everywhere else',
        r.ms.presets('tf-run-engine').join() === 'notclaude');
    r.ms.preset('tf-run-engine', 'notclaude');
    ok('‼️ …and Claude is not in it', r.ms.ticked('tf-run-engine').indexOf('Claude Code') < 0
        && r.ms.ticked('tf-run-engine').length === 2);
}

// ---------------------------------------------------------------- Turns
{
    const turn = (o) => Object.assign({
        file: 'D:/t/s.jsonl', sessionId: 'S', n: 1, of: 1, ts: Date.now(),
        agent: 'dev', agentName: 'dev', session: 's', title: 's', label: 'l',
        models: [], tokens: 0, cost: 0, tools: 0, errors: 0
    }, o);
    /** The filter panel is shut until it is pressed, exactly as a hand finds it. */
    const openFilters = (p) => { const b = p.query('.af-filter')[0]; if (b) { b.click(); } return p; };
    const three = openFilters(runPage('turns.js', {
        generatedAt: Date.now(), agents: ['dev'], models: [], origins: [],
        rows: [
            turn({ sessionId: 'A', engine: 'claude' }),
            turn({ sessionId: 'B', engine: 'codex' }),
            turn({ sessionId: 'C', engine: 'gemini' })
        ]
    }));
    ok('Turns names the same engine subset as the sessions tables',
        three.ms.presets('turns-engines').join() === 'notclaude');
    three.ms.preset('turns-engines', 'notclaude');
    ok('‼️ …and it means everything that is not the default engine',
        three.ms.ticked('turns-engines').join() === 'Codex,Gemini');

    // The guard, and it is the bar again: one other engine is one click on a name.
    const two = openFilters(runPage('turns.js', {
        generatedAt: Date.now(), agents: ['dev'], models: [], origins: [],
        rows: [turn({ sessionId: 'A', engine: 'claude' }), turn({ sessionId: 'B', engine: 'codex' })]
    }));
    ok('one other engine is not a subset worth naming',
        two.ms.presets('turns-engines').length === 0);
}

// ---------------------------------------------------------------- Search
{
    const fixture = require(path.join(__dirname, 'fixtures', 'search.js'));
    const r = runPage('search.js', fixture.data());
    // The panel is shut until it is pressed, exactly as a hand finds it.
    r.query('#more-toggle')[0].click();
    ok('Search names the same engine subset', r.ms.presets('f-engines').join() === 'notclaude');
    r.ms.preset('f-engines', 'notclaude');
    ok('‼️ …by engine ID, which is what this page filters on',
        r.ms.ticked('f-engines').join() === 'agy,codex,gemini');
}

// ---------------------------------------------------------------- Toolbox
{
    const item = (o) => Object.assign({
        kind: 'skill', scope: 'user', name: 'n', description: 'd',
        source: 'C:/u/.claude/skills/n/SKILL.md', dir: 'C:/u/.claude/skills/n', detail: {}
    }, o);
    const counts = {
        skill: { user: 1, agent: 2 }, subagent: { user: 0, agent: 0 },
        command: { user: 0, agent: 0 }, mcp: { user: 0, agent: 0 },
        hook: { user: 0, agent: 0 }, plugin: { user: 0, agent: 0 },
        style: { user: 0, agent: 0 }, settings: { user: 0, agent: 0 }
    };
    /** The page opens on Overview; the facets live on a kind's own tab. */
    const openSkills = (p) => {
        const b = p.query('[data-tab="skill"]').filter(x => x.tagName === 'BUTTON')[0]
            || p.query('[data-tab="skill"]')[0];
        if (b) { b.click(); }
        return p;
    };
    const r = openSkills(runPage('toolbox.js', {
        generatedAt: Date.now(), probeCache: {}, counts,
        agents: [{ id: 'a1', name: 'dev' }, { id: 'a2', name: 'ops' }],
        paths: { userClaudeDir: 'C:/u/.claude', userConfigJson: 'C:/u/.claude.json' },
        items: [
            item({ name: 'shared' }),
            item({ name: 'mine', scope: 'agent', agentId: 'a1', agentName: 'dev' }),
            item({ name: 'theirs', scope: 'agent', agentId: 'a2', agentName: 'ops' })
        ]
    }));
    ok('‼️ Scope names the subset the picker is opened with, on every Toolbox tab',
        r.ms.presets('tbf-skill-scope').join() === 'agents');
    r.ms.preset('tbf-skill-scope', 'agents');
    ok('…which is every agent and not the user-scope entries they all share',
        r.ms.ticked('tbf-skill-scope').join() === 'dev,ops');

    const one = openSkills(runPage('toolbox.js', {
        generatedAt: Date.now(), probeCache: {},
        counts: Object.assign({}, counts, { skill: { user: 1, agent: 1 } }),
        agents: [{ id: 'a1', name: 'dev' }],
        paths: { userClaudeDir: 'C:/u/.claude', userConfigJson: 'C:/u/.claude.json' },
        items: [item({ name: 'shared' }), item({ name: 'mine', scope: 'agent', agentId: 'a1', agentName: 'dev' })]
    }));
    ok('one agent is not a subset worth naming here either',
        one.ms.presets('tbf-skill-scope').length === 0);
}

// ---------------------------------------------------------------- and the bar
// A picker whose whole option list is two rows gets nothing: a preset there
// would be a slower way to press one of the two names.
{
    const r = runPage('queue.js', {
        items: [], targets: [], agents: ['developer'], projects: []
    });
    ok('one agent is not a subset worth naming', r.ms.presets('q-author').length === 0);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
