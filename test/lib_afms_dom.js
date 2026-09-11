// DOM shim for the shared multi-pick filter control (media/afFilters.js), so a
// page's DOM-stub test can drive a picker the way a user does: open it, tick or
// untick an option, Select all, Clear.
//
// Not a test file (the runner only picks up test_*.js). Give it a getter for
// the page's CURRENT html — it re-parses whenever that string changes, so the
// stubs always describe what the page just rendered.
'use strict';

module.exports = function createAfmsDom(getHtml) {
    let lastHtml = null;
    let pickers = {};

    const mkEl = (dataset, extra) => Object.assign({
        dataset, listeners: {}, hidden: true, checked: false, textContent: '', scrollTop: 0,
        addEventListener(ev, fn) { this.listeners[ev] = fn; },
        focus() { }
    }, extra || {});

    const fire = (el, ev, arg) => {
        if (!el || !el.listeners[ev]) { throw new Error('no ' + ev + ' listener on ' + JSON.stringify(el.dataset)); }
        el.listeners[ev](arg || { stopPropagation() { } });
    };

    function parse() {
        const html = String(getHtml() || '');
        if (html === lastHtml) { return pickers; }
        lastHtml = html;
        const next = {};
        // ‼️ U-61 — the wrapper carries `afms-on` while its menu is open (the
        // class the hover panel reads to know it is covered), so the class
        // attribute is matched loosely. Pinning it to exactly "afms" made every
        // open picker invisible to this shim.
        // ‼️ ANY FURTHER ATTRIBUTE IS ALLOWED AFTER THE ID. This insisted the
        // tag ENDED at `data-afms-wrap`, so the day the component added a second
        // attribute (`--afms-w`, the width it reserved) eleven page tests stopped
        // finding a picker at all and failed with "no picker in the rendered
        // html" — one parser breaking, reported as eleven pages breaking.
        const wrapRe = /<span class="afms[^"]*" data-afms-wrap="([^"]*)"[^>]*>([\s\S]*?)<\/div><\/span>/g;
        let w;
        while ((w = wrapRe.exec(html))) {
            const id = w[1];
            const inner = w[2];
            // A picker whose own markup did not change is the SAME element —
            // keep its stub (and its listeners). Pages that patch parts of
            // themselves wire a control once; re-creating the stub because some
            // unrelated slot changed would lose listeners no browser would lose.
            if (pickers[id] && pickers[id].inner === inner) { next[id] = pickers[id]; continue; }
            const btn = mkEl({ afms: id }, {
                textContent: (/<button[^>]*>([\s\S]*?)<\/button>/.exec(inner) || ['', ''])[1]
            });
            const boxes = [];
            // ‼️ The row is a checkbox AND a name, and they do different things
            // (toggle vs "only this"), so the stub carries both elements.
            const names = [];
            // ‼️ U-92 — AND THE ROW ITSELF, because that is what a find box
            // hides. The component reads `box.parentNode.hidden` to know which
            // options are still on screen ("Select all" acts on those), so a
            // stub whose checkboxes have no parent would report every option
            // visible however narrow the filter is — the exact thing the tests
            // are there to measure.
            const rows = [];
            const optRe = /<input type="checkbox" data-afms-opt="([^"]*)"( checked)?[^>]*>\s*<span class="afms-name" data-afms-only="[^"]*"[^>]*>([^<]*)</g;
            let o;
            while ((o = optRe.exec(inner))) {
                const label = o[3].trim();
                const row = mkEl({}, { hidden: false, textContent: label, className: 'afms-item' });
                const box = mkEl({ afmsOpt: o[1] }, {
                    checked: !!o[2], label, parentNode: row,
                    getAttribute: a => (a === 'aria-label' ? 'Toggle ' + label : null)
                });
                row.box = box;
                row.querySelector = sel => (sel.indexOf('afms-opt') >= 0 ? box : null);
                rows.push(row);
                boxes.push(box);
                names.push(mkEl({ afmsOnly: o[1] }));
            }
            // U-92 — the menu's own find box and the line it shows when nothing
            // matches. A picker short enough not to draw one has neither.
            const findM = /<input type="text" class="afms-find" data-afms-find="([^"]*)"[^>]*value="([^"]*)"/.exec(inner);
            const find = findM ? mkEl({ afmsFind: findM[1] }, { value: unesc(findM[2]), hidden: false }) : null;
            const nofind = /class="afms-nofind/.test(inner)
                ? mkEl({}, { hidden: /class="afms-nofind[^"]*"[^>]*\shidden/.test(inner) })
                : null;
            const tools = { all: mkEl({ afmsAct: 'all' }), none: mkEl({ afmsAct: 'none' }) };
            // named subsets ("Dialog"), whatever the page declared
            const presets = {};
            const presetRe = /data-afms-preset="([^"]*)"/g;
            let pr;
            while ((pr = presetRe.exec(inner))) { presets[pr[1]] = mkEl({ afmsPreset: pr[1] }); }
            const menuTag = /<div class="afms-menu[^"]*"[^>]*>/.exec(inner);
            const menu = mkEl({ afmsMenu: id }, {
                hidden: !!(menuTag && / hidden>/.test(menuTag[0])),
                querySelectorAll: sel => (sel.indexOf('afms-opt') >= 0 ? boxes
                    : sel.indexOf('afms-only') >= 0 ? names
                        : sel.indexOf('afms-item') >= 0 ? rows : []),
                querySelector: sel => {
                    const a = /data-afms-act="([a-z]+)"/.exec(sel);
                    if (a) { return tools[a[1]] || null; }
                    const p = /data-afms-preset="([^"]+)"/.exec(sel);
                    if (p) { return presets[unesc(p[1])] || null; }
                    if (sel.indexOf('afms-find') >= 0) { return find; }
                    if (sel.indexOf('afms-nofind') >= 0) { return nofind; }
                    return null;
                }
            });
            // The wrapper itself — `wireMulti` puts `afms-on` on it while the
            // menu is open, so the stub needs a classList that remembers.
            const classes = new Set(((/^<span class="([^"]*)"/.exec(w[0]) || ['', ''])[1] || '').split(/\s+/).filter(Boolean));
            const wrap = mkEl({ afmsWrap: id }, {
                classList: {
                    add: c => classes.add(c),
                    remove: c => classes.delete(c),
                    contains: c => classes.has(c),
                    toggle: (c, on) => { if (on === undefined ? classes.has(c) : !on) { classes.delete(c); } else { classes.add(c); } }
                },
                classes
            });
            next[id] = { id, inner, btn, menu, boxes, names, rows, tools, presets, wrap, find, nofind };
        }
        pickers = next;
        return pickers;
    }

    const pick = id => {
        const p = parse()[id];
        if (!p) { throw new Error('no picker "' + id + '" in the rendered html'); }
        return p;
    };
    const unesc = s => s.replace(/\\/g, '');

    return {
        /** Hand this to the sandbox document (chain it after the page's own). */
        querySelector(sel) {
            const all = parse();
            let m = /\[data-afms-menu="([^"]+)"\]/.exec(sel);
            if (m) { return (all[unesc(m[1])] || {}).menu || null; }
            m = /\[data-afms="([^"]+)"\]/.exec(sel);
            if (m) { return (all[unesc(m[1])] || {}).btn || null; }
            m = /\[data-afms-wrap="([^"]+)"\]/.exec(sel);
            if (m) { return (all[unesc(m[1])] || {}).wrap || null; }
            return null;
        },
        /**
         * The document-wide sweep `closeMenus()` runs. Chain it after the
         * page's own querySelectorAll — a stub that answered [] to everything
         * let a menu "close" while its find box kept its text and its rows kept
         * their `hidden`, which is a state no browser would leave behind.
         */
        querySelectorAll(sel) {
            const all = parse();
            const each = get => Object.keys(all).map(id => get(all[id])).filter(Boolean);
            if (/\[data-afms-menu\]/.test(sel)) { return each(p => p.menu); }
            if (/afms-on/.test(sel)) { return each(p => (p.wrap.classes.has('afms-on') ? p.wrap : null)); }
            if (/afms-nofind/.test(sel)) { return each(p => p.nofind); }
            if (/afms-find/.test(sel)) { return each(p => p.find); }
            if (/afms-item/.test(sel)) {
                return Object.keys(all).reduce((acc, id) => acc.concat(all[id].rows), []);
            }
            if (/data-afms-act="all"/.test(sel)) { return each(p => p.tools.all); }
            return [];
        },
        ids: () => Object.keys(parse()),
        has: id => !!parse()[id],
        /** U-61 — is the wrapper marked as covering its own hover panel? */
        covered: id => pick(id).wrap.classes.has('afms-on'),
        /** The button's own words — "Agents: all", "Type: 2/7", "Level: none". */
        label: id => pick(id).btn.textContent.replace(/\s*▾\s*$/, ''),
        ticked: id => pick(id).boxes.filter(b => b.checked).map(b => b.dataset.afmsOpt),
        options: id => pick(id).boxes.map(b => b.dataset.afmsOpt),
        isOpen: id => pick(id).menu.hidden === false,
        open: id => { fire(pick(id).btn, 'click'); },
        /**
         * U-131 — right-click the trigger: the two-position switch between
         * everything and the picker's first preset. Returns whether the
         * gesture was TAKEN (a picker with no preset must not take it, and
         * must not swallow the platform's own menu either), so a test can
         * assert the absence as strongly as the presence.
         */
        rightClick(id) {
            const btn = pick(id).btn;
            if (!btn.listeners.contextmenu) { return false; }
            let prevented = false;
            btn.listeners.contextmenu({ stopPropagation() { }, preventDefault() { prevented = true; } });
            return prevented;
        },
        /** Tick / untick one option (omit `on` to flip it). */
        toggle(id, value, on) {
            const p = pick(id);
            const box = p.boxes.filter(b => b.dataset.afmsOpt === String(value))[0];
            if (!box) { throw new Error('picker "' + id + '" has no option "' + value + '"'); }
            box.checked = on === undefined ? !box.checked : !!on;
            fire(box, 'change');
        },
        /** Clear, then tick exactly these — the "I want two of twenty" path. */
        only(id, values) {
            this.clear(id);
            values.forEach(v => this.toggle(id, v, true));
        },
        /** Click an option's NAME: "show only that one", in one gesture. */
        clickName(id, value) {
            const p = pick(id);
            const el = p.names.filter(n => n.dataset.afmsOnly === String(value))[0];
            if (!el) { throw new Error('picker "' + id + '" has no option "' + value + '"'); }
            fire(el, 'click');
        },
        /** The named subsets this picker declared, and pressing one. */
        presets: id => Object.keys(pick(id).presets),
        preset(id, name) {
            const el = pick(id).presets[name];
            if (!el) { throw new Error('picker "' + id + '" has no preset "' + name + '"'); }
            fire(el, 'click');
        },
        selectAll: id => { fire(pick(id).tools.all, 'click'); },
        clear: id => { fire(pick(id).tools.none, 'click'); },
        // ---- U-92: the find box a long menu draws for itself ---------------
        /** Does this picker carry one at all? A short list must not. */
        hasFind: id => !!pick(id).find,
        /** What it currently holds — it survives the re-render a tick causes. */
        findText: id => (pick(id).find || { value: null }).value,
        /** Type into it (the component filters as you type). */
        find(id, text) {
            const f = pick(id).find;
            if (!f) { throw new Error('picker "' + id + '" has no find box'); }
            f.value = String(text);
            fire(f, 'input');
        },
        /** Escape empties it rather than closing the menu under the hand. */
        findEscape(id) {
            const f = pick(id).find;
            if (!f) { throw new Error('picker "' + id + '" has no find box'); }
            fire(f, 'keydown', { key: 'Escape', stopPropagation() { } });
        },
        /** The options still on screen after a find — in the menu's order. */
        shown: id => pick(id).rows.filter(r => r.hidden !== true).map(r => r.box.dataset.afmsOpt),
        /** Is the "nothing matches that" line showing? */
        noMatch: id => !!pick(id).nofind && pick(id).nofind.hidden === false,
        /** The Select all link's own words — it says what it will act on. */
        allLabel: id => pick(id).tools.all.textContent
    };
};
