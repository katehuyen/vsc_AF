// Agent Farm — THE TOOL STEP'S CARD ROW (M-49). A tool step runs a local ffmpeg
// recipe with no model. The row is drawn from the recipe catalogue
// (media/afRecipes.js): a recipe picker, its presets, the input, one box per
// parameter, the output folder and the overwrite policy. A blank box inherits —
// the preset's value, else the recipe's own — and says so in its placeholder and
// on the first line of its hover (MIRROR). Every box is a step-level flex point
// (`tool.*`, `tool.<recipe>.<param>` in media/afFlex.js). The step's draft keeps
// ONE field, `toolJson`, which the host reads (tasksPanel stepFromDraft); `read`
// rebuilds it from the boxes as they are typed, because the page redraws on
// every host push.
(function () {
    'use strict';
    const R = () => window.AFRecipes;
    const OW = [['', 'Default — Farm Settings'], ['never', 'never — the step fails'], ['suffix', 'suffix — write beside it'], ['always', 'always — replace it']];
    const TEMPLATE = /[{}]/;
    // the boxes, each a flex point's surface (media/afFlex.js names them by these strings)
    const BOX = { recipe: 'st-tRecipe', preset: 'st-tPreset', input: 'st-tInput', outDir: 'st-tOutDir', overwrite: 'st-tOverwrite', param: 'st-tp' };
    const idOf = k => 'nt-' + BOX[k];

    function spec(s) {
        try { const t = JSON.parse(String(s.toolJson || '') || '{}'); return t && typeof t === 'object' && !Array.isArray(t) ? t : {}; } catch (e) { return {}; }
    }
    function recipeOf(t) { return R().recipe(String(t.recipe || (R().preset(t.preset) || {}).recipe || '')); }
    const show = v => (v === undefined || v === null || v === '' ? '(none)' : Array.isArray(v) ? v.join(', ') : String(v));
    const boxValue = v => (v === undefined || v === null ? '' : Array.isArray(v) ? v.join('\n') : String(v));

    /** The value a box holds, and the sentence its hover opens with. */
    function where(t, r, q) {
        const own = (t.params || {})[q.name];
        if (own !== undefined && own !== '') { return { own: own, line: 'Current: ' + show(own) + ' — from this step' }; }
        const inh = R().inherited(r.id, t.preset, q.name);
        return { inh: inh.value, line: 'Current: ' + show(inh.value) + ' — ' + (inh.from === 'preset' ? 'from the preset "' + inh.preset + '"' : 'the recipe\'s own default') };
    }

    function tip(C, first, rest) { return C.esc(first + '\n\n' + rest); }

    function paramBox(C, t, r, q) {
        const w = where(t, r, q);
        const id = idOf('param') + '-' + q.name;
        const point = R().paramPoint(r.id, q.name);
        const range = q.min !== undefined ? ' (' + q.min + ' to ' + q.max + ')' : '';
        const title = tip(C, w.line, q.describe + range + (q.type === 'files' ? ' One path per line, or a template that is a list: {steps.<id>.json.outputs}.' : '')
            + ' A template such as {input.x} or {item} is filled when it runs.\n\nFlex point ' + point + ' (step).');
        const label = '<span>' + C.esc(q.name) + (q.required ? ' *' : '') + '</span>';
        if (q.type === 'enum') {
            const opts = [['', 'Default — ' + show(w.inh === undefined ? q.default : w.inh)]].concat(q.options.map(o => [o, o]));
            const cur = w.own === undefined ? '' : String(w.own);
            return '<label class="ntf" title="' + title + '">' + label + '<select id="' + id + '" data-tp="' + C.esc(q.name) + '">'
                + opts.map(([v, l]) => C.option(v, l, { selected: v === cur })).join('') + '</select></label>';
        }
        const ph = w.inh === undefined || w.inh === '' ? (q.type === 'files' ? '{steps.split.json.outputs}' : q.type === 'file' ? '{input.audio}' : '') : show(w.inh);
        if (q.type === 'files') {
            return '<label class="ntf wide" title="' + title + '">' + label + '<textarea id="' + id + '" data-tp="' + C.esc(q.name) + '" rows="2" placeholder="'
                + C.esc(ph) + '">' + C.esc(boxValue(w.own)) + '</textarea></label>';
        }
        return '<label class="ntf' + (q.type === 'file' ? ' wide' : '') + '" title="' + title + '">' + label + '<input type="text" id="' + id + '" data-tp="' + C.esc(q.name)
            + '" placeholder="' + C.esc(ph) + '" value="' + C.esc(boxValue(w.own)) + '"></label>';
    }

    // U-151 — the boxes with a level above the step (Farm Settings): point id -> the tool's field
    const UP = ['outDir', 'overwrite'];
    const pointOf = k => (window.AFFlexPromote ? window.AFFlexPromote.pointAt('media/afTool.js#' + BOX[k]) : '');
    function fieldOf(point) { return UP.find(k => pointOf(k) === point) || ''; }
    /** The field back to inherited: taken out of the step's toolJson. */
    function drop(s, k) {
        const t = spec(s);
        delete t[k];
        s.toolJson = Object.keys(t).length ? JSON.stringify(t) : '';
    }
    let ownAtRender = '';
    const ownOf = s => UP.filter(k => String(spec(s || {})[k] || '').trim()).join(',');

    /** The step card's tool row. U-151 — `promote` = { open, levels(point) } draws ↑ beside a box with its own value. */
    function row(s, C, promote) {
        const t = spec(s);
        const P = promote && window.AFFlexPromote;
        const up = k => (P ? P.up(promote, pointOf(k), t[k]) : '');
        ownAtRender = ownOf(s);
        const r = recipeOf(t);
        const recipes = [['', 'Pick a recipe…']].concat(R().RECIPES.map(x => [x.id, x.label]));
        const presets = r ? R().PRESETS.filter(p => p.recipe === r.id) : [];
        const recipeTip = r ? 'Current: ' + r.label + ' (' + r.id + ')' : 'Current: none picked';
        const ow = String(t.overwrite || '');
        return '<div class="ntgrid">'
            + '<label class="ntf" title="' + tip(C, recipeTip, (r ? r.describe + '\n\n' : '') + 'The local ffmpeg job this step runs — no model, no tokens. Its result (outputs, runs, duration) is the step\'s JSON: {prev_json.outputs} and {steps.<id>.json.outputs} read it.\n\nFlex point tool.recipe (step).') + '"><span>Recipe</span>'
            + '<select id="' + idOf('recipe') + '">' + recipes.map(([v, l]) => C.option(v, l, { selected: v === (r ? r.id : ''), detail: v ? (R().recipe(v) || {}).describe : '' })).join('') + '</select></label>'
            + (presets.length ? '<label class="ntf" title="' + tip(C, 'Current: ' + (t.preset || 'none'), 'A named set of this recipe\'s parameters; a box you fill beats it, a blank box takes it.\n\nFlex point tool.preset (step).') + '"><span>Preset</span>'
                + '<select id="' + idOf('preset') + '">' + [['', 'None — the recipe\'s own']].concat(presets.map(p => [p.name, p.name])).map(([v, l]) => C.option(v, l, {
                    selected: v.toLowerCase() === String(t.preset || '').toLowerCase(),
                    detail: v ? Object.entries(R().preset(v).params).map(([k, x]) => k + ': ' + x).join(' · ') : ''
                })).join('') + '</select></label>' : '')
            + (r && r.input ? '<label class="ntf wide" title="' + tip(C, 'Current: ' + show(t.input), 'The file it works on: a path, or a template filled when it runs — {input.clip} (a workflow input), {prev_json.outputs.0} (the step before), {item} (a for-each element).\n\nFlex point tool.input (step).') + '"><span>Input *</span>'
                + '<input type="text" id="' + idOf('input') + '" placeholder="{input.clip}" value="' + C.esc(boxValue(t.input)) + '"></label>' : '')
            + (r ? r.params.map(q => paramBox(C, t, r, q)).join('') : '')
            + (r ? '<label class="ntf wide" title="' + tip(C, 'Current: ' + (t.outDir ? t.outDir + ' — from this step' : 'Farm Settings, else an af-tool folder beside the input'), 'Where the outputs are written. Blank = the Farm Settings folder (agentFarm.toolOutDir), and if that is blank too, af-tool beside the input.\n\nFlex point tool.outDir (step · Farm Settings).') + '"><span>Output folder' + up('outDir') + '</span>'
                + '<input type="text" id="' + idOf('outDir') + '" placeholder="Farm Settings, else beside the input" value="' + C.esc(boxValue(t.outDir)) + '"></label>'
                + '<label class="ntf" title="' + tip(C, 'Current: ' + (ow ? ow + ' — from this step' : 'Farm Settings'), 'What happens when an output file is already there.\n\nFlex point tool.overwrite (step · Farm Settings).') + '"><span>File already there' + up('overwrite') + '</span>'
                + '<select id="' + idOf('overwrite') + '">' + OW.map(([v, l]) => C.option(v, l, { selected: v === ow })).join('') + '</select></label>' : '')
            + (P ? P.stripFor(promote, pointOf('outDir'), 'Output folder', String(t.outDir || ''), t.outDir)
                + P.stripFor(promote, pointOf('overwrite'), 'File already there', (OW.find(o => o[0] === ow) || [])[1] || ow, ow) : '')
            + '</div>';
    }

    /** The step list's one-line "who" for a tool step. */
    function summary(s) {
        const t = spec(s);
        const r = recipeOf(t);
        const input = String(t.input || '').trim();
        return (r ? r.label : '(no recipe)') + (t.preset ? ' · ' + t.preset : '') + (input ? ' ← ' + (input.length > 30 ? input.slice(0, 30) + '…' : input) : '');
    }

    /** What the step cannot be saved without — said inside the card. */
    function error(s) {
        const t = spec(s);
        const r = recipeOf(t);
        if (!r) { return 'Pick the recipe this step runs.'; }
        if (r.input && !String(t.input || '').trim()) { return r.label + ' needs an input — a path or a template such as {input.clip}.'; }
        const missing = r.params.filter(q => q.required && boxValue((t.params || {})[q.name]).trim() === '' && R().inherited(r.id, t.preset, q.name).value === undefined);
        return missing.length ? r.label + ' needs ' + missing.map(q => q.name).join(', ') + '.' : '';
    }

    /** A box's text → the value the step stores: a plain number is a number, anything else (a template) stays text. */
    function stored(q, v) {
        if (q.type === 'number' && /^-?\d+(\.\d+)?$/.test(v) && !TEMPLATE.test(v)) { return Number(v); }
        return v;
    }

    /** The boxes → the step's `toolJson`. A changed recipe drops the old one's parameters and a preset that is not its own. */
    function read(s, g) {
        const box = g('tRecipe');
        if (!box) { return; }
        const before = spec(s);
        const beforeRecipe = recipeOf(before);
        let rid = String(box.value || '');
        const presetBox = g('tPreset');
        const pre = presetBox ? String(presetBox.value || '') : String(before.preset || '');
        const p = R().preset(pre);
        if (p && presetBox && pre !== String(before.preset || '') && p.recipe !== rid) { rid = p.recipe; }
        const same = beforeRecipe && beforeRecipe.id === rid;
        const r = R().recipe(rid);
        const t = {};
        if (rid) { t.recipe = rid; }
        if (p && r && p.recipe === r.id) { t.preset = p.name; }
        const val = id => { const el = g(id); return el ? String(el.value || '').trim() : ''; };
        if (r && r.input && val('tInput')) { t.input = val('tInput'); }
        const params = {};
        if (r && same) {
            r.params.forEach(q => { const v = val('tp-' + q.name); if (v !== '') { params[q.name] = stored(q, v); } });
        }
        if (Object.keys(params).length) { t.params = params; }
        if (val('tOutDir')) { t.outDir = val('tOutDir'); }
        if (val('tOverwrite')) { t.overwrite = val('tOverwrite'); }
        s.toolJson = Object.keys(t).length ? JSON.stringify(t) : '';
    }

    function wire(byId, readStep, render, step) {
        ['recipe', 'preset', 'overwrite'].forEach(k => byId(idOf(k), 'change', () => { readStep(); render(); }));
        ['input', 'outDir'].forEach(k => byId(idOf(k), 'input', () => readStep()));
        // U-151 — the folder box that took or lost its own value gains or loses its ↑
        byId(idOf('outDir'), 'change', () => { readStep(); if (window.AFFlexPromote && ownOf(step) !== ownAtRender) { render(); } });
        const r = step ? recipeOf(spec(step)) : undefined;
        (r ? r.params : []).forEach(q => byId(idOf('param') + '-' + q.name, q.type === 'enum' ? 'change' : 'input', () => readStep()));
    }

    window.AFTool = { BOX, spec, row, summary, error, read, wire, stored, fieldOf, drop };
})();
