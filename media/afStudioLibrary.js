// Agent Farm — the Studio wall read from the library (X-424).
//
// The Assets tab's cards are the media records of a local Airtable database;
// the .media.json sidecars are only a cache. This draws the two things that
// are new on that wall: the filter row over it — the LIVE level of the
// studio.library.* flex points (database, stages, kind, outcome), never
// remembered — with the line that says where the wall reads and why when it
// is the cache; and each card's record strip (stage, status, outcome, score,
// form fill, chain). studio.js owns the card itself.
(function () {
    'use strict';
    const STAGES = ['source', 'raw', 'semi', 'final', 'asset'];
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const tip = (trigger, head, body, cls) => (window.AFTip ? window.AFTip.wrap(trigger, head, body, cls) : trigger);
    const splitList = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
    let stagesPick = null;

    function select(id, label, cur, inherited, opts, what) {
        const shown = cur || inherited || '';
        return `<select id="${id}" title="${esc(label + ': ' + (opts.find(o => o[0] === shown) || ['', shown || 'all'])[1] + (cur ? '' : ' (inherited)') + '\n\n' + what)}">`
            + opts.map(o => {
                const text = o[0] === '' && inherited ? 'setting: ' + inherited : o[1];
                const note = o[0] === '' ? (inherited ? 'The Farm setting decides.' : 'No filter.') : '';
                return `<option value="${esc(o[0])}"${o[0] === cur ? ' selected' : ''} title="${esc(label + ': ' + text + (note ? '\n\n' + note : ''))}">${esc(text)}</option>`;
            }).join('')
            + '</select>';
    }

    /** The row over the wall: the view's filters, and where the wall reads. */
    function head(lib) {
        lib = lib || {};
        if (lib.source === 'off') { return ''; }
        const v = lib.view || {}, r = lib.resolved || {};
        const stages = splitList(v.stages).length ? splitList(v.stages) : (r.stages || []);
        stagesPick = stages.length ? stages : null;
        const src = lib.source === 'library'
            ? `<span class="badge" title="${esc('Database: ' + (lib.base || '') + '\n\nThe cards are the records of this local Airtable database.')}">DB ${esc(lib.base || '')}</span>`
            : lib.source === 'cache'
                ? '<span class="badge warn" title="Sidecar cache\n\nThe database could not be read — these cards come from the .media.json files, not from records.">cache</span>'
                : '<span class="badge muted" title="Reading the library">…</span>';
        const why = (lib.why || []).join('\n');
        return `<style>
                .sl-row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:6px; }
                .sl-row select, .sl-row input[type="text"] { font-size:11px; padding:3px 6px; }
                .sl-row .badge { margin-left:0; }
                .sl-strip { margin-top:3px; line-height:18px; }
                .sl-strip .badge { margin:0 1px 0 0; padding:0 5px; }
                .sl-strip .sl-act { font-size:10px; line-height:16px; padding:0 6px; margin:0 2px 0 0; }
            </style>
            <div class="sl-row">
                ${src}
                <input type="text" id="sl-base" size="9" value="${esc(v.base || '')}" placeholder="${esc(r.base || 'database')}" title="${esc('Database: ' + (v.base || r.base || 'none') + (v.base ? '' : ' (inherited)') + '\n\nWhich local Airtable database the wall reads. Empty = the Farm setting, else the Airtable page\'s default. Enter to read.')}">
                ${window.AFFilter ? window.AFFilter.multi({ id: 'sl-stages', label: 'Stages', options: STAGES, selected: stagesPick, allLabel: 'every stage', title: 'Which stage folders the wall shows' }) : ''}
                ${select('sl-kind', 'Kind', v.kind || '', r.kind || '', [['', 'all kinds'], ['image', 'image'], ['video', 'video'], ['audio', 'audio']], 'Which kind of media the wall shows.')}
                ${select('sl-success', 'Outcome', v.success || '', r.success || '', [['', 'passed + failed'], ['passed', 'passed'], ['failed', 'failed']], 'Only the files that passed, only the failed ones, or both.')}
                ${tip(`<span class="muted small sl-note">${esc(lib.note || '')}</span>`, 'Where the wall reads', why)}
            </div>
            ${lib.error ? `<div class="sub" style="color:var(--af-ink-errorForeground, var(--vscode-errorForeground))">${esc(lib.error)}</div>` : ''}`;
    }

    /** One card's record strip — figures only, the meaning on hover. */
    function strip(c, base) {
        if (!c) { return ''; }
        if (c.from === 'cache') {
            return `<div class="sub sl-strip">${tip('<span class="badge warn">no record</span>', 'Read from the sidecar cache',
                'This file has no record in ' + (base || 'the database') + ' yet (or the database could not be read), so the card is drawn from its .media.json sidecar: no stage status, score, form fill or chain to show.')}${c.stage ? ` <span class="badge" title="Stage: ${esc(c.stage)}">${esc(c.stage)}</span>` : ''}</div>`;
        }
        const parts = [];
        parts.push(`<span class="badge" title="${esc('Stage: ' + (c.stage || 'unknown') + '\nRecord: ' + c.id + (c.version ? '\nVersion: ' + c.version : ''))}">${esc(c.stage || '?')}</span>`);
        if (c.status) { parts.push(`<span class="badge muted" title="Status: ${esc(c.status)}">${esc(c.status)}</span>`); }
        parts.push(c.failed
            ? tip('<span class="badge warn">✗ failed</span>', 'Failed — ' + c.id, c.reason || 'No reason written on the record.')
            : '<span class="badge" title="Outcome: passed">✓</span>');
        if (c.score) { parts.push(`<span class="badge" title="${esc('Score: ' + c.score + ' (' + c.scoreBy + ')\n\n' + (c.scoreBy === 'human' ? 'A person scored it — beats the automatic score.' : 'The automatic score; nobody has scored it by hand yet.'))}">${c.scoreBy === 'human' ? 'H' : 'A'}${esc(c.score)}</span>`); }
        parts.push(`<span class="badge muted" title="Form fill: ${esc(c.fill)}%">${esc(c.fill)}%</span>`);
        const causes = c.causes || [], effects = c.effects || [];
        if (causes.length || effects.length) {
            parts.push(tip(`<span class="badge muted">C${causes.length} E${effects.length}</span>`, 'Chain — ' + causes.length + ' cause(s), ' + effects.length + ' effect(s)',
                (causes.length ? 'Made from:\n' + causes.join('\n') : 'Made from: nothing recorded') + '\n\n' + (effects.length ? 'Went into:\n' + effects.join('\n') : 'Went into: nothing recorded')));
        }
        if (c.id) { parts.push(acts(c, base)); }
        return `<div class="sub sl-strip">${parts.join(' ')}</div>`;
    }

    /** X-425 — what a person decides on a record: written onto the version this card shows. */
    function acts(c, base) {
        const human = c.scoreBy === 'human' ? String(c.score) : '';
        const data = `data-id="${esc(c.id)}" data-base="${esc(base || '')}" data-version="${esc(c.version || '')}" data-file="${esc(c.file || '')}" data-stage="${esc(c.stage || '')}" data-tags="${esc((c.tags || []).join(', '))}" data-score="${esc(human)}" data-note="${esc(c.note || '')}"`;
        const btn = (act, label, head, body) => tip(`<button class="sl-act" data-lib-act="${act}" ${data}>${esc(label)}</button>`, head, body);
        const guard = '\n\nWritten onto version ' + (c.version || '?') + ' of the record — if it changed in the Admin panel since, nothing is written and the wall is read again.';
        const out = [
            btn('select', 'Keep', 'Keep — ' + c.id, 'Marks it chosen on its record (workflow.approval_chain) and takes back a rejection made here.' + guard),
            btn('reject', 'Drop', 'Drop — ' + c.id, 'Marks it failed on its record — "rejected in Studio", salvageable — and counts the rejection. The file does not move.' + guard),
            btn('edit', '✎', 'Tags · score · note — ' + c.id, 'Tags: ' + ((c.tags || []).join(', ') || 'none') + '\nScore by hand: ' + (human || 'none') + '\nNote: ' + (c.note || 'none') + guard)
        ];
        const to = { raw: 'asset', semi: 'final' }[c.stage];
        if (to) {
            out.push(btn('promote', '↑ ' + to, 'Promote to ' + to + ' — ' + c.id, 'Moves the file from ' + c.stage + ' into the ' + to + ' folder and its record with it (media.restage).\n\nFarm setting agentFarm.studioLibraryPromote: ask first, or at once.'));
        }
        return out.join('');
    }

    let actsWired = false;
    /** One listener for every card's buttons, in the capture phase so the card's own click does not open the file. */
    function wireActs(post) {
        if (actsWired) { return; }
        actsWired = true;
        document.addEventListener('click', e => {
            const b = e.target && e.target.closest ? e.target.closest('[data-lib-act]') : null;
            if (!b) { return; }
            e.preventDefault();
            e.stopPropagation();
            const d = b.dataset;
            const card = { id: d.id, base: d.base, version: Number(d.version) || 0, file: d.file, stage: d.stage };
            if (d.libAct === 'promote') { post('libPromote', card); return; }
            post('libEdit', Object.assign(card, { kind: d.libAct, current: { tags: d.tags || '', score: d.score || '', note: d.note || '' } }));
        }, true);
    }

    /** The filter row's events: every change is one read of the library. */
    function wire(post) {
        const send = () => {
            const val = id => { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
            post('libraryView', { view: { base: val('sl-base'), stages: (stagesPick || STAGES).join(','), kind: val('sl-kind'), success: val('sl-success') } });
        };
        const base = document.getElementById('sl-base');
        if (base) { base.addEventListener('keydown', e => { if (e.key === 'Enter') { send(); } }); }
        ['sl-kind', 'sl-success'].forEach(id => { const el = document.getElementById(id); if (el) { el.addEventListener('change', send); } });
        if (window.AFFilter) { window.AFFilter.wireMulti({ id: 'sl-stages', onChange: sel => { stagesPick = sel; send(); } }); }
        wireActs(post);
    }

    window.AFStudioLib = { head: head, strip: strip, wire: wire };
})();
