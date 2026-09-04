// X-150 — THE LAUNCH DIMENSIONS AS DATA (media/afDimensions.js).
//
// ‼️ WHAT THIS FILE IS ACTUALLY GUARDING, AND IT IS NOT THE ARRAY.
//
// A constant nobody checks decays exactly like the 1.690-line document it
// replaced. The measurement behind X-148 is what that looks like: `providerId`
// and `tier` were added to `LaunchOptions`, wired into the launcher, and never
// given a box in the Console composer — and NOTHING WENT RED, because the
// sentence "every dimension is carried by every door" was prose.
//
// So the array is pinned to `LaunchOptions` IN BOTH DIRECTIONS. A field added
// to the interface with no row here fails; a row here for a field that no
// longer exists fails. And every derivation that used to count these fields by
// hand is checked against the fold that replaced it — because a list that
// derivations do not actually fold over is a list that is already wrong.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const D = require(path.join(ROOT, 'media', 'afDimensions.js'));
const launchTs = fs.readFileSync(path.join(ROOT, 'src', 'core', 'launch.ts'), 'utf8');

/** The fields of one exported interface, read out of the source. */
function fieldsOf(name) {
    const at = launchTs.indexOf(`export interface ${name} {`);
    if (at < 0) { return []; }
    // The interface bodies here are comment-heavy, so the end is found by the
    // first `}` sitting on its own in column 0 — which is how this file writes
    // them and how `test_launch.js` already reads them.
    const end = launchTs.indexOf('\n}', at);
    const body = launchTs.slice(at, end);
    const out = [];
    const re = /^ {4}(\w+)\??:/gm;
    let m;
    while ((m = re.exec(body))) { if (out.indexOf(m[1]) < 0) { out.push(m[1]); } }
    return out;
}

/* =========================================================================
 * ‼️ THE ARRAY AND THE INTERFACE, PINNED TO EACH OTHER FROM BOTH ENDS.
 * ========================================================================= */
{
    const declared = fieldsOf('LaunchOptions');
    const listed = D.ids();
    ok('LaunchOptions still declares 17 dimensions (got ' + declared.length + ')',
        declared.length === 17);
    eq('‼️ every dimension LaunchOptions declares has a row, in the same order',
        listed, declared);
    const orphan = listed.filter(id => declared.indexOf(id) < 0);
    eq('‼️ …and no row describes a dimension that no longer exists', orphan, []);
    ok('every row states who the answer belongs to',
        D.LAUNCH_DIMENSIONS.every(d => ['user', 'engine', 'farm'].indexOf(d.owner) >= 0));
    ok('‼️ …and why it is the way it is — a flag with no reason is a flag nobody can change',
        D.LAUNCH_DIMENSIONS.every(d => typeof d.why === 'string' && d.why.length > 30));
    ok('the three derivable flags are stated on every row, never left to default',
        D.LAUNCH_DIMENSIONS.every(d =>
            typeof d.remembered === 'boolean' && typeof d.perEngine === 'boolean'
            && typeof d.redraws === 'boolean'));
}

