'use strict';
// X-525 (1) and (2) — the pure core of a route's going: which saved records name a
// route, in either engine's spelling, and which route may take its place for them.
const { namedRouteId, routeDependents, servesSameModels } = require('../out/core/savedRoutes.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

/* ---------- (1) a record names a route in its engine's own spelling */
ok('a Claude record names a route by its bare id', namedRouteId({ engine: 'claude', providerId: 'or-qwen38' }) === 'or-qwen38');
ok('…and a record with no engine is a Claude one', namedRouteId({ providerId: 'or-qwen38' }) === 'or-qwen38');
ok('an OpenCode record names it by its wire id', namedRouteId({ engine: 'opencode', providerId: 'af-or-qwen38' }) === 'or-qwen38');
ok('…or by a model under it, with no provider', namedRouteId({ engine: 'opencode', model: 'af-or-qwen38/qwen/qwen3.8:free' }) === 'or-qwen38');
ok('‼️ a bare id on an OpenCode record is the engine\'s own provider, not our route', namedRouteId({ engine: 'opencode', providerId: 'kimi' }) === '');
ok('…and a native model ref names no route either', namedRouteId({ engine: 'opencode', model: 'opencode/big-pickle' }) === '');
ok('…nor does a model on a record whose provider is the engine\'s own', namedRouteId({ engine: 'opencode', providerId: 'kimi', model: 'af-or-qwen38/x' }) === '');
ok('a route id that itself starts with af- loses exactly one prefix', namedRouteId({ engine: 'opencode', providerId: 'af-af-x' }) === 'af-x');
ok('a record naming nothing names no route', namedRouteId({ engine: 'claude' }) === '' && namedRouteId({ engine: 'opencode' }) === '');

const saved = [
    { kind: 'launch profile', label: 'Genel Qwen3.8', engine: 'claude', providerId: 'or-qwen38' },
    { kind: 'launch profile', label: 'OC Qwen', engine: 'opencode', providerId: 'af-or-qwen38' },
    { kind: 'schedule', label: 'Gece', engine: 'opencode', model: 'af-or-qwen38/qwen/qwen3.8:free' },
    { kind: 'agent default', label: 'developer', providerId: 'or-qwen38' },
    { kind: 'launch profile', label: 'Kimi native', engine: 'opencode', providerId: 'kimi' },
    { kind: 'launch profile', label: 'Other', engine: 'claude', providerId: 'or-nemotron' }
];
const deps = routeDependents('or-qwen38', saved);
ok('every record naming the route is found, in both spellings, and only those',
    deps.map(d => d.label).join(',') === 'Genel Qwen3.8,OC Qwen,Gece,developer');
ok('no id, no dependents', routeDependents('', saved).length === 0);

/* ---------- (2) a stand-in serves the same models, never merely the same vendor */
const gone = { id: 'or-qwen38', engines: ['claude', 'opencode'], tiers: { opus: 'qwen/qwen3.8:free', haiku: 'qwen/qwen3.8-mini' } };
const same = { id: 'or-qwen-b', engines: ['claude', 'opencode'], tiers: { opus: 'qwen/qwen3.8:free', haiku: 'qwen/qwen3.8-mini' } };
ok('the same model in every tier the gone route filled: a stand-in', servesSameModels(gone, same, 'claude', true));
ok('…it may fill more tiers', servesSameModels(gone, { ...same, tiers: { ...same.tiers, sonnet: 'x/y' } }, 'opencode', true));
ok('a tier missing on the candidate: not a stand-in', !servesSameModels(gone, { ...same, tiers: { opus: 'qwen/qwen3.8:free' } }, 'claude', true));
ok('‼️ another model on the same vendor: not a stand-in', !servesSameModels(gone, { ...same, tiers: { opus: 'qwen/qwen3.9:free', haiku: 'qwen/qwen3.8-mini' } }, 'claude', true));
ok('no key: not a stand-in', !servesSameModels(gone, same, 'claude', false));
ok('not marked for the record\'s engine: not a stand-in', !servesSameModels(gone, { ...same, engines: ['claude'] }, 'opencode', true));
ok('the route itself is never its own stand-in', !servesSameModels(gone, { ...gone }, 'claude', true));
ok('a route that filled no tier answers with an unprovable default: no stand-in',
    !servesSameModels({ id: 'g', engines: ['claude'], tiers: {} }, same, 'claude', true));

console.log(`test_x525_core: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
