// Agent Farm — Farm Settings: the Wiki group with its card, and the path-variable legend the Sentry section leads with.
// Split out of media/settings.js (U-225): the page hands its state in once, as X. Groups are the catalog's (U-226).
(function () {
    'use strict';
    let X, C, itemHtml;
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    function N_(s) { return s; }

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
        const vars = X.DATA.pathVars;
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
    function wikiSection(cat) {
        const w = X.DATA.wiki;
        const items = (cat && cat.items) || [];
        const boxes = items.map(itemHtml).join('');
        if (!w) { return boxes; }

        const ready = w.exists && !(w.missing || []).length;
        // U-233 — the dot is the state: green is compilable, yellow a folder every compile refuses, grey not one yet
        const state = !w.exists ? 'off' : w.compilable ? 'ok' : 'warn';
        const nCat = (w.categories || []).length;
        const many = (k, one, other) => (k === 1 ? t(one) : t(other, { n: k }));
        const status = !w.exists ? t('Nothing is at the wiki folder yet.')
            : !w.compilable ? t('The vault\'s own law is not in this folder, so every compile refuses.')
                : t('{pages} in {cats}.', { pages: many(w.pages, N_('One page'), N_('{n} pages')), cats: many(nCat, N_('one category'), N_('{n} categories')) })
                + ((w.missing || []).length ? ' ' + many(w.missing.length, N_('One file a compile keeps true is missing.'), N_('{n} files a compile keeps true are missing.')) : '');

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
                + '\n\nA folder here is a category the moment it exists, whether or not a page has been\nwritten into it. The picker offers every one of these.')
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

        return X.cardHtml({
            id: 'cat-wiki', item: 'agentFarm.wikiRoot', icon: '📚', title: (cat && cat.label) || t('Wiki'), state, status,
            actions: `${ready ? '' : `<button class="small" id="wikiinit" title="${C.esc(t('Create the folder and whatever of the three files is missing. It only CREATES: a file already on disk is left exactly as it is, because the law is yours.'))}">🛠 ${C.esc(t('Start the wiki here'))}</button>`}
                <button class="secondary small" data-browse="agentFarm.wikiRoot" data-browsekind="folder"
                    title="${C.esc(t('Pick the folder — the path is written into the box below and saved'))}">📁 ${C.esc(t('Choose the folder…'))}</button>
                <button class="secondary small" id="wikirescan" title="${C.esc(t('Read the folder again. It is a folder you edit in Obsidian while this page is open, so a category you just made shows up here without a reload.'))}">↻ ${C.esc(t('Re-scan'))}</button>
                <button class="secondary small" id="wikiopen" title="${C.esc(t('Open the Wiki cockpit — the pool of marked turns waiting to be compiled'))}">📚 ${C.esc(t('Open the cockpit'))}</button>`,
            tip: (cat && cat.about ? cat.about + '\n\n' : '') + t('Marking a turn is free and writes nothing to the vault; compiling is the expensive half: an agent reads the transcripts and writes pages under the vault\'s own law. This is where that half is configured: which folder the wiki lives in, and whose hand and which model write it.'),
            open: state === 'warn' || !!X.filter,
            details: `${differs ? `<div class="setdesc" style="font-family:var(--vscode-editor-font-family)">${C.esc(typed)}</div>` : ''}
                <div class="setdesc" style="font-family:var(--vscode-editor-font-family)">${C.esc(w.root || '—')}${differs ? ' <span class="muted">← what it opens</span>' : ''}</div>
                ${why}
                <div class="wikifiles">${(w.files || []).map(fileRow).join('')}</div>
                ${catList}
                ${misplaced}
                <div class="btnrow">
                    <button class="secondary small" id="wikireveal" ${w.exists ? '' : 'disabled'} title="Open the folder in the file manager">📂 Reveal</button>
                </div>`
        }) + boxes;
    }

    window.AFSettingWiki = function (ctx) {
        X = ctx;
        ({ C, itemHtml } = ctx);
        return { pathVarLegend, wikiSection };
    };
})();
