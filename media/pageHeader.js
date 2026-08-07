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
        .af-head-bar { display:flex; gap:6px 8px; flex-wrap:wrap; align-items:center; justify-content:flex-end; margin-left:auto; min-width:0; }
        .af-head-actions, .af-head-nav { display:flex; gap:5px; flex-wrap:wrap; align-items:center; justify-content:flex-end; min-width:0; }
        .af-head-nav.has-actions { border-left:1px solid var(--vscode-widget-border,#4444); margin-left:2px; padding-left:9px; }
        /* THIS row only. A dozen destinations plus the page's own actions was
           overflowing and wrapping onto a second line, and a toolbar that moves
           under the cursor is worse than a slightly tighter one. Nothing is
           renamed, hidden or reordered — the buttons here are simply denser
           than the page's own body buttons, which keep their normal size. */
        .af-head-bar button { font-size:11px; padding:3px 8px; }
        .af-head-bar .af-nav-n { opacity:.85; }
        /* A nav button a page has claimed (see navActions): ONE button, whose
           two meanings live in a menu under it. Two buttons side by side ate a
           quarter of the toolbar's width for a destination nobody reaches twice. */
        .af-claim { position:relative; display:inline-flex; }
        .af-claim-menu { position:absolute; top:calc(100% + 4px); right:0; z-index:40; min-width:150px;
            display:flex; flex-direction:column; padding:4px; border-radius:6px;
            border:1px solid var(--vscode-menu-border, var(--vscode-widget-border,#4444));
            background:var(--vscode-menu-background, var(--vscode-editorWidget-background));
            box-shadow:0 3px 10px #0006; }
        .af-claim-menu[hidden] { display:none; }
        .af-claim-menu button { text-align:left; white-space:nowrap; border:none; border-radius:4px;
            background:transparent; color:var(--vscode-menu-foreground, var(--vscode-foreground));
            padding:5px 9px; font-size:12px; cursor:pointer; }
        .af-claim-menu button:hover { background:var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
            color:var(--vscode-menu-selectionForeground, inherit); }
    </style>`;

    // Order is meaning, not arrival: the board you start from, the place you
    // talk, the three vital signs, what is happening right now, then who does
    // the work and what the work is. New pages take their place in that
    // sequence — they do not pile up on the left.
    const NAV = [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'projects', label: '◧ Projects' },
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

    /**
     * The two live counts, read fresh from window.__AFUI__ — which the host
     * keeps current by pushing { type:'afui' } (see afCounts below). 🔔 unread
     * notices, 📥 queue items that need you.
     */
    function counts() {
        const ui = window.__AFUI__ || {};
        return {
            notices: (ui.notices && ui.notices.unread) || 0,
            queue: (ui.queue && ui.queue.blocked) || 0
        };
    }

    /** A count badge. ALWAYS rendered — empty at zero — and marked with
     *  data-afcount, so a changed count is a text swap on an element that is
     *  already there rather than a re-render (see afCounts). */
    function badge(id, cls) {
        const n = counts()[id] || 0;
        return `<span class="${cls}" data-afcount="${id}">${n ? ` (${n})` : ''}</span>`;
    }

    function tabs(active) {
        const T = [
            { id: 'notices', label: '🔔 Notices' },
            { id: 'queue', label: '📥 Queue' }
        ];
        return `${TAB_STYLE}<div class="af-tabs">` + T.map(t =>
            `<button class="af-tab ${t.id === active ? 'on' : ''}" data-afnav="${t.id}">${t.label}${badge(t.id, 'af-tab-n')}</button>`
        ).join('') + `</div>`;
    }

    /**
     * ‼️ A NUMBER ON SCREEN MUST NEVER OUTLIVE THE THING IT COUNTS.
     *
     * The counts ride in window.__AFUI__, which the HTML shell writes ONCE — so
     * a page that only refreshes its data kept showing the count it was BUILT
     * with: delete 16 unread notices and the tab strip still said "🔔 Notices
     * (16)" (and so did every other open page's nav) until that page was
     * rebuilt. The host now pushes the pair on every change; here we take it,
     * update __AFUI__ so the next render agrees, and repaint the badges in
     * place — a full re-render would throw away scroll position, open menus and
     * half-typed drafts for the sake of two digits.
     *
     * Wired once per page, on load, so it survives every re-render.
     */
    function paintCounts() {
        const n = counts();
        document.querySelectorAll('[data-afcount]').forEach(el => {
            const v = n[el.dataset.afcount] || 0;
            el.textContent = v ? ` (${v})` : '';
        });
    }

    if (!window.__afCountsWired && typeof window.addEventListener === 'function') {
        window.__afCountsWired = true;
        window.addEventListener('message', ev => {
            const m = ev && ev.data;
            if (!m || m.type !== 'afui' || !m.afui) { return; }
            window.__AFUI__ = Object.assign({}, window.__AFUI__, m.afui);
            paintCounts();
        });
    }

    /**
     * o: {
     *   page,        // 'dashboard'|'timeline'|'agent'|'viewer'|'board'|'needs'|
     *                //   'capabilities'|'memgraph'|'gallery'|'settings'|'search'
     *   title,       // h1 content (caller escapes)
     *   sub,         // optional line under the title
     *   controls,    // optional html — scope selectors (segments / filter selects)
     *   actions,     // optional html — page action buttons, most important first
     *   related,     // optional [{nav, label}] — related panels, after Live Timeline,
     *                //   or [{action, label, title}] — a page-specific ACTION that
     *                //   belongs with the destinations rather than with the scope
     *                //   controls (a rare thing: a whole-farm operation a single
     *                //   page owns). It posts { type:'headerAction', action } and
     *                //   sits in the same row, so the page's controls above keep
     *                //   their own line.
     *   searchTitle, // optional tooltip when ⌕ Search is page-scoped
     *   refresh,     // false to omit the Refresh button (pages with nothing to re-scan)
     *   navActions,  // optional { <navId>: {label, title} } — this page claims
     *                //   that nav button for its own subject; the button stays ONE
     *                //   button and opens a small menu: the claimed action first,
     *                //   then the plain page. `label` is two or three words — a
     *                //   menu is a list of choices, not a place to explain them.
     *                //   Pass the matching { <navId>: {onClick} } to wire().
     *   guide        // guide anchor for ? Guide (omit → no button)
     * }
     */
    function html(o) {
        const cluster = [];
        for (const n of NAV) {
            if (n.id === o.page) { continue; }
            // 🔔 Notices carries the unread count in parentheses — "🔔 Notices
            // (3)"; the parens vanish once nothing is unread. Its own badge
            // element, so the live push can repaint it (see afCounts).
            const label = n.id === 'notices' ? `${n.label}${badge('notices', 'af-nav-n')}` : n.label;
            // A page may claim a nav button for its own subject: on the agent
            // page "Console" should mean *talk to THIS agent*, on a session's
            // page *continue THIS session there*. The button stays one button
            // and never changes meaning silently — it opens a two-item menu,
            // the claimed action first and the plain page under it, so nothing
            // that used to work stops working and the toolbar keeps its width.
            const claim = (o.navActions || {})[n.id];
            if (claim) {
                // "Open Notices" — the bare page name, from the plain label:
                // the menu item names a destination, not a count.
                const plain = n.label.replace(/^[^\w]+\s*/, '');
                cluster.push(`<span class="af-claim">
                    <button class="secondary" data-afclaim="${n.id}" aria-haspopup="true" aria-expanded="false"
                        title="${claim.title || ''}">${label} ▾</button>
                    <div class="af-claim-menu" data-afclaimmenu="${n.id}" hidden>
                        <button data-afclaimgo="${n.id}">${claim.label}</button>
                        <button data-afnav="${n.id}">Open ${plain}</button>
                    </div>
                </span>`);
                continue;
            }
            cluster.push(`<button class="secondary" data-afnav="${n.id}">${label}</button>`);
        }
        for (const r of o.related || []) {
            if (r.action) {
                cluster.push(`<button class="secondary" data-afact="${r.action}"${r.title ? ` title="${r.title}"` : ''}>${r.label}</button>`);
                continue;
            }
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
        // ‼️ THE PAGE'S TITLE IS A ROW TOO. A session listed in a table carries
        // the whole session menu on right-click; on that session's OWN page the
        // heading offered Copy/Paste and nothing else — the one place where
        // there is no doubt which session you mean was the one place you could
        // not act on it. `infoCtx` is a data-vscode-context attribute (see
        // afSessionCtx.js) and covers the title block, heading and subtitle
        // alike, because both name the same object.
        const info = o.infoCtx ? ` ${o.infoCtx}` : '';
        return `${STYLE}
            <div class="af-head">
                <div class="af-head-info"${info}><h1>${o.title}</h1>${o.sub ? `<div class="muted small">${o.sub}</div>` : ''}</div>
                <div class="af-head-bar">${bar}</div>
            </div>`;
    }

    /**
     * Call after html() landed in the DOM (i.e. at the end of each render).
     * Posts { type:'afnav', to } — routed by one shared handler on the
     * extension side (handleAfNav; pages with a scoped ⌕ Search intercept
     * to:'search' before delegating) — plus { type:'headerAction', action }
     * for a `related` entry that is an action, { type:'refresh' } and
     * { type:'openGuide', anchor }. hooks.onRefresh overrides the refresh
     * post for pages that must do extra client work first.
     */
    function wire(vscode, hooks) {
        document.querySelectorAll('[data-afnav]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({ type: 'afnav', to: b.dataset.afnav })));
        document.querySelectorAll('[data-afact]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({ type: 'headerAction', action: b.dataset.afact })));
        // A claimed nav button opens its menu; the menu's first item is the
        // page's own meaning, the second is the plain page (wired by data-afnav
        // above). Any click elsewhere, or Escape, closes it.
        const closeClaims = () => document.querySelectorAll('[data-afclaimmenu]').forEach(m => {
            m.hidden = true;
            const btn = m.parentElement && m.parentElement.querySelector('[data-afclaim]');
            if (btn) { btn.setAttribute('aria-expanded', 'false'); }
        });
        document.querySelectorAll('[data-afclaim]').forEach(b =>
            b.addEventListener('click', ev => {
                ev.stopPropagation();
                const menu = b.parentElement.querySelector('[data-afclaimmenu]');
                const open = menu && menu.hidden;
                closeClaims();
                if (menu && open) { menu.hidden = false; b.setAttribute('aria-expanded', 'true'); }
            }));
        document.querySelectorAll('[data-afclaimgo]').forEach(b =>
            b.addEventListener('click', () => {
                closeClaims();
                const claim = ((hooks && hooks.navActions) || {})[b.dataset.afclaimgo];
                if (claim && claim.onClick) { claim.onClick(); }
            }));
        document.querySelectorAll('[data-afclaimmenu] [data-afnav]').forEach(b =>
            b.addEventListener('click', closeClaims));
        // Document-level listeners survive re-renders, so they are attached once.
        if (!window.__afClaimWired && typeof document.addEventListener === 'function') {
            window.__afClaimWired = true;
            document.addEventListener('click', () => closeClaims());
            document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { closeClaims(); } });
        }
        document.querySelectorAll('.af-refresh').forEach(b =>
            b.addEventListener('click', () => {
                if (hooks && hooks.onRefresh) { hooks.onRefresh(); return; }
                vscode.postMessage({ type: 'refresh' });
            }));
        document.querySelectorAll('[data-afguide]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({ type: 'openGuide', anchor: b.dataset.afguide })));
    }

    /**
     * The same "one button, two meanings" menu, for a page's OWN action buttons.
     *
     * ‼️ A BUTTON THAT STARTS SOMETHING SOMEWHERE MUST SAY WHERE. Start session /
     * Start session… / Continue latest all went straight to a terminal without a
     * word, so the Console — the other place a session can live — was invisible
     * from every button that starts one. Two buttons side by side would double
     * the row for a choice made in one keystroke, so the button keeps its name
     * and opens the choice under itself. Same markup and same wiring as a claimed
     * nav button, so the two menus look and behave identically.
     *
     *   menu({ id, label, title, items:[{ id, label, title }] }) → html
     *   wireMenu(root, id, pick => …)                            → click handling
     */
    function menu(o) {
        const items = (o.items || []).map(i =>
            `<button data-afmenugo="${o.id}" data-afmenuitem="${i.id}"${i.title ? ` title="${i.title}"` : ''}>${i.label}</button>`
        ).join('');
        return `<span class="af-claim">
            <button class="secondary" data-afclaim="${o.id}" aria-haspopup="true" aria-expanded="false"
                title="${o.title || ''}">${o.label} ▾</button>
            <div class="af-claim-menu" data-afclaimmenu="${o.id}" hidden>${items}</div>
        </span>`;
    }

    function wireMenu(root, id, onPick) {
        const scope = root || document;
        scope.querySelectorAll(`[data-afmenugo="${id}"]`).forEach(b =>
            b.addEventListener('click', () => {
                const m = scope.querySelector(`[data-afclaimmenu="${id}"]`);
                if (m) { m.hidden = true; }
                onPick(b.dataset.afmenuitem);
            }));
    }

    window.AFHeader = { html, wire, tabs, menu, wireMenu, counts, paintCounts };
})();
