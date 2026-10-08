// Agent Farm — Farm Settings: the field boxes of the settings whose fields the manifest declares (U-109).
// Split out of media/settings.js unchanged (U-225): the page hands its state in once, as X.
(function () {
    'use strict';
    let C, errors, formDraft, rowsDraft, jsonDraft, shortKey, allItems;

    // ---- U-109 — the settings whose FIELDS the manifest already declared ----

    /**
     * ‼️ U-109 — ONE BOX PER FIELD, and the same box wherever the field is.
     *
     * A field of a form and a cell of a table are the same thing: a declared
     * name with a declared type. Drawing them from one function is what makes
     * `taskRetry` (16 fields, one object) and `pricing` (5 fields, many rows)
     * behave alike without either of them being written out by hand.
     *
     * The control follows the SCHEMA and nothing else:
     *   · a field with `enum` is a picker — a text box that silently accepts
     *     `alrt` is the bug this removes;
     *   · a boolean is a THREE-way picker, not a checkbox. An unticked box is
     *     indistinguishable from an untouched one, and here they are opposite
     *     answers: leaving a field out keeps its own default in charge, while
     *     writing `false` overrides it. A control that cannot say "not set"
     *     would silently overwrite the default of every field the user never
     *     looked at;
     *   · a number is a number box;
     *   · anything the schema does NOT flatten (an object, a list) keeps its
     *     JSON, in one line, in the cell. `livingChecks.when` is the real case,
     *     and pretending a nested precondition is a text field would be worse
     *     than showing its JSON honestly.
     */
    function fieldBox(f, id, text, dataAttr) {
        // ‼️ MIRROR (docs/CONVENTIONS.md) — a control narrow enough to cut its
        // own text puts its CURRENT value on the first line of its tooltip,
        // then a blank line, then what the field is. A `when` precondition in a
        // sixth-of-a-table cell is cut every time, and a reader who cannot see
        // what is in a box cannot tell whether it is the box they meant to fix.
        const note = (f.type === 'string' || f.type === 'number' || f.type === 'integer'
            || f.type === 'boolean' || (f.allowed && f.allowed.length)) ? ''
            : `This field is ${f.type}, which has no single box: write its JSON here.`;
        const mirror = [text, f.description && window.AFSettingText.plainIn(f.description, allItems()), note].filter(Boolean).join('\n\n');
        const a = `id="${id}" ${dataAttr}${mirror ? ` title="${C.esc(mirror)}"` : ''}`;
        // U-130 — the field's own hover is on the BOX (MIRROR, above); each
        // option carries its own name plus the one thing that option means
        // here, because the popup is drawn by the OS and no panel reaches it.
        const unset = f.default !== undefined
            ? `${f.name} falls back to its default, ${f.default}.`
            : `${f.name} is left out of the JSON altogether.`;
        const opt = (v, label, cur, detail) =>
            C.option(v, label, { selected: v === cur, detail });
        if (f.allowed && f.allowed.length) {
            // A value already stored that the enum no longer names is kept and
            // shown — dropping it on redraw would delete it without a word.
            const known = f.allowed.indexOf(text) >= 0 || text === '';
            return `<select ${a}>${opt('', '(not set)', text, unset)
                }${(known ? [] : [text]).concat(f.allowed.filter(v => v !== '')).map(v =>
                    opt(v, v, text, f.allowed.indexOf(v) < 0
                        ? `Stored in the JSON, but ${f.name} no longer names this value.`
                        : (String(f.default ?? '') === String(v) ? `The default for ${f.name}.` : '')
                    )).join('')}</select>`;
        }
        if (f.type === 'boolean') {
            return `<select ${a}>${opt('', '(not set)', text, unset)
                }${opt('true', 'yes', text, `${f.name} is on.`)
                }${opt('false', 'no', text, `${f.name} is off.`)}</select>`;
        }
        // ‼️ AN EMPTY BOX SAYS WHAT WILL HAPPEN IF IT STAYS EMPTY (MIRROR).
        // Leaving a field out is not "nothing" — the field's own default stays
        // in charge — so where the schema declares that default the placeholder
        // is it. Repeating the field's NAME there, six pixels from the label
        // that already says it, told the reader nothing at all.
        if (f.type === 'number' || f.type === 'integer') {
            return `<input type="number" ${a} value="${C.esc(text)}" placeholder="${
                C.esc(f.default !== undefined ? f.default : 'a number')}">`;
        }
        if (f.type !== 'string') {
            return `<input type="text" ${a} value="${C.esc(text)}"
                placeholder="${C.esc(f.type)} — as JSON">`;
        }
        // ‼️ S-80 — A FIELD WHOSE OWN DEFAULT DOES NOT FIT THE BOX IS NOT A
        // ONE-LINE FIELD. The row's input is 170px wide, which is right for a
        // model id and absurd for a sentence: `disciplineOrders` holds orders
        // of up to three lines and every one of them would have been edited
        // through a keyhole. Derived from the schema's own declared default,
        // never a list of keys — a long-text field added tomorrow gets the
        // right box without this page being touched.
        if (String(f.default || '').length > 80) {
            return `<textarea rows="3" ${a} placeholder="${C.esc(f.default)}">${C.esc(text)}</textarea>`;
        }
        return `<input type="text" ${a} value="${C.esc(text)}" placeholder="${
            C.esc(f.default !== undefined ? f.default : f.name)}">`;
    }

    /** A field's stored value as the text its box shows. */
    function fieldText(f, v) {
        if (v === undefined || v === null) { return ''; }
        if (f.type === 'boolean' && !(f.allowed && f.allowed.length)) {
            return v === true ? 'true' : v === false ? 'false' : '';
        }
        if (f.type === 'string' || f.type === 'number' || f.type === 'integer'
            || (f.allowed && f.allowed.length)) { return String(v); }
        try { return JSON.stringify(v); } catch { return ''; }
    }

    /**
     * A box's text as the value that goes into the object — or nothing, which
     * is what an empty field MEANS: leave the key out and its own default stays
     * in charge. Returns `{ skip }`, `{ v }` or `{ err }`; a refusal the user
     * can read is the point, rather than a NaN quietly written into settings.
     */
    function readField(f, text) {
        const raw = String(text == null ? '' : text).trim();
        if (raw === '') { return { skip: true }; }
        if (f.allowed && f.allowed.length) { return { v: raw }; }
        if (f.type === 'boolean') { return { v: raw === 'true' }; }
        if (f.type === 'number' || f.type === 'integer') {
            const n = Number(raw);
            return Number.isFinite(n) ? { v: n } : { err: `${f.name} has to be a number` };
        }
        if (f.type !== 'string') {
            try { return { v: JSON.parse(raw) }; }
            catch { return { err: `${f.name} is ${f.type}, and the JSON in it does not parse` }; }
        }
        return { v: raw };
    }

    /** The one line a column is defined by — its type, whether it is required,
     *  what it accepts, and the sentence the manifest already wrote. */
    function fieldTip(f) {
        const lines = [`${f.name}  ·  ${f.type}${f.required ? '  ·  required' : ''}`];
        if (f.allowed && f.allowed.length) { lines.push(`one of: ${f.allowed.join(' · ')}`); }
        if (f.description) { lines.push(''); lines.push(window.AFSettingText.plainIn(f.description, allItems())); }
        if (!f.required) {
            lines.push('');
            lines.push('Leave it empty and the field is left out — its own default stays in charge.');
        }
        return window.AFTip.lines(lines);
    }

    /**
     * ‼️ U-109 — THE KEYS THE SCHEMA DOES NOT NAME TRAVEL WITH THEIR ENTRY.
     *
     * A stored entry may hold a key this manifest does not declare — an older
     * build wrote it, a newer one will, or the user put it there on purpose.
     * Drawing that entry as a form and saving it would rebuild the object out
     * of the declared fields alone and DELETE the rest without a word: the
     * exact silent loss a page like this exists to prevent. So the remainder is
     * carried, invisibly, on the entry it belongs to — it survives the redraw,
     * it moves when the row moves, it goes when the row goes, and it is written
     * back on save.
     *
     * The name cannot collide with a field: a JSON schema property is a
     * readable identifier, and this is a NUL.
     */
    const REST = '\u0000rest';

    /** An entry's undeclared keys, as JSON text — or '' when there are none. */
    function restOf(fields, entry) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { return ''; }
        const named = new Set(fields.map(f => f.name));
        const rest = {};
        let any = false;
        for (const k of Object.keys(entry)) {
            if (!named.has(k)) { rest[k] = entry[k]; any = true; }
        }
        if (!any) { return ''; }
        try { return JSON.stringify(rest); } catch { return ''; }
    }

    function cellsOf(fields, entry) {
        const o = (entry && typeof entry === 'object' && !Array.isArray(entry)) ? entry : {};
        const cells = {};
        for (const f of fields) { cells[f.name] = fieldText(f, o[f.name]); }
        const rest = restOf(fields, o);
        if (rest) { cells[REST] = rest; }
        return cells;
    }

    /** What this key is showing: the draft being edited, or what is stored. */
    function formCells(it) {
        return formDraft[it.key] || cellsOf(it.shape.fields, it.value);
    }

    function rowsCells(it) {
        if (rowsDraft[it.key]) { return rowsDraft[it.key]; }
        return (Array.isArray(it.value) ? it.value : []).map(e => cellsOf(it.shape.fields, e));
    }

    /**
     * The JSON box's contents, parsed, or `undefined` with `errors[key]` set.
     * A half-typed document is refused rather than silently turned into rows of
     * braces — the same refusal the list editor makes.
     */
    function parseBox(key, want) {
        const ta = document.getElementById('c-' + shortKey(key));
        if (!ta) { return want === 'array' ? [] : {}; }
        // Whatever happens next, the box keeps what is in it. A refusal that
        // also swallowed the text would leave nothing to fix.
        jsonDraft[key] = String(ta.value);
        let v;
        try { v = JSON.parse(String(ta.value || (want === 'array' ? '[]' : '{}'))); }
        catch {
            errors[key] = 'the JSON in the box does not parse, so it cannot be shown as fields';
            return undefined;
        }
        const isArr = Array.isArray(v);
        if (want === 'array' ? !isArr : (isArr || !v || typeof v !== 'object')) {
            errors[key] = `that is not ${want === 'array' ? 'a list of entries' : 'an object'} — the JSON box is still here`;
            return undefined;
        }
        return v;
    }

    /** The shape of a key, for the handlers that only have the key. */
    function shapeFields(key) {
        const it = allItems().find(i => i.key === key);
        return (it && it.shape && it.shape.fields) || [];
    }

    window.AFSettingFields = function (X) {
        ({ C, errors, formDraft, rowsDraft, jsonDraft, shortKey, allItems } = X);
        return { fieldBox, fieldText, readField, fieldTip, REST, cellsOf, formCells, rowsCells, parseBox, shapeFields };
    };
})();
