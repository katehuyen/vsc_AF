// S-20 — the model/effort catalog per engine (compiled core/models.js, pure
// over the same injected probe the engine matrix uses).
//
// What is pinned here is the complaint the item was filed for: choosing Codex
// still offered `haiku / sonnet / opus / fable` — four values its CLI can only
// reject — while its own `/model` was offering six others. And the Claude half
// rots the same way on a slower clock, because a constant only changes when
// somebody remembers it exists.
//
// The fixtures below are the REAL shapes, read off this machine on 2026-08-10:
// ~/.codex/models_cache.json carries `models[]` with slug/display_name/
// description/visibility/priority/supported_reasoning_levels, and
// ~/.claude/.claude.json carries `additionalModelOptionsCache`.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { readCodexCatalog, readClaudeExtras, readEngineModels, effortsFor,
    modelFamily, modelVariant, mergeModelRows, narrowLaunch, capabilityRefusal } =
    require(path.join(__dirname, '..', 'out', 'core', 'models.js'));
const { EFFORT_CHOICES } = require(path.join(__dirname, '..', 'out', 'core', 'launch.js'));

const probe = (files) => ({
    readHome: (rel) => files[rel],
    existsHome: (rel) => Object.prototype.hasOwnProperty.call(files, rel),
    which: () => undefined,
    hasSecret: () => false,
    hasEnv: () => false
});

const CODEX_CACHE = JSON.stringify({
    fetched_at: '2026-08-10T06:57:08.834856700Z',
    models: [
        {
            slug: 'gpt-5.6-terra', display_name: 'GPT-5.6-Terra', priority: 2, visibility: 'list',
            description: 'Balanced agentic coding model for everyday work.',
            default_reasoning_level: 'medium',
            supported_reasoning_levels: [
                { effort: 'low', description: 'Fast responses with lighter reasoning' },
                { effort: 'medium', description: 'Balances speed and reasoning depth' },
                { effort: 'high', description: 'Greater reasoning depth' },
                { effort: 'xhigh', description: 'Extra high reasoning depth' },
                { effort: 'max', description: 'Maximum reasoning depth' },
                { effort: 'ultra', description: 'Maximum reasoning with delegation' }
            ]
        },
        {
            slug: 'gpt-5.6-sol', display_name: 'GPT-5.6-Sol', priority: 1, visibility: 'list',
            description: 'Latest frontier agentic coding model.',
            default_reasoning_level: 'low',
            supported_reasoning_levels: [{ effort: 'low', description: 'Fast' }]
        },
        // ‼️ the two the terminal does NOT show: a routing alias and an internal
        // review model. A picker that lists them is not "more complete", it is
        // offering a human a machine's own plumbing.
        { slug: 'gpt-5.6-sol-wm', display_name: 'Work Mode alias', priority: 1, visibility: 'hide' },
        { slug: 'codex-auto-review', display_name: 'Auto review', priority: 43, visibility: 'hide' },
        {
            slug: 'gpt-5.5', display_name: 'GPT-5.5', priority: 7, visibility: 'list',
            description: 'Frontier model for complex coding.',
            supported_reasoning_levels: [
                { effort: 'low' }, { effort: 'medium' }, { effort: 'high' }, { effort: 'xhigh' }
            ]
        }
    ]
});

const CLAUDE_STATE = JSON.stringify({
    additionalModelOptionsCache: [
        { value: 'claude-fable-5[1m]', label: 'Fable', description: 'Fable 5 · Most capable for your hardest tasks' }
    ]
});

