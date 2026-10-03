// Agent Farm — the Chains page's look (S-128): a colour per state, the relay symbols the Console card
// uses, the legs as a strip, and the page's styles. media/chains.js draws with these and decides nothing here.
(function () {
    'use strict'; // i18n-exempt — a directive, not interface text

    const GLYPH = { running: '▶', waiting: '⏳', parked: '🅿', done: '■', stopped: '✕', refused: '⊘', failed: '✖' };
    /** One symbol per relay control, the same as on the Console card (⛔ is the Tasks dependency mark, never a brake). */
    const SYM = { stop: '✕⑂', lastLeg: '⑂⊣', end: '⑂✓', copy: '⧉' };
    const TONE = { running: 'run', waiting: 'hold', parked: 'hold', done: 'ok', stopped: 'off', refused: 'off', failed: 'off' };
    const ACTIVE = { running: 1, waiting: 1, parked: 1 };
    const FOLD = 6;

    /** A row's colour family; anything the record shows going wrong is drawn over its state. */
    function tone(r) { return r.signals && r.signals.length ? 'attn' : (TONE[r.state] || 'off'); }

    const run = (ch, n, cls) => (n <= 0 ? '' : `<span class="${cls}">${n > FOLD ? ch + '×' + n : ch.repeat(n)}</span>`);

    /** Whether the running leg is the chain's last: braked by hand, or standing on its ceiling. */
    function atEnd(r) {
        const max = Number(r.maxLegs) || 0;
        return !!ACTIVE[r.state] && (!!r.lastLeg || (max > 0 && Number(r.leg) >= max));
    }

    /**
     * The legs as a strip: ● ran · the current leg in its state's glyph · ○ still allowed under the
     * ceiling, ∞ when there is none. A stretch longer than six folds into ●×N, so a 29-leg night
     * stays one short cell. ⑂⊣ follows when this leg is the last.
     */
    function stepper(r) {
        const max = Number(r.maxLegs) || 0;
        const leg = Math.max(1, Number(r.leg) || 1);
        const active = !!ACTIVE[r.state];
        const ran = active ? leg - 1 : leg;
        const cur = active ? `<span class="s-cur">${GLYPH[r.state]}</span>` : '';
        const left = !active ? '' : max > 0 ? run('○', Math.max(0, max - leg), 's-left') : '<span class="s-left">∞</span>';
        return `<span class="ch-steps">${run('●', ran, 's-ran')}${cur}${left}</span>`
            + (atEnd(r) ? ` <span class="ch-brake">${SYM.lastLeg}</span>` : '');
    }

    const CSS = `
        .ch-chips { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0; }
        .ch-chip { min-height:28px; padding:2px 10px; border-radius:14px; background:transparent; color:inherit; border:1px solid var(--vscode-panel-border); cursor:pointer; }
        .ch-chip.on { background:var(--vscode-button-background); color:var(--vscode-button-foreground); border-color:transparent; }
        .ch-chip.warn b { color:var(--vscode-editorWarning-foreground, orange); }
        .ch-chip.on.warn b { color:inherit; }
        .ch-note { margin:4px 0 8px; font-size:12px; }
        .ch-note.bad { color:var(--vscode-errorForeground); }
        .ch-tab td { vertical-align:middle; }
        .ch-row { cursor:pointer; }
        .ch-row:hover { background:var(--vscode-list-hoverBackground); }
        .ch-row.open { background:var(--vscode-list-inactiveSelectionBackground); }
        .ch-row.t-run > td:first-child, .ch-row.t-hold > td:first-child { box-shadow:inset 3px 0 0 var(--ch-tone); }
        .ch-row.t-attn > td:first-child { box-shadow:inset 3px 0 0 var(--ch-tone); }
        .ch-row.focus { box-shadow:inset 3px 0 0 var(--vscode-focusBorder, #007fd4); }
        .t-run { --ch-tone:var(--vscode-charts-blue, #3794ff); }
        .t-hold { --ch-tone:var(--vscode-charts-yellow, #cca700); }
        .t-ok { --ch-tone:var(--vscode-charts-green, #89d185); }
        .t-off { --ch-tone:var(--vscode-descriptionForeground, #999); }
        .t-attn { --ch-tone:var(--vscode-charts-orange, #d18616); }
        .ch-st { white-space:nowrap; color:var(--ch-tone); }
        .ch-warn { margin-right:3px; }
        .ch-name { max-width:340px; min-width:120px; }
        .ch-title { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .ch-id { display:block; font-size:11px; }
        .ch-copy { margin-left:4px; padding:0 3px; min-height:0; font-size:11px; line-height:14px; background:transparent; color:inherit; border:1px solid transparent; border-radius:3px; cursor:pointer; opacity:.55; }
        .ch-row:hover .ch-copy, .ch-copy:focus { opacity:1; border-color:var(--vscode-panel-border); }
        .ch-steps { letter-spacing:1px; white-space:nowrap; }
        .ch-steps .s-ran { color:var(--ch-tone); }
        .ch-steps .s-cur { margin:0 1px; }
        .ch-steps .s-left { opacity:.5; }
        .ch-brake { color:var(--vscode-editorWarning-foreground, #e8a33d); white-space:nowrap; }
        .ch-live.working { color:var(--vscode-charts-green, #3a3); }
        .ch-live.gone { opacity:.7; }
        .ch-acts { white-space:nowrap; text-align:right; }
        .ch-actw { display:inline-block; }
        .ch-act { min-width:28px; min-height:28px; padding:0 4px; margin-left:2px; background:transparent; color:inherit; border:1px solid var(--vscode-panel-border); border-radius:4px; cursor:pointer; }
        .ch-act:hover { background:var(--vscode-toolbar-hoverBackground, #8883); }
        .ch-act[aria-pressed=true] { background:var(--vscode-inputValidation-warningBackground, #a606); border-color:var(--vscode-editorWarning-foreground, orange); }
        .ch-sub > td { padding:4px 8px 8px 24px; background:var(--vscode-editorWidget-background, transparent); }
        .ch-legs { table-layout:fixed; }
        .ch-legs td { padding:3px 8px 3px 0; }
        .ch-legs td:nth-child(1) { width:28px; }
        .ch-legs td:nth-child(2) { width:32%; }
        .ch-legs td:nth-child(4), .ch-legs td:nth-child(5), .ch-legs td:nth-child(6) { width:90px; }
        .ch-leg { cursor:pointer; }
        .ch-leg:hover { background:var(--vscode-list-hoverBackground); }
        .ch-lt, .ch-lw { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .ch-form { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
        .ch-form textarea { flex:1 1 100%; min-height:56px; font:inherit; resize:vertical; }
        .ch-form input[type=text] { flex:1 1 260px; min-height:28px; }
        .ch-chk { flex:1 1 100%; font-size:12px; }
        @media (max-width:520px) {
            .ch-wide, .ch-sw { display:none; }
            .ch-tab td, .ch-tab th { padding:4px 4px 4px 0; }
            .ch-tab td.num { white-space:nowrap; }
            .ch-name { max-width:120px; min-width:0; }
            .ch-acts { white-space:normal; width:96px; }
            .ch-act { margin:1px; }
            .ch-legs td:nth-child(2) { width:auto; }
            .ch-legs .ch-lw, .ch-legs .ch-live { display:none; }
            .ch-sub > td { padding-left:8px; }
        }`;

    window.AFChainsLook = { GLYPH, SYM, tone, stepper, atEnd, CSS };
})();
