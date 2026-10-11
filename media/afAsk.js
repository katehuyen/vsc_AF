// Agent Farm — the page side of the question service (X-447), shipped to every page.
//
// A page on a phone gets its host's questions as `afAsk` messages: a note is a
// toast, a message with buttons / a pick / a typed answer is a bottom sheet,
// and the answer goes back as `afAskAnswer` — closing the sheet any other way
// answers "nothing", which is what dismissing the desktop's dialog returns.
// Inside VS Code the host asks through vscode.window and nothing arrives here.
(function () {
    'use strict';
    var LEVEL = { info: 'ⓘ', warn: '⚠', error: '✕' };
    var FILTER_FROM = 8;
    var TOAST_MS = 6000;

    function esc(s) {
        return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function host() { return typeof window.acquireVsCodeApi === 'function' ? window.acquireVsCodeApi() : null; }

    var toastTimer = null;
    function toast(q) {
        var el = document.getElementById('af-ask-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'af-ask-toast';
            el.setAttribute('role', 'status');
            // At the top: the bottom belongs to the tab bar and to a sheet that may be asking at the same time.
            el.style.cssText = 'position:fixed;left:10px;right:10px;top:10px;z-index:80;'
                + 'padding:10px 12px;border-radius:8px;font-size:13px;white-space:pre-wrap;word-break:break-word;'
                + 'background:var(--vscode-editorWidget-background,#333);border:1px solid var(--vscode-widget-border,#4444);'
                + 'box-shadow:0 2px 8px rgba(0,0,0,.35)';
            el.addEventListener('click', function () { el.remove(); });
            document.body.appendChild(el);
        }
        el.className = 'af-ask-toast ' + (q.level || 'info');
        el.textContent = (LEVEL[q.level] || LEVEL.info) + ' ' + String(q.message || '').replace(/^Agent Farm:\s*/, '')
            + (q.detail ? '\n' + q.detail : '');
        if (toastTimer) { clearTimeout(toastTimer); }
        toastTimer = setTimeout(function () { if (el.parentNode) { el.parentNode.removeChild(el); } }, TOAST_MS);
    }

    function sheet(q, title, body, wire) {
        var done = false;
        function reply(value) {
            if (done) { return; }
            done = true;
            var api = host();
            if (api) { api.postMessage({ type: 'afAskAnswer', id: q.id, value: value }); }
        }
        window.AFMobile.openSheet(title, body, function () { reply(undefined); });
        var box = document.getElementById('af-sheet');
        wire(box, function (value) { reply(value); window.AFMobile.closeSheet(); });
    }

    function message(q) {
        var body = '<pre class="af-sheet-t" style="padding:0;background:none;border:0">' + esc(q.message) + '</pre>'
            + (q.detail ? '<div class="af-sheet-sub" style="margin-top:8px">' + esc(q.detail) + '</div>' : '')
            + (q.buttons || []).map(function (b, i) {
                return '<button class="af-sheet-go af-ask-btn" data-afaskat="' + i + '">' + esc(b) + '</button>';
            }).join('')
            + '<button class="af-sheet-go af-ask-cancel" data-afaskno>Cancel</button>';
        sheet(q, (LEVEL[q.level] || LEVEL.info) + ' ' + (q.modal ? 'Confirm' : 'Agent Farm'), body, function (box, answer) {
            box.addEventListener('click', function (ev) {
                var b = ev.target && ev.target.closest ? ev.target.closest('[data-afaskat],[data-afaskno]') : null;
                if (!b) { return; }
                answer(b.hasAttribute('data-afaskno') ? undefined : Number(b.dataset.afaskat));
            });
        });
    }

    // A many-pick ticks rows on and off and answers with every ticked place on OK.
    function tick(on) { return '<span data-afasktick>' + (on ? '☑' : '☐') + '</span> '; }

    function pick(q) {
        var items = q.items || [];
        var rows = items.map(function (it, i) {
            return '<button class="af-sheet-go" data-afaskat="' + i + '" data-afasktext="' + esc((it.label + ' ' + (it.description || '') + ' ' + (it.detail || '')).toLowerCase()) + '"'
                + (q.many ? ' aria-pressed="' + (it.picked ? 'true' : 'false') + '">' + tick(it.picked) : '>')
                + esc(it.label) + (it.description ? ' <span class="af-sheet-sub">' + esc(it.description) + '</span>' : '')
                + (it.detail ? '<small>' + esc(it.detail) + '</small>' : '') + '</button>';
        }).join('');
        var filter = items.length > FILTER_FROM
            ? '<input class="af-ask-filter" data-afaskfilter type="search" placeholder="Filter…" style="width:100%;min-height:40px;margin-bottom:6px">' : '';
        var done = q.many ? '<button class="af-sheet-go af-ask-btn" data-afaskok>OK</button><button class="af-sheet-go af-ask-cancel" data-afaskno>Cancel</button>' : '';
        var body = (q.placeHolder ? '<div class="af-sheet-sub">' + esc(q.placeHolder) + '</div>' : '') + filter + rows + done;
        sheet(q, q.title || 'Choose', body, function (box, answer) {
            box.addEventListener('click', function (ev) {
                var b = ev.target && ev.target.closest ? ev.target.closest('[data-afaskat],[data-afaskok],[data-afaskno]') : null;
                if (!b) { return; }
                if (!q.many) { if (b.hasAttribute('data-afaskat')) { answer(Number(b.dataset.afaskat)); } return; }
                if (b.hasAttribute('data-afaskno')) { answer(undefined); return; }
                if (b.hasAttribute('data-afaskok')) {
                    answer([].slice.call(box.querySelectorAll('[data-afaskat][aria-pressed="true"]')).map(function (x) { return Number(x.dataset.afaskat); }));
                    return;
                }
                var on = b.getAttribute('aria-pressed') !== 'true';
                b.setAttribute('aria-pressed', on ? 'true' : 'false');
                b.querySelector('[data-afasktick]').textContent = on ? '☑' : '☐';
            });
            var f = box.querySelector('[data-afaskfilter]');
            if (f) {
                f.addEventListener('input', function () {
                    var t = f.value.trim().toLowerCase();
                    box.querySelectorAll('[data-afaskat]').forEach(function (b) {
                        b.style.display = !t || b.dataset.afasktext.indexOf(t) >= 0 ? '' : 'none';
                    });
                });
            }
        });
    }

    function input(q) {
        var body = (q.prompt ? '<div class="af-sheet-sub">' + esc(q.prompt) + '</div>' : '')
            + '<input data-afaskin type="' + (q.password ? 'password' : 'text') + '" value="' + esc(q.value || '') + '"'
            + ' placeholder="' + esc(q.placeHolder || '') + '" style="width:100%;min-height:40px;margin:6px 0">'
            + '<button class="af-sheet-go af-ask-btn" data-afaskok>OK</button>'
            + '<button class="af-sheet-go af-ask-cancel" data-afaskno>Cancel</button>';
        sheet(q, q.title || 'Agent Farm', body, function (box, answer) {
            var inp = box.querySelector('[data-afaskin]');
            box.addEventListener('click', function (ev) {
                var b = ev.target && ev.target.closest ? ev.target.closest('[data-afaskok],[data-afaskno]') : null;
                if (!b) { return; }
                answer(b.hasAttribute('data-afaskok') ? inp.value : undefined);
            });
            inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); answer(inp.value); } });
            if (inp.focus) { inp.focus(); }
        });
    }

    function onAsk(q) {
        if (!q || q.type !== 'afAsk') { return; }
        if (q.kind === 'note') { toast(q); return; }
        // a text the farm made (a corpus, an id) goes on the PHONE's clipboard; AFCtx says "Copied" here
        if (q.kind === 'copy') { if (window.AFCtx && window.AFCtx.copy) { window.AFCtx.copy(q.text); } return; }
        if (!window.AFMobile || !window.AFMobile.openSheet) { return; }
        if (q.kind === 'message') { message(q); } else if (q.kind === 'pick') { pick(q); } else if (q.kind === 'input') { input(q); }
    }

    if (typeof window.addEventListener === 'function') {
        window.addEventListener('message', function (ev) { onAsk(ev && ev.data); });
    }
    window.AFAsk = { onAsk: onAsk };
})();