// ---------- the Codex catalog, read the way its own /model reads it ----------
{
    const c = readCodexCatalog(CODEX_CACHE);
    const ids = c.models.map(m => m.id);
    ok('Default is always the first row', ids[0] === '');
    // ‼️ THE ASSERTION THE ITEM EXISTS FOR: the same rows, in the same order,
    // the user counted off in the terminal — not "some models".
    ok('‼️ visible models in the CLI\'s own priority order',
        ids.join() === ',gpt-5.6-sol,gpt-5.6-terra,gpt-5.5');
    ok('hidden routing/review models are not offered to a human',
        !ids.includes('gpt-5.6-sol-wm') && !ids.includes('codex-auto-review'));
    ok('a row is labelled as the service words it', c.models[1].label === 'GPT-5.6-Sol');
    // the slug is what lands on the command line, so a pretty label may not be
    // the only place it appears
    ok('…and keeps the slug readable in its detail', /gpt-5\.6-sol/.test(c.models[1].detail));
    ok('the description travels with the row', /Latest frontier/.test(c.models[1].detail));

    // effort is per MODEL: six levels on terra, four on 5.5 — one shared list
    // was wrong for both.
    ok('effort levels come from the model, not from a constant',
        c.efforts['gpt-5.6-terra'].map(e => e.id).join() === ',low,medium,high,xhigh,max,ultra');
    ok('…and a different model gets its own shorter list',
        c.efforts['gpt-5.5'].map(e => e.id).join() === ',low,medium,high,xhigh');
    ok('an effort row carries the service\'s own words',
        /Balances speed/.test(c.efforts['gpt-5.6-terra'][2].detail));
    ok('the model\'s own default effort is recorded', c.defaultEffort['gpt-5.6-terra'] === 'medium');
    ok('the catalog is dated', Math.abs(c.fetchedAt - Date.parse('2026-08-10T06:57:08.834Z')) < 1000);

    ok('rubbish is not a catalog', readCodexCatalog('{nope') === undefined);
    ok('an empty catalog is not a catalog', readCodexCatalog('{"models":[]}') === undefined);
    ok('a missing file is not a catalog', readCodexCatalog(undefined) === undefined);
}

// ---------- what Claude Code recorded for THIS account ----------
{
    const extras = readClaudeExtras(CLAUDE_STATE);
    ok('the account\'s extra model is found', extras.length === 1 && extras[0].id === 'claude-fable-5[1m]');
    ok('…worded as the CLI words it', extras[0].label === 'Fable' && /Most capable/.test(extras[0].detail));
    ok('no cache is no extras', readClaudeExtras('{}').length === 0);
    ok('rubbish is no extras', readClaudeExtras('{nope').length === 0);
}

// ---------- the whole matrix ----------
{
    const aliases = ['haiku', 'sonnet', 'opus', 'fable'];
    const m = readEngineModels(probe({
        '.codex/models_cache.json': CODEX_CACHE,
        '.claude/.claude.json': CLAUDE_STATE
    }), aliases);

    // ‼️ THE BUG, IN ONE LINE: not one Claude alias may reach the Codex box.
    const codexIds = m.codex.models.map(x => x.id);
    ok('‼️ Codex offers NO Claude alias', !aliases.some(a => codexIds.includes(a)));
    ok('…it offers the engine\'s own models', codexIds.includes('gpt-5.6-sol'));
    ok('and says where the list came from', m.codex.source === 'catalog' && /own catalog/.test(m.codex.note));
    ok('…and how old it is, so a stale list can be distrusted', /Refreshed/.test(m.codex.note));

    const claudeIds = m.claude.models.map(x => x.id);
    ok('Claude keeps the user\'s aliases', aliases.every(a => claudeIds.includes(a)));
    // the half of the complaint that is not about Codex: a model granted to the
    // account appears without anybody editing a setting
    ok('‼️ …plus a model the account was granted, with no edit', claudeIds.includes('claude-fable-5[1m]'));
    ok('an alias is never listed twice', new Set(claudeIds).size === claudeIds.length);

    ok('Gemini states no catalog and says so',
        m.gemini.source === 'settings' && m.gemini.models.map(x => x.id).includes('sonnet'));
}

// ---------- Codex installed but never run: fall back, and SAY so ----------
{
    const m = readEngineModels(probe({}), ['sonnet']);
    ok('a missing catalog still leaves a usable box', m.codex.models.length === 2);
    // ‼️ the fallback is the one case where a Claude alias legitimately appears
    // under Codex, so the note has to admit what is being shown and why
    ok('‼️ …and the box admits it is the alias list, not Codex\'s own',
        m.codex.source === 'settings' && /has not written its model catalog/.test(m.codex.note));
    ok('Claude with nothing on disk is the alias list', m.claude.source === 'settings');
}

