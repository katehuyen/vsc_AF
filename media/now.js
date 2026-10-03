// Agent Farm — "Now" page script: what waits for you, what runs, today, notices, and a box to speak.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    const T = window.AFTime;
    // U-189 — every word on this page is drawn in the interface language (media/afI18n.js)
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    let DATA = window.__DATA__;
    // The box outlives every redraw: a push while typing must not cost the words.
    let draft = '';
    let target = '';
    let note = null;

    const repaint = window.AFRepaint.guard(render);
    window.addEventListener('message', ev => {
        const m = ev.data || {};
        if (m.type === 'data') { DATA = m.data; repaint(); }
        if (m.type === 'sent') {
            note = m.ok ? { ok: true, text: t('Sent.') } : { ok: false, text: m.error || t('Not sent.') };
            if (m.ok) { draft = ''; }
            render();
        }
    });

    const KIND = {
        'permission': '🛡️', 'browser-approval': '🌐', 'mission': '🎯', 'question': '❓',
        'console-question': '❓', 'interrupted': '✂️', 'stalled': '⏳', 'engine-fault': '⚡'
    };
    const STATUS = { working: 'working', idle: 'idle', starting: 'starting', error: 'error' };
    const LEVEL = { 3: '🔴', 2: '🟠', 1: '🔵' };

    const esc = s => C.esc(String(s === undefined || s === null ? '' : s));
    const nav = to => vscode.postMessage({ type: 'afnav', to });
    const money = n => '$' + (Number(n) || 0).toFixed(2);
    const stateOf = s => (s.waits ? t('waits for you') : t(s.status));

    function tipped(inner, lines) {
        return window.AFTip.wrap(inner, lines[0], window.AFTip.lines(lines.slice(1)), 'nw-tipw');
    }

    function waitingHtml(d) {
        const rows = d.waiting.map(w => tipped(
            `<div class="nw-row nw-go" data-nav="needs" tabindex="0">
                <span class="nw-ic">${KIND[w.kind] || '•'}</span>
                <span class="nw-main"><b>${esc(w.agentName)}</b> · ${esc(w.title)}
                    <span class="nw-line muted">${esc(w.detail)}</span></span>
                <span class="nw-when muted">${esc(T.ago(w.ts))}</span>
            </div>`,
            [`${w.agentName} · ${w.title}`, T.tip(w.ts, 'Raised'), window.AFTip.GAP, w.detail || '']));
        const more = d.waitingMore ? `<div class="nw-more nw-go" data-nav="needs">${esc(t('+{n} more in Needs You', { n: d.waitingMore }))}</div>` : '';
        return section(t('Waiting for you'), d.waiting.length + d.waitingMore, 'needs',
            rows.join('') + more, '🎉 ' + t('Nothing is waiting for you.'));
    }

    function runningHtml(d) {
        const rows = d.running.map(s => {
            const sel = s.id === target ? ' sel' : '';
            return tipped(`<div class="nw-row nw-pick${sel}" data-pick="${esc(s.id)}" tabindex="0" aria-pressed="${sel ? 'true' : 'false'}">
                <span class="nw-ic">${s.waits ? '✋' : s.status === 'working' ? '▶' : '·'}</span>
                <span class="nw-main"><b>${esc(s.agentName)}</b> ${window.AFEngine.badge(s.engine)}
                    <span class="nw-st ${esc(STATUS[s.status] || 'other')}">${esc(stateOf(s))}</span>
                    <span class="nw-line muted">${esc(s.doing || '—')}</span></span>
                <span class="nw-when muted" title="${esc(T.tip(s.since, s.status === 'working' ? 'Turn started' : 'Started'))}">${esc(T.ago(s.since))}<br>${money(s.costUSD)}</span>
                ${sel ? '<span class="nw-check" aria-hidden="true">✓</span>' : ''}
            </div>`,
            [`${s.agentName} · ${window.AFEngine.label(s.engine)}`,
                t('Status: {state}', { state: stateOf(s) }),
                T.tip(s.since, s.status === 'working' ? 'Turn started' : 'Started'),
                t('Cost: {cost}', { cost: money(s.costUSD) }),
                window.AFTip.GAP, s.doing || t('Nothing said yet.'), window.AFTip.GAP,
                t('Click: the box below speaks to this session')]);
        });
        return section(t('Running'), d.running.length, 'console', rows.join(''), t('No session is running.'));
    }

    function todayHtml(d) {
        const bars = d.today.quotas.map(q => {
            const p = Math.max(0, Math.min(100, Number(q.percent) || 0));
            const hot = p >= 90 ? ' hot' : p >= 70 ? ' warm' : '';
            const lines = [t('Account: {account}', { account: q.account }), t('Engine: {engine}', { engine: q.engine }),
                t('Five-hour window: {pct}%', { pct: Math.round(p) })];
            if (q.resetsAt) { lines.push(t('Resets: {time}', { time: T.clock(q.resetsAt) })); }
            return `<div class="nw-q" title="${esc(lines.join('\n'))}">
                <span class="nw-qn">${esc(q.account)}</span>
                <span class="nw-qb"><span class="nw-qf${hot}" style="width:${p}%"></span></span>
                <span class="nw-qp">${esc(t('{pct}% 5h', { pct: Math.round(p) }))}</span>
            </div>`;
        });
        return section(t('Today'), null, null,
            `<div class="nw-cost">${money(d.today.cost)} <span class="muted small">${esc(t('spent today'))}</span></div>${bars.join('')}`, '');
    }

    function noticesHtml(d) {
        const rows = d.notices.map(n => `<div class="nw-row nw-go${n.read ? ' read' : ''}" data-nav="notices" tabindex="0">
                <span class="nw-ic">${LEVEL[n.level] || '·'}</span>
                <span class="nw-main">${esc(n.title)}<span class="nw-line muted">${esc(n.agentName)} · ${esc(n.type)}</span></span>
                <span class="nw-when muted" title="${esc(T.tip(n.ts, 'Posted'))}">${esc(T.ago(n.ts))}</span>
            </div>`);
        return section(t('Notices'), null, 'notices', rows.join(''), t('No notices yet.'));
    }

    function section(title, count, to, body, empty) {
        const head = to ? `<a class="nw-h nw-go" data-nav="${to}" tabindex="0">${title}${count !== null ? ` <span class="nw-n">${count}</span>` : ''} ›</a>`
            : `<span class="nw-h">${title}</span>`;
        return `<section class="nw-card">${head}${body || `<p class="muted nw-empty">${empty}</p>`}</section>`;
    }

    function aim(d) {
        if (target && !d.running.some(s => s.id === target)) { target = ''; }
        if (!target && d.running.length) { target = d.running[0].id; }
    }

    function composerHtml(d) {
        const opts = d.running.map(s => `<option value="${esc(s.id)}"${s.id === target ? ' selected' : ''} title="${esc([t('Agent: {agent}', { agent: s.agentName }),
            t('Engine: {engine}', { engine: window.AFEngine.label(s.engine) }), t('Status: {state}', { state: stateOf(s) }),
            t('Cost: {cost}', { cost: money(s.costUSD) })].join('\n'))}">${esc(s.agentName)} · ${esc(stateOf(s))}</option>`).join('');
        const picked = d.running.find(s => s.id === target);
        return `<div class="nw-box">
            ${note ? `<div class="nw-note ${note.ok ? 'ok' : 'bad'}">${esc(note.text)}</div>` : ''}
            <div class="nw-boxrow">
                ${d.running.length ? `<select id="nw-to" title="${esc(picked ? [t('Session: {agent}', { agent: picked.agentName }), t('Status: {state}', { state: stateOf(picked) })].join('\n') : '')}">${opts}</select>` : ''}
                <textarea id="nw-text" rows="1" placeholder="${esc(d.running.length ? t('Say something to this session…') : t('No running session — start one'))}" ${d.running.length ? '' : 'disabled'}>${esc(draft)}</textarea>
                <button id="nw-send" ${d.running.length && draft.trim() ? '' : 'disabled'}>${esc(t('Send'))}</button>
                <button id="nw-new" class="secondary" title="${esc(t('Open the Console to start a session'))}">${esc(window.AFI18n ? window.AFI18n.label('＋ New') : '＋ New')}</button>
            </div>
        </div>`;
    }

    function render() {
        const d = DATA;
        aim(d);
        const busy = d.waiting.length + d.waitingMore;
        document.getElementById('app').innerHTML = `
            <style>
                #app { padding-bottom:84px; }
                html.af-phone .nw-box { border-bottom:1px solid var(--vscode-panel-border); }
                .nw-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:12px; margin-top:10px; }
                .nw-card { border:1px solid var(--vscode-panel-border); border-radius:6px; padding:8px 10px; min-width:0; }
                .nw-h { display:block; font-weight:600; margin-bottom:6px; text-decoration:none; color:inherit; }
                .nw-n { font-weight:400; opacity:.75; }
                .nw-go, .nw-pick { cursor:pointer; }
                .nw-row { display:flex; gap:8px; align-items:flex-start; padding:6px 4px; border-top:1px solid var(--vscode-panel-border); min-height:40px; }
                .nw-row:first-of-type { border-top:0; }
                .nw-row:hover { background:var(--vscode-list-hoverBackground); }
                .nw-row.sel { background:var(--vscode-list-inactiveSelectionBackground); border-left:3px solid var(--vscode-focusBorder); }
                .nw-row.read { opacity:.7; }
                .nw-ic { width:22px; text-align:center; flex-shrink:0; }
                .nw-main { flex:1; min-width:0; }
                .nw-line { display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:12px; }
                .nw-when { flex-shrink:0; text-align:right; font-size:11px; }
                .nw-check { flex-shrink:0; }
                .nw-tipw { display:block; }
                .nw-st { font-size:11px; opacity:.8; margin-left:4px; }
                .nw-st.working { color:var(--vscode-charts-green, #3a3); opacity:1; }
                .nw-st.error { color:var(--vscode-errorForeground); opacity:1; }
                .nw-more { font-size:12px; padding:4px; opacity:.85; }
                .nw-cost { font-size:22px; font-weight:600; margin:2px 0 8px; }
                .nw-q { display:flex; gap:8px; align-items:center; margin:4px 0; font-size:12px; }
                .nw-qn { width:34%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                .nw-qb { flex:1; height:8px; border-radius:4px; background:var(--vscode-editorWidget-background, #8883); overflow:hidden; }
                .nw-qf { display:block; height:100%; background:var(--vscode-charts-blue, #37f); }
                .nw-qf.warm { background:var(--vscode-charts-orange, orange); }
                .nw-qf.hot { background:var(--vscode-charts-red, #d33); }
                .nw-qp { width:58px; text-align:right; }
                .nw-empty { margin:4px 0; }
                .nw-box { position:fixed; left:0; right:0; bottom:var(--af-bottom, 0px); padding:8px 12px; background:var(--vscode-editor-background);
                    border-top:1px solid var(--vscode-panel-border); }
                .nw-boxrow { display:flex; gap:6px; align-items:flex-end; }
                .nw-boxrow select { max-width:34%; min-height:32px; }
                .nw-boxrow textarea { flex:1; min-width:0; min-height:32px; max-height:120px; resize:none; font:inherit; }
                .nw-boxrow button { min-height:32px; }
                .nw-note { font-size:12px; margin-bottom:4px; }
                .nw-note.bad { color:var(--vscode-errorForeground); }
                @media (max-width:520px) {
                    .nw-grid { grid-template-columns:1fr; }
                    .nw-boxrow { flex-wrap:wrap; }
                    .nw-boxrow select { max-width:none; flex:1 1 100%; }
                }
            </style>
            ${window.AFHeader.html({
                page: 'now',
                title: t('Now'),
                sub: `${esc(t('{waiting} waiting · {running} running · {cost} today', { waiting: busy, running: d.running.length, cost: money(d.today.cost) }))} · ${T.clockUtc(d.generatedAt)}`
            })}
            <div class="nw-grid">
                ${waitingHtml(d)}
                ${runningHtml(d)}
                ${todayHtml(d)}
                ${noticesHtml(d)}
            </div>
            ${composerHtml(d)}
        `;
        window.AFHeader.wire(vscode);
        wire();
    }

    function wire() {
        document.querySelectorAll('[data-nav]').forEach(el => {
            el.addEventListener('click', () => nav(el.dataset.nav));
            el.addEventListener('keydown', ev => { if (ev.key === 'Enter') { nav(el.dataset.nav); } });
        });
        document.querySelectorAll('[data-pick]').forEach(el =>
            el.addEventListener('click', () => { target = el.dataset.pick; note = null; render(); }));
        const to = document.getElementById('nw-to');
        if (to) { to.addEventListener('change', () => { target = to.value; note = null; render(); }); }
        const text = document.getElementById('nw-text');
        const send = document.getElementById('nw-send');
        if (text) {
            text.addEventListener('input', () => { draft = text.value; if (send) { send.disabled = !draft.trim(); } });
            text.addEventListener('keydown', ev => {
                if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); submit(); }
            });
        }
        if (send) { send.addEventListener('click', submit); }
        const fresh = document.getElementById('nw-new');
        if (fresh) { fresh.addEventListener('click', () => nav('console')); }
    }

    function submit() {
        if (!target || !draft.trim()) { return; }
        note = null;
        vscode.postMessage({ type: 'send', id: target, text: draft });
    }

    render();
})();
