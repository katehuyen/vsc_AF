// X-498 — ON A CLAUDE ROUTE THE EFFORT BOX OFFERS THE CLI'S FULL LIST, WHATEVER MODEL THE DRAFT HIDES.
//
// On a route with its own base URL (or tiers) the Model box is withdrawn, but every surface —
// Console composer, a running card, Tasks, Missions — still looks the effort list up BY the
// draft's model (AFLaunch.effortsFor). Measured 2026-10-04 (engines.models on the live host, and
// the X-493 probe on CLI 2.1.280): Claude publishes ONE list, keyed '', and the CLI sends
// --effort to whatever model the route serves. So today that lookup always lands on the full
// list and the box is always drawn — the defect X-498 described does not occur. This pins the
// invariant it rests on: the day Claude's catalogue gains per-model lists, this fails, and a
// route must then take its list from the route's model or the '' row, never the hidden draft.
//
//   node test/test_route_effort_list.js
'use strict';
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const OUT = path.join(__dirname, '..', 'out', 'core');
const { readEngineModels, effortsFor } = require(path.join(OUT, 'models.js'));
const { catalog, effortsForModel } = require(path.join(OUT, 'aflaunch.js'));

const ids = rows => (rows || []).map(r => r.id).join(',');
const matrix = readEngineModels({ readHome: () => undefined }, ['haiku', 'sonnet', 'opus', 'fable']);
const claude = matrix.claude;
const full = ids(effortsFor(claude, ''));

ok('Claude offers an effort list at all (Default + the CLI levels)', full === ',low,medium,high,xhigh,max');
ok('‼️ Claude states ONE list, keyed \'\' — no per-model lists (if this fails, read X-498 before changing it)',
    JSON.stringify(Object.keys(claude.efforts)) === '[""]');
// the drafts a route can hide: every alias, a dated id, a 1m variant, and a model only the route knows
const drafts = ['', 'haiku', 'sonnet', 'opus', 'fable', 'claude-opus-5-5', 'claude-fable-5[1m]', 'deepseek/probe-model'];
ok('host side: every hidden draft model yields the full list', drafts.every(m => ids(effortsFor(claude, m)) === full));
const page = catalog({ known: true, em: claude, models: claude.models, efforts: [], takesEffort: true });
ok('page side (the one rule every surface draws with): every hidden draft model yields the full list',
    drafts.every(m => ids(effortsForModel(page, m)) === full));

console.log(`test_route_effort_list: ${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
