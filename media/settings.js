// Agent Farm — Farm Settings page: schema-driven editor for every agentFarm.*
// setting, with search, per-setting reset, and named setting sets.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    let filter = '';
    let changedOnly = false;       // U-224 — the Changed (n) chip
    let saveOpen = false;         // "Save current as…" inline input visibility
    const errors = {};             // key -> validation error from the host
    // A-25 — the installed-voice list costs a PowerShell process, so the card
    // asks for it ONCE per open page. The answer arrives as a redraw and a
    // redraw is where the ask lives, so without this the page would spawn a
    // shell per frame; the ↻ on the strip is the deliberate second ask.
    let speakVoicesAsked = false;
    // U-84 — what the last live `getMe` said, drawn inside the bridge card.
    // Held on the page rather than in DATA: it is an answer to a question this
    // reader asked, not a fact about the farm, and it does not survive a reload.
    let svcMsg = null;
    let customModelDir = ''; // the chip whose custom-model input is open
    /**
     * ‼️ U-108 — THE LIST BEING EDITED, and whether the user asked for the
     * raw JSON instead.
     *
     * Nine settings are a plain list of strings or numbers — root folders,
     * excluded folders, model names, chat ids, hosts. There is no JSON to
     * get right in ANY of them, and the page asked for it anyway: a
     * textarea, a pair of brackets, and a comma the user had to remember.
     *
     * The draft is the page's, not the store's, for the reason every draft
     * in this extension is: adding and removing a row must not save
     * anything, so a list half-edited and abandoned leaves the setting
     * exactly as it was. It is dropped on Apply, and the refresh that
     * follows redraws from what was really stored.
     */
    const listDraft = {};          // key -> the rows being edited
    let dragging = null;           // X-193 — { key, i } while a row is in hand
    /**
     * ‼️ U-109 — and the same draft for the two shapes whose FIELDS the
     * manifest declares: one object with named fields is a form, a list of
     * them is a table. Both hold the BOX TEXT rather than typed values, so a
     * half-typed number survives a redraw exactly as it was typed; the
     * conversion happens once, on save, where a refusal can be shown.
     */
    const formDraft = {};          // key -> { field: text } being edited
    const rowsDraft = {};          // key -> [ { field: text } ] being edited
    /** U-110 — the free-form maps: [ { k, v } ] in the order shown, because a
     *  pair being renamed must not jump around under the hand, and an object
     *  cannot hold two rows that are briefly called the same thing. */
    const mapDraft = {};           // key -> [ { k, v } ] being edited
    const jsonMode = {};           // key -> the user asked for the raw box
    /** U-142 — the raw text an Apply sent, held until the host says whether it
     *  parsed. A refusal puts both the box and the text back. */
    const jsonSent = {};           // key -> the text sent, while the host answers
    /**
     * ‼️ THE TEXT IN THE JSON BOX, whenever the page has a reason to keep it.
     *
     * A defect U-108 shipped and this is the fix: "Edit as JSON" read the rows
     * carefully into the draft and then drew the textarea from the STORED
     * value, so everything typed since the last save was silently replaced the
     * moment the user asked to see it as JSON — the opposite of what that link
     * promises. It is the same box in both directions, so it is one store:
     * entering JSON mode fills it from what was on screen, and a document that
     * REFUSES to parse stays in it, because a box that swallowed the broken
     * text is a box the user cannot fix.
     */
    const jsonDraft = {};          // key -> the text the box is showing
    // While the user is typing in a field, background refreshes must not wipe
    // the edit — hold the data and apply it when focus leaves (2.47.0 lesson).
    let editing = false;
    let pendingData = null;
    // U-219 — the raw settings.json Apply in flight: the file's text it was written over
    let ccRawSent = null;
    /** A raw Apply that changed the file hands the box back to the file; a failed write leaves the words to fix. */
    function ccRawLanded() {
        if (!ccRawSent) { return; }
        const now = DATA.claude ? String(DATA.claude.raw) : '';
        const ta = document.getElementById('ccraw');
        if (ta && now !== ccRawSent.was) { ta.value = ta.defaultValue; }
        ccRawSent = null;
    }

    function shortKey(k) { return k.replace(/^agentFarm\./, ''); }

    /** Every setting on the page, flat. Two controls ask "which item is this
     *  key?" and both used to walk the categories themselves. */
    function allItems() {
        return (DATA.categories || []).reduce((a, c) => a.concat(c.items || []), []);
    }

    function fmtDefault(v) {
        if (v === undefined) { return '(none)'; }
        try {
            const s = JSON.stringify(v);
            return s.length > 60 ? s.slice(0, 60) + '…' : s;
        } catch { return String(v); }
    }

    /** U-224 — a row's text with the query's hits marked; which rows are in, and in what order,
     *  is AFSettingResults.view's (the ranker settings.list q asks too). */
    const hit = s => (filter ? window.AFSettingSearch.mark(s, filter, C.esc) : C.esc(s));
    // U-224 — typing redraws #setbody only; the box under the hand is never replaced.
    const bodySoon = window.AFSettingResults.throttle(() => render(true), 120);

    /**
     * ‼️ U-143 — A WHOLE SECTION ANSWERS THE FILTER WITH THE PAGE'S OWN GRAMMAR.
     *
     * The sections that are not made of setting rows used to gate themselves on
     * `TERMS.includes(what you typed)` — the question backwards, and a different
     * question from the one every row above is asked. So `-wiki`, `a OR b`, a
     * quoted phrase and whole-word mode each hid the section instead of
     * filtering the page, and one of the two gates compared case-sensitively on
     * top: typing `Obsidian` hid the very section that word names. One grammar,
     * every box (media/afQuery.js) — a section is just another row to it.
     */
    function sectionMatches(text) {
        return !filter || window.AFQuery.compile(filter).test(text);
    }

    // U-225 — what the page's split-out parts read and call; DATA is read live, a refresh replaces it
    const X = {
        vscode, C, errors, listDraft, formDraft, rowsDraft, mapDraft, jsonMode, jsonDraft, jsonSent,
        shortKey, allItems, fmtDefault, hit, sectionMatches, bodySoon, ccRawLanded, render,
        // made after the parts load: a part reads these when it runs, never when it is made
        get draw() { return draw; }, get repaint() { return repaint; },
        get DATA() { return DATA; }, set DATA(v) { DATA = v; },
        get editing() { return editing; }, get pendingData() { return pendingData; }, set pendingData(v) { pendingData = v; },
        get saveOpen() { return saveOpen; }, set saveOpen(v) { saveOpen = v; },
        get svcMsg() { return svcMsg; }, set svcMsg(v) { svcMsg = v; },
        get filter() { return filter; }, set filter(v) { filter = v; },
        get changedOnly() { return changedOnly; }, set changedOnly(v) { changedOnly = v; },
        get dragging() { return dragging; }, set dragging(v) { dragging = v; },
        get customModelDir() { return customModelDir; }, set customModelDir(v) { customModelDir = v; },
        get ccRawSent() { return ccRawSent; }, set ccRawSent(v) { ccRawSent = v; }
    };
    // U-225 — the page's parts (media/afSetting*.js) in load order; each reads what the ones before it gave, through X
    ['AFSettingList', 'AFSettingFields', 'AFSettingForms', 'AFSettingMap', 'AFSettingItem', 'AFSettingFolders',
        'AFSettingClaude', 'AFSettingDocs', 'AFSettingWiki', 'AFSettingAccess', 'AFSettingSections', 'AFSettingPage', 'AFSettingWire',
        'AFSettingWireList', 'AFSettingWireShapes', 'AFSettingNav', 'AFSettingInbox'].forEach(p => Object.assign(X, window[p](X)));
    const { foldersSection, claudeSection, enginesSection, docOpenSection, sectionHtml, pageHtml,
        wirePage, wireAgents, wireProfiles, wireList, wireShapes, focusKey, ctxDo, onMessage } = X;

    /** `bodyOnly` (U-224): rewrite #setbody alone and skip every binding outside it — the
     *  header, the setting sets bar and the search box keep theirs, and the box keeps the caret. */
    function render(bodyOnly) {
        // ‼️ U-139 — THE PLACE ON THE PAGE SURVIVES THE REDRAW.
        //
        // render() replaces the whole of #app, and this page is the longest in
        // the extension. A reader two thirds of the way down who pressed
        // "+ add", "Edit as JSON" or ✕ was thrown back to the top, and what
        // they were looking at never came into view — so the control had
        // worked every single time and there was no way to see it. The bug
        // reported was "the link does nothing"; the link did everything.
        //
        // Read before the swap, written back after the wiring, because a
        // handler bound in between may move the page on purpose (focusKey).
        let keepY = 0;
        try { keepY = window.scrollY || (document.documentElement || {}).scrollTop || 0; }
        catch (e) { /* stub DOM */ }
        const R = window.AFSettingResults;
        const found = R.view(DATA.categories, filter, changedOnly);
        const cats = found.cats;
        const total = DATA.categories.reduce((a, c) => a + c.items.length, 0);
        const modified = DATA.categories.reduce((a, c) => a + c.items.filter(i => i.modified).length, 0);
        // Built once: the section decides for itself whether the filter leaves it
        // on screen, and the nav link must not offer to scroll to a heading that
        // is not there. None of the four is a changed setting, so Changed hides them.
        const docOpenHtml = changedOnly ? '' : docOpenSection();
        const foldersHtml = changedOnly ? '' : foldersSection();
        const claudeHtml = changedOnly ? '' : claudeSection();
        const enginesHtml = changedOnly ? '' : enginesSection();
        const asked = !!String(filter).trim() || changedOnly;

        const body = `${asked && found.count ? R.countHtml(found.count, C.esc) : ''}
            <div class="catnav">${enginesHtml ? '<a data-cat="engines">Engines</a>' : ''}${claudeHtml ? '<a data-cat="claude">Claude Code</a>' : ''}${foldersHtml ? '<a data-cat="folders">Agent folders</a>' : ''}${docOpenHtml ? '<a data-cat="docopen">Open with</a>' : ''}${cats.map(c => `<a data-sec="${c.id}">${C.esc(c.label)}</a>`).join('')}</div>
            ${enginesHtml}
            ${claudeHtml}
            ${foldersHtml}
            ${docOpenHtml}
            ${cats.map(c => `
                <h2 class="cat" id="sec-${c.id}">${C.esc(c.label)} <span class="muted small">${c.items.length}</span></h2>
                ${sectionHtml(c)}`).join('')
            || (claudeHtml || foldersHtml || docOpenHtml || enginesHtml ? '' : R.emptyHtml(filter, changedOnly, C.esc, found.error))}`;
        if (bodyOnly) { document.getElementById('setbody').innerHTML = body; }
        else { document.getElementById('app').innerHTML = pageHtml(R, total, modified, body); }

        // -- wiring --
        if (window.AFKapici) { window.AFKapici.wire(m => vscode.postMessage(m)); }
        /** U-139 — Enter releases a one-line box so its `change` handler runs.
         *  A multi-line box keeps Enter for its newline. Bound on the element
         *  the caller already has, never by a second query: two lookups of one
         *  selector are two different handler sets to keep straight. */
        const enterLetsGo = (el) => {
            if (!el || String(el.tagName || '').toUpperCase() === 'TEXTAREA') { return; }
            el.addEventListener('keydown', (e) => {
                if (e && e.key === 'Enter' && el.blur) { el.blur(); }
            });
        };
        wirePage(bodyOnly, enterLetsGo);
        wireList();
        wireShapes();

        wireAgents(enterLetsGo);

        // The setting sets bar and #app itself sit outside #setbody: a body-only redraw keeps their bindings.
        if (!bodyOnly) {
            wireProfiles();

            // hold background refreshes while a field has focus
            const app = document.getElementById('app');
            if (app.addEventListener) {
                app.addEventListener('focusin', ev => {
                    const t = ev.target;
                    // ‼️ U-143 — A `<select>` HOLDS THE REFRESH TOO. An open
                    // dropdown is a control the reader is in the middle of using,
                    // and a background push redraws #app underneath it: the list
                    // shuts and the choice is lost, with nothing on screen saying
                    // why. The guard named the two boxes and forgot the third
                    // control that can be open when the data arrives.
                    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) {
                        editing = true;
                    }
                });
                app.addEventListener('focusout', () => {
                    editing = false;
                    if (pendingData) { DATA = pendingData; pendingData = null; ccRawLanded(); draw(); }
                });
            }
        }

        // U-139 — see the top of render(): put the page back where the reader
        // left it. Skipped at 0, which is both the first draw and a reader who
        // was already at the top; writing it there would be a scroll nobody
        // needs on every push.
        if (keepY) {
            try { window.scrollTo(0, keepY); } catch (e) { /* stub DOM */ }
        }
    }

    // ‼️ ONCE, at module scope — render() rebinds every control on every change.
    window.AFCtx.listen(ctxDo);
    // U-224 — '/' or Ctrl+F reaches the search box from anywhere on the page; once, for the same reason.
    window.AFSettingResults.keys(document, () => document.getElementById('filter'));

    // ‼️ M-33 — A HOST PUSH WAITS FOR THE READER'S HANDS; THE PAGE'S OWN
    // RENDERS DO NOT. render() replaces the whole of #app, so a repaint that
    // arrives while somebody is typing detaches the box they are typing in and
    // the caret falls to <body> — where space IS Page Down. Full text, and
    // what a page-specific busy() is for: media/afRepaint.js.
    // ‼️ U-219 — the push, the focus-leaving redraw and a refused raw Apply carry what was
    // typed and not yet saved (the raw settings.json box above all); a landed Apply lets go.
    const draw = window.AFRepaint.keeping(render);
    const repaint = window.AFRepaint.guard(draw);
    window.addEventListener('message', onMessage);

    render();
    if (DATA.focus) { focusKey(DATA.focus); }
})();
