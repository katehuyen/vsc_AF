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
    isPlaceholderHistory, planRevive, REVIVE_ASKED_IDLE, REVIVE_ASKED_MIDTURN, REVIVE_NUDGE_IDLE,
    REVIVE_PLACEHOLDER_ID, reviveInit, reviveIntent, reviveSpeech, settleVerdict, swapPlaceholder
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

// ---------- ‼️ THE REVIVED CARD THAT CAME BACK EMPTY ----------
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

// ---- audit B-03.7: THE REVIVE TAKES THE WORK UP, NOT ONLY THE CONVERSATION ----
//
// ‼️ X-232 put the card back in its seat with its whole transcript and then let
// it sit `idle`, because `reviveInit` carries no prompt and nothing spoke into
// it. So the unattended night shift X-230's header exists to save still stopped
// — one step later — and the card said "ask again" to an empty room. The user's
// decision: it carries on.
//
// The scope is the part that can go wrong quietly, so it is pinned hardest: a
// seat that was IDLE when the host went down was waiting for a human, and
// nudging that one would not be resuming work, it would be inventing it.
{
    const extTs = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const nudge = (() => {
        const at = extTs.indexOf('const nudgeRevived = (seatId: string, text: string): void => {');
        return at < 0 ? '' : extTs.slice(at, extTs.indexOf('\n    };', at));
    })();

    ok('the nudge is findable — a renamed one must fail here rather than go quiet', nudge.length > 200);
    ok('‼️ it waits for the seat to be idle — a prompt into `starting` is a prompt into a guess',
        /st\.status !== 'idle'/.test(nudge) && /return;/.test(nudge));
    ok('‼️ …and checks immediately too, because a Claude seat is ALREADY idle when start() returns',
        /attempt\(sub\);\s*$/.test(nudge.trim()) || /^\s*attempt\(sub\);/m.test(nudge));
    ok('…it fires at most once', /let done = false;/.test(nudge) && /done = true;/.test(nudge));
    ok('‼️ …and it may not wait for ever: an engine that never announces itself would leave '
        + 'the night shift stopped in the one way nothing reports',
        /grace = setTimeout\(\(\) => \{ if \(!done\) \{ fire\(sub, 'grace'\); \} \}, 30_000\);/.test(nudge));
    ok('…the grace timer is cleared when the nudge goes, and on dispose',
        /clearTimeout\(grace\)/.test(nudge));
    ok('…a seat that ended or errored on the way back is left alone, not spoken to',
        /status === 'ended' \|\| st\.status === 'error'/.test(nudge));
    ok('…and it lets go of its subscription either way — on the nudge and on a dead seat',
        (nudge.match(/sub\.dispose\(\);/g) || []).length >= 2);

    // ‼️ THE SCOPE. This is the assertion that stops a future edit from nudging
    // every revived seat, which would start spending on conversations that were
    // waiting for the user. ‼️ X-349 moved the decision into `reviveSpeech` —
    // whose own tests below pin all four combinations — so what is pinned here
    // is that the wiring ASKS it and does not hold a second opinion.
    ok('‼️ the wiring speaks only what the core decided, and never re-tests midTurn itself',
        /const speech = reviveSpeech\(\{ midTurn: row\.midTurn, itAsked \}\);/.test(extTs)
        && /if \(speech\.nudge\) \{ nudgeRevived\(seatId, speech\.nudge\); \}/.test(extTs)
        && !/row\.midTurn && itAsked/.test(extTs));
    ok('‼️ X-349: …and a seat left silent is SETTLED instead, or it says `starting` for ever',
        /else \{ consoleHost\.settleRevived\(seatId\); \}/.test(extTs));

    // ‼️ X-310 — AND THE OTHER HALF OF THE SCOPE, which is the one that was
    // measured going wrong. Being mid-turn says a turn was CUT, not that this
    // seat wanted it cut: on 2026-09-15 a session that had asked for nothing was
    // taken down mid file-write and then handed the same "carry on from where
    // you were", and it woke up and acted on guesses about a conversation whose
    // last exchange had been destroyed under it.
    ok('‼️ X-310: the asker is read off the STAMP, so it survives the death it is about',
        /askedBy\?: string;/.test(extTs)
        && /const askedBy = String\(stamp\?\.askedBy \?\? ''\)\.trim\(\);/.test(extTs)
        && /const itAsked = !!askedBy && row\.sessionId === askedBy;/.test(extTs));
    ok('‼️ …and it is matched on the ENGINE session id, never the seat id a restart does not survive',
        /row\.sessionId === askedBy/.test(extTs) && !/row\.id === askedBy/.test(extTs));
    const { REVIVE_HELD } = require(path.join(__dirname, '..', 'out', 'core', 'consoleRevive.js'));
    ok('‼️ …and a seat cut without asking is TOLD it is being left alone, not left silent',
        reviveSpeech({ midTurn: true, itAsked: false }).note === REVIVE_HELD);
    ok('…and that sentence says all three things the reader needs: what was lost, that nothing '
        + 'was said into it, and that it is now theirs',
        /lost on the way/.test(REVIVE_HELD)
        && /did not ask for the restart/.test(REVIVE_HELD)
        && /nothing has been said into it/.test(REVIVE_HELD)
        && /waiting for you/.test(REVIVE_HELD));

    // And the sentence the reader sees no longer tells them to do it by hand.
    ok('…and the card no longer says "ask again" while the farm is asking for them',
        !/ask again, nothing before it is missing/.test(extTs)
        && /asked to carry on from where it was/.test(REVIVE_ASKED_MIDTURN));

    const { REVIVE_NUDGE } = require(path.join(__dirname, '..', 'out', 'core', 'consoleRevive.js'));
    ok('the nudge names what was lost and what was not',
        /lost on the way/.test(REVIVE_NUDGE) && /nothing before it is missing/.test(REVIVE_NUDGE));
    ok('‼️ …and it tells a model that cannot tell where it was to SAY SO rather than invent work',
        /say so and stop/.test(REVIVE_NUDGE) && /do not guess/.test(REVIVE_NUDGE));
}

