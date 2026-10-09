// Agent Farm — Farm Settings: the Superpowers, Telegram and Sound groups, each drawn with its card.
// Split out of media/settings.js (U-225): the page hands its state in once, as X; each takes its catalog group.
(function () {
    'use strict';
    let X, C, itemHtml;
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));

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
    function superpowersSection(cat) {
        const sp = X.DATA.superpowers;
        const items = (cat && cat.items) || [];
        const boxes = items.map(itemHtml).join('');
        if (!sp) { return boxes; }

        const skills = sp.skills || [];
        // U-233 — the dot is the state: green can supply a session, yellow is a folder that cannot, grey is not there
        const state = !sp.exists ? 'off' : sp.usable ? 'ok' : 'warn';
        const agents = sp.agents || [];
        const status = sp.usable
            ? t('{skills} behind the hook; {on} of {all} agents start with it on.', {
                skills: skills.length === 1 ? t('One skill') : t('{n} skills', { n: skills.length }),
                on: agents.filter(a => a.on).length, all: agents.length
            })
            : sp.exists ? t('The folder has no hook, so a session switched on is given nothing.')
                : t('The skills folder is not on this machine, so a session switched on is given nothing.');

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

        return X.cardHtml({
            id: 'cat-superpowers', item: 'agentFarm.superpowersPath', icon: '⚡', title: (cat && cat.label) || t('Superpowers'), state, status,
            actions: `<button class="secondary small" data-browse="agentFarm.superpowersPath" data-browsekind="folder"
                    title="${C.esc(t('Pick the folder — the path is written into the box below and saved'))}">📁 ${C.esc(t('Choose the folder…'))}</button>
                <button class="secondary small" id="sprescan" title="${C.esc(t('Read the folder again. It is a folder you edit by hand, so a skill you just added shows up here without a reload.'))}">↻ ${C.esc(t('Re-scan'))}</button>
                <button class="secondary small" id="spreveal" ${sp.exists ? '' : 'disabled'} title="${C.esc(t('Open the folder in the file manager'))}">📂 ${C.esc(t('Reveal'))}</button>`,
            tip: (cat && cat.about ? cat.about + '\n\n' : '') + t('A library of engineering procedures (TDD, root-cause debugging, planning, verification before completion) that sleeps on disk at zero tokens. Switched on, a session\'s system prompt carries only the library\'s own hook plus an index of where the skills are; the model reads the one it needs when it needs it. Switched off, nothing is added at all.'),
            open: state === 'warn' || !!X.filter,
            details: `${differs ? `<div class="setdesc" style="font-family:var(--vscode-editor-font-family)">${C.esc(typed)}</div>` : ''}
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
                    <button class="secondary small" data-reset="agentFarm.superpowersPath"
                        title="Empty the setting. The folder is then looked for next to your agents — _SKILLS/superpowers under an agent root, or beside it when a root names a single agent.">↺ Reset to default</button>
                </div>`
        }) + boxes;
    }

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
    function accessSection(cat) {
        const items = (cat && cat.items) || [];
        const boxes = items.map(itemHtml).join('');
        const t = X.DATA.telegram;
        // Nothing to add when this window has no bridge host, or when the filter
        // has narrowed the category down to the web-server rows.
        if (!t || !items.some(it => /^agentFarm\.telegram/.test(it.key))) { return boxes; }
        return window.AFTelegram.card(t, {
            controls: false,
            msg: X.svcMsg,
            footer: '<div class="muted small" style="margin-top:6px">The switch, the allowlist, '
                + 'the ceiling and the default agent are the boxes below — this card is what they '
                + 'cannot tell you.</div>'
        }) + boxes;
    }

    /** The Sound group, with every alert-sound box replaced by ONE summary line
     *  pointing at the Sound page (U-178), in their own place — in the same
     *  section as the notification switches, where the reader who confused the two will look. */
    function alertsSection(group) {
        const al = X.DATA.alerts;
        const items = (group && group.items) || [];
        if (!al) { return items.map(itemHtml).join(''); }
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
            return window.AFSoundCard.summary(al);
        }).join('');
    }

    window.AFSettingAccess = function (ctx) {
        X = ctx;
        ({ C, itemHtml } = ctx);
        return { superpowersSection, accessSection, alertsSection };
    };
})();
