// Agent Farm — THE SUPERVISOR BOX (M-13). A retry whose behavior is
// "supervisor" asks a bounded agent how to continue after a limit; these are
// the boxes that name it: which engine and model judge, how many calls and how
// much money it may spend, how sure it has to be, and what happens when it is
// not. The draft keeps every box as TEXT ("" = say nothing), so an untouched
// box never turns into a decision; `toPolicy` is the one place a number is made.
(function () {
    'use strict';
    const FALLBACKS = [
        ['smart', 'continue (smart)'],
        ['park', 'hold, tell me'],
        ['stop', 'no retry']
    ];

    /** The blank draft: every box has a home, so a seed and a fresh form are one shape. */
    function blank() {
        return { engine: '', model: '', maxCalls: '', budgetUsd: '', minConfidence: '', lowConfidence: 'smart' };
    }

    function num(s, lo, hi) {
        const t = String(s == null ? '' : s).trim();
        if (!t) { return undefined; }
        const v = Number(t);
        return Number.isFinite(v) && v >= lo && v <= hi ? v : NaN;
    }

    /** What is wrong with the boxes, in one sentence; '' when nothing is. */
    function error(d) {
        const s = Object.assign(blank(), d || {});
        if (!String(s.engine).trim()) { return 'The supervisor needs an engine to judge the continuation.'; }
        if (Number.isNaN(num(s.maxCalls, 1, 5))) { return 'Supervisor calls: a whole number from 1 to 5.'; }
        if (Number.isNaN(num(s.budgetUsd, 0, 1000))) { return 'Supervisor budget: dollars, 0 or more (empty = no money cap).'; }
        if (Number.isNaN(num(s.minConfidence, 0, 1))) { return 'Supervisor confidence: a number from 0 to 1.'; }
        return '';
    }

    /** The draft as the policy the host stores; undefined when no engine was named. */
    function toPolicy(d) {
        const s = Object.assign(blank(), d || {});
        const engine = String(s.engine).trim();
        if (!engine || error(s)) { return undefined; }
        const out = { engine };
        const model = String(s.model).trim();
        if (model) { out.model = model; }
        const calls = num(s.maxCalls, 1, 5);
        if (calls !== undefined) { out.maxCalls = Math.round(calls); }
        const budget = num(s.budgetUsd, 0, 1000);
        if (budget) { out.budgetUsd = budget; }
        const conf = num(s.minConfidence, 0, 1);
        if (conf !== undefined) { out.minConfidence = conf; }
        out.lowConfidence = FALLBACKS.some(f => f[0] === s.lowConfidence) ? s.lowConfidence : 'smart';
        return out;
    }

    /** The boxes. `engines` = [{ id, label, ready, next }]; `C` = the page's option/escape helper. */
    function row(d, engines, C) {
        const s = Object.assign(blank(), d || {});
        const list = (engines && engines.length) ? engines : [{ id: 'claude', label: 'Claude Code', ready: true }];
        const eng = C.option('', 'choose the engine that judges', { selected: !s.engine, disabled: true })
            + list.map(e => C.option(e.id, e.label + (e.ready ? '' : ' — cannot run here'), {
                selected: e.id === s.engine, disabled: !e.ready, detail: e.next || ''
            })).join('');
        // X-370 — a tri point: ask / auto / never, the stored values from the flex registry
        const fb = window.AFFlexForms.triSelect('nt-supfallback', window.AFFlex.point('retry.supervisor.lowConfidence').states,
            s.lowConfidence, C, { ask: 'hold, tell me', auto: 'continue (smart)', never: 'no retry' });
        const box = (id, label, value, ph, tip) => `<label class="ntf" title="${C.esc(tip)}"><span>${label}</span>`
            + `<input type="text" id="nt-${id}" value="${C.esc(value)}" placeholder="${C.esc(ph)}"></label>`;
        return `<label class="ntf" title="${C.esc(
            'The engine that reads what the cut-off run left and decides how it goes on: resume it with a '
            + 'prompt, run the original again, wait, stop, or ask you. It runs read-only and never commits, '
            + 'pushes or closes anything. ‼️ An engine on the SAME plan as the task is limited by the same '
            + 'window, so it is asked only after the reset; an independent one can answer at once.')}"><span>Supervisor engine</span>`
            + `<select id="nt-supengine">${eng}</select></label>`
            + box('supmodel', 'Supervisor model', s.model, '(optional) the engine’s default',
                'The model it judges with — a small one is usually enough; empty uses the engine’s default.')
            + box('supcalls', 'Supervisor calls', s.maxCalls, '2',
                'How many times it may be asked for this task, all limits together (1–5). Past it, the deterministic continuation is used.')
            + box('supbudget', 'Supervisor budget $', s.budgetUsd, '(optional) no money cap',
                'Dollars across all its calls for this task. Empty = no money cap (the call cap still holds). Its cost is recorded as its own run, never mixed into the task’s.')
            + box('supconf', 'Min confidence', s.minConfidence, '0.6',
                'A decision it is less sure of than this (0–1) is not applied; the choice below is used instead.')
            + `<label class="ntf" title="${C.esc('What happens when its answer is below the confidence above, or it cannot be asked at all (its own limit, a timeout, a malformed answer).')}"><span>If it is not sure</span>`
            + `${fb}</label>`;
    }

    /** Read the boxes back into the draft; `get(id)` answers an element's value or undefined when it is not on the page. */
    function read(d, get) {
        const s = Object.assign(blank(), d || {});
        const put = (id, key) => { const v = get(id); if (v !== undefined) { s[key] = String(v); } };
        put('nt-supengine', 'engine'); put('nt-supmodel', 'model'); put('nt-supcalls', 'maxCalls');
        put('nt-supbudget', 'budgetUsd'); put('nt-supconf', 'minConfidence'); put('nt-supfallback', 'lowConfidence');
        return s;
    }

    const IDS = ['nt-supengine', 'nt-supmodel', 'nt-supcalls', 'nt-supbudget', 'nt-supconf', 'nt-supfallback'];

    window.AFSupervisor = { blank, row, read, toPolicy, error, IDS, FALLBACKS };
})();