// ---- audit B-03.3: THE SWAP IS ONLY REACHABLE IF THE SUBSCRIPTION IS EARLIER ----
//
// ‼️ EVERY TEST ABOVE MEASURES THE SWAP; NONE MEASURES WHETHER IT CAN EVER BE
// CALLED. The scrollback is put in by an `index.onDidUpdate` handler that
// `reviveAfterRestart()` registers — and the event it waits for is fired ONCE,
// at the end of `index.scanAll()`. `activate()` starts that scan thousands of
// lines before it revives, so the whole thing rests on one unwritten fact: no
// `await` sits between them. Add one — a single top-level `await` anywhere in
// that stretch — and the scan's completion runs in the gap, fires into nobody,
// and every revived card keeps its "not in the index yet" placeholder for ever.
// That is the ORIGINAL bug back, with every test in this file still green.
//
// ‼️ X-266 MOVED THE WINDOW, NOT THE RULE. The revive now WAITS (a survivor is
// killed and its registry record watched) — so the invariant is no longer "no
// await between the scan and the call", it is "no await between READING the
// index and SUBSCRIBING to it": the waiting is phase one, and phase two runs
// from its first `index.byId` to `index.onDidUpdate` synchronously. If the scan
// finishes during phase one, phase two reads a full index and subscribes for
// nothing; if it finishes after, the subscription is already there. Either way
// nobody is left holding a placeholder.
//
// So the ordering is pinned here, where the reason for it is written down.
{
    const extTs = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const scanAt = extTs.indexOf('void index.scanAll().then(');
    const reviveAt = extTs.indexOf('\n    void reviveAfterRestart();');

    ok('‼️ both ends of the window are findable — a renamed end must fail here, not go quiet',
        scanAt >= 0 && reviveAt >= 0);
    ok('‼️ the scan is started BEFORE the revive is called',
        scanAt < reviveAt);

    const between = extTs.slice(scanAt, reviveAt);
    const awaits = between.split(/\r?\n/).filter(l => /^    await\b/.test(l));
    ok('‼️ …and NOTHING AWAITS at the top level in between, or the scan finishes before anyone is listening '
        + `and every revived card stays empty (found: ${awaits.length})`,
        awaits.length === 0);

    // ‼️ X-266 — and inside the revive, phase two is synchronous from the first
    // read of the index to the subscription on it.
    const bodyAt = extTs.indexOf('const reviveAfterRestart = async (): Promise<void> => {');
    const body = extTs.slice(bodyAt, reviveAt);
    const readAt = body.indexOf('index.byId(row.sessionId)');
    const subAt = body.indexOf('index.onDidUpdate(');
    ok('‼️ X-266: the index is read, then subscribed to', readAt > 0 && subAt > readAt);
    const phaseTwoAwaits = body.slice(readAt, subAt).split(/\r?\n/).filter(l => /\bawait\b/.test(l));
    ok('‼️ X-266: NOTHING AWAITS between reading the index and subscribing to it '
        + `(found: ${phaseTwoAwaits.length})`, phaseTwoAwaits.length === 0);
    const lastAwait = body.lastIndexOf('await ');
    ok('‼️ X-266: every await in the revive comes BEFORE the first read of the index (phase one, then phase two)',
        lastAwait > 0 && lastAwait < readAt);

    ok('…and the revive really is what subscribes — the swap has no other caller',
        /index\.onDidUpdate\(\(\) => \{[\s\S]{0,600}rebuildHistory/.test(extTs));
    ok('…and it lets go of itself, so a window is not left holding a dead subscription',
        /if \(!pendingHistory\.length && !pendingCarried\.length\) \{ sub\.dispose\(\); \}/.test(extTs));
}

// ---------------------------------------------------------------------------
// ‼️ WHAT THE CONVERSATION HAD ALREADY SPENT, which the revive used to leave
// behind — the same measured fact as the scrollback retry above: inside
// `activate()` the transcript index has answered NOTHING yet, so `carried` was
// always `undefined` and the card came back counting from zero.
//
// ‼️ AND THE HALF THAT WAS TAKEN BACK OUT, written down so nobody adds it
// again the same way. Reopening the Console PAGE from the revive gives the
// reader TWO pages — measured on the user's screen: VS Code leaves the old
// webview tab where it is (there is no serializer to re-attach it) and a page
// opened by us is a second one beside it. The tab is VS Code's to restore, so
// the only honest way in is a `WebviewPanelSerializer` that adopts the tab
// that is already there. Until that exists, the revive brings the conversation
// back and the page stays the reader's to open.
// ---------------------------------------------------------------------------
{
    const extTs = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');

    ok('‼️ the totals are waited for exactly like the scrollback is',
        /pendingCarried = pendingCarried\.filter\(p => \{[\s\S]{0,400}applyCarried/.test(extTs));
    ok('…the wait starts when EITHER half is missing, not only the scrollback',
        /if \(pendingHistory\.length \|\| pendingCarried\.length\) \{/.test(extTs));
    ok('…and it lets go only when BOTH are done — a half-done wait is a leak',
        /if \(!pendingHistory\.length && !pendingCarried\.length\) \{ sub\.dispose\(\); \}/.test(extTs));
    ok('…the baseline is read off the same index row the resume list reads',
        /const past = index\.byId\(p\.sessionId\);[\s\S]{0,200}carriedTotals\(past\)/.test(extTs));

    // ‼️ THE WITHDRAWN HALF, pinned as an absence. Two of these three would
    // have to change together for the page to be restored honestly, and a
    // serializer arriving on its own — or a `show` call from the revive on its
    // own — is the two-tab bug coming back.
    ok('‼️ no page is opened from the revive — the old tab is still on screen',
        !/reopenConsoleSeat/.test(extTs));
    ok('…and nothing records whether it was open, because nothing acts on it',
        !/consoleOpen/.test(extTs));
    ok('…and there is still no webview serializer, which is WHY the tab cannot be re-attached; whoever adds one owns that tab and must not open a second',
        !/registerWebviewPanelSerializer/.test(extTs));
}

// ---------- ‼️ X-266 — the survivor is reclaimed BEFORE the row is started ----------
//
// The reload kills the host and not the `claude -p` under it. Starting the same
// id beside the survivor was measured twice (two agents on one repo; a card
// frozen in `starting` behind a lock it never got). So the wiring is pinned:
// every row asks `reclaim` first, a row that cannot be reclaimed is reported
// with the pid and never started, and every reader of the CLI's registry asks
// EVERY claude home — the twin sat under an account slot while `~/.claude`
// answered "nobody".
{
    const extTs = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const at = extTs.indexOf('const reviveAfterRestart = async (): Promise<void> => {');
    ok('‼️ X-266: reviveAfterRestart is asynchronous — taskkill takes seconds and the record is watched, not assumed', at > 0);
    const body = extTs.slice(at, extTs.indexOf('void reviveAfterRestart();', at));
    const reclaimAt = body.indexOf('const held = await consoleHost.reclaim(row.sessionId);');
    const startAt = body.indexOf('const seatId = consoleHost.start({');
    ok('‼️ X-266: each row is reclaimed BEFORE it is started', reclaimAt > 0 && startAt > reclaimAt);
    ok('‼️ X-266: a holder that will not go is reported as lost with its pid, and the row is skipped',
        /if \(!held\.free\) \{[\s\S]*?lost\.push\(\{[\s\S]*?pid \$\{held\.pid\}[\s\S]*?continue;/.test(body.slice(reclaimAt, startAt)));
    ok('‼️ X-266: a session open in a PERSON\'S terminal is never reclaimed — refused before the kill, by the registry\'s own entrypoint',
        body.indexOf("owner.entrypoint !== 'sdk-cli'") > 0 && body.indexOf("owner.entrypoint !== 'sdk-cli'") < reclaimAt
        && /describeOwner\(owner\)/.test(body.slice(0, reclaimAt)));
    ok('…and a card whose survivor was ended says so in its first line',
        /survivor[\s\S]*?was ended/.test(body));
    ok('‼️ X-266: the stamp is read and cleared before the first await (a second activation finds no plan)',
        body.indexOf('clearRestartRevive();') < reclaimAt);
    ok('X-266: the call site does not wait on it — activation is not held for a taskkill',
        /^\s*void reviveAfterRestart\(\);$/m.test(extTs));

    // every registry reader goes through the one door
    ok('‼️ X-266: no reader asks a single claude home any more',
        !/readCliSessions\(claudeDir\(\)\)/.test(extTs) && !/existsSync\(sessionsDir\(claudeDir\(\)\)\)/.test(extTs));
    ok('…the door lists the home, the window\'s own CLAUDE_CONFIG_DIR and every claude slot',
        /const cliRegistryDirs = \(\): string\[\] => \{[\s\S]*?claudeDir\(\), process\.env\.CLAUDE_CONFIG_DIR[\s\S]*?s\.engine === 'claude' && s\.dir/.test(extTs));
    ok('…and the ConsoleHost is handed that door for its owner lookup',
        /new ConsoleHost\(\s*\(\) => 'claude',\s*sid => ownerOf\(liveCliSessions\(\), sid\)\?\.pid/.test(extTs));
    ok('‼️ X-266: farm.health reports the twin state off the registry (Principle 1 — a rule that fails silently is not a rule)',
        /twins: twinsOf\(liveCliSessions\(\)\)/.test(extTs));
}

// ---- X-349: THE NUDGE THAT NEVER WENT OUT ON THE PATH AGENTS ACTUALLY USE ----
//
// ‼️ `row.midTurn && itAsked` reads like two halves of one rule and is not.
// `midTurn` says a reply was destroyed; `itAsked` says this seat consented. The
// AND was satisfiable only on the `now` path, where the restart fires inside the
// asking turn. On the `armed` path it waits for somebody ELSE's turn to end, and
// by the time it fires the asker is between turns — so the nudge was never sent,
// not once, and the contract that "your last words are the resumed copy's
// instruction" was broken on the path the fleet is built around.
//
// Measured 2026-09-21: a restart armed behind another console fired eight
// minutes later, both copies came back on `--resume`, and the session that had
// asked for it sat silent for thirteen minutes until a human typed into it.
{
    const asked = reviveSpeech({ midTurn: false, itAsked: true });
    ok('‼️ X-349: the seat that ASKED is nudged between turns — the request is the consent',
        asked.nudge === REVIVE_NUDGE_IDLE && asked.note === REVIVE_ASKED_IDLE);
    ok('‼️ …and it is told the truth about the gap: nothing was lost, so nothing is claimed lost',
        /nothing was lost/.test(REVIVE_NUDGE_IDLE) && !/reply you were writing/.test(REVIVE_NUDGE_IDLE)
        && /no reply was lost/.test(REVIVE_ASKED_IDLE));
    ok('‼️ …and it still refuses to let a model invent where it was',
        /say so and stop/.test(REVIVE_NUDGE_IDLE) && /do not guess/.test(REVIVE_NUDGE_IDLE));

    const askedMid = reviveSpeech({ midTurn: true, itAsked: true });
    ok('a cut asker keeps the sentence it always had', askedMid.note === REVIVE_ASKED_MIDTURN);
    ok('…and a different nudge from the idle one, because a reply really was lost',
        askedMid.nudge && askedMid.nudge !== REVIVE_NUDGE_IDLE && /lost on the way/.test(askedMid.nudge));

    // ‼️ THE HALF THAT MUST NOT MOVE. X-310 exists because a session that
    // consented to nothing was handed "carry on" and acted on guesses.
    ok('‼️ X-310 HOLDS: a seat that did not ask is never spoken into, cut or not',
        reviveSpeech({ midTurn: true, itAsked: false }).nudge === null
        && reviveSpeech({ midTurn: false, itAsked: false }).nudge === null);
    ok('…and an untouched idle bystander is not given a notice about a reply it never lost',
        reviveSpeech({ midTurn: false, itAsked: false }).note === '');
}

// ---- X-349: AND A REVIVED CARD NOBODY SPEAKS INTO STOPS SAYING `starting` ----
//
// The persistent CLI emits `system:init` on its first TURN, not on boot, so a
// seat deliberately left alone never leaves `starting`. Measured: two cards held
// it for thirteen minutes. That is not cosmetic — `starting` is in
// SESSION_IN_FLIGHT (selfRestart.ts), so a silent revived card blocks every
// LATER restart: the fleet's own door held shut by a session doing nothing.
{
    ok('a registered process settles the card', settleVerdict({
        status: 'starting', registered: true, triesLeft: 5
    }) === 'settle');
    ok('…and until the registry says the process is up, nothing is claimed', settleVerdict({
        status: 'starting', registered: false, triesLeft: 5
    }) === 'wait');
    ok('‼️ …and it gives up rather than waiting for ever — a process that never registers is a '
        + 'failure to report, not a state to invent',
        settleVerdict({ status: 'starting', registered: false, triesLeft: 0 }) === 'stop');
    ok('‼️ a card that spoke for itself is left alone — the watch never overwrites a live status',
        settleVerdict({ status: 'working', registered: true, triesLeft: 5 }) === 'stop'
        && settleVerdict({ status: 'idle', registered: true, triesLeft: 5 }) === 'stop'
        && settleVerdict({ status: 'ended', registered: true, triesLeft: 5 }) === 'stop');
    ok('…and so are an ended card and one that is simply gone',
        settleVerdict({ status: 'starting', closed: true, registered: true, triesLeft: 5 }) === 'stop'
        && settleVerdict({ registered: true, triesLeft: 5 }) === 'stop');

    const hostTs = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'consolehost.ts'), 'utf8');
    const settle = (() => {
        const at = hostTs.indexOf('settleRevived(id: string');
        return at < 0 ? '' : hostTs.slice(at, hostTs.indexOf('\n    }', at));
    })();
    ok('the loop is findable — a renamed one must fail here rather than go quiet', settle.length > 200);
    ok('‼️ the ONLY source consulted is the CLI\'s own registry, through the same door the reclaim uses',
        /this\.ownerPid\(sessionId\)/.test(settle) && /settleVerdict\(/.test(settle));
    ok('‼️ …and only a persistent engine with a session id is watched at all',
        /h\.engine\.shape !== 'persistent' \|\| !sessionId/.test(settle));
    ok('…the settled card says WHY its idle is an idle the engine has not confirmed',
        /revivedWaiting: true/.test(settle));
    ok('‼️ …and the watch lets go of its timer on every verdict but `wait`',
        /clearInterval\(timer\)/.test(settle) && /this\.settleTimers\.delete\(timer\)/.test(settle));
    ok('‼️ …and the window closing takes every outstanding watch with it',
        /for \(const t of this\.settleTimers\) \{ clearInterval\(t\); \}/.test(hostTs));

    // ‼️ AND THE FLAG IS CLEARED THE MOMENT IT STOPS BEING TRUE, or a card that
    // has been talking for an hour still claims nobody has spoken into it.
    const protoTs = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'consoleproto.ts'), 'utf8');
    ok('‼️ the engine\'s own init clears it — that is the moment `idle` means what it means elsewhere',
        /status: state\.status === 'starting' \? 'idle' : state\.status,[\s\S]{0,220}revivedWaiting: undefined/
            .test(protoTs));

    const extTs = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('‼️ …and farm.health counts them, because they are deliberately NOT blockers any more '
        + '(Principle 1 — a rule that fails silently is not a rule)',
        /revived: consoleHost\.list\(\)\s*\.filter\(s => s\.revivedWaiting\)/.test(extTs));
}

// ---- X-349: THE ARMED ANSWER SAYS WHAT WILL HAPPEN TO THE CALLER'S OWN SEAT ----
//
// `armed` means the restart fires later, out of the caller's hands. Whether its
// last words are an instruction to its resumed self or are simply lost is the
// one fact that changes what it should write next — and it was not in the
// answer at all, which is how a session came to write its verification steps
// after a restart that had already eaten them.
{
    const plan = planRevive([
        { id: 'cs4', agentId: 'dev', agentName: 'developer', cwd: 'D:/r', status: 'idle', sessionId: 'S-ASK' },
        { id: 'cs5', agentId: 'ops', agentName: 'ops', cwd: 'D:/r', status: 'working', sessionId: 'S-OTHER' },
        { id: 'cs6', agentId: 'new', agentName: 'newborn', cwd: 'D:/r', status: 'idle' }
    ]);

    const mine = reviveIntent({ plan, askedBy: 'S-ASK', resume: true });
    ok('‼️ the asker is told its seat comes back AND is spoken into', mine.nudge === true && mine.seat === 'cs4');
    ok('‼️ …and told that its LAST words are the instruction, which is the whole point of saying so',
        /LAST thing you say/.test(mine.note) && /developer/.test(mine.note));

    const noResume = reviveIntent({ plan, askedBy: 'S-ASK', resume: false });
    ok('‼️ a restart without `resume` says plainly that nothing comes back',
        noResume.nudge === false && /goes down with the host/.test(noResume.note));

    const anon = reviveIntent({ plan, askedBy: '', resume: true });
    ok('a door with no session behind it is told every card comes back silent',
        anon.nudge === false && /held and silent/.test(anon.note));

    const elsewhere = reviveIntent({ plan, askedBy: 'S-TERMINAL', resume: true });
    ok('‼️ a caller that is not a Console card is told there is nothing to revive it into, '
        + 'rather than being promised a nudge it will never get',
        elsewhere.nudge === false && /not a live Console card/.test(elsewhere.note));

    const unnamed = reviveIntent({ plan, askedBy: 'cs6', resume: true });
    ok('…and a seat the engine never named carries its own skip reason into the answer',
        unnamed.nudge === false && /nothing to resume it by/.test(unnamed.note));

    const extTs = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('‼️ the op answers it on EVERY decision, off the same plan it already built',
        /const revive = resume \? planRevive\(consoleHost\.list\(\)\) : undefined;/.test(extTs)
        && /reviveIntent: reviveIntent\(\{ plan: revive, askedBy, resume \}\)/.test(extTs));
}

console.log(`test_console_revive.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
