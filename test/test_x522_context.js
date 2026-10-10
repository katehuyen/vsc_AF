'use strict';
// X-522 (1) — a route's context window is told to Claude Code (CLAUDE_CODE_MAX_CONTEXT_TOKENS, measured in the
// 2.1.295 binary), only when the route states one; it is never treated as a secret.
const R = require('../out/core/providerRuntime.js');
const { routeContextEnv } = require('../out/core/routeModels.js');
const { secretValuesOf } = require('../out/core/secretScrub.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

ok('a stated window is the variable', JSON.stringify(routeContextEnv(1000000)) === '{"CLAUDE_CODE_MAX_CONTEXT_TOKENS":"1000000"}');
ok('…as a whole number', routeContextEnv(262144.7).CLAUDE_CODE_MAX_CONTEXT_TOKENS === '262144');
ok('no window, zero, a negative or a non-number → nothing',
    [undefined, 0, -5, NaN, 'x'].every(v => Object.keys(routeContextEnv(v)).length === 0));

const base = {
    id: 'kimi-work', label: 'Kimi (work)', engines: ['claude'], providerId: 'kimi',
    baseUrl: 'https://api.moonshot.ai/anthropic', authKind: 'api-key',
    tiers: { opus: 'kimi-k2-thinking', sonnet: 'kimi-k2' }, revision: 3
};
const inherited = { PATH: '/usr/bin', ANTHROPIC_BASE_URL: 'https://x.example', CLAUDE_CODE_MAX_CONTEXT_TOKENS: '50000' };
const without = R.claudeRouteRuntime(base, 'sk-k', inherited, 'opus');
const withCtx = R.claudeRouteRuntime({ ...base, context: 1000000 }, 'sk-k', inherited, 'opus');
ok('‼️ a route with a window injects it', withCtx.spawnEnv.CLAUDE_CODE_MAX_CONTEXT_TOKENS === '1000000');
ok('‼️ a route without one injects exactly what it did before — the same names, the same values',
    !('CLAUDE_CODE_MAX_CONTEXT_TOKENS' in without.spawnEnv)
    && JSON.stringify(Object.keys(withCtx.spawnEnv).filter(k => k !== 'CLAUDE_CODE_MAX_CONTEXT_TOKENS').sort())
        === JSON.stringify(Object.keys(without.spawnEnv).sort())
    && Object.keys(without.spawnEnv).every(k => without.spawnEnv[k] === withCtx.spawnEnv[k]));
ok('…and the cleared names are the same list either way, never the window\'s', JSON.stringify(withCtx.clearEnv) === JSON.stringify(without.clearEnv)
    && !without.clearEnv.includes('CLAUDE_CODE_MAX_CONTEXT_TOKENS'));
ok('‼️ the window is a figure, not a secret: run output keeps every 1000000', !secretValuesOf(withCtx.spawnEnv).includes('1000000')
    && secretValuesOf(withCtx.spawnEnv).includes('sk-k'));

console.log(`test_x522_context: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
