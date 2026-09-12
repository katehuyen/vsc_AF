/**
 * The Engines PANEL (X-14), with all three verdict states on screen at once:
 * one engine tested and answering, one tested and failing with the engine's own
 * words, one never tested.
 *
 * ‼️ THE FAILING ROW IS THE REAL ONE. Codex on this machine holds a live
 * ChatGPT grant and cannot open a socket — that is the case the whole panel
 * exists for, so the fixture carries the actual error text rather than a
 * placeholder.
 */
const base = require('./engines.js');

const NOW = Date.parse('2026-08-09T18:40:00Z');

/**
 * ‼️ X-284 — THE CLAUSE LIST IS ASKED, NOT TYPED. A scene whose contract is
 * a hand-written array photographs a card the product does not draw the moment
 * an engine gains a clause — and this list exists precisely because things get
 * added to it. So the ids and their repairability come from `slotClauses`, the
 * same function the host reads; only the DETAIL prose is the scene's, because
 * that sentence is what the panel has to lay out.
 */
const { adapterFor } = require('../../out/core/engineAccounts.js');
const { slotClauses } = require('../../out/core/slotCompleteness.js');
const detailFor = (c) => {
    const name = c.id.slice(c.id.indexOf(':') + 1);
    if (c.kind === 'own' || c.kind === 'carry') { return name + ' present'; }
    if (c.kind === 'env') { return name + '=0 in settings.json'; }
    if (c.kind === 'link') { return name + ' \u2192 pool'; }
    return 'hooks current on :8377';
};
/** `gaps` maps a clause id to the sentence the card must draw for it. */
const contract = (engine, gaps) => {
    const bad = gaps || {};
    const rows = slotClauses(adapterFor(engine)).map(c => ({
        id: c.id, ok: !bad[c.id], repairable: !!c.repair,
        detail: bad[c.id] || detailFor(c)
    }));
    return { complete: rows.every(r => r.ok), gaps: rows.filter(r => !r.ok).map(r => r.id), rows };
};

