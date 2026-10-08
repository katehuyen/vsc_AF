// Agent Farm — Farm Settings: the look of one setting row (U-227). Two columns: the name, its summary and
// its notes on the left; on the right a fixed column for the control, so every simple row of a section
// starts its control at one x. A row holding a list, a table, a form, a map or several lines of text
// puts its editor under the name, full width. Rows are parted by a thin rule, not boxed; under 700px
// the two columns stack. The page's <style> block takes css() whole.
(function () {
    'use strict'; // i18n-exempt
    const CTL = 340;

    function css() {
        return `
            .setitem.srow { display:grid; grid-template-columns:minmax(240px, 1fr) ${CTL}px; column-gap:18px;
                align-items:center; margin:0; padding:7px 4px 7px 8px; border:0; border-radius:0;
                border-bottom:1px solid var(--vscode-widget-border, #3333); }
            .setitem.srow.modified { border-left:3px solid var(--vscode-textLink-foreground); padding-left:5px; }
            .setitem.srow.wide { grid-template-columns:minmax(0, 1fr); row-gap:6px; }
            .srow .setl, .srow .setr { min-width:0; }
            .srow .setr { display:flex; align-items:center; gap:6px; }
            .srow .setr .setctl { flex:0 1 auto; min-width:0; }
            .srow .setr .setfield, .srow .setr .setctl > select { width:${CTL - 50}px; max-width:100%; }
            .srow .setaside { flex:0 0 auto; display:flex; align-items:center; gap:4px; min-width:22px; }
            .srow .sethead { gap:6px; }
            .srow .setname { font-family:inherit; font-size:13px; }
            .srow .setnamew .moddot { display:inline-block; margin-left:7px; vertical-align:middle; }
            .srow .setinfo { font-size:11px; color:var(--vscode-descriptionForeground); cursor:help; margin-left:6px; }
            .srow .sethead:hover .setinfo { color:var(--vscode-foreground); }
            .srow .setsum, .srow .setwhy { font-size:11px; color:var(--vscode-descriptionForeground);
                margin-top:2px; max-width:760px; }
            .srow .setwhy { font-style:italic; }
            .setreload { font-size:10px; padding:0 6px; border-radius:8px; white-space:nowrap;
                border:1px solid var(--vscode-widget-border, #4444); color:var(--vscode-descriptionForeground); }
            .setfield { display:flex; gap:6px; align-items:center; }
            .setfield input { flex:1 1 auto; min-width:0; }
            .srow > .setpath { grid-column:1 / -1; }
            @media (max-width:700px) {
                .setitem.srow { grid-template-columns:minmax(0, 1fr); row-gap:6px; }
            }`;
    }

    window.AFSettingRowCss = { css, CTL };
})();
