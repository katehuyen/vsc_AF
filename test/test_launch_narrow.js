// X-149 — THE ONE NARROWING RULE (media/afLaunch.js), run from both sides.
//
// ‼️ WHY THIS FILE IS ONE TABLE AND NOT TWO SUITES.
//
// "The engine moved — what happens to the boxes under it" used to be answered
// in four places: `narrowLaunch` (src/core/models.ts), `reconcileComposer`
// (media/console.js), `ntNarrowEffort` (media/tasksPage.js) and `launchNarrow`
// (media/afEngine.js). They were written from the same intention and they still
// disagreed — the measurement behind X-148 found that the host counted
// `claude-opus-4-5-20251101` and the alias `opus` as ONE model while the pages
// pushed the unrecognised value onto the list as a stranger. Nothing tested the
// four against each other, which is the mechanical form of the complaint that
// opened this work: one thing gets fixed and another breaks.
//
// So the fixtures below are written ONCE and every entry point is made to
// answer them:
//
//   · Node       — `require('media/afLaunch.js')`, which is what the extension
//                  host loads through `src/core/aflaunch.ts`
//   · webview    — the same file evaluated in a sandbox with only a `window`,
//                  which is what a page gets
//   · the door   — `narrowLaunch` out of `out/core/models.js`, the host's own
//                  entry, so the compiled path is proved and not assumed
//
// A case added here is therefore a case every surface has to pass, and a
// divergence can only be introduced by NAMING it (`keep`, `preferModelDefault`,
// `resolveAlias`) — which is the whole point: the differences are real, and now
// they are written down instead of hidden in a copy.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const NODE = require(path.join(ROOT, 'media', 'afLaunch.js'));

// ---------- the webview entry point: the same file, with only a window ----------
const WEB = (() => {
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'media', 'afLaunch.js'), 'utf8'), sandbox);
    return sandbox.window.AFLaunch;
})();

ok('‼️ the page gets the rule off `window`, and it is the same file',
    !!WEB && typeof WEB.narrow === 'function');
ok('…and the host gets it off module.exports', typeof NODE.narrow === 'function');

/* =========================================================================
 * THE CATALOGUES. `{ id: '' }` is a real row on both lists — "Default" — which
 * is why an empty model and an empty effort are always valid answers.
 * ========================================================================= */
const FLAT = [{ id: '' }, { id: 'low' }, { id: 'medium' }, { id: 'high' }, { id: 'xhigh' }];

/** Claude's shape: models with no `/`, levels stated once for every model. */
const CLAUDE = {
    em: {
        models: [{ id: '' }, { id: 'sonnet' }, { id: 'claude-opus-4-5-20251101' }],
        efforts: { '': [{ id: '' }, { id: 'low' }, { id: 'high' }] },
        defaultEffort: { sonnet: 'high' }
    },
    efforts: FLAT
};
/** Codex's shape: levels stated PER MODEL, so the pair moves together. */
const PER_MODEL = {
    em: {
        models: [{ id: '' }, { id: 'luna' }, { id: 'gpt-5.5' }],
        efforts: { luna: [{ id: 'low' }, { id: 'max' }], 'gpt-5.5': [{ id: '' }, { id: 'low' }], '': FLAT },
        defaultEffort: { luna: 'max', 'gpt-5.5': 'nonsense' }
    },
    efforts: FLAT
};
/** OpenCode's shape: `provider/model`, and no effort flag at all (X-35/U-59). */
const OPENCODE = {
    em: {
        models: [{ id: '' }, { id: 'opencode/big-pickle' }, { id: 'anthropic/sonnet' }],
        efforts: { '': FLAT },
        defaultEffort: {}
    },
    efforts: FLAT,
    takesEffort: false
};
/** Two providers offering the same model — a tail claimed by SEVERAL ids. */
const TWO_PROVIDERS = {
    em: {
        models: [{ id: '' }, { id: 'openrouter/kimi-k2' }, { id: 'moonshot/kimi-k2' }],
        efforts: { '': FLAT },
        defaultEffort: {}
    },
    efforts: FLAT
};
/** An engine that has published nothing. */
const SILENT = { em: null, known: false, efforts: FLAT };

/* =========================================================================
 * THE TABLE. Written once; every entry point answers all of it.
 * ========================================================================= */
