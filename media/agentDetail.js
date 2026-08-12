// Agent Farm — agent detail page script.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    // While the pricing editor is open we skip background re-renders so live
    // refreshes don't wipe half-typed rates. DATA still updates silently.
    let suspendRender = false;

    /**
     * ‼️ WHICH ENGINES THIS AGENT IS ACTUALLY DRIVEN WITH (X-35).
     *
     * The Sessions card counted only the sessions the money above it was
     * measured from — Claude's — so an agent the user mostly runs through Codex
     * read as an agent that had barely worked, next to a table full of rows, with
     * nothing on the page to explain the gap. The card now counts every session
     * and this line says how they split, in the shared badge's own words. When
     * every session is Claude's it says nothing at all: a split with one side is
     * not a split.
     */
    function engineSplit(t) {
        const by = t.byEngine || {};
        const ids = Object.keys(by);
        if (ids.length < 2) { return ''; }
        const order = window.AFEngine.known;
        const rank = id => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
        const parts = ids.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
            .map(id => `${window.AFEngine.badge(id)} ${by[id]}`).join(' ');
        // …and which of them the money is measured from, because that is the
        // question the split immediately raises.
        const unmeasured = (t.allSessions || 0) - (t.measuredSessions || 0);
        return parts + (unmeasured > 0
            ? ` <span class="muted" title="Cost, tokens, the model split and the daily chart on this page are measured off Claude's own transcript format and cannot be computed for another engine — those ${unmeasured} sessions are listed in the table below but are not in the figures above.">· ${unmeasured} not in the figures</span>`
            : '');
    }

    // The two places a session can live. One vocabulary for all three start
    // buttons, and the same words the host's own picker uses (pickRunSurface),
    // so the answer reads the same whichever surface asked.
    const SURFACES = [
        {
            id: 'terminal', label: 'In a terminal',
            title: 'A real claude terminal — the full TUI, slash commands, /resume'
        },
        {
            id: 'console', label: 'In the Console',
            title: 'Inside the panel — the conversation stays with Agent Farm'
        }
    ];

    // Shared advanced Sessions table (sort box, turn accordion, single-open,
    // ⌨ jump-to-terminal) — the same component the dashboard uses. It re-renders
    // only its own container, so an open pricing editor is never clobbered.
    const sessTable = window.AFSessionsTable.create({
        vscode, C,
        containerId: 'sessblock',
        // Project rides here too (S-5): this page is the one place a session was
        // listed with no answer to "which project was that for", while the
        // filter panel underneath could already narrow by project — a filter
        // over a column the reader could not see.
        columns: ['origin', 'engine', 'title', 'project', 'when', 'duration', 'turns', 'tools', 'files', 'errors', 'tokens', 'ctx', 'cost'],
        tableN: 50, // agent-page default; the All chip toggles back to this
        stateKey: 'agent'
    });

    window.addEventListener('message', ev => {
        if (sessTable.onMessage(ev)) { return; }
        const m = ev.data;
        if (m.type === 'data') { DATA = m.data; if (!suspendRender) render(); return; }
        // ---- the duty form's three messages (U-14)
        if (m.type === 'duty-compose') { openDutyForm(m.seed || {}); return; }
        if (m.type === 'duty-msg') {
            dutyMsg = String(m.text || '');
            dutyMsgOk = m.ok === true;
            // A receipt means the write happened: the form has done its job and
            // stays out of the way. A refusal keeps it open with what was typed.
            if (dutyMsgOk) { dutyForm = null; }
            render();
            return;
        }
        if (m.type === 'af-browsed' && dutyForm) {
            window.AFForm.browsed(dutyForm, m);
            render();
            return;
        }
    });

    // --------------------------------------------------------- STANDING DUTIES
    /**
     * ‼️ THE PAGE MAKES THE DUTY. IT DOES NOT OPEN A DIALOG THAT DOES.
     *
     * This page has always DRAWN an agent's duties — the table below is older
     * than most of the extension. What it could not do was make one. `addDuty`
     * asked five questions in a row (title → cadence → how to name the watch
     * target → the target itself → what to do), `editDuty` asked five more and
     * started from the top every time, `addDutyFromTemplate` and `copyDuty`
     * were a quickpick each — and Esc anywhere in any of them threw the lot
     * away. Meanwhile the one thing a duty is FOR — being read by the agent
     * every session — depends on fields that chain never showed together.
     *
     * So: one card, on the page, under the table it belongs to, and every route
     * in opens it (this button, the row's edit, the palette, the sidebar tree,
     * the right-click menu). The three writes it can make are the three the
     * dialogs made — add, edit, copy-to-another-agent — and it makes them with
     * the whole duty visible while you decide.
     */
    let dutyForm = null;      // null = closed; an object = the draft
    let dutyMsg = '';         // a refusal or a receipt, shown where the form was
    let dutyMsgOk = false;

    function newDutyDraft(seed) {
        const s = seed || {};
        return {
            mode: s.mode === 'edit' || s.mode === 'copy' ? s.mode : 'new',
            oldTitle: s.oldTitle || '',
            target: s.target || '',
            title: s.title || '',
            cadence: s.cadence || 'every-turn',
            watch: s.watch || '',
            action: s.action || '',
            note: s.note || '',
            paused: !!s.paused,
            template: ''
        };
    }

    function openDutyForm(seed) {
        dutyForm = newDutyDraft(seed);
        dutyMsg = '';
        dutyMsgOk = false;
        render();
        const box = document.getElementById('dutyform');
        if (box) { box.scrollIntoView(); }
    }

    /** A ready-made pattern is a STARTING POINT, not a separate command.
     *  `addDutyFromTemplate` was its own quickpick that then went straight to a
     *  file dialog and wrote the duty unseen — "right-click → Edit Duty… to
     *  fine-tune", said its own confirmation. Here it fills the form you are
     *  already looking at, and nothing is written until you say so. */
    function applyTemplate(id) {
        const t = ((DATA.dutyMeta || {}).templates || []).find(x => x.id === id);
        if (!t) { return; }
        dutyForm.title = t.title;
        dutyForm.cadence = t.cadence;
        dutyForm.action = t.action;
        dutyForm.watchKind = t.watchKind;
    }

    function dutyFormHtml() {
        const F = window.AFForm;
        const meta = DATA.dutyMeta || {};
        const d = dutyForm;
        const copying = d.mode === 'copy';
        const editing = d.mode === 'edit';
        const targets = (meta.agents || []).map(a => ({
            id: a.id, name: a.name,
            clash: a.titles.indexOf(d.title) >= 0
        }));
        const LEDE = {
            'new': 'A duty is a standing agreement: keep watching X, and when something is there, do Y. The agent reads DUTIES.md every session and re-checks the [every-turn] ones every turn.',
            edit: 'Editing rewrites this duty\'s block in DUTIES.md. Everything else in the file — your own notes, the order, the header — is left exactly as it is.',
            copy: 'The same agreement, on another agent. It is copied, not shared: editing one afterwards does not touch the other.'
        };
        const body =
            F.grid([
                !editing && !copying ? F.sel('template', 'Start from', [{ id: '', label: '— blank —' }]
                    .concat((meta.templates || []).map(t => ({ id: t.id, label: t.label, title: t.detail }))),
                    d.template, {
                    redraw: true,
                    tip: 'A proven pattern, dropped into the fields below. Nothing is written until you press the button — change any of it first.'
                }) : '',
                copying ? F.sel('target', 'Copy to', [{ id: '', label: '— pick an agent —' }]
                    .concat(targets.map(a => ({
                        id: a.id, label: a.name + (a.clash ? '  ⚠ already has this title' : '')
                    }))), d.target, {
                    redraw: true,
                    tip: 'Which agent gets its own copy of this duty.'
                }) : '',
                F.text('title', 'Title', d.title, {
                    wide: true, required: true,
                    ph: 'e.g. Inbox triage',
                    tip: 'The heading its block is stored under in DUTIES.md — which is also how the extension finds it again, so two duties cannot share one.'
                }),
                F.sel('cadence', 'How often', meta.cadences || [], d.cadence, {
                    tip: 'How often the agent re-checks it. [every-turn] is the strongest and the most expensive: it is read on every single turn.'
                }),
                F.check('paused', 'paused', d.paused, {
                    tip: 'A paused duty stays in the file, marked, and the agent is told to skip it.'
                })
            ])
            + F.sec('Watch', 'What the agent looks at. A real path lets the page report whether work is waiting; a description is allowed, and then there is nothing to measure.')
            + F.grid([
                F.path('watch', 'Watched file or folder', d.watch, {
                    kind: d.watchKind === 'file' ? 'file' : 'folder',
                    ph: '(optional) D:/…  — or a description, if there is no path'
                })
            ])
            + F.sec('Do', 'What happens when something is there. This is the half a duty is actually for.')
            + F.grid([
                F.area('action', '', d.action, {
                    rows: 3, required: true,
                    ph: 'e.g. Act on the answered questions, then remove them from the file; add any new question you need answered.',
                    tip: 'Written into the block as “Do:”. Ctrl+Enter saves.'
                }),
                F.text('note', 'Note', d.note, {
                    wide: true, ph: '(optional) anything the agent should know about this duty',
                    tip: 'A free line kept with the duty — context that is neither the watch nor the action.'
                })
            ]);
        return F.card({
            id: 'dutyform',
            title: copying ? 'Copy duty' : editing ? 'Edit duty' : 'New duty',
            lede: LEDE[d.mode],
            body: body,
            msg: dutyMsg,
            warn: !dutyMsgOk,
            submit: copying ? 'Copy it' : editing ? 'Save changes' : 'Add the duty'
        });
    }

    function wireDutyForm() {
        const F = window.AFForm;
        const box = document.getElementById('dutyform');
        if (!box || !dutyForm) { return; }
        F.wire(box, {
            onEdit: v => {
                const prevT = dutyForm.template;
                Object.assign(dutyForm, v);
                dutyForm._tChanged = v.template !== undefined && v.template !== prevT;
            },
            onRedraw: () => {
                if (dutyForm._tChanged && dutyForm.template) { applyTemplate(dutyForm.template); }
                dutyForm._tChanged = false;
                render();
            },
            onBrowse: (key, kind) => vscode.postMessage({
                type: 'af-browse', key: key, kind: kind,
                title: 'What should the agent watch?'
            }),
            onSubmit: () => {
                dutyMsg = '';
                vscode.postMessage({ type: 'duty-save', duty: dutyForm });
            },
            onCancel: () => { dutyForm = null; dutyMsg = ''; render(); }
        });
    }

    function relTime(ts) {
        if (!ts) return 'never';
        const s = Math.round((Date.now() - ts) / 1000);
        if (s < 60) return s + 's ago';
        const m = Math.round(s / 60);
        if (m < 60) return m + 'm ago';
        const h = Math.round(m / 60);
        if (h < 24) return h + 'h ago';
        return Math.round(h / 24) + 'd ago';
    }

    function dayKeysBack(n) {
        const out = [];
        const now = new Date();
        for (let i = n - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
        }
        return out;
    }

    function render() {
        const a = DATA.agent;
        const days = dayKeysBack(30);
        const costSeries = [{ name: a.name, values: days.map(d => DATA.daily[d] ? DATA.daily[d].cost : 0) }];

        const ctx = a.contextLoad;
        const budget = a.contextBudget;
        const pct = Math.min(100, Math.round(100 * ctx.total / budget));
        const ctxHtml = `
            <div class="card chartbox">
                <h3>Fixed context load <a data-guide="saglik-baglam-yuku">?</a></h3>
                <div class="kpi">~${C.fmtTok(ctx.total)} <span class="muted" style="font-size:12px">tokens / session</span></div>
                <div class="progress"><div class="${pct > 85 ? 'hot' : ''}" style="width:${pct}%"></div></div>
                <div class="sub">${pct}% of ${C.fmtTok(budget)} budget</div>
                ${C.hbars([
                    { name: 'CLAUDE.md', value: ctx.claudeMd },
                    { name: 'MEMORY.md', value: ctx.memoryIndex },
                    { name: 'AGENTS.md', value: ctx.agentsMd }
                ].filter(x => x.value > 0), { fmt: C.fmtTok })}
            </div>`;

        const toolItems = Object.entries(DATA.tools)
            .map(([name, value]) => ({ name, value }))
            .sort((x, y) => y.value - x.value)
            .slice(0, 10);

        const modelItems = Object.entries(DATA.models)
            .map(([name, v]) => ({ name: name.replace(/^claude-/, ''), value: v.cost }))
            .sort((x, y) => y.value - x.value);

        const sevIcon = { error: '⛔', warning: '⚠', info: 'ℹ' };
        const insightsHtml = DATA.insights.length
            ? DATA.insights.map(i => `
                <tr class="${i.filePath ? 'click' : ''}" ${i.filePath ? `data-file="${C.esc(i.filePath)}"` : ''}
                    ${window.AFCtx.row('afInsightRow', {
                    insFile: i.filePath || '', insAnchor: i.anchor || '',
                    insText: [i.severity, i.category, i.message].filter(Boolean).join(' · ')
                })}
                    title="${C.esc(window.AFCtx.hint(i.category))}">
                    <td>${sevIcon[i.severity]}</td>
                    <td>${C.esc(i.category)}</td>
                    <td>${C.esc(i.message)} <a data-guide="${C.esc(i.anchor)}">?</a></td>
                </tr>`).join('')
            : '<tr><td colspan="3" class="muted">No findings — healthy agent. 🌿</td></tr>';

        const memHtml = a.memoryFiles.map(f => `
            <tr class="click" data-file="${C.esc(f.path)}"
                ${window.AFCtx.row('afMemoryRow', { memPath: f.path, memName: f.name, agentId: a.id })}
                title="${C.esc(window.AFCtx.hint(f.path))}">
                <td>${C.esc(f.name)}${f.orphan ? ' <span title="not referenced in MEMORY.md">⚠</span>' : ''}</td>
                <td class="num">${(f.size / 1024).toFixed(1)} KB</td>
                <td class="num">~${C.fmtTok(f.tokens)}</td>
                <td class="num">${relTime(f.mtime)}</td>
                <td class="num">${f.recalls === -1 ? '<span class="muted" title="index — loads every session">index</span>'
                    : f.recalls > 0 ? `<span style="color:var(--vscode-charts-green,#4caf50)">×${f.recalls}</span>`
                    : '<span class="muted">0</span>'}</td>
            </tr>`).join('');

        // X2 — one card answering "is this agent's mind lean and actually used?"
        const ch = DATA.contextHealth;
        const warn = v => v > 0 ? `<span style="color:var(--vscode-charts-yellow,#cca700)">${v}</span>` : '0';
        const dutyRead = ch.duties.active === 0 ? '—'
            : ch.duties.lastReadTs ? relTime(ch.duties.lastReadTs)
            : (ch.duties.sessionsThisWeek > 0 ? '<span style="color:var(--vscode-charts-red,#f14c4c)">never</span>' : 'never');
        const healthHtml = `
            <div class="card">
                <h3>Context health <a data-guide="hafiza-yonetimi">?</a></h3>
                <div class="sub" style="line-height:1.9">
                    <strong>Memory:</strong> ${ch.memory.files} files · ~${C.fmtTok(ch.memory.tokens)} tok on demand ·
                        ${warn(ch.memory.orphans)} orphan · ${warn(ch.memory.notRecalled)} not recalled (30d) · ${warn(ch.memory.stale)} stale (45d+)<br>
                    <strong>Skills:</strong> ${ch.skills.total} · ${warn(ch.skills.unused)} unused (30d)<br>
                    <strong>MCP:</strong> ${ch.mcp.total} server(s) · ${warn(ch.mcp.unused)} unused (30d)${ch.mcp.disabled ? ` · ${ch.mcp.disabled} disabled` : ''}<br>
                    <strong>Duties:</strong> ${ch.duties.active} active${ch.duties.paused ? ` · ${ch.duties.paused} paused` : ''} ·
                        DUTIES.md last read: ${dutyRead} <span class="muted">(${ch.duties.sessionsThisWeek} session(s) this week)</span>
                </div>
            </div>`;

        // Task health — how reliably does delegated work come back?
        const th = DATA.taskHealth;
        const red = t => `<span style="color:var(--vscode-charts-red,#f14c4c)">${t}</span>`;
        const green = t => `<span style="color:var(--vscode-charts-green,#4caf50)">${t}</span>`;
        const fmtDur = ms => {
            const sec = Math.round(ms / 1000);
            return sec < 90 ? `~${sec}s` : `~${Math.round(sec / 60)}m`;
        };
        let taskBody;
        if (!th || (!th.total && !th.queued && !th.running)) {
            taskBody = '<p class="muted">No task runs in the last 30 days — delegate work via the Tasks view.</p>';
        } else {
            const rate = th.successRate === undefined ? '—'
                : `${Math.round(th.successRate * 100)}%`;
            const rateHtml = th.successRate === undefined ? rate
                : th.successRate >= 0.8 ? green(rate) : th.successRate < 0.5 ? red(rate) : rate;
            const src = Object.entries(th.sources).filter(([, n]) => n > 0)
                .map(([k, n]) => `${k} ${n}`).join(' · ') || '—';
            taskBody = `
                <div class="sub" style="line-height:1.9">
                    <strong>Runs (30d):</strong> ${th.total} — ${th.done}✓ · ${th.failed ? red(th.failed + '✗') : '0✗'}${th.cancelled ? ` · ${th.cancelled} cancelled` : ''} · success ${rateHtml}<br>
                    <strong>Median duration:</strong> ${th.medianDurationMs !== undefined ? fmtDur(th.medianDurationMs) : '—'}${th.retries ? ` · ${th.retries} retr${th.retries > 1 ? 'ies' : 'y'}` : ''}${th.verifyPass || th.verifyFail ? ` · verify ${th.verifyPass}✓/${th.verifyFail}✗` : ''}<br>
                    <strong>Sources:</strong> ${src}${th.mediaCostUsd ? `<br><strong>Media cost:</strong> ${C.fmtUSD(th.mediaCostUsd)}` : ''}
                    ${th.queued || th.running ? `<br><strong>Now:</strong> ${th.running} running · ${th.queued} queued` : ''}
                    ${th.failStreak >= 2 ? `<br>${red(`⚠ last ${th.failStreak} runs failed`)}${th.lastFailure ? ` <span class="muted">(“${C.esc(th.lastFailure.title)}”, ${relTime(th.lastFailure.ts)})</span>` : ''}` : ''}
                </div>`;
        }
        const taskHtml = `
            <div class="card">
                <h3>Task health <a data-guide="gorev-sagligi">?</a></h3>
                ${taskBody}
            </div>`;

        // Model pricing editor — global rates in USD per 1M tokens. Editing
        // here applies to new sessions; earlier costs stay frozen at the rate
        // they were recorded with.
        const rules = DATA.pricing || [];
        const matches = (m, pat) => { try { return new RegExp(pat, 'i').test(m); } catch (e) { return false; } };
        const unpriced = Object.keys(DATA.models || {})
            .filter(m => !rules.some(r => matches(m, r.match)));
        const priceRows = rules.map((r, i) => `
            <tr data-prow="${i}">
                <td><input class="pmatch" value="${C.esc(r.match)}"></td>
                <td class="num"><input class="pnum" data-k="input" type="number" min="0" step="0.01" value="${r.input}"></td>
                <td class="num"><input class="pnum" data-k="output" type="number" min="0" step="0.01" value="${r.output}"></td>
                <td class="num"><input class="pnum" data-k="cacheWrite" type="number" min="0" step="0.01" value="${r.cacheWrite}"></td>
                <td class="num"><input class="pnum" data-k="cacheRead" type="number" min="0" step="0.01" value="${r.cacheRead}"></td>
                <td><button class="secondary prm" title="Remove">✕</button></td>
            </tr>`).join('');
        const pricingHtml = `
            <style>
                #pricingBox input{background:var(--vscode-input-background);color:var(--vscode-input-foreground);
                    border:1px solid var(--vscode-input-border,var(--vscode-contrastBorder,#3c3c3c));
                    border-radius:3px;padding:2px 5px;font:inherit}
                #pricingBox input.pnum{width:78px;text-align:right}
                #pricingBox input.pmatch{width:150px}
                #pricingBox summary{cursor:pointer;padding:4px 0;font-weight:600}
            </style>
            <h2>Model pricing <span class="muted small">— global · USD per 1M tokens</span></h2>
            <details class="card" id="pricingBox">
                <summary>Edit rates — applied to new sessions; past costs stay frozen</summary>
                <div class="tablewrap"><table>
                    <tr><th>Model (regex)</th><th class="num">Input</th><th class="num">Output</th><th class="num">Cache write</th><th class="num">Cache read</th><th></th></tr>
                    ${priceRows || '<tr><td colspan="6" class="muted">No rules — add one below.</td></tr>'}
                </table></div>
                ${unpriced.length ? `<div class="sub" style="color:var(--vscode-charts-yellow,#cca700)">Seen here with no rule (counted as $0): ${unpriced.map(C.esc).join(', ')}</div>` : ''}
                <div class="btnrow" style="margin-top:8px">
                    <button class="secondary" id="paddrow">Add model</button>
                    <button id="psave">Save rates</button>
                </div>
                <div class="sub muted">First matching rule wins. Saving records the new rate as of now — earlier sessions keep the rate they were billed at, and this is remembered next time.</div>
            </details>`;

        const t = DATA.totals;
        document.getElementById('app').innerHTML = `
            ${window.AFHeader.html({
                page: 'agent',
                title: `<span class="dot ${a.active ? 'on' : 'off'}"></span> ${C.esc(a.name)}`,
                sub: `${C.esc(a.dir)} · permissions: ${C.esc(a.permissionSummary)}`,
                // On an agent's own page the Console nav button means "talk to
                // THIS agent" (the ↗ next to it still opens the Console page).
                navActions: {
                    console: {
                        label: 'Talk to Agent',
                        title: 'Console — talk to this agent, or open the page'
                    }
                },
                // ‼️ Every button that STARTS a session asks where it runs: a
                // terminal, or the Console. They used to go straight to a
                // terminal without a word, which made the Console invisible from
                // the one page you start sessions from. The menu is the header's
                // own (AFHeader.menu), so it looks and behaves like the claimed
                // nav buttons next to it.
                actions: `${window.AFHeader.menu({
                    id: 'start', label: 'Start session',
                    title: 'Start a session for this agent — in a terminal or in the Console',
                    items: SURFACES
                })}
                    ${window.AFHeader.menu({
                        id: 'launch', label: 'Start session…',
                        title: 'Start a session after picking model · effort · permission mode · name · first prompt',
                        items: SURFACES
                    })}
                    ${window.AFHeader.menu({
                        id: 'continue', label: 'Continue latest',
                        title: 'Pick this agent\'s most recent session back up',
                        items: SURFACES
                    })}
                    <button class="secondary" id="reveal">Reveal folder</button>`,
                searchTitle: "Search all of this agent's sessions",
                guide: 'ajan-detay-sayfasi'
            })}
            <div class="row" ${window.AFCtx.agent(a)}
                title="${C.esc(window.AFCtx.AGENT_HINT)}">
                <div class="card"><div class="label">Total cost</div><div class="kpi">${C.fmtUSD(t.cost)}</div><div class="sub">avg ${C.fmtUSD(t.avgCostPerSession)} / session</div></div>
                <div class="card"><div class="label">Sessions</div><div class="kpi">${t.allSessions !== undefined ? t.allSessions : t.sessions}</div><div class="sub">${engineSplit(t)}</div></div>
                <div class="card"><div class="label">Tool calls</div><div class="kpi">${t.toolCalls}</div><div class="sub">${t.errors} errors</div></div>
                <div class="card"><div class="label">Memory</div><div class="kpi">${a.memoryFiles.length}</div><div class="sub">files</div></div>
            </div>
            <div class="row">
                <div class="card chartbox"><h3>Daily cost — last 30 days</h3>${C.stackedBars(days, costSeries, {})}</div>
                ${ctxHtml}
            </div>
            <div class="row">
                <div class="card chartbox"><h3>Cost by model</h3>${C.donut(modelItems, {})}</div>
                <div class="card chartbox"><h3>Top tools</h3>${toolItems.length ? C.hbars(toolItems, { fmt: C.fmtTok }) : '<p class="muted">No tool calls recorded.</p>'}</div>
                ${healthHtml}
                ${taskHtml}
            </div>
            ${pricingHtml}
            <h2>Standing duties <a data-guide="nobet-gorevleri">?</a></h2>
            <div class="spread">
                <p class="muted small" style="margin:4px 0">Recurring watch-and-act agreements — the agent reads DUTIES.md every session.</p>
                <div class="btnrow">
                    <button class="secondary" id="addDuty"${dutyForm ? ' disabled' : ''}
                        title="Make a standing duty here — title, cadence, what is watched and what to do about it, all on one card">Add duty</button>
                    ${a.dutiesPath ? `<button class="secondary" data-file="${C.esc(a.dutiesPath)}">Open DUTIES.md</button>` : ''}
                </div>
            </div>
            ${dutyForm ? dutyFormHtml() : (dutyMsg ? window.AFForm.msg(dutyMsg, !dutyMsgOk) : '')}
            <div class="tablewrap"><table>
                <tr><th></th><th>Duty</th><th>Cadence</th><th>Watch</th><th>Do</th><th class="num">Status</th><th class="num"></th></tr>
                ${a.duties.length ? a.duties.map((d, i) => `
                    <tr style="${d.paused ? 'opacity:.5' : ''}"
                        ${window.AFCtx.row('afDutyRow', {
                        dutyPath: a.dutiesPath || '', agentId: a.id, dutyTitle: d.title,
                        dutyPaused: !!d.paused,
                        dutyText: [d.title, d.cadence, d.watch && ('watch: ' + d.watch), d.action && ('do: ' + d.action)]
                            .filter(Boolean).join(' · ')
                    })}
                        title="${C.esc(window.AFCtx.hint(d.title))}">
                        <td>${d.missing ? '⛔' : d.pending ? '👁⚠' : '👁'}</td>
                        <td><strong>${C.esc(d.title)}</strong></td>
                        <td>${C.esc(d.cadence)}${d.paused ? ' · paused' : ''}</td>
                        <td class="small">${C.esc(d.watch || '—')}</td>
                        <td class="small">${C.esc(d.action || '—')}</td>
                        <td class="num">${C.esc(d.status)}</td>
                        <td class="num" style="white-space:nowrap">
                            <button class="mini secondary" data-duty="edit" data-t="${C.esc(d.title)}" title="Edit it — the same card the + opens, filled in">edit</button>
                            <button class="mini secondary" data-duty="copy" data-t="${C.esc(d.title)}" title="Give another agent its own copy of this duty">copy</button>
                            <button class="mini secondary" data-duty="toggle" data-t="${C.esc(d.title)}" title="${d.paused ? 'Resume it — the agent starts checking it again' : 'Pause it — it stays in the file, marked, and the agent skips it'}">${d.paused ? '▶' : '⏸'}</button>
                            <button class="mini secondary" data-duty="up" data-t="${C.esc(d.title)}"${i === 0 ? ' disabled' : ''} title="move it up">↑</button>
                            <button class="mini secondary" data-duty="down" data-t="${C.esc(d.title)}"${i === a.duties.length - 1 ? ' disabled' : ''} title="move it down">↓</button>
                            <button class="mini secondary" data-duty="del" data-t="${C.esc(d.title)}" title="Delete it from DUTIES.md">✕</button>
                        </td>
                    </tr>`).join('') : '<tr><td colspan="7" class="muted">No standing duties yet — add the recurring "keep watching X, then do Y" agreements you have with this agent.</td></tr>'}
            </table></div>
            <h2>Health &amp; optimization <a data-guide="saglik-ve-optimizasyon">?</a></h2>
            <div class="tablewrap"><table><tr><th></th><th>Category</th><th>Finding</th></tr>${insightsHtml}</table></div>
            <h2>Memory files</h2>
            <div class="tablewrap"><table>
                <tr><th>File</th><th class="num">Size</th><th class="num">Tokens</th><th class="num">Modified</th><th class="num">Recalls 30d</th></tr>
                ${memHtml || '<tr><td colspan="5" class="muted">No memory files.</td></tr>'}
            </table></div>
            <h2>Sessions</h2>
            <div id="sessblock"></div>
        `;

        // ‼️ THE EMBEDDED TABLE FILLS ITS OWN CONTAINER FIRST, THEN THE PAGE
        // WIRES ITSELF. The shared component replaces the whole of #sessblock
        // and wires its controls inside it; doing that in the middle of this
        // page's own wiring means every control above it is bound against a
        // section of the document that is about to be rewritten.
        // sessionTableN echoes the Show box (0 = all) — pass it through as-is.
        sessTable.setRows(DATA.sessions || [], DATA.sessionTableN);

        window.AFHeader.wire(vscode, {
            navActions: { console: { onClick: () => vscode.postMessage({ type: 'consoleSession' }) } }
        });
        // The + opens the form on the page. It does not ask the host to ask us:
        // one route, one card, and the palette's own `addDuty` lands on the
        // same one from the other side.
        document.getElementById('addDuty').addEventListener('click', () => openDutyForm({ mode: 'new' }));
        document.querySelectorAll('[data-duty]').forEach(el =>
            el.addEventListener('click', ev => { ev.stopPropagation(); dutyAct(el.dataset.duty, el.dataset.t); }));
        wireDutyForm();
        // the surface rides along, so the host never has to ask again
        window.AFHeader.wireMenu(document, 'start',
            surface => vscode.postMessage({ type: 'startSession', surface }));
        window.AFHeader.wireMenu(document, 'launch',
            surface => vscode.postMessage({ type: 'launchSession', surface }));
        window.AFHeader.wireMenu(document, 'continue',
            surface => vscode.postMessage({ type: 'continueSession', surface }));
        document.getElementById('reveal').addEventListener('click', () => vscode.postMessage({ type: 'reveal' }));
        document.querySelectorAll('[data-file]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'openFile', path: el.dataset.file })));
        document.querySelectorAll('[data-guide]').forEach(el =>
            el.addEventListener('click', ev => { ev.stopPropagation(); vscode.postMessage({ type: 'openGuide', anchor: el.dataset.guide }); }));

        // Pricing editor wiring.
        const pbox = document.getElementById('pricingBox');
        // Read every row (no filtering) so array indices line up with the DOM
        // rows for add/remove. Empty-match rows are dropped when saving (the
        // extension sanitises them).
        const readRows = () => Array.from(document.querySelectorAll('[data-prow]')).map(tr => {
            const rule = { match: tr.querySelector('.pmatch').value.trim() };
            tr.querySelectorAll('.pnum').forEach(inp => { rule[inp.dataset.k] = parseFloat(inp.value) || 0; });
            return rule;
        });
        // Keep local edits (add/remove rows) without losing what's typed, and
        // re-open the editor after the local re-render.
        const localEdit = mutate => {
            const current = readRows();
            mutate(current);
            DATA.pricing = current;
            render();
            const b = document.getElementById('pricingBox');
            if (b) { b.open = true; suspendRender = true; }
        };
        if (pbox) {
            pbox.addEventListener('toggle', () => { suspendRender = pbox.open; });
        }
        const paddrow = document.getElementById('paddrow');
        if (paddrow) {
            paddrow.addEventListener('click', () =>
                localEdit(rs => rs.push({ match: '', input: 0, output: 0, cacheWrite: 0, cacheRead: 0 })));
        }
        document.querySelectorAll('.prm').forEach(btn => btn.addEventListener('click', () => {
            const i = Number(btn.closest('[data-prow]').dataset.prow);
            localEdit(rs => rs.splice(i, 1));
        }));
        const psave = document.getElementById('psave');
        if (psave) {
            psave.addEventListener('click', () => {
                vscode.postMessage({ type: 'savePricing', rules: readRows() });
                suspendRender = false;
            });
        }

    }

    /**
     * Everything a duty row can do, from the row itself.
     *
     * ‼️ THE ROW IS THE OBJECT. The page listed six facts about a duty and
     * offered no way to act on any of them: pausing, reordering and deleting
     * lived only on the sidebar tree, and editing lived in a chain of boxes
     * reachable from there. `edit` and `copy` open the card above; the other
     * four are single acts, so they go straight to the host — a form for "move
     * it up" would be furniture.
     */
    function dutyAct(act, title) {
        if (!title) { return; }
        const d = (DATA.agent.duties || []).find(x => x.title === title);
        if (!d) { return; }
        if (act === 'edit') {
            openDutyForm({
                mode: 'edit', oldTitle: d.title, title: d.title, cadence: d.cadence,
                watch: d.watch || '', action: d.action || '', note: d.note || '', paused: !!d.paused
            });
            return;
        }
        if (act === 'copy') {
            openDutyForm({
                mode: 'copy', oldTitle: d.title, title: d.title, cadence: d.cadence,
                watch: d.watch || '', action: d.action || '', note: d.note || '', paused: !!d.paused
            });
            return;
        }
        vscode.postMessage({ type: 'duty-act', act: act, title: title });
    }

    // ------------------------------------------------------- right-click menu

    /** The page-side acts. The agent's own menu is host commands and needs
     *  nothing here (src/core/ctxmenu.ts). */
    function ctxDo(act, ctx) {
        const open = (p) => { if (p) { vscode.postMessage({ type: 'openFile', path: String(p) }); } };
        switch (act) {
            case 'memOpen': open(ctx.memPath); return;
            case 'memGraph':
                vscode.postMessage({ type: 'openMemoryGraph', agentId: String(ctx.agentId || '') });
                return;
            case 'memCopy': window.AFCtx.copy(ctx.memPath); return;
            // Both of these are cards on the memory graph — this page lists a
            // memory file, that one is where a memory file is worked on.
            case 'memCopyTo':
                vscode.postMessage({
                    type: 'memCard', card: 'copy', agentId: String(ctx.agentId || ''),
                    path: String(ctx.memPath || ''), name: String(ctx.memName || '')
                });
                return;
            case 'memDistil':
                vscode.postMessage({
                    type: 'memCard', card: 'distill', agentId: String(ctx.agentId || '')
                });
                return;
            case 'dutyOpen': open(ctx.dutyPath); return;
            case 'dutyCopy': window.AFCtx.copy(ctx.dutyText); return;
            // The menu reaches the same four acts the row's buttons do — a menu
            // that offers less than the row it was opened on is a menu nobody
            // trusts twice.
            case 'dutyEdit': dutyAct('edit', String(ctx.dutyTitle || '')); return;
            case 'dutyTo': dutyAct('copy', String(ctx.dutyTitle || '')); return;
            case 'dutyPause': dutyAct('toggle', String(ctx.dutyTitle || '')); return;
            case 'dutyDel': dutyAct('del', String(ctx.dutyTitle || '')); return;
            case 'insOpen': open(ctx.insFile); return;
            case 'insGuide':
                vscode.postMessage({ type: 'openGuide', anchor: String(ctx.insAnchor || '') });
                return;
            case 'insCopy': window.AFCtx.copy(ctx.insText); return;
        }
    }

    // ‼️ ONCE, at module scope — render() runs on every data push.
    window.AFCtx.listen(ctxDo);

    render();
})();
