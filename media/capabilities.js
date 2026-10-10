// Agent Farm — Capability Matrix page script (skills × agents, MCP × agents).
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    const ON_PHONE_HOST = !!(window.__AFUI__ && window.__AFUI__.remote === true);

    // ‼️ M-33 — A HOST PUSH WAITS FOR THE READER'S HANDS; THE PAGE'S OWN
    // RENDERS DO NOT. render() replaces the whole of #app, so a repaint that
    // arrives while somebody is typing detaches the box they are typing in and
    // the caret falls to <body> — where space IS Page Down. Full text, and
    // what a page-specific busy() is for: media/afRepaint.js.
    const repaint = window.AFRepaint.guard(render);
    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') { DATA = ev.data.data; repaint(); }
    });

    function relTime(ts) {
        if (!ts) return '';
        const m = Math.round((Date.now() - ts) / 60000);
        if (m < 60) return m + 'm ago';
        const h = Math.round(m / 60);
        if (h < 24) return h + 'h ago';
        return Math.round(h / 24) + 'd ago';
    }

    /**
     * What one matrix cell IS, for the right-click menu.
     *
     * A cell is a claim about an agent: it HAS this skill / MCP server / memory
     * file / duty, or it does not. Both halves are actions — open what is there,
     * or copy it in where it is missing — and until now only one of them had a
     * control (the ＋), while the other was a tooltip on a coloured pill.
     *
     * `afCopyable` is not "is it missing": a user-scope row is shared by every
     * agent, so there is nothing to copy anywhere, and a menu that offered it
     * would be offering a no-op.
     */
    function cellCtx(row, agent, cell, kind, copyable) {
        return window.AFCtx.row('afCapCell', {
            capKind: kind, capName: row.name || row.title || '',
            capScope: row.scope || '', capTo: agent.id,
            capSource: (cell && cell.source) || '',
            afPresent: !!(cell && (kind === 'duty' ? true : cell.present)),
            afCopyable: !!copyable
        });
    }

    /** The row's own name — the thing the whole line is about. */
    function rowCtx(row, kind, source) {
        return window.AFCtx.row('afCapRow', {
            capKind: kind, capName: row.name || row.title || '', capSource: source || ''
        });
    }

    function cellHtml(row, agent, cell, kind) {
        if (!cell || !cell.present) {
            // The host resolves the copy source: it compares every agent's copy
            // and asks the user to pick one whenever the copies differ.
            const donors = DATA.agents.filter(a => row.cells[a.id] && row.cells[a.id].present);
            if (!donors.length || row.scope === 'user') {
                return `<td class="c absent" ${cellCtx(row, agent, null, kind, false)}><span title="not installed">—</span></td>`;
            }
            const tip = donors.length === 1
                ? `not installed — copy from ${donors[0].name}`
                : `not installed — copy here (${donors.length} agents have it; you pick which one it is copied from)`;
            return `<td class="c absent" ${cellCtx(row, agent, null, kind, true)}>` +
                `<button class="copyhere" title="${C.esc(tip)} — ${window.AFCtx.HINT}" ` +
                `data-kind="${kind}" data-name="${C.esc(row.name)}" data-scope="${C.esc(row.scope || '')}" ` +
                `data-to="${C.esc(agent.id)}">＋</button></td>`;
        }
        const tipParts = [];
        if (cell.disabled) { tipParts.push('DISABLED for this agent'); }
        if (cell.diverged) { tipParts.push('≠ DIVERGED from the newest copy — contents differ'); }
        tipParts.push(cell.calls > 0
            ? cell.calls + (kind === 'memory' ? ' recalls' : ' calls') + ' (30d), last ' + relTime(cell.lastTs)
            : (kind === 'memory' ? 'not recalled (30d)' : 'unused (30d)'));
        if (kind === 'memory' && typeof cell.tokens === 'number') { tipParts.push('~' + cell.tokens + ' tok · changed ' + relTime(cell.mtime)); }
        if (cell.source) { tipParts.push(cell.source); }
        const tip = tipParts.join('\n') + '\n— ' + window.AFCtx.HINT;
        const divCls = cell.diverged ? ' divg' : '';
        const ctx = cellCtx(row, agent, cell, kind, false);
        if (cell.disabled) {
            return `<td class="c" ${ctx}><button class="pill off" title="${C.esc(tip)}" data-open="${C.esc(cell.source || '')}">⏻</button></td>`;
        }
        if (cell.calls > 0) {
            const heat = Math.min(1, 0.35 + Math.log10(cell.calls + 1) / 3);
            return `<td class="c" ${ctx}><button class="pill used${divCls}" style="opacity:${heat.toFixed(2)}" title="${C.esc(tip)}" ` +
                `data-open="${C.esc(cell.source || '')}">${cell.calls}</button></td>`;
        }
        return `<td class="c" ${ctx}><button class="pill idle${divCls}" title="${C.esc(tip)}" data-open="${C.esc(cell.source || '')}">✓</button></td>`;
    }

    const CADENCE_SHORT = { 'every-turn': 'turn', 'session-start': 'start', daily: 'daily', weekly: 'weekly', manual: 'manual' };

    function dutyCellHtml(row, agent, cell) {
        if (!cell) {
            const donors = DATA.agents.filter(a => row.cells[a.id]);
            if (!donors.length) {
                return `<td class="c absent" ${cellCtx(row, agent, null, 'duty', false)}><span title="no duty">—</span></td>`;
            }
            const tip = donors.length === 1
                ? `no such duty — copy from ${donors[0].name}`
                : `no such duty — copy here (${donors.length} agents have it; you pick which one it is copied from)`;
            return `<td class="c absent" ${cellCtx(row, agent, null, 'duty', true)}>` +
                `<button class="copyhere" title="${C.esc(tip)} — ${window.AFCtx.HINT}" ` +
                `data-kind="duty" data-name="${C.esc(row.title)}" data-to="${C.esc(agent.id)}">＋</button></td>`;
        }
        const tip = `${row.title} [${cell.cadence}${cell.paused ? ', paused' : ''}]` +
            (cell.watch ? '\nWatch: ' + cell.watch : '') +
            (cell.action ? '\nDo: ' + cell.action : '') +
            '\n— ' + window.AFCtx.HINT;
        const label = (cell.paused ? '⏸ ' : '') + (CADENCE_SHORT[cell.cadence] || cell.cadence);
        return `<td class="c" ${cellCtx(row, agent, cell, 'duty', false)}>` +
            `<button class="pill duty${cell.paused ? ' off' : ''}" title="${C.esc(tip)}" ` +
            `data-open="${C.esc(cell.source || '')}">${C.esc(label)}</button></td>`;
    }

    function matrix(rows, kind, title, hint) {
        const agents = DATA.agents;
        if (!rows.length) {
            return `<h2>${title}</h2><p class="muted">None found. ${hint}</p>`;
        }
        const usedRows = rows.filter(r => agents.some(a => r.cells[a.id] && r.cells[a.id].calls > 0)).length;
        const deadRows = rows.length - usedRows;
        const chips = `<span class="badge">${rows.length} total</span>
            <span class="badge" style="color:var(--af-ink-charts-green, var(--vscode-charts-green,#4caf50));border-color:var(--vscode-charts-green,#4caf50)">${usedRows} used (30d)</span>` +
            (deadRows ? `<span class="badge warn">${deadRows} unused (30d)</span>` : '');
        const head = `<tr><th class="name">${title}</th>` +
            agents.map(a => `<th class="agent" title="${C.esc(a.name)}">${C.esc(a.name.length > 10 ? a.name.slice(0, 9) + '…' : a.name)}</th>`).join('') +
            '</tr>';
        const body = rows.map(row => {
            const anyUse = agents.some(a => row.cells[a.id] && row.cells[a.id].calls > 0);
            const firstSrc = agents.map(a => row.cells[a.id] && row.cells[a.id].source).find(Boolean) || '';
            const scopeTag = row.scope === 'user' ? ' <span class="tag">shared</span>' : '';
            const sub = kind === 'skill' ? (row.description || '')
                : kind === 'memory' ? 'memory file — green count = explicit recalls (30d)'
                : (row.transport + ' · ' + row.commandOrUrl);
            return `<tr>
                <td class="name" ${rowCtx(row, kind, firstSrc)}><button class="rowname${anyUse ? '' : ' muted'}" title="${C.esc(sub)} — ${window.AFCtx.HINT}" data-open="${C.esc(firstSrc)}">${C.esc(row.name)}</button>${scopeTag}${anyUse ? '' : ' <span class="dead" title="no agent used this in 30 days">●</span>'}</td>` +
                agents.map(a => cellHtml(row, a, row.cells[a.id], kind)).join('') +
            '</tr>';
        }).join('');
        return `<h2>${title} <span class="chips">${chips}</span></h2>
            <div class="card" style="overflow-x:auto"><table class="matrix">${head}${body}</table></div>`;
    }

    function dutyMatrix(rows) {
        const agents = DATA.agents;
        if (!rows.length) {
            return '<h2>Duties</h2><p class="muted">None found. Add one from the Agents tree: Duties → right-click.</p>';
        }
        const pausedCells = rows.reduce((a, r) => a + agents.filter(x => r.cells[x.id] && r.cells[x.id].paused).length, 0);
        const chips = `<span class="badge">${rows.length} total</span>` +
            (pausedCells ? `<span class="badge warn">${pausedCells} paused cell(s)</span>` : '');
        const head = `<tr><th class="name">Duties</th>` +
            agents.map(a => `<th class="agent" title="${C.esc(a.name)}">${C.esc(a.name.length > 10 ? a.name.slice(0, 9) + '…' : a.name)}</th>`).join('') +
            '</tr>';
        const body = rows.map(row => {
            const firstSrc = agents.map(a => row.cells[a.id] && row.cells[a.id].source).find(Boolean) || '';
            return `<tr>
                <td class="name" ${rowCtx(row, 'duty', firstSrc)}><button class="rowname" title="standing duty — ${window.AFCtx.HINT}" data-open="${C.esc(firstSrc)}">${C.esc(row.title)}</button></td>` +
                agents.map(a => dutyCellHtml(row, a, row.cells[a.id])).join('') +
            '</tr>';
        }).join('');
        return `<h2>Duties <span class="chips">${chips}</span></h2>
            <div class="card" style="overflow-x:auto"><table class="matrix">${head}${body}</table></div>`;
    }

    const SOURCE_TAG = { manual: 'man', schedule: 'sch', trigger: 'trg', workflow: 'wf' };

    function taskCellHtml(cell, row, agent) {
        const ctx = window.AFCtx.row('afCapCell', {
            capKind: 'task', capName: (row && row.title) || '', capTo: agent ? agent.id : '',
            capSource: '', afPresent: !!cell, afCopyable: false
        });
        if (!cell) { return `<td class="c absent" ${ctx}><span title="no runs on this agent">—</span></td>`; }
        const tip = `${cell.runs} completed run(s) (30d): ${cell.done}✓ / ${cell.failed}✗` +
            `\nlast run ${relTime(cell.lastTs)}\n— ${window.AFCtx.HINT}`;
        const label = cell.failed === 0 ? String(cell.runs)
            : cell.done === 0 ? `${cell.failed}✗`
            : `${cell.done}✓/${cell.failed}✗`;
        const cls = cell.failed === 0 ? 'used' : cell.done === 0 ? 'fail' : 'mixed';
        const heat = Math.min(1, 0.35 + Math.log10(cell.runs + 1) / 3);
        return `<td class="c" ${ctx}><button class="pill ${cls}" style="opacity:${heat.toFixed(2)}" ` +
            `title="${C.esc(tip)}" data-taskhist="1">${C.esc(label)}</button></td>`;
    }

    function taskMatrix(rows) {
        const agents = DATA.agents;
        if (!rows.length) {
            return '<h2>Tasks</h2><p class="muted">No completed task runs in the last 30 days — delegate work via the Tasks view.</p>';
        }
        const runsTotal = rows.reduce((a, r) => a + r.runsTotal, 0);
        const failing = rows.filter(r => r.alwaysFails).length;
        const chips = `<span class="badge">${rows.length} task famil${rows.length > 1 ? 'ies' : 'y'}</span>
            <span class="badge">${runsTotal} runs (30d)</span>` +
            (failing ? `<span class="badge warn">${failing} always failing</span>` : '');
        const head = `<tr><th class="name">Tasks</th>` +
            agents.map(a => `<th class="agent" title="${C.esc(a.name)}">${C.esc(a.name.length > 10 ? a.name.slice(0, 9) + '…' : a.name)}</th>`).join('') +
            '</tr>';
        const body = rows.map(row => {
            const title = row.title.length > 60 ? row.title.slice(0, 59) + '…' : row.title;
            return `<tr>
                <td class="name" ${rowCtx(row, 'task', '')}><button class="rowname" title="${C.esc(row.title)} — click for the full task history — ${window.AFCtx.HINT}" data-taskhist="1">${C.esc(title)}</button>
                    <span class="tag">${SOURCE_TAG[row.source] || row.source}</span>${row.alwaysFails ? ' <span class="dead" style="color:var(--af-ink-charts-red, var(--vscode-charts-red,#f14c4c))" title="its last runs all failed">●</span>' : ''}</td>` +
                agents.map(a => taskCellHtml(row.cells[a.id], row, a)).join('') +
            '</tr>';
        }).join('');
        return `<h2>Tasks <span class="chips">${chips}</span></h2>
            <div class="card" style="overflow-x:auto"><table class="matrix">${head}${body}</table></div>`;
    }

    function render() {
        document.getElementById('app').innerHTML = `
            <style>
                .matrix { border-collapse: collapse; width: 100%; }
                .matrix th, .matrix td { padding: 4px 8px; text-align: center; }
                .matrix th.name, .matrix td.name { text-align: left; min-width: 180px; }
                .matrix th.agent { font-size: 11px; opacity: 0.8; }
                .matrix tr:hover td { background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.08)); }
                .matrix .pill, .matrix .copyhere, .matrix .rowname {
                    background: none; border: none; cursor: pointer; color: inherit; font: inherit; padding: 2px 6px;
                }
                .matrix .rowname { font-weight: 600; }
                .matrix .rowname:hover { text-decoration: underline; }
                .matrix .pill.used {
                    background: var(--vscode-charts-green, #4caf50); color: var(--af-ground,var(--vscode-editor-background, #000));
                    border-radius: 10px; min-width: 30px; font-weight: 700; font-size: 11px;
                }
                .matrix .pill.idle { opacity: 0.45; }
                .matrix .pill.off { color: var(--af-ink-charts-orange, var(--vscode-charts-orange, #d18616)); }
                .matrix .pill.fail {
                    background: var(--vscode-charts-red, #f14c4c); color: var(--af-ground,var(--vscode-editor-background, #000));
                    border-radius: 10px; min-width: 30px; font-weight: 700; font-size: 11px;
                }
                .matrix .pill.mixed {
                    color: var(--af-ink-charts-orange, var(--vscode-charts-orange, #d18616)); font-weight: 700; font-size: 11px;
                    box-shadow: 0 0 0 1px var(--vscode-charts-orange, #d18616); border-radius: 10px;
                }
                .matrix .pill.divg { box-shadow: 0 0 0 2px var(--vscode-charts-orange, #d18616); border-radius: 10px; }
                .matrix .pill.duty { font-size: 11px; opacity: 0.85; }
                .matrix .copyhere { opacity: 0.25; font-size: 13px; }
                .matrix .copyhere:hover { opacity: 1; color: var(--af-ink-charts-blue, var(--vscode-charts-blue, #3794ff)); }
                .matrix .absent span { opacity: 0.2; }
                .tag { font-size: 10px; border: 1px solid currentColor; border-radius: 8px; padding: 0 6px; opacity: 0.7; }
                .dead { color: var(--af-ink-charts-yellow, var(--vscode-charts-yellow, #cca700)); font-size: 9px; vertical-align: middle; }
                .chips .badge { margin-left: 6px; font-weight: 400; }
                html.af-phone .matrix th.name, html.af-phone .matrix td.name { min-width: 120px; max-width: 132px; overflow-wrap: anywhere; position: sticky; left: 0; z-index: 1; background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background)); }
            </style>
            ${window.AFHeader.html({
                page: 'capabilities',
                title: 'Capability Matrix',
                sub: `who has which skill / MCP server, and what is actually used (last 30 days) ·
                        green = used, ✓ = installed but unused, ⏻ = disabled, ＋ = copy onto that agent (when copies differ, you pick the source)`,
                guide: 'yetenek-matrisi'
            })}
            ${matrix(DATA.skills, 'skill', 'Skills', 'Scaffold one from the Agents tree: Skills → +.')}
            ${matrix(DATA.mcp, 'mcp', 'MCP servers', 'Add one from the Agents tree: MCP → +.')}
            ${matrix(DATA.memory || [], 'memory', 'Memory files', 'Create one from the Agents tree: Memory → +.')}
            ${dutyMatrix(DATA.duties || [])}
            ${taskMatrix(DATA.tasks || [])}
            <p class="footnote">Counts come from real session transcripts: Skill tool calls, typed /commands, mcp__server__tool calls and explicit memory-file reads — memory recalls only count reads of the agent's OWN memory/ folder, so a fresh copy always starts at zero. Memory cells with an orange ring have DIVERGED from the newest copy. ＋ copying never picks a source on its own: with one donor it asks for confirmation naming it, with several it always opens a picker (newest first, each entry marked identical / differs) — the same rule for skills, MCP servers, memory files and duties. It installs into the target agent (skills/.mcp.json/memory+index/DUTIES.md); new claude sessions pick it up. Task rows group repeated runs of the same job (retry/date noise collapsed): green = all succeeded, red = all failed, orange ring = mixed — click for the full task history.</p>
        `;

        window.AFHeader.wire(vscode);
        // the task history and a file in the PC's editor are the PC's, so a phone's cell is not wired to them
        if (!ON_PHONE_HOST) {
            document.querySelectorAll('[data-taskhist]').forEach(b =>
                b.addEventListener('click', () => vscode.postMessage({ type: 'openTaskHistory' })));
            document.querySelectorAll('[data-open]').forEach(b =>
                b.addEventListener('click', () => {
                    if (b.dataset.open) { vscode.postMessage({ type: 'open', path: b.dataset.open }); }
                }));
        }
        const COPY_MSG = { skill: 'copySkill', mcp: 'copyMcp', memory: 'copyMemory', duty: 'copyDuty' };
        document.querySelectorAll('.copyhere').forEach(b =>
            b.addEventListener('click', () => {
                // No source here on purpose — the host compares every agent's
                // copy and lets the user pick when they differ.
                vscode.postMessage({
                    type: COPY_MSG[b.dataset.kind] || 'copyMcp',
                    name: b.dataset.name,
                    title: b.dataset.name,
                    scope: b.dataset.scope,
                    toAgentId: b.dataset.to
                });
            }));
    }

    /**
     * The menu on a matrix cell. Copying runs the SAME message the ＋ sends —
     * with no donor named, because the host is what compares every agent's copy
     * and asks which one spreads. A menu that picked a source itself would
     * quietly undo that whole design.
     */
    const COPY_MSG = { skill: 'copySkill', mcp: 'copyMcp', memory: 'copyMemory', duty: 'copyDuty' };
    function ctxDo(act, ctx) {
        switch (act) {
            case 'capOpen':
                if (ctx.capSource) { vscode.postMessage({ type: 'open', path: String(ctx.capSource) }); }
                return;
            case 'capTasks':
                vscode.postMessage({ type: 'openTaskHistory' });
                return;
            case 'capCopy':
                vscode.postMessage({
                    type: COPY_MSG[ctx.capKind] || 'copyMcp',
                    name: String(ctx.capName || ''),
                    title: String(ctx.capName || ''),
                    scope: String(ctx.capScope || ''),
                    toAgentId: String(ctx.capTo || '')
                });
                return;
            case 'capPath': window.AFCtx.copy(ctx.capSource); return;
            case 'capName': window.AFCtx.copy(ctx.capName); return;
        }
    }

    // ‼️ ONCE, at module scope — render() rewires every cell on every refresh.
    window.AFCtx.listen(ctxDo);

    render();
})();
