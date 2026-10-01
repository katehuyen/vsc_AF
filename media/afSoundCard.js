// Agent Farm — THE SOUND CARD (U-178). What was Settings ▸ Alert sounds, shared:
// the Sound page draws it, Settings draws its one-line summary. Every gesture is
// posted to the host, which runs the function the matching alerts.* op runs.
// This file: the event table, your own sounds, the Settings summary. afSoundStrips.js: the gate and voice strips. afSoundWire.js: look and wiring.
(function () {
    const C = window.AFCharts;
    /**
     * ‼️ A-21 — WHAT WILL I HEAR, AND WHY THAT SOUND.
     *
     * `agentFarm.alerts.on` and `agentFarm.alerts.voices` were two JSON boxes,
     * and both are EMPTY out of the box — so the page showed `{}` twice for a
     * feature that already plays five different tones, and the one question a
     * person opens this page with ("which sound, and why that one?") had no
     * answer anywhere. Only the resolution chain can answer it, so the host
     * hands over the resolved rows and the boxes are replaced rather than
     * decorated (the wiki root and the Superpowers folder cost the same week
     * each, for the same reason).
     *
     * The card sits exactly where `alerts.on` would have been — beside the
     * notification switches ON PURPOSE. Those open a VS Code notification,
     * these make a noise, and "I turned the sound off and a notification still
     * arrives" is the confusion that keeping them apart-but-adjacent prevents.
     */
    const ALERT_EVENT_TEXT = {
        'turn-ready': ['Turn finished',
            'The turn ended and control is back with you — the agent said its piece and stopped.'],
        question: ['Asking you',
            'The agent stopped mid-turn to ask something: a tool waiting for permission, or a question it needs answered. The turn is still open, so this is the one worth hearing from another room.'],
        stalled: ['Stalled',
            'The session was working and has said nothing for longer than stuckThresholdSeconds.'],
        ended: ['Session ended', 'The session closed.'],
        error: ['Error',
            'A critical error. Nothing emits this edge yet — the voice is settable so it is ready when something does.']
    };
    const ALERT_ORIGIN_TEXT = {
        session: 'this conversation\'s own ♪ choice',
        agent: 'this agent\'s choice',
        settings: 'your choice here',
        default: 'the built-in default'
    };

    function alertVoiceName(al, id) {
        const v = (al.voices || []).find(x => x.id === id);
        return v ? v.label : id;
    }

    /**
     * ‼️ THE TONE LIST, IN ONE PLACE — every picker that offers a sound offers
     * the SAME rows, grouped the same way, and refuses the same ones.
     *
     * ‼️ A-20 — TWENTY BUILT-INS ARE TWO FAMILIES, AND THE LIST SAYS SO. Flat,
     * the reader has to read every label to discover there were two sets: the
     * ten the defaults come from, built from different physical objects, and the
     * ten kept only so that nobody who CHOSE one loses it.
     *
     * ‼️ AN UNPLAYABLE TONE IS DRAWN AND DISABLED, never dropped. A setting that
     * names a sound whose file has gone must go on naming it — a list that
     * omitted it would show the first option instead and report a choice nobody
     * made. The host refuses it by name too; the page must not promise what the
     * op will refuse (U-123).
     */
    function alertToneGroups(al, chosen) {
        // U-130 — the row is narrow and every one of these tones is a FILE the
        // reader may need to find. The hover carries the one thing the label
        // cannot: where the sound actually comes from, and why a greyed row is
        // greyed.
        const opt = v => C.option(v.id,
            v.label + (v.playable ? '' : (v.exists ? ' — not playable here' : ' — file missing')),
            {
                selected: v.id === chosen,
                disabled: !v.playable,
                detail: [
                    v.builtin ? 'Ships with Agent Farm.' : 'Your own sound.',
                    v.path || '',
                    v.playable ? '' : (v.exists
                        ? 'This machine cannot play that format, so it cannot be chosen — the file is still there.'
                        : 'The file this points at has gone. It is still listed so a setting that names it is not silently changed.')
                ].filter(Boolean).join('\n')
            });
        const modern = (al.voices || []).filter(v => v.builtin && v.family !== 'classic');
        const classic = (al.voices || []).filter(v => v.builtin && v.family === 'classic');
        const mine = (al.voices || []).filter(v => !v.builtin);
        return `${modern.length ? `<optgroup label="Built in">${modern.map(opt).join('')}</optgroup>` : ''}
            ${classic.length ? `<optgroup label="Built in — earlier set">${classic.map(opt).join('')}</optgroup>` : ''}
            ${mine.length ? `<optgroup label="Your own">${mine.map(opt).join('')}</optgroup>` : ''}`;
    }

    /** The picker for one event. Empty value = "whatever the default is", which
     *  is NOT the same as silence and must never read as it. */
    function alertVoiceSelect(al, row) {
        // MIRROR — the box is narrow enough to cut its own text, so its
        // tooltip opens with what it is set to right now.
        const tip = (
            `Plays: ${alertVoiceName(al, row.voice)} — ${ALERT_ORIGIN_TEXT[row.origin] || row.origin}\n`
            + (row.chosen ? `Set to: ${alertVoiceName(al, row.chosen)}` : `Not set — falls back to ${alertVoiceName(al, row.fallback)}`)
            + `\n\nWhich sound this event plays for every session. Clearing it does not mute the event: it falls back to the built-in default.`);
        return `<select data-alertvoice="${C.esc(row.event)}" title="${C.esc(tip)}">
            ${C.option('', `Default — ${alertVoiceName(al, row.fallback)}`, {
            selected: !row.chosen,
            detail: 'Nothing chosen for this event, so the built-in default plays. This is NOT silence — turn the event off to mute it.'
        })}
            ${alertToneGroups(al, row.chosen)}
        </select>`;
    }

    /**
     * ‼️ U-178 — ONE EVENT, ONE ROW, FOUR OUTPUTS SIDE BY SIDE: Ring · Tone ·
     * Say who · Notification. "What happens when an agent asks me something?"
     * is answered across one line instead of across a strip, a table and a
     * different settings group.
     *
     * The Plays column is gone. What actually plays is the first line of the
     * picker's own hover (MIRROR), and when it differs from the choice — a file
     * gone, a format nothing here opens — a line under the picker says so, in
     * the colour of how bad it is (audit B-05: a fallback that still rings is a
     * warning; an armed event nothing can play is SILENCE).
     */
    function alertEventRow(al, row, notify) {
        const text = ALERT_EVENT_TEXT[row.event] || [row.event, ''];
        const armed = (al.sessionEvents || []).indexOf(row.event) >= 0;
        const name = window.AFTip.wrap(`<span class="alertev">${C.esc(text[0])}</span>`,
            `${text[0]} — rings ${row.on ? 'on every session' : 'nowhere yet'}`, text[1]);
        const ring = window.AFTip.wrap(
            `<label class="alertonlbl"><input type="checkbox" data-alerton="${C.esc(row.event)}" ${row.on ? 'checked' : ''}></label>`,
            `Ring: ${row.on ? 'on, for every session' : 'off'}`,
            row.on
                ? 'The tone plays on every session, whatever each one has selected for itself.'
                : armed
                    ? 'Off here, but a single session can still ring on its own from the ♪ in its Live Timeline row — the two ADD, they do not gate each other.'
                    : 'Nothing rings for this event. It has no per-session control either, so this switch is the only way to hear it.');
        const wrong = row.chosen && row.chosen !== row.voice;
        const silent = row.on && !row.playable;
        const origin = ALERT_ORIGIN_TEXT[row.origin] || row.origin;
        const chain = `Chosen by ${origin}.\n${row.file || '(no file)'}`
            + ((row.skipped || []).length
                ? '\n\nPassed over on the way:\n' + row.skipped.map(s => `· ${s.voice} (${ALERT_ORIGIN_TEXT[s.origin] || s.origin}) — ${s.why}`).join('\n')
                : '');
        const note = silent
            ? window.AFTip.wrap('<div class="alertplays silent">nothing here plays it — this event is silent</div>',
                `${text[0]} is armed and NOTHING plays it`,
                chain + '\n\n⚠ Nothing on this machine can play that file — this event would be silent.')
            : wrong
                ? window.AFTip.wrap(`<div class="alertplays bad">plays ${C.esc(alertVoiceName(al, row.voice))} instead<span class="alertorigin"> · ${C.esc(origin)}</span></div>`,
                    `${text[0]} plays ${alertVoiceName(al, row.voice)}`, chain)
                : '';
        // ‼️ A-25 — whether the agent's NAME is also said, in the row that says what rings.
        const sp = al.speak || {};
        const said = (sp.events || []).indexOf(row.event) >= 0;
        const say = window.AFTip.wrap(
            `<label class="alertonlbl"><input type="checkbox" data-alertsay="${C.esc(row.event)}" ${said ? 'checked' : ''}></label>`,
            `Say who: ${said ? 'the agent\'s name is spoken after the tone' : 'tone only, no name'}`,
            'A tone answers "what kind of news is this?"; with several lanes running, the question from the next room is WHICH ONE, and no palette can carry a name.'
            + (sp.on ? '' : '\n\n‼️ Saying who is switched OFF above, so nothing is spoken on any event yet — this decides what happens once it is on.')
            + '\n\nThe tone and the sentence are ONE queue ticket, in that order: no other lane\'s chime can land in the middle of this one\'s sentence.');
        // ‼️ U-178 — the VS Code notification for the same event: the notify*
        // setting itself, so the Settings row and this cell cannot disagree.
        const own = id => notify && Object.prototype.hasOwnProperty.call(notify, id);
        const box = (id, label, head, tip) => window.AFTip.wrap(
            `<label class="alertonlbl"><input type="checkbox" data-alertnotify="${C.esc(id)}" ${notify[id] ? 'checked' : ''}>${label ? `<span class="alertnlbl">${label}</span>` : ''}</label>`,
            `${head}: ${notify[id] ? 'on' : 'off'}`, tip);
        const differs = ' A different output from the tone, so either can be on without the other.';
        // U-186 — Turn finished has a second notification, the Console's own; both are shown, each its own setting.
        const pop = !own(row.event)
            ? '<span class="alertnone" title="This event has no VS Code notification of its own.">—</span>'
            : own('console:' + row.event)
                ? `<span class="alertnboth">${box(row.event, 'all', 'Notification, every session',
                    'A VS Code notification every time any session finishes its turn — the notifyTurnEnd setting.' + differs)}${box('console:' + row.event, 'Console', 'Notification, Console',
                    'A VS Code notification when a Console turn finishes and you are not watching that conversation — never the one on your screen, never a turn you interrupted. The notifyConsoleTurnEnd setting.' + differs)}</span>`
                : box(row.event, '', 'Notification',
                    'A VS Code notification for this event — the same switch as the matching notify setting in Settings.' + differs);
        return `<tr>
            <td>${name}</td>
            <td class="alertck">${ring}</td>
            <td class="alerttone"><div class="alerttonebox">${alertVoiceSelect(al, row)}<button class="secondary small" data-alertplay="${C.esc(row.voice)}" ${row.playable ? '' : 'disabled'} title="Play it now — this is what this event sounds like">▶</button></div>${note}</td>
            <td class="alertck">${say}</td>
            <td class="alertck">${pop}</td>
        </tr>`;
    }

    /** B — "What happens, and what do I hear?" Every event, every output. */
    function alertEvents(al, notify) {
        const th = (label, tip) => `<th class="setth" title="${C.esc(tip)}">${label}</th>`;
        return `<table class="settbl alerttbl">
            <thead><tr>
                ${th('Event', 'What happened.')}
                ${th('Ring', 'Play this event\'s tone on every session in the fleet.')}
                ${th('Tone', 'Which sound. Leave it on Default and the built-in answer stands — Turn finished and Asking you deliberately differ, so the two can be told apart from another room. The hover says what would ACTUALLY play and which step chose it: this session > this agent > your choice here > the built-in default.')}
                ${th('Say who', 'Also say WHICH AGENT, out loud, after the tone.')}
                ${th('Notification', 'A VS Code notification for the same event — the notify settings, shown here too. Turn finished has two: every session, and a Console turn you are not watching. Session ended and Error have none.')}
            </tr></thead>
            <tbody>${(al.events || []).map(e => alertEventRow(al, e, notify)).join('')}</tbody>
        </table>`;
    }

    function alertCustomRow(al, v) {
        const state = v.playable ? '' : (v.exists ? ' — nothing here plays it' : ' — the file is gone');
        // ‼️ THE NAME IS THE ROW'S OWN BOX, not a ✎ that opens something. A
        // webview has no `window.prompt` (it is blocked, and a button wired to
        // one is a button that does nothing), and the row editor is the shape
        // this page already uses for lists — U-108 / U-110.
        return `<div class="wikifile alertmine">
            <span class="wikimark ${v.playable ? 'ok' : 'no'}">${v.playable ? '♪' : '✗'}</span>
            <input class="wikirel alertname" type="text" value="${C.esc(v.label)}"
                data-alertrename="${C.esc(v.id)}" data-alertlabel="${C.esc(v.label)}"
                title="${C.esc((`Named: ${v.label}\n\nWhat every picker shows. The id it was given (${v.id}) never moves, so renaming cannot unpick this sound anywhere it was chosen.`))}">
            ${window.AFTip.wrap(`<span class="wikipath">${C.esc(v.file)}${C.esc(state)}</span>`,
                `${v.label} — ${v.id}`,
                v.file + (v.playable
                    ? `\n\nPlayed by: ${v.backend || 'this platform'}.`
                    : v.exists
                        ? '\n\n⚠ Nothing on this machine can open this format. Any event set to it falls through to the step below rather than going silent.'
                        : '\n\n⚠ There is no file at that path any more. The sound is still listed so it can be fixed; an event set to it falls through to the step below.')
                + '\n\nThe file was never copied — it plays from where it lives, so editing it there changes the sound.')}
            <button class="secondary small" data-alertplay="${C.esc(v.id)}" ${v.playable ? '' : 'disabled'} title="Play it now">▶</button>
            <button class="secondary small" data-alertremove="${C.esc(v.id)}" title="Drop it from the list. The FILE is not deleted — it was never ours. Any event set to this sound is cleared at the same time and falls back to its built-in default.">✕</button>
        </div>`;
    }


    /**
     * ‼️ U-178 — SETTINGS DRAWS ONE LINE, NOT THE CARD. The controls moved to
     * the 🔊 Sound page; what stays here is the answer to "is sound on, and
     * where do I change it", in the place a search for sound, voice, mute or
     * quiet lands.
     */
    function alertsSummary(al) {
        const g = al.gate || {};
        const sil = g.silence || {};
        const on = (al.events || []).filter(e => e.on).length;
        const state = g.muted ? 'muted' : sil.silent ? 'silent right now' : on ? 'on' : 'off';
        const q = g.quiet || {};
        const muted = (g.mutedSessions || []).length;
        const parts = [
            on ? `rings on ${on} event${on === 1 ? '' : 's'}` : 'no event rings',
            q.configured ? `quiet ${q.from}–${q.to}` : '',
            muted ? `${muted} silent session${muted === 1 ? '' : 's'}` : ''
        ].filter(Boolean);
        return `<div class="setitem alertsum" data-item="agentFarm.alerts.voices" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="setname">🔊 Sound</span>
            <span class="alertsumtxt">— ${C.esc(state)} · ${C.esc(parts.join(' · '))}</span>
            <button class="secondary" data-afnav="sound" title="${C.esc('Open the Sound page: what rings on which event, the tones, saying who, quiet hours and your own sounds.')}">Open Sound</button>
        </div>`;
    }


    /** U-179 — the header's 🔊: icon, state and MIRROR hover from the host's push (window.__AFUI__.sound). */
    function navState(fallbackTip) {
        const s = (window.__AFUI__ || {}).sound;
        if (!s) { return { icon: '🔊', state: '', head: 'Sound', tip: fallbackTip || '' }; }
        return { icon: s.icon, state: s.state, head: s.head, tip: (s.lines || []).join('\n') + '\n\nClick opens the Sound page.' };
    }

    /** Repaint every header 🔊 in place on a push — a re-render would cost scroll, menus and drafts. */
    function paintNav() {
        const s = navState();
        document.querySelectorAll('[data-afsound]').forEach(b => {
            b.textContent = s.icon;
            b.setAttribute('aria-label', s.head);
            b.setAttribute('data-afsound', s.state);
            const wrap = b.parentElement;
            const h = wrap && wrap.querySelector('.af-tiph');
            const body = wrap && wrap.querySelector('.af-tipb');
            if (h) { h.textContent = s.head; }
            if (body) { body.textContent = s.tip; }
        });
    }

    window.AFSoundCard = Object.assign(window.AFSoundCard || {}, {
        navState, paintNav,
        EVENT_TEXT: ALERT_EVENT_TEXT, ORIGIN_TEXT: ALERT_ORIGIN_TEXT,
        voiceName: alertVoiceName, toneGroups: alertToneGroups, voiceSelect: alertVoiceSelect,
        eventRow: alertEventRow, events: alertEvents, customRow: alertCustomRow, summary: alertsSummary
    });
})();
