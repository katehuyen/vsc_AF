// Agent Farm — Farm Settings: the Agent folders section — roots, the agents found in them, and each agent's engine defaults.
// Split out of media/settings.js unchanged (U-225): the page hands its state in once, as X.
(function () {
    'use strict';
    let X, C;
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    function N_(s) { return s; }
    const many = (n, one, other) => (n === 1 ? t(one) : t(other, { n }));

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
    const agentEngine = () => (X.DATA.agentDefaultsEngine || 'claude');
    const engineRows = () => (X.DATA.engines || []);
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
    /**
     * X-255 -- AND THE LINE NAMES THE MODEL RATHER THAN "these defaults".
     *
     * It used to say, of Claude, that what you type below is written to the
     * agent's own settings file. That was true of one box and is now false of
     * another: an account is a directory handed to the process at spawn and
     * Claude Code has no settings key for one, so the sentence above the list has
     * to say which box it is about or it is a claim the reader can check and find
     * wrong (the same U-29 failure this strip exists to end).
     */
    function agentEngineNote(id) {
        return id === 'claude'
            ? 'the MODEL is written to each agent\u2019s .claude/settings.local.json \u2014 the CLI reads it itself, terminal sessions included; the effort and the account are Agent Farm\u2019s and reach only sessions it starts'
            // \u203c\ufe0f U-59 \u2014 no flag is named here any more. It said
            // `--model/--effort` for every non-Claude engine and that was wrong
            // on three of the four (Codex and Gemini take `-m`; OpenCode takes
            // `-m` and calls the effort `--variant`). The per-box note below
            // names the real flag, asked of the engine's own builder; this line
            // is the one sentence above the whole list and now says only the
            // thing that is true of all of them.
            : 'kept by Agent Farm and passed on the command line \u2014 nothing is written to a per-folder file the engine reads on its own';
    }

    // Model names for the CHOSEN engine, read from that engine's own catalog
    // where it has one (see core/models.ts); the alias list is the fallback
    // for an engine that publishes nothing.
    const modelAliases = () => {
        const em = (X.DATA.engineModels || {})[agentEngine()];
        if (em && em.models && em.models.length) {
            return em.models.filter(m => m.id).map(m => m.id);
        }
        return (X.DATA.modelAliases && X.DATA.modelAliases.length) ? X.DATA.modelAliases : ['haiku', 'sonnet', 'opus', 'fable'];
    };

    function agentModelSel(c) {
        const eng = agentEngine();
        const per = (c.engines || {})[eng] || {};
        const cur = per.model || '';
        if (X.customModelDir === c.dir) {
            return `<input type="text" class="agmodel agcustom" data-agcustom="${C.esc(c.dir)}" value="${C.esc(cur)}"
                placeholder="model id — Enter saves, Esc cancels"
                title="Free-text model id, written to the agent's .claude/settings.local.json. To keep a name for every picker, add it to agentFarm.modelAliases.">`;
        }
        const aliases = modelAliases();
        const opts = cur && aliases.indexOf(cur) < 0 ? [cur].concat(aliases) : aliases;
        /**
         * ‼️ B-03.21 (round 2), APPLIED HERE TOO — THE AXIS IS THE
         * HEADING OF THE LIST, NOT A PREFIX ON EVERY VALUE IN IT.
         *
         * Round 1 answered "which box is this?" by writing the axis into every
         * option (`model: sonnet`). The Console measured that and found it the
         * worse of the two halves: the prefix is the part that never changes,
         * so it is the part that survives the clipping, and the VALUE — the
         * only half a reader is looking for — is what gets cut. A native
         * `<optgroup>` label is a heading the browser draws at the top of the
         * OPEN list and refuses to let anybody select, so the axis is named
         * exactly where the choosing happens, once, and costs the collapsed box
         * nothing at all. The Console moved and this page did not, which left
         * one question answered two ways in one product.
         *
         * ‼️ AND THE ZERO ROW IS RESOLVED WITHOUT THIS AGENT'S OWN ANSWER.
         * `per.resolved` walks every layer INCLUDING the value this very box
         * holds, so on an agent whose model is `sonnet` the row that means
         * "clear my choice" read `Default → sonnet` — the name of the one
         * thing you cannot get by picking it. `per.resolvedZero` is the same
         * resolver with this agent's own layers left out: what would really
         * apply if the box were cleared. `res` is still the box's own hover,
         * because that sentence is about what applies NOW.
         *
         * The explanation that used to be IN the label — "(the CLI decides)"
         * — is in the hover, where the rest of that sentence already was.
         */
        const res = per.resolved || {};
        const zeroRes = per.resolvedZero || {};
        const zero = zeroRes.value ? `Default → ${zeroRes.value}` : 'Default';
        return `<select class="agmodel" data-agmodel="${C.esc(c.dir)}"
            title="${C.esc('Default model for this agent on ' + engineLabel(eng) + '. ' + (res.note || ''))}">
            <optgroup label="model">
            ${C.option('', zero, {
                selected: !cur,
                detail: zeroRes.note || 'This agent names no model of its own.'
            })}
            ${opts.map(m => C.option(m, m, {
                selected: cur === m,
                detail: aliases.indexOf(m) < 0 ? 'Set by hand — this engine does not list this model.' : ''
            })).join('')}
            ${C.option('__custom__', 'custom…', { detail: 'Type a model id this engine is not offering here.' })}
            </optgroup>
        </select>`;
    }

    /** …and the effort beside it, from the same engine's own vocabulary: a
     *  model with no effort levels must not be offered five (see core/models.ts). */
    function agentEffortSel(c) {
        const eng = agentEngine();
        const per = (c.engines || {})[eng] || {};
        const em = (X.DATA.engineModels || {})[eng] || {};
        const list = ((em.efforts || {})[per.model || ''] || (em.efforts || {})[''] || [])
            .filter(e => e.id);
        if (!list.length) { return ''; }
        const cur = per.effort || '';
        const res = per.resolvedEffort || {};
        // ‼️ …and the same shape here: the axis is the optgroup's heading, and
        // the zero row is resolved WITHOUT this agent's own answer.
        const zeroRes = per.resolvedEffortZero || {};
        const zero = zeroRes.value ? `Default → ${zeroRes.value}` : 'Default';
        return `<select class="agmodel" data-ageffort="${C.esc(c.dir)}"
            title="${C.esc('Default reasoning effort for this agent on ' + engineLabel(eng) + '. ' + (res.note || ''))}">
            <optgroup label="effort">
            ${C.option('', zero, {
                selected: !cur,
                detail: zeroRes.note || 'This agent names no effort of its own.'
            })}
            ${list.map(e => C.option(e.id, e.label || e.id, { selected: cur === e.id, detail: e.detail || '' })).join('')}
            </optgroup>
        </select>`;
    }

    /**
     * X-255 -- WHICH SIGN-IN THIS AGENT STANDS ON, beside the model and the
     * effort because it is the same question one axis over: those say what the
     * session is, this says whose plan pays for it.
     *
     * Drawn only where this engine has captured sign-ins at all -- on every
     * other one the box would be a control with nothing to choose between.
     *
     * ONE SUBJECT: this row is the AGENT's answer. The Engines page's standing
     * chip is the MACHINE's, and the zero row here is what names it, so a reader
     * who clears this box can see what they are falling back to.
     */
    function agentAccountSel(c) {
        const eng = agentEngine();
        const per = (c.engines || {})[eng] || {};
        const list = per.accounts || [];
        if (!list.length) { return ''; }
        const cur = per.account || '';
        const res = per.resolvedAccount || {};
        const zeroRes = per.resolvedAccountZero || {};
        const zero = zeroRes.id ? 'Default → ' + (labelOfAccount(list, zeroRes.id) || zeroRes.id) : 'Default';
        return `<select class="agmodel" data-agaccount="${C.esc(c.dir)}"
            title="${C.esc('Standing sign-in for this agent on ' + engineLabel(eng) + '. ' + (res.note || ''))}">
            <optgroup label="account">
            ${C.option('', zero, {
                selected: !cur,
                detail: zeroRes.note || 'This agent names no sign-in of its own.'
            })}
            ${list.map(a => C.option(a.id, a.label || a.id, {
                selected: cur === a.id,
                detail: cur === a.id ? (res.note || '') : ''
            })).join('')}
            </optgroup>
        </select>`;
    }

    const labelOfAccount = (list, id) => {
        const hit = (list || []).find(a => a.id === id);
        return hit ? (hit.label || hit.id) : '';
    };

    function agentChip(c) {
        if (c.excluded) {
            return `<span class="agchip agexcl" title="${C.esc(c.dir)} — excluded, never treated as an agent">${C.esc(c.name)}
                <a data-include="${C.esc(c.dir)}" title="Treat this folder as an agent again">Include</a></span>`;
        }
        const name = c.agentId
            ? `<a data-openagent="${C.esc(c.agentId)}" title="Open this agent's page">${C.esc(c.name)}</a>`
            : C.esc(c.name);
        return `<span class="agchip" title="${C.esc(c.dir)}">${name}
            ${agentModelSel(c)}${agentEffortSel(c)}${agentAccountSel(c)}
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
        const f = X.DATA.folders;
        if (!f) { return ''; }
        const fq = window.AFQuery.compile(X.filter);
        const reports = f.reports.filter(r =>
            fq.test(r.root + ' ' + r.candidates.map(c => c.name).join(' ')));
        if (X.filter && !reports.length) { return ''; }
        const dupes = f.reports.some(r => r.duplicate);
        const missing = f.reports.filter(r => r.kind === 'missing').length;
        const agentCount = f.reports.reduce((a, r) => a + (r.duplicate ? 0 : r.candidates.filter(c => !c.excluded).length), 0);
        // excludes that no current root explains — stale leftovers, offered for removal
        const known = new Set(f.reports.flatMap(r => r.candidates.map(c => pnorm(c.dir))));
        const stale = (f.excludes || []).filter(x => !known.has(pnorm(x)));
        // U-233 — the one card: the warning a reader must act on leads, the roots and their agents wait behind Details
        const status = !f.reports.length ? t('No folder is scanned for agents yet.')
            : dupes ? t('The same folder is listed more than once (its spelling differs), which distorts discovery.')
                : missing ? many(missing, N_('One folder on the list does not exist on this machine.'), N_('{n} folders on the list do not exist on this machine.'))
                    : t('{agents} found in {folders}.', {
                        agents: many(agentCount, N_('One agent'), N_('{n} agents')),
                        folders: many(f.reports.length, N_('one folder'), N_('{n} folders'))
                    });
        const warn = !f.reports.length || dupes || missing > 0;
        return X.cardHtml({
            id: 'cat-folders', icon: '📁', title: t('Agent folders'), state: warn ? 'warn' : 'ok', status,
            actions: `<button class="secondary small" id="rootadd" title="${C.esc(t('Pick a folder to scan for agents'))}">${C.esc(t('+ Add folder…'))}</button>`
                + (dupes ? ` <button class="secondary small" id="afcleandupes" title="${C.esc(t('Keep the first spelling of each folder and remove the rest'))}">${C.esc(t('Clean duplicates'))}</button>` : ''),
            tip: t('Where your agents live. Each folder on this list is scanned: a subfolder with a CLAUDE.md, a .claude folder or a memory folder becomes an agent. A folder whose subfolders are agents is a nest, and its own CLAUDE.md holds the instructions they all share; a folder with no agent-like subfolders is one agent by itself. Exclude keeps a folder out of the farm everywhere (views, analytics, session ownership) until you Include it back. Each agent carries a model, an effort and, where the engine has captured sign-ins, an account: its defaults for the engine picked above the list. That account outranks the machine-wide standing choice on the Engines page. New agents start from the setting New agent model.'),
            open: warn || !!X.filter,
            details: `${agentEngineTabs()}
            ${reports.map(rootItemHtml).join('')}
            ${stale.length ? `<div class="setitem">
                <div class="sethead"><span class="setname">Excluded, but not under any root</span></div>
                <div class="setdesc">Leftover exclude entries that match nothing anymore — safe to remove.</div>
                <div class="aglist">${stale.map(x =>
                    `<span class="agchip agexcl" title="${C.esc(x)}">${C.esc(x)} <a data-include="${C.esc(x)}" title="Remove this stale entry">Remove</a></span>`).join('')}</div>
            </div>` : ''}`
        });
    }

    window.AFSettingFolders = function (ctx) {
        X = ctx;
        ({ C } = ctx);
        return { agentEngine, foldersSection };
    };
})();
