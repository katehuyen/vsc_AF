// Agent Farm — Engines page: which agent CLI this machine can actually run,
// how each one is paid for, and whether a real call gets through.
//
// ‼️ THE PAGE IS ABOUT FOUR QUESTIONS, IN THIS ORDER. Is the CLI here → how is
// it paid for → is it signed in → what is the one thing to do next. No card
// ever stops at naming a state: "not configured" is the complaint this whole
// feature exists because of, and a state with no gesture attached to it is the
// same dead end in a new costume.
//
// ‼️ AND NOTHING HERE HOLDS A CREDENTIAL. The install and the sign-in are the
// engine's own commands, TYPED into a terminal and not run; the key route hands
// over to the vault's own form; the docs link is https only. The page is sent
// metadata and verdicts, never a value.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    /** engines with a call in flight — the button says so rather than going quiet */
    const testing = new Set();
    /** a refusal that belongs to one card, shown in that card */
    const notes = {};
    /** X-100 — every reason a route was refused, together and where it happened.
     *  A toast would outlive the form and be read against the next attempt. */
    let provMsg = '';
    /** X-172 — a refusal from a capture, an activate or a forget, shown in the
     *  section it happened in rather than as a toast that outlives the press. */
    let acctMsg = '';
    /** X-305 — a refusal from a rule save or delete, shown in the form (or the
     *  section, when no form is open) rather than as a toast. */
    let polMsg = '';
    /**
     * X-305 — THE RULE BEING WRITTEN, as a draft the page owns. The list of
     * steps is part of it: reordering or removing a step touches nothing stored
     * until Save, or Cancel would be a lie. `step` is the one step open in the
     * nested editor and `stepAt` which row it came from (-1 = a new one).
     */
    let polForm = null;
    /** which write the next `pol-msg` answers — only a SAVE that went through
     *  closes the form; a delete pressed beside an open draft leaves it be */
    let polPending = '';

    // ‼️ M-33 — A HOST PUSH WAITS FOR THE READER'S HANDS; THE PAGE'S OWN
    // RENDERS DO NOT. render() replaces the whole of #app, so a repaint that
    // arrives while somebody is typing detaches the box they are typing in and
    // the caret falls to <body> — where space IS Page Down. Full text, and
    // what a page-specific busy() is for: media/afRepaint.js.
    const repaint = window.AFRepaint.guard(render);
    window.addEventListener('message', ev => {
        const m = ev.data;
        if (m.type === 'data') { DATA = m.data; testing.clear(); repaint(); return; }
        if (m.type === 'eng-testing') { testing.add(m.id); render(); return; }
        if (m.type === 'prov-msg') { provMsg = String(m.text || ''); render(); return; }
        if (m.type === 'acc-msg') { acctMsg = String(m.text || ''); render(); return; }
        // X-305 — an empty text is "written": the form closes and the `data`
        // push that follows redraws the list with the rule in it.
        if (m.type === 'pol-msg') {
            polMsg = String(m.text || '');
            if (!polMsg && polPending === 'save') { polForm = null; }
            polPending = '';
            render();
            return;
        }
        if (m.type === 'eng-msg') { notes[m.id] = String(m.text || ''); render(); }
    });

    const post = (m) => vscode.postMessage(m);
    const esc = (s) => C.esc(String(s === undefined || s === null ? '' : s));

    /** How old a verdict is, said the way a person would. Mirrors core/engineTest. */
    function age(at, now) {
        const s = Math.max(0, Math.round((now - at) / 1000));
        if (s < 60) { return s + 's ago'; }
        const m = Math.round(s / 60);
        if (m < 60) { return m + 'm ago'; }
        const h = Math.round(m / 60);
        return h < 48 ? h + 'h ago' : Math.round(h / 24) + 'd ago';
    }

    const verdictOf = (id) => (DATA.verdicts || []).find(v => v.id === id);

    /**
     * The badge is the state in two words, and its hover carries the figures —
     * where each fact was read from and when, which is what makes it checkable
     * rather than merely stated (docs/CONVENTIONS.md → Hover).
     */
    function badgeOf(e) {
        // ‼️ U-59 — ONE DECISION, IN `afEngine.js`. This page and Farm Settings
        // both draw this badge and each had its own copy of the rule; when a
        // fifth auth state arrived, the copy that had not been taught it fell
        // through to `not signed in` IN THE WARNING COLOUR, on a row whose next
        // line said the engine was ready. Two spellings of one rule is one rule
        // waiting to disagree with itself.
        return window.AFEngine.authBadge(e);
    }

    function factsOf(e) {
        const T = window.AFTip;
        return T.lines([
            'Command: ' + e.cli.command + (e.cli.path ? ' — ' + e.cli.path : ' — not on PATH'),
            'Billing: ' + (e.auth.mode === 'subscription' ? 'a plan'
                : e.auth.mode === 'apikey' ? 'per token' : 'nothing set up'),
            e.auth.file ? 'Read from: ~/' + e.auth.file : '',
            e.auth.refreshedAt ? 'Last refreshed: ' + window.AFTime.full(e.auth.refreshedAt) : '',
            // ‼️ An engine with no key route says THAT, rather than naming a
            // variable that does not exist. Antigravity is paid for by an app
            // sign-in; "Key name: " with nothing after it is the sort of blank
            // this page exists to stop producing.
            e.key.env
                ? 'Key name: ' + e.key.env + (e.key.inVault ? ' — in the vault' : ' — not in the vault')
                : 'Key: this engine has none — nothing to store'
        ]);
    }

    /**
     * ‼️ THE VERDICT LINE IS THE REASON THIS PAGE IS NOT A SETTINGS SECTION.
     * Reading a credentials file says the grant EXISTS; only a call says it
     * WORKS. This machine is the case that proved the difference — a live
     * ChatGPT sign-in on disk and every turn dying at the socket. The verdict
     * therefore always carries its age: a tick from four hours ago is a weaker
     * claim than one from four seconds ago, and hiding that would make the
     * green mean more than it does.
     */
    function verdictHtml(e) {
        if (testing.has(e.id)) {
            return '<div class="engv testing">⟳ calling ' + esc(e.cli.command)
                + '… one real turn, smallest model.</div>';
        }
        const v = verdictOf(e.id);
        if (!v) {
            return '<div class="engv none">Not tested in this window. '
                + 'The reading above is what is on disk — a call is the only thing that proves it works.</div>';
        }
        const when = age(v.at, DATA.now || Date.now());
        // ‼️ U-59 — THREE OUTCOMES, NOT TWO. `ok: false` carried both "asked and
        // it did not answer" and "the check would not run", and they were drawn
        // as the same red ✗ with the engine's name over it — so an OpenCode card
        // whose own line above said "Ready, with no sign-in" wore a failure for
        // the ordinary case of having no free model on offer. A refusal is not
        // the engine's verdict: nothing was called, nobody complained, and the
        // sentence is a choice being handed back to the user.
        const state = v.ok ? 'good' : v.refused ? 'held' : 'bad';
        const mark = v.ok ? '✓ ' : v.refused ? '⊘ ' : '✗ ';
        const head = window.AFTip.lines([
            (v.ok ? 'Answered' : v.refused ? 'Not attempted' : 'Failed') + ' · ' + window.AFTime.full(v.at),
            v.refused ? 'Called: nothing — the engine was never asked' : '',
            'Took: ' + (v.ms / 1000).toFixed(1) + 's',
            v.error ? 'The engine said: ' + v.error : ''
        ]);
        return '<div class="engv ' + state + '" title="' + esc(head) + '">'
            + mark + esc(v.detail)
            + ' <span class="engage">' + esc(when) + '</span>'
            + (v.error ? '<div class="engerr">' + esc(v.error) + '</div>' : '')
            + '</div>';
    }

    /**
     * ‼️ X-172 — WHICH SIGN-IN THIS ENGINE IS PLUGGED INTO, on the engine's own
     * card.
     *
     * This page already answers "what can this machine run, how is it paid for,
     * is it signed in". WHOSE sign-in is the sub-fact of that last question, and
     * a person rotating three plans has to be able to read it here rather than
     * open a session to find out.
     *
     * ‼️ NOTHING IS DRAWN WHERE THERE IS NOTHING TO SAY — an engine that cannot
     * isolate an account, and a machine that has captured none, both get no
     * chip. The main sign-in is the ABSENCE of a slot, not a slot: an engine
     * with accounts stored but none standing says "main account" out loud,
     * because "no account" and "the account this machine is logged in as" are
     * the same thing and only one of them reads like a decision.
     *
     * ‼️ SHORTHAND + AFTip — the chip is one short name and the panel under it
     * carries the address, how much of that plan is spent and when the window
     * turns over. A figure is not an explanation, which is why the chip's panel
     * lists them rather than describing what an account is.
     */
    function accountChipHtml(e) {
        const mine = (DATA.accounts || []).filter(a => a && a.engine === e.id);
        if (!mine.length) { return ''; }
        const T = window.AFTip;
        const on = mine.find(a => a.active);
        // ‼️ audit B-04.3 — NAMED BY THE READING, not by this line. It said
        // `5-hour` to every row, including the Codex slot whose window is a week
        // and whose card, four inches below, said so.
        const spent = (a) => a.percent >= 0
            ? a.percent + '% of the ' + (window.AFAccount.windowPhrase(a) || 'window') + ' used' : '';
        // The countdown is accountTurns' — the card below says the same thing,
        // and one page may not hold two answers to one question.
        const turns = accountTurns;
        const lines = mine.map(a =>
            (a.active ? '→ ' : '   ') + (a.label || a.id)
            + (a.email && a.email !== a.label ? ' · ' + a.email : '')
            // ‼️ …and the same three states here (audit A-06.7): this list said
            // "needs signing in again" for an unreadable row too, which is the
            // one thing that row cannot be known to need.
            + (a.health === 'ready' ? ''
                : a.health === 'unreadable' ? ' · could not be read' : ' · needs signing in again')
            + [spent(a), turns(a)].filter(Boolean).map(x => ' · ' + x).join(''));
        const head = on ? 'Next session: ' + (on.label || on.id) : 'Next session: the main account';
        const body = lines.join('\n')
            + '\n\n' + 'The main account — the identity this machine is signed in as — is the ABSENCE of a '
            + 'choice, not a row: nothing is injected for it. An account is not remembered per agent; it '
            + 'is a state, and this is the one place that holds it.';
        return T.wrap(
            '<span class="engacct' + (on ? ' a-on' : '') + '">'
            + esc(on ? (on.label || on.id) : 'main account')
            + (on && on.health !== 'ready' ? ' ⚠' : '')
            + (on && on.percent >= 0 ? ' · ' + on.percent + '%' : '')
            + '</span>', head, body);
    }

    function cardHtml(e) {
        const b = badgeOf(e);
        // A row offers the step it is actually ON: an engine that is not
        // installed cannot be signed into, and offering a login for a command
        // that does not exist is the dead end this page exists to remove.
        const install = !e.cli.found && e.installCommand
            ? '<button class="small" data-engcmd="' + esc(e.installCommand) + '" title="'
            + esc('Write ' + e.installCommand + ' into a terminal — it is NOT run for you, so you can read it first.')
            + '">Install ' + esc(e.cli.command) + '</button>' : '';
        // ‼️ U-59 — THE BUTTON'S WORDS FOLLOW WHAT SIGNING IN WOULD BUY.
        // On an engine that already runs without a credential, "Sign in with a
        // plan" reads as the missing step — the fix for a fault the row does not
        // have. It is still offered, because signing in really does add the paid
        // providers beside the free ones; it just stops pretending to be the
        // repair and says what it actually gets you.
        const builtin = e.auth.mode === 'builtin';
        const login = e.cli.found && e.loginCommand
            ? '<button class="secondary small" data-engcmd="' + esc(e.loginCommand) + '" title="'
            + esc(builtin
                ? e.label + ' already runs without this. Signing in adds the PAID providers beside its own free '
                + 'ones — it fixes nothing, because nothing here is broken. Write ' + e.loginCommand
                + ' into a terminal; it is NOT run for you.'
                : 'Write ' + e.loginCommand + ' into a terminal — it is NOT run for you. The sign-in happens in your browser and the CLI keeps the grant; Agent Farm never sees it.')
            + '">' + (builtin ? 'Add paid providers' : 'Sign in with a plan') + '</button>' : '';
        // ‼️ The test button says what it costs, every time. It is one real turn
        // against a plan's quota or a key's tokens, and it never runs by itself.
        const test = '<button class="secondary small" data-engtest="' + esc(e.id) + '"'
            + (e.cli.found ? '' : ' disabled')
            + ' title="' + esc(e.cli.found
                ? 'Run ONE real turn against ' + e.label + ' with its smallest model and a four-word prompt. It costs a turn of your plan or key. Nothing here runs it for you — only this button does.'
                : e.label + ' is not installed, so there is nothing to call.')
            + '">⚡ Test</button>';
        return '<div class="engcard eng-' + b.tone + '">'
            + '<div class="enghead">'
            + '<span class="engname">' + esc(e.label) + '</span>'
            + '<span class="engbadge b-' + b.tone + '" title="' + esc(factsOf(e)) + '">' + esc(b.text) + '</span>'
            + accountChipHtml(e)
            + '<span class="grow"></span>'
            + install + login + test
            // ‼️ NO KEY BUTTON FOR AN ENGINE WITH NO KEY. Drawing it would offer
            // a gesture that opens a vault form with no name to fill in — worse
            // than absent, because a user would reasonably conclude the key is
            // what they are missing.
            + (e.key.env
                ? '<button class="secondary small" data-engkey="' + esc(e.key.env) + '" title="'
                + esc((e.key.inVault ? 'Replace ' : 'Store ') + e.key.env + ' in the OS keychain. This is the pay-per-token route; the value never reaches this page.')
                + '">' + (e.key.inVault ? 'Replace key' : 'Add key') + '</button>'
                : '')
            + '<button class="secondary small" data-engdocs="' + esc(e.docs) + '" title="' + esc(e.docs) + '">Docs</button>'
            + '</div>'
            + '<div class="engbill">' + esc(e.billing) + '</div>'
            + '<div class="engnext">' + esc(e.next) + '</div>'
            + '<div class="engdetail muted small">' + esc(e.auth.detail) + '</div>'
            + verdictHtml(e)
            + (notes[e.id] ? '<div class="engnote">' + esc(notes[e.id]) + '</div>' : '')
            + '</div>';
    }

    /* ================ X-100 — PROVIDERS: WHO OWNS WHAT, AND THE ROUTES ========
     *
     * ‼️ THE TABLE IS NOT DECORATION. The item's first acceptance line is that
     * it must be VISIBLE which engine is the authority for which data — because
     * the failure this whole feature exists to prevent is TWO VAULTS, and a rule
     * that lives only in the heads of the people who wrote the adapters is a
     * rule the next adapter breaks. So the table is drawn, each row carries the
     * reason in words a person can check, and the form below it is refused by
     * the same table rather than merely styled by it.
     *
     * ‼️ AND NOTHING HERE HOLDS A CREDENTIAL — the same promise the rest of this
     * page makes, kept the same way. The rows are `PublicProviderProfile`, built
     * by naming what is public; `hasSecret` is the whole of what they say about
     * a key. Typing one opens the HOST's password box, so the value never
     * crosses into this webview in either direction.
     */
    function ownershipHtml() {
        const rows = DATA.ownership || [];
        if (!rows.length) { return ''; }
        const T = window.AFTip;
        const engines = [...new Set(rows.map(r => r.engine))];
        const kinds = [...new Set(rows.map(r => r.kind))];
        const cell = (engine, kind) => {
            const r = rows.find(x => x.engine === engine && x.kind === kind);
            if (!r) { return '<td class="powhy">—</td>'; }
            const mine = r.owner === 'agent-farm';
            const who = mine ? 'Agent Farm' : r.engine;
            // SHORTHAND — the cell says which side in one word and the AFTip
            // carries the reason, which is a paragraph and does not fit a grid.
            return '<td>' + T.wrap(
                '<span class="poown ' + (mine ? 'o-af' : 'o-eng') + '">' + esc(who) + '</span>',
                who + ' owns the ' + kind, r.why) + '</td>';
        };
        return '<table class="potab"><thead><tr><th>Engine</th>'
            + kinds.map(k => '<th>' + T.wrap(esc(k), k, kindNote(k)) + '</th>').join('')
            + '</tr></thead><tbody>'
            + engines.map(e => '<tr><td class="poeng">' + esc(e) + '</td>'
                + kinds.map(k => cell(e, k)).join('') + '</tr>').join('')
            + '</tbody></table>';
    }

    /** A column is defined ONCE, on its `<th>` — a cell hover carries figures,
     *  never an explanation (docs/CONVENTIONS.md → Hover). */
    function kindNote(kind) {
        return kind === 'catalog' ? 'Which providers and models exist at all.'
            : kind === 'credential' ? 'What unlocks them. Agent Farm stores one only where it is the authority; where the engine owns it, sign in with the engine and Agent Farm reads nothing but whether a credential exists.'
                : kind === 'config' ? 'The engine\'s own configuration file. Agent Farm never rewrites a hand-kept one.'
                    : 'Which provider a run was actually started with — history, not configuration, and Agent Farm\'s on every engine because no engine keeps it.';
    }

    function profileHtml(p) {
        const T = window.AFTip;
        // ‼️ MIRROR — a control narrow enough to cut its own text puts its
        // CURRENT value on the first line of its tooltip.
        const tiers = Object.keys(p.tiers || {});
        const key = p.hasSecret
            ? T.wrap('<span class="pokey k-yes">key stored</span>', 'A credential is stored',
                'It lives in the OS keychain under this profile\'s id — never in settings, never on the '
                + 'bridge, and it is never read back out to draw anything. The only public fact about it '
                + 'is that it is there.')
            : T.wrap('<span class="pokey k-no">no key</span>', 'No credential yet',
                'This route cannot be used until one is stored. Press Add key — the value is typed into a '
                + 'password box outside this page and goes straight to the keychain.');
        return '<div class="pocard">'
            + '<div class="pohead">'
            + '<span class="poname">' + esc(p.label) + '</span>'
            + T.wrap('<span class="poid">' + esc(p.id) + '</span>', 'id: ' + p.id,
                'Permanent — the credential is filed under it. Copy the profile to get a new id; the copy '
                + 'deliberately starts with no key.')
            + key
            + T.wrap('<span class="porev">r' + esc(p.revision) + '</span>', 'revision ' + p.revision,
                'Counts up whenever the ROUTE changes — provider, endpoint, auth kind, tier mapping — or '
                + 'its key is replaced. Never on a rename. A launch records the revision it ran on, so a '
                + 'route edited afterwards cannot silently rewrite what a past session was served by.')
            + '<span class="grow"></span>'
            + '<button class="secondary small" data-pokey="' + esc(p.id) + '" data-polabel="' + esc(p.label) + '">'
            + (p.hasSecret ? 'Replace key' : 'Add key') + '</button>'
            + '<button class="secondary small" data-pocopy="' + esc(p.id) + '" title="'
            + esc('A copy is a NEW route: its own id, its own history from revision 1, and no credential — '
                + 'duplicating a key would put one secret behind two names.') + '">Copy</button>'
            + '<button class="secondary small" data-porm="' + esc(p.id) + '" title="'
            + esc('Removes the route AND collects its credential from the keychain. A row dropped with the '
                + 'entry left behind is a working key nobody can see.') + '">Remove</button>'
            + '</div>'
            + '<div class="pobody muted small">'
            + esc(p.providerId) + (p.baseUrl ? ' · ' + esc(p.baseUrl) : ' · first-party endpoint')
            + (p.authKind ? ' · ' + esc(p.authKind) : '')
            + (tiers.length
                ? ' · ' + tiers.map(t => esc(t) + ' → ' + esc(p.tiers[t])).join(', ')
                : ' · the route\'s own defaults')
            + '</div></div>';
    }

    /**
     * ‼️ X-172 — WHEN THAT PLAN'S WINDOW TURNS OVER, in one function, because
     * the chip and the card both say it and two answers to one question on one
     * page is the drift this repo keeps paying for.
     *
     * THE WALL TIME AND THE WAIT together: they answer different questions —
     * "can I start something now" and "is it worth waiting". `AFTime.ago` is
     * deliberately not used: it is written for the PAST and a reset is in the
     * future, so it would print "37m ago" about a window that has not turned
     * over yet.
     */
    /** The engine's own name, from the matrix the page already has. Every card
     *  above says "Claude Code" and "Antigravity"; a section under them saying
     *  "claude" and "agy" reads as a different product. The id is kept only on
     *  the technical line, where it sits beside the slot id it matches. */
    const engineLabel = (id) =>
        ((DATA.engines || []).find(e => e.id === id) || {}).label || id;

    // ‼️ X-263 — the sentence itself moved to the component, because the
    // pickers now say it too: this card and the hover on a `<select>` row
    // describing the same window in two different phrasings is the drift the
    // component exists to stop. The card keeps its own layout; only the words
    // about the window are shared.
    const accountTurns = (a) => window.AFAccount.turns(a);

    /* ---- X-236 — the accounts view lives in media/afAccounts.js, shared with
       the Accounts page. This page hands it its own context and draws the
       result; the presses post the message types this panel answers. ---- */
    const accountsCtx = () => ({ DATA, post, esc, age, engineLabel, msg: acctMsg });
    function accountsHtml() { return window.AFAccounts.sectionHtml(accountsCtx()); }

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
        return '<div class="posec">'
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
     * X-114 — ‼️ THREE STATES, DRAWN AS THREE THINGS.
     *
     * The cards at the top of this page answer "is this ENGINE ready" and stop
     * there. Everything that goes wrong one level down — a route with no key, a
     * tier mapped to nothing, a route answered a second time from inside the
     * CLI's own settings file, a provider the catalog stopped offering — starts
     * and fails on an engine every one of those cards calls ready.
     *
     * The two chips are deliberately separate and never collapse into one
     * traffic light: `available` is what can be read for free and `tested` is
     * what a real turn proved, and a row that is available and never tested is
     * the ORDINARY state of a healthy machine. Painting it amber would send
     * somebody to spend a turn for nothing.
     */
    function healthHtml() {
        const reports = DATA.providerHealth || [];
        if (!reports.length) { return ''; }
        const T = window.AFTip;
        const testing = DATA.providerTesting || [];
        return '<div class="posec pohealth">'
            + '<h3 class="potitle">Route health</h3>'
            + '<p class="englede">What is readable for free about each route, and what a real turn has '
                + 'proved. <b>Available and never tested is the ordinary state</b> — the free check is '
                + 'everything that can be known without spending anything, and a turn is only ever '
                + 'bought by pressing for it.</p>'
            + reports.map(healthReportHtml).join('')
            + '</div>';

        function healthReportHtml(rep) {
            const head = '<div class="pohead pohrow">'
                + '<span class="poname">' + esc(engineLabel(rep.engine)) + '</span>'
                + T.wrap('<span class="poid">' + esc(rep.source) + '</span>',
                    'Where this list came from',
                    'engine-reported = the engine was asked and answered. agent-farm-profile = these are '
                    + 'routes Agent Farm assembles and injects. not-fetched = nobody has asked yet, which '
                    + 'is why a row can be "unknown" rather than "no".')
                + (rep.cli && rep.cli.version
                    ? T.wrap('<span class="porev">' + esc(rep.cli.version) + '</span>',
                        'CLI revision ' + rep.cli.version,
                        'Part of what a pass proved: an engine upgraded since is a different program, so '
                        + 'a verdict recorded against an older revision is reported as superseded rather '
                        + 'than shown as current.')
                    : '')
                + '</div>';
            const lines = (rep.problems || []).map(p =>
                '<div class="pohprob">' + esc(p) + '</div>').join('')
                + (rep.notes || []).map(n =>
                    '<div class="pohnote">' + esc(n) + '</div>').join('');
            const rows = (rep.rows || []).length
                ? rep.rows.map(r => healthRowHtml(rep, r)).join('')
                : '<div class="muted small">Nothing is offered on this engine yet.</div>';
            return '<div class="pohrep">' + head + lines + rows + '</div>';
        }

        function healthRowHtml(rep, r) {
            const busy = testing.indexOf(rep.engine + '/' + r.providerId) >= 0;
            const avail = r.available === 'yes' ? 'h-yes' : r.available === 'no' ? 'h-no' : 'h-un';
            const availWord = r.available === 'yes' ? 'available'
                : r.available === 'no' ? 'not available' : 'unknown';
            const availTip = T.wrap(
                '<span class="pohchip ' + avail + '">' + esc(availWord) + '</span>',
                'Available: ' + availWord,
                r.available === 'yes'
                    ? 'Everything readable without spending a token agrees a run could be started on this '
                        + 'route. It is not a promise that the endpoint answers — that is the other chip.'
                    : r.available === 'no'
                        ? 'Something readable stops a run being started. The reasons are under this row, in '
                            + 'the words a launch would print.'
                        : 'No catalog has been read yet. "No" would be a lie and "yes" would be a guess, so '
                            + 'this says neither.');
            const conf = T.wrap('<span class="pohchip h-cfg">configured</span>',
                'Configured by: ' + r.configuredBy,
                'Something declares this route. It is a different question from whether it would run — a '
                + 'route with no key is configured and unusable, and both facts are on this row.');
            return '<div class="pocard pohcard">'
                + '<div class="pohead">'
                + '<span class="poname">' + esc(r.label) + '</span>'
                + T.wrap('<span class="poid">' + esc(r.providerId) + '</span>', 'id: ' + r.providerId,
                    'The engine\'s own id for this provider, and the one providers.test takes.')
                + conf + availTip + testedChip(r)
                + T.wrap('<span class="porev">' + esc(r.models) + ' model'
                    + (r.models === 1 ? '' : 's') + '</span>',
                    r.models + ' model' + (r.models === 1 ? '' : 's') + ' a launch could name',
                    (r.modelRefs || []).join('\n') || 'None published here.')
                + '<span class="grow"></span>'
                + '<button class="secondary small" data-potest="' + esc(r.providerId) + '"'
                + ' data-poteng="' + esc(rep.engine) + '"'
                + ' data-potmodel="' + esc((r.modelRefs || [])[0] || '') + '"'
                + (busy ? ' disabled' : '') + ' title="' + esc(
                    'Runs ONE real turn through this route — a token off its plan or a line on its bill. '
                    + 'Pressed, never scheduled. Anything already known to be wrong refuses it before '
                    + 'anything is spawned.') + '">'
                + (busy ? 'Testing…' : 'Test route') + '</button>'
                + '</div>'
                + (r.problems || []).map(p => '<div class="pohprob">' + esc(p) + '</div>').join('')
                + (r.notes || []).map(n => '<div class="pohnote">' + esc(n) + '</div>').join('')
                + '</div>';
        }

        /**
         * ‼️ NEVER TESTED IS NOT A FAILURE, and neither is a refusal. Three
         * readings the first draft of this chip collapsed into a red cross:
         * nothing has been pressed yet, nothing was called at all, and a verdict
         * that answered for a configuration this one replaced.
         */
        function testedChip(r) {
            const t = r.tested;
            if (!t && r.testedSuperseded) {
                const s = r.testedSuperseded;
                return T.wrap('<span class="pohchip h-old">superseded</span>',
                    (s.ok ? 'Passed ' : 'Failed ') + window.AFTime.full(s.at),
                    'That verdict is not about this configuration any more: '
                    + (r.testedSupersededWhy || 'something it named has changed')
                    + '. Press Test route to get one that is.');
            }
            if (!t) {
                return T.wrap('<span class="pohchip h-none">never tested</span>',
                    'No turn has been run through this route',
                    'The ordinary state, and not a fault. A turn costs something, so nothing here buys '
                    + 'one on its own — not on a timer, not on a refresh, not when this page opens.');
            }
            const state = t.ok ? 'h-ok' : t.refused ? 'h-held' : 'h-bad';
            const word = t.ok ? 'tested' : t.refused ? 'not attempted' : 'failed';
            return T.wrap('<span class="pohchip ' + state + '">' + esc(word) + ' · '
                + esc(age(t.at, DATA.now || Date.now())) + '</span>',
                (t.ok ? 'Answered · ' : t.refused ? 'Nothing was called · ' : 'Did not answer · ')
                + window.AFTime.full(t.at),
                window.AFTip.lines([
                    t.detail,
                    t.error ? 'The engine said: ' + t.error : '',
                    'Took: ' + (t.ms / 1000).toFixed(1) + 's',
                    'Proved: ' + t.key.providerId + ' · ' + (t.key.modelId || 'the route default')
                        + ' · adapter ' + t.key.adapter
                        + (t.key.cli ? ' · CLI ' + t.key.cli : '')
                        + (t.key.revision === undefined ? '' : ' · route r' + t.key.revision)
                ]));
        }
    }

    function providersHtml() {
        const profiles = DATA.profiles || [];
        return '<div class="posec">'
            + '<h3 class="potitle">Providers</h3>'
            + '<p class="englede">Which engine is the authority for which piece of provider data — and '
                + 'the routes Agent Farm holds itself. <b>The split is the design, not an omission:</b> a '
                + 'Claude route is something Agent Farm assembles and nobody else on this machine knows '
                + 'about, so if Agent Farm does not hold it nobody does; OpenCode already owns '
                + '<code>/connect</code>, <code>opencode auth login</code> and <code>opencode.json</code>, '
                + 'and a second copy here would make two vaults where the stale one wins silently. '
                + '<b>No credential is on this page in either direction</b> — a route says only whether it '
                + 'has one, and typing a key happens outside the page.</p>'
            + ownershipHtml()
            + '<div class="poform">'
            + field('po-id', 'id (kimi)', 'The permanent handle',
                '2–40 lowercase letters, digits and hyphens. It is also the key the credential is stored '
                + 'under, so no dot, no space, no slash — and it cannot be changed afterwards.')
            + field('po-label', 'label (Kimi)', 'What a picker shows',
                'Free to change at any time. Renaming does not bump the revision, because the revision is '
                + 'a statement about the route rather than a count of edits.')
            + field('po-provider', 'providerId (kimi)', 'Which provider this routes to',
                'anthropic · anthropic-api · kimi · minimax, or one you name yourself.')
            + field('po-url', 'https://api.moonshot.ai/anthropic', 'The Anthropic-compatible endpoint',
                'Empty = first-party. Must be https, or http on this machine (localhost / 127.0.0.1): a '
                + 'key sent over plain http to another host travels in clear, and that is refused rather '
                + 'than warned about.')
            + field('po-tiers', 'opus=kimi-k2-thinking, sonnet=kimi-k2',
                'Which model each tier resolves to',
                'Comma-separated tier=model pairs. Empty = the route\'s own defaults. Changing one bumps '
                + 'the revision, because it changes what a session is actually served by.')
            + '<button class="small" id="po-add">Add route</button>'
            + '</div>'
            + '<div class="pomsg" id="po-msg">' + esc(provMsg) + '</div>'
            + (profiles.length
                ? profiles.map(profileHtml).join('')
                : '<div class="muted small">No routes yet. Claude Code runs first-party without one; '
                + 'a route is how you point it at an Anthropic-compatible endpoint instead.</div>')
            + healthHtml()
            + '</div>';
    }

    /**
     * One box of the form, with its explanation on an AFTip rather than in a
     * label beside it. A placeholder is a shape, not a rule — "id (kimi)" cannot
     * say that the id is permanent because a credential is filed under it, and
     * that is exactly the sentence somebody needs BEFORE they type, not in the
     * refusal afterwards.
     */
    function field(id, placeholder, head, body) {
        return window.AFTip.wrap(
            '<input id="' + esc(id) + '" placeholder="' + esc(placeholder) + '">', head, body, 'pofield');
    }

    /** `opus=a, sonnet=b` → an object. A pair with no `=` is dropped rather than
     *  guessed at: a tier nobody named is not a tier. */
    function parseTiers(text) {
        const out = {};
        for (const part of String(text || '').split(',')) {
            const at = part.indexOf('=');
            if (at < 1) { continue; }
            const tier = part.slice(0, at).trim(), model = part.slice(at + 1).trim();
            if (tier && model) { out[tier] = model; }
        }
        return out;
    }

    function render() {
        const list = DATA.engines || [];
        document.getElementById('app').innerHTML = `
            <style>
                .engcard { border:1px solid var(--vscode-widget-border,#4443); border-radius:7px;
                    padding:10px 12px; margin-bottom:10px;
                    --engc:var(--vscode-widget-border,#4443); border-left:3px solid var(--engc); }
                /* the rule on the left is the STATE, not decoration */
                .engcard.eng-ok { --engc:var(--vscode-charts-green,#3fb950); }
                .engcard.eng-warn { --engc:var(--vscode-charts-yellow,#d7ba7d); }
                .engcard.eng-off { --engc:var(--vscode-descriptionForeground,#9d9d9d); }
                .enghead { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
                .engname { font-weight:600; font-size:14px; }
                .grow { flex:1 1 auto; }
                .engbadge { font-size:10px; padding:1px 8px; border-radius:9px; white-space:nowrap;
                    cursor:help; border:1px solid var(--vscode-widget-border,#4446); }
                .engbadge.b-ok { background:var(--vscode-charts-green,#3fb950); color:#fff; border-color:transparent; }
                .engbadge.b-warn { background:var(--vscode-charts-yellow,#d7ba7d); color:#000; border-color:transparent; }
                /* ‼️ X-172 — the sign-in chip. Quieter than the state badge beside
                   it on purpose: the badge answers "can this run at all", which is
                   the louder question; this answers "on whose plan", which the
                   reader only asks once the first one is yes. The a-on class marks
                   a captured account standing, and it is an OUTLINE rather than a
                   fill so it cannot be mistaken for a state verdict. (No backticks
                   in this block: the whole stylesheet is a template literal and one
                   would end it.) */
                .engacct { font-size:10px; padding:1px 8px; border-radius:9px; white-space:nowrap;
                    cursor:help; border:1px dashed var(--vscode-widget-border,#4446); opacity:.8; }
                .engacct.a-on { border-style:solid; opacity:1;
                    border-color:var(--vscode-charts-blue,#4a9eff);
                    color:var(--vscode-charts-blue,#4a9eff); }
                /* X-241 — the auto-refresh switch: lit while on, grey while off */
                .acauto.a-on { border-color:var(--vscode-charts-blue,#4a9eff);
                    color:var(--vscode-charts-blue,#4a9eff); }
                .acauto.a-off { opacity:.55; }
                .engbill { font-size:12px; opacity:.75; margin-top:6px; max-width:820px; }
                .engnext { font-size:12px; margin-top:5px; max-width:820px; }
                .engdetail { margin-top:2px; }
                /* the verdict — its own block, because it is a different KIND of
                   claim from everything above it: that was read off disk, this
                   was measured against the provider */
                .engv { margin-top:8px; padding:6px 9px; border-radius:5px; font-size:12px;
                    background:var(--vscode-textCodeBlock-background,#2b2b2b); }
                .engv.good { color:var(--vscode-charts-green,#3fb950); }
                .engv.bad { color:var(--vscode-charts-red,#f14c4c); }
                /* ‼️ U-59 — "not attempted" is its own colour, and it is NOT red.
                   Red says the engine was asked and failed; this row says the
                   check declined to spend money and is handing the choice back,
                   on a card whose line above it may well read "Ready". Yellow is
                   the palette's word for "your move", which is exactly this. */
                .engv.held { color:var(--vscode-charts-yellow,#cca700); }
                .engv.none, .engv.testing { opacity:.7; }
                .engage { opacity:.6; font-size:11px; margin-left:4px; }
                .engerr { margin-top:4px; font-family:var(--vscode-editor-font-family,monospace);
                    font-size:11px; opacity:.85; white-space:pre-wrap; color:var(--vscode-foreground); }
                .engnote { margin-top:6px; font-size:12px;
                    background:var(--vscode-inputValidation-warningBackground,#663);
                    padding:5px 8px; border-radius:5px; }
                .englede { max-width:820px; margin:0 0 14px; font-size:12px; opacity:.8; }
                /* ‼️ X-172 — accounts. The card, the head and the body are the
                   ROUTES' classes (.pocard is .accard's twin and .pohead/.pobody
                   are shared outright): two sections of one page that look like
                   two products is the fault a new CSS family here would ship.
                   What is new is only what a plan figure needs. */
                .accard { border:1px solid var(--vscode-widget-border,#4443); border-radius:7px;
                    padding:8px 11px; margin-bottom:8px; }
                /* the standing one wears the rule, in the SAME blue as the chip on
                   its engine card — one colour for one fact across the page */
                .accard.a-now { border-left:3px solid var(--vscode-charts-blue,#3794ff); }
                .acplan, .acbad { font-size:10px; padding:1px 8px; border-radius:9px;
                    white-space:nowrap; border:1px solid var(--vscode-widget-border,#4446); }
                /* ‼️ X-220 — three states, three colours. A working sign-in is the
                   ordinary case and is drawn QUIETLY: shouting it in green would
                   cost the two that need the eye their only advantage. An expired
                   one is YOUR MOVE, in the same yellow the held verdict and the
                   keyless route wear; an unreadable one is a FAULT and wears the
                   red every other fault on this page does. */
                /* X-255 -- who stands on this account. The SAME blue the standing
                   rule and the standing chip wear, because it is the same fact one
                   subject over: this card is the sign-in somebody opens on. It is
                   a label and not a control, so it carries no border and no fill. */
                .acpin { font-size:10px; white-space:nowrap; cursor:help; max-width:220px;
                    overflow:hidden; text-overflow:ellipsis;
                    color:var(--vscode-charts-blue,#3794ff); }
                /* X-258 -- who is ON it now. GREEN because it is the one fact on this
                   card about something ALIVE; the blue beside it is configuration and
                   the yellow is a warning, so three kinds of statement wear three
                   colours rather than competing for one. */
                .acbusy { font-size:10px; white-space:nowrap; cursor:help; max-width:240px;
                    overflow:hidden; text-overflow:ellipsis;
                    color:var(--vscode-charts-green,#89d185); }
                /* X-258 -- where it stands in the ROTATION. A bordered pill, because it
                   is a position in a line and not a label: the shape is what keeps it
                   from being read as another status word.
                   ‼️ AND IT IS DELIBERATELY NOT FILLED WITH A COLOUR. The first draft
                   filled the leading one green and it was photographed beside the green
                   "who is on it" line on the same card -- one colour carrying two
                   unrelated meanings (a forecast and a live fact) two centimetres apart.
                   The word "next" already says which end of the line this is; emphasis
                   is all the extra the leader needs, and it costs the palette nothing. */
                .acrota { font-size:10px; padding:1px 7px; border-radius:9px; white-space:nowrap;
                    cursor:help; border:1px solid var(--vscode-widget-border,#4446);
                    color:var(--vscode-descriptionForeground,#9d9d9d); }
                .acrota.on { color:var(--vscode-foreground,#ccc); font-weight:600;
                    border-color:var(--vscode-foreground,#ccc); }
                .acbad { cursor:help; }
                .acbad.ok { background:transparent; color:var(--vscode-descriptionForeground,#9d9d9d);
                    border-color:var(--vscode-widget-border,#4446); }
                .acbad.warn { background:var(--vscode-charts-yellow,#d7ba7d); color:#000;
                    border-color:transparent; }
                .acbad.bad { background:var(--vscode-charts-red,#f14c4c); color:#fff;
                    border-color:transparent; }
                /* X-282 — one account filed twice: its own badge, not a verdict, so the
                   verdict count stays one per card */
                .acdup { font-size:10px; padding:1px 8px; border-radius:9px; white-space:nowrap;
                    background:var(--vscode-charts-red,#f14c4c); color:#fff; cursor:help; }
                .acuuid { font-family:var(--vscode-editor-font-family,monospace); }
                /* X-219 — the one control that answers that badge wears the badge's
                   colour: a dead sign-in and its remedy are one fact, said twice. */
                .acreauth { border-color:var(--vscode-charts-yellow,#d7ba7d); }
                /* ‼️ X-205 — the standing account is a SWITCH. Two states of one
                   control, drawn rather than spelled: a button whose label has
                   to be read is a button the eye has to stop at, and this one
                   is read at a glance down a column of cards. The ON colour is
                   the SAME blue the standing badge and the card's left rule
                   wear — one colour for one fact, across the page. */
                /* ‼️ X-217 — ONE ENGINE, ONE STANDING ACCOUNT, so the control is a
                   single selection and not a row of switches: the chosen one wears
                   the state as a badge (the same pill the rest of the head speaks
                   in), the others offer the action. Same family, two jobs — which
                   is why they share a class and differ by one modifier. */
                .acsel { font-size:10px; padding:1px 8px; border-radius:9px; flex:none;
                    line-height:16px; cursor:pointer; white-space:nowrap;
                    border:1px solid var(--vscode-widget-border,#4446);
                    background:var(--vscode-button-secondaryBackground,#3a3d41);
                    color:var(--vscode-button-secondaryForeground,#ccc);
                    transition:background .12s ease, border-color .12s ease; }
                .acsel:hover { border-color:var(--vscode-focusBorder,#3794ff); }
                .acsel.on { background:var(--vscode-charts-blue,#3794ff); color:#fff;
                    border-color:transparent; }
                /* ‼️ X-206 — the refresh button IS the queue indicator. A second
                   badge beside it would say the same thing twice and take the
                   width the card does not have: the glyph is ⟳ at rest, the
                   PLACE IN THE LINE while it waits (a number the reader can act
                   on, not a spinner that says "soon"), and a filled ring while
                   the request is in flight. */
                .acref { width:24px; height:22px; padding:0; flex:none; font-size:12px; line-height:1;
                    border-radius:5px; cursor:pointer;
                    border:1px solid var(--vscode-widget-border,#4446);
                    background:var(--vscode-button-secondaryBackground,#3a3d41);
                    color:var(--vscode-button-secondaryForeground,#ccc); }
                .acref:hover { border-color:var(--vscode-focusBorder,#3794ff); }
                /* waiting wears the same yellow as every other "your move is
                   already made, this is not done yet" state on the page */
                .acref.queued { background:var(--vscode-charts-yellow,#d7ba7d); color:#000;
                    border-color:transparent; font-weight:600; }
                .acref.reading { background:var(--vscode-charts-blue,#3794ff); color:#fff;
                    border-color:transparent; animation:acspin 1.1s linear infinite; }
                @keyframes acspin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
                .acgrp { display:flex; align-items:center; gap:8px; margin:12px 0 5px;
                    padding-bottom:3px; border-bottom:1px solid var(--vscode-widget-border,#4443); }
                .acgrpn { font-size:12px; font-weight:600; }
                .acwin { margin-top:6px; max-width:420px; }
                /* X-196 — the window block is the card's own paragraph, so the
                   AFTip wrapper around it has to be one too: an inline wrapper
                   would collapse the block it holds. */
                /* ‼️ THE SELECTOR HAS TO OUT-WEIGH common.css's own
                   span.af-tipw inline-block rule (0,1,1) — a bare class (0,1,0)
                   loses to it, so this rule sat here doing nothing from X-196
                   until X-252 put a second block beside it and the two drew on
                   ONE line, the spend figure glued to the tail of the reset
                   sentence. Measured: both wrappers reported inline-block with
                   this rule in force. (No backticks in this block: the whole
                   stylesheet is a template literal and one would end it.) */
                span.acwinw, span.acspendw { display:block; }
                .acwt { display:flex; justify-content:space-between; align-items:baseline;
                    gap:8px; font-size:12px; }
                /* X-215 round 2 — the windows as ONE chart. The gutter is fixed
                   so both tracks start on the same edge and the pair reads as a
                   single figure; the rows are 3px apart, which is close enough
                   to group them and far enough that neither bar looks like the
                   other's shadow. Tabular numerals keep 9% and 40% from
                   shifting the track's left edge between rows. */
                /* ‼️ line-height:1 IS THE RULE THAT MAKES THIS ONE CHART, and it
                   was found by measuring rather than by looking. Without it the
                   rows were 15px tall around a 6px track, so the tracks sat
                   12px apart — twice their own height, which reads as two
                   unrelated bars however small the margin between the ROWS is.
                   The text box, not the margin, was the distance. */
                .acwrow { display:flex; align-items:center; gap:6px; line-height:1; }
                .acwrow + .acwrow { margin-top:2px; }
                .acwk { flex:none; width:16px; font-size:10px; opacity:.7;
                    text-transform:uppercase; letter-spacing:.3px; }
                .acwp { flex:none; width:30px; text-align:right; font-size:11px;
                    font-variant-numeric:tabular-nums; }
                .acwrow .progress { flex:1; margin-top:0; height:7px; }
                .acsub, .acnone { font-size:11px; opacity:.7; margin-top:3px; }
                .acnone { margin-top:6px; font-size:12px; }
                /* X-252 — the day's spend, on the card's own ruler under the
                   window block. A block wrapper for the same reason .acwinw is
                   one. It is deliberately quieter than the percentage: the bar
                   is what a rotation is decided on, this is what it cost. */
                .acspend { margin-top:5px; max-width:420px; font-size:11px; opacity:.85;
                    font-variant-numeric:tabular-nums; }
                .acspend.none { opacity:.55; }
                /* The door, stated only under the hand: the resting row is the
                   figure and nothing else, so the card looks exactly as it did. */
                .acspend.go { cursor:pointer; }
                .acspend.go:hover { color:var(--vscode-textLink-foreground); }
                .acwhy { margin-top:8px; }
                .poform select { font-size:12px; padding:3px 6px;
                    background:var(--vscode-input-background); color:var(--vscode-input-foreground);
                    border:1px solid var(--vscode-input-border,#4446); border-radius:4px; }
                #ac-label { width:220px; }
                /* X-100 — providers */
                .posec { margin-top:22px; border-top:1px solid var(--vscode-widget-border,#4443); padding-top:14px; }
                .potitle { font-size:14px; margin:0 0 8px; }
                .posech { display:flex; align-items:center; gap:8px; }
                .posech .potitle { margin:0 0 8px; }
                /* ‼️ NOT full width. Four short columns stretched across a
                   1400px page put the reader's eye on a journey between the
                   engine and its answer — DENSITY is the fact per pixel, not
                   the pixel per fact. */
                .potab { border-collapse:collapse; font-size:12px; margin:0 0 12px; width:auto; }
                .potab th, .potab td { padding:3px 16px 3px 0; text-align:left; white-space:nowrap; }
                .potab th { font-weight:600; opacity:.75; cursor:help; }
                .poeng { font-weight:600; }
                .poown { cursor:help; font-size:11px; padding:1px 7px; border-radius:9px;
                    border:1px solid var(--vscode-widget-border,#4446); white-space:nowrap; }
                /* ‼️ THE TWO SIDES ARE NOT GOOD AND BAD. Neither owner is the
                   error state — the whole point is that each is right for its
                   own engine — so they read as two categories, not a verdict. */
                .poown.o-af { background:var(--vscode-charts-blue,#3794ff); color:#fff; border-color:transparent; }
                .poown.o-eng { background:var(--vscode-charts-purple,#b180d7); color:#fff; border-color:transparent; }
                .powhy { opacity:.5; }
                .poform { display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:8px; }
                .poform input { font-size:12px; padding:3px 6px; width:150px;
                    background:var(--vscode-input-background); color:var(--vscode-input-foreground);
                    border:1px solid var(--vscode-input-border,#4446); border-radius:4px; }
                /* the two that hold a URL and a tier map need to show what was
                   typed, or the box is a place to lose your own text in */
                #po-url { width:260px; }
                #po-tiers { width:280px; }
                .pomsg:empty { display:none; }
                .pomsg { font-size:12px; margin-bottom:8px; padding:5px 8px; border-radius:5px;
                    background:var(--vscode-inputValidation-errorBackground,#5a1d1d); }
                .pocard { border:1px solid var(--vscode-widget-border,#4443); border-radius:7px;
                    padding:8px 11px; margin-bottom:8px; }
                .pohead { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
                .poname { font-weight:600; font-size:13px; }
                .poid, .porev { font-size:11px; opacity:.7; cursor:help; font-family:var(--vscode-editor-font-family,monospace); }
                .pokey { font-size:10px; padding:1px 8px; border-radius:9px; cursor:help; white-space:nowrap;
                    border:1px solid var(--vscode-widget-border,#4446); }
                .pokey.k-yes { background:var(--vscode-charts-green,#3fb950); color:#fff; border-color:transparent; }
                /* "no key" is the step you are ON, not a failure — the same
                   reading the ⊘ verdict row above gets. */
                .pokey.k-no { background:var(--vscode-charts-yellow,#d7ba7d); color:#000; border-color:transparent; }
                .pobody { margin-top:5px; }
                /* X-114 -- route health. The chips are read left to right as
                   three separate answers, so they are not one traffic light:
                   configured is neutral, available carries the colour, and
                   tested is its own chip because "never tested" is the ordinary
                   state of a healthy row and must not look like a fault. */
                .pohealth .pohrep { margin-bottom:12px; }
                .pohrow { margin-bottom:6px; }
                .pohcard { margin-left:12px; }
                .pohchip { font-size:10px; padding:1px 8px; border-radius:9px; cursor:help;
                    white-space:nowrap; border:1px solid var(--vscode-widget-border,#4446); }
                .pohchip.h-cfg { opacity:.75; }
                .pohchip.h-yes { background:var(--vscode-charts-green,#3fb950); color:#fff; border-color:transparent; }
                .pohchip.h-no { background:var(--vscode-charts-red,#f85149); color:#fff; border-color:transparent; }
                /* unknown is an ANSWER, so it is drawn rather than left blank --
                   and it is not amber: nothing is wrong, nothing was read. */
                .pohchip.h-un { opacity:.6; font-style:italic; }
                .pohchip.h-none { opacity:.55; }
                .pohchip.h-ok { background:var(--vscode-charts-green,#3fb950); color:#fff; border-color:transparent; }
                .pohchip.h-bad { background:var(--vscode-charts-red,#f85149); color:#fff; border-color:transparent; }
                /* nothing was called: the user's move, not a failure -- the same
                   yellow "no key" wears above. */
                .pohchip.h-held { background:var(--vscode-charts-yellow,#d7ba7d); color:#000; border-color:transparent; }
                .pohchip.h-old { background:var(--vscode-charts-orange,#d18616); color:#000; border-color:transparent; }
                .pohprob { margin-top:4px; font-size:11px; color:var(--vscode-charts-red,#f85149); }
                .pohnote { margin-top:4px; font-size:11px; opacity:.7; }
                /* X-305 -- what a rule comes to now. The chip is the sign-in
                   chip's twin (.engacct), because it is the same kind of fact:
                   on whose plan. a-on is the blue outline the standing chip
                   wears; a-no is "cannot choose right now", and it is the
                   palette's YELLOW for your move, not red -- a rule walled at
                   11:02 is the right answer at 14:50. */
                .polnow { cursor:help; }
                .polnow.a-no { border-style:solid; opacity:1;
                    border-color:var(--vscode-charts-yellow,#d7ba7d);
                    color:var(--vscode-charts-yellow,#d7ba7d); }
                .poltab td { vertical-align:middle; }
                .polstep { white-space:nowrap; }
                .polstepbox { border:1px dashed var(--vscode-widget-border,#4446); border-radius:6px;
                    padding:6px 10px; margin-top:6px; }
            </style>
            ${window.AFHeader.html({
            page: 'engines',
            title: 'Engines',
            sub: `${DATA.ready} of ${list.length} can run right now · ${DATA.onPlan} on a subscription`,
            guide: 'engines'
        })}
            <p class="englede">Which agent CLI this machine can actually run, and how each one is paid for.
                <b>A plan sign-in lives in the CLI's own credentials file and never passes through Agent Farm</b>;
                a key is the other route and is kept in the OS keychain (the Secrets page is the full table),
                injected into an agent's environment under the exact name the engine reads.
                Two more arrangements exist and neither has a box on this page: <b>Antigravity is signed in
                inside its own desktop app</b>, so it has no key, no login command and no credential file
                here to read — and <b>OpenCode needs no sign-in at all</b>, because its own connected provider
                serves free models; signing in there ADDS the paid ones rather than switching it on. Each of
                those rows says what it found instead.
                Everything above a card's verdict line was read off disk — <b>only ⚡ Test proves a call gets through</b>,
                and it costs one real turn. ⊘ means the check declined to run: nothing was called, and the row
                says what you can do about it.</p>
            ${list.map(cardHtml).join('')}
            ${accountsHtml()}
            ${policiesHtml()}
            ${providersHtml()}`;
        wire();
        wirePolicies();
    }

    function wire() {
        // ‼️ `wire(vscode, hooks)` — THE API COMES FIRST. Handing it only the
        // hooks put the hooks object in the `vscode` slot, so every header
        // button on this page called `postMessage` on something that has none:
        // all 16 nav buttons threw and posted nothing, and the header's own ⟳
        // fell through to the same dead call. Measured on the page harness —
        // `vscode.postMessage is not a function`, `posted: []`. Nothing was
        // visibly broken, which is why it lasted: a button that silently does
        // nothing looks exactly like one that is thinking.
        window.AFHeader.wire(vscode, { onRefresh: () => post({ type: 'refresh' }) });
        document.querySelectorAll('[data-engtest]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'engineTest', id: b.dataset.engtest })));
        // Install and Sign in are ONE binding: they do one thing — write a line
        // into a terminal without running it.
        document.querySelectorAll('[data-engcmd]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'engineCommand', command: b.dataset.engcmd })));
        document.querySelectorAll('[data-engkey]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'engineKey', name: b.dataset.engkey })));
        document.querySelectorAll('[data-engdocs]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'engineDocs', url: b.dataset.engdocs })));
        /* ---- X-100 — the routes. Every button hands over an ID, never a value. */
        const val = (id) => (document.getElementById(id) || {}).value || '';
        const add = document.getElementById('po-add');
        if (add) {
            add.addEventListener('click', () => post({
                type: 'providerSave',
                // ‼️ A FORM, NOT A RECORD. What the host stores goes through
                // `storedProfile`'s allow-list, so nothing this page can put in
                // the message survives except the fields named there — which is
                // why the page is allowed to be the naive side of this wall.
                profile: {
                    id: val('po-id'), label: val('po-label'), engine: 'claude',
                    providerId: val('po-provider'), baseUrl: val('po-url'),
                    tiers: parseTiers(val('po-tiers'))
                }
            }));
        }
        window.AFAccounts.wire(accountsCtx());
        document.querySelectorAll('[data-pokey]').forEach(b =>
            b.addEventListener('click', () => post({
                type: 'providerKey', id: b.dataset.pokey, label: b.dataset.polabel })));
        // X-114 -- one real turn through one route. The disabled attribute is
        // the page's half of the guard; the host holds the other half, so a
        // second window cannot buy a second turn either.
        document.querySelectorAll('[data-potest]').forEach(b =>
            b.addEventListener('click', () => post({
                type: 'providerTest', engine: b.dataset.poteng,
                providerId: b.dataset.potest, model: b.dataset.potmodel || ''
            })));
        document.querySelectorAll('[data-pocopy]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'providerCopy', id: b.dataset.pocopy })));
        document.querySelectorAll('[data-porm]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'providerRemove', id: b.dataset.porm })));
    }

    render();
})();
