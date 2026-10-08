// Agent Farm — Farm Settings: the page around #setbody — its styles, the header, the setting sets bar and the search box.
// Split out of media/settings.js unchanged (U-225): the page hands its state in once, as X.
(function () {
    'use strict';
    let X, C;
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));

    function pageHtml(R, total, modified, body) {
        return `
            <style>
                .profbar { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:10px 0;
                    padding:8px 10px; border:1px solid var(--vscode-panel-border); border-radius:6px; }
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
                ${window.AFSettingRowCss.css()}
                ${X.foldCss()}
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
                title: t('Settings'),
                version: true,
                sub: C.esc(t('{n} settings · {m} changed', { n: total, m: modified })),
                guide: 'dashboard'
            })}
            <div class="searchbar setbar">
                <input id="filter" type="text" placeholder="Filter settings… (name or description)" value="${C.esc(X.filter)}" style="width:100%; max-width:420px; padding:6px 8px"
                    title="${C.esc(window.AFQuery.tip('Searched against each setting\'s name, the words people use for it, its key, its section, its options and its description; the best match comes first. / or Ctrl+F comes back here.'))}">
                ${R.chipHtml(modified, X.changedOnly, C.esc)}
                ${X.barHtml()}
                ${/* ‼️ U-139 — THE FILE ITSELF, from the page that writes it: every box here is a view of one
                     document, and the ↺ buttons remove keys from the same file. */ ''}
                <button class="secondary small" id="opensettingsjson"
                    title="Open your user settings.json — the file every box on this page writes into. Changed values appear there as agentFarm.* keys; a value the schema cannot describe can be written by hand.">settings.json</button>
            </div>
            <div id="setbody">${body}</div>
        `;
    }

    window.AFSettingPage = function (ctx) {
        X = ctx;
        C = ctx.C;
        return { pageHtml };
    };
})();
