// U-89 — what actually goes in a JSON settings box (compiled core/settingShape.js).
//
// What is being defended here:
//   - the answer is DERIVED FROM THE SCHEMA, never a list of keys. The proof is
//     that this test asks it about the REAL package.json: a setting added
//     tomorrow explains itself with nobody editing the page, and a hand-written
//     list would go stale the first time somebody forgot it.
//   - an example that does not validate is worse than no example, because the
//     reader trusts it. So the schema's own default wins wherever there is one,
//     and an enum contributes a value it actually allows.
//   - a setting that is NOT a JSON box gets nothing. An explanation attached to
//     a checkbox is an explanation of a control that needs none.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const S = require(path.join(__dirname, '..', 'out', 'core', 'settingShape.js'));
const manifest = require(path.join(__dirname, '..', 'package.json'));
const PROPS = manifest.contributes.configuration.properties;

// ---------------------------------------------------------------------------
// the settings that are NOT a JSON box get nothing at all
// ---------------------------------------------------------------------------
{
    ok('‼️ a string, a number, a boolean and an enum get no shape — a panel over a'
        + ' checkbox would explain a control that needs none',
        S.shapeOf({ type: 'string' }) === undefined
        && S.shapeOf({ type: 'number' }) === undefined
        && S.shapeOf({ type: 'boolean' }) === undefined
        && S.shapeOf({ type: 'string', enum: ['a', 'b'] }) === undefined);
    ok('…and neither does nothing at all', S.shapeOf(undefined) === undefined);
}

// ---------------------------------------------------------------------------
// the four shapes, each read off the REAL manifest
// ---------------------------------------------------------------------------
{
    const rows = S.shapeOf(PROPS['agentFarm.cliProfiles']);
    ok('a list of objects is a table of ENTRIES', rows && rows.kind === 'rows');
    ok('…and every field the manifest declares is named, with its type',
        rows.fields.length === 3
        && rows.fields.every(f => f.name && f.type)
        && rows.fields.map(f => f.name).join(',') === 'name,headless,interactive');
    ok('‼️ …carrying the sentence the manifest ALREADY wrote about each one — which is'
        + ' the whole finding: the answer was six feet away in the same file',
        rows.fields.filter(f => f.description).length === 3);
    ok('…and the example is a list with one complete entry in it',
        Array.isArray(rows.example) && rows.example.length === 1
        && Object.keys(rows.example[0]).length === 3);

    const list = S.shapeOf(PROPS['agentFarm.browserAllowHosts']);
    ok('‼️ a list of plain values says there is NO structure to get right — which is'
        + ' the honest answer for ten of these settings and was never said',
        list && list.kind === 'list' && list.itemType === 'string' && !list.fields.length);

    const form = S.shapeOf(PROPS['agentFarm.taskRetry']);
    ok('one object with declared properties is a FORM, not a list',
        form && form.kind === 'form' && form.fields.length === 16);
    ok('…and its example is an object, not an array',
        form.example && !Array.isArray(form.example) && typeof form.example === 'object');

    const map = S.shapeOf(PROPS['agentFarm.budgets']);
    ok('‼️ a free-form object is a MAP whose keys are the user\'s — nothing can list'
        + ' them, and pretending to would be worse than saying so',
        map && map.kind === 'map' && !map.fields.length);
}

// ---------------------------------------------------------------------------
// ‼️ an example that does not validate is worse than none
// ---------------------------------------------------------------------------
{
    const retry = S.shapeOf(PROPS['agentFarm.taskRetry']).example;
    const props = PROPS['agentFarm.taskRetry'].properties;
    ok('‼️ THE SCHEMA\'S OWN DEFAULT WINS: an example that contradicts the shipped'
        + ' behaviour teaches the wrong thing',
        Object.entries(props).every(([k, p]) =>
            p.default === undefined || p.type === 'array' || p.type === 'object'
            || retry[k] === p.default));
    ok('…and where a field names its allowed values, the example uses one of them',
        Object.entries(props).every(([k, p]) =>
            !Array.isArray(p.enum) || p.enum.indexOf(retry[k]) >= 0));

    const enumField = S.shapeOf({
        type: 'array',
        items: { type: 'object', properties: { when: { type: 'string', enum: ['limit', 'any'] } } }
    });
    ok('an enum field is drawn with the values it accepts',
        enumField.fields[0].allowed.join(',') === 'limit,any');
    ok('…and the example picks one of them, not a placeholder',
        enumField.example[0].when === 'limit');

    const req = S.shapeOf({
        type: 'array',
        items: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, note: { type: 'string' } } }
    });
    ok('a required field is marked, and an optional one is not',
        req.fields[0].required === true && req.fields[1].required === false);
    ok('a string with nothing else said gets the FIELD\'S OWN NAME as its placeholder —'
        + ' "<name>" reads as an instruction where "string" does not',
        req.example[0].name === '<name>');
    ok('a number falls to its declared minimum rather than to a guess',
        S.shapeOf({ type: 'object', properties: { n: { type: 'number', minimum: 3 } } }).example.n === 3);
    ok('a nested list is a list of the right thing',
        Array.isArray(S.shapeOf({
            type: 'object', properties: { hosts: { type: 'array', items: { type: 'string' } } }
        }).example.hosts));
}

