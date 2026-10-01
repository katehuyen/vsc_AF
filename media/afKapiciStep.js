// Agent Farm — THE KAPICI STEP'S CARD ROW (M-60). A Kapıcı step asks one Kapıcı
// rule about what the run has made so far and routes the chain: carry on, stop,
// or ask you. Every box is a draft key the host maps to steps[].kapici
// (tasksPanel stepFromDraft), which also checks on save that the rule exists and
// can route a step; the fields are flex points (media/afFlex.js).
(function () {
    'use strict';
    const IDS = ['kpRule', 'kpInput', 'kpReject'];
    const BOX = { rule: 'st-kpRule', input: 'st-kpInput', reject: 'st-kpReject' };
    const SELECTS = ['kpReject'];
    const REJECT = [['stop', 'stop the workflow'], ['ask_user', 'ask you']];

    function blank() { return { kpRule: '', kpInput: '', kpReject: '' }; }

    function row(s, C, D) {
        const rules = (D && D.kapiciRules) || [];
        const rule = s.kpRule || '';
        const known = rules.find(r => r.id === rule);
        const rj = s.kpReject || 'stop';
        return `<div class="ntgrid">
            <label class="ntf" title="${C.esc('Current: ' + (rule || '(none)') + (known && known.description ? ' — ' + known.description : '')
                + '\n\nThe Gatekeeper rule that decides here. A pass/reject rule carries on when it passes; a rule that chooses among proceed / stop / ask_user names the way itself. Saving checks that the rule exists and can route a step.'
                + (rules.length ? '\n\nRules that can: ' + rules.map(r => r.id).join(', ') : ''))}"><span>Rule</span>
                <input type="text" id="nt-${BOX.rule}" list="nt-kp-rules" value="${C.esc(rule)}" placeholder="trigger.has-work"></label>
            <datalist id="nt-kp-rules">${rules.map(r => `<option value="${C.esc(r.id)}">${C.esc(r.description || '')}</option>`).join('')}</datalist>
            <label class="ntf" title="${C.esc('Current: ' + (REJECT.find(x => x[0] === rj) || REJECT[0])[1]
                + '\n\nWhat happens when the rule rejects. When Gatekeeper is not sure or cannot be reached, the rule\'s own paths decide: its failure path may stop, its low-confidence path may ask you, anything else carries on.')}"><span>If it rejects</span>
                <select id="nt-${BOX.reject}">${REJECT.map(([v, l]) => C.option(v, l, { selected: v === rj })).join('')}</select></label>
            <label class="ntf wide" title="${C.esc('Current: ' + (s.kpInput || '{prev_text} — the previous step\'s output')
                + '\n\nWhat Gatekeeper reads, as a template: {prev_text}, {prev_json.field}, {steps.<id>.text}, {input.<name>}.')}"><span>It reads</span>
                <input type="text" id="nt-${BOX.input}" value="${C.esc(s.kpInput || '')}" placeholder="{prev_text}"></label>
        </div>`;
    }

    function summary(s) { return 'Gatekeeper · ' + (s.kpRule || '(no rule)') + (s.kpReject === 'ask_user' ? ' · rejected → asks you' : ''); }
    function read(s, g) { IDS.forEach(id => { const el = g(id); if (el && el.value != null) { s[id] = String(el.value); } }); }
    function error(s) {
        const r = String(s.kpRule || '').trim();
        if (!r) { return 'A Gatekeeper step needs its rule — the Gatekeeper rule that decides where the chain goes.'; }
        return /^[\w.-]{1,80}$/.test(r) ? '' : 'A rule id is letters, digits, dots, dashes and underscores.';
    }
    /** Typing only reads; a settled rule or a reject choice redraws, so each tooltip's first line is the value it now holds. */
    function wire(byId, readStep, render) {
        IDS.forEach(id => byId('nt-st-' + id, SELECTS.indexOf(id) >= 0 ? 'change' : 'input', () => { readStep(); if (SELECTS.indexOf(id) >= 0 && render) { render(); } }));
        byId('nt-st-kpRule', 'change', () => { readStep(); if (render) { render(); } });
    }

    window.AFKapiciStep = { IDS, blank, row, summary, read, error, wire };
})();
