// Agent Farm — Living page. One screen answering "is the system alive today?".
// Rows are LOOPS, not errors: something opened — did it close? A part can be
// green while the system is dead, which is exactly what this page catches.
// All judgment is in src/core/living.ts; this only renders it.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;

    const post = (m) => vscode.postMessage(m);

    const ICON = { ok: '✅', warn: '⚠️', dead: '🛑', idle: '·' };
    const ORDER = { dead: 0, warn: 1, idle: 2, ok: 3 };

    function relTime(ms) {
        if (!ms && ms !== 0) { return ''; }
        const h = ms / 3600000;
        if (h < 1) { return Math.max(1, Math.round(h * 60)) + ' min'; }
        if (h < 48) { return Math.round(h) + ' h'; }
        return Math.round(h / 24) + ' days';
    }

    function scoreRing(score, verdict, counts) {
        // A single honest number plus the verdict — no gauge theatre.
        const cls = counts.dead ? 'dead' : counts.warn ? 'warn' : 'ok';
        return `<div class="verdict ${cls}">
            <div class="score">${score}<span class="pct">%</span></div>
            <div class="vtext">
                <b>${C.esc(verdict)}</b>
                <div class="muted small">${counts.ok} closing · ${counts.warn} need you · ${counts.dead} stopped${counts.idle ? ` · ${counts.idle} idle` : ''}</div>
            </div>
        </div>`;
    }

    function signalRow(s) {
        const age = s.ageMs ? `<span class="age" title="how long this loop has been open">${relTime(s.ageMs)}</span>` : '';
        return `<div class="sig ${s.state}"${s.goto ? ` data-goto="${C.esc(s.goto)}" role="button" tabindex="0"` : ''}
            ${window.AFCtx.row('afLivingSignal', {
            sigGoto: s.goto || '',
            sigText: [s.label, s.detail, s.hint].filter(Boolean).join(' — ')
        })} title="${C.esc(window.AFCtx.hint(s.label))}">
            <div class="sigicon">${ICON[s.state] || '·'}</div>
            <div class="sigbody">
                <div class="sighead"><b>${C.esc(s.label)}</b>${age}</div>
                <div class="sigdetail">${C.esc(s.detail)}</div>
                ${s.hint ? `<div class="sighint">${C.esc(s.hint)}</div>` : ''}
            </div>
            ${s.goto ? `<div class="siggo">→</div>` : ''}
        </div>`;
    }

    function recentHtml(recent) {
        if (!recent || !recent.length) {
            return `<p class="muted">No automation decisions recorded yet. Every firing — and every wake-up a
                precondition suppressed — lands here, so a guard can never quietly swallow real work.</p>`;
        }
        const rows = recent.map(e => `<tr class="${e.outcome}">
            <td class="muted small nowrap" title="${C.esc(window.AFTime.tip(e.ts, 'Decided'))}">${C.esc(window.AFTime.stamp(e.ts))}</td>
            <td>${e.outcome === 'fired' ? '▶ fired' : '🛡 skipped'}</td>
            <td>${C.esc(e.title)} <span class="muted small">(${C.esc(e.kind)})</span></td>
            <td class="muted small">${C.esc(e.reason)}</td>
        </tr>`).join('');
        return `<div class="tablewrap"><table>
            <tr><th>When</th><th>Outcome</th><th>Automation</th><th>Why</th></tr>${rows}</table></div>`;
    }

    function render() {
        const d = DATA;
        const groups = d.signals.slice().sort((a, b) =>
            (ORDER[a.state] - ORDER[b.state]) || (b.weight - a.weight));
        const open = groups.filter(s => s.state === 'dead' || s.state === 'warn');
        const fine = groups.filter(s => s.state === 'ok' || s.state === 'idle');

        document.getElementById('app').innerHTML = `
            <style>
                .verdict { display:flex; gap:14px; align-items:center; padding:12px 16px; margin:0 0 14px;
                    border:1px solid var(--vscode-widget-border,#4443); border-left-width:4px; border-radius:9px;
                    background:var(--vscode-editorWidget-background, rgba(128,128,128,.05)); }
                .verdict.ok { border-left-color:var(--vscode-charts-green,#3fb950); }
                .verdict.warn { border-left-color:var(--vscode-editorWarning-foreground,#cca700); }
                .verdict.dead { border-left-color:var(--vscode-errorForeground,#f85149); }
                .score { font-size:30px; font-weight:700; line-height:1; }
                .score .pct { font-size:14px; opacity:.6; margin-left:1px; }
                .vtext b { font-size:14px; }
                .sig { display:flex; gap:11px; align-items:flex-start; padding:9px 12px; margin-bottom:7px;
                    border:1px solid var(--vscode-widget-border,#4443); border-left-width:3px; border-radius:7px; }
                .sig[data-goto] { cursor:pointer; }
                .sig[data-goto]:hover { background:var(--vscode-list-hoverBackground); }
                .sig.ok { border-left-color:var(--vscode-charts-green,#3fb950); opacity:.75; }
                .sig.warn { border-left-color:var(--vscode-editorWarning-foreground,#cca700); }
                .sig.dead { border-left-color:var(--vscode-errorForeground,#f85149); }
                .sig.idle { border-left-color:var(--vscode-widget-border,#4443); opacity:.75; }
                .sigicon { font-size:15px; line-height:1.35; }
                .sigbody { flex:1; min-width:0; }
                .sighead { display:flex; gap:8px; align-items:baseline; }
                .sigdetail { font-size:12px; margin-top:2px; word-break:break-word; }
                .sighint { font-size:11.5px; opacity:.75; margin-top:3px; font-style:italic; }
                .siggo { opacity:.5; align-self:center; }
                .age { font-size:11px; opacity:.7; }
                .nowrap { white-space:nowrap; }
                h2.sec { margin:20px 0 8px; border:none; font-size:13px; text-transform:uppercase;
                    letter-spacing:.6px; opacity:.75; }
                tr.skipped td { opacity:.72; }
                .hintbox { border:1px solid var(--vscode-widget-border,#4443); border-radius:7px;
                    padding:8px 11px; margin:10px 0; font-size:12px; }
            </style>
            ${window.AFHeader.html({
                page: 'living',
                title: 'Living',
                sub: `is the system alive? — updated ${window.AFTime.clockUtc(d.generatedAt)}`,
                actions: '<button class="secondary" id="cfg">Configure checks…</button>',
                guide: 'yasam-panosu'
            })}
            ${scoreRing(d.score, d.verdict, d.counts)}
            ${open.length
                ? `<h2 class="sec">Open loops — ${open.length}</h2>${open.map(signalRow).join('')}`
                : `<h2 class="sec">Open loops</h2><p class="muted">Nothing is waiting on you. Every loop that opened has closed.</p>`}
            <h2 class="sec">Closing normally — ${fine.length}</h2>
            ${fine.map(signalRow).join('')}
            ${!d.hasChecks ? `<div class="hintbox">💡 Add your own checks (today's diary file, an inbox folder, anything with a path)
                via <b>Configure checks…</b> — each one becomes a row here. Without them this page only sees the farm,
                not the work the farm exists for.</div>` : ''}
            <h2 class="sec">What the farm has been doing</h2>
            ${recentHtml(d.recent)}`;

        window.AFHeader.wire(vscode);
        document.querySelectorAll('[data-goto]').forEach(el => {
            el.addEventListener('click', () => post({ type: 'goto', to: el.dataset.goto }));
            el.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { post({ type: 'goto', to: el.dataset.goto }); }
            });
        });
        const cfg = document.getElementById('cfg');
        if (cfg) { cfg.addEventListener('click', () => post({ type: 'configure' })); }
    }

    /** A signal's own two acts — "Configure checks…" beside them is a host
     *  command and needs nothing here. */
    function ctxDo(act, ctx) {
        if (act === 'lvGo') {
            if (ctx.sigGoto) { post({ type: 'goto', to: String(ctx.sigGoto) }); }
            return;
        }
        if (act === 'lvCopy') { window.AFCtx.copy(ctx.sigText); }
    }

    // ‼️ ONCE, at module scope — this page repaints itself every minute.
    window.AFCtx.listen(ctxDo);

    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'data') { DATA = e.data.data; render(); }
    });

    render();
    // Ages are the point on this page — keep them honest without a manual refresh.
    setInterval(() => { if (!document.hidden) { post({ type: 'refresh' }); } }, 60000);
})();
