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
        // ‼️ audit B-04.3 — and the fallback that used to live here is gone,
        // because it lived in six places and only this copy was right. The HOST
        // names the window now (`windowNameOf`, src/core/accountUsage.ts) — an
        // engine that named none is on the five-hour window, except an UNREAD
        // disk-backed row, whose window's length is in the reading it has not
        // had, so "five-hour" would be the one claim certainly wrong about it.
        const winName = a.window || '';
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
                    T.GAP,
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
                    T.GAP,
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
         * ‼️ X-252 — AND WHAT WAS SPENT TO GET THERE, under the window it was
         * spent out of.
         *
         * The bar above answers "how close is the wall". It has never answered
         * "what did this sign-in cost today", and on a machine rotating five of
         * them that is the question the whole arrangement exists for — 97% says
         * nothing about whether it was one expensive turn or two hundred cheap
         * ones. DENSITY: the reader does not leave the page for it.
         *
         * ‼️ THREE THINGS THIS LINE REFUSES TO DO, each of which would be the
         * easy version: it does not print a confident $0.00 for an engine that
         * states no price (X-19), it does not claim a run this farm did not
         * start (no manifest, no attribution — X-251), and it does not slice a
         * conversation that crossed midnight by a ratio nobody measured. Each
         * refusal is a COUNT on the row's panel rather than a silence.
         */
        const N = window.AFCharts;
        const sp = a.spentToday;
        const allUnpriced = sp && sp.sessions > 0 && sp.unpriced === sp.sessions;
        const spendRow = (function () {
            // ‼️ AN ABSENT FIELD IS NOT A QUIET DAY — the same distinction the
            // percentage above makes between -1 and 0%. A host that does not
            // send this (the bridge's row, an older build) has not measured
            // anything, and drawing "nothing ran here" for it would be this
            // card stating a fact nobody established. No line at all is the
            // honest answer, and it is visibly different from a line saying zero.
            if (!sp) { return ''; }
            if (!sp.sessions && !sp.unsplit) {
                return T.wrap('<div class="acspend none">today — nothing ran here</div>',
                    'Nothing ran on this sign-in today',
                    'Not the same as a day that cost nothing: no run was attributed to this '
                    + 'account at all. The figure above is the plan window, which can still be '
                    + 'part-used by yesterday\'s work.');
            }
            var bits = [];
            if (!allUnpriced) { bits.push(N.fmtUSD(sp.cost)); }
            if (sp.wTokens > 0) { bits.push('⚖ ' + N.fmtTok(Math.round(sp.wTokens))); }
            bits.push(sp.sessions + ' run' + (sp.sessions === 1 ? '' : 's'));
            if (allUnpriced) { bits.push('no price stated'); }
            return T.wrap('<div class="acspend">today ' + esc(bits.join(' · ')) + '</div>',
                'Spent today on ' + (a.label || a.id),
                T.lines([
                    allUnpriced ? 'cost: not stated by this engine' : 'cost: ' + N.fmtUSD(sp.cost),
                    'weighted tokens: ' + N.fmtTok(Math.round(sp.wTokens)),
                    'runs attributed: ' + sp.sessions,
                    T.GAP,
                    'Each run is placed on this sign-in by its own launch manifest, which is the '
                    + 'only record of which account a spawn was sealed on. A session this farm '
                    + 'did not start carries no manifest and is counted nowhere rather than being '
                    + 'put on whichever account the machine happens to hold.',
                    sp.unpriced
                        ? sp.unpriced + ' of them ran on an engine that publishes no price, so the '
                        + 'money here is not the whole day — that is a missing figure, not a zero.'
                        : '',
                    sp.unsplit
                        ? sp.unsplit + ' run' + (sp.unsplit === 1 ? '' : 's') + ' crossed midnight on '
                        + 'an engine that writes no per-day figures, so ' + (sp.unsplit === 1 ? 'it is' : 'they are')
                        + ' left out of today rather than cut by a ratio nobody measured.'
                        : '',
                    T.GAP,
                    'This is SPEND. The bar above is the PLAN WINDOW. They move together and they '
                    + 'are not the same measure: a plan can be most of the way gone on work that '
                    + 'was never billed a dollar.'
                ]), 'acspendw');
        })();
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
        /**
         * X-255 -- AND THE CHIP SAYS WHOSE ANSWER IT IS.
         *
         * This control is the MACHINE's standing choice. An agent that names a
         * sign-in of its own outranks it, so on a fleet where some do, a press
         * here does nothing visible for those agents -- exactly the silent no-op
         * Principle 1 is about. The sentence is drawn from the real count rather
         * than written as a caveat, so a machine where nobody has pinned an
         * agent reads no warning at all.
         */
        const pinned = a.pinnedAgents || 0;
        const notFollowing = pinned
            ? '\n\nThis is the MACHINE-wide answer, and ' + pinned + ' agent'
                + (pinned === 1 ? '' : 's') + ' on ' + engineLabel(a.engine)
                + ' name a sign-in of their own -- theirs outranks this, so pressing it does not '
                + 'move them. Their box is on the agent’s row in Farm Settings.'
            : '';
        const stand = a.active
            ? T.wrap('<button class="acsel on" role="radio" aria-checked="true" '
                + 'data-acmain="' + esc(a.engine) + '">🟢 standing</button>',
                'Standing — every new ' + engineLabel(a.engine) + ' session opens as ' + (a.label || a.id)
                + (pinned ? ', unless the agent names its own' : ''),
                'Pressing it hands the engine back to the main sign-in — the identity this machine '
                + 'is logged in as, for which nothing is injected at all. Either way nothing already '
                + 'running moves: an account is fixed for a session the way a route is.' + notFollowing)
            : T.wrap('<button class="acsel" role="radio" aria-checked="false" '
                + 'data-acuse="' + esc(a.id) + '" data-acengine="' + esc(a.engine) + '">⚡ Use this one</button>',
                'Make ' + (a.label || a.id) + ' the machine’s standing account',
                'Every new ' + engineLabel(a.engine) + ' session would then open as it. The one standing '
                + 'now goes off in the same act: one engine, one standing account.\n\n'
                + 'Nothing already running moves — starting on another account means starting another '
                + 'session. What this sets is not remembered per SESSION: an account is a state (how '
                + 'much of a plan is left, which changes hourly), not a preference, so a launch that '
                + 'names its own account still wins.' + notFollowing);
        /**
         * X-255 -- WHO STANDS ON THIS ONE, on the card rather than a page away.
         *
         * ONE SUBJECT: the chip above is the machine's answer, this line is the
         * agents'. DENSITY -- the reader is looking at this card to decide
         * whether to spend this plan, and "developer always runs here" is the
         * fact that decides it.
         */
        /**
         * X-258 -- WHO IS ON IT NOW, which is the first thing asked of a card in
         * a live rotation cockpit and was not on the page at all.
         *
         * SHORTHAND: the row carries the shortest unambiguous form (the seat id
         * and the agent), and the panel carries the meaning. The two sources are
         * kept apart in the wording on purpose -- a seat is something this window
         * can steer, and "another process" is something it can only SEE.
         */
        const onIt = a.onIt || { seats: [], others: 0 };
        const busyBits = (onIt.seats || []).map(s => s.seat + ' · ' + s.who);
        if (onIt.others) {
            busyBits.push(onIt.others + ' other' + (onIt.others === 1 ? '' : 's'));
        }
        const busy = busyBits.length
            ? T.wrap('<span class="acbusy">● ' + esc(busyBits.join(', ')) + '</span>',
                'On this sign-in right now',
                ((onIt.seats || []).length
                    ? 'Console seats this window hosts: '
                        + (onIt.seats || []).map(s => s.seat + ' (' + s.who + ')').join(', ')
                        + '. Each one was resolved to this account when it started, and an account is '
                        + 'fixed for a session the way a route is — nothing moves by pressing anything here.'
                    : 'No Console seat in this window is on it.')
                + (onIt.others
                    ? '\n\n' + onIt.others + ' more live process' + (onIt.others === 1 ? ' is' : 'es are')
                        + ' signed in as this account and NOT hosted here — read out of the engine’s own '
                        + 'registry inside this slot’s directory, one file per running process. That is the '
                        + 'whole honest claim: the registry says a process is alive on this sign-in, not what '
                        + 'it is. A terminal, another window, or somebody else’s SDK all look the same there.'
                    : ''))
            : '';
        /**
         * X-258 -- AND WHO IS NEXT. The order is DRAWN, never recomputed: the
         * host reads `accountOrder`, whose head is the `pickAccount` the rotation
         * really calls, so this cannot describe a rotation the product does not
         * perform.
         *
         * SHORTHAND + MIRROR: the chip is the short form and its panel opens with
         * the long one. An account at the ceiling gets NO chip rather than a last
         * place -- the rotation will never reach it, and drawing it as last would
         * offer a turn nobody is going to give it.
         */
        const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
        const ln = a.line;
        const rota = ln
            ? T.wrap('<span class="acrota' + (ln.place === 1 ? ' on' : '') + '">\u{1F501} '
                + esc(ln.place === 1 ? 'next' : (ORD[ln.place] || ln.place + 'th')) + '</span>',
                ln.place === 1 ? 'Next in the rotation' : (ORD[ln.place] || ln.place + 'th') + ' in the rotation',
                'Of ' + ln.of + ' ' + engineLabel(a.engine) + ' sign-in' + (ln.of === 1 ? '' : 's')
                + ' the rotation can still use, this one is '
                + (ln.place === 1 ? 'the one it would take next' : 'number ' + ln.place) + '.\n\n'
                + 'This is DRAWN from the rotation itself, not worked out for this page: a measured '
                + 'account beats an unread one and the emptiest measured one leads, which is the rule '
                + 'a handover follows when a run meets a wall. A sign-in at or past its ceiling is not '
                + 'in this line at all — it is out, not last.\n\n'
                + '‼️ Not the same line as the ⟳ button beside it: that one is the READING queue, '
                + 'which is only about when a figure gets refreshed.')
            : '';
        const standingBy = (a.standingAgents || []).length
            ? T.wrap('<span class="acpin">📌 ' + esc((a.standingAgents || []).join(', ')) + '</span>',
                'Stands on this account',
                (a.standingAgents || []).length === 1
                    ? (a.standingAgents || [])[0] + ' names this sign-in on its own row in Farm '
                        + 'Settings, so every session of it opens here whatever the machine-wide '
                        + 'standing choice says. Clear the box on that row to hand it back.'
                    : 'These agents name this sign-in on their own rows in Farm Settings, so their '
                        + 'sessions open here whatever the machine-wide standing choice says. Clear '
                        + 'the box on a row to hand that agent back.')
            : '';
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
        /**
         * ‼️ X-269 — WHICH SYSTEM PROMPT A SESSION ON THIS ACCOUNT WOULD GET.
         *
         * The fleet's standing decision is the FULL prompt, and the only way to
         * it is one `env` key in the settings file the engine reads — which for
         * a captured account is the file inside its own directory. Measured
         * 2026-09-12: not one slot on this machine carried it, so every session
         * started under an account had run on the simplified prompt for months
         * and nothing on any surface could have told anyone. So the card states
         * it either way: `full` is the quiet ordinary case, `simple` is a fault
         * with the press that repairs it beside it (Principle 1).
         */
        const gaps = (a.settingsGaps || []);
        // ‼️ AND SILENCE WHERE THERE IS NO PROMISE. An empty gap list is two
        // answers — nothing missing, and nothing ever promised — so an engine
        // with no contract draws no badge rather than the word `full`, which
        // would be this page inventing a guarantee on its behalf.
        const promptBadge = !a.settingsGuarantee ? '' : T.wrap(
            '<span class="acbad ' + (gaps.length ? 'warn' : 'ok') + '">'
            + (gaps.length ? 'simple' : 'full') + '</span>',
            'system prompt: ' + (gaps.length ? 'SIMPLIFIED' : 'full'),
            gaps.length
                ? 'A session started on this account would run on Anthropic\'s SIMPLIFIED system '
                + 'prompt, because its own settings file is not carrying ' + esc(gaps.join(', ')) + '.\n\n'
                + 'The variable is read when the process STARTS, so a session already running cannot '
                + 'be fixed — only the next one. Agent Farm reproduces this file before every launch '
                + 'it makes, so this state means the file was changed by another hand since; the '
                + 'button beside it puts the fleet\'s own back.'
                : 'A session started on this account gets the full system prompt.\n\n'
                + 'This file is not kept — it is REPRODUCED out of the fleet\'s own settings before '
                + 'every launch, so your model, permission mode and live hooks travel with it and '
                + 'nothing here can go stale. Deleting the account takes no setting with it.');
        const fixSettings = gaps.length
            ? T.wrap('<button class="secondary small" data-acfix="' + esc(a.id) + '">Fix prompt</button>',
                'Reproduce this account\'s settings file from the fleet\'s own',
                'Writes the file the engine reads in this account\'s directory: your main settings as '
                + 'the base — model, permission mode, live hooks — with the fleet\'s guarantees over '
                + 'the top. It takes effect on the NEXT session started on this account; one that is '
                + 'already running read its prompt when it started.')
            : '';
        /**
         * ‼️ X-284 — AND WHETHER THIS SLOT IS WHOLE AT ALL.
         *
         * The badge beside this one answers ONE clause — which system prompt a
         * session would get — because that is a question the reader asks by
         * name. The other things a slot must carry (the pool links, the live
         * hooks) had the same shape of fault and no surface at all: copied in
         * once at capture and never asked about again. This is that list,
         * derived from the engine's own adapter, so the clause added tomorrow
         * draws itself here without anybody remembering to come back for it.
         *
         * ‼️ ONE SUBJECT — AND THE IDENTITY IS NOT THIS BADGE'S. `own:` clauses
         * are the sign-in itself, and the verdict badge on this row already
         * owns that fact with a panel of its own; drawing it twice would let
         * one row say `complete` and `needs signing in` in the same breath.
         * What is left is exactly what the FLEET puts into a slot — which is
         * also the half a press can put back.
         *
         * SHORTHAND: the count is the short form and the panel carries the
         * clauses by name — a card that says `3 missing` and stops has told the
         * reader they have a problem and nothing they can do about it.
         */
        const con = a.completeness || {};
        const conRows = (con.rows || []).filter(r => r.id.slice(0, 4) !== 'own:');
        const conGaps = conRows.filter(r => !r.ok);
        const conLines = rows => rows.map(r => '\u00b7 ' + esc(r.id) + ' \u2014 ' + esc(r.detail)).join('\n');
        const contractBadge = !conRows.length ? '' : T.wrap(
            '<span class="acbad ' + (conGaps.length ? 'warn' : 'ok') + '">'
            + (conGaps.length ? conGaps.length + ' missing' : 'complete') + '</span>',
            'birth contract: ' + (conGaps.length
                ? conGaps.length + ' of ' + conRows.length + ' things the fleet puts in this slot are absent'
                : 'all ' + conRows.length + ' things the fleet puts in this slot are here'),
            (conGaps.length ? 'MISSING\n' + conLines(conGaps) + '\n\n' : '')
            + 'A slot is an IDENTITY and nothing else. Everything a session behaves by belongs to '
            + 'the fleet and is either LINKED into the slot or reproduced into it before a launch, '
            + 'so deleting this folder and capturing the account again costs you a sign-in and '
            + 'nothing else — no setting, no permission, no session record.\n\n'
            + 'The sign-in itself is not counted here: that is what the verdict badge on this '
            + 'row says, and it is the one thing no press can put back.\n\n'
            + 'The list is derived from what this engine\'s adapter says a slot contains rather '
            + 'than written out by hand, and it is asked at every start, at capture and before '
            + 'every launch. The system-prompt badge beside this one is one of these clauses, '
            + 'named on its own because it is the one that changes what the model is told.\n\n'
            + 'PRESENT\n' + conLines(conRows.filter(r => r.ok)));
        /**
         * ‼️ X-292 — AND WHAT IT TOOK TO BE WHOLE, because the badge above is
         * true and tells the reader nothing. A slot repaired at every gate reads
         * `complete` at every gate: four junctions were re-made twice in one day
         * and the card said `complete` through all of it, so the only way anybody
         * learned the engine's own housekeeping was removing them was to go and
         * look at the disk by hand. A repair that succeeds silently hides what
         * breaks it (Principle 1), and this badge is where it stops being silent.
         *
         * SHORTHAND: the count on the badge, the clauses and the evidence in the
         * panel. Drawn only once a clause has been put back on this slot MORE
         * THAN ONCE (`compared > 0`) — a single repair is a migration, a capture
         * or a fresh clone, and badging that would cry wolf on every new account.
         */
        const reps = (con.repairs || []).filter(r => r.compared > 0);
        const repTotal = reps.reduce((n, r) => n + r.count, 0);
        const repairBadge = !reps.length ? '' : T.wrap(
            '<span class="acbad warn">↻' + repTotal + '</span>',
            'the contract has put something back on this slot ' + repTotal + ' times',
            reps.map(r => '· ' + esc(r.clause) + ' — ' + r.count + '×, last '
                + esc(age(r.last, DATA.now))
                + (r.afterHousekeeping === r.compared
                    ? ' — every repeat followed this engine’s own housekeeping'
                    : ' — ' + r.afterHousekeeping + ' of ' + r.compared
                    + ' repeats followed this engine’s own housekeeping')).join('\n')
            + '\n\nThe engine prunes its own scratch directories, and on a relocated config '
            + 'directory those are junctions: a recursive remove sees a junction as a link and '
            + 'unlinks it instead of walking into it. The pool survives, the slot loses the path, '
            + 'and the contract puts it back at the next gate — which is why the badge beside this '
            + 'one has never stopped saying complete.\n\n'
            + 'The attribution is counted, not assumed: each repeat is compared with the previous '
            + 'repair on THIS slot, and only a housekeeping stamp that moved in between is '
            + 'counted. A clause that keeps breaking for some other reason reads zero here.\n\n'
            + '`accounts.repairs` on the bridge has every row.');
        /**
         * ‼️ X-291 — AND WHAT THIS SLOT TAUGHT THE FLEET, which is the only leg
         * of the contract that runs the other way. A permission the user typed
         * at a terminal prompt inside a slot session is theirs, not that
         * account's; it is carried back at the next gate WITHOUT ASKING, by
         * their own decision. Automatic is not silent — an approval quietly
         * added to the user's own `~/.claude.json` with no surface saying so
         * would be the Principle 1 failure this whole family exists to end, so
         * the count is on the row and every path is in the panel.
         *
         * SHORTHAND: `↑N` is the short form, the panel opens with the long one.
         */
        const proms = con.promotions || [];
        const promTotal = proms.reduce((n, r) => n + r.added, 0);
        const promoteBadge = !promTotal ? '' : T.wrap(
            '<span class="acbad ok">↑' + promTotal + '</span>',
            'promoted to the fleet: ' + promTotal + ' thing'
            + (promTotal === 1 ? '' : 's') + ' this slot answered that the fleet now holds too',
            proms.map(r => '· ' + esc(r.path) + ' — ' + r.added + ' item'
                + (r.added === 1 ? '' : 's') + ', last ' + esc(age(r.last, DATA.now))
                + ' (' + esc(r.file) + ')').join('\n')
            + '\n\nA permission list is an ANSWER the user already gave, not a setting. Every other '
            + 'clause runs fleet → slot, so an approval typed inside a slot session used to be deleted '
            + 'at the next gate and the fleet never heard of it — switching account asked the same '
            + 'question again, for ever.\n\n'
            + 'Only permission lists travel this way: never a model, never a permission MODE, never an '
            + 'MCP server definition, and never a folder the main directory has not trusted itself. A '
            + 'permission you REVOKE in the main directory wins and is removed from the slot — the two '
            + 'are told apart by the value both sides agreed on at the previous gate, not guessed at.\n\n'
            + '`accounts.promotions` on the bridge has every row.');
        /**
         * ‼️ AND THE PRESS IS OFFERED ONLY WHERE IT WOULD DO SOMETHING. An
         * identity clause cannot be repaired in place — nothing can invent a
         * credential — so a slot missing only that one gets the sign-in key
         * beside it and no button whose whole effect would be to look busy.
         */
        const fixContract = conGaps.some(r => r.repairable)
            ? T.wrap('<button class="secondary small" data-accomplete="' + esc(a.id) + '">Complete</button>',
                'Put back everything this slot is missing',
                'Runs every repair the contract has, in one press: the behaviour file is reproduced '
                + 'from the fleet\'s own, the pool links are re-made over whatever is standing in '
                + 'their place, and the live hooks are brought up to date. It writes only what is '
                + 'missing, so pressing it on a whole slot costs a handful of reads and changes '
                + 'nothing.\n\nIt cannot restore an identity: if the sign-in itself is gone, use '
                + 'the key beside it.')
            : '';
        // ‼️ X-275 — AND A SIGN-IN WITH DAYS LEFT GETS THE KEY TOO. `health` is
        // still `ready` there on purpose (it works), but that is exactly the
        // week in which renewing costs nobody anything — and the panel beside
        // the badge tells the reader to press this, so hiding it until the
        // grant was already dead would have been the card pointing at a button
        // that is not there.
        const expiringSoon = (a.signin || {}).state === 'expiring';
        const reauth = a.health === 'ready' && !expiringSoon
            ? ''
            : T.wrap('<button class="secondary small acreauth" data-acreauth="' + esc(a.id) + '">🔑</button>',
                expiringSoon ? 'Renew this sign-in before it runs out' : 'Sign in again as ' + (a.label || a.id),
                (expiringSoon
                    ? 'This one still works, so nothing is broken and nothing is interrupted — which is the '
                    + 'whole reason to do it now rather than on the day a session opens as nobody.\n\n'
                    : '')
                + 'Opens a terminal whose environment points the engine at this account\'s own directory, '
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
        /**
         * ‼️ X-275 — A SIGN-IN THAT STILL WORKS AND WILL NOT FOR LONG IS ITS
         * OWN VERDICT, and the two facts the card could not state.
         *
         * `health` is the present tense and nothing else, so this row read
         * 🟢 ready right up to the hour its grant died and 🟠 the hour after,
         * with no warning in between. MEASURED 2026-09-14: a Claude refresh
         * token is issued for ~30 days, so there is a month of notice nobody
         * was being given.
         *
         * It keeps the `ok` colour DELIBERATELY — it does work right now, and
         * painting it the same amber as an expired one would be exactly the
         * identical-verdicts fault the note above this list was written about.
         * The days are the difference, and they are in the badge rather than
         * the panel because that is the only part a reader sees without
         * hovering.
         */
        const spanOf = (h) => h >= 48 ? Math.round(h / 24) + ' days'
            : h >= 2 ? h + ' hours' : 'under an hour';
        const dayOf = (ms) => ms
            ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
            : 'an unstated date';
        const sg = a.signin || {};
        /**
         * ‼️ AND THE HALF THE USER ACTUALLY HIT: renewing the sign-in on this
         * machine does not reach a slot, because a slot's credential is its
         * own. That is what keeping accounts apart MEANS — but it was invisible,
         * so a person signed in, saw the row unchanged, and read it as broken.
         * Said only where it is the reader's live confusion: this same account,
         * this row not working.
         */
        const liveNote = sg.liveIsSame && (sg.state === 'needs-signin' || sg.state === 'expiring')
            ? '\n\n‼️ The sign-in on this machine is THIS SAME account — and it does not reach this row. '
            + 'A slot carries its own credential: signing in through the browser or /login writes the '
            + 'machine\'s copy and leaves this one exactly as it was. Renew it HERE, with the 🔑 beside '
            + 'this, which opens the flow pointed at this account\'s own directory.\n\n'
            + 'Copying the machine\'s credential across is not offered on purpose: a refresh ROTATES the '
            + 'token, so one grant in two directories is two copies invalidating each other — this row '
            + 'would work until the machine\'s own install refreshed, then die again saying no more than '
            + 'it does now.'
            : '';
        const base = VERDICTS[a.health] || VERDICTS['unreadable'];
        const verdict = sg.state === 'expiring' && sg.hoursLeft >= 0
            ? ['ok', '🟡 ' + spanOf(sg.hoursLeft) + ' left', 'This sign-in works, and stops in ' + spanOf(sg.hoursLeft),
                'The credential refreshes today and will not after ' + dayOf(sg.refreshExpiresAt) + ': that is the '
                + 'REFRESH token\'s own expiry, the one clock here that needs a person. The access token beside it '
                + 'lasts hours and is renewed over HTTP without anybody noticing, which is why an unattended slot '
                + 'runs for weeks and then stops all at once.\n\nRenew it before then with the 🔑 beside this and '
                + 'nothing is ever interrupted; leave it and the first thing that notices will be a session opening '
                + 'as nobody.' + liveNote]
            : [base[0], base[1], base[2], base[3] + liveNote];
        const onDisk = a.quotaSource === 'session-tail';
        const refresh = a.quotaSource === 'none'
            ? ''
            /**
             * X-258 -- THE NUMBER ON THIS BUTTON IS NEVER BARE.
             *
             * It shows a place in the READING queue (X-206), and this page now
             * also draws a rotation order. A naked `2` on a page with two
             * orderings is read as the one the reader is thinking about -- it was
             * read that way in the audit that opened this item. The glyph the
             * idle state already uses travels with the digit, so the badge always
             * says WHICH line it is counting, and the panel's first line names
             * that line in full (SHORTHAND).
             */
            : T.wrap('<button class="acref ' + esc(q) + '" data-acrefresh="' + esc(a.id) + '">'
                + (q === 'reading' ? '◍' : q === 'queued' ? '⟳' + (a.queuePlace || '·') : '⟳') + '</button>',
                q === 'reading' ? 'Being read right now'
                    : q === 'queued' ? 'Reading queue — number ' + (a.queuePlace || 1) + ' in line for a refresh'
                        : 'Read this account\'s figure now',
                q === 'reading'
                    ? 'The request is already in flight, so it cannot be taken back — the figure lands in a moment.'
                    : q === 'queued'
                        ? '‼️ This is the queue for REFRESHING THE FIGURE, and nothing to do with whose turn '
                        + 'it is to run — the 🔁 chip beside it is the rotation.\n\n'
                        + 'One account is read every five seconds, in the order they were asked for. Press again '
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
            + (a.uuidShort
                ? T.wrap('<span class="poid acuuid">' + esc(a.uuidShort) + '</span>', 'account id: ' + esc(a.uuidShort),
                    'The provider\'s own id for this account, first eight characters. It is the key two '
                    + 'cards are compared by: the folder name never is (claude-x and claude-x-2 were one '
                    + 'account on this machine, twice).')
                : '')
            + (a.duplicateOf && a.duplicateOf.length
                ? T.wrap('<span class="acdup">duplicate</span>', 'Same account as ' + esc(a.duplicateOf.join(', ')),
                    'This folder and ' + esc(a.duplicateOf.join(', ')) + ' carry the same account id: one '
                    + 'sign-in, two folders, and the fleet counting two quotas where there is one. '
                    + 'Forget one of them — its session records are moved to the pool first, nothing is lost.')
                : '')
            + (a.plan ? '<span class="acplan">' + esc(a.plan) + '</span>' : '')
            + T.wrap('<span class="acbad ' + verdict[0] + '">' + esc(verdict[1]) + '</span>',
                verdict[2], verdict[3])
            + promptBadge
            + contractBadge
            + repairBadge
            + promoteBadge
            + busy
            + rota
            + standingBy
            + '<span class="grow"></span>'
            + fixSettings
            + fixContract
            + reauth
            + refresh
            + stand
            + T.wrap('<button class="secondary small" data-acforget="' + esc(a.id) + '">Forget</button>',
                'Forget this account — you are shown what goes and what stays, then asked',
                'The folder goes too, by default: a folder left behind is the orphan the next capture '
                + 'counts past (claude-x-2). It is safe because the slot is emptied into the session pool '
                + 'first, and if anything cannot be moved nothing is forgotten. A running session or task '
                + 'on this account refuses it. "Keep folder" is offered by name in the dialog. Local '
                + 'deletion is not revocation — the tokens stay in the agent repo\'s git history.')
            + '</div>'
            + window5
            + spendRow
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
                    + '\n' + e.why
                    + (e.wire ? '\nLive wire: ' + (e.wire.ok ? '' : '‼️ ') + e.wire.detail : '')).join('\n\n'))
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
                .acsub, .acnone { font-size:11px; opacity:.7; margin-top:3px; }
                .acnone { margin-top:6px; font-size:12px; }
                /* X-252 — the day's spend, on the card's own ruler under the
                   window block. A block wrapper for the same reason .acwinw is
                   one. It is deliberately quieter than the percentage: the bar
                   is what a rotation is decided on, this is what it cost. */
                .acspend { margin-top:5px; max-width:420px; font-size:11px; opacity:.85;
                    font-variant-numeric:tabular-nums; }
                .acspend.none { opacity:.55; }
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
        // X-269 — the page names a ROW; what the file must carry and where it
        // comes from is decided in the one place `accounts.repairSettings` calls.
        document.querySelectorAll('[data-acfix]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'accountFixSettings', id: b.dataset.acfix })));
        // ‼️ X-284 — the umbrella press. Same host function as the bridge's
        // `accounts.complete`, so the button and the op can never drift apart.
        document.querySelectorAll('[data-accomplete]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'accountComplete', id: b.dataset.accomplete })));
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