const CASES = [
    // ---- S-20: a model belongs to ONE engine ----
    { name: 'a model this engine does not offer is dropped',
        src: CLAUDE, want: { model: '', effort: '' }, intent: { model: 'gpt-5.5', effort: '' } },
    { name: '…and one it does offer is kept, untouched',
        src: CLAUDE, want: { model: 'sonnet', effort: 'high' }, intent: { model: 'sonnet', effort: 'high' } },
    { name: '‼️ the empty model is a REAL row ("Default") and survives everything',
        src: CLAUDE, want: { model: '', effort: 'low' }, intent: { model: '', effort: 'low' } },
    { name: 'whitespace around a written id is not a different model',
        src: CLAUDE, want: { model: 'sonnet', effort: '' }, intent: { model: '  sonnet  ', effort: '' } },

    // ---- X-30: the model decides what an effort MEANS ----
    { name: '‼️ X-30 — an effort the model does not offer becomes that model\'s own default',
        src: PER_MODEL, want: { model: 'luna', effort: 'max' }, intent: { model: 'luna', effort: 'high' } },
    { name: '…and becomes NOTHING when the default is not on the list either',
        src: PER_MODEL, want: { model: 'gpt-5.5', effort: '' }, intent: { model: 'gpt-5.5', effort: 'max' } },
    { name: '…while an effort the model really states is left alone',
        src: PER_MODEL, want: { model: 'luna', effort: 'low' }, intent: { model: 'luna', effort: 'low' } },
    { name: '‼️ a dropped model takes the effort with it — the list is looked up BY model',
        src: PER_MODEL, want: { model: '', effort: '' }, intent: { model: 'sonnet', effort: 'max' } },

    // ---- X-35 / U-59: an engine with no effort flag offers none ----
    { name: '‼️ X-35 — an engine with no effort flag answers with no effort at all',
        src: OPENCODE, want: { model: 'anthropic/sonnet', effort: '' },
        intent: { model: 'anthropic/sonnet', effort: 'high' } },
    { name: '…and its catalogue\'s own list does not overrule that',
        src: OPENCODE, want: { model: '', effort: '' }, intent: { model: '', effort: 'low' } },

    // ---- ignorance is not evidence ----
    { name: '‼️ an engine that published no catalogue narrows NOTHING',
        src: SILENT, want: { model: 'anything', effort: 'made-up' },
        intent: { model: 'anything', effort: 'made-up' } },

    // ---- S-34: a value a real launch used is runnable ----
    { name: '‼️ S-34 — a remembered model survives a catalogue that never listed it',
        src: CLAUDE, opts: { keep: { model: 'my-alias', effort: 'xhigh' } },
        want: { model: 'my-alias', effort: 'xhigh' }, intent: { model: 'my-alias', effort: 'xhigh' } },
    { name: '…and so does the level that went with it',
        src: PER_MODEL, opts: { keep: { model: 'luna', effort: 'stopped-being-advertised' } },
        want: { model: 'luna', effort: 'stopped-being-advertised' },
        intent: { model: 'luna', effort: 'stopped-being-advertised' } },
    { name: '‼️ …but an ENGINE CHANGE hands no keep, and drops both',
        src: CLAUDE, opts: { keep: null }, want: { model: '', effort: '' },
        intent: { model: 'my-alias', effort: 'xhigh' } },
    { name: '…and a keep for a DIFFERENT value does not shelter this one',
        src: CLAUDE, opts: { keep: { model: 'other', effort: 'other' } },
        want: { model: '', effort: '' }, intent: { model: 'my-alias', effort: 'xhigh' } },

    // ---- the Console's "a model was just picked BY HAND" ----
    { name: 'preferModelDefault takes the model\'s own default over a still-valid effort',
        src: PER_MODEL, opts: { preferModelDefault: true }, want: { model: 'luna', effort: 'max' },
        intent: { model: 'luna', effort: 'low' } },
    { name: '…and still lands on nothing where that model states no usable default',
        src: PER_MODEL, opts: { preferModelDefault: true }, want: { model: 'gpt-5.5', effort: '' },
        intent: { model: 'gpt-5.5', effort: 'low' } },
    { name: '‼️ …and it OUTRANKS the keep, because the hand is more recent than the memory',
        src: PER_MODEL, opts: { preferModelDefault: true, keep: { model: 'luna', effort: 'low' } },
        want: { model: 'luna', effort: 'max' }, intent: { model: 'luna', effort: 'low' } },

    // ---- S-47 / K-28: the id recorded is not always the id published ----
    { name: '‼️ S-47 — a recorded tail resolves to the id the catalogue publishes',
        src: OPENCODE, opts: { resolveAlias: true }, want: { model: 'opencode/big-pickle', effort: '' },
        intent: { model: 'big-pickle', effort: '' } },
    { name: '‼️ …a tail claimed by SEVERAL ids resolves to nothing, rather than by luck',
        src: TWO_PROVIDERS, opts: { resolveAlias: true }, want: { model: '', effort: '' },
        intent: { model: 'kimi-k2', effort: '' } },
    { name: '‼️ …and the rule is INERT on a catalogue whose ids carry no slash',
        src: CLAUDE, opts: { resolveAlias: true }, want: { model: '', effort: '' },
        intent: { model: 'sonnet-4', effort: '' } },
    { name: '…while a surface that does not ask for it drops the tail, as it always did',
        src: OPENCODE, want: { model: '', effort: '' }, intent: { model: 'big-pickle', effort: '' } }
];

