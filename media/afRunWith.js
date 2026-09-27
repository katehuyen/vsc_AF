// Agent Farm — U-151 'RUN WITH…': one run's own values, drawn with the page form
// (media/afForm.js). A workflow's card holds its inputs and this run's wake set, each
// starting at the last run's value, else the workflow's default. A box that differs
// from the workflow's default carries ↑ → this flow (media/afFlexPromote.js). The
// page owns the draft `run` = { values: { <input>: value }, wake: preset id or '' }.
(function () {
    'use strict';
    // the boxes, each a flex point's run-level surface (media/afFlex.js names them by these strings)
    const RUN_IN = 'wi-run', RUN_WAKE = 'wi-wake';
    const F = () => window.AFForm;
    const pointAt = box => (window.AFFlexPromote ? window.AFFlexPromote.pointAt('media/afRunWith.js#' + box) : '');
    const inKey = i => pointAt(RUN_IN) + '#' + i.name;
    const wakeKey = () => pointAt(RUN_WAKE) + '#run';
    const differs = (i, v) => String(v == null ? '' : v) !== String(i.default || '');

    /** Which boxes hold a value of this run's own — a change of it redraws (↑ comes or goes). */
    function ownOf(p, run) {
        return (p.inputs || []).filter(i => differs(i, (run.values || {})[i.name])).map(i => i.name)
            .concat(run.wake ? ['wake'] : []).join(',');
    }

    let ownAtRender = '';
    /** True when a box gained or lost a value of its own since the card was drawn — the page redraws. */
    const changed = (p, run) => ownOf(p, run) !== ownAtRender;

    /** The card. `promote` = { open, levels(key) }; `dict` = the host's wake dictionary. */
    function workflowCard(p, run, C, promote, dict) {
        const P = promote && window.AFFlexPromote;
        ownAtRender = ownOf(p, run);
        const last = p.lastInputs || {};
        const strips = [];
        const fields = (p.inputs || []).map(i => {
            const base = last[i.name] !== undefined ? last[i.name] : (i.default || '');
            const v = (run.values || {})[i.name] !== undefined ? run.values[i.name] : base;
            const from = String(v) !== String(base) ? 'this run' : last[i.name] !== undefined ? 'the last run' : i.default ? 'the workflow default' : 'nothing yet';
            const own = differs(i, v) ? v : '';
            const o = {
                tip: `${v || '(empty)'} — ${from}\n\n${i.description || i.type}${i.required ? ' · required' : ''}`,
                after: P ? P.up(promote, inKey(i), own) : '', required: !!i.required, redraw: true, ph: i.description || i.type
            };
            if (P) { strips.push(P.stripFor(promote, inKey(i), i.name, v, own)); }
            return i.type === 'choice'
                ? F().sel(RUN_IN + '.' + i.name, i.name, [{ id: '', label: '—' }].concat((i.choices || []).map(c => ({ id: c, label: c }))), v, o)
                : F().text(RUN_IN + '.' + i.name, i.name, v, o);
        });
        const presets = (dict && dict.presets) || [];
        const mode = p.wakeMode || 'mechanical';
        const shown = run.wake ? ((presets.find(x => x.id === run.wake) || {}).label || run.wake) : '';
        const fromWake = run.wake ? (run.wake === p.lastWake ? 'the last run' : 'this run') : 'the workflow';
        const wake = dict ? F().sel(RUN_WAKE, 'Wake', [{ id: '', label: 'the workflow\'s — ' + mode }].concat(presets.map(x => ({ id: x.id, label: x.label, detail: x.describe }))), run.wake || '', {
            tip: `${shown || mode} — ${fromWake}\n\nWake conditions for this run only. Empty = the workflow's own (${mode}).`,
            after: P ? P.up(promote, wakeKey(), shown) : '', redraw: true
        }) : '';
        if (P && dict) { strips.push(P.stripFor(promote, wakeKey(), 'Wake', shown, shown)); }
        return F().card({
            id: 'nt-runwith', title: `Run “${p.title}” with`,
            lede: (p.inputs || []).length ? 'each box starts at the last run\'s value, else the input\'s default' : 'this run\'s own wake conditions, starting at the last run\'s',
            body: F().grid(fields, wake, strips), submit: 'Run with these'
        });
    }

    /** The form's values → the draft. */
    function apply(p, run, values) {
        (p.inputs || []).forEach(i => { const v = values[RUN_IN + '.' + i.name]; if (v !== undefined) { run.values[i.name] = v; } });
        if (values[RUN_WAKE] !== undefined) { run.wake = values[RUN_WAKE]; }
    }

    window.AFRunWith = { RUN_IN, RUN_WAKE, workflowCard, apply, changed };
})();
