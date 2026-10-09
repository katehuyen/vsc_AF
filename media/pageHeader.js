// Agent Farm — shared page header + toolbar, used by EVERY full-page panel.
// One layout everywhere: title/subtitle on the left; one right-aligned toolbar
// whose left half is the page's own scope controls and actions, and whose
// right half — after a thin divider — is the GLOBAL cluster, identical on
// every page (minus the page itself):
//   Dashboard · Live Timeline · Tasks · Missions · Wiki · Toolbox · [related panel] · ⌕ Search · 🔌 Engines · ⚙ Settings · Refresh · ? Guide
// A page owning several destinations of its own can send that `related` cluster
// to a second, equally right-aligned row (`relatedRow`) instead of lengthening
// the global one.
// Pages differ only in their left half; the right half is muscle memory.
// Alignment, gaps and wrapping come from here — pages must not hand-roll
// their own header rows.
(function () {
    'use strict';
    // U-189 — every word this row draws goes through the interface language (media/afI18n.js).
    const t = (s, v) => window.AFI18n.t(s, v);
    const tl = s => window.AFI18n.label(s);

    const STYLE = `<style>
        .af-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px 24px; flex-wrap:wrap; margin:0 0 10px; }
        .af-head-info { flex:1 1 260px; min-width:200px; }
        /* U-147 — the running build, flush right on the title's own line. The
           info block takes the whole first row when it carries one, so the
           stamp sits in the far corner rather than just left of the toolbar. */
        .af-head-info.af-head-full { flex-basis:100%; }
        .af-head-title { display:flex; align-items:baseline; gap:12px; min-width:0; }
        .af-head-ver { margin-left:auto; font-size:11px; opacity:.65; white-space:nowrap;
            color:var(--vscode-descriptionForeground); font-variant-numeric:tabular-nums; }
        /* The toolbar is two wrapping halves (page actions | global nav) that
           break onto a second line as UNITS — never intermixing, never leaving
           the divider stranded — so many-button pages stay tidy at any width. */
        .af-head-bar { display:flex; gap:6px 8px; flex-wrap:wrap; align-items:center; justify-content:flex-end; margin-left:auto; min-width:0; }
        .af-head-actions, .af-head-nav { display:flex; gap:5px; flex-wrap:wrap; align-items:center; justify-content:flex-end; min-width:0; }
        .af-head-nav.has-actions { border-left:1px solid var(--vscode-widget-border,#4444); margin-left:2px; padding-left:9px; }
        /* ‼️ U-83 — A PAGE'S OWN DESTINATIONS MAY TAKE THEIR OWN LINE. Four of
           them appended to a twelve-button global row is a toolbar that wraps
           under the cursor at any window the user actually works at, and the
           four that get pushed onto line two are chosen by width rather than by
           meaning. relatedRow makes the split deliberate: the global cluster
           keeps line one, the page's own cluster gets line two, both flush
           right so the two rows share an edge and read as one block. It is a
           full-width flex child of .af-head, so it wraps to its own line
           without any of the halves above it moving. */
        .af-head-more { flex:1 0 100%; display:flex; gap:6px 8px; flex-wrap:wrap; align-items:center; justify-content:flex-end; margin-top:-4px; }
        /* THIS row only. A dozen destinations plus the page's own actions was
           overflowing and wrapping onto a second line, and a toolbar that moves
           under the cursor is worse than a slightly tighter one. Nothing is
           renamed, hidden or reordered — the buttons here are simply denser
           than the page's own body buttons, which keep their normal size. */
        .af-head-bar button, .af-head-more button { font-size:11px; padding:3px 8px; }
        /* a filter row here measures its pickers in the 11px button's ch (common.css .afms-fit) */
        .af-head-bar .afms-fit .afms, .af-head-more .afms-fit .afms { font-size:11px; }
        .af-head-bar .af-nav-n { opacity:.85; }
        /* ‼️ U-68 — THE ONES THAT ARE THE SAME EVERYWHERE ARE DRAWN AS THEIR
           ICON ALONE. Evals, ⌕, 🔌, ⚙, ⟳ and ? are on every page in the same order,
           so they are the row's cheapest width: nobody reads them, they are
           aimed at. Fixed width so the cluster's right edge does not move from
           page to page, and the whole name is one hover away (SHORTHAND). */
        .af-head-bar .af-ico { min-width:24px; padding:3px 0; text-align:center; }
        .af-head-bar .af-ico[data-afsound="off"] { opacity:.55; }
        /* An AFTip wrapper is the flex child once a button is wrapped, so it
           has to sit in the row exactly as the bare button did. */
        .af-head-bar .af-tipw-nav, .af-head-more .af-tipw-nav { display:inline-flex; align-items:center; }
        /* ‼️ HERE THE FIRST LINE IS THE NAME, NOT A FIGURE. The panel's head is
           normally a faded caption above the figures it heads; on this row it
           is the one thing the control may not be showing at all, so it is read
           first and drawn that way. */
        .af-tipw-nav .af-tiph { font-size:12px; opacity:.95; }
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
    // talk and what is happening right now beside it, the three vital signs,
    // then who does the work and what the work is. New pages take their place in that
    // sequence — they do not pile up on the left.
    //
    // ‼️ U-68 — `tip` IS PART OF THE ENTRY, NOT A DECORATION. This row is the
    // one control every page shares, and it was the one control with no hovers:
    // a dozen destinations, most of them a single word, and nothing anywhere
    // said what any of them opened. `name` is the FULL name — it opens the
    // hover panel, so a button that is shortened to an icon (or that will be)
    // still says what it is; `tip` is what the page is for, in one sentence a
    // reader can act on. A new destination without both is an unfinished one.
    const NAV = [
        {
            id: 'dashboard', label: 'Dashboard',
            tip: 'The board you start from: every engine\'s sessions in one table, with the day\'s spend, '
                + 'what is running and what needs you. The cost, token and model figures are read from '
                + 'Claude transcripts only.'
        },
        {
            id: 'projects', label: '◧ Projects',
            tip: 'Every project you run — its charter, plan, backlog, worklog and documents, and the '
                + 'sessions, tasks and missions filed to it.'
        },
        {
            id: 'console', label: '💬 Console',
            tip: 'Talk to any engine in a panel inside VS Code — a hosted conversation rather than a '
                + 'terminal, so its turns, cost and transcript are recorded like every other session.'
        },
        {
            id: 'now', label: '◉ Now',
            tip: 'One screen of what waits for you, what is running, today\'s spend and quotas and the '
                + 'latest notices, with a box that speaks into a running session. The phone opens it first.'
        },
        {
            id: 'living', label: '💓 Living',
            tip: 'Is the system alive? Your own loops — a file that should exist, a folder that should be '
                + 'empty, a queue that should be short — each one a row that passes or fails.'
        },
        {
            id: 'notices', label: '🔔 Notices',
            tip: 'What the agents want to tell you: questions waiting on an answer, results and reports. '
                + 'The number beside the name is how many are still unread.'
        },
        {
            id: 'queue', label: '📥 Queue',
            tip: 'The shared work queue — what is waiting, what has been taken, and what is blocked until '
                + 'somebody answers it. The number is how many need you.'
        },
        {
            id: 'timeline', label: 'Live Timeline',
            tip: 'Every turn of every session on one clock: fed by Claude Code\'s hooks and by every '
                + 'conversation the Console hosts, on any engine.'
        },
        {
            id: 'portfolio', label: 'Agents',
            tip: 'The fleet, agent by agent — what each one costs, when it last worked, whether it has '
                + 'gone dormant, and which project it belongs to.'
        },
        {
            id: 'tasks', label: 'Tasks',
            tip: 'Plan what runs and see what ran: schedules, triggers and one-off runs, with their '
                + 'output, their cost and why a run did not happen.'
        },
        {
            id: 'missions', label: 'Missions',
            tip: 'Dynamic orchestration — a lead agent plans round by round, delegates to the team under a '
                + 'budget, and finishes with an honest verdict.'
        },

        {
            id: 'studio', label: '🎬 Studio',
            tip: 'Media production: productions and their scenes, the prompts and renders behind each one, '
                + 'the providers used and what the month has cost.'
        },
        // U-83: the Wiki was reachable from the Toolbox's own row and nowhere
        // else — a destination that is about the whole farm's knowledge, filed
        // behind one page. It sits between Studio and Toolbox because that is
        // where the row turns from "what is being made" to "what it is made of".
        {
            id: 'wiki', label: '📚 Wiki',
            tip: 'The turns marked as worth keeping, and what the compiles made of them — the candidate '
                + 'pool on one side, the vault\'s own pages on the other.'
        },
        {
            id: 'toolbox', label: 'Toolbox',
            tip: 'Everything that extends Claude Code — skills, subagents, slash commands, hooks, plugins '
                + 'and MCP servers, in user and agent scope. This is Claude Code\'s own extension model; '
                + 'the other engines do not read it.'
        },
        // U-14: evals had no page at all until the sweep built one.
        {
            id: 'evals', label: '🧪 Evals', icon: '🧪',
            tip: 'Scored runs against an agent\'s own cases — what still passes after a change to a '
                + 'prompt, a model or an engine, and what it cost to find out.'
        },
        // U-179 — one icon that is also the state: 🔊 rings · 🔇 muted · 🌙 quiet hours · 🔈 nothing on.
        {
            id: 'sound', label: '🔊 Sound', icon: '🔊',
            tip: 'What rings on which event, whether the agent\'s name is said, quiet hours and your own sounds.'
        }
    ];
    // S-123 — a destination with no seat in the global row, which is full at 1200px (test_sound_header):
    // described once here and drawn as a page's `related` button (Tasks, Missions), never restated there.
    // S-125 — the phone's Menu sheet has no width to fill, so it lists these too (pages()).
    const N_ = s => s;
    const OFF_ROW = [
        {
            id: 'chains', label: N_('⑂ Chains'),
            tip: 'Every baton relay in one table — where each chain stands, its legs, what it cost and what '
                + 'the next leg opens on, with the controls to continue, brake or end it.'
        }
    ];
    // U-179 — the 🔊's state and its in-place repaint live with the other sound parts (afSoundCard.js).
    const soundNav = () => window.AFSoundCard && window.AFSoundCard.navState
        ? window.AFSoundCard.navState(NAV.find(n => n.id === 'sound').tip)
        : { icon: '🔊', state: '', head: 'Sound', tip: NAV.find(n => n.id === 'sound').tip };
    const paintSound = () => { if (window.AFSoundCard && window.AFSoundCard.paintNav) { window.AFSoundCard.paintNav(); } };

    /** The full name behind a label that carries an icon: '🔔 Notices' → 'Notices'.
     *  One rule, so a menu item, an aria-label and a hover panel can never
     *  disagree about what a destination is called. */
    function plainName(label) {
        // Letters in any script: `[^\w]` also stripped the Ç of a Turkish "Çalışma".
        return String(label || '').replace(/^[^\p{L}\p{N}]+/u, '');
    }

    /**
     * ‼️ U-68 — A BUTTON IN THIS ROW IS BUILT HERE OR IT IS BUILT WRONG.
     *
     * Every one of them carries the same three things: what it draws, its FULL
     * name, and one sentence saying what it opens. The name goes on the panel's
     * first line because this row is where text gets cut — some of these are an
     * icon and nothing else, and the rest are one word that will be shortened
     * the next time the toolbar runs out of width (SHORTHAND + MIRROR,
     * docs/CONVENTIONS.md → The five names).
     *
     * The native `title` is the fallback and only the fallback: AFTip.wrap hands
     * the trigger straight back when there is no body, which would otherwise
     * leave a button with no hover at all — the exact state this item was filed
     * about.
     */
    function navBtn(o) {
        const label = tl(o.label || '');
        const name = o.name ? t(o.name) : plainName(label);
        const inner = o.icon || label;
        const cls = 'secondary' + (o.icon ? ' af-ico' : '') + (o.cls ? ' ' + o.cls : '');
        // Icon-only means the name is not on screen at all, so it has to be in
        // the accessibility tree instead of only in a hover.
        const aria = o.icon ? ` aria-label="${name}"` : '';
        const tip = t(String(o.tip || '').trim());
        const btn = `<button class="${cls}" ${o.attrs || ''}${aria}`
            + `${tip ? '' : ` title="${name}"`}>${inner}${o.after || ''}</button>`;
        return window.AFTip ? window.AFTip.wrap(btn, name, tip, 'af-tipw-nav', o.wrapAttrs || '') : btn;
    }

    // Notices ↔ Queue read as two tabs of ONE inbox, and the A2A pair beside
    // them (N-6) is the agents' own inbox: what they leave for each other and
    // the work they hand over. All four pages render this strip at the very
    // top; an inactive tab is an afnav button that opens that panel. Counts
    // ride along: 🔔 unread, 📥 items that need you (blocked) — and, in GREY
    // because they are the fleet's business and never the status-bar bell's,
    // 🤖 live notes and ⚡ open tasks.
    const TAB_STYLE = `<style>
        .af-tabs { display:flex; gap:4px; margin:0 0 12px; border-bottom:1px solid var(--vscode-panel-border); align-items:flex-end; }
        .af-tab { padding:7px 16px; border:none; border-bottom:2px solid transparent; border-radius:6px 6px 0 0;
            background:transparent; color:var(--vscode-foreground); opacity:calc(1 - .35 * var(--af-dimk, 1)); font-size:13px; cursor:pointer; }
        .af-tab:hover { opacity:.9; background:var(--vscode-list-hoverBackground); }
        .af-tab.on { opacity:1; font-weight:600; border-bottom-color:var(--vscode-textLink-foreground); background:var(--vscode-editorWidget-background); }
        .af-tab .af-tab-n { opacity:calc(1 - .2 * var(--af-dimk, 1)); font-weight:400; }
        .af-tab .af-tab-grey { opacity:calc(1 - .45 * var(--af-dimk, 1)); font-weight:400; font-size:12px; }
        .af-tab-sep { width:1px; height:18px; margin:0 6px 8px; background:var(--vscode-panel-border); opacity:.8; }
    </style>`;

    /**
     * The live counts, read fresh from window.__AFUI__ — which the host keeps
     * current by pushing { type:'afui' } (see afCounts below). 🔔 unread
     * notices, 📥 queue items that need you; 🤖 live A2A notes, ⚡ open A2A
     * tasks (the last two travel under `a2a`, and only the tab strip draws them).
     */
    function counts() {
        const ui = window.__AFUI__ || {};
        return {
            notices: (ui.notices && ui.notices.unread) || 0,
            queue: (ui.queue && ui.queue.blocked) || 0,
            a2anotes: (ui.a2a && ui.a2a.notes) || 0,
            a2atasks: (ui.a2a && ui.a2a.tasks) || 0
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
            { id: 'notices', label: '🔔 Notices', cls: 'af-tab-n' },
            { id: 'queue', label: '📥 Queue', cls: 'af-tab-n' },
            { sep: true },
            { id: 'a2anotes', label: '🤖 A2A Notes', cls: 'af-tab-n af-tab-grey' },
            { id: 'a2atasks', label: '⚡ A2A Tasks', cls: 'af-tab-n af-tab-grey' }
        ];
        return `${TAB_STYLE}<div class="af-tabs">` + T.map(t => t.sep
            ? '<span class="af-tab-sep" aria-hidden="true"></span>'
            : `<button class="af-tab ${t.id === active ? 'on' : ''}" data-afnav="${t.id}">${tl(t.label)}${badge(t.id, t.cls)}</button>`
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
            // U-154 — the quota figures' own look, re-sent when the user changes it
            const qs = typeof m.afui.quotaCss === 'string' && document.getElementById
                ? document.getElementById('afq-style') : null;
            if (qs) { qs.textContent = m.afui.quotaCss; }
            paintCounts();
            if (m.afui.sound) { paintSound(); }
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
     *   relatedRow,  // true → the `related` cluster gets its OWN row under the
     *                //   global one, still flush right. For a page that owns
     *                //   several destinations: four extra buttons on the global
     *                //   row wrap it at any real window width, and which four
     *                //   fall to line two is then decided by pixels rather than
     *                //   by meaning.
     *   searchTitle, // optional tooltip when ⌕ Search is page-scoped
     *   refresh,     // false to omit the Refresh button (pages with nothing to re-scan)
     *   version,     // true → the running build (window.__AFUI__.version) flush right
     *                //   on the title's line. Dashboard and Farm Settings only (U-147).
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
        // U-176 — the phone's tab bar marks the page it is on
        if (window.AFMobile) { window.AFMobile.page(o.page); }
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
                const plain = plainName(n.label);
                // The claimed button keeps the row's one hover contract: its own
                // full name first, then what THIS page has made it mean, then
                // the destination it still is underneath.
                const trigger = navBtn({
                    label: label, name: plain, icon: n.icon,
                    attrs: `data-afclaim="${n.id}" aria-haspopup="true" aria-expanded="false"`,
                    // ‼️ U-74 — WHILE THE MENU IS OPEN THE BUTTON HAS NOTHING TO
                    // EXPLAIN. Its panel and its menu occupy the same few pixels
                    // under the button, so a panel here is a paragraph standing
                    // in front of the choice being made. The press itself is
                    // handled by afTip.js; this covers coming BACK to the button
                    // with the menu still down.
                    wrapAttrs: 'data-aftip-mute=".af-claim.af-claim-open"',
                    after: ' ▾',
                    tip: (claim.title ? claim.title + '\n\n' : '')
                        + t('A menu: “{claim}”, or {page} itself.', { claim: claim.label, page: t(plain) })
                        + `\n\n${t(n.tip || '')}`
                });
                cluster.push(`<span class="af-claim">
                    ${trigger}
                    <div class="af-claim-menu" data-afclaimmenu="${n.id}" hidden>
                        <button data-afclaimgo="${n.id}">${claim.label}</button>
                        <button data-afnav="${n.id}">${t('Open {page}', { page: t(plain) })}</button>
                    </div>
                </span>`);
                continue;
            }
            // `label` already carries the count badge where there is one, and it
            // is still the same element the live push repaints (see afCounts).
            if (n.id === 'sound') {
                const s = soundNav();
                cluster.push(navBtn({
                    label: label, name: s.head, icon: s.icon,
                    attrs: `data-afnav="sound" data-afsound="${s.state}"`, tip: s.tip,
                    wrapAttrs: 'data-aftip-mute="body.af-rp-open"'
                }));
                continue;
            }
            cluster.push(navBtn({
                label: label, name: plainName(n.label), icon: n.icon,
                attrs: `data-afnav="${n.id}"`, tip: n.tip
            }));
        }
        // `relatedRow` sends this cluster to a line of its own under the global
        // one (see .af-head-more). The buttons are built exactly the same way
        // either way — only where they land changes.
        const more = [];
        const relatedInto = o.relatedRow ? more : cluster;
        for (const r of o.related || []) {
            if (r.action) {
                relatedInto.push(navBtn({
                    label: r.label, name: r.name, attrs: `data-afact="${r.action}"`, tip: r.title || ''
                }));
                continue;
            }
            // A related entry pointing at a page the global row already knows
            // inherits its sentence rather than restating it — one description
            // per destination, wherever the button to it happens to sit.
            const known = NAV.find(n => n.id === r.nav) || OFF_ROW.find(n => n.id === r.nav);
            relatedInto.push(navBtn({
                label: r.label, name: r.name, attrs: `data-afnav="${r.nav}"`,
                tip: r.title || (known && known.tip) || ''
            }));
        }
        if (o.page !== 'search') {
            cluster.push(navBtn({
                name: 'Search', icon: '⌕', attrs: 'data-afnav="search"',
                tip: o.searchTitle || 'Search across the whole farm — sessions, tasks, agents, notices, '
                    + 'documents and the transcripts themselves, in one query.'
            }));
        }
        // The Engines page was reachable from the Dashboard's Farm Status row
        // and from the Settings page and nowhere else — a destination about
        // what this machine can run at all, filed two clicks behind two pages.
        if (o.page !== 'engines') {
            cluster.push(navBtn({
                name: 'Engines', icon: '🔌', attrs: 'data-afnav="engines"',
                tip: 'Which agent CLI this machine can actually run and how each one is paid for — '
                    + 'sign-ins, keys and captured accounts, with a real call that proves a turn gets through.'
            }));
        }
        if (o.page !== 'settings') {
            cluster.push(navBtn({
                name: 'Settings', icon: '⚙', attrs: 'data-afnav="settings"',
                tip: 'All agentFarm settings in one page, with saveable setting sets.'
            }));
        }
        if (o.refresh !== false) {
            cluster.push(navBtn({
                name: 'Refresh', icon: '⟳', cls: 'af-refresh',
                tip: 'Read this page\'s data again from where it lives. It re-reads what is already '
                    + 'recorded — nothing is started, nothing is spent.'
            }));
        }
        if (o.guide) {
            cluster.push(navBtn({
                name: 'Guide', icon: '?', attrs: `data-afguide="${o.guide}"`,
                tip: 'The built-in guide, opened at this page\'s own section.'
            }));
        }
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
        // The second row stays INSIDE .af-head: wire() scopes header actions to
        // `.af-head [data-afact]` on purpose (an unscoped query also caught
        // every AFForm Submit), so a related ACTION lifted out of the box would
        // silently stop posting.
        const moreRow = more.length ? `<div class="af-head-more">${more.join('')}</div>` : '';
        // U-147 — asked for by the page, read from what the host says is
        // running (never typed into a page), and absent rather than "v" when
        // the host said nothing.
        const ver = o.version ? String((window.__AFUI__ || {}).version || '').replace(/[^0-9A-Za-z.+-]/g, '') : '';
        const title = ver
            ? `<div class="af-head-title"><h1>${o.title}</h1><span class="af-head-ver" title="${t('Agent Farm {version} — the build running in this window', { version: ver })}">v${ver}</span></div>`
            : `<h1>${o.title}</h1>`;
        return `${STYLE}
            <div class="af-head">
                <div class="af-head-info${ver ? ' af-head-full' : ''}"${info}>${title}${o.sub ? `<div class="muted small">${o.sub}</div>` : ''}</div>
                <div class="af-head-bar">${bar}</div>
                ${moreRow}
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
        // U-206 — while a reading lasts the header's 🔊 opens the reading's player (afReadingPlayer.js) instead.
        document.querySelectorAll('[data-afnav]').forEach(b =>
            b.addEventListener('click', ev => {
                if (window.AFReadingPlayer && window.AFReadingPlayer.claim(b, ev, vscode)) { return; }
                vscode.postMessage({ type: 'afnav', to: b.dataset.afnav });
            }));
        // ‼️ SCOPED TO THE HEADER, and that is not tidiness. `data-afact` is also
        // what afForm.js puts on a card's Submit and Cancel, so an unscoped query
        // bound every form button on the page to this handler as well: pressing
        // Save in any AFForm card posted a spurious
        // { type:'headerAction', action:'submit' } alongside the page's own
        // message. Harmless only for as long as no `related` action is ever named
        // "submit" or "cancel" — which is exactly the kind of collision that is
        // invisible until it is not. A header action lives in `.af-head` and
        // nowhere else, so this is the whole fix.
        document.querySelectorAll('.af-head [data-afact]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({ type: 'headerAction', action: b.dataset.afact })));
        // A claimed nav button opens its menu; the menu's first item is the
        // page's own meaning, the second is the plain page (wired by data-afnav
        // above). Any click elsewhere, or Escape, closes it.
        const closeClaims = () => document.querySelectorAll('[data-afclaimmenu]').forEach(m => {
            m.hidden = true;
            if (m.parentElement) { m.parentElement.classList.remove('af-claim-open'); }
            const btn = m.parentElement && m.parentElement.querySelector('[data-afclaim]');
            if (btn) { btn.setAttribute('aria-expanded', 'false'); }
        });
        document.querySelectorAll('[data-afclaim]').forEach(b =>
            b.addEventListener('click', ev => {
                ev.stopPropagation();
                // The button is wrapped in an AFTip wrapper, so the menu is not
                // its sibling any more — it is the wrapper's.
                const box = b.closest('.af-claim') || b.parentElement;
                const menu = box && box.querySelector('[data-afclaimmenu]');
                const open = menu && menu.hidden;
                closeClaims();
                if (menu && open) {
                    menu.hidden = false;
                    // U-74: the state the button's own hover panel reads to know
                    // it is standing in front of a choice.
                    box.classList.add('af-claim-open');
                    b.setAttribute('aria-expanded', 'true');
                }
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

    /** Every destination, for the phone's Menu sheet (media/afMobile.js). */
    function pages() { return NAV.concat(OFF_ROW).map(n => ({ id: n.id, label: tl(n.label), tip: t(n.tip) })); }

    window.AFHeader = { html, wire, tabs, menu, wireMenu, counts, paintCounts, pages };
})();
