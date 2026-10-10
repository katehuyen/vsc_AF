// X-534 — console.sessions SAYS THE WINDOW THE CARD DRAWS. The card resolved its window by the one rule
// (the setting, else the engine's own statement, else the route's, else the model's published window);
// the op handed over only what the engine stated, so on a Claude card — whose engine states none — a
// person saw a percentage while an agent asking over the bridge read null. Both now ask
// core/routeWindow liveContextWindow with the same three inputs, and the op names the window's source.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const P = { ...require(path.join(ROOT, 'out', 'core', 'pricing.js')), ...require(path.join(ROOT, 'out', 'core', 'routeWindow.js')) };
const { contextPercent, contextSample } = require(path.join(ROOT, 'out', 'core', 'consoleproto.js'));

// ---------- the rule, asked with the applied model ----------
const model = 'claude-opus-4-1';
const table = P.contextWindowFor(model);
ok('the model table knows the model this test asks about', table > 0);
// launched on a model the table does not know, switched to one it does: only the applied one has a window
const claude = { contextTokens: Math.round(table / 4), model: 'launched-model-x', applied: { model } };
ok('the launch model has no window of its own', P.contextWindowFor(claude.model) === 0);
const w = P.liveContextWindow(claude, 0, 0);
ok('‼️ a Claude card with no stated window gets the model\'s published one', w.tokens === table && w.source === 'model');
ok('…asked with the APPLIED model, not the one it launched with', w.tokens === P.contextWindowFor(model));
ok('the window the engine stated outranks the table', P.liveContextWindow({ ...claude, contextWindowTokens: 258400 }, 0, 0).source === 'engine');
ok('…the route\'s stated window outranks the table, not the engine', P.liveContextWindow(claude, 0, 64000).tokens === 64000
    && P.liveContextWindow({ ...claude, contextWindowTokens: 258400 }, 0, 64000).tokens === 258400);
ok('…and the setting outranks everything', P.liveContextWindow({ ...claude, contextWindowTokens: 258400 }, 100000, 64000).source === 'forced');
ok('no model, no statement, no route: no window, never a guess', P.liveContextWindow({ contextTokens: 5 }, 0, 0).tokens === 0);
const pct = contextPercent(contextSample({ ...claude, contextWindowTokens: w.tokens }));
ok('the percentage over the resolved window is the card\'s', pct === 25);

// ---------- both surfaces ask it with the same inputs ----------
const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'consolePanel.ts'), 'utf8');
ok('the card asks liveContextWindow', /function liveWindow\([\s\S]{0,200}const w = liveContextWindow\(s, forced, route\);/.test(panel)
    && /\.\.\.liveWindow\(s, afConfig\(\)\.get<number>\('contextWindowTokens', 0\),\s*this\.deps\.routeWindowFor\?\.\(s\.sessionId \?\? '', s\.engine \?\? 'claude'\) \?\? 0\)/.test(panel));
const op = ext.slice(ext.indexOf("op: 'console.sessions'"), ext.indexOf("op: 'console.sessions'") + 30000);
ok('‼️ console.sessions asks it with the same setting and the same route', /liveContextWindow\(s, forcedWindow, routeWindowFor\(s\.sessionId \?\? '', s\.engine \?\? 'claude'\)\)/.test(op)
    && /const forcedWindow = cfg\(\)\.get<number>\('contextWindowTokens', 0\);/.test(op));
ok('…and answers the window, its source and the percentage over it', /contextWindowTokens: windows\.get\(s\.id\)\?\.tokens \|\| null,/.test(op)
    && /contextWindowSource: windows\.get\(s\.id\)\?\.source \|\| null,/.test(op)
    && /contextPct: contextPercent\(contextSample\(\{ \.\.\.s, contextWindowTokens: windows\.get\(s\.id\)\?\.tokens \?\? 0 \}\)\) \?\? null,/.test(op));
ok('the op\'s description says where the window comes from', /`contextWindowSource` says which: forced · engine · route · model/.test(op));
ok('the stated-only reading is gone from the op', !/contextWindowTokens: s\.contextWindowTokens \?\? null/.test(op));

console.log(`\nx-534 console window: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
