// Agent Farm — Farm Settings: which app a document opens in, and the prompt snippets section.
// Split out of media/settings.js unchanged (U-225): the page hands its state in once, as X.
(function () {
    'use strict';
    let X, C, sectionMatches;
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    function N_(s) { return s; }

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
        const d = X.DATA.docOpen;
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
        // U-233 — a custom app with no command opens nothing: the one state worth a warning here
        const noCmd = showCustom && !String(d.customCommand || '').trim();
        return X.cardHtml({
            id: 'cat-docopen', icon: '📄', title: t('Open documents with'), state: noCmd ? 'warn' : 'ok',
            status: noCmd ? t('Custom app is chosen, but no command is set.')
                : t('Every Open button uses {app}.', { app: LBL[d.defaultMode] || d.defaultMode }),
            actions: `<select id="docopenmode" aria-label="${C.esc(t('Default app'))}" style="min-width:240px">${opts}</select>`,
            tip: t('Which editor a .md file opens in when you press Open anywhere in Agent Farm: report and answer links on Notices and the Work Queue, and the project documents on the Projects page. The buttons beside Open (Editor, Preview, Obsidian, App) override it for one click, and App is the custom one set here. It is kept out of the settings on purpose: a path to a program on this machine does not belong in settings that travel between machines.'),
            open: showCustom,
            details: `<div class="setdesc">${C.esc(t('Obsidian opens the file at the line when you click a single backlog item\'s code, if the Advanced URI plugin is installed; otherwise it opens the file.'))}</div>
                <div id="docopencustom" style="margin-top:10px; ${showCustom ? '' : 'display:none'}">
                    <div class="setdesc">${C.esc(t('Custom app: an executable or command, e.g. notepad.exe or a full path.'))}</div>
                    <input id="docopencmd" type="text" value="${C.esc(d.customCommand || '')}" placeholder="notepad.exe" style="width:100%; max-width:440px; padding:6px 8px">
                    <div class="setdesc" style="margin-top:6px">${C.esc(t('Arguments: {file} becomes the file path, {line} the line number when one is known (dropped when it is not).', { file: '{file}', line: '{line}' }))}</div>
                    <input id="docopenargs" type="text" value="${C.esc(d.customArgs || '{file}')}" placeholder="{file}" style="width:100%; max-width:440px; padding:6px 8px">
                </div>`
        });
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
    function promptsSection(cat) {
        const p = X.DATA.prompts;
        const item = cat && cat.items && cat.items[0];
        const box = item ? `
            <div class="setctl" style="margin-top:8px">
                <span class="setfield"><input type="text" data-set="${C.esc(item.key)}"
                    placeholder="(nothing chosen — the built-in path below is used)"
                    value="${C.esc(String(item.value ?? ''))}" style="max-width:520px"></span>
            </div>` : '';
        if (!p) { return box; }

        const n = (p.items || []).length;
        const src = p.source === 'setting' ? t('the file you chose') : t('the built-in path (you have not chosen one)');
        const many = (k, one, other) => (k === 1 ? t(one) : t(other, { n: k }));
        // U-233 — one sentence of where it stands: what was READ, not the path
        const status = p.error ? p.error
            : !p.file ? t('No prompts file yet.')
                : !n ? t('No prompt found in {src}: only text inside ``` fences is offered.', { src })
                    : t('{count} read from {src}{skipped}.', {
                        count: many(n, N_('One prompt'), N_('{n} prompts')), src,
                        skipped: p.empty ? ' · ' + many(p.empty, N_('1 empty block skipped'), N_('{n} empty blocks skipped')) : ''
                    });
        const noFile = p.file || p.error ? '' : `<div class="setdesc">No file yet. Press <b>📁 Choose a file…</b> — your machine's own
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

        return X.cardHtml({
            id: 'cat-prompts', item: 'agentFarm.promptSnippetsFile', icon: '💬', title: (cat && cat.label) || t('Saved prompts'),
            state: p.error || (p.file && !n) ? 'warn' : p.file ? 'ok' : 'off', status,
            actions: `<button class="small" id="promptspick">📁 ${C.esc(p.file ? t('Change file…') : t('Choose a file…'))}</button>
                <button class="secondary small" id="promptsopen" ${p.file ? '' : 'disabled'}
                    title="${C.esc(t('Open it in the editor — add a ``` block and it is in the list the moment you press Re-read'))}">✎ ${C.esc(t('Open the file'))}</button>
                <button class="secondary small" id="promptsreload" title="${C.esc(t('Read the file again — it is a document you edit elsewhere'))}">⟳ ${C.esc(t('Re-read'))}</button>`,
            tip: (cat && cat.about ? cat.about + '\n\n' : '') + t('The phrases you say to an agent over and over, kept in your own markdown file and offered where you need them: in the Console, right-click any button that sends text (Send, Send into turn, Send after turn, Start session) and pick one. It is pasted at the caret, never sent: the press that sends is still yours. Only text inside ``` fences is offered, so the prose around the blocks stays yours to write notes in. A block\'s name is its fence info string, the line above it, or its own first line; the nearest heading becomes the group.'),
            open: !!p.error || !!X.filter,
            details: `<div class="setdesc" style="font-family:var(--vscode-editor-font-family)">${p.file ? C.esc(p.file) : '—'}
                    ${p.file ? `<span class="rootbadge">${C.esc(p.source === 'setting' ? t('chosen') : t('built-in'))}</span>` : ''}</div>
                ${noFile}
                ${box}
                ${item && String(item.value ?? '').trim() ? `<div class="btnrow"><button class="secondary small" id="promptsdefault"
                    title="${C.esc(t('Forget the file you chose and go back to the built-in path'))}">↺ ${C.esc(t('Use the built-in path'))}</button></div>` : ''}
                ${list}`
        });
    }

    window.AFSettingDocs = function (ctx) {
        X = ctx;
        ({ C, sectionMatches } = ctx);
        return { docOpenSection, promptsSection };
    };
})();
