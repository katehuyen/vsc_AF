// Agent Farm — THE SUPERVISOR STRIP (U-153). What a workflow run's supervisor
// did, one row per checkpoint visit: the decision as a badge, the step, what
// fired it, why, how sure, what it cost, who answered — and, on hover, which
// level each setting came from. The rows are built by src/core/supervisorTrail.ts
// (the same rows workflows.supervisor.status returns); this only draws them.
// A row with a conversation opens it at that moment; the head carries the run's
// live settings and the supervisor's total, apart from the steps.
(function () {
    'use strict';
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
    const usd = n => '$' + (n || 0).toFixed(n >= 1 ? 2 : 4);
    const pct = c => (typeof c === 'number' ? Math.round(c * 100) + '%' : '');
    const tip = (trigger, head, body, attrs) => (window.AFTip ? window.AFTip.wrap(trigger, head, body, '', attrs || '') : trigger);
    const fired = r => (r.trigger === 'checkpoint' ? '◆' : '⚡');

    const CSS = '<style>'
        + '.svs{margin:6px 0 10px;border:1px solid var(--vscode-panel-border,#444);border-radius:4px;font-size:12px;color:var(--vscode-foreground)}'
        + '.svs-h{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:4px 8px;border-bottom:1px solid var(--vscode-panel-border,#444)}'
        + '.svs-t{font-weight:600}.svs-cost{color:var(--af-ink-charts-yellow, var(--vscode-charts-yellow,#cca700));font-weight:600}'
        + '.svs-live{padding:0 6px;border-radius:8px;border:1px solid var(--vscode-charts-purple,#b180d7);color:var(--vscode-foreground)}'
        + '.svs-btn{margin-left:auto;cursor:pointer;background:none;border:1px solid var(--vscode-button-border,var(--vscode-panel-border,#666));color:var(--vscode-foreground);border-radius:3px;padding:0 6px}'
        + '.svr{display:grid;grid-template-columns:22px 30px 16px minmax(0,1fr) 40px 64px minmax(60px,110px);gap:6px;align-items:center;padding:2px 8px}'
        + '.svr[data-svsession]{cursor:pointer}.svr:hover{background:var(--vscode-list-hoverBackground)}'
        + '.svr .why{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
        + '.svr .dim{color:var(--vscode-descriptionForeground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
        + '</style>';

    function figures(r) {
        return [
            'Decision: ' + r.word,
            r.why ? 'Why: ' + r.why : '',
            'Fired by: ' + r.trigger,
            'Step: ' + r.step + ' — ' + r.title,
            typeof r.confidence === 'number' ? 'Confidence: ' + pct(r.confidence) : '',
            typeof r.costUSD === 'number' ? 'Cost: ' + usd(r.costUSD) : '',
            'Answered by: ' + (r.model || 'nobody — the run went on by itself'),
            'Limits from: ' + r.limitsOrigin,
            'Supervisor from: ' + r.supervisorOrigin,
            'At: ' + new Date(r.at).toLocaleString()
        ].filter(Boolean).join('\n') + (r.sessionId ? '\n\nClick opens the supervisor\'s conversation at this moment.' : '');
    }

    const TINT = {
        proceed: 'var(--vscode-charts-green,#4caf50)', retry: 'var(--vscode-charts-blue,#3794ff)', jump: 'var(--vscode-charts-blue,#3794ff)',
        insert: 'var(--vscode-charts-yellow,#cca700)', ask_user: 'var(--vscode-charts-purple,#b180d7)', stop: 'var(--vscode-charts-red,#f14c4c)',
        mech: 'var(--vscode-descriptionForeground,#999)'
    };
    // inline, so a page that never loaded the strip's stylesheet still draws the badge right
    const badge = r => '<span class="svb" style="display:inline-block;min-width:18px;text-align:center;border-radius:3px;font-weight:700;'
        + 'color:var(--af-ground,var(--vscode-editor-background,#1e1e1e));background:' + TINT[r.decision && !r.mechanical ? r.decision : 'mech'] + '">' + esc(r.badge) + '</span>';

    /** The decision alone, for a run row that is a checkpoint visit. */
    function chip(r) {
        return r ? tip(badge(r), r.word, figures(r)) : '';
    }

    function row(r) {
        const open = r.sessionId ? ' data-svsession="' + esc(r.sessionId) + '" data-ts="' + Number(r.at) + '" role="button" tabindex="0" data-aftipact' : '';
        const cells = badge(r) + '<span class="dim">S' + r.step + '</span><span>' + fired(r) + '</span>'
            + '<span class="why">' + esc(r.why || r.word) + '</span>'
            + '<span class="dim">' + esc(pct(r.confidence)) + '</span>'
            + '<span class="dim">' + (typeof r.costUSD === 'number' ? usd(r.costUSD) : '') + '</span>'
            + '<span class="dim">' + esc(r.model || '—') + '</span>';
        return tip('<div class="svr"' + open + '>' + cells + '</div>', r.word, figures(r), 'style="display:block"');
    }

    /** One run's strip: head (total, live settings, the live button) and its rows. `s` is a SupervisorTrail. */
    function strip(s, title) {
        if (!s || !s.rows || !s.rows.length) { return ''; }
        const live = (s.live || []).map(l => '<span class="svs-live">' + esc(l) + '</span>').join('');
        const head = '<div class="svs-h"><span class="svs-t">' + esc(title || 'Supervisor') + '</span>'
            + tip('<span>' + s.calls + ' call' + (s.calls === 1 ? '' : 's') + ' · <span class="svs-cost">' + usd(s.costUSD) + '</span></span>',
                'The supervisor on this run', 'Calls: ' + s.calls + '\nSupervisor cost: ' + usd(s.costUSD) + '\nVisits: ' + s.rows.length
                + '\n\nThe supervisor\'s own spend, apart from what the steps cost.')
            + live
            + (s.running ? '<button class="svs-btn" data-svlive="' + esc(s.runId) + '" title="Live settings\n\nA word for the supervisor, its model, budget or calls, pause — from the next step boundary on.">⚙ Live</button>' : '')
            + '</div>';
        return '<div class="svs">' + head + s.rows.map(row).join('') + '</div>';
    }

    /** Every run with a supervisor trail, under one heading. `runs` carry `title` and `supervisor`. */
    function section(runs) {
        const with_ = (runs || []).filter(r => r.supervisor && r.supervisor.rows && r.supervisor.rows.length);
        if (!with_.length) { return ''; }
        return CSS + '<h2>Supervisor</h2>' + with_.map(r => strip(r.supervisor, r.title)).join('');
    }

    /** After each render: the live button, and a row that opens its conversation (click or Enter). */
    function wire(root, post) {
        root.querySelectorAll('[data-svlive]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'workflowLive', runId: b.dataset.svlive })));
        root.querySelectorAll('[data-svsession]').forEach(r => {
            const open = () => post({ type: 'openSession', sessionId: r.dataset.svsession, ts: Number(r.dataset.ts) || 0 });
            r.addEventListener('click', open);
            r.addEventListener('keydown', e => { if (e.key === 'Enter') { open(); } });
        });
    }

    window.AFSupervisorStrip = { CSS, badge, figures, chip, row, strip, section, wire };
})();
