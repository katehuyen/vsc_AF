// X-243 — THE STATUS BAR FOLLOWS THE CONVERSATION ON SCREEN.
//
// `activeAccounts` answers who the NEXT session runs as. The card in front of
// the reader may already be running as somebody else, and then the standing
// account's percentages are a correct figure about the wrong sign-in — the
// X-212 argument, one surface further along.
//
// What is pinned here is the claim, drawn through the REAL PlanUsageBar rather
// than matched in its source: the strip names the sign-in only while it has
// left the standing one (a name that is always there is a constant, U-40), the
// panel says what it is following before it says any figure, and the two doors
// that would act on the WRONG account while it is following — Check now, which
// spends a request against the machine's own credentials, and the engine picker
// — are not offered at all.
'use strict';
const path = require('path');
const Module = require('module');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- the smallest vscode this file needs ----------
const disposable = () => ({ dispose() { } });
const vscodeStub = {
    StatusBarAlignment: { Left: 1, Right: 2 },
    ThemeColor: class { constructor(id) { this.id = id; } },
    MarkdownString: class {
        constructor(v) { this.value = v || ''; this.isTrusted = false; this.supportHtml = false; }
    },
    EventEmitter: class { constructor() { this.event = () => disposable(); } fire() { } },
    window: {
        createStatusBarItem: () => ({
            text: '', tooltip: undefined, command: undefined, backgroundColor: undefined,
            shown: false, show() { this.shown = true; }, hide() { this.shown = false; },
            dispose() { }
        })
    },
    commands: { registerCommand: () => disposable(), executeCommand: async () => undefined }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { PlanUsageBar } = require(path.join(__dirname, '..', 'out', 'views', 'planUsageBar.js'));
const { engineUsageFromSlot } = require(path.join(__dirname, '..', 'out', 'core', 'accountUsage.js'));
Module._load = origLoad;

const NOW = Date.UTC(2026, 8, 19, 12, 0, 0);
const bar = (percent, resetsAt) => ({
    id: 'five_hour', title: 'Current session (all models)', percent, resetsAt
});
const claudeRow = {
    id: 'claude', label: 'Claude Code', state: 'ok', plan: 'max20x',
    bars: [bar(20, NOW + 90 * 60000)], fetchedAt: NOW, note: 'the standing note'
};
/** The watched account is nearly full — the whole reason to look at it. */
const watchedRow = {
    id: 'claude', label: 'Claude Code', state: 'ok', plan: 'pro',
    bars: [bar(97, NOW + 21 * 60000)], fetchedAt: NOW, note: 'read off the slot'
};

const service = {
    current: () => ({ state: 'ok', bars: [bar(20, NOW + 90 * 60000)], plan: 'max20x', fetchedAt: NOW }),
    rateLimitedUntil: () => 0,
    get: async () => undefined,
    readOnEdge: async () => undefined,
    // X-240 — the bar asks this before a turn-boundary read, so a stand-in that
    // lacks it throws the moment `fleetChanged` is called.
    edgeVerdict: () => ({ ok: true, why: 'ok', readyAt: 0, heldUntil: 0 })
};

let watched;
const make = () => new PlanUsageBar({
    service,
    enabled: () => true,
    beatMs: () => 0,
    active: () => false,
    warnAt: () => 80,
    dangerAt: () => 95,
    engines: () => [claudeRow, { ...claudeRow, id: 'codex', label: 'Codex' }],
    engine: () => 'claude',
    accountLabel: () => 'standing-one',
    watched: () => watched
});
/** The item as the reader sees it, plus the panel's markdown. */
const read = () => {
    const b = make();
    b.paint();
    const item = b.item ?? b._item;
    const out = { text: item.text, tip: String(item.tooltip?.value ?? ''), colour: item.backgroundColor };
    b.dispose();
    return out;
};

// ---------- nothing watched: the bar it always was ----------
{
    watched = undefined;
    const r = read();
    ok('the strip carries the figures and no name at all', /^\$\(dashboard\) /.test(r.text)
        && / 20%/.test(r.text) && !/standing-one/.test(r.text));
    ok('…because the owner is a constant there, and the panel names it',
        /Claude Code \(standing-one\)/.test(r.tip));
    ok('…and the two doors are the ones it has always had',
        /command:agentfarm\.planUsageRefresh/.test(r.tip)
        && /command:agentfarm\.setUsageEngine/.test(r.tip));
    ok('a panel with nothing being followed says nothing about following',
        !/Following the Console/.test(r.tip));
}

// ---------- following a conversation ----------
{
    watched = {
        usage: watchedRow, label: 'murvietnam',
        why: 'Following the Console — the conversation on screen runs as murvietnam, '
            + 'not the standing account.'
    };
    const r = read();
    ok('‼️ THE SIGN-IN IS ON THE STRIP the moment the bar leaves the standing one',
        /^\$\(dashboard\) murvietnam · /.test(r.text));
    ok('…and the figures are that account\'s, not the standing one\'s',
        / 97%/.test(r.text) && !/ 20%/.test(r.text));
    ok('…so the colour is that account\'s too', !!r.colour && /error/.test(r.colour.id));
    ok('the panel names the watched sign-in in its heading',
        /Claude Code \(murvietnam\)/.test(r.tip) && !/standing-one/.test(r.tip));
    ok('‼️ …and says WHAT IT IS FOLLOWING BEFORE ANY FIGURE',
        r.tip.indexOf('Following the Console') > -1
        && r.tip.indexOf('Following the Console') < r.tip.indexOf('97%'));
    ok('the figures come from the watched row, never from the machine snapshot',
        /97%/.test(r.tip) && !/\b20%/.test(r.tip));
    // ‼️ `Check now` spends a request against the MACHINE's credentials, so
    // under somebody else's name it refreshes a figure that is not on screen;
    // the engine picker would switch an axis this paint is not using.
    ok('‼️ NEITHER DOOR THAT WOULD ACT ON THE WRONG ACCOUNT IS OFFERED',
        !/planUsageRefresh/.test(r.tip) && !/setUsageEngine/.test(r.tip));
    ok('…and the one door that CAN act on this account is',
        /command:agentfarm\.openAccounts/.test(r.tip));
    ok('…and the panel says how the bar comes back', /goes back/.test(r.tip));
}

// ---------- a watched sign-in nobody has read ----------
{
    // ‼️ AN UNREAD ACCOUNT AND AN EMPTY ONE MUST NOT DRAW THE SAME THING. A
    // blank percentage here reads as 0% — which is the one figure that would
    // send somebody to start a long turn on the account that is about to stop.
    watched = {
        usage: engineUsageFromSlot(undefined, 'claude', 'Claude Code', 'not read yet'),
        label: 'spare', why: 'Following the Console.'
    };
    const r = read();
    ok('‼️ AN UNREAD WATCHED ACCOUNT IS NEVER DRAWN AS 0%',
        /murvietnam|0%/.test(r.text) === false && /spare · /.test(r.text));
    ok('…it says the figure is unknown, in the strip\'s own shorthand',
        /usage \?/.test(r.text));
    ok('…and it is not coloured as if it were empty', r.colour === undefined);
    ok('…and the panel carries the reason rather than a blank', /not read yet/.test(r.tip));
}

// ---------- the conversion the watched row is built by ----------
{
    const u = {
        slotId: 'claude-spare', engine: 'claude', state: 'ok', percent: 91,
        resetsAt: NOW + 37 * 60000, plan: 'pro', fetchedAt: NOW,
        bars: [
            { id: 'five_hour', window: 'five-hour window', short: '5h', percent: 91, resetsAt: NOW + 37 * 60000 },
            { id: 'seven_day', window: 'Current week (all models)', short: 'wk', percent: 64, resetsAt: NOW + 4 * 86400000 }
        ]
    };
    const e = engineUsageFromSlot(u, 'claude', 'Claude Code');
    ok('every window survives the conversion, each naming itself',
        e.state === 'ok' && e.bars.length === 2
        && e.bars[0].title === 'five-hour window' && e.bars[1].percent === 64);
    ok('…with the plan and the reading time', e.plan === 'pro' && e.fetchedAt === NOW);
    // ‼️ An engine that publishes nothing is not a failed read: telling the
    // reader to retry a source that does not exist is the wrong sentence.
    const none = engineUsageFromSlot(
        { ...u, state: 'no-source', bars: [], note: 'publishes nothing' }, 'antigravity', 'Antigravity');
    ok('‼️ "PUBLISHES NOTHING" IS NOT "COULD NOT BE READ"',
        none.state === 'not-published' && none.bars.length === 0 && none.note === 'publishes nothing');
    const unread = engineUsageFromSlot(undefined, 'claude', 'Claude Code', 'fallback');
    ok('a slot with no reading at all is unknown, and says the caller\'s reason',
        unread.state === 'unknown' && unread.bars.length === 0 && unread.note === 'fallback');
    // A reading whose bars are empty is not `ok`: `ok` with no bars draws a
    // strip with nothing in it, which is how a blank came to look like a zero.
    ok('a reading with no bars left in it is not called ok',
        engineUsageFromSlot({ ...u, bars: [] }, 'claude', 'Claude Code').state === 'unknown');
}

console.log(`test_status_bar_account: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
