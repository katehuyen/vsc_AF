// Agent Farm — THE SESSION SOUND PANEL (U-180). One conversation's sound in one
// place: Like all / Always / Silent, its tones, the voice that says who, reading
// its answers aloud, the other three branches, and a test. Every change goes to
// the host as `alertSessionApply` — the function `alerts.session` runs — and the
// host answers with the profile itself, so the panel repaints and the page does not.
// A page opts in once with AFSoundPop.attach(vscode); the right-click then opens it.
(function () {
    let vscode = null;
    let current = null;     // the profile on screen
    let alerts = null;      // the tone list and the machine's voices (alertsPage)
    let error = '';
    const C = () => window.AFCharts;
    const S = () => window.AFSoundCard;
    const esc = s => C().esc(String(s == null ? '' : s));
    const evName = e => ((S() && S().EVENT_TEXT[e]) || [e])[0];
    const SOUND = [
        ['like-all', 'Like all', 'Whatever the fleet settings say — the Sound page decides.'],
        ['always', 'Always', 'This session rings on its events even when the fleet switch is off.'],
        ['silent', 'Silent', 'This session never makes a sound, whatever else is set. Its tones stay chosen for later.']
    ];
    const ALSO = [
        ['focus', 'Focus', 'Bring this session to the front when its turn ends.'],
        ['modal', 'Pop-up', 'A pop-up you have to close.'],
        ['toast', 'Notification', 'A VS Code notification.']
    ];

    function style() {
        if (document.getElementById('sp-style')) { return; }
        const el = document.createElement('style');
        el.id = 'sp-style';
        el.textContent = `
            .sp-pop { position:fixed; top:56px; right:16px; z-index:1000; width:440px; max-width:calc(100vw - 32px);
                padding:10px 12px; border-radius:6px; background:var(--vscode-editorWidget-background, #252526);
                border:1px solid var(--vscode-focusBorder, #4448); box-shadow:0 6px 24px #0008; font-size:12px; }
            .sp-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; font-weight:600; }
            .sp-head .sp-x { margin-left:auto; padding:0 6px; min-width:0; }
            .sp-row { display:grid; grid-template-columns:84px 1fr; gap:6px; align-items:center; margin:6px 0; }
            .sp-lbl { opacity:.75; }
            .sp-line { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
            .sp-line label { display:flex; gap:4px; align-items:center; cursor:pointer; white-space:nowrap; }
            .sp-line input { margin:0; width:auto; }
            .sp-tone { display:grid; grid-template-columns:92px 1fr auto; gap:4px; align-items:center; margin:2px 0; }
            .sp-tone select, .sp-line select { min-width:0; }
            .sp-line select { flex:1 1 auto; }
            .sp-foot { display:flex; gap:6px; align-items:center; margin-top:10px; }
            .sp-foot .sp-nav { margin-left:auto; }
            .sp-err { color:var(--vscode-errorForeground); margin:6px 0; }`;
        document.head.appendChild(el);
    }

    function speechOptions(p, al) {
        const voices = ((al && al.speak) || {}).voices || [];
        const fleet = p.fleetSpeechVoice || 'system default';
        const known = voices.some(v => v.name === p.speechVoice);
        return C().option('', `all's — ${fleet}`, { selected: !p.speechVoice })
            + (p.speechVoice && !known ? C().option(p.speechVoice, `${p.speechVoice} — not on this machine`, { selected: true }) : '')
            + voices.map(v => C().option(v.name, v.label || v.name, { selected: v.name === p.speechVoice })).join('');
    }

    function html(p, al) {
        const tones = (p.tones || []).map(t => {
            const plays = S().voiceName(al, t.voice);
            return `<div class="sp-tone"><span>${esc(evName(t.event))}</span>
                <select data-sptone="${esc(t.event)}" title="${esc(`Plays: ${plays}${t.chosen ? ' — this session\'s own choice' : ' — the choice below this session'}`)}">
                    ${C().option('', t.chosen ? 'all\'s choice' : `all's — ${plays}`, { selected: !t.chosen })}
                    ${S().toneGroups(al, t.chosen)}
                </select>
                <button class="secondary small" data-alertplay="${esc(t.voice)}" title="Play it now">▶</button></div>`;
        }).join('');
        return `<div class="sp-pop" role="dialog" aria-label="This session's sound">
            <div class="sp-head">🔊 This session's sound <span class="muted">${esc(p.label)}</span>
                <button class="secondary small sp-x" data-spclose title="Close">✕</button></div>
            ${error ? `<div class="sp-err">⚠ ${esc(error)}</div>` : ''}
            <div class="sp-row"><span class="sp-lbl">Sound</span><span class="sp-line">${SOUND.map(([v, l, tip]) =>
                `<label title="${esc(tip)}"><input type="radio" name="sp-sound" data-spsound="${v}" ${p.sound === v ? 'checked' : ''}> ${l}</label>`).join('')}</span></div>
            <div class="sp-row"><span class="sp-lbl">Tone</span><span>${tones}</span></div>
            <div class="sp-row"><span class="sp-lbl">Say who in</span><span class="sp-line"><select data-spspeech title="${esc(p.speechVoice ? `This session is announced in ${p.speechVoice}` : 'The fleet\'s voice says who')}">${speechOptions(p, al)}</select></span></div>
            <div class="sp-row"><span class="sp-lbl">Read aloud</span><span class="sp-line"><label title="Reads each finished answer of this session out loud, in the voice above. Turning it off stops what is being read now."><input type="checkbox" data-spread ${p.read ? 'checked' : ''}> every answer, in that voice</label></span></div>
            <div class="sp-row"><span class="sp-lbl">Also</span><span class="sp-line">${ALSO.map(([a, l, tip]) =>
                `<label title="${esc(tip)}"><input type="checkbox" data-spalso="${a}" ${(p.also || {})[a] ? 'checked' : ''}> ${l}</label>`).join('')}</span></div>
            <div class="sp-foot">
                <button class="secondary small" data-sptest title="Runs this session's own branches in 3 seconds, so you can switch windows and watch.">▶ Test</button>
                <select data-sptestev title="Which event to rehearse">${(p.tones || []).map(t => C().option(t.event, evName(t.event))).join('')}</select>
                <button class="secondary small sp-nav" data-spnav title="Every event, the fleet tones, quiet hours and your own sounds">Sound page ›</button>
            </div></div>`;
    }

    function close() {
        current = null; error = '';
        const el = document.getElementById('sp-root');
        if (el) { el.innerHTML = ''; }
    }

    function render() {
        let root = document.getElementById('sp-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'sp-root';
            document.body.appendChild(root);
        }
        if (!current || !alerts) { root.innerHTML = ''; return; }
        style();
        root.innerHTML = html(current, alerts);
        const id = current.sessionId;
        const apply = patch => vscode.postMessage({ type: 'alertSessionApply', sessionId: id, patch });
        const on = (sel, ev, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener(ev, () => fn(el)));
        on('[data-spsound]', 'change', el => apply({ sound: el.dataset.spsound }));
        on('[data-sptone]', 'change', el => apply({ voices: { [el.dataset.sptone]: el.value } }));
        on('[data-spspeech]', 'change', el => apply({ speechVoice: el.value }));
        on('[data-spread]', 'change', el => apply({ read: el.checked }));
        on('[data-spalso]', 'change', el => apply({ [el.dataset.spalso]: el.checked }));
        on('[data-alertplay]', 'click', el => vscode.postMessage({ type: 'alertPlay', voice: el.dataset.alertplay }));
        on('[data-sptest]', 'click', () => {
            const ev = root.querySelector('[data-sptestev]');
            vscode.postMessage({ type: 'alertSessionTest', sessionId: id, event: ev ? ev.value : 'turn-ready' });
        });
        on('[data-spnav]', 'click', () => { vscode.postMessage({ type: 'afnav', to: 'sound' }); close(); });
        on('[data-spclose]', 'click', close);
    }

    /** Open the panel for one session — the right-click relay, or a page's own button. */
    function open(sessionId) {
        if (!vscode || !sessionId) { return; }
        error = '';
        vscode.postMessage({ type: 'alertSessionOpen', sessionId: String(sessionId) });
    }

    function attach(api) {
        if (vscode) { return; }
        vscode = api;
        if (window.AFCtx) { window.AFCtx.listen((act, ctx) => { if (act === 'soundPop') { open(ctx.sessionId); } }); }
        window.addEventListener('message', ev => {
            const m = ev && ev.data;
            if (!m) { return; }
            if (m.type === 'soundPopData' && m.profile) { current = m.profile; alerts = m.alerts || alerts; error = ''; render(); }
            if (m.type === 'soundPopError') { error = String(m.error || ''); if (current) { render(); } }
        });
        if (typeof document.addEventListener === 'function') {
            document.addEventListener('keydown', e => { if (e.key === 'Escape' && current) { close(); } });
        }
    }

    window.AFSoundPop = { attach, open, close, html };
})();
