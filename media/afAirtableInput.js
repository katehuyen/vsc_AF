// Agent Farm — AN AIRTABLE INPUT'S SEARCH (X-420). A workflow input of type
// `airtable` is looked up in the local Airtable before the first step: the
// matching records become its value, a JSON list a step reads as
// {input.<name>} and a for-each step walks ({item.file}, {item.id}). This is
// the input row's second line; every box is a field of the input's `airtable`
// (stages, max and sort are flex points airtable.input.*: blank = the Farm
// setting, then asset + final · 20 · newest).
(function () {
    'use strict';
    const KIND = [['', 'any kind'], ['image', 'image'], ['video', 'video'], ['audio', 'audio']];
    const SUCCESS = [['', 'passed or failed'], ['passed', 'passed only'], ['failed', 'failed only']];
    const SORT = [['', 'Default — newest'], ['newest', 'newest first'], ['oldest', 'oldest first'], ['name', 'by name']];
    // [key, label, placeholder, tip] — a text box; KIND/SUCCESS/SORT are pickers
    const TEXT = [
        ['base', 'Database', 'the Airtable page\'s', 'The Airtable database to search. Blank = the default on the Airtable page.'],
        ['query', 'Search', 'words in its name, topic, tags', 'Every word must appear in the record\'s name, topic, subtopic, content, description, tags, SEO keywords or file name. A run can type other words — or hand a file path to get that file\'s own record.'],
        ['stages', 'Stages', 'asset, final', 'Which stage folders to search, comma separated: source, raw, semi, final, asset. Blank = the Farm setting, else asset + final.'],
        ['status', 'Status', 'any', 'Only records with this status (draft, published…). Blank = any.'],
        ['tags', 'Tags', 'all of these', 'Only records carrying every one of these tags, comma separated.'],
        ['limit', 'Max', '20', 'At most this many records (1-200). Blank = the Farm setting, else 20.']
    ];
    const KEYS = TEXT.map(t => t[0]).concat(['kind', 'success', 'sort']);
    const IDS = { base: 'wi-aq-base', query: 'wi-aq-query', stages: 'wi-aq-stages', kind: 'wi-aq-kind', status: 'wi-aq-status', tags: 'wi-aq-tags', success: 'wi-aq-success', limit: 'wi-aq-limit', sort: 'wi-aq-sort' };
    const id = (k, i) => IDS[k] + '-' + i;

    function box(C, k, i, label, value, ph, tip) {
        return `<label class="ntf" title="${C.esc((value || '(blank)') + '\n\n' + tip)}"><span>${C.esc(label)}</span>
            <input type="text" id="nt-${id(k, i)}" value="${C.esc(value == null ? '' : String(value))}" placeholder="${C.esc(ph)}"></label>`;
    }
    // MIRROR: the current choice opens the tooltip
    function pick(C, k, i, label, opts, value, tip) {
        const cur = (opts.find(o => o[0] === (value || '')) || opts[0])[1];
        return `<label class="ntf" title="${C.esc(cur + '\n\n' + tip)}"><span>${C.esc(label)}</span>
            <select id="nt-${id(k, i)}">${opts.map(([v, l]) => C.option(v, l, { selected: v === (value || '') })).join('')}</select></label>`;
    }

    /** The search line under an airtable input's row. */
    function row(d, i, C) {
        const q = d.aq || {};
        return `<div class="ntgrid wi-aq">
            ${TEXT.slice(0, 3).map(([k, l, ph, tip]) => box(C, k, i, l, q[k], ph, tip)).join('')}
            ${pick(C, 'kind', i, 'Kind', KIND, q.kind, 'Only images, videos or audio files.')}
            ${pick(C, 'success', i, 'Success', SUCCESS, q.success, 'Only files that passed, or only failed ones (their salvage notes say what can be rescued).')}
            ${TEXT.slice(3).map(([k, l, ph, tip]) => box(C, k, i, l, q[k], ph, tip)).join('')}
            ${pick(C, 'sort', i, 'Sort', SORT, q.sort, 'The order the records are handed in. Blank = the Farm setting, else newest first.')}
        </div>`;
    }

    function wire(on, d, i) {
        const set = (k, v) => { d.aq = d.aq || {}; d.aq[k] = v; };
        TEXT.forEach(([k]) => on(id(k, i), 'input', e => set(k, e.target.value)));
        ['kind', 'success', 'sort'].forEach(k => on(id(k, i), 'change', e => set(k, e.target.value)));
    }

    /** The saved search, without its blanks. */
    function clean(aq) {
        const o = {};
        KEYS.forEach(k => { const v = String((aq || {})[k] == null ? '' : aq[k]).trim(); if (v) { o[k] = v; } });
        return Object.keys(o).length ? o : undefined;
    }

    window.AFAirtableInput = { row, wire, clean, KEYS };
})();
