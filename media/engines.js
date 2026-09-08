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
        const spent = (a) => a.percent >= 0 ? a.percent + '% of the 5-hour window used' : '';
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

    /**
     * ONE CAPTURED SIGN-IN. The chip on the engine card answers "on whose plan"
     * in two words; this is the row that can be acted on.
     *
     * ‼️ -1 IS NOT 0%. An account nobody has read a figure for and an account
     * with nothing left would draw the same empty bar, and one of them is ready
     * to work — so a bar is drawn ONLY where a percentage was really read, and
     * the other two states say which one they are in their own words.
     */
    function accountCardHtml(a) {
        const T = window.AFTip;
        const read = a.percent >= 0;
        const hot = a.percent >= 90 ? 'hot' : a.percent >= 75 ? 'warn' : '';
        /**
         * ‼️ X-206 — WHEN THE FIGURE WAS READ, BESIDE THE FIGURE.
         *
         * The card used to print `captured 6d ago` next to a percentage, and
         * the two answer different questions: one is how long this sign-in has
         * been on the machine, the other is whether the number is worth acting
         * on. A percentage with no age is a percentage the reader has to trust.
         */
        const readAge = a.fetchedAt
            ? 'read ' + age(a.fetchedAt, DATA.now)
            : 'never read';
        /**
         * ‼️ X-196 — THE BLOCK THE WHOLE CARD IS FOR, AND IT CARRIED NO PANEL.
         *
         * A bar, a percentage and one line about the reset: everything else the
         * reader needs to decide *can I start something on this now* was on the
         * card's technical footer or nowhere. How much is LEFT is the figure
         * they are actually after and it was never written — 62% left and 38%
         * used are the same fact, and only one of them is the answer to the
         * question being asked. DENSITY: none of this costs a click now.
         */
        /**
         * ‼️ X-215 — THE WINDOW IS NAMED BY WHOEVER MEASURED IT.
         *
         * This block named ONE engine's window in three places, which is
         * right for every Claude row and wrong for the engine this card was
         * finally wired to: Codex publishes a WEEK, and a card drawing 72%
         * under those words would be a lie with a real number in it. The name
         * travels with the figure (`SlotUsage.window`, derived from the
         * window's own minutes) and the five-hour wording is what an engine
         * that named nothing still gets — which is every row written before.
         */
        // …and an UNREAD disk-backed row has no name yet either, because the
        // window's length is in the reading. "five-hour" would be the one claim
        // that is certainly wrong there.
        const winName = a.window
            || (a.quotaSource === 'session-tail' ? 'usage window' : 'five-hour window');
        /**
         * ‼️ THE BADGE GOT THREE STATES AND THE SENTENCE UNDER IT KEPT TWO
         * (audit A-06.7).
         *
         * X-220 split the two bad verdicts precisely because they are not the
         * same fact — 🟠 knows whose account this is and cannot refresh it, 🔴
         * cannot tell you even that. This line tested `health !== 'ready'`, so a
         * 🔴 row was captioned "needs signing in again" and its panel said "the
         * stored credential no longer refreshes": the 🟠 sentence, word for
         * word, directly beneath a badge whose own tooltip says "this is NOT an
         * expired sign-in". The reader is told the opposite thing twice in two
         * lines, and the one that is wrong is the one with the detail in it.
         *
         * Three silences, therefore three sentences: read it and it was dead ·
         * read it and it was gibberish · nobody has looked yet.
         */
        const silence = a.health === 'unreadable' ? 'unreadable'
            : (a.health !== 'ready' || a.usageState === 'no-auth' || a.usageState === 'expired') ? 'dead'
                : 'unread';
        const window5 = read
            ? T.wrap('<div class="acwin">'
                + '<div class="acwt"><span>' + esc(winName) + '</span><strong>' + a.percent + '%</strong></div>'
                + '<div class="progress"><div class="' + hot + '" style="width:' + a.percent + '%"></div></div>'
                + '<div class="acsub">' + esc(accountTurns(a) || 'no reset time was read') + '</div></div>',
                winName.charAt(0).toUpperCase() + winName.slice(1) + ' — ' + (a.label || a.id),
                T.lines([
                    'used: ' + a.percent + '%',
                    'left: ' + Math.max(0, 100 - a.percent) + '%',
                    accountTurns(a) || 'reset: no time was read, so nothing is claimed about when it turns over',
                    'this figure was ' + readAge,
                    a.plan ? 'plan: ' + a.plan : '',
                    '',
                    // ‼️ X-215 — WHERE THE NUMBER CAME FROM, IN ITS OWN WORDS.
                    // This paragraph claimed the figure was Anthropic's, which
                    // is true of a Claude row and false of the engine this card
                    // was wired to next. The reading carries its own sentence
                    // now; the Anthropic one is what a row with none still gets.
                    a.note || ('The percentage is Anthropic\'s own — the same figure /usage prints — and not a '
                        + 'total worked out of the transcripts. A campaign compares it against the '
                        + 'ceiling to decide whether this sign-in is worth opening a round on.')
                ]), 'acwinw')
            : T.wrap('<div class="acnone">' + esc(winName) + ' — '
                + (silence === 'unreadable' ? 'the sign-in could not be read, so nothing was read'
                    : silence === 'dead' ? 'needs signing in again, so nothing was read'
                        : 'not read yet') + '</div>',
                'No figure for this window',
                T.lines([
                    'state: ' + (a.usageState || 'unread'),
                    'read: ' + readAge,
                    '',
                    // ‼️ -1 IS NOT 0%. The card refuses to draw an empty bar for
                    // an unread account, and the panel says which of the three
                    // silences this is rather than leaving it to the wording.
                    silence === 'unreadable'
                        ? 'Nothing could be made of this account\'s credentials file, so there is no '
                        + 'figure to read and nothing to refresh — this is not an expired sign-in, '
                        + 'which would at least know whose account it is. Signing in again writes the '
                        + 'file afresh, which is what the 🔑 beside this does.'
                        : silence === 'dead'
                            ? 'The stored credential no longer refreshes, so there is nothing to read a '
                            + 'figure from. Sign in again in a terminal and capture it once more.'
                            : 'Nothing has asked for it yet. Press ⟳ to read this one account now — '
                            + 'accounts are read one at a time and never less than five seconds apart.'
                ]), 'acwinw');
        /**
         * ‼️ X-217 — THE SHAPE OF THE CONTROL STATES THE ARITHMETIC OF THE CHOICE.
         *
         * A switch says "these go on and off independently". These do not: an
         * engine has exactly ONE standing account and `normalizeActive` has
         * always enforced it, so a row of switches drew a promise the code
         * refuses to keep — turn a second one on and the first goes off by
         * itself, which is not what a switch means anywhere else in this
         * product. A single-selection choice is drawn the way one is: the chosen
         * account wears a STATE badge (pressing it is the way back to the main
         * sign-in), every other one carries an ACTION chip. A switch is the
         * right shape where the members really do go on and off independently —
         * a pool several of which can be ticked at once — and that is exactly
         * what this is not.
         *
         * MIRROR: the badge opens with the state it IS in; the chip with what
         * pressing it would do.
         */
        const stand = a.active
            ? T.wrap('<button class="acsel on" role="radio" aria-checked="true" '
                + 'data-acmain="' + esc(a.engine) + '">🟢 standing</button>',
                'Standing — every new ' + engineLabel(a.engine) + ' session opens as ' + (a.label || a.id),
                'Pressing it hands the engine back to the main sign-in — the identity this machine '
                + 'is logged in as, for which nothing is injected at all. Either way nothing already '
                + 'running moves: an account is fixed for a session the way a route is.')
            : T.wrap('<button class="acsel" role="radio" aria-checked="false" '
                + 'data-acuse="' + esc(a.id) + '" data-acengine="' + esc(a.engine) + '">⚡ Use this one</button>',
                'Make ' + (a.label || a.id) + ' the standing account',
                'Every new ' + engineLabel(a.engine) + ' session would then open as it. The one standing '
                + 'now goes off in the same act: one engine, one standing account.\n\n'
                + 'Nothing already running moves — starting on another account means starting another '
                + 'session. An account is deliberately not remembered per agent: it is a state (how much '
                + 'of a plan is left, which changes hourly), not a preference, so this one place holds it '
                + 'and a launch that names its own account still wins.');
        /**
         * ‼️ …AND THE BUTTON SAYS WHERE IT IS IN THE LINE. A press that will act
         * in twenty seconds with no sign it was heard is indistinguishable from
         * a button that does nothing, so the queue is drawn: waiting cards carry
         * their place, the one in flight spins, and pressing a waiting one again
         * takes it out — a queue you cannot leave is one you learn not to join.
         */
        const q = a.queue || 'idle';
        /**
         * ‼️ X-215 — A BUTTON MAY NOT PROMISE WHAT IT WILL NOT DO. This panel
         * said "one request, for this account alone — accounts are read one at a
         * time and never less than five seconds apart" on every card. On a card
         * whose figure is a file on this disk that is three false claims in one
         * sentence, and the queue it describes is one this press never joins.
         */
        /**
         * ‼️ X-219 — THE ANSWER TO THE YELLOW BADGE, ON THE SAME LINE AS IT.
         *
         * A card that states a sign-in is dead and offers nothing to do about it
         * is a diagnosis with no treatment; the page said outright that nothing
         * here could renew it, and it was true. This press signs nobody in — the
         * flow is a browser one only a person can finish — it opens the ENGINE'S
         * OWN command in the SLOT'S OWN directory, which is the whole of the
         * extension's honest part. It is drawn only where it applies: a ready
         * sign-in has nothing to renew.
         */
        const reauth = a.health === 'ready'
            ? ''
            : T.wrap('<button class="secondary small acreauth" data-acreauth="' + esc(a.id) + '">🔑</button>',
                'Sign in again as ' + (a.label || a.id),
                'Opens a terminal whose environment points the engine at this account\'s own directory, '
                + 'and runs the engine\'s own sign-in command there. Nothing is copied over the sign-in '
                + 'you are using and no other row moves — the browser flow writes the new credential '
                + 'straight into this one.\n\n'
                + 'It cannot tell you it worked: the flow can be abandoned halfway, and a card that '
                + 'assumed success would be lying about the one fact it exists to state. When the '
                + 'terminal closes this row is READ AGAIN from disk, so the badge above changes because '
                + 'the files did.');
        /**
         * ‼️ X-220 — THE VERDICT IS ALWAYS DRAWN, AND THREE STATES ARE THREE
         * STATES.
         *
         * The card wore a badge only when something was wrong, so a healthy row
         * said NOTHING — and nothing is also what a row nobody has looked at
         * says. The one question a reader opens this page with ("can I start a
         * session on this?") was answered by an absence.
         *
         * ‼️ And the two bad states wore the SAME yellow and the SAME sentence.
         * They are not the same fact: one is a credential that no longer
         * refreshes, the other a file nothing could be made of — the second does
         * not even know WHOSE account this is. Two verdicts drawn identically is
         * one verdict with a lie in it.
         *
         * SHORTHAND: the badge is the short form, the panel carries the long one
         * — and what that state REQUIRES OF THE READER, because a verdict nobody
         * can act on is an alarm rather than information.
         */
        const VERDICTS = {
            'ready': ['ok', '🟢 ready', 'This sign-in works',
                'The credential is there and still refreshes, so a session started on this account '
                + 'opens as it and nobody is asked to sign in. Read from this account\'s own '
                + 'directory just now — not remembered from when it was captured.'],
            'needs-signin': ['warn', '🟠 needs signing in', 'This sign-in has expired',
                'The credential is readable but no longer refreshes, so a session started here would '
                + 'open as nobody. Only a person can fix it: signing in is a browser flow. '
                + 'The 🔑 beside this is where that starts — it opens a terminal pointed at THIS '
                + 'account\'s own directory, so the renewed credential lands on this row and on '
                + 'nothing else.'],
            'unreadable': ['bad', '🔴 unreadable', 'This sign-in could not be read at all',
                'The file is there and nothing could be made of it — locked by a running session, '
                + 'half-written, or left over from an older shape of the engine. ‼️ This is NOT an '
                + 'expired sign-in: that one knows whose account it is and cannot refresh it, while '
                + 'this one cannot tell you even that. Signing in again writes the file afresh, '
                + 'which is what the 🔑 beside this does.']
        };
        const verdict = VERDICTS[a.health] || VERDICTS['unreadable'];
        const onDisk = a.quotaSource === 'session-tail';
        const refresh = a.quotaSource === 'none'
            ? ''
            : T.wrap('<button class="acref ' + esc(q) + '" data-acrefresh="' + esc(a.id) + '">'
                + (q === 'reading' ? '◍' : q === 'queued' ? (a.queuePlace || '·') : '⟳') + '</button>',
                q === 'reading' ? 'Being read right now'
                    : q === 'queued' ? 'Waiting — number ' + (a.queuePlace || 1) + ' in the line'
                        : 'Read this account\'s figure now',
                q === 'reading'
                    ? 'The request is already in flight, so it cannot be taken back — the figure lands in a moment.'
                    : q === 'queued'
                        ? 'One account is read every five seconds, in the order they were asked for. Press again '
                        + 'to take this one out of the line.'
                        : onDisk
                            ? 'This engine publishes no endpoint and is not silent either: it writes what the '
                            + 'service told it into the transcript it is keeping anyway, so this reads a file '
                            + 'under this account\'s own folder. No request, no queue, no waiting — and the '
                            + 'figure is as old as that account\'s last turn.\n\n'
                            + 'This figure was ' + readAge + '.'
                            : 'One request, for this account alone. Accounts are read one at a time and never less '
                            + 'than five seconds apart, however many are asked for at once — asking how much quota '
                            + 'is left must not become the thing that spends it.\n\n'
                            + 'This figure was ' + readAge + '.');
        return '<div class="accard' + (a.active ? ' a-now' : '') + '">'
            + '<div class="pohead">'
            + '<span class="poname">' + esc(a.label || a.id) + '</span>'
            + (a.email && a.email !== a.label
                ? T.wrap('<span class="poid">' + esc(a.email) + '</span>', 'id: ' + a.id,
                    'The address the engine itself reports for this sign-in. The id is what a launch names '
                    + 'and what the directory is called: ' + (a.dir || 'under the accounts root') + '.')
                : '')
            + (a.plan ? '<span class="acplan">' + esc(a.plan) + '</span>' : '')
            + T.wrap('<span class="acbad ' + verdict[0] + '">' + esc(verdict[1]) + '</span>',
                verdict[2], verdict[3])
            + '<span class="grow"></span>'
            + reauth
            + refresh
            + stand
            + T.wrap('<button class="secondary small" data-acforget="' + esc(a.id) + '">Forget</button>',
                'Drop it from this list',
                'Bookkeeping, not a deletion: the directory is left on disk, so capturing it again brings '
                + 'it back. An account that was standing stops being it in the same act — a next session '
                + 'pointed at an id that names nothing would silently fall back to whoever is signed in.')
            + '</div>'
            + window5
            // ‼️ X-220 — THE ENGINE, IN THE PRODUCT'S OWN BADGE. This card wrote
            // the raw id in lowercase grey while the Console, the agent page and
            // the slash picker all drew `AFEngine.badge` for the same fact — one
            // component, one colour, one spelling, and this was the surface that
            // had opted out of it. It is not a second copy of the group heading:
            // a single-engine machine draws no heading at all (`bare`), and this
            // is where the row says what it belongs to.
            + '<div class="pobody muted small">' + window.AFEngine.badge(a.engine)
            + (a.capturedAt ? ' · captured ' + esc(age(a.capturedAt, DATA.now)) : '')
            // X-206 — the age of the FIGURE, which is the one the reader is
            // deciding on. It sits next to the age of the account deliberately:
            // seeing "captured 6d ago · read 4h ago" is what tells somebody the
            // percentage above is stale without them having to wonder.
            + ' · ' + esc(readAge)
            + ' · ' + esc(a.id)
            // ‼️ X-215 — ONE SUBJECT: the note explains a SILENCE here, and a
            // figure inside the panel above. It used to be printed in both, and
            // the engine that reads its quota off its own transcripts carries a
            // two-sentence note — which would have run along the card's footer.
            + (!read && a.note ? ' · ' + esc(a.note) : '') + '</div></div>';
    }

    /**
     * ‼️ X-206 — ONE ENGINE, ONE GROUP. A flat list mixes two questions: a
     * Claude account and a Codex account are never alternatives to each other,
     * so a column that alternates between them makes the reader filter by eye
     * before they can compare anything (ONE SUBJECT). Grouped, the comparison
     * that matters — *which of MY Claude sign-ins has room* — is a glance.
     *
     * The group heading carries the group's own gesture: read every account of
     * this engine, in a line. That is the press somebody actually makes before
     * switching, and putting it anywhere else would make them press N buttons.
     */
    function accountGroupsHtml(list) {
        const T = window.AFTip;
        const order = [];
        const byEngine = {};
        for (const a of list) {
            if (!byEngine[a.engine]) { byEngine[a.engine] = []; order.push(a.engine); }
            byEngine[a.engine].push(a);
        }
        // One engine and nothing to compare across: a heading that says
        // "Claude Code accounts" above the only group is a line of furniture.
        const bare = order.length < 2;
        return order.map(function (eng) {
            const rows = byEngine[eng];
            const readable = rows.filter(a => a.usageState !== 'no-source');
            const head = bare && !readable.length ? '' : '<div class="acgrp">'
                + (bare ? '' : '<span class="acgrpn">' + esc(engineLabel(eng)) + '</span>')
                + '<span class="acgrpc muted small">' + rows.length
                + (rows.length === 1 ? ' account' : ' accounts') + '</span>'
                + '<span class="grow"></span>'
                // ‼️ X-215 — A GROUP THAT MAKES NO REQUEST IS NOT A LINE. The
                // sentence below is about pacing an endpoint; on an engine whose
                // figures are files under each account's own folder there is
                // nothing to pace, and promising a queue would describe a wait
                // that never happens.
                + (readable.length > 1
                    ? T.wrap('<button class="secondary small" data-acrefreshall="' + esc(eng) + '">⟳ all</button>',
                        'Read all ' + readable.length + ' ' + engineLabel(eng) + ' figures',
                        readable[0].quotaSource === 'session-tail'
                            ? 'This engine writes what the service told it into its own transcripts, so all '
                            + readable.length + ' are read straight off this disk — no requests, no line, no '
                            + 'waiting. Each figure is as old as that account\'s last turn.'
                            : 'They go into one line and are read ONE AT A TIME, five seconds apart — N accounts '
                            + 'are still N requests, and the spacing is the only thing that keeps asking how '
                            + 'much is left from becoming what spends it.\n\n'
                            + 'Each card shows its place in the line while it waits, and pressing a waiting '
                            + 'card takes it back out.')
                    : '')
                + '</div>';
            return head + rows.map(accountCardHtml).join('');
        }).join('');
    }

    /**
     * ‼️ X-218 — THE PRESS ABOVE THE GROUPS, AND THE TWO COSTS UNDER IT.
     *
     * Every engine already had its own group-wide read; the one thing missing
     * was the press that does not ask which engine — "read all of them". The
     * trap the item names is that the halves do not cost the same thing: a
     * Claude figure is a REQUEST against a budget the whole fleet shares, a
     * Codex figure is a file under that account's own folder. `queueAccountRefresh`
     * already keeps them apart (X-215) — the file reads never join the line at
     * all — so this button hands over EVERY readable slot and spends its
     * sentence saying which half of the press waits and which half does not.
     *
     * ‼️ AND IT IS NOT DRAWN WHERE IT WOULD BE THE BUTTON BELOW IT, TWICE. With
     * one engine on the machine "all engines" and "all Claude Code accounts"
     * are the same press; a control whose only distinction is its position is
     * furniture.
     *
     * ‼️ THE LINE IS DRAWN MOVING. A card knows its own place (X-206); the
     * section knows how much of the line is left, because a press that acts
     * over half a minute with nothing changing is a press nobody repeats once
     * and everybody repeats five times.
     */
    function allEnginesRefreshHtml(list) {
        const T = window.AFTip;
        const readable = list.filter(a => a.usageState !== 'no-source');
        const engines = [];
        for (const a of readable) { if (engines.indexOf(a.engine) < 0) { engines.push(a.engine); } }
        if (engines.length < 2) { return ''; }
        const disk = readable.filter(a => a.quotaSource === 'session-tail');
        const net = readable.filter(a => a.quotaSource !== 'session-tail');
        const reading = readable.filter(a => a.queue === 'reading').length;
        const queued = readable.filter(a => a.queue === 'queued').length;
        const inLine = reading + queued;
        const moving = [];
        if (reading) { moving.push(reading + ' being read'); }
        if (queued) { moving.push(queued + ' still waiting'); }
        const paced = 'Each card shows its place in the line while it waits, and pressing a waiting '
            + 'card takes it back out.';
        const cost = !net.length
            ? 'All ' + disk.length + ' are files under their own account\'s folder and land at once — no '
            + 'request, no line, no waiting. Each figure is as old as that account\'s last turn.'
            : !disk.length
                ? 'They go into one line and are read ONE AT A TIME, five seconds apart — ' + net.length
                + ' accounts are still ' + net.length + ' requests, and the spacing is the only thing '
                + 'that keeps asking how much is left from becoming what spends it.\n\n' + paced
                : disk.length + ' of them are files under their own account\'s folder and land at once; '
                + 'the other ' + net.length + ' go into one line, one every five seconds — pressing this '
                + 'is still ' + net.length + ' requests, and the spacing is the only thing that keeps '
                + 'asking how much is left from becoming what spends it. The files are never held behind '
                + 'them.\n\n' + paced;
        return T.wrap('<button class="secondary small" data-acrefreshall="">'
            + (inLine ? '◍ ' + inLine + ' in the line' : '⟳ all engines') + '</button>',
            inLine
                ? inLine + ' in the line — ' + moving.join(', ')
                : 'Read every account on this machine — all ' + readable.length + ' of them',
            cost);
    }

    /**
     * ‼️ X-172 — THE SIGN-INS THIS MACHINE HOLDS, AND THE THREE GESTURES.
     *
     * The chip slice made the page SAY which account each engine is plugged
     * into and left every gesture on the bridge. A page that shows a state it
     * cannot change is the same dead end this page was built to remove — "not
     * configured" with nothing attached to it, in a new costume.
     *
     * ‼️ CAPTURE IS OFFERED ONLY WHERE IT CAN WORK. Three of the five engines
     * have no verified way to keep two identities apart, so a picker listing
     * them would offer a gesture whose only outcome is a refusal. They are not
     * hidden either — they say WHY, in the adapter's own words, because "it is
     * not in the list" is the answer that sends somebody looking for a setting.
     */
    function accountsHtml() {
        const T = window.AFTip;
        const list = DATA.accounts || [];
        const engines = DATA.accountEngines || [];
        const can = engines.filter(e => e.canCapture);
        const cannot = engines.filter(e => !e.canCapture);
        const form = can.length
            ? '<div class="poform">'
            + T.wrap('<select id="ac-engine">'
                + can.map(e => C.option(e.engine,
                    engineLabel(e.engine) + (e.support === 'declared' ? ' (unproven here)' : ''),
                    { detail: (e.variable || 'no variable') + ' · ' + e.support + '\n\n' + (e.why || '') })).join('')
                + '</select>', 'Whose sign-in is being sealed',
                can.map(e => engineLabel(e.engine) + ' — ' + (e.variable || 'no variable') + ' · ' + e.support
                    + '\n' + e.why).join('\n\n'))
            + T.wrap('<input id="ac-label" placeholder="what to call it">', 'A name for this account',
                'Free to change at any time, and free to leave empty — the address the engine reports is '
                + 'the fallback. It is not the id: the id is minted from the address and cannot change, '
                + 'because the directory is named after it.')
            + T.wrap('<button class="small" data-accapture="1" id="ac-add">Capture this sign-in</button>',
                'Seal the sign-in that is on this disk right now',
                'It opens no browser and signs nobody in: you sign in normally once, and this reads the '
                + 'address and plan off the disk, copies the identity files into a directory of their own, '
                + 'and links the session records back at the one root Agent Farm indexes — so history, '
                + 'resume and cost keep working. Capturing is a COPY: the account being sealed stays '
                + 'signed in and any session running as it is untouched.\n\n'
                + 'It does NOT become the standing choice. The next session opens on whatever is standing '
                + 'now, and the new card is where you change that.')
            + '</div>'
            : '';
        return '<div class="posec">'
            + '<div class="posech">'
            + '<h3 class="potitle">Accounts</h3>'
            + '<span class="grow"></span>'
            + allEnginesRefreshHtml(list)
            + '</div>'
            + '<p class="englede">More than one sign-in of the same engine, without signing in and out. '
            + '<b>An account is a config directory, not a copied credential:</b> starting a session with '
            + 'one set points the engine at that directory through its own variable, so the session you '
            + 'are talking to right now is never touched and two accounts can run at once. '
            + '<b>The main sign-in — the identity this machine is logged in as — is the ABSENCE of a '
            + 'choice rather than a row:</b> nothing is injected for it, and that is what every session '
            + 'did before accounts existed. <b>No credential is on this page in either direction</b>; an '
            + 'account here is an address, a plan, a health verdict and a percentage.</p>'
            + form
            + '<div class="pomsg" id="ac-msg">' + esc(acctMsg) + '</div>'
            + (list.length
                ? accountGroupsHtml(list)
                : '<div class="muted small">No sign-in has been sealed on this machine yet. Every session '
                + 'runs as the main account — which is the ordinary answer, not a fault.</div>')
            + (cannot.length
                ? '<div class="acwhy muted small">No second sign-in on '
                + cannot.map(e => T.wrap('<b>' + esc(engineLabel(e.engine)) + '</b>',
                    engineLabel(e.engine) + ' cannot hold a second sign-in', e.why)).join(', ')
                + ' — hover for what each one was found to do instead.</div>'
                : '')
            + '</div>';
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
                .acbad { cursor:help; }
                .acbad.ok { background:transparent; color:var(--vscode-descriptionForeground,#9d9d9d);
                    border-color:var(--vscode-widget-border,#4446); }
                .acbad.warn { background:var(--vscode-charts-yellow,#d7ba7d); color:#000;
                    border-color:transparent; }
                .acbad.bad { background:var(--vscode-charts-red,#f14c4c); color:#fff;
                    border-color:transparent; }
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
                .acwinw { display:block; }
                .acwt { display:flex; justify-content:space-between; align-items:baseline;
                    gap:8px; font-size:12px; }
                .acsub, .acnone { font-size:11px; opacity:.7; margin-top:3px; }
                .acnone { margin-top:6px; font-size:12px; }
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
            ${providersHtml()}`;
        wire();
    }

    function wire() {
        window.AFHeader.wire({ onRefresh: () => post({ type: 'refresh' }) });
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
        /* ---- X-172 — the accounts. The page names an account and an engine;
           WHICH files move, whether it is allowed at all and what it costs is
           the host's, through the very functions the bridge ops call. */
        document.querySelectorAll('[data-acuse]').forEach(b =>
            b.addEventListener('click', () => post({
                type: 'accountActivate', id: b.dataset.acuse, engine: b.dataset.acengine })));
        // The way BACK: the main sign-in is the absence of a slot, so it is
        // named by its ENGINE and clears rather than choosing.
        document.querySelectorAll('[data-acmain]').forEach(b =>
            b.addEventListener('click', () => post({
                type: 'accountActivate', id: '', engine: b.dataset.acmain })));
        // X-206 — one id is a TOGGLE: press a waiting card again and it leaves
        // the line. The page names slots and never counts requests or intervals.
        document.querySelectorAll('[data-acrefresh]').forEach(b =>
            b.addEventListener('click', () => post({
                type: 'accountRefresh', ids: [b.dataset.acrefresh], gesture: 'toggle' })));
        // X-218 — an EMPTY engine is the section-wide press, and it means here
        // exactly what it already means on the other side of the bridge:
        // `refreshableSlots('')` is every readable slot, whatever engine it is.
        document.querySelectorAll('[data-acrefreshall]').forEach(b =>
            b.addEventListener('click', () => post({
                type: 'accountRefresh', gesture: 'all',
                ids: (DATA.accounts || [])
                    .filter(a => (!b.dataset.acrefreshall || a.engine === b.dataset.acrefreshall)
                        && a.usageState !== 'no-source')
                    .map(a => a.id) })));
        // X-219 — the page names a ROW and nothing else: whether that sign-in
        // may be renewed at all, with which command and in which directory, is
        // decided in the one place `accounts.reauth` calls.
        document.querySelectorAll('[data-acreauth]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'accountReauth', id: b.dataset.acreauth })));
        document.querySelectorAll('[data-acforget]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'accountForget', id: b.dataset.acforget })));
        document.querySelectorAll('[data-accapture]').forEach(b =>
            b.addEventListener('click', () => post({
                type: 'accountCapture', engine: val('ac-engine'), label: val('ac-label') })));
        document.querySelectorAll('[data-pokey]').forEach(b =>
            b.addEventListener('click', () => post({
                type: 'providerKey', id: b.dataset.pokey, label: b.dataset.polabel })));
        document.querySelectorAll('[data-pocopy]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'providerCopy', id: b.dataset.pocopy })));
        document.querySelectorAll('[data-porm]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'providerRemove', id: b.dataset.porm })));
    }

    render();
})();
