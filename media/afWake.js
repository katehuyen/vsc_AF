// Agent Farm — WAKING THE SUPERVISOR ON AN EVENT (M-45). When a step ends, the
// run's wake conditions are held against what it measured: nothing fires = the
// mechanical path, something fires = the supervisor is asked as if a checkpoint
// stood right after that step. Three surfaces, one module: the workflow form's
// Wake block (presets + conditions), the step card's override, the Run card's
// "this run only". Every list is the host's dictionary (DATA.wakeDict, from
// src/core/workflowPolicy.ts), so a field added there turns up here unchanged.
(function () {
    'use strict';
    const WF = 'wf-wake', ST = 'st-wake', RUN = 'wi-wake';
    const clone = x => JSON.parse(JSON.stringify(x || []));
    const one = c => Array.isArray(c.all) ? ['&'].concat(c.all.map(one))
        : [c.field || '', c.operator || '', c.value === undefined || c.value === null ? '' : String(c.value)];
    const norm = list => JSON.stringify((list || []).map(one));
    const specOf = (d, field) => (d.fields || []).find(f => f.field === field) || null;
    const opsOf = (d, field) => {
        const f = specOf(d, field);
        return (d.operators || []).filter(o => !f || (o.types || []).indexOf(f.type) >= 0);
    };

    /** Which preset the set IS — derived on every paint, never remembered. */
    function modeOf(d, list) {
        const p = (d.presets || []).find(x => norm(x.conditions) === norm(list));
        return p ? p.id : 'custom';
    }
    function modeLabel(d, list) {
        const m = modeOf(d, list);
        const p = (d.presets || []).find(x => x.id === m);
        return p ? p.label : (list || []).length + ' condition(s)';
    }
    function words(d, c) {
        if (Array.isArray(c.all)) { return c.all.map(x => words(d, x)).join(' and '); }
        const o = (d.operators || []).find(x => x.id === c.operator);
        return [c.field || '?', o ? o.label : (c.operator || '?'), o && o.takesValue ? String(c.value === undefined ? '' : c.value) : '']
            .filter(Boolean).join(' ');
    }
    function freeId(list) {
        const used = {};
        list.forEach(c => { used[String(c.id || '')] = 1; });
        let n = list.length + 1;
        while (used['c' + n]) { n += 1; }
        return 'c' + n;
    }

    function valueBox(C, pfx, i, c, f, o) {
        if (o && !o.takesValue) { return '<span class="muted small">no value</span>'; }
        const id = `nt-${pfx}-v-${i}`, v = c.value === undefined || c.value === null ? '' : String(c.value);
        if (f && f.values) {
            return `<select id="${id}">${f.values.map(x => C.option(x, x === '' ? '(none)' : x, { selected: x === v })).join('')}</select>`;
        }
        return `<input type="${f && f.type === 'number' ? 'number' : 'text'}" id="${id}" step="any" value="${C.esc(v)}" placeholder="${f && f.type === 'number' ? '0' : 'text'}">`;
    }

    /** The condition rows and their presets; `pfx` keeps two editors on one page apart. */
    function editor(pfx, list, d, C, chips) {
        const mode = modeOf(d, list);
        const strip = chips ? `<span class="wkchips">${(d.presets || []).map(p =>
            `<button type="button" class="chip${mode === p.id ? ' on' : ''}" id="nt-${pfx}-p-${p.id}" title="${C.esc(p.label + '\n\n' + p.describe)}">${C.esc(p.label)}</button>`).join('')}
            ${mode === 'custom' ? '<span class="muted small" title="The conditions below are your own — no preset holds exactly this set.">custom</span>' : ''}</span>` : '';
        const rows = list.map((c, i) => {
            if (Array.isArray(c.all)) {
                return `<div class="wkrow"><span class="small" title="${C.esc('An AND group — every part must hold. Edit it through workflows.update.')}">${C.esc(c.id + ': ' + words(d, c))}</span>
                    <button type="button" class="mini secondary" id="nt-${pfx}-x-${i}" title="Drop this condition">✕</button></div>`;
            }
            const f = specOf(d, c.field), ops = opsOf(d, c.field), o = ops.find(x => x.id === c.operator);
            const gone = c.field && !f ? C.option(c.field, '⚠ ' + c.field, { selected: true, detail: 'Nothing measures this any more.' }) : '';
            return `<div class="wkrow" title="${C.esc(c.id + ': ' + words(d, c) + (f ? '\n\n' + f.describe : ''))}">
                <select id="nt-${pfx}-f-${i}">${gone}${(d.fields || []).map(x => C.option(x.field, x.field, { selected: x.field === c.field, detail: x.describe })).join('')}</select>
                <select id="nt-${pfx}-o-${i}">${ops.map(x => C.option(x.id, x.label, { selected: x.id === c.operator })).join('')}</select>
                ${valueBox(C, pfx, i, c, f, o)}
                <button type="button" class="mini secondary" id="nt-${pfx}-x-${i}" title="Drop this condition">✕</button></div>`;
        }).join('');
        return `${strip}${rows || '<div class="muted small">No conditions — the chain runs mechanically between steps (zero tokens).</div>'}
            <div class="ctl-row"><button type="button" class="mini secondary" id="nt-${pfx}-add" title="Wake the supervisor when this holds too. Conditions are ORed.">+ condition</button></div>`;
    }

    /** The workflow form's Wake block. `c.wake` is the list; empty = Mechanical. */
    function workflowBlock(c, d, C) {
        if (!d) { return ''; }
        c.wake = c.wake || [];
        return `<div class="ntsec" id="nt-${WF}"><b>Wake the supervisor</b>
            <span class="muted small">After every step these are checked against what it did; one that holds asks the supervisor what next, as a checkpoint would. None = mechanical.</span></div>
            <div class="wkbox">${editor(WF, c.wake, d, C, true)}</div>`;
    }

    /** U-151 — the flex point the step's override sets, read off the registry. */
    const stPoint = () => (window.AFFlexPromote ? window.AFFlexPromote.pointAt('media/afWake.js#' + ST) : '');

    /** The step card's override: the workflow's set, a preset, or its own conditions. U-151 — `promote` draws ↑ → this flow. */
    function stepRow(s, wf, d, C, promote) {
        if (!d) { return ''; }
        const has = Array.isArray(s.wake);
        const pick = has ? modeOf(d, s.wake) : '';
        const opts = [['', 'the workflow\'s — ' + modeLabel(d, wf || [])]].concat((d.presets || []).map(p => [p.id, p.label]), [['custom', 'its own conditions']]);
        const P = promote && window.AFFlexPromote;
        const shown = has ? modeLabel(d, s.wake) : '';
        return `<div class="ntgrid"><label class="ntf" title="${C.esc('Which conditions wake the supervisor after THIS step. The workflow\'s = the Wake block below.')}"><span>Wake after it${P ? P.up(promote, stPoint(), shown) : ''}</span>
            <select id="nt-${ST}">${opts.map(([id, label]) => C.option(id, label, { selected: id === pick })).join('')}</select></label>
            ${P ? P.stripFor(promote, stPoint(), 'Wake after it', shown, shown) : ''}</div>
            ${has ? `<div class="wkbox">${editor(ST, s.wake, d, C, false)}</div>` : ''}`;
    }

    /** The Run card's "this run only". */
    function runRow(wfMode, v, d, C) {
        if (!d) { return ''; }
        return `<label class="ntf" title="${C.esc('Wake conditions for this run only. Empty = the workflow\'s own (' + (wfMode || 'mechanical') + ').')}"><span>Wake</span>
            <select id="nt-${RUN}">${[['', 'the workflow\'s — ' + (wfMode || 'mechanical')]].concat((d.presets || []).map(p => [p.id, p.label]))
            .map(([id, label]) => C.option(id, label, { selected: id === (v || '') })).join('')}</select></label>`;
    }

    function wireEditor(pfx, byId, get, d, render) {
        (d.presets || []).forEach(p => byId(`nt-${pfx}-p-${p.id}`, 'click', () => { get().splice(0, Infinity, ...clone(p.conditions)); render(); }));
        byId(`nt-${pfx}-add`, 'click', () => {
            const l = get();
            l.push({ id: freeId(l), field: 'step.status', operator: 'eq', value: 'failed' });
            render();
        });
        get().forEach((c, i) => {
            byId(`nt-${pfx}-x-${i}`, 'click', () => { get().splice(i, 1); render(); });
            if (Array.isArray(c.all)) { return; }
            byId(`nt-${pfx}-f-${i}`, 'change', e => {
                c.field = e.target.value;
                const f = specOf(d, c.field), ops = opsOf(d, c.field);
                if (!ops.some(o => o.id === c.operator)) { c.operator = ops[0] ? ops[0].id : ''; }
                const o = ops.find(x => x.id === c.operator);
                if (o && !o.takesValue) { delete c.value; } else { c.value = f && f.values ? f.values[0] : f && f.type === 'number' ? 0 : ''; }
                render();
            });
            byId(`nt-${pfx}-o-${i}`, 'change', e => {
                c.operator = e.target.value;
                const o = (d.operators || []).find(x => x.id === c.operator);
                if (o && !o.takesValue) { delete c.value; }
                render();
            });
            const f = specOf(d, c.field);
            byId(`nt-${pfx}-v-${i}`, f && f.values ? 'change' : 'input', e => {
                const t = e.target.value;
                c.value = f && f.type === 'number' && t !== '' && Number.isFinite(Number(t)) ? Number(t) : t;
            });
        });
    }

    function wireWorkflow(byId, draft, d, render) {
        const c = draft();
        if (!c || !d) { return; }
        c.wake = c.wake || [];
        wireEditor(WF, byId, () => c.wake, d, render);
    }

    function wireStep(byId, step, d, render) {
        const s = step();
        if (!s || !d) { return; }
        byId(`nt-${ST}`, 'change', e => {
            const v = e.target.value;
            if (!v) { delete s.wake; } else if (v !== 'custom') {
                s.wake = clone(((d.presets || []).find(p => p.id === v) || {}).conditions);
            } else if (!Array.isArray(s.wake)) { s.wake = []; }
            render();
        });
        if (Array.isArray(s.wake)) { wireEditor(ST, byId, () => s.wake, d, render); }
    }

    window.AFWake = { WF, ST, RUN, modeOf, modeLabel, workflowBlock, stepRow, runRow, wireWorkflow, wireStep, stepPoint: stPoint };
})();
