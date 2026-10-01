// S-109 — A REOPENED SESSION OPENS WITH THE SETUP IT CLOSED WITH.
//
// ‼️ WHAT THIS PINS. The four answers (model, effort, permission mode, account)
// are observed by the card into a durable per-session record, read off the
// transcript's tail with the time of each line, and ordered by ONE function.
// The regression table at the bottom is the promise to everything that works
// today: a session with no card record resolves exactly as the hand-written
// S-45/S-102 door expressions did.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const C = require(path.join(ROOT, 'out', 'core', 'closingSetup.js'));
const St = require(path.join(ROOT, 'out', 'core', 'closingSetupStore.js'));
const R = require(path.join(ROOT, 'out', 'launch', 'reopen.js'));

// ---------- the card's observations ----------
{
    eq('no session id yet → nothing to record', C.observeCard(undefined, { model: 'opus' }, 1), null);
    const a = C.observeCard(undefined, { sessionId: 's1', engine: 'claude', model: 'opus', effort: 'medium', permissionMode: 'default', account: 'acc1' }, 100);
    eq('first sight records every stated answer', Object.keys(a.dims).sort(), ['account', 'effort', 'model', 'permissionMode']);
    eq('…stamped with the time and the card', a.dims.effort, { value: 'medium', at: 100, from: 'card' });
    eq('the same state again writes nothing', C.observeCard(a, { sessionId: 's1', engine: 'claude', model: 'opus', effort: 'medium', permissionMode: 'default', account: 'acc1' }, 200), null);
    const b = C.observeCard(a, { sessionId: 's1', engine: 'claude', model: 'opus', effort: 'xhigh', permissionMode: 'default', account: 'acc1' }, 300);
    eq('a changed effort is re-stamped', b.dims.effort, { value: 'xhigh', at: 300, from: 'card' });
    eq('…and the untouched model keeps its time', b.dims.model.at, 100);
    const c = C.observeCard(b, { sessionId: 's1', engine: 'claude', model: '', effort: '', permissionMode: 'default' }, 400);
    eq('an empty box never erases what ran', c, null);
}

// ---------- the transcript's tail ----------
const T = (iso) => Date.parse(iso);
const lines = [
    '{"type":"user","timestamp":"2026-10-01T10:00:00Z","permissionMode":"default","message":{"role":"user"}}',
    '{"type":"assistant","timestamp":"2026-10-01T10:01:00Z","effort":"medium","message":{"model":"claude-sonnet-5"}}',
    '{"type":"user","timestamp":"2026-10-01T10:02:00Z","permissionMode":"bypassPermissions","message":{"role":"user"}}',
    '{"type":"assistant","timestamp":"2026-10-01T10:03:00Z","effort":"xhigh","message":{"model":"claude-opus-5-5"}}',
    '{"type":"assistant","timestamp":"2026-10-01T10:04:00Z","message":{"model":"<synthetic>"}}',
    '{"type":"user","timestamp":"2026-10-01T10:05:00Z","message":{"role":"user","content":[{"type":"tool_result"}]}}'
];
{
    const got = C.transcriptSetup(lines.join('\n'));
    eq('the last real model, never <synthetic>', got.model, { value: 'claude-opus-5-5', at: T('2026-10-01T10:03:00Z'), from: 'transcript' });
    eq('the last effort, on the assistant line', got.effort.value, 'xhigh');
    eq('the mode from the user prompt line (the index never read it)', got.permissionMode, { value: 'bypassPermissions', at: T('2026-10-01T10:02:00Z'), from: 'transcript' });
    const withRecord = lines.concat([
        '{"type":"permission-mode","permissionMode":"plan"}',
        '{"type":"system","timestamp":"2026-10-01T10:06:00Z"}'
    ]);
    const g2 = C.transcriptSetup(withRecord.join('\n'));
    eq('a permission-mode record with no stamp takes the next stamped line', g2.permissionMode, { value: 'plan', at: T('2026-10-01T10:06:00Z'), from: 'transcript' });
    eq('a cut first line is skipped, not fatal', C.transcriptSetup('ype":"assistant"}\n' + lines[3]).effort.value, 'xhigh');
}

// ---------- newest per dimension ----------
{
    const card = { effort: { value: 'xhigh', at: 500, from: 'card' }, model: { value: 'opus', at: 100, from: 'card' } };
    const tr = { effort: { value: 'medium', at: 400, from: 'transcript' }, model: { value: 'claude-opus-5-5', at: 300, from: 'transcript' } };
    const n = C.newestOf(card, tr);
    eq('card set after the last line wins the effort', n.effort.value, 'xhigh');
    eq('a CLI-side /model after the card wins the model', n.model.value, 'claude-opus-5-5');
    eq('a tie goes to the card', C.newestOf({ effort: { value: 'a', at: 1, from: 'card' } }, { effort: { value: 'b', at: 1, from: 'transcript' } }).effort.value, 'a');
}

