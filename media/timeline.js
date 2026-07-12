// Agent Farm — live swim-lane timeline page script.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    // ≤1440 renders event dots from live memory (the monitor keeps 24h);
    // longer ranges render density buckets fetched from the host's persistent
    // store (survives reloads, keeps 31d).
    let windowMin = 60;
    const DETAIL_MAX_MIN = 1440;
    let HISTORY = null;        // { hours, density, workflowRuns }
    let historyFetchedAt = 0;
    let historyRequested = 0;

    // Per-agent "YOUR TURN" notification toggles, shown in the swim-lane gutter.
    // Authoritative in the page once seeded from the host; edits round-trip back
    // to globalState so they fire even when this panel is closed.
    let turnActions = null;    // agentName -> array of action ids (agent DEFAULT)
    // Per-session overrides edited on the Live-sessions cards: sessionId -> ids.
    // An explicit [] means "mute this session"; a missing key follows the default.
    let sessionActions = null;
    const TURN_ACTIONS = [
        { id: 'sound', glyph: '♪', label: 'Sound (beep)' },
        { id: 'focus', glyph: '◎', label: 'Focus / bring forward' },
        { id: 'modal', glyph: '▣', label: 'Modal alert box' },
        { id: 'toast', glyph: '▭', label: 'Toast (corner notification)' }
    ];
    function actionsFor(name) { return (turnActions && turnActions[name]) || []; }

    // HTML toggle chips for one Live-sessions card. Same .af-toggle class as the
    // swim-lane SVG toggles, but carrying data-session: clicks change only THIS
    // session, so two open sessions of one agent alert independently.
    function turnChips(s) {
        const override = sessionActions ? sessionActions[s.sessionId] : undefined;
        const on = override !== undefined ? override : actionsFor(s.agentName);
        const chips = TURN_ACTIONS.map(a => {
            const sel = on.indexOf(a.id) !== -1;
            const style = sel
                ? 'background:var(--vscode-charts-blue,#3794ff);color:var(--vscode-editor-background,#fff);border-color:var(--vscode-charts-blue,#3794ff)'
                : 'opacity:0.6';
            return `<span class="af-toggle badge" data-agent="${C.esc(s.agentName)}" data-session="${C.esc(s.sessionId)}" data-action="${a.id}" title="${C.esc(a.label)} — when it's this session's turn (changes this session only; the swim-lane toggles set the agent default)" style="cursor:pointer;padding:1px 6px;${style}">${a.glyph}</span>`;
        }).join(' ');
        const mode = override !== undefined
            ? `<span class="af-reset muted small" data-session="${C.esc(s.sessionId)}" style="cursor:pointer;text-decoration:underline" title="Drop this session's override and follow the agent default again">session override — reset</span>`
            : `<span class="muted small">(agent default)</span>`;
        return `<div class="sub" style="margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">` +
            `<span class="muted small">alert on your turn:</span>${chips} ${mode}</div>`;
    }

    function isDensity() { return windowMin > DETAIL_MAX_MIN; }

    function requestHistory(force) {
        const hours = windowMin / 60;
        const fresh = HISTORY && HISTORY.hours === hours && Date.now() - historyFetchedAt < 30000;
        if (!force && (fresh || Date.now() - historyRequested < 3000)) { return; }
        historyRequested = Date.now();
        vscode.postMessage({ type: 'history', hours });
    }

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') {
            DATA = ev.data.data;
            if (isDensity()) { requestHistory(false); }
            render();
        } else if (ev.data.type === 'history') {
            HISTORY = ev.data;
            historyFetchedAt = Date.now();
            render();
        }
    });
    setInterval(() => {
        if (isDensity()) { requestHistory(false); }
        render();
    }, 5000); // advance the "now" line even without events

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

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function fmtTick(ts, winMs) {
        const d = new Date(ts);
        if (winMs <= 26 * 3600 * 1000) { return fmtClock(ts); }
        const day = d.getDate() + ' ' + MONTHS[d.getMonth()];
        return winMs <= 4 * 24 * 3600 * 1000 ? day + ' ' + fmtClock(ts) : day;
    }

    function relTime(ts) {
        const s = Math.round((Date.now() - ts) / 1000);
        if (s < 60) return s + 's ago';
        const m = Math.round(s / 60);
        if (m < 60) return m + 'm ago';
        return Math.round(m / 60) + 'h ago';
    }

    // One row per CONCURRENT session: each agent's sessions are packed into
    // tracks — sessions that overlap in time get separate rows ("dev #1",
    // "dev #2"), sequential ones share a row, so two open sessions of the same
    // agent no longer draw on top of each other.
    function buildLanes(events, now, winMs) {
        const from = now - winMs;
        const bySession = new Map(); // sessionId -> {agent, first, last, live, segments, marks}
        const open = new Map();      // sessionId -> {start, tool, file}

        const sessOf = (id, agent, ts) => {
            let s = bySession.get(id);
            if (!s) {
                s = { agent, first: ts, last: ts, live: false, segments: [], marks: [] };
                bySession.set(id, s);
            }
            s.first = Math.min(s.first, ts);
            s.last = Math.max(s.last, ts);
            return s;
        };

        // Live sessions always get a row, stretched to "now" so concurrent ones
        // can never share a track even while quiet.
        for (const ls of DATA.sessions) {
            const s = sessOf(ls.sessionId, ls.agentName, ls.startedAt || now);
            s.last = now;
            s.live = true;
        }

        for (const e of events) {
            const s = sessOf(e.sessionId, e.agentName || e.sessionId.slice(0, 8), e.ts);
            if (e.kind === 'toolStart') {
                open.set(e.sessionId, { start: e.ts, tool: e.tool || '?', file: e.transcriptPath || '' });
            } else if (e.kind === 'toolEnd') {
                const o = open.get(e.sessionId);
                if (o) {
                    open.delete(e.sessionId);
                    if (e.ts >= from) {
                        s.segments.push({ start: Math.max(o.start, from), end: e.ts, tool: o.tool, file: o.file });
                    }
                }
            } else if (e.ts >= from) {
                s.marks.push({ ts: e.ts, kind: e.kind, detail: e.detail || '', tool: e.tool || '', file: e.transcriptPath || '' });
            }
        }
        // Tools still running: draw to "now".
        for (const [sid, o] of open) {
            const s = bySession.get(sid);
            if (s) {
                s.segments.push({ start: Math.max(o.start, from), end: now, tool: o.tool, live: true, file: o.file });
                s.last = now;
            }
        }

        // Group visible sessions per agent (keep first-seen agent order), then
        // pack each agent's sessions into tracks: reuse a track only when the
        // previous session on it ended before this one starts.
        const byAgent = new Map();
        for (const s of bySession.values()) {
            if (!s.live && s.last < from) { continue; } // nothing to show in range
            if (!byAgent.has(s.agent)) { byAgent.set(s.agent, []); }
            byAgent.get(s.agent).push(s);
        }
        const lanes = [];
        for (const [agent, list] of byAgent) {
            list.sort((a, b) => a.first - b.first);
            const tracks = [];
            for (const s of list) {
                let t = tracks.find(tr => tr.end <= s.first);
                if (!t) { t = { end: 0, segments: [], marks: [] }; tracks.push(t); }
                t.end = Math.max(t.end, s.last);
                t.segments.push(...s.segments);
                t.marks.push(...s.marks);
            }
            tracks.forEach((t, i) => lanes.push({
                agent,
                name: tracks.length > 1 ? `${agent} #${i + 1}` : agent,
                firstOfAgent: i === 0,
                segments: t.segments,
                marks: t.marks
            }));
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
        start:      { color: '#0000FF',                              shape: 'tick',    label: 'session start' },
        end:        { color: 'var(--vscode-descriptionForeground, #999)', shape: 'tick', label: 'session end' }
    };

    function lanesSvg(lanes, now, winMs) {
        if (!lanes.length) { return '<p class="muted">No lanes yet.</p>'; }
        const W = 900, labelW = 100, rowH = 46, padT = 22;
        const H = padT + lanes.length * rowH + 10;
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

        lanes.forEach((lane, i) => {
            const y = padT + i * rowH;
            const name = lane.name;
            // Gutter: row label on top; the agent-default YOUR-TURN toggles
            // (♪ ◎ ▣ ▭) only on the agent's FIRST row — they cover every session
            // of that agent (per-session overrides live on the session cards).
            out += `<text x="4" y="${y + 14}" font-size="11" font-weight="600" text-anchor="start" fill="currentColor" opacity="0.85">${C.esc(name.length > 14 ? name.slice(0, 13) + '…' : name)}</text>`;
            const ty = y + 23;
            if (lane.firstOfAgent) { TURN_ACTIONS.forEach((a, ai) => {
                const gx = 4 + ai * 18;
                const on = actionsFor(lane.agent).indexOf(a.id) !== -1;
                out += `<g class="af-toggle" data-agent="${C.esc(lane.agent)}" data-action="${a.id}" style="cursor:pointer">` +
                    `<rect x="${gx}" y="${ty}" width="15" height="15" rx="3" fill="${on ? 'var(--vscode-charts-blue, #3794ff)' : 'transparent'}" stroke="currentColor" stroke-opacity="${on ? '0' : '0.45'}" opacity="${on ? '0.95' : '1'}"/>` +
                    `<text x="${gx + 7.5}" y="${ty + 11.5}" font-size="10.5" text-anchor="middle" fill="${on ? 'var(--vscode-editor-background, #fff)' : 'currentColor'}" opacity="${on ? '1' : '0.55'}" style="pointer-events:none">${a.glyph}</text>` +
                    `<title>${C.esc(a.label)} — agent default for every ${C.esc(lane.agent)} session hitting YOUR TURN (override one session on its card below)</title></g>`;
            }); }
            out += `<line x1="${labelW}" y1="${y + rowH / 2}" x2="${W - 8}" y2="${y + rowH / 2}" stroke="currentColor" opacity="0.1"/>`;
            for (const seg of lane.segments) {
                const x1 = x(seg.start), x2 = Math.max(x(seg.end), x1 + 2);
                out += `<rect x="${x1.toFixed(1)}" y="${y + rowH / 2 - 7}" width="${(x2 - x1).toFixed(1)}" height="14" rx="3" fill="var(--vscode-charts-green, #4caf50)" opacity="${seg.live ? 0.95 : 0.55}" class="mark" data-file="${C.esc(seg.file || '')}" data-ts="${seg.start}">` +
                    `<title>${C.esc(seg.tool)} — ${fmtClock(seg.start)} → ${seg.live ? 'running' : fmtClock(seg.end)} (${Math.max(1, Math.round((seg.end - seg.start) / 1000))}s)</title></rect>`;
            }
            for (const m of lane.marks) {
                const st = MARK_STYLE[m.kind] || MARK_STYLE.notify;
                const mx = x(m.ts), my = y + rowH / 2;
                const tip = `<title>${C.esc(st.label)}${m.tool ? ' · ' + C.esc(m.tool) : ''}${m.detail ? ' — ' + C.esc(m.detail) : ''} (${fmtClock(m.ts)})</title>`;
                if (st.shape === 'diamond') {
                    out += `<path d="M ${mx} ${my - 6} L ${mx + 5} ${my} L ${mx} ${my + 6} L ${mx - 5} ${my} Z" fill="${st.color}" class="mark" data-file="${C.esc(m.file)}" data-ts="${m.ts}">${tip}</path>`;
                } else if (st.shape === 'tick') {
                    out += `<line x1="${mx}" y1="${my - 8}" x2="${mx}" y2="${my + 8}" stroke="${st.color}" stroke-width="2" class="mark" data-file="${C.esc(m.file)}" data-ts="${m.ts}">${tip}</line>`;
                } else {
                    out += `<circle cx="${mx}" cy="${my}" r="4.2" fill="${st.color}" class="mark" data-file="${C.esc(m.file)}" data-ts="${m.ts}">${tip}</circle>`;
                }
            }
        });

        // now line
        out += `<line x1="${x(now)}" y1="${padT - 4}" x2="${x(now)}" y2="${H - 6}" stroke="var(--vscode-charts-red, #f14c4c)" stroke-width="1.5" opacity="0.8"/>`;
        return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${out}</svg>`;
    }

    // Density view: per-lane bucket bars (tools green + prompts blue stacked,
    // sqrt scale) with red alert ticks — patterns over dots at day+ zoom.
    function densitySvg(density, winMs) {
        const lanes = (density && density.lanes) || [];
        if (!lanes.length || !density.totalEvents) {
            return '<p class="muted">No recorded events in this range. History accumulates while hooks are installed (from v2.13.0 on, it survives reloads).</p>';
        }
        const W = 900, labelW = 110, rowH = 44, padT = 22, barMax = rowH - 14;
        const names = lanes.map(l => l.name);
        const H = padT + names.length * rowH + 12;
        const from = density.from;
        const x = i => labelW + (i / lanes[0].buckets.length) * (W - labelW - 8);
        const bw = Math.max(1.5, (W - labelW - 8) / lanes[0].buckets.length - 0.6);
        let maxTotal = 1;
        for (const l of lanes) {
            for (const b of l.buckets) { maxTotal = Math.max(maxTotal, b[0] + b[1] + b[3]); }
        }
        let out = '';
        for (let i = 0; i <= 6; i++) {
            const ts = from + (winMs / 6) * i;
            const xx = labelW + ((W - labelW - 8) / 6) * i;
            out += `<line x1="${xx}" y1="${padT - 6}" x2="${xx}" y2="${H - 6}" stroke="currentColor" opacity="0.07"/>` +
                `<text x="${xx}" y="${padT - 10}" font-size="9" text-anchor="middle" fill="currentColor" opacity="0.55">${fmtTick(ts, winMs)}</text>`;
        }
        lanes.forEach((lane, li) => {
            const y0 = padT + li * rowH + rowH - 6; // baseline
            out += `<text x="${labelW - 10}" y="${padT + li * rowH + rowH / 2 + 3}" font-size="11" font-weight="600" text-anchor="end" fill="currentColor" opacity="0.85">${C.esc(lane.name.length > 14 ? lane.name.slice(0, 13) + '…' : lane.name)}</text>`;
            out += `<line x1="${labelW}" y1="${y0}" x2="${W - 8}" y2="${y0}" stroke="currentColor" opacity="0.12"/>`;
            lane.buckets.forEach((b, bi) => {
                const total = b[0] + b[1] + b[3];
                if (!total && !b[2]) { return; }
                const bx = x(bi);
                const h = Math.max(2, Math.sqrt(total / maxTotal) * barMax);
                const hTools = total ? h * ((b[0] + b[3]) / total) : 0;
                const hPrompts = h - hTools;
                const t0 = from + bi * density.bucketMs;
                const tip = `<title>${fmtTick(t0, winMs)} – ${fmtTick(t0 + density.bucketMs, winMs)}\n${b[0]} tool · ${b[1]} prompt · ${b[2]} permission · ${b[3]} other</title>`;
                if (hTools > 0) {
                    out += `<rect x="${bx.toFixed(1)}" y="${(y0 - hTools).toFixed(1)}" width="${bw.toFixed(1)}" height="${hTools.toFixed(1)}" fill="var(--vscode-charts-green, #4caf50)" opacity="0.75">${tip}</rect>`;
                }
                if (hPrompts > 0) {
                    out += `<rect x="${bx.toFixed(1)}" y="${(y0 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${hPrompts.toFixed(1)}" fill="var(--vscode-charts-blue, #3794ff)" opacity="0.85">${tip}</rect>`;
                }
                if (b[2] > 0) {
                    out += `<rect x="${bx.toFixed(1)}" y="${(padT + li * rowH + 2).toFixed(1)}" width="${bw.toFixed(1)}" height="4" fill="var(--vscode-charts-red, #f14c4c)">${tip}</rect>`;
                }
            });
        });
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
        if (turnActions === null) { turnActions = Object.assign({}, DATA.turnActions || {}); }
        if (sessionActions === null) { sessionActions = Object.assign({}, DATA.sessionTurnActions || {}); }

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
                    <h3 style="margin:0">${C.esc(s.label || s.agentName)}${s.source ? ` <span class="badge" title="external CLI — open/closed tracked; richer events only if the CLI is wired to the hook bridge (Copy CLI Hook Bridge Command); no cost tracking">${C.esc(s.source)}</span>` : ''}</h3>
                    <span class="badge" style="color:${meta.color};border-color:${meta.color}">${meta.label}${s.currentTool ? ' · ' + C.esc(s.currentTool) : ''}</span>
                </div>
                <div class="sub" style="margin-top:4px">${s.lastPrompt ? '“' + C.esc(s.lastPrompt) + '”' : `<span class="muted">${s.source ? 'external CLI — lifecycle only' : 'no prompt yet'}</span>`}</div>
                <div class="sub" style="margin-top:6px">started ${fmtClock(s.startedAt)} · ${s.prompts} prompts · ${s.toolCalls} tools · ${s.compactions} compactions · ${s.subagentStops} subagents · last event ${relTime(s.lastEventTs)}</div>
                ${turnChips(s)}
                ${s.transcriptPath ? `<div class="btnrow"><button class="secondary" data-open="${C.esc(s.transcriptPath)}" data-ts="${s.lastEventTs || 0}">Open transcript</button></div>` : ''}
            </div>`;
        }).join('');

        const density = isDensity();
        const events = DATA.events || [];
        const hasAny = density ? !!(HISTORY && HISTORY.density && HISTORY.density.totalEvents) : events.length > 0;

        let lanesHtml;
        if (density) {
            if (HISTORY && HISTORY.hours === windowMin / 60) {
                lanesHtml = densitySvg(HISTORY.density, winMs);
            } else {
                requestHistory(true);
                lanesHtml = '<p class="muted">Loading history…</p>';
            }
        } else {
            lanesHtml = lanesSvg(buildLanes(events, now, winMs), now, winMs);
        }
        const runsData = density && HISTORY && HISTORY.hours === windowMin / 60
            ? (HISTORY.workflowRuns || [])
            : (DATA.workflowRuns || []);

        const emptyHint = hasAny ? '' : `
            <div class="card" style="margin-top:12px">
                <h3>No live events yet</h3>
                <p class="muted">The timeline is fed by Claude Code hooks. Install them once, then <strong>restart</strong> any running claude sessions (hooks are snapshotted at startup).</p>
                <div class="btnrow">
                    <button id="install">Install Live Hooks</button>
                    <button class="secondary" data-guide="canli-gozlem">? How this works</button>
                </div>
            </div>`;

        const legend = density
            ? `<span><i style="background:var(--vscode-charts-green,#4caf50);width:16px;border-radius:3px"></i>tools</span>` +
              `<span><i style="background:var(--vscode-charts-blue,#3794ff);width:16px;border-radius:3px"></i>prompts</span>` +
              `<span><i style="background:var(--vscode-charts-red,#f14c4c);width:16px;border-radius:3px"></i>permission waits (top strip)</span>` +
              `<span class="muted">bar height = activity (√ scale) per ${Math.round((winMs / 168) / 60000)}min bucket</span>`
            : Object.entries(MARK_STYLE).map(([k, v]) =>
                `<span><i style="background:${v.color};${v.shape === 'diamond' ? 'transform:rotate(45deg);' : ''}"></i>${v.label}</span>`).join('') +
              `<span><i style="background:var(--vscode-charts-green,#4caf50);width:16px;border-radius:3px"></i>tool run</span>`;

        document.getElementById('app').innerHTML = `
            <div class="spread">
                <div>
                    <h1>Live Timeline</h1>
                    <div class="muted small">${listenerHtml} · fed by Claude Code hooks · detail ≤24h live, 3d+ from persisted history (kept 31 days)</div>
                </div>
                <div class="btnrow">
                    <span class="seg">
                        ${[15, 60, 240, 480, 960, 1440, 4320, 10080, 43200].map(m => {
                            const label = m < 60 ? m + 'm' : m <= 1440 ? (m / 60) + 'h' : (m / 1440) + 'd';
                            return `<button data-win="${m}" class="${m === windowMin ? 'sel' : ''}">${label}</button>`;
                        }).join('')}
                    </span>
                    <button class="secondary" id="refresh">Refresh</button>
                    <button class="secondary" id="dashboard">Dashboard</button>
                    <button class="secondary" data-guide="canli-gozlem">? Guide</button>
                </div>
            </div>
            ${emptyHint}
            <h2>${density ? 'Activity density' : 'Swim lanes'}</h2>
            ${density ? '' : `<div class="muted small" style="margin:-4px 0 6px">Left toggles — when an agent hits <b>YOUR TURN</b>: ${TURN_ACTIONS.map(a => a.glyph + ' ' + a.label.split(' ')[0].toLowerCase()).join(' · ')}. Agent default for all of its sessions (fires even while this panel is closed); override a single session on its card below. Concurrent sessions of one agent get their own #1/#2 rows.</div>`}
            <div class="card chartbox">${lanesHtml}<div class="legend">${legend}</div></div>
            ${workflowRunsSvg(runsData, now, winMs)}
            <h2>Live sessions (${DATA.sessions.length})</h2>
            <div class="grid">${sessionCards || '<p class="muted">No sessions tracked yet.</p>'}</div>
            <p class="footnote">Events arrive via local hooks (127.0.0.1 only, nothing leaves this machine). Stuck detection and permission alerts are configurable in settings.</p>
        `;

        const install = document.getElementById('install');
        if (install) { install.addEventListener('click', () => vscode.postMessage({ type: 'installHooks' })); }
        document.getElementById('refresh').addEventListener('click', () => {
            if (isDensity()) { requestHistory(true); }
            vscode.postMessage({ type: 'refresh' });
        });
        document.getElementById('dashboard').addEventListener('click', () =>
            vscode.postMessage({ type: 'openDashboard' }));
        document.querySelectorAll('[data-win]').forEach(b =>
            b.addEventListener('click', () => { windowMin = Number(b.dataset.win); render(); }));
        document.querySelectorAll('[data-guide]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({ type: 'openGuide', anchor: b.dataset.guide })));
        document.querySelectorAll('[data-open]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({
                // live card: land on the latest activity, not the top of the file
                type: 'openSession', file: b.dataset.open, ts: Number(b.dataset.ts) || 0
            })));
        document.querySelectorAll('.mark').forEach(el =>
            el.addEventListener('click', () => {
                if (el.dataset.file) {
                    // ts rides along so the viewer opens scrolled to this exact event.
                    vscode.postMessage({ type: 'openSession', file: el.dataset.file, ts: Number(el.dataset.ts) || 0 });
                }
            }));
        document.querySelectorAll('.af-toggle').forEach(el =>
            el.addEventListener('click', () => {
                const act = el.dataset.action;
                if (el.dataset.session) {
                    // Card chip: session-only override (an empty set is kept —
                    // it means "mute this session despite the agent default").
                    const sid = el.dataset.session;
                    const base = sessionActions[sid] !== undefined
                        ? sessionActions[sid] : actionsFor(el.dataset.agent);
                    const cur = new Set(base);
                    if (cur.has(act)) { cur.delete(act); } else { cur.add(act); }
                    sessionActions[sid] = [...cur];
                    vscode.postMessage({ type: 'setSessionTurnActions', map: sessionActions });
                } else {
                    // Swim-lane toggle: the agent default.
                    const name = el.dataset.agent;
                    const cur = new Set(actionsFor(name));
                    if (cur.has(act)) { cur.delete(act); } else { cur.add(act); }
                    if (cur.size) { turnActions[name] = [...cur]; } else { delete turnActions[name]; }
                    vscode.postMessage({ type: 'setTurnActions', map: turnActions });
                }
                render();
            }));
        document.querySelectorAll('.af-reset').forEach(el =>
            el.addEventListener('click', () => {
                delete sessionActions[el.dataset.session];
                vscode.postMessage({ type: 'setSessionTurnActions', map: sessionActions });
                render();
            }));
    }

    render();
})();
