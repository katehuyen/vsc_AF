// Agent Farm — THE BRAND KIT ON THE WORKFLOW FORM (M-50). A production's kit
// (characters, style, voice, logo rules — its production.json) is read by any
// step as {brand.<path>}. The workflow names that production here; a media
// step's own production (its scene picker) is that step's. The list is the
// host's own (DATA.scenes — the whole-production entries, which carry no '/').
// A step card shows the kit that step reads, field by field: an empty box shows
// the production's value faint, a typed one is the step's own (DATA.brandKits).
(function () {
    'use strict';
    const WF = 'wf-production';
    // the step card's boxes, each a flex point's step-level surface (media/afFlex.js names them by these strings)
    const ST_IDS = ['st-brand-style', 'st-brand-negative', 'st-brand-colors', 'st-brand-typography', 'st-brand-voice',
        'st-brand-aspect', 'st-brand-duration', 'st-brand-logo', 'st-brand-logoPlace', 'st-brand-character'];
    const FIELDS = [['style', 'Style'], ['negative', 'Negative'], ['colors', 'Colours'], ['typography', 'Typography'], ['voice', 'Voice'],
        ['aspect', 'Aspect'], ['duration', 'Duration'], ['logoPlace', 'Logo place']];
    const LOGO = [['remove', 'remove it'], ['keep', 'keep it'], ['place', 'place it']];
    const CHAR = [['name', 'Name'], ['ref', 'Reference'], ['desc', 'Description']];
    const idOf = f => 'nt-st-brand-' + f;

    /** The productions this farm can see: [{ id, label }]. */
    function productions(scenes) {
        return (scenes || []).filter(x => x && x.id && x.id.indexOf('/') < 0)
            .map(x => ({ id: x.id, label: String(x.label || x.id).replace(/ — the whole production$/, '') }));
    }

    /** The workflow form's Production box. A production that is gone stays visible, marked, until changed. */
    function workflowBox(c, scenes, C) {
        const list = productions(scenes);
        const cur = c.production || '';
        const gone = cur && !list.some(p => p.id === cur)
            ? C.option(cur, '⚠ ' + cur, { selected: true, detail: 'No such production any more — saving is refused until another is picked.' }) : '';
        const tip = (cur ? ((list.find(p => p.id === cur) || {}).label || cur) : 'no production') + '\n\n'
            + 'The production whose brand kit every step reads as {brand.style}, {brand.character.<key>.ref}, … A media step tied to its own production reads that one. Edit a kit in Studio, or with studio.brand.set.';
        const head = `<div class="ntsec"><b>Brand kit</b>
            <span class="muted small">Steps read the production's kit as <code>{brand.style}</code>, <code>{brand.character.&lt;key&gt;.ref}</code>, … — a media step tied to its own production reads that one.</span></div>`;
        if (!list.length && !cur) {
            return `${head}<div class="muted small">No productions yet — Studio ▸ New Production makes one; its kit then turns up here.</div>`;
        }
        return `${head}<div class="ntgrid"><label class="ntf thin" title="${C.esc(tip)}"><span>From production</span>
            <select id="nt-${WF}">${C.option('', '— none —', { selected: !cur })}${gone}${list.map(p => C.option(p.id, p.label, { selected: p.id === cur })).join('')}</select></label></div>`;
    }

    function wireWf(byId, draft) {
        byId(`nt-${WF}`, 'change', e => {
            const c = draft();
            if (c) { c.production = e.target.value; }
        });
    }

    /** Which production a step reads its kit from on the form: a media step's own, else the workflow's. */
    function stepProduction(s, c) {
        const own = s && s.stype === 'media' && s.mScene ? String(s.mScene).split('/')[0] : '';
        return own || (c && c.production) || '';
    }

    const reads = s => /\{brand\./.test(JSON.stringify([s.prompt, s.mInput, s.whBody, s.whUrl, s.bGoal, s.apMsg, s.selMsg, s.toolJson]));
    const hasOwn = s => !!(s.brand && Object.keys(s.brand).length);

    /** The step card's Brand block — drawn only when the step has a kit to read, reads one, or has fields of its own. */
    function stepRow(s, c, kits, scenes, C) {
        if (['checkpoint', 'approval', 'select'].indexOf(s.stype) >= 0) { return ''; }
        const pid = stepProduction(s, c);
        if (!pid && !reads(s) && !hasOwn(s)) { return ''; }
        const kit = (kits || {})[pid] || {};
        const own = s.brand || {};
        const pname = pid ? ((productions(scenes).find(p => p.id === pid) || {}).label || pid) : '';
        const from = pname ? 'production ' + pname : 'no production';
        const box = (id, label, mine, under, what) => `<label class="ntf" title="${C.esc((mine ? mine + ' — this step' : (under || '(empty)') + ' — ' + from) + '\n\n' + what)}"><span>${C.esc(label)}</span>
            <input type="text" id="${id}" value="${C.esc(mine || '')}" placeholder="${C.esc(under || '')}"></label>`;
        const fields = FIELDS.map(([f, label]) => box(idOf(f), label, own[f], kit[f], `{brand.${f}} — empty = the production's value.`));
        const logoWord = x => ((LOGO.find(o => o[0] === x) || [])[1] || '');
        const logo = `<label class="ntf thin" title="${C.esc((own.logo ? logoWord(own.logo) + ' — this step' : (kit.logo ? logoWord(kit.logo) : '(no rule)') + ' — ' + from) + '\n\n{brand.logo} — what a step does with the logo.')}"><span>Logo</span>
            <select id="${idOf('logo')}">${C.option('', '↳ ' + (kit.logo ? logoWord(kit.logo) : 'no rule'), { selected: !own.logo })}${LOGO.map(([v, l]) => C.option(v, l, { selected: own.logo === v })).join('')}</select></label>`;
        const keys = Object.keys(Object.assign({}, kit.character || {}, own.character || {}));
        const chars = keys.map(k => {
            const kc = (kit.character || {})[k] || {}, oc = (own.character || {})[k] || {};
            return `<div class="ntgrid" data-brandchar="${C.esc(k)}"><span class="small" title="${C.esc('{brand.character.' + k + '.name|ref|desc}')}" style="align-self:center;min-width:60px"><code>${C.esc(k)}</code></span>`
                + CHAR.map(([f, label]) => box(idOf('character-' + k + '-' + f), label, oc[f], kc[f], `{brand.character.${k}.${f}} — empty = the production's value.`)).join('') + '</div>';
        }).join('');
        const n = Object.keys(own).filter(k => k !== 'character').length
            + Object.values(own.character || {}).reduce((a, x) => a + Object.keys(x).length, 0);
        const sum = `Brand — ${pname ? C.esc(pname) + '\'s kit' : 'no production'}${n ? ' · ' + n + ' field(s) of its own' : ''}`;
        return `<details class="ntbrand"${n ? ' open' : ''}><summary class="small" title="${C.esc('The brand kit this step reads as {brand.*}: ' + from + '. A value typed here is this step\'s own; an empty box reads the production\'s (shown faint).')}">${sum}</summary>
            <div class="ntgrid">${fields.join('')}${logo}</div>${chars}</details>`;
    }

    /** The step's own fields ← the boxes; a field left empty is dropped, an empty kit is no kit. */
    function wireStep(byId, step, kits, draft) {
        const s = step();
        if (!s) { return; }
        const put = (path, v) => {
            const b = s.brand || {};
            if (path.length === 1) { if (v) { b[path[0]] = v; } else { delete b[path[0]]; } }
            else {
                const ch = b.character || {}, c1 = ch[path[1]] || {};
                if (v) { c1[path[2]] = v; } else { delete c1[path[2]]; }
                if (Object.keys(c1).length) { ch[path[1]] = c1; } else { delete ch[path[1]]; }
                if (Object.keys(ch).length) { b.character = ch; } else { delete b.character; }
            }
            if (Object.keys(b).length) { s.brand = b; } else { delete s.brand; }
        };
        FIELDS.forEach(([f]) => byId(idOf(f), 'input', e => put([f], e.target.value.trim())));
        byId(idOf('logo'), 'change', e => put(['logo'], e.target.value));
        const kit = (kits || {})[stepProduction(s, draft && draft())] || {};
        Object.keys(Object.assign({}, kit.character || {}, (s.brand || {}).character || {})).forEach(k =>
            CHAR.forEach(([f]) => byId(idOf('character-' + k + '-' + f), 'input', e => put(['character', k, f], e.target.value.trim()))));
    }

    window.AFBrand = { WF, ST_IDS, productions, workflowBox, wireWf, stepProduction, stepRow, wireStep };
})();