// ---------- the one order ----------
{
    const r = C.resolveReopen({
        explicit: { account: 'moved' },
        closing: { account: { value: 'cardAcc', at: 1, from: 'card' } },
        sessionAccount: 'launchAcc'
    });
    eq('an account move states its slot and wins', [r.account, r.from.account], ['moved', 'explicit']);
    const r2 = C.resolveReopen({ closing: { account: { value: 'cardAcc', at: 1, from: 'card' } }, sessionAccount: 'launchAcc' });
    eq('…else the card\'s last account (the manifest is stale after a move)', r2.account, 'cardAcc');
    eq('…else the session\'s own', C.resolveReopen({ sessionAccount: 'launchAcc' }).account, 'launchAcc');
    eq('nothing anywhere → nothing invented', C.resolveReopen({}), { from: {} });
}

// ---------- REGRESSION: no card record = the S-45/S-102 door expression ----------
{
    const legacy = (inherit, asked, own, d, sameEngine) => ({
        model: inherit.model || asked.model || own.model || (sameEngine ? d.model : undefined),
        effort: inherit.effort || asked.effort || own.effort || (sameEngine ? d.effort : undefined),
        permissionMode: inherit.permissionMode || asked.permissionMode || d.permissionMode
    });
    const opts = [undefined, 'x'];
    let cases = 0, same = 0;
    for (const im of opts) for (const am of [undefined, 'y']) for (const om of [undefined, 'z']) for (const ie of opts) for (const ae of [undefined, 'high'])
        for (const ip of [undefined, 'plan']) for (const ap of [undefined, 'acceptEdits']) for (const sameEngine of [true, false]) {
            const inherit = { model: im, effort: ie, permissionMode: ip };
            const asked = { model: am, effort: ae, permissionMode: ap };
            const own = { model: om, effort: 'low' };
            const d = { engine: sameEngine ? 'claude' : 'codex', model: 'fleetM', effort: 'fleetE', permissionMode: 'default' };
            const want = legacy(inherit, asked, own, d, sameEngine);
            const deps = {
                closing: () => undefined,
                transcript: () => ({}),
                indexed: () => inherit,
                requested: () => asked,
                sessionAccount: () => undefined,
                agentDefaults: () => own,
                fleet: () => d,
                narrow: (_e, m, e) => ({ model: m, effort: e })
            };
            const got = R.reopenSetupFor(deps, { sessionId: 's', engine: 'claude' });
            cases++;
            if (got.model === want.model && got.effort === want.effort && got.permissionMode === want.permissionMode) { same++; }
            else if (cases - same < 3) { console.log('  differs', JSON.stringify({ inherit, asked, sameEngine, want, got })); }
        }
    eq(`every one of ${cases} layer combinations resolves as the old doors did`, same, cases);
}

// ---------- the door's call, with a card record ----------
{
    const deps = {
        closing: () => ({ sessionId: 's', engine: 'codex', dims: { effort: { value: 'xhigh', at: 50, from: 'card' } } }),
        transcript: () => ({}),
        indexed: () => ({ model: 'gpt-5.5' }),
        requested: () => ({ model: 'gpt-5.5', effort: 'medium' }),
        sessionAccount: () => 'a1',
        agentDefaults: () => ({}),
        fleet: () => ({ engine: 'claude', model: 'opus', effort: 'high', permissionMode: 'default' }),
        narrow: (_e, m, e) => ({ model: m, effort: e === 'bogus' ? undefined : e })
    };
    const got = R.reopenSetupFor(deps, { sessionId: 's', engine: 'codex' });
    eq('Codex: the transcript has no effort, the card\'s record carries it', [got.effort, got.from.effort], ['xhigh', 'card']);
    eq('…the model from the index, not the launch', got.model, 'gpt-5.5');
    eq('…the fleet\'s model never crosses engines', got.from.model, 'transcript');
    eq('…the account is the session\'s own', got.account, 'a1');
    const narrowed = R.reopenSetupFor({ ...deps, closing: () => ({ sessionId: 's', dims: { effort: { value: 'bogus', at: 9, from: 'card' } } }) }, { sessionId: 's', engine: 'codex' });
    eq('an effort the catalogue no longer offers is dropped, not passed', narrowed.effort, undefined);
}

