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

    /** The blank draft: every box has a home, so a seed and a fresh form are one shape. '' = inherited. */
    function blank() {
        return { engine: '', model: '', maxCalls: '', budgetUsd: '', minConfidence: '', lowConfidence: '' };
    }

    const fallbackWord = v => { const f = FALLBACKS.find(x => x[0] === v); return f ? f[1] : String(v); };

    function num(s, lo, hi) {
        const t = String(s == null ? '' : s).trim();
        if (!t) { return undefined; }
        const v = Number(t);
        return Number.isFinite(v) && v >= lo && v <= hi ? v : NaN;
    }

    /** U-151 — the engine an empty box inherits from Farm Settings ('' = none). */
    function inheritedEngine(inh) {
        return inh && typeof inh.engine === 'string' ? inh.engine.trim() : '';
    }

    /** What is wrong with the boxes, in one sentence; '' when nothing is. `inh` = Farm Settings' supervisor fields. */
    function error(d, inh) {
        const s = Object.assign(blank(), d || {});
        if (!String(s.engine).trim() && !inheritedEngine(inh)) {
            return 'The supervisor needs an engine to judge the continuation — choose one here or set it in Farm Settings.';
        }
        if (Number.isNaN(num(s.maxCalls, 1, 5))) { return 'Supervisor calls: a whole number from 1 to 5.'; }
        if (Number.isNaN(num(s.budgetUsd, 0, 1000))) { return 'Supervisor budget: dollars, 0 or more (empty = no money cap).'; }
        if (Number.isNaN(num(s.minConfidence, 0, 1))) { return 'Supervisor confidence: a number from 0 to 1.'; }
        return '';
    }

    /** The draft as the policy the host stores — only the boxes that were filled; undefined when no engine is named here or inherited. */
    function toPolicy(d, inh) {
        const s = Object.assign(blank(), d || {});
        const engine = String(s.engine).trim();
        if (error(s, inh)) { return undefined; }
        const out = {};
        if (engine) { out.engine = engine; }
        const model = String(s.model).trim();
        if (model) { out.model = model; }
        const calls = num(s.maxCalls, 1, 5);
        if (calls !== undefined) { out.maxCalls = Math.round(calls); }
        const budget = num(s.budgetUsd, 0, 1000);
        if (budget) { out.budgetUsd = budget; }
        const conf = num(s.minConfidence, 0, 1);
        if (conf !== undefined) { out.minConfidence = conf; }
        if (FALLBACKS.some(f => f[0] === s.lowConfidence)) { out.lowConfidence = s.lowConfidence; }
        return out;
    }

    /**
     * U-151 — what an empty box inherits for this agent and this project: Farm Settings,
     * then the agent's own value, then the project's (`L` = the page's launch data);
     * `_from` names where each field came from.
     */
    function inherited(L, agent, project) {
        const l = L || {};
        const out = { _from: {} };
        const lay = (fields, from) => Object.keys(fields || {}).forEach(k => {
            if (fields[k] !== undefined && fields[k] !== '') { out[k] = fields[k]; out._from[k] = from; }
        });
        lay(l.supervisor, 'Farm Settings');
        const o = l.supervisorOverrides || {};
        if (agent) { lay((o.agent || {})[agent], 'agent ' + agent); }
        if (project) {
            const p = (l.projects || []).find(x => x.id === project);
            lay((o.project || {})[project], 'project ' + (p ? p.name : project));
        }
        return out;
    }

    const originOf = (up, key) => (up && up._from && up._from[key]) || 'Farm Settings';

    /** MIRROR's first line: what the box holds now and where it comes from. */
    function valueLine(key, value, up) {
        const word = v => (key === 'lowConfidence' ? fallbackWord(v) : String(v));
        const own = String(value == null ? '' : value).trim();
        if (own) { return word(own) + ' — set on this task'; }
        if (up && up[key] !== undefined && up[key] !== '') { return word(up[key]) + ' — inherited from ' + originOf(up, key); }
        const p = window.AFFlex.point('retry.supervisor.' + key);
        return (p && p.default !== '' && p.default !== 0 ? word(p.default) : 'none') + ' — built-in';
    }

    /** The first option of an empty select: what it inherits — SHORTHAND, the origin is on the tooltip's first line. */
    function inheritLabel(key, up) {
        return '↳ ' + valueLine(key, '', up).split(' — ')[0];
    }

    const LABELS = {
        engine: 'Supervisor engine', model: 'Supervisor model', maxCalls: 'Supervisor calls',
        budgetUsd: 'Supervisor budget $', minConfidence: 'Min confidence', lowConfidence: 'If it is not sure'
    };

    const KEY_OF = {
        'nt-supengine': 'engine', 'nt-supmodel': 'model', 'nt-supcalls': 'maxCalls',
        'nt-supbudget': 'budgetUsd', 'nt-supconf': 'minConfidence', 'nt-supfallback': 'lowConfidence'
    };

    /** After a change: the tooltip's first line follows the box, and the inherited engine stays faint only while it is inherited. */
    function retitle(el, inh) {
        const key = el && KEY_OF[el.id];
        const label = key && el.closest ? el.closest('label') : null;
        if (!label) { return; }
        const t = label.getAttribute('title') || '';
        const cut = t.indexOf('\n\n');
        label.setAttribute('title', valueLine(key, el.value, inh || {}) + (cut >= 0 ? t.slice(cut) : ''));
        if (el.tagName === 'SELECT') { el.classList.toggle('inh', !el.value); }
    }

    /**
     * The boxes. `engines` = [{ id, label, ready, next }]; `C` = the page's option/escape helper;
     * `inh` = Farm Settings' supervisor fields — an empty box shows that value faint (MIRROR: value, then origin).
     * U-151 — `promote` = { open: the key whose strip is open, levels } draws ↑ beside a box that holds its own value.
     */
    function row(d, engines, C, inh, promote) {
        const s = Object.assign(blank(), d || {});
        const up = inh || {};
        const list = (engines && engines.length) ? engines : [{ id: 'claude', label: 'Claude Code', ready: true }];
        const upEngine = inheritedEngine(up);
        const upLabel = upEngine ? ((list.find(e => e.id === upEngine) || {}).label || upEngine) : '';
        const eng = (upEngine
            ? C.option('', '↳ ' + upLabel, { selected: !s.engine, detail: 'inherited from ' + originOf(up, 'engine') })
            : C.option('', 'choose the engine that judges', { selected: !s.engine, disabled: true }))
            + list.map(e => C.option(e.id, e.label + (e.ready ? '' : ' — cannot run here'), {
                selected: e.id === s.engine, disabled: !e.ready, detail: e.next || ''
            })).join('');
        const mirror = (value, key) => valueLine(key, value, up);
        const P = promote && window.AFFlexPromote;
        const upBtn = (key, value) => (P ? P.button('retry.supervisor.' + key, value, promote.open === key) : '');
        const openKey = P && promote.open && String(s[promote.open] || '').trim() ? promote.open : '';
        const shown = key => (key === 'engine' ? ((list.find(e => e.id === s.engine) || {}).label || s.engine)
            : key === 'lowConfidence' ? fallbackWord(s.lowConfidence) : String(s[key]));
        const strip = openKey ? P.strip('retry.supervisor.' + openKey, LABELS[openKey], shown(openKey), promote.levels || []) : '';
        // X-370 — a tri point: ask / auto / never, the stored values from the flex registry;
        // U-151 — led by the inherited state, so an untouched box says nothing
        const fb = window.AFFlexForms.triSelect('nt-supfallback', window.AFFlex.point('retry.supervisor.lowConfidence').states,
            s.lowConfidence, C, { ask: 'hold, tell me', auto: 'continue (smart)', never: 'no retry' },
            inheritLabel('lowConfidence', up));
        const box = (id, key, label, value, ph, tip) => {
            const place = up[key] !== undefined ? String(up[key]) + ' — ' + originOf(up, key) : ph;
            return `<label class="ntf" title="${C.esc(mirror(value, key) + '\n\n' + tip)}"><span>${label}${upBtn(key, value)}</span>`
                + `<input type="text" id="nt-${id}" value="${C.esc(value)}" placeholder="${C.esc(place)}"></label>`;
        };
        return `<label class="ntf" title="${C.esc(valueLine('engine', s.engine, up) + '\n\n'
            + 'The engine that reads what the cut-off run left and decides how it goes on: resume it with a '
            + 'prompt, run the original again, wait, stop, or ask you. It runs read-only and never commits, '
            + 'pushes or closes anything. ‼️ An engine on the SAME plan as the task is limited by the same '
            + 'window, so it is asked only after the reset; an independent one can answer at once.')}"><span>Supervisor engine${upBtn('engine', s.engine)}</span>`
            + `<select id="nt-supengine"${!s.engine && upEngine ? ' class="inh"' : ''}>${eng}</select></label>`
            + box('supmodel', 'model', 'Supervisor model', s.model, '(optional) the engine’s default',
                'The model it judges with — a small one is usually enough; empty uses the engine’s default.')
            + box('supcalls', 'maxCalls', 'Supervisor calls', s.maxCalls, '2',
                'How many times it may be asked for this task, all limits together (1–5). Past it, the deterministic continuation is used.')
            + box('supbudget', 'budgetUsd', 'Supervisor budget $', s.budgetUsd, '(optional) no money cap',
                'Dollars across all its calls for this task. Empty = no money cap (the call cap still holds). Its cost is recorded as its own run, never mixed into the task’s.')
            + box('supconf', 'minConfidence', 'Min confidence', s.minConfidence, '0.6',
                'A decision it is less sure of than this (0–1) is not applied; the choice below is used instead.')
            + `<label class="ntf" title="${C.esc(mirror(s.lowConfidence, 'lowConfidence') + '\n\n' + 'What happens when its answer is below the confidence above, or it cannot be asked at all (its own limit, a timeout, a malformed answer).')}"><span>If it is not sure${upBtn('lowConfidence', s.lowConfidence)}</span>`
            + `${fb}</label>` + strip;
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

    window.AFSupervisor = { blank, row, read, toPolicy, error, retitle, valueLine, inherited, IDS, FALLBACKS };
})();
