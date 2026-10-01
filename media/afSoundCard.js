// Agent Farm — THE SOUND CARD (U-178). What was Settings ▸ Alert sounds, shared:
// the Sound page draws it, Settings draws its one-line summary. Every gesture is
// posted to the host, which runs the function the matching alerts.* op runs.
// This file: the event rows, your own sounds, the card. afSoundStrips.js: the gate and voice strips. afSoundWire.js: look and wiring.
(function () {
    const C = window.AFCharts;
    const alertGateStrip = al => window.AFSoundCard.gate(al);
    const alertSpeakStrip = al => window.AFSoundCard.speak(al);
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
            (row.chosen ? `Set to: ${alertVoiceName(al, row.chosen)}` : `Not set — falls back to ${alertVoiceName(al, row.fallback)}`)
            + `\n\nWhich sound this event plays for every session. Clearing it does not mute the event: it falls back to the built-in default.`);
        return `<select data-alertvoice="${C.esc(row.event)}" title="${C.esc(tip)}">
            ${C.option('', `Default — ${alertVoiceName(al, row.fallback)}`, {
            selected: !row.chosen,
            detail: 'Nothing chosen for this event, so the built-in default plays. This is NOT silence — turn the event off to mute it.'
        })}
            ${alertToneGroups(al, row.chosen)}
        </select>`;
    }

    function alertEventRow(al, row) {
        const text = ALERT_EVENT_TEXT[row.event] || [row.event, ''];
        const armed = al.sessionEvents.indexOf(row.event) >= 0;
        const name = window.AFTip.wrap(
            `<span class="alertev">${C.esc(text[0])}</span>`,
            `${text[0]} — sound is ${row.on ? 'ON for every session' : 'off'}`,
            text[1] + '\n\n' + (row.on
                ? 'The tick plays this sound on every session, whatever each one has selected for itself.'
                : armed
                    ? 'Untitled here, but a single session can still arm it on its own from the ♪ in its Live Timeline row — the two ADD, they do not gate each other.'
                    : 'Nothing plays this one. It has no per-session control either, so this tick is the only way to hear it.'));
        // ‼️ WHAT WILL ACTUALLY PLAY, on the row, in words. `chosen` is what the
        // user typed and `voice` is what the chain answered, and the two differ
        // exactly when something is wrong — a deleted file, a renamed sound.
        const wrong = row.chosen && row.chosen !== row.voice;
        /**
         * ‼️ audit B-05 — AND THE COLOUR WAS ON THE ROWS THAT STILL MAKE A NOISE.
         *
         * Measured on the scene whose own title is "armed events whose sound
         * cannot be played": `error` was armed with nothing on this machine able
         * to play it — SILENT — and drew in the ordinary foreground, while the
         * two rows that fell through to a working default and DO ring drew in
         * warning yellow. The badge above them said "1 armed event cannot be
         * played" and pointed at the one row the table did not mark.
         *
         * So there are two states and they are not the same size: a fallback
         * happened (there is still a sound) and NOTHING WILL BE HEARD. The
         * second is the badge's own expression — `e.on && !e.playable`, read
         * from `alertsCard` — so the row and the badge cannot drift apart.
         */
        const silent = row.on && !row.playable;
        const plays = window.AFTip.wrap(
            `<span class="alertplays${silent ? ' silent' : wrong ? ' bad' : ''}">${C.esc(alertVoiceName(al, row.voice))}<span class="alertorigin"> · ${C.esc(ALERT_ORIGIN_TEXT[row.origin] || row.origin)}</span></span>`,
            silent
                ? `${text[0]} is armed and NOTHING plays it`
                : `${text[0]} plays ${alertVoiceName(al, row.voice)}`,
            `Chosen by ${ALERT_ORIGIN_TEXT[row.origin] || row.origin}.\n${row.file || '(no file)'}`
            + (row.playable ? '' : '\n\n⚠ Nothing on this machine can play that file — this event would be silent.')
            + ((row.skipped || []).length
                ? '\n\nPassed over on the way:\n' + row.skipped.map(s => `· ${s.voice} (${ALERT_ORIGIN_TEXT[s.origin] || s.origin}) — ${s.why}`).join('\n')
                : ''));
        // ‼️ A-25 — WHETHER THIS EVENT IS ALSO SPOKEN, IN THE TABLE THAT ALREADY
        // SAYS WHAT IT PLAYS. `alerts.speak.events` is a list of the same five
        // names, and drawn as five more ticks in the strip above it would be a
        // second event table three lines from this one — the reader would have
        // to match them up by name to answer "and what happens on `question`?".
        const sp = al.speak || {};
        const said = (sp.events || []).indexOf(row.event) >= 0;
        const say = window.AFTip.wrap(
            `<label class="alertonlbl alertsaylbl"><input type="checkbox" data-alertsay="${C.esc(row.event)}" ${said ? 'checked' : ''}></label>`,
            `${text[0]} — ${said ? 'the agent\'s NAME is spoken after the tone' : 'tone only, no name'}`,
            (said
                ? 'After this event\'s tone, the sentence below is read out loud — so the '
                  + 'question from the next room is answered without walking to the screen.'
                : 'This event makes its noise and says nothing. A tone answers "what kind of '
                  + 'news is this?"; with several lanes running, the question is WHICH ONE, '
                  + 'and no palette can carry a name.')
            + (sp.on ? '' : '\n\n‼️ Announcements are switched OFF above, so nothing is spoken on '
                + 'any event yet — this tick decides what happens once they are on.')
            + '\n\nThe tone and the sentence are ONE queue ticket, in that order: no other '
            + 'lane\'s chime can land in the middle of this one\'s sentence.');
        return `<tr>
            <td><label class="alertonlbl"><input type="checkbox" data-alerton="${C.esc(row.event)}" ${row.on ? 'checked' : ''}>${name}</label></td>
            <td class="alertsay">${say}</td>
            <td>${alertVoiceSelect(al, row)}</td>
            <td>${plays}</td>
            <td class="alertbtn"><button class="secondary small" data-alertplay="${C.esc(row.voice)}" ${row.playable ? '' : 'disabled'} title="Play it now — this is what this event sounds like">▶</button></td>
        </tr>`;
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


    function alertsCard(al, opts) {
        opts = opts || {};
        const mine = (al.voices || []).filter(v => !v.builtin);
        const on = (al.events || []).filter(e => e.on).length;
        const broken = (al.events || []).filter(e => e.on && !e.playable).length;
        const sil = (al.gate && al.gate.silence) || { silent: false };
        // ‼️ THE GATE OUTRANKS THE COUNT IN THE BADGE. "3 of 5 events armed" on
        // a muted farm is the true sentence that sends somebody looking in the
        // wrong place for ten minutes.
        const cls = sil.silent ? 'eng-off' : broken ? 'eng-warn' : on ? 'eng-ok' : 'eng-off';
        const badge = sil.silent
            ? `<span class="rootbadge warn">silent — ${C.esc(sil.detail || '')}</span>`
            : broken
            ? `<span class="rootbadge warn">${broken} armed event${broken === 1 ? '' : 's'} cannot be played</span>`
            : `<span class="rootbadge">${on ? `${on} of ${al.events.length} events armed` : 'nothing armed — every event is off'}</span>`;
        // ‼️ U-123 — AND THE NUDGE SAYS SO IN THE HEAD, because it is the one
        // thing on this card that makes a sound the reader did NOT arm: a
        // second chime some minutes after a question, from a policy three
        // controls deep in a strip. A badge for it is cheap and the surprise is
        // not. It rides BESIDE the count rather than replacing it — the gate
        // outranks the count, but a reminder is not a gate.
        const nudge = (al.gate && al.gate.nudge) || {};
        const nudgeBadge = nudge.on
            ? `<span class="rootbadge">⏰ nudge ${C.esc(String(nudge.minutes))}m ×${C.esc(String(nudge.repeat))}${nudge.armed ? ` · ${C.esc(String(nudge.armed))} waiting` : ''}</span>`
            : '';
        const err = (opts.error || '')
            ? `<div class="seterr">⚠ ${C.esc((opts.error || ''))}</div>` : '';
        const full = mine.length >= al.limit;
        return `<div class="setitem eng ${cls}" data-item="agentFarm.alerts.voices">
            <div class="sethead"><span class="setname">🔔 Alert sounds</span> ${badge} ${nudgeBadge}</div>
            <div class="setdesc">A sound so you can leave the room. Every event is off out of the box;
                ticking one plays its sound on <b>every</b> session. Two of them
                (${al.sessionEvents.map(e => `<code>${C.esc(e)}</code>`).join(' · ')}) can also be armed for a
                single session from the ♪ in its Live Timeline row — the two <b>add up</b> rather than
                overriding each other, so unticking here never silences a session that armed itself.</div>
            ${alertGateStrip(al)}
            ${alertSpeakStrip(al)}
            ${err}
            <table class="settbl alerttbl">
                <thead><tr>
                    <th class="setth" title="${C.esc(('What happened. Tick one and its sound plays on every session in the fleet.'))}">Event</th>
                    <th class="setth" title="${C.esc(('Also SAY WHICH AGENT, out loud, after this event\'s tone. A tone answers "what kind of news is this?" and nothing else; with several lanes running the question from the next room is WHICH ONE, and no palette can carry a name. Out of the box only question is spoken — the one event where an agent is STOPPED and the cost of not knowing is the whole run standing still.'))}">🗣</th>
                    <th class="setth" title="${C.esc(('Your choice for everybody. Leave it on Default and the built-in answer stands — turn-ready and question deliberately differ, so the two can be told apart from another room without configuring anything.'))}">Sound</th>
                    <th class="setth" title="${C.esc(('What would ACTUALLY play, and which step of the chain chose it: this session > this agent > your choice here > the built-in default. A sound whose file has gone falls through to the next step rather than going silent.'))}">Plays</th>
                    <th class="setthx"></th>
                </tr></thead>
                <tbody>${(al.events || []).map(e => alertEventRow(al, e)).join('')}</tbody>
            </table>
            <div class="setdesc" style="margin-top:10px">Your own sounds — <b>${mine.length}</b> of ${al.limit}.
                Any file this machine can play: ${C.esc((al.formats || []).map(f => '.' + f).join(' · ') || 'nothing — no player was found')}.
                The file is <b>not copied</b>; it plays from where it lives.</div>
            ${mine.length ? `<div class="wikifiles">${mine.map(v => alertCustomRow(al, v)).join('')}</div>` : ''}
            <div class="btnrow">
                <button class="secondary" id="alertadd" ${full ? 'disabled' : ''}
                    title="${C.esc(full ? `There is room for ${al.limit} of your own sounds — remove one first.` : 'Pick a sound file from anywhere on this machine, then give it a name. The file stays where it is.')}">+ Add a sound…</button>
                <button class="secondary" id="alertfolder"
                    title="${C.esc('Open ' + al.folder + '\n\nOnly a suggestion — somewhere of Agent Farm\'s own that survives updates. The picker takes a file from anywhere.')}">📂 Suggested folder</button>
            </div>
        </div>`;
    }


    window.AFSoundCard = Object.assign(window.AFSoundCard || {}, {
        EVENT_TEXT: ALERT_EVENT_TEXT, ORIGIN_TEXT: ALERT_ORIGIN_TEXT,
        voiceName: alertVoiceName, toneGroups: alertToneGroups, voiceSelect: alertVoiceSelect,
        eventRow: alertEventRow, customRow: alertCustomRow, card: alertsCard
    });
})();