const data = () => {
    const engines = base.engines();
    // The panel's own payload adds the verdicts and the clock they are read
    // against — the AGE is part of the claim.
    return {
        engines,
        now: NOW,
        ready: engines.filter(e => e.ready).length,
        onPlan: engines.filter(e => e.ready && e.auth.mode === 'subscription').length,
        /**
         * ‼️ X-100 — THE OWNERSHIP TABLE AND THE ROUTES, drawn with BOTH sides
         * of each question present, because the whole point of the table is
         * that neither owner is the error state: a Claude route is Agent
         * Farm's because nobody else on the machine knows it exists, and an
         * OpenCode credential is the engine's because a second copy here would
         * make two vaults. A fixture showing only one side would let the two
         * be drawn as good and bad without anybody noticing.
         */
        /**
         * ‼️ X-172 — THE SIGN-INS, WITH ALL THREE STATES PRESENT, because the
         * chip's whole job is to tell them apart: one engine standing on a
         * captured account, one with accounts stored but none standing (the
         * MAIN sign-in, which is the absence of a choice rather than a row),
         * and every other engine with no accounts at all and therefore no chip.
         * A fixture with only the happy state photographs the one case the
         * control is not for.
         */
        accounts: [
            {
                id: 'work-1', engine: 'claude', label: 'work@studio',
                email: 'work@studio.example', plan: 'max20x', health: 'ready', active: true,
                // X-282 — the provider's id, short, and who else carries it
                uuidShort: '40fd76b3', duplicateOf: [],
                percent: 91, resetsAt: NOW + 37 * 60 * 1000,
                // ‼️ audit B-04.3 — the window arrives NAMED. The host fills the
                // silence (`windowNameOf`), so a page never derives it and the
                // five surfaces that each derived it their own way cannot drift.
                usageState: 'ok', note: '', window: 'five-hour window',
                quotaSource: 'oauth-credentials',
                capturedAt: NOW - 6 * 24 * 3600 * 1000,
                // X-206 — the figure's own age, and the refresh line: this one
                // is being read right now, the next is waiting behind it.
                fetchedAt: NOW - 40 * 1000, queue: 'reading', queuePlace: 0,
                settingsGaps: [], settingsGuarantee: true,
                completeness: contract('claude'),
                dir: 'C:/Users/mv/AppData/agent-farm/accounts/work-1'
            },
            {
                id: 'personal', engine: 'claude', label: 'personal@gmail',
                email: 'personal@gmail.com', plan: 'pro', health: 'ready', active: false,
                uuidShort: 'dce63e3f', duplicateOf: ['spare'],
                percent: 12, resetsAt: NOW + 4 * 60 * 60 * 1000,
                usageState: 'ok', note: '', window: 'five-hour window',
                quotaSource: 'oauth-credentials',
                capturedAt: NOW - 2 * 3600 * 1000,
                fetchedAt: NOW - 3 * 3600 * 1000, queue: 'queued', queuePlace: 1,
                settingsGaps: [], settingsGuarantee: true,
                completeness: contract('claude'),
                dir: 'C:/Users/mv/AppData/agent-farm/accounts/personal'
            },
            {
                id: 'spare', engine: 'claude', label: 'spare@gmail',
                email: 'spare@gmail.com', plan: 'pro', health: 'needs-signin', active: false,
                uuidShort: 'dce63e3f', duplicateOf: ['personal'],
                percent: -1, resetsAt: 0,
                usageState: 'no-auth', note: 'The refresh token was rejected.',
                window: 'five-hour window',
                quotaSource: 'oauth-credentials', capturedAt: NOW - 21 * 24 * 3600 * 1000,
                fetchedAt: NOW - 26 * 3600 * 1000, queue: 'queued', queuePlace: 2,
                settingsGaps: [], settingsGuarantee: true,
                completeness: contract('claude'),
                dir: 'C:/Users/mv/AppData/agent-farm/accounts/spare'
            },
            // Captured, and NOT standing — the chip says "main account" here,
            // which is the state a reader is most likely to misread as "none".
            {
                // X-215 - the card this item exists for. Codex publishes no
                // endpoint and is not silent: the figure is its own transcript's
                // last rate_limits block, so the window is a WEEK and the label
                // over the bar has to say so.
                id: 'codex-work', engine: 'codex', label: 'work@studio',
                email: 'work@studio.example', plan: 'plus', health: 'ready', active: false,
                percent: 72, resetsAt: NOW + 3 * 24 * 3600 * 1000,
                usageState: 'ok', window: 'Current week', quotaSource: 'session-tail',
                note: 'Read from the account\'s own Codex transcript, which records the limit the service returned '
                    + 'on its last turn. It costs nothing and asks nothing - but it is as old as that turn.',
                capturedAt: NOW - 3 * 3600 * 1000,
                fetchedAt: NOW - 26 * 60 * 1000, queue: 'idle', queuePlace: 0,
                settingsGaps: [], settingsGuarantee: false,
                completeness: contract('codex'),
                dir: 'C:/Users/mv/AppData/agent-farm/accounts/codex-work'
            },
            {
                // ‼️ X-215 — AND THE OTHER SILENCE, on the same engine. A slot
                // captured before its CLI has run once has no transcript to
                // read, so it has no figure AND no window name — and "five-hour
                // window — not read yet" would be the one claim about it that is
                // certainly wrong. It is the row that keeps the two silences
                // apart: nothing measured yet, versus a sign-in that died.
                id: 'codex-spare', engine: 'codex', label: 'spare@chatgpt',
                email: 'spare@chatgpt.example', plan: '', health: 'ready', active: false,
                percent: -1, resetsAt: 0,
                // ‼️ …and this is the silence the host fills DIFFERENTLY: a
                // disk-backed reading nobody has taken has no window length yet,
                // so it is named for what it is rather than for five hours.
                usageState: 'error', window: 'usage window', quotaSource: 'session-tail',
                note: 'Not read yet — this account\'s own transcripts hold the figure, so reading it '
                    + 'costs no request and no place in any line. It fills in as soon as something looks.',
                capturedAt: NOW - 20 * 60 * 1000,
                fetchedAt: 0, queue: 'idle', queuePlace: 0,
                settingsGaps: [], settingsGuarantee: false,
                completeness: contract('codex'),
                dir: 'C:/Users/mv/AppData/agent-farm/accounts/codex-spare'
            }
        ],
        /**
         * ‼️ X-172 — WHAT EACH ENGINE CAN DO ABOUT ACCOUNTS AT ALL, and it is
         * the half that decides whether a CAPTURE button is honest. Three of
         * the five have no verified way to keep two identities apart, so a
         * picker listing them would offer a gesture whose only outcome is a
         * refusal — the fixture carries all three answers (measured, declared,
         * unmapped) so the page cannot be drawn against the happy one alone.
         */
        accountEngines: [
            {
                engine: 'claude', support: 'measured', variable: 'CLAUDE_CONFIG_DIR', canCapture: true,
                why: 'Measured on this machine 2026-09-03: pointed at an empty directory, Claude Code asked to sign in again and left the main directory untouched.',
                layout: 'An account is a config directory, chosen with CLAUDE_CONFIG_DIR before the process starts.'
            },
            {
                engine: 'codex', support: 'declared', variable: 'CODEX_HOME', canCapture: true,
                why: 'CODEX_HOME is Codex own documented override for ~/.codex, but it has NOT been run against a second identity on this side.',
                layout: 'An account is a config directory, chosen with CODEX_HOME before the process starts.'
            },
            {
                engine: 'gemini', support: 'unmapped', variable: null, canCapture: false,
                why: 'The Gemini CLI writes its Google sign-in into ~/.gemini and this side has not verified any variable that moves it.',
                layout: 'The Gemini CLI writes its Google sign-in into ~/.gemini and this side has not verified any variable that moves it.'
            },
            {
                engine: 'opencode', support: 'unmapped', variable: null, canCapture: false,
                why: 'OpenCode stores credentials under the shared XDG data root, which no per-session variable relocates.',
                layout: 'OpenCode stores credentials under the shared XDG data root, which no per-session variable relocates.'
            },
            {
                engine: 'agy', support: 'unmapped', variable: null, canCapture: false,
                why: 'Antigravity is paid for by an app sign-in and keeps no credential file this side can seal into a slot.',
                layout: 'Antigravity is paid for by an app sign-in and keeps no credential file this side can seal into a slot.'
            }
        ],
        ownership: [
            {
                engine: 'claude', kind: 'catalog', owner: 'agent-farm',
                why: 'Claude Code has no provider list of its own. A route is something Agent Farm '
                    + 'assembles from a template, so the list of them exists here or nowhere.'
            },
            {
                engine: 'claude', kind: 'credential', owner: 'agent-farm',
                why: 'The key for a route Agent Farm injects is held in SecretStorage, keyed by the '
                    + 'profile id. The CLI is never told where it came from and keeps no copy.'
            },
            {
                engine: 'claude', kind: 'config', owner: 'agent-farm',
                why: 'The environment a Claude process is spawned with is built per launch.'
            },
            {
                engine: 'opencode', kind: 'catalog', owner: 'engine',
                why: 'OpenCode publishes its own providers and models. A shipped list here would be '
                    + 'a build claiming to know a machine.'
            },
            {
                engine: 'opencode', kind: 'credential', owner: 'engine',
                why: 'The engine owns `/connect`, `opencode auth login` and `auth.json`. A second '
                    + 'copy in Agent Farm makes two vaults, and the stale one wins silently.'
            },
            {
                engine: 'opencode', kind: 'config', owner: 'engine',
                why: 'The global and per-project `opencode.json` are the user\'s files.'
            },
            /**
             * ‼️ THE FOURTH KIND, AND IT IS THE INTERESTING ONE: the same answer
             * on both engines, and it is Agent Farm — because which provider a
             * run was actually started with is HISTORY rather than
             * configuration, and no engine keeps it. It was invisible in the
             * first drawing of this table (`ownershipTable` listed the rows and
             * `selection` is answered by rule instead), which is the acceptance
             * line failing quietly. Both rows are here so a column that shows
             * the same value twice cannot be mistaken for a rendering fault.
             */
            {
                engine: 'claude', kind: 'selection', owner: 'agent-farm',
                why: 'Which provider a run was actually started with is HISTORY, not configuration — '
                    + 'and no engine keeps it. Claude\'s transcript demonstrably cannot: two routes, '
                    + 'one model name, nothing in the record to tell them apart.'
            },
            {
                engine: 'opencode', kind: 'selection', owner: 'agent-farm',
                why: 'Same answer, same reason: OpenCode\'s export keeps it only while the export '
                    + 'exists. That is what the launch manifest is for.'
            }
        ],
        // ‼️ AND BOTH KEY STATES, side by side: a route that can run and one
        // that cannot yet. "no key" is the step you are ON, not a failure, and
        // it has to be possible to see that the two are not drawn as verdicts.
        profiles: [
            {
                id: 'kimi', label: 'Kimi (Moonshot)', engine: 'claude', providerId: 'kimi',
                baseUrl: 'https://api.moonshot.ai/anthropic', authKind: 'api-key',
                tiers: { opus: 'kimi-k2-thinking', sonnet: 'kimi-k2' },
                revision: 3, hasSecret: true
            },
            {
                id: 'minimax', label: 'MiniMax', engine: 'claude', providerId: 'minimax',
                baseUrl: 'https://api.minimax.io/anthropic', authKind: 'api-key',
                tiers: {}, revision: 1, hasSecret: false
            }
        ],
        verdicts: [
            {
                id: 'claude', ok: true, ms: 3400, at: NOW - 40 * 1000,
                detail: 'Answered in 3.4s — the CLI, the sign-in and the provider all work.'
            },
            {
                id: 'codex', ok: false, ms: 21800, at: NOW - 4 * 3600 * 1000,
                detail: 'The command finished but the engine never completed a turn.',
                error: 'stream disconnected before completion: An attempt was made to access a '
                    + 'socket in a way forbidden by its access permissions. (os error 10013)'
            },
            // ‼️ U-59 — THE FOURTH VERDICT SHAPE: the check did not run at all,
            // and that is not the same as "the engine failed". OpenCode's health
            // check picks a FREE model off the live catalogue; when the connected
            // providers offer none, spending a paid turn on a health check is not
            // Agent Farm's call to make, so it refuses and says what the user can
            // do instead. Drawn here because "not ok" and "not attempted" wearing
            // the same red row is exactly the confusion this state creates.
            {
                id: 'opencode', ok: false, refused: true, ms: 900, at: NOW - 90 * 1000,
                detail: 'No free model is on offer from the providers connected here, so this check '
                    + 'would spend money on a paid turn. Connect the `opencode` provider (it needs no '
                    + 'sign-in) or pick a model yourself and run one turn by hand — Agent Farm will not '
                    + 'choose a billed model for a health check.'
            }
            // gemini: deliberately untested — the third state.
        ]
    };
};

