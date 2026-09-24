// X-367 — THE FLEX POINT REGISTRY (media/afFlex.js) AND ITS PARITY.
//
// A registry nobody checks decays like the prose it replaced. So every level a
// point declares is RESOLVED here against the real files: its surface must exist
// (a contributed setting and schema path, or an element id on the named page) and
// its bridge key must reach a registered op that really carries it. And the other
// direction: a supervisor box on the task form, or a field of the settings schema,
// that no point claims is red too.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));

const F = require(path.join(ROOT, 'media', 'afFlex.js'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const conf = pkg.contributes.configuration;
const PROPS = Object.assign({}, ...(Array.isArray(conf) ? conf : [conf]).map(c => c.properties || {}));

/** Every .ts under src/, read once — where ops are registered. */
const SRC = (function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory()
        ? walk(path.join(dir, d.name))
        : d.name.endsWith('.ts') ? [fs.readFileSync(path.join(dir, d.name), 'utf8')] : []);
})(path.join(ROOT, 'src'));

/** The registration block of one op — from `op: '<op>'` to the next op. */
function opBlock(op) {
    for (const text of SRC) {
        const at = text.indexOf(`op: '${op}'`);
        if (at < 0) { continue; }
        const next = text.indexOf("op: '", at + 5);
        return text.slice(at, next < 0 ? undefined : next);
    }
    return null;
}

/** `agentFarm.x#a.b` → the schema node, or null. */
function schemaNode(ref) {
    const [key, sub] = ref.split('#');
    let node = PROPS[key];
    for (const seg of sub ? sub.split('.') : []) { node = node && node.properties ? node.properties[seg] : null; }
    return node || null;
}

/** A surface string resolved: `{ ok, node? }`. */
function resolveSurface(s) {
    if (s.startsWith('setting:')) {
        const node = schemaNode(s.slice(8));
        return { ok: !!node, node };
    }
    const [file, id] = s.split('#');
    const full = path.join(ROOT, file);
    return { ok: !!id && fs.existsSync(full) && fs.readFileSync(full, 'utf8').indexOf(`'${id}'`) >= 0 };
}

