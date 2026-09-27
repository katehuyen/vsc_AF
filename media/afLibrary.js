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

    // X-419 — a model fills the records' meaning: [box id, draft key, label, placeholder, tip]
    const EN_WHEN = [['', 'Default — at the run\'s end'], ['end', 'at the run\'s end'], ['record', 'as each file is ready'], ['never', 'never']];
    const EN_SCOPE = [['', 'Default — final + failed'], ['final-failed', 'final + failed'], ['final', 'final only'], ['all', 'every file']];
    const EN_TEXT = [
        ['wf-libEnModel', 'libEnModel', 'Image model', 'sonnet', 'The claude model that opens an image and fills its record. Blank = the Farm setting, else sonnet.'],
        ['wf-libEnVideo', 'libEnVideo', 'Video model', 'gemini-3.8-flash-low', 'The agy model that opens a video (its frames, not its sound) and fills its record. Blank = the Farm setting, else gemini-3.8-flash-low. An audio file is skipped: no engine here can hear one.'],
        ['wf-libEnEffort', 'libEnEffort', 'Effort', 'low', 'The claude effort for filling a record. Blank = the Farm setting, else low.'],
        ['wf-libEnSections', 'libEnSections', 'Sections', 'all', 'Which sections of the record a model fills, comma separated: identity, taxonomy, function, tone, education, marketing, platform, accessibility, seo, tags, salvage. Blank = all. Only blank fields are filled — a person\'s value is never overwritten.'],
        ['wf-libEnCap', 'libEnCap', '$ / record', 'none', 'Dollars a claude turn may spend on one record; the engine stops it there. A turn\'s own start costs about $0.02, so under $0.05 stops every turn. agy reports no cost, so it is not enforced for video. Blank = the Farm setting, else no cap.']
    ];
    const EN_KEYS = ['libEnWhen', 'libEnScope'].concat(EN_TEXT.map(t => t[1]));

    function blank() {
        const b = { libBase: '', libLang: '', libTemplate: '', libRecord: '', libStage: '' };
        WF_MAP.forEach(m => { b[m[1]] = ''; });
        EN_KEYS.forEach(k => { b[k] = ''; });
        return b;
    }

    function mapSelect(C, m, value) {
        const opts = [['', 'Default — ' + m[3]]].concat(STAGES.slice(1));
        return select(C, m[0], m[2], opts, value, 'The stage folder for ' + m[4] + '. Blank = ' + m[3] + ', the built-in. A stage a step names on its own Library row wins over this.');
    }

    function text(C, id, label, value, ph, tip, up) {
        return `<label class="ntf" title="${C.esc(tip)}"><span>${C.esc(label)}${up || ''}</span>
            <input type="text" id="nt-${id}" value="${C.esc(value == null ? '' : String(value))}" placeholder="${C.esc(ph)}"></label>`;
    }
    // MIRROR: a narrow picker can cut its own text, so its tooltip opens with the current choice
    function select(C, id, label, opts, value, tip, up, from) {
        // SHORTHAND: an inherited first option reads '↳ <value>', faint; its origin opens the tooltip (MIRROR)
        const inh = !value && String(opts[0][1]).indexOf('↳ ') === 0;
        const cur = (opts.find(o => o[0] === (value || '')) || opts[0])[1] + (inh ? ' — inherited from ' + (from || 'Farm Settings') : '');
        return `<label class="ntf" title="${C.esc(cur + '\n\n' + tip)}"><span>${C.esc(label)}${up || ''}</span>
            <select id="nt-${id}"${inh ? ' class="inh"' : ''}>${opts.map(([v, l]) => C.option(v, l, { selected: v === (value || '') })).join('')}</select></label>`;
    }

    // U-151 — the step row's boxes and the flex point each one sets: [box id, draft key, label]
    const ST_BOXES = ST_TEXT.map(t => [t[0], t[1], t[2]]).concat([[ST_RECORD, 'libRecord', 'Records'], [ST_STAGE, 'libStage', 'Stage']]);
    const stPoint = id => (window.AFFlexPromote ? window.AFFlexPromote.pointAt('media/afLibrary.js#' + id) : '');
    /** point id -> the step draft's key; the workflow draft keeps the same value under the same key */
    function stepKeyOf(point) { const b = ST_BOXES.find(x => stPoint(x[0]) === point); return b ? b[1] : ''; }
    let stepOwnAtRender = '';
    const stepOwn = s => ST_BOXES.filter(b => String((s || {})[b[1]] || '').trim()).map(b => b[1]).join(',');

    /**
     * A media or tool step's Library row. U-151 — `promote` = { open, levels(point) } draws ↑ beside a box with its own value;
     * `wf` = the workflow draft: an empty box shows the workflow's value faint (MIRROR: value, then origin).
     */
    function row(s, C, promote, wf) {
        const w = wf || {};
        const P = promote && window.AFFlexPromote;
        const mirror = (key, ph) => (String(s[key] || '').trim() ? s[key] + ' — set on this step'
            : String(w[key] || '').trim() ? w[key] + ' — inherited from the workflow' : ph + ' — inherited');
        const recLabel = v => (RECORD.find(o => o[0] === v) || [])[1] || v;
        const recOpts = [['', '↳ ' + recLabel(w.libRecord || 'all')]].concat(RECORD.slice(1));
        const up = (id, key) => (P ? P.up(promote, stPoint(id), s[key]) : '');
        const shown = b => b[0] === ST_RECORD ? ((RECORD.find(o => o[0] === s.libRecord) || [])[1] || s.libRecord) : String(s[b[1]] || '');
        const strip = P ? ST_BOXES.map(b => P.stripFor(promote, stPoint(b[0]), b[2], shown(b), s[b[1]])).join('') : '';
        stepOwnAtRender = stepOwn(s);
        return `<div class="ntsec"><b>Library</b>
            <span class="muted small">Where this step's files are filed and recorded. Blank = the workflow's.</span></div>
            <div class="ntgrid">
                ${ST_TEXT.map(([id, key, label, ph, tip]) => text(C, id, label, s[key], String(w[key] || '').trim() ? w[key] + ' — the workflow\'s' : ph,
                    mirror(key, ph) + '\n\n' + tip, up(id, key))).join('')}
                ${select(C, ST_RECORD, 'Records', recOpts, s.libRecord, 'Which of this step\'s files get an Airtable record. Every file is filed either way — nothing is thrown away: with "only what passed", a failed file is kept in raw without a record.', up(ST_RECORD, 'libRecord'), w.libRecord ? 'the workflow' : 'built-in')}
                ${select(C, ST_STAGE, 'Stage', STAGES, s.libStage, STAGE_TIP)}
                ${strip}
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

    function wire(byId, readStep, redraw, step) {
        ST_TEXT.forEach(([id]) => byId('nt-' + id, 'input', () => readStep()));
        [ST_RECORD, ST_STAGE].forEach(id => byId('nt-' + id, 'change', () => readStep()));
        // U-151 — a box that took or lost its own value gains or loses its ↑
        if (redraw) { ST_BOXES.forEach(([id]) => byId('nt-' + id, 'change', () => { readStep(); if (stepOwn(step()) !== stepOwnAtRender) { redraw(); } })); }
    }

    // U-151 — the enrich boxes and the flex point each one sets (read off the registry)
    const EN_BOXES = [['wf-libEnWhen', 'libEnWhen', 'When'], ['wf-libEnScope', 'libEnScope', 'Which files']].concat(EN_TEXT.map(t => [t[0], t[1], t[2]]));
    const enPoint = id => (window.AFFlexPromote ? window.AFFlexPromote.pointAt('media/afLibrary.js#' + id) : '');
    /** point id -> the workflow draft's key, for the page's '↑ make default' */
    function draftKeyOf(point) { const b = EN_BOXES.find(x => enPoint(x[0]) === point); return b ? b[1] : ''; }
    let ownAtRender = '';
    const ownOf = c => EN_BOXES.filter(b => String((c || {})[b[1]] || '').trim()).map(b => b[1]).join(',');

    /**
     * The workflow form's Library block. U-151 — `promote` = { open: point id } draws ↑ beside an enrich box
     * that holds its own value; `inh` = { point id: the Farm Settings value } is what an empty box inherits.
     */
    function wfEditor(c, C, promote, inh) {
        const P = promote && window.AFFlexPromote;
        const up = id => (P ? P.button(enPoint(id), c[(EN_BOXES.find(b => b[0] === id) || [])[1]], promote.open === enPoint(id)) : '');
        const farm = id => { const v = (inh || {})[enPoint(id)]; return v === undefined || v === null || v === '' ? '' : String(v); };
        const enOpts = (id, opts) => (farm(id) ? [['', '↳ ' + ((opts.find(o => o[0] === farm(id)) || [])[1] || farm(id))]].concat(opts.slice(1)) : opts);
        const openBox = P ? EN_BOXES.find(b => enPoint(b[0]) === promote.open && String(c[b[1]] || '').trim()) : null;
        const shownOf = b => { const t = [EN_WHEN, EN_SCOPE][['wf-libEnWhen', 'wf-libEnScope'].indexOf(b[0])]; return t ? ((t.find(o => o[0] === c[b[1]]) || [])[1] || c[b[1]]) : String(c[b[1]]); };
        const strip = openBox ? P.strip(enPoint(openBox[0]), openBox[2], shownOf(openBox), P.levelsAbove(enPoint(openBox[0]), 'workflow', {})) : '';
        ownAtRender = ownOf(c);
        return `<div class="ntsec"><b>Library</b>
            <span class="muted small">Every file a run makes — passed, failed, left out, parts — is filed into the local Airtable's media library and gets a full record. Blank = the Airtable page's defaults.</span></div>
            <div class="ntgrid">
                ${WF_TEXT.map(([id, key, label, ph, tip]) => text(C, id, label, c[key], ph, tip)).join('')}
                ${select(C, WF_RECORD, 'Records', RECORD, c.libRecord, 'Which files get an Airtable record. Every file is filed either way — nothing is thrown away. none switches the library off for this workflow.')}
                ${select(C, WF_START, 'Engine not running', START, c.libStart, 'What a run does when the database\'s engine is not running: start it (hidden, no browser), ask you, or never — then the records wait in the pending list and are written when it answers.')}
            </div>
            <div class="ntsec"><span class="muted small">Stage folders — which stage each kind of file goes to in this production. Blank = the built-in.</span></div>
            <div class="ntgrid">${WF_MAP.map(m => mapSelect(C, m, c[m[1]])).join('')}</div>
            <div class="ntsec"><span class="muted small">Fill the records — a model looks at each file and fills its record's meaning (topic, taxonomy, tone, platform fit, SEO, salvage notes on a failure…). Blank = the Farm settings.</span></div>
            <div class="ntgrid">
                ${select(C, 'wf-libEnWhen', 'When', enOpts('wf-libEnWhen', EN_WHEN), c.libEnWhen, 'When the records are filled: once the run has ended (one pass), as soon as each file is final or failed, or never — then only media.enrich fills one.', up('wf-libEnWhen'))}
                ${select(C, 'wf-libEnScope', 'Which files', enOpts('wf-libEnScope', EN_SCOPE), c.libEnScope, 'Which recorded files get filled: the final output and the failed or left-out files (their salvage notes), the final output only, or every file — parts too, one model turn each.', up('wf-libEnScope'))}
                ${EN_TEXT.map(([id, key, label, ph, tip]) => text(C, id, label, c[key], farm(id) ? farm(id) + ' — Farm Settings' : ph, tip, up(id))).join('')}
                ${strip}
            </div>`;
    }

    function wireWf(byId, draft, redraw) {
        // U-151 — a box that took or lost its own value gains or loses its ↑
        if (redraw) { EN_BOXES.forEach(([id]) => byId('nt-' + id, 'change', () => { if (ownOf(draft()) !== ownAtRender) { redraw(); } })); }
        WF_TEXT.forEach(([id, key]) => byId('nt-' + id, 'input', e => { const d = draft(); if (d) { d[key] = e.target.value; } }));
        WF_MAP.forEach(([id, key]) => byId('nt-' + id, 'change', e => { const d = draft(); if (d) { d[key] = e.target.value; } }));
        [['wf-libEnWhen', 'libEnWhen'], ['wf-libEnScope', 'libEnScope']].forEach(([id, key]) => byId('nt-' + id, 'change', e => { const d = draft(); if (d) { d[key] = e.target.value; } }));
        EN_TEXT.forEach(([id, key]) => byId('nt-' + id, 'input', e => { const d = draft(); if (d) { d[key] = e.target.value; } }));
        byId('nt-' + WF_RECORD, 'change', e => { const d = draft(); if (d) { d.libRecord = e.target.value; } });
        byId('nt-' + WF_START, 'change', e => { const d = draft(); if (d) { d.libStart = e.target.value; } });
    }

    window.AFLibrary = { blank, row, summary, read, wire, wfEditor, wireWf, draftKeyOf, stepKeyOf, STEP_KEYS };
})();