/**
 * ‼️ X-220's THIRD VERDICT, AS A SCENE (audit A-06.7).
 *
 * The whole of X-220 is that the two bad states are DIFFERENT FACTS — 🟠 knows
 * whose account it is and cannot refresh it, 🔴 cannot tell you even that — and
 * until this variant existed the red one had never been on a screen. It was
 * checked by mutating the payload inside a test, which proves the string and
 * photographs nothing; the caption under the badge went on saying "needs
 * signing in again" on a 🔴 row for exactly as long.
 *
 * It is its own variant rather than a sixth row in the scene above, because
 * that scene's counts are pinned on purpose (four quiet greens against one
 * yellow is the design, not an accident) and a state is not made visible by
 * spoiling the picture that proves something else.
 *
 * The row carries no address and no plan: an unreadable credential cannot say
 * whose account it is, and a fixture that gave it one would be drawing the
 * yellow state in red.
 */
const brokenData = () => {
    const d = data();
    d.accounts = d.accounts.concat([{
        id: 'broken', engine: 'claude', label: 'broken@gmail',
        email: '', plan: '', health: 'unreadable', active: false,
        percent: -1, resetsAt: 0,
        usageState: 'no-auth',
        note: 'The credentials file is there and nothing could be made of it.',
        window: 'five-hour window',
        quotaSource: 'oauth-credentials', capturedAt: NOW - 9 * 24 * 3600 * 1000,
        fetchedAt: 0, queue: 'idle', queuePlace: 0,
        settingsGaps: [], settingsGuarantee: true,
        completeness: contract('claude'),
        dir: 'C:/Users/mv/AppData/agent-farm/accounts/broken'
    }]);
    return d;
};