// ---------- X-52: OpenCode's box, with and without a session ----------
{
    const aliases = ['haiku', 'sonnet', 'opus', 'fable'];
    // The complaint the item was filed for: choosing OpenCode kept offering four
    // Claude aliases its CLI can only reject, because the ONLY source of its
    // catalogue was a handshake nobody had made yet.
    const cold = readEngineModels(probe({}), aliases);
    ok('‼️ with no catalogue at all the box is honest about being the alias list',
        cold.opencode.source === 'settings'
        && /neither the background .opencode models. read nor an open session/.test(cold.opencode.note));

    const CLI = [{ id: 'opencode/big-pickle', label: 'opencode/big-pickle' },
    { id: 'opencode/hy3-free', label: 'opencode/hy3-free' }];
    const viaCli = readEngineModels(probe({}), aliases, undefined,
        { models: CLI, fetchedAt: Date.now(), via: 'cli' });
    const cliIds = viaCli.opencode.models.map(x => x.id);
    ok('‼️ a background `opencode models` read is enough — NO session required',
        viaCli.opencode.source === 'catalog' && cliIds.includes('opencode/big-pickle'));
    ok('‼️ …and not one Claude alias reaches the OpenCode box',
        !aliases.some(a => cliIds.includes(a)));
    ok('the note names the source it actually came from',
        /opencode models. in the background/.test(viaCli.opencode.note));

    const viaHandshake = readEngineModels(probe({}), aliases, undefined, {
        models: [{ id: 'opencode/big-pickle', label: 'Big Pickle' }],
        fetchedAt: Date.now(), via: 'handshake'
    });
    ok('the handshake\'s display name survives into the picker',
        viaHandshake.opencode.models.map(x => x.label).includes('Big Pickle'));
    ok('…and says it was the session that handed it over',
        /when the session opened/.test(viaHandshake.opencode.note));
    ok('‼️ either way there is no effort vocabulary — an empty list is the answer',
        effortsFor(viaCli.opencode, 'opencode/big-pickle').length === 0);
}

// ---------- effortsFor: per model, per engine, then the shared list ----------
{
    const m = readEngineModels(probe({ '.codex/models_cache.json': CODEX_CACHE }), ['sonnet']);
    ok('a model with its own levels gets them',
        effortsFor(m.codex, 'gpt-5.5').map(e => e.id).join() === ',low,medium,high,xhigh');
    ok('a model the catalog says nothing about falls back to the shared list',
        effortsFor(m.codex, 'something-else').length === EFFORT_CHOICES.length);
    ok('Claude keeps the flag list read off its own --help',
        effortsFor(m.claude, 'sonnet').length === EFFORT_CHOICES.length);
    ok('no engine at all is still answerable', effortsFor(undefined, 'x').length === EFFORT_CHOICES.length);
}

