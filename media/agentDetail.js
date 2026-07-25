// Agent Farm — agent detail page script.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    // While the pricing editor is open we skip background re-renders so live
    // refreshes don't wipe half-typed rates. DATA still updates silently.
    let suspendRender = false;

    // Shared advanced Sessions table (sort box, turn accordion, single-open,
    // ⌨ jump-to-terminal) — the same component the dashboard uses. It re-renders
    // only its own container, so an open pricing editor is never clobbered.
    const sessTable = window.AFSessionsTable.create({
        vscode, C,
        containerId: 'sessblock',
        columns: ['origin', 'title', 'when', 'duration', 'turns', 'tools', 'errors', 'tokens', 'ctx', 'cost'],
        tableN: 50, // agent-page default; the All chip toggles back to this
        stateKey: 'agent'
    });

    window.addEventListener('message', ev => {
        if (sessTable.onMessage(ev)) { return; }
        if (ev.data.type === 'data') { DATA = ev.data.data; if (!suspendRender) render(); }
    });

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
                <tr class="${i.filePath ? 'click' : ''}" ${i.filePath ? `data-file="${C.esc(i.filePath)}"` : ''}>
                    <td>${sevIcon[i.severity]}</td>
                    <td>${C.esc(i.category)}</td>
                    <td>${C.esc(i.message)} <a data-guide="${C.esc(i.anchor)}">?</a></td>
                </tr>`).join('')
            : '<tr><td colspan="3" class="muted">No findings — healthy agent. 🌿</td></tr>';

        const memHtml = a.memoryFiles.map(f => `
            <tr class="click" data-file="${C.esc(f.path)}">
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
                actions: `<button id="start">Start session</button>
                    <button class="secondary" id="continue">Continue latest</button>
                    <button class="secondary" id="reveal">Reveal folder</button>`,
                searchTitle: "Search all of this agent's sessions",
                guide: 'ajan-detay-sayfasi'
            })}
            <div class="row">
                <div class="card"><div class="label">Total cost</div><div class="kpi">${C.fmtUSD(t.cost)}</div><div class="sub">avg ${C.fmtUSD(t.avgCostPerSession)} / session</div></div>
                <div class="card"><div class="label">Sessions</div><div class="kpi">${t.sessions}</div></div>
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
                    <button class="secondary" id="addDuty">Add duty</button>
                    ${a.dutiesPath ? `<button class="secondary" data-file="${C.esc(a.dutiesPath)}">Open DUTIES.md</button>` : ''}
                </div>
            </div>
            <div class="tablewrap"><table>
                <tr><th></th><th>Duty</th><th>Cadence</th><th>Watch</th><th>Do</th><th class="num">Status</th></tr>
                ${a.duties.length ? a.duties.map(d => `
                    <tr class="${a.dutiesPath ? 'click' : ''}" ${a.dutiesPath ? `data-file="${C.esc(a.dutiesPath)}"` : ''} style="${d.paused ? 'opacity:.5' : ''}">
                        <td>${d.missing ? '⛔' : d.pending ? '👁⚠' : '👁'}</td>
                        <td><strong>${C.esc(d.title)}</strong></td>
                        <td>${C.esc(d.cadence)}${d.paused ? ' · paused' : ''}</td>
                        <td class="small">${C.esc(d.watch || '—')}</td>
                        <td class="small">${C.esc(d.action || '—')}</td>
                        <td class="num">${C.esc(d.status)}</td>
                    </tr>`).join('') : '<tr><td colspan="6" class="muted">No standing duties yet — add the recurring "keep watching X, then do Y" agreements you have with this agent.</td></tr>'}
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

        window.AFHeader.wire(vscode);
        document.getElementById('addDuty').addEventListener('click', () => vscode.postMessage({ type: 'addDuty' }));
        document.getElementById('start').addEventListener('click', () => vscode.postMessage({ type: 'startSession' }));
        document.getElementById('continue').addEventListener('click', () => vscode.postMessage({ type: 'continueSession' }));
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

        // The shared component fills its container and wires its own controls
        // (sort box, turn accordion, single-open, ⌨) — after every full render.
        // sessionTableN echoes the Show box (0 = all) — pass it through as-is
        sessTable.setRows(DATA.sessions || [], DATA.sessionTableN);
    }

    render();
})();
