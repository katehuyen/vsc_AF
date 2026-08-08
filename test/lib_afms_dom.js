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
        const wrapRe = /<span class="afms" data-afms-wrap="([^"]*)">([\s\S]*?)<\/div><\/span>/g;
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
            const optRe = /<input type="checkbox" data-afms-opt="([^"]*)"( checked)?[^>]*>\s*<span class="afms-name" data-afms-only="[^"]*"[^>]*>([^<]*)</g;
            let o;
            while ((o = optRe.exec(inner))) {
                boxes.push(mkEl({ afmsOpt: o[1] }, { checked: !!o[2], label: o[3].trim() }));
                names.push(mkEl({ afmsOnly: o[1] }));
            }
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
                    : sel.indexOf('afms-only') >= 0 ? names : []),
                querySelector: sel => {
                    const a = /data-afms-act="([a-z]+)"/.exec(sel);
                    if (a) { return tools[a[1]] || null; }
                    const p = /data-afms-preset="([^"]+)"/.exec(sel);
                    if (p) { return presets[unesc(p[1])] || null; }
                    return null;
                }
            });
            next[id] = { id, inner, btn, menu, boxes, names, tools, presets };
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
            return null;
        },
        ids: () => Object.keys(parse()),
        has: id => !!parse()[id],
        /** The button's own words — "Agents: all", "Type: 2/7", "Level: none". */
        label: id => pick(id).btn.textContent.replace(/\s*▾\s*$/, ''),
        ticked: id => pick(id).boxes.filter(b => b.checked).map(b => b.dataset.afmsOpt),
        options: id => pick(id).boxes.map(b => b.dataset.afmsOpt),
        isOpen: id => pick(id).menu.hidden === false,
        open: id => { fire(pick(id).btn, 'click'); },
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
        clear: id => { fire(pick(id).tools.none, 'click'); }
    };
};
