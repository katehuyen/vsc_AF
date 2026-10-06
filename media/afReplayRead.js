// AFReplayRead — THE TRANSCRIPT'S REPLAY, READ ALOUD (U-210).
//
// With the replay bar's 🔊 on, a replay that plays onto an agent's answer asks the one reading
// channel to read that step — the same message the step's own 🔊 sends (AFRead) — and goes on only
// when that reading is over, was refused, or never started. The replay's ⏸ pauses the reading with
// it and ▶ resumes it; ⏮ −1 +1, a jump, a new filter and ✕ end it. A ■ on the step being read skips
// to the next step; a reading somebody starts elsewhere pauses the replay. On a phone the same
// message is read by the phone's own voice (media/afPhoneRead.js); a phone that cannot speak shows
// no switch (AFRead.can).
(function () {
    'use strict'; // i18n-exempt — a directive, not interface text
    const t = s => (window.AFI18n ? window.AFI18n.t(s) : s);
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    /** How long an answer asked for may take to start before the replay goes on without it. */
    const NO_START_MS = 10000;

    /** What the replay reads: an agent's own answer with words — not a prompt, a tool, or a subagent's aside. */
    const answer = m => !!m && m.role === 'assistant' && !m.sidechain && !!String(m.text || '').trim();

    /**
     * One page's replay reader. By name:
     *   post(message)  — the page's message to its host
     *   sessionId()    — the conversation on the page
     *   keyOf(message) — a step's key (AFRead.keyOf)
     *   proceed()      — the answer is over: the replay goes on
     *   hold()         — another reading took over: the replay pauses
     *   changed()      — the switch turned itself off (a refusal): redraw it
     */
    function create(o) {
        let on = false, wait = null, drop = null, timer = null;
        const R = () => window.AFRead;
        const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
        const sameStep = (r, key) => !!(r && key && r.sessionId === o.sessionId() && r.key === key);
        const ours = r => !!wait && sameStep(r, wait.key);
        /** An ask taken back before it started: if it starts after all, it is stopped. */
        const dropIt = key => { drop = { key, until: Date.now() + NO_START_MS }; };

        function ask() {
            o.post({ type: 'readAloud', sessionId: o.sessionId(), pick: { msg: wait.key } });
            clear();
            timer = setTimeout(() => {
                timer = null;
                if (wait && !wait.started && !wait.paused) { wait = null; o.proceed(); }
            }, NO_START_MS);
        }

        function heard(r) {
            if (drop && Date.now() > drop.until) { drop = null; }
            if (drop && sameStep(r, drop.key)) { drop = null; o.post({ type: 'readControl', action: 'stop' }); return; }
            if (!wait) { return; }
            if (ours(r)) { wait.started = true; clear(); return; }
            if (!wait.started) { return; }
            wait = null;
            if (r && r.key) { o.hold(); } else { o.proceed(); }
        }

        function refused() {
            if (!wait || wait.started) { return; }
            clear();
            wait = null;
            on = false;
            o.changed();
            o.proceed();
        }

        R().watch(what => { if (what && 'refused' in what) { refused(); } else { heard(what && what.reading); } });

        return {
            get on() { return on && R().can(); },
            /** The switch flipped by a hand; off while an answer is read stops it and the replay goes on. */
            toggle() {
                on = !on;
                if (!on && wait) { this.stop(); o.proceed(); }
                return on;
            },
            /** A step the playing replay has just shown; true when it is being read and the replay waits. */
            arrive(m) {
                if (!this.on || !answer(m)) { return false; }
                const key = o.keyOf(m);
                if (!key) { return false; }
                wait = { key, started: false, paused: false, redo: false };
                drop = null;
                ask();
                return true;
            },
            /** The replay's ⏸: the answer pauses with it; one not started yet is asked again on ▶. */
            pause() {
                if (!wait || wait.paused) { return; }
                wait.paused = true;
                const r = R().reading();
                if (ours(r)) { if (!r.paused) { o.post({ type: 'readControl', action: 'pause' }); } return; }
                if (!wait.started) { clear(); dropIt(wait.key); wait.redo = true; }
            },
            /** The replay's ▶; true when an answer was waiting and goes on (the replay keeps waiting for it). */
            resume() {
                if (!wait) { return false; }
                wait.paused = false;
                if (wait.redo) { wait.redo = false; drop = null; ask(); return true; }
                const r = R().reading();
                if (ours(r) && r.paused) { o.post({ type: 'readControl', action: 'resume' }); }
                return true;
            },
            /** Every other way the replay stops or moves: the answer being read stops. */
            stop() {
                clear();
                if (!wait) { return; }
                if (ours(R().reading())) { o.post({ type: 'readControl', action: 'stop' }); } else if (!wait.started) { dropIt(wait.key); }
                wait = null;
            },
            /** The switch on the replay bar; none where nothing can be read. */
            html() {
                return R().can() ? `<button class="${on ? '' : 'secondary'}" id="rp-read" aria-pressed="${on}" title="${esc(this.title())}">${on ? '🔊' : '🔇'} ${esc(t('Read answers'))}</button>` : '';
            },
            title() {
                return on ? t('Answers are read aloud as the replay reaches them, and it waits for each. Press to replay in silence.')
                    : t('Read each agent answer aloud as the replay reaches it — the replay waits until it has been read.');
            },
            /** The switch redrawn in place. */
            paint(b) {
                if (!b) { return; }
                b.textContent = (on ? '🔊' : '🔇') + ' ' + t('Read answers');
                b.title = this.title();
                if (typeof b.setAttribute === 'function') { b.setAttribute('aria-pressed', String(on)); }
                if (b.classList) { b.classList[on ? 'remove' : 'add']('secondary'); }
            }
        };
    }

    window.AFReplayRead = { create, answer, NO_START_MS };
})();
