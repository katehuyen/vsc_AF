// Agent Farm — Farm Settings: the sections as an accordion (U-228). A section is one header row — its name, how many of
// its settings are changed, an edit not yet applied, a refused value, how many settings it holds, its sentence on ⓘ — and
// a body drawn only while it is open: the page's card for it, its basic rows, then "Show n more settings" for the rest.
// Which sections are open and which show more is the page's remembered state (vscode.setState). Under a query or the
// Changed chip the page is a result list and none of this applies. The page hands its state in once, as X.
(function () {
    'use strict';
    let X, C;
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    let open = null, more = null;

    /** The page's own cards, each at the head of the section it belongs to; a row id prefix says which card drew the row. */
    const CARDS = { general: ['docOpenSection'], agents: ['foldersSection'], engines: ['enginesSection', 'claudeSection'] };
    const PREFIX = { 'cc:': 'engines', 'root:': 'agents' };

    const ids = () => (X.DATA.categories || []).map(c => c.id).concat('sets');
    function stored() {
        try { return (X.vscode.getState && X.vscode.getState()) || {}; } catch (e) { return {}; }
    }
    /** First use reads the remembered state; '*' stands for every section. Nothing remembered: every section closed. */
    function load() {
        if (open) { return; }
        const st = stored();
        const read = l => new Set(Array.isArray(l) ? (l.indexOf('*') >= 0 ? ids() : l.map(String)) : []);
        open = read(st.open);
        more = read(st.more);
    }
    function save() {
        try { X.vscode.setState(Object.assign({}, stored(), { open: Array.from(open), more: Array.from(more) })); } catch (e) { /* no state */ }
    }
    const isOpen = id => { load(); return open.has(id); };
    const isMore = id => { load(); return more.has(id); };
    function flip(set, id) { load(); if (set().has(id)) { set().delete(id); } else { set().add(id); } save(); }

    /** The section a row lives in — a setting by its catalog section, a card's own row by its prefix. */
    function sectionOf(key) {
        const k = String(key || '');
        const p = Object.keys(PREFIX).find(x => k.indexOf(x) === 0);
        if (p) { return PREFIX[p]; }
        const c = (X.DATA.categories || []).find(c => (c.items || []).some(i => i.key === k));
        return c ? c.id : '';
    }

    /** A deep link: the row's section opens, and its "more" too when the row waits behind it. False when no section holds it. */
    function reveal(key) {
        const sec = sectionOf(key);
        if (!sec) { return false; }
        load();
        open.add(sec);
        const it = X.allItems().find(i => i.key === key);
        if (it && it.tier !== 'basic') { more.add(sec); }
        save();
        return true;
    }

    const isCard = (c, it) => X.hasCard(c.id, it.group);
    /** What an open section shows: its basic rows and every row a card draws; the rest once "more" is open. */
    function shown(c) {
        const all = c.items || [];
        const extra = all.filter(i => i.tier !== 'basic' && !isCard(c, i)).length;
        return { cat: isMore(c.id) ? c : Object.assign({}, c, { items: all.filter(i => i.tier === 'basic' || isCard(c, i)) }), extra };
    }

    function marks(c) {
        const items = c.items || [];
        const drafts = [X.listDraft, X.formDraft, X.rowsDraft, X.mapDraft, X.jsonDraft];
        return {
            changed: items.filter(i => i.modified).length,
            unsaved: items.some(i => drafts.some(d => d && Object.prototype.hasOwnProperty.call(d, i.key))),
            warn: items.some(i => X.errors[i.key] || i.refusal)
        };
    }

    function head(id, label, about, badges) {
        const on = isOpen(id);
        const info = about ? window.AFTip.wrap('<span class="secinfo" aria-hidden="true">ⓘ</span>', '', about, 'secinfow', '', label) : '';
        return `<div class="sechead${on ? ' open' : ''}" id="sec-${C.esc(id)}">
            <button class="sectog" data-fold="${C.esc(id)}" aria-expanded="${on}" aria-controls="secb-${C.esc(id)}">
                <span class="secarrow" aria-hidden="true">${on ? '▾' : '▸'}</span><span class="seclabel">${C.esc(label)}</span>
                <span class="secbadges">${badges}</span></button>${info}</div>`;
    }
    const count = n => `<span class="seccount" title="${C.esc(n === 1 ? t('1 setting') : t('{n} settings', { n }))}">${n}</span>`;

    function sectionHead(c) {
        const m = marks(c);
        return head(c.id, c.label, c.about, (m.warn ? `<span class="secwarn" title="${C.esc(t('A value in this section was refused or is being ignored — open it to see which.'))}">⚠</span>` : '')
            + (m.unsaved ? `<span class="secunsaved" title="${C.esc(t('An edit in this section is not applied yet — open it to finish or undo it.'))}">${C.esc(t('unsaved'))}</span>` : '')
            + (m.changed ? `<span class="secchanged">${C.esc(t('{n} changed', { n: m.changed }))}</span>` : '')
            + count((c.items || []).length));
    }

    function sectionBody(c) {
        const s = shown(c);
        const changed = (c.items || []).filter(i => i.modified).length;
        const lot = isMore(c.id) ? t('Show fewer') : s.extra === 1 ? t('Show 1 more setting') : t('Show {n} more settings', { n: s.extra });
        const foot = (s.extra ? `<button class="secondary small" data-more="${C.esc(c.id)}" aria-expanded="${isMore(c.id)}">${C.esc(lot)}</button>` : '')
            + (changed ? `<button class="secondary small" data-secreset="${C.esc(c.id)}" title="${C.esc(t('Put every changed setting of this section back to its default. You are asked first, with the count.'))}">${C.esc(t('Reset section…'))}</button>` : '');
        const cards = (CARDS[c.id] || []).map(f => X[f]()).join('');
        return `<div class="secbody" id="secb-${C.esc(c.id)}">${cards}${X.sectionHtml(s.cat)}${foot ? `<div class="secfoot">${foot}</div>` : ''}</div>`;
    }

    /** The sections view: a header per section that has a row or a card, a body for each open one, and the setting sets last. */
    function foldHtml(cats) {
        const n = (X.DATA.profiles || []).length;
        return cats.filter(c => (c.items || []).length || CARDS[c.id]).map(c => sectionHead(c) + (isOpen(c.id) ? sectionBody(c) : '')).join('')
            + head('sets', t('Setting sets'), t('Every changed setting saved under a name and put back in one press — or written to a file and read on another machine.'), count(n))
            + (isOpen('sets') ? `<div class="secbody" id="secb-sets">${X.profileBar()}</div>` : '');
    }

    /** Expand all · Collapse all, for the toolbar. */
    function barHtml() {
        return `<button class="secondary small" id="setexpand" title="${C.esc(t('Open every section'))}">${C.esc(t('Expand all'))}</button>
            <button class="secondary small" id="setcollapse" title="${C.esc(t('Close every section'))}">${C.esc(t('Collapse all'))}</button>`;
    }

    /** The open section's header sticks under the toolbar, so it needs the toolbar's height. */
    function stick() {
        const bar = document.querySelector('.setbar');
        const h = bar && bar.getBoundingClientRect ? Math.round(bar.getBoundingClientRect().height) : 0;
        try { if (h) { document.documentElement.style.setProperty('--setbar-h', h + 'px'); } } catch (e) { /* stub DOM */ }
    }

    /** `full`: the toolbar was drawn too. `asked`: a query or the Changed chip is on, so the toolbar's two buttons rest. */
    function foldWire(full, asked) {
        const again = id => { X.render(true); const b = document.querySelector(`[data-fold="${id}"]`); if (b) { b.focus(); } };
        document.querySelectorAll('[data-fold]').forEach(b => b.addEventListener('click', () => {
            flip(() => open, b.dataset.fold);
            again(b.dataset.fold);
            const h = document.getElementById('sec-' + b.dataset.fold);
            if (h && h.getBoundingClientRect && h.getBoundingClientRect().top < 0 && h.scrollIntoView) { h.scrollIntoView({ block: 'start' }); }
        }));
        document.querySelectorAll('[data-more]').forEach(b => b.addEventListener('click', () => {
            flip(() => more, b.dataset.more);
            X.render(true);
        }));
        document.querySelectorAll('[data-secreset]').forEach(b => b.addEventListener('click', () =>
            X.vscode.postMessage({ type: 'reset', section: b.dataset.secreset })));
        [['setexpand', true], ['setcollapse', false]].forEach(([id, on]) => {
            const b = document.getElementById(id);
            if (!b) { return; }
            b.hidden = !!asked;
            if (full) { b.addEventListener('click', () => { load(); open = new Set(on ? ids() : []); save(); X.render(true); }); }
        });
        if (full) { stick(); }
    }

    function foldCss() {
        return `.setbar { position:sticky; top:0; z-index:10; display:flex; gap:8px; align-items:center; flex-wrap:wrap;
                margin:10px 0 6px; padding:6px 0; background:var(--af-ground,var(--vscode-editor-background, var(--vscode-sideBar-background))); }
            .sechead { display:flex; align-items:center; gap:4px; border-bottom:1px solid var(--vscode-widget-border, #3333);
                scroll-margin-top:calc(var(--setbar-h, 46px) + 4px); }
            .sechead.open { position:sticky; top:var(--setbar-h, 46px); z-index:9;
                background:var(--af-ground,var(--vscode-editor-background, var(--vscode-sideBar-background))); }
            .sectog { flex:1 1 auto; min-width:0; display:flex; align-items:center; gap:8px; padding:8px 4px;
                background:transparent; border:none; border-radius:0; color:var(--vscode-foreground);
                font-size:13px; font-weight:600; text-align:left; }
            .sectog:hover { background:var(--vscode-list-hoverBackground); }
            .secarrow { flex:none; width:12px; color:var(--vscode-descriptionForeground); }
            .seclabel { flex:1 1 auto; min-width:0; overflow-wrap:anywhere; }
            .secbadges { flex:none; display:flex; gap:10px; align-items:center; font-size:11px; font-weight:400; }
            .secchanged { color:var(--vscode-textLink-foreground); }
            .seccount { min-width:18px; text-align:right; color:var(--vscode-descriptionForeground); }
            .secunsaved { color:var(--af-ink-editorWarning-foreground, var(--vscode-editorWarning-foreground)); }
            .secwarn { color:var(--af-ink-errorForeground, var(--vscode-errorForeground)); }
            .secinfow { flex:none; padding:0 6px; }
            .secinfo { font-size:12px; cursor:help; color:var(--vscode-descriptionForeground); }
            .secbody { padding:2px 0 14px 18px; }
            .secfoot { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:10px 0 0; }
            html.af-phone .secbody { padding-left:0; }`;
    }

    window.AFSettingFold = function (ctx) {
        X = ctx;
        C = ctx.C;
        if (window.addEventListener) { window.addEventListener('resize', stick); }
        return { foldHtml, foldWire, foldCss, barHtml, reveal };
    };
})();
