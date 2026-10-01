// Agent Farm — THE SOUND CARD (U-178). What was Settings ▸ Alert sounds, shared:
// the Sound page draws it, Settings draws its one-line summary. Every gesture is
// posted to the host, which runs the function the matching alerts.* op runs.
// This file: the gate strip (mute, quiet hours, reminder) and the voice strip (Say who).
(function () {
    const C = window.AFCharts;
    const alertVoiceName = (al, id) => window.AFSoundCard.voiceName(al, id);
    const alertToneGroups = (al, chosen) => window.AFSoundCard.toneGroups(al, chosen);
    /**
     * ‼️ A-22 — WHETHER ANYTHING IS HEARD AT ALL, ON THE CARD THAT SAYS WHICH
     * TONE.
     *
     * The rows below answer "question plays ask-double, chosen by you". If the
     * farm is muted or it is 03:00, that sentence is true and useless: the
     * reader is on this page because they heard nothing, and the answer to that
     * is a different question the card could not previously ask. Three
     * authorities, all of them on ONE line at the top — DENSITY, and the order
     * is the order they take effect in.
     *
     * The mute is the SAME switch as the 🔇 in the status bar, not a copy of
     * it: both call `alertsSetMuted`, so they cannot drift apart.
     */
    function alertGateStrip(al) {
        const g = al.gate || {};
        const q = g.quiet || {};
        const sil = g.silence || { silent: false, reasons: [] };
        const muted = !!g.muted;
        const state = window.AFTip.wrap(
            `<span class="alertgatestate ${sil.silent ? 'off' : 'on'}">${sil.silent ? '🔇 silent' : '🔊 sounds on'}</span>`,
            sil.silent ? 'Nothing plays right now' : 'Armed events play',
            sil.silent
                ? `Held by: ${sil.detail || 'unknown'}.\n\nEvery authority holding it is listed — `
                  + 'unmuting while quiet hours are still on would leave the farm silent with '
                  + 'nothing on screen saying why.'
                : 'Nothing is holding the gate shut. Whether a particular event makes a noise is '
                  + 'the table below — armed, and with a tone this machine can play.');
        const muteTip = (
            (muted ? 'Muted — nothing in the farm makes a sound' : 'Not muted')
            + '\n\nThe same switch as the 🔇 in the status bar. It clears nothing: every armed '
            + 'event and chosen tone stays exactly as it is, so unmuting restores your setup '
            + 'rather than the defaults.\n\nSounds only — the notification, the modal and the '
            + 'focus jump are separate branches with their own switches.');
        const quietTip = (
            (q.error ? `⚠ ${q.error}` : q.line || `Quiet hours off (${q.from || '23:00'}–${q.to || '08:00'})`)
            + '\n\nThe window WRAPS MIDNIGHT: 23:00–08:00 is quiet from 23:00 through 07:59 the '
            + 'next morning. The start is included and the end is not, so at 08:00 sounds are '
            + 'back.\n\nA time that is not HH:MM is refused rather than stored — a schedule that '
            + 'reads as configured and silences nothing is the worst of the three outcomes.');
        /**
         * ‼️ U-123 — THE SECOND TAP ON THE SHOULDER, on the line that already
         * decides whether the FIRST one is heard.
         *
         * `agentFarm.alerts.nudge` was a raw JSON box beside this strip while
         * every other part of the gate lived ON it. It belongs here and not
         * beside the tone table because it answers the gate's question — will a
         * sound happen at all — rather than the table's, which sound.
         *
         * ‼️ OFF IS `minutes: 0`, THE SETTING'S OWN WORD FOR IT. A fourth field
         * could disagree with the other three; this cannot. Switching it back on
         * with the numbers still at zero would arm nothing, so the page sends
         * the defaults for whichever half is empty and the host clamps them.
         */
        const n = g.nudge || {};
        const nOn = n.on === true;
        const nMin = Number(n.minutes) > 0 ? Number(n.minutes) : ((n.defaults || {}).minutes || 3);
        const nRep = Number(n.repeat) > 0 ? Number(n.repeat) : ((n.defaults || {}).repeat || 2);
        const nudgeTip = (
            (nOn
                ? `On — a reminder ${nMin} min after an unanswered question, up to ${nRep} time${nRep === 1 ? '' : 's'}`
                : 'Off — a question that goes unanswered is announced once and then left alone')
            + '\n\n‼️ ONLY the question event is nudged. Reminding somebody about a turn that '
            + 'FINISHED is pestering them about news that needs nothing from them; a question is '
            + 'the one case where nobody noticing costs the whole run.\n\nIt stops by itself after '
            + 'the repeat count, because a chime that never ends is one you mute for good — and it '
            + 'goes through this same mute, these same quiet hours and the same queue as the alert '
            + 'it reminds you about.');
        const armed = Number(n.armed) || 0;
        const nudge = `<label class="alertgatelbl" title="${C.esc(nudgeTip)}">
                <input type="checkbox" id="alertnudgeon" ${nOn ? 'checked' : ''}>⏰ Nudge</label>
            <span class="alertgatedash">after</span>
            <input class="alertqtime" type="number" id="alertnudgemin" min="1" max="240"
                value="${C.esc(String(nMin))}" data-alertn="${C.esc(String(nMin))}"
                title="${C.esc('How long a question may sit unanswered before the reminder plays, in minutes. 1–240.')}">
            <span class="alertgatedash">min,</span>
            <input class="alertqtime" type="number" id="alertnudgerep" min="1" max="20"
                value="${C.esc(String(nRep))}" data-alertn="${C.esc(String(nRep))}"
                title="${C.esc('How many reminders at most, then it gives up on that question. Ceiling 20 — a chime that never ends is one you mute for good.')}">
            <span class="alertgatedash">×</span>
            <select id="alertnudgetone" title="${C.esc((
            `Reminder tone: ${alertVoiceName(al, n.voice)}\n\nDeliberately its own, and lighter than the `
            + 'alert it follows: this is a second tap on the shoulder, not the news again.\n\n'
            + 'A sound this machine cannot play is refused rather than stored — it would fall '
            + 'through to the event\'s own voice and the setting would look as though it had taken.'))}">
                ${alertToneGroups(al, String(n.voice || ''))}
            </select>${armed ? window.AFTip.wrap(
            `<span class="alertnudgearmed">${armed} waiting</span>`,
            `${armed} question${armed === 1 ? '' : 's'} armed for a reminder right now`,
            'Each one is a session that STOPPED to ask something and has not been answered yet. '
            + 'A session that moves on — answered, or gone from the live list — disarms itself, so '
            + 'this figure is what is really outstanding rather than a running total.') : ''}`;
        const err = q.error
            ? `<div class="seterr">⚠ ${C.esc(q.error)}</div>` : '';
        const ses = (g.mutedSessions || []).map(s =>
            `<span class="alertmuteses">${C.esc(s.label || s.sessionId)}<button class="secondary small" data-alertunmute="${C.esc(s.sessionId)}" title="${C.esc('Let ' + (s.label || s.sessionId) + ' be heard again. Nothing it chose was cleared, so this puts back exactly what was there before.')}">✕</button></span>`).join('');
        return `<div class="alertgate">
            <label class="alertgatelbl" title="${C.esc(muteTip)}">
                <input type="checkbox" id="alertmute" ${muted ? 'checked' : ''}>🔇 Mute the farm</label>
            <span class="alertgatebar"></span>
            <label class="alertgatelbl" title="${C.esc(quietTip)}">
                <input type="checkbox" id="alertquieton" ${q.configured ? 'checked' : ''}>Quiet hours</label>
            <input class="alertqtime" type="text" id="alertquietfrom" size="5" maxlength="5"
                value="${C.esc(q.from || '23:00')}" data-alertq="${C.esc(q.from || '23:00')}"
                title="${C.esc('When the quiet starts, HH:MM, local time. Included.')}">
            <span class="alertgatedash">–</span>
            <input class="alertqtime" type="text" id="alertquietto" size="5" maxlength="5"
                value="${C.esc(q.to || '08:00')}" data-alertq="${C.esc(q.to || '08:00')}"
                title="${C.esc('When it ends, HH:MM, local time. Excluded — at this minute sounds are back.')}">
            <span class="alertgatebar"></span>
            ${nudge}
            ${state}
            ${ses ? `<span class="alertgatebar"></span><span class="alertmuteseswrap">${window.AFTip.wrap(
                '<span class="alertmuteseslbl">muted on their own</span>',
                `${(g.mutedSessions || []).length} session${(g.mutedSessions || []).length === 1 ? '' : 's'} muted individually`,
                'These stay quiet whatever the two switches to the left say — a session\'s own mute '
                + 'is the only authority that can subtract from what the fleet switch and the row\'s '
                + '♪ box ADD UP to.\n\nNothing they chose was cleared; ✕ puts each one back exactly '
                + 'as it was.')}${ses}</span>` : ''}
        </div>${err}`;
    }

    /**
     * ‼️ A-25 — WHO IS SPEAKING, AND WHAT THEY WILL SAY.
     *
     * `agentFarm.alerts.speak` was a raw JSON box with seven fields in it, and
     * one of them — `voice` — is a NAME that has to exist on this machine. A
     * box cannot know whether it does, and the engine's answer to a name
     * nothing answers to is a FAILED announcement (`exit 5`), deliberately, not
     * a quiet fall back to English. So the one thing the box could never show
     * is the one thing that decides whether the feature works, and the strip
     * shows it: the voice list is asked of Windows, both of its registries, and
     * the reader sees the culture of every voice they can pick.
     *
     * It is its own strip and not more controls on the gate's line: the gate
     * answers "will anything be heard at all", this answers "and what will it
     * say" — ONE SUBJECT, and the two are read in that order down the card.
     */
    function alertSpeakStrip(al) {
        const sp = al.speak || {};
        const voices = sp.voices || [];
        const chosen = String(sp.voice || '');
        // MIRROR — the box is narrow enough to cut its own text, so it opens
        // with what it is set to right now.
        const onTip = (
            (sp.on ? 'On — the fleet says which agent out loud' : 'Off — tones only')
            + '\n\nLocal and free: no network, no account, no model. The sentence rides BEHIND '
            + 'the tone in the same queue ticket, and goes through the same mute, the same quiet '
            + 'hours and the same per-session mute as the tone it follows.\n\nWhich events are '
            + 'spoken is the 🗣 column in the table below.');
        /**
         * ‼️ "NOTHING ANSWERS TO THAT" IS ONLY SAYABLE WHERE THE LIST IS
         * AUTHORITATIVE. Listing voices is Windows-only: on macOS `say -v Yelda`
         * works perfectly and the list comes back EMPTY with a reason, so a
         * warning keyed on "no match" alone would call a working setting broken
         * on every machine that is not this one. An unreadable list is a
         * question the page cannot answer, and it says that instead.
         */
        const bad = chosen && !sp.resolved && sp.voicesLoaded && !sp.voicesError;
        const voiceTip = (
            (chosen
                ? (sp.resolved
                    ? `Set to "${chosen}" — which reaches ${sp.resolved}`
                    : bad
                        ? `Set to "${chosen}" — ‼️ NOTHING ON THIS MACHINE ANSWERS TO THAT`
                        : `Set to "${chosen}" — this platform cannot list its voices, so whether that name is answered is only known when it speaks`)
                : 'Not set — whichever voice the system reads with')
            + '\n\nA voice reading a language it does not know is not accented, it is '
            + 'unintelligible, so the language of each voice is on its row.\n\n'
            + (bad
                ? '‼️ The announcement will FAIL rather than read out in the wrong voice — which '
                  + 'is deliberate: a wrong voice is not a smaller error than no voice, it is a '
                  + 'harder one to diagnose. Pick one from this list, or clear it.\n\n'
                : '')
            + sp.voicesNote);
        // ‼️ THE ROW THE SETTING REACHES IS THE SELECTED ONE, not the row whose
        // name equals it. `Tolga` is a legal setting and no voice is called
        // that, so a box matching the raw value would read "System default" on
        // a machine that is about to speak Turkish — the exact lie this strip
        // exists to end. Picking a row writes the FULL name, which is the
        // user's own act and not a silent rewrite of what they typed.
        const at = String(sp.resolvedName || chosen);
        // U-130 — the box cuts `name · culture · engine` long before the engine,
        // and the engine is exactly what explains why a voice is missing from
        // the shorter list. The hover carries the whole row plus what picking
        // it WRITES, since the setting stores the full name and not the label.
        const opt = v => C.option(v.name, v.label, {
            selected: v.name === at,
            detail: [
                `Reads ${v.culture || 'no language it declares'}.`,
                v.engine === 'sapi5'
                    ? 'SAPI 5 — the short classic list every Windows has.'
                    : 'OneCore — installed with a language pack.',
                `Picking this writes “${v.name}” into the setting.`
            ].join('\n')
        });
        // The setting is ALWAYS shown, whether or not the list could confirm it
        // — a picker that silently drops the value it is set to is the box this
        // strip replaced. Only the ⚠ is conditional.
        const unknown = chosen && !sp.resolvedName
            ? C.option(chosen, `${bad ? '⚠ ' : ''}${chosen}${bad ? ' — no voice answers to that' : ' — set by hand'}`, {
                selected: true,
                detail: bad
                    ? 'Nothing on this machine answers to that name, so the announcement will FAIL rather than read out in the wrong voice. Pick a row below, or clear it.'
                    : 'This platform cannot list its voices, so whether the name is answered is only known when it speaks.'
            })
            : '';
        const box = !sp.voicesLoaded
            // ‼️ NOT ASKED YET IS NOT "NO VOICES". The list costs a PowerShell
            // process, so it is fetched once when the card first draws; an
            // empty box in the meantime would read as "this machine cannot
            // speak", which is the opposite of the truth.
            ? `<select id="alertspeakvoice" disabled>${C.option('', "reading this machine's voices…",
                { detail: 'The list costs a PowerShell process and is fetched once when this card first draws. Not asked yet is not "no voices".' })}</select>`
            : `<select id="alertspeakvoice" title="${C.esc(voiceTip)}">
                ${C.option('', 'System default — whichever voice Windows reads with', {
                selected: !chosen,
                detail: 'No name is written into the setting, so whatever this machine reads with speaks — and it changes if that default changes.'
            })}
                ${unknown}
                ${voices.map(opt).join('')}
            </select>`;
        const err = sp.voicesError
            ? `<div class="seterr">⚠ the voice list could not be read — ${C.esc(sp.voicesError)}</div>` : '';
        // What will actually be said, in full. A template is a thing to READ
        // BACK, not to imagine: `{agnet}` is spoken as "agnet" on purpose, and
        // the only place that mistake is visible before it is heard is here.
        const state = window.AFTip.wrap(
            `<span class="alertgatestate ${sp.on && !bad ? 'on' : 'off'}">${sp.on ? (bad ? '⚠ voice not found' : '🗣 ' + C.esc(sp.preview || '')) : 'not announcing'}</span>`,
            sp.on ? `Next announcement: “${sp.preview}”` : 'Announcements are off',
            (sp.on
                ? `Spoken by: ${sp.resolved || (bad ? '‼️ nothing — the name matches no voice here' : chosen || 'the system default voice')}.`
                : 'The tones still play. Nothing is spoken until the tick to the left is on.')
            + '\n\nThe sentence is your template with three names filled in — '
            + '{agent}, {event} and {session}. Anything else is left exactly as typed, so a '
            + 'mistyped {agnet} is HEARD rather than silently swallowed.'
            + `\n\nAt most ${sp.max || 160} characters: every announcement holds the whole farm's `
            + 'alerts for as long as it takes to read, so a template that grew into a paragraph '
            + 'would silence everything queued behind it.');
        // Named rather than counted, for the muted sessions' reason: "one
        // conversation speaks Turkish" cannot be acted on without knowing which.
        const ses = (sp.sessions || []).map(s =>
            `<span class="alertmuteses">${C.esc(s.label || s.sessionId)} · ${C.esc(s.voice)}<button class="secondary small" data-alertspeakclear="${C.esc(s.sessionId)}" title="${C.esc('Clear this conversation\'s own voice — the fleet setting answers for it again. That is NOT silence.')}">✕</button></span>`).join('');
        return `<div class="alertgate alertspeak">
            <label class="alertgatelbl" title="${C.esc(onTip)}">
                <input type="checkbox" id="alertspeakon" ${sp.on ? 'checked' : ''}>🗣 Say which agent</label>
            <span class="alertgatebar"></span>
            ${box}
            <button class="secondary small" id="alertspeakrescan"
                title="${C.esc('Ask Windows again. A language pack you installed from Settings a minute ago is exactly what this is for — and it is the same free list at Settings ▸ Time & language ▸ Speech ▸ Add voices.')}">↻</button>
            <span class="alertgatebar"></span>
            <label class="alertgatelbl" title="${C.esc((`Rate: ${sp.rate === 0 ? '0 — the voice\'s own normal speed' : sp.rate}\n\nSAPI's own scale, −10 (slow) to 10 (fast). An announcement you have heard a hundred times can be read faster than one you have not.`))}">rate
                <input class="alertqtime" type="number" id="alertspeakrate" min="-10" max="10"
                    value="${C.esc(String(sp.rate === undefined ? 0 : sp.rate))}" data-alertsp="${C.esc(String(sp.rate === undefined ? 0 : sp.rate))}"></label>
            <label class="alertgatelbl" title="${C.esc((`Volume: ${sp.volume === undefined ? 100 : sp.volume} of 100\n\nThe SENTENCE's volume, and separate from the tone's — that one is the OS mixer's. A quiet name behind a loud chime is a real setting: the chime carries down the corridor, the name only has to reach the next room.`))}">vol
                <input class="alertqtime" type="number" id="alertspeakvol" min="0" max="100"
                    value="${C.esc(String(sp.volume === undefined ? 100 : sp.volume))}" data-alertsp="${C.esc(String(sp.volume === undefined ? 100 : sp.volume))}"></label>
            <span class="alertgatebar"></span>
            <input class="alertspeaktpl" type="text" id="alertspeaktpl" maxlength="${Number(sp.max) || 160}"
                value="${C.esc(String(sp.template || ''))}" data-alertsp="${C.esc(String(sp.template || ''))}"
                title="${C.esc((`Says: ${sp.template}\n\n{agent}, {event} and {session} are filled in; everything else is spoken exactly as typed.`))}">
            <button class="secondary small" id="alertspeaktest"
                title="${C.esc('Say it now, where you are standing. ‼️ It speaks even when announcements are OFF and even inside quiet hours — "can this machine talk at all" and "is the feature switched on" are two questions, and a test that answers the second when asked the first teaches nobody anything.')}">▶</button>
            ${state}
            ${ses ? `<span class="alertgatebar"></span><span class="alertmuteseswrap">${window.AFTip.wrap(
                '<span class="alertmuteseslbl">their own voice</span>',
                `${(sp.sessions || []).length} conversation${(sp.sessions || []).length === 1 ? '' : 's'} announced in a voice of their own`,
                'A session\'s own voice BEATS the fleet\'s — so the agent whose questions come in '
                + 'Turkish can be announced in Turkish while the rest are not, and the difference '
                + 'carries from the next room without a word being understood.\n\nSet from the ♪ '
                + 'right-click on the session\'s Live Timeline row. ✕ clears it back to the fleet '
                + 'setting, which is not silence.')}${ses}</span>` : ''}
        </div>${err}`;
    }


    window.AFSoundCard = Object.assign(window.AFSoundCard || {}, { gate: alertGateStrip, speak: alertSpeakStrip });
})();
