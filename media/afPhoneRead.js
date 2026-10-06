// AFPhoneRead — a page's 🔊 read by the PHONE it is open on (U-209), shipped to every page.
//
// Inside VS Code or a browser it turns nothing. On a phone whose shell cannot speak (no
// afShell.speaks()) the page draws no 🔊 at all (AFRead asks `mute`): its press could only be refused,
// since a phone never makes the PC speak.
//
// The page's own code stays as it is: media/afRemote.js hands every message the page posts to `out`.
//   readAloud → readFor, to the farm, under a token. The farm answers readText: the paragraphs exactly
//               as the PC would say them, in the text's own language, which go to the shell (afSpeak).
//   readControl, and this player's buttons → afSpeakControl, answered by the shell itself.
// What the shell says back (afSpeakState) becomes the page's own { type:'reading' } message, so every
// 🔊 paints ■ / ▶ from the phone's voice; the farm's `reading` (the PC's speakers) never reaches the page.
// While a reading lasts a small player sits over the tab bar — the header's player is not on a phone.
(function () {
    'use strict'; // i18n-exempt — a directive, not interface text
    var phone = !!(window.__AFUI__ && window.__AFUI__.remote === true);
    function speaks() {
        try { return !!(window.afShell && typeof window.afShell.speaks === 'function' && window.afShell.speaks()); } catch (e) { return false; }
    }
    var on = phone && speaks();
    window.AFPhoneRead = { on: on, mute: phone && !on, out: function (m) { return m; } };
    if (!on) { return; }

    var t = function (s, v) {
        return window.AFI18n ? window.AFI18n.t(s, v) : s.replace(/\{(\w+)\}/g, function (m, k) { return v && k in v ? String(v[k]) : m; });
    };
    var seq = 0, asked = '', plan = null, bar = null;

    function shell(m) { window.afShell.post(JSON.stringify(m)); }
    function control(action, rate) {
        var m = { type: 'afSpeakControl', action: action };
        if (typeof rate === 'number') { m.rate = rate; }
        return m;
    }
    /** A player button's act ('toggle', 'rate:3') as the shell's control. */
    function act(a) {
        var r = /^rate:(-?\d+)$/.exec(String(a || ''));
        return r ? control('rate', Number(r[1])) : control(String(a || ''));
    }

    /** A message the page posts, on its way out: a reading's becomes the phone's; anything else goes as it is. */
    function out(m) {
        if (!m || typeof m !== 'object') { return m; }
        if (m.type === 'readAloud') {
            asked = 'p' + (++seq);
            var o = { type: 'readFor', token: asked, pick: m.pick && typeof m.pick === 'object' ? m.pick : {} };
            if (m.sessionId) { o.sessionId = m.sessionId; }
            if (m.surface) { o.surface = m.surface; }
            return o;
        }
        if (m.type === 'readControl') { return control(String(m.action || '')); }
        if (m.type === 'afnav' && typeof m.to === 'string' && m.to.indexOf('reading:') === 0) { return act(m.to.slice(8)); }
        return m;
    }

    /** What every 🔊 paints from: the step being said now, as the PC's channel would name it. */
    function view() {
        if (!plan) { return null; }
        var i = Math.max(0, Math.min(plan.paragraph, plan.keys.length - 1));
        return { sessionId: plan.sessionId, key: plan.keys[i] || '', paused: plan.paused, head: plan.heads[i] || '' };
    }
    function tell() {
        var data = { type: 'reading', reading: view(), phone: true };
        try { window.dispatchEvent(new MessageEvent('message', { data: data })); } catch (e) { /* no MessageEvent here: nothing to paint */ }
    }

    function draw() {
        var P = window.AFReadingPlayer;
        if (!plan || !P || typeof P.html !== 'function') {
            if (bar && bar.parentNode) { bar.parentNode.removeChild(bar); }
            bar = null;
            return;
        }
        if (!bar) {
            if (!document.getElementById('af-rp-phone-style')) {
                var st = document.createElement('style');
                st.id = 'af-rp-phone-style';
                st.textContent = P.css + '\n.af-rp.af-rp-phone { left:8px; right:8px; top:auto; bottom:calc(var(--af-bottom, 0px) + 8px); max-width:none; }';
                (document.head || document.body).appendChild(st);
            }
            bar = document.createElement('div');
            bar.id = 'af-rp-phone';
            bar.className = 'af-rp af-rp-phone';
            bar.setAttribute('role', 'region');
            bar.setAttribute('aria-label', t('Reading aloud'));
            bar.addEventListener('click', function (ev) {
                var b = ev.target && ev.target.closest ? ev.target.closest('[data-afrp]') : null;
                if (!b) { return; }
                ev.stopPropagation();
                shell(act(b.getAttribute('data-afrp')));
            });
            document.body.appendChild(bar);
        }
        bar.innerHTML = P.html({
            head: plan.label || t('Reading aloud'),
            paragraph: plan.count > 1 ? t('Paragraph {n} of {m}', { n: plan.paragraph + 1, m: plan.count }) : '',
            paused: plan.paused, rate: plan.rate
        });
    }

    /** The farm's answers and the shell's word, ahead of the page's own listener. */
    function heard(ev) {
        var d = ev && ev.data;
        if (!d || typeof d !== 'object') { return; }
        if (d.type === 'reading' && d.phone !== true) { if (ev.stopImmediatePropagation) { ev.stopImmediatePropagation(); } return; }
        if (d.type === 'readText') {
            if (ev.stopImmediatePropagation) { ev.stopImmediatePropagation(); }
            // a press made since asked for something else
            if (d.token !== asked) { return; }
            var paras = Array.isArray(d.paragraphs) ? d.paragraphs : [];
            plan = {
                token: d.token, sessionId: d.sessionId || '', label: d.label || '',
                keys: Array.isArray(d.keys) ? d.keys : [], heads: Array.isArray(d.heads) ? d.heads : [],
                count: paras.length, paragraph: 0, paused: false, rate: typeof d.rate === 'number' ? d.rate : 0
            };
            shell({ type: 'afSpeak', token: d.token, paragraphs: paras, lang: d.lang || '', rate: plan.rate });
            return;
        }
        if (d.type === 'afSpeakState') {
            if (ev.stopImmediatePropagation) { ev.stopImmediatePropagation(); }
            // an older reading's last word
            if (!plan || d.token !== plan.token) { return; }
            if (d.state === 'idle') { plan = null; } else {
                plan.paragraph = Number(d.paragraph) || 0;
                plan.paused = d.state === 'paused';
                if (typeof d.rate === 'number') { plan.rate = d.rate; }
                if (typeof d.count === 'number' && d.count > 0) { plan.count = d.count; }
            }
            if (d.error && window.AFCtx && window.AFCtx.toast) { window.AFCtx.toast(String(d.error), true); }
            tell();
            draw();
        }
    }
    window.addEventListener('message', heard, true);

    window.AFPhoneRead = { on: true, mute: false, out: out, reading: view };
})();
