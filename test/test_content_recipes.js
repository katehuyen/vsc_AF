// M-53 — the recipe book (src/core/contentRecipes.ts) and the media input's JSON template (src/core/jsonTemplate.ts).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const C = require(path.join(ROOT, 'out/core/contentRecipes.js'));
const { fillJsonTemplate } = require(path.join(ROOT, 'out/core/jsonTemplate.js'));
const { roleKeyRefusal } = require(path.join(ROOT, 'out/core/workflowRoles.js'));
const { toolStepRefusal } = require(path.join(ROOT, 'out/core/toolCall.js'));
const { forEachRefusal } = require(path.join(ROOT, 'out/core/forEachStep.js'));
const { checkWorkflowInputs } = require(path.join(ROOT, 'out/core/workflowInputs.js'));
const { localRefs } = require(path.join(ROOT, 'out/core/mediaUpload.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };

/* ---------- the book ---------- */
eq('three content recipes first, then the three quick ones', C.CONTENT_RECIPES.map(r => r.id + ':' + r.kind),
    ['video-parts:content', 'long-to-shorts:content', 'weekly-rhythm:content', 'text-image:quick', 'text-image-video:quick', 'audio-text:quick']);
ok('found by id or by label', C.contentRecipe('long-to-shorts') === C.contentRecipe('uzundan KISALAR') && C.contentRecipe('uzundan kisalar') === C.contentRecipe('Uzundan kısalar') && C.contentRecipe(' Haftalık Kanal Ritmi') === C.contentRecipe('weekly-rhythm') && !C.contentRecipe('nope'));

for (const r of C.CONTENT_RECIPES) {
    const a = r.build({ agent: 'yazar' });
    const ids = a.steps.map(s => s.id).filter(Boolean);
    ok(`${r.id}: every step names its title`, a.steps.every(s => String(s.title || '').trim()));
    const inputs = checkWorkflowInputs(a.inputs, a.steps);
    ok(`${r.id}: its inputs are sound and every {input.x} a step reads is declared`, !inputs.error);
    if (inputs.error) { console.log('    ', inputs.error); }
    a.steps.forEach((s, i) => {
        if (s.tool) { ok(`${r.id} ${s.id}: the tool step is one the save accepts`, toolStepRefusal(s.tool) === ''); }
        if (s.forEach) { ok(`${r.id} ${s.id}: its for-each list is an earlier step`, forEachRefusal(s, ids.slice(0, i)) === ''); }
        if (s.media) {
            let parsed = null;
            try { parsed = JSON.parse(s.media.input); } catch { /* reported below */ }
            ok(`${r.id} ${s.title}: the media input is a JSON template, so its values are filled escaped`, parsed && typeof parsed === 'object');
        }
        const text = JSON.stringify(s);
        for (const m of text.matchAll(/\{steps\.([\w-]+)\./g)) {
            ok(`${r.id} ${s.id || s.title}: {steps.${m[1]}} is a step before it`, ids.slice(0, i).includes(m[1]));
        }
    });
    if (r.kind === 'content') {
        ok(`${r.id}: ‼️ no step names an agent — its agent steps name roles`, a.steps.every(s => !s.agent) && a.steps.some(s => s.role));
        ok(`${r.id}: every role is a role name`, a.steps.every(s => !s.role || roleKeyRefusal(s.role) === ''));
        ok(`${r.id}: ‼️ no judge, supervisor or step model pinned — the cost preset in force decides them`,
            !a.supervisor && a.steps.every(s => !s.model && !(s.verify && s.verify.model)));
        ok(`${r.id}: a goal and criteria for its supervisor`, a.goal && Array.isArray(a.criteria) && a.criteria.length >= 2);
        ok(`${r.id}: wakes the supervisor on a failure`, Array.isArray(a.wake) && a.wake.some(w => w.id === 'step-failed'));
    } else {
        ok(`${r.id}: the chosen agent is on its agent steps`, a.steps.filter(s => !s.media).every(s => s.agent === 'yazar'));
    }
}
eq('the roles the three recipes name', C.CONTENT_RECIPES.slice(0, 3).map(C.recipeRoles), [['prompt-muhendisi'], ['kurgu'], ['fikir', 'senarist', 'yayinci']]);
const ls = C.contentRecipe('long-to-shorts').build({});
const cut = ls.steps.find(s => s.id === 'cut');
ok('uzundan kısalar: each picked moment is cut by ONE local pass (short), timed and subtitled from its own item',
    cut.tool.recipe === 'short' && cut.tool.params.start === '{item.start}' && cut.tool.params.srt === '{item.srt}' && cut.forEach.list === '{steps.pick.json.clips}');
const wr = C.contentRecipe('weekly-rhythm').build({});
ok('haftalık ritim: the approval comes before the publishing package', wr.steps.findIndex(s => s.approval) === wr.steps.findIndex(s => s.id === 'publish') - 1);
ok('haftalık ritim: the publishing step uploads nothing', /hiçbir platforma yükleme/.test(wr.steps.find(s => s.id === 'publish').prompt));
eq('a taken title gets the next free number', [C.freeTitle('A', []), C.freeTitle('A', ['A']), C.freeTitle('A', ['A', 'A (2)'])], ['A', 'A (2)', 'A (3)']);
const sum = C.recipeSummary(C.contentRecipe('video-parts'));
eq('workflows.recipes lists what a caller needs to choose', [sum.id, sum.kind, sum.needsAgent, sum.roles, sum.inputs], ['video-parts', 'content', false, ['prompt-muhendisi'], ['video*', 'brief*', 'partSec', 'resolution']]);

/* ---------- the media input's JSON template ---------- */
const sub = s => s.split('{item}').join('C:\\Users\\me\\part001.mp4').split('{brief}').join('say "hi"\nthen go');
const filled = fillJsonTemplate('{"video_url":"{item}","prompt":"{brief}","n":5}', sub);
let back = null;
try { back = JSON.parse(filled); } catch { /* reported below */ }
ok('‼️ a Windows path, a quote and a line end stay valid JSON', back && back.video_url === 'C:\\Users\\me\\part001.mp4' && back.prompt === 'say "hi"\nthen go' && back.n === 5);
eq('‼️ …so the local file is found to upload', localRefs(filled).detected, ['C:\\Users\\me\\part001.mp4']);
eq('the old plain-text fill broke it, and the file was never found', (() => { try { JSON.parse(sub('{"video_url":"{item}"}')); return 'parsed'; } catch { return 'broken'; } })(), 'broken');
eq('a template that is not JSON is filled as text', fillJsonTemplate('{"n": {count}}', s => s.split('{count}').join('3')), '{"n": 3}');
eq('a bare string template is filled as text too', fillJsonTemplate('"{x}"', s => s.split('{x}').join('y')), '"y"');
eq('nested lists and objects are walked', JSON.parse(fillJsonTemplate('{"a":[{"b":"{x}"}]}', s => s.split('{x}').join('q"'))), { a: [{ b: 'q"' }] });

/* ---------- wiring ---------- */
const ext = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
const tasks = fs.readFileSync(path.join(ROOT, 'src/core/tasks.ts'), 'utf8');
ok('the command and the bridge op install through ONE function', (ext.match(/installRecipe\(/g) || []).length === 2 && /const installRecipe = \(ref/.test(ext) && /op: 'workflows\.addRecipe'/.test(ext) && /op: 'workflows\.recipes'/.test(ext));
ok('…which saves through workflows.add\'s own save and validator', /const w = addWorkflowFromArgs\(\{ \.\.\.args, title \}/.test(ext) && /const w = addWorkflowFromArgs\(args\);/.test(ext));
ok('no recipe is declared inline any more', !/const recipes: \{ label: string/.test(ext));
ok('the media step fills its input as a JSON template', /fillJsonTemplate\(media\.input, resolve\)/.test(tasks));
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'parity.manifest.json'), 'utf8'));
const entry = JSON.stringify(man).match(/"capability":"addRecipe"[^}]*/);
ok('parity: addRecipe → workflows.addRecipe, workflows.recipes', entry && /workflows\.addRecipe/.test(entry[0]) && /workflows\.recipes/.test(entry[0]));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
