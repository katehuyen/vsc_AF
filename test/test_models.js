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

const { readCodexCatalog, readClaudeExtras, readEngineModels, effortsFor } =
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
