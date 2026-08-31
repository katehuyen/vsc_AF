// Agent Farm — SESSIONS: the log of every conversation, on a page of its own.
//
// Deliberately thin. The table is the shared component (sessionsTable.js) — the
// same columns, the same filters, the same turn accordion, the same right-click
// contract the Dashboard and the agent pages embed. What this page adds is the
// thing neither of them could give it: the whole window, and a default of 200
// rows instead of a corner of a board capped at twenty.
//
// Anything that belongs to "a sessions table" goes in the component and every
// surface gets it; anything that belongs to "the sessions PAGE" is here, and so
// far that is one line of counts and the header.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;

    const table = window.AFSessionsTable.create({
        vscode, C,
        containerId: 'sessblock',
        // Every column the component has. On the Dashboard some of them are a
        // luxury the width cannot afford; here there is nothing else on the page
        // to compete with them.
        columns: ['origin', 'agent', 'engine', 'project', 'title', 'when', 'duration', 'turns',
            'tools', 'files', 'errors', 'tokens', 'ctx', 'cost'],
        tableN: DATA.sessionTableN || 200,
        stateKey: 'sessionsPage'
    });

    /** ‼️ The opening scope is applied ONCE — per scope. The host repaints this
     *  page on its own beat (every index update), and re-applying the filter on
     *  each push would quietly undo whatever the reader had narrowed it to
     *  since. It is keyed rather than a plain flag because the page is a
     *  singleton (X-95): pressing Sessions on a SECOND mission reveals the panel
     *  that is already open, and a boolean would have left it showing the first
     *  mission's rows under the second one's title. */
    let scopeApplied = '';

    // ‼️ M-33 — A HOST PUSH WAITS FOR THE READER'S HANDS; THE PAGE'S OWN
    // RENDERS DO NOT. render() replaces the whole of #app, so a repaint that
    // arrives while somebody is typing detaches the box they are typing in and
    // the caret falls to <body> — where space IS Page Down. Full text, and
    // what a page-specific busy() is for: media/afRepaint.js.
    const repaint = window.AFRepaint.guard(render);
    window.addEventListener('message', ev => {
        if (table.onMessage(ev)) { return; }
        if (ev.data.type === 'data') {
            DATA = ev.data.data;
            repaint();
        }
    });

    function render() {
        const t = DATA.totals || { sessions: 0, active: 0 };
        document.getElementById('app').innerHTML = `
            ${window.AFHeader.html({
            page: 'sessions',
            title: 'Sessions',
            sub: `${t.sessions} session${t.sessions === 1 ? '' : 's'} on this machine`
                + (t.active ? ` · ${t.active} running now` : '')
                + (DATA.scope && DATA.scope.agentName ? ` · scoped to ${C.esc(DATA.scope.agentName)}` : '')
                // ‼️ X-95 — when the page was opened FROM a mission it says so
                // in its own header. The filter chips say what is set; only the
                // title can say what this list is supposed to BE, and a reader
                // arriving from a button needs to recognise where they landed.
                + (DATA.scope && DATA.scope.missionId
                    ? ` · 🎯 ${C.esc(DATA.scope.missionTitle || DATA.scope.missionId)}` : ''),
            searchTitle: 'Search inside every transcript',
            guide: 'dashboard'
        })}
            <p class="lede muted small">Every conversation this machine has recorded — yours and the farm's own runs.
                The table is the one the Dashboard and the agent pages carry, with the whole page to itself:
                sort by any figure, filter by agent, project, dates and ranges, fold a row open for its turns,
                and right-click any row (or a selection) for the full action set.</p>
            <div id="sessblock"></div>`;

        window.AFHeader.wire(vscode);
        table.setRows(DATA.sessions || [], DATA.sessionTableN);
        // The scope the page was opened with is a FILTER, not a different table:
        // it lands in the component's own project / mission filters so the ✕
        // that clears it is the same ✕ that clears every other filter.
        const sc = DATA.scope || {};
        const key = (sc.missionId ? 'm:' + sc.missionId : '') + (sc.project ? 'p:' + sc.project : '');
        if (key && key !== scopeApplied) {
            scopeApplied = key;
            if (sc.missionId) { table.setMissionFilter(sc.missionId); }
            if (sc.project) { table.setProjectFilter(sc.project); }
        }
    }

    render();
})();
