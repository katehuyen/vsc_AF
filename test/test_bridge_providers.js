// X-516 — providers.add / providers.set / providers.list / providers.ownership after a route became
// one record for two engines. The handlers live in extension.ts closures, so the rule they ask is
// tested here as the pure function it is, and the wiring and the op texts are read from the source.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const E = require(path.join(ROOT, 'out', 'core', 'routeEngines.js'));
const P = require(path.join(ROOT, 'out', 'core', 'providerProfiles.js'));
const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
const opText = (op) => {
    const at = ext.indexOf(`op: '${op}'`);
    return at < 0 ? '' : ext.slice(at, ext.indexOf('\n        },', at));
};

// ---------- the single `engine` argument is refused by name ----------
{
    ok('‼️ engine is refused, and the sentence says to use engines',
        /takes engines, not engine/.test(E.routeArgsRefusal({ id: 'x', engine: 'claude' })));
    ok('…even when it is empty — the argument itself is the mistake', !!E.routeArgsRefusal({ engine: '' }));
    ok('engines, or no engine at all, passes', E.routeArgsRefusal({ engines: 'claude' }) === '' && E.routeArgsRefusal(undefined) === '');
    for (const op of ['providers.add', 'providers.set']) {
        const body = opText(op);
        const asked = body.indexOf('routeArgsRefusal(args'), written = body.indexOf('writeProviderProfiles(');
        ok(`‼️ ${op} asks it before anything is written`, asked > 0 && written > asked);
    }
}

// ---------- the new arguments arrive as a bridge sends them: text ----------
{
    const w = P.addProfile([], {
        id: 'or-x', providerId: 'openrouter', baseUrl: 'https://openrouter.ai/api', opencodeUrl: 'https://openrouter.ai/api/v1',
        engines: 'opencode,claude', context: '131072', output: '8192', tiers: { opus: 'a/b' }
    }, ['claude', 'opencode']);
    ok('engines as comma text, limits as digits, the OpenCode endpoint — all kept',
        !w.refusal.length && w.profile.engines.join() === 'claude,opencode' && w.profile.context === 131072
        && w.profile.output === 8192 && w.profile.opencodeUrl === 'https://openrouter.ai/api/v1');
}

// ---------- the op texts say the rule that holds now ----------
{
    const add = opText('providers.add'), set = opText('providers.set'), list = opText('providers.list'), own = opText('providers.ownership');
    for (const [op, body] of [['providers.add', add], ['providers.set', set]]) {
        ok(`${op} names engines, opencodeUrl, context and output`, ['engines?', 'opencodeUrl?', 'context?', 'output?'].every(a => body.includes(a)));
    }
    ok('providers.list returns them', ['engines', 'opencodeUrl', 'context and output'].every(a => list.includes(a)));
    ok('providers.ownership names both sources', /agent-farm-route/.test(own) && /engine-native/.test(own));
    ok('‼️ the sentences of the one-engine rule are gone',
        !/cannot\s*'\s*\+\s*'be given a profile|cannot be given a profile/.test(add) && !/ROUTES Agent Farm holds for Claude Code/.test(list));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