/**
 * ‼️ X-269 — THE SLOT THAT WOULD RUN ON THE SIMPLIFIED SYSTEM PROMPT, which is
 * the state this whole item exists for and the one no surface could draw for
 * the months it was true of EVERY account on the machine.
 *
 * Its own variant for the same reason as the red verdict above: the scene's
 * badges are pinned on purpose, and the fault is not made visible by spoiling
 * the picture that proves the ordinary case. Here it is one row of three, which
 * is what the reader actually gets — a fleet where every card is wrong is the
 * easy picture to draw and the one that hides how the odd card reads.
 */
const promptDriftData = () => {
    const d = data();
    d.accounts = d.accounts.map(a => a.id === 'personal'
        ? { ...a, settingsGaps: ['CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT'], settingsGuarantee: true }
        : a);
    return d;
};

/**
 * ‼️ X-284 — A SLOT THAT IS NOT WHOLE, and the SMALLEST arity of the page.
 *
 * Two scenes, for two different reasons. The incomplete one draws the state the
 * badge exists for: an identity that is there, a behaviour file that is not, and
 * a pool link standing as a real folder — three clauses of eight, which is what
 * makes the count worth reading. The single-account one is the arity rule (a
 * card row whose controls wrap differently when it is alone was shipped twice
 * before anybody drew it): one Claude slot, no Codex rows, nothing to compare
 * against, and the badge still has to sit where it sits.
 */
