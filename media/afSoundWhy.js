// Agent Farm — 🔊 SOUND › WHY DIDN'T I HEAR IT? (U-184). Pick a session and an
// event; the answer is the engine's own decision, line by line, in the order it
// is taken (core/soundWhy.ts, carried on each session row): does the event ring
// for it, is the gate open, which tone answers and can it be played, is the name
// said. ▶ Test now rehearses what that event would REALLY do for the session —
// the fleet switch added — and writes every branch's result under the answer.
(function () {
    const C = window.AFCharts;
    const S = () => window.AFSoundCard;
    const EVENTS = ['turn-ready', 'question', 'stalled', 'ended', 'error'];
    const BRANCH = { sound: 'Ring', focus: 'Focus', modal: 'Pop-up', toast: 'Notification' };
    let sid = '';
    let ev = 'turn-ready';
    let result = null;   // { sessionId, event, pending?, error?, result? }
    let last = null;
    let api = null;
    const evName = e => ((S().EVENT_TEXT || {})[e] || [e])[0];
    const mark = ok => (ok === true ? '✓' : ok === false ? '✗' : '·');
    const cls = ok => (ok === true ? 'ok' : ok === false ? 'no' : 'info');

    function testHtml() {
        if (!result || result.sessionId !== sid || result.event !== ev) { return ''; }
        if (result.pending) { return '<div class="wytest muted">Test in 3 s — switch windows to watch the focus and the pop-up…</div>'; }
        if (result.error) { return `<div class="wytest"><span class="wyl no">✗ Test: ${C.esc(result.error)}</span></div>`; }
        const br = (result.result && result.result.branches) || [];
        return `<div class="wytest">Test: ${br.length ? br.map(b => `<span class="wyl ${b.status === 'ok' ? 'ok' : b.status === 'failed' ? 'no' : 'info'}">${b.status === 'ok' ? '✓' : b.status === 'failed' ? '✗' : '–'} ${C.esc(BRANCH[b.action] || b.action)}${b.detail ? ` — ${C.esc(b.detail)}` : ''}</span>`).join(' · ') : 'nothing ran'}</div>`;
    }

    function body(d) {
        const rows = d.sessions || [];
        const r = rows.find(x => x.sessionId === sid) || rows[0];
        if (!r) { return '<p class="muted">No live session is being watched — the question needs one.</p>'; }
        sid = r.sessionId;
        const w = (r.why || {})[ev];
        const lines = w ? w.lines.map(l => `<div class="wyl ${cls(l.ok)}"><span class="wym">${mark(l.ok)}</span> ${C.esc(l.text)}</div>`).join('') : '';
        return lines + testHtml();
    }

    function why(d) {
        last = d;
        const rows = d.sessions || [];
        if (!rows.some(x => x.sessionId === sid)) { sid = rows.length ? rows[0].sessionId : ''; }
        return `<style id="wy-style">
            .wyhead { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:4px 0 6px; }
            .wyl { display:block; margin:1px 0; }
            .wytest .wyl { display:inline; }
            .wym { display:inline-block; width:1.2em; text-align:center; }
            .wyl.ok .wym, .wytest .wyl.ok { color:var(--vscode-testing-iconPassed, #73c991); }
            .wyl.no, .wyl.no .wym { color:var(--vscode-errorForeground, #f48771); }
            .wyl.info { opacity:.8; }
            .wytest { margin-top:6px; }
        </style>
        <div class="wyhead">Session <select id="wysession" title="Which session">${rows.map(x => C.option(x.sessionId, x.label, { selected: x.sessionId === sid })).join('')}</select>
            Event <select id="wyevent" title="Which event">${EVENTS.map(e => C.option(e, evName(e), { selected: e === ev })).join('')}</select>
            <button class="secondary small" id="wytest" ${rows.length ? '' : 'disabled'} title="Rehearse what this event would really do for this session — the fleet switch included — in 3 seconds, and write each branch's result here">▶ Test now</button></div>
        <div id="wybody">${body(d)}</div>`;
    }

    function redraw() {
        const el = document.getElementById('wybody');
        if (el && last) { el.innerHTML = body(last); }
    }

    function wireWhy(vscode) {
        api = vscode;
        const s = document.getElementById('wysession');
        if (s) { s.addEventListener('change', () => { sid = s.value; redraw(); }); }
        const e = document.getElementById('wyevent');
        if (e) { e.addEventListener('change', () => { ev = e.value; redraw(); }); }
        const t = document.getElementById('wytest');
        if (t) {
            t.addEventListener('click', () => {
                if (!sid) { return; }
                result = { sessionId: sid, event: ev, pending: true };
                redraw();
                api.postMessage({ type: 'alertSessionTest', sessionId: sid, event: ev, real: true });
            });
        }
    }

    /** A test answer (or its refusal) for the session waiting on one. True when it was this section's. */
    function whyResult(m, isError) {
        if (!result || !result.pending || result.sessionId !== m.sessionId) { return false; }
        result = isError
            ? { sessionId: m.sessionId, event: result.event, error: String(m.error || '') }
            : { sessionId: m.sessionId, event: result.event, result: m.result };
        redraw();
        return true;
    }

    window.AFSoundCard = Object.assign(window.AFSoundCard || {}, { why, wireWhy, whyResult });
})();
