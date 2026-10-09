// Agent Farm — the page's own form. One component, every surface.
//
// ‼️ AN OBJECT IS MADE BY A FORM ON THE PAGE (docs/CONVENTIONS.md, "Making
// things"). The Tasks page proved the shape in 3.80.0–3.83.0 and then kept it
// to itself: eleven hundred lines of composer that only tasks, schedules,
// triggers, templates and workflows could reach. Every other surface — duties,
// MCP servers, skills, memory, evals, productions, agents, living checks,
// secrets — was still a chain of `showInputBox` calls, and the measurement said
// why that keeps happening: writing a form was a day's work per page, so
// nobody did it and the platform's boxes won by default.
//
// So the form is a component. A page describes its fields, hands them to
// `card()`, and gets back the same card the Tasks page draws — the same
// keyboard bargain (Ctrl+Enter submits), the same refusal-in-the-form rule, the
// same redraw-when-a-choice-changes-what-exists rule, the same ✕.
//
// WHAT IT IS NOT: a validation framework, a model layer, or a state machine.
// The page owns its draft object and its own rules about what is valid; this
// owns the markup, the reading back, and the wiring. Everything here is a pure
// string function except `read` and `wire`, because these pages render by
// replacing innerHTML and anything that holds a node across a repaint is a bug
// waiting for its repaint.
(function () {
    'use strict';

    /** Local escape, so the component never depends on load order. Identical to
     *  AFCharts.esc; kept private rather than re-exported. */
    function esc(v) {
        return String(v === null || v === undefined ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /** The two attributes every field carries: which key it writes, and how the
     *  value is typed on the way back (s = string, n = number, b = boolean). */
    function bind(key, type, o) {
        const opt = o || {};
        return `data-af="${esc(key)}" data-aft="${type}"${opt.redraw ? ' data-afr="1"' : ''}`;
    }

    /** The label wrapper shared by every single-control field. */
    function wrap(o, inner, extraCls) {
        const opt = o || {};
        const cls = ['aff', opt.wide ? 'wide' : '', extraCls || ''].filter(Boolean).join(' ');
        // `opt.after` — markup a surface places after the label (U-151: the ↑ beside a flex box); it escapes its own text
        const head = opt.label === '' ? '' :
            `<span>${esc(opt.label)}${opt.required ? ' <em>required</em>' : ''}${opt.after || ''}</span>`;
        return `<label class="${cls}"${opt.tip ? ` title="${esc(opt.tip)}"` : ''}>${head}${inner}</label>`;
    }

    // ‼️ U-130 — EVERY OPTION THIS COMPONENT DRAWS SAYS ITS OWN NAME. A row
    // that already carries a `title` keeps it, but it is now the DETAIL under
    // the name rather than instead of it: the box cuts the label, and a hover
    // that explains a word the reader cannot read is answering the wrong
    // question. Rows may also pass `detail`, which reads better at the call.
    function options(list, value) {
        const C = window.AFCharts;
        return (list || []).map(o => {
            const obj = o && typeof o === 'object';
            const id = obj ? o.id : o;
            const label = obj ? (o.label === undefined ? o.id : o.label) : o;
            return C.option(id, label, {
                selected: String(id) === String(value === undefined || value === null ? '' : value),
                disabled: obj && !!o.disabled,
                detail: obj ? (o.detail || o.title || '') : ''
            });
        }).join('');
    }

    const AFForm = {

        // ------------------------------------------------------------ fields

        /** A one-line text box. `o.ph` placeholder · `o.tip` hover · `o.wide`
         *  full row · `o.required` marks it · `o.redraw` repaints on change ·
         *  `o.max` the most characters a hand can type into it. */
        text: function (key, label, value, o) {
            const opt = Object.assign({ label: label }, o || {});
            return wrap(opt, `<input type="${esc(opt.type || 'text')}" ${bind(key, 's', opt)}`
                + (Number(opt.max) > 0 ? ` maxlength="${Number(opt.max)}"` : '')
                + ` value="${esc(value)}" placeholder="${esc(opt.ph || '')}"`
                + `${opt.mono ? ' class="mono"' : ''}>`);
        },

        /** A paragraph box. Ctrl+Enter submits the card it is in (wire). */
        area: function (key, label, value, o) {
            const opt = Object.assign({ label: label, wide: true, rows: 4 }, o || {});
            return wrap(opt, `<textarea ${bind(key, 's', opt)} rows="${Number(opt.rows) || 4}"`
                + ` placeholder="${esc(opt.ph || '')}">${esc(value)}</textarea>`);
        },

        num: function (key, label, value, o) {
            const opt = Object.assign({ label: label }, o || {});
            const min = opt.min === undefined ? '' : ` min="${esc(opt.min)}"`;
            const max = opt.max === undefined ? '' : ` max="${esc(opt.max)}"`;
            return wrap(opt, `<input type="number" ${bind(key, 'n', opt)}`
                + ` step="${esc(opt.step === undefined ? 1 : opt.step)}"${min}${max}`
                + ` value="${esc(value === undefined || value === null ? '' : value)}">`);
        },

        /** A picker over `[{id,label,title}]` (bare strings are allowed). An
         *  empty id is spelled out — "— none —" — rather than shown as a blank
         *  row nobody can tell from an unset one. */
        sel: function (key, label, list, value, o) {
            const opt = Object.assign({ label: label }, o || {});
            return wrap(opt, `<select ${bind(key, 's', opt)}>${options(list, value)}</select>`);
        },

        check: function (key, label, value, o) {
            const opt = o || {};
            return `<label class="cbx"${opt.tip ? ` title="${esc(opt.tip)}"` : ''}>`
                + `<input type="checkbox" ${bind(key, 'b', opt)}${value ? ' checked' : ''}> ${esc(label)}</label>`;
        },

        /**
         * A path box with the OS picker beside it.
         *
         * ‼️ THE FILE PICKER STAYS NATIVE — deliberately, and it is the reason
         * this field exists rather than a plain text box. A webview cannot open
         * a folder chooser, so the alternative to this button is a person
         * typing `D:\zone\know\note\obsidian\…` by hand, which is how the dialog
         * chains justified themselves. The button asks the host for one dialog
         * and the answer lands back in THIS field; nothing else about the form
         * is interrupted, and what is already typed survives.
         */
        path: function (key, label, value, o) {
            const opt = Object.assign({ label: label, wide: true, kind: 'folder' }, o || {});
            return wrap(opt, `<span class="affpath">`
                + `<input type="text" ${bind(key, 's', opt)} value="${esc(value)}"`
                + ` placeholder="${esc(opt.ph || '')}">`
                + `<button type="button" class="secondary mini" data-afbrowse="${esc(key)}"`
                + ` data-afkind="${esc(opt.kind)}"`
                + ` title="Pick it with the system dialog — the only thing a page cannot draw itself.">…</button>`
                + `</span>`);
        },

        /** Read-only text that belongs in the grid — a computed path, a count. */
        stat: function (label, value, o) {
            const opt = Object.assign({ label: label }, o || {});
            return wrap(opt, `<span class="affstat">${esc(value)}</span>`);
        },

        // --------------------------------------------------------- furniture

        /** A heading inside the form. Long forms are scanned, not read. */
        sec: function (head, note) {
            return `<div class="affsec"><b>${esc(head)}</b>`
                + (note ? `<span class="muted small">${esc(note)}</span>` : '') + '</div>';
        },

        /** Fields wrap; a single row of eleven controls squeezes the prompt box
         *  into a slit, which is an invitation to write less than you mean. */
        grid: function () {
            const parts = [];
            for (let i = 0; i < arguments.length; i++) {
                const a = arguments[i];
                if (Array.isArray(a)) { parts.push(a.filter(Boolean).join('')); }
                else if (a) { parts.push(a); }
            }
            return `<div class="affgrid">${parts.join('')}</div>`;
        },

        /** A refusal or a receipt, shown where the mistake is. */
        msg: function (text, warn) {
            return text ? `<div class="affmsg${warn ? ' warn' : ''}">${esc(text)}</div>` : '';
        },

        /**
         * The list a form holds — the shape a wizard cannot draw at all.
         *
         * `items: [{ icon, title, sub, i }]` and the row gets `↑ ↓ edit copy ✕`
         * posting `data-afl` + `data-i`. The page owns what those do, because
         * they act on the DRAFT: reordering a stored object per click is how
         * Cancel becomes a lie.
         */
        list: function (o) {
            const opt = o || {};
            const items = opt.items || [];
            if (!items.length) { return `<div class="affmsg">${esc(opt.empty || 'Nothing here yet.')}</div>`; }
            const last = items.length - 1;
            const acts = opt.acts === undefined ? ['up', 'down', 'edit', 'dup', 'del'] : opt.acts;
            const GLYPH = { up: '↑', down: '↓', edit: 'edit', dup: 'copy', del: '✕' };
            const TITLE = {
                up: 'move it up', down: 'move it down', edit: 'edit this one',
                dup: 'add a copy of it below', del: 'remove it'
            };
            return `<ol class="afflist${opt.numbered === false ? ' plain' : ''}">${items.map((it, i) => `
                <li class="affrow${it.on ? ' on' : ''}">
                    ${it.icon ? `<span class="affri" title="${esc(it.hint || '')}">${esc(it.icon)}</span>` : ''}
                    <span class="affrt"><b>${esc(it.title)}</b>
                        ${it.sub ? `<span class="muted small">${esc(it.sub)}</span>` : ''}</span>
                    <span class="affra">${acts.map(a =>
                `<button class="mini secondary" data-afl="${a}" data-i="${i}"`
                + `${(a === 'up' && i === 0) || (a === 'down' && i === last) ? ' disabled' : ''}`
                + ` title="${esc(TITLE[a] || a)}">${esc(GLYPH[a] || a)}</button>`).join('')}</span>
                </li>`).join('')}</ol>`;
        },

        // -------------------------------------------------------------- card

        /**
         * The card itself.
         *
         * `title` · `lede` — what is being made and what it means. `body` — the
         * fields. `msg`/`warn` — the refusal. `submit` — the button's own
         * words, which say what the press will DO ("Add and start", not "OK").
         * `foot` — checkboxes that belong beside the button rather than in the
         * grid ("start it now"). `extra` — a second, secondary action.
         */
        card: function (o) {
            const opt = o || {};
            return `<div class="affbox" id="${esc(opt.id || 'affbox')}" data-afcard="1">
                <div class="ctl-row">
                    <span class="ctl-title">${esc(opt.title || '')}</span>
                    ${opt.lede ? `<span class="muted small">${esc(opt.lede)}</span>` : ''}
                    <span class="spacer"></span>
                    <button class="secondary mini" data-afact="cancel" title="Close without saving">✕</button>
                </div>
                ${opt.body || ''}
                ${AFForm.msg(opt.msg, opt.warn)}
                <div class="ctl-row">
                    ${opt.foot || ''}
                    <span class="spacer"></span>
                    ${opt.extra || ''}
                    <button data-afact="submit">${esc(opt.submit || 'Save')}</button>
                    <button class="secondary" data-afact="cancel">${esc(opt.cancel || 'Cancel')}</button>
                </div>
            </div>`;
        },

        // -------------------------------------------------------- read / wire

        /**
         * Every field currently on the page, typed. `root` is optional — these
         * pages have one form open at a time, and a form that is not drawn
         * contributes nothing, so the default (the document) is right.
         *
         * A number field reads back as a number and an empty one as 0, which is
         * what every caller wants; a field that has to tell "empty" from "zero"
         * is a text field with a numeric placeholder, not a number field.
         */
        read: function (root) {
            const scope = root || document;
            const out = {};
            const els = scope.querySelectorAll('[data-af]');
            for (let i = 0; i < els.length; i++) {
                const el = els[i];
                const key = el.dataset.af;
                if (!key) { continue; }
                const t = el.dataset.aft;
                if (t === 'b') { out[key] = !!el.checked; }
                else if (t === 'n') { out[key] = Number(el.value) || 0; }
                else { out[key] = el.value === undefined || el.value === null ? '' : String(el.value); }
            }
            return out;
        },

        /**
         * Wire a drawn card. Called after every render, on the fresh nodes.
         *
         *  onEdit(values)      — a field changed; keep the draft in step
         *  onRedraw(values)    — a field marked `redraw` changed: the page must
         *                        re-render, because which fields EXIST changed
         *  onSubmit()          — the button, or Ctrl+Enter in a textarea
         *  onCancel()          — ✕ or Cancel
         *  onBrowse(key, kind) — the OS picker was asked for
         *  onList(act, i)      — a row button in `list()`
         *
         * ‼️ `input` for typing, `change` for pickers. A <select> fires only
         * `change`; a text box fires `input` per keystroke and `change` on blur,
         * and binding both to a redraw would repaint the page under the cursor.
         */
        wire: function (root, h) {
            const scope = root || document;
            const handlers = h || {};
            const values = () => AFForm.read(scope);
            const els = scope.querySelectorAll('[data-af]');
            for (let i = 0; i < els.length; i++) {
                const el = els[i];
                const isText = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
                const redraw = el.dataset.afr === '1';
                const bump = () => {
                    if (handlers.onEdit) { handlers.onEdit(values()); }
                    if (redraw && handlers.onRedraw) { handlers.onRedraw(values()); }
                };
                el.addEventListener('change', bump);
                // A checkbox's `input` is its `change`; binding both double-fires
                // and, on a redrawing field, repaints twice.
                if (isText && el.type !== 'checkbox') {
                    el.addEventListener('input', () => {
                        if (handlers.onEdit) { handlers.onEdit(values()); }
                    });
                }
                if (el.tagName === 'TEXTAREA') {
                    el.addEventListener('keydown', ev => {
                        if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
                            ev.preventDefault();
                            if (handlers.onEdit) { handlers.onEdit(values()); }
                            if (handlers.onSubmit) { handlers.onSubmit(); }
                        }
                    });
                }
            }
            const acts = scope.querySelectorAll('[data-afact]');
            for (let i = 0; i < acts.length; i++) {
                const el = acts[i];
                el.addEventListener('click', () => {
                    const a = el.dataset.afact;
                    if (a === 'submit') {
                        if (handlers.onEdit) { handlers.onEdit(values()); }
                        if (handlers.onSubmit) { handlers.onSubmit(); }
                    } else if (a === 'cancel') {
                        if (handlers.onCancel) { handlers.onCancel(); }
                    } else if (handlers.onAct) {
                        if (handlers.onEdit) { handlers.onEdit(values()); }
                        handlers.onAct(a);
                    }
                });
            }
            const browse = scope.querySelectorAll('[data-afbrowse]');
            for (let i = 0; i < browse.length; i++) {
                const el = browse[i];
                el.addEventListener('click', () => {
                    if (handlers.onEdit) { handlers.onEdit(values()); }
                    if (handlers.onBrowse) { handlers.onBrowse(el.dataset.afbrowse, el.dataset.afkind || 'folder'); }
                });
            }
            const rows = scope.querySelectorAll('[data-afl]');
            for (let i = 0; i < rows.length; i++) {
                const el = rows[i];
                el.addEventListener('click', () => {
                    if (handlers.onEdit) { handlers.onEdit(values()); }
                    if (handlers.onList) { handlers.onList(el.dataset.afl, Number(el.dataset.i)); }
                });
            }
        },

        /**
         * The half of the round trip a page would otherwise write six times:
         * hand it the host message and it fills the field the ✱ button asked
         * for. Returns true when it handled the message.
         */
        browsed: function (draft, ev) {
            if (!ev || ev.type !== 'af-browsed' || !ev.key) { return false; }
            if (ev.path) { draft[ev.key] = ev.path; }
            return true;
        }
    };

    window.AFForm = AFForm;
})();
