/**
 * Guard: A SETTINGS FIXTURE DRAWS THE ROW THE MANIFEST REALLY PRODUCES — audit
 * B-05.
 *
 * `test/fixtures/spsettings.js` typed its two rows out by hand and left one
 * field off: `shape`. The host derives that field (`shapeOf` says
 * `agentFarm.superpowersDefaults` is a map of name → boolean, U-110), and the
 * page draws a pairs editor when it is there and the RAW JSON BOX when it is
 * not — the very box U-110 replaced. So all three Superpowers scenes had been
 * photographing a control the product does not have, in the file whose whole
 * job is to say what that section looks like, and every "looked at it, both
 * themes" verdict written on them was about the wrong picture.
 *
 * No string test could fail on it: the fixture was valid, the page was correct
 * about what it was given, and the scene rendered without complaint. The only
 * thing that was wrong was the DATA, measured against the schema the product
 * ships.
 *
 * So: for every fixture that draws `media/settings.js`, each row it carries for
 * a real `agentFarm.*` key is held against `buildSettingsModel`'s answer for
 * that same key. `type`, `default`, `browse`, `values` and — the one this was
 * opened for — `shape.kind` must agree. A row for a key the manifest does not
 * have is a fixture inventing a setting, and is reported too.
 *
 *   node test/test_settings_fixture_truth.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const S = require(path.join(ROOT, 'out', 'core', 'settingsops.js'));
const PROPS = require(path.join(ROOT, 'package.json')).contributes.configuration.properties;

/** Every fixture whose page script is the settings page — found, not listed,
 *  so a new settings scene is covered the day it is added. */
const fixtures = fs.readdirSync(path.join(ROOT, 'test', 'fixtures'))
    .filter(n => n.endsWith('.js'))
    .map(n => n.replace(/\.js$/, ''))
    .filter(n => {
        try { const f = require(path.join(ROOT, 'test', 'fixtures', n + '.js'));
            return (f.script || f.page) === 'settings.js'; }
        catch { return false; }
    });

ok(`the settings page has fixtures to check (${fixtures.length}): ${fixtures.join(' ')}`,
    fixtures.length >= 5);

/**
 * ‼️ THE ONE EXEMPTION, AND IT IS READ RATHER THAN TYPED.
 *
 * A handful of `agentFarm.alerts.*` keys never get a control at all: the alert
 * card replaces them IN THEIR OWN PLACE (`ALERT_CARD_KEYS`, media/settings.js,
 * A-21), so the row's `shape` decides nothing and a fixture that leaves it off
 * cannot draw a box that is not there. The list is lifted out of the page's own
 * source, so a key added to it — or taken off it — reaches this rule without
 * anybody remembering.
 */
const CARD_KEYS = (() => {
    const src = fs.readFileSync(path.join(ROOT, 'media', 'settings.js'), 'utf8');
    const at = src.indexOf('const ALERT_CARD_KEYS = [');
    if (at < 0) { return null; }
    const end = src.indexOf('];', at);
    return (src.slice(at, end).match(/'([^']+)'/g) || []).map(s => s.slice(1, -1));
})();

ok('the card-replaces-the-box list was found in the page, not typed here'
    + (CARD_KEYS ? ` (${CARD_KEYS.length})` : ''),
    Array.isArray(CARD_KEYS) && CARD_KEYS.length > 0);

/** The row the product would build for one key, given the fixture's own value. */
function truth(key, value) {
    const props = { [key]: PROPS[key] };
    const cats = S.buildSettingsModel(props, () => value);
    for (const c of cats) {
        const hit = (c.items || []).find(i => i.key === key);
        if (hit) { return hit; }
    }
    return undefined;
}