for (const c of CASES) {
    const nodeCat = NODE.catalog(c.src);
    const webCat = WEB.catalog(c.src);
    const a = NODE.narrow(nodeCat, c.intent, c.opts);
    const b = WEB.narrow(webCat, c.intent, c.opts);
    ok(c.name + ` (got ${JSON.stringify(a)})`, a.model === c.want.model && a.effort === c.want.effort);
    // ‼️ AND THE TWO SIDES SAY THE SAME THING. This is the assertion the four
    // copies could never make, and it is the reason the file is shared at all.
    ok('  …and the page answers it identically: ' + c.name,
        b.model === a.model && b.effort === a.effort);
}

/* =========================================================================
 * THE HOST'S OWN DOOR — the compiled path, proved rather than assumed.
 * ========================================================================= */
{
    const M = require(path.join(ROOT, 'out', 'core', 'models.js'));
    const check = (label, src, model, effort) => {
        const host = M.narrowLaunch(src.em || undefined, model, effort);
        const rule = NODE.narrow(NODE.catalog(src), { model, effort }, { resolveAlias: true });
        ok('‼️ narrowLaunch IS the rule, not a copy of it — ' + label,
            host.model === rule.model && host.effort === rule.effort);
    };
    // `narrowLaunch` builds its own catalogue view from `EngineModels` and its
    // fallback is EFFORT_CHOICES rather than a page's flat list, so the sources
    // below hand it the same thing it would have built.
    const L = require(path.join(ROOT, 'out', 'core', 'launch.js'));
    const asHost = src => ({ em: src.em, efforts: L.EFFORT_CHOICES });
    check('a model the engine does not offer', asHost(CLAUDE), 'gpt-5.5', '');
    check('an effort the model does not offer', asHost(PER_MODEL), 'luna', 'high');
    check('a recorded tail (S-47)', asHost(OPENCODE), 'big-pickle', '');
    check('a tail two providers claim', asHost(TWO_PROVIDERS), 'kimi-k2', '');
    check('an engine that published nothing', { em: null, efforts: L.EFFORT_CHOICES }, 'anything', 'made-up');

    // ‼️ AND THE EFFORT VOCABULARY IS THE SAME ONE. `effortsFor` is what fills
    // every effort picker on the host side; a second reading of the catalogue
    // here would put the box and the narrowing back out of step.
    ok('effortsFor reads the same catalogue the narrowing does',
        JSON.stringify(M.effortsFor(PER_MODEL.em, 'luna'))
        === JSON.stringify(NODE.effortsFor(NODE.catalog(asHost(PER_MODEL)), 'luna')));
    ok('…and answers the flat list for an engine that published nothing',
        JSON.stringify(M.effortsFor(undefined, 'anything')) === JSON.stringify(L.EFFORT_CHOICES));
}

