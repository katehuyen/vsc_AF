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
                <input type="checkbox" id="alertnudgeon" ${nOn ? 'checked' : ''}>⏰ Reminder</label>
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
                <input type="checkbox" id="alertmute" ${muted ? 'checked' : ''}>🔇 Mute all</label>
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
                '<span class="alertmuteseslbl">Silent on their own</span>',
                `${(g.mutedSessions || []).length} session${(g.mutedSessions || []).length === 1 ? '' : 's'} set to Silent`,
                'These stay quiet whatever the two switches to the left say — a session\'s own Silent '
                + 'is the only authority that can subtract from what the fleet switch and the row\'s '
                + '♪ box ADD UP to.\n\nNothing they chose was cleared; ✕ puts each one back exactly '
                + 'as it was.')}${ses}</span>` : ''}
        </div>${err}`;
    }


    window.AFSoundCard = Object.assign(window.AFSoundCard || {}, { gate: alertGateStrip });
})();
