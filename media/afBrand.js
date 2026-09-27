// Agent Farm — THE BRAND KIT ON THE WORKFLOW FORM (M-50). A production's kit
// (characters, style, voice, logo rules — its production.json) is read by any
// step as {brand.<path>}. The workflow names that production here; a media
// step's own production (its scene picker) is that step's. The list is the
// host's own (DATA.scenes — the whole-production entries, which carry no '/').
// A step card shows the kit that step reads, field by field: an empty box shows
// the production's value faint, a typed one is the step's own (DATA.brandKits).
// Studio ▸ Sources draws every production's kit and edits it (studioSection).
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


    // ---------- the Studio's Brand kits block (Sources) ----------
    // Each production keeps its own kit; one kept as a preset (family brand) is
    // taken by opening the editor with its values — nothing is written until Save.
    let kitEdit = null;   // { production, title, brand, chars: [{ key, name, ref, desc }] }
    let kitKeep = '';     // the production whose kit is being kept as a preset
    const logoWord = x => ((LOGO.find(o => o[0] === x) || [])[1] || '');
    const STUDIO_CSS = '<style>.bkbox{border:1px solid var(--vscode-focusBorder);border-radius:8px;padding:8px 10px;margin:4px 0 10px}'
        + '.bkrow{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:flex-end;margin:4px 0}'
        + '.bkf{display:flex;flex-direction:column;gap:2px;font-size:11px;flex:1 1 150px;min-width:130px}.bkf>span{opacity:.75}.bkf.thin{flex:0 0 170px}</style>';

    /** The kit as lines of text, for its AFTip. */
    function kitLines(b) {
        const out = FIELDS.concat([['logo', 'Logo']]).filter(([f]) => b[f]).map(([f, label]) => label + ': ' + (f === 'logo' ? logoWord(b.logo) : b[f]));
        Object.keys(b.character || {}).forEach(k => {
            const c = b.character[k];
            out.push('character ' + k + ': ' + [c.name, c.ref, c.desc].filter(Boolean).join(' · '));
        });
        return out;
    }

    function editorHtml(C) {
        const b = kitEdit.brand;
        const box = (id, label, v, tip) => `<label class="bkf" title="${C.esc(tip)}"><span>${C.esc(label)}</span><input type="text" id="${id}" value="${C.esc(v || '')}"></label>`;
        const fields = FIELDS.map(([f, label]) => box('bk-' + f, label, b[f], '{brand.' + f + '}')).join('');
        const logo = `<label class="bkf thin" title="{brand.logo} — what a step does with the logo"><span>Logo</span><select id="bk-logo">${C.option('', '— no rule —', { selected: !b.logo })}${LOGO.map(([v, l]) => C.option(v, l, { selected: b.logo === v })).join('')}</select></label>`;
        const chars = kitEdit.chars.map((c, i) => `<div class="bkrow">${box('bk-ck-' + i, 'Character key', c.key, '{brand.character.<key>.…} — a letter, then letters, digits, _ or -')}`
            + CHAR.map(([f, label]) => box('bk-c-' + i + '-' + f, label, c[f], '{brand.character.' + (c.key || '<key>') + '.' + f + '}')).join('')
            + `<button class="secondary" data-bkdrop="${i}" title="Drop this character">✕</button></div>`).join('');
        return `<div class="bkbox" id="bk-editor"><div class="bkrow">${fields}${logo}</div>${chars}
            <div class="btnrow"><button class="secondary" id="bk-addchar" title="A character steps can read as {brand.character.<key>.ref}">+ character</button><span style="flex:1"></span>
            <button id="bk-save" title="Write this kit into ${C.esc(kitEdit.title)}'s production.json">Save kit</button><button class="secondary" id="bk-cancel">Cancel</button></div></div>`;
    }

    /** Sources ▸ Brand kits: every production's kit, and the kits kept as presets. */
    function studioSection(D, C) {
        const presets = D.brandPresets || [];
        const tip = (trigger, head, body) => (window.AFTip ? window.AFTip.wrap(trigger, head, body) : trigger);
        const rows = (D.brands || []).map(p => {
            const b = p.brand || {};
            const lines = kitLines(b);
            const n = Object.keys(b.character || {}).length;
            const short = !lines.length ? 'no kit yet'
                : [b.style ? 'style: ' + b.style : '', b.voice ? 'voice ' + b.voice : '', n ? n + ' character(s)' : ''].filter(Boolean).join(' · ') || lines.length + ' field(s)';
            const keep = kitKeep === p.id ? `<div class="bkrow"><label class="bkf" title="The preset's name in the library (family brand)"><span>Keep as</span><input type="text" id="bk-keepname" value="${C.esc(p.title)}"></label>
                <button id="bk-keep">Keep</button><button class="secondary" id="bk-keepcancel">Cancel</button></div>` : '';
            return `<div class="srcrow"><span class="lbl">${C.esc(p.title)}</span>
                ${tip(`<span class="muted small">${C.esc(short)}</span>`, p.title + ' — brand kit', lines.join('\n') || 'No kit yet — Edit kit starts one.')}
                <span style="flex:1"></span>
                <button class="secondary" data-brandedit="${C.esc(p.id)}" title="Edit what this production's steps read as {brand.*}">Edit kit</button>
                ${presets.length ? `<select data-brandtake="${C.esc(p.id)}" title="Open the editor with a kept kit's values — nothing is written until Save kit">${C.option('', 'Take a kept kit…', { selected: true })}${presets.map(x => C.option(x.name, x.name, { detail: x.describe })).join('')}</select>` : ''}
                ${lines.length ? `<button class="secondary" data-brandkeep="${C.esc(p.id)}" title="Keep this kit as a preset, so another production can take it">Keep as preset…</button>` : ''}
                </div>${keep}${kitEdit && kitEdit.production === p.id ? editorHtml(C) : ''}`;
        }).join('');
        return `${STUDIO_CSS}<h2>Brand kits</h2>
            <p class="muted small">What a workflow's steps read as <code>{brand.style}</code>, <code>{brand.character.&lt;key&gt;.ref}</code>, … — each production keeps its own, in its production.json.</p>
            ${rows || '<div class="srcrow"><span class="muted small">No productions yet — a production (New Production) carries a brand kit.</span></div>'}`;
    }

    function openKit(p, brand) {
        const b = JSON.parse(JSON.stringify(brand || {}));
        kitEdit = { production: p.id, title: p.title, brand: b, chars: Object.keys(b.character || {}).map(key => Object.assign({ key }, b.character[key])) };
        delete b.character;
    }

    function wireStudio(D, post, render) {
        const q = sel => Array.from(document.querySelectorAll(sel));
        const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener(ev, fn); } };
        const prod = id => (D.brands || []).find(x => x.id === id) || { id, title: id };
        q('[data-brandedit]').forEach(el => el.addEventListener('click', () => { const p = prod(el.dataset.brandedit); openKit(p, p.brand); render(); }));
        q('[data-brandtake]').forEach(el => el.addEventListener('change', () => {
            const pre = (D.brandPresets || []).find(x => x.name === el.value);
            if (pre) { openKit(prod(el.dataset.brandtake), pre.brand); render(); }
        }));
        q('[data-brandkeep]').forEach(el => el.addEventListener('click', () => { kitKeep = el.dataset.brandkeep; render(); }));
        on('bk-keep', 'click', () => {
            const name = (document.getElementById('bk-keepname') || {}).value || '';
            if (name.trim()) { post('brand:save', { production: kitKeep, name: name.trim() }); }
            kitKeep = ''; render();
        });
        on('bk-keepcancel', 'click', () => { kitKeep = ''; render(); });
        if (!kitEdit) { return; }
        const b = kitEdit.brand;
        FIELDS.forEach(([f]) => on('bk-' + f, 'input', e => { b[f] = e.target.value; }));
        on('bk-logo', 'change', e => { b.logo = e.target.value; });
        kitEdit.chars.forEach((c, i) => {
            on('bk-ck-' + i, 'input', e => { c.key = e.target.value.trim(); });
            CHAR.forEach(([f]) => on('bk-c-' + i + '-' + f, 'input', e => { c[f] = e.target.value; }));
        });
        q('[data-bkdrop]').forEach(el => el.addEventListener('click', () => { kitEdit.chars.splice(Number(el.dataset.bkdrop), 1); render(); }));
        on('bk-addchar', 'click', () => { kitEdit.chars.push({ key: 'c' + (kitEdit.chars.length + 1) }); render(); });
        on('bk-save', 'click', () => {
            const brand = Object.assign({}, b);
            const character = {};
            kitEdit.chars.forEach(c => { if (c.key) { character[c.key] = { name: c.name || '', ref: c.ref || '', desc: c.desc || '' }; } });
            if (Object.keys(character).length) { brand.character = character; }
            post('brand:set', { production: kitEdit.production, brand });
            kitEdit = null; render();
        });
        on('bk-cancel', 'click', () => { kitEdit = null; render(); });
    }

    window.AFBrand = { WF, ST_IDS, productions, workflowBox, wireWf, stepProduction, stepRow, wireStep, studioSection, wireStudio, kitLines };
})();
