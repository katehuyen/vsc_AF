/**
 * AFPolicies — the account policies view: the built-in four as a table, every
 * named rule as a card, the rule form with its nested step editor, and the
 * wiring of every press on them (X-305 · X-324).
 *
 * ‼️ ONE VIEW, TWO PAGES. This is the Engines page's policies section lifted
 * out verbatim so the dedicated Accounts page draws the SAME section from the
 * SAME data with the SAME gestures — the rules choose a sign-in, and a page
 * about sign-ins that could not show the rules was the page's one gap. The
 * page hands in its context (`DATA`, `post`, `esc`, `engineLabel`, and
 * its own `render`, which the form asks for on every keystroke it owns) and
 * gets markup back; presses post the message types
 * `src/panels/policyMessages.ts` answers for both panels.
 *
 * The draft being written (`polForm`), the section's message line and which
 * write it answers are the VIEW's state, not the page's: one webview draws one
 * section, so a module-level draft is exactly one draft.
 */
(function () {
    'use strict';
    let DATA = {};
    let ctx = {};
    /** a refusal from a rule save or delete, shown in the form (or the section,
     *  when no form is open) rather than as a toast */
    let polMsg = '';
    /** the rule being written, as a draft the view owns — steps included, so
     *  reordering or removing one touches nothing stored until Save */
    let polForm = null;
    /** which write the next `pol-msg` answers — only a SAVE that went through
     *  closes the form; a delete pressed beside an open draft leaves it be */
    let polPending = '';
    const post = (m) => ctx.post(m);
    const esc = (s) => ctx.esc(s);
    const engineLabel = (id) => ctx.engineLabel(id);
    const render = () => ctx.render();
    const use = (c) => { ctx = c || {}; DATA = ctx.DATA || {}; };

    /* ---- X-305 — the rules that choose a sign-in at launch ------------------ */

    const POL = () => DATA.policies || { engines: [], builtIn: [], rules: [], ceiling: 90 };
    /** A slot's label off the accounts the page already has; the id when unknown. */
    const slotName = (id) => {
        const a = (DATA.accounts || []).find(x => x.id === id);
        return a ? a.label : id;
    };
    /** `@Gece_Nobeti` for a rule object, `@emptiest` for a built-in. */
    const ruleId = (r) => r.id || ('@' + r.name);
    /* X-324 — how a rule reads its steps; the words are the core's (POLICY_STRATEGIES). */
    const STRATEGY = {
        chain: {
            label: 'chain', glyph: '→',
            head: 'Chain: walked top to bottom',
            body: 'Step 1 carries every launch until it is walled, then step 2, then step 3. The first step with a usable answer wins.'
        },
        emptiest: {
            label: 'emptiest', glyph: '⚖',
            head: 'Emptiest: the most room among the listed',
            body: 'The listed sign-ins are a pool of their own: at each launch their figures are compared and the one with the most room starts. '
                + '"Of my five sign-ins, the emptiest of these three" — which the built-in @emptiest (every sign-in of the engine) cannot say. Every step is then an account.'
        }
    };
    const strategyOf = (r) => (r && r.strategy === 'emptiest') ? 'emptiest' : 'chain';
    /** Why the switch is locked on chain: a rule among the steps has no single figure. '' when free. */
    const emptiestLock = (chain) => {
        const rules = (chain || []).map((st, i) => ({ st, i })).filter(x => x.st.policy);
        if (!rules.length) { return ''; }
        return 'Locked on chain: emptiest mode compares the listed sign-ins by their figures, and a rule has no single figure ('
            + rules.map(x => 'step ' + (x.i + 1) + ' names ' + x.st.policy).join(', ')
            + '). Replace the rule steps with accounts to compare them.';
    };

    /**
     * What a rule comes to on one engine, as a chip. The chip is the FACT (a
     * slot, or that none can be chosen) and its AFTip carries the figure that
     * decided it and the rule's standing description under it (MIRROR). Yellow
     * for "cannot choose right now" — the palette's word for "your move", and
     * NOT red: a rule walled at 11:02 is still the right answer at 14:50.
     */
    function policyNowHtml(rule, n, bare) {
        const T = window.AFTip;
        // The engine is named on the chip only where nothing beside it does:
        // a table column or the card's own engine pill already says it.
        const many = !bare && !rule.engine && POL().engines.length > 1;
        const who = many ? engineLabel(n.engine) + ' ' : '';
        const text = n.refusal ? (who ? who + '· ' : '') + 'nothing right now'
            : who + '→ ' + (n.picks || 'Main account');
        const head = ruleId(rule) + ' on ' + engineLabel(n.engine)
            + (n.refusal ? ' — cannot choose right now' : ' → ' + (n.picks || 'Main account'));
        return T.wrap('<span class="engacct polnow' + (n.refusal ? ' a-no' : ' a-on') + '">' + esc(text) + '</span>',
            head, window.AFAccount.policyDetail({ refusal: n.refusal, note: n.note, detail: rule.detail || rule.note || '' }));
    }

    /** One step of a chain, in the shortest unambiguous form (SHORTHAND). */
    function stepText(st) {
        const what = st.policy ? st.policy : slotName(st.account);
        const bits = [];
        if (st.ceiling) { bits.push('≤ ' + st.ceiling + '%'); }
        if (st.models && st.models.length) { bits.push(st.models.join(', ')); }
        return what + (bits.length ? ' (' + bits.join(' · ') + ')' : '');
    }

    function policyCardHtml(r) {
        const T = window.AFTip;
        const chain = r.chain || [];
        return '<div class="pocard polcard" data-polname="' + esc(r.name) + '">'
            + '<div class="pohead">'
            + '<span class="poname">@' + esc(r.name) + '</span>'
            + (r.now || []).map(n => policyNowHtml(r, n)).join('')
            + T.wrap('<span class="poid">' + esc(r.engine ? engineLabel(r.engine) : 'any engine') + '</span>',
                r.engine ? 'A rule for ' + engineLabel(r.engine) + ' only' : 'Not pinned to an engine',
                r.engine
                    ? 'A slot belongs to one engine, so this rule does too: a launch on another engine is refused by name rather than given whatever that engine is signed in as.'
                    : 'Asked about whichever engine the launch is on. A step naming a slot of another engine is skipped there.')
            + T.wrap('<span class="poid">≤ ' + esc(r.ceiling || POL().ceiling) + '%</span>',
                'Wall: ' + (r.ceiling || POL().ceiling) + '%' + (r.ceiling ? '' : ' (the default)'),
                'Where a step refuses a slot unless it names its own. A policy is choosing where to START a session, so the wall is lower than the runner\'s: starting on a sign-in with five per cent left is choosing the one that ends ten minutes in.')
            + T.wrap('<span class="poid postrat">' + STRATEGY[strategyOf(r)].glyph + ' ' + esc(STRATEGY[strategyOf(r)].label) + '</span>',
                STRATEGY[strategyOf(r)].head, STRATEGY[strategyOf(r)].body)
            + '<span class="grow"></span>'
            + '<button class="secondary small" data-poledit="' + esc(r.name) + '">Edit</button>'
            + '<button class="secondary small" data-poldel="' + esc(r.name) + '" title="'
            + esc('Removes the rule. Refused while another rule steps through it. Anything already pointing at @'
                + r.name + ' — an agent\'s standing account, a task, a queue item — keeps the text and is then '
                + 'REFUSED at launch rather than falling back to the main sign-in.') + '">Delete</button>'
            + '</div>'
            + '<div class="pobody muted small">'
            + (r.note ? esc(r.note) + ' · ' : '')
            // An arrow between steps says "then"; emptiest steps are compared,
            // not walked, so they are set beside each other instead.
            + (chain.length
                ? chain.map((st, i) => '<span class="polstep">' + (i + 1) + '. ' + esc(stepText(st)) + '</span>').join(strategyOf(r) === 'emptiest' ? ' · ' : ' → ')
                : 'no steps')
            + '</div></div>';
    }

    /**
     * The built-in four, as a table: one row per rule, one chip per engine that
     * holds a slot. They are not editable — they are not stored anywhere to
     * edit — so they get no card and no buttons; what they need to say is what
     * each comes to right now, and that is a cell.
     */
    function builtInHtml() {
        const T = window.AFTip;
        const P = POL();
        return '<table class="potab poltab"><thead><tr>'
            + '<th>' + T.wrap('Built-in rule', 'The four rules every picker offers',
                'Not stored and not editable — they are the vocabulary a named rule is written in. Hover a name for what it means.') + '</th>'
            + P.engines.map(e => '<th>' + T.wrap(esc(engineLabel(e)), 'What it comes to on ' + engineLabel(e) + ' right now',
                'Re-decided at every launch against the figures of that moment. A refusal here is not a disqualification: "right now" is not "at launch".') + '</th>').join('')
            + '</tr></thead><tbody>'
            + P.builtIn.map(b => '<tr>'
                + T.cell('poeng', '', esc(b.label), b.label, b.detail)
                + (b.now || []).map(n => '<td>' + policyNowHtml(b, n, true) + '</td>').join('')
                + '</tr>').join('')
            + '</tbody></table>';
    }

    /** The account rows a step may name — the engine's slots when the rule is
     *  pinned, every slot otherwise (labelled by engine so two "work@studio"s
     *  can be told apart). */
    function stepAccountRows() {
        const list = (DATA.accounts || []).filter(a => !polForm.engine || a.engine === polForm.engine);
        const many = new Set(list.map(a => a.engine)).size > 1;
        return list.map(a => ({
            id: a.id,
            label: (many ? engineLabel(a.engine) + ' · ' : '') + a.label,
            detail: [a.email, a.plan, a.percent >= 0 ? a.percent + '% used' : 'not read yet'].filter(Boolean).join(' · ')
        }));
    }

    /** The rules a step may point at — the built-in four and every OTHER named
     *  rule (a rule pointing at itself is refused by the core, so it is not
     *  offered). */
    function stepPolicyRows() {
        const P = POL();
        const me = String(polForm.name || '').toLowerCase();
        return P.builtIn.map(b => ({ id: b.id, label: b.label, detail: b.detail }))
            .concat(P.rules.filter(r => String(r.name).toLowerCase() !== me)
                .map(r => ({ id: '@' + r.name, label: '@' + r.name, detail: r.note || (r.chain || []).length + ' steps' })));
    }

    function openPolicyForm(rule) {
        polForm = rule
            ? {
                mode: 'edit', name: rule.name, engine: rule.engine || '', ceiling: rule.ceiling || '',
                note: rule.note || '', strategy: strategyOf(rule), chain: (rule.chain || []).map(st => Object.assign({}, st)),
                step: null, stepAt: -1
            }
            : { mode: 'new', name: '', engine: '', ceiling: '', note: '', strategy: 'chain', chain: [], step: null, stepAt: -1 };
        polMsg = '';
        render();
        const box = document.getElementById('polform');
        if (box) { box.scrollIntoView(); }
    }

    /** Open the nested step editor on a fresh step, or on row `i` of the draft. */
    function openStep(i) {
        const st = i >= 0 ? polForm.chain[i] : null;
        const rows = stepAccountRows();
        polForm.step = st
            ? {
                kind: st.policy ? 'policy' : 'account', value: st.policy || st.account || '',
                ceiling: st.ceiling || '', models: (st.models || []).join(', ')
            }
            : { kind: 'policy', value: '@emptiest', ceiling: '', models: '' };
        if (polForm.step.kind === 'account' && !polForm.step.value && rows.length) { polForm.step.value = rows[0].id; }
        polForm.stepAt = i;
    }

    /**
     * X-324 — THE STRATEGY SWITCH, and its lock. A rule among the steps has no
     * single figure to compare, so the switch is HELD on chain while one is
     * there: the emptiest row is disabled and the draft is set back to chain
     * on the spot (adding a rule step to an emptiest draft flips it, and the
     * panel says so). It is an AFTip, not a title: the reason is a sentence,
     * and MIRROR asks the current value on the first line.
     */
    function strategyFieldHtml(f) {
        const C = window.AFCharts;
        const T = window.AFTip;
        const lock = emptiestLock(f.chain);
        if (lock) { f.strategy = 'chain'; }
        const cur = STRATEGY[f.strategy];
        const inner = '<span>Strategy' + (lock ? ' — locked' : '') + '</span><select data-af="strategy" data-aft="s" data-afr="1">'
            + C.option('chain', STRATEGY.chain.glyph + ' ' + STRATEGY.chain.label + ' — in order, first with room', { selected: f.strategy === 'chain', detail: STRATEGY.chain.body })
            + C.option('emptiest', STRATEGY.emptiest.glyph + ' ' + STRATEGY.emptiest.label + ' — most room among the listed', { selected: f.strategy === 'emptiest', disabled: !!lock, detail: lock || STRATEGY.emptiest.body })
            + '</select>';
        return T.label('aff' + (lock ? ' polocked' : ''), '', inner,
            'Strategy — ' + cur.head,
            T.lines([
                'Now: ' + cur.label + (lock ? ' (locked)' : ''),
                T.GAP,
                lock || (cur.body + ' ' + (f.strategy === 'chain' ? STRATEGY.emptiest.head + ' is the other choice.' : STRATEGY.chain.head + ' is the other choice.'))
            ]));
    }

    function policyFormHtml() {
        const F = window.AFForm;
        const f = polForm;
        const editing = f.mode === 'edit';
        const engines = (DATA.accountEngines || []).filter(e => e.canCapture).map(e => ({
            id: e.engine, label: engineLabel(e.engine), detail: e.why || ''
        }));
        const stepRows = f.chain.map(st => ({
            icon: st.policy ? '@' : '•',
            hint: st.policy ? 'a rule' : 'a fixed account',
            title: stepText(st),
            sub: st.policy ? 're-decided at launch' : slotName(st.account) === st.account ? 'not a stored slot here — skipped' : ''
        }));
        const s = f.step;
        const stepEditor = s
            ? '<div class="polstepbox">'
            + F.sec(f.stepAt >= 0 ? 'Step ' + (f.stepAt + 1) : 'New step',
                'A step names an account OR a rule, never both; the first step with a usable answer wins.')
            + F.grid([
                F.sel('s_kind', 'Kind', [
                    { id: 'policy', label: 'a rule', detail: f.strategy === 'emptiest' ? 'Keeping a rule step sets the strategy back to chain: a rule has no single figure to compare.' : '' },
                    { id: 'account', label: 'a fixed account' }
                ], s.kind, {
                    redraw: true, tip: 'Which half of the picker this step is drawn from. Changing it redraws the box beside it.'
                }),
                s.kind === 'account'
                    ? F.sel('s_value', 'Account', stepAccountRows(), s.value, {
                        tip: 'One of the sign-ins captured on this machine' + (f.engine ? ' for ' + engineLabel(f.engine) : '') + '.'
                    })
                    : F.sel('s_value', 'Rule', stepPolicyRows(), s.value, {
                        tip: 'A built-in rule or one of your other named rules. Four deep is a loop and refused.'
                    }),
                F.num('s_ceiling', 'Wall %', s.ceiling, {
                    min: 1, max: 100, tip: 'This step\'s own wall. Empty = the rule\'s, then the default ' + POL().ceiling + '%.'
                }),
                F.text('s_models', 'Only for models', s.models, {
                    ph: 'opus, sonnet', tip: 'Comma-separated. The step is taken only when the launch\'s model is one of these; empty = any model.'
                })
            ])
            + '<div class="ctl-row"><span class="spacer"></span>'
            + '<button class="secondary mini" data-afact="step-cancel">Discard step</button>'
            + '<button class="mini" data-afact="step-keep">' + (f.stepAt >= 0 ? 'Update step' : 'Add step') + '</button>'
            + '</div></div>'
            : '<div class="ctl-row"><button class="secondary mini" data-afact="step-new">+ Add a step</button></div>';
        return F.card({
            id: 'polform',
            title: editing ? 'Edit @' + f.name : 'New rule',
            lede: editing
                ? 'The name is the id — anything pointing at @' + f.name + ' keeps working after a save.'
                : 'Steps read at every launch by the strategy: a chain walks them top to bottom and the first with a usable answer wins; emptiest compares the listed sign-ins and the most room starts. A rule that can choose nothing REFUSES the launch rather than spending the main sign-in.',
            body: F.grid([
                editing
                    ? F.stat('Name', '@' + f.name)
                    : F.text('name', 'Name', f.name, {
                        required: true, mono: true, ph: 'Gece_Nobeti',
                        tip: 'Letters, digits, _ and - only, so it can be typed as @Name anywhere an account is taken. It cannot be changed afterwards — a rename is a new rule.'
                    }),
                F.sel('engine', 'Engine', [{ id: '', label: 'any engine' }].concat(engines), f.engine, {
                    redraw: true,
                    tip: 'Pin the rule to one engine and a launch on another is refused by name. "any" asks it about whichever engine the launch is on. Changing it changes which accounts a step can name.'
                }),
                F.num('ceiling', 'Wall %', f.ceiling, {
                    min: 1, max: 100, tip: 'The wall for every step that names none. Empty = ' + POL().ceiling + '%.'
                }),
                strategyFieldHtml(f),
                F.text('note', 'What it is for', f.note, {
                    wide: true, ph: 'the overnight sentry · heavy opus work', tip: 'One line the picker shows under the rule.'
                })
            ])
                + F.sec('Steps', f.chain.length
                    ? f.chain.length + ' step' + (f.chain.length === 1 ? '' : 's') + (f.strategy === 'emptiest' ? ', compared at launch' : ', in order')
                    : 'none yet — a rule needs at least one')
                + F.list({ items: stepRows, acts: ['up', 'down', 'edit', 'del'], empty: 'No steps yet. A rule with no steps could never choose, and is refused.' })
                + stepEditor,
            msg: polMsg, warn: true,
            submit: editing ? 'Save changes' : 'Add the rule'
        });
    }

    function policiesHtml() {
        const P = POL();
        return '<div class="posec polsec">'
            + '<div class="posech">'
            + '<h3 class="potitle">Account policies</h3>'
            + '<span class="grow"></span>'
            + (polForm ? '' : '<button class="small" data-polnew="1">+ New rule</button>')
            + '</div>'
            + '<p class="englede">A rule chooses the sign-in <b>at the moment a session starts</b>, against the '
            + 'figures of that moment — so a task or a schedule written now does not have to guess which account '
            + 'will have room at the hour it runs. Anywhere an account is taken, a rule may be given instead: '
            + '<code>@emptiest</code> in the Console, a task, a queue item, an agent\'s standing account. '
            + '<b>A rule that can choose nothing refuses the launch and says why</b> — it never falls through to '
            + 'the main sign-in, which is the plan a rule is written to protect. Four rules are built in; yours are '
            + 'lists of them and of fixed accounts, with a wall and a model filter per step, read as a <b>chain</b> '
            + '(in order, the first with room) or as the <b>emptiest</b> of the listed sign-ins (compared at launch, the most room starts).</p>'
            + builtInHtml()
            + (polForm ? policyFormHtml() : '<div class="pomsg" id="pol-msg">' + esc(polMsg) + '</div>')
            + (P.rules.length
                ? P.rules.map(policyCardHtml).join('')
                : (polForm ? '' : '<div class="muted small">No rule of your own yet. The built-in four already work '
                    + 'everywhere; a named rule is for a chain — "the night sentry\'s account, else @emptiest, but '
                    + 'never below 60%".</div>'))
            + '</div>';
    }

    function wirePolicies() {
        const F = window.AFForm;
        document.querySelectorAll('[data-polnew]').forEach(b =>
            b.addEventListener('click', () => openPolicyForm(null)));
        document.querySelectorAll('[data-poledit]').forEach(b =>
            b.addEventListener('click', () => openPolicyForm(POL().rules.find(r => r.name === b.dataset.poledit))));
        // ‼️ The page names a RULE and nothing else: whether it may go — another
        // rule may step through it — is decided in the one place
        // `policies.delete` calls, and the refusal comes back into the section.
        document.querySelectorAll('[data-poldel]').forEach(b =>
            b.addEventListener('click', () => {
                polMsg = ''; polPending = 'delete';
                post({ type: 'policyDelete', name: b.dataset.poldel });
            }));
        const box = document.getElementById('polform');
        if (!box || !polForm) { return; }
        const keepStep = () => {
            const s = polForm.step;
            if (!s) { return; }
            const st = {};
            if (s.kind === 'account') { st.account = s.value; } else { st.policy = s.value; }
            if (Number(s.ceiling) > 0) { st.ceiling = Number(s.ceiling); }
            const models = String(s.models || '').split(',').map(x => x.trim()).filter(Boolean);
            if (models.length) { st.models = models; }
            if (polForm.stepAt >= 0) { polForm.chain[polForm.stepAt] = st; } else { polForm.chain.push(st); }
            // the lock holds on the DRAFT, not only on the drawing: Save calls
            // keepStep last and posts straight after it
            if (emptiestLock(polForm.chain)) { polForm.strategy = 'chain'; }
            polForm.step = null;
            polForm.stepAt = -1;
        };
        F.wire(box, {
            onEdit: v => {
                if (v.name !== undefined) { polForm.name = v.name; }
                if (v.engine !== undefined) { polForm.engine = v.engine; }
                if (v.ceiling !== undefined) { polForm.ceiling = v.ceiling || ''; }
                if (v.note !== undefined) { polForm.note = v.note; }
                if (v.strategy !== undefined) { polForm.strategy = v.strategy === 'emptiest' ? 'emptiest' : 'chain'; }
                if (polForm.step) {
                    if (v.s_kind !== undefined && v.s_kind !== polForm.step.kind) {
                        // the kind changed: the value box is redrawn from the
                        // other half, so its old value would name the wrong thing
                        polForm.step.kind = v.s_kind;
                        polForm.step.value = v.s_kind === 'account'
                            ? ((stepAccountRows()[0] || {}).id || '') : '@emptiest';
                    } else if (v.s_value !== undefined) { polForm.step.value = v.s_value; }
                    if (v.s_ceiling !== undefined) { polForm.step.ceiling = v.s_ceiling || ''; }
                    if (v.s_models !== undefined) { polForm.step.models = v.s_models; }
                }
            },
            onRedraw: () => render(),
            onAct: a => {
                if (a === 'step-new') { openStep(-1); }
                else if (a === 'step-keep') { keepStep(); }
                else if (a === 'step-cancel') { polForm.step = null; polForm.stepAt = -1; }
                render();
            },
            onList: (act, i) => {
                const c = polForm.chain;
                if (act === 'del') { c.splice(i, 1); if (polForm.stepAt === i) { polForm.step = null; polForm.stepAt = -1; } }
                else if (act === 'up' && i > 0) { [c[i - 1], c[i]] = [c[i], c[i - 1]]; }
                else if (act === 'down' && i < c.length - 1) { [c[i], c[i + 1]] = [c[i + 1], c[i]]; }
                else if (act === 'edit') { openStep(i); }
                render();
            },
            onSubmit: () => {
                // A step still open in the editor is meant: keep it rather
                // than losing what was typed to a press one button over.
                keepStep();
                polMsg = ''; polPending = 'save';
                post({
                    type: 'policySave',
                    // ‼️ A FORM, NOT A RECORD — the host reads it through
                    // `policyFromForm`'s allow-list and the core judges the shape.
                    policy: {
                        name: polForm.name, engine: polForm.engine, ceiling: polForm.ceiling,
                        note: polForm.note, strategy: polForm.strategy, chain: polForm.chain
                    }
                });
            },
            onCancel: () => { polForm = null; polMsg = ''; render(); }
        });
    }

    /**
     * The host's answer to a save or a delete. An empty text is "written": the
     * form closes and the `data` push that follows redraws the list with the
     * rule in it. Returns whether the message was this view's, so the page
     * redraws only then.
     */
    function onMessage(m) {
        if (!m || m.type !== 'pol-msg') { return false; }
        polMsg = String(m.text || '');
        if (!polMsg && polPending === 'save') { polForm = null; }
        polPending = '';
        return true;
    }

    /**
     * The section's own rules, plus — scoped to the section — the frame it
     * borrows from the Engines page (the routes' table, card and chip classes),
     * so it stands alone on the Accounts page and changes nothing on the
     * Engines page, where the same classes are defined once for every section.
     * (No backticks in here: it is a template literal.)
     */
    const CSS = `
        .polsec .potab { border-collapse:collapse; font-size:12px; margin:0 0 12px; width:auto; }
        .polsec .potab th, .polsec .potab td { padding:3px 16px 3px 0; text-align:left; white-space:nowrap; }
        .polsec .potab th { font-weight:600; opacity:.75; cursor:help; }
        .polsec .poeng { font-weight:600; }
        .polsec .pocard { border:1px solid var(--vscode-widget-border,#4443); border-radius:7px;
            padding:8px 11px; margin-bottom:8px; }
        .polsec .engacct { font-size:10px; padding:1px 8px; border-radius:9px; white-space:nowrap;
            cursor:help; border:1px dashed var(--vscode-widget-border,#4446); opacity:.8; }
        .polsec .engacct.a-on { border-style:solid; opacity:1;
            border-color:var(--vscode-charts-blue,#4a9eff);
            color:var(--vscode-charts-blue,#4a9eff); }
        /* X-305 -- what a rule comes to now. The chip is the sign-in
           chip's twin (.engacct), because it is the same kind of fact:
           on whose plan. a-on is the blue outline the standing chip
           wears; a-no is "cannot choose right now", and it is the
           palette's YELLOW for your move, not red -- a rule walled at
           11:02 is the right answer at 14:50. */
        .polsec .polnow { cursor:help; }
        .polsec .polnow.a-no { border-style:solid; opacity:1;
            border-color:var(--vscode-charts-yellow,#d7ba7d);
            color:var(--vscode-charts-yellow,#d7ba7d); }
        .polsec .poltab td { vertical-align:middle; }
        .polsec .polstep { white-space:nowrap; }
        .polsec .polstepbox { border:1px dashed var(--vscode-widget-border,#4446); border-radius:6px;
            padding:6px 10px; margin-top:6px; }
    `;

    const api = {
        sectionHtml: (c) => { use(c); return policiesHtml(); },
        wire: (c) => { use(c); wirePolicies(); },
        onMessage,
        css: CSS
    };
    if (typeof window !== 'undefined') { window.AFPolicies = api; }
})();
