// Agent Farm — dictation into any text box, in the Android shell only (S-1), shipped to every page.
//
// When the shell says it can dictate (afShell.voice()), a focused text box gets a microphone button
// above the keyboard; a tap asks the shell (afVoice, token), the phone's speech recogniser hears the
// words, and afVoiceDone puts them at the caret and fires `input` as typing would. Inside VS Code or
// in a browser there is no afShell and nothing is drawn.
(function () {
    'use strict';
    function can() {
        try { return !!(window.afShell && typeof window.afShell.voice === 'function' && window.afShell.voice()); } catch (e) { return false; }
    }
    if (!can()) { window.AFVoice = { available: false }; return; }

    var btn = null, target = null, seq = 0, waiting = {};

    function api() { return typeof window.acquireVsCodeApi === 'function' ? window.acquireVsCodeApi() : null; }
    function isText(el) {
        if (!el || el.disabled || el.readOnly) { return false; }
        if (el.tagName === 'TEXTAREA') { return true; }
        return el.tagName === 'INPUT' && /^(text|search|)$/i.test(el.getAttribute('type') || '');
    }

    function button() {
        if (btn) { return btn; }
        btn = document.createElement('button');
        btn.id = 'af-voice';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Dictate');
        btn.textContent = '🎤';
        btn.style.cssText = 'position:fixed;right:12px;bottom:calc(var(--af-bottom,0px) + 12px);z-index:75;display:none;'
            + 'width:48px;height:48px;border-radius:24px;font-size:22px;line-height:1;padding:0;border:0;'
            + 'background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff);'
            + 'box-shadow:0 2px 8px rgba(0,0,0,.35)';
        // The press must not take focus from the box the words are for.
        btn.addEventListener('pointerdown', function (ev) { ev.preventDefault(); });
        btn.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
        btn.addEventListener('click', listen);
        document.body.appendChild(btn);
        return btn;
    }

    function show() { button().style.display = 'block'; }
    function hide() { if (btn && !btn.classList.contains('on')) { btn.style.display = 'none'; } }

    function listen() {
        var host = api();
        if (!target || !host) { return; }
        var token = 'v' + (++seq);
        waiting[token] = target;
        btn.classList.add('on');
        btn.style.opacity = '.6';
        host.postMessage({ type: 'afVoice', token: token });
    }

    function insert(el, text) {
        var v = el.value || '';
        var start = typeof el.selectionStart === 'number' ? el.selectionStart : v.length;
        var end = typeof el.selectionEnd === 'number' ? el.selectionEnd : start;
        var before = v.slice(0, start);
        var gap = before && !/\s$/.test(before) ? ' ' : '';
        el.value = before + gap + text + v.slice(end);
        var caret = (before + gap + text).length;
        try { el.setSelectionRange(caret, caret); } catch (e) { /* a search box on some engines */ }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        if (el.focus) { el.focus(); }
    }

    document.addEventListener('focusin', function (ev) { if (isText(ev.target)) { target = ev.target; show(); } });
    document.addEventListener('focusout', function () {
        setTimeout(function () { if (!isText(document.activeElement)) { hide(); } }, 150);
    });
    window.addEventListener('message', function (ev) {
        var d = ev && ev.data;
        if (!d || d.type !== 'afVoiceDone') { return; }
        var el = waiting[d.token];
        delete waiting[d.token];
        if (btn) { btn.classList.remove('on'); btn.style.opacity = ''; }
        if (el && typeof d.text === 'string' && d.text) { insert(el, d.text); }
        else if (d.error && window.AFAsk) { window.AFAsk.onAsk({ type: 'afAsk', kind: 'note', level: 'warn', message: d.error }); }
        if (!isText(document.activeElement)) { hide(); }
    });
    window.AFVoice = { available: true, insert: insert };
})();
