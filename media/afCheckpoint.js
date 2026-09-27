// Agent Farm — THE CHECKPOINT STEP (M-43). A checkpoint wakes the workflow's
// supervisor at that point, whatever happened, and its decision routes the run.
// Two surfaces, one module: the step card's Checkpoint row (every limit is a
// flex point `checkpoint.*`; a blank box is the built-in default) and the
// workflow form's goal and success criteria, which the supervisor reads first.
// Every box writes itself into its draft as it is typed, because the page
// redraws on every host push.
(function () {
    'use strict';
    const KINDS = [
        ['proceed', 'carry on'], ['retry', 'retry a step'], ['jump', 'jump to a step'],
        ['insert', 'insert steps'], ['ask_user', 'ask you'], ['stop', 'stop the run']
    ];
    const ALLOWED = 'st-cpAllowed', LOW = 'st-cpLow';
    // M-44 — the run's supervisor session, set on the workflow form: [box id, draft key, label, placeholder, tip, number?]
    const SUP = [
        ['wf-supModel', 'supModel', 'Model', 'the judge\'s', 'The model the supervisor runs on. Empty = the judge\'s cheap model. Escalation goes one step up (haiku → sonnet → opus).'],
        ['wf-supEffort', 'supEffort', 'Effort', 'default', 'How hard it thinks (low · medium · high · xhigh · max). Empty = the CLI\'s own.'],
        ['wf-supAccount', 'supAccount', 'Sign-in', 'the resolver\'s', 'Which account pays for its turns — a slot name or a policy (@emptiest). Empty = the resolver decides.'],
        ['wf-supCalls', 'supCalls', 'Calls per run', '10', 'The most supervisor turns one run may make; past it the run goes the mechanical way and says so.', true],
        ['wf-supBudget', 'supBudget', 'Budget $', '0', 'What its turns may cost per run. 0 = no budget.', true],
        ['wf-supFailures', 'supFailures', 'Failures in a row', '3', 'This many failed turns in a row switch it off for the run.', true],
        ['wf-supTimeout', 'supTimeout', 'Minutes per call', '5', 'A turn that takes longer is cut and counts as failed.', true]
    ];
    const SUP_MODE = 'wf-supBudgetMode';
    // A-27 — the whole run's hard spend cap (flex point workflow.spendCap)
    const CAP = 'wf-spendCap';
    const IDS = ['cpMsg', 'cpMaxInsert', 'cpKinds', 'cpRetries', 'cpConf', 'cpLow'];

    function blank() { return { cpMsg: '', cpAllowed: '', cpMaxInsert: '', cpKinds: '', cpRetries: '', cpConf: '', cpLow: '' }; }
    const words = v => String(v || '').split(/[,\s]+/).filter(Boolean);
    const allowedOf = s => (words(s.cpAllowed).length ? words(s.cpAllowed) : KINDS.map(k => k[0]));

    function num(C, id, label, value, ph, tip, step) {
        return `<label class="ntf" title="${C.esc(tip)}"><span>${C.esc(label)}</span>
            <input type="number" id="nt-${id}" step="${step || 1}" min="0" placeholder="${C.esc(ph)}" value="${C.esc(String(value == null ? '' : value))}"></label>`;
    }
    function text(C, id, label, value, ph, tip, wide) {
        return `<label class="ntf${wide ? ' wide' : ''}" title="${C.esc(tip)}"><span>${C.esc(label)}</span>
            <input type="text" id="nt-${id}" value="${C.esc(value == null ? '' : String(value))}" placeholder="${C.esc(ph)}"></label>`;
    }

    /** The step card's Checkpoint row. */
    function row(s, C) {
        const on = allowedOf(s);
        const low = [['', 'Default — ask you'], ['ask', 'ask you whether to apply it'], ['mechanical', 'carry on without it'], ['escalate', 'ask a stronger model once']];
        return `<div class="ntgrid">
            ${text(C, 'st-cpMsg', 'Look at', s.cpMsg, 'Is the script under 60 seconds and on brand?',
                'What the supervisor should weigh here. It reads this first, above the goal, then every step so far, the last output, the money spent — never the transcript.', true)}
            <div class="ntf wide" title="${C.esc('The decisions the supervisor may take here; one it may not take is refused and the run carries on. All ticked = the built-in list. None ticked = it may only carry on.')}"><span>May decide</span>
                <span>${KINDS.map(([k, label]) => `<label class="cbx"><input type="checkbox" id="nt-${ALLOWED}-${k}" data-cpkind="${k}"${on.indexOf(k) >= 0 ? ' checked' : ''}> ${C.esc(label)}</label>`).join(' ')}</span></div>
            ${on.indexOf('insert') >= 0 ? num(C, 'st-cpMaxInsert', 'Insert at most', s.cpMaxInsert, '2', 'The most steps one insert may add (0-5). Empty = 2.') : ''}
            ${on.indexOf('insert') >= 0 ? text(C, 'st-cpKinds', 'Insert kinds', s.cpKinds, 'agent,approval',
                'The kinds of step it may insert: agent (a prompt on the chain\'s nearest agent), approval (waits for you). Empty = both.') : ''}
            ${on.indexOf('retry') >= 0 ? num(C, 'st-cpRetries', 'Retries per step', s.cpRetries, '2', 'How many times the supervisor may send one step back (0-5). Empty = 2.') : ''}
            ${num(C, 'st-cpConf', 'Confidence', s.cpConf, '0.6', 'Below this (0-1) a decision is not applied as it stands. Empty = 0.6.', '0.05')}
            <label class="ntf" title="${C.esc('What a decision below the confidence threshold does.')}"><span>Below it</span>
                <select id="nt-${LOW}">${low.map(([id, label]) => C.option(id, label, { selected: id === (s.cpLow || '') })).join('')}</select></label>
        </div>`;
    }

    /** The step list's one-line "who" for a checkpoint. */
    function summary(s) {
        const m = String(s.cpMsg || '').trim();
        return 'the supervisor decides' + (m ? ' — ' + (m.length > 40 ? m.slice(0, 40) + '…' : m) : '');
    }

    function read(s, g) {
        IDS.forEach(id => { const el = g(id); if (el && el.value != null) { s[id] = String(el.value); } });
        const boxes = KINDS.map(k => g('cpAllowed-' + k[0])).filter(Boolean);
        if (!boxes.length) { return; }
        const ticked = boxes.filter(b => b.checked).map(b => b.dataset.cpkind);
        s.cpAllowed = ticked.length === KINDS.length ? '' : ticked.length ? ticked.join(',') : 'proceed';
    }

    function wire(byId, readStep, render) {
        IDS.forEach(id => byId('nt-st-' + id, id === 'cpLow' ? 'change' : 'input', () => readStep()));
        KINDS.forEach(k => byId('nt-st-cpAllowed-' + k[0], 'change', () => { readStep(); render(); }));
    }

    /** The workflow form's goal and success criteria (one per line). */
    function goalEditor(c, C) {
        return `<div class="ntsec"><b>Goal</b>
            <span class="muted small">What the chain is for, and how to tell it got there — a checkpoint's supervisor reads these before it decides.</span></div>
            <div class="ntgrid">
                <label class="ntf wide" title="${C.esc('One sentence: what a good run of this chain produces.')}"><span>Goal</span>
                    <input type="text" id="nt-wf-goal" value="${C.esc(c.goal || '')}" placeholder="A 34-second vertical clip, ready to post"></label>
                <label class="ntf wide" title="${C.esc('One per line. The supervisor holds the run against them.')}"><span>Success criteria</span>
                    <textarea id="nt-wf-criteria" rows="2" placeholder="under 35 seconds&#10;captions on every line">${C.esc(c.criteria || '')}</textarea></label>
            </div>
            <div class="ntsec"><b>Supervisor</b>
            <span class="muted small">Who answers at the checkpoints: one read-only session per run, resumed from checkpoint to checkpoint. Blank = the built-in.</span></div>
            <div class="ntgrid">
                ${SUP.map(([id, key, label, ph, tip, isNum]) => `<label class="ntf" title="${C.esc(tip)}"><span>${C.esc(label)}</span>
                    <input type="${isNum ? 'number' : 'text'}" id="nt-${id}"${isNum ? ' min="0" step="any"' : ''} placeholder="${C.esc(ph)}" value="${C.esc(c[key] == null ? '' : String(c[key]))}"></label>`).join('')}
                <label class="ntf" title="${C.esc('What passing the budget does: soft = it is said on the row and the supervisor carries on; hard = no further turn this run.')}"><span>Over the budget</span>
                    <select id="nt-${SUP_MODE}">${[['', 'Default — say it (soft)'], ['soft', 'say it (soft)'], ['hard', 'stop asking (hard)']].map(([id, label]) => C.option(id, label, { selected: id === (c.supBudgetMode || '') })).join('')}</select></label>
            </div>
            <div class="ntsec"><b>Cost</b>
            <span class="muted small">What the whole run may spend — every step and supervisor turn counted.</span></div>
            <div class="ntgrid">
                <label class="ntf num" title="${C.esc((c.spendCap ? '$' + c.spendCap + ' — this workflow' : 'Farm Settings, else none') + '\n\nThe WHOLE run\'s hard spend ceiling, every step and supervisor turn counted: once the run has spent this much, no further step or for-each branch starts and the run stops, saying so — nothing is asked. 0 or blank = Farm Settings (agentFarm.workflowSpendCap), else none. The soft ceiling is a Wake condition on cost.run.')}"><span>Run cap $ (hard)</span>
                    <input type="number" id="nt-${CAP}" min="0" step="any" placeholder="Farm Settings, else none" value="${C.esc(c.spendCap == null ? '' : String(c.spendCap))}"></label>
            </div>`;
    }

    function wireGoal(byId, draft) {
        byId('nt-wf-goal', 'input', e => { const d = draft(); if (d) { d.goal = e.target.value; } });
        byId('nt-wf-criteria', 'input', e => { const d = draft(); if (d) { d.criteria = e.target.value; } });
        SUP.forEach(([id, key]) => byId('nt-' + id, 'input', e => { const d = draft(); if (d) { d[key] = e.target.value; } }));
        byId('nt-' + SUP_MODE, 'change', e => { const d = draft(); if (d) { d.supBudgetMode = e.target.value; } });
        byId('nt-' + CAP, 'input', e => { const d = draft(); if (d) { d.spendCap = e.target.value; } });
    }

    window.AFCheckpoint = { KINDS, IDS, blank, row, summary, read, wire, goalEditor, wireGoal };
})();
