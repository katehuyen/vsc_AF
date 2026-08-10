// Agent Farm — Farm Settings page: schema-driven editor for every agentFarm.*
// setting, with search, per-setting reset, and named setting sets.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    let filter = '';
    let saveOpen = false;          // "Save current as…" inline input visibility
    const errors = {};             // key -> validation error from the host
    // While the user is typing in a field, background refreshes must not wipe
    // the edit — hold the data and apply it when focus leaves (2.47.0 lesson).
    let editing = false;
    let pendingData = null;

    function shortKey(k) { return k.replace(/^agentFarm\./, ''); }

    function fmtDefault(v) {
        if (v === undefined) { return '(none)'; }
        try {
            const s = JSON.stringify(v);
            return s.length > 60 ? s.slice(0, 60) + '…' : s;
        } catch { return String(v); }
    }

    function matches(it) {
        if (!filter) { return true; }
        // The saved-prompts row answers to the words a person would actually
        // type looking for it — its own key and description say "snippets file"
        // and nothing about right-clicking Send (see PROMPT_TERMS).
        const extra = it.key === 'agentFarm.promptSnippetsFile' ? ' ' + PROMPT_TERMS : '';
        return window.AFQuery.compile(filter).test(it.key + ' ' + (it.description || '') + extra);
    }

    function controlHtml(it) {
        const id = `c-${shortKey(it.key)}`;
        if (it.type === 'boolean') {
            return `<input type="checkbox" id="${id}" data-set="${C.esc(it.key)}"${it.value ? ' checked' : ''}>`;
        }
        if (it.enum && it.enum.length) {
            return `<select id="${id}" data-set="${C.esc(it.key)}">${it.enum.map(o =>
                `<option value="${C.esc(o)}"${String(it.value) === o ? ' selected' : ''}>${C.esc(o)}</option>`).join('')}</select>`;
        }
        if (it.type === 'number') {
            return `<input type="number" id="${id}" data-set="${C.esc(it.key)}" value="${C.esc(String(it.value ?? ''))}" style="width:110px">`;
        }
        if (it.type === 'array' || it.type === 'object') {
            let text = '';
            try { text = JSON.stringify(it.value ?? (it.type === 'array' ? [] : {}), null, 2); } catch { text = ''; }
            const rows = Math.min(10, Math.max(2, text.split('\n').length));
            return `<textarea id="${id}" data-json="${C.esc(it.key)}" rows="${rows}" spellcheck="false"
                style="width:100%; font-family:var(--vscode-editor-font-family); font-size:11px">${C.esc(text)}</textarea>
                <button class="secondary small" data-apply="${C.esc(it.key)}">Apply JSON</button>`;
        }
        // A path setting gets a picker beside the box — typing a Windows path
        // by hand is where the typo that makes a feature look broken comes
        // from. Which settings are paths is declared in the SCHEMA (`format`),
        // never listed here: see SettingSpec.browse.
        const browse = it.browse
            ? ` <button class="secondary small" data-browse="${C.esc(it.key)}" data-browsekind="${C.esc(it.browse)}"
                    title="Pick ${it.browse === 'folder' ? 'a folder' : 'a file'} — the path is written into the box and saved">Browse…</button>`
            : '';
        return `<span class="setpath"><input type="text" id="${id}" data-set="${C.esc(it.key)}" value="${C.esc(String(it.value ?? ''))}" style="width:100%; max-width:420px">${browse}</span>`;
    }

    function itemHtml(it) {
        const err = errors[it.key];
        return `<div class="setitem${it.modified ? ' modified' : ''}" data-item="${C.esc(it.key)}"
            ${window.AFCtx.row('afSettingRow', { setKey: it.key, afModified: !!it.modified })}
            title="${C.esc(window.AFCtx.hint(it.key + ' — default: ' + fmtDefault(it.default)))}">
            <div class="sethead">
                <span class="setname">${C.esc(shortKey(it.key))}</span>
                ${it.modified ? `<span class="moddot" title="Changed from default (${C.esc(fmtDefault(it.default))})"></span>
                    <button class="reset" data-reset="${C.esc(it.key)}" title="Reset to default: ${C.esc(fmtDefault(it.default))}">↺</button>` : ''}
            </div>
            <div class="setdesc">${C.esc(it.description || '')}</div>
            <div class="setctl">${controlHtml(it)}</div>
            ${err ? `<div class="seterr">⚠ ${C.esc(err)}</div>` : ''}
        </div>`;
    }

    // ---- Agent folders — where agents live: roots, nest/single badges, exclude ----

    function pnorm(p) { return String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase(); }

    function rootBadge(r) {
        if (r.duplicate) { return '<span class="rootbadge warn">duplicate entry</span>'; }
        if (r.kind === 'missing') { return '<span class="rootbadge warn">folder missing</span>'; }
        const live = r.candidates.filter(c => !c.excluded).length;
        const ex = r.candidates.length - live;
        const tail = ex ? ` · ${ex} excluded` : '';
        if (r.kind === 'nest') { return `<span class="rootbadge">nest · ${live} agent(s)${tail}</span>`; }
        if (r.kind === 'single-agent') { return `<span class="rootbadge">single agent${live ? '' : ' · excluded'}</span>`; }
        return `<span class="rootbadge">${live} agent(s)${tail}</span>`;
    }

    function rootDesc(r) {
        if (r.duplicate) { return 'Same folder as an earlier entry (case/slash differences ignored) — safe to clean up.'; }
        if (r.kind === 'missing') { return 'This path does not exist on this machine — fix the spelling or remove the entry.'; }
        if (r.kind === 'nest') { return 'A nest: the subfolders below are the agents. The root’s own CLAUDE.md is shared instructions they all load — not an agent of its own.'; }
        if (r.kind === 'single-agent') { return 'This folder is one agent by itself (it has no agent-like subfolders).'; }
        return r.candidates.length ? 'The subfolders below are the agents.' : 'No agent folders found here yet — a subfolder becomes an agent once it has a CLAUDE.md, .claude or memory/.';
    }

    /**
     * ‼️ U-29/U-33 — THE PER-AGENT DEFAULT IS PER ENGINE, AND IT SAYS WHAT IT
     * RESOLVES TO.
     *
     * One box used to serve every engine, and it wrote `.claude/settings.local.json`
     * — a file only Claude Code reads. So a `sonnet` typed here meant something
     * on Claude and nothing at all on the other three, while looking exactly the
     * same on all four; and the word "Default" had no referent a reader could
     * find. Both are fixed by the same two moves: the strip below chooses WHICH
     * ENGINE these defaults are for, and every box names the value it will
     * actually resolve to.
     */
    const agentEngine = () => (DATA.agentDefaultsEngine || 'claude');
    const engineRows = () => (DATA.engines || []);
    const engineLabel = id => {
        const e = engineRows().find(x => x.id === id);
        return e ? e.label : (window.AFEngine ? window.AFEngine.label(id) : id);
    };

    /** The strip above the agent list: which engine the boxes below edit. */
    function agentEngineTabs() {
        const rows = engineRows();
        if (rows.length < 2) { return ''; }
        const cur = agentEngine();
        return `<div class="agtabs">
            <span class="muted small">Defaults for</span>
            ${rows.map(e => `<button class="agtab${e.id === cur ? ' on' : ''}" data-agengine="${C.esc(e.id)}"
                title="${C.esc(e.label + ' — ' + (e.billing || ''))}">${C.esc(e.label)}</button>`).join('')}
            <span class="muted small">${C.esc(agentEngineNote(cur))}</span>
        </div>`;
    }

    /** Where THIS engine's answer is kept — the difference the user has to
     *  know, said once above the list rather than in every row's hover. */
    function agentEngineNote(id) {
        return id === 'claude'
            ? 'written to each agent\u2019s .claude/settings.local.json \u2014 the CLI reads it itself, terminal sessions included'
            : 'kept by Agent Farm and passed as --model/--effort \u2014 this engine has no per-folder settings file';
    }

    // Model names for the CHOSEN engine, read from that engine's own catalog
    // where it has one (see core/models.ts); the alias list is the fallback
    // for an engine that publishes nothing.
    const modelAliases = () => {
        const em = (DATA.engineModels || {})[agentEngine()];
        if (em && em.models && em.models.length) {
            return em.models.filter(m => m.id).map(m => m.id);
        }
        return (DATA.modelAliases && DATA.modelAliases.length) ? DATA.modelAliases : ['haiku', 'sonnet', 'opus', 'fable'];
    };
    let customModelDir = ''; // the chip whose custom-model input is open

    function agentModelSel(c) {
        const eng = agentEngine();
        const per = (c.engines || {})[eng] || {};
        const cur = per.model || '';
        if (customModelDir === c.dir) {
            return `<input type="text" class="agmodel agcustom" data-agcustom="${C.esc(c.dir)}" value="${C.esc(cur)}"
                placeholder="model id — Enter saves, Esc cancels"
                title="Free-text model id, written to the agent's .claude/settings.local.json. To keep a name for every picker, add it to agentFarm.modelAliases.">`;
        }
        const aliases = modelAliases();
        const opts = cur && aliases.indexOf(cur) < 0 ? [cur].concat(aliases) : aliases;
        // ‼️ THE FIRST ROW NAMES WHAT IT RESOLVES TO. "Default" on its own is
        // the mystery this item was filed about; `per.resolved` is computed by
        // core/agentDefaults.ts and carries both the value and who decided it.
        const res = per.resolved || {};
        const zero = res.value ? `Default \u2192 ${res.value}` : 'Default (the CLI decides)';
        return `<select class="agmodel" data-agmodel="${C.esc(c.dir)}"
            title="${C.esc('Default model for this agent on ' + engineLabel(eng) + '. ' + (res.note || ''))}">
            <option value=""${cur ? '' : ' selected'}>${C.esc(zero)}</option>
            ${opts.map(m => `<option value="${C.esc(m)}"${cur === m ? ' selected' : ''}>${C.esc(m)}</option>`).join('')}
            <option value="__custom__">custom…</option>
        </select>`;
    }

    /** …and the effort beside it, from the same engine's own vocabulary: a
     *  model with no effort levels must not be offered five (see core/models.ts). */
    function agentEffortSel(c) {
        const eng = agentEngine();
        const per = (c.engines || {})[eng] || {};
        const em = (DATA.engineModels || {})[eng] || {};
        const list = ((em.efforts || {})[per.model || ''] || (em.efforts || {})[''] || [])
            .filter(e => e.id);
        if (!list.length) { return ''; }
        const cur = per.effort || '';
        const res = per.resolvedEffort || {};
        const zero = res.value ? `effort \u2192 ${res.value}` : 'effort: default';
        return `<select class="agmodel" data-ageffort="${C.esc(c.dir)}"
            title="${C.esc('Default reasoning effort for this agent on ' + engineLabel(eng) + '. ' + (res.note || ''))}">
            <option value=""${cur ? '' : ' selected'}>${C.esc(zero)}</option>
            ${list.map(e => `<option value="${C.esc(e.id)}"${cur === e.id ? ' selected' : ''}>${C.esc(e.label || e.id)}</option>`).join('')}
        </select>`;
    }

    function agentChip(c) {
        if (c.excluded) {
            return `<span class="agchip agexcl" title="${C.esc(c.dir)} — excluded, never treated as an agent">${C.esc(c.name)}
                <a data-include="${C.esc(c.dir)}" title="Treat this folder as an agent again">Include</a></span>`;
        }
        const name = c.agentId
            ? `<a data-openagent="${C.esc(c.agentId)}" title="Open this agent's page">${C.esc(c.name)}</a>`
            : C.esc(c.name);
        return `<span class="agchip" title="${C.esc(c.dir)}">${name}
            ${agentModelSel(c)}${agentEffortSel(c)}
            <a class="agex" data-exclude="${C.esc(c.dir)}" title="Never treat this folder as an agent (undo any time with Include)">Exclude</a></span>`;
    }

    function rootItemHtml(r) {
        return `<div class="setitem${r.kind === 'missing' || r.duplicate ? '' : ' modified'}" data-item="root:${C.esc(r.root)}"
            ${window.AFCtx.row('afAgentRoot', { rootPath: r.root, afMissing: r.kind === 'missing' })}
            title="${C.esc(window.AFCtx.hint(r.root))}">
            <div class="sethead" style="flex-wrap:wrap">
                <span class="setname">${C.esc(r.root)}</span>
                ${rootBadge(r)}
                <span style="flex:1"></span>
                ${r.kind === 'missing' || r.duplicate ? '' : `<button class="reset" data-rootreveal="${C.esc(r.root)}" title="Show this folder in the file explorer">Reveal</button>`}
                <button class="reset" data-rootremove="${C.esc(r.root)}" title="Stop scanning this root (the folder itself is not touched)">Remove</button>
            </div>
            <div class="setdesc">${rootDesc(r)}</div>
            ${r.candidates.length ? `<div class="aglist">${r.candidates.map(agentChip).join('')}</div>` : ''}
        </div>`;
    }

    function foldersSection() {
        const f = DATA.folders;
        if (!f) { return ''; }
        const fq = window.AFQuery.compile(filter);
        const reports = f.reports.filter(r =>
            fq.test(r.root + ' ' + r.candidates.map(c => c.name).join(' ')));
        if (filter && !reports.length) { return ''; }
        const dupes = f.reports.some(r => r.duplicate);
        const agentCount = f.reports.reduce((a, r) => a + (r.duplicate ? 0 : r.candidates.filter(c => !c.excluded).length), 0);
        // excludes that no current root explains — stale leftovers, offered for removal
        const known = new Set(f.reports.flatMap(r => r.candidates.map(c => pnorm(c.dir))));
        const stale = (f.excludes || []).filter(x => !known.has(pnorm(x)));
        return `
            <h2 class="cat" id="cat-folders">Agent folders <span class="muted small">${f.reports.length} root(s) · ${agentCount} agent(s)</span></h2>
            <p class="muted small" style="max-width:760px">Where your agents live. Each root folder is scanned: subfolders with a
            <code>CLAUDE.md</code>, <code>.claude</code> or <code>memory/</code> become agents; a root whose subfolders are agents is a
            <b>nest</b> (its own CLAUDE.md = shared instructions); a root with no agent-like subfolders is one agent itself.
            <b>Exclude</b> keeps a folder out of the farm entirely — it stops being an agent everywhere (views, analytics, session
            ownership) until you Include it back. Each agent chip carries a <b>model</b> and an <b>effort</b> dropdown — that agent's
            defaults <i>for the engine selected below</i>; new agents are seeded from <code>agentFarm.newAgentModel</code>.
            <button class="secondary small" id="rootadd" title="Pick a folder to scan for agents">+ Add root…</button></p>
            ${agentEngineTabs()}
            ${dupes ? `<div class="seterr">⚠ The roots list contains the same folder more than once (case/slash spelling differs) — this distorts discovery. <a id="afcleandupes">Clean duplicates</a></div>` : ''}
            ${reports.map(rootItemHtml).join('')}
            ${stale.length ? `<div class="setitem">
                <div class="sethead"><span class="setname">Excluded, but not under any root</span></div>
                <div class="setdesc">Leftover exclude entries that match nothing anymore — safe to remove.</div>
                <div class="aglist">${stale.map(x =>
                    `<span class="agchip agexcl" title="${C.esc(x)}">${C.esc(x)} <a data-include="${C.esc(x)}" title="Remove this stale entry">Remove</a></span>`).join('')}</div>
            </div>` : ''}`;
    }

    // ---- Claude Code (claude CLI) settings — curated + raw JSON ----

    function ccControl(it) {
        const id = `cc-${it.id}`;
        if (it.kind === 'flag' || it.kind === 'boolean') {
            const on = it.kind === 'flag' ? String(it.value) === '1' : it.value === true;
            return `<input type="checkbox" id="${id}" data-ccset="${it.id}"${on ? ' checked' : ''}>`;
        }
        if (it.kind === 'enum') {
            return `<select id="${id}" data-ccset="${it.id}">
                <option value=""${it.set ? '' : ' selected'}>(not set — Claude default)</option>
                ${it.enum.map(o => `<option value="${C.esc(o)}"${String(it.value) === o ? ' selected' : ''}>${C.esc(o)}</option>`).join('')}
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
        const cc = DATA.claude;
        if (!cc) { return ''; }
        const ccq = window.AFQuery.compile(filter);
        const items = cc.items.filter(it => ccq.test(it.label + ' ' + it.description));
        if (filter && !items.length) { return ''; }
        const rawErr = errors['cc:__raw__'];
        return `
            <h2 class="cat" id="cat-claude">Claude Code (claude CLI) <span class="muted small">${items.length}</span></h2>
            <p class="muted small" style="max-width:760px">These are <b>claude's own settings</b>, not Agent Farm's — the file behind terminal tips like
            “Set CLAUDE_CODE_USE_POWERSHELL_TOOL=1 …”. Edits write to <code>${C.esc(cc.file)}</code>
            (a one-time <code>.agentfarm-backup</code> copy is kept next to it) and apply to <b>new</b> claude sessions.
            <a id="ccopen">Open the file</a></p>
            ${cc.parseError ? `<div class="seterr">⚠ settings.json could not be parsed (${C.esc(cc.parseError)}) — fix it in the raw editor below; edits are blocked until then.</div>` : ''}
            ${items.map(ccItemHtml).join('')}
            <details class="setitem" style="margin-top:10px">
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
    const ENGINE_TERMS = 'engine engines model models cli claude codex openai gemini '
        + 'antigravity agy google api key apikey login sign in subscription plan auth credentials secret vault';

    function engineRow(e) {
        const T = window.AFTip;
        const tone = !e.cli.found ? 'off' : e.auth.mode === 'none' ? 'warn' : 'ok';
        const badge = !e.cli.found ? 'not installed'
            : e.auth.mode === 'subscription' ? 'on a plan'
                : e.auth.mode === 'apikey' ? 'on a key' : 'not signed in';
        // Figures on the hover, the way a column's own tooltip works elsewhere:
        // where it was read from, when, and what the alternative route is.
        const facts = T.lines([
            `Command: ${e.cli.command}${e.cli.path ? ' — ' + e.cli.path : ' — not on PATH'}`,
            `Billing: ${e.auth.mode === 'subscription' ? 'a plan' : e.auth.mode === 'apikey' ? 'per token' : 'nothing set up'}`,
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
                title="${C.esc(`Write ${e.installCommand} into a terminal — it is NOT run for you, so you can read it first. Node and npm have to be on this machine.`)}">Install ${C.esc(e.cli.command)}</button>`
            : '';
        const login = e.cli.found && e.loginCommand
            ? `<button class="secondary small" data-engcmd="${C.esc(e.loginCommand)}"
                title="${C.esc(`Write ${e.loginCommand} into a terminal — it is NOT run for you. The sign-in happens in your browser and the CLI keeps the grant itself; Agent Farm never sees it.`)}">Sign in with a plan</button>`
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
        const list = DATA.engines;
        if (!list || !list.length) { return ''; }
        if (filter && !ENGINE_TERMS.includes(filter.toLowerCase())) { return ''; }
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
                <span class="muted small">everything below was read off disk — only a call proves it works</span></div>
            ${list.map(engineRow).join('')}`;
    }

    function profileBar() {
        const opts = DATA.profiles.map(p =>
            `<option value="${C.esc(p.name)}">${C.esc(p.name)} (${p.count})</option>`).join('');
        return `<div class="profbar">
            <span class="muted small">Setting sets:</span>
            <select id="profsel" ${DATA.profiles.length ? '' : 'disabled'}>
                ${opts || '<option>none saved yet</option>'}
            </select>
            <button class="secondary" id="profapply" ${DATA.profiles.length ? '' : 'disabled'}
                title="Apply the selected set: its values are set, other modified settings return to default">Apply</button>
            <button class="secondary" id="profdel" ${DATA.profiles.length ? '' : 'disabled'} title="Delete the selected set">Delete</button>
            <button class="secondary" id="profsave" title="Save every currently non-default value as a named set">Save current as…</button>
            ${saveOpen ? `<input id="profname" type="text" placeholder="set name" style="width:140px">
                <button id="profconfirm">Save</button>` : ''}
            <span style="flex:1"></span>
            <button class="secondary" id="profexport" ${DATA.profiles.length ? '' : 'disabled'} title="Write all sets to a JSON file">Export</button>
            <button class="secondary" id="profimport" title="Load sets from a JSON file (same-name sets are replaced)">Import</button>
        </div>`;
    }

    /**
     * Which editor a markdown file opens in — the setting behind every "Open"
     * and "App" button in the extension.
     *
     * ‼️ IT IS NOT AN agentFarm.* SETTING AND THAT IS DELIBERATE (core/docopen.ts):
     * the custom-app command is machine-specific and has no business in a
     * git-synced settings surface, so it lives in the extension's own
     * globalStorage. What it DID need was to be findable: it used to be titled
     * "Report / Answer open mode", was missing from the category nav, and did not
     * answer the filter box — so somebody looking at the "App" button on the
     * Projects page had no way to discover which app that was. The words below
     * name every surface it governs, for exactly that reason.
     */
    const DOCOPEN_TERMS = 'open with editor app obsidian markdown preview external '
        + 'document report answer notices queue project plan backlog docs vs code notepad';

    function docOpenSection() {
        const d = DATA.docOpen;
        if (!d) { return ''; }
        if (filter && !DOCOPEN_TERMS.includes(filter)) { return ''; }
        const LBL = { vscode: 'VS Code (raw markdown)', preview: 'Markdown preview (rendered)', obsidian: 'Obsidian (rendered in your vault)', custom: 'Custom external app (e.g. Notepad)' };
        const modes = d.modes && d.modes.length ? d.modes : ['vscode', 'preview', 'obsidian', 'custom'];
        const opts = modes.map(m => `<option value="${C.esc(m)}"${m === d.defaultMode ? ' selected' : ''}>${C.esc(LBL[m] || m)}</option>`).join('');
        const showCustom = d.defaultMode === 'custom';
        return `
            <h2 class="cat" id="cat-docopen">Open documents with <span class="muted small">${C.esc(LBL[d.defaultMode] || d.defaultMode)}</span></h2>
            <p class="muted small" style="max-width:760px">Which editor a <code>.md</code> file opens in when you press
            <b>Open</b> anywhere in Agent Farm: report and answer links on <b>Notices</b> and the <b>Work Queue</b>, and the
            project documents on the <b>Projects</b> page (Plan · Backlog · Docs). The buttons beside <b>Open</b> —
            <i>Editor · Preview · Obsidian · App</i> — are per-click overrides of this default, and <b>App</b> is the
            custom one configured here. Kept out of <code>agentFarm.*</code> on purpose: a path to an executable on
            <i>this</i> machine does not belong in settings that travel between machines.</p>
            <div class="setitem">
                <div class="sethead"><span class="setname">Default</span></div>
                <select id="docopenmode" style="margin-top:4px; min-width:280px">${opts}</select>
                <div class="setdesc" style="margin-top:6px">Obsidian opens the file <b>at the line</b> when you click a
                single backlog item's code, if the Advanced URI plugin is installed; otherwise it opens the file.</div>
                <div id="docopencustom" style="margin-top:10px; ${showCustom ? '' : 'display:none'}">
                    <div class="setdesc">Custom app — executable or command, e.g. <code>notepad.exe</code> or a full path.</div>
                    <input id="docopencmd" type="text" value="${C.esc(d.customCommand || '')}" placeholder="notepad.exe" style="width:100%; max-width:440px; padding:6px 8px">
                    <div class="setdesc" style="margin-top:6px">Arguments — <code>{file}</code> becomes the file path,
                    <code>{line}</code> the line number when one is known (dropped when it is not).</div>
                    <input id="docopenargs" type="text" value="${C.esc(d.customArgs || '{file}')}" placeholder="{file}" style="width:100%; max-width:440px; padding:6px 8px">
                </div>
            </div>`;
    }

    /**
     * ‼️ SAVED PROMPTS GETS A SECTION, NOT A TEXT BOX — and the reason is the
     * bug that made it necessary.
     *
     * The setting shipped as one more row under "Display & Labels": a path in a
     * box, indistinguishable from a path nobody has filled in. It was blank for
     * a week because VS Code never handed back the manifest default, and NOTHING
     * on this page could have told you that — a box shows you a string, and the
     * question a person actually has is "does it work?".
     *
     * So this section answers that question with the file's own contents: which
     * file, where that path came from, and every block that was read out of it.
     * If the list is there, the Console picker has the same list. If it is not,
     * the reason is written here in words, next to the button that fixes it.
     */
    const PROMPT_TERMS = 'saved prompts snippet snippets template templates kalıp kalip prompt file '
        + 'console send right-click paste markdown fence block phrases reuse boilerplate';

    function promptsSection(cat) {
        const p = DATA.prompts;
        const item = cat && cat.items && cat.items[0];
        const box = item ? `
            <div class="setctl" style="margin-top:8px">
                <span class="setpath"><input type="text" data-set="${C.esc(item.key)}"
                    placeholder="(nothing chosen — the built-in path below is used)"
                    value="${C.esc(String(item.value ?? ''))}" style="width:100%; max-width:520px"></span>
            </div>` : '';
        if (!p) { return box; }

        const n = (p.items || []).length;
        const src = p.source === 'setting' ? 'the file you chose'
            : p.source === 'built-in' ? 'the built-in path (you have not chosen one)'
                : 'nothing';
        const state = p.error
            ? `<div class="seterr">⚠ ${C.esc(p.error)}</div>`
            : p.file
                ? `<div class="setdesc"><b>${n}</b> prompt${n === 1 ? '' : 's'} read from ${C.esc(src)}${p.empty
                    ? ` · ${p.empty} empty block${p.empty === 1 ? '' : 's'} skipped` : ''}</div>`
                : `<div class="setdesc">No file yet. Press <b>📁 Choose a file…</b> — your machine's own
                    file picker opens. There is a built-in path (<code>${C.esc(p.builtIn || '')}</code>)
                    that is used automatically whenever it exists, which is why nothing had to be cleared
                    on a machine where it does not.</div>`;

        let list = '';
        if (n) {
            let group = null;
            const rows = [];
            for (const it of p.items) {
                if (it.group !== group) {
                    group = it.group;
                    if (group) { rows.push(`<div class="promptgrp">${C.esc(group)}</div>`); }
                }
                // The prompt itself is TEXT, so it opens the rich panel rather
                // than a native tooltip that repeats the preview beside it and
                // then cuts (docs/CONVENTIONS.md → Hover).
                rows.push(window.AFTip.wrap(
                    `<div class="promptrow">
                    <span class="promptlbl">${C.esc(it.label)}</span>
                    <span class="promptprev">${C.esc(String(it.text).replace(/\s+/g, ' ').slice(0, 140))}</span>
                    <span class="promptline">line ${it.line}</span>
                </div>`,
                    `${it.label}${it.group ? ` · ${it.group}` : ''} · line ${it.line} · ${window.AFTip.sizeNote(it.text)}`,
                    it.text));
            }
            list = `<div class="promptlist">${rows.join('')}</div>`;
        }

        return `
            <p class="muted small" style="max-width:760px">The phrases you say to an agent over and over,
            kept in <b>your own markdown file</b> and offered where you need them: in the <b>Console</b>,
            <b>right-click</b> any button that sends text — <i>Send · Send into turn · Send after turn ·
            Start session</i> — and pick one. It is <b>pasted at the caret</b>, never sent: the press that
            sends is still yours. Only text inside <code>\`\`\`</code> fences is offered, so the prose around
            the blocks stays yours to write notes in. A block's name is its fence info string, the line above
            it, or its own first line; the nearest heading becomes the group.</p>
            <div class="setitem" data-item="agentFarm.promptSnippetsFile">
                <div class="sethead"><span class="setname">Prompts file</span>
                    ${p.file ? `<span class="rootbadge">${C.esc(p.source === 'setting' ? 'chosen' : 'built-in')}</span>` : ''}
                </div>
                <div class="setdesc" style="font-family:var(--vscode-editor-font-family)">${p.file ? C.esc(p.file) : '—'}</div>
                ${state}
                <div class="btnrow">
                    <button id="promptspick">📁 ${p.file ? 'Change file…' : 'Choose a file…'}</button>
                    <button class="secondary" id="promptsopen" ${p.file ? '' : 'disabled'}
                        title="Open it in the editor — add a \`\`\` block and it is in the list the moment you press Re-read">✎ Open the file</button>
                    <button class="secondary" id="promptsreload" title="Read the file again — it is a document you edit elsewhere">⟳ Re-read</button>
                    ${item && String(item.value ?? '').trim() ? `<button class="secondary" id="promptsdefault"
                        title="Forget the file you chose and go back to the built-in path">↺ Use the built-in path</button>` : ''}
                </div>
                ${box}
                ${list}
            </div>`;
    }

    function render() {
        const cats = DATA.categories
            .map(c => ({ ...c, items: c.items.filter(matches) }))
            .filter(c => c.items.length);
        const total = DATA.categories.reduce((a, c) => a + c.items.length, 0);
        const modified = DATA.categories.reduce((a, c) => a + c.items.filter(i => i.modified).length, 0);
        // Built once: the section decides for itself whether the filter leaves it
        // on screen, and the nav link must not offer to scroll to a heading that
        // is not there.
        const docOpenHtml = docOpenSection();
        const foldersHtml = foldersSection();
        const claudeHtml = claudeSection();
        const enginesHtml = enginesSection();

        document.getElementById('app').innerHTML = `
            <style>
                .profbar { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:10px 0;
                    padding:8px 10px; border:1px solid var(--vscode-panel-border); border-radius:6px; }
                .catnav { display:flex; gap:6px; flex-wrap:wrap; margin:8px 0 14px;
                    position:sticky; top:0; z-index:10; padding:6px 0;
                    background:var(--vscode-editor-background, var(--vscode-sideBar-background)); }
                .catnav a { font-size:11px; padding:2px 10px; border-radius:10px; cursor:pointer;
                    border:1px solid var(--vscode-widget-border, #4444); color:var(--vscode-foreground);
                    text-decoration:none; opacity:.8; }
                .catnav a:hover { opacity:1; }
                h2.cat { margin:22px 0 4px; }
                .setitem { padding:10px 12px; margin:6px 0; border-radius:5px;
                    border:1px solid var(--vscode-widget-border, #3333); }
                .setitem.modified { border-left:3px solid var(--vscode-textLink-foreground); }
                .sethead { display:flex; gap:8px; align-items:center; }
                .setname { font-weight:600; font-family:var(--vscode-editor-font-family); font-size:12px; }
                .moddot { width:7px; height:7px; border-radius:50%; background:var(--vscode-textLink-foreground); }
                .reset { font-size:11px; padding:0 6px; cursor:pointer; border-radius:3px; opacity:.7;
                    background:transparent; border:1px solid var(--vscode-widget-border, #4444);
                    color:var(--vscode-foreground); }
                .reset:hover { opacity:1; }
                .setdesc { font-size:11px; color:var(--vscode-descriptionForeground); margin:3px 0 6px; max-width:720px; }
                .setctl button.small { font-size:10px; margin-top:4px; }
                .seterr { font-size:11px; color:var(--vscode-errorForeground); margin-top:4px; }
                .setitem.flash { outline:2px solid var(--vscode-textLink-foreground); outline-offset:2px; }
                .rootbadge { font-size:10px; padding:1px 8px; border-radius:8px; white-space:nowrap;
                    background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
                .rootbadge.warn { background:var(--vscode-inputValidation-warningBackground, #664d00);
                    color:var(--vscode-foreground); }
                .aglist { display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; }
                /* U-29 — which engine the per-agent boxes below are editing. */
                .agtabs { display:flex; gap:5px; align-items:center; flex-wrap:wrap; margin:8px 0 2px; }
                .agtab { font-size:10px; padding:1px 8px; border-radius:9px; cursor:pointer;
                    background:transparent; color:var(--vscode-foreground); opacity:.6;
                    border:1px solid var(--vscode-widget-border,#4444); }
                .agtab:hover { opacity:.9; }
                .agtab.on { opacity:1; border-color:var(--vscode-focusBorder,#007fd4); }
                .agchip { font-size:11px; padding:2px 10px; border-radius:10px; white-space:nowrap;
                    border:1px solid var(--vscode-widget-border, #4444); }
                .agchip a { cursor:pointer; }
                .agchip .agex, .agchip.agexcl a { margin-left:6px; font-size:10px; opacity:.75; }
                .agchip .agex:hover, .agchip.agexcl a:hover { opacity:1; }
                .agchip.agexcl { opacity:.55; text-decoration:line-through; }
                .agchip.agexcl a { text-decoration:none; }
                .agchip .agmodel { font-size:10px; margin-left:6px; padding:0 2px; max-width:150px; }
                .agchip .agcustom { width:200px; max-width:200px; padding:1px 4px; }
                .promptlist { margin-top:10px; border:1px solid var(--vscode-widget-border, #3333);
                    border-radius:5px; max-height:340px; overflow:auto; }
                .promptgrp { font-size:10px; text-transform:uppercase; letter-spacing:.5px; opacity:.55;
                    padding:7px 10px 2px; }
                .promptrow { display:flex; gap:10px; align-items:baseline; padding:4px 10px;
                    border-top:1px solid var(--vscode-widget-border, #2222); }
                .promptrow:first-child { border-top:none; }
                .promptlbl { font-size:12px; flex:0 0 200px; max-width:200px; overflow:hidden;
                    text-overflow:ellipsis; white-space:nowrap; }
                .promptprev { font-size:10px; opacity:.6; flex:1 1 auto; overflow:hidden;
                    text-overflow:ellipsis; white-space:nowrap; }
                .promptline { font-size:10px; opacity:.45; flex:none; }
                /* engines — the row is read left to right: who, how paid for,
                   what to do. The rule on the left is the state, not decoration. */
                .setitem.eng { border-left:3px solid var(--vscode-widget-border, #4444); }
                .setitem.eng-ok { border-left-color:var(--vscode-charts-green, #3fb950); }
                .setitem.eng-warn { border-left-color:var(--vscode-charts-yellow, #d7ba7d); }
                .setitem.eng-off { border-left-color:var(--vscode-descriptionForeground, #888); opacity:.75; }
                .engbadge { font-size:10px; padding:1px 8px; border-radius:9px; white-space:nowrap; cursor:help;
                    border:1px solid var(--vscode-widget-border, #4446); }
                .engbadge.b-ok { background:var(--vscode-charts-green, #3fb950); color:#fff; border-color:transparent; }
                .engbadge.b-warn { background:var(--vscode-charts-yellow, #d7ba7d); color:#000; border-color:transparent; }
                .engnext { font-size:12px; margin-top:4px; max-width:760px; }
                .engdetail { margin-top:2px; }
            </style>
            ${window.AFHeader.html({
                page: 'settings',
                title: 'Farm Settings',
                sub: `Every <code>agentFarm.*</code> setting — schema-driven, so new settings appear here automatically. ${total} settings · ${modified} changed from default. Changes save immediately to your user settings.`,
                guide: 'dashboard'
            })}
            ${profileBar()}
            <div class="searchbar" style="margin:10px 0; position:relative">
                <input id="filter" type="text" placeholder="Filter settings… (name or description)" value="${C.esc(filter)}" style="width:100%; max-width:420px; padding:6px 8px"
                    title="${C.esc(window.AFQuery.tip('Searched against every setting key and its description.'))}">
            </div>
            <div class="catnav">${enginesHtml ? '<a data-cat="engines">Engines</a>' : ''}${foldersHtml ? '<a data-cat="folders">Agent folders</a>' : ''}${docOpenHtml ? '<a data-cat="docopen">Open with</a>' : ''}${cats.map(c => `<a data-cat="${c.id}">${C.esc(c.label)}</a>`).join('')}${claudeHtml ? '<a data-cat="claude">Claude Code</a>' : ''}</div>
            ${enginesHtml}
            ${foldersHtml}
            ${docOpenHtml}
            ${cats.map(c => `
                <h2 class="cat" id="cat-${c.id}">${C.esc(c.label)} <span class="muted small">${c.items.length}</span></h2>
                ${c.id === 'prompts' ? promptsSection(c) : c.items.map(itemHtml).join('')}`).join('')
            || (claudeHtml || foldersHtml || docOpenHtml || enginesHtml ? '' : '<p class="muted">No settings match the filter.</p>')}
            ${claudeHtml}
        `;

        // -- wiring --
        window.AFHeader.wire(vscode);
        const dcMode = document.getElementById('docopenmode');
        if (dcMode) { dcMode.addEventListener('change', () => vscode.postMessage({ type: 'docOpenSet', field: 'defaultMode', value: dcMode.value })); }
        const dcCmd = document.getElementById('docopencmd');
        if (dcCmd) { dcCmd.addEventListener('change', () => vscode.postMessage({ type: 'docOpenSet', field: 'customCommand', value: dcCmd.value })); }
        const dcArgs = document.getElementById('docopenargs');
        if (dcArgs) { dcArgs.addEventListener('change', () => vscode.postMessage({ type: 'docOpenSet', field: 'customArgs', value: dcArgs.value })); }
        // Saved prompts — the same three gestures the Console picker offers, so
        // whichever door you came in by, the buttons mean the same thing.
        const onClick = (id, type) => {
            const el = document.getElementById(id);
            if (el) { el.addEventListener('click', () => vscode.postMessage({ type })); }
        };
        // Engines — three gestures, and the host owns all three: a terminal it
        // opens, the vault form it already has, and a link. Nothing about a
        // credential is decided on this page.
        //
        // ‼️ ONE GESTURE, NOT TWO. Install and Sign in do exactly the same
        // thing — write a command into a terminal without running it — so they
        // are one binding carrying whichever command the row offered. It was
        // called `engineLogin` while it already wrote something that was not a
        // login; a handler whose name is a lie is the next reader's bug.
        document.querySelectorAll('[data-engcmd]').forEach(b =>
            b.addEventListener('click', () =>
                vscode.postMessage({ type: 'engineCommand', command: b.dataset.engcmd })));
        document.querySelectorAll('[data-engkey]').forEach(b =>
            b.addEventListener('click', () =>
                vscode.postMessage({ type: 'engineKey', name: b.dataset.engkey })));
        document.querySelectorAll('[data-engdocs]').forEach(b =>
            b.addEventListener('click', () =>
                vscode.postMessage({ type: 'engineDocs', url: b.dataset.engdocs })));
        onClick('openengines', 'openEngines');
        onClick('promptspick', 'promptsPick');
        onClick('promptsopen', 'promptsOpen');
        onClick('promptsreload', 'promptsReload');
        onClick('promptsdefault', 'promptsUseDefault');
        const filterEl = document.getElementById('filter');
        filterEl.addEventListener('input', () => {
            // the box is a QUERY, not a substring — media/afQuery.js. Kept as
            // typed: the grammar decides its own case handling.
            filter = filterEl.value;
            render();
            const el = document.getElementById('filter');
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
        });
        document.querySelectorAll('.catnav a').forEach(a =>
            a.addEventListener('click', () => {
                const h = document.getElementById('cat-' + a.dataset.cat);
                if (h && h.scrollIntoView) { h.scrollIntoView({ behavior: 'smooth' }); }
            }));
        document.querySelectorAll('[data-guide]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'openGuide', anchor: el.dataset.guide })));

        document.querySelectorAll('[data-set]').forEach(el =>
            el.addEventListener('change', () => {
                delete errors[el.dataset.set];
                const value = el.type === 'checkbox' ? el.checked : el.value;
                vscode.postMessage({ type: 'set', key: el.dataset.set, value });
            }));
        document.querySelectorAll('[data-apply]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.apply;
                delete errors[key];
                const ta = document.getElementById('c-' + shortKey(key));
                vscode.postMessage({ type: 'set', key, value: ta ? ta.value : '' });
            }));
        document.querySelectorAll('[data-reset]').forEach(btn =>
            btn.addEventListener('click', () => {
                delete errors[btn.dataset.reset];
                vscode.postMessage({ type: 'reset', key: btn.dataset.reset });
            }));
        // The host opens the native dialog and saves what comes back — the page
        // never has to know the path, and the refresh that follows redraws the
        // box with it.
        document.querySelectorAll('[data-browse]').forEach(btn =>
            btn.addEventListener('click', () => {
                delete errors[btn.dataset.browse];
                vscode.postMessage({ type: 'browse', key: btn.dataset.browse, kind: btn.dataset.browsekind });
            }));

        // Agent folders section
        const rootAdd = document.getElementById('rootadd');
        if (rootAdd) { rootAdd.addEventListener('click', () => vscode.postMessage({ type: 'rootAdd' })); }
        const cleanDupes = document.getElementById('afcleandupes');
        if (cleanDupes) { cleanDupes.addEventListener('click', () => vscode.postMessage({ type: 'rootCleanDupes' })); }
        document.querySelectorAll('[data-rootremove]').forEach(btn =>
            btn.addEventListener('click', () => vscode.postMessage({ type: 'rootRemove', root: btn.dataset.rootremove })));
        document.querySelectorAll('[data-rootreveal]').forEach(btn =>
            btn.addEventListener('click', () => vscode.postMessage({ type: 'rootReveal', root: btn.dataset.rootreveal })));
        document.querySelectorAll('[data-exclude]').forEach(a =>
            a.addEventListener('click', () => vscode.postMessage({ type: 'agentExclude', dir: a.dataset.exclude })));
        document.querySelectorAll('[data-include]').forEach(a =>
            a.addEventListener('click', () => vscode.postMessage({ type: 'agentInclude', dir: a.dataset.include })));
        document.querySelectorAll('[data-openagent]').forEach(a =>
            a.addEventListener('click', () => vscode.postMessage({ type: 'openAgent', agentId: a.dataset.openagent })));
        document.querySelectorAll('[data-agmodel]').forEach(el =>
            el.addEventListener('change', () => {
                if (el.value === '__custom__') {
                    customModelDir = el.dataset.agmodel;
                    render();
                    const inp = document.querySelector('[data-agcustom]');
                    if (inp && inp.focus) { inp.focus(); }
                    return;
                }
                vscode.postMessage({ type: 'agentModel', dir: el.dataset.agmodel, model: el.value, engine: agentEngine() });
            }));
        document.querySelectorAll('[data-ageffort]').forEach(el =>
            el.addEventListener('change', () => vscode.postMessage({
                type: 'agentEffort', dir: el.dataset.ageffort, effort: el.value, engine: agentEngine()
            })));
        // ‼️ The engine strip is a PAGE state, not a per-agent one: it says which
        // engine's defaults the boxes below are editing. Kept on the host so it
        // survives the refresh that follows every write.
        document.querySelectorAll('[data-agengine]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({
                type: 'agentDefaultsEngine', engine: b.dataset.agengine
            })));
        document.querySelectorAll('[data-agcustom]').forEach(el =>
            el.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') {
                    customModelDir = '';
                    vscode.postMessage({ type: 'agentModel', dir: el.dataset.agcustom, model: el.value.trim(), engine: agentEngine() });
                } else if (ev.key === 'Escape') {
                    customModelDir = '';
                    render();
                }
            }));

        // Claude Code section
        document.querySelectorAll('[data-ccset]').forEach(el =>
            el.addEventListener('change', () => {
                delete errors['cc:' + el.dataset.ccset];
                const value = el.type === 'checkbox' ? el.checked : el.value;
                vscode.postMessage({ type: 'ccSet', id: el.dataset.ccset, value });
            }));
        document.querySelectorAll('[data-ccclear]').forEach(btn =>
            btn.addEventListener('click', () => {
                delete errors['cc:' + btn.dataset.ccclear];
                vscode.postMessage({ type: 'ccClear', id: btn.dataset.ccclear });
            }));
        const ccOpen = document.getElementById('ccopen');
        if (ccOpen) { ccOpen.addEventListener('click', () => vscode.postMessage({ type: 'ccOpenFile' })); }
        const ccApply = document.getElementById('ccrawapply');
        if (ccApply) {
            ccApply.addEventListener('click', () => {
                delete errors['cc:__raw__'];
                const ta = document.getElementById('ccraw');
                vscode.postMessage({ type: 'ccRaw', text: ta ? ta.value : '' });
            });
        }

        // profiles
        const sel = document.getElementById('profsel');
        document.getElementById('profapply').addEventListener('click', () => {
            if (sel && sel.value) { vscode.postMessage({ type: 'applyProfile', name: sel.value }); }
        });
        document.getElementById('profdel').addEventListener('click', () => {
            if (sel && sel.value) { vscode.postMessage({ type: 'deleteProfile', name: sel.value }); }
        });
        document.getElementById('profsave').addEventListener('click', () => {
            saveOpen = !saveOpen;
            render();
            const inp = document.getElementById('profname');
            if (inp) { inp.focus(); }
        });
        const confirm = document.getElementById('profconfirm');
        if (confirm) {
            const send = () => {
                const inp = document.getElementById('profname');
                if (inp && inp.value.trim()) {
                    vscode.postMessage({ type: 'saveProfile', name: inp.value.trim() });
                    saveOpen = false;
                }
            };
            confirm.addEventListener('click', send);
            document.getElementById('profname').addEventListener('keydown', ev => { if (ev.key === 'Enter') { send(); } });
        }
        document.getElementById('profexport').addEventListener('click', () => vscode.postMessage({ type: 'exportProfiles' }));
        document.getElementById('profimport').addEventListener('click', () => vscode.postMessage({ type: 'importProfiles' }));

        // hold background refreshes while a field has focus
        const app = document.getElementById('app');
        if (app.addEventListener) {
            app.addEventListener('focusin', ev => {
                const t = ev.target;
                if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) { editing = true; }
            });
            app.addEventListener('focusout', () => {
                editing = false;
                if (pendingData) { DATA = pendingData; pendingData = null; render(); }
            });
        }
    }

    function focusKey(key) {
        const el = document.querySelector(`[data-item="${key}"]`);
        if (!el) { return; }
        if (el.scrollIntoView) { el.scrollIntoView({ block: 'center' }); }
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 2500);
    }

    // ------------------------------------------------------- right-click menu

    /**
     * A setting and an agent root, from the right button. Reset and Remove are
     * the page's own messages; the rest is what a settings row was never able
     * to answer — what is this called, what is it set to, and where does VS
     * Code's own editor show it.
     */
    function ctxDo(act, ctx) {
        const verb = act.split(':')[0];
        const arg = act.slice(verb.length + 1);
        switch (verb) {
            case 'stReset':
                delete errors[ctx.setKey];
                vscode.postMessage({ type: 'reset', key: String(ctx.setKey || '') });
                return;
            case 'stOpenUi':
                vscode.postMessage({ type: 'openSettingsUi', key: String(ctx.setKey || '') });
                return;
            case 'stCopy': {
                if (arg === 'key') { window.AFCtx.copy(ctx.setKey); return; }
                // The settings live inside their categories, not in a flat list.
                let it;
                for (const cat of (DATA.categories || [])) {
                    it = (cat.items || []).find(x => x.key === ctx.setKey);
                    if (it) { break; }
                }
                const v = it ? it.value : undefined;
                window.AFCtx.copy(v === undefined || v === null ? ''
                    : typeof v === 'object' ? JSON.stringify(v) : String(v));
                return;
            }
            case 'rtReveal': vscode.postMessage({ type: 'rootReveal', root: String(ctx.rootPath || '') }); return;
            case 'rtRemove': vscode.postMessage({ type: 'rootRemove', root: String(ctx.rootPath || '') }); return;
            case 'rtAdd': vscode.postMessage({ type: 'rootAdd' }); return;
            case 'rtCopy': window.AFCtx.copy(ctx.rootPath); return;
        }
    }

    // ‼️ ONCE, at module scope — render() rebinds every control on every change.
    window.AFCtx.listen(ctxDo);

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') {
            if (editing) { pendingData = { ...DATA, ...ev.data.data }; return; }
            DATA = { ...DATA, ...ev.data.data };
            render();
            return;
        }
        if (ev.data.type === 'error') {
            errors[ev.data.key] = ev.data.error;
            render();
            focusKey(ev.data.key);
            return;
        }
        if (ev.data.type === 'ccError') {
            errors['cc:' + ev.data.id] = ev.data.error;
            render();
            focusKey('cc:' + ev.data.id);
            return;
        }
        if (ev.data.type === 'focus') { focusKey(ev.data.key); }
    });

    render();
    if (DATA.focus) { focusKey(DATA.focus); }
})();
