// Agent Farm — THE SOUND CARD (U-178). What was Settings ▸ Alert sounds, shared:
// the Sound page draws it, Settings draws its one-line summary. Every gesture is
// posted to the host, which runs the function the matching alerts.* op runs.
// This file: the card's look and its wiring.
(function () {
    let speakVoicesAsked = false;
    /** The card's own look, once per page. */
    function style() {
        return `<style>
                /* U-178 — Event | Ring | Tone | Say who | Notification. The
                   three switches are one tick wide; the Tone cell is the free
                   one, because a sound named by the user and suffixed with its
                   state must fit beside its ▶ (audit B-05). */
                .alerttbl { max-width:760px; margin-top:6px; }
                .alerttbl th:nth-child(1), .alerttbl td:nth-child(1) { width:150px; }
                .alerttbl th:nth-child(2), .alerttbl th:nth-child(4) { width:56px; text-align:center; }
                .alerttbl th:nth-child(5) { width:92px; text-align:center; }
                .alerttbl td { vertical-align:middle; } .alerttbl td.alertck { text-align:center; }
                .alerttbl td.alertck .alertonlbl { justify-content:center; }
                .alerttonebox { display:flex; gap:4px; align-items:center; }
                .alerttonebox select { flex:1 1 auto; min-width:0; }
                .alerttonebox button { flex:none; padding:0 6px; min-width:0; }
                .alertnone { opacity:.45; }
                .alertonlbl { display:flex; gap:6px; align-items:center; cursor:pointer;
                    overflow:hidden; }
                /* ‼️ .settbl input is width:100% — right for a text cell and
                   ruinous for a tick, which then takes the whole column and
                   shoves the event's name into the picker beside it. */
                .alertonlbl input[type=checkbox] { margin:0; flex:none; width:auto; }
                /* The event name is a label and never a paragraph — wrapped, it
                   pushes the row two lines tall and the table stops being read
                   across. */
                .alertev { white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
                    border-bottom:1px dotted var(--vscode-widget-border, #4444); }
                /* audit B-05 — a fallback is a warning (something still rings);
                   an armed event nothing can play is SILENCE, found first. */
                .alertplays { font-size:11px; margin-top:2px; }
                .alertplays.bad { color:var(--vscode-charts-yellow, #d7ba7d); }
                .alertplays.silent { color:var(--vscode-errorForeground); }
                .alertorigin { font-family:var(--vscode-font-family); opacity:.55; font-size:10px; }
                /* A-22 — the gate strip. ONE LINE above the table: three
                   authorities and what they add up to right now, in the order
                   they take effect. It wraps rather than scrolls, because on a
                   narrow page the reader still needs all of it. */
                .alertgate { display:flex; flex-wrap:wrap; gap:8px; align-items:center;
                    margin:8px 0 2px; padding:6px 8px; border-radius:4px;
                    background:var(--vscode-editorWidget-background, #0002);
                    border:1px solid var(--vscode-widget-border, #4443); }
                .alertgatelbl { display:flex; gap:5px; align-items:center; cursor:pointer;
                    white-space:nowrap; }
                .alertgatelbl input[type=checkbox] { margin:0; flex:none; width:auto; }
                .alertgatebar { width:1px; align-self:stretch;
                    background:var(--vscode-widget-border, #4444); }
                .alertgatedash { opacity:.6; }
                .alertqtime { width:52px; flex:none; text-align:center;
                    font-family:var(--vscode-editor-font-family); }
                /* Beside the two switches, NOT pushed to the far edge: this is
                   what they add up to, and a result parked half a screen from
                   its causes is read as a fourth unrelated control. */
                .alertgatestate { white-space:nowrap;
                    border-bottom:1px dotted var(--vscode-widget-border, #4444); }
                .alertgatestate.off { color:var(--vscode-charts-yellow, #d7ba7d); }
                .alertmuteseswrap { display:flex; gap:4px; flex-wrap:wrap; align-items:center; }
                .alertmuteseslbl { opacity:.6; font-size:11px; white-space:nowrap;
                    border-bottom:1px dotted var(--vscode-widget-border, #4444); }
                .alertmuteses { display:flex; align-items:center; gap:2px; font-size:11px;
                    padding:0 2px 0 6px; border-radius:9px;
                    border:1px solid var(--vscode-widget-border, #4444); }
                .alertmuteses button { padding:0 4px; min-width:0; }
                /* U-123 — the nudge's own boxes are the gate's, at the gate's
                   width; only the tone picker needs room for a sound's name. */
                #alertnudgemin, #alertnudgerep { width:44px; }
                #alertnudgetone { flex:0 1 150px; min-width:110px; }
                .alertnudgearmed { white-space:nowrap; font-size:11px; opacity:.85;
                    border-bottom:1px dotted var(--vscode-widget-border, #4444); }
                /* A-25 — the announcement strip. Same shape as the gate above
                   it on purpose: the two are read as one instrument, in the
                   order they take effect (is anything heard → what does it say).
                   The voice box is the wide one because a voice's LANGUAGE is
                   what the reader is choosing on, and a cut label hides it. */
                /* audit B-05 — …and 340px was not wide enough to keep that
                   promise: every real voice on this machine overflowed it
                   ("Microsoft David - English (United States) · en-US · onecore"
                   is 333px against 306px of room) with 830px unused to its
                   right. */
                .alertspeak #alertspeakvoice { flex:1 0 340px; min-width:180px; max-width:420px; }
                .alertspeak .alertqtime { width:56px; }
                .alertspeak .alertspeaktpl { flex:1 1 200px; min-width:120px; max-width:280px;
                    font-family:var(--vscode-editor-font-family); }
                .alertspeak button.small { flex:none; padding:0 6px; min-width:0; }
                .alertmine .wikimark.ok { color:var(--vscode-textLink-foreground); }
                .alertmine .wikirel { flex:0 0 180px; }
                .alertmine button { flex:none; margin-left:2px; }

        </style>`;
    }

    /** Wires whatever of the card is on the page. `data` returns the page's DATA. */
    function wire(vscode, data) {
        const click = (id, type) => { const el = document.getElementById(id); if (el) { el.addEventListener('click', () => vscode.postMessage({ type })); } };
        // A-21 — the alert sounds card. Every gesture goes to the host, which
        // runs the same function the matching `alerts.*` bridge op runs; the
        // page holds no rule of its own about reserved ids or the limit.
        click('alertadd', 'alertVoiceAdd');
        click('alertfolder', 'alertFolder');
        document.querySelectorAll('[data-alerton]').forEach(el =>
            el.addEventListener('change', () => vscode.postMessage({
                type: 'alertOn', event: el.dataset.alerton, on: el.checked
            })));
        // U-178 — the Notification column: the notify* setting, one event at a time.
        document.querySelectorAll('[data-alertnotify]').forEach(el =>
            el.addEventListener('change', () => vscode.postMessage({
                type: 'alertNotify', event: el.dataset.alertnotify, on: el.checked
            })));
        document.querySelectorAll('[data-alertvoice]').forEach(el =>
            el.addEventListener('change', () => vscode.postMessage({
                type: 'alertVoice', event: el.dataset.alertvoice, voice: el.value
            })));
        document.querySelectorAll('[data-alertplay]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({
                type: 'alertPlay', voice: el.dataset.alertplay
            })));
        document.querySelectorAll('[data-alertrename]').forEach(el => {
            // Enter LETS GO of the box. The page's own `focusin`/`focusout`
            // guard holds a background refresh while a field has focus, so an
            // Enter that kept focus would leave the row showing the old name
            // until the reader clicked somewhere else.
            el.addEventListener('keydown', e => { if (e.key === 'Enter') { el.blur(); } });
            el.addEventListener('change', () => {
                const next = el.value.trim();
                // Unchanged, or emptied: put the name back rather than sending
                // a refusal the reader has to read to learn nothing happened.
                if (!next || next === el.dataset.alertlabel) { el.value = el.dataset.alertlabel; return; }
                vscode.postMessage({
                    type: 'alertVoiceRename', id: el.dataset.alertrename, label: next
                });
            });
        });
        document.querySelectorAll('[data-alertremove]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({
                type: 'alertVoiceRemove', id: el.dataset.alertremove
            })));
        // A-22 — the gate. Same three host functions as the status bar click
        // and the `alerts.mute` / `alerts.quiet` ops.
        const muteEl = document.getElementById('alertmute');
        if (muteEl) {
            muteEl.addEventListener('change', () => vscode.postMessage({
                type: 'alertMute', on: muteEl.checked
            }));
        }
        const quietOnEl = document.getElementById('alertquieton');
        if (quietOnEl) {
            quietOnEl.addEventListener('change', () => vscode.postMessage({
                type: 'alertQuiet', on: quietOnEl.checked
            }));
        }
        ['from', 'to'].forEach(which => {
            const el = document.getElementById('alertquiet' + which);
            if (!el) { return; }
            // Enter LETS GO of the box, exactly as the sound-name rows do: the
            // page holds a refresh while a field has focus, so an Enter that
            // kept it would leave the old value on screen.
            el.addEventListener('keydown', e => { if (e.key === 'Enter') { el.blur(); } });
            el.addEventListener('change', () => {
                const next = el.value.trim();
                // ‼️ EMPTIED IS NOT A TIME. Sent through, it would be refused by
                // the host and the reader would read an error to learn they had
                // deleted something — put it back instead.
                if (!next || next === el.dataset.alertq) { el.value = el.dataset.alertq; return; }
                const msg = { type: 'alertQuiet' };
                msg[which] = next;
                vscode.postMessage(msg);
            });
        });
        /**
         * ‼️ U-123 — THE NUDGE, through the SAME host function `alerts.nudge`
         * goes through. The switch carries both numbers with it, because "on"
         * is not a field of its own: off is `minutes: 0`, so switching back on
         * has to say what the minutes are or it would arm nothing.
         */
        const nudgeOnEl = document.getElementById('alertnudgeon');
        if (nudgeOnEl) {
            nudgeOnEl.addEventListener('change', () => {
                const m = document.getElementById('alertnudgemin');
                const r = document.getElementById('alertnudgerep');
                vscode.postMessage({
                    type: 'alertNudge', on: nudgeOnEl.checked,
                    minutes: m ? m.value : undefined, repeat: r ? r.value : undefined
                });
            });
        }
        [['min', 'minutes'], ['rep', 'repeat']].forEach(([id, key]) => {
            const el = document.getElementById('alertnudge' + id);
            if (!el) { return; }
            el.addEventListener('keydown', e => { if (e.key === 'Enter') { el.blur(); } });
            el.addEventListener('change', () => {
                const next = el.value.trim();
                // ‼️ EMPTIED IS NOT A NUMBER, and 0 here is not "off" — off is
                // the switch beside it. Either would be stored as a policy
                // nobody typed, so the box is put back instead.
                if (!next || next === el.dataset.alertn) { el.value = el.dataset.alertn; return; }
                const msg = { type: 'alertNudge' };
                msg[key] = next;
                vscode.postMessage(msg);
            });
        });
        const nudgeToneEl = document.getElementById('alertnudgetone');
        if (nudgeToneEl) {
            nudgeToneEl.addEventListener('change', () => vscode.postMessage({
                type: 'alertNudge', voice: nudgeToneEl.value
            }));
        }
        document.querySelectorAll('[data-alertunmute]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({
                type: 'alertUnmuteSession', sessionId: el.dataset.alertunmute
            })));
        /**
         * ‼️ A-25 — THE ANNOUNCEMENT STRIP. Every write goes back to the host
         * through `alertSpeak`, which is the same function `alerts.speak` is,
         * so the card and the bridge cannot part company on what a partial
         * change means.
         */
        document.querySelectorAll('[data-alertsay]').forEach(el =>
            el.addEventListener('change', () => vscode.postMessage({
                type: 'alertSpeak', event: el.dataset.alertsay, on: el.checked
            })));
        const speakOnEl = document.getElementById('alertspeakon');
        if (speakOnEl) {
            speakOnEl.addEventListener('change', () => vscode.postMessage({
                type: 'alertSpeak', on: speakOnEl.checked
            }));
        }
        const speakVoiceEl = document.getElementById('alertspeakvoice');
        if (speakVoiceEl && !speakVoiceEl.disabled) {
            speakVoiceEl.addEventListener('change', () => vscode.postMessage({
                type: 'alertSpeak', voice: speakVoiceEl.value
            }));
        }
        /**
         * ‼️ ASKED ONCE, AND ONLY WHILE THE CARD IS ON SCREEN. The list costs a
         * PowerShell process; the answer arrives as a redraw, and a redraw
         * without this flag would ask again — a loop that spawns a shell per
         * frame. `voicesLoaded` is set by the host even when the read FAILED,
         * so a machine that cannot answer is asked once and then left alone.
         */
        if (speakVoiceEl && data().alerts && data().alerts.speak
            && !data().alerts.speak.voicesLoaded && !speakVoicesAsked) {
            speakVoicesAsked = true;
            vscode.postMessage({ type: 'alertSpeakVoices' });
        }
        const speakRescanEl = document.getElementById('alertspeakrescan');
        if (speakRescanEl) {
            speakRescanEl.addEventListener('click', () => vscode.postMessage({
                type: 'alertSpeakVoices', force: true
            }));
        }
        [['alertspeakrate', 'rate'], ['alertspeakvol', 'volume'], ['alertspeaktpl', 'template']]
            .forEach(([id, field]) => {
                const el = document.getElementById(id);
                if (!el) { return; }
                // Enter LETS GO of the box, exactly as the quiet-hours times and
                // the sound-name rows do: the page holds a refresh while a field
                // has focus, so an Enter that kept it would leave the old value
                // on screen after the write.
                el.addEventListener('keydown', e => { if (e.key === 'Enter') { el.blur(); } });
                el.addEventListener('change', () => {
                    const next = el.value.trim();
                    // ‼️ AN EMPTIED TEMPLATE IS NOT A SILENT ONE — the host would
                    // put the default back and the reader would watch their
                    // sentence reappear without being told why. Put it back here
                    // instead, where nothing has been written yet.
                    if (next === '' || next === el.dataset.alertsp) {
                        el.value = el.dataset.alertsp;
                        return;
                    }
                    const msg = { type: 'alertSpeak' };
                    msg[field] = field === 'template' ? next : Number(next);
                    vscode.postMessage(msg);
                });
            });
        const speakTestEl = document.getElementById('alertspeaktest');
        if (speakTestEl) {
            // ‼️ NO TEXT IS SENT — the host reads back what the SETTING would
            // say, filled in. A draft typed into the box beside it is saved by
            // the blur this very click causes, so "read me back what I just
            // typed" still works; sending the box's raw contents instead would
            // read "{agent}, {event}" out loud, which is the one sentence the
            // announcement never produces.
            speakTestEl.addEventListener('click', () =>
                vscode.postMessage({ type: 'alertSpeakTest' }));
        }
        document.querySelectorAll('[data-alertspeakclear]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({
                type: 'alertSpeakSession', sessionId: el.dataset.alertspeakclear
            })));

    }
    window.AFSoundCard = Object.assign(window.AFSoundCard || {}, { style, wire });
})();
