// X-111 — THE PROVIDER / PROFILE / MODEL FILTER RULE (media/afRunFilter.js),
// the one both the pages and the bridge ask.
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const F = require(path.join(__dirname, '..', 'media', 'afRunFilter.js'));

/* ---------- which providers a run was served by */
{
    const kimi = { providerId: 'Kimi', reportedProviderIds: [] };
    eq('a declared route is the run\'s provider, as a lowercase id', F.providersOf(kimi), ['kimi']);
    const multi = { providerId: 'anthropic', reportedProviderIds: ['anthropic', 'kimi'] };
    eq('a run that changed provider has every one of them, once', F.providersOf(multi), ['anthropic', 'kimi']);
    eq('no route is no provider', F.providersOf({}), []);
    // ‼️ The turn that names its own provider wins — an OpenCode turn states
    // the native provider that answered it.
    eq('a turn\'s own provider is the most specific answer',
        F.providersOf({ providerId: 'opencode' }, ['anthropic']), ['anthropic']);
    // ‼️ …and a Claude turn, which never names one, inherits its session's.
    eq('a turn that names none inherits the session\'s route', F.providersOf(kimi, []), ['kimi']);
    eq('the profile is read off the identity', F.profileOf({ providerProfileId: 'Kimi-Work' }), 'kimi-work');
}

/* ---------- which models ANSWERED — never the requested one (X-108) */
{
    const run = { requestedModelRef: 'opus', reportedModels: ['claude-opus-4-8', 'claude-haiku-4-5'] };
    eq('a run\'s models are the reported set, lowercase, once', F.modelsOf(run), ['claude-opus-4-8', 'claude-haiku-4-5']);
    eq('‼️ the requested model is NOT a value — asked-for and came-back stay apart',
        F.modelsOf({ requestedModelRef: 'opus' }), []);
    eq('a turn\'s own model wins over the session\'s set', F.modelsOf(run, ['claude-haiku-4-5']), ['claude-haiku-4-5']);
    eq('a turn that names none inherits the session\'s', F.modelsOf(run, []), ['claude-opus-4-8', 'claude-haiku-4-5']);
}

/* ---------- the match, including the multi-provider rule */
{
    ok('no selection is no filter', F.matchesAny(['kimi'], null));
    ok('…and a provider that appears tomorrow is included by itself', F.matchesAny(['newco'], undefined));
    ok('an empty selection matches nothing', !F.matchesAny(['kimi'], []));
    ok('a picked provider matches', F.matchesAny(['kimi'], ['kimi']));
    ok('case does not decide it', F.matchesAny(['Kimi'], ['KIMI']));
    ok('‼️ a run that touched ANY picked provider matches', F.matchesAny(['anthropic', 'kimi'], ['kimi']));
    ok('a run on none of them does not', !F.matchesAny(['anthropic'], ['kimi']));
    ok('‼️ a run with no route matches only when "no route" is picked',
        !F.matchesAny([], ['kimi']) && F.matchesAny([], [F.NONE]));
}

/* ---------- the picker's options come out of the rows */
{
    const opts = F.options([['kimi'], [], ['anthropic', 'kimi'], ['minimax']], v => v.toUpperCase());
    eq('distinct ids, sorted, labelled by the caller, and "no route" last',
        opts, [
            { v: 'anthropic', t: 'ANTHROPIC' }, { v: 'kimi', t: 'KIMI' },
            { v: 'minimax', t: 'MINIMAX' }, { v: F.NONE, t: 'no route' }
        ]);
    eq('"no route" is not offered when every row has one', F.options([['kimi']]).length, 1);
    eq('the axis names its own empty value', F.options([['a'], []], null, 'no model').pop(), { v: F.NONE, t: 'no model' });
    eq('…and nothing is offered when no row has a provider at all', F.options([[], []]), []);
}

/* ---------- the Turns page: the pickers, and a Claude turn found under its session's route */
{
    const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
    const turn = (o) => Object.assign({
        file: 'D:/t/s.jsonl', sessionId: 'S', n: 1, of: 1, ts: Date.now(),
        agent: 'dev', agentName: 'dev', session: 's', title: 's', label: 'l', engine: 'claude',
        models: [], providerIds: [], providers: [], profile: '', route: '', routeLabel: '',
        tokens: 0, cost: 0, tools: 0, errors: 0, origin: 'user'
    }, o);
    const boot = (rows) => {
        const p = runPage('turns.js', { generatedAt: Date.now(), agents: ['dev'], models: [], origins: [], rows });
        const b = p.query('.af-filter')[0]; if (b) { b.click(); }
        return p;
    };
    const shown = (p) => ['one', 'two', 'three'].filter(l => p.html().includes('>' + l + '<')).join(',');

    const bare = boot([turn({ label: 'one' }), turn({ label: 'two', sessionId: 'B' })]);
    ok('every turn on no route → no Providers picker on the Turns page', !bare.ms.has('turns-providers') && !bare.ms.has('turns-profiles'));

    // a Claude turn through Kimi (names nothing itself), an OpenCode turn that named
    // its provider, and a turn on no route
    const p = boot([
        turn({ label: 'one', providers: ['kimi'], route: 'kimi', routeLabel: 'Kimi', profile: 'kimi-work', models: ['claude-opus-4-8'] }),
        turn({ label: 'two', sessionId: 'B', engine: 'opencode', providerIds: ['minimax'], providers: ['minimax'], models: ['minimax-m2'] }),
        turn({ label: 'three', sessionId: 'C' })
    ]);
    ok('the Providers picker lists the routes by label plus "no route"',
        p.ms.has('turns-providers') && p.ms.options('turns-providers').join() === 'kimi,minimax,(none)');
    ok('the Profiles picker appears once a row carries one',
        p.ms.has('turns-profiles') && p.ms.options('turns-profiles').join() === 'kimi-work,(none)');
    ok('the hover names the session\'s route for the Claude turn', p.html().includes('Session route: Kimi'));
    p.ms.only('turns-providers', ['kimi']);
    ok('‼️ "only Kimi" finds the Claude turn that never named Kimi', shown(p) === 'one');
    p.ms.only('turns-providers', ['(none)']);
    ok('"no route" is the turns on none', shown(p) === 'three');
    p.ms.only('turns-providers', ['kimi', 'minimax']);
    ok('two routes ticked is either', shown(p) === 'one,two');
    p.ms.only('turns-models', ['minimax-m2']);
    ok('…and the model axis combines by AND', shown(p) === 'two' && p.html().includes('Filters (2)'));
    const clear = p.query('.af-fclear')[0]; clear.click();
    ok('Clear restores every turn', shown(p) === 'one,two,three');
    p.ms.only('turns-profiles', ['kimi-work']);
    ok('the profile axis narrows on its own', shown(p) === 'one');
}

/* ---------- the host reads the SAME file */
{
    const fs = require('fs');
    const ts = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'runFilter.ts'), 'utf8');
    ok('‼️ the host wrapper requires the page\'s module rather than a copy of it',
        /require\(path\.join\(__dirname, '\.\.', '\.\.', 'media', 'afRunFilter\.js'\)\)/.test(ts));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