const incompleteData = () => {
    const d = data();
    d.accounts = d.accounts.map(a => a.id === 'personal'
        ? {
            ...a,
            settingsGaps: ['CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT'], settingsGuarantee: true,
            completeness: contract('claude', {
                'carry:settings.json': 'settings.json missing — the fleet\'s .claude/settings.json exists and was not reproduced',
                'env:CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT': 'settings.json does not carry CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT=0',
                'link:projects': 'projects is a real folder inside the slot — a record living under an account'
            })
        }
        : a);
    return d;
};
const oneSlotData = () => {
    const d = data();
    d.accounts = d.accounts.filter(a => a.id === 'work-1');
    return d;
};

module.exports = {
    script: 'engines.js',
    data,
    brokenData,
    variants: () => [
        { id: 'enginespanel', label: 'Engines panel', data: data() },
        { id: 'enginesbroken', label: 'Engines panel — all three verdicts', data: brokenData() },
        { id: 'enginesprompt', label: 'Engines panel — one slot on the simplified prompt', data: promptDriftData() },
        { id: 'enginesincomplete', label: 'Engines panel — a slot missing three clauses of its contract', data: incompleteData() },
        { id: 'enginesoneslot', label: 'Engines panel — a single captured account', data: oneSlotData() }
    ]
};
