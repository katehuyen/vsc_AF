// Agent Farm — 🔊 SOUND › VOICE (U-182). What is said, in three rows read in the
// order they take effect: WHO says it (the voice, its speed and volume), WHAT is
// said (the sentence, its placeholders added as chips and heard back with ▶),
// and which conversations have their ANSWERS read aloud (with ■ for the one being
// read now). The element ids are the announcement strip's, so afSoundWire.js
// wires the voice, the sliders and the sentence exactly as before; this file
// wires only what is new (the chips, the live slider figures, ■ and ✕).
(function () {
    const C = window.AFCharts;
    const T = () => window.AFTip;
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    // U-203 — with no voice chosen, each reading is voiced in its own language: what Auto uses per language, a missing one named
    const autoLines = sp => (sp.auto || []).map(a => (a.voice
        ? t('{language}: {voice}', { language: t(a.name), voice: a.voice })
        : t('{language}: no voice installed — the system voice reads it', { language: t(a.name) })));
    const autoGap = sp => (sp.voice || !sp.voicesLoaded || sp.voicesError ? [] : (sp.auto || []).filter(a => !a.voice));
    const CHIPS = [['{agent}', 'agent', 'The agent\'s name — developer, psikolog…'],
        ['{event}', 'event', 'What happened, in words — asking you, turn finished…'],
        ['{session}', 'session', 'The session\'s own name, when two of one agent are running.']];

    const style = () => `<style id="sv-style">
        .svrow { display:grid; grid-template-columns:92px 1fr; gap:8px; align-items:center; margin:6px 0; }
        .svlbl { opacity:.75; white-space:nowrap; }
        .svgap { margin:0 0 6px 100px; font-size:12px; }
        .svline { display:flex; gap:8px; align-items:center; flex-wrap:wrap; min-width:0; }
        .svline label { display:flex; gap:4px; align-items:center; white-space:nowrap; cursor:pointer; }
        .svline input[type=checkbox] { margin:0; width:auto; }
        .svline input[type=range] { width:110px; margin:0; padding:0; }
        .svline .svval { min-width:3ch; text-align:right; font-variant-numeric:tabular-nums; opacity:.85; }
        .svline #alertspeakvoice { flex:1 1 300px; min-width:180px; max-width:420px; }
        .svline #alertspeaktpl { flex:1 1 220px; min-width:140px; max-width:320px; font-family:var(--vscode-editor-font-family); }
        .svline button.small { flex:none; padding:0 6px; min-width:0; }
        .svchip { border-radius:9px; }
        .svreader { display:flex; align-items:center; gap:4px; padding:0 2px 0 8px; border-radius:9px;
            border:1px solid var(--vscode-widget-border, #4444); white-space:nowrap; }
        .svreader.now { border-color:var(--vscode-focusBorder, #4448); }
        .svreader button { padding:0 5px; min-width:0; }
    </style>`;

    /** The voice picker — the setting is always shown, even when no voice on this machine answers to it. */
    function voiceBox(sp) {
        const chosen = String(sp.voice || '');
        const bad = chosen && !sp.resolved && sp.voicesLoaded && !sp.voicesError;
        if (!sp.voicesLoaded) {
            return { bad, html: `<select id="alertspeakvoice" disabled>${C.option('', "reading this machine's voices…",
                { detail: 'The list costs a PowerShell process and is fetched once when this page first draws. Not asked yet is not "no voices".' })}</select>` };
        }
        const at = String(sp.resolvedName || chosen);
        const opt = v => C.option(v.name, v.label, {
            selected: v.name === at,
            detail: [`Reads ${v.culture || 'no language it declares'}.`,
                v.engine === 'sapi5' ? 'SAPI 5 — the short classic list every Windows has.' : 'OneCore — installed with a language pack.',
                `Picking this writes “${v.name}” into the setting.`].join('\n')
        });
        const unknown = chosen && !sp.resolvedName
            ? C.option(chosen, `${bad ? '⚠ ' : ''}${chosen}${bad ? ' — no voice answers to that' : ' — set by hand'}`, {
                selected: true,
                detail: bad
                    ? 'Nothing on this machine answers to that name, so the announcement will FAIL rather than read out in the wrong voice. Pick a row below, or clear it.'
                    : 'This platform cannot list its voices, so whether the name is answered is only known when it speaks.'
            })
            : '';
        const tip = (chosen
            ? (sp.resolved ? `Set to "${chosen}" — which reaches ${sp.resolved}`
                : bad ? `Set to "${chosen}" — nothing on this machine answers to that`
                    : `Set to "${chosen}" — this platform cannot list its voices`)
            : [t('Auto — each reading is voiced in its own language'), ...autoLines(sp)].join('\n'))
            + '\n\nA voice reading a language it does not know is unintelligible, so the language of each voice is on its row.'
            + (sp.voicesNote ? '\n\n' + sp.voicesNote : '');
        return { bad, html: `<select id="alertspeakvoice" title="${C.esc(tip)}">
            ${C.option('', t('Auto — match the answer\'s language'), { selected: !chosen,
        detail: [t('No name is written into the setting: each answer and announcement is read by an installed voice of its own language, and by the system voice where none is installed. A voice chosen below always wins.'), ...autoLines(sp)].join('\n') })}
            ${unknown}${(sp.voices || []).map(opt).join('')}</select>` };
    }

    function slider(id, label, min, max, value, tip) {
        return `<label title="${C.esc(tip)}">${label}
            <input type="range" id="${id}" min="${min}" max="${max}" step="1" value="${C.esc(String(value))}" data-alertsp="${C.esc(String(value))}">
            <span class="svval" id="${id}val">${C.esc(String(value))}</span></label>`;
    }

    /** ‼️ The Read aloud row names each conversation that reads, and the one reading NOW carries ■. */
    function readers(sp) {
        const list = sp.readers || [];
        if (!list.length) {
            return '<span class="muted">No session reads its answers aloud. Turn it on for one from its sound — 🔊 on its Console card, or right-click its Timeline lane.</span>';
        }
        return list.map(r => r.reading
            ? `<span class="svreader now">${C.esc(r.label)} · reading now
                <button class="secondary small" data-sndreadstop title="Cut short the answer being read now. Read aloud stays on for its next answer.">■ Stop</button></span>`
            : `<span class="svreader">${C.esc(r.label)}
                <button class="secondary small" data-sndreadoff="${C.esc(r.sessionId)}" title="${C.esc(`Stop reading ${r.label}'s answers aloud`)}">✕</button></span>`).join('');
    }

    function voice(al) {
        const sp = al.speak || {};
        const box = voiceBox(sp);
        const rate = sp.rate === undefined ? 0 : sp.rate;
        const vol = sp.volume === undefined ? 100 : sp.volume;
        const state = sp.on
            ? (box.bad ? '⚠ voice not found' : `🗣 ${sp.preview || ''}`)
            : 'not said — Say who is off';
        const own = (sp.sessions || []).map(s =>
            `<span class="svreader">${C.esc(s.label || s.sessionId)} · ${C.esc(s.voice)}<button class="secondary small" data-alertspeakclear="${C.esc(s.sessionId)}" title="${C.esc('Clear this conversation\'s own voice — the fleet setting answers for it again. That is NOT silence.')}">✕</button></span>`).join('');
        return `${style()}<div class="svwrap">
            <div class="svrow"><span class="svlbl">Say who</span><span class="svline">
                <label title="${C.esc((sp.on ? 'On' : 'Off') + ' — the agent\'s name is said behind the tone, on the events ticked in the Say who column above. Local and free; it obeys Mute all, quiet hours and a session\'s Silent like the tone does.')}">
                    <input type="checkbox" id="alertspeakon" ${sp.on ? 'checked' : ''}> in</label>
                ${box.html}
                <button class="secondary small" id="alertspeakrescan" title="Ask Windows again — for a language pack installed a minute ago (Settings ▸ Time & language ▸ Speech ▸ Add voices).">↻</button>
                ${slider('alertspeakrate', 'Speed', -10, 10, rate, `Speed: ${rate === 0 ? '0 — the voice\'s own normal speed' : rate}\n\n−10 slow to 10 fast. A sentence heard a hundred times can be read faster.`)}
                ${slider('alertspeakvol', 'Volume', 0, 100, vol, `Volume: ${vol} of 100\n\n${t('The sentence\'s own volume, separate from the tones\' level: that one is Tone volume, under When something happens.')}`)}
            </span></div>
            ${sp.voicesError ? `<div class="seterr">⚠ the voice list could not be read — ${C.esc(sp.voicesError)}</div>` : ''}
            ${autoGap(sp).map(a => `<div class="svgap muted">${C.esc(t('No {language} voice is installed, so Auto reads {language} with the system voice. Add one free: Settings ▸ Time & language ▸ Speech ▸ Add voices, then ↻.', { language: t(a.name) }))}</div>`).join('')}
            <div class="svrow"><span class="svlbl">Sentence</span><span class="svline">
                <input type="text" id="alertspeaktpl" maxlength="${Number(sp.max) || 160}" value="${C.esc(String(sp.template || ''))}" data-alertsp="${C.esc(String(sp.template || ''))}"
                    title="${C.esc(`Says: ${sp.template || ''}\n\n{agent}, {event} and {session} are filled in; everything else is spoken exactly as typed.`)}">
                ${CHIPS.map(([ph, name, tip]) => `<button class="secondary small svchip" data-sptpladd="${C.esc(ph)}" title="${C.esc(`Adds ${ph} where the cursor is. ${tip}`)}">+ ${name}</button>`).join('')}
                <button class="secondary small" id="alertspeaktest" title="Say it now. It speaks even when Say who is off and inside quiet hours — this asks whether the machine can talk at all.">▶ Hear it</button>
                ${T().wrap(`<span class="alertgatestate ${sp.on && !box.bad ? 'on' : 'off'}">${C.esc(state)}</span>`,
                    sp.on ? `Next: “${sp.preview || ''}”` : 'Nothing is said',
                    T().lines([`Spoken by: ${sp.resolved || (box.bad ? 'nothing — the name matches no voice here' : sp.voice || (sp.autoNow ? t('Auto — {voice}', { voice: sp.autoNow }) : 'the system default voice'))}`,
                        `At most ${sp.max || 160} characters: a sentence holds every alert queued behind it while it is read.`]))}
            </span></div>
            <div class="svrow"><span class="svlbl">Read aloud</span><span class="svline">${readers(sp)}</span></div>
            ${own ? `<div class="svrow"><span class="svlbl">Own voice</span><span class="svline">${own}</span></div>` : ''}
        </div>`;
    }

    /** What is new on this section; the rest is afSoundWire.js's, by the same ids. */
    function wireVoice(vscode) {
        ['alertspeakrate', 'alertspeakvol'].forEach(id => {
            const el = document.getElementById(id);
            const out = document.getElementById(id + 'val');
            if (el && out) { el.addEventListener('input', () => { out.textContent = el.value; }); }
        });
        document.querySelectorAll('[data-sptpladd]').forEach(b => b.addEventListener('click', () => {
            const el = document.getElementById('alertspeaktpl');
            if (!el) { return; }
            const v = String(el.value || '');
            const at = typeof el.selectionStart === 'number' ? el.selectionStart : v.length;
            const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : at;
            const next = v.slice(0, at) + b.dataset.sptpladd + v.slice(end);
            if (next.length > Number(el.maxLength > 0 ? el.maxLength : 160)) { return; }
            el.value = next;
            vscode.postMessage({ type: 'alertSpeak', template: next });
        }));
        document.querySelectorAll('[data-sndreadstop]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({ type: 'alertReadStop' })));
        document.querySelectorAll('[data-sndreadoff]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({
                type: 'alertSessionApply', sessionId: b.dataset.sndreadoff, patch: { read: false }
            })));
    }

    window.AFSoundCard = Object.assign(window.AFSoundCard || {}, { voice, wireVoice });
})();
