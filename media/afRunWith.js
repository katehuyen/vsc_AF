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

    // A schedule's card: this run's supervisor values over its supervised retry, and a preset under them.
    const SUP = 'rs-sup', PRESET = 'rs-preset';
    const SUP_BOXES = [['model', 'Supervisor model'], ['engine', 'Supervisor engine'], ['maxCalls', 'Calls'],
        ['budgetUsd', 'Budget $'], ['minConfidence', 'Min confidence']];
    const LOW = [['', ''], ['ask', 'hold, tell me'], ['auto', 'continue (smart)'], ['never', 'no retry']];

    /** What a box will use when it is left empty, and where that comes from — MIRROR's first line. */
    function under(p, run, presets, k) {
        const pre = run.preset ? (presets.find(x => x.name === run.preset) || {}).supervisor || {} : {};
        if (pre[k] !== undefined) { return [String(pre[k]), 'the preset ' + run.preset]; }
        const own = (p.supervisor || {})[k];
        return own !== undefined && own !== '' ? [String(own), 'this schedule'] : ['', 'the default'];
    }

    /** `run` = { kind: 'schedule', id, sup: { <field>: value }, preset }; `presets` = [{ name, describe, supervisor }]. */
    function scheduleCard(p, run, C, presets) {
        const list = presets || [];
        const box = (k, label) => {
            const [v, from] = under(p, run, list, k);
            const mine = String((run.sup || {})[k] || '');
            return F().text(SUP + '.' + k, label, mine, {
                ph: v ? v + ' — ' + from : from,
                tip: (mine ? mine + ' — this run' : (v || 'the default') + ' — ' + from) + '\n\nThis run only: the schedule keeps its own.'
            });
        };
        const [lv, lfrom] = under(p, run, list, 'lowConfidence');
        const lowWord = x => (LOW.find(o => o[0] === x) || [])[1] || x;
        const low = F().sel(SUP + '.lowConfidence', 'If it is not sure',
            LOW.map(([id, label]) => ({ id, label: id ? label : '↳ ' + (lv ? lowWord(lv) : 'the default') })), (run.sup || {}).lowConfidence || '',
            { tip: ((run.sup || {}).lowConfidence ? lowWord(run.sup.lowConfidence) + ' — this run' : (lv ? lowWord(lv) : 'the default') + ' — ' + lfrom) + '\n\nWhat the supervisor does when it is not sure of its call.' });
        const picker = F().sel(PRESET, 'Preset', [{ id: '', label: 'none — the schedule\'s own' }].concat(list.map(x => ({ id: x.name, label: x.name, detail: x.describe || '' }))), run.preset || '', {
            redraw: true, tip: (run.preset || 'none') + '\n\nA preset fills this run\'s supervisor values; a box you type beats it.'
        });
        return F().card({
            id: 'nt-runwith', title: `Run “${p.title}” with`, lede: 'this run\'s own supervisor — the schedule keeps its own',
            body: F().grid(picker, SUP_BOXES.map(([k, l]) => box(k, l)), low), submit: 'Run with these'
        });
    }

    /** The form's values → the draft. */
    function apply(p, run, values) {
        if (run.kind === 'schedule') {
            run.sup = run.sup || {};
            SUP_BOXES.map(b => b[0]).concat(['lowConfidence']).forEach(k => { const v = values[SUP + '.' + k]; if (v !== undefined) { run.sup[k] = v; } });
            if (values[PRESET] !== undefined) { run.preset = values[PRESET]; }
            return;
        }
        (p.inputs || []).forEach(i => { const v = values[RUN_IN + '.' + i.name]; if (v !== undefined) { run.values[i.name] = v; } });
        if (values[RUN_WAKE] !== undefined) { run.wake = values[RUN_WAKE]; }
    }

    window.AFRunWith = { RUN_IN, RUN_WAKE, workflowCard, scheduleCard, apply, changed };
})();
