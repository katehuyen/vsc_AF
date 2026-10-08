// Agent Farm — Farm Settings: the form (one object) and table (a list of objects) editors and their drafts (U-109).
// Split out of media/settings.js unchanged (U-225): the page hands its state in once, as X.
(function () {
    'use strict';
    let vscode, C, errors, formDraft, rowsDraft, shortKey, allItems, shapeHtml, readList, applyList, fieldBox, readField, fieldTip, REST, formCells, rowsCells, shapeFields, render;

    /**
     * What is ON SCREEN for a key — the draft when there is one, otherwise what
     * the stored value implies, which is exactly what was drawn. The handlers
     * only have a key, and reading the boxes is not enough on its own: an
     * entry's undeclared keys have no box, so they have to be taken from here.
     */
    function shownForm(key) {
        const it = allItems().find(i => i.key === key);
        return (it && it.shape) ? formCells(it) : {};
    }

    function shownRows(key) {
        const it = allItems().find(i => i.key === key);
        return (it && it.shape) ? rowsCells(it) : [];
    }

    /**
     * ‼️ U-109 — READ THE BOXES BEFORE ANYTHING STRUCTURAL HAPPENS.
     *
     * The same lesson `readList` learned: adding a row, removing one or
     * switching to JSON redraws everything, and a cell typed into but not yet
     * committed lives only in the DOM until this runs.
     */
    function readForm(key) {
        const id = shortKey(key);
        const prev = shownForm(key);
        const cells = {};
        for (const f of shapeFields(key)) {
            const el = document.getElementById(`f-${id}-${f.name}`);
            if (el) { cells[f.name] = String(el.value); }
        }
        // The undeclared keys have no box, so they can only come from where
        // they already were: the draft, or the value the draft was built from.
        if (prev[REST]) { cells[REST] = prev[REST]; }
        formDraft[key] = cells;
        return cells;
    }

    function readRows(key) {
        const id = shortKey(key);
        const fields = shapeFields(key);
        const prev = shownRows(key);
        const out = [];
        for (let i = 0; ; i++) {
            if (!document.getElementById(`rr-${id}-${i}`)) { break; }
            const cells = {};
            for (const f of fields) {
                const el = document.getElementById(`r-${id}-${i}-${f.name}`);
                cells[f.name] = el ? String(el.value) : '';
            }
            // The rows on screen were drawn from `prev` in this order, so row i
            // is row i — and because a whole row object is spliced out, an
            // entry's remainder leaves with the entry rather than sliding onto
            // its neighbour.
            if (prev[i] && prev[i][REST]) { cells[REST] = prev[i][REST]; }
            out.push(cells);
        }
        rowsDraft[key] = out;
        return out;
    }

    /**
     * Turn cells into the object that is saved. `undefined` when a required
     * field is empty or a value refuses to convert — with `errors[key]` set, so
     * the page says which field and why instead of failing silently.
     */
    /**
     * Cells to a value, LENIENTLY — for filling the JSON box, where a
     * half-typed number has to appear as what was typed rather than vanish or
     * refuse. Saving uses `buildEntry`, which is strict on purpose.
     */
    function looseEntry(fields, cells) {
        const out = {};
        for (const f of fields) {
            const r = readField(f, cells[f.name]);
            if (r.skip) { continue; }
            out[f.name] = r.err ? String(cells[f.name]) : r.v;
        }
        if (cells[REST]) {
            try { Object.assign(out, JSON.parse(cells[REST])); } catch { /* it was ours */ }
        }
        return out;
    }

    /** The text the JSON box opens with when a structured editor hands over. */
    function boxText(v) {
        try { return JSON.stringify(v, null, 2); } catch { return ''; }
    }

    function buildEntry(key, fields, cells, where) {
        const out = {};
        for (const f of fields) {
            const r = readField(f, cells[f.name]);
            if (r.err) { errors[key] = where + r.err; return undefined; }
            if (r.skip) {
                if (f.required) {
                    errors[key] = `${where}${f.name} is required — it cannot be left empty`;
                    return undefined;
                }
                continue;
            }
            out[f.name] = r.v;
        }
        // …and the keys this manifest never named go back on, last, so a build
        // that does not know about them cannot be the build that deletes them.
        if (cells[REST]) {
            try { Object.assign(out, JSON.parse(cells[REST])); } catch { /* it was ours */ }
        }
        return out;
    }

    /**
     * ‼️ U-139 — SAVING THE FORM AND SAVING THE TABLE, each in one function,
     * for the reason `applyList` is one: the button is no longer the only door.
     * Enter in any box of an editor saves that editor, so the save cannot live
     * inside a click handler.
     */
    function applyForm(key) {
        delete errors[key];
        // Sent as a REAL OBJECT and not as text — the host takes a structured
        // value as-is (settingsops.sanitizeValue), so a form assembled here
        // cannot fail to parse.
        const obj = buildEntry(key, shapeFields(key), readForm(key), '');
        if (!obj) { render(); return false; }
        delete formDraft[key];
        vscode.postMessage({ type: 'set', key, value: obj });
        return true;
    }

    function applyRows(key) {
        delete errors[key];
        const fields = shapeFields(key);
        const out = [];
        const rows = readRows(key);
        for (let i = 0; i < rows.length; i++) {
            // An entry with nothing in it is what pressing + leaves behind;
            // dropping it is kinder than refusing to save.
            if (!rows[i][REST]
                && fields.every(f => !String(rows[i][f.name] || '').trim())) { continue; }
            const entry = buildEntry(key, fields, rows[i], `row ${i + 1}: `);
            if (!entry) { render(); return false; }
            out.push(entry);
        }
        delete rowsDraft[key];
        vscode.postMessage({ type: 'set', key, value: out });
        return true;
    }

    /**
     * ‼️ U-109 — AN OBJECT WHOSE FIELDS ARE DECLARED IS A FORM.
     *
     * `taskRetry` declares SIXTEEN fields, each with a sentence about it, and
     * the page drew a JSON textarea over the top of all of it. So the user was
     * asked to hand-write the braces, the quotes and the commas of a value the
     * manifest describes completely, six feet away in the same file — and to
     * remember that `backoff` takes one of four words while typing it into a
     * box that accepts anything.
     *
     * ‼️ EMPTY IS A REAL ANSWER, and it is the reason there is no checkbox
     * here. A field left empty is LEFT OUT of the object, so its own default
     * stays in charge; a form that wrote every field on every save would turn
     * one edit into sixteen overrides the user never asked for.
     *
     * ‼️ WHICH SETTINGS GET THIS IS NOT LISTED ANYWHERE — `shape.kind` decides
     * (core/settingShape), so a setting whose fields are declared tomorrow gets
     * the form with nobody touching this file. And the JSON box stays one click
     * away, because a value the schema cannot describe is always possible.
     */
    function formHtml(it) {
        const id = shortKey(it.key);
        const cells = formCells(it);
        return `<div class="setform">
            ${it.shape.fields.map(f => `<div class="setfrow">
                ${window.AFTip.wrap(
            `<span class="setfname">${C.esc(f.name)}${f.required ? '<b class="req">*</b>' : ''}</span>`,
            f.name, fieldTip(f), 'tip-field')}
                ${fieldBox(f, `f-${id}-${f.name}`, cells[f.name] || '', `data-frow="${C.esc(it.key)}"`)}
                ${/**
                  * ‼️ X-196 — THE ONE HOVER THAT REPEATED WHAT WAS ALREADY DRAWN.
                  *
                  * This line is `text-overflow: ellipsis`, so the sentence IS
                  * cut and a hover is right — but it was a native `title`
                  * carrying the identical string, which is the exact complaint
                  * this component was built for: the platform tooltip repeats
                  * the row and then stops wherever it feels like stopping. The
                  * cut line is the SHORTHAND; the panel is the sentence, whole.
                  */''}
                ${f.description
                ? window.AFTip.wrap(
                    `<span class="setfdesc">${C.esc(window.AFSettingText.plainIn(f.description, allItems()))}</span>`,
                    f.name, window.AFSettingText.plainIn(f.description, allItems()), 'setfdescw')
                : '<span class="setfdesc"></span>'}
            </div>`).join('')}
            <div class="setjrow">
                <button class="secondary small" data-fapply="${C.esc(it.key)}"
                    title="Save this object. Until you press it, nothing here has changed the setting. A field left empty is left out, so its own default keeps applying.">Save the form</button>
                ${shapeHtml(it, true)}
            </div>
        </div>`;
    }

    /**
     * ‼️ U-109 — A LIST OF DECLARED OBJECTS IS A TABLE.
     *
     * Twelve settings are a list of entries whose every field the manifest
     * names, types and describes — `pricing`, `cliProfiles`, `modelPolicy`,
     * `projectSkeleton` — and every one of them was a JSON textarea. Adding one
     * model's price meant reproducing a five-key object from memory, inside
     * brackets, with the comma in the right place, and a missed brace lost the
     * whole setting rather than the one row.
     *
     * ‼️ THE COLUMN IS DEFINED ONCE, ON ITS HEADER (docs/CONVENTIONS.md). The
     * field's type, whether it is required, what it accepts and the sentence
     * the manifest wrote all hang off the `<th>` as an AFTip — a definition
     * repeated in every cell would be the same sentence twenty times.
     *
     * ‼️ NOTHING HERE SAVES EXCEPT `Save the table`. Add and ✕ act on the
     * draft, so a table half-edited and abandoned leaves the setting untouched.
     */
    function rowsHtml(it) {
        const id = shortKey(it.key);
        const fields = it.shape.fields;
        const rows = rowsCells(it);
        const head = fields.map(f => `<th>${window.AFTip.wrap(
            `<span class="setth">${C.esc(f.name)}${f.required ? '<b class="req">*</b>' : ''}</span>`,
            f.name, fieldTip(f), 'tip-field')}</th>`).join('');
        const body = rows.map((cells, i) => `<tr id="rr-${id}-${i}">
            ${fields.map(f => `<td>${fieldBox(f, `r-${id}-${i}-${f.name}`,
            cells[f.name] || '', `data-rrow="${C.esc(it.key)}"`)}</td>`).join('')}
            <td><button class="mini secondary" data-rdel="${C.esc(it.key)}" data-ri="${i}"
                title="Remove this entry. Nothing is saved until you press Save the table.">✕</button></td>
        </tr>`).join('');
        // ‼️ THE TABLE IS AS WIDE AS ITS COLUMNS NEED AND NO WIDER. Left to
        // itself a three-column table with full-width boxes stretches across
        // the whole page, and `cliProfiles` became three enormous troughs with
        // a word in one of them — the opposite of DENSITY. The ceiling is
        // DERIVED from the column count, so a six-column table still gets the
        // room it needs without a number per setting anywhere.
        const wide = fields.length * 200 + 48;
        return `<div class="setrows">
            ${rows.length
                ? `<table class="settbl" style="max-width:${wide}px"><thead><tr>${head}<th class="setthx"></th></tr></thead><tbody>${body}</tbody></table>`
                : `<div class="muted small">Empty — nothing is set. Add an entry below; hover a column name for what it takes.</div>`}
            <div class="setjrow">
                <button class="secondary small" data-radd="${C.esc(it.key)}"
                    title="Add one more entry to this list.">+ add</button>
                <button class="secondary small" data-rapply="${C.esc(it.key)}"
                    title="Save this table. Until you press it, nothing here has changed the setting.">Save the table</button>
                ${shapeHtml(it, true)}
            </div>
        </div>`;
    }

    window.AFSettingForms = function (X) {
        ({ vscode, C, errors, formDraft, rowsDraft, shortKey, allItems, shapeHtml, readList, applyList, fieldBox, readField, fieldTip, REST, formCells, rowsCells, shapeFields, render } = X);
        return { readForm, readRows, looseEntry, boxText, applyForm, applyRows, formHtml, rowsHtml };
    };
})();
