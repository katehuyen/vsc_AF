// Agent Farm — 🔊 SOUND (U-178). Everything the farm can make a noise about, on
// a page of its own, in the order the questions are asked: will I hear anything
// at all (A), what happens on which event (B), what is said (C), which sounds
// are mine (E). The parts are the shared AFSoundCard pieces; every press goes to
// the host, which runs the function the matching alerts.* op runs.
(function () {
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    const S = () => window.AFSoundCard;
    let DATA = window.__DATA__ || {};
    let error = '';

    const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

    /** A — the line that answers "will I hear it?", above the gate's own controls. */
    function head(al) {
        const g = al.gate || {};
        const sil = g.silence || {};
        const events = al.events || [];
        const on = events.filter(e => e.on).length;
        const broken = events.filter(e => e.on && !e.playable).length;
        const icon = g.muted ? '🔇' : sil.silent ? '🌙' : on ? '🔊' : '🔈';
        // ‼️ THE GATE OUTRANKS THE COUNT: "rings on 3 events" on a muted farm is
        // the true sentence that sends somebody looking in the wrong place.
        const badge = sil.silent
            ? `<span class="rootbadge warn">silent — ${C.esc(sil.detail || '')}</span>`
            : broken
                ? `<span class="rootbadge warn">${plural(broken, 'armed event')} cannot be played</span>`
                : '';
        const nudge = g.nudge || {};
        const nudgeBadge = nudge.on
            ? `<span class="rootbadge">⏰ nudge ${C.esc(String(nudge.minutes))}m ×${C.esc(String(nudge.repeat))}${nudge.armed ? ` · ${C.esc(String(nudge.armed))} waiting` : ''}</span>`
            : '';
        const muted = (g.mutedSessions || []).length;
        const parts = [
            on ? `Rings on ${on} of ${events.length} events` : 'Sound is off — no event rings yet',
            `Say who: ${(al.speak || {}).on ? 'on' : 'off'}`,
            muted ? `${plural(muted, 'session')} silent` : ''
        ].filter(Boolean);
        return `<div class="sndhead"><span class="sndicon">${icon}</span>
            <span class="sndstate">${C.esc(parts.join(' · '))}</span> ${badge} ${nudgeBadge}</div>`;
    }

    /**
     * ‼️ THE FIRST OPENING IS NOT A TABLE OF TEN SWITCHES. Every event is off
     * out of the box; most people want exactly two, so the page offers those
     * two with their tones and one press — and the table below for the rest.
     */
    function starter(al) {
        if ((al.events || []).some(e => e.on)) { return ''; }
        const row = (event, why) => {
            const r = (al.events || []).find(e => e.event === event);
            if (!r) { return ''; }
            const name = (S().EVENT_TEXT[event] || [event])[0];
            return `<label class="sndstartrow"><input type="checkbox" data-sndstart="${C.esc(event)}" checked>
                <b>${C.esc(name)}</b> — ${C.esc(S().voiceName(al, r.voice))}
                <button class="secondary small" data-alertplay="${C.esc(r.voice)}" ${r.playable ? '' : 'disabled'} title="Play it now">▶</button>
                <span class="muted">(${C.esc(why)})</span></label>`;
        };
        return `<div class="sndstart">
            <div><b>Sound is off.</b> Most people start with two:</div>
            ${row('question', 'an agent has stopped and waits for you')}
            ${row('turn-ready', 'a turn is done, your move')}
            <div class="btnrow"><button id="sndstart">Turn these two on</button>
                <span class="muted">or set it up below ▾</span></div>
        </div>`;
    }

    /** E — the built-ins with their ▶, then your own sounds. */
    function library(al) {
        const voices = al.voices || [];
        const built = voices.filter(v => v.builtin);
        const mine = voices.filter(v => !v.builtin);
        const full = mine.length >= al.limit;
        const chip = v => `<span class="sndchip" title="${C.esc(`${v.label}${v.family === 'classic' ? ' — from the earlier set' : ''}${v.playable ? '' : '\n\nNothing on this machine can play this one.'}`)}">${C.esc(v.label)}
            <button class="secondary small" data-alertplay="${C.esc(v.id)}" ${v.playable ? '' : 'disabled'} title="Play it now">▶</button></span>`;
        return `<h3 class="sndh">Library <span class="muted small">${built.length} built in · <b>${mine.length}</b> of ${al.limit} yours</span></h3>
            <div class="sndchips">${built.map(chip).join('')}</div>
            <div class="setdesc" style="margin-top:8px">Your own sounds play from where they live — the file is <b>not copied</b>.
                Any file this machine can play: ${C.esc((al.formats || []).map(f => '.' + f).join(' · ') || 'nothing — no player was found')}.</div>
            ${mine.length ? `<div class="wikifiles">${mine.map(v => S().customRow(al, v)).join('')}</div>` : ''}
            <div class="btnrow">
                <button class="secondary" id="alertadd" ${full ? 'disabled' : ''}
                    title="${C.esc(full ? `There is room for ${al.limit} of your own sounds — remove one first.` : 'Pick a sound file from anywhere on this machine, then give it a name. The file stays where it is.')}">+ Add a sound…</button>
                <button class="secondary" id="alertfolder"
                    title="${C.esc('Open ' + al.folder + '\n\nOnly a suggestion — somewhere of Agent Farm\'s own that survives updates. The picker takes a file from anywhere.')}">📂 Open folder</button>
            </div>`;
    }

    function body(al) {
        return `${head(al)}
            ${S().gate(al)}
            ${error ? `<div class="seterr">⚠ ${C.esc(error)}</div>` : ''}
            ${starter(al)}
            <h3 class="sndh">When something happens</h3>
            ${S().events(al, DATA.notify || {})}
            <h3 class="sndh">Voice</h3>
            ${S().speak(al)}
            ${library(al)}`;
    }

    function render() {
        const al = DATA.alerts;
        document.getElementById('app').innerHTML = `${S().style()}
            <style>
                .sndwrap { max-width:900px; }
                .sndhead { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:10px 0 2px; }
                .sndicon { font-size:18px; }
                .sndstate { font-weight:600; }
                .sndh { margin:18px 0 4px; font-size:13px; text-transform:uppercase; letter-spacing:.04em; opacity:.85; }
                .sndh .muted { text-transform:none; letter-spacing:0; font-weight:normal; margin-left:6px; }
                .sndstart { margin:10px 0; padding:10px 12px; border-radius:4px;
                    border:1px solid var(--vscode-focusBorder, #4448); background:var(--vscode-editorWidget-background, #0002); }
                .sndstartrow { display:flex; gap:6px; align-items:center; margin:6px 0; cursor:pointer; }
                .sndstartrow input { margin:0; width:auto; }
                .sndchips { display:flex; flex-wrap:wrap; gap:6px; }
                .sndchip { display:flex; align-items:center; gap:4px; padding:1px 2px 1px 8px; border-radius:10px;
                    border:1px solid var(--vscode-widget-border, #4444); white-space:nowrap; }
                .sndchip button { padding:0 5px; min-width:0; }
            </style>
            ${window.AFHeader.html({ page: 'sound', title: 'Sound', sub: 'What rings, on which event, and what is said' })}
            <div class="sndwrap">${al ? body(al) : '<p class="muted">The sound system is not available in this window.</p>'}</div>`;
        window.AFHeader.wire(vscode);
        S().wire(vscode, () => DATA);
        const start = document.getElementById('sndstart');
        if (start) {
            start.addEventListener('click', () => {
                document.querySelectorAll('[data-sndstart]').forEach(el => {
                    if (el.checked) { vscode.postMessage({ type: 'alertOn', event: el.dataset.sndstart, on: true }); }
                });
            });
        }
    }

    // M-33 — a host push waits while somebody is typing in a box (media/afRepaint.js).
    const repaint = window.AFRepaint.guard(render);
    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') { DATA = ev.data.data; error = ''; repaint(); return; }
        if (ev.data.type === 'error') { error = String(ev.data.error || ''); render(); }
    });

    render();
})();
