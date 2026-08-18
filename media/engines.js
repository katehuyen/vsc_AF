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

    window.addEventListener('message', ev => {
        const m = ev.data;
        if (m.type === 'data') { DATA = m.data; testing.clear(); render(); return; }
        if (m.type === 'eng-testing') { testing.add(m.id); render(); return; }
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
            ${list.map(cardHtml).join('')}`;
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
    }

    render();
})();