// ---------- a baton leg opens on what its predecessor CLOSED with ----------
{
    // the measured case: head launched at medium, raised to xhigh on its card
    const baton = {
        id: 'b1', from: { sessionId: 'head', engine: 'claude' }, fault: undefined,
        inherit: { model: 'opus', effort: 'medium', permissionMode: 'default', account: 'acc-head', surface: 'console' }
    };
    const head = C.observeCard(undefined, { sessionId: 'head', model: 'opus', effort: 'medium', permissionMode: 'default', account: 'acc-head' }, 100);
    const raised = C.observeCard(head, { sessionId: 'head', model: 'opus', effort: 'xhigh', permissionMode: 'bypassPermissions', account: 'acc-head' }, 200);
    const r = C.resolveReopen({ closing: raised.dims, launch: { model: 'opus', effort: 'medium', permissionMode: 'default' } });
    const next = R.batonOnClosing(baton, R.sessionOwnOf(r));
    eq('the successor runs at the effort the head CLOSED with', next.inherit.effort, 'xhigh');
    eq('…and its permission mode', next.inherit.permissionMode, 'bypassPermissions');
    eq('the account is not touched — S-106 decides it at the door', next.inherit.account, 'acc-head');
    eq('…nor the surface', next.inherit.surface, 'console');
    eq('the record itself is not mutated', baton.inherit.effort, 'medium');
    const flagged = R.batonOnClosing({ ...baton, fault: 'flagged', inherit: { ...baton.inherit, model: 'sonnet' } }, { model: 'opus', effort: 'xhigh' });
    eq('a flagged pass keeps the model it swapped on purpose', [flagged.inherit.model, flagged.inherit.effort], ['sonnet', 'xhigh']);
    eq('a session that says nothing leaves the launch copy as it was', R.batonOnClosing(baton, {}).inherit, baton.inherit);
}

// ---------- a task continuing its conversation ----------
{
    const back = { model: 'claude-opus-5-5', effort: 'xhigh', permissionMode: 'bypassPermissions', launch: { model: 'opus', effort: 'medium', permissionMode: 'default' } };
    eq('a row that copied the launch takes what the conversation closed with',
        C.closingOverRow({ model: 'opus', effort: 'medium', permissionMode: 'default' }, back), ['model', 'effort', 'permissionMode']);
    eq('a row edited on purpose keeps its edit (an escalation is an explicit answer)',
        C.closingOverRow({ model: 'claude-fable-5-1', effort: 'medium', permissionMode: 'default' }, back), ['effort', 'permissionMode']);
    eq('a row that says nothing takes the closing value',
        C.closingOverRow({}, { effort: 'high' }), ['effort']);
    eq('nothing closed → nothing moves', C.closingOverRow({ effort: 'low' }, { launch: { effort: 'low' } }), []);
}

// ---------- the store survives a reload, and writes only on change ----------
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-s109-'));
try {
    let now = 1000;
    const s1 = new St.ClosingSetupStore(path.join(dir, 'closing-setup'), () => now);
    eq('the first state is written', s1.observe({ sessionId: 'abc', engine: 'claude', model: 'opus', effort: 'medium', permissionMode: 'default' }), true);
    now = 2000;
    eq('the same state is not', s1.observe({ sessionId: 'abc', engine: 'claude', model: 'opus', effort: 'medium', permissionMode: 'default' }), false);
    now = 3000;
    s1.observe({ sessionId: 'abc', engine: 'claude', model: 'opus', effort: 'xhigh', permissionMode: 'default' });
    const s2 = new St.ClosingSetupStore(path.join(dir, 'closing-setup'));
    const back = s2.read('abc');
    eq('a fresh store (a reloaded window) reads the change back', back && back.dims.effort, { value: 'xhigh', at: 3000, from: 'card' });
    eq('no temp file is left behind', fs.readdirSync(path.join(dir, 'closing-setup')), ['abc.json']);
    eq('an unknown session has no record', s2.read('nope'), undefined);

    // the tail first, further back only when a dimension is missing
    const big = path.join(dir, 'big.jsonl');
    const filler = '{"type":"user","timestamp":"2026-10-01T09:00:00Z","message":{"role":"user","content":[{"type":"tool_result","content":"' + 'x'.repeat(2000) + '"}]}}';
    const body = [lines[0], lines[1], lines[2], lines[3]].concat(new Array(600).fill(filler)).join('\n');
    fs.writeFileSync(big, body, 'utf8');
    ok('the fixture is past the first tail window', fs.statSync(big).size > 512 * 1024);
    const got = St.transcriptSetupOf(big);
    eq('the effort far back is still found', got.effort && got.effort.value, 'xhigh');
    eq('…and the mode', got.permissionMode && got.permissionMode.value, 'bypassPermissions');
    eq('a missing file answers nothing, never throws', St.transcriptSetupOf(path.join(dir, 'none.jsonl')), {});
} finally {
    fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`test_closing_setup: ${pass} passed, ${fail} failed`);
if (fail) { process.exit(1); }