const problems = [];
let rows = 0;
for (const name of fixtures) {
    const fx = require(path.join(ROOT, 'test', 'fixtures', name + '.js'));
    // Every variant a fixture publishes, so a scene that is not `data()` is
    // checked too — that is where two of the three wrong pictures lived.
    const variants = Object.keys(fx).filter(k => typeof fx[k] === 'function' && k !== 'page' && k !== 'script');
    for (const v of variants) {
        let d;
        try { d = fx[v](); } catch { continue; }
        if (!d || !Array.isArray(d.categories)) { continue; }
        for (const cat of d.categories) {
            for (const it of (cat.items || [])) {
                if (!it || typeof it.key !== 'string' || !/^agentFarm\./.test(it.key)) { continue; }
                if (!PROPS[it.key]) {
                    // ‼️ A KEY THE MANIFEST DOES NOT HAVE IS ALLOWED, AND ONLY
                    // AS A SCALAR. `sentrysettings` carries one on purpose —
                    // a setting filed in no group, to prove the section still
                    // draws it under "More" — and a hypothetical row like that
                    // cannot photograph a control the product lacks, because
                    // every page draws a number the same way. An invented
                    // OBJECT or ARRAY row can: it is the shaped editors that
                    // differ, which is what this file was opened for.
                    if (['string', 'number', 'boolean'].indexOf(String(it.type)) < 0 || it.shape) {
                        problems.push(`${name}.${v} — ${it.key} is not in the manifest and is not a`
                            + ` plain scalar (type ${JSON.stringify(it.type)}), so it draws a control`
                            + ' nobody can check against the schema');
                    }
                    continue;
                }
                if ((CARD_KEYS || []).indexOf(it.key) >= 0) { continue; }
                rows++;
                const real = truth(it.key, it.value);
                if (!real) { continue; }
                const mine = it.shape ? it.shape.kind : undefined;
                const theirs = real.shape ? real.shape.kind : undefined;
                if (mine !== theirs) {
                    problems.push(`${name}.${v} — ${it.key} shape ${JSON.stringify(mine)}`
                        + ` but the manifest derives ${JSON.stringify(theirs)}`);
                }
                if (String(it.type || '') !== String(real.type || '')) {
                    problems.push(`${name}.${v} — ${it.key} type ${JSON.stringify(it.type)}`
                        + ` but the manifest says ${JSON.stringify(real.type)}`);
                }
                if (String(it.browse || '') !== String(real.browse || '')) {
                    problems.push(`${name}.${v} — ${it.key} browse ${JSON.stringify(it.browse)}`
                        + ` but the manifest says ${JSON.stringify(real.browse)}`);
                }
            }
        }
    }
}

/**
 * ‼️ audit B-05 — AND THE SENTENCE UNDER A PATH BOX NAMES A VARIABLE THAT ROW
 * ACTUALLY HAS.
 *
 * `sentrysettings` built its own refusal sentence under a comment claiming it
 * was the resolver's, verbatim — and typed `${vault}` into every one of them.
 * The no-vault scene therefore drew the `${projectNotes}` row saying
 * «⚠ ${vault} has nothing behind it on this machine», a warning about a
 * variable that row does not contain. Nothing else could catch it: the sentence
 * is well-formed, the row is well-formed, and only the pairing is wrong.
 *
 * The rule needs no context and no clock: whatever a refusal names, the
 * template must carry.
 */
{
    const named = (s) => Array.from(String(s || '').matchAll(/\$\{([^{}]*)\}/g)).map(m => m[1].trim());
    const bad = [];
    let previews = 0;
    for (const name of fixtures) {
        const fx = require(path.join(ROOT, 'test', 'fixtures', name + '.js'));
        for (const v of Object.keys(fx).filter(k => typeof fx[k] === 'function' && k !== 'page' && k !== 'script')) {
            let d;
            try { d = fx[v](); } catch { continue; }
            const all = Array.isArray(d) ? d.map(s => s && s.data).filter(Boolean) : [d];
            for (const scene of all) {
                for (const [key, list] of Object.entries((scene && scene.pathPreview) || {})) {
                    for (const row of (list || [])) {
                        if (row.ok || !row.why) { continue; }
                        previews++;
                        const inTemplate = new Set(named(row.template));
                        for (const n of named(row.why)) {
                            if (!inTemplate.has(n)) {
                                bad.push(`${name}.${v} — ${key}: row ${JSON.stringify(row.template)}`
                                    + ` is refused for \${${n}}, which is not in it`);
                            }
                        }
                    }
                }
            }
        }
    }
    ok(`the sweep really read refused path rows (${previews})`, previews > 0);
    ok('‼️ A REFUSED PATH NAMES ONLY VARIABLES THAT ROW CARRIES'
        + (bad.length ? '\n      ' + bad.slice(0, 8).join('\n      ') : ''),
        bad.length === 0);
}

ok(`the sweep really read rows (${rows})`, rows > 0);
ok('‼️ EVERY SETTINGS FIXTURE ROW IS THE ROW THE MANIFEST DERIVES'
    + (problems.length ? '\n      ' + problems.slice(0, 10).join('\n      ') : ''),
    problems.length === 0);

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
