// Agent Farm — Farm Settings: what the form, table, pairs and JSON editors' controls do (U-109, U-110, U-142).
// Split out of media/settings.js unchanged (U-225): the page hands its state in once, as X.
(function () {
    'use strict';
    let X, allItems, applyForm, applyMap, applyRows, boxText, cellsOf, errors, exampleText, fieldText, formDraft, jsonDraft, jsonMode, jsonSent, listDraft, looseEntry, mapDraft, mapField, parseBox, readField, readForm, readMap, readRows, render, rowsDraft, shapeFields, shortKey, vscode;

    function wireShapes() {
        /**
         * ‼️ U-109 — THE FORM AND THE TABLE, and the same discipline the list
         * editor above keeps: every handler reads the boxes FIRST, and nothing
         * saves except the one button that says it saves.
         */
        document.querySelectorAll('[data-frow]').forEach(el =>
            el.addEventListener('change', () => readForm(el.dataset.frow)));
        document.querySelectorAll('[data-rrow]').forEach(el =>
            el.addEventListener('change', () => readRows(el.dataset.rrow)));
        document.querySelectorAll('[data-fapply]').forEach(btn =>
            btn.addEventListener('click', () => applyForm(btn.dataset.fapply)));
        document.querySelectorAll('[data-radd]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.radd;
                const at = readRows(key).length;
                rowsDraft[key].push({});
                render();
                // U-141 — the caret goes into the row that was just made, in
                // its FIRST declared field. Same reason as the list editor: it
                // saves an aim with the mouse, and it is how the press proves
                // it landed on a page that redraws itself.
                const first = (shapeFields(key) || [])[0];
                const box = first
                    && document.getElementById(`r-${shortKey(key)}-${at}-${first.name}`);
                if (box && box.focus) { try { box.focus(); } catch (e) { /* stub DOM */ } }
            }));
        document.querySelectorAll('[data-rdel]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.rdel;
                const i = Number(btn.dataset.ri);
                const rows = readRows(key);
                if (i >= 0 && i < rows.length) { rows.splice(i, 1); }
                render();
            }));
        document.querySelectorAll('[data-rapply]').forEach(btn =>
            btn.addEventListener('click', () => applyRows(btn.dataset.rapply)));
        // Into the JSON box and back, for both shapes. What is on screen goes
        // WITH it either way: switching view is not a reason to lose a typed
        // cell, and a JSON that does not parse is refused rather than turned
        // into rows of braces.
        document.querySelectorAll('[data-fjson]').forEach(el =>
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                const key = el.dataset.fjson;
                jsonDraft[key] = boxText(looseEntry(shapeFields(key), readForm(key)));
                jsonMode[key] = true;
                render();
            }));
        document.querySelectorAll('[data-rjson]').forEach(el =>
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                const key = el.dataset.rjson;
                const fields = shapeFields(key);
                jsonDraft[key] = boxText(readRows(key).map(c => looseEntry(fields, c)));
                jsonMode[key] = true;
                render();
            }));
        document.querySelectorAll('[data-fform]').forEach(el =>
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                const key = el.dataset.fform;
                const v = parseBox(key, 'object');
                if (v === undefined) { render(); return; }
                formDraft[key] = cellsOf(shapeFields(key), v);
                delete errors[key];
                delete jsonDraft[key];
                delete jsonMode[key];
                render();
            }));
        document.querySelectorAll('[data-rtable]').forEach(el =>
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                const key = el.dataset.rtable;
                const v = parseBox(key, 'array');
                if (v === undefined) { render(); return; }
                const fields = shapeFields(key);
                rowsDraft[key] = v.map(entry => cellsOf(fields, entry));
                delete errors[key];
                delete jsonDraft[key];
                delete jsonMode[key];
                render();
            }));
        /** ‼️ U-110 — the pair editor. Same discipline again: read first, and
         *  nothing saves except the button that says it saves. */
        document.querySelectorAll('[data-mrow]').forEach(el =>
            el.addEventListener('change', () => readMap(el.dataset.mrow)));
        document.querySelectorAll('[data-madd]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.madd;
                const at = readMap(key).length;
                mapDraft[key].push({ k: '', v: '' });
                render();
                // U-141 — into the NAME box, which is the one that cannot be
                // left empty; a pair with no name is refused on save.
                const box = document.getElementById(`m-${shortKey(key)}-${at}-k`);
                if (box && box.focus) { try { box.focus(); } catch (e) { /* stub DOM */ } }
            }));
        document.querySelectorAll('[data-mdel]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.mdel;
                const i = Number(btn.dataset.mi);
                const pairs = readMap(key);
                if (i >= 0 && i < pairs.length) { pairs.splice(i, 1); }
                render();
            }));
        document.querySelectorAll('[data-mapply]').forEach(btn =>
            btn.addEventListener('click', () => applyMap(btn.dataset.mapply)));
        document.querySelectorAll('[data-mjson]').forEach(el =>
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                const key = el.dataset.mjson;
                const item = allItems().find(i => i.key === key);
                const f = mapField(item.shape);
                const loose = {};
                for (const p of readMap(key)) {
                    const name = String(p.k).trim();
                    if (!name) { continue; }
                    const r = readField(f, p.v);
                    loose[name] = r.skip ? '' : (r.err ? String(p.v) : r.v);
                }
                jsonDraft[key] = boxText(loose);
                jsonMode[key] = true;
                render();
            }));
        document.querySelectorAll('[data-mpairs]').forEach(el =>
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                const key = el.dataset.mpairs;
                const v = parseBox(key, 'object');
                if (v === undefined) { render(); return; }
                const item = allItems().find(i => i.key === key);
                const f = mapField(item.shape);
                mapDraft[key] = Object.keys(v).map(k => ({ k, v: fieldText(f, v[k]) }));
                delete errors[key];
                delete jsonDraft[key];
                delete jsonMode[key];
                render();
            }));
        document.querySelectorAll('[data-json]').forEach(el =>
            el.addEventListener('change', () => { jsonDraft[el.dataset.json] = String(el.value); }));
        document.querySelectorAll('[data-apply]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.apply;
                delete errors[key];
                const ta = document.getElementById('c-' + shortKey(key));
                // It has been sent; from here the store is the truth, and the
                // box redraws from what was really written.
                delete jsonDraft[key];
                /**
                 * ‼️ U-142 — AND THE ESCAPE HATCH LETS GO WHEN THE SAVE LANDS.
                 *
                 * `jsonMode` is the reader saying "show me the raw value
                 * instead"; once they have applied it the request is answered,
                 * and a setting the schema describes completely should go back
                 * to its own editor rather than staying a textarea for the rest
                 * of the session. The structured view is also the plainest
                 * proof the save landed, and "Edit as JSON" is one click away.
                 *
                 * ‼️ BUT A REFUSAL MUST NOT THROW THE READER OUT OF THE BOX
                 * THEY WERE WRITING IN. The host answers `error` when the text
                 * does not parse, so what was sent is held here until one of
                 * the two answers arrives — and put straight back if it was
                 * refused. Without this half, a mistyped brace would drop the
                 * reader into the row editor AND lose everything they typed.
                 */
                jsonSent[key] = ta ? ta.value : '';
                delete jsonMode[key];
                vscode.postMessage({ type: 'set', key, value: ta ? ta.value : '' });
            }));
        // ‼️ U-89 — the example is written into the BOX and nothing is saved.
        // The user reads it, edits it, and presses Apply themselves: a button
        // that silently overwrote a live setting with a sample would be the
        // worst possible reading of "show me what goes here".
        document.querySelectorAll('[data-example]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.example;
                const item = allItems().find(i => i.key === key);
                const ta = document.getElementById('c-' + shortKey(key));
                if (!item || !item.shape || !ta) { return; }
                ta.value = exampleText(item.shape);
                jsonDraft[key] = ta.value;
                ta.focus();
            }));
        document.querySelectorAll('[data-reset]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.reset;
                delete errors[key];
                // A reset throws the value away, so it throws every draft of it
                // away too — a box still showing the old edit would be a lie.
                delete jsonDraft[key];
                delete listDraft[key];
                delete formDraft[key];
                delete rowsDraft[key];
                delete mapDraft[key];
                // ‼️ U-142 — AND THE VIEW THE DRAFTS WERE MADE IN. `jsonMode` is
                // a request about a value; once that value is gone the request
                // has no subject left, and leaving it set kept the setting a
                // textarea with nothing in it. Unlike Apply there is nothing to
                // wait for: a reset only removes a key and cannot be refused.
                delete jsonMode[key];
                delete jsonSent[key];
                vscode.postMessage({ type: 'reset', key });
            }));
        // The host opens the native dialog and saves what comes back — the page
        // never has to know the path, and the refresh that follows redraws the
        // box with it.
        document.querySelectorAll('[data-browse]').forEach(btn =>
            btn.addEventListener('click', () => {
                delete errors[btn.dataset.browse];
                vscode.postMessage({ type: 'browse', key: btn.dataset.browse, kind: btn.dataset.browsekind });
            }));
    }

    window.AFSettingWireShapes = function (ctx) {
        X = ctx;
        ({ allItems, applyForm, applyMap, applyRows, boxText, cellsOf, errors, exampleText, fieldText, formDraft, jsonDraft, jsonMode, jsonSent, listDraft, looseEntry, mapDraft, mapField, parseBox, readField, readForm, readMap, readRows, render, rowsDraft, shapeFields, shortKey, vscode } = ctx);
        return { wireShapes };
    };
})();
