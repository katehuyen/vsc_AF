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
