// Agent Farm — U-151 'RUN WITH…': one run's own values, drawn with the page form
// (media/afForm.js). A workflow's card holds its inputs and this run's wake set, each
// starting at the last run's value, else the workflow's default. A box that differs
// from the workflow's default carries ↑ → this flow (media/afFlexPromote.js). The
// page owns the draft `run` = { values: { <input>: value }, wake: preset id or '' }.
(function () {
    'use strict';
    // the boxes, each a flex point's run-level surface (media/afFlex.js names them by these strings)
    const RUN_IN = 'wi-run', RUN_WAKE = 'wi-wake';
    // M-50 — this run's production for {brand.*}; drawn only when a step reads the brand or the workflow names one
    const RUN_PROD = 'wi-production';
    // A-27 — this run's hard spend cap (flex point workflow.spendCap, run level)
    const RUN_CAP = 'wi-spendCap';
    // A-27 — this run's judge ladder (flex point judge.ladder, run level), and the cost preset that fills both
    const RUN_LADDER = 'wi-judgeLadder', RUN_PRESET = 'wi-preset';
    const F = () => window.AFForm;
    const pointAt = box => (window.AFFlexPromote ? window.AFFlexPromote.pointAt('media/afRunWith.js#' + box) : '');
    const inKey = i => pointAt(RUN_IN) + '#' + i.name;
    const wakeKey = () => pointAt(RUN_WAKE) + '#run';
    const differs = (i, v) => String(v == null ? '' : v) !== String(i.default || '');

    /** Which boxes hold a value of this run's own — a change of it redraws (↑ comes or goes). */
    function ownOf(p, run) {
        return (p.inputs || []).filter(i => differs(i, (run.values || {})[i.name])).map(i => i.name)
            .concat(run.wake ? ['wake'] : [], run.production ? ['production'] : [], Object.keys(run.roles || {}).map(r => 'role:' + r),
                // A-27 — a cost preset changes what the Run cap and Judge ladder boxes show faint
                run.preset ? ['preset:' + run.preset] : []).join(',');
    }

    let ownAtRender = '';
    /** True when a box gained or lost a value of its own since the card was drawn — the page redraws. */
    const changed = (p, run) => ownOf(p, run) !== ownAtRender;

    /** The card. `promote` = { open, levels(key) }; `dict` = the host's wake dictionary. */
    function workflowCard(p, run, C, promote, dict, scenes, agents, costPresets) {
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
        const prod = prodBox(p, run, scenes);
        const roles = window.AFRoles ? window.AFRoles.runBoxes(p, run, agents, F()) : '';
        const cost = costBoxes(p, run, costPresets);
        return F().card({
            id: 'nt-runwith', title: `Run “${p.title}” with`,
            lede: (p.inputs || []).length ? 'each box starts at the last run\'s value, else the input\'s default'
                : prod ? 'this run\'s own wake conditions and brand kit' : 'this run\'s own wake conditions, starting at the last run\'s',
            body: F().grid(fields, wake, prod, roles, cost, strips), submit: 'Run with these'
        });
    }

    /** M-50 — the Brand kit box: the workflow's production, or another for this run only. */
    function prodBox(p, run, scenes) {
        const list = window.AFBrand ? window.AFBrand.productions(scenes) : [];
        if (!list.length || !(p.usesBrand || p.production)) { return ''; }
        const name = id => (list.find(x => x.id === id) || {}).label || id;
        const wf = p.production ? name(p.production) : 'none';
        return F().sel(RUN_PROD, 'Brand kit from', [{ id: '', label: 'the workflow\'s — ' + wf }].concat(list.map(x => ({ id: x.id, label: x.label }))), run.production || '', {
            tip: `${run.production ? name(run.production) + ' — this run' : wf + ' — the workflow'}\n\nThe production whose brand kit this run's steps read as {brand.*}. This run only; it beats the workflow's and a media step's own.`,
            redraw: true
        });
    }

    /** A-27 — the cost boxes: a preset picker, then the Run cap and the Judge ladder it fills; a typed box beats it. */
    function costBoxes(p, run, presets) {
        const list = presets || [];
        const pre = run.preset ? ((list.find(x => x.name === run.preset) || {}).run || {}) : {};
        const picker = list.length ? F().sel(RUN_PRESET, 'Cost preset', [{ id: '', label: 'none — the workflow\'s own' }].concat(list.map(x => ({ id: x.name, label: x.name, detail: x.describe || '' }))), run.preset || '', {
            redraw: true, tip: (run.preset || 'none') + '\n\nA cost preset fills this run\'s Run cap and Judge ladder; a box you type beats it. This run only.'
        }) : '';
        return [picker, capBox(p, run, pre), ladderBox(p, run, pre)];
    }

    /** The Judge ladder box: cheapest model first; a FAIL is judged one rung up before a retry is paid for. */
    function ladderBox(p, run, pre) {
        const under = pre.judgeLadder ? [pre.judgeLadder, 'the preset ' + run.preset] : p.judgeLadderSetting ? [p.judgeLadderSetting, 'Farm Settings'] : ['one judge', 'no ladder'];
        const mine = String(run.judgeLadder || '');
        // its own row: model ids are long, and a fifth box in the first row squeezes the Wake picker below its value
        return F().text(RUN_LADDER, 'Judge ladder', mine, {
            wide: true, ph: under[0] + ' — ' + under[1],
            tip: (mine ? mine + ' — this run' : under[0] + ' — ' + under[1]) + '\n\nModels cheapest first (haiku,sonnet): a step\'s check is judged on the first; a FAIL is judged once more on the next before the step is paid for again. A step with its own judge keeps it. This run only.'
        });
    }

    /** A-27 — the Run cap box: what this run may spend before no further step starts. */
    function capBox(p, run, pre) {
        const under = pre && pre.spendCap !== undefined ? [pre.spendCap > 0 ? '$' + pre.spendCap : 'none', 'the preset ' + run.preset]
            : p.spendCap > 0 ? ['$' + p.spendCap, 'the workflow'] : p.spendCapSetting > 0 ? ['$' + p.spendCapSetting, 'Farm Settings'] : ['none', 'no cap anywhere'];
        const mine = String(run.spendCap == null ? '' : run.spendCap);
        return F().text(RUN_CAP, 'Run cap $ (hard)', mine, {
            ph: under[0] + ' — ' + under[1],
            tip: (mine ? '$' + mine + ' — this run' : under[0] + ' — ' + under[1]) + '\n\nThis run\'s hard spend ceiling: once it has spent this much, no further step or for-each branch starts and the run stops, saying so. 0 = no cap for this run. This run only.'
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
        if (values[RUN_PROD] !== undefined) { run.production = values[RUN_PROD]; }
        if (values[RUN_CAP] !== undefined) { run.spendCap = values[RUN_CAP]; }
        if (values[RUN_LADDER] !== undefined) { run.judgeLadder = values[RUN_LADDER]; }
        if (values[RUN_PRESET] !== undefined) { run.preset = values[RUN_PRESET]; }
        if (window.AFRoles) { window.AFRoles.applyRun(p, run, values); }
    }

    window.AFRunWith = { RUN_IN, RUN_WAKE, RUN_PROD, RUN_CAP, RUN_LADDER, RUN_PRESET, workflowCard, scheduleCard, apply, changed };
})();
