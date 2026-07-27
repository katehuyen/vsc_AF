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
        .af-head-info { flex:1 1 260px; min-width:200px; }
        /* The toolbar is two wrapping halves (page actions | global nav) that
           break onto a second line as UNITS — never intermixing, never leaving
           the divider stranded — so many-button pages stay tidy at any width. */
        .af-head-bar { display:flex; gap:8px 10px; flex-wrap:wrap; align-items:center; justify-content:flex-end; margin-left:auto; min-width:0; }
        .af-head-actions, .af-head-nav { display:flex; gap:8px; flex-wrap:wrap; align-items:center; justify-content:flex-end; min-width:0; }
        .af-head-nav.has-actions { border-left:1px solid var(--vscode-widget-border,#4444); margin-left:2px; padding-left:12px; }
    </style>`;

    // Order is meaning, not arrival: the board you start from, the place you
    // talk, the three vital signs, what is happening right now, then who does
    // the work and what the work is. New pages take their place in that
    // sequence — they do not pile up on the left.
    const NAV = [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'console', label: '💬 Console' },
        { id: 'living', label: '💓 Living' },
        { id: 'notices', label: '🔔 Notices' },
        { id: 'queue', label: '📥 Queue' },
        { id: 'timeline', label: 'Live Timeline' },
        { id: 'portfolio', label: 'Agents' },
        { id: 'tasks', label: 'Tasks' },
        { id: 'missions', label: 'Missions' },
        { id: 'studio', label: '🎬 Studio' },
        { id: 'toolbox', label: 'Toolbox' }
    ];

    // Notices ↔ Queue read as two tabs of ONE inbox. Both pages render this strip
    // at the very top; the inactive tab is an afnav button that opens the other
    // panel. Counts ride along: 🔔 unread, 📥 items that need you (blocked).
    const TAB_STYLE = `<style>
        .af-tabs { display:flex; gap:4px; margin:0 0 12px; border-bottom:1px solid var(--vscode-panel-border); }
        .af-tab { padding:7px 16px; border:none; border-bottom:2px solid transparent; border-radius:6px 6px 0 0;
            background:transparent; color:var(--vscode-foreground); opacity:.65; font-size:13px; cursor:pointer; }
        .af-tab:hover { opacity:.9; background:var(--vscode-list-hoverBackground); }
        .af-tab.on { opacity:1; font-weight:600; border-bottom-color:var(--vscode-textLink-foreground); background:var(--vscode-editorWidget-background); }
        .af-tab .af-tab-n { opacity:.8; font-weight:400; }
    </style>`;

    function tabs(active) {
        const ui = window.__AFUI__ || {};
        const unread = (ui.notices && ui.notices.unread) || 0;
        const blocked = (ui.queue && ui.queue.blocked) || 0;
        const T = [
            { id: 'notices', label: '🔔 Notices', n: unread },
            { id: 'queue', label: '📥 Queue', n: blocked }
        ];
        return `${TAB_STYLE}<div class="af-tabs">` + T.map(t =>
            `<button class="af-tab ${t.id === active ? 'on' : ''}" data-afnav="${t.id}">${t.label}${t.n ? ` <span class="af-tab-n">(${t.n})</span>` : ''}</button>`
        ).join('') + `</div>`;
    }

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
        // 🔔 Notices carries the unread count in parentheses — "🔔 Notices (3)";
        // the parens vanish once nothing is unread. Count is read live at render
        // (window.__AFUI__.notices.unread, injected by htmlShell).
        const unread = (window.__AFUI__ && window.__AFUI__.notices && window.__AFUI__.notices.unread) || 0;
        for (const n of NAV) {
            if (n.id !== o.page) {
                const label = (n.id === 'notices' && unread > 0) ? `${n.label} (${unread})` : n.label;
                cluster.push(`<button class="secondary" data-afnav="${n.id}">${label}</button>`);
            }
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
        // Two logical halves, each in its own wrapping group so they break onto
        // a second line cleanly instead of shuffling buttons past one another.
        // The divider rides on the nav group's left edge (only when there are
        // page actions to its left), so it can never orphan mid-wrap.
        const left = (o.controls || '') + (o.actions || '');
        const nav = `<div class="af-head-nav${left ? ' has-actions' : ''}">${cluster.join('')}</div>`;
        const bar = left ? `<div class="af-head-actions">${left}</div>${nav}` : nav;
        return `${STYLE}
            <div class="af-head">
                <div class="af-head-info"><h1>${o.title}</h1>${o.sub ? `<div class="muted small">${o.sub}</div>` : ''}</div>
                <div class="af-head-bar">${bar}</div>
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

    window.AFHeader = { html, wire, tabs };
})();
