// Agent Farm — Farm Settings: the Wiki section and the grouped Sentry and Discipline sections.
// Split out of media/settings.js unchanged (U-225): the page hands its state in once, as X.
(function () {
    'use strict';
    let X, C, itemHtml;

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
    const WIKI_TERMS = window.AFSettingSearch.termsOf('agentFarm.wiki');

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
            why: 'A run is held to whichever line it reaches first — its own context window, or the 5-hour or weekly quota of the account it is signed in as (read from that session\'s sign-in, never the home folder\'s). Converge is the earlier, quieter word; hand over is the end of the run. 0 switches a line off, and a converge line above its own handover line is folded down onto it.',
            keys: ['contextConvergePct', 'contextHandoverPct', 'quotaConvergePct', 'quotaHandoverPct', 'quotaWeeklyHandoverPct', 'defaultAccountCeiling', 'defaultAccountWeeklyCeiling']
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
            why: 'A run that hands over because its context filled up — not because its account ran out — leaves that account\'s five-hour window half used. Under this line the successor stays on the same account (a relay\'s next leg, the sentry\'s next round); at or above it, or when the handover was the quota\'s, the pool picks as before. A stay is a start, so this line never stands above the Account ceiling every start obeys: set higher, it acts at the ceiling and the row says so. The relay\'s pool is kept for every later leg. 0 = off.',
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
        const w = X.DATA.wiki;
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

    window.AFSettingWiki = function (ctx) {
        X = ctx;
        ({ C, itemHtml } = ctx);
        return { sentrySection, disciplineSection, wikiSection };
    };
})();
