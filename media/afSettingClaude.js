// Agent Farm — Farm Settings: the Claude Code settings section, the Engines section and the setting sets bar.
// Split out of media/settings.js unchanged (U-225): the page hands its state in once, as X.
(function () {
    'use strict';
    let X, C, errors, sectionMatches;

    // ---- Claude Code (claude CLI) settings — curated + raw JSON ----

    function ccControl(it) {
        const id = `cc-${it.id}`;
        if (it.kind === 'flag' || it.kind === 'boolean') {
            const on = it.kind === 'flag' ? String(it.value) === '1' : it.value === true;
            return `<input type="checkbox" id="${id}" data-ccset="${it.id}"${on ? ' checked' : ''}>`;
        }
        if (it.kind === 'enum') {
            return `<select id="${id}" data-ccset="${it.id}">
                ${C.option('', '(not set — Claude default)', {
                selected: !it.set,
                detail: `${it.id} is left out of the config and Claude Code decides it.`
            })}
                ${it.enum.map(o => C.option(o, o, {
                selected: String(it.value) === o,
                detail: String(it.default ?? '') === o ? `The value Claude Code uses when ${it.id} is not set.` : ''
            })).join('')}
            </select>`;
        }
        const t = it.kind === 'number' ? 'number' : 'text';
        return `<input type="${t}" id="${id}" data-ccset="${it.id}" value="${C.esc(it.set ? String(it.value) : '')}"
            placeholder="(not set — Claude default)" style="width:${t === 'number' ? '130px' : '100%'}; max-width:420px">`;
    }

    function ccItemHtml(it) {
        const err = errors['cc:' + it.id];
        return `<div class="setitem${it.set ? ' modified' : ''}" data-item="cc:${it.id}"
            title="${C.esc(it.label)} — not set = Claude Code's own default">
            <div class="sethead">
                <span class="setname">${C.esc(it.label)}</span>
                ${it.set ? `<span class="moddot" title="Set in settings.json"></span>
                    <button class="reset" data-ccclear="${it.id}" title="Remove from settings.json — Claude's own default takes over">↺</button>` : ''}
            </div>
            <div class="setdesc">${C.esc(it.description)}</div>
            <div class="setctl">${ccControl(it)}</div>
            ${err ? `<div class="seterr">⚠ ${C.esc(err)}</div>` : ''}
        </div>`;
    }

    function claudeSection() {
        const cc = X.DATA.claude;
        if (!cc) { return ''; }
        const ccq = window.AFQuery.compile(X.filter);
        const items = cc.items.filter(it => ccq.test(it.label + ' ' + it.description));
        if (X.filter && !items.length) { return ''; }
        const rawErr = errors['cc:__raw__'];
        return `
            <h2 class="cat" id="cat-claude">Claude Code (claude CLI) <span class="muted small">${items.length}</span></h2>
            <p class="muted small" style="max-width:760px">These are <b>claude's own settings</b>, not Agent Farm's — the file behind terminal tips like
            “Set CLAUDE_CODE_USE_POWERSHELL_TOOL=1 …”. Edits write to <code>${C.esc(cc.file)}</code>
            (a one-time <code>.agentfarm-backup</code> copy is kept next to it) and apply to <b>new</b> claude sessions.
            <a id="ccopen">Open the file</a></p>
            ${cc.parseError ? `<div class="seterr">⚠ settings.json could not be parsed (${C.esc(cc.parseError)}) — fix it in the raw editor below; edits are blocked until then.</div>` : ''}
            ${items.map(ccItemHtml).join('')}
            <details class="setitem" id="ccrawbox" style="margin-top:10px">
                <summary style="cursor:pointer">Raw settings.json — everything else (hooks, statusLine, permissions lists…)</summary>
                <div class="setdesc">Full contents of the file. Validated before writing — broken JSON is rejected, never saved.</div>
                <textarea id="ccraw" rows="${Math.min(18, Math.max(4, String(cc.raw).split('\n').length))}" spellcheck="false"
                    style="width:100%; font-family:var(--vscode-editor-font-family); font-size:11px">${C.esc(cc.raw)}</textarea>
                <button class="secondary small" id="ccrawapply">Apply raw JSON</button>
                ${rawErr ? `<div class="seterr">⚠ ${C.esc(rawErr)}</div>` : ''}
            </details>`;
    }

    /**
     * ‼️ X-3 — THE SECTION THAT ANSWERS "WHY CAN I NOT RUN THAT ONE HERE".
     *
     * Everything the extension used to say about a non-Claude engine was a row
     * in the secret vault, and the vault is a flat name→value table that knows
     * nothing about engines. So the question had no surface at all: the answer
     * was Ctrl+Shift+P → Set Secret and a guess about which name to type.
     *
     * The fix is not a better key box. TWO OF THE THREE ENGINES ARE PAID FOR BY
     * A SUBSCRIPTION, NOT A KEY — Claude Code with a Pro/Max plan, Codex with a
     * ChatGPT plan — so a screen built around keys is a screen built around the
     * exception. Each row therefore states, in this order: is the CLI here, how
     * is it paid for, is it signed in, and the ONE thing to do next. The key
     * box is offered where a key is genuinely the route, and named exactly
     * (`OPENAI_API_KEY`), because half the difficulty was never knowing which
     * name the engine reads. See src/core/engines.ts.
     */
    const ENGINE_TERMS = 'engine engines model models cli api key apikey login sign in '
        + 'subscription plan auth credentials secret vault';

    /**
     * ‼️ U-143 — THE ENGINE NAMES COME FROM THE DATA, NEVER FROM A HAND-TYPED
     * LIST. `ENGINE_TERMS` used to spell out claude, codex, openai, gemini,
     * antigravity and google, and had therefore never heard of `opencode`: the
     * one engine added after somebody typed that string was the one engine you
     * could not search for, and nothing said so. Each row already carries its
     * own id, its label and the command you type — that is the search text.
     */
    function engineWords(list) {
        return list.map(e => [e.id, e.label, e.cli && e.cli.command].filter(Boolean).join(' ')).join(' ');
    }

    function engineRow(e) {
        const T = window.AFTip;
        // ‼️ U-59 — the SAME decision the Engines page draws, from `afEngine.js`.
        // This was a second copy of the rule and it is how OpenCode's row said
        // "not signed in" here while the Engines page had been taught otherwise.
        const b = window.AFEngine.authBadge(e);
        const tone = b.tone;
        const badge = b.text;
        // Figures on the hover, the way a column's own tooltip works elsewhere:
        // where it was read from, when, and what the alternative route is.
        const facts = T.lines([
            `Command: ${e.cli.command}${e.cli.path ? ' — ' + e.cli.path : ' — not on PATH'}`,
            // ‼️ "nothing set up" is a complaint, and on `builtin` there is
            // nothing TO set up — the engine's own provider is free (U-59).
            `Billing: ${e.auth.mode === 'subscription' ? 'a plan'
                : e.auth.mode === 'apikey' ? 'per token'
                    : e.auth.mode === 'builtin' ? 'free — its own provider, no credential' : 'nothing set up'}`,
            e.auth.file ? `Read from: ~/${e.auth.file}` : '',
            e.auth.refreshedAt ? `Last refreshed: ${new Date(e.auth.refreshedAt).toLocaleString()}` : '',
            // An engine with no key route says so rather than naming a variable
            // that does not exist (see the Engines page).
            e.key.env
                ? `Key name: ${e.key.env}${e.key.inVault ? ' — in the vault' : ' — not in the vault'}`
                : 'Key: this engine has none — nothing to store'
        ]);
        // ‼️ A ROW OFFERS THE STEP IT IS ACTUALLY ON. An engine that is not
        // installed cannot be signed into, and telling somebody to sign in to a
        // command that does not exist is the "not configured" this section was
        // built to stop. So while the CLI is missing, Install is the gesture and
        // it is the primary one; the plan sign-in appears once there is
        // something to sign in TO. The key box stays either way — a key is
        // storable before the CLI arrives and costs nothing to have ready.
        const install = !e.cli.found && e.installCommand
            ? `<button class="small" data-engcmd="${C.esc(e.installCommand)}"
                title="${C.esc(`Write ${e.installCommand} into a terminal — it is NOT run for you, so you can read it first.`)}">Install ${C.esc(e.cli.command)}</button>`
            : '';
        // ‼️ U-59 — same words as the Engines page, for the same reason: on an
        // engine that already runs without a credential, "Sign in with a plan"
        // reads as the missing step rather than as the upgrade it really is.
        const builtin = e.auth.mode === 'builtin';
        const login = e.cli.found && e.loginCommand
            ? `<button class="secondary small" data-engcmd="${C.esc(e.loginCommand)}"
                title="${C.esc(builtin
                    ? `${e.label} already runs without this. Signing in adds the PAID providers beside its own free ones — it fixes nothing, because nothing here is broken. Write ${e.loginCommand} into a terminal; it is NOT run for you.`
                    : `Write ${e.loginCommand} into a terminal — it is NOT run for you. The sign-in happens in your browser and the CLI keeps the grant itself; Agent Farm never sees it.`)}">${builtin ? 'Add paid providers' : 'Sign in with a plan'}</button>`
            : '';
        return `<div class="setitem eng eng-${tone}">
            <div class="sethead">
                <span class="setname">${C.esc(e.label)}</span>
                <span class="engbadge b-${tone}" title="${C.esc(facts)}">${C.esc(badge)}</span>
                <span style="flex:1"></span>
                ${install}${login}
                ${e.key.env ? `<button class="secondary small" data-engkey="${C.esc(e.key.env)}"
                    title="${C.esc(`${e.key.inVault ? 'Replace' : 'Store'} ${e.key.env} in the OS keychain. This is the pay-per-token route; the value never reaches this page.`)}">${e.key.inVault ? 'Replace key' : 'Add key'}</button>` : ''}
                <button class="secondary small" data-engdocs="${C.esc(e.docs)}" title="${C.esc(e.docs)}">Docs</button>
            </div>
            <div class="setdesc">${C.esc(e.billing)}</div>
            <div class="engnext">${C.esc(e.next)}</div>
            <div class="engdetail muted small">${C.esc(e.auth.detail)}</div>
        </div>`;
    }

    function enginesSection() {
        const list = X.DATA.engines;
        if (!list || !list.length) { return ''; }
        if (!sectionMatches(ENGINE_TERMS + ' ' + engineWords(list))) { return ''; }
        const ready = list.filter(e => e.ready).length;
        const onPlan = list.filter(e => e.ready && e.auth.mode === 'subscription').length;
        // ‼️ THIS IS THE SUMMARY; THE PANEL IS THE PAGE (X-14, settled
        // 2026-08-09). The section stays because the answer belongs where
        // somebody is already looking, but the depth — a real call with a
        // verdict and an age on it, quota, model lists, per-engine defaults —
        // needs a surface of its own. So the rows stay readable here and the
        // button is the first control, not a footnote under them.
        return `
            <h2 class="cat" id="cat-engines">Engines <span class="muted small">${ready} of ${list.length} ready</span></h2>
            <p class="muted small" style="max-width:760px">Which agent CLIs this machine can actually run, and how each one is paid for.
            <b>${onPlan} of ${ready}</b> are running on a subscription rather than per token — a plan sign-in lives in the CLI's own
            credentials file and never passes through Agent Farm. A key is the other route, and it is kept in the OS keychain
            (the <b>Secrets</b> page is the full table); it is injected into an agent's environment under the exact name the engine reads.</p>
            <div class="pj-row" style="margin:0 0 10px"><button id="openengines"
                title="${C.esc('The Engines page: the same rows, plus a real call that proves a turn actually gets through — everything here was read off disk.')}">⚙ Open Engines</button>
                <button id="openaccounts" class="secondary"
                title="${C.esc('The Accounts page: every captured sign-in, how much of its plan is left, and the switch between them — the Engines page\'s accounts section on a page of its own.')}">👥 Open Accounts</button>
                <span class="muted small">everything below was read off disk — only a call proves it works</span></div>
            ${list.map(engineRow).join('')}`;
    }

    function profileBar() {
        // U-128 — a `<select>` cuts its own text and the popup is drawn by the
        // operating system, so the option's native title is the only surface
        // there is. MIRROR: the set's own name first, then what it holds.
        const opts = X.DATA.profiles.map(p =>
            `<option value="${C.esc(p.name)}" title="${C.esc(`${p.name}\n\n${p.count} setting(s)`
                + `${p.savedAt ? `, saved ${new Date(p.savedAt).toLocaleString()}` : ''}`
                + '. Applying it sets these and returns every other changed setting to its default.')}"
                >${C.esc(p.name)} (${p.count})</option>`).join('');
        return `<div class="profbar">
            <span class="muted small">Setting sets:</span>
            <select id="profsel" ${X.DATA.profiles.length ? '' : 'disabled'}>
                ${opts || `<option title="${C.esc('No setting set saved yet.\n\n'
                + 'Save current as… stores every setting you have changed under a name, so a machine '
                + 'can be put back the way it was in one press.')}">none saved yet</option>`}
            </select>
            <button class="secondary" id="profapply" ${X.DATA.profiles.length ? '' : 'disabled'}
                title="Apply the selected set: its values are set, other modified settings return to default">Apply</button>
            <button class="secondary" id="profdel" ${X.DATA.profiles.length ? '' : 'disabled'} title="Delete the selected set">Delete</button>
            <button class="secondary" id="profsave" title="Save every currently non-default value as a named set">Save current as…</button>
            ${X.saveOpen ? `<input id="profname" type="text" placeholder="set name" style="width:140px">
                <button id="profconfirm">Save</button>` : ''}
            <span style="flex:1"></span>
            <button class="secondary" id="profexport" ${X.DATA.profiles.length ? '' : 'disabled'} title="Write all sets to a JSON file">Export</button>
            <button class="secondary" id="profimport" title="Load sets from a JSON file (same-name sets are replaced)">Import</button>
        </div>`;
    }

    window.AFSettingClaude = function (ctx) {
        X = ctx;
        ({ C, errors, sectionMatches } = ctx);
        return { claudeSection, enginesSection, profileBar };
    };
})();
