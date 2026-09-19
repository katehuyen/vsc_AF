// ONE question — "a context reading is a fraction of WHAT" — and one place that
// answers it: `contextWindowOf` in core/pricing.ts.
//
// ‼️ X-113 — IT USED TO BE ANSWERED SIX TIMES, IN THREE DIFFERENT ORDERS. The
// dashboard put the reader's override first; extension.ts put the live host's
// stated window first on one branch and the session's own on another; the
// viewer let the CLI's printed limit beat the override; the Console's resume
// list asked only the session and so showed a bare numerator on every Claude
// row; and the Turns page answered a seventh way, dividing every turn of every
// engine by a hard-coded 200 000 — wrong by a third on a measured Codex thread
// (258 400) and by five on a million-token model, and exact-looking in both.
//
// So this file pins the RULE (precedence, and that zero is a real answer), the
// table it falls back to, the row that now carries both halves, and the two
// pages that print them.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)} want ${JSON.stringify(want)})`, got === want);

// let the compiled core load in plain node by mocking the vscode import
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }, ViewColumn: {}, ConfigurationTarget: {}, env: {}, EventEmitter: function () { this.event = () => ({ dispose() {} }); this.fire = () => {}; } };
    }
    return origLoad.apply(this, arguments);
};
const out = f => require(path.join(__dirname, '..', 'out', 'core', f));
const { contextWindowFor, contextWindowOf, publishedWindows, setPublishedWindows } = out('pricing.js');
const { readOpenCodeCatalog } = out('providerCatalog.js');
const { turnRowsFor } = out('turns.js');
const read = p => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
Module._load = origLoad;

// ---------- 1) the published windows this farm actually runs against ----------
// ‼️ X-35 shipped with `opus-5` missing from the table, so the user's own
// everyday model matched nothing and the percentage vanished from most of the
// farm. A window is a published capability, not a guess — it gets checked.
eq('opus-5 is a million', contextWindowFor('claude-opus-5'), 1000000);
eq('sonnet-5 is a million', contextWindowFor('claude-sonnet-5'), 1000000);
eq('fable is a million', contextWindowFor('claude-fable-5-1'), 1000000);
eq('haiku 4.5 is 200k', contextWindowFor('claude-haiku-4-5-20251001'), 200000);
eq('a model nobody has heard of is 0, never a stand-in',
    contextWindowFor('some-future-engine-model-9'), 0);
eq('no model at all is 0', contextWindowFor(''), 0);

// ---------- 2) the precedence, which is the whole point ----------
const w = (stated, model, forced) => contextWindowOf(stated, model, forced);

ok('the reader\'s override outranks everything — it is an instruction, not a measurement',
    w(258400, 'claude-opus-5', 500000).tokens === 500000
    && w(258400, 'claude-opus-5', 500000).source === 'forced');
ok('…including a window the engine published for this very session',
    w(258400, '', 500000).source === 'forced');
ok('what the engine stated beats the model table: a Codex thread is 258 400, not 200 000',
    w(258400, 'claude-haiku-4-5', 0).tokens === 258400
    && w(258400, 'claude-haiku-4-5', 0).source === 'engine');
ok('with no engine window the model\'s own published one is a real answer',
    w(0, 'claude-opus-5', 0).tokens === 1000000
    && w(0, 'claude-opus-5', 0).source === 'model');
ok('and when nobody stated one it STOPS — 0 and an empty source, never Claude\'s',
    w(0, 'nobody-knows-this-one', 0).tokens === 0
    && w(0, 'nobody-knows-this-one', 0).source === '');
eq('a zero override is not an override', w(0, 'claude-opus-5', 0).source, 'model');
eq('a negative override is not one either', w(0, 'claude-opus-5', -1).source, 'model');
eq('forced is honoured even where nothing else is known',
    w(0, '', 123456).tokens, 123456);

// ---------- 3) the turn row carries BOTH halves ----------
// ‼️ AND AGAINST THE TURN'S OWN LAST MODEL, not the session's. A session that
// switched models mid-way has turns with different ceilings, and the
// session-level figure is the wrong one for all of them but the last.
const turn = (n, models) => ({
    n, label: 'turn ' + n, ts: 1000 * n, ms: 10, apiCalls: 1, steps: 1, thinking: 0,
    endCtx: 100000, tokens: 50, wTokens: 50, cost: 0, tools: 0, errors: 0,
    models, providerIds: []
});
const session = (extra) => Object.assign({
    file: 'f', sessionId: 'sid', cwd: 'D:/a', agentName: 'dev', title: 't',
    lastTs: 9999, isSidechain: false,
    turns: [turn(1, ['claude-haiku-4-5']), turn(2, ['claude-opus-5'])]
}, extra);

