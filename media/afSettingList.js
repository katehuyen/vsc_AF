// Agent Farm — Farm Settings: the shape panel beside a JSON box (U-89) and the plain-list editor (U-108).
// Split out of media/settings.js unchanged (U-225): the page hands its state in once, as X.
(function () {
    'use strict';
    let X, vscode, C, errors, listDraft, shortKey, allItems, render;

    /**
     * ‼️ U-89 — WHAT GOES IN THE BOX, BESIDE THE BOX.
     *
     * Twenty-seven settings are a raw JSON textarea, and the page used to draw
     * them with a one-line description and nothing else — while the manifest,
     * for twelve of them, already declared every field of an entry WITH a
     * sentence about each. The user's report on that page was exact: a field
     * they could not use.
     *
     * Two controls, and no third: a **shape** panel that says what an entry is,
     * and **an example** that writes a valid one into the box. Both come out of
     * the schema (`core/settingShape.ts`), so a setting added tomorrow explains
     * itself with nobody touching this file.
     *
     * The long text is an AFTip, not a `title` (docs/CONVENTIONS.md): a field
     * table is text, it is as wide as it needs to be, and the reader has to be
     * able to put the pointer INSIDE it and scroll. The strip beside the button
     * carries the one-line summary, because the fact that decides whether you
     * open anything at all should not cost a hover.
     */
    function shapeHtml(it, noExample) {
        const s = it.shape;
        if (!s) { return ''; }
        const KIND = {
            list: 'a plain list', rows: 'a list of entries', form: 'one object',
            // U-110 — the chip says what a VALUE is where the schema knows: the
            // three maps disagree, and "value" told the reader nothing about
            // which of them they were looking at.
            map: `name → ${s.valueType || 'value'} pairs`, free: 'free-form JSON'
        };
        const lines = [s.summary];
        if (s.fields && s.fields.length) {
            lines.push('');
            lines.push('EACH ENTRY:');
            for (const f of s.fields) {
                lines.push(`  ${f.name}  ·  ${f.type}${f.required ? '  ·  required' : ''}`);
                if (f.allowed && f.allowed.length) { lines.push(`      one of: ${f.allowed.join(' · ')}`); }
                if (f.description) { lines.push(`      ${f.description}`); }
            }
        }
        if (s.example !== undefined) {
            lines.push('');
            lines.push('AN ENTRY THAT VALIDATES:');
            lines.push(exampleText(s));
        }
        const fieldNote = s.fields && s.fields.length
            ? ` · ${s.fields.length} field(s)`
            : (s.itemType ? ` of ${s.itemType}` : '');
        const label = `${KIND[s.kind] || 'JSON'}${fieldNote}`;
        return `${window.AFTip.wrap(
            `<span class="setshape">${C.esc(label)}</span>`,
            'What goes in this box',
            window.AFTip.lines(lines),
            // Named so the panel can be PHOTOGRAPHED (U-81): a field table that
            // could only ever be seen closed is a field table nobody checked
            // the width of.
            'tip-shape')}
            ${s.example !== undefined && !noExample
                ? `<button class="secondary small" data-example="${C.esc(it.key)}"
                    title="Write a valid entry into the box above. It replaces what is there — nothing is saved until you press Apply JSON.">Example</button>`
                : ''}`;
    }

    /** The example, formatted the way the box formats its value. */
    function exampleText(s) {
        try { return JSON.stringify(s.example, null, 2); } catch { return ''; }
    }

    /** The rows this key is showing: what is being edited, or what is stored. */
    function listRows(it) {
        if (Array.isArray(listDraft[it.key])) { return listDraft[it.key]; }
        return Array.isArray(it.value) ? it.value.map(v => String(v ?? '')) : [];
    }

    /**
     * ‼️ X-193 — WHERE A PATH ACTUALLY POINTS, IN THE ROW THAT HOLDS IT.
     *
     * DENSITY: `${vault}/00_AGENT_AREA/00_OUTPUT/01_CEVAPLAR` in a box tells the
     * reader nothing about the folder it opens, and the one question they have
     * — *where is that, on THIS machine* — used to cost a Browse dialog or an
     * overnight campaign quietly reading the wrong folder.
     *
     * ‼️ LOOKED UP BY THE TEXT, NOT BY THE ROW NUMBER. The host resolves what is
     * SAVED; the rows on screen may be a draft with an entry added or dropped,
     * so an index would pair a row with somebody else's answer — which is worse
     * than saying nothing. A row whose text is unchanged still shows its real
     * path; one just typed shows nothing until it is saved, and that is honest.
     */
    function pathAnswer(key, template) {
        const t = String(template ?? '');
        if (!t.trim()) { return null; }
        const rows = (X.DATA.pathPreview || {})[key];
        if (!Array.isArray(rows)) { return null; }
        return rows.find(r => String(r.template) === t) || null;
    }

    function pathLine(key, template) {
        const a = pathAnswer(key, template);
        if (!a) { return ''; }
        // A path with no variable in it resolves to itself; repeating it under
        // the box would be the same fact twice (ONE SUBJECT).
        if (a.ok && a.path === String(template)) { return ''; }
        return a.ok
            ? `<div class="setpath">→ ${C.esc(a.path)}</div>`
            : `<div class="setpath bad">⚠ ${C.esc(a.why || 'this path cannot be built on this machine')}</div>`;
    }

    /**
     * ‼️ U-108 — READ THE BOXES BEFORE ANYTHING STRUCTURAL HAPPENS.
     *
     * Adding, removing or applying redraws the list, and a row typed into but
     * not yet committed lives only in the DOM until this runs. Without it,
     * typing a path and then pressing + on the row above throws the path away
     * — the same lesson the task composer's rounds learned.
     */
    function readList(key) {
        const rows = [];
        for (let i = 0; ; i++) {
            const box = document.getElementById('l-' + shortKey(key) + '-' + i);
            if (!box) { break; }
            rows.push(String(box.value));
        }
        listDraft[key] = rows;
        return rows;
    }

    /**
     * ‼️ U-139 — SAVING A LIST IS ONE FUNCTION, because it has two doors.
     *
     * "Save the list" is the button that says it saves; Enter inside a row is
     * the gesture every other box on this page already answers (the quiet-hour
     * times, the announcement template, the nudge minutes all bind it). A row
     * that ignored Enter read as a row wired to nothing — the user typed a chat
     * id, pressed Enter, and the page sat there.
     *
     * Returns false when the value was refused, so a caller can tell a save
     * that happened from one that only drew an error.
     */
    function applyList(key) {
        delete errors[key];
        // ‼️ Sent as a REAL ARRAY and not as text. The host takes a structured
        // value as-is (settingsops.sanitizeValue), so a list assembled here
        // cannot fail to parse — which is the whole point of not making the
        // user write the brackets.
        const item = allItems().find(i => i.key === key);
        const numeric = item && item.shape
            && (item.shape.itemType === 'number' || item.shape.itemType === 'integer');
        const rows = readList(key)
            .map(v => String(v).trim()).filter(v => v !== '')
            .map(v => (numeric ? Number(v) : v));
        // A number box that was typed into with words is a refusal the user can
        // see, not a NaN quietly written into their settings.
        if (numeric && rows.some(v => !Number.isFinite(v))) {
            errors[key] = 'every entry has to be a number';
            render();
            return false;
        }
        delete listDraft[key];
        vscode.postMessage({ type: 'set', key, value: rows });
        return true;
    }

    /**
     * ‼️ U-108 — A LIST IS A LIST, NOT A JSON DOCUMENT.
     *
     * The schema says `items.type: string` (or `number`) and nothing else: there
     * is no structure to get right, so asking for brackets, quotes and commas
     * was asking the user to hand-assemble a value the page could have taken
     * one line at a time. One box per entry, a ✕ to drop one, one button to add
     * one — and, where the schema says the entries are PATHS, a Browse beside
     * each row, because a list of roots is where a person types the most
     * Windows paths by hand and a typo there makes the fleet look empty.
     *
     * ‼️ WHICH SETTINGS GET THIS IS NOT LISTED ANYWHERE. `shape.kind` decides,
     * `shape.itemBrowse` decides the picker and `shape.itemAllowed` turns a row
     * into a dropdown — all three read off the manifest (core/settingShape),
     * so a list added tomorrow gets the editor with nobody touching this file.
     *
     * ‼️ AND THE JSON BOX DOES NOT GO AWAY. A value the schema cannot describe
     * is always possible, and a page that removed the escape hatch would be a
     * worse trap than the one it replaced. "Edit as JSON" is one click, and it
     * comes back.
     */
    function listHtml(it) {
        const id = shortKey(it.key);
        const rows = listRows(it);
        const s = it.shape;
        const numeric = s.itemType === 'number' || s.itemType === 'integer';
        const one = (v, i) => {
            // U-128 — an option in a narrow box says its own name. A `<select>`
            // cuts its text and the popup belongs to the operating system, so
            // the native title is the only place the whole value can be read.
            const optTip = (o) => `${o}\n\nOne value ${shortKey(it.key)} accepts. `
                + 'The ORDER of the rows is part of this setting.';
            const box = s.itemAllowed && s.itemAllowed.length
                ? `<select id="l-${id}-${i}" data-lrow="${C.esc(it.key)}">${
                    (s.itemAllowed.indexOf(v) < 0 && v ? [v] : []).concat(s.itemAllowed).map(o =>
                        `<option value="${C.esc(o)}"${o === v ? ' selected' : ''}
                            title="${C.esc(optTip(o))}">${C.esc(o)}</option>`).join('')
                }</select>`
                : `<input type="${numeric ? 'number' : 'text'}" id="l-${id}-${i}"
                        data-lrow="${C.esc(it.key)}" value="${C.esc(v)}"
                        placeholder="${C.esc(numeric ? 'a number' : 'one entry')}"
                        title="${C.esc(`${v || '(empty)'}\n\nOne entry of ${shortKey(it.key)}. `
                    + 'Press Enter to save the whole list — the ORDER of the rows is part of this setting.')}">`;
            // ‼️ X-193 — ORDER IS THE VALUE in these lists: `handoverSources` is
            // read most-truthful-first and `sentryInstructionFiles` decides
            // whose block wins. Reordering used to mean deleting a row and
            // retyping it at the bottom, which is how an order gets typed
            // wrong. Drag moves it; the arrows do the same thing for a hand
            // that would rather not drag and for a keyboard that cannot.
            const arrows = rows.length > 1
                ? `<button class="mini secondary" data-lmove="${C.esc(it.key)}" data-li="${i}" data-ldir="-1"
                        ${i === 0 ? 'disabled' : ''}
                        title="Move this entry one place earlier. The order is the setting — nothing is saved until you press Save the list.">↑</button>
                    <button class="mini secondary" data-lmove="${C.esc(it.key)}" data-li="${i}" data-ldir="1"
                        ${i === rows.length - 1 ? 'disabled' : ''}
                        title="Move this entry one place later. The order is the setting — nothing is saved until you press Save the list.">↓</button>`
                : '';
            return `<div class="setlrow" draggable="true" data-ldrag="${C.esc(it.key)}" data-li="${i}">
                <span class="setlgrip" title="Drag to reorder — the order is the setting.">⠿</span>
                ${box}${s.itemBrowse
                ? `<button class="secondary small" data-lbrowse="${C.esc(it.key)}" data-li="${i}"
                        data-lkind="${C.esc(s.itemBrowse)}"
                        title="Pick ${s.itemBrowse === 'folder' ? 'a folder' : 'a file'} — it is written into THIS row. Nothing is saved until you press Save the list.">Browse…</button>`
                : ''}${arrows}<button class="mini secondary" data-ldel="${C.esc(it.key)}" data-li="${i}"
                    title="Remove this entry. Nothing is saved until you press Save the list.">✕</button>
                ${pathLine(it.key, v)}</div>`;
        };
        return `<div class="setlist">
            ${rows.length ? rows.map(one).join('')
                : `<div class="muted small">Empty — ${C.esc(String(it.default ?? []).length
                    ? 'the default applies' : 'nothing is set')}. Add an entry below.</div>`}
            <div class="setjrow">
                <button class="secondary small" data-ladd="${C.esc(it.key)}"
                    title="Add one more entry to this list.">+ add</button>
                <button class="secondary small" data-lapply="${C.esc(it.key)}"
                    title="Save this list — or press Enter in any row. Until then, nothing here has changed the setting.">Save the list</button>
                <a href="#" class="setljson" data-ljson="${C.esc(it.key)}"
                    title="Show the raw JSON instead. Some value the schema cannot describe is always possible, so the box is still there.">Edit as JSON</a>
                ${/* ‼️ NO Example HERE. It writes into the JSON textarea, and in this
                      view there is no textarea to write into — the button would look
                      live and do nothing, which is the dead control this whole
                      change exists to remove. The empty row already says what one
                      entry is, which is all the example was for. */
            shapeHtml(it, true)}
            </div>
        </div>`;
    }

    window.AFSettingList = function (ctx) {
        X = ctx;
        ({ vscode, C, errors, listDraft, shortKey, allItems, render } = ctx);
        return { shapeHtml, exampleText, pathLine, readList, applyList, listHtml };
    };
})();
