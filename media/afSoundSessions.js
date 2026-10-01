// Agent Farm — 🔊 SOUND › SESSIONS (U-183). Which conversation sounds different
// from the rest, in one live table (DENSITY: the Sessions table's model). The
// three switches under the hood (its own ♪, its mute) are ONE box here — Like
// all · Always · Silent — and every change goes to the host as alertSessionApply,
// the function `alerts.session` runs. A row's hover is the resolution for that
// session (which tone each event plays, from which step, and whether it rings);
// its right-click is the shared session menu; ⋯ opens the full session panel.
(function () {
    const C = window.AFCharts;
    const T = () => window.AFTip;
    const S = () => window.AFSoundCard;
    let filter = '';
    let show = 'all';
    let last = null;    // the page data the table was drawn from
    const SOUND = [['like-all', 'Like all'], ['always', 'Always'], ['silent', 'Silent']];
    const ALSO = [['focus', '◎', 'Focus', 'Bring this session to the front when its turn ends.'],
        ['modal', '▣', 'Pop-up', 'A pop-up you have to close.'],
        ['toast', '▭', 'Notification', 'A VS Code notification.']];
    const ORIGIN = { session: 'this session\'s own choice', agent: 'its agent\'s choice', settings: 'the fleet\'s choice', default: 'the built-in default' };

    const evName = e => ((S().EVENT_TEXT || {})[e] || [e])[0];
    const differs = r => r.sound !== 'like-all' || r.read || r.reading || !!r.speechVoice
        || (r.tones || []).some(t => t.chosen) || Object.values(r.also || {}).some(Boolean);

    function rowTip(r, al) {
        const lines = (r.tones || []).map(t => `${evName(t.event)}: ${S().voiceName(al, t.voice)} — ${ORIGIN[t.origin] || t.origin}${t.rings ? ' · rings' : ' · does not ring'}`);
        return T().lines(lines.concat([`Say who in: ${r.speechVoice || 'the fleet\'s voice'}`, T().GAP,
            window.AFSessionCtx ? window.AFSessionCtx.HINT : '']));
    }

    function row(r, al) {
        const sid = C.esc(r.sessionId);
        const own = (r.tones || []).filter(t => t.chosen);
        const ctx = window.AFSessionCtx ? window.AFSessionCtx.attr({ sessionId: r.sessionId, title: r.label }) : '';
        return `<tr ${ctx}>
            <td>${T().wrap(`<span class="ssname">${C.esc(r.label)}</span>`, `${r.label} — ${SOUND.find(s => s[0] === r.sound)[1]}`, rowTip(r, al))}</td>
            <td class="muted">${C.esc(r.engine || '')}</td>
            <td><select data-sssound="${sid}" title="Like all: whatever the fleet says · Always: rings even when the fleet switch is off · Silent: never a sound">
                ${SOUND.map(([v, l]) => C.option(v, l, { selected: r.sound === v })).join('')}</select></td>
            <td>${own.length ? own.map(t => `<span title="${C.esc(evName(t.event))}">${C.esc(S().voiceName(al, t.chosen))}</span>`).join(' · ') : '<span class="muted">all\'s</span>'}</td>
            <td>${r.speechVoice ? C.esc(r.speechVoice) : '<span class="muted">all\'s</span>'}</td>
            <td class="ssread"><input type="checkbox" data-ssread="${sid}" ${r.read ? 'checked' : ''} title="Read each finished answer of this session aloud">${r.reading
                ? ' <button class="secondary small" data-ssreadstop title="Cut short the answer being read now">■</button>' : ''}</td>
            <td class="ssalso">${ALSO.map(([k, g, l, tip]) => `<button class="secondary small ssalsob${(r.also || {})[k] ? ' on' : ''}" data-ssalso="${sid}|${k}" aria-pressed="${(r.also || {})[k] ? 'true' : 'false'}" title="${C.esc(`${l}: ${(r.also || {})[k] ? 'on' : 'off'} — ${tip}`)}">${g}</button>`).join('')}</td>
            <td><button class="secondary small" data-sspop="${sid}" title="Everything about this session's sound, with a test">⋯</button></td>
        </tr>`;
    }

    function table(d) {
        const al = d.alerts || {};
        const all = d.sessions || [];
        if (!all.length) { return '<p class="muted">No live session is being watched.</p>'; }
        const q = window.AFQuery.compile(filter);
        const rows = all.filter(r => (show === 'all' || differs(r)) && q.test(`${r.label} ${r.engine}`));
        if (!rows.length) { return `<p class="muted">No session matches${show === 'differs' ? ' among those that sound different' : ''}.</p>`; }
        return `<table class="settbl sstbl"><thead><tr>
            <th title="The session — hover for which tone each event plays and why">Session</th><th>Engine</th>
            <th title="Like all · Always · Silent">Sound</th><th title="A tone of its own, for the events it chose one for">Tone</th>
            <th title="The voice that says who, when it has one of its own">Say who</th><th title="Reads each finished answer aloud">Read aloud</th>
            <th title="◎ Focus · ▣ Pop-up · ▭ Notification">Also</th><th></th></tr></thead>
            <tbody>${rows.map(r => row(r, al)).join('')}</tbody></table>`;
    }

    function sessions(d) {
        last = d;
        const n = (d.sessions || []).length;
        const odd = (d.sessions || []).filter(differs).length;
        return `<style id="ss-style">
            .sshead { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:4px 0 6px; }
            .sshead #ssfilter { flex:0 1 200px; min-width:120px; }
            .sstbl td, .sstbl th { padding:2px 8px 2px 0; white-space:nowrap; vertical-align:middle; }
            .sstbl select { min-width:0; padding:0 4px; height:22px; }
            .ssalsob { padding:0 5px; min-width:0; opacity:.45; }
            .ssalsob.on { opacity:1; border-color:var(--vscode-focusBorder, #4448); }
            .ssread input { margin:0; width:auto; }
        </style>
        <div class="sshead"><span class="muted small">${n} live · ${odd} sound${odd === 1 ? 's' : ''} different</span>
            <select id="ssshow" title="Which sessions the table lists">
                ${C.option('all', 'All live', { selected: show === 'all' })}${C.option('differs', 'Only those that differ', { selected: show === 'differs' })}</select>
            <input type="text" id="ssfilter" placeholder="filter…" value="${C.esc(filter)}" title="${C.esc(window.AFQuery.tip('Searched against the session name and its engine.'))}">
            <button class="secondary small" id="ssclear" title="Clear the filter">✕</button></div>
        <div id="sstable">${table(d)}</div>`;
    }

    function wireRows(vscode) {
        const apply = (sessionId, patch) => vscode.postMessage({ type: 'alertSessionApply', sessionId, patch });
        document.querySelectorAll('[data-sssound]').forEach(el =>
            el.addEventListener('change', () => apply(el.dataset.sssound, { sound: el.value })));
        document.querySelectorAll('[data-ssread]').forEach(el =>
            el.addEventListener('change', () => apply(el.dataset.ssread, { read: el.checked })));
        document.querySelectorAll('[data-ssalso]').forEach(el => el.addEventListener('click', () => {
            const [sid, k] = String(el.dataset.ssalso).split('|');
            apply(sid, { [k]: el.getAttribute('aria-pressed') !== 'true' });
        }));
        document.querySelectorAll('[data-sspop]').forEach(el => el.addEventListener('click', () => {
            if (window.AFSoundPop) { window.AFSoundPop.open(el.dataset.sspop); }
        }));
        document.querySelectorAll('[data-ssreadstop]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({ type: 'alertReadStop' })));
    }

    function redrawTable(vscode) {
        const el = document.getElementById('sstable');
        if (!el || !last) { return; }
        el.innerHTML = table(last);
        wireRows(vscode);
    }

    function wireSessions(vscode) {
        wireRows(vscode);
        const f = document.getElementById('ssfilter');
        if (f) { f.addEventListener('input', () => { filter = f.value; redrawTable(vscode); }); }
        const sh = document.getElementById('ssshow');
        if (sh) { sh.addEventListener('change', () => { show = sh.value; redrawTable(vscode); }); }
        const cl = document.getElementById('ssclear');
        if (cl) { cl.addEventListener('click', () => { filter = ''; if (f) { f.value = ''; } redrawTable(vscode); }); }
    }

    window.AFSoundCard = Object.assign(window.AFSoundCard || {}, { sessions, wireSessions, sessionDiffers: differs });
})();
