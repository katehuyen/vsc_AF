// Agent Farm — Farm Settings: what the plain-list editor's controls do (U-108, X-193), and Enter saving every editor (U-139).
// Split out of media/settings.js unchanged (U-225): the page hands its state in once, as X.
(function () {
    'use strict';
    let X, allItems, applyForm, applyList, applyMap, applyRows, boxText, errors, jsonDraft, jsonMode, listDraft, readList, render, shortKey, vscode;

    function wireList() {
        /**
         * ‼️ U-108 — THE LIST EDITOR. Every one of these reads the boxes
         * FIRST (`readList`), because a redraw throws away a row that has
         * been typed into and not yet committed — type a path, press + on
         * the row above, and without this the path is gone.
         *
         * Nothing here saves except `Save the list`. Adding and removing
         * act on the draft, so a list half-edited and abandoned leaves the
         * setting exactly as it was.
         */
        document.querySelectorAll('[data-lrow]').forEach(el =>
            el.addEventListener('change', () => readList(el.dataset.lrow)));
        /**
         * ‼️ U-139 — ENTER SAVES THE EDITOR THE BOX BELONGS TO, all four
         * shapes, from one rule.
         *
         * `change` fires on blur and only fills the draft, so a reader who
         * typed an entry and pressed Enter — the one key a single-line box is
         * expected to answer — got nothing at all, and read the whole page as
         * dead. It is the same defect in the list, the form, the table and the
         * pair editor, so it is fixed once: a box carries the attribute that
         * names its editor, and the attribute names the save.
         *
         * Each `apply*` reads the boxes itself, so the value being typed right
         * now is the value that is saved — `change` has not fired yet.
         */
        [['lrow', applyList], ['frow', applyForm], ['rrow', applyRows], ['mrow', applyMap]]
            .forEach(([attr, save]) => {
                document.querySelectorAll(`[data-${attr}]`).forEach(el =>
                    el.addEventListener('keydown', (e) => {
                        if (!e || e.key !== 'Enter') { return; }
                        // A multi-line box keeps Enter: there, it is a newline
                        // and never a save.
                        if (String(el.tagName || '').toUpperCase() === 'TEXTAREA') { return; }
                        if (e.preventDefault) { e.preventDefault(); }
                        save(el.dataset[attr]);
                    }));
            });
        document.querySelectorAll('[data-ladd]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.ladd;
                const at = readList(key).length;
                listDraft[key].push('');
                render();
                // U-139 — the row that was just made is where the hand is
                // going, and a caret already in it is one fewer aim with a
                // mouse. It also proves the press landed, which is the
                // complaint this item is made of.
                const box = document.getElementById('l-' + shortKey(key) + '-' + at);
                if (box && box.focus) { try { box.focus(); } catch (e) { /* stub DOM */ } }
            }));
        document.querySelectorAll('[data-ldel]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.ldel;
                const i = Number(btn.dataset.li);
                const rows = readList(key);
                if (i >= 0 && i < rows.length) { rows.splice(i, 1); }
                render();
            }));
        /**
         * ‼️ X-193 — MOVING A ROW IS EDITING THE VALUE, not decorating the page.
         * `readList` first for U-108's reason: a row typed into and not yet
         * committed lives only in the DOM, and reordering around it would throw
         * the typing away. Both gestures land here so there is one move, not two.
         */
        const moveRow = (key, from, to) => {
            const rows = readList(key);
            if (from < 0 || from >= rows.length || to < 0 || to >= rows.length || from === to) { return; }
            rows.splice(to, 0, rows.splice(from, 1)[0]);
            render();
        };
        document.querySelectorAll('[data-lmove]').forEach(btn =>
            btn.addEventListener('click', () => {
                const i = Number(btn.dataset.li);
                moveRow(btn.dataset.lmove, i, i + Number(btn.dataset.ldir));
            }));
        document.querySelectorAll('[data-ldrag]').forEach(row => {
            row.addEventListener('dragstart', (e) => {
                X.dragging = { key: row.dataset.ldrag, i: Number(row.dataset.li) };
                if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; }
                row.classList.add('dragging');
            });
            row.addEventListener('dragend', () => { row.classList.remove('dragging'); X.dragging = null; });
            // A row only accepts a row from ITS OWN list; dragging between two
            // settings would be a move nobody asked for and could not undo.
            row.addEventListener('dragover', (e) => {
                if (!X.dragging || X.dragging.key !== row.dataset.ldrag) { return; }
                e.preventDefault();
                if (e.dataTransfer) { e.dataTransfer.dropEffect = 'move'; }
            });
            row.addEventListener('drop', (e) => {
                if (!X.dragging || X.dragging.key !== row.dataset.ldrag) { return; }
                e.preventDefault();
                const from = X.dragging.i, to = Number(row.dataset.li);
                X.dragging = null;
                moveRow(row.dataset.ldrag, from, to);
            });
        });
        document.querySelectorAll('[data-lapply]').forEach(btn =>
            btn.addEventListener('click', () => applyList(btn.dataset.lapply)));
        document.querySelectorAll('[data-llist]').forEach(el =>
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                const key = el.dataset.llist;
                // …and back the same way: the box is parsed into rows when it
                // can be, and left alone when it cannot, so a half-typed JSON
                // is not silently turned into one row containing a brace.
                const ta = document.getElementById('c-' + shortKey(key));
                if (ta) {
                    try {
                        const v = JSON.parse(String(ta.value || '[]'));
                        if (Array.isArray(v)) {
                            listDraft[key] = v.map(x => String(x ?? ''));
                            delete errors[key];
                        } else {
                            errors[key] = 'that is not a list — the JSON box is still here';
                            render();
                            return;
                        }
                    } catch {
                        errors[key] = 'the JSON in the box does not parse, so it cannot be shown as rows';
                        render();
                        return;
                    }
                }
                delete jsonDraft[key];
                delete jsonMode[key];
                render();
            }));
        // ‼️ The picker fills ONE ROW and saves nothing — unlike the scalar
        // Browse beside a single path box, which IS the whole value. The host
        // opens the dialog and posts the path back; the draft takes it.
        document.querySelectorAll('[data-lbrowse]').forEach(btn =>
            btn.addEventListener('click', () => {
                const key = btn.dataset.lbrowse;
                readList(key);
                vscode.postMessage({
                    type: 'browseRow', key, index: Number(btn.dataset.li), kind: btn.dataset.lkind
                });
            }));
    }

    /** U-227 — the list as JSON, from the row's right-click menu. What is on screen goes INTO the JSON box:
     *  switching view is not a reason to lose what was typed. */
    function listToJson(key) {
        const item = allItems().find(i => i.key === key);
        const numeric = item && item.shape
            && (item.shape.itemType === 'number' || item.shape.itemType === 'integer');
        jsonDraft[key] = boxText(readList(key)
            .map(v => String(v).trim()).filter(v => v !== '')
            .map(v => (numeric && Number.isFinite(Number(v)) ? Number(v) : v)));
        jsonMode[key] = true;
        render();
    }

    window.AFSettingWireList = function (ctx) {
        X = ctx;
        ({ allItems, applyForm, applyList, applyMap, applyRows, boxText, errors, jsonDraft, jsonMode, listDraft, readList, render, shortKey, vscode } = ctx);
        return { wireList, listToJson };
    };
})();
