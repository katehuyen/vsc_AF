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
        vscode, C, errors, listDraft, formDraft, rowsDraft, mapDraft, jsonMode, jsonDraft,
        shortKey, allItems, fmtDefault, hit, sectionMatches, render,
        get DATA() { return DATA; }, get filter() { return filter; }, get saveOpen() { return saveOpen; },
        get svcMsg() { return svcMsg; }, get customModelDir() { return customModelDir; }
    };
    // the shape panel and the plain-list editor: media/afSettingList.js
    const { shapeHtml, exampleText, pathLine, readList, applyList, listHtml } = Object.assign(X, window.AFSettingList(X));

    // the field boxes: media/afSettingFields.js
    const { fieldBox, fieldText, readField, fieldTip, REST, cellsOf, formCells, rowsCells, parseBox, shapeFields } = Object.assign(X, window.AFSettingFields(X));

    // the form and table editors: media/afSettingForms.js
    const { readForm, readRows, looseEntry, boxText, applyForm, applyRows, formHtml, rowsHtml } = Object.assign(X, window.AFSettingForms(X));

    // the name → value pairs editor: media/afSettingMap.js
    const { mapField, readMap, applyMap, mapHtml, BACK } = Object.assign(X, window.AFSettingMap(X));

    // one setting row: media/afSettingItem.js
    const { itemHtml } = Object.assign(X, window.AFSettingItem(X));

    // the Agent folders section: media/afSettingFolders.js
    const { agentEngine, foldersSection } = Object.assign(X, window.AFSettingFolders(X));

    // the Claude Code and Engines sections and the setting sets bar: media/afSettingClaude.js
    const { claudeSection, enginesSection, profileBar } = Object.assign(X, window.AFSettingClaude(X));

    // the document-open and prompt snippets sections: media/afSettingDocs.js
    const { docOpenSection, promptsSection } = Object.assign(X, window.AFSettingDocs(X));

    // the Wiki, Sentry and Discipline sections: media/afSettingWiki.js
    const { sentrySection, disciplineSection, wikiSection } = Object.assign(X, window.AFSettingWiki(X));

    // the Superpowers, Access and Alerts sections: media/afSettingAccess.js
    const { superpowersSection, accessSection, alertsSection } = Object.assign(X, window.AFSettingAccess(X));

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
            <div class="catnav">${enginesHtml ? '<a data-cat="engines">Engines</a>' : ''}${claudeHtml ? '<a data-cat="claude">Claude Code</a>' : ''}${foldersHtml ? '<a data-cat="folders">Agent folders</a>' : ''}${docOpenHtml ? '<a data-cat="docopen">Open with</a>' : ''}${cats.map(c => `<a data-cat="${c.id}">${C.esc(c.label)}</a>`).join('')}</div>
            ${enginesHtml}
            ${claudeHtml}
            ${foldersHtml}
            ${docOpenHtml}
            ${cats.map(c => `
                <h2 class="cat" id="cat-${c.id}">${C.esc(c.label)} <span class="muted small">${c.items.length}</span></h2>
                ${c.id === 'prompts' ? promptsSection(c)
                    : c.id === 'wiki' ? wikiSection(c)
                        : c.id === 'superpowers' ? superpowersSection(c)
                            : c.id === 'live' ? alertsSection(c)
                                : c.id === 'access' ? accessSection(c)
                                    : c.id === 'sentry' ? sentrySection(c)
                                        : c.id === 'discipline' ? disciplineSection(c)
                                        : c.id === 'kapici' && window.AFKapici ? window.AFKapici.section(DATA.kapici, C) + c.items.map(itemHtml).join('')
                                        : c.id === 'flow' ? window.AFFlexSettings.html(DATA.flex, C, errors.flex)
                                            : c.items.map(itemHtml).join('')}`).join('')
            || (claudeHtml || foldersHtml || docOpenHtml || enginesHtml ? '' : R.emptyHtml(filter, changedOnly, C.esc, found.error))}`;
        if (bodyOnly) { document.getElementById('setbody').innerHTML = body; }
        else { document.getElementById('app').innerHTML = `
            <style>
                .profbar { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:10px 0;
                    padding:8px 10px; border:1px solid var(--vscode-panel-border); border-radius:6px; }
                .catnav { display:flex; gap:6px; flex-wrap:wrap; margin:8px 0 14px;
                    position:sticky; top:0; z-index:10; padding:6px 0;
                    background:var(--vscode-editor-background, var(--vscode-sideBar-background)); }
                .catnav a { font-size:11px; padding:2px 10px; border-radius:10px; cursor:pointer;
                    border:1px solid var(--vscode-widget-border, #4444); color:var(--vscode-foreground);
                    text-decoration:none; opacity:.8; }
                .catnav a:hover { opacity:1; }
                h2.cat { margin:22px 0 4px; }
                .setplace { font-size:11px; color:var(--vscode-descriptionForeground); margin-bottom:2px; }
                .setcount { font-size:12px; color:var(--vscode-descriptionForeground); margin:2px 0 6px; }
                .setempty { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin:16px 0; }
                .setchip.on { background:var(--vscode-button-background); color:var(--vscode-button-foreground);
                    border-color:var(--vscode-button-background); }
                .setitem { padding:10px 12px; margin:6px 0; border-radius:5px;
                    border:1px solid var(--vscode-widget-border, #3333); }
                .setitem.modified { border-left:3px solid var(--vscode-textLink-foreground); }
                .sethead { display:flex; gap:8px; align-items:center; }
                .setname { font-weight:600; font-family:var(--vscode-editor-font-family); font-size:12px; }
                .moddot { width:7px; height:7px; border-radius:50%; background:var(--vscode-textLink-foreground); }
                .reset { font-size:11px; padding:0 6px; cursor:pointer; border-radius:3px; opacity:.7;
                    background:transparent; border:1px solid var(--vscode-widget-border, #4444);
                    color:var(--vscode-foreground); }
                .reset:hover { opacity:1; }
                .setdesc { font-size:11px; color:var(--vscode-descriptionForeground); margin:3px 0 6px; max-width:720px; }
                .setctl button.small { font-size:10px; margin-top:4px; }
                /* U-89 — the row under a JSON box: Apply, then what the schema
                   says goes in it, then the button that writes a valid one. The
                   summary is a CHIP and not a hover, because whether the reader
                   opens anything at all is decided by that one line. */
                .setjrow { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
                /* ‼️ U-108 — one row per entry, and the row is read left to
                   right: the value, the picker that fills it, the ✕ that drops
                   it. The box takes every pixel the two buttons do not need —
                   flex:1 with min-width:0, because an input in a flex row
                   otherwise keeps its default width and squeezes the row. */
                .setlist { display:flex; flex-direction:column; gap:5px; }
                .setlrow { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
                .setlrow input, .setlrow select { flex:1 1 auto; min-width:0; }
                /* X-193 — the order is the value, so the row can be picked up. */
                .setlgrip { cursor:grab; opacity:calc(1 - .55 * var(--af-dimk, 1)); font-size:12px; user-select:none; flex:0 0 auto; }
                .setlrow:hover .setlgrip { opacity:.85; }
                .setlrow.dragging { opacity:.5; }
                .setlrow button[disabled] { opacity:.35; cursor:default; }
                /* Where a path actually points — a whole row of its own, because
                   it is as long as a path and must not squeeze the box. */
                .setpath { flex:1 0 100%; font-size:11px; font-family:var(--vscode-editor-font-family);
                    color:var(--vscode-descriptionForeground); opacity:.9;
                    overflow-wrap:anywhere; margin:1px 0 0 18px; }
                .setpath.bad { color:var(--af-ink-editorWarning-foreground, var(--vscode-editorWarning-foreground, var(--vscode-errorForeground))); opacity:1; }
                .setgroup { margin:14px 0 0; padding-left:10px;
                    border-left:2px solid var(--vscode-widget-border, #3333); }
                .setgrouph { margin:0 0 2px; font-size:12px; letter-spacing:.02em; }
                .setgroupwhy { font-size:11px; color:var(--vscode-descriptionForeground);
                    margin:0 0 6px; max-width:760px; }
                .afq-sample { font-size:12px; margin:0 0 6px; padding:3px 8px; display:inline-block;
                    border:1px dashed var(--vscode-widget-border, #4444); border-radius:4px; }
                .pathvars { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:6px 0 2px; }
                .pathvar { font-size:11px; padding:1px 6px; border-radius:9px; cursor:help;
                    border:1px solid var(--vscode-widget-border, #4444);
                    font-family:var(--vscode-editor-font-family); }
                /* A variable with nothing behind it cancels any path that uses
                   it — the one case worth marking, so it is marked. */
                .pathvar.empty { opacity:calc(1 - .5 * var(--af-dimk, 1)); border-style:dashed; }
                /* X-308 — a value nobody typed: it works, but it was DERIVED
                   (the vault Obsidian has open) and can change under the user,
                   which the solid chip beside it would not say. */
                .pathvar.derived { border-style:dotted;
                    color:var(--af-ink-charts-blue, var(--vscode-charts-blue,#3794ff)); }
                .setljson { font-size:11px; opacity:.85; }
                /* U-110 — a pair reads left to right: the name, the arrow that
                   says which way it points, the value, the ✕. The name box is
                   the wider of the two: an agent folder is long and a budget is
                   three digits. */
                .setmrow { display:flex; align-items:center; gap:6px; max-width:760px; }
                .setmrow input:first-of-type { flex:2 1 0; min-width:0; }
                .setmrow > input:last-of-type, .setmrow > select { flex:1 1 0; min-width:0; }
                .setmarrow { color:var(--vscode-descriptionForeground); font-size:11px; }
                /* ‼️ U-109 — the form and the table. The form is read once and
                   carefully, so every field keeps its own sentence beside it;
                   the table is read across, so the sentence lives on the column
                   header instead (docs/CONVENTIONS.md — a column is defined
                   once, on its <th>) and the cells stay narrow enough to see
                   six of them at a time. */
                .setform { display:flex; flex-direction:column; gap:4px; max-width:860px; }
                .setfrow { display:flex; align-items:center; gap:8px; }
                .setfname { font-family:var(--vscode-editor-font-family); font-size:11px;
                    cursor:help; border-bottom:1px dotted var(--vscode-widget-border, #4444); }
                /* ‼️ S-80 — THE BASIS BELONGS TO THE FLEX CHILD, and the flex
                   child is the AFTip WRAPPER, not the name inside it: the
                   width was set on the span one level down, so a long field
                   name pushed its own box right and the form's boxes never
                   lined up. Invisible while every box was 170px of the same
                   grey; a ladder of long-text boxes draws it immediately. */
                .setform .setfrow > .tip-field { flex:0 0 168px; min-width:0; }
                .setfrow input, .setfrow select { flex:0 0 170px; min-width:0; }
                /* S-80 — a row holding a long-text field is a COLUMN, not a
                   row: the box takes the width it needs and the sentence about
                   it moves underneath, aligned to the box rather than to the
                   label, so the form still reads as one ladder. */
                .setfrow:has(textarea) { align-items:flex-start; flex-wrap:wrap; }
                .setfrow textarea { flex:1 1 320px; min-width:0; resize:vertical;
                    font-family:inherit; font-size:12px; line-height:1.45; }
                .setfrow:has(textarea) .setfdescw { flex:1 0 100%; margin-left:176px; }
                /* X-196 — the WRAPPER is the flex child now (the panel lives on
                   it), so it takes the sizing; the line inside it still has to
                   be a block or text-overflow has nothing to clip. */
                .setfdescw { flex:1 1 auto; min-width:0; }
                .setfdesc { font-size:10px; color:var(--vscode-descriptionForeground);
                    display:block; flex:1 1 auto; min-width:0;
                    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                .req { color:var(--af-ink-errorForeground, var(--vscode-errorForeground)); font-weight:600; }
                .setrows { display:flex; flex-direction:column; gap:6px; }
                .settbl { border-collapse:collapse; font-size:11px; width:100%; table-layout:fixed; }
                .settbl th { text-align:left; padding:2px 6px 4px 0; font-weight:600;
                    color:var(--vscode-descriptionForeground); }
                .setth { cursor:help; border-bottom:1px dotted var(--vscode-widget-border, #4444); }
                .settbl td { padding:2px 6px 2px 0; vertical-align:middle; }
                /* The ✕ column carries one button and must not take an equal
                   share of a fixed layout. */
                .settbl th.setthx, .settbl td:last-child { width:30px; padding-right:0; }
                .settbl input, .settbl select { width:100%; box-sizing:border-box; }
                .setshape {
                    font-size:10px; padding:1px 7px; border-radius:9px; cursor:help;
                    border:1px solid var(--vscode-widget-border, #4444);
                    color:var(--vscode-descriptionForeground);
                }
                .seterr { font-size:11px; color:var(--af-ink-errorForeground, var(--vscode-errorForeground)); margin-top:4px; }
                .setinforce { font-size:11px; color:var(--af-ink-editorWarning-foreground, var(--vscode-editorWarning-foreground)); margin-top:4px; }
                .setitem.flash { outline:2px solid var(--vscode-textLink-foreground); outline-offset:2px; }
                .rootbadge { font-size:10px; padding:1px 8px; border-radius:8px; white-space:nowrap;
                    background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
                .rootbadge.warn { background:var(--vscode-inputValidation-warningBackground, #664d00);
                    color:var(--vscode-foreground); }
                .aglist { display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; }
                /* U-29 — which engine the per-agent boxes below are editing. */
                .agtabs { display:flex; gap:5px; align-items:center; flex-wrap:wrap; margin:8px 0 2px; }
                .agtab { font-size:10px; padding:1px 8px; border-radius:9px; cursor:pointer;
                    background:transparent; color:var(--vscode-foreground); opacity:.6;
                    border:1px solid var(--vscode-widget-border,#4444); }
                .agtab:hover { opacity:.9; }
                .agtab.on { opacity:1; border-color:var(--vscode-focusBorder,#007fd4); }
                .agchip { font-size:11px; padding:2px 10px; border-radius:10px; white-space:nowrap;
                    border:1px solid var(--vscode-widget-border, #4444); }
                .agchip a { cursor:pointer; }
                .agchip .agex, .agchip.agexcl a { margin-left:6px; font-size:10px; opacity:.75; }
                .agchip .agex:hover, .agchip.agexcl a:hover { opacity:1; }
                .agchip.agexcl { opacity:.55; text-decoration:line-through; }
                .agchip.agexcl a { text-decoration:none; }
                /* ‼️ audit B-04.1 — THE CEILING WAS UNDER THE VALUE IT HAD TO HOLD.
                   Measured on the OpenCode scene, whose whole reason for existing
                   is that a model id there is a sentence: the box was pinned to
                   150px, "opencode/nemotron-3.5-lightning-free" needs 173px, and
                   the row it sits in had 1,106px of unused width to its right. So
                   the reader saw "opencode/nemotron-3.5-lig" and the only way to
                   tell it from the next id was hover — the same defect this audit
                   already called one in B-02.4. The ceiling stays (one pathological
                   id may not eat the row) and is raised to where a real id fits. */
                .agchip .agmodel { font-size:10px; margin-left:6px; padding:0 2px; max-width:300px; }
                .agchip .agcustom { width:200px; max-width:200px; padding:1px 4px; }
                .promptlist { margin-top:10px; border:1px solid var(--vscode-widget-border, #3333);
                    border-radius:5px; max-height:340px; overflow:auto; }
                .promptgrp { font-size:10px; text-transform:uppercase; letter-spacing:.5px; opacity:.55;
                    padding:7px 10px 2px; }
                .promptrow { display:flex; gap:10px; align-items:baseline; padding:4px 10px;
                    border-top:1px solid var(--vscode-widget-border, #2222); }
                .promptrow:first-child { border-top:none; }
                .promptlbl { font-size:12px; flex:0 0 200px; max-width:200px; overflow:hidden;
                    text-overflow:ellipsis; white-space:nowrap; }
                .promptprev { font-size:10px; opacity:.6; flex:1 1 auto; overflow:hidden;
                    text-overflow:ellipsis; white-space:nowrap; }
                .promptline { font-size:10px; opacity:.45; flex:none; }
                /* engines — the row is read left to right: who, how paid for,
                   what to do. The rule on the left is the state, not decoration. */
                .setitem.eng { border-left:3px solid var(--vscode-widget-border, #4444); }
                .setitem.eng-ok { border-left-color:var(--vscode-charts-green, #3fb950); }
                .setitem.eng-warn { border-left-color:var(--vscode-charts-yellow, #d7ba7d); }
                .setitem.eng-off { border-left-color:var(--vscode-descriptionForeground, #888); opacity:.75; }
                .engbadge { font-size:10px; padding:1px 8px; border-radius:9px; white-space:nowrap; cursor:help;
                    border:1px solid var(--vscode-widget-border, #4446); }
                .engbadge.b-ok { background:var(--af-ink-charts-green, var(--vscode-charts-green, #3fb950)); color:#fff; border-color:transparent; }
                .engbadge.b-warn { background:var(--vscode-charts-yellow, #d7ba7d); color:var(--af-on-charts-yellow, #000); border-color:transparent; }
                .engnext { font-size:12px; margin-top:4px; max-width:760px; }
                .engdetail { margin-top:2px; }
                /* wiki — the three files a compile needs, read as a checklist:
                   the mark says whether it is there, the rel path says what it
                   is, and the full path is what you would go and look at. */
                .wikifiles { margin:6px 0 4px; }
                .wikifile { display:flex; gap:8px; align-items:baseline; font-size:11px; padding:1px 0; }
                .wikimark { flex:none; width:12px; text-align:center; font-weight:600; }
                .wikimark.ok { color:var(--af-ink-charts-green, var(--vscode-charts-green, #3fb950)); }
                .wikimark.no { color:var(--af-ink-charts-red, var(--vscode-charts-red, #f85149)); }
                .wikirel { flex:0 0 210px; font-family:var(--vscode-editor-font-family); }
                .wikipath { flex:1 1 auto; opacity:.5; overflow:hidden; text-overflow:ellipsis;
                    white-space:nowrap; font-family:var(--vscode-editor-font-family); }
                /* superpowers — one row per discovered agent. A row that was
                   never written down is dimmed: it is ticked because the
                   built-in list says so, not because anybody chose it. */
                .spgrid { display:flex; flex-wrap:wrap; gap:4px 14px; margin:4px 0 8px; }
                .sprow { display:flex; gap:6px; align-items:baseline; font-size:11px;
                    padding:2px 8px 2px 4px; border-radius:4px; cursor:pointer;
                    border:1px solid var(--vscode-widget-border, #3333); }
                .sprow:hover { border-color:var(--vscode-focusBorder, #007fd4); }
                .sprow input { margin:0; }
                .spname { font-family:var(--vscode-editor-font-family); }
                .spstate { font-size:10px; opacity:.5; }
                .sprow.spdef .spname { opacity:.7; }
                ${window.AFTelegram.css()}
                ${window.AFFlexSettings.css()}
                html.af-phone .setfrow { flex-wrap:wrap; }
                html.af-phone .setform .setfrow > .tip-field, html.af-phone .setfdescw { flex:1 1 100%; }
                html.af-phone .setfrow > input, html.af-phone .setfrow > select { flex:1 1 100%; }
                html.af-phone .setfrow:has(textarea) .setfdescw { margin-left:0; }
                html.af-phone .agchip { white-space:normal; display:flex; flex-wrap:wrap; align-items:center; gap:4px; max-width:100%; }
                html.af-phone .agchip .agmodel { margin-left:0; max-width:100%; }
                html.af-phone [data-browse], html.af-phone [data-lbrowse], html.af-phone #rootadd, html.af-phone [data-rootreveal],
                html.af-phone #ccopen, html.af-phone #ccrawbox, html.af-phone #profexport, html.af-phone #profimport,
                html.af-phone #opensettingsjson, html.af-phone [data-engcmd], html.af-phone [data-engkey],
                html.af-phone [data-engdocs], html.af-phone #openengines, html.af-phone #openaccounts,
                html.af-phone #promptspick, html.af-phone #promptsopen, html.af-phone #wikireveal,
                html.af-phone #wikiopen, html.af-phone #spreveal { display:none; }
            </style>
            ${window.AFHeader.html({
                page: 'settings',
                title: 'Farm Settings',
                version: true,
                sub: `Every <code>agentFarm.*</code> setting — schema-driven, so new settings appear here automatically. ${total} setting${total === 1 ? '' : 's'} · ${modified} changed from default. Changes save immediately to your user settings.`,
                // ‼️ U-139 — THE FILE ITSELF, from the page that writes it.
                // Every box here is a view of one document, and a reader who
                // wants to see what was really written, paste a block in, or
                // repair something this page refuses had no way to it except
                // the command palette. It is the same file the ↺ buttons
                // remove keys from.
                actions: `<button class="secondary" id="opensettingsjson"
                    title="Open your user settings.json — the file every box on this page writes into. Changed values appear there as agentFarm.* keys; a value the schema cannot describe can be written by hand.">settings.json</button>`,
                guide: 'dashboard'
            })}
            ${profileBar()}
            <div class="searchbar" style="margin:10px 0; position:relative; display:flex; gap:8px; align-items:center; flex-wrap:wrap">
                <input id="filter" type="text" placeholder="Filter settings… (name or description)" value="${C.esc(filter)}" style="width:100%; max-width:420px; padding:6px 8px"
                    title="${C.esc(window.AFQuery.tip('Searched against each setting\'s name, the words people use for it, its key, its section, its options and its description; the best match comes first. / or Ctrl+F comes back here.'))}">
                ${R.chipHtml(modified, changedOnly, C.esc)}
            </div>
            <div id="setbody">${body}</div>
        `; }

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
        if (!bodyOnly) { window.AFHeader.wire(vscode); }
        // X-456 — the phone's own reach and port: shown on a phone, changed on the PC (settingsPhone.ts).
        (DATA.phoneLocked || []).forEach(k => ['data-set', 'data-reset'].forEach(a =>
            document.querySelectorAll(`[${a}="${k}"]`).forEach(el => { el.disabled = true; })));
        const openJson = !bodyOnly && document.getElementById('opensettingsjson');
        if (openJson) {
            openJson.addEventListener('click', () => vscode.postMessage({ type: 'openSettingsJson' }));
        }
        // U-84 — the bridge card's own controls, wired by the component that
        // drew them. Safe on a draw that has no card: every lookup finds nothing.
        window.AFTelegram.wire(m => vscode.postMessage(m));
        // U-152 — the Flow & Content card; a new attempt clears the last refusal.
        window.AFFlexSettings.wire(m => { delete errors.flex; vscode.postMessage(m); });
        const dcMode = document.getElementById('docopenmode');
        if (dcMode) { dcMode.addEventListener('change', () => vscode.postMessage({ type: 'docOpenSet', field: 'defaultMode', value: dcMode.value })); }
        const dcCmd = document.getElementById('docopencmd');
        if (dcCmd) { dcCmd.addEventListener('change', () => vscode.postMessage({ type: 'docOpenSet', field: 'customCommand', value: dcCmd.value })); }
        const dcArgs = document.getElementById('docopenargs');
        if (dcArgs) { dcArgs.addEventListener('change', () => vscode.postMessage({ type: 'docOpenSet', field: 'customArgs', value: dcArgs.value })); }
        // U-139 — the two "Open with" boxes are one-line settings like any
        // other; see enterLetsGo above for why blur is the mechanism.
        enterLetsGo(dcCmd);
        enterLetsGo(dcArgs);
        // Saved prompts — the same three gestures the Console picker offers, so
        // whichever door you came in by, the buttons mean the same thing.
        const onClick = (id, type) => {
            const el = document.getElementById(id);
            if (el) { el.addEventListener('click', () => vscode.postMessage({ type })); }
        };
        // Engines — three gestures, and the host owns all three: a terminal it
        // opens, the vault form it already has, and a link. Nothing about a
        // credential is decided on this page.
        //
        // ‼️ ONE GESTURE, NOT TWO. Install and Sign in do exactly the same
        // thing — write a command into a terminal without running it — so they
        // are one binding carrying whichever command the row offered. It was
        // called `engineLogin` while it already wrote something that was not a
        // login; a handler whose name is a lie is the next reader's bug.
        document.querySelectorAll('[data-engcmd]').forEach(b =>
            b.addEventListener('click', () =>
                vscode.postMessage({ type: 'engineCommand', command: b.dataset.engcmd })));
        document.querySelectorAll('[data-engkey]').forEach(b =>
            b.addEventListener('click', () =>
                vscode.postMessage({ type: 'engineKey', name: b.dataset.engkey })));
        document.querySelectorAll('[data-engdocs]').forEach(b =>
            b.addEventListener('click', () =>
                vscode.postMessage({ type: 'engineDocs', url: b.dataset.engdocs })));
        onClick('openengines', 'openEngines');
        onClick('openaccounts', 'openAccounts');
        onClick('promptspick', 'promptsPick');
        onClick('promptsopen', 'promptsOpen');
        onClick('promptsreload', 'promptsReload');
        onClick('promptsdefault', 'promptsUseDefault');
        // X-57 — the wiki root. Choosing the folder is the ordinary Browse…
        // binding below (the setting declares itself a folder in the schema);
        // these four are the acts a text box cannot do.
        onClick('wikiinit', 'wikiInit');
        onClick('wikirescan', 'wikiRescan');
        onClick('wikireveal', 'wikiReveal');
        onClick('wikiopen', 'wikiOpen');
        // X-136 — the folder gestures, and the per-agent default. The box
        // writes ONE agent's row; the host normalises the key onto whatever
        // spelling is already in the setting, so ticking `Developer` beside an
        // existing `developer` cannot leave two rows for one agent.
        onClick('sprescan', 'spRescan');
        onClick('spreveal', 'spReveal');
        document.querySelectorAll('[data-spagent]').forEach(el =>
            el.addEventListener('change', () => vscode.postMessage({
                type: 'spDefault', agent: el.dataset.spagent, on: el.checked
            })));
        const filterEl = !bodyOnly && document.getElementById('filter');
        if (filterEl) {
            filterEl.addEventListener('input', () => {
                // the box is a QUERY, not a substring — media/afQuery.js. Kept as
                // typed: the grammar decides its own case handling.
                filter = filterEl.value;
                // ‼️ U-143/U-224 — the box is never rebuilt while it is typed in, so the
                // caret stays wherever the reader put it: only #setbody is redrawn.
                bodySoon();
            });
            filterEl.addEventListener('keydown', ev => {
                if (ev.key === 'ArrowDown') {
                    const first = window.AFSettingResults.firstControl(document);
                    if (first) { ev.preventDefault(); first.focus(); }
                    return;
                }
                if (ev.key !== 'Escape' || !filterEl.value) { return; }
                ev.preventDefault();
                filterEl.value = '';
                filterEl.dispatchEvent(new Event('input', { bubbles: true }));
            });
            window.AFFilter.clearable(filterEl);
            // the wrapper takes the box's place, so it takes the box's width too
            const clrWrap = filterEl.parentNode;
            if (clrWrap && clrWrap.className === 'af-clr') {
                clrWrap.style.width = '100%';
                clrWrap.style.maxWidth = '420px';
            }
        }
        const chip = !bodyOnly && document.getElementById('setchanged');
        if (chip) {
            chip.addEventListener('click', () => {
                changedOnly = !changedOnly;
                render();
                const again = document.getElementById('setchanged');
                if (again) { again.focus(); }
            });
        }
        const showAll = document.getElementById('setclear');
        if (showAll) {
            showAll.addEventListener('click', () => {
                filter = '';
                changedOnly = false;
                render();
                const box = document.getElementById('filter');
                if (box) { box.focus(); }
            });
        }
        document.querySelectorAll('.catnav a').forEach(a =>
            a.addEventListener('click', () => {
                const h = document.getElementById('cat-' + a.dataset.cat);
                if (h && h.scrollIntoView) { h.scrollIntoView({ behavior: 'smooth' }); }
            }));
        document.querySelectorAll('[data-guide]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'openGuide', anchor: el.dataset.guide })));

        document.querySelectorAll('[data-set]').forEach(el => {
            el.addEventListener('change', () => {
                delete errors[el.dataset.set];
                const value = el.type === 'checkbox' ? el.checked : el.value;
                vscode.postMessage({ type: 'set', key: el.dataset.set, value });
            });
            enterLetsGo(el);
        });
        /**
         * ‼️ U-139 — ENTER LETS GO OF A SCALAR BOX, WHICH IS HOW IT SAVES.
         *
         * A one-line setting saves on `change`, and `change` fires on blur — so
         * a reader who typed a value and pressed Enter watched nothing happen
         * and had to click elsewhere to commit it. Blur is deliberately the
         * mechanism rather than a second postMessage: the page HOLDS a
         * background refresh while a field has focus (the `focusin`/`focusout`
         * guard below), so an Enter that kept focus would write the value and
         * leave the old one on screen. The alert-sound rows, the quiet hours
         * and the announcement template already do exactly this; these are the
         * boxes that were missed.
         */
        /**
         * ‼️ U-108 — THE LIST EDITOR. Every one of these reads the boxes
         * FIRST (`readList`), because a redraw throws away a row that has
         * been typed into and not yet committed — type a path, press + on
         * the row above, and without this the path is gone.
         *
         * Nothing here saves except `Save the list`. Adding and removing
         * act on the draft, so a list half-edited and abandoned leaves the
         * setting exactly as it was.
         */
        document.querySelectorAll('[data-lrow]').forEach(el =>
            el.addEventListener('change', () => readList(el.dataset.lrow)));
        /**
         * ‼️ U-139 — ENTER SAVES THE EDITOR THE BOX BELONGS TO, all four
         * shapes, from one rule.
         *
         * `change` fires on blur and only fills the draft, so a reader who
         * typed an entry and pressed Enter — the one key a single-line box is
         * expected to answer — got nothing at all, and read the whole page as
         * dead. It is the same defect in the list, the form, the table and the
         * pair editor, so it is fixed once: a box carries the attribute that
         * names its editor, and the attribute names the save.
         *
         * Each `apply*` reads the boxes itself, so the value being typed right
         * now is the value that is saved — `change` has not fired yet.
         */
        [['lrow', applyList], ['frow', applyForm], ['rrow', applyRows], ['mrow', applyMap]]
            .forEach(([attr, save]) => {
                document.querySelectorAll(`[data-${attr}]`).forEach(el =>
                    el.addEventListener('keydown', (e) => {
                        if (!e || e.key !== 'Enter') { return; }
                        // A multi-line box keeps Enter: there, it is a newline
                        // and never a save.
                        if (String(el.tagName || '').toUpperCase() === 'TEXTAREA') { return; }
                        if (e.preventDefault) { e.preventDefault(); }
                        save(el.dataset[attr]);
                    }));
            });
        document.querySelectorAll('[data-ladd]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.ladd;
                const at = readList(key).length;
                listDraft[key].push('');
                render();
                // U-139 — the row that was just made is where the hand is
                // going, and a caret already in it is one fewer aim with a
                // mouse. It also proves the press landed, which is the
                // complaint this item is made of.
                const box = document.getElementById('l-' + shortKey(key) + '-' + at);
                if (box && box.focus) { try { box.focus(); } catch (e) { /* stub DOM */ } }
            }));
        document.querySelectorAll('[data-ldel]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.ldel;
                const i = Number(btn.dataset.li);
                const rows = readList(key);
                if (i >= 0 && i < rows.length) { rows.splice(i, 1); }
                render();
            }));
        /**
         * ‼️ X-193 — MOVING A ROW IS EDITING THE VALUE, not decorating the page.
         * `readList` first for U-108's reason: a row typed into and not yet
         * committed lives only in the DOM, and reordering around it would throw
         * the typing away. Both gestures land here so there is one move, not two.
         */
        const moveRow = (key, from, to) => {
            const rows = readList(key);
            if (from < 0 || from >= rows.length || to < 0 || to >= rows.length || from === to) { return; }
            rows.splice(to, 0, rows.splice(from, 1)[0]);
            render();
        };
        document.querySelectorAll('[data-lmove]').forEach(btn =>
            btn.addEventListener('click', () => {
                const i = Number(btn.dataset.li);
                moveRow(btn.dataset.lmove, i, i + Number(btn.dataset.ldir));
            }));
        document.querySelectorAll('[data-ldrag]').forEach(row => {
            row.addEventListener('dragstart', (e) => {
                dragging = { key: row.dataset.ldrag, i: Number(row.dataset.li) };
                if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; }
                row.classList.add('dragging');
            });
            row.addEventListener('dragend', () => { row.classList.remove('dragging'); dragging = null; });
            // A row only accepts a row from ITS OWN list; dragging between two
            // settings would be a move nobody asked for and could not undo.
            row.addEventListener('dragover', (e) => {
                if (!dragging || dragging.key !== row.dataset.ldrag) { return; }
                e.preventDefault();
                if (e.dataTransfer) { e.dataTransfer.dropEffect = 'move'; }
            });
            row.addEventListener('drop', (e) => {
                if (!dragging || dragging.key !== row.dataset.ldrag) { return; }
                e.preventDefault();
                const from = dragging.i, to = Number(row.dataset.li);
                dragging = null;
                moveRow(row.dataset.ldrag, from, to);
            });
        });
        document.querySelectorAll('[data-lapply]').forEach(btn =>
            btn.addEventListener('click', () => applyList(btn.dataset.lapply)));
        document.querySelectorAll('[data-ljson]').forEach(el =>
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                // What is on screen goes INTO the JSON box: switching view is
                // not a reason to lose what was typed.
                const key = el.dataset.ljson;
                const item = allItems().find(i => i.key === key);
                const numeric = item && item.shape
                    && (item.shape.itemType === 'number' || item.shape.itemType === 'integer');
                jsonDraft[key] = boxText(readList(key)
                    .map(v => String(v).trim()).filter(v => v !== '')
                    .map(v => (numeric && Number.isFinite(Number(v)) ? Number(v) : v)));
                jsonMode[key] = true;
                render();
            }));
        document.querySelectorAll('[data-llist]').forEach(el =>
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                const key = el.dataset.llist;
                // …and back the same way: the box is parsed into rows when it
                // can be, and left alone when it cannot, so a half-typed JSON
                // is not silently turned into one row containing a brace.
                const ta = document.getElementById('c-' + shortKey(key));
                if (ta) {
                    try {
                        const v = JSON.parse(String(ta.value || '[]'));
                        if (Array.isArray(v)) {
                            listDraft[key] = v.map(x => String(x ?? ''));
                            delete errors[key];
                        } else {
                            errors[key] = 'that is not a list — the JSON box is still here';
                            render();
                            return;
                        }
                    } catch {
                        errors[key] = 'the JSON in the box does not parse, so it cannot be shown as rows';
                        render();
                        return;
                    }
                }
                delete jsonDraft[key];
                delete jsonMode[key];
                render();
            }));
        // ‼️ The picker fills ONE ROW and saves nothing — unlike the scalar
        // Browse beside a single path box, which IS the whole value. The host
        // opens the dialog and posts the path back; the draft takes it.
        document.querySelectorAll('[data-lbrowse]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.lbrowse;
                readList(key);
                vscode.postMessage({
                    type: 'browseRow', key, index: Number(btn.dataset.li), kind: btn.dataset.lkind
                });
            }));
        /**
         * ‼️ U-109 — THE FORM AND THE TABLE, and the same discipline the list
         * editor above keeps: every handler reads the boxes FIRST, and nothing
         * saves except the one button that says it saves.
         */
        document.querySelectorAll('[data-frow]').forEach(el =>
            el.addEventListener('change', () => readForm(el.dataset.frow)));
        document.querySelectorAll('[data-rrow]').forEach(el =>
            el.addEventListener('change', () => readRows(el.dataset.rrow)));
        document.querySelectorAll('[data-fapply]').forEach(btn =>
            btn.addEventListener('click', () => applyForm(btn.dataset.fapply)));
        document.querySelectorAll('[data-radd]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.radd;
                const at = readRows(key).length;
                rowsDraft[key].push({});
                render();
                // U-141 — the caret goes into the row that was just made, in
                // its FIRST declared field. Same reason as the list editor: it
                // saves an aim with the mouse, and it is how the press proves
                // it landed on a page that redraws itself.
                const first = (shapeFields(key) || [])[0];
                const box = first
                    && document.getElementById(`r-${shortKey(key)}-${at}-${first.name}`);
                if (box && box.focus) { try { box.focus(); } catch (e) { /* stub DOM */ } }
            }));
        document.querySelectorAll('[data-rdel]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.rdel;
                const i = Number(btn.dataset.ri);
                const rows = readRows(key);
                if (i >= 0 && i < rows.length) { rows.splice(i, 1); }
                render();
            }));
        document.querySelectorAll('[data-rapply]').forEach(btn =>
            btn.addEventListener('click', () => applyRows(btn.dataset.rapply)));
        // Into the JSON box and back, for both shapes. What is on screen goes
        // WITH it either way: switching view is not a reason to lose a typed
        // cell, and a JSON that does not parse is refused rather than turned
        // into rows of braces.
        document.querySelectorAll('[data-fjson]').forEach(el =>
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                const key = el.dataset.fjson;
                jsonDraft[key] = boxText(looseEntry(shapeFields(key), readForm(key)));
                jsonMode[key] = true;
                render();
            }));
        document.querySelectorAll('[data-rjson]').forEach(el =>
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                const key = el.dataset.rjson;
                const fields = shapeFields(key);
                jsonDraft[key] = boxText(readRows(key).map(c => looseEntry(fields, c)));
                jsonMode[key] = true;
                render();
            }));
        document.querySelectorAll('[data-fform]').forEach(el =>
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                const key = el.dataset.fform;
                const v = parseBox(key, 'object');
                if (v === undefined) { render(); return; }
                formDraft[key] = cellsOf(shapeFields(key), v);
                delete errors[key];
                delete jsonDraft[key];
                delete jsonMode[key];
                render();
            }));
        document.querySelectorAll('[data-rtable]').forEach(el =>
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                const key = el.dataset.rtable;
                const v = parseBox(key, 'array');
                if (v === undefined) { render(); return; }
                const fields = shapeFields(key);
                rowsDraft[key] = v.map(entry => cellsOf(fields, entry));
                delete errors[key];
                delete jsonDraft[key];
                delete jsonMode[key];
                render();
            }));
        /** ‼️ U-110 — the pair editor. Same discipline again: read first, and
         *  nothing saves except the button that says it saves. */
        document.querySelectorAll('[data-mrow]').forEach(el =>
            el.addEventListener('change', () => readMap(el.dataset.mrow)));
        document.querySelectorAll('[data-madd]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.madd;
                const at = readMap(key).length;
                mapDraft[key].push({ k: '', v: '' });
                render();
                // U-141 — into the NAME box, which is the one that cannot be
                // left empty; a pair with no name is refused on save.
                const box = document.getElementById(`m-${shortKey(key)}-${at}-k`);
                if (box && box.focus) { try { box.focus(); } catch (e) { /* stub DOM */ } }
            }));
        document.querySelectorAll('[data-mdel]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.mdel;
                const i = Number(btn.dataset.mi);
                const pairs = readMap(key);
                if (i >= 0 && i < pairs.length) { pairs.splice(i, 1); }
                render();
            }));
        document.querySelectorAll('[data-mapply]').forEach(btn =>
            btn.addEventListener('click', () => applyMap(btn.dataset.mapply)));
        document.querySelectorAll('[data-mjson]').forEach(el =>
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                const key = el.dataset.mjson;
                const item = allItems().find(i => i.key === key);
                const f = mapField(item.shape);
                const loose = {};
                for (const p of readMap(key)) {
                    const name = String(p.k).trim();
                    if (!name) { continue; }
                    const r = readField(f, p.v);
                    loose[name] = r.skip ? '' : (r.err ? String(p.v) : r.v);
                }
                jsonDraft[key] = boxText(loose);
                jsonMode[key] = true;
                render();
            }));
        document.querySelectorAll('[data-mpairs]').forEach(el =>
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                const key = el.dataset.mpairs;
                const v = parseBox(key, 'object');
                if (v === undefined) { render(); return; }
                const item = allItems().find(i => i.key === key);
                const f = mapField(item.shape);
                mapDraft[key] = Object.keys(v).map(k => ({ k, v: fieldText(f, v[k]) }));
                delete errors[key];
                delete jsonDraft[key];
                delete jsonMode[key];
                render();
            }));
        document.querySelectorAll('[data-json]').forEach(el =>
            el.addEventListener('change', () => { jsonDraft[el.dataset.json] = String(el.value); }));
        document.querySelectorAll('[data-apply]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.apply;
                delete errors[key];
                const ta = document.getElementById('c-' + shortKey(key));
                // It has been sent; from here the store is the truth, and the
                // box redraws from what was really written.
                delete jsonDraft[key];
                /**
                 * ‼️ U-142 — AND THE ESCAPE HATCH LETS GO WHEN THE SAVE LANDS.
                 *
                 * `jsonMode` is the reader saying "show me the raw value
                 * instead"; once they have applied it the request is answered,
                 * and a setting the schema describes completely should go back
                 * to its own editor rather than staying a textarea for the rest
                 * of the session. The structured view is also the plainest
                 * proof the save landed, and "Edit as JSON" is one click away.
                 *
                 * ‼️ BUT A REFUSAL MUST NOT THROW THE READER OUT OF THE BOX
                 * THEY WERE WRITING IN. The host answers `error` when the text
                 * does not parse, so what was sent is held here until one of
                 * the two answers arrives — and put straight back if it was
                 * refused. Without this half, a mistyped brace would drop the
                 * reader into the row editor AND lose everything they typed.
                 */
                jsonSent[key] = ta ? ta.value : '';
                delete jsonMode[key];
                vscode.postMessage({ type: 'set', key, value: ta ? ta.value : '' });
            }));
        // ‼️ U-89 — the example is written into the BOX and nothing is saved.
        // The user reads it, edits it, and presses Apply themselves: a button
        // that silently overwrote a live setting with a sample would be the
        // worst possible reading of "show me what goes here".
        document.querySelectorAll('[data-example]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.example;
                const item = allItems().find(i => i.key === key);
                const ta = document.getElementById('c-' + shortKey(key));
                if (!item || !item.shape || !ta) { return; }
                ta.value = exampleText(item.shape);
                jsonDraft[key] = ta.value;
                ta.focus();
            }));
        document.querySelectorAll('[data-reset]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.reset;
                delete errors[key];
                // A reset throws the value away, so it throws every draft of it
                // away too — a box still showing the old edit would be a lie.
                delete jsonDraft[key];
                delete listDraft[key];
                delete formDraft[key];
                delete rowsDraft[key];
                delete mapDraft[key];
                // ‼️ U-142 — AND THE VIEW THE DRAFTS WERE MADE IN. `jsonMode` is
                // a request about a value; once that value is gone the request
                // has no subject left, and leaving it set kept the setting a
                // textarea with nothing in it. Unlike Apply there is nothing to
                // wait for: a reset only removes a key and cannot be refused.
                delete jsonMode[key];
                delete jsonSent[key];
                vscode.postMessage({ type: 'reset', key });
            }));
        // The host opens the native dialog and saves what comes back — the page
        // never has to know the path, and the refresh that follows redraws the
        // box with it.
        document.querySelectorAll('[data-browse]').forEach(btn =>
            btn.addEventListener('click', () => {
                delete errors[btn.dataset.browse];
                vscode.postMessage({ type: 'browse', key: btn.dataset.browse, kind: btn.dataset.browsekind });
            }));

        // Agent folders section
        const rootAdd = document.getElementById('rootadd');
        if (rootAdd) { rootAdd.addEventListener('click', () => vscode.postMessage({ type: 'rootAdd' })); }
        const cleanDupes = document.getElementById('afcleandupes');
        if (cleanDupes) { cleanDupes.addEventListener('click', () => vscode.postMessage({ type: 'rootCleanDupes' })); }
        document.querySelectorAll('[data-rootremove]').forEach(btn =>
            btn.addEventListener('click', () => vscode.postMessage({ type: 'rootRemove', root: btn.dataset.rootremove })));
        document.querySelectorAll('[data-rootreveal]').forEach(btn =>
            btn.addEventListener('click', () => vscode.postMessage({ type: 'rootReveal', root: btn.dataset.rootreveal })));
        document.querySelectorAll('[data-exclude]').forEach(a =>
            a.addEventListener('click', () => vscode.postMessage({ type: 'agentExclude', dir: a.dataset.exclude })));
        document.querySelectorAll('[data-include]').forEach(a =>
            a.addEventListener('click', () => vscode.postMessage({ type: 'agentInclude', dir: a.dataset.include })));
        document.querySelectorAll('[data-openagent]').forEach(a =>
            a.addEventListener('click', () => vscode.postMessage({ type: 'openAgent', agentId: a.dataset.openagent })));
        document.querySelectorAll('[data-agmodel]').forEach(el =>
            el.addEventListener('change', () => {
                if (el.value === '__custom__') {
                    customModelDir = el.dataset.agmodel;
                    render();
                    const inp = document.querySelector('[data-agcustom]');
                    if (inp && inp.focus) { inp.focus(); }
                    return;
                }
                vscode.postMessage({ type: 'agentModel', dir: el.dataset.agmodel, model: el.value, engine: agentEngine() });
            }));
        document.querySelectorAll('[data-ageffort]').forEach(el =>
            el.addEventListener('change', () => vscode.postMessage({
                type: 'agentEffort', dir: el.dataset.ageffort, effort: el.value, engine: agentEngine()
            })));
        document.querySelectorAll('[data-agaccount]').forEach(el =>
            el.addEventListener('change', () => vscode.postMessage({
                type: 'agentAccount', dir: el.dataset.agaccount, account: el.value, engine: agentEngine()
            })));
        // ‼️ The engine strip is a PAGE state, not a per-agent one: it says which
        // engine's defaults the boxes below are editing. Kept on the host so it
        // survives the refresh that follows every write.
        document.querySelectorAll('[data-agengine]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({
                type: 'agentDefaultsEngine', engine: b.dataset.agengine
            })));
        document.querySelectorAll('[data-agcustom]').forEach(el =>
            el.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') {
                    customModelDir = '';
                    vscode.postMessage({ type: 'agentModel', dir: el.dataset.agcustom, model: el.value.trim(), engine: agentEngine() });
                } else if (ev.key === 'Escape') {
                    customModelDir = '';
                    render();
                }
            }));

        // Claude Code section
        document.querySelectorAll('[data-ccset]').forEach(el => {
            el.addEventListener('change', () => {
                delete errors['cc:' + el.dataset.ccset];
                const value = el.type === 'checkbox' ? el.checked : el.value;
                vscode.postMessage({ type: 'ccSet', id: el.dataset.ccset, value });
            });
            enterLetsGo(el);
        });
        document.querySelectorAll('[data-ccclear]').forEach(btn =>
            btn.addEventListener('click', () => {
                delete errors['cc:' + btn.dataset.ccclear];
                vscode.postMessage({ type: 'ccClear', id: btn.dataset.ccclear });
            }));
        const ccOpen = document.getElementById('ccopen');
        if (ccOpen) { ccOpen.addEventListener('click', () => vscode.postMessage({ type: 'ccOpenFile' })); }
        const ccApply = document.getElementById('ccrawapply');
        if (ccApply) {
            ccApply.addEventListener('click', () => {
                delete errors['cc:__raw__'];
                const ta = document.getElementById('ccraw');
                ccRawSent = { was: DATA.claude ? String(DATA.claude.raw) : '' };
                vscode.postMessage({ type: 'ccRaw', text: ta ? ta.value : '' });
            });
        }

        // The setting sets bar and #app itself sit outside #setbody: a body-only redraw keeps their bindings.
        if (!bodyOnly) {
            // profiles
            const sel = document.getElementById('profsel');
            document.getElementById('profapply').addEventListener('click', () => {
                if (sel && sel.value) { vscode.postMessage({ type: 'applyProfile', name: sel.value }); }
            });
            document.getElementById('profdel').addEventListener('click', () => {
                if (sel && sel.value) { vscode.postMessage({ type: 'deleteProfile', name: sel.value }); }
            });
            document.getElementById('profsave').addEventListener('click', () => {
                saveOpen = !saveOpen;
                render();
                const inp = document.getElementById('profname');
                if (inp) { inp.focus(); }
            });
            const confirm = document.getElementById('profconfirm');
            if (confirm) {
                const send = () => {
                    const inp = document.getElementById('profname');
                    if (inp && inp.value.trim()) {
                        vscode.postMessage({ type: 'saveProfile', name: inp.value.trim() });
                        saveOpen = false;
                    }
                };
                confirm.addEventListener('click', send);
                document.getElementById('profname').addEventListener('keydown', ev => { if (ev.key === 'Enter') { send(); } });
            }
            document.getElementById('profexport').addEventListener('click', () => vscode.postMessage({ type: 'exportProfiles' }));
            document.getElementById('profimport').addEventListener('click', () => vscode.postMessage({ type: 'importProfiles' }));

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

    function focusKey(key) {
        let el = document.querySelector(`[data-item="${key}"]`);
        // U-224 — a row the query or the Changed chip hides is shown: the search gives way to the link.
        if (!el && (filter || changedOnly)) {
            filter = '';
            changedOnly = false;
            render();
            el = document.querySelector(`[data-item="${key}"]`);
        }
        if (!el) { return; }
        if (el.scrollIntoView) { el.scrollIntoView({ block: 'center' }); }
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 2500);
    }

    // ------------------------------------------------------- right-click menu

    /**
     * A setting and an agent root, from the right button. Reset and Remove are
     * the page's own messages; the rest is what a settings row was never able
     * to answer — what is this called, what is it set to, and where does VS
     * Code's own editor show it.
     */
    function ctxDo(act, ctx) {
        const verb = act.split(':')[0];
        const arg = act.slice(verb.length + 1);
        switch (verb) {
            case 'stReset':
                delete errors[ctx.setKey];
                vscode.postMessage({ type: 'reset', key: String(ctx.setKey || '') });
                return;
            case 'stOpenUi':
                vscode.postMessage({ type: 'openSettingsUi', key: String(ctx.setKey || '') });
                return;
            case 'stCopy': {
                if (arg === 'key') { window.AFCtx.copy(ctx.setKey); return; }
                // The settings live inside their categories, not in a flat list.
                let it;
                for (const cat of (DATA.categories || [])) {
                    it = (cat.items || []).find(x => x.key === ctx.setKey);
                    if (it) { break; }
                }
                const v = it ? it.value : undefined;
                window.AFCtx.copy(v === undefined || v === null ? ''
                    : typeof v === 'object' ? JSON.stringify(v) : String(v));
                return;
            }
            case 'rtReveal': vscode.postMessage({ type: 'rootReveal', root: String(ctx.rootPath || '') }); return;
            case 'rtRemove': vscode.postMessage({ type: 'rootRemove', root: String(ctx.rootPath || '') }); return;
            case 'rtAdd': vscode.postMessage({ type: 'rootAdd' }); return;
            case 'rtCopy': window.AFCtx.copy(ctx.rootPath); return;
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
    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') {
            if (editing) { pendingData = { ...DATA, ...ev.data.data }; return; }
            DATA = { ...DATA, ...ev.data.data };
            ccRawLanded();
            // U-142 — the store answered, so nothing is waiting to be put back:
            // a refusal arrives as `error` and never as a redraw.
            for (const k of Object.keys(jsonSent)) { delete jsonSent[k]; }
            repaint();
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
            if (ev.data.id === '__raw__') { ccRawSent = null; }
            draw();
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
            svcMsg = window.AFTelegram.verifiedMessage(ev.data);
            render();
            return;
        }
        if (ev.data.type === 'focus') { focusKey(ev.data.key); }
    });

    render();
    if (DATA.focus) { focusKey(DATA.focus); }
})();
