// Agent Farm — WORKFLOW INPUTS (M-38). A workflow declares what it is given
// when it starts; any step reads a value as {input.<name>}. Three surfaces, one
// module: the workflow form declares the inputs (flex point workflow.input at
// the workflow level), the run card fills them (the run level, prefilled with
// the last run's values), and a trigger that runs the workflow maps what it
// knows when it fires onto them (trigger.inputs). Drafts are plain objects the
// page keeps; every box writes itself into its draft as it is typed, because
// the page redraws on every host push.
(function () {
    'use strict';
    const TYPES = [
        ['text', 'text'], ['file', 'file — a path'], ['folder', 'folder — a path'],
        ['choice', 'choice — one of a list'], ['number', 'number'], ['url', 'URL'], ['airtable', 'airtable — records found by a search']
    ];
    const ID = { name: 'wi-name', type: 'wi-type', dflt: 'wi-default', req: 'wi-required', desc: 'wi-desc', choices: 'wi-choices', run: 'wi-run', map: 'wi-map' };
    const MAP_TIP = '{file} = the file that changed · {watch} = the watched path · {payload} = what a webhook sent · {payload.a.b} = one field of it';

    function blank() { return { name: '', type: 'text', default: '', required: false, description: '', choices: '' }; }

    /** Saved inputs → drafts (choices as one comma-separated box). */
    function toDrafts(inputs) {
        return (inputs || []).map(i => Object.assign(blank(), i, { choices: Array.isArray(i.choices) ? i.choices.join(', ') : (i.choices || ''), aq: Object.assign({}, i.airtable || {}) }));
    }
    /** Drafts → what is saved; the host checks it again (normalizeInputs). */
    function fromDrafts(drafts) {
        return (drafts || []).filter(d => String(d.name || '').trim()).map(d => {
            const o = { name: String(d.name).trim(), type: d.type || 'text' };
            if (String(d.default || '') !== '') { o.default = String(d.default); }
            if (d.required) { o.required = true; }
            if (String(d.description || '').trim()) { o.description = String(d.description).trim(); }
            if (o.type === 'choice') { o.choices = String(d.choices || '').split(',').map(s => s.trim()).filter(Boolean); }
            const aq = o.type === 'airtable' && window.AFAirtableInput ? window.AFAirtableInput.clean(d.aq) : undefined;
            if (aq) { o.airtable = aq; }
            return o;
        });
    }

    const field = (C, id, label, value, ph, title) =>
        `<label class="ntf" title="${C.esc(title || '')}"><span>${C.esc(label)}</span>
            <input type="text" id="nt-${id}" value="${C.esc(value == null ? '' : String(value))}" placeholder="${C.esc(ph || '')}"></label>`;

    /** The workflow form's Inputs block. */
    function editor(drafts, C) {
        const rows = (drafts || []).map((d, i) => `<div class="ntgrid wi-row">
            ${field(C, ID.name + '-' + i, 'Input', d.name, 'clip', 'Its name — a step reads it as {input.' + (d.name || 'name') + '}.')}
            <label class="ntf" title="What kind of value it is. A file or folder is a path; a choice is one of a list."><span>Type</span>
                <select id="nt-${ID.type}-${i}">${TYPES.map(t => C.option(t[0], t[1], { selected: t[0] === (d.type || 'text') })).join('')}</select></label>
            ${field(C, ID.dflt + '-' + i, 'Default', d.default, 'empty = none', (d.default || '(none)') + '\n\nUsed when a run gives no value. A run, the Run card or a trigger overrides it.')}
            ${d.type === 'choice' ? field(C, ID.choices + '-' + i, 'Choices', d.choices, 'short, long', 'The values it can take, separated by commas.') : ''}
            ${field(C, ID.desc + '-' + i, 'Says', d.description, 'what it is, in a few words', 'Shown on the Run card, and in the refusal when it is missing.')}
            <label class="cbx" title="A run without a value for it does not start, and says why."><input type="checkbox" id="nt-${ID.req}-${i}"${d.required ? ' checked' : ''}> required</label>
            <button class="secondary" data-wi-del="${i}" title="Remove this input">✕</button>
        </div>${d.type === 'airtable' && window.AFAirtableInput ? window.AFAirtableInput.row(d, i, C) : ''}`).join('');
        return `<div class="ntsec"><b>Inputs</b> <span class="muted small">What the workflow is given when it starts — a step reads one as <code>{input.name}</code>. None = it takes nothing.</span></div>
            ${rows}<div class="ctl-row"><button class="secondary" id="nt-wi-add">+ Add an input</button></div>`;
    }

    /** The Run card: one box per input, prefilled with the last run's value, else the default. */
    function runCard(inputs, last, C) {
        const rows = (inputs || []).map(i => {
            const v = last && last[i.name] !== undefined ? last[i.name] : (i.default || '');
            const from = last && last[i.name] !== undefined ? 'the last run' : i.default ? 'the workflow default' : 'nothing yet';
            const tip = `${v || '(empty)'} — ${from}\n\n${i.description || i.type}${i.required ? ' · required' : ''}`;
            return i.type === 'choice'
                ? `<label class="ntf" title="${C.esc(tip)}"><span>${C.esc(i.name)}${i.required ? ' <em>required</em>' : ''}</span>
                    <select id="nt-${ID.run}-${C.esc(i.name)}">${[''].concat(i.choices || []).map(c => C.option(c, c || '—', { selected: c === v })).join('')}</select></label>`
                : field(C, ID.run + '-' + i.name, i.name + (i.required ? ' *' : ''), v, i.description || i.type, tip);
        }).join('');
        return `<div class="ntgrid">${rows}</div>`;
    }

    /** A trigger's mapping rows: input → what fills it when the trigger fires. */
    function mapRows(inputs, mapping, C) {
        if (!(inputs || []).length) { return ''; }
        return `<div class="ntsec"><b>Inputs it hands the workflow</b> <span class="muted small">${C.esc(MAP_TIP)}</span></div>
            <div class="ntgrid">${inputs.map(i => field(C, ID.map + '-' + i.name, i.name, (mapping || {})[i.name] || '',
                i.type === 'file' ? '{file}' : i.type === 'folder' ? '{watch}' : '(nothing)',
                ((mapping || {})[i.name] || '(the default: ' + (i.type === 'file' ? '{file}' : i.type === 'folder' ? '{watch}' : 'nothing') + ')') + '\n\n' + MAP_TIP)).join('')}</div>`;
    }

    /**
     * Every box writes into its draft as it is touched. `drafts` / `runValues` /
     * `mapping` are the page's own objects; `redraw` is called when a change
     * alters the shape (a row added or removed, a type that grows a Choices box).
     */
    function wire(doc, o) {
        const on = (id, ev, fn) => { const el = doc.getElementById('nt-' + id); if (el) { el.addEventListener(ev, fn); } };
        (o.drafts || []).forEach((d, i) => {
            on(ID.name + '-' + i, 'input', e => { d.name = e.target.value; });
            on(ID.dflt + '-' + i, 'input', e => { d.default = e.target.value; });
            on(ID.desc + '-' + i, 'input', e => { d.description = e.target.value; });
            on(ID.choices + '-' + i, 'input', e => { d.choices = e.target.value; });
            on(ID.req + '-' + i, 'change', e => { d.required = !!e.target.checked; });
            on(ID.type + '-' + i, 'change', e => { d.type = e.target.value; o.redraw && o.redraw(); });
            if (d.type === 'airtable' && window.AFAirtableInput) { window.AFAirtableInput.wire(on, d, i); }
        });
        on('wi-add', 'click', () => { o.drafts.push(blank()); o.redraw && o.redraw(); });
        doc.querySelectorAll('[data-wi-del]').forEach(b => b.addEventListener('click', () => {
            o.drafts.splice(Number(b.getAttribute('data-wi-del')), 1);
            o.redraw && o.redraw();
        }));
        (o.inputs || []).forEach(i => {
            if (o.runValues) { on(ID.run + '-' + i.name, i.type === 'choice' ? 'change' : 'input', e => { o.runValues[i.name] = e.target.value; }); }
            if (o.mapping) { on(ID.map + '-' + i.name, 'input', e => { o.mapping[i.name] = e.target.value; }); }
        });
    }

    /** Only the values somebody typed — an empty box says nothing, so the default still applies. */
    const given = values => Object.fromEntries(Object.entries(values || {}).filter(([, v]) => String(v) !== ''));

    window.AFWorkflowInputs = { TYPES, ID, blank, toDrafts, fromDrafts, editor, runCard, mapRows, wire, given };
})();
