// Agent Farm — THE BRAND KIT ON THE WORKFLOW FORM (M-50). A production's kit
// (characters, style, voice, logo rules — its production.json) is read by any
// step as {brand.<path>}. The workflow names that production here; a media
// step's own production (its scene picker) is that step's. The list is the
// host's own (DATA.scenes — the whole-production entries, which carry no '/').
(function () {
    'use strict';
    const WF = 'wf-production';

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

    window.AFBrand = { WF, productions, workflowBox, wireWf };
})();