const mixed = turnRowsFor(session({}), false);
eq('the first turn is measured against ITS model', mixed[0].ctxWindow, 200000);
eq('…and the second against its own', mixed[1].ctxWindow, 1000000);
ok('both say where the figure came from',
    mixed.every(r => r.ctxWindowSource === 'model'));

const stated = turnRowsFor(session({ ctxWindow: 258400 }), false);
ok('a session whose engine stated a window hands it to every turn',
    stated.every(r => r.ctxWindow === 258400 && r.ctxWindowSource === 'engine'));

const forced = turnRowsFor(session({ ctxWindow: 258400 }), false, 42000);
ok('…and the reader\'s override still wins on the row',
    forced.every(r => r.ctxWindow === 42000 && r.ctxWindowSource === 'forced'));

const unknown = turnRowsFor(session({ turns: [turn(1, ['a-model-from-2030'])] }), false);
ok('an unknown model leaves the row with no ceiling and says so',
    unknown[0].ctxWindow === 0 && unknown[0].ctxWindowSource === '');

// ---------- 4) the pages print it, and the constant is gone ----------
const turnsPage = read('media/turns.js');
ok('the Turns page no longer divides every engine by 200 000',
    !/pctOf\(r\.endCtx,\s*200000\)/.test(turnsPage));
ok('…it takes the fraction against the row\'s own ceiling',
    /pctOf\(r\.endCtx,\s*r\.ctxWindow\)/.test(turnsPage));
ok('…and names where the ceiling came from',
    /C\.ctxWindowIs\(r\.ctxWindowSource\)/.test(turnsPage));
ok('the sessions table names it too',
    /C\.ctxWindowIs\(r\.ctxWindowSource\)/.test(read('media/sessionsTable.js')));
// ‼️ AND IT SAYS IT ONCE. The first draft printed "no window known for this
// model" on one line and "nobody stated one" on the next, which is the same
// sentence twice in a four-line panel.
for (const [page, num] of [['media/turns.js', 'r.endCtx'], ['media/sessionsTable.js', 'r.ctx']]) {
    ok(page + ': with no ceiling the reason takes the first line, and the second drops',
        new RegExp(`line\\('Window is', ${num.replace('.', '\\.')} && r\\.ctxWindow \\?`).test(read(page)));
}

// ---------- 5) the LIVE Console card, which had no ceiling at all ----------
// ‼️ Measured on a running Claude session before this: `ctx 234.9k`, window
// null. The card asks the engine; Claude states none; so the one surface a
// person watches while the turn runs drew a raw token count with no ceiling,
// no percentage and no bar. The other pages had known the answer since X-35.
const consolePanel = read('src/panels/consolePanel.ts');
ok('the card resolves its ceiling through the one rule, not off the engine alone',
    /liveWindow\(s, afConfig\(\)\.get<number>\('contextWindowTokens', 0\)\)/.test(consolePanel)
    && !/contextWindowTokens: s\.contextWindowTokens \?\? 0/.test(consolePanel));
ok('…and asks the APPLIED model, which is the one really running',
    /s\.applied\?\.model \|\| s\.model \|\| ''/.test(consolePanel));
ok('…and sends where the ceiling came from beside it',
    /contextWindowSource: w\.source/.test(consolePanel));
const consolePage = read('media/console.js');
ok('the card tip names which of the three the ceiling was',
    /C\.ctxWindowIs\(s\.contextWindowSource\)/.test(consolePage));
ok('…and no longer claims every ceiling is one the session reported',
    !/the capacity this session reports/.test(consolePage));

// ---------- 6) the wording lives once, in charts.js ----------
const vm = require('vm');
const C = (() => {
    const box = vm.createContext({ window: {} });
    vm.runInContext(read('media/charts.js'), box);
    return box.window.AFCharts;
})();
ok('every source has its own sentence',
    new Set(['forced', 'engine', 'model', ''].map(s => C.ctxWindowIs(s))).size === 4);
ok('the override is described as the reader\'s own, not as a measurement',
    /setting/.test(C.ctxWindowIs('forced')) && !/setting/.test(C.ctxWindowIs('engine')));
ok('an unknown source still gets a sentence rather than "undefined"',
    typeof C.ctxWindowIs(undefined) === 'string' && C.ctxWindowIs(undefined).length > 0);