// ---------------------------------------------------------------------------
// ‼️ EVERY JSON BOX IN THE SHIPPED MANIFEST IS COVERED — the claim is about all
// of them, so the test is about all of them, and a new one that this cannot
// explain fails here rather than being discovered on the page.
// ---------------------------------------------------------------------------
{
    const boxes = Object.entries(PROPS).filter(([, p]) => {
        const t = Array.isArray(p.type) ? p.type[0] : p.type;
        return t === 'array' || t === 'object';
    });
    ok('there are JSON boxes to explain at all', boxes.length >= 27);
    const shaped = boxes.map(([k, p]) => [k, S.shapeOf(p)]);
    ok('‼️ every one of them gets a shape', shaped.every(([, s]) => !!s));
    ok('…and every one of them a sentence saying what the value IS',
        shaped.every(([, s]) => s.summary.length > 20));
    const free = shaped.filter(([, s]) => s.kind === 'free');
    ok('…and the ones the schema genuinely does not describe SAY SO rather than'
        + ' pretending — there is exactly one, and it is named here so a second'
        + ' one is a decision somebody makes on purpose',
        free.length === 1 && free[0][0] === 'agentFarm.livingChecks');
    // ‼️ A PANEL OF NAMES AND TYPES IS HALF A PANEL. Two settings declared their
    // fields and described none of them, so their panels read "match · string"
    // and stopped — which answers what to TYPE and not what it MEANS. The
    // schema was filled in rather than the page taught to apologise.
    const described = (key) => S.shapeOf(PROPS[key]).fields.every(f => !!f.description);
    ok('‼️ every row setting describes every field it declares — pricing and'
        + ' mediaPricing were the two that did not',
        shaped.filter(([, s]) => s.kind === 'rows' || s.kind === 'form')
            .every(([k]) => described(k)));
    ok('…and the ones that decide a match say the rule the reader cannot guess:'
        + ' first match wins, so order matters',
        /first rule that matches wins/i.test(S.shapeOf(PROPS['agentFarm.pricing']).fields[0].description)
        && /first rule that matches wins/i.test(S.shapeOf(PROPS['agentFarm.mediaPricing']).fields[0].description));
    ok('every shape that offers an example offers one that survives a round trip',
        shaped.every(([, s]) => s.example === undefined
            || JSON.stringify(JSON.parse(S.exampleText(s))) === JSON.stringify(s.example)));
    ok('and a shape with no example produces no text', S.exampleText(undefined) === '');
}

// ---------------------------------------------------------------------------
// the wiring: read once in the model, drawn once on the page
// ---------------------------------------------------------------------------
{
    const fs = require('fs');
    const ops = require(path.join(__dirname, '..', 'out', 'core', 'settingsops.js'));
    const built = ops.buildSettingsModel(
        { 'agentFarm.cliProfiles': PROPS['agentFarm.cliProfiles'], 'agentFarm.livePort': PROPS['agentFarm.livePort'] },
        () => undefined);
    const items = built.reduce((a, c) => a.concat(c.items), []);
    ok('‼️ the shape is read in the MODEL, so the next surface that lists settings'
        + ' does not have to ask for it',
        !!items.find(i => i.key === 'agentFarm.cliProfiles').shape);
    ok('…and a scalar setting carries none',
        items.find(i => i.key === 'agentFarm.livePort').shape === undefined);

    const page = fs.readFileSync(path.join(__dirname, '..', 'media', 'settings.js'), 'utf8');
    ok('the page draws it under the JSON box, beside Apply', /shapeHtml\(it\)/.test(page));
    ok('‼️ …as an AFTip and not a title, because a field table is text that has to'
        + ' be scrollable and enterable (docs/CONVENTIONS.md)',
        /window\.AFTip\.wrap\(/.test(page.slice(page.indexOf('function shapeHtml'),
            page.indexOf('function exampleText'))));
    ok('…named so the panel can be photographed (U-81)', /'tip-shape'/.test(page));
    ok('‼️ …and Example writes into the BOX and saves NOTHING: a button that silently'
        + ' overwrote a live setting with a sample would be the worst reading of'
        + ' "show me what goes here"',
        /ta\.value = exampleText\(item\.shape\)/.test(page)
        && !/postMessage\(\{ type: 'set', key, value: exampleText/.test(page));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
