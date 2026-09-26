// M-49 (3/3) — the tool step's card row (media/afTool.js): a recipe picker, its
// presets, the input, one box per parameter that says what a blank box inherits
// (MIRROR), the boxes rebuilt into the ONE draft field the host reads
// (`toolJson`), and the run's record of where every value came from (resolveFlex).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const { charts } = require('./lib_charts_stub');
const T = require(path.join(ROOT, 'out/core/toolCall.js'));
const F = require(path.join(ROOT, 'media/afFlex.js'));
const RC = require(path.join(ROOT, 'media/afRecipes.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const box = { window: {} };
vm.createContext(box);
for (const f of ['afRecipes.js', 'afTool.js']) { vm.runInContext(fs.readFileSync(path.join(ROOT, 'media', f), 'utf8'), box); }
const A = box.window.AFTool;
const C = charts();

/** The boxes a person filled, as `g(id)` hands them to `read`. */
const boxes = vals => id => (id in vals ? { value: vals[id] } : null);
const idsIn = html => (html.match(/id="nt-st-[\w-]+"/g) || []).map(s => s.slice(10, -1));
const titleOf = (html, id) => {
    const i = html.indexOf('id="nt-st-' + id + '"');
    const t = html.lastIndexOf('title="', i);
    return html.slice(t + 7, html.indexOf('"', t + 7)).replace(/&quot;/g, '"').replace(/&#39;/g, '\'');
};

/* ---------- the row, drawn from the catalogue ---------- */
{
    const empty = A.row({ toolJson: '' }, C);
    ok('an empty step draws the recipe picker only', JSON.stringify(idsIn(empty)) === '["tRecipe"]');
    ok('the picker lists every recipe', RC.RECIPES.every(r => empty.indexOf('value="' + r.id + '"') >= 0));

    const split = A.row({ toolJson: JSON.stringify({ recipe: 'split', preset: 'Omni Flash parts', input: '{input.clip}', params: { overlapSec: 2 } }) }, C);
    ok('a split draws preset, input, both parameters, output folder and overwrite',
        JSON.stringify(idsIn(split)) === '["tRecipe","tPreset","tInput","tp-segmentSec","tp-overlapSec","tOutDir","tOverwrite"]');
    ok('a blank box shows the preset\'s value as its placeholder', /id="nt-st-tp-segmentSec"[^>]*placeholder="10"/.test(split));
    ok('MIRROR: its hover opens with the value and where it came from',
        titleOf(split, 'tp-segmentSec').indexOf('Current: 10 — from the preset "Omni Flash parts"') === 0);
    ok('a filled box says it is this step\'s', titleOf(split, 'tp-overlapSec').indexOf('Current: 2 — from this step') === 0
        && /id="nt-st-tp-overlapSec"[^>]*value="2"/.test(split));
    ok('the hover names the flex point', titleOf(split, 'tp-segmentSec').indexOf('Flex point tool.split.segmentSec (step)') > 0);

    const concat = A.row({ toolJson: JSON.stringify({ recipe: 'concat', params: { files: ['a.mp4', 'b.mp4'] } }) }, C);
    ok('a recipe with no input draws no Input box, and no preset picker when it has none', idsIn(concat).indexOf('tInput') < 0 && idsIn(concat).indexOf('tPreset') < 0);
    ok('a list of files is one path per line', /<textarea id="nt-st-tp-files"[^>]*>a\.mp4\nb\.mp4<\/textarea>/.test(concat));
    const reframe = A.row({ toolJson: JSON.stringify({ recipe: 'reframe', input: 'x.mp4' }) }, C);
    ok('an enum\'s blank choice says the default it stands for', /<select id="nt-st-tp-aspect"[^>]*>.*Default — 9:16/.test(reframe));
}

/* ---------- the boxes → the one field the host reads ---------- */
{
    const s = { toolJson: JSON.stringify({ recipe: 'split' }) };
    A.read(s, boxes({ tRecipe: 'split', tPreset: 'Omni Flash parts', tInput: ' {input.clip} ', 'tp-segmentSec': '5', 'tp-overlapSec': '', tOutDir: '', tOverwrite: 'suffix' }));
    ok('the boxes become the tool block: a number stays a number, a blank box is left out',
        s.toolJson === JSON.stringify({ recipe: 'split', preset: 'Omni Flash parts', input: '{input.clip}', params: { segmentSec: 5 }, overwrite: 'suffix' }));
    const back = T.toolStepFromJson(s.toolJson);
    ok('and the host takes it as it is', !('error' in back) && back.tool.params.segmentSec === 5);

    const tpl = { toolJson: JSON.stringify({ recipe: 'split' }) };
    A.read(tpl, boxes({ tRecipe: 'split', tInput: '{item}', 'tp-segmentSec': '{input.seg}' }));
    ok('a template in a number box stays text', JSON.parse(tpl.toolJson).params.segmentSec === '{input.seg}');

    const moved = { toolJson: JSON.stringify({ recipe: 'split', preset: 'Omni Flash parts', params: { segmentSec: 4 } }) };
    A.read(moved, boxes({ tRecipe: 'reframe', tPreset: 'Omni Flash parts', 'tp-segmentSec': '4', 'tp-mode': 'crop' }));
    ok('another recipe drops the old one\'s parameters and a preset that is not its own',
        moved.toolJson === JSON.stringify({ recipe: 'reframe' }));

    const byPreset = { toolJson: JSON.stringify({ recipe: 'split' }) };
    A.read(byPreset, boxes({ tRecipe: 'split', tPreset: 'Vertical short (9:16)', 'tp-segmentSec': '4' }));
    ok('picking a preset of another recipe switches to that recipe',
        byPreset.toolJson === JSON.stringify({ recipe: 'reframe', preset: 'Vertical short (9:16)' }));
    const untouched = { toolJson: '{"recipe":"split"}' };
    A.read(untouched, boxes({}));
    ok('a card without the row drawn leaves the draft alone', untouched.toolJson === '{"recipe":"split"}');
}

/* ---------- what it cannot be saved without, and its line on the list ---------- */
{
    ok('no recipe', A.error({ toolJson: '' }) === 'Pick the recipe this step runs.');
    ok('no input', /needs an input/.test(A.error({ toolJson: '{"recipe":"loudnorm"}' })));
    ok('a required parameter', A.error({ toolJson: '{"recipe":"concat"}' }) === 'Join parts needs files.');
    ok('a complete step', A.error({ toolJson: '{"recipe":"split","input":"a.mp4"}' }) === '');
    ok('the list line names the recipe, its preset and its input',
        A.summary({ toolJson: '{"recipe":"split","preset":"Omni Flash parts","input":"{input.clip}"}' }) === 'Split into parts · Omni Flash parts ← {input.clip}');
}

/* ---------- every parameter is a step-level flex point, its default the recipe's ---------- */
{
    const all = RC.RECIPES.flatMap(r => r.params.map(q => [r, q]));
    ok('one point per recipe parameter', all.every(([r, q]) => !!F.point('tool.' + r.id + '.' + q.name)));
    ok('its default is the recipe\'s own', all.filter(([, q]) => q.default !== undefined).every(([r, q]) => F.point('tool.' + r.id + '.' + q.name).default === q.default));
    ok('tool.outDir and tool.overwrite are set on the step too', ['tool.outDir', 'tool.overwrite'].every(id => JSON.stringify(F.levelsOf(id)) === '["settings","step"]'));
}

/* ---------- the run says where every value came from ---------- */
{
    const how = T.toolResolved({ recipe: 'split', preset: 'Omni Flash parts', params: { overlapSec: 2 }, outDir: 'D:/out' }, { overwrite: 'suffix' });
    ok('a preset value is named with its preset', how.why.indexOf('segmentSec: 10 — from this step (preset: Omni Flash parts)') >= 0);
    ok('the step\'s own value beats the preset', how.why.some(l => /^overlapSec: 2 — from this step; built-in default 0$/.test(l)));
    ok('the step\'s folder beats Farm Settings', how.why.some(l => l.indexOf('outDir: D:/out — from this step') === 0));
    ok('an overwrite left blank on the step is Farm Settings\'', how.why.indexOf('overwrite: suffix — from Farm Settings; built-in default never') >= 0);
    ok('and the defaults handed to the call are the Farm Settings layer over the built-in', how.defaults.outDir === '' && how.defaults.overwrite === 'suffix');
    const bare = T.toolResolved({ recipe: 'loudnorm' }, {});
    ok('untouched settings are the built-in, said so', bare.why.indexOf('lufs: -16 — built-in default') >= 0 && bare.defaults.overwrite === 'never');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