/* =========================================================================
 * WHAT IS REMEMBERED, AND ON WHICH ROW.
 * ========================================================================= */
{
    const remembered = D.idsWhere('remembered');
    const perEngine = D.idsWhere('perEngine');
    eq('the engine-owned dimensions are the six of EngineLaunchMemory',
        perEngine.slice().sort(), fieldsOf('EngineLaunchMemory').slice().sort());
    ok('‼️ …and a per-engine dimension is by definition a remembered one',
        perEngine.every(id => remembered.indexOf(id) >= 0));
    eq('the two remembered FLAT dimensions are the engine and the discipline',
        remembered.filter(id => perEngine.indexOf(id) < 0).slice().sort(),
        ['engine', 'superpowers']);

    // ‼️ THE EXEMPTION IS COUNTED, NOT ASSUMED. `seedIntent` folds over the
    // per-engine six only, because `engine` decides which row the six are read
    // FROM and `superpowers` has a third state that a string fold would spell
    // as ''. That is a correct exemption and it is exactly the kind that rots:
    // so each one has to still be inherited BY NAME in withLastLaunch, and a
    // third flat dimension arriving with nobody to inherit it goes red here.
    const seedBody = launchTs.slice(launchTs.indexOf('export function withLastLaunch'),
        launchTs.indexOf('export function rememberedOn'));
    for (const id of remembered.filter(x => perEngine.indexOf(x) < 0)) {
        ok('‼️ the flat dimension `' + id + '` is inherited by name in withLastLaunch',
            new RegExp('\\b' + id + '\\b').test(seedBody));
    }
    ok('…while the folded six are NOT named there any more',
        !perEngine.some(id => new RegExp('\\b' + id + ':').test(seedBody)));
    ok('‼️ …and the fold is what puts them back', /seedIntent\(/.test(seedBody));
}

/* =========================================================================
 * THE COMPILED HOST READS THE SAME LIST.
 * ========================================================================= */
{
    const L = require(path.join(ROOT, 'out', 'core', 'launch.js'));
    eq('‼️ ENGINE_MEMORY_FIELDS IS the per-engine list, not a copy of it',
        Array.from(L.ENGINE_MEMORY_FIELDS), D.idsWhere('perEngine'));

    // The row a launch writes back: every engine-owned dimension, blank
    // included. A row that omitted a field would let the previous engine's
    // value show through the merge in `rememberedOn`.
    const row = L.launchToRemember(
        { engine: 'claude', model: 'opus', effort: 'high', permissionMode: 'plan' }, 'console');
    eq('a launch files exactly the engine-owned dimensions under its engine',
        Object.keys(row.byEngine.claude).slice().sort(), D.idsWhere('perEngine').slice().sort());
    ok('…writing \'\' for the ones it chose none of',
        row.byEngine.claude.providerId === '' && row.byEngine.claude.tier === ''
        && row.byEngine.claude.variant === '');

    // ‼️ AND `undefined` SURVIVES AS A THIRD STATE (K-34). Folding superpowers
    // would have spelt it '' and turned "the agent's own default decides" into
    // an answer nobody gave.
    ok('‼️ a launch that says nothing about superpowers records nothing about it',
        !('superpowers' in row));
    ok('…while one that says false records false, which is not the same answer',
        L.launchToRemember({ engine: 'claude', superpowers: false }).superpowers === false);

    // Inheritance: a written answer wins, a blank one inherits, and the row is
    // the ENGINE's (X-103/X-145) rather than the flat record's.
    const last = {
        engine: 'claude', model: 'flat-model', superpowers: true,
        byEngine: { codex: { model: 'gpt-5.5', effort: 'max', permissionMode: '', providerId: '', tier: '', variant: '' } }
    };
    const onCodex = L.withLastLaunch({ engine: 'codex' }, last);
    ok('‼️ a launch inherits the row of the engine it is ON, not the flat record',
        onCodex.model === 'gpt-5.5' && onCodex.effort === 'max');
    ok('…and its own written answer still beats the row',
        L.withLastLaunch({ engine: 'codex', model: 'luna' }, last).model === 'luna');
    ok('…and the discipline is inherited flat, because it belongs to the agent',
        onCodex.superpowers === true);
}

/* =========================================================================
 * ‼️ S-51 — THE SHELL KEY IS DERIVED, WHICH IS WHY THE CLASS IS CLOSED.
 * ========================================================================= */
{
    const redraws = D.idsWhere('redraws');
    eq('the dimensions that rebuild the composer shell are the four that decide which boxes exist',
        redraws.slice().sort(), ['engine', 'model', 'providerId', 'tier']);

    const base = { engine: 'claude', model: 'opus', providerId: '', tier: '' };
    ok('a key is only as long as the list it is folded from',
        D.shellKeyOf(base).split('|').length === redraws.length);
    // ‼️ EVERY redraws DIMENSION MOVES THE KEY. This is the assertion the
    // hand-written string could not make about itself, and S-51 is what its
    // absence cost: a dimension left out of that line changes nothing, and the
    // line looks complete either way.
    for (const id of redraws) {
        const moved = Object.assign({}, base);
        moved[id] = 'CHANGED';
        ok('‼️ changing `' + id + '` rebuilds the shell', D.shellKeyOf(moved) !== D.shellKeyOf(base));
    }
    // …and nothing else does, or every keystroke would detach the caret (M-33).
    for (const id of D.ids().filter(x => redraws.indexOf(x) < 0)) {
        const moved = Object.assign({}, base);
        moved[id] = 'CHANGED';
        ok('`' + id + '` does not, so it cannot repaint under the hand', D.shellKeyOf(moved) === D.shellKeyOf(base));
    }
    ok('an absent answer and an empty one are the same shape',
        D.shellKeyOf({ engine: 'claude' }) === D.shellKeyOf({ engine: 'claude', model: '', providerId: '', tier: '' }));

    // ‼️ AND THE PAGE ASKS FOR IT RATHER THAN SPELLING IT OUT — the line this
    // replaced is the one S-51 lived in.
    const consoleJs = fs.readFileSync(path.join(ROOT, 'media', 'console.js'), 'utf8');
    ok('‼️ the Console builds its shell key from the list',
        /window\.AFDimensions\.shellKeyOf\(/.test(consoleJs));
    ok('…and no longer writes the dimensions into that line by hand',
        !/const composerShape = s \? '' : `\|\$\{engineNow\(\)\}\|/.test(consoleJs));
}

/* =========================================================================
 * WHERE A DIMENSION DOES NOT EXIST AT ALL.
 * ========================================================================= */
{
    ok('‼️ an engine with no effort flag has no effort dimension, not an empty one',
        D.applies('effort', { engine: 'opencode', takesEffort: false }) === false);
    ok('…and one that takes efforts has it', D.applies('effort', { engine: 'claude', takesEffort: true }));
    ok('a tier exists only where the route publishes tiers',
        D.applies('tier', { hasTiers: false }) === false && D.applies('tier', { hasTiers: true }));
    ok('a route exists only on an engine with a provider axis',
        D.applies('providerId', { hasProviderAxis: false }) === false);
    ok('a variant exists only where the chosen model publishes one',
        D.applies('variant', { hasVariants: false }) === false);
    ok('an account exists only on an engine whose sign-in can be sealed (X-169)',
        D.applies('account', { hasAccounts: false }) === false && D.applies('account', { hasAccounts: true }));
    ok('‼️ an UNSTATED fact means the dimension applies — a dimension nobody ruled out is one that holds',
        D.applies('effort', {}) && D.applies('tier', {}) && D.applies('providerId', {})
        && D.applies('account', {}));
    ok('a dimension with no gate always applies', D.applies('model', { takesEffort: false }));
    ok('and one that does not exist applies to nothing', D.applies('nonsense', {}) === false);
}

/* =========================================================================
 * BOTH SIDES LOAD THE SAME FILE.
 * ========================================================================= */
{
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'media', 'afDimensions.js'), 'utf8'), sandbox);
    const W = sandbox.window.AFDimensions;
    ok('the page gets the list off `window`', !!W && W.ids().length === D.ids().length);
    eq('…and it is the same list, in the same order', W.ids(), D.ids());
    ok('…answering the shell key identically',
        W.shellKeyOf({ engine: 'codex', model: 'luna' }) === D.shellKeyOf({ engine: 'codex', model: 'luna' }));

    const dimsTs = fs.readFileSync(path.join(ROOT, 'src', 'core', 'launchDimensions.ts'), 'utf8');
    ok('‼️ the host requires media/afDimensions.js rather than restating it',
        /require\(path\.join\(__dirname, '\.\.', '\.\.', 'media', 'afDimensions\.js'\)\)/.test(dimsTs));
    ok('‼️ …and derives the id type from LaunchOptions, so the two are pinned in TypeScript too',
        /export type LaunchDimensionId = keyof LaunchOptions/.test(dimsTs));

    const shell = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'base.ts'), 'utf8');
    ok('every page is shipped the list', shell.indexOf("'afDimensions.js'") > 0);
    const shared = require(path.join(__dirname, 'lib_shared_media.js'));
    ok('…and the shared list still matches the shell', shared.matchesShell());
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
