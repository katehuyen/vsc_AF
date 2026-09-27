// Agent Farm — Farm Settings page: schema-driven editor for every agentFarm.*
// setting, with search, per-setting reset, and named setting sets.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    let filter = '';
    let saveOpen = false;          // "Save current as…" inline input visibility
    const errors = {};             // key -> validation error from the host
    // A-25 — the installed-voice list costs a PowerShell process, so the card
    // asks for it ONCE per open page. The answer arrives as a redraw and a
    // redraw is where the ask lives, so without this the page would spawn a
    // shell per frame; the ↻ on the strip is the deliberate second ask.
    let speakVoicesAsked = false;
    // U-84 — what the last live `getMe` said, drawn inside the bridge card.
    // Held on the page rather than in DATA: it is an answer to a question this
    // reader asked, not a fact about the farm, and it does not survive a reload.
    let svcMsg = null;
    /**
     * ‼️ U-108 — THE LIST BEING EDITED, and whether the user asked for the
     * raw JSON instead.
     *
     * Nine settings are a plain list of strings or numbers — root folders,
     * excluded folders, model names, chat ids, hosts. There is no JSON to
     * get right in ANY of them, and the page asked for it anyway: a
     * textarea, a pair of brackets, and a comma the user had to remember.
     *
     * The draft is the page's, not the store's, for the reason every draft
     * in this extension is: adding and removing a row must not save
     * anything, so a list half-edited and abandoned leaves the setting
     * exactly as it was. It is dropped on Apply, and the refresh that
     * follows redraws from what was really stored.
     */
    const listDraft = {};          // key -> the rows being edited
    let dragging = null;           // X-193 — { key, i } while a row is in hand
    /**
     * ‼️ U-109 — and the same draft for the two shapes whose FIELDS the
     * manifest declares: one object with named fields is a form, a list of
     * them is a table. Both hold the BOX TEXT rather than typed values, so a
     * half-typed number survives a redraw exactly as it was typed; the
     * conversion happens once, on save, where a refusal can be shown.
     */
    const formDraft = {};          // key -> { field: text } being edited
    const rowsDraft = {};          // key -> [ { field: text } ] being edited
    /** U-110 — the free-form maps: [ { k, v } ] in the order shown, because a
     *  pair being renamed must not jump around under the hand, and an object
     *  cannot hold two rows that are briefly called the same thing. */
    const mapDraft = {};           // key -> [ { k, v } ] being edited
    const jsonMode = {};           // key -> the user asked for the raw box
    /** U-142 — the raw text an Apply sent, held until the host says whether it
     *  parsed. A refusal puts both the box and the text back. */
    const jsonSent = {};           // key -> the text sent, while the host answers
    /**
     * ‼️ THE TEXT IN THE JSON BOX, whenever the page has a reason to keep it.
     *
     * A defect U-108 shipped and this is the fix: "Edit as JSON" read the rows
     * carefully into the draft and then drew the textarea from the STORED
     * value, so everything typed since the last save was silently replaced the
     * moment the user asked to see it as JSON — the opposite of what that link
     * promises. It is the same box in both directions, so it is one store:
     * entering JSON mode fills it from what was on screen, and a document that
     * REFUSES to parse stays in it, because a box that swallowed the broken
     * text is a box the user cannot fix.
     */
    const jsonDraft = {};          // key -> the text the box is showing
    // While the user is typing in a field, background refreshes must not wipe
    // the edit — hold the data and apply it when focus leaves (2.47.0 lesson).
    let editing = false;
    let pendingData = null;

    function shortKey(k) { return k.replace(/^agentFarm\./, ''); }

    /** Every setting on the page, flat. Two controls ask "which item is this
     *  key?" and both used to walk the categories themselves. */
    function allItems() {
        return (DATA.categories || []).reduce((a, c) => a.concat(c.items || []), []);
    }

    function fmtDefault(v) {
        if (v === undefined) { return '(none)'; }
        try {
            const s = JSON.stringify(v);
            return s.length > 60 ? s.slice(0, 60) + '…' : s;
        } catch { return String(v); }
    }

    // What a person types looking for the auto-answer rows, whose keys say neither.
    const AUTOANSWER_TERMS = 'soru sorular question questions ask askuserquestion timeout zaman aşımı '
        + 'otomatik cevap yanıt answer unanswered default pick choose wait';

    function matches(it) {
        if (!filter) { return true; }
        // The saved-prompts row answers to the words a person would actually
        // type looking for it — its own key and description say "snippets file"
        // and nothing about right-clicking Send (see PROMPT_TERMS).
        const extra = it.key === 'agentFarm.promptSnippetsFile' ? ' ' + PROMPT_TERMS
            : /^agentFarm\.wiki/.test(it.key) ? ' ' + WIKI_TERMS
                : /^agentFarm\.superpowers/.test(it.key) ? ' ' + SP_TERMS
                    : /^agentFarm\.telegram/.test(it.key) ? ' ' + TG_TERMS
                        : /^agentFarm\.console\.autoAnswer/.test(it.key) ? ' ' + AUTOANSWER_TERMS : '';
        return window.AFQuery.compile(filter).test(it.key + ' ' + (it.description || '') + extra);
    }

    /**
     * ‼️ U-143 — A WHOLE SECTION ANSWERS THE FILTER WITH THE PAGE'S OWN GRAMMAR.
     *
     * The sections that are not made of setting rows used to gate themselves on
     * `TERMS.includes(what you typed)` — the question backwards, and a different
     * question from the one every row above is asked. So `-wiki`, `a OR b`, a
     * quoted phrase and whole-word mode each hid the section instead of
     * filtering the page, and one of the two gates compared case-sensitively on
     * top: typing `Obsidian` hid the very section that word names. One grammar,
     * every box (media/afQuery.js) — a section is just another row to it.
     */
    function sectionMatches(text) {
        return !filter || window.AFQuery.compile(filter).test(text);
    }

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
        const rows = (DATA.pathPreview || {})[key];
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
        const mirror = [text, f.description, note].filter(Boolean).join('\n\n');
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
        if (f.description) { lines.push(''); lines.push(f.description); }
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
                    `<span class="setfdesc">${C.esc(f.description)}</span>`,
                    f.name, f.description, 'setfdescw')
                : '<span class="setfdesc"></span>'}
            </div>`).join('')}
            <div class="setjrow">
                <button class="secondary small" data-fapply="${C.esc(it.key)}"
                    title="Save this object. Until you press it, nothing here has changed the setting. A field left empty is left out, so its own default keeps applying.">Save the form</button>
                <a href="#" class="setljson" data-fjson="${C.esc(it.key)}"
                    title="Show the raw JSON instead. Some value the schema cannot describe is always possible, so the box is still there.">Edit as JSON</a>
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
                <a href="#" class="setljson" data-rjson="${C.esc(it.key)}"
                    title="Show the raw JSON instead. Some value the schema cannot describe is always possible, so the box is still there.">Edit as JSON</a>
                ${shapeHtml(it, true)}
            </div>
        </div>`;
    }

    // ---- U-110 — the settings that are a set of name → value pairs ----

    /**
     * ‼️ U-110 — THE NAMES THIS PAGE ALREADY KNOWS.
     *
     * A map's keys are the user's, so nothing can list them — but a budget
     * filed under a misspelled agent name is a budget that never applies and
     * never says why, and the page is holding the fleet the whole time. So the
     * name box SUGGESTS and still accepts anything typed.
     *
     * ‼️ WHICH list is a fact of the MANIFEST (`x-af-keys`), because the three
     * maps disagree: `budgets` is keyed by agent name and `*` means the whole
     * fleet, `superpowersDefaults` is keyed by name with NO wildcard (an exact
     * match — see superpowersDefaultsKey), and `agentEngineDefaults` is keyed
     * by an agent's folder. One guessed list for all three would offer `*`
     * where it does nothing at all.
     */
    function keyHints(source) {
        const reports = (DATA.folders && DATA.folders.reports) || [];
        const agents = reports.filter(r => !r.duplicate)
            .reduce((a, r) => a.concat(r.candidates || []), []);
        if (source === 'agentDir') { return agents.map(c => c.dir).filter(Boolean); }
        // X-171 — an account is chosen PER ENGINE, so the names of this one are
        // the engines this machine knows. Read off the same list the Engines
        // section draws, never a second copy of it.
        if (source === 'engine') { return (DATA.engines || []).map(e => e.id).filter(Boolean); }
        const names = agents.map(c => c.name).filter(Boolean);
        if (source === 'agent') { return names; }
        // The wildcard first, because it is the answer a fleet-wide figure wants
        // and the one nobody guesses is available.
        if (source === 'agentOrAll') { return ['*'].concat(names); }
        return [];
    }

    /** The pairs this key is showing: the draft being edited, or what is stored. */
    function mapPairs(it) {
        if (mapDraft[it.key]) { return mapDraft[it.key]; }
        const v = (it.value && typeof it.value === 'object' && !Array.isArray(it.value)) ? it.value : {};
        const f = mapField(it.shape);
        return Object.keys(v).map(k => ({ k, v: fieldText(f, v[k]) }));
    }

    /** One value of a map, described as a field — so the box that draws it is
     *  the SAME box a form field and a table cell get. */
    function mapField(s) {
        return {
            name: 'value', type: s.valueType || 'object', required: false, description: '',
            ...(s.valueAllowed && s.valueAllowed.length ? { allowed: s.valueAllowed } : {})
        };
    }

    /** ‼️ Read the boxes before anything structural happens — the same lesson
     *  the list, the form and the table all keep. */
    function readMap(key) {
        const id = shortKey(key);
        const out = [];
        for (let i = 0; ; i++) {
            const name = document.getElementById(`m-${id}-${i}-k`);
            if (!name) { break; }
            const val = document.getElementById(`m-${id}-${i}-v`);
            out.push({ k: String(name.value), v: val ? String(val.value) : '' });
        }
        mapDraft[key] = out;
        return out;
    }

    /** ‼️ U-139 — and saving the pairs, in one function for the reason the
     *  other three are: Enter in a box saves the editor that box belongs to. */
    function applyMap(key) {
        delete errors[key];
        const item = allItems().find(i => i.key === key);
        const f = mapField(item.shape);
        const out = {};
        for (const pair of readMap(key)) {
            const name = String(pair.k).trim();
            const r = readField(f, pair.v);
            // A row with neither a name nor a value is what pressing + leaves
            // behind; dropping it is kinder than refusing.
            if (!name && r.skip) { continue; }
            if (!name) {
                errors[key] = 'a value needs a name — fill the left box in, or remove the row';
                render(); return false;
            }
            if (r.err) { errors[key] = `${name}: ${r.err.replace(/^value /, '')}`; render(); return false; }
            if (r.skip) {
                // ‼️ A NAME WITH NO VALUE IS NOT A PAIR, and writing it as ""
                // would file a budget of nothing under a real agent — a setting
                // that looks set and does nothing.
                errors[key] = `${name} has no value — give it one, or remove the row`;
                render(); return false;
            }
            if (Object.prototype.hasOwnProperty.call(out, name)) {
                errors[key] = `${name} is in the list twice — an object cannot hold the same name twice`;
                render(); return false;
            }
            out[name] = r.v;
        }
        delete mapDraft[key];
        vscode.postMessage({ type: 'set', key, value: out });
        return true;
    }

    /**
     * ‼️ U-110 — A SET OF NAME → VALUE PAIRS IS A ROW EDITOR.
     *
     * Three settings are a free-form object: `budgets`, `superpowersDefaults`,
     * `agentEngineDefaults`. Nothing can list their keys, which is exactly why
     * they were left as a JSON textarea — and it is the wrong conclusion. The
     * KEY is free; the PAIR is not. Setting a budget meant hand-writing
     * `{"developer": 20}` including the brace, the quote and the colon, and
     * getting the agent's name right from memory, with a misfiled name failing
     * silently for ever.
     *
     * ‼️ A NAME BOX THAT SUGGESTS BUT DOES NOT CONSTRAIN. `*` is a real key,
     * an agent that does not exist yet is a real key, and a picker would have
     * refused both. The suggestions come from the fleet the page is already
     * holding; the list a map draws on is declared in the schema.
     */
    function mapHtml(it) {
        const id = shortKey(it.key);
        const pairs = mapPairs(it);
        const f = mapField(it.shape);
        const hints = keyHints(it.shape.keySource);
        const listId = `dl-${id}`;
        const one = (p, i) => `<div class="setmrow">
            <input type="text" id="m-${id}-${i}-k" data-mrow="${C.esc(it.key)}"
                value="${C.esc(p.k)}" placeholder="a name"${hints.length ? ` list="${listId}"` : ''}
                title="${C.esc(p.k || 'The name this value applies to.')}">
            <span class="setmarrow">→</span>
            ${fieldBox(f, `m-${id}-${i}-v`, p.v, `data-mrow="${C.esc(it.key)}"`)}
            <button class="mini secondary" data-mdel="${C.esc(it.key)}" data-mi="${i}"
                title="Remove this pair. Nothing is saved until you press Save the pairs.">✕</button>
        </div>`;
        return `<div class="setlist">
            ${hints.length ? `<datalist id="${listId}">${hints.map(h =>
            `<option value="${C.esc(h)}"></option>`).join('')}</datalist>` : ''}
            ${pairs.length ? pairs.map(one).join('')
                : '<div class="muted small">Empty — nothing is set. Add a pair below.</div>'}
            <div class="setjrow">
                <button class="secondary small" data-madd="${C.esc(it.key)}"
                    title="Add one more name → value pair.">+ add</button>
                <button class="secondary small" data-mapply="${C.esc(it.key)}"
                    title="Save these pairs. Until you press it, nothing here has changed the setting.">Save the pairs</button>
                <a href="#" class="setljson" data-mjson="${C.esc(it.key)}"
                    title="Show the raw JSON instead. Some value the schema cannot describe is always possible, so the box is still there.">Edit as JSON</a>
                ${shapeHtml(it, true)}
            </div>
        </div>`;
    }

    /** The way back out of the JSON box, per shape: [attribute, phrase, noun].
     *  A shape with no editor of its own (`map`, `free`) has no way back and
     *  gets no link — a "Back to the …" that led nowhere would be a dead
     *  control, which is the thing this whole change removes. */
    const BACK = {
        list: ['llist', 'one box per entry', 'list'],
        form: ['fform', 'one box per field', 'form'],
        rows: ['rtable', 'one row per entry', 'table'],
        map: ['mpairs', 'one row per pair', 'pairs']
    };

    function controlHtml(it) {
        const id = `c-${shortKey(it.key)}`;
        if (it.type === 'boolean') {
            return `<input type="checkbox" id="${id}" data-set="${C.esc(it.key)}"${it.value ? ' checked' : ''}>`;
        }
        if (it.enum && it.enum.length) {
            // U-130 — the box CUTS a long enum value and the popup belongs to
            // the OS, so the name goes on the option itself. The one fact the
            // list already implies and nobody can see: which of them is the
            // value this setting falls back to when it is left alone.
            /**
             * ‼️ audit B-05 — AND AN EMPTY MEMBER IS NOT AN EMPTY BOX.
             *
             * `agentFarm.wikiEngine` and `agentFarm.wikiEffort` name `''` in
             * their own enum and default to it, so this map drew an option
             * whose text was the empty string: on the page, a picker with
             * NOTHING in it, three rows under one saying `high` and one saying
             * `opus`. Nothing on the screen said whether it was unset, broken
             * or still loading. The value is real and it means "left out" —
             * so it is written down, the same way the Claude-config picker
             * three hundred lines below already writes it.
             */
            const label = (o) => o === '' ? '— not set —' : o;
            const why = (o) => [
                o === '' ? 'Left out of your settings, so whoever starts the work decides it.' : '',
                String(it.default ?? '') === o ? `The default for ${shortKey(it.key)}.` : ''
            ].filter(Boolean).join(' ');
            return `<select id="${id}" data-set="${C.esc(it.key)}">${it.enum.map(o =>
                C.option(o, label(o), {
                    selected: String(it.value) === o,
                    detail: why(o)
                })).join('')}</select>`;
        }
        /**
         * ‼️ U-84 (d) — A PICKER WHOSE OPTIONS ARE NOT IN THE MANIFEST.
         *
         * `telegram.defaultAgent` and `wikiAgent` are strings whose only correct
         * values are the names of agents this machine has — which the schema
         * cannot enumerate and a text box cannot check. The schema names a
         * SOURCE and the host fills it in (`DATA.valueSources`).
         *
         * ‼️ AND THE STORED VALUE IS ALWAYS AN OPTION, even when the source has
         * never heard of it. An agent that was renamed or is not on this machine
         * would otherwise be silently swapped for whatever sits first in the
         * list, which is a settings page changing a setting nobody touched.
         */
        const src = it.values && (DATA.valueSources || {})[it.values];
        if (src) {
            const cur = String(it.value ?? '');
            const names = cur && src.indexOf(cur) < 0 ? [cur].concat(src) : src;
            return `<select id="${id}" data-set="${C.esc(it.key)}">
                ${C.option('', '— none —', { selected: !cur, detail: `Leave ${shortKey(it.key)} unset.` })}
                ${names.map(o => C.option(o, o + (src.indexOf(o) < 0 ? ' (not on this machine)' : ''), {
                selected: cur === o,
                detail: src.indexOf(o) < 0
                    ? 'Stored in the setting, but nothing here answers to that name — kept so redrawing the page cannot quietly swap it for the first entry in the list.'
                    : ''
            })).join('')}</select>`;
        }
        if (it.type === 'number') {
            return `<input type="number" id="${id}" data-set="${C.esc(it.key)}" value="${C.esc(String(it.value ?? ''))}" style="width:110px">`;
        }
        // ‼️ U-108/U-109 — a shape the schema describes gets the editor that
        // fits it rather than a JSON box, unless the user asked for the box.
        // Derived from `shape.kind`, never from a list of keys.
        if (it.shape && !jsonMode[it.key]) {
            if (it.shape.kind === 'list') { return listHtml(it); }
            if (it.shape.kind === 'form') { return formHtml(it); }
            if (it.shape.kind === 'rows') { return rowsHtml(it); }
            if (it.shape.kind === 'map') { return mapHtml(it); }
        }
        if (it.type === 'array' || it.type === 'object') {
            let text = '';
            // What the box is showing beats what is stored: the user got here
            // from an editor with unsaved work in it, or from a refusal they
            // are in the middle of fixing.
            if (jsonDraft[it.key] !== undefined) { text = jsonDraft[it.key]; }
            else {
                try { text = JSON.stringify(it.value ?? (it.type === 'array' ? [] : {}), null, 2); } catch { text = ''; }
            }
            const rows = Math.min(10, Math.max(2, text.split('\n').length));
            return `<textarea id="${id}" data-json="${C.esc(it.key)}" rows="${rows}" spellcheck="false"
                style="width:100%; font-family:var(--vscode-editor-font-family); font-size:11px">${C.esc(text)}</textarea>
                <div class="setjrow">
                    <button class="secondary small" data-apply="${C.esc(it.key)}">Apply JSON</button>
                    ${it.shape && BACK[it.shape.kind]
            ? `<a href="#" class="setljson" data-${BACK[it.shape.kind][0]}="${C.esc(it.key)}"
                            title="Back to ${BACK[it.shape.kind][1]}. Nothing here is saved either way until you press a button.">Back to the ${BACK[it.shape.kind][2]}</a>`
            : ''}
                    ${shapeHtml(it)}
                </div>`;
        }
        // A path setting gets a picker beside the box — typing a Windows path
        // by hand is where the typo that makes a feature look broken comes
        // from. Which settings are paths is declared in the SCHEMA (`format`),
        // never listed here: see SettingSpec.browse.
        const browse = it.browse
            ? ` <button class="secondary small" data-browse="${C.esc(it.key)}" data-browsekind="${C.esc(it.browse)}"
                    title="Pick ${it.browse === 'folder' ? 'a folder' : 'a file'} — the path is written into the box and saved">Browse…</button>`
            : '';
        // S-82 — the schema says a text is several lines (editPresentation), so it gets a text box
        if (it.multiline) {
            const text = String(it.value ?? '');
            return `<textarea id="${id}" data-set="${C.esc(it.key)}" rows="${Math.min(14, Math.max(4, text.split('\n').length + 1))}" spellcheck="false"
                placeholder="empty — the built-in text stays in charge"
                style="width:100%; max-width:640px; font-family:var(--vscode-editor-font-family); font-size:11px">${C.esc(text)}</textarea>`;
        }
        return `<span class="setpath"><input type="text" id="${id}" data-set="${C.esc(it.key)}" value="${C.esc(String(it.value ?? ''))}" style="width:100%; max-width:420px">${browse}</span>`;
    }

    function itemHtml(it) {
        const err = errors[it.key];
        return `<div class="setitem${it.modified ? ' modified' : ''}" data-item="${C.esc(it.key)}"
            ${window.AFCtx.row('afSettingRow', { setKey: it.key, afModified: !!it.modified })}
            title="${C.esc(window.AFCtx.hint(it.key + ' — default: ' + fmtDefault(it.default)))}">
            <div class="sethead">
                <span class="setname">${C.esc(shortKey(it.key))}</span>
                ${it.modified ? `<span class="moddot" title="Changed from default (${C.esc(fmtDefault(it.default))})"></span>
                    <button class="reset" data-reset="${C.esc(it.key)}" title="Reset to default: ${C.esc(fmtDefault(it.default))}">↺</button>` : ''}
            </div>
            <div class="setdesc">${C.esc(it.description || '')}</div>
            <div class="setctl">${controlHtml(it)}</div>
            ${/* X-193 — a scalar path says where it points, for the same reason
                  each row of a list does. A list draws its own lines per row, so
                  drawing one here as well would be the fact twice. */
            it.browse && !it.shape ? pathLine(it.key, it.value) : ''}
            ${err ? `<div class="seterr">⚠ ${C.esc(err)}</div>` : ''}
            ${!err && it.refusal ? `<div class="seterr">⚠ An entry for this key in your settings file is being ignored — ${C.esc(it.refusal)}</div>` : ''}
        </div>`;
    }

    // ---- Agent folders — where agents live: roots, nest/single badges, exclude ----

    function pnorm(p) { return String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase(); }

    function rootBadge(r) {
        if (r.duplicate) { return '<span class="rootbadge warn">duplicate entry</span>'; }
        if (r.kind === 'missing') { return '<span class="rootbadge warn">folder missing</span>'; }
        const live = r.candidates.filter(c => !c.excluded).length;
        const ex = r.candidates.length - live;
        const tail = ex ? ` · ${ex} excluded` : '';
        if (r.kind === 'nest') { return `<span class="rootbadge">nest · ${live} agent(s)${tail}</span>`; }
        if (r.kind === 'single-agent') { return `<span class="rootbadge">single agent${live ? '' : ' · excluded'}</span>`; }
        return `<span class="rootbadge">${live} agent(s)${tail}</span>`;
    }

    function rootDesc(r) {
        if (r.duplicate) { return 'Same folder as an earlier entry (case/slash differences ignored) — safe to clean up.'; }
        if (r.kind === 'missing') { return 'This path does not exist on this machine — fix the spelling or remove the entry.'; }
        if (r.kind === 'nest') { return 'A nest: the subfolders below are the agents. The root’s own CLAUDE.md is shared instructions they all load — not an agent of its own.'; }
        if (r.kind === 'single-agent') { return 'This folder is one agent by itself (it has no agent-like subfolders).'; }
        return r.candidates.length ? 'The subfolders below are the agents.' : 'No agent folders found here yet — a subfolder becomes an agent once it has a CLAUDE.md, .claude or memory/.';
    }

    /**
     * ‼️ U-29/U-33 — THE PER-AGENT DEFAULT IS PER ENGINE, AND IT SAYS WHAT IT
     * RESOLVES TO.
     *
     * One box used to serve every engine, and it wrote `.claude/settings.local.json`
     * — a file only Claude Code reads. So a `sonnet` typed here meant something
     * on Claude and nothing at all on the other three, while looking exactly the
     * same on all four; and the word "Default" had no referent a reader could
     * find. Both are fixed by the same two moves: the strip below chooses WHICH
     * ENGINE these defaults are for, and every box names the value it will
     * actually resolve to.
     */
    const agentEngine = () => (DATA.agentDefaultsEngine || 'claude');
    const engineRows = () => (DATA.engines || []);
    const engineLabel = id => {
        const e = engineRows().find(x => x.id === id);
        return e ? e.label : (window.AFEngine ? window.AFEngine.label(id) : id);
    };

    /** The strip above the agent list: which engine the boxes below edit. */
    function agentEngineTabs() {
        const rows = engineRows();
        if (rows.length < 2) { return ''; }
        const cur = agentEngine();
        return `<div class="agtabs">
            <span class="muted small">Defaults for</span>
            ${rows.map(e => `<button class="agtab${e.id === cur ? ' on' : ''}" data-agengine="${C.esc(e.id)}"
                title="${C.esc(e.label + ' — ' + (e.billing || ''))}">${C.esc(e.label)}</button>`).join('')}
            <span class="muted small">${C.esc(agentEngineNote(cur))}</span>
        </div>`;
    }

    /** Where THIS engine's answer is kept — the difference the user has to
     *  know, said once above the list rather than in every row's hover. */
    /**
     * X-255 -- AND THE LINE NAMES THE MODEL RATHER THAN "these defaults".
     *
     * It used to say, of Claude, that what you type below is written to the
     * agent's own settings file. That was true of one box and is now false of
     * another: an account is a directory handed to the process at spawn and
     * Claude Code has no settings key for one, so the sentence above the list has
     * to say which box it is about or it is a claim the reader can check and find
     * wrong (the same U-29 failure this strip exists to end).
     */
    function agentEngineNote(id) {
        return id === 'claude'
            ? 'the MODEL is written to each agent\u2019s .claude/settings.local.json \u2014 the CLI reads it itself, terminal sessions included; the effort and the account are Agent Farm\u2019s and reach only sessions it starts'
            // \u203c\ufe0f U-59 \u2014 no flag is named here any more. It said
            // `--model/--effort` for every non-Claude engine and that was wrong
            // on three of the four (Codex and Gemini take `-m`; OpenCode takes
            // `-m` and calls the effort `--variant`). The per-box note below
            // names the real flag, asked of the engine's own builder; this line
            // is the one sentence above the whole list and now says only the
            // thing that is true of all of them.
            : 'kept by Agent Farm and passed on the command line \u2014 nothing is written to a per-folder file the engine reads on its own';
    }

    // Model names for the CHOSEN engine, read from that engine's own catalog
    // where it has one (see core/models.ts); the alias list is the fallback
    // for an engine that publishes nothing.
    const modelAliases = () => {
        const em = (DATA.engineModels || {})[agentEngine()];
        if (em && em.models && em.models.length) {
            return em.models.filter(m => m.id).map(m => m.id);
        }
        return (DATA.modelAliases && DATA.modelAliases.length) ? DATA.modelAliases : ['haiku', 'sonnet', 'opus', 'fable'];
    };
    let customModelDir = ''; // the chip whose custom-model input is open

    function agentModelSel(c) {
        const eng = agentEngine();
        const per = (c.engines || {})[eng] || {};
        const cur = per.model || '';
        if (customModelDir === c.dir) {
            return `<input type="text" class="agmodel agcustom" data-agcustom="${C.esc(c.dir)}" value="${C.esc(cur)}"
                placeholder="model id — Enter saves, Esc cancels"
                title="Free-text model id, written to the agent's .claude/settings.local.json. To keep a name for every picker, add it to agentFarm.modelAliases.">`;
        }
        const aliases = modelAliases();
        const opts = cur && aliases.indexOf(cur) < 0 ? [cur].concat(aliases) : aliases;
        /**
         * ‼️ B-03.21 (round 2), APPLIED HERE TOO — THE AXIS IS THE
         * HEADING OF THE LIST, NOT A PREFIX ON EVERY VALUE IN IT.
         *
         * Round 1 answered "which box is this?" by writing the axis into every
         * option (`model: sonnet`). The Console measured that and found it the
         * worse of the two halves: the prefix is the part that never changes,
         * so it is the part that survives the clipping, and the VALUE — the
         * only half a reader is looking for — is what gets cut. A native
         * `<optgroup>` label is a heading the browser draws at the top of the
         * OPEN list and refuses to let anybody select, so the axis is named
         * exactly where the choosing happens, once, and costs the collapsed box
         * nothing at all. The Console moved and this page did not, which left
         * one question answered two ways in one product.
         *
         * ‼️ AND THE ZERO ROW IS RESOLVED WITHOUT THIS AGENT'S OWN ANSWER.
         * `per.resolved` walks every layer INCLUDING the value this very box
         * holds, so on an agent whose model is `sonnet` the row that means
         * "clear my choice" read `Default → sonnet` — the name of the one
         * thing you cannot get by picking it. `per.resolvedZero` is the same
         * resolver with this agent's own layers left out: what would really
         * apply if the box were cleared. `res` is still the box's own hover,
         * because that sentence is about what applies NOW.
         *
         * The explanation that used to be IN the label — "(the CLI decides)"
         * — is in the hover, where the rest of that sentence already was.
         */
        const res = per.resolved || {};
        const zeroRes = per.resolvedZero || {};
        const zero = zeroRes.value ? `Default → ${zeroRes.value}` : 'Default';
        return `<select class="agmodel" data-agmodel="${C.esc(c.dir)}"
            title="${C.esc('Default model for this agent on ' + engineLabel(eng) + '. ' + (res.note || ''))}">
            <optgroup label="model">
            ${C.option('', zero, {
                selected: !cur,
                detail: zeroRes.note || 'This agent names no model of its own.'
            })}
            ${opts.map(m => C.option(m, m, {
                selected: cur === m,
                detail: aliases.indexOf(m) < 0 ? 'Set by hand — this engine does not list this model.' : ''
            })).join('')}
            ${C.option('__custom__', 'custom…', { detail: 'Type a model id this engine is not offering here.' })}
            </optgroup>
        </select>`;
    }

    /** …and the effort beside it, from the same engine's own vocabulary: a
     *  model with no effort levels must not be offered five (see core/models.ts). */
    function agentEffortSel(c) {
        const eng = agentEngine();
        const per = (c.engines || {})[eng] || {};
        const em = (DATA.engineModels || {})[eng] || {};
        const list = ((em.efforts || {})[per.model || ''] || (em.efforts || {})[''] || [])
            .filter(e => e.id);
        if (!list.length) { return ''; }
        const cur = per.effort || '';
        const res = per.resolvedEffort || {};
        // ‼️ …and the same shape here: the axis is the optgroup's heading, and
        // the zero row is resolved WITHOUT this agent's own answer.
        const zeroRes = per.resolvedEffortZero || {};
        const zero = zeroRes.value ? `Default → ${zeroRes.value}` : 'Default';
        return `<select class="agmodel" data-ageffort="${C.esc(c.dir)}"
            title="${C.esc('Default reasoning effort for this agent on ' + engineLabel(eng) + '. ' + (res.note || ''))}">
            <optgroup label="effort">
            ${C.option('', zero, {
                selected: !cur,
                detail: zeroRes.note || 'This agent names no effort of its own.'
            })}
            ${list.map(e => C.option(e.id, e.label || e.id, { selected: cur === e.id, detail: e.detail || '' })).join('')}
            </optgroup>
        </select>`;
    }

    /**
     * X-255 -- WHICH SIGN-IN THIS AGENT STANDS ON, beside the model and the
     * effort because it is the same question one axis over: those say what the
     * session is, this says whose plan pays for it.
     *
     * Drawn only where this engine has captured sign-ins at all -- on every
     * other one the box would be a control with nothing to choose between.
     *
     * ONE SUBJECT: this row is the AGENT's answer. The Engines page's standing
     * chip is the MACHINE's, and the zero row here is what names it, so a reader
     * who clears this box can see what they are falling back to.
     */
    function agentAccountSel(c) {
        const eng = agentEngine();
        const per = (c.engines || {})[eng] || {};
        const list = per.accounts || [];
        if (!list.length) { return ''; }
        const cur = per.account || '';
        const res = per.resolvedAccount || {};
        const zeroRes = per.resolvedAccountZero || {};
        const zero = zeroRes.id ? 'Default → ' + (labelOfAccount(list, zeroRes.id) || zeroRes.id) : 'Default';
        return `<select class="agmodel" data-agaccount="${C.esc(c.dir)}"
            title="${C.esc('Standing sign-in for this agent on ' + engineLabel(eng) + '. ' + (res.note || ''))}">
            <optgroup label="account">
            ${C.option('', zero, {
                selected: !cur,
                detail: zeroRes.note || 'This agent names no sign-in of its own.'
            })}
            ${list.map(a => C.option(a.id, a.label || a.id, {
                selected: cur === a.id,
                detail: cur === a.id ? (res.note || '') : ''
            })).join('')}
            </optgroup>
        </select>`;
    }

    const labelOfAccount = (list, id) => {
        const hit = (list || []).find(a => a.id === id);
        return hit ? (hit.label || hit.id) : '';
    };

    function agentChip(c) {
        if (c.excluded) {
            return `<span class="agchip agexcl" title="${C.esc(c.dir)} — excluded, never treated as an agent">${C.esc(c.name)}
                <a data-include="${C.esc(c.dir)}" title="Treat this folder as an agent again">Include</a></span>`;
        }
        const name = c.agentId
            ? `<a data-openagent="${C.esc(c.agentId)}" title="Open this agent's page">${C.esc(c.name)}</a>`
            : C.esc(c.name);
        return `<span class="agchip" title="${C.esc(c.dir)}">${name}
            ${agentModelSel(c)}${agentEffortSel(c)}${agentAccountSel(c)}
            <a class="agex" data-exclude="${C.esc(c.dir)}" title="Never treat this folder as an agent (undo any time with Include)">Exclude</a></span>`;
    }

    function rootItemHtml(r) {
        return `<div class="setitem${r.kind === 'missing' || r.duplicate ? '' : ' modified'}" data-item="root:${C.esc(r.root)}"
            ${window.AFCtx.row('afAgentRoot', { rootPath: r.root, afMissing: r.kind === 'missing' })}
            title="${C.esc(window.AFCtx.hint(r.root))}">
            <div class="sethead" style="flex-wrap:wrap">
                <span class="setname">${C.esc(r.root)}</span>
                ${rootBadge(r)}
                <span style="flex:1"></span>
                ${r.kind === 'missing' || r.duplicate ? '' : `<button class="reset" data-rootreveal="${C.esc(r.root)}" title="Show this folder in the file explorer">Reveal</button>`}
                <button class="reset" data-rootremove="${C.esc(r.root)}" title="Stop scanning this root (the folder itself is not touched)">Remove</button>
            </div>
            <div class="setdesc">${rootDesc(r)}</div>
            ${r.candidates.length ? `<div class="aglist">${r.candidates.map(agentChip).join('')}</div>` : ''}
        </div>`;
    }

    function foldersSection() {
        const f = DATA.folders;
        if (!f) { return ''; }
        const fq = window.AFQuery.compile(filter);
        const reports = f.reports.filter(r =>
            fq.test(r.root + ' ' + r.candidates.map(c => c.name).join(' ')));
        if (filter && !reports.length) { return ''; }
        const dupes = f.reports.some(r => r.duplicate);
        const agentCount = f.reports.reduce((a, r) => a + (r.duplicate ? 0 : r.candidates.filter(c => !c.excluded).length), 0);
        // excludes that no current root explains — stale leftovers, offered for removal
        const known = new Set(f.reports.flatMap(r => r.candidates.map(c => pnorm(c.dir))));
        const stale = (f.excludes || []).filter(x => !known.has(pnorm(x)));
        return `
            <h2 class="cat" id="cat-folders">Agent folders <span class="muted small">${f.reports.length} root(s) · ${agentCount} agent(s)</span></h2>
            <p class="muted small" style="max-width:760px">Where your agents live. Each root folder is scanned: subfolders with a
            <code>CLAUDE.md</code>, <code>.claude</code> or <code>memory/</code> become agents; a root whose subfolders are agents is a
            <b>nest</b> (its own CLAUDE.md = shared instructions); a root with no agent-like subfolders is one agent itself.
            <b>Exclude</b> keeps a folder out of the farm entirely — it stops being an agent everywhere (views, analytics, session
            ownership) until you Include it back. Each agent chip carries a <b>model</b>, an <b>effort</b> and — where that engine has
            captured sign-ins — an <b>account</b> dropdown: that agent's defaults <i>for the engine selected below</i>. The account is
            the one that outranks the machine-wide standing choice on the Engines page, so an agent set here stops following it;
            new agents are seeded from <code>agentFarm.newAgentModel</code>.
            <button class="secondary small" id="rootadd" title="Pick a folder to scan for agents">+ Add root…</button></p>
            ${agentEngineTabs()}
            ${dupes ? `<div class="seterr">⚠ The roots list contains the same folder more than once (case/slash spelling differs) — this distorts discovery. <a id="afcleandupes">Clean duplicates</a></div>` : ''}
            ${reports.map(rootItemHtml).join('')}
            ${stale.length ? `<div class="setitem">
                <div class="sethead"><span class="setname">Excluded, but not under any root</span></div>
                <div class="setdesc">Leftover exclude entries that match nothing anymore — safe to remove.</div>
                <div class="aglist">${stale.map(x =>
                    `<span class="agchip agexcl" title="${C.esc(x)}">${C.esc(x)} <a data-include="${C.esc(x)}" title="Remove this stale entry">Remove</a></span>`).join('')}</div>
            </div>` : ''}`;
    }

    // ---- Claude Code (claude CLI) settings — curated + raw JSON ----

    function ccControl(it) {
        const id = `cc-${it.id}`;
        if (it.kind === 'flag' || it.kind === 'boolean') {
            const on = it.kind === 'flag' ? String(it.value) === '1' : it.value === true;
            return `<input type="checkbox" id="${id}" data-ccset="${it.id}"${on ? ' checked' : ''}>`;
        }
        if (it.kind === 'enum') {
            return `<select id="${id}" data-ccset="${it.id}">
                ${C.option('', '(not set — Claude default)', {
                selected: !it.set,
                detail: `${it.id} is left out of the config and Claude Code decides it.`
            })}
                ${it.enum.map(o => C.option(o, o, {
                selected: String(it.value) === o,
                detail: String(it.default ?? '') === o ? `The value Claude Code uses when ${it.id} is not set.` : ''
            })).join('')}
            </select>`;
        }
        const t = it.kind === 'number' ? 'number' : 'text';
        return `<input type="${t}" id="${id}" data-ccset="${it.id}" value="${C.esc(it.set ? String(it.value) : '')}"
            placeholder="(not set — Claude default)" style="width:${t === 'number' ? '130px' : '100%'}; max-width:420px">`;
    }

    function ccItemHtml(it) {
        const err = errors['cc:' + it.id];
        return `<div class="setitem${it.set ? ' modified' : ''}" data-item="cc:${it.id}"
            title="${C.esc(it.label)} — not set = Claude Code's own default">
            <div class="sethead">
                <span class="setname">${C.esc(it.label)}</span>
                ${it.set ? `<span class="moddot" title="Set in settings.json"></span>
                    <button class="reset" data-ccclear="${it.id}" title="Remove from settings.json — Claude's own default takes over">↺</button>` : ''}
            </div>
            <div class="setdesc">${C.esc(it.description)}</div>
            <div class="setctl">${ccControl(it)}</div>
            ${err ? `<div class="seterr">⚠ ${C.esc(err)}</div>` : ''}
        </div>`;
    }

    function claudeSection() {
        const cc = DATA.claude;
        if (!cc) { return ''; }
        const ccq = window.AFQuery.compile(filter);
        const items = cc.items.filter(it => ccq.test(it.label + ' ' + it.description));
        if (filter && !items.length) { return ''; }
        const rawErr = errors['cc:__raw__'];
        return `
            <h2 class="cat" id="cat-claude">Claude Code (claude CLI) <span class="muted small">${items.length}</span></h2>
            <p class="muted small" style="max-width:760px">These are <b>claude's own settings</b>, not Agent Farm's — the file behind terminal tips like
            “Set CLAUDE_CODE_USE_POWERSHELL_TOOL=1 …”. Edits write to <code>${C.esc(cc.file)}</code>
            (a one-time <code>.agentfarm-backup</code> copy is kept next to it) and apply to <b>new</b> claude sessions.
            <a id="ccopen">Open the file</a></p>
            ${cc.parseError ? `<div class="seterr">⚠ settings.json could not be parsed (${C.esc(cc.parseError)}) — fix it in the raw editor below; edits are blocked until then.</div>` : ''}
            ${items.map(ccItemHtml).join('')}
            <details class="setitem" style="margin-top:10px">
                <summary style="cursor:pointer">Raw settings.json — everything else (hooks, statusLine, permissions lists…)</summary>
                <div class="setdesc">Full contents of the file. Validated before writing — broken JSON is rejected, never saved.</div>
                <textarea id="ccraw" rows="${Math.min(18, Math.max(4, String(cc.raw).split('\n').length))}" spellcheck="false"
                    style="width:100%; font-family:var(--vscode-editor-font-family); font-size:11px">${C.esc(cc.raw)}</textarea>
                <button class="secondary small" id="ccrawapply">Apply raw JSON</button>
                ${rawErr ? `<div class="seterr">⚠ ${C.esc(rawErr)}</div>` : ''}
            </details>`;
    }

    /**
     * ‼️ X-3 — THE SECTION THAT ANSWERS "WHY CAN I NOT RUN THAT ONE HERE".
     *
     * Everything the extension used to say about a non-Claude engine was a row
     * in the secret vault, and the vault is a flat name→value table that knows
     * nothing about engines. So the question had no surface at all: the answer
     * was Ctrl+Shift+P → Set Secret and a guess about which name to type.
     *
     * The fix is not a better key box. TWO OF THE THREE ENGINES ARE PAID FOR BY
     * A SUBSCRIPTION, NOT A KEY — Claude Code with a Pro/Max plan, Codex with a
     * ChatGPT plan — so a screen built around keys is a screen built around the
     * exception. Each row therefore states, in this order: is the CLI here, how
     * is it paid for, is it signed in, and the ONE thing to do next. The key
     * box is offered where a key is genuinely the route, and named exactly
     * (`OPENAI_API_KEY`), because half the difficulty was never knowing which
     * name the engine reads. See src/core/engines.ts.
     */
    const ENGINE_TERMS = 'engine engines model models cli api key apikey login sign in '
        + 'subscription plan auth credentials secret vault';

    /**
     * ‼️ U-143 — THE ENGINE NAMES COME FROM THE DATA, NEVER FROM A HAND-TYPED
     * LIST. `ENGINE_TERMS` used to spell out claude, codex, openai, gemini,
     * antigravity and google, and had therefore never heard of `opencode`: the
     * one engine added after somebody typed that string was the one engine you
     * could not search for, and nothing said so. Each row already carries its
     * own id, its label and the command you type — that is the search text.
     */
    function engineWords(list) {
        return list.map(e => [e.id, e.label, e.cli && e.cli.command].filter(Boolean).join(' ')).join(' ');
    }

    function engineRow(e) {
        const T = window.AFTip;
        // ‼️ U-59 — the SAME decision the Engines page draws, from `afEngine.js`.
        // This was a second copy of the rule and it is how OpenCode's row said
        // "not signed in" here while the Engines page had been taught otherwise.
        const b = window.AFEngine.authBadge(e);
        const tone = b.tone;
        const badge = b.text;
        // Figures on the hover, the way a column's own tooltip works elsewhere:
        // where it was read from, when, and what the alternative route is.
        const facts = T.lines([
            `Command: ${e.cli.command}${e.cli.path ? ' — ' + e.cli.path : ' — not on PATH'}`,
            // ‼️ "nothing set up" is a complaint, and on `builtin` there is
            // nothing TO set up — the engine's own provider is free (U-59).
            `Billing: ${e.auth.mode === 'subscription' ? 'a plan'
                : e.auth.mode === 'apikey' ? 'per token'
                    : e.auth.mode === 'builtin' ? 'free — its own provider, no credential' : 'nothing set up'}`,
            e.auth.file ? `Read from: ~/${e.auth.file}` : '',
            e.auth.refreshedAt ? `Last refreshed: ${new Date(e.auth.refreshedAt).toLocaleString()}` : '',
            // An engine with no key route says so rather than naming a variable
            // that does not exist (see the Engines page).
            e.key.env
                ? `Key name: ${e.key.env}${e.key.inVault ? ' — in the vault' : ' — not in the vault'}`
                : 'Key: this engine has none — nothing to store'
        ]);
        // ‼️ A ROW OFFERS THE STEP IT IS ACTUALLY ON. An engine that is not
        // installed cannot be signed into, and telling somebody to sign in to a
        // command that does not exist is the "not configured" this section was
        // built to stop. So while the CLI is missing, Install is the gesture and
        // it is the primary one; the plan sign-in appears once there is
        // something to sign in TO. The key box stays either way — a key is
        // storable before the CLI arrives and costs nothing to have ready.
        const install = !e.cli.found && e.installCommand
            ? `<button class="small" data-engcmd="${C.esc(e.installCommand)}"
                title="${C.esc(`Write ${e.installCommand} into a terminal — it is NOT run for you, so you can read it first.`)}">Install ${C.esc(e.cli.command)}</button>`
            : '';
        // ‼️ U-59 — same words as the Engines page, for the same reason: on an
        // engine that already runs without a credential, "Sign in with a plan"
        // reads as the missing step rather than as the upgrade it really is.
        const builtin = e.auth.mode === 'builtin';
        const login = e.cli.found && e.loginCommand
            ? `<button class="secondary small" data-engcmd="${C.esc(e.loginCommand)}"
                title="${C.esc(builtin
                    ? `${e.label} already runs without this. Signing in adds the PAID providers beside its own free ones — it fixes nothing, because nothing here is broken. Write ${e.loginCommand} into a terminal; it is NOT run for you.`
                    : `Write ${e.loginCommand} into a terminal — it is NOT run for you. The sign-in happens in your browser and the CLI keeps the grant itself; Agent Farm never sees it.`)}">${builtin ? 'Add paid providers' : 'Sign in with a plan'}</button>`
            : '';
        return `<div class="setitem eng eng-${tone}">
            <div class="sethead">
                <span class="setname">${C.esc(e.label)}</span>
                <span class="engbadge b-${tone}" title="${C.esc(facts)}">${C.esc(badge)}</span>
                <span style="flex:1"></span>
                ${install}${login}
                ${e.key.env ? `<button class="secondary small" data-engkey="${C.esc(e.key.env)}"
                    title="${C.esc(`${e.key.inVault ? 'Replace' : 'Store'} ${e.key.env} in the OS keychain. This is the pay-per-token route; the value never reaches this page.`)}">${e.key.inVault ? 'Replace key' : 'Add key'}</button>` : ''}
                <button class="secondary small" data-engdocs="${C.esc(e.docs)}" title="${C.esc(e.docs)}">Docs</button>
            </div>
            <div class="setdesc">${C.esc(e.billing)}</div>
            <div class="engnext">${C.esc(e.next)}</div>
            <div class="engdetail muted small">${C.esc(e.auth.detail)}</div>
        </div>`;
    }

    function enginesSection() {
        const list = DATA.engines;
        if (!list || !list.length) { return ''; }
        if (!sectionMatches(ENGINE_TERMS + ' ' + engineWords(list))) { return ''; }
        const ready = list.filter(e => e.ready).length;
        const onPlan = list.filter(e => e.ready && e.auth.mode === 'subscription').length;
        // ‼️ THIS IS THE SUMMARY; THE PANEL IS THE PAGE (X-14, settled
        // 2026-08-09). The section stays because the answer belongs where
        // somebody is already looking, but the depth — a real call with a
        // verdict and an age on it, quota, model lists, per-engine defaults —
        // needs a surface of its own. So the rows stay readable here and the
        // button is the first control, not a footnote under them.
        return `
            <h2 class="cat" id="cat-engines">Engines <span class="muted small">${ready} of ${list.length} ready</span></h2>
            <p class="muted small" style="max-width:760px">Which agent CLIs this machine can actually run, and how each one is paid for.
            <b>${onPlan} of ${ready}</b> are running on a subscription rather than per token — a plan sign-in lives in the CLI's own
            credentials file and never passes through Agent Farm. A key is the other route, and it is kept in the OS keychain
            (the <b>Secrets</b> page is the full table); it is injected into an agent's environment under the exact name the engine reads.</p>
            <div class="pj-row" style="margin:0 0 10px"><button id="openengines"
                title="${C.esc('The Engines page: the same rows, plus a real call that proves a turn actually gets through — everything here was read off disk.')}">⚙ Open Engines</button>
                <button id="openaccounts" class="secondary"
                title="${C.esc('The Accounts page: every captured sign-in, how much of its plan is left, and the switch between them — the Engines page\'s accounts section on a page of its own.')}">👥 Open Accounts</button>
                <span class="muted small">everything below was read off disk — only a call proves it works</span></div>
            ${list.map(engineRow).join('')}`;
    }

    function profileBar() {
        // U-128 — a `<select>` cuts its own text and the popup is drawn by the
        // operating system, so the option's native title is the only surface
        // there is. MIRROR: the set's own name first, then what it holds.
        const opts = DATA.profiles.map(p =>
            `<option value="${C.esc(p.name)}" title="${C.esc(`${p.name}\n\n${p.count} setting(s)`
                + `${p.savedAt ? `, saved ${new Date(p.savedAt).toLocaleString()}` : ''}`
                + '. Applying it sets these and returns every other changed setting to its default.')}"
                >${C.esc(p.name)} (${p.count})</option>`).join('');
        return `<div class="profbar">
            <span class="muted small">Setting sets:</span>
            <select id="profsel" ${DATA.profiles.length ? '' : 'disabled'}>
                ${opts || `<option title="${C.esc('No setting set saved yet.\n\n'
                + 'Save current as… stores every setting you have changed under a name, so a machine '
                + 'can be put back the way it was in one press.')}">none saved yet</option>`}
            </select>
            <button class="secondary" id="profapply" ${DATA.profiles.length ? '' : 'disabled'}
                title="Apply the selected set: its values are set, other modified settings return to default">Apply</button>
            <button class="secondary" id="profdel" ${DATA.profiles.length ? '' : 'disabled'} title="Delete the selected set">Delete</button>
            <button class="secondary" id="profsave" title="Save every currently non-default value as a named set">Save current as…</button>
            ${saveOpen ? `<input id="profname" type="text" placeholder="set name" style="width:140px">
                <button id="profconfirm">Save</button>` : ''}
            <span style="flex:1"></span>
            <button class="secondary" id="profexport" ${DATA.profiles.length ? '' : 'disabled'} title="Write all sets to a JSON file">Export</button>
            <button class="secondary" id="profimport" title="Load sets from a JSON file (same-name sets are replaced)">Import</button>
        </div>`;
    }

    /**
     * Which editor a markdown file opens in — the setting behind every "Open"
     * and "App" button in the extension.
     *
     * ‼️ IT IS NOT AN agentFarm.* SETTING AND THAT IS DELIBERATE (core/docopen.ts):
     * the custom-app command is machine-specific and has no business in a
     * git-synced settings surface, so it lives in the extension's own
     * globalStorage. What it DID need was to be findable: it used to be titled
     * "Report / Answer open mode", was missing from the category nav, and did not
     * answer the filter box — so somebody looking at the "App" button on the
     * Projects page had no way to discover which app that was. The words below
     * name every surface it governs, for exactly that reason.
     */
    const DOCOPEN_TERMS = 'open with editor external document report answer notices '
        + 'queue project plan backlog docs';

    const DOCOPEN_LBL = {
        vscode: 'VS Code (raw markdown)', preview: 'Markdown preview (rendered)',
        obsidian: 'Obsidian (rendered in your vault)', custom: 'Custom external app (e.g. Notepad)'
    };
    const DOCOPEN_MODES = ['vscode', 'preview', 'obsidian', 'custom'];

    /** The modes this reader actually has, and what each one is called — the
     *  same words the `<select>` shows them, plus the app they chose. */
    function docOpenWords(d) {
        const modes = d.modes && d.modes.length ? d.modes : DOCOPEN_MODES;
        return modes.map(m => m + ' ' + (DOCOPEN_LBL[m] || '')).join(' ')
            + ' ' + (d.customCommand || '');
    }

    function docOpenSection() {
        const d = DATA.docOpen;
        if (!d) { return ''; }
        if (!sectionMatches(DOCOPEN_TERMS + ' ' + docOpenWords(d))) { return ''; }
        const LBL = DOCOPEN_LBL;
        const modes = d.modes && d.modes.length ? d.modes : DOCOPEN_MODES;
        const DOCOPEN_WHY = {
            vscode: 'The file opens in this window as plain markdown, ready to edit.',
            preview: 'VS Code renders it read-only; the source is one click away.',
            obsidian: 'Handed to Obsidian, so backlinks, tasks and the graph work.',
            custom: 'Runs the command below with the file path — anything on this machine.'
        };
        const opts = modes.map(m => C.option(m, LBL[m] || m,
            { selected: m === d.defaultMode, detail: DOCOPEN_WHY[m] || '' })).join('');
        const showCustom = d.defaultMode === 'custom';
        return `
            <h2 class="cat" id="cat-docopen">Open documents with <span class="muted small">${C.esc(LBL[d.defaultMode] || d.defaultMode)}</span></h2>
            <p class="muted small" style="max-width:760px">Which editor a <code>.md</code> file opens in when you press
            <b>Open</b> anywhere in Agent Farm: report and answer links on <b>Notices</b> and the <b>Work Queue</b>, and the
            project documents on the <b>Projects</b> page (Plan · Backlog · Docs). The buttons beside <b>Open</b> —
            <i>Editor · Preview · Obsidian · App</i> — are per-click overrides of this default, and <b>App</b> is the
            custom one configured here. Kept out of <code>agentFarm.*</code> on purpose: a path to an executable on
            <i>this</i> machine does not belong in settings that travel between machines.</p>
            <div class="setitem">
                <div class="sethead"><span class="setname">Default</span></div>
                <select id="docopenmode" style="margin-top:4px; min-width:280px">${opts}</select>
                <div class="setdesc" style="margin-top:6px">Obsidian opens the file <b>at the line</b> when you click a
                single backlog item's code, if the Advanced URI plugin is installed; otherwise it opens the file.</div>
                <div id="docopencustom" style="margin-top:10px; ${showCustom ? '' : 'display:none'}">
                    <div class="setdesc">Custom app — executable or command, e.g. <code>notepad.exe</code> or a full path.</div>
                    <input id="docopencmd" type="text" value="${C.esc(d.customCommand || '')}" placeholder="notepad.exe" style="width:100%; max-width:440px; padding:6px 8px">
                    <div class="setdesc" style="margin-top:6px">Arguments — <code>{file}</code> becomes the file path,
                    <code>{line}</code> the line number when one is known (dropped when it is not).</div>
                    <input id="docopenargs" type="text" value="${C.esc(d.customArgs || '{file}')}" placeholder="{file}" style="width:100%; max-width:440px; padding:6px 8px">
                </div>
            </div>`;
    }

    /**
     * ‼️ SAVED PROMPTS GETS A SECTION, NOT A TEXT BOX — and the reason is the
     * bug that made it necessary.
     *
     * The setting shipped as one more row under "Display & Labels": a path in a
     * box, indistinguishable from a path nobody has filled in. It was blank for
     * a week because VS Code never handed back the manifest default, and NOTHING
     * on this page could have told you that — a box shows you a string, and the
     * question a person actually has is "does it work?".
     *
     * So this section answers that question with the file's own contents: which
     * file, where that path came from, and every block that was read out of it.
     * If the list is there, the Console picker has the same list. If it is not,
     * the reason is written here in words, next to the button that fixes it.
     */
    const PROMPT_TERMS = 'saved prompts snippet snippets template templates kalıp kalip prompt file '
        + 'console send right-click paste markdown fence block phrases reuse boilerplate';

    function promptsSection(cat) {
        const p = DATA.prompts;
        const item = cat && cat.items && cat.items[0];
        const box = item ? `
            <div class="setctl" style="margin-top:8px">
                <span class="setpath"><input type="text" data-set="${C.esc(item.key)}"
                    placeholder="(nothing chosen — the built-in path below is used)"
                    value="${C.esc(String(item.value ?? ''))}" style="width:100%; max-width:520px"></span>
            </div>` : '';
        if (!p) { return box; }

        const n = (p.items || []).length;
        const src = p.source === 'setting' ? 'the file you chose'
            : p.source === 'built-in' ? 'the built-in path (you have not chosen one)'
                : 'nothing';
        const state = p.error
            ? `<div class="seterr">⚠ ${C.esc(p.error)}</div>`
            : p.file
                ? `<div class="setdesc"><b>${n}</b> prompt${n === 1 ? '' : 's'} read from ${C.esc(src)}${p.empty
                    ? ` · ${p.empty} empty block${p.empty === 1 ? '' : 's'} skipped` : ''}</div>`
                : `<div class="setdesc">No file yet. Press <b>📁 Choose a file…</b> — your machine's own
                    file picker opens. There is a built-in path (<code>${C.esc(p.builtIn || '')}</code>)
                    that is used automatically whenever it exists, which is why nothing had to be cleared
                    on a machine where it does not.</div>`;

        let list = '';
        if (n) {
            let group = null;
            const rows = [];
            for (const it of p.items) {
                if (it.group !== group) {
                    group = it.group;
                    if (group) { rows.push(`<div class="promptgrp">${C.esc(group)}</div>`); }
                }
                // The prompt itself is TEXT, so it opens the rich panel rather
                // than a native tooltip that repeats the preview beside it and
                // then cuts (docs/CONVENTIONS.md → Hover).
                rows.push(window.AFTip.wrap(
                    `<div class="promptrow">
                    <span class="promptlbl">${C.esc(it.label)}</span>
                    <span class="promptprev">${C.esc(String(it.text).replace(/\s+/g, ' ').slice(0, 140))}</span>
                    <span class="promptline">line ${it.line}</span>
                </div>`,
                    `${it.label}${it.group ? ` · ${it.group}` : ''} · line ${it.line} · ${window.AFTip.sizeNote(it.text)}`,
                    it.text));
            }
            list = `<div class="promptlist">${rows.join('')}</div>`;
        }

        return `
            <p class="muted small" style="max-width:760px">The phrases you say to an agent over and over,
            kept in <b>your own markdown file</b> and offered where you need them: in the <b>Console</b>,
            <b>right-click</b> any button that sends text — <i>Send · Send into turn · Send after turn ·
            Start session</i> — and pick one. It is <b>pasted at the caret</b>, never sent: the press that
            sends is still yours. Only text inside <code>\`\`\`</code> fences is offered, so the prose around
            the blocks stays yours to write notes in. A block's name is its fence info string, the line above
            it, or its own first line; the nearest heading becomes the group.</p>
            <div class="setitem" data-item="agentFarm.promptSnippetsFile">
                <div class="sethead"><span class="setname">Prompts file</span>
                    ${p.file ? `<span class="rootbadge">${C.esc(p.source === 'setting' ? 'chosen' : 'built-in')}</span>` : ''}
                </div>
                <div class="setdesc" style="font-family:var(--vscode-editor-font-family)">${p.file ? C.esc(p.file) : '—'}</div>
                ${state}
                <div class="btnrow">
                    <button id="promptspick">📁 ${p.file ? 'Change file…' : 'Choose a file…'}</button>
                    <button class="secondary" id="promptsopen" ${p.file ? '' : 'disabled'}
                        title="Open it in the editor — add a \`\`\` block and it is in the list the moment you press Re-read">✎ Open the file</button>
                    <button class="secondary" id="promptsreload" title="Read the file again — it is a document you edit elsewhere">⟳ Re-read</button>
                    ${item && String(item.value ?? '').trim() ? `<button class="secondary" id="promptsdefault"
                        title="Forget the file you chose and go back to the built-in path">↺ Use the built-in path</button>` : ''}
                </div>
                ${box}
                ${list}
            </div>`;
    }

    /**
     * ‼️ X-57 — THE WIKI SECTION ANSWERS "IS THIS FOLDER A WIKI?", NOT "WHAT DID
     * YOU TYPE?".
     *
     * `agentFarm.wikiRoot` was one text box under Reports & Digest, and a text
     * box cannot tell you the one thing that matters: `wiki.compile` REFUSES
     * without `_KURALLAR_/-WIKI-ANAYASA-.md`, so a perfectly spelled path to a
     * folder that has never held that file is a wiki that silently never
     * compiles. The section reads the resolved folder and says which of the
     * three files are there, with the button that writes the missing ones next
     * to the sentence explaining what they are.
     *
     * ‼️ AND IT SHOWS THE PATH TWICE ON PURPOSE when they differ — what was
     * typed (`%USERPROFILE%\…`) above what it opened. That is the whole point
     * of portable variables, and it is also how a variable that did not resolve
     * is seen to be a typo rather than a missing folder.
     */
    const WIKI_TERMS = 'wiki knowledge base kb 00_WIKI vault obsidian anayasa constitution rules '
        + 'index log compile candidate category categories portable path root';

    /**
     * ‼️ X-193 — THE SENTRY, AS FOUR QUESTIONS RATHER THAN THIRTEEN BOXES.
     *
     * Thirteen settings in one alphabetical run is a list nobody reads: the
     * words a campaign starts on, the folders it reads, the leader's leash and
     * three thresholds all look the same in a column. Grouped, the page answers
     * the questions somebody actually arrives with — where does it look, what
     * does it say, what may the leader spend, when does it give up.
     *
     * ‼️ A KEY THIS LIST HAS NEVER HEARD OF STILL APPEARS. The grouping is
     * editorial and hand-written, which means it goes stale the moment somebody
     * adds a setting and forgets this file — so whatever is left over is drawn
     * under its own heading rather than silently dropped. A settings page that
     * hides a setting is worse than one that groups it badly.
     */
    const SENTRY_GROUPS = [
        {
            title: 'Where it looks for the handover note',
            why: 'The note the last session left is what the next one is started on. The sources are tried IN ORDER and the first that answers wins, so the order is the setting — drag a row to change it.',
            keys: ['handoverSources', 'handoverFolders']
        },
        {
            title: 'The words it starts the next session with',
            why: 'One pool, read twice: a block whose heading names a verdict is a template the mechanical round fills, and every block is material the leader blends. Empty is normal — the built-in templates answer every verdict with no file of yours anywhere.',
            keys: ['sentryTemplatesFile', 'sentryInstructionFiles']
        },
        {
            title: 'The leader, and its leash',
            why: 'The leader is woken only when one of the campaign\'s own conditions fires, so a routine night costs nothing. These are what it may spend when it is: a cheap model by default, a ceiling per turn, a budget per day, and a number of failures after which it stops being asked.',
            keys: ['sentryLeaderModel', 'sentryLeaderBudgetUsd', 'sentryLeaderMaxUsd',
                'sentryLeaderMaxSeconds', 'sentryLeaderFailLimit']
        },
        {
            title: 'When a round is going nowhere',
            why: 'A session that has produced nothing for N minutes is probably waiting for a permission nobody is there to give. These decide how long the campaign waits before it ends that round and opens the next.',
            keys: ['sentryFailureLimit', 'sentryIdlePollMin', 'sentryStallMin']
        }
    ];

    /**
     * ‼️ S-80 — THE HANDOVER RULE, AS TWO QUESTIONS. WHEN a running session is
     * spoken to, and WHAT it is then told. They are one subject and two
     * decisions, and filing them together is the point: a threshold nobody can
     * retune and a sentence nobody can rewrite were each half a rule.
     */
    const DISCIPLINE_GROUPS = [
        {
            title: 'When a run is spoken to',
            why: 'A run is held to whichever line it reaches first — its own context window, or the 5-hour quota of the account it is signed in as (read from that session\'s sign-in, never the home folder\'s). Converge is the earlier, quieter word; hand over is the end of the run. 0 switches a line off, and a converge line above its own handover line is folded down onto it.',
            keys: ['contextConvergePct', 'contextHandoverPct', 'quotaConvergePct', 'quotaHandoverPct']
        },
        {
            title: 'What it is told',
            why: 'The lead words (CONTEXT HANDOVER, QUOTA CONVERGE…) and the reading in front of them are the law\'s and stay fixed — this is the order that follows them. Eight branches, because a run carrying a baton passes it instead of writing a note — and a leg the user braked as the chain\'s last goes back to the note. Leave a branch empty and its built-in sentence stays in charge; {chain} becomes the relay\'s own chain and hop.',
            keys: ['disciplineOrders']
        },
        {
            title: 'Where a relay stops by itself',
            why: 'A run that passes the baton opens the next leg of its chain. The chain ends naturally when a run finishes the work and passes nothing; these are its brakes. Past the ceiling, or after two legs in a row that committed nothing, the pass opens no leg — the baton is kept as stopped, the runner writes a note instead, and Notices says so once.',
            keys: ['batonMaxHops']
        },
        {
            title: 'What every leg wakes up to',
            why: 'The first message of each new leg: a header the system writes, then the predecessor\'s own words. Your template replaces the header — its variables are listed on it — and your standing rule is said to every leg. Leave both empty and the built-in header stays in charge; the predecessor\'s words are never dropped.',
            keys: ['batonHandoverTemplate', 'batonInjectedDirective']
        },
        {
            title: 'When a leg ends without passing',
            why: 'A leg that finishes the work and passes nothing is the chain\'s natural end, and one you end yourself is never overridden. A leg that was cut off — told to hand over, a note written in its last two minutes, an error, uncommitted work — is rescued: the failsafe opens the next leg from what it left behind, through the same brakes. A successor that dies within 30 seconds without a tool call stops the chain instead. Your template replaces the emergency header; the evidence is never dropped.',
            keys: ['batonEmergencyTemplate']
        },
        {
            title: 'Which account the next run opens on',
            why: 'A run that hands over because its context filled up — not because its account ran out — leaves that account\'s five-hour window half used. Under this line the successor stays on the same account (a relay\'s next leg, the sentry\'s next round); at or above it, or when the handover was the quota\'s, the pool picks as before. The relay\'s pool is kept for every later leg. 0 = off.',
            keys: ['contextHandoverStayAccountPct']
        },
        {
            title: 'When the engine fails a leg',
            why: 'A turn that fails on the engine\'s side ends nothing — the card sits idle and the chain would wait for ever. When the engine is down, overloaded or refuses the sign-in, no new leg is opened (it would fail the same way): the same session is asked to continue at growing intervals, and past the ceiling a person is asked. When the engine flags the conversation itself, Agent Farm passes the baton for the leg — from the second flagged pass in a row on the fallback model, if one is set — until the cap holds the chain for you.',
            keys: ['batonFaultWaitHours', 'batonFlaggedPasses', 'batonFlaggedModel']
        }
    ];

    /**
     * The variable dictionary, DRAWN from what the host sent rather than
     * repeated here — a variable added to core/pathVars.ts turns up in this
     * legend without this file being touched.
     *
     * MIRROR: each chip's panel opens on what the variable IS on this machine,
     * then a blank line, then what it means. A name with nothing behind it says
     * so plainly, because that is the case that silently cancels a path.
     */
    function pathVarLegend() {
        const vars = DATA.pathVars;
        if (!Array.isArray(vars) || !vars.length) { return ''; }
        return `<div class="pathvars">
            <span class="muted small">Every path box below takes these:</span>
            ${vars.map(v => window.AFTip.wrap(
            `<code class="pathvar${v.value ? '' : ' empty'}${v.source === 'obsidian' ? ' derived' : ''}">\${${C.esc(v.name)}}</code>`,
            `\${${v.name}}`,
            window.AFTip.lines([
                v.value || 'Nothing on this machine — a path using it is SKIPPED rather than pointed somewhere wrong.',
                // X-308 — and WHO answered it, when it was not the user. A value
                // nobody typed is not the same fact as one they did, and a name
                // with nothing behind it now says what would fill it.
                ...(v.note ? [window.AFTip.GAP, v.note] : []),
                window.AFTip.GAP,
                v.describe
            ]),
            // the vault row is nameable on its own (X-308): it is the one
            // variable something other than the user can answer, so a scene
            // has to be able to open THIS panel rather than the first chip's.
            v.name === 'vault' ? 'tip-pathvar tip-vault' : 'tip-pathvar')).join('')}
        </div>`;
    }

    /**
     * A category drawn as named groups rather than one alphabetical run. The
     * grouping is this page's, not the manifest's — a section is only worth one
     * when the reader's question ("which of these do I touch?") has an answer
     * the key names do not give. A setting no group claims is still drawn: a
     * category that hides a key is worse than one that files it loosely.
     */
    function groupedSection(cat, spec, lead) {
        const items = (cat && cat.items) || [];
        const short = (it) => String(it.key).replace(/^agentFarm\./, '');
        const taken = {};
        const groups = spec.map(g => {
            const mine = g.keys
                .map(k => items.find(it => short(it) === k))
                .filter(Boolean);
            mine.forEach(it => { taken[it.key] = true; });
            return { title: g.title, why: g.why, items: mine };
        }).filter(g => g.items.length);
        const left = items.filter(it => !taken[it.key]);
        if (left.length) {
            groups.push({
                title: 'More',
                why: 'Settings this page has not been told where to file yet — shown here so nothing is hidden.',
                items: left
            });
        }
        return `${lead || ''}
            ${groups.map(g => `<div class="setgroup">
                <h3 class="setgrouph">${C.esc(g.title)}</h3>
                <div class="setgroupwhy">${C.esc(g.why)}</div>
                ${g.items.map(itemHtml).join('')}
            </div>`).join('')}`;
    }

    function sentrySection(cat) { return groupedSection(cat, SENTRY_GROUPS, pathVarLegend()); }

    function disciplineSection(cat) { return groupedSection(cat, DISCIPLINE_GROUPS, ''); }

    function wikiSection(cat) {
        const w = DATA.wiki;
        const items = (cat && cat.items) || [];
        const boxes = items.map(itemHtml).join('');
        if (!w) { return boxes; }

        const ready = w.exists && !(w.missing || []).length;
        const badge = !w.exists
            ? '<span class="rootbadge warn">folder does not exist</span>'
            : ready
                ? `<span class="rootbadge">${w.pages} page(s) · ${(w.categories || []).length} categor${(w.categories || []).length === 1 ? 'y' : 'ies'}</span>`
                : `<span class="rootbadge warn">${w.missing.length} file(s) missing</span>`;

        // The rule on the left is the state (the engines rows do the same):
        // green is compilable, yellow is a wiki with gaps, grey is not one yet.
        const cls = !w.exists ? 'eng-off' : w.compilable ? 'eng-ok' : 'eng-warn';

        const fileRow = f => `<div class="wikifile">
            <span class="wikimark ${f.found ? 'ok' : 'no'}">${f.found ? '✓' : '✗'}</span>
            <span class="wikirel">${C.esc(f.rel)}</span>
            <span class="wikipath">${C.esc(f.file)}</span>
        </div>`;

        const catList = (w.categories || []).length
            ? window.AFTip.wrap(
                `<div class="setdesc">Categories: <b>${(w.categories || []).length}</b> · ${C.esc((w.categories || []).slice(0, 8).map(c => c.name).join(' · '))}${(w.categories || []).length > 8 ? ` +${(w.categories || []).length - 8}` : ''}</div>`,
                `${(w.categories || []).length} categor${(w.categories || []).length === 1 ? 'y' : 'ies'} · ${w.pages} page(s)`,
                (w.categories || []).map(c => `${c.name} — ${c.pages} page${c.pages === 1 ? '' : 's'}`).join('\n')
                + '\n\nA folder here is a category the moment it exists, whether or not a page has been\nwritten into it (U-91). The picker offers every one of these.')
            : `<div class="setdesc">No categories yet — a folder under the root becomes one the moment you make it, in Obsidian or from the tagger's picker.</div>`;

        const why = !w.exists
            ? `<div class="seterr">⚠ Nothing is at this path. Choose the folder below, or press <b>🛠 Start the wiki here</b> to create it with the three files a compile needs.</div>`
            : !w.compilable
                ? `<div class="seterr">⚠ The vault's own law (<code>_KURALLAR_/-WIKI-ANAYASA-.md</code>) is not here, and <b>every compile refuses without it</b> — it outranks the agent procedure, so a compile that could not find it would be working from memory. <b>🛠 Start the wiki here</b> writes a starter you then rewrite.</div>`
                : w.missing.length
                    ? `<div class="setdesc">Missing: <code>${C.esc(w.missing.join('</code>, <code>'))}</code> — a compile can run, but it is told to keep these true and will have to create them itself.</div>`
                    : '';

        const typed = String(w.setting || '');
        const differs = typed && typed.replace(/[\\/]+$/, '').toLowerCase() !== String(w.root || '').replace(/[\\/]+$/, '').toLowerCase();

        const misplaced = (w.misplaced || []).length
            ? `<div class="setdesc">⚠ ${w.misplaced.length} folder(s) nested deeper than one category (<code>${C.esc(w.misplaced.slice(0, 4).join('</code>, <code>'))}</code>) — pages in them are not indexed. Categories are a single level: a family is spelled <code>Teknoloji - Tarım</code>.</div>`
            : '';

        return `
            <p class="muted small" style="max-width:760px">Marking a turn is free and writes nothing to the
            vault; <b>compiling</b> is the expensive half — an agent reads the transcripts and writes pages
            under the vault's own law. This is where that half is configured: <b>which folder</b> the wiki
            lives in, and <b>whose hand and which model</b> write it.</p>
            <div class="setitem eng ${cls}" data-item="agentFarm.wikiRoot">
                <div class="sethead"><span class="setname">Wiki root</span> ${badge}</div>
                ${differs ? `<div class="setdesc" style="font-family:var(--vscode-editor-font-family)">${C.esc(typed)}</div>` : ''}
                <div class="setdesc" style="font-family:var(--vscode-editor-font-family)">${C.esc(w.root || '—')}${differs ? ' <span class="muted">← what it opens</span>' : ''}</div>
                ${why}
                <div class="wikifiles">${(w.files || []).map(fileRow).join('')}</div>
                ${catList}
                ${misplaced}
                <div class="btnrow">
                    <button class="secondary" data-browse="agentFarm.wikiRoot" data-browsekind="folder"
                        title="Pick the folder — the path is written into the box below and saved">📁 Choose the folder…</button>
                    ${ready ? '' : `<button id="wikiinit" title="Create the folder and whatever of the three files is missing. It only CREATES: a file already on disk is left exactly as it is, because the law is yours.">🛠 Start the wiki here</button>`}
                    <button class="secondary" id="wikirescan" title="Read the folder again. It is a folder you edit in Obsidian while this page is open, so a category you just made shows up here without a reload.">↻ Re-scan</button>
                    <button class="secondary" id="wikireveal" ${w.exists ? '' : 'disabled'} title="Open the folder in the file manager">📂 Reveal</button>
                    <button class="secondary" id="wikiopen" title="Open the Wiki cockpit — the pool of marked turns waiting to be compiled">📚 Open the cockpit</button>
                </div>
            </div>
            ${boxes}`;
    }

    /**
     * ‼️ X-136 — THE SUPERPOWERS SECTION ANSWERS "WILL A SESSION ACTUALLY GET
     * ANYTHING, AND WHO?" — NOT "WHAT DID YOU TYPE?".
     *
     * Two boxes stood here before, and both were unanswerable from a text
     * field. The path: a folder without `using-superpowers/SKILL.md` gives a
     * switched-on session NOTHING, and nothing is exactly what a working
     * feature looks like from outside. The defaults: a
     * `Record<string, boolean>` keyed by an agent's NAME, so a misspelling is a
     * switch that never fires and never complains. So the card reads the
     * resolved folder, says how many skills are behind the hook, and lists the
     * discovered agents with a box each.
     *
     * ‼️ AND IT DISTINGUISHES SAID FROM ASSUMED. An agent nobody named falls
     * back to the built-in list; that agent's box is ticked for a reason that
     * can change under it, so it is drawn as a default rather than as a choice
     * and the row says which it is.
     */
    const SP_TERMS = 'superpowers skills discipline tdd debugging brainstorming plan hook '
        + 'SKILL.md using-superpowers engineering agent default portable path root';

    function superpowersSection(cat) {
        const sp = DATA.superpowers;
        const items = (cat && cat.items) || [];
        const boxes = items.map(itemHtml).join('');
        if (!sp) { return boxes; }

        const skills = sp.skills || [];
        const badge = sp.usable
            ? `<span class="rootbadge">${skills.length} skill${skills.length === 1 ? '' : 's'} behind the hook</span>`
            : `<span class="rootbadge warn">${sp.exists ? 'no hook' : 'folder does not exist'}</span>`;
        // The rule on the left is the state, as everywhere else on this page:
        // green can supply a session, yellow is a folder that cannot, grey is
        // not there at all.
        const cls = !sp.exists ? 'eng-off' : sp.usable ? 'eng-ok' : 'eng-warn';

        const why = sp.usable ? '' : `<div class="seterr">⚠ ${C.esc(sp.why || 'this folder cannot supply a session')}
            <br><b>A session with the switch on is given nothing at all from here</b> — which looks exactly like the switch being off.
            ${sp.exists ? '' : '<br>Choose the folder below, or empty the box and it is looked for next to your agents (<code>_SKILLS/superpowers</code> under an agent root).'}</div>`;

        const typed = String(sp.setting || '');
        const differs = typed && typed.replace(/[\\/]+$/, '').toLowerCase() !== String(sp.root || '').replace(/[\\/]+$/, '').toLowerCase();

        const skillList = skills.length
            ? window.AFTip.wrap(
                `<div class="setdesc">Skills: <b>${skills.length}</b> · ${C.esc(skills.slice(0, 6).map(s => s.name).join(' · '))}${skills.length > 6 ? ` +${skills.length - 6}` : ''}</div>`,
                `${skills.length} skill${skills.length === 1 ? '' : 's'} · read one at a time, when one applies`,
                skills.map(s => `${s.name} — ${s.description || 'no description in its frontmatter'}`).join('\n')
                + '\n\nNone of these is loaded into a session. Only the root hook plus this index\nrides on the system prompt; a model fetches the one skill it needs with its\nown file tool, at the moment it needs it.')
            : '';

        // ‼️ THE MATRIX. A row per discovered agent, because the setting is
        // keyed by a NAME and this is the only place that knows which names
        // exist. `on` is the answer the agent would actually get; `explicit`
        // says whether anybody wrote it down.
        const agentRow = a => window.AFTip.wrap(
            `<label class="sprow${a.explicit ? '' : ' spdef'}">
                <input type="checkbox" data-spagent="${C.esc(a.name)}" ${a.on ? 'checked' : ''}>
                <span class="spname">${C.esc(a.name)}</span>
                <span class="spstate">${a.on ? 'on' : 'off'}${a.explicit ? '' : ' · default'}</span>
            </label>`,
            `${a.name} — Superpowers ${a.on ? 'ON' : 'OFF'} by default`,
            (a.explicit
                ? 'Written down in agentFarm.superpowersDefaults, so it stays whatever you set.'
                : `Nobody has said, so it falls back to the built-in list (${(sp.defaultAgents || []).join(', ') || 'nothing'} on, everything else off). Tick or untick to write it down.`)
            + '\n\nThis is the DEFAULT a new session opens with — the switch itself is per session and sits beside the project chip above the composer. A session already running keeps what it was started with: its system prompt was written at spawn and cannot be rewritten under it.');

        const matrix = (sp.agents || []).length
            ? `<div class="spgrid">${(sp.agents || []).map(agentRow).join('')}</div>`
            : `<div class="setdesc">No agents discovered — add a folder under <b>Agent folders</b> above and they appear here.</div>`;

        return `
            <p class="muted small" style="max-width:760px">A library of engineering procedures — TDD,
            root-cause debugging, planning, verification before completion — that <b>sleeps on disk at zero
            tokens</b>. Switched on, a session's system prompt carries only the library's own hook plus an
            index of where the skills are; the model reads the one it needs when it needs it. Switched off,
            nothing is added at all.</p>
            <div class="setitem eng ${cls}" data-item="agentFarm.superpowersPath">
                <div class="sethead"><span class="setname">⚡ Superpowers</span> ${badge}</div>
                ${differs ? `<div class="setdesc" style="font-family:var(--vscode-editor-font-family)">${C.esc(typed)}</div>` : ''}
                <div class="setdesc" style="font-family:var(--vscode-editor-font-family)">${C.esc(sp.root || '—')}${differs ? ' <span class="muted">← what it opens</span>' : ''}${typed ? '' : ' <span class="muted">← found next to your agents</span>'}</div>
                <div class="wikifile">
                    <span class="wikimark ${sp.hookFound ? 'ok' : 'no'}">${sp.hookFound ? '✓' : '✗'}</span>
                    <span class="wikirel">using-superpowers/SKILL.md</span>
                    <span class="wikipath">${C.esc(sp.hook || '')}</span>
                </div>
                ${why}
                ${skillList}
                <div class="setdesc" style="margin-top:8px">Which agents open a session with the discipline
                    already on — the default, before anybody touches the switch. This is also the only
                    answer a session started <b>outside</b> the panel has (an unattended task, a terminal, a
                    resume).</div>
                ${matrix}
                <div class="btnrow">
                    <button class="secondary" data-browse="agentFarm.superpowersPath" data-browsekind="folder"
                        title="Pick the folder — the path is written into the box below and saved">📁 Choose the folder…</button>
                    <button class="secondary" data-reset="agentFarm.superpowersPath"
                        title="Empty the setting. The folder is then looked for next to your agents — _SKILLS/superpowers under an agent root, or beside it when a root names a single agent.">↺ Reset to default</button>
                    <button class="secondary" id="sprescan" title="Read the folder again. It is a folder you edit by hand, so a skill you just added shows up here without a reload.">↻ Re-scan</button>
                    <button class="secondary" id="spreveal" ${sp.exists ? '' : 'disabled'} title="Open the folder in the file manager">📂 Reveal</button>
                </div>
            </div>
            ${boxes}`;
    }

    /**
     * ‼️ A-21 — WHAT WILL I HEAR, AND WHY THAT SOUND.
     *
     * `agentFarm.alerts.on` and `agentFarm.alerts.voices` were two JSON boxes,
     * and both are EMPTY out of the box — so the page showed `{}` twice for a
     * feature that already plays five different tones, and the one question a
     * person opens this page with ("which sound, and why that one?") had no
     * answer anywhere. Only the resolution chain can answer it, so the host
     * hands over the resolved rows and the boxes are replaced rather than
     * decorated (the wiki root and the Superpowers folder cost the same week
     * each, for the same reason).
     *
     * The card sits exactly where `alerts.on` would have been — beside the
     * notification switches ON PURPOSE. Those open a VS Code notification,
     * these make a noise, and "I turned the sound off and a notification still
     * arrives" is the confusion that keeping them apart-but-adjacent prevents.
     */
    const ALERT_EVENT_TEXT = {
        'turn-ready': ['Turn finished',
            'The turn ended and control is back with you — the agent said its piece and stopped.'],
        question: ['Asking you',
            'The agent stopped mid-turn to ask something: a tool waiting for permission, or a question it needs answered. The turn is still open, so this is the one worth hearing from another room.'],
        stalled: ['Stalled',
            'The session was working and has said nothing for longer than stuckThresholdSeconds.'],
        ended: ['Session ended', 'The session closed.'],
        error: ['Error',
            'A critical error. Nothing emits this edge yet — the voice is settable so it is ready when something does.']
    };
    /** ‼️ EVERY BOX THE CARD REPLACES, IN ONE LIST. Keyed on `alerts.on` alone,
     *  a search for "mute" or "quiet" would leave a raw JSON box on the page
     *  beside the card that already draws it — two controls for one setting,
     *  and one of them the shape A-21 removed. */
    const ALERT_CARD_KEYS = [
        'agentFarm.alerts.on', 'agentFarm.alerts.voices',
        'agentFarm.alerts.muted', 'agentFarm.alerts.quietHours',
        // A-25 — a seven-field object whose `voice` has to name something this
        // machine actually has. Left out of this list it would sit beside the
        // strip that draws it as a raw JSON box: two controls, one setting.
        'agentFarm.alerts.speak',
        // U-123 — and the nudge, for the same reason: the gate strip draws its
        // three fields, so leaving the key here would put a raw JSON box beside
        // them. Two controls for one setting is the shape A-21 removed.
        'agentFarm.alerts.nudge'
    ];
    const ALERT_ORIGIN_TEXT = {
        session: 'this conversation\'s own ♪ choice',
        agent: 'this agent\'s choice',
        settings: 'your choice here',
        default: 'the built-in default'
    };

    function alertVoiceName(al, id) {
        const v = (al.voices || []).find(x => x.id === id);
        return v ? v.label : id;
    }

    /**
     * ‼️ THE TONE LIST, IN ONE PLACE — every picker that offers a sound offers
     * the SAME rows, grouped the same way, and refuses the same ones.
     *
     * ‼️ A-20 — TWENTY BUILT-INS ARE TWO FAMILIES, AND THE LIST SAYS SO. Flat,
     * the reader has to read every label to discover there were two sets: the
     * ten the defaults come from, built from different physical objects, and the
     * ten kept only so that nobody who CHOSE one loses it.
     *
     * ‼️ AN UNPLAYABLE TONE IS DRAWN AND DISABLED, never dropped. A setting that
     * names a sound whose file has gone must go on naming it — a list that
     * omitted it would show the first option instead and report a choice nobody
     * made. The host refuses it by name too; the page must not promise what the
     * op will refuse (U-123).
     */
    function alertToneGroups(al, chosen) {
        // U-130 — the row is narrow and every one of these tones is a FILE the
        // reader may need to find. The hover carries the one thing the label
        // cannot: where the sound actually comes from, and why a greyed row is
        // greyed.
        const opt = v => C.option(v.id,
            v.label + (v.playable ? '' : (v.exists ? ' — not playable here' : ' — file missing')),
            {
                selected: v.id === chosen,
                disabled: !v.playable,
                detail: [
                    v.builtin ? 'Ships with Agent Farm.' : 'Your own sound.',
                    v.path || '',
                    v.playable ? '' : (v.exists
                        ? 'This machine cannot play that format, so it cannot be chosen — the file is still there.'
                        : 'The file this points at has gone. It is still listed so a setting that names it is not silently changed.')
                ].filter(Boolean).join('\n')
            });
        const modern = (al.voices || []).filter(v => v.builtin && v.family !== 'classic');
        const classic = (al.voices || []).filter(v => v.builtin && v.family === 'classic');
        const mine = (al.voices || []).filter(v => !v.builtin);
        return `${modern.length ? `<optgroup label="Built in">${modern.map(opt).join('')}</optgroup>` : ''}
            ${classic.length ? `<optgroup label="Built in — earlier set">${classic.map(opt).join('')}</optgroup>` : ''}
            ${mine.length ? `<optgroup label="Your own">${mine.map(opt).join('')}</optgroup>` : ''}`;
    }

    /** The picker for one event. Empty value = "whatever the default is", which
     *  is NOT the same as silence and must never read as it. */
    function alertVoiceSelect(al, row) {
        // MIRROR — the box is narrow enough to cut its own text, so its
        // tooltip opens with what it is set to right now.
        const tip = (
            (row.chosen ? `Set to: ${alertVoiceName(al, row.chosen)}` : `Not set — falls back to ${alertVoiceName(al, row.fallback)}`)
            + `\n\nWhich sound this event plays for every session. Clearing it does not mute the event: it falls back to the built-in default.`);
        return `<select data-alertvoice="${C.esc(row.event)}" title="${C.esc(tip)}">
            ${C.option('', `Default — ${alertVoiceName(al, row.fallback)}`, {
            selected: !row.chosen,
            detail: 'Nothing chosen for this event, so the built-in default plays. This is NOT silence — turn the event off to mute it.'
        })}
            ${alertToneGroups(al, row.chosen)}
        </select>`;
    }

    function alertEventRow(al, row) {
        const text = ALERT_EVENT_TEXT[row.event] || [row.event, ''];
        const armed = al.sessionEvents.indexOf(row.event) >= 0;
        const name = window.AFTip.wrap(
            `<span class="alertev">${C.esc(text[0])}</span>`,
            `${text[0]} — sound is ${row.on ? 'ON for every session' : 'off'}`,
            text[1] + '\n\n' + (row.on
                ? 'The tick plays this sound on every session, whatever each one has selected for itself.'
                : armed
                    ? 'Untitled here, but a single session can still arm it on its own from the ♪ in its Live Timeline row — the two ADD, they do not gate each other.'
                    : 'Nothing plays this one. It has no per-session control either, so this tick is the only way to hear it.'));
        // ‼️ WHAT WILL ACTUALLY PLAY, on the row, in words. `chosen` is what the
        // user typed and `voice` is what the chain answered, and the two differ
        // exactly when something is wrong — a deleted file, a renamed sound.
        const wrong = row.chosen && row.chosen !== row.voice;
        /**
         * ‼️ audit B-05 — AND THE COLOUR WAS ON THE ROWS THAT STILL MAKE A NOISE.
         *
         * Measured on the scene whose own title is "armed events whose sound
         * cannot be played": `error` was armed with nothing on this machine able
         * to play it — SILENT — and drew in the ordinary foreground, while the
         * two rows that fell through to a working default and DO ring drew in
         * warning yellow. The badge above them said "1 armed event cannot be
         * played" and pointed at the one row the table did not mark.
         *
         * So there are two states and they are not the same size: a fallback
         * happened (there is still a sound) and NOTHING WILL BE HEARD. The
         * second is the badge's own expression — `e.on && !e.playable`, read
         * from `alertsCard` — so the row and the badge cannot drift apart.
         */
        const silent = row.on && !row.playable;
        const plays = window.AFTip.wrap(
            `<span class="alertplays${silent ? ' silent' : wrong ? ' bad' : ''}">${C.esc(alertVoiceName(al, row.voice))}<span class="alertorigin"> · ${C.esc(ALERT_ORIGIN_TEXT[row.origin] || row.origin)}</span></span>`,
            silent
                ? `${text[0]} is armed and NOTHING plays it`
                : `${text[0]} plays ${alertVoiceName(al, row.voice)}`,
            `Chosen by ${ALERT_ORIGIN_TEXT[row.origin] || row.origin}.\n${row.file || '(no file)'}`
            + (row.playable ? '' : '\n\n⚠ Nothing on this machine can play that file — this event would be silent.')
            + ((row.skipped || []).length
                ? '\n\nPassed over on the way:\n' + row.skipped.map(s => `· ${s.voice} (${ALERT_ORIGIN_TEXT[s.origin] || s.origin}) — ${s.why}`).join('\n')
                : ''));
        // ‼️ A-25 — WHETHER THIS EVENT IS ALSO SPOKEN, IN THE TABLE THAT ALREADY
        // SAYS WHAT IT PLAYS. `alerts.speak.events` is a list of the same five
        // names, and drawn as five more ticks in the strip above it would be a
        // second event table three lines from this one — the reader would have
        // to match them up by name to answer "and what happens on `question`?".
        const sp = al.speak || {};
        const said = (sp.events || []).indexOf(row.event) >= 0;
        const say = window.AFTip.wrap(
            `<label class="alertonlbl alertsaylbl"><input type="checkbox" data-alertsay="${C.esc(row.event)}" ${said ? 'checked' : ''}></label>`,
            `${text[0]} — ${said ? 'the agent\'s NAME is spoken after the tone' : 'tone only, no name'}`,
            (said
                ? 'After this event\'s tone, the sentence below is read out loud — so the '
                  + 'question from the next room is answered without walking to the screen.'
                : 'This event makes its noise and says nothing. A tone answers "what kind of '
                  + 'news is this?"; with several lanes running, the question is WHICH ONE, '
                  + 'and no palette can carry a name.')
            + (sp.on ? '' : '\n\n‼️ Announcements are switched OFF above, so nothing is spoken on '
                + 'any event yet — this tick decides what happens once they are on.')
            + '\n\nThe tone and the sentence are ONE queue ticket, in that order: no other '
            + 'lane\'s chime can land in the middle of this one\'s sentence.');
        return `<tr>
            <td><label class="alertonlbl"><input type="checkbox" data-alerton="${C.esc(row.event)}" ${row.on ? 'checked' : ''}>${name}</label></td>
            <td class="alertsay">${say}</td>
            <td>${alertVoiceSelect(al, row)}</td>
            <td>${plays}</td>
            <td class="alertbtn"><button class="secondary small" data-alertplay="${C.esc(row.voice)}" ${row.playable ? '' : 'disabled'} title="Play it now — this is what this event sounds like">▶</button></td>
        </tr>`;
    }

    function alertCustomRow(al, v) {
        const state = v.playable ? '' : (v.exists ? ' — nothing here plays it' : ' — the file is gone');
        // ‼️ THE NAME IS THE ROW'S OWN BOX, not a ✎ that opens something. A
        // webview has no `window.prompt` (it is blocked, and a button wired to
        // one is a button that does nothing), and the row editor is the shape
        // this page already uses for lists — U-108 / U-110.
        return `<div class="wikifile alertmine">
            <span class="wikimark ${v.playable ? 'ok' : 'no'}">${v.playable ? '♪' : '✗'}</span>
            <input class="wikirel alertname" type="text" value="${C.esc(v.label)}"
                data-alertrename="${C.esc(v.id)}" data-alertlabel="${C.esc(v.label)}"
                title="${C.esc((`Named: ${v.label}\n\nWhat every picker shows. The id it was given (${v.id}) never moves, so renaming cannot unpick this sound anywhere it was chosen.`))}">
            ${window.AFTip.wrap(`<span class="wikipath">${C.esc(v.file)}${C.esc(state)}</span>`,
                `${v.label} — ${v.id}`,
                v.file + (v.playable
                    ? `\n\nPlayed by: ${v.backend || 'this platform'}.`
                    : v.exists
                        ? '\n\n⚠ Nothing on this machine can open this format. Any event set to it falls through to the step below rather than going silent.'
                        : '\n\n⚠ There is no file at that path any more. The sound is still listed so it can be fixed; an event set to it falls through to the step below.')
                + '\n\nThe file was never copied — it plays from where it lives, so editing it there changes the sound.')}
            <button class="secondary small" data-alertplay="${C.esc(v.id)}" ${v.playable ? '' : 'disabled'} title="Play it now">▶</button>
            <button class="secondary small" data-alertremove="${C.esc(v.id)}" title="Drop it from the list. The FILE is not deleted — it was never ours. Any event set to this sound is cleared at the same time and falls back to its built-in default.">✕</button>
        </div>`;
    }

    /**
     * ‼️ A-22 — WHETHER ANYTHING IS HEARD AT ALL, ON THE CARD THAT SAYS WHICH
     * TONE.
     *
     * The rows below answer "question plays ask-double, chosen by you". If the
     * farm is muted or it is 03:00, that sentence is true and useless: the
     * reader is on this page because they heard nothing, and the answer to that
     * is a different question the card could not previously ask. Three
     * authorities, all of them on ONE line at the top — DENSITY, and the order
     * is the order they take effect in.
     *
     * The mute is the SAME switch as the 🔇 in the status bar, not a copy of
     * it: both call `alertsSetMuted`, so they cannot drift apart.
     */
    function alertGateStrip(al) {
        const g = al.gate || {};
        const q = g.quiet || {};
        const sil = g.silence || { silent: false, reasons: [] };
        const muted = !!g.muted;
        const state = window.AFTip.wrap(
            `<span class="alertgatestate ${sil.silent ? 'off' : 'on'}">${sil.silent ? '🔇 silent' : '🔊 sounds on'}</span>`,
            sil.silent ? 'Nothing plays right now' : 'Armed events play',
            sil.silent
                ? `Held by: ${sil.detail || 'unknown'}.\n\nEvery authority holding it is listed — `
                  + 'unmuting while quiet hours are still on would leave the farm silent with '
                  + 'nothing on screen saying why.'
                : 'Nothing is holding the gate shut. Whether a particular event makes a noise is '
                  + 'the table below — armed, and with a tone this machine can play.');
        const muteTip = (
            (muted ? 'Muted — nothing in the farm makes a sound' : 'Not muted')
            + '\n\nThe same switch as the 🔇 in the status bar. It clears nothing: every armed '
            + 'event and chosen tone stays exactly as it is, so unmuting restores your setup '
            + 'rather than the defaults.\n\nSounds only — the notification, the modal and the '
            + 'focus jump are separate branches with their own switches.');
        const quietTip = (
            (q.error ? `⚠ ${q.error}` : q.line || `Quiet hours off (${q.from || '23:00'}–${q.to || '08:00'})`)
            + '\n\nThe window WRAPS MIDNIGHT: 23:00–08:00 is quiet from 23:00 through 07:59 the '
            + 'next morning. The start is included and the end is not, so at 08:00 sounds are '
            + 'back.\n\nA time that is not HH:MM is refused rather than stored — a schedule that '
            + 'reads as configured and silences nothing is the worst of the three outcomes.');
        /**
         * ‼️ U-123 — THE SECOND TAP ON THE SHOULDER, on the line that already
         * decides whether the FIRST one is heard.
         *
         * `agentFarm.alerts.nudge` was a raw JSON box beside this strip while
         * every other part of the gate lived ON it. It belongs here and not
         * beside the tone table because it answers the gate's question — will a
         * sound happen at all — rather than the table's, which sound.
         *
         * ‼️ OFF IS `minutes: 0`, THE SETTING'S OWN WORD FOR IT. A fourth field
         * could disagree with the other three; this cannot. Switching it back on
         * with the numbers still at zero would arm nothing, so the page sends
         * the defaults for whichever half is empty and the host clamps them.
         */
        const n = g.nudge || {};
        const nOn = n.on === true;
        const nMin = Number(n.minutes) > 0 ? Number(n.minutes) : ((n.defaults || {}).minutes || 3);
        const nRep = Number(n.repeat) > 0 ? Number(n.repeat) : ((n.defaults || {}).repeat || 2);
        const nudgeTip = (
            (nOn
                ? `On — a reminder ${nMin} min after an unanswered question, up to ${nRep} time${nRep === 1 ? '' : 's'}`
                : 'Off — a question that goes unanswered is announced once and then left alone')
            + '\n\n‼️ ONLY the question event is nudged. Reminding somebody about a turn that '
            + 'FINISHED is pestering them about news that needs nothing from them; a question is '
            + 'the one case where nobody noticing costs the whole run.\n\nIt stops by itself after '
            + 'the repeat count, because a chime that never ends is one you mute for good — and it '
            + 'goes through this same mute, these same quiet hours and the same queue as the alert '
            + 'it reminds you about.');
        const armed = Number(n.armed) || 0;
        const nudge = `<label class="alertgatelbl" title="${C.esc(nudgeTip)}">
                <input type="checkbox" id="alertnudgeon" ${nOn ? 'checked' : ''}>⏰ Nudge</label>
            <span class="alertgatedash">after</span>
            <input class="alertqtime" type="number" id="alertnudgemin" min="1" max="240"
                value="${C.esc(String(nMin))}" data-alertn="${C.esc(String(nMin))}"
                title="${C.esc('How long a question may sit unanswered before the reminder plays, in minutes. 1–240.')}">
            <span class="alertgatedash">min,</span>
            <input class="alertqtime" type="number" id="alertnudgerep" min="1" max="20"
                value="${C.esc(String(nRep))}" data-alertn="${C.esc(String(nRep))}"
                title="${C.esc('How many reminders at most, then it gives up on that question. Ceiling 20 — a chime that never ends is one you mute for good.')}">
            <span class="alertgatedash">×</span>
            <select id="alertnudgetone" title="${C.esc((
            `Reminder tone: ${alertVoiceName(al, n.voice)}\n\nDeliberately its own, and lighter than the `
            + 'alert it follows: this is a second tap on the shoulder, not the news again.\n\n'
            + 'A sound this machine cannot play is refused rather than stored — it would fall '
            + 'through to the event\'s own voice and the setting would look as though it had taken.'))}">
                ${alertToneGroups(al, String(n.voice || ''))}
            </select>${armed ? window.AFTip.wrap(
            `<span class="alertnudgearmed">${armed} waiting</span>`,
            `${armed} question${armed === 1 ? '' : 's'} armed for a reminder right now`,
            'Each one is a session that STOPPED to ask something and has not been answered yet. '
            + 'A session that moves on — answered, or gone from the live list — disarms itself, so '
            + 'this figure is what is really outstanding rather than a running total.') : ''}`;
        const err = q.error
            ? `<div class="seterr">⚠ ${C.esc(q.error)}</div>` : '';
        const ses = (g.mutedSessions || []).map(s =>
            `<span class="alertmuteses">${C.esc(s.label || s.sessionId)}<button class="secondary small" data-alertunmute="${C.esc(s.sessionId)}" title="${C.esc('Let ' + (s.label || s.sessionId) + ' be heard again. Nothing it chose was cleared, so this puts back exactly what was there before.')}">✕</button></span>`).join('');
        return `<div class="alertgate">
            <label class="alertgatelbl" title="${C.esc(muteTip)}">
                <input type="checkbox" id="alertmute" ${muted ? 'checked' : ''}>🔇 Mute the farm</label>
            <span class="alertgatebar"></span>
            <label class="alertgatelbl" title="${C.esc(quietTip)}">
                <input type="checkbox" id="alertquieton" ${q.configured ? 'checked' : ''}>Quiet hours</label>
            <input class="alertqtime" type="text" id="alertquietfrom" size="5" maxlength="5"
                value="${C.esc(q.from || '23:00')}" data-alertq="${C.esc(q.from || '23:00')}"
                title="${C.esc('When the quiet starts, HH:MM, local time. Included.')}">
            <span class="alertgatedash">–</span>
            <input class="alertqtime" type="text" id="alertquietto" size="5" maxlength="5"
                value="${C.esc(q.to || '08:00')}" data-alertq="${C.esc(q.to || '08:00')}"
                title="${C.esc('When it ends, HH:MM, local time. Excluded — at this minute sounds are back.')}">
            <span class="alertgatebar"></span>
            ${nudge}
            ${state}
            ${ses ? `<span class="alertgatebar"></span><span class="alertmuteseswrap">${window.AFTip.wrap(
                '<span class="alertmuteseslbl">muted on their own</span>',
                `${(g.mutedSessions || []).length} session${(g.mutedSessions || []).length === 1 ? '' : 's'} muted individually`,
                'These stay quiet whatever the two switches to the left say — a session\'s own mute '
                + 'is the only authority that can subtract from what the fleet switch and the row\'s '
                + '♪ box ADD UP to.\n\nNothing they chose was cleared; ✕ puts each one back exactly '
                + 'as it was.')}${ses}</span>` : ''}
        </div>${err}`;
    }

    /**
     * ‼️ A-25 — WHO IS SPEAKING, AND WHAT THEY WILL SAY.
     *
     * `agentFarm.alerts.speak` was a raw JSON box with seven fields in it, and
     * one of them — `voice` — is a NAME that has to exist on this machine. A
     * box cannot know whether it does, and the engine's answer to a name
     * nothing answers to is a FAILED announcement (`exit 5`), deliberately, not
     * a quiet fall back to English. So the one thing the box could never show
     * is the one thing that decides whether the feature works, and the strip
     * shows it: the voice list is asked of Windows, both of its registries, and
     * the reader sees the culture of every voice they can pick.
     *
     * It is its own strip and not more controls on the gate's line: the gate
     * answers "will anything be heard at all", this answers "and what will it
     * say" — ONE SUBJECT, and the two are read in that order down the card.
     */
    function alertSpeakStrip(al) {
        const sp = al.speak || {};
        const voices = sp.voices || [];
        const chosen = String(sp.voice || '');
        // MIRROR — the box is narrow enough to cut its own text, so it opens
        // with what it is set to right now.
        const onTip = (
            (sp.on ? 'On — the fleet says which agent out loud' : 'Off — tones only')
            + '\n\nLocal and free: no network, no account, no model. The sentence rides BEHIND '
            + 'the tone in the same queue ticket, and goes through the same mute, the same quiet '
            + 'hours and the same per-session mute as the tone it follows.\n\nWhich events are '
            + 'spoken is the 🗣 column in the table below.');
        /**
         * ‼️ "NOTHING ANSWERS TO THAT" IS ONLY SAYABLE WHERE THE LIST IS
         * AUTHORITATIVE. Listing voices is Windows-only: on macOS `say -v Yelda`
         * works perfectly and the list comes back EMPTY with a reason, so a
         * warning keyed on "no match" alone would call a working setting broken
         * on every machine that is not this one. An unreadable list is a
         * question the page cannot answer, and it says that instead.
         */
        const bad = chosen && !sp.resolved && sp.voicesLoaded && !sp.voicesError;
        const voiceTip = (
            (chosen
                ? (sp.resolved
                    ? `Set to "${chosen}" — which reaches ${sp.resolved}`
                    : bad
                        ? `Set to "${chosen}" — ‼️ NOTHING ON THIS MACHINE ANSWERS TO THAT`
                        : `Set to "${chosen}" — this platform cannot list its voices, so whether that name is answered is only known when it speaks`)
                : 'Not set — whichever voice the system reads with')
            + '\n\nA voice reading a language it does not know is not accented, it is '
            + 'unintelligible, so the language of each voice is on its row.\n\n'
            + (bad
                ? '‼️ The announcement will FAIL rather than read out in the wrong voice — which '
                  + 'is deliberate: a wrong voice is not a smaller error than no voice, it is a '
                  + 'harder one to diagnose. Pick one from this list, or clear it.\n\n'
                : '')
            + sp.voicesNote);
        // ‼️ THE ROW THE SETTING REACHES IS THE SELECTED ONE, not the row whose
        // name equals it. `Tolga` is a legal setting and no voice is called
        // that, so a box matching the raw value would read "System default" on
        // a machine that is about to speak Turkish — the exact lie this strip
        // exists to end. Picking a row writes the FULL name, which is the
        // user's own act and not a silent rewrite of what they typed.
        const at = String(sp.resolvedName || chosen);
        // U-130 — the box cuts `name · culture · engine` long before the engine,
        // and the engine is exactly what explains why a voice is missing from
        // the shorter list. The hover carries the whole row plus what picking
        // it WRITES, since the setting stores the full name and not the label.
        const opt = v => C.option(v.name, v.label, {
            selected: v.name === at,
            detail: [
                `Reads ${v.culture || 'no language it declares'}.`,
                v.engine === 'sapi5'
                    ? 'SAPI 5 — the short classic list every Windows has.'
                    : 'OneCore — installed with a language pack.',
                `Picking this writes “${v.name}” into the setting.`
            ].join('\n')
        });
        // The setting is ALWAYS shown, whether or not the list could confirm it
        // — a picker that silently drops the value it is set to is the box this
        // strip replaced. Only the ⚠ is conditional.
        const unknown = chosen && !sp.resolvedName
            ? C.option(chosen, `${bad ? '⚠ ' : ''}${chosen}${bad ? ' — no voice answers to that' : ' — set by hand'}`, {
                selected: true,
                detail: bad
                    ? 'Nothing on this machine answers to that name, so the announcement will FAIL rather than read out in the wrong voice. Pick a row below, or clear it.'
                    : 'This platform cannot list its voices, so whether the name is answered is only known when it speaks.'
            })
            : '';
        const box = !sp.voicesLoaded
            // ‼️ NOT ASKED YET IS NOT "NO VOICES". The list costs a PowerShell
            // process, so it is fetched once when the card first draws; an
            // empty box in the meantime would read as "this machine cannot
            // speak", which is the opposite of the truth.
            ? `<select id="alertspeakvoice" disabled>${C.option('', "reading this machine's voices…",
                { detail: 'The list costs a PowerShell process and is fetched once when this card first draws. Not asked yet is not "no voices".' })}</select>`
            : `<select id="alertspeakvoice" title="${C.esc(voiceTip)}">
                ${C.option('', 'System default — whichever voice Windows reads with', {
                selected: !chosen,
                detail: 'No name is written into the setting, so whatever this machine reads with speaks — and it changes if that default changes.'
            })}
                ${unknown}
                ${voices.map(opt).join('')}
            </select>`;
        const err = sp.voicesError
            ? `<div class="seterr">⚠ the voice list could not be read — ${C.esc(sp.voicesError)}</div>` : '';
        // What will actually be said, in full. A template is a thing to READ
        // BACK, not to imagine: `{agnet}` is spoken as "agnet" on purpose, and
        // the only place that mistake is visible before it is heard is here.
        const state = window.AFTip.wrap(
            `<span class="alertgatestate ${sp.on && !bad ? 'on' : 'off'}">${sp.on ? (bad ? '⚠ voice not found' : '🗣 ' + C.esc(sp.preview || '')) : 'not announcing'}</span>`,
            sp.on ? `Next announcement: “${sp.preview}”` : 'Announcements are off',
            (sp.on
                ? `Spoken by: ${sp.resolved || (bad ? '‼️ nothing — the name matches no voice here' : chosen || 'the system default voice')}.`
                : 'The tones still play. Nothing is spoken until the tick to the left is on.')
            + '\n\nThe sentence is your template with three names filled in — '
            + '{agent}, {event} and {session}. Anything else is left exactly as typed, so a '
            + 'mistyped {agnet} is HEARD rather than silently swallowed.'
            + `\n\nAt most ${sp.max || 160} characters: every announcement holds the whole farm's `
            + 'alerts for as long as it takes to read, so a template that grew into a paragraph '
            + 'would silence everything queued behind it.');
        // Named rather than counted, for the muted sessions' reason: "one
        // conversation speaks Turkish" cannot be acted on without knowing which.
        const ses = (sp.sessions || []).map(s =>
            `<span class="alertmuteses">${C.esc(s.label || s.sessionId)} · ${C.esc(s.voice)}<button class="secondary small" data-alertspeakclear="${C.esc(s.sessionId)}" title="${C.esc('Clear this conversation\'s own voice — the fleet setting answers for it again. That is NOT silence.')}">✕</button></span>`).join('');
        return `<div class="alertgate alertspeak">
            <label class="alertgatelbl" title="${C.esc(onTip)}">
                <input type="checkbox" id="alertspeakon" ${sp.on ? 'checked' : ''}>🗣 Say which agent</label>
            <span class="alertgatebar"></span>
            ${box}
            <button class="secondary small" id="alertspeakrescan"
                title="${C.esc('Ask Windows again. A language pack you installed from Settings a minute ago is exactly what this is for — and it is the same free list at Settings ▸ Time & language ▸ Speech ▸ Add voices.')}">↻</button>
            <span class="alertgatebar"></span>
            <label class="alertgatelbl" title="${C.esc((`Rate: ${sp.rate === 0 ? '0 — the voice\'s own normal speed' : sp.rate}\n\nSAPI's own scale, −10 (slow) to 10 (fast). An announcement you have heard a hundred times can be read faster than one you have not.`))}">rate
                <input class="alertqtime" type="number" id="alertspeakrate" min="-10" max="10"
                    value="${C.esc(String(sp.rate === undefined ? 0 : sp.rate))}" data-alertsp="${C.esc(String(sp.rate === undefined ? 0 : sp.rate))}"></label>
            <label class="alertgatelbl" title="${C.esc((`Volume: ${sp.volume === undefined ? 100 : sp.volume} of 100\n\nThe SENTENCE's volume, and separate from the tone's — that one is the OS mixer's. A quiet name behind a loud chime is a real setting: the chime carries down the corridor, the name only has to reach the next room.`))}">vol
                <input class="alertqtime" type="number" id="alertspeakvol" min="0" max="100"
                    value="${C.esc(String(sp.volume === undefined ? 100 : sp.volume))}" data-alertsp="${C.esc(String(sp.volume === undefined ? 100 : sp.volume))}"></label>
            <span class="alertgatebar"></span>
            <input class="alertspeaktpl" type="text" id="alertspeaktpl" maxlength="${Number(sp.max) || 160}"
                value="${C.esc(String(sp.template || ''))}" data-alertsp="${C.esc(String(sp.template || ''))}"
                title="${C.esc((`Says: ${sp.template}\n\n{agent}, {event} and {session} are filled in; everything else is spoken exactly as typed.`))}">
            <button class="secondary small" id="alertspeaktest"
                title="${C.esc('Say it now, where you are standing. ‼️ It speaks even when announcements are OFF and even inside quiet hours — "can this machine talk at all" and "is the feature switched on" are two questions, and a test that answers the second when asked the first teaches nobody anything.')}">▶</button>
            ${state}
            ${ses ? `<span class="alertgatebar"></span><span class="alertmuteseswrap">${window.AFTip.wrap(
                '<span class="alertmuteseslbl">their own voice</span>',
                `${(sp.sessions || []).length} conversation${(sp.sessions || []).length === 1 ? '' : 's'} announced in a voice of their own`,
                'A session\'s own voice BEATS the fleet\'s — so the agent whose questions come in '
                + 'Turkish can be announced in Turkish while the rest are not, and the difference '
                + 'carries from the next room without a word being understood.\n\nSet from the ♪ '
                + 'right-click on the session\'s Live Timeline row. ✕ clears it back to the fleet '
                + 'setting, which is not silence.')}${ses}</span>` : ''}
        </div>${err}`;
    }

    function alertsCard(al) {
        const mine = (al.voices || []).filter(v => !v.builtin);
        const on = (al.events || []).filter(e => e.on).length;
        const broken = (al.events || []).filter(e => e.on && !e.playable).length;
        const sil = (al.gate && al.gate.silence) || { silent: false };
        // ‼️ THE GATE OUTRANKS THE COUNT IN THE BADGE. "3 of 5 events armed" on
        // a muted farm is the true sentence that sends somebody looking in the
        // wrong place for ten minutes.
        const cls = sil.silent ? 'eng-off' : broken ? 'eng-warn' : on ? 'eng-ok' : 'eng-off';
        const badge = sil.silent
            ? `<span class="rootbadge warn">silent — ${C.esc(sil.detail || '')}</span>`
            : broken
            ? `<span class="rootbadge warn">${broken} armed event${broken === 1 ? '' : 's'} cannot be played</span>`
            : `<span class="rootbadge">${on ? `${on} of ${al.events.length} events armed` : 'nothing armed — every event is off'}</span>`;
        // ‼️ U-123 — AND THE NUDGE SAYS SO IN THE HEAD, because it is the one
        // thing on this card that makes a sound the reader did NOT arm: a
        // second chime some minutes after a question, from a policy three
        // controls deep in a strip. A badge for it is cheap and the surprise is
        // not. It rides BESIDE the count rather than replacing it — the gate
        // outranks the count, but a reminder is not a gate.
        const nudge = (al.gate && al.gate.nudge) || {};
        const nudgeBadge = nudge.on
            ? `<span class="rootbadge">⏰ nudge ${C.esc(String(nudge.minutes))}m ×${C.esc(String(nudge.repeat))}${nudge.armed ? ` · ${C.esc(String(nudge.armed))} waiting` : ''}</span>`
            : '';
        const err = errors['agentFarm.alerts.voices']
            ? `<div class="seterr">⚠ ${C.esc(errors['agentFarm.alerts.voices'])}</div>` : '';
        const full = mine.length >= al.limit;
        return `<div class="setitem eng ${cls}" data-item="agentFarm.alerts.voices">
            <div class="sethead"><span class="setname">🔔 Alert sounds</span> ${badge} ${nudgeBadge}</div>
            <div class="setdesc">A sound so you can leave the room. Every event is off out of the box;
                ticking one plays its sound on <b>every</b> session. Two of them
                (${al.sessionEvents.map(e => `<code>${C.esc(e)}</code>`).join(' · ')}) can also be armed for a
                single session from the ♪ in its Live Timeline row — the two <b>add up</b> rather than
                overriding each other, so unticking here never silences a session that armed itself.</div>
            ${alertGateStrip(al)}
            ${alertSpeakStrip(al)}
            ${err}
            <table class="settbl alerttbl">
                <thead><tr>
                    <th class="setth" title="${C.esc(('What happened. Tick one and its sound plays on every session in the fleet.'))}">Event</th>
                    <th class="setth" title="${C.esc(('Also SAY WHICH AGENT, out loud, after this event\'s tone. A tone answers "what kind of news is this?" and nothing else; with several lanes running the question from the next room is WHICH ONE, and no palette can carry a name. Out of the box only question is spoken — the one event where an agent is STOPPED and the cost of not knowing is the whole run standing still.'))}">🗣</th>
                    <th class="setth" title="${C.esc(('Your choice for everybody. Leave it on Default and the built-in answer stands — turn-ready and question deliberately differ, so the two can be told apart from another room without configuring anything.'))}">Sound</th>
                    <th class="setth" title="${C.esc(('What would ACTUALLY play, and which step of the chain chose it: this session > this agent > your choice here > the built-in default. A sound whose file has gone falls through to the next step rather than going silent.'))}">Plays</th>
                    <th class="setthx"></th>
                </tr></thead>
                <tbody>${(al.events || []).map(e => alertEventRow(al, e)).join('')}</tbody>
            </table>
            <div class="setdesc" style="margin-top:10px">Your own sounds — <b>${mine.length}</b> of ${al.limit}.
                Any file this machine can play: ${C.esc((al.formats || []).map(f => '.' + f).join(' · ') || 'nothing — no player was found')}.
                The file is <b>not copied</b>; it plays from where it lives.</div>
            ${mine.length ? `<div class="wikifiles">${mine.map(v => alertCustomRow(al, v)).join('')}</div>` : ''}
            <div class="btnrow">
                <button class="secondary" id="alertadd" ${full ? 'disabled' : ''}
                    title="${C.esc(full ? `There is room for ${al.limit} of your own sounds — remove one first.` : 'Pick a sound file from anywhere on this machine, then give it a name. The file stays where it is.')}">+ Add a sound…</button>
                <button class="secondary" id="alertfolder"
                    title="${C.esc('Open ' + al.folder + '\n\nOnly a suggestion — somewhere of Agent Farm\'s own that survives updates. The picker takes a file from anywhere.')}">📂 Suggested folder</button>
            </div>
        </div>`;
    }

    /**
     * ‼️ U-84 — THE ACCESS CATEGORY LEADS WITH WHETHER IT WORKS.
     *
     * Four rows here configure the Telegram bridge and not one of them can say
     * whether the thing is up: the token is in the secret vault, the day's spend
     * is in the extension's own storage, and "is the poller alive" is a fact
     * about a running process. That is the question somebody has when they open
     * this page — their phone got no answer — and the four boxes answer a
     * different one.
     *
     * ‼️ THE CARD DOES NOT REPEAT THE FOUR CONTROLS. ONE SUBJECT: the rows below
     * own them, and a second switch two inches above the first is a page that
     * can disagree with itself. What the card carries is exactly what no row
     * can — token, bot, poller, today's spend — plus the two acts that are not
     * settings at all (connect a token, ask Telegram who this bot is).
     * `media/afTelegram.js` draws it, the same file the Toolbox draws it from.
     */
    const TG_TERMS = 'telegram bot phone mobile chat bridge remote token botfather '
        + 'allowlist chat id budget ceiling daily usd getMe poller polling';

    function accessSection(cat) {
        const items = (cat && cat.items) || [];
        const boxes = items.map(itemHtml).join('');
        const t = DATA.telegram;
        // Nothing to add when this window has no bridge host, or when the filter
        // has narrowed the category down to the web-server rows.
        if (!t || !items.some(it => /^agentFarm\.telegram/.test(it.key))) { return boxes; }
        return window.AFTelegram.card(t, {
            controls: false,
            msg: svcMsg,
            footer: '<div class="muted small" style="margin-top:6px">The switch, the allowlist, '
                + 'the ceiling and the default agent are the boxes below — this card is what they '
                + 'cannot tell you.</div>'
        }) + boxes;
    }

    /** The Live category, with the two alert-sound boxes replaced by the card
     *  IN THEIR OWN PLACE — beside the notification switches, where the reader
     *  who confused the two will be looking. */
    // U-158 — the stuck warning is one question (after how long, and whether it sounds), so it is one group
    const STUCK_KEYS = ['agentFarm.stuckThresholdSeconds', 'agentFarm.notifyStuck'];

    function stuckGroup(items) {
        const mine = STUCK_KEYS.map(k => items.find(it => it.key === k)).filter(Boolean);
        if (!mine.length) { return ''; }
        return `<div class="setgroup" id="stuck-warning">
                <h3 class="setgrouph">Stuck warning</h3>
                <div class="setgroupwhy">A session that is working and says nothing for this many seconds is marked stalled: Needs You gets a row, and the alert plays if it is on. Set any value; 0 turns the warning off — no session is ever marked stalled, however long it is silent.</div>
                ${mine.map(itemHtml).join('')}
            </div>`;
    }

    function alertsSection(cat) {
        const al = DATA.alerts;
        const all = (cat && cat.items) || [];
        const items = all.filter(it => STUCK_KEYS.indexOf(it.key) < 0);
        const stuck = stuckGroup(all);
        if (!al) { return items.map(itemHtml).join('') + stuck; }
        // Whichever of the two the filter leaves standing draws the card, once.
        // Keyed on `alerts.on` alone, a search for "voice" would file the card
        // away with the box it replaced.
        let drawn = false;
        return items.map(it => {
            if (ALERT_CARD_KEYS.indexOf(it.key) < 0) {
                return itemHtml(it);
            }
            if (drawn) { return ''; }
            drawn = true;
            return alertsCard(al);
        }).join('') + stuck;
    }

    function render() {
        // ‼️ U-139 — THE PLACE ON THE PAGE SURVIVES THE REDRAW.
        //
        // render() replaces the whole of #app, and this page is the longest in
        // the extension. A reader two thirds of the way down who pressed
        // "+ add", "Edit as JSON" or ✕ was thrown back to the top, and what
        // they were looking at never came into view — so the control had
        // worked every single time and there was no way to see it. The bug
        // reported was "the link does nothing"; the link did everything.
        //
        // Read before the swap, written back after the wiring, because a
        // handler bound in between may move the page on purpose (focusKey).
        let keepY = 0;
        try { keepY = window.scrollY || (document.documentElement || {}).scrollTop || 0; }
        catch (e) { /* stub DOM */ }
        const cats = DATA.categories
            .map(c => ({ ...c, items: c.items.filter(matches) }))
            .filter(c => c.items.length);
        const total = DATA.categories.reduce((a, c) => a + c.items.length, 0);
        const modified = DATA.categories.reduce((a, c) => a + c.items.filter(i => i.modified).length, 0);
        // Built once: the section decides for itself whether the filter leaves it
        // on screen, and the nav link must not offer to scroll to a heading that
        // is not there.
        const docOpenHtml = docOpenSection();
        const foldersHtml = foldersSection();
        const claudeHtml = claudeSection();
        const enginesHtml = enginesSection();

        document.getElementById('app').innerHTML = `
            <style>
                .profbar { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:10px 0;
                    padding:8px 10px; border:1px solid var(--vscode-panel-border); border-radius:6px; }
                .catnav { display:flex; gap:6px; flex-wrap:wrap; margin:8px 0 14px;
                    position:sticky; top:0; z-index:10; padding:6px 0;
                    background:var(--vscode-editor-background, var(--vscode-sideBar-background)); }
                .catnav a { font-size:11px; padding:2px 10px; border-radius:10px; cursor:pointer;
                    border:1px solid var(--vscode-widget-border, #4444); color:var(--vscode-foreground);
                    text-decoration:none; opacity:.8; }
                .catnav a:hover { opacity:1; }
                h2.cat { margin:22px 0 4px; }
                .setitem { padding:10px 12px; margin:6px 0; border-radius:5px;
                    border:1px solid var(--vscode-widget-border, #3333); }
                .setitem.modified { border-left:3px solid var(--vscode-textLink-foreground); }
                .sethead { display:flex; gap:8px; align-items:center; }
                .setname { font-weight:600; font-family:var(--vscode-editor-font-family); font-size:12px; }
                .moddot { width:7px; height:7px; border-radius:50%; background:var(--vscode-textLink-foreground); }
                .reset { font-size:11px; padding:0 6px; cursor:pointer; border-radius:3px; opacity:.7;
                    background:transparent; border:1px solid var(--vscode-widget-border, #4444);
                    color:var(--vscode-foreground); }
                .reset:hover { opacity:1; }
                .setdesc { font-size:11px; color:var(--vscode-descriptionForeground); margin:3px 0 6px; max-width:720px; }
                .setctl button.small { font-size:10px; margin-top:4px; }
                /* U-89 — the row under a JSON box: Apply, then what the schema
                   says goes in it, then the button that writes a valid one. The
                   summary is a CHIP and not a hover, because whether the reader
                   opens anything at all is decided by that one line. */
                .setjrow { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
                /* ‼️ U-108 — one row per entry, and the row is read left to
                   right: the value, the picker that fills it, the ✕ that drops
                   it. The box takes every pixel the two buttons do not need —
                   flex:1 with min-width:0, because an input in a flex row
                   otherwise keeps its default width and squeezes the row. */
                .setlist { display:flex; flex-direction:column; gap:5px; }
                .setlrow { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
                .setlrow input, .setlrow select { flex:1 1 auto; min-width:0; }
                /* X-193 — the order is the value, so the row can be picked up. */
                .setlgrip { cursor:grab; opacity:.45; font-size:12px; user-select:none; flex:0 0 auto; }
                .setlrow:hover .setlgrip { opacity:.85; }
                .setlrow.dragging { opacity:.5; }
                .setlrow button[disabled] { opacity:.35; cursor:default; }
                /* Where a path actually points — a whole row of its own, because
                   it is as long as a path and must not squeeze the box. */
                .setpath { flex:1 0 100%; font-size:11px; font-family:var(--vscode-editor-font-family);
                    color:var(--vscode-descriptionForeground); opacity:.9;
                    overflow-wrap:anywhere; margin:1px 0 0 18px; }
                .setpath.bad { color:var(--vscode-editorWarning-foreground, var(--vscode-errorForeground)); opacity:1; }
                .setgroup { margin:14px 0 0; padding-left:10px;
                    border-left:2px solid var(--vscode-widget-border, #3333); }
                .setgrouph { margin:0 0 2px; font-size:12px; letter-spacing:.02em; }
                .setgroupwhy { font-size:11px; color:var(--vscode-descriptionForeground);
                    margin:0 0 6px; max-width:760px; }
                .pathvars { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:6px 0 2px; }
                .pathvar { font-size:11px; padding:1px 6px; border-radius:9px; cursor:help;
                    border:1px solid var(--vscode-widget-border, #4444);
                    font-family:var(--vscode-editor-font-family); }
                /* A variable with nothing behind it cancels any path that uses
                   it — the one case worth marking, so it is marked. */
                .pathvar.empty { opacity:.5; border-style:dashed; }
                /* X-308 — a value nobody typed: it works, but it was DERIVED
                   (the vault Obsidian has open) and can change under the user,
                   which the solid chip beside it would not say. */
                .pathvar.derived { border-style:dotted;
                    color:var(--vscode-charts-blue,#3794ff); }
                .setljson { font-size:11px; opacity:.85; }
                /* U-110 — a pair reads left to right: the name, the arrow that
                   says which way it points, the value, the ✕. The name box is
                   the wider of the two: an agent folder is long and a budget is
                   three digits. */
                .setmrow { display:flex; align-items:center; gap:6px; max-width:760px; }
                .setmrow input:first-of-type { flex:2 1 0; min-width:0; }
                .setmrow > input:last-of-type, .setmrow > select { flex:1 1 0; min-width:0; }
                .setmarrow { color:var(--vscode-descriptionForeground); font-size:11px; }
                /* ‼️ U-109 — the form and the table. The form is read once and
                   carefully, so every field keeps its own sentence beside it;
                   the table is read across, so the sentence lives on the column
                   header instead (docs/CONVENTIONS.md — a column is defined
                   once, on its <th>) and the cells stay narrow enough to see
                   six of them at a time. */
                .setform { display:flex; flex-direction:column; gap:4px; max-width:860px; }
                .setfrow { display:flex; align-items:center; gap:8px; }
                .setfname { font-family:var(--vscode-editor-font-family); font-size:11px;
                    cursor:help; border-bottom:1px dotted var(--vscode-widget-border, #4444); }
                /* ‼️ S-80 — THE BASIS BELONGS TO THE FLEX CHILD, and the flex
                   child is the AFTip WRAPPER, not the name inside it: the
                   width was set on the span one level down, so a long field
                   name pushed its own box right and the form's boxes never
                   lined up. Invisible while every box was 170px of the same
                   grey; a ladder of long-text boxes draws it immediately. */
                .setform .setfrow > .tip-field { flex:0 0 168px; min-width:0; }
                .setfrow input, .setfrow select { flex:0 0 170px; min-width:0; }
                /* S-80 — a row holding a long-text field is a COLUMN, not a
                   row: the box takes the width it needs and the sentence about
                   it moves underneath, aligned to the box rather than to the
                   label, so the form still reads as one ladder. */
                .setfrow:has(textarea) { align-items:flex-start; flex-wrap:wrap; }
                .setfrow textarea { flex:1 1 320px; min-width:0; resize:vertical;
                    font-family:inherit; font-size:12px; line-height:1.45; }
                .setfrow:has(textarea) .setfdescw { flex:1 0 100%; margin-left:176px; }
                /* X-196 — the WRAPPER is the flex child now (the panel lives on
                   it), so it takes the sizing; the line inside it still has to
                   be a block or text-overflow has nothing to clip. */
                .setfdescw { flex:1 1 auto; min-width:0; }
                .setfdesc { font-size:10px; color:var(--vscode-descriptionForeground);
                    display:block; flex:1 1 auto; min-width:0;
                    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                .req { color:var(--vscode-errorForeground); font-weight:600; }
                .setrows { display:flex; flex-direction:column; gap:6px; }
                .settbl { border-collapse:collapse; font-size:11px; width:100%; table-layout:fixed; }
                .settbl th { text-align:left; padding:2px 6px 4px 0; font-weight:600;
                    color:var(--vscode-descriptionForeground); }
                .setth { cursor:help; border-bottom:1px dotted var(--vscode-widget-border, #4444); }
                .settbl td { padding:2px 6px 2px 0; vertical-align:middle; }
                /* The ✕ column carries one button and must not take an equal
                   share of a fixed layout. */
                .settbl th.setthx, .settbl td:last-child { width:30px; padding-right:0; }
                .settbl input, .settbl select { width:100%; box-sizing:border-box; }
                .setshape {
                    font-size:10px; padding:1px 7px; border-radius:9px; cursor:help;
                    border:1px solid var(--vscode-widget-border, #4444);
                    color:var(--vscode-descriptionForeground);
                }
                .seterr { font-size:11px; color:var(--vscode-errorForeground); margin-top:4px; }
                .setitem.flash { outline:2px solid var(--vscode-textLink-foreground); outline-offset:2px; }
                .rootbadge { font-size:10px; padding:1px 8px; border-radius:8px; white-space:nowrap;
                    background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
                .rootbadge.warn { background:var(--vscode-inputValidation-warningBackground, #664d00);
                    color:var(--vscode-foreground); }
                .aglist { display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; }
                /* U-29 — which engine the per-agent boxes below are editing. */
                .agtabs { display:flex; gap:5px; align-items:center; flex-wrap:wrap; margin:8px 0 2px; }
                .agtab { font-size:10px; padding:1px 8px; border-radius:9px; cursor:pointer;
                    background:transparent; color:var(--vscode-foreground); opacity:.6;
                    border:1px solid var(--vscode-widget-border,#4444); }
                .agtab:hover { opacity:.9; }
                .agtab.on { opacity:1; border-color:var(--vscode-focusBorder,#007fd4); }
                .agchip { font-size:11px; padding:2px 10px; border-radius:10px; white-space:nowrap;
                    border:1px solid var(--vscode-widget-border, #4444); }
                .agchip a { cursor:pointer; }
                .agchip .agex, .agchip.agexcl a { margin-left:6px; font-size:10px; opacity:.75; }
                .agchip .agex:hover, .agchip.agexcl a:hover { opacity:1; }
                .agchip.agexcl { opacity:.55; text-decoration:line-through; }
                .agchip.agexcl a { text-decoration:none; }
                /* ‼️ audit B-04.1 — THE CEILING WAS UNDER THE VALUE IT HAD TO HOLD.
                   Measured on the OpenCode scene, whose whole reason for existing
                   is that a model id there is a sentence: the box was pinned to
                   150px, "opencode/nemotron-3.5-lightning-free" needs 173px, and
                   the row it sits in had 1,106px of unused width to its right. So
                   the reader saw "opencode/nemotron-3.5-lig" and the only way to
                   tell it from the next id was hover — the same defect this audit
                   already called one in B-02.4. The ceiling stays (one pathological
                   id may not eat the row) and is raised to where a real id fits. */
                .agchip .agmodel { font-size:10px; margin-left:6px; padding:0 2px; max-width:300px; }
                .agchip .agcustom { width:200px; max-width:200px; padding:1px 4px; }
                .promptlist { margin-top:10px; border:1px solid var(--vscode-widget-border, #3333);
                    border-radius:5px; max-height:340px; overflow:auto; }
                .promptgrp { font-size:10px; text-transform:uppercase; letter-spacing:.5px; opacity:.55;
                    padding:7px 10px 2px; }
                .promptrow { display:flex; gap:10px; align-items:baseline; padding:4px 10px;
                    border-top:1px solid var(--vscode-widget-border, #2222); }
                .promptrow:first-child { border-top:none; }
                .promptlbl { font-size:12px; flex:0 0 200px; max-width:200px; overflow:hidden;
                    text-overflow:ellipsis; white-space:nowrap; }
                .promptprev { font-size:10px; opacity:.6; flex:1 1 auto; overflow:hidden;
                    text-overflow:ellipsis; white-space:nowrap; }
                .promptline { font-size:10px; opacity:.45; flex:none; }
                /* engines — the row is read left to right: who, how paid for,
                   what to do. The rule on the left is the state, not decoration. */
                .setitem.eng { border-left:3px solid var(--vscode-widget-border, #4444); }
                .setitem.eng-ok { border-left-color:var(--vscode-charts-green, #3fb950); }
                .setitem.eng-warn { border-left-color:var(--vscode-charts-yellow, #d7ba7d); }
                .setitem.eng-off { border-left-color:var(--vscode-descriptionForeground, #888); opacity:.75; }
                .engbadge { font-size:10px; padding:1px 8px; border-radius:9px; white-space:nowrap; cursor:help;
                    border:1px solid var(--vscode-widget-border, #4446); }
                .engbadge.b-ok { background:var(--vscode-charts-green, #3fb950); color:#fff; border-color:transparent; }
                .engbadge.b-warn { background:var(--vscode-charts-yellow, #d7ba7d); color:#000; border-color:transparent; }
                .engnext { font-size:12px; margin-top:4px; max-width:760px; }
                .engdetail { margin-top:2px; }
                /* wiki — the three files a compile needs, read as a checklist:
                   the mark says whether it is there, the rel path says what it
                   is, and the full path is what you would go and look at. */
                .wikifiles { margin:6px 0 4px; }
                .wikifile { display:flex; gap:8px; align-items:baseline; font-size:11px; padding:1px 0; }
                .wikimark { flex:none; width:12px; text-align:center; font-weight:600; }
                .wikimark.ok { color:var(--vscode-charts-green, #3fb950); }
                .wikimark.no { color:var(--vscode-charts-red, #f85149); }
                .wikirel { flex:0 0 210px; font-family:var(--vscode-editor-font-family); }
                .wikipath { flex:1 1 auto; opacity:.5; overflow:hidden; text-overflow:ellipsis;
                    white-space:nowrap; font-family:var(--vscode-editor-font-family); }
                /* superpowers — one row per discovered agent. A row that was
                   never written down is dimmed: it is ticked because the
                   built-in list says so, not because anybody chose it. */
                .spgrid { display:flex; flex-wrap:wrap; gap:4px 14px; margin:4px 0 8px; }
                .sprow { display:flex; gap:6px; align-items:baseline; font-size:11px;
                    padding:2px 8px 2px 4px; border-radius:4px; cursor:pointer;
                    border:1px solid var(--vscode-widget-border, #3333); }
                .sprow:hover { border-color:var(--vscode-focusBorder, #007fd4); }
                .sprow input { margin:0; }
                .spname { font-family:var(--vscode-editor-font-family); }
                .spstate { font-size:10px; opacity:.5; }
                .sprow.spdef .spname { opacity:.7; }
                /* A-21 — the alert table. Four columns and only one of them is
                   free-width: what would actually play, which is the sentence
                   the reader came for. The ▶ column carries one button and must
                   not take an equal share of a fixed layout. */
                .alerttbl { max-width:900px; margin-top:6px; }
                .alerttbl th:nth-child(1), .alerttbl td:nth-child(1) { width:170px; }
                /* A-25 — one tick wide and no wider. It is the same question as
                   the column to its left asked about a different output, so it
                   sits beside it rather than at the far end of the row. */
                .alerttbl th:nth-child(2), .alerttbl td.alertsay { width:30px; text-align:center; }
                .alerttbl td.alertsay .alertonlbl { justify-content:center; }
                /* audit B-05 — 210px cut its own picker: a sound named by the
                   user and suffixed with its state ("Studio take — not playable
                   here") measured 185px against 170px of room, while the Plays
                   column beside it drew 456px for content needing 155. The
                   ceiling stays (one long name may not eat the row); it moved
                   to where a real name fits, out of the column that had slack. */
                .alerttbl th:nth-child(3), .alerttbl td:nth-child(3) { width:250px; }
                .alerttbl th.setthx, .alerttbl td.alertbtn { width:34px; padding-right:0; }
                .alerttbl td.alertbtn button { width:100%; padding:0 4px; }
                .alertonlbl { display:flex; gap:6px; align-items:center; cursor:pointer;
                    overflow:hidden; }
                /* ‼️ .settbl input is width:100% — right for a text cell and
                   ruinous for a tick, which then takes the whole column and
                   shoves the event's name into the picker beside it. */
                .alertonlbl input[type=checkbox] { margin:0; flex:none; width:auto; }
                /* The event name is a label and never a paragraph — wrapped, it
                   pushes the row two lines tall and the table stops being read
                   across. */
                .alertev { white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
                    border-bottom:1px dotted var(--vscode-widget-border, #4444); }
                .alertplays { font-family:var(--vscode-editor-font-family); }
                .alertplays.bad { color:var(--vscode-charts-yellow, #d7ba7d); }
                /* audit B-05 — the row the badge is counting. A fallback is a
                   warning (something still rings); an armed event nothing can
                   play is SILENCE, and silence is the one the eye has to find
                   first. */
                .alertplays.silent { color:var(--vscode-errorForeground); }
                .alertorigin { font-family:var(--vscode-font-family); opacity:.55; font-size:10px; }
                /* A-22 — the gate strip. ONE LINE above the table: three
                   authorities and what they add up to right now, in the order
                   they take effect. It wraps rather than scrolls, because on a
                   narrow page the reader still needs all of it. */
                .alertgate { display:flex; flex-wrap:wrap; gap:8px; align-items:center;
                    margin:8px 0 2px; padding:6px 8px; border-radius:4px;
                    background:var(--vscode-editorWidget-background, #0002);
                    border:1px solid var(--vscode-widget-border, #4443); }
                .alertgatelbl { display:flex; gap:5px; align-items:center; cursor:pointer;
                    white-space:nowrap; }
                .alertgatelbl input[type=checkbox] { margin:0; flex:none; width:auto; }
                .alertgatebar { width:1px; align-self:stretch;
                    background:var(--vscode-widget-border, #4444); }
                .alertgatedash { opacity:.6; }
                .alertqtime { width:52px; flex:none; text-align:center;
                    font-family:var(--vscode-editor-font-family); }
                /* Beside the two switches, NOT pushed to the far edge: this is
                   what they add up to, and a result parked half a screen from
                   its causes is read as a fourth unrelated control. */
                .alertgatestate { white-space:nowrap;
                    border-bottom:1px dotted var(--vscode-widget-border, #4444); }
                .alertgatestate.off { color:var(--vscode-charts-yellow, #d7ba7d); }
                .alertmuteseswrap { display:flex; gap:4px; flex-wrap:wrap; align-items:center; }
                .alertmuteseslbl { opacity:.6; font-size:11px; white-space:nowrap;
                    border-bottom:1px dotted var(--vscode-widget-border, #4444); }
                .alertmuteses { display:flex; align-items:center; gap:2px; font-size:11px;
                    padding:0 2px 0 6px; border-radius:9px;
                    border:1px solid var(--vscode-widget-border, #4444); }
                .alertmuteses button { padding:0 4px; min-width:0; }
                /* U-123 — the nudge's own boxes are the gate's, at the gate's
                   width; only the tone picker needs room for a sound's name. */
                #alertnudgemin, #alertnudgerep { width:44px; }
                #alertnudgetone { flex:0 1 150px; min-width:110px; }
                .alertnudgearmed { white-space:nowrap; font-size:11px; opacity:.85;
                    border-bottom:1px dotted var(--vscode-widget-border, #4444); }
                /* A-25 — the announcement strip. Same shape as the gate above
                   it on purpose: the two are read as one instrument, in the
                   order they take effect (is anything heard → what does it say).
                   The voice box is the wide one because a voice's LANGUAGE is
                   what the reader is choosing on, and a cut label hides it. */
                /* audit B-05 — …and 340px was not wide enough to keep that
                   promise: every real voice on this machine overflowed it
                   ("Microsoft David - English (United States) · en-US · onecore"
                   is 333px against 306px of room) with 830px unused to its
                   right. */
                .alertspeak #alertspeakvoice { flex:1 1 260px; min-width:180px; max-width:380px; }
                .alertspeak .alertqtime { width:56px; }
                .alertspeak .alertspeaktpl { flex:1 1 200px; min-width:120px; max-width:280px;
                    font-family:var(--vscode-editor-font-family); }
                .alertspeak button.small { flex:none; padding:0 6px; min-width:0; }
                .alertmine .wikimark.ok { color:var(--vscode-textLink-foreground); }
                .alertmine .wikirel { flex:0 0 180px; }
                .alertmine button { flex:none; margin-left:2px; }
                ${window.AFTelegram.css()}
                ${window.AFFlexSettings.css()}
            </style>
            ${window.AFHeader.html({
                page: 'settings',
                title: 'Farm Settings',
                version: true,
                sub: `Every <code>agentFarm.*</code> setting — schema-driven, so new settings appear here automatically. ${total} setting${total === 1 ? '' : 's'} · ${modified} changed from default. Changes save immediately to your user settings.`,
                // ‼️ U-139 — THE FILE ITSELF, from the page that writes it.
                // Every box here is a view of one document, and a reader who
                // wants to see what was really written, paste a block in, or
                // repair something this page refuses had no way to it except
                // the command palette. It is the same file the ↺ buttons
                // remove keys from.
                actions: `<button class="secondary" id="opensettingsjson"
                    title="Open your user settings.json — the file every box on this page writes into. Changed values appear there as agentFarm.* keys; a value the schema cannot describe can be written by hand.">settings.json</button>`,
                guide: 'dashboard'
            })}
            ${profileBar()}
            <div class="searchbar" style="margin:10px 0; position:relative">
                <input id="filter" type="text" placeholder="Filter settings… (name or description)" value="${C.esc(filter)}" style="width:100%; max-width:420px; padding:6px 8px"
                    title="${C.esc(window.AFQuery.tip('Searched against every setting key and its description.'))}">
            </div>
            <div class="catnav">${enginesHtml ? '<a data-cat="engines">Engines</a>' : ''}${claudeHtml ? '<a data-cat="claude">Claude Code</a>' : ''}${foldersHtml ? '<a data-cat="folders">Agent folders</a>' : ''}${docOpenHtml ? '<a data-cat="docopen">Open with</a>' : ''}${cats.map(c => `<a data-cat="${c.id}">${C.esc(c.label)}</a>`).join('')}</div>
            ${enginesHtml}
            ${claudeHtml}
            ${foldersHtml}
            ${docOpenHtml}
            ${cats.map(c => `
                <h2 class="cat" id="cat-${c.id}">${C.esc(c.label)} <span class="muted small">${c.items.length}</span></h2>
                ${c.id === 'prompts' ? promptsSection(c)
                    : c.id === 'wiki' ? wikiSection(c)
                        : c.id === 'superpowers' ? superpowersSection(c)
                            : c.id === 'live' ? alertsSection(c)
                                : c.id === 'access' ? accessSection(c)
                                    : c.id === 'sentry' ? sentrySection(c)
                                        : c.id === 'discipline' ? disciplineSection(c)
                                        : c.id === 'flow' ? window.AFFlexSettings.html(DATA.flex, C, errors.flex)
                                            : c.items.map(itemHtml).join('')}`).join('')
            || (claudeHtml || foldersHtml || docOpenHtml || enginesHtml ? '' : '<p class="muted">No settings match the filter.</p>')}
        `;

        // -- wiring --
        /** U-139 — Enter releases a one-line box so its `change` handler runs.
         *  A multi-line box keeps Enter for its newline. Bound on the element
         *  the caller already has, never by a second query: two lookups of one
         *  selector are two different handler sets to keep straight. */
        const enterLetsGo = (el) => {
            if (!el || String(el.tagName || '').toUpperCase() === 'TEXTAREA') { return; }
            el.addEventListener('keydown', (e) => {
                if (e && e.key === 'Enter' && el.blur) { el.blur(); }
            });
        };
        window.AFHeader.wire(vscode);
        const openJson = document.getElementById('opensettingsjson');
        if (openJson) {
            openJson.addEventListener('click', () => vscode.postMessage({ type: 'openSettingsJson' }));
        }
        // U-84 — the bridge card's own controls, wired by the component that
        // drew them. Safe on a draw that has no card: every lookup finds nothing.
        window.AFTelegram.wire(m => vscode.postMessage(m));
        // U-152 — the Flow & Content card; a new attempt clears the last refusal.
        window.AFFlexSettings.wire(m => { delete errors.flex; vscode.postMessage(m); });
        const dcMode = document.getElementById('docopenmode');
        if (dcMode) { dcMode.addEventListener('change', () => vscode.postMessage({ type: 'docOpenSet', field: 'defaultMode', value: dcMode.value })); }
        const dcCmd = document.getElementById('docopencmd');
        if (dcCmd) { dcCmd.addEventListener('change', () => vscode.postMessage({ type: 'docOpenSet', field: 'customCommand', value: dcCmd.value })); }
        const dcArgs = document.getElementById('docopenargs');
        if (dcArgs) { dcArgs.addEventListener('change', () => vscode.postMessage({ type: 'docOpenSet', field: 'customArgs', value: dcArgs.value })); }
        // U-139 — the two "Open with" boxes are one-line settings like any
        // other; see enterLetsGo above for why blur is the mechanism.
        enterLetsGo(dcCmd);
        enterLetsGo(dcArgs);
        // Saved prompts — the same three gestures the Console picker offers, so
        // whichever door you came in by, the buttons mean the same thing.
        const onClick = (id, type) => {
            const el = document.getElementById(id);
            if (el) { el.addEventListener('click', () => vscode.postMessage({ type })); }
        };
        // Engines — three gestures, and the host owns all three: a terminal it
        // opens, the vault form it already has, and a link. Nothing about a
        // credential is decided on this page.
        //
        // ‼️ ONE GESTURE, NOT TWO. Install and Sign in do exactly the same
        // thing — write a command into a terminal without running it — so they
        // are one binding carrying whichever command the row offered. It was
        // called `engineLogin` while it already wrote something that was not a
        // login; a handler whose name is a lie is the next reader's bug.
        document.querySelectorAll('[data-engcmd]').forEach(b =>
            b.addEventListener('click', () =>
                vscode.postMessage({ type: 'engineCommand', command: b.dataset.engcmd })));
        document.querySelectorAll('[data-engkey]').forEach(b =>
            b.addEventListener('click', () =>
                vscode.postMessage({ type: 'engineKey', name: b.dataset.engkey })));
        document.querySelectorAll('[data-engdocs]').forEach(b =>
            b.addEventListener('click', () =>
                vscode.postMessage({ type: 'engineDocs', url: b.dataset.engdocs })));
        onClick('openengines', 'openEngines');
        onClick('openaccounts', 'openAccounts');
        onClick('promptspick', 'promptsPick');
        onClick('promptsopen', 'promptsOpen');
        onClick('promptsreload', 'promptsReload');
        onClick('promptsdefault', 'promptsUseDefault');
        // X-57 — the wiki root. Choosing the folder is the ordinary Browse…
        // binding below (the setting declares itself a folder in the schema);
        // these four are the acts a text box cannot do.
        onClick('wikiinit', 'wikiInit');
        onClick('wikirescan', 'wikiRescan');
        onClick('wikireveal', 'wikiReveal');
        onClick('wikiopen', 'wikiOpen');
        // X-136 — the folder gestures, and the per-agent default. The box
        // writes ONE agent's row; the host normalises the key onto whatever
        // spelling is already in the setting, so ticking `Developer` beside an
        // existing `developer` cannot leave two rows for one agent.
        onClick('sprescan', 'spRescan');
        onClick('spreveal', 'spReveal');
        document.querySelectorAll('[data-spagent]').forEach(el =>
            el.addEventListener('change', () => vscode.postMessage({
                type: 'spDefault', agent: el.dataset.spagent, on: el.checked
            })));
        // A-21 — the alert sounds card. Every gesture goes to the host, which
        // runs the same function the matching `alerts.*` bridge op runs; the
        // page holds no rule of its own about reserved ids or the limit.
        onClick('alertadd', 'alertVoiceAdd');
        onClick('alertfolder', 'alertFolder');
        document.querySelectorAll('[data-alerton]').forEach(el =>
            el.addEventListener('change', () => vscode.postMessage({
                type: 'alertOn', event: el.dataset.alerton, on: el.checked
            })));
        document.querySelectorAll('[data-alertvoice]').forEach(el =>
            el.addEventListener('change', () => vscode.postMessage({
                type: 'alertVoice', event: el.dataset.alertvoice, voice: el.value
            })));
        document.querySelectorAll('[data-alertplay]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({
                type: 'alertPlay', voice: el.dataset.alertplay
            })));
        document.querySelectorAll('[data-alertrename]').forEach(el => {
            // Enter LETS GO of the box. The page's own `focusin`/`focusout`
            // guard holds a background refresh while a field has focus, so an
            // Enter that kept focus would leave the row showing the old name
            // until the reader clicked somewhere else.
            el.addEventListener('keydown', e => { if (e.key === 'Enter') { el.blur(); } });
            el.addEventListener('change', () => {
                const next = el.value.trim();
                // Unchanged, or emptied: put the name back rather than sending
                // a refusal the reader has to read to learn nothing happened.
                if (!next || next === el.dataset.alertlabel) { el.value = el.dataset.alertlabel; return; }
                vscode.postMessage({
                    type: 'alertVoiceRename', id: el.dataset.alertrename, label: next
                });
            });
        });
        document.querySelectorAll('[data-alertremove]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({
                type: 'alertVoiceRemove', id: el.dataset.alertremove
            })));
        // A-22 — the gate. Same three host functions as the status bar click
        // and the `alerts.mute` / `alerts.quiet` ops.
        const muteEl = document.getElementById('alertmute');
        if (muteEl) {
            muteEl.addEventListener('change', () => vscode.postMessage({
                type: 'alertMute', on: muteEl.checked
            }));
        }
        const quietOnEl = document.getElementById('alertquieton');
        if (quietOnEl) {
            quietOnEl.addEventListener('change', () => vscode.postMessage({
                type: 'alertQuiet', on: quietOnEl.checked
            }));
        }
        ['from', 'to'].forEach(which => {
            const el = document.getElementById('alertquiet' + which);
            if (!el) { return; }
            // Enter LETS GO of the box, exactly as the sound-name rows do: the
            // page holds a refresh while a field has focus, so an Enter that
            // kept it would leave the old value on screen.
            el.addEventListener('keydown', e => { if (e.key === 'Enter') { el.blur(); } });
            el.addEventListener('change', () => {
                const next = el.value.trim();
                // ‼️ EMPTIED IS NOT A TIME. Sent through, it would be refused by
                // the host and the reader would read an error to learn they had
                // deleted something — put it back instead.
                if (!next || next === el.dataset.alertq) { el.value = el.dataset.alertq; return; }
                const msg = { type: 'alertQuiet' };
                msg[which] = next;
                vscode.postMessage(msg);
            });
        });
        /**
         * ‼️ U-123 — THE NUDGE, through the SAME host function `alerts.nudge`
         * goes through. The switch carries both numbers with it, because "on"
         * is not a field of its own: off is `minutes: 0`, so switching back on
         * has to say what the minutes are or it would arm nothing.
         */
        const nudgeOnEl = document.getElementById('alertnudgeon');
        if (nudgeOnEl) {
            nudgeOnEl.addEventListener('change', () => {
                const m = document.getElementById('alertnudgemin');
                const r = document.getElementById('alertnudgerep');
                vscode.postMessage({
                    type: 'alertNudge', on: nudgeOnEl.checked,
                    minutes: m ? m.value : undefined, repeat: r ? r.value : undefined
                });
            });
        }
        [['min', 'minutes'], ['rep', 'repeat']].forEach(([id, key]) => {
            const el = document.getElementById('alertnudge' + id);
            if (!el) { return; }
            el.addEventListener('keydown', e => { if (e.key === 'Enter') { el.blur(); } });
            el.addEventListener('change', () => {
                const next = el.value.trim();
                // ‼️ EMPTIED IS NOT A NUMBER, and 0 here is not "off" — off is
                // the switch beside it. Either would be stored as a policy
                // nobody typed, so the box is put back instead.
                if (!next || next === el.dataset.alertn) { el.value = el.dataset.alertn; return; }
                const msg = { type: 'alertNudge' };
                msg[key] = next;
                vscode.postMessage(msg);
            });
        });
        const nudgeToneEl = document.getElementById('alertnudgetone');
        if (nudgeToneEl) {
            nudgeToneEl.addEventListener('change', () => vscode.postMessage({
                type: 'alertNudge', voice: nudgeToneEl.value
            }));
        }
        document.querySelectorAll('[data-alertunmute]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({
                type: 'alertUnmuteSession', sessionId: el.dataset.alertunmute
            })));
        /**
         * ‼️ A-25 — THE ANNOUNCEMENT STRIP. Every write goes back to the host
         * through `alertSpeak`, which is the same function `alerts.speak` is,
         * so the card and the bridge cannot part company on what a partial
         * change means.
         */
        document.querySelectorAll('[data-alertsay]').forEach(el =>
            el.addEventListener('change', () => vscode.postMessage({
                type: 'alertSpeak', event: el.dataset.alertsay, on: el.checked
            })));
        const speakOnEl = document.getElementById('alertspeakon');
        if (speakOnEl) {
            speakOnEl.addEventListener('change', () => vscode.postMessage({
                type: 'alertSpeak', on: speakOnEl.checked
            }));
        }
        const speakVoiceEl = document.getElementById('alertspeakvoice');
        if (speakVoiceEl && !speakVoiceEl.disabled) {
            speakVoiceEl.addEventListener('change', () => vscode.postMessage({
                type: 'alertSpeak', voice: speakVoiceEl.value
            }));
        }
        /**
         * ‼️ ASKED ONCE, AND ONLY WHILE THE CARD IS ON SCREEN. The list costs a
         * PowerShell process; the answer arrives as a redraw, and a redraw
         * without this flag would ask again — a loop that spawns a shell per
         * frame. `voicesLoaded` is set by the host even when the read FAILED,
         * so a machine that cannot answer is asked once and then left alone.
         */
        if (speakVoiceEl && DATA.alerts && DATA.alerts.speak
            && !DATA.alerts.speak.voicesLoaded && !speakVoicesAsked) {
            speakVoicesAsked = true;
            vscode.postMessage({ type: 'alertSpeakVoices' });
        }
        const speakRescanEl = document.getElementById('alertspeakrescan');
        if (speakRescanEl) {
            speakRescanEl.addEventListener('click', () => vscode.postMessage({
                type: 'alertSpeakVoices', force: true
            }));
        }
        [['alertspeakrate', 'rate'], ['alertspeakvol', 'volume'], ['alertspeaktpl', 'template']]
            .forEach(([id, field]) => {
                const el = document.getElementById(id);
                if (!el) { return; }
                // Enter LETS GO of the box, exactly as the quiet-hours times and
                // the sound-name rows do: the page holds a refresh while a field
                // has focus, so an Enter that kept it would leave the old value
                // on screen after the write.
                el.addEventListener('keydown', e => { if (e.key === 'Enter') { el.blur(); } });
                el.addEventListener('change', () => {
                    const next = el.value.trim();
                    // ‼️ AN EMPTIED TEMPLATE IS NOT A SILENT ONE — the host would
                    // put the default back and the reader would watch their
                    // sentence reappear without being told why. Put it back here
                    // instead, where nothing has been written yet.
                    if (next === '' || next === el.dataset.alertsp) {
                        el.value = el.dataset.alertsp;
                        return;
                    }
                    const msg = { type: 'alertSpeak' };
                    msg[field] = field === 'template' ? next : Number(next);
                    vscode.postMessage(msg);
                });
            });
        const speakTestEl = document.getElementById('alertspeaktest');
        if (speakTestEl) {
            // ‼️ NO TEXT IS SENT — the host reads back what the SETTING would
            // say, filled in. A draft typed into the box beside it is saved by
            // the blur this very click causes, so "read me back what I just
            // typed" still works; sending the box's raw contents instead would
            // read "{agent}, {event}" out loud, which is the one sentence the
            // announcement never produces.
            speakTestEl.addEventListener('click', () =>
                vscode.postMessage({ type: 'alertSpeakTest' }));
        }
        document.querySelectorAll('[data-alertspeakclear]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({
                type: 'alertSpeakSession', sessionId: el.dataset.alertspeakclear
            })));
        const filterEl = document.getElementById('filter');
        filterEl.addEventListener('input', () => {
            // the box is a QUERY, not a substring — media/afQuery.js. Kept as
            // typed: the grammar decides its own case handling.
            filter = filterEl.value;
            /*
             * ‼️ U-143 — THE CARET GOES BACK WHERE IT WAS, NOT TO THE END.
             * Every keystroke redraws #app, which destroys this box and builds
             * a new one, so the caret has to be put back by hand. Putting it at
             * the end made the box append-only: fixing a typo in the middle of a
             * query threw the caret past the last character on the very next
             * letter typed, and a query is exactly the kind of text you edit in
             * the middle.
             */
            const at = filterEl.selectionStart, to = filterEl.selectionEnd;
            render();
            const el = document.getElementById('filter');
            el.focus();
            const end = el.value.length;
            el.setSelectionRange(Math.min(at == null ? end : at, end),
                Math.min(to == null ? end : to, end));
        });
        filterEl.addEventListener('keydown', ev => {
            if (ev.key !== 'Escape' || !filterEl.value) { return; }
            ev.preventDefault();
            filterEl.value = '';
            filterEl.dispatchEvent(new Event('input', { bubbles: true }));
        });
        window.AFFilter.clearable(filterEl);
        // the wrapper takes the box's place, so it takes the box's width too
        const clrWrap = filterEl.parentNode;
        if (clrWrap && clrWrap.className === 'af-clr') {
            clrWrap.style.width = '100%';
            clrWrap.style.maxWidth = '420px';
        }
        document.querySelectorAll('.catnav a').forEach(a =>
            a.addEventListener('click', () => {
                const h = document.getElementById('cat-' + a.dataset.cat);
                if (h && h.scrollIntoView) { h.scrollIntoView({ behavior: 'smooth' }); }
            }));
        document.querySelectorAll('[data-guide]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'openGuide', anchor: el.dataset.guide })));

        document.querySelectorAll('[data-set]').forEach(el => {
            el.addEventListener('change', () => {
                delete errors[el.dataset.set];
                const value = el.type === 'checkbox' ? el.checked : el.value;
                vscode.postMessage({ type: 'set', key: el.dataset.set, value });
            });
            enterLetsGo(el);
        });
        /**
         * ‼️ U-139 — ENTER LETS GO OF A SCALAR BOX, WHICH IS HOW IT SAVES.
         *
         * A one-line setting saves on `change`, and `change` fires on blur — so
         * a reader who typed a value and pressed Enter watched nothing happen
         * and had to click elsewhere to commit it. Blur is deliberately the
         * mechanism rather than a second postMessage: the page HOLDS a
         * background refresh while a field has focus (the `focusin`/`focusout`
         * guard below), so an Enter that kept focus would write the value and
         * leave the old one on screen. The alert-sound rows, the quiet hours
         * and the announcement template already do exactly this; these are the
         * boxes that were missed.
         */
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
                dragging = { key: row.dataset.ldrag, i: Number(row.dataset.li) };
                if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; }
                row.classList.add('dragging');
            });
            row.addEventListener('dragend', () => { row.classList.remove('dragging'); dragging = null; });
            // A row only accepts a row from ITS OWN list; dragging between two
            // settings would be a move nobody asked for and could not undo.
            row.addEventListener('dragover', (e) => {
                if (!dragging || dragging.key !== row.dataset.ldrag) { return; }
                e.preventDefault();
                if (e.dataTransfer) { e.dataTransfer.dropEffect = 'move'; }
            });
            row.addEventListener('drop', (e) => {
                if (!dragging || dragging.key !== row.dataset.ldrag) { return; }
                e.preventDefault();
                const from = dragging.i, to = Number(row.dataset.li);
                dragging = null;
                moveRow(row.dataset.ldrag, from, to);
            });
        });
        document.querySelectorAll('[data-lapply]').forEach(btn =>
            btn.addEventListener('click', () => applyList(btn.dataset.lapply)));
        document.querySelectorAll('[data-ljson]').forEach(el =>
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                // What is on screen goes INTO the JSON box: switching view is
                // not a reason to lose what was typed.
                const key = el.dataset.ljson;
                const item = allItems().find(i => i.key === key);
                const numeric = item && item.shape
                    && (item.shape.itemType === 'number' || item.shape.itemType === 'integer');
                jsonDraft[key] = boxText(readList(key)
                    .map(v => String(v).trim()).filter(v => v !== '')
                    .map(v => (numeric && Number.isFinite(Number(v)) ? Number(v) : v)));
                jsonMode[key] = true;
                render();
            }));
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

        // Agent folders section
        const rootAdd = document.getElementById('rootadd');
        if (rootAdd) { rootAdd.addEventListener('click', () => vscode.postMessage({ type: 'rootAdd' })); }
        const cleanDupes = document.getElementById('afcleandupes');
        if (cleanDupes) { cleanDupes.addEventListener('click', () => vscode.postMessage({ type: 'rootCleanDupes' })); }
        document.querySelectorAll('[data-rootremove]').forEach(btn =>
            btn.addEventListener('click', () => vscode.postMessage({ type: 'rootRemove', root: btn.dataset.rootremove })));
        document.querySelectorAll('[data-rootreveal]').forEach(btn =>
            btn.addEventListener('click', () => vscode.postMessage({ type: 'rootReveal', root: btn.dataset.rootreveal })));
        document.querySelectorAll('[data-exclude]').forEach(a =>
            a.addEventListener('click', () => vscode.postMessage({ type: 'agentExclude', dir: a.dataset.exclude })));
        document.querySelectorAll('[data-include]').forEach(a =>
            a.addEventListener('click', () => vscode.postMessage({ type: 'agentInclude', dir: a.dataset.include })));
        document.querySelectorAll('[data-openagent]').forEach(a =>
            a.addEventListener('click', () => vscode.postMessage({ type: 'openAgent', agentId: a.dataset.openagent })));
        document.querySelectorAll('[data-agmodel]').forEach(el =>
            el.addEventListener('change', () => {
                if (el.value === '__custom__') {
                    customModelDir = el.dataset.agmodel;
                    render();
                    const inp = document.querySelector('[data-agcustom]');
                    if (inp && inp.focus) { inp.focus(); }
                    return;
                }
                vscode.postMessage({ type: 'agentModel', dir: el.dataset.agmodel, model: el.value, engine: agentEngine() });
            }));
        document.querySelectorAll('[data-ageffort]').forEach(el =>
            el.addEventListener('change', () => vscode.postMessage({
                type: 'agentEffort', dir: el.dataset.ageffort, effort: el.value, engine: agentEngine()
            })));
        document.querySelectorAll('[data-agaccount]').forEach(el =>
            el.addEventListener('change', () => vscode.postMessage({
                type: 'agentAccount', dir: el.dataset.agaccount, account: el.value, engine: agentEngine()
            })));
        // ‼️ The engine strip is a PAGE state, not a per-agent one: it says which
        // engine's defaults the boxes below are editing. Kept on the host so it
        // survives the refresh that follows every write.
        document.querySelectorAll('[data-agengine]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({
                type: 'agentDefaultsEngine', engine: b.dataset.agengine
            })));
        document.querySelectorAll('[data-agcustom]').forEach(el =>
            el.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') {
                    customModelDir = '';
                    vscode.postMessage({ type: 'agentModel', dir: el.dataset.agcustom, model: el.value.trim(), engine: agentEngine() });
                } else if (ev.key === 'Escape') {
                    customModelDir = '';
                    render();
                }
            }));

        // Claude Code section
        document.querySelectorAll('[data-ccset]').forEach(el => {
            el.addEventListener('change', () => {
                delete errors['cc:' + el.dataset.ccset];
                const value = el.type === 'checkbox' ? el.checked : el.value;
                vscode.postMessage({ type: 'ccSet', id: el.dataset.ccset, value });
            });
            enterLetsGo(el);
        });
        document.querySelectorAll('[data-ccclear]').forEach(btn =>
            btn.addEventListener('click', () => {
                delete errors['cc:' + btn.dataset.ccclear];
                vscode.postMessage({ type: 'ccClear', id: btn.dataset.ccclear });
            }));
        const ccOpen = document.getElementById('ccopen');
        if (ccOpen) { ccOpen.addEventListener('click', () => vscode.postMessage({ type: 'ccOpenFile' })); }
        const ccApply = document.getElementById('ccrawapply');
        if (ccApply) {
            ccApply.addEventListener('click', () => {
                delete errors['cc:__raw__'];
                const ta = document.getElementById('ccraw');
                vscode.postMessage({ type: 'ccRaw', text: ta ? ta.value : '' });
            });
        }

        // profiles
        const sel = document.getElementById('profsel');
        document.getElementById('profapply').addEventListener('click', () => {
            if (sel && sel.value) { vscode.postMessage({ type: 'applyProfile', name: sel.value }); }
        });
        document.getElementById('profdel').addEventListener('click', () => {
            if (sel && sel.value) { vscode.postMessage({ type: 'deleteProfile', name: sel.value }); }
        });
        document.getElementById('profsave').addEventListener('click', () => {
            saveOpen = !saveOpen;
            render();
            const inp = document.getElementById('profname');
            if (inp) { inp.focus(); }
        });
        const confirm = document.getElementById('profconfirm');
        if (confirm) {
            const send = () => {
                const inp = document.getElementById('profname');
                if (inp && inp.value.trim()) {
                    vscode.postMessage({ type: 'saveProfile', name: inp.value.trim() });
                    saveOpen = false;
                }
            };
            confirm.addEventListener('click', send);
            document.getElementById('profname').addEventListener('keydown', ev => { if (ev.key === 'Enter') { send(); } });
        }
        document.getElementById('profexport').addEventListener('click', () => vscode.postMessage({ type: 'exportProfiles' }));
        document.getElementById('profimport').addEventListener('click', () => vscode.postMessage({ type: 'importProfiles' }));

        // hold background refreshes while a field has focus
        const app = document.getElementById('app');
        if (app.addEventListener) {
            app.addEventListener('focusin', ev => {
                const t = ev.target;
                // ‼️ U-143 — A `<select>` HOLDS THE REFRESH TOO. An open
                // dropdown is a control the reader is in the middle of using,
                // and a background push redraws #app underneath it: the list
                // shuts and the choice is lost, with nothing on screen saying
                // why. The guard named the two boxes and forgot the third
                // control that can be open when the data arrives.
                if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) {
                    editing = true;
                }
            });
            app.addEventListener('focusout', () => {
                editing = false;
                if (pendingData) { DATA = pendingData; pendingData = null; render(); }
            });
        }

        // U-139 — see the top of render(): put the page back where the reader
        // left it. Skipped at 0, which is both the first draw and a reader who
        // was already at the top; writing it there would be a scroll nobody
        // needs on every push.
        if (keepY) {
            try { window.scrollTo(0, keepY); } catch (e) { /* stub DOM */ }
        }
    }

    function focusKey(key) {
        const el = document.querySelector(`[data-item="${key}"]`);
        if (!el) { return; }
        if (el.scrollIntoView) { el.scrollIntoView({ block: 'center' }); }
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 2500);
    }

    // ------------------------------------------------------- right-click menu

    /**
     * A setting and an agent root, from the right button. Reset and Remove are
     * the page's own messages; the rest is what a settings row was never able
     * to answer — what is this called, what is it set to, and where does VS
     * Code's own editor show it.
     */
    function ctxDo(act, ctx) {
        const verb = act.split(':')[0];
        const arg = act.slice(verb.length + 1);
        switch (verb) {
            case 'stReset':
                delete errors[ctx.setKey];
                vscode.postMessage({ type: 'reset', key: String(ctx.setKey || '') });
                return;
            case 'stOpenUi':
                vscode.postMessage({ type: 'openSettingsUi', key: String(ctx.setKey || '') });
                return;
            case 'stCopy': {
                if (arg === 'key') { window.AFCtx.copy(ctx.setKey); return; }
                // The settings live inside their categories, not in a flat list.
                let it;
                for (const cat of (DATA.categories || [])) {
                    it = (cat.items || []).find(x => x.key === ctx.setKey);
                    if (it) { break; }
                }
                const v = it ? it.value : undefined;
                window.AFCtx.copy(v === undefined || v === null ? ''
                    : typeof v === 'object' ? JSON.stringify(v) : String(v));
                return;
            }
            case 'rtReveal': vscode.postMessage({ type: 'rootReveal', root: String(ctx.rootPath || '') }); return;
            case 'rtRemove': vscode.postMessage({ type: 'rootRemove', root: String(ctx.rootPath || '') }); return;
            case 'rtAdd': vscode.postMessage({ type: 'rootAdd' }); return;
            case 'rtCopy': window.AFCtx.copy(ctx.rootPath); return;
        }
    }

    // ‼️ ONCE, at module scope — render() rebinds every control on every change.
    window.AFCtx.listen(ctxDo);

    // ‼️ M-33 — A HOST PUSH WAITS FOR THE READER'S HANDS; THE PAGE'S OWN
    // RENDERS DO NOT. render() replaces the whole of #app, so a repaint that
    // arrives while somebody is typing detaches the box they are typing in and
    // the caret falls to <body> — where space IS Page Down. Full text, and
    // what a page-specific busy() is for: media/afRepaint.js.
    const repaint = window.AFRepaint.guard(render);
    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') {
            if (editing) { pendingData = { ...DATA, ...ev.data.data }; return; }
            DATA = { ...DATA, ...ev.data.data };
            // U-142 — the store answered, so nothing is waiting to be put back:
            // a refusal arrives as `error` and never as a redraw.
            for (const k of Object.keys(jsonSent)) { delete jsonSent[k]; }
            repaint();
            return;
        }
        if (ev.data.type === 'error') {
            errors[ev.data.key] = ev.data.error;
            // U-142 — a refused Apply goes back into the box it came from,
            // with the text that was refused still in it.
            if (jsonSent[ev.data.key] !== undefined) {
                jsonMode[ev.data.key] = true;
                jsonDraft[ev.data.key] = jsonSent[ev.data.key];
                delete jsonSent[ev.data.key];
            }
            render();
            focusKey(ev.data.key);
            return;
        }
        if (ev.data.type === 'ccError') {
            errors['cc:' + ev.data.id] = ev.data.error;
            render();
            focusKey('cc:' + ev.data.id);
            return;
        }
        // ‼️ U-108 — the folder the user picked for ONE ROW of a list.
        // It goes into the draft and nothing is saved: the scalar Browse writes
        // straight through because the path IS the whole value, and a row is
        // not — the list around it is still being edited.
        if (ev.data.type === 'browsedRow') {
            const rows = listDraft[ev.data.key]
                || (allItems().find(i => i.key === ev.data.key) || {}).value || [];
            const list = Array.isArray(rows) ? rows.slice() : [];
            const i = Number(ev.data.index);
            if (i >= 0 && i < list.length) { list[i] = String(ev.data.path); }
            else { list.push(String(ev.data.path)); }
            listDraft[ev.data.key] = list.map(v => String(v));
            delete errors[ev.data.key];
            render();
            return;
        }
        // U-84 — the live getMe answer. Shown IN THE CARD rather than as a
        // notification: the question was asked here and the answer belongs
        // beside the badge it is about.
        if (ev.data.type === 'svc-verified') {
            svcMsg = window.AFTelegram.verifiedMessage(ev.data);
            render();
            return;
        }
        if (ev.data.type === 'focus') { focusKey(ev.data.key); }
    });

    render();
    if (DATA.focus) { focusKey(DATA.focus); }
})();