/** A bridge key resolved: settings.set is allowlisted by the schema; any other op must name the path. */
function resolveBridge(b) {
    const colon = b.indexOf(':');
    const op = b.slice(0, colon), arg = b.slice(colon + 1);
    const block = opBlock(op);
    if (!block) { return false; }
    if (op === 'settings.set') { return !!schemaNode(arg); }
    return arg.split(/[.#]/).every(seg => new RegExp('\\b' + seg + '\\b').test(block));
}

/* ---------- the registry is sound, and its two sides agree ---------- */
{
    eq('the chain, lowest to highest', F.LEVELS,
        ['builtin', 'settings', 'agent', 'project', 'workflow', 'step', 'run', 'live']);
    eq('the registry itself has no structural problem', F.problems(), []);
    ok('every level has a label', F.LEVELS.every(l => typeof F.LEVEL_LABELS[l] === 'string'));

    const ts = fs.readFileSync(path.join(ROOT, 'src', 'core', 'flexPoints.ts'), 'utf8');
    const union = name => ((ts.match(new RegExp(`export type ${name} = ([^;]+);`)) || [])[1] || '')
        .split('|').map(s => s.trim().replace(/'/g, '')).filter(Boolean);
    eq('FlexLevel in the typed door = LEVELS', union('FlexLevel'), F.LEVELS);
    eq('FlexType in the typed door = TYPES', union('FlexType'), F.TYPES);
    eq('FlexTriState in the typed door = TRI', union('FlexTriState'), F.TRI);
}

/* ---------- ‼️ every declared level resolves: a surface AND a bridge key ---------- */
{
    for (const p of F.POINTS) {
        for (const level of F.levelsOf(p.id)) {
            const e = p.levels[level];
            const s = resolveSurface(e.surface);
            ok(`${p.id} @${level}: surface ${e.surface} exists`, s.ok);
            ok(`${p.id} @${level}: bridge ${e.bridge} reaches a registered op that carries it`, resolveBridge(e.bridge));
            if (s.node && s.node.default !== undefined) {
                eq(`${p.id} @${level}: the shipped default is the point's default`, s.node.default, p.default);
            }
            if (s.node && Array.isArray(s.node.enum) && p.type === 'tri') {
                eq(`${p.id}: the schema offers exactly the tri point's values`,
                    s.node.enum.slice().sort(), F.TRI.map(t => p.states[t]).sort());
            }
        }
    }
}

/* ---------- ‼️ and the other direction: nothing on a surface is unclaimed ---------- */
{
    const claimed = where => F.POINTS.flatMap(p => Object.values(p.levels).map(e => e.surface)).filter(where);

    const sup = fs.readFileSync(path.join(ROOT, 'media', 'afSupervisor.js'), 'utf8');
    const boxes = ((sup.match(/const IDS = \[([^\]]+)\]/) || [])[1] || '').match(/nt-[\w-]+/g) || [];
    ok('the task form has supervisor boxes to check', boxes.length >= 6);
    const onForm = claimed(s => s.startsWith('media/afSupervisor.js#')).map(s => s.split('#')[1]);
    eq('every supervisor box on the task form is a flex point, and no point claims a box that is gone',
        boxes.slice().sort(), onForm.slice().sort());

    const fields = Object.keys(schemaNode('agentFarm.taskRetry#supervisor').properties || {});
    const inSettings = claimed(s => s.startsWith('setting:agentFarm.taskRetry#supervisor.')).map(s => s.split('.').pop());
    eq('every field of the supervisor settings schema is a flex point', fields.slice().sort(), inSettings.slice().sort());
}

/* ---------- the supervisor points agree with the code that runs them ---------- */
{
    const R = require(path.join(ROOT, 'out', 'core', 'retrySupervisor.js'));
    const pt = id => F.point('retry.supervisor.' + id);
    eq('maxCalls default = SUPERVISOR_DEFAULT_CALLS', pt('maxCalls').default, R.SUPERVISOR_DEFAULT_CALLS);
    eq('maxCalls ceiling = SUPERVISOR_MAX_CALLS', pt('maxCalls').max, R.SUPERVISOR_MAX_CALLS);
    eq('minConfidence default = SUPERVISOR_DEFAULT_CONFIDENCE', pt('minConfidence').default, R.SUPERVISOR_DEFAULT_CONFIDENCE);
    eq('the tri states map onto SUPERVISOR_FALLBACKS', F.TRI.map(t => pt('lowConfidence').states[t]).sort(),
        R.SUPERVISOR_FALLBACKS.slice().sort());
    eq('an empty policy normalises to the registry defaults',
        (({ maxCalls, minConfidence, lowConfidence }) => [maxCalls, minConfidence, lowConfidence])(R.normalizeSupervisor({ engine: 'claude' })),
        [pt('maxCalls').default, pt('minConfidence').default, pt('lowConfidence').default]);
    eq('a supervisor field means nothing on a retry that is not supervised',
        F.applies('retry.supervisor.model', { retryBehavior: 'smart' }).ok, false);
    ok('…and says why', /supervisor/.test(F.applies('retry.supervisor.model', { retryBehavior: 'smart' }).why));
    eq('an unstated fact means it applies', F.applies('retry.supervisor.model', {}).ok, true);
    eq('a point with no applies always applies', F.applies('judge.args', { retryBehavior: 'smart' }).ok, true);
    ok('the Farm Settings level lists the scattered settings', ['judge.args', 'sentry.leaderModel',
        'sentry.leaderBudgetUsd', 'media.budgetMonthUSD'].every(id => F.pointsAt('settings').indexOf(id) >= 0));
}

/* ---------- ‼️ the validator is not a rubber stamp: each defect is named ---------- */
{
    const good = () => ({
        id: 'x.y', label: 'X', type: 'number', default: 1, remembered: false, min: 0,
        levels: { settings: { surface: 'setting:agentFarm.x', bridge: 'settings.set:agentFarm.x' } }
    });
    eq('a sound point passes', F.problems([good()]), []);
    const bad = (n, mut, re) => { const p = good(); mut(p); ok(n, F.problems([p]).some(s => re.test(s))); };
    bad('a level with no bridge key is red', p => { delete p.levels.settings.bridge; }, /@settings: no bridge/);
    bad('a level with no surface is red', p => { p.levels.settings.surface = ' '; }, /@settings: no surface/);
    bad('an extra key on a level is red', p => { p.levels.settings.pages = 'x'; }, /unknown key "pages"/);
    bad('declaring builtin as a level is red', p => { p.levels.builtin = { surface: 'a', bridge: 'b' }; }, /builtin is the default/);
    bad('an unknown level is red', p => { p.levels.team = { surface: 'a', bridge: 'b' }; }, /unknown level "team"/);
    bad('a point settable nowhere is red', p => { p.levels = {}; }, /settable at no level/);
    bad('an unknown type is red', p => { p.type = 'colour'; }, /unknown type/);
    bad('a default outside the range is red', p => { p.default = -1; }, /default is not a valid number/);
    bad('a tri point must map all three states', p => { p.type = 'tri'; p.states = { ask: 'a', auto: 'b' }; p.default = 'a'; },
        /maps ask, auto and never/);
    bad('remembered must be said', p => { delete p.remembered; }, /remembered must be said/);
    bad('applies must be a function', p => { p.applies = true; }, /applies must be a function/);
    ok('a duplicate id is red', F.problems([good(), good()]).some(s => /declared twice/.test(s)));
    ok('a surface that does not exist does not resolve', !resolveSurface('setting:agentFarm.noSuchKey').ok
        && !resolveSurface('media/afSupervisor.js#nt-nosuchbox').ok);
    ok('a bridge key naming an unregistered op does not resolve', !resolveBridge('tasks.nosuch:retry.x'));
    ok('a bridge key naming a path the op does not carry does not resolve', !resolveBridge('tasks.add:retry.nosuchfield'));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
