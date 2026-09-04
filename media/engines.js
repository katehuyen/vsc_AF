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
        // ‼️ THE WALL TIME AND THE WAIT, because they answer different
        // questions — "can I start something now" and "is it worth waiting".
        // `AFTime.ago` is deliberately not used: it is written for the PAST and
        // a reset is in the future, so it would print "37m ago" about a window
        // that has not turned over yet.
        const turns = (a) => {
            if (!a.resetsAt) { return ''; }
            const mins = Math.max(0, Math.round((a.resetsAt - Date.now()) / 60000));
            const wait = mins < 60 ? mins + 'm' : Math.round(mins / 60) + 'h';
            return 'window turns over at ' + window.AFTime.clock(a.resetsAt) + ' (in ' + wait + ')';
        };
        const lines = mine.map(a =>
            (a.active ? '→ ' : '   ') + (a.label || a.id)
            + (a.email && a.email !== a.label ? ' · ' + a.email : '')
            + (a.health === 'ready' ? '' : ' · needs signing in again')
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
                /* X-100 — providers */
                .posec { margin-top:22px; border-top:1px solid var(--vscode-widget-border,#4443); padding-top:14px; }
                .potitle { font-size:14px; margin:0 0 8px; }
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
