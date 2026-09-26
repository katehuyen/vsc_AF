// Agent Farm — THE LIBRARY ROW (X-416 / X-417 / X-418). Where every file a run
// makes is filed and recorded: the local Airtable's media library,
// <root>\media_<base>\<image|video|audio>\<stage>\, one full record per file.
// Two surfaces, one module: the workflow form's Library block (the production
// level) and a media or tool step's Library row (the step level). Every box is
// a flex point `library.*` (media/afFlex.js); a blank box is the level below —
// the Airtable page's default database and language, then the built-in.
(function () {
    'use strict';
    const STAGE_TIP = 'Where this step\'s files go. Blank = the workflow\'s stage folders, else by what they are: a candidate or a part → semi, a judge FAIL or a left-out → raw, the run\'s last output → final at its end. A stage named here is kept — the end of the run does not promote it.';
    const RECORD = [['', 'Default — every file, failures too'], ['all', 'every file, failures too'], ['passed', 'only what passed'], ['none', 'none — library off']];
    const START = [['', 'Default — start it'], ['auto', 'start it'], ['ask', 'ask me'], ['never', 'never — records wait']];
    const STAGES = [['', 'Default — by what the file is'], ['source', 'source — input material'], ['raw', 'raw — kept, unclassified'], ['semi', 'semi — half done'], ['final', 'final — succeeded'], ['asset', 'asset — the reusable treasure']];
    // [box id, draft key, label, placeholder, tip]
    const WF_TEXT = [
        ['wf-libBase', 'libBase', 'Database', 'the Airtable page\'s', 'The Airtable database (an engine instance) this workflow\'s files are filed and recorded in. Blank = the default on the Airtable page.'],
        ['wf-libLang', 'libLang', 'Language', 'the page\'s, else TR', 'The language folder the records are written to. Blank = the default on the Airtable page, else TR.'],
        ['wf-libTemplate', 'libTemplate', 'Template', '<Type>-<Stage>', 'A media template applied to every record (pre-filled fields). Blank = <Type>-<Stage> (Video-Raw…) when the database has one, else none.']
    ];
    const WF_START = 'wf-libStart', WF_RECORD = 'wf-libRecord';
    // X-417 — [box id, draft key, label, built-in default, what the file is]
    const WF_MAP = [
        ['wf-libMapInput', 'libMapInput', 'Inputs', 'source', 'a run input from outside the library (one already in a stage folder keeps its stage)'],
        ['wf-libMapIntermediate', 'libMapIntermediate', 'Parts', 'semi', 'a part, a separated track, a key frame or a candidate that passed'],
        ['wf-libMapFailed', 'libMapFailed', 'Judge FAIL', 'raw', 'a file its judge failed — kept, salvageable'],
        ['wf-libMapRejected', 'libMapRejected', 'Left out', 'raw', 'a candidate the selection step left out'],
        ['wf-libMapFinal', 'libMapFinal', 'Last output', 'final', 'the last producing step\'s files, when the run reaches its end']
    ];
    const ST_TEXT = [
        ['st-libBase', 'libBase', 'Database', 'the workflow\'s', 'The Airtable database this step\'s files go to. Blank = the workflow\'s, then the Airtable page\'s default.'],
        ['st-libLang', 'libLang', 'Language', 'the workflow\'s', 'The record language for this step\'s files. Blank = the workflow\'s.'],
        ['st-libTemplate', 'libTemplate', 'Template', 'the workflow\'s', 'The media template for this step\'s records. Blank = the workflow\'s, then <Type>-<Stage>.']
    ];
    const ST_RECORD = 'st-libRecord', ST_STAGE = 'st-libStage';
    const STEP_KEYS = ['libBase', 'libLang', 'libTemplate', 'libRecord', 'libStage'];

    function blank() {
        const b = { libBase: '', libLang: '', libTemplate: '', libRecord: '', libStage: '' };
        WF_MAP.forEach(m => { b[m[1]] = ''; });
        return b;
    }

    function mapSelect(C, m, value) {
        const opts = [['', 'Default — ' + m[3]]].concat(STAGES.slice(1));
        return select(C, m[0], m[2], opts, value, 'The stage folder for ' + m[4] + '. Blank = ' + m[3] + ', the built-in. A stage a step names on its own Library row wins over this.');
    }

    function text(C, id, label, value, ph, tip) {
        return `<label class="ntf" title="${C.esc(tip)}"><span>${C.esc(label)}</span>
            <input type="text" id="nt-${id}" value="${C.esc(value == null ? '' : String(value))}" placeholder="${C.esc(ph)}"></label>`;
    }
    // MIRROR: a narrow picker can cut its own text, so its tooltip opens with the current choice
    function select(C, id, label, opts, value, tip) {
        const cur = (opts.find(o => o[0] === (value || '')) || opts[0])[1];
        return `<label class="ntf" title="${C.esc(cur + '\n\n' + tip)}"><span>${C.esc(label)}</span>
            <select id="nt-${id}">${opts.map(([v, l]) => C.option(v, l, { selected: v === (value || '') })).join('')}</select></label>`;
    }

    /** A media or tool step's Library row. */
    function row(s, C) {
        return `<div class="ntsec"><b>Library</b>
            <span class="muted small">Where this step's files are filed and recorded. Blank = the workflow's.</span></div>
            <div class="ntgrid">
                ${ST_TEXT.map(([id, key, label, ph, tip]) => text(C, id, label, s[key], ph, tip)).join('')}
                ${select(C, ST_RECORD, 'Records', RECORD, s.libRecord, 'Which of this step\'s files get an Airtable record. Every file is filed either way — nothing is thrown away: with "only what passed", a failed file is kept in raw without a record.')}
                ${select(C, ST_STAGE, 'Stage', STAGES, s.libStage, STAGE_TIP)}
            </div>`;
    }

    /** The step list's one-line hint, when the step overrides the library. */
    function summary(s) {
        const bits = [s.libBase, s.libStage].filter(Boolean);
        return bits.length ? 'library ' + bits.join(' · ') : '';
    }

    function read(s, g) {
        STEP_KEYS.forEach(k => { const el = g(k); if (el && el.value != null) { s[k] = String(el.value); } });
    }

    function wire(byId, readStep) {
        ST_TEXT.forEach(([id]) => byId('nt-' + id, 'input', () => readStep()));
        [ST_RECORD, ST_STAGE].forEach(id => byId('nt-' + id, 'change', () => readStep()));
    }

    /** The workflow form's Library block. */
    function wfEditor(c, C) {
        return `<div class="ntsec"><b>Library</b>
            <span class="muted small">Every file a run makes — passed, failed, left out, parts — is filed into the local Airtable's media library and gets a full record. Blank = the Airtable page's defaults.</span></div>
            <div class="ntgrid">
                ${WF_TEXT.map(([id, key, label, ph, tip]) => text(C, id, label, c[key], ph, tip)).join('')}
                ${select(C, WF_RECORD, 'Records', RECORD, c.libRecord, 'Which files get an Airtable record. Every file is filed either way — nothing is thrown away. none switches the library off for this workflow.')}
                ${select(C, WF_START, 'Engine not running', START, c.libStart, 'What a run does when the database\'s engine is not running: start it (hidden, no browser), ask you, or never — then the records wait in the pending list and are written when it answers.')}
            </div>
            <div class="ntsec"><span class="muted small">Stage folders — which stage each kind of file goes to in this production. Blank = the built-in.</span></div>
            <div class="ntgrid">${WF_MAP.map(m => mapSelect(C, m, c[m[1]])).join('')}</div>`;
    }

    function wireWf(byId, draft) {
        WF_TEXT.forEach(([id, key]) => byId('nt-' + id, 'input', e => { const d = draft(); if (d) { d[key] = e.target.value; } }));
        WF_MAP.forEach(([id, key]) => byId('nt-' + id, 'change', e => { const d = draft(); if (d) { d[key] = e.target.value; } }));
        byId('nt-' + WF_RECORD, 'change', e => { const d = draft(); if (d) { d.libRecord = e.target.value; } });
        byId('nt-' + WF_START, 'change', e => { const d = draft(); if (d) { d.libStart = e.target.value; } });
    }

    window.AFLibrary = { blank, row, summary, read, wire, wfEditor, wireWf, STEP_KEYS };
})();
