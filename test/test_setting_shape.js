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
        form && form.kind === 'form' && form.fields.length === 18);
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
    ok('‼️ U-109 — and there is no longer a single one the schema refuses to'
        + ' describe. `livingChecks` was the last, and it got its items schema'
        + ' rather than the page being taught to apologise; a new `free` box is'
        + ' a decision somebody makes on purpose, and it fails here first',
        free.length === 0);
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

    const page = require('./lib_settings_source').settingsPageSource();
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

// ---------------------------------------------------------------------------
// ‼️ U-108 — A PLAIN LIST IS NOT A JSON DOCUMENT
//
// Nine settings are an array of strings or numbers — root folders, excluded
// folders, model names, chat ids, hosts. `items.type` is `string` or `number`
// and there is no structure to get right in any of them, so asking the user for
// brackets, quotes and commas was asking them to hand-assemble a value the page
// could take one line at a time.
//
// These assertions are asked of the REAL manifest on purpose (see the head of
// this file): a claim about which settings are lists, proved against invented
// data, proves nothing about the page a person opens.
// ---------------------------------------------------------------------------
{
    const fs2 = require('fs');
    const lists = Object.entries(PROPS)
        .map(([k, p]) => [k, S.shapeOf(p)])
        .filter(([, sh]) => sh && sh.kind === 'list');
    ok('‼️ the manifest really does have plain lists, and this test is about them',
        lists.length >= 8);
    ok('…every one of them names the type of ONE entry, which is what a row is',
        lists.every(([, sh]) => sh.itemType === 'string' || sh.itemType === 'number'));

    const shapeOfKey = (k) => S.shapeOf(PROPS[k]);
    ok('‼️ A LIST OF PATHS OFFERS A PICKER PER ROW, and which lists those are is a'
        + ' fact of the SCHEMA (items.x-af-browse) rather than a list of keys'
        + ' somebody has to remember to extend',
        shapeOfKey('agentFarm.agentRoots').itemBrowse === 'folder'
        && shapeOfKey('agentFarm.excludeAgentDirs').itemBrowse === 'folder');
    ok('…and a list that is not paths does not pretend to be',
        shapeOfKey('agentFarm.modelAliases').itemBrowse === undefined
        && shapeOfKey('agentFarm.telegram.allowedChats').itemBrowse === undefined);
    ok('…a list whose entries are a closed set says so, so the row can be a picker'
        + ' instead of a text box',
        lists.every(([, sh]) => sh.itemAllowed === undefined
            || (Array.isArray(sh.itemAllowed) && sh.itemAllowed.length > 0)));

    const page = require('./lib_settings_source').settingsPageSource();
    ok('‼️ the page chooses the editor from the SHAPE, never from a key list — a'
        + ' setting added tomorrow gets it with nobody touching that file',
        /it\.shape && !jsonMode\[it\.key\]/.test(page)
        && /it\.shape\.kind === 'list'\) \{ return listHtml\(it\); \}/.test(page)
        && !/agentRoots/.test(page.slice(page.indexOf('function listHtml'),
            page.indexOf('function controlHtml'))));
    ok('…one box per entry, a ✕ to drop one and a button to add one',
        /data-lrow=/.test(page) && /data-ldel=/.test(page) && /data-ladd=/.test(page));
    ok('…with the Browse button drawn only where the schema said the entries are paths, and nowhere else',
        /data-lbrowse=/.test(page)
        && /\$\{s\.itemBrowse[\s\S]{0,120}data-lbrowse/.test(page.replace(/\r/g, '')));
    ok('…and a closed set drawn as a select rather than a box that accepts anything',
        /s\.itemAllowed && s\.itemAllowed\.length/.test(page));

    ok('‼️ ADDING AND REMOVING ACT ON A DRAFT, so a list half-edited and abandoned'
        + ' leaves the setting exactly as it was',
        /const listDraft = \{\}/.test(page) && /delete listDraft\[key\]/.test(page));
    // ‼️ THE SPELLING IS NOT THE RULE — test_settings_form.js DRIVES this one
    // (type into a row, press + on the row above, the typing is still there).
    // This line stays because it is cheap and names the lesson at the place the
    // markup is pinned; it must not be the only guard, and it is not.
    ok('‼️ …and every structural gesture READS THE BOXES FIRST: type a path, press +'
        + ' on the row above, and without this the path is gone',
        /const at = readList\(key\)\.length/.test(page)
        && /const rows = readList\(key\)/.test(page));
    ok('‼️ …and the list is sent as a REAL ARRAY, which is the whole point of not'
        + ' making the user write the brackets',
        /vscode\.postMessage\(\{ type: 'set', key, value: rows \}\)/.test(page));
    ok('…with a number list refused in words rather than written as NaN',
        /every entry has to be a number/.test(page));

    ok('‼️ THE JSON BOX DOES NOT GO AWAY. A value the schema cannot describe is'
        + ' always possible, and removing the escape hatch would be a worse trap'
        + ' than the one this replaced',
        /function listToJson\(key\)/.test(page) && /list: X\.listToJson, form: X\.formToJson, rows: X\.rowsToJson, map: X\.mapToJson/.test(page)
        && /list: \['llist',/.test(page));
    ok('…and switching either way keeps what was typed, or says why it cannot',
        /listDraft\[key\] = v\.map/.test(page)
        && /does not parse, so it cannot be shown as rows/.test(page));

    const panel = require('./lib_settings_source').settingsPanelSource();
    const row = panel.slice(panel.indexOf("case 'browseRow'"), panel.indexOf("case 'browse': {"));
    ok('‼️ the row picker SAVES NOTHING — it posts the path back to the page,'
        + ' because the list around that row is still being edited and saving here'
        + ' would commit every other row at the same moment',
        /postMessage\(\{/.test(row) && /'browsedRow'/.test(row)
        && !/setValue\(/.test(row) && !/\.update\(/.test(row));
    ok('…and it opens where THAT ROW already points, not at the top of the disk',
        /Array\.isArray\(v\) \? v\[index\]/.test(row));
}

// ---------------------------------------------------------------------------
// ‼️ U-109 — THE SETTINGS WHOSE FIELDS THE MANIFEST ALREADY DECLARED.
//
// Fifteen settings name every field of their value, type it, say which ones are
// required and write a sentence about each — and the page drew a JSON textarea
// over the top of all of it. `taskRetry` declares SIXTEEN fields; the user was
// asked to hand-write its braces and remember that `backoff` takes one of four
// words, while typing it into a box that accepts anything.
//
// One object with declared fields is a FORM. A list of them is a TABLE. Both
// are chosen from `shape.kind`, so a setting whose fields are declared tomorrow
// gets its editor with nobody editing the page.
// ---------------------------------------------------------------------------
{
    const fs3 = require('fs');
    const page = require('./lib_settings_source').settingsPageSource();
    const shaped = Object.entries(PROPS)
        .map(([k, p]) => [k, S.shapeOf(p)]).filter(([, s]) => !!s);
    const forms = shaped.filter(([, s]) => s.kind === 'form');
    const rows = shaped.filter(([, s]) => s.kind === 'rows');

    ok('‼️ the manifest really does declare these, and this test is about all of them',
        forms.length >= 2 && rows.length >= 13);
    ok('…every one of them names at least one field — a form with no fields would'
        + ' be a form with nothing in it',
        forms.concat(rows).every(([, s]) => s.fields.length > 0));
    ok('‼️ …and every field it names is one the page can DRAW: a string, a number,'
        + ' a boolean, a closed set, or something whose JSON goes in one cell.'
        + ' Nothing here is allowed to be a field with no control at all',
        forms.concat(rows).every(([, s]) => s.fields.every(f => !!f.type)));

    ok('‼️ livingChecks was the last box the schema refused to describe, and it now'
        + ' declares its own entry — label and when required, level a closed set',
        (() => {
            const s = S.shapeOf(PROPS['agentFarm.livingChecks']);
            const by = Object.fromEntries(s.fields.map(f => [f.name, f]));
            return s.kind === 'rows'
                && by.label && by.label.required && by.when && by.when.required
                && by.level && Array.isArray(by.level.allowed)
                && by.level.allowed.join('|') === 'info|warn|alert'
                && s.fields.every(f => !!f.description);
        })());

    ok('‼️ the page chooses the form and the table from the SHAPE too — the same'
        + ' rule the list follows, and for the same reason',
        /it\.shape\.kind === 'form'\) \{ return formHtml\(it\); \}/.test(page)
        && /it\.shape\.kind === 'rows'\) \{ return rowsHtml\(it\); \}/.test(page));
    ok('…and neither of them is a key list: no setting is named in the CODE of'
        + ' either one. The comments may name the case that made them necessary;'
        + ' a branch on a key is what would go stale',
        (() => {
            const body = page.slice(page.indexOf('function formHtml'),
                page.indexOf('const BACK'))
                .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
            return !/taskRetry|launchDefaults|cliProfiles|pricing|livingChecks/.test(body);
        })());

    // ‼️ A BOOLEAN IS THREE-WAY, and this is the assertion that says why. An
    // unticked checkbox is indistinguishable from an untouched one, and here
    // they are OPPOSITE answers: an empty field is left out, so its own default
    // stays in charge, while `false` overrides it. A checkbox would turn one
    // edit into an override of every field the user never looked at.
    ok('‼️ a boolean field is a three-way picker and not a checkbox, because'
        + ' "not set" and "false" are different answers',
        /f\.type === 'boolean'/.test(page)
        && /opt\('', '\(not set\)', text, unset\)\}\$\{opt\('true', 'yes', text,/.test(page.replace(/\s*\n\s*/g, '')));
    ok('…a closed set is a picker rather than a box that accepts anything',
        /f\.allowed && f\.allowed\.length/.test(page));
    ok('‼️ …and a value already stored that the enum no longer names is KEPT and'
        + ' shown — dropping it on redraw would delete it without a word',
        /const known = f\.allowed\.indexOf\(text\) >= 0/.test(page));
    ok('…a field the schema does not flatten keeps its JSON in one cell rather'
        + ' than pretending to be a text field (livingChecks.when is the real case)',
        /f\.type !== 'string'/.test(page) && /as JSON/.test(page));

    ok('‼️ EMPTY IS A REAL ANSWER: a field left empty is LEFT OUT of the object,'
        + ' so its own default stays in charge',
        /if \(raw === ''\) \{ return \{ skip: true \}; \}/.test(page)
        && /if \(r\.skip\)/.test(page));
    ok('…and a required field left empty is refused IN WORDS, naming the field',
        /is required — it cannot be left empty/.test(page));
    ok('…as is a number box typed into with words, rather than a NaN written'
        + ' quietly into the user’s settings',
        /has to be a number/.test(page));

    ok('‼️ ADD AND ✕ ACT ON A DRAFT, so a table half-edited and abandoned leaves'
        + ' the setting exactly as it was',
        /const formDraft = \{\}/.test(page) && /const rowsDraft = \{\}/.test(page)
        && /delete formDraft\[key\]/.test(page) && /delete rowsDraft\[key\]/.test(page));
    ok('‼️ …and every structural gesture READS THE BOXES FIRST: type a price,'
        + ' press + on the row above, and without this the price is gone',
        /const at = readRows\(key\)\.length/.test(page)
        && /const rows = readRows\(key\)/.test(page)
        && /buildEntry\(key, shapeFields\(key\), readForm\(key\), ''\)/.test(page));
    ok('‼️ …and both are sent STRUCTURED, not as text, so what the user assembled'
        + ' cannot fail to parse',
        /vscode\.postMessage\(\{ type: 'set', key, value: obj \}\)/.test(page)
        && /vscode\.postMessage\(\{ type: 'set', key, value: out \}\)/.test(page));

    // ‼️ THE SILENT LOSS THIS EDITOR COULD HAVE CAUSED. A stored entry may hold
    // a key this manifest does not declare — an older build wrote it, a newer
    // one will. Rebuilding the object out of the declared fields alone would
    // DELETE it without a word, which is worse than the JSON box ever was.
    ok('‼️ the keys the schema does not name TRAVEL WITH THEIR ENTRY and are'
        + ' written back on save — a build that does not know about a key must'
        + ' not be the build that deletes it',
        /const REST = /.test(page)
        && /Object\.assign\(out, JSON\.parse\(cells\[REST\]\)\)/.test(page)
        && /if \(prev\[i\] && prev\[i\]\[REST\]\) \{ cells\[REST\] = prev\[i\]\[REST\]; \}/.test(page));
    ok('…and an entry that is nothing BUT those keys is not swept away as empty',
        /if \(!rows\[i\]\[REST\]/.test(page));

    ok('‼️ THE JSON BOX DOES NOT GO AWAY for these either, and the way back is'
        + ' declared once per shape rather than written out three times',
        /form: \['fform',/.test(page) && /rows: \['rtable',/.test(page)
        && /function formToJson\(key\)/.test(page) && /function rowsToJson\(key\)/.test(page));
    ok('…and a JSON that does not parse is refused rather than turned into rows'
        + ' of braces',
        /does not parse, so it cannot be shown as fields/.test(page));
    ok('‼️ a shape with no editor of its own gets NO way back — a "Back to the …"'
        + ' that led nowhere would be the dead control this change removes.'
        + ' `free` is the only one left, and it is the honest case',
        /BACK\[it\.shape\.kind\]/.test(page) && !/^\s*free: \[/m.test(page));

    // docs/CONVENTIONS.md — a column is defined once, on its <th>. The same
    // sentence repeated in twenty cells is not density, it is noise.
    ok('‼️ a table column is defined ONCE, on its header, as an AFTip carrying the'
        + ' type, whether it is required, what it accepts and the manifest’s own'
        + ' sentence',
        /<th>\$\{window\.AFTip\.wrap\(/.test(page)
        && /function fieldTip/.test(page)
        && /one of: \$\{f\.allowed\.join/.test(page));
    // ‼️ X-196 — and the hover it is carried in is the PANEL, not a `title`.
    // The line is cut at the edge of the page, so a hover is right; a native
    // tooltip repeating the identical string is the thing that component was
    // built to replace. The wrapper takes the row's sizing (see AFTip.label for
    // the same trap one element along).
    ok('…while the FORM keeps every sentence beside its field, because a form is'
        + ' read once and carefully rather than across — and carries the whole of'
        + ' it in an AFTip, since the line is cut at the edge of the page',
        /<span class="setfdesc">\$\{C\.esc\(window\.AFSettingText\.plainIn\(f\.description, allItems\(\)\)\)\}<\/span>/.test(page)
        && /f\.name, window\.AFSettingText\.plainIn\(f\.description, allItems\(\)\), 'setfdescw'/.test(page)
        && !/class="setfdesc" title=/.test(page));
    // ‼️ MIRROR (docs/CONVENTIONS.md) — a control narrow enough to cut its own
    // text puts its CURRENT value on the first line of its tooltip. A `when`
    // precondition in a sixth of a table is cut every single time.
    ok('‼️ …and a narrow box mirrors its OWN VALUE first, then what the field is',
        /const mirror = \[text, f\.description && window\.AFSettingText\.plainIn\(f\.description, allItems\(\)\), note\]\.filter\(Boolean\)\.join\('\\n\\n'\)/.test(page));
    ok('…and a required field is marked where it is asked for, in both',
        /f\.required \? '<b class="req">\*<\/b>' : ''/.test(page));
}

// ---------------------------------------------------------------------------
// ‼️ U-110 — THE THREE SETS OF NAME → VALUE PAIRS.
//
// `budgets`, `superpowersDefaults` and `agentEngineDefaults` are free-form
// objects: nothing can list their keys, which is exactly why they were left as
// a JSON textarea — and it is the wrong conclusion. The KEY is free; the PAIR
// is not, and the three do not even agree on what a value is.
// ---------------------------------------------------------------------------
{
    const fs4 = require('fs');
    const page = require('./lib_settings_source').settingsPageSource();
    const of = (k) => S.shapeOf(PROPS['agentFarm.' + k]);

    // ‼️ THE CENSUS IS OVER RULES, NOT OVER A COUNT. It used to assert there
    // were exactly three maps, so `activeAccounts` (X-171) turned a legitimate
    // fourth into a red build — and the fix a hurried reader reaches for is
    // bumping 3 to 4, which measures nothing at all. What this section is
    // actually about is that every map DECLARES what a pair is, so that is what
    // is asked: the three that started it are still maps, and any map added
    // since answers the same two questions they do.
    const maps = Object.entries(PROPS)
        .map(([k, p]) => [k, S.shapeOf(p)])
        .filter(([, s]) => s && s.kind === 'map');
    ok('the three maps this section was written about are still maps',
        ['budgets', 'superpowersDefaults', 'agentEngineDefaults']
            .every(k => maps.some(([n]) => n === 'agentFarm.' + k)));
    ok('‼️ …and EVERY map says what one value is, so none of them gets the empty'
        + ' JSON box back by being added later',
        maps.every(([, s]) => s.summary.length > 20)
        && maps.filter(([n]) => n !== 'agentFarm.agentEngineDefaults')
            .every(([, s]) => !!s.valueType));

    // ‼️ THEY ARE NOT THE SAME SHAPE, and the schema says so on each of them.
    ok('‼️ a map reads what ONE VALUE is off `additionalProperties` — the three'
        + ' disagree, and the page drew the same empty box over all of them',
        of('budgets').valueType === 'number'
        && of('superpowersDefaults').valueType === 'boolean'
        && of('agentEngineDefaults').valueType === undefined);
    ok('…and says it in the sentence beside the box, rather than "value"',
        /name → number pairs/.test(of('budgets').summary)
        && /name → boolean pairs/.test(of('superpowersDefaults').summary));
    ok('…and on the CHIP too, which is the line that decides whether the reader'
        + ' opens anything at all',
        /map: `name → \$\{s\.valueType \|\| 'value'\} pairs`/.test(page));

    // ‼️ AND THEY DO NOT AGREE ON WHERE THE NAMES COME FROM. A page that guessed
    // one list for all three would offer `*` to a setting that matches names
    // exactly (superpowersDefaultsKey) — a suggestion that does nothing.
    ok('‼️ where a map’s names come from is a fact of the MANIFEST (`x-af-keys`),'
        + ' because the three differ: a fleet wildcard, a bare name, a folder',
        of('budgets').keySource === 'agentOrAll'
        && of('superpowersDefaults').keySource === 'agent'
        && of('agentEngineDefaults').keySource === 'agentDir');
    ok('…and a map that declares nothing gets no suggestions rather than wrong ones',
        S.shapeOf({ type: 'object' }).keySource === undefined);
    // ‼️ X-171 — a fourth source, and it is a different KIND of name: an engine,
    // not an agent. The page reads the list off the engines it is already
    // drawing, so nothing here is a second copy of that list.
    ok('‼️ …and an account map is keyed by ENGINE, which is its own source',
        of('activeAccounts').keySource === 'engine'
        && /return \((?:X\.)?DATA\.engines \|\| \[\]\)\.map\(e => e\.id\)/.test(page));

    ok('‼️ the page chooses the pair editor from the SHAPE, like every other one',
        /it\.shape\.kind === 'map'\) \{ return mapHtml\(it\); \}/.test(page));
    ok('…and it is not a key list: no setting is named in the code of it',
        (() => {
            const body = page.slice(page.indexOf('function keyHints'),
                page.indexOf('function mapHtml'))
                .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
            return !/budgets|superpowersDefaults|agentEngineDefaults/.test(body);
        })());
    ok('‼️ the name box SUGGESTS and does not constrain — `*` is a real key and'
        + ' so is an agent that does not exist yet, and a picker refuses both',
        /<datalist id="\$\{listId\}"/.test(page)
        && /list="\$\{listId\}"/.test(page)
        && /<input type="text" id="m-\$\{id\}-\$\{i\}-k"/.test(page));
    ok('…and the value box is the SAME box a form field and a table cell get',
        /fieldBox\(f, `m-\$\{id\}-\$\{i\}-v`/.test(page)
        && /function mapField/.test(page));

    ok('‼️ add and ✕ act on a draft, and every gesture reads the boxes first',
        /const mapDraft = \{\}/.test(page)
        && /const at = readMap\(key\)\.length/.test(page)
        && /delete mapDraft\[key\]/.test(page));
    ok('‼️ …and the draft is a LIST of pairs, not an object: a pair being renamed'
        + ' must not jump around under the hand, and an object cannot hold two'
        + ' rows briefly called the same thing',
        /out\.push\(\{ k: String\(name\.value\), v: val \? String\(val\.value\) : '' \}\)/.test(page));
    ok('…so the same name twice is refused in words rather than one silently'
        + ' eating the other',
        /is in the list twice/.test(page));
    ok('‼️ …and a name with no value is refused too — writing "" would file a'
        + ' budget of nothing under a real agent, which looks set and does nothing',
        /has no value — give it one, or remove the row/.test(page));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
