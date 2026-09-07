// X-232 — the console sessions that SURVIVE a restart of the extension host.
//
// X-230 measured the loss: a Console card's handle lives in this process's
// memory, so restarting the host loses every live one. That left two choices —
// wait for the window to go quiet, or `force` and lose the conversation. This is
// the third: write down what is running before the process dies, and take it up
// again on the other side.
//
// ‼️ THE RESURRECTION IS ONLY AS HONEST AS ITS DIMENSIONS. A session brought
// back on a different account, route or permission mode is not the session that
// went down — it is a new one wearing its transcript. So the row this file
// pins is DERIVED from `RunDimensions` itself: add a dimension there and this
// test fails until a revived session carries it too.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    isPlaceholderHistory, planRevive, REVIVE_PLACEHOLDER_ID, reviveInit, swapPlaceholder
} = require(path.join(__dirname, '..', 'out', 'core', 'consoleRevive.js'));

// ---------- the dimensions, read out of the source of truth ----------
const dims = (() => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'tasks.ts'), 'utf8');
    const at = src.indexOf('export interface RunDimensions {');
    const block = src.slice(at, src.indexOf('\n}', at));
    return [...block.matchAll(/^ {4}(\w+)\??:/gm)].map(m => m[1]);
})();

const live = (over = {}) => ({
    id: 'h1', agentId: 'dev', agentName: 'developer', cwd: 'D:/repo',
    sessionId: 'sess-1', status: 'idle',
    engine: 'codex', model: 'gpt-5', effort: 'high', permissionMode: 'full',
    providerId: 'kimi', tier: 'r3', account: 'work-1',
    projectId: 'prj_1', superpowers: true, ...over
});

{
    ok('the dimensions were really read out of tasks.ts', dims.length >= 5 && dims.includes('account'));
    const init = reviveInit(live());
    const missing = dims.filter(d => init[d] !== live()[d]);
    ok('‼️ every dimension of a run reaches the session that is brought back — ' + dims.join(' · '),
        missing.length === 0);
    ok('…and it is a RESUME of that conversation, not a new one with the same words',
        init.resume === 'sess-1');
    ok('…in its own folder, for its own agent',
        init.agentId === 'dev' && init.agentName === 'developer' && init.cwd === 'D:/repo');
    ok('‼️ …carrying the two facts that are not dimensions but are still this session\'s: '
        + 'the project it was started under and whether it had the skills discipline',
        init.projectId === 'prj_1' && init.superpowers === true);
    ok('‼️ the transcript and what it spent are NOT invented here — they are read '
        + 'from the index at the wiring, so this stays a pure decision',
        !('history' in init) && !('carried' in init));
}

// ---------- what can be brought back, and what honestly cannot ----------
{
    const plan = planRevive([
        live(),
        live({ id: 'h2', agentName: 'basit', sessionId: '', status: 'idle' }),
        live({ id: 'h3', agentName: 'gone', status: 'ended' }),
        live({ id: 'h4', agentName: 'broken', status: 'error' }),
        live({ id: 'h5', agentName: 'busy', status: 'working' }),
        live({ id: 'h6', agentName: 'new', status: 'starting', sessionId: '' })
    ]);

    ok('a live session with an id is brought back',
        plan.rows.some(r => r.id === 'h1') && plan.rows.some(r => r.id === 'h5'));
    ok('‼️ a session the engine never named cannot be resumed, and is not pretended away',
        !plan.rows.some(r => r.id === 'h2')
        && plan.skipped.some(s => s.id === 'h2' && /id/i.test(s.reason)));
    ok('…and so is one that never got that far', plan.skipped.some(s => s.id === 'h6'));
    ok('a session that had already ended is neither revived nor reported as lost',
        !plan.rows.some(r => r.id === 'h3') && !plan.skipped.some(s => s.id === 'h3'));
    ok('…nor is one that had already failed',
        !plan.rows.some(r => r.id === 'h4') && !plan.skipped.some(s => s.id === 'h4'));

    const busy = plan.rows.find(r => r.id === 'h5');
    ok('‼️ a session killed MID-TURN comes back, and says the answer in flight was lost — '
        + 'the transcript has what was said, nothing has what was being said',
        busy && busy.midTurn === true);
    ok('…while one that was merely waiting claims no such loss',
        plan.rows.find(r => r.id === 'h1').midTurn === false);
    ok('the skipped ones carry a name a person can recognise',
        plan.skipped.every(s => s.agentName));
}

// ---------- nothing to do is not an error ----------
{
    const empty = planRevive([]);
    ok('an empty window plans nothing', empty.rows.length === 0 && empty.skipped.length === 0);
    ok('…and a missing list is the same answer', planRevive(undefined).rows.length === 0);
}

// ---------- ‼️ X-266 — THE REVIVED CARD THAT CAME BACK EMPTY ----------
// The user reported it: the session was taken up again, said so, and showed
// NOTHING above that line — the conversation only came back after ending the
// card and resuming it off the shelf by hand, which is the manual step X-232
// exists to remove.
//
// The cause is an ordering nobody could have raced: `reviveAfterRestart()` runs
// inside `activate()`, and the transcript index is filled by an ASYNC
// `scanAll()` started in that same activation. `index.all()` is therefore EMPTY
// for every id at that moment, so `consoleHistory` always took its "Agent Farm
// does not have this session in its index yet" branch. Always, not sometimes.
//
// The placeholder is honest and stays; what was missing is the second read.
{
    ok('the placeholder has ONE id, shared with the row extension.ts writes',
        REVIVE_PLACEHOLDER_ID === 'xh-note');

    const ph = { id: REVIVE_PLACEHOLDER_ID, role: 'system', text: 'not in the index yet' };
    ok('‼️ a history that is nothing but the placeholder is a read that has NOT happened',
        isPlaceholderHistory([ph]));
    ok('…while a real scrollback is never mistaken for one',
        !isPlaceholderHistory([ph, { id: 'xh1' }]) && !isPlaceholderHistory([{ id: 'xh1' }]));
    ok('…and neither empty nor missing counts as a placeholder to retry',
        !isPlaceholderHistory([]) && !isPlaceholderHistory(undefined));

    const card = [ph, { id: 'xr-revived' }, { id: 'u1' }];
    const rebuilt = [{ id: 'xh0' }, { id: 'xh1' }, { id: 'xh2' }];
    const out = swapPlaceholder(card, rebuilt);
    ok('‼️ the scrollback replaces the placeholder WHERE IT STANDS',
        out.map(m => m.id).join(',') === 'xh0,xh1,xh2,xr-revived,u1');
    ok('‼️ …so the revive notice and anything the reader typed since keep their order',
        out[out.length - 2].id === 'xr-revived' && out[out.length - 1].id === 'u1');

    ok('a card with no placeholder is left exactly as it is',
        swapPlaceholder([{ id: 'xh1' }], rebuilt) === null);
    ok('…and so is one there is nothing to put into',
        swapPlaceholder(card, []) === null && swapPlaceholder(card, undefined) === null);
    ok('…and an empty card is not a place to write a scrollback into',
        swapPlaceholder([], rebuilt) === null);
    ok('the original is never mutated — the swap returns a new list',
        card.length === 3 && card[0].id === REVIVE_PLACEHOLDER_ID);
}

console.log(`test_console_revive.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
