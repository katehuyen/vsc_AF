// Agent Farm — Farm Settings: the editor of a setting that is a set of name → value pairs (U-110).
// Split out of media/settings.js unchanged (U-225): the page hands its state in once, as X.
(function () {
    'use strict';
    let X, vscode, C, errors, mapDraft, shortKey, allItems, shapeHtml, fieldBox, fieldText, readField, render;

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
        const reports = (X.DATA.folders && X.DATA.folders.reports) || [];
        const agents = reports.filter(r => !r.duplicate)
            .reduce((a, r) => a.concat(r.candidates || []), []);
        if (source === 'agentDir') { return agents.map(c => c.dir).filter(Boolean); }
        // X-171 — an account is chosen PER ENGINE, so the names of this one are
        // the engines this machine knows. Read off the same list the Engines
        // section draws, never a second copy of it.
        if (source === 'engine') { return (X.DATA.engines || []).map(e => e.id).filter(Boolean); }
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

    window.AFSettingMap = function (ctx) {
        X = ctx;
        ({ vscode, C, errors, mapDraft, shortKey, allItems, shapeHtml, fieldBox, fieldText, readField, render } = ctx);
        return { mapField, readMap, applyMap, mapHtml, BACK };
    };
})();
