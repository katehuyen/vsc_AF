// Agent Farm — Farm Settings: what each message from the host does to the page.
// Split out of media/settings.js unchanged (U-225): the page hands its state in once, as X.
(function () {
    'use strict';
    let X, allItems, ccRawLanded, errors, focusKey, jsonDraft, jsonMode, jsonSent, listDraft, render;

    function onMessage(ev) {
        if (ev.data.type === 'data') {
            if (X.editing) { X.pendingData = { ...X.DATA, ...ev.data.data }; return; }
            X.DATA = { ...X.DATA, ...ev.data.data };
            ccRawLanded();
            // U-142 — the store answered, so nothing is waiting to be put back:
            // a refusal arrives as `error` and never as a redraw.
            for (const k of Object.keys(jsonSent)) { delete jsonSent[k]; }
            X.repaint();
            return;
        }
        if (ev.data.type === 'error') {
            errors[ev.data.key] = ev.data.error;
            // U-142 — a refused Apply goes back into the box it came from,
            // with the text that was refused still in it.
            if (jsonSent[ev.data.key] !== undefined) {
                jsonMode[ev.data.key] = true;
                jsonDraft[ev.data.key] = jsonSent[ev.data.key];
                delete jsonSent[ev.data.key];
            }
            render();
            focusKey(ev.data.key);
            return;
        }
        if (ev.data.type === 'ccError') {
            errors['cc:' + ev.data.id] = ev.data.error;
            if (ev.data.id === '__raw__') { X.ccRawSent = null; }
            X.draw();
            focusKey('cc:' + ev.data.id);
            return;
        }
        // ‼️ U-108 — the folder the user picked for ONE ROW of a list.
        // It goes into the draft and nothing is saved: the scalar Browse writes
        // straight through because the path IS the whole value, and a row is
        // not — the list around it is still being edited.
        if (ev.data.type === 'browsedRow') {
            const rows = listDraft[ev.data.key]
                || (allItems().find(i => i.key === ev.data.key) || {}).value || [];
            const list = Array.isArray(rows) ? rows.slice() : [];
            const i = Number(ev.data.index);
            if (i >= 0 && i < list.length) { list[i] = String(ev.data.path); }
            else { list.push(String(ev.data.path)); }
            listDraft[ev.data.key] = list.map(v => String(v));
            delete errors[ev.data.key];
            render();
            return;
        }
        // U-84 — the live getMe answer. Shown IN THE CARD rather than as a
        // notification: the question was asked here and the answer belongs
        // beside the badge it is about.
        if (ev.data.type === 'svc-verified') {
            X.svcMsg = window.AFTelegram.verifiedMessage(ev.data);
            render();
            return;
        }
        if (ev.data.type === 'focus') { focusKey(ev.data.key); }
    }

    window.AFSettingInbox = function (ctx) {
        X = ctx;
        ({ allItems, ccRawLanded, errors, focusKey, jsonDraft, jsonMode, jsonSent, listDraft, render } = ctx);
        return { onMessage };
    };
})();
