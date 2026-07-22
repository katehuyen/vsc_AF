// Agent Farm — shared page header + toolbar, used by EVERY full-page panel.
// One layout everywhere: title/subtitle on the left; one right-aligned toolbar
// whose left half is the page's own scope controls and actions, and whose
// right half — after a thin divider — is the GLOBAL cluster, identical on
// every page (minus the page itself):
//   Dashboard · Live Timeline · Tasks · Missions · Toolbox · [related panel] · ⌕ Search · ⚙ Settings · Refresh · ? Guide
// Pages differ only in their left half; the right half is muscle memory.
// Alignment, gaps and wrapping come from here — pages must not hand-roll
// their own header rows.
(function () {
    'use strict';

    const STYLE = `<style>
        .af-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px 24px; flex-wrap:wrap; margin:0 0 10px; }
        .af-head-info { flex:1 1 260px; min-width:220px; }
        .af-head-bar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; justify-content:flex-end; margin-left:auto; }
        .af-head-sep { width:1px; align-self:stretch; min-height:22px; background:var(--vscode-widget-border,#4444); margin:0 4px; }
    </style>`;

    const NAV = [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'notices', label: '🔔 Notices' },
        { id: 'timeline', label: 'Live Timeline' },
        { id: 'tasks', label: 'Tasks' },
        { id: 'missions', label: 'Missions' },
        { id: 'toolbox', label: 'Toolbox' }
    ];

    /**
     * o: {
     *   page,        // 'dashboard'|'timeline'|'agent'|'viewer'|'board'|'needs'|
     *                //   'capabilities'|'memgraph'|'gallery'|'settings'|'search'
     *   title,       // h1 content (caller escapes)
     *   sub,         // optional line under the title
     *   controls,    // optional html — scope selectors (segments / filter selects)
     *   actions,     // optional html — page action buttons, most important first
     *   related,     // optional [{nav, label}] — related panels, after Live Timeline
     *   searchTitle, // optional tooltip when ⌕ Search is page-scoped
     *   refresh,     // false to omit the Refresh button (pages with nothing to re-scan)
     *   guide        // guide anchor for ? Guide (omit → no button)
     * }
     */
    function html(o) {
        const cluster = [];
        for (const n of NAV) {
            if (n.id !== o.page) { cluster.push(`<button class="secondary" data-afnav="${n.id}">${n.label}</button>`); }
        }
        for (const r of o.related || []) {
            cluster.push(`<button class="secondary" data-afnav="${r.nav}">${r.label}</button>`);
        }
        if (o.page !== 'search') {
            cluster.push(`<button class="secondary" data-afnav="search" title="${o.searchTitle || 'Search across the whole farm'}">⌕ Search</button>`);
        }
        if (o.page !== 'settings') {
            cluster.push('<button class="secondary" data-afnav="settings" title="All agentFarm settings in one page, with saveable setting sets">⚙ Settings</button>');
        }
        if (o.refresh !== false) { cluster.push('<button class="secondary af-refresh">Refresh</button>'); }
        if (o.guide) { cluster.push(`<button class="secondary" data-afguide="${o.guide}">? Guide</button>`); }
        const left = (o.controls || '') + (o.actions || '');
        return `${STYLE}
            <div class="af-head">
                <div class="af-head-info"><h1>${o.title}</h1>${o.sub ? `<div class="muted small">${o.sub}</div>` : ''}</div>
                <div class="af-head-bar">
                    ${left}${left ? '<span class="af-head-sep"></span>' : ''}
                    ${cluster.join('')}
                </div>
            </div>`;
    }

    /**
     * Call after html() landed in the DOM (i.e. at the end of each render).
     * Posts { type:'afnav', to } — routed by one shared handler on the
     * extension side (handleAfNav; pages with a scoped ⌕ Search intercept
     * to:'search' before delegating) — plus { type:'refresh' } and
     * { type:'openGuide', anchor }. hooks.onRefresh overrides the refresh
     * post for pages that must do extra client work first.
     */
    function wire(vscode, hooks) {
        document.querySelectorAll('[data-afnav]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({ type: 'afnav', to: b.dataset.afnav })));
        document.querySelectorAll('.af-refresh').forEach(b =>
            b.addEventListener('click', () => {
                if (hooks && hooks.onRefresh) { hooks.onRefresh(); return; }
                vscode.postMessage({ type: 'refresh' });
            }));
        document.querySelectorAll('[data-afguide]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({ type: 'openGuide', anchor: b.dataset.afguide })));
    }

    window.AFHeader = { html, wire };
})();