/* =========================================================================
 * S-34's OTHER HALF — a control that cannot say what is set is a control that
 * lies. `withCurrent` is why the alias above has a row to sit on.
 * ========================================================================= */
{
    const rows = [{ id: '' }, { id: 'sonnet' }];
    ok('withCurrent puts a value the catalogue never listed onto the list',
        NODE.withCurrent(rows, 'my-alias').length === 3);
    ok('…and leaves the list alone when the value is already on it',
        NODE.withCurrent(rows, 'sonnet').length === 2);
    ok('…and adds nothing for an empty value — "Default" is already a row',
        NODE.withCurrent(rows, '').length === 2);
    ok('…and the page agrees',
        WEB.withCurrent(rows, 'my-alias').length === NODE.withCurrent(rows, 'my-alias').length);

    const cat = NODE.catalog(PER_MODEL);
    ok('vocabularyFor answers the model picker with what is set on it',
        NODE.vocabularyFor(cat, 'model', { model: 'my-alias' }).some(r => r.id === 'my-alias'));
    ok('…and the effort picker with the levels of THAT model',
        NODE.vocabularyFor(cat, 'effort', { model: 'luna', effort: '' }).map(r => r.id).join(',') === 'low,max');
    ok('‼️ …with whatever is really set on it, even a level the catalogue dropped',
        NODE.vocabularyFor(cat, 'effort', { model: 'luna', effort: 'gone' })
            .map(r => r.id).join(',') === 'low,max,gone');
    ok('‼️ …and a dimension it has never heard of gets [] rather than a guess',
        NODE.vocabularyFor(cat, 'providerId', {}).length === 0);
}

/* =========================================================================
 * ‼️ AND THERE IS ONLY ONE COPY LEFT.
 *
 * The four bodies are gone, not shadowed: a surface that kept its own would
 * pass every test above and still be free to drift, which is the failure this
 * whole item exists to end. Measured as absence of the rule's own arithmetic in
 * any file but its own.
 * ========================================================================= */
{
    const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
    const pages = ['console.js', 'tasksPage.js', 'afEngine.js'];
    for (const f of pages) {
        const src = read('media', f);
        ok('media/' + f + ' asks the rule instead of carrying it',
            /window\.AFLaunch\./.test(src));
        // The one arithmetic the rule owns: falling back to a model's own
        // default effort. All three used to spell it out; none may now, and
        // `defaultEffort` is a word no page has any other reason to say.
        ok('‼️ media/' + f + ' no longer carries the default-effort fallback itself',
            !/defaultEffort/.test(src));
    }
    // ‼️ `src/core/models.ts` IS ALLOWED TO SAY `defaultEffort` — it is what
    // BUILDS the catalogues, reading each CLI's own file off disk. What it may
    // no longer do is READ one back to decide a launch: that is the rule's
    // arithmetic, and having it here again is how the host and the pages came
    // to answer one pair two ways. Comments are stripped, so the prose that
    // explains the rule is not mistaken for the rule.
    const modelsTs = read('src', 'core', 'models.ts')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    ok('src/core/models.ts loads the rule out of media/', /from '\.\/aflaunch'/.test(modelsTs));
    ok('‼️ …and no longer reads a default effort back to decide a launch',
        !/\.defaultEffort\[/.test(modelsTs));
    ok('…while it still BUILDS the catalogues that carry one',
        /defaultEffort\[id\] =/.test(modelsTs));
    ok('‼️ the rule itself is the only file that spells it out',
        /defaultEffort \|\| \{\}\)\[txt\(model\)\]/.test(read('media', 'afLaunch.js')));
    // ‼️ AND THE HOST LOADS THE FILE RATHER THAN A COPY OF IT — the same
    // arrangement afTime.js and afQuery.js are proved by.
    ok('‼️ src/core/aflaunch.ts requires media/afLaunch.js, it does not restate it',
        /require\(path\.join\(__dirname, '\.\.', '\.\.', 'media', 'afLaunch\.js'\)\)/
            .test(read('src', 'core', 'aflaunch.ts')));
    // ‼️ AND EVERY PAGE GETS IT, rather than the pages that remembered to ask.
    const shell = read('src', 'panels', 'base.ts');
    ok('‼️ the shell ships it to every page, before afEngine.js which asks it',
        shell.indexOf("'afLaunch.js'") > 0
        && shell.indexOf('${launch}') < shell.indexOf('${engine}'));
    const shared = require(path.join(__dirname, 'lib_shared_media.js'));
    ok('…and the shared list still matches the shell', shared.matchesShell());
    ok('…with afLaunch.js on it', shared.SHARED.indexOf('afLaunch.js') >= 0);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
