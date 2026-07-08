// Agent Farm — live swim-lane timeline page script.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    let windowMin = 60; // 15 | 60 | 240

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') { DATA = ev.data.data; render(); }
    });
    setInterval(render, 5000); // advance the "now" line even without events

    const STATUS_META = {
        'working':            { label: 'WORKING',     color: 'var(--vscode-charts-blue, #3794ff)' },
        'tool':               { label: 'TOOL',        color: 'var(--vscode-charts-green, #4caf50)' },
        'waiting-permission': { label: 'PERMISSION?', color: 'var(--vscode-charts-red, #f14c4c)' },
        'waiting-input':      { label: 'YOUR TURN',   color: 'var(--vscode-charts-yellow, #cca700)' },
        'stalled':            { label: 'STALLED',     color: 'var(--vscode-charts-orange, #d18616)' },
        'idle':               { label: 'IDLE',        color: 'var(--vscode-descriptionForeground, #999)' },
        'ended':              { label: 'ENDED',       color: 'var(--vscode-descriptionForeground, #999)' }
    };

    function fmtClock(ts) {
        const d = new Date(ts);
        return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    function relTime(ts) {
        const s = Math.round((Date.now() - ts) / 1000);
        if (s < 60) return s + 's ago';
        const m = Math.round(s / 60);
        if (m < 60) return m + 'm ago';
        return Math.round(m / 60) + 'h ago';
    }

    function buildLanes(events, now, winMs) {
        const from = now - winMs;
        const lanes = new Map(); // agentName -> {segments, marks}
        const open = new Map();  // sessionId -> {start, tool, lane}

        const laneOf = name => {
            if (!lanes.has(name)) { lanes.set(name, { segments: [], marks: [] }); }
            return lanes.get(name);
        };

        // Seed lanes with live sessions so quiet agents still show a row.
        for (const s of DATA.sessions) { laneOf(s.agentName); }

        for (const e of events) {
            const name = e.agentName || e.sessionId.slice(0, 8);
            const lane = laneOf(name);
            if (e.kind === 'toolStart') {
                open.set(e.sessionId, { start: e.ts, tool: e.tool || '?', lane });
            } else if (e.kind === 'toolEnd') {
                const o = open.get(e.sessionId);
                if (o) {
                    open.delete(e.sessionId);
                    if (e.ts >= from) {
                        o.lane.segments.push({ start: Math.max(o.start, from), end: e.ts, tool: o.tool });
                    }
                }
            } else if (e.ts >= from) {
                lane.marks.push({ ts: e.ts, kind: e.kind, detail: e.detail || '', tool: e.tool || '', file: e.transcriptPath || '' });
            }
        }
        // Tools still running: draw to "now".
        for (const o of open.values()) {
            o.lane.segments.push({ start: Math.max(o.start, from), end: now, tool: o.tool, live: true });
        }
        return lanes;
    }

    const MARK_STYLE = {
        prompt:     { color: 'var(--vscode-charts-blue, #3794ff)',   shape: 'circle',  label: 'prompt' },
        permission: { color: 'var(--vscode-charts-red, #f14c4c)',    shape: 'diamond', label: 'permission wait' },
        stop:       { color: 'var(--vscode-charts-foreground, #ccc)',shape: 'tick',    label: 'turn end' },
        notify:     { color: 'var(--vscode-charts-yellow, #cca700)', shape: 'circle',  label: 'notification' },
        compact:    { color: 'var(--vscode-charts-purple, #b180d7)', shape: 'diamond', label: 'compaction' },
        subagent:   { color: 'var(--vscode-charts-orange, #d18616)', shape: 'circle',  label: 'subagent done' },
        start:      { color: 'var(--vscode-charts-green, #4caf50)',  shape: 'tick',    label: 'session start' },
        end:        { color: 'var(--vscode-descriptionForeground, #999)', shape: 'tick', label: 'session end' }
    };

    function lanesSvg(lanes, now, winMs) {
        const names = [...lanes.keys()];
        if (!names.length) { return '<p class="muted">No lanes yet.</p>'; }
        const W = 900, labelW = 110, rowH = 40, padT = 22;
        const H = padT + names.length * rowH + 10;
        const from = now - winMs;
        const x = ts => labelW + ((ts - from) / winMs) * (W - labelW - 8);
        let out = '';

        // time grid: 6 ticks
        for (let i = 0; i <= 6; i++) {
            const ts = from + (winMs / 6) * i;
            const xx = x(ts);
            out += `<line x1="${xx}" y1="${padT - 6}" x2="${xx}" y2="${H - 6}" stroke="currentColor" opacity="0.07"/>` +
                `<text x="${xx}" y="${padT - 10}" font-size="9" text-anchor="middle" fill="currentColor" opacity="0.55">${fmtClock(ts)}</text>`;
        }

        names.forEach((name, i) => {
            const y = padT + i * rowH;
            const lane = lanes.get(name);
            out += `<text x="${labelW - 10}" y="${y + rowH / 2 + 3}" font-size="11" font-weight="600" text-anchor="end" fill="currentColor" opacity="0.85">${C.esc(name.length > 14 ? name.slice(0, 13) + '…' : name)}</text>`;
            out += `<line x1="${labelW}" y1="${y + rowH / 2}" x2="${W - 8}" y2="${y + rowH / 2}" stroke="currentColor" opacity="0.1"/>`;
            for (const seg of lane.segments) {
                const x1 = x(seg.start), x2 = Math.max(x(seg.end), x1 + 2);
                out += `<rect x="${x1.toFixed(1)}" y="${y + rowH / 2 - 7}" width="${(x2 - x1).toFixed(1)}" height="14" rx="3" fill="var(--vscode-charts-green, #4caf50)" opacity="${seg.live ? 0.95 : 0.55}">` +
                    `<title>${C.esc(seg.tool)} — ${fmtClock(seg.start)} → ${seg.live ? 'running' : fmtClock(seg.end)} (${Math.max(1, Math.round((seg.end - seg.start) / 1000))}s)</title></rect>`;
            }
            for (const m of lane.marks) {
                const st = MARK_STYLE[m.kind] || MARK_STYLE.notify;
                const mx = x(m.ts), my = y + rowH / 2;
                const tip = `<title>${C.esc(st.label)}${m.tool ? ' · ' + C.esc(m.tool) : ''}${m.detail ? ' — ' + C.esc(m.detail) : ''} (${fmtClock(m.ts)})</title>`;
                if (st.shape === 'diamond') {
                    out += `<path d="M ${mx} ${my - 6} L ${mx + 5} ${my} L ${mx} ${my + 6} L ${mx - 5} ${my} Z" fill="${st.color}" class="mark" data-file="${C.esc(m.file)}">${tip}</path>`;
                } else if (st.shape === 'tick') {
                    out += `<line x1="${mx}" y1="${my - 8}" x2="${mx}" y2="${my + 8}" stroke="${st.color}" stroke-width="2" class="mark" data-file="${C.esc(m.file)}">${tip}</line>`;
                } else {
                    out += `<circle cx="${mx}" cy="${my}" r="4.2" fill="${st.color}" class="mark" data-file="${C.esc(m.file)}">${tip}</circle>`;
                }
            }
        });

        // now line
        out += `<line x1="${x(now)}" y1="${padT - 4}" x2="${x(now)}" y2="${H - 6}" stroke="var(--vscode-charts-red, #f14c4c)" stroke-width="1.5" opacity="0.8"/>`;
        return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${out}</svg>`;
    }

    const RUN_COLORS = {
        done: 'var(--vscode-charts-green, #4caf50)',
        running: 'var(--vscode-charts-blue, #3794ff)',
        failed: 'var(--vscode-charts-red, #f14c4c)',
        queued: 'var(--vscode-descriptionForeground, #999)',
        cancelled: 'var(--vscode-descriptionForeground, #999)'
    };

    function workflowRunsSvg(runs, now, winMs) {
        const visible = runs.filter(r => r.steps.some(s =>
            (s.endedAt || now) >= now - winMs));
        if (!visible.length) { return ''; }
        const W = 900, labelW = 150, rowH = 34, padT = 8;
        const H = padT + visible.length * rowH + 6;
        const from = now - winMs;
        const x = ts => labelW + ((Math.max(ts, from) - from) / winMs) * (W - labelW - 8);
        let out = '';
        visible.forEach((run, i) => {
            const y = padT + i * rowH;
            out += `<text x="${labelW - 10}" y="${y + rowH / 2 + 3}" font-size="11" font-weight="600" text-anchor="end" fill="currentColor" opacity="0.85">${C.esc(run.title.length > 18 ? run.title.slice(0, 17) + '…' : run.title)}</text>`;
            out += `<line x1="${labelW}" y1="${y + rowH / 2}" x2="${W - 8}" y2="${y + rowH / 2}" stroke="currentColor" opacity="0.1"/>`;
            run.steps.forEach((s, si) => {
                if (!s.startedAt) return;
                const end = s.endedAt || now;
                if (end < from) return;
                const x1 = x(s.startedAt), x2 = Math.max(x(end), x1 + 3);
                const color = RUN_COLORS[s.status] || RUN_COLORS.queued;
                out += `<rect x="${x1.toFixed(1)}" y="${y + rowH / 2 - 8}" width="${(x2 - x1).toFixed(1)}" height="16" rx="3" fill="${color}" opacity="${s.status === 'running' ? 0.95 : 0.65}">` +
                    `<title>${C.esc(s.title)} — ${C.esc(s.agentName)} (${s.status})\n${fmtClock(s.startedAt)} → ${s.endedAt ? fmtClock(s.endedAt) : 'running'}</title></rect>`;
                out += `<text x="${(x1 + 3).toFixed(1)}" y="${y + rowH / 2 + 4}" font-size="9" fill="var(--vscode-editor-background, #000)" opacity="0.9">${si + 1}</text>`;
            });
        });
        out += `<line x1="${x(now)}" y1="${padT}" x2="${x(now)}" y2="${H - 4}" stroke="var(--vscode-charts-red, #f14c4c)" stroke-width="1.5" opacity="0.8"/>`;
        return `<h2>Workflow runs</h2><div class="card chartbox"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${out}</svg>` +
            `<div class="legend"><span><i style="background:${RUN_COLORS.done}"></i>done</span><span><i style="background:${RUN_COLORS.running}"></i>running</span><span><i style="background:${RUN_COLORS.failed}"></i>failed</span></div></div>`;
    }

    function render() {
        const now = Date.now();
        const winMs = windowMin * 60000;
        const listener = DATA.listener;

        let listenerHtml;
        if (listener.state === 'listening') {
            listenerHtml = `<span class="badge" style="color:var(--vscode-charts-green,#4caf50);border-color:var(--vscode-charts-green,#4caf50)">● listening on 127.0.0.1:${listener.port}</span>`;
        } else if (listener.state === 'port-in-use') {
            listenerHtml = `<span class="badge err">port in use — another window may own the listener</span>`;
        } else if (listener.state === 'disabled') {
            listenerHtml = `<span class="badge warn">listener disabled (agentFarm.liveMonitor)</span>`;
        } else {
            listenerHtml = `<span class="badge err">listener error</span>`;
        }

        const sessionCards = DATA.sessions.map(s => {
            const meta = STATUS_META[s.status] || STATUS_META.idle;
            return `<div class="card" style="border-left:3px solid ${meta.color}">
                <div class="spread">
                    <h3 style="margin:0">${C.esc(s.agentName)}</h3>
                    <span class="badge" style="color:${meta.color};border-color:${meta.color}">${meta.label}${s.currentTool ? ' · ' + C.esc(s.currentTool) : ''}</span>
                </div>
                <div class="sub" style="margin-top:4px">${s.lastPrompt ? '“' + C.esc(s.lastPrompt) + '”' : '<span class="muted">no prompt yet</span>'}</div>
                <div class="sub" style="margin-top:6px">${s.prompts} prompts · ${s.toolCalls} tools · ${s.compactions} compactions · ${s.subagentStops} subagents · last event ${relTime(s.lastEventTs)}</div>
                ${s.transcriptPath ? `<div class="btnrow"><button class="secondary" data-open="${C.esc(s.transcriptPath)}">Open transcript</button></div>` : ''}
            </div>`;
        }).join('');

        const events = DATA.events || [];
        const lanes = buildLanes(events, now, winMs);
        const hasAny = events.length > 0;

        const emptyHint = hasAny ? '' : `
            <div class="card" style="margin-top:12px">
                <h3>No live events yet</h3>
                <p class="muted">The timeline is fed by Claude Code hooks. Install them once, then <strong>restart</strong> any running claude sessions (hooks are snapshotted at startup).</p>
                <div class="btnrow">
                    <button id="install">Install Live Hooks</button>
                    <button class="secondary" data-guide="canli-gozlem">? How this works</button>
                </div>
            </div>`;

        const legend = Object.entries(MARK_STYLE).map(([k, v]) =>
            `<span><i style="background:${v.color};${v.shape === 'diamond' ? 'transform:rotate(45deg);' : ''}"></i>${v.label}</span>`).join('') +
            `<span><i style="background:var(--vscode-charts-green,#4caf50);width:16px;border-radius:3px"></i>tool run</span>`;

        document.getElementById('app').innerHTML = `
            <div class="spread">
                <div>
                    <h1>Live Timeline</h1>
                    <div class="muted small">${listenerHtml} · fed by Claude Code hooks · window keeps last 4h</div>
                </div>
                <div class="btnrow">
                    <span class="seg">
                        ${[15, 60, 240].map(m => `<button data-win="${m}" class="${m === windowMin ? 'sel' : ''}">${m < 60 ? m + 'm' : (m / 60) + 'h'}</button>`).join('')}
                    </span>
                    <button class="secondary" id="refresh">Refresh</button>
                    <button class="secondary" data-guide="canli-gozlem">? Guide</button>
                </div>
            </div>
            ${emptyHint}
            <h2>Swim lanes</h2>
            <div class="card chartbox">${lanesSvg(lanes, now, winMs)}<div class="legend">${legend}</div></div>
            ${workflowRunsSvg(DATA.workflowRuns || [], now, winMs)}
            <h2>Live sessions (${DATA.sessions.length})</h2>
            <div class="grid">${sessionCards || '<p class="muted">No sessions tracked yet.</p>'}</div>
            <p class="footnote">Events arrive via local hooks (127.0.0.1 only, nothing leaves this machine). Stuck detection and permission alerts are configurable in settings.</p>
        `;

        const install = document.getElementById('install');
        if (install) { install.addEventListener('click', () => vscode.postMessage({ type: 'installHooks' })); }
        document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
        document.querySelectorAll('[data-win]').forEach(b =>
            b.addEventListener('click', () => { windowMin = Number(b.dataset.win); render(); }));
        document.querySelectorAll('[data-guide]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({ type: 'openGuide', anchor: b.dataset.guide })));
        document.querySelectorAll('[data-open]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({ type: 'openSession', file: b.dataset.open })));
        document.querySelectorAll('.mark').forEach(el =>
            el.addEventListener('click', () => {
                if (el.dataset.file) { vscode.postMessage({ type: 'openSession', file: el.dataset.file }); }
            }));
    }

    render();
})();