// ---------- 7) nobody keeps a private copy of the rule ----------
// ‼️ The defect this file exists for is DUPLICATION, so the guard is that the
// hand-written forms do not come back. `contextWindowFor` may still be called
// (it is the table), but the `forced > 0 ? forced : …` shape is the rule being
// written out a second time.
for (const f of ['src/extension.ts', 'src/panels/dashboard.ts',
    'src/panels/consolePanel.ts', 'src/core/turns.ts']) {
    ok(f + ' does not write the precedence out by hand',
        !/forced\s*>\s*0\s*\?\s*forced\s*:/.test(read(f)));
}

// ---------- 8) the window the ENGINE published, which the table cannot hold ----
// ‼️ X-113 part 4 — the fallback table is Claude families, so it answered 0 for
// every model of every other engine while `opencode models --verbose` was
// publishing `limit.context` on each one. Measured on this machine, OpenCode
// 1.18.19: seven models, 200 000 up to 1 048 576, not one of them matched.
// Two entries kept verbatim — one 200K, one over a million — because the point
// is that no regex we could ship would have covered either.
{
    const VERBOSE = `opencode/big-pickle
{
  "id": "big-pickle",
  "providerID": "opencode",
  "name": "Big Pickle",
  "limit": { "context": 200000, "input": 160000, "output": 32000 },
  "capabilities": { "toolcall": true },
  "variants": {}
}
opencode/muse-spark-1.3-contributor-free
{
  "id": "muse-spark-1.3-contributor-free",
  "providerID": "opencode",
  "name": "Muse Spark 1.3 Contributor Free",
  "limit": { "context": 1048576, "output": 32768 },
  "capabilities": { "toolcall": true },
  "variants": {}
}`;
    const rows = readOpenCodeCatalog(VERBOSE).rows;
    eq('the catalog still publishes a window for every row', rows.length, 2);

    eq('before anything is installed the table has no answer for it',
        contextWindowFor('opencode/muse-spark-1.3-contributor-free'), 0);

    setPublishedWindows(rows.flatMap(r => {
        const tokens = r.limit?.context ?? 0;
        return tokens > 0 ? [{ model: r.ref, tokens }, { model: r.modelId, tokens }] : [];
    }));

    eq('the wire ref a launch carries resolves',
        contextWindowFor('opencode/muse-spark-1.3-contributor-free'), 1048576);
    // ‼️ The two-spellings trap that had catalogRefusal refusing every OpenCode
    // model there is: a transcript read off disk carries the BARE id.
    eq('…and so does the bare id a transcript carries',
        contextWindowFor('muse-spark-1.3-contributor-free'), 1048576);
    eq('a second model keeps its own figure rather than the last one read',
        contextWindowFor('big-pickle'), 200000);
    ok('a model nobody published is still 0, not a borrowed ceiling',
        contextWindowFor('some-model-nobody-published') === 0);

    // The whole point: the rule's MODEL branch, on a surface that only ever had
    // a numerator for this engine.
    const w = contextWindowOf(0, 'opencode/big-pickle');
    eq('the published figure answers as the model, not as the engine', w.source, 'model');
    eq('…with the engine\'s own number', w.tokens, 200000);
    // The per-session statement still outranks it — a live OpenCode turn reports
    // its operational `size`, and that is the window it really ran against.
    eq('a stated window still wins over the published one',
        contextWindowOf(262144, 'opencode/big-pickle').source, 'engine');

    // A bare id two providers publish with DIFFERENT windows is dropped, never
    // resolved to whichever was read last.
    setPublishedWindows([
        { model: 'alpha/gpt-4o', tokens: 128000 },
        { model: 'beta/gpt-4o', tokens: 256000 }
    ]);
    eq('an ambiguous bare id refuses to answer', contextWindowFor('gpt-4o'), 0);
    eq('…while each full ref still does', contextWindowFor('beta/gpt-4o'), 256000);

    setPublishedWindows([]);
    eq('installing nothing empties it rather than leaving the last catalog',
        Object.keys(publishedWindows()).length, 0);
    eq('and the shipped table is untouched by any of it',
        contextWindowFor('claude-opus-5'), 1_000_000);
}

// ---------- 9) …and it is actually WIRED, which is the defect that keeps recurring
// ‼️ Part 3 of this item found `catalogRefusal` refusing every OpenCode model
// because nothing had ever called it. A published window nobody installs is the
// same bug with a different name, so the call sites are pinned here.
{
    const ext = read('src/extension.ts');
    ok('the host installs the published windows on restore',
        /applyPublishedWindows\(\);/.test(ext));
    ok('…and again whenever the catalog text changes',
        /nextText !== beforeText\) \{ applyPublishedWindows\(\); \}/.test(ext));
    ok('…from the catalog reader rather than a second hand-written list',
        /readOpenCodeCatalog\(opencodeCatalog\.text\)/.test(ext));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
