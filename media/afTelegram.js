// Agent Farm — THE TELEGRAM BRIDGE CARD, drawn once and read on two surfaces.
//
// ‼️ WHY THIS IS A COMPONENT AND NOT A SECOND CARD (U-84).
//
// U-84 asks for this card on the Toolbox AND in Farm Settings. Written twice,
// the two copies disagree the first day one of them is touched — and they
// disagree in the worst possible way, because the fact this card carries is
// "is the bridge working?". A stale green badge is not a cosmetic defect: it is
// the page telling somebody their phone can reach the farm when it cannot.
//
// ‼️ AND THE CARD DECIDES NOTHING. `status` and `budget` arrive already worked
// out by `src/core/telegramCockpit.ts`, which is measured against what
// `applyChatBridge()` really does. A page that re-derived "is it running" from
// `enabled && hasToken` would be a second copy of the launch rules living in a
// file nobody thinks of as launch logic.
//
// ‼️ THE TWO SURFACES DIFFER IN ONE THING ONLY, and it is a rule rather than a
// taste: ONE SUBJECT. Farm Settings already draws `telegram.enabled`,
// `allowedChats`, `maxDailyUSD` and `defaultAgent` as its own rows two inches
// below the card — so there the card carries ONLY what those rows cannot say
// (is there a token, which bot, is the poller alive, what has been spent
// today). The Toolbox has no settings rows, so there the card carries the
// controls too. `opts.controls` is that difference, and there is no other.
(function () {
    'use strict';

    const esc = v => (window.AFCharts && window.AFCharts.esc)
        ? window.AFCharts.esc(v)
        : String(v === null || v === undefined ? '' : v);

    const TONE_DOT = { ok: '●', bad: '●', warn: '●', off: '○' };

    /** `no-token` reads as "no token" — the state ids are hyphenated for code,
     *  not for a person. */
    function words(state) { return String(state || '').replace(/-/g, ' '); }

    /** The one dot, for an overview row or a tab strip. */
    function dot(t) {
        if (!t) { return '⚙️'; }
        return `<span class="svc-dot t-${esc(t.status.tone)}">${TONE_DOT[t.status.tone] || '●'}</span>`;
    }

    function line(t) {
        return t ? 'Telegram bridge — ' + words(t.status.state) : 'not available';
    }

    /**
     * MIRROR — a control narrow enough to cut its own text puts its CURRENT
     * value on the first line of its tooltip, then the description.
     */
    function badge(s) {
        return window.AFTip.wrap(
            `<span class="svc-badge t-${esc(s.tone)}">${TONE_DOT[s.tone] || '●'} ${esc(words(s.state))}</span>`,
            'Telegram bridge — ' + words(s.state),
            s.detail + (s.next ? '\n\n' + s.next : '')
            + (s.lastError ? '\n\nLast error: ' + s.lastError : '')
            + '\n\nPolling: ' + (s.running ? 'the poller is alive' : 'nothing is being polled'),
            'svc-tip');
    }

    /**
     * ‼️ THE SWITCH DESCRIBES THE SETTING AND THE REALITY, WHICH ARE NOT THE
     * SAME FACT. `enabled: true` with no token in the vault is a switch that is
     * on and a bridge that is not polling anything — and a label reading "on —
     * polling Telegram" under a red "no token" badge is the card contradicting
     * itself in two adjacent lines. `running` already knows the difference.
     */
    function switchLabel(t) {
        if (!t.enabled) { return 'off — nothing is polled'; }
        return t.status.running ? 'on — polling Telegram' : 'on, but not polling yet';
    }

    function budgetTip(b) {
        const bar = `<span class="svc-bar"><i style="width:${b.pct}%" class="${b.blocked ? 'over' : ''}"></i></span>`;
        return window.AFTip.wrap(
            `<span class="svc-budget">$${b.spent.toFixed(4)} / $${b.cap.toFixed(2)} ${bar}</span>`,
            'Today’s chat-started spend',
            'Spent today: $' + b.spent.toFixed(4)
            + '\nCeiling: $' + b.cap.toFixed(2)
            + '\nLeft: $' + b.remaining.toFixed(4)
            + (b.blocked
                ? '\n\nThe ceiling is reached, so a message from chat is answered with a refusal rather than a run.'
                : '\n\nThe ledger rolls over at local midnight; yesterday’s total does not count against today.'),
            'svc-tip');
    }

    /** The head every surface shares: name, badge, bot, the two token buttons. */
    function head(t) {
        return `<div class="svc-head">
            <b>Telegram Bridge</b> ${badge(t.status)}
            ${t.botUsername ? `<span class="muted small">@${esc(t.botUsername)}</span>` : ''}
            <span class="svc-sp"></span>
            ${tokenButtons(t, 'mini')}
        </div>`;
    }

    /** The two acts that are not settings: ask Telegram who the bot is, and connect (or replace) its token. */
    function tokenButtons(t, cls) {
        return `<button class="${cls}" data-svc="verify">verify</button>
            <button class="${cls}" data-svc="connect">${t.hasToken ? 'replace token' : 'connect…'}</button>`;
    }

    /**
     * ‼️ THE FIGURE STRIP IS WHAT A SETTINGS FILE CANNOT ANSWER — which is
     * exactly why the card belongs on a page made of settings rows. Four facts,
     * none of them in any box: whether a token exists at all, whether the poller
     * is alive, how many chats the list actually admits, and what today has
     * cost against today's ceiling.
     */
    function facts(t) {
        const n = t.allowedChats.length;
        return `<div class="svc-facts">
            <span class="svc-fact">Token <b class="${t.hasToken ? 'svc-y' : 'svc-n'}">${t.hasToken ? 'in the vault' : 'none'}</b></span>
            <span class="svc-fact">Poller <b class="${t.status.running ? 'svc-y' : 'svc-n'}">${t.status.running ? 'alive' : 'stopped'}</b></span>
            <span class="svc-fact">Allowed chats <b class="${n ? 'svc-y' : 'svc-n'}">${n}</b></span>
            <span class="svc-fact">Today ${budgetTip(t.budget)}</span>
        </div>`;
    }

    /** The four controls — Toolbox only; see ONE SUBJECT at the top of the file. */
    function controls(t, agents) {
        const chats = t.allowedChats.length
            ? t.allowedChats.map(id => `<span class="svc-chip">${esc(id)}
                <button class="svc-x" data-svc="allow-remove" data-id="${esc(id)}" title="remove ${esc(id)}">×</button>
              </span>`).join('')
            : '<span class="muted small">empty — every message that arrives is refused</span>';

        return `<div class="svc-row">
                <label class="svc-lbl">Bridge</label>
                <label class="svc-sw"><input type="checkbox" id="svc-enabled" ${t.enabled ? 'checked' : ''}>
                    <span>${esc(switchLabel(t))}</span></label>
            </div>

            <div class="svc-row">
                <label class="svc-lbl">Allowed chats</label>
                <div class="svc-val col">
                    <div class="svc-chips">${chats}</div>
                    <div><input id="svc-allow" class="svc-in" placeholder="chat id (negative for a group)" size="28">
                        <button class="mini add" data-svc="allow-add">add</button></div>
                </div>
            </div>

            <div class="svc-row">
                <label class="svc-lbl">Daily ceiling</label>
                <div class="svc-val">
                    <input id="svc-cap" class="svc-in" type="number" min="0" step="0.25" value="${esc(t.maxDailyUSD)}" size="8">
                    <span class="muted small">USD/day · today: </span>${budgetTip(t.budget)}
                </div>
            </div>

            <div class="svc-row">
                <label class="svc-lbl">Default agent</label>
                <div class="svc-val">
                    <select id="svc-agent" class="svc-in">
                        ${window.AFCharts.option('', '— none —', {
                selected: !t.defaultAgent,
                detail: 'A chat has to name an agent with /agent before it can say anything to one.'
            })}
                        ${(agents || []).map(a => window.AFCharts.option(a.name, a.name, {
                selected: a.name === t.defaultAgent,
                detail: a.dir || a.role || 'A chat that has not picked an agent talks to this one.'
            })).join('')}
                    </select>
                    <span class="muted small">the agent a chat talks to before it picks one with <code>/agent</code></span>
                </div>
            </div>`;
    }

    /**
     * @param t     the card data, composed by `core/telegramCockpit.telegramCard`
     * @param opts  { controls, agents, msg, footer }
     */
    function card(t, opts) {
        const o = opts || {};
        if (!t) {
            return `<div class="card"><b>The Telegram bridge is not available in this window.</b>
                <span class="muted">The page was opened without the extension's service view.</span></div>`;
        }
        const s = t.status;
        const msg = o.msg;
        // head:false — a surface that names the bridge and says its state on a line of its own (Settings' card, U-233)
        const lead = o.head === false ? (s.next ? `<b>${esc(s.next)}</b>` : '') : esc(s.detail) + (s.next ? ' <b>' + esc(s.next) + '</b>' : '');
        return `<div class="${o.head === false ? '' : 'card '}svc-card">
            ${o.head === false ? '' : head(t)}
            ${lead ? `<div class="muted small svc-detail">${lead}</div>` : ''}
            ${msg ? `<div class="svc-msg ${msg.ok ? 'ok' : 'bad'}">${esc(msg.text)}</div>` : ''}
            ${o.controls ? controls(t, o.agents) : facts(t)}
            ${o.footer || ''}
        </div>`;
    }

    /**
     * ‼️ EVERY CONTROL POSTS AND WAITS. Nothing here writes to the page's data
     * and re-renders optimistically: the host owns the settings file, and a card
     * that painted the new value before the write landed would show a state that
     * does not exist the moment a write is refused or a file is read-only. The
     * refresh that follows the write is what redraws it.
     *
     * Wiring the controls is safe on a surface that did not draw them — every
     * lookup simply finds nothing.
     */
    function wire(post) {
        const on = (id, ev, fn) => {
            const el = document.getElementById(id);
            if (el) { el.addEventListener(ev, () => fn(el)); }
        };
        on('svc-enabled', 'change', el =>
            post({ type: 'svc-set', key: 'telegram.enabled', value: !!el.checked }));
        on('svc-cap', 'change', el => {
            const v = Number(el.value);
            // A ceiling that is not a number is not sent — the host would store
            // NaN and every run after it would be refused with no explanation.
            if (Number.isFinite(v) && v >= 0) {
                post({ type: 'svc-set', key: 'telegram.maxDailyUSD', value: v });
            }
        });
        on('svc-agent', 'change', el =>
            post({ type: 'svc-set', key: 'telegram.defaultAgent', value: el.value }));

        const addChat = () => {
            const el = document.getElementById('svc-allow');
            if (el && el.value.trim()) { post({ type: 'svc-allow-add', text: el.value }); }
        };
        const allow = document.getElementById('svc-allow');
        if (allow) {
            allow.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); addChat(); }
            });
        }
        document.querySelectorAll('[data-svc]').forEach(b => b.addEventListener('click', () => {
            const act = b.dataset.svc;
            if (act === 'connect') { post({ type: 'svc-connect' }); }
            else if (act === 'verify') { post({ type: 'svc-verify' }); }
            else if (act === 'allow-add') { addChat(); }
            else if (act === 'allow-remove') { post({ type: 'svc-allow-remove', id: Number(b.dataset.id) }); }
        }));
    }

    /** What a `svc-verified` answer says on the card, in one sentence. Shared so
     *  the two surfaces cannot report the same live check differently. */
    function verifiedMessage(m) {
        return m.ok
            ? { ok: true, text: 'Telegram answered — the bot is @' + (m.username || '?') + '.' }
            : { ok: false, text: 'Telegram did not accept that token — ' + (m.error || 'no reason given') };
    }

    /** ONE copy of the card's rules, injected by whichever page draws it. */
    function css() {
        return `
            /* U-84 — the Telegram bridge card. One tone vocabulary, used by the
               overview dot, the tab badge and the settings card, so the three
               can never disagree. */
            .svc-dot.t-ok, .svc-badge.t-ok { color: var(--af-ink-charts-green, var(--vscode-charts-green, #4caf50)); }
            .svc-dot.t-bad, .svc-badge.t-bad { color: var(--af-ink-charts-red, var(--vscode-charts-red, #f14c4c)); }
            .svc-dot.t-warn, .svc-badge.t-warn { color: var(--af-ink-charts-orange, var(--vscode-charts-orange, #d18616)); }
            .svc-dot.t-off, .svc-badge.t-off { opacity: .55; }
            .svc-badge { font-size: 11px; border: 1px solid currentColor; border-radius: 8px; padding: 0 7px; margin-left: 6px; }
            .svc-card { display: block; }
            /* ‼️ FOUND BY LOOKING AT THE PNG, NOT BY A TEST. The card's buttons
               carry the class "mini" and that class is defined NOWHERE in this
               extension — so they drew as full-size primary buttons, two blocks
               of button-blue shouting over the one thing the card exists to say,
               which is the badge beside them. An action on a status card is
               secondary by definition: you read the card, and only sometimes
               press it. */
            .svc-card .mini { background: var(--vscode-button-secondaryBackground);
                              color: var(--vscode-button-secondaryForeground);
                              font-size: 11px; padding: 1px 8px; }
            .svc-card .mini:hover { background: var(--vscode-button-secondaryHoverBackground); }
            .svc-head { align-items: center; display: flex; gap: 6px; }
            .svc-sp { flex: 1; }
            .svc-detail { margin: 4px 0 8px; }
            .svc-row { align-items: flex-start; border-top: 1px solid var(--vscode-widget-border, #4443); display: flex; gap: 10px; padding: 7px 0; }
            .svc-lbl { flex: 0 0 108px; font-size: 11px; opacity: .75; padding-top: 3px; }
            /* ‼️ ROW BY DEFAULT. Drawn as a column, a ceiling box, its unit
               and today's figure stacked into three lines for one fact —
               which is the opposite of what a dense card is for. Only the
               chip list, which genuinely has two rows of content, opts out. */
            .svc-val { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; }
            .svc-val.col { align-items: flex-start; flex-direction: column; }
            .svc-sw { align-items: center; cursor: pointer; display: flex; gap: 6px; }
            .svc-in { background: var(--vscode-input-background, #2223); border: 1px solid var(--vscode-widget-border, #666);
                      border-radius: 4px; color: inherit; font: inherit; padding: 1px 5px; }
            .svc-chips { display: flex; flex-wrap: wrap; gap: 4px; }
            .svc-chip { align-items: center; border: 1px solid var(--vscode-widget-border, #666); border-radius: 8px;
                        display: inline-flex; font-size: 11px; gap: 3px; padding: 0 3px 0 7px; }
            .svc-x { background: none; border: 0; color: inherit; cursor: pointer; font-size: 13px; line-height: 1; opacity: calc(1 - .4 * var(--af-dimk, 1)); padding: 0 3px; }
            .svc-x:hover { color: var(--af-ink-charts-red, var(--vscode-charts-red, #f14c4c)); opacity: 1; }
            .svc-budget { align-items: center; display: inline-flex; gap: 6px; }
            .svc-bar { background: var(--vscode-widget-border, #4443); border-radius: 3px; display: inline-block; height: 6px; overflow: hidden; width: 70px; }
            .svc-bar i { background: var(--vscode-charts-green, #4caf50); display: block; height: 100%; }
            .svc-bar i.over { background: var(--vscode-charts-red, #f14c4c); }
            .svc-msg { border-left: 2px solid currentColor; font-size: 12px; margin: 0 0 8px; padding: 2px 8px; }
            .svc-msg.ok { color: var(--af-ink-charts-green, var(--vscode-charts-green, #4caf50)); }
            .svc-msg.bad { color: var(--af-ink-charts-red, var(--vscode-charts-red, #f14c4c)); }
            /* The figure strip: one line, four facts, no control — the form the
               card takes where the settings rows own the controls. */
            .svc-facts { border-top: 1px solid var(--vscode-widget-border, #4443); display: flex; flex-wrap: wrap;
                         font-size: 11px; gap: 4px 14px; padding-top: 7px; }
            .svc-fact { align-items: center; display: inline-flex; gap: 5px; opacity: calc(1 - .2 * var(--af-dimk, 1)); }
            .svc-fact b { font-weight: 600; opacity: 1; }
            .svc-y { color: var(--af-ink-charts-green, var(--vscode-charts-green, #4caf50)); }
            .svc-n { color: var(--af-ink-charts-orange, var(--vscode-charts-orange, #d18616)); }
            html.af-phone .svc-row { flex-wrap: wrap; gap: 4px 10px; }
            html.af-phone .svc-lbl { flex: 1 1 100%; padding-top: 0; }
            html.af-phone .svc-val { min-width: 0; max-width: 100%; }
            html.af-phone .svc-val select, html.af-phone .svc-val input { max-width: 100%; }
            html.af-phone .svc-head { flex-wrap: wrap; }
            html.af-phone [data-svc="connect"] { display: none; }`;
    }

    window.AFTelegram = {
        card: card, wire: wire, css: css, dot: dot, line: line,
        words: words, verifiedMessage: verifiedMessage, tokenButtons: tokenButtons
    };
})();
