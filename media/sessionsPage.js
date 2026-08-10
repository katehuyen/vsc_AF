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

    /** ‼️ The opening scope is applied ONCE. The host repaints this page on its
     *  own beat (every index update), and re-applying the filter on each push
     *  would quietly undo whatever the reader had narrowed it to since. */
    let scopeApplied = false;

    window.addEventListener('message', ev => {
        if (table.onMessage(ev)) { return; }
        if (ev.data.type === 'data') {
            DATA = ev.data.data;
            render();
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
                + (DATA.scope && DATA.scope.agentName ? ` · scoped to ${C.esc(DATA.scope.agentName)}` : ''),
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
        // it lands in the component's own project filter so the ✕ that clears it
        // is the same ✕ that clears every other filter.
        if (!scopeApplied && DATA.scope && DATA.scope.project) {
            scopeApplied = true;
            table.setProjectFilter(DATA.scope.project);
        }
    }

    render();
})();