// ---------- U-32: one model is one row, whatever it is called ----------
//
// The complaint, verbatim: the list showed "fable" and "Fable" — two rows for
// one model, differing by a capital letter. Measured cause: the alias `fable`
// and the CLI's own `claude-fable-5[1m]`, deduplicated by id against id, which
// cannot see that they are the same thing.
{
    ok('the vendor prefix is not part of the identity', modelFamily('claude-fable-5') === 'fable');
    ok('neither is the version tail', modelFamily('claude-sonnet-4-6') === 'sonnet');
    ok('neither is the variant marker', modelFamily('claude-fable-5[1m]') === 'fable');
    ok('an alias is already its own family', modelFamily('fable') === 'fable');
    ok('a foreign id is left alone', modelFamily('gpt-oss-120b') === 'gpt-oss-120b');
    ok('an empty id has no family', modelFamily('') === '');
    ok('the variant is read, not assumed', modelVariant('claude-fable-5[1m]') === '1m');
    ok('…and a plain id has none', modelVariant('fable') === '');

    const rows = mergeModelRows([
        { id: 'sonnet', label: 'sonnet', detail: 'passed as --model' },
        { id: 'fable', label: 'fable', detail: 'passed as --model' },
        { id: 'claude-fable-5[1m]', label: 'Fable', detail: 'Fable 5 · Most capable' },
        { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', detail: 'the dated id' }
    ]);
    const labels = rows.map(r => r.label);
    ok('‼️ the same model is never two look-alike rows',
        !labels.some((l, i) => labels.some((o, j) => i !== j && o.toLowerCase() === l.toLowerCase())));
    ok('‼️ …and a variant is drawn AS a variant', labels.includes('Fable · 1m'));
    ok('the alias keeps the id that goes on the command line',
        rows.some(r => r.id === 'fable') && rows.some(r => r.id === 'claude-fable-5[1m]'));
    ok('a dated id folded into its alias leaves ONE sonnet',
        rows.filter(r => modelFamily(r.id) === 'sonnet').length === 1);
    ok('…and the alias that survived is the short one',
        rows.find(r => modelFamily(r.id) === 'sonnet').id === 'sonnet');
    ok('…having borrowed what the catalog knew about it',
        /the dated id/.test(rows.find(r => r.id === 'sonnet').detail));
    ok('an empty id contributes nothing', mergeModelRows([{ id: '', label: 'x', detail: '' }]).length === 0);
}

// ---------- …and the same, through the real matrix ----------
{
    const m = readEngineModels(probe({ '.claude/.claude.json': CLAUDE_STATE }), ['haiku', 'sonnet', 'opus', 'fable']);
    const labels = m.claude.models.map(x => x.label.toLowerCase());
    ok('‼️ no two Claude rows read the same', new Set(labels).size === labels.length);
    ok('the granted model is still offered', m.claude.models.some(x => x.id === 'claude-fable-5[1m]'));
    ok('…and the note says duplicates were folded', /listed once/.test(m.claude.note));
}

// ---------- X-30: the pair, narrowed together ----------
//
// The reported failure, verbatim from the CLI:
//   invalid model selection (--model "gemini-3.1-pro" --effort "medium"):
//   gemini-3.1-pro has no "medium" effort (available: low, high)
// Reading the effort list per model was already done (above); what was missing
// is that CHANGING one of the pair has to settle the other, or the box shows
// the new model's first level while the state still holds the old word.
{
    const em = {
        models: [
            { id: '', label: 'Default' },
            { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
            { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' }
        ],
        efforts: {
            'gemini-3.1-pro': [{ id: 'low' }, { id: 'high' }],
            'gemini-3.5-flash': [{ id: 'low' }, { id: 'medium' }, { id: 'high' }]
        },
        defaultEffort: { 'gemini-3.1-pro': 'low' },
        source: 'catalog', note: ''
    };
    ok('‼️ an effort the chosen model has never heard of does not travel',
        narrowLaunch(em, 'gemini-3.1-pro', 'medium').effort !== 'medium');
    ok('…it becomes the model\'s OWN default, not nothing, when the catalog states one',
        narrowLaunch(em, 'gemini-3.1-pro', 'medium').effort === 'low');
    ok('an effort the model does offer is left exactly as it was',
        narrowLaunch(em, 'gemini-3.5-flash', 'medium').effort === 'medium');
    // ‼️ …and the effort is then judged against "no model", which is a real
    // state and not an error: with the model box on Default the engine picks,
    // and `effortsFor` falls back to the shared vocabulary rather than
    // inventing a refusal out of a list it was never given.
    ok('a model this engine does not offer is dropped',
        narrowLaunch(em, 'sonnet', 'medium').model === '');
    ok('…and a model with no stated vocabulary judges the effort by the shared list',
        narrowLaunch(em, 'sonnet', 'medium').effort === 'medium');
    ok('‼️ a model with no stated default falls back to no flag rather than to a guess',
        narrowLaunch({ ...em, defaultEffort: {} }, 'gemini-3.1-pro', 'medium').effort === '');
    ok('‼️ an engine that publishes no catalog narrows NOTHING — ignorance is not a refusal',
        narrowLaunch(undefined, 'anything', 'medium').effort === 'medium');
}

// ‼️ X-120 / X-122 — THE SAME KNOWLEDGE, STATED AS A REFUSAL.
//
// `narrowLaunch` is right for a picker the user is still moving: what does not
// fit is dropped as they move. For a launch that has already been ASKED for it
// is wrong — a mission row that kept `opus` from the engine it used to be on
// either ran on something nobody typed, or reached a CLI that answered hours
// later in a file nobody reads. Same catalogue, said out loud, before the run.
{
    const codex = {
        models: [
            { id: '', label: 'Default' },
            { id: 'gpt-5.6-luna', label: 'Luna' },
            { id: 'gpt-5.5', label: '5.5' }
        ],
        efforts: {
            '': [{ id: 'low' }, { id: 'medium' }, { id: 'high' }],
            'gpt-5.6-luna': [{ id: 'low' }, { id: 'high' }]
        },
        defaultEffort: {}, source: 'catalog', note: ''
    };
    ok('‼️ a model this engine does not offer is REFUSED rather than silently dropped',
        /model "opus" is not one Codex offers here/.test(capabilityRefusal(codex, 'codex', 'opus', '')));
    ok('…and the refusal says what it DOES offer, so it is fixable in one pass',
        /gpt-5\.6-luna/.test(capabilityRefusal(codex, 'codex', 'opus', ''))
        && /change the engine this runs on/.test(capabilityRefusal(codex, 'codex', 'opus', '')));
    ok('a model it does offer passes', capabilityRefusal(codex, 'codex', 'gpt-5.5', '') === '');
    ok('‼️ an effort the CHOSEN model has never heard of is refused with the words it does take',
        capabilityRefusal(codex, 'codex', 'gpt-5.6-luna', 'medium')
        === 'effort "medium" is not one gpt-5.6-luna takes — low, high');
    ok('…while the same effort on a model that states no vocabulary of its own passes',
        capabilityRefusal(codex, 'codex', 'gpt-5.5', 'medium') === '');
    ok('…and the Default model box is judged by the engine\'s shared list, not refused',
        capabilityRefusal(codex, 'codex', '', 'medium') === '');
    ok('‼️ a model that states an EMPTY vocabulary takes no effort at all, and says so',
        /not something gpt-5\.5 takes at all/.test(
            capabilityRefusal({ ...codex, efforts: { ...codex.efforts, 'gpt-5.5': [] } }, 'codex', 'gpt-5.5', 'high')));
    // ‼️ IGNORANCE IS NOT EVIDENCE — the half that keeps this from refusing work
    // that works. A `settings` list is this extension's alias guess; an engine
    // that published nothing has no opinion to hold.
    ok('‼️ a settings list refuses NOTHING — an alias guess is not a catalogue',
        capabilityRefusal({ ...codex, source: 'settings' }, 'codex', 'opus', 'medium') === '');
    ok('…and neither does an absent one',
        capabilityRefusal(undefined, 'codex', 'opus', 'medium') === '');
    // An engine with no reasoning-effort flag at all is `headlessEffortRefusal`'s
    // question. Two refusals for one fault is how two wordings start disagreeing.
    ok('‼️ an engine with no effort flag is left to the refusal that already owns it',
        capabilityRefusal({ ...codex, efforts: { '': [] } }, 'gemini', '', 'high') === '');
    // ‼️ AND AN ALIAS IS NOT A STRANGER. `opus` and the dated id the CLI records
    // are one model — the same family+variant key the catalogue merge dedupes
    // on — so a spec written either way passes, and a real typo still does not.
    const claude = {
        models: [{ id: '', label: 'Default' }, { id: 'opus', label: 'Opus' }, { id: 'opus[1m]', label: 'Opus · 1m' }],
        efforts: { '': [{ id: 'low' }, { id: 'high' }] },
        defaultEffort: {}, source: 'catalog', note: ''
    };
    ok('‼️ an alias and the dated id it resolves to are ONE model',
        capabilityRefusal(claude, 'claude', 'claude-opus-4-5-20251101', '') === '');
    ok('…and the 1m variant is its own row rather than a second name for the bare model',
        capabilityRefusal(claude, 'claude', 'opus[1m]', '') === '');
    ok('…while a model nothing on that catalogue resolves to is still refused',
        !!capabilityRefusal(claude, 'claude', 'gpt-5.5', ''));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
