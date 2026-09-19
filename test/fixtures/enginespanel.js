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

/**
 * ‼️ X-258 — THE ROTATION LINE, ASKED OF THE PRODUCT. `accountOrder` is the
 * line `pickAccount` takes its answer off, so a scene that wrote `place` by hand
 * would be photographing a claim the host never makes — and the whole item is
 * that the page must DRAW the rotation rather than describe it.
 */
const { accountOrder, ACCOUNT_WALL_CEILING } = require('../../out/core/accountUsage.js');
const withLine = list => list.map(a => {
    const pool = list.filter(x => x.engine === a.engine).map(x => ({
        slotId: x.id, engine: x.engine, state: x.usageState, percent: x.percent,
        resetsAt: x.resetsAt, plan: x.plan, fetchedAt: x.fetchedAt
    }));
    const order = accountOrder(pool, { ceiling: ACCOUNT_WALL_CEILING, engine: a.engine });
    const at = order.findIndex(x => x.slotId === a.id);
    return { ...a, line: at < 0 ? null : { place: at + 1, of: order.length } };
});

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
const detailFor = (c, engine) => {
    const name = c.id.slice(c.id.indexOf(':') + 1);
    if (c.kind === 'own' || c.kind === 'carry') { return name + ' present'; }
    if (c.kind === 'env') { return name + '=0 in settings.json'; }
    if (c.kind === 'link') { return name + ' \u2192 pool'; }
    // X-295 \u2014 the wire is read in the engine's own words
    return engine === 'codex' ? '7 hooks trusted for this directory, wire on :8377' : 'hooks current on :8377';
};
/** `gaps` maps a clause id to the sentence the card must draw for it. */
const contract = (engine, gaps, repairs, promotions) => {
    const bad = gaps || {};
    const rows = slotClauses(adapterFor(engine)).map(c => ({
        id: c.id, ok: !bad[c.id], repairable: !!c.repair,
        detail: bad[c.id] || detailFor(c, engine)
    }));
    return {
        complete: rows.every(r => r.ok), gaps: rows.filter(r => !r.ok).map(r => r.id), rows,
        // ‼️ X-292 — the badge's whole point is that it appears on a slot the
        // row beside it calls COMPLETE, so the default here is an empty history
        // and the scene that carries one is a slot with nothing else wrong.
        repairs: repairs || [],
        // ‼️ X-291 — and the same rule for the return leg: the promote badge
        // belongs on a slot that is COMPLETE, because it says something the
        // contract badge beside it cannot. Default empty — most rows have never
        // taught the fleet anything, and that silence is the common layout.
        promotions: promotions || []
    };
};

/**
 * ‼️ X-305 — THE RULES, ASKED OF THE PRODUCT. What `@emptiest` comes to on
 * these five slots is `resolvePolicy`'s answer against their own figures, the
 * same function the host's `policyRowsFor` runs — a scene that typed "→
 * work@studio" by hand would be photographing a claim the rule never made, and
 * the section exists to draw what the rule DECIDES. Only the user's rules
 * (`rules`) are the scene's own, because those are the objects the form makes.
 */
const { BUILT_IN_POLICIES, POLICY_DEFAULT_CEILING, resolvePolicy } = require('../../out/core/accountPolicy.js');
const policiesFor = (accounts, rules) => {
    const engines = [...new Set(accounts.map(a => a.engine))];
    const usage = accounts.map(a => ({
        slotId: a.id, engine: a.engine, state: a.usageState, percent: a.percent,
        resetsAt: a.resetsAt, plan: a.plan, fetchedAt: a.fetchedAt, window: a.window
    }));
    const labelOf = id => (accounts.find(a => a.id === id) || {}).label || id;
    const nowFor = (id, only) => (only ? [only] : engines).map(engine => {
        const active = accounts.find(a => a.engine === engine && a.active);
        const r = resolvePolicy(id, {
            engine, usage, standing: active ? active.id : '', standingOrigin: active ? 'machine' : '',
            policies: rules, stored: accounts.filter(a => a.engine === engine).map(a => a.id),
            labelOf, now: NOW
        });
        return {
            engine, picks: r.refusal ? '' : (r.id ? labelOf(r.id) : 'Main account'),
            note: r.note || '', refusal: r.refusal || ''
        };
    });
    return {
        engines: engines.length ? engines : ['claude'],
        builtIn: BUILT_IN_POLICIES.map(p => ({ ...p, now: nowFor(p.id) })),
        rules: rules.map(p => ({ ...p, now: nowFor('@' + p.name, p.engine) })),
        ceiling: POLICY_DEFAULT_CEILING
    };
};
/** Four rules of the user's, the shapes the form has to draw: a chain of a
 *  rule and two slots with a model filter; a one-step pinned rule with its
 *  own wall that is walled RIGHT NOW (the yellow chip); a rule stepping
 *  through another rule — the one Delete must refuse for; and (X-324) an
 *  EMPTIEST rule over three listed slots, which picks the LAST listed
 *  (personal, 12%) — the picture a chain could never draw. */
const RULES = [
    {
        name: 'Gece_Nobeti', note: 'the overnight sentry — spare first, never below 60%', ceiling: 60,
        chain: [{ account: 'spare' }, { policy: '@emptiest' }, { account: 'work-1', models: ['haiku', 'sonnet'] }]
    },
    { name: 'Agir_Isler', engine: 'claude', ceiling: 40, chain: [{ account: 'work-1', ceiling: 40 }] },
    { name: 'Varsayilan', note: 'the night rule, else round-robin', chain: [{ policy: '@Gece_Nobeti' }, { policy: '@round-robin' }] },
    {
        name: 'Ucu_Birden', note: 'whichever of these three has the most room', engine: 'claude', strategy: 'emptiest',
        chain: [{ account: 'work-1' }, { account: 'spare' }, { account: 'personal' }]
    }
];

const data = () => {
    const engines = base.engines();
    // The panel's own payload adds the verdicts and the clock they are read
    // against — the AGE is part of the claim.
    const d = {
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
        accounts: withLine([
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
                // ‼️ X-275 — the grant's own clock. The ORDINARY value here, so
                // the everyday picture stays the everyday picture: weeks left,
                // nothing said. The warning has its own scene below.
                signin: {
                    state: 'ready', refreshExpiresAt: NOW + 23 * 24 * 3600 * 1000,
                    hoursLeft: 23 * 24, liveIsSame: false, liveHealth: 'ready'
                },
                capturedAt: NOW - 6 * 24 * 3600 * 1000,
                // X-206 — the figure's own age, and the refresh line: this one
                // is being read right now, the next is waiting behind it.
                fetchedAt: NOW - 40 * 1000, queue: 'reading', queuePlace: 0,
                settingsGaps: [], settingsGuarantee: true,
                // ‼️ X-255 — THE MACHINE'S STANDING ACCOUNT, AND NOBODY STANDS ON IT.
                // The pair that has to be read together: this card wears the chip
                // and no pin, the one below wears a pin and no chip, and both say
                // two agents name a sign-in of their own — so the ⚡ button's panel
                // can be checked for the sentence saying it will not move them.
                standingAgents: [], pinnedAgents: 2,
                // ‼️ X-258 — A SEAT ON IT. The arity that has to be read beside the
                // two below: one hosted seat, one card with only processes this window
                // can SEE, and one with nobody — three different sentences.
                onIt: { seats: [{ seat: 'cs1', who: 'developer', sessionId: 'a132b63f' }], others: 0 },
                // ‼️ X-291 — THE SMALLEST NON-EMPTY LAYOUT, which is the one the
                // user really gets: a single approval typed at a terminal prompt
                // in one folder. A scene with only the many-row case would draw
                // the one arity whose panel reads well by accident.
                completeness: contract('claude', undefined, undefined, [{
                    file: '.claude.json', path: 'projects[D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm].allowedTools',
                    added: 1, slots: ['work-1'], last: NOW - 12 * 60 * 1000
                }]),
                // ‼️ X-252 — A BUSY DAY, fully priced. The arity beside the four
                // below: nothing at all (personal), absent altogether (spare),
                // every run unpriced plus one that crossed midnight (codex-work)
                // and a mixed day (codex-spare). The line's wording differs in
                // every one of them, and the smallest is the one the user
                // usually gets.
                // X-112 — two of the seven went through Kimi: sealed on this
                // sign-in, but their ⚖ never touched its window and Claude's
                // dollar figure for them is not Kimi's bill. The panel says so.
                spentToday: { cost: 4.312, wTokens: 1842000, sessions: 7, unpriced: 0, unsplit: 0, offPlan: 2 },
                dir: 'C:/Users/mv/AppData/agent-farm/accounts/work-1'
            },
            {
                id: 'personal', engine: 'claude', label: 'personal@gmail',
                email: 'personal@gmail.com', plan: 'pro', health: 'ready', active: false,
                uuidShort: 'dce63e3f', duplicateOf: ['spare'],
                percent: 12, resetsAt: NOW + 4 * 60 * 60 * 1000,
                usageState: 'ok', note: '', window: 'five-hour window',
                quotaSource: 'oauth-credentials',
                signin: {
                    state: 'ready', refreshExpiresAt: NOW + 18 * 24 * 3600 * 1000,
                    hoursLeft: 18 * 24, liveIsSame: false, liveHealth: 'ready'
                },
                capturedAt: NOW - 2 * 3600 * 1000,
                fetchedAt: NOW - 3 * 3600 * 1000, queue: 'queued', queuePlace: 1,
                settingsGaps: [], settingsGuarantee: true,
                // ‼️ X-255 — TWO AGENTS STAND HERE, which is the arity where the
                // label has to clip; the single-name case reads differently and the
                // panel's wording differs between them.
                standingAgents: ['developer', 'youtuber'], pinnedAgents: 2,
                // ‼️ X-258 — THE HONEST-LIMIT ARITY: the engine's own registry says
                // two processes are alive on this sign-in and this window hosts none of
                // them. The card may say the count and must not invent what they are.
                onIt: { seats: [], others: 2 },
                // ‼️ X-292 — A SLOT THAT IS WHOLE AND KEEPS BEING PUT BACK, which
                // is the only state the repair badge exists for: `link:todos` is
                // `ok` on the row above and has been re-made four times, every
                // repeat behind a housekeeping run of the engine's own. A scene
                // where the clause were also MISSING would prove nothing — the
                // contract badge would already be shouting.
                completeness: contract('claude', undefined, [
                    {
                        clause: 'link:todos', count: 4, slots: ['personal'],
                        first: NOW - 3 * 24 * 3600 * 1000, last: NOW - 40 * 60 * 1000,
                        compared: 3, afterHousekeeping: 3
                    },
                    {
                        clause: 'link:shell-snapshots', count: 3, slots: ['personal'],
                        first: NOW - 3 * 24 * 3600 * 1000, last: NOW - 40 * 60 * 1000,
                        compared: 2, afterHousekeeping: 1
                    }
                // ‼️ X-291 — …AND THE ROW THAT CARRIES BOTH BADGES AT ONCE, with
                // the wide arity: three paths, one of them a long Windows path and
                // one of them in the OTHER file. This is where the badge row runs
                // out of width if it is going to, and where the panel has to wrap.
                ], [
                    {
                        file: '.claude.json', path: 'projects[D:\\zone\\know\\note\\obsidian].allowedTools',
                        added: 4, slots: ['personal'], last: NOW - 90 * 60 * 1000
                    },
                    {
                        file: '.claude.json', path: 'projects[D:\\zone\\dev\\git\\miropharm\\muvu_talkScribe].allowedTools',
                        added: 2, slots: ['personal'], last: NOW - 3 * 3600 * 1000
                    },
                    {
                        file: 'settings.json', path: 'permissions.allow',
                        added: 1, slots: ['personal'], last: NOW - 26 * 3600 * 1000
                    }
                ]),
                // ‼️ X-252 — THE SMALLEST ARITY, and the one a reader meets most:
                // nothing ran on this sign-in today. It must not read as a day
                // that cost nothing, nor as a figure that failed to arrive.
                spentToday: { cost: 0, wTokens: 0, sessions: 0, unpriced: 0, unsplit: 0 },
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
                // ‼️ X-252 — AND ONE ROW CARRYING NO spentToday AT ALL, on
                // purpose: the field is optional, so a card that threw or drew
                // NaN without it would be the defect rather than the fixture.
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
                // ‼️ X-252 — EVERY RUN ON AN ENGINE THAT STATES NO PRICE, plus
                // one that crossed midnight. Neither may be drawn as a zero: the
                // row drops the money figure and the panel counts both refusals.
                spentToday: { cost: 0, wTokens: 52000, sessions: 2, unpriced: 2, unsplit: 1 },
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
                // ‼️ X-252 — THE MIXED DAY, which is the arity where the money
                // figure is real AND incomplete: three runs, one of them on an
                // engine that published no price for it.
                spentToday: { cost: 0.412, wTokens: 90000, sessions: 3, unpriced: 1, unsplit: 0 },
                dir: 'C:/Users/mv/AppData/agent-farm/accounts/codex-spare'
            }
        ]),
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
    // ‼️ X-305 — the SMALLEST arity is the default scene: no rule of the
    // user's own, only the built-in four. The scenes with rules are below.
    // X-114 — the free verdict for the two routes above.
    d.providerHealth = baseHealth(NOW);
    d.providerTesting = [];
    d.policies = policiesFor(d.accounts, []);
    // X-241 — the switch and each slot's own beat: work@studio has a turn
    // running (the 60 s beat), the rest are idle (the 5 min one).
    d.autoRefresh = {
        on: true,
        beat: d.accounts.map(a => ({ slotId: a.id, ms: a.id === 'work-1' ? 60_000 : 300_000, active: a.id === 'work-1' }))
    };
    return d;
};
/** X-241 — the switch OFF: grey button, the panel saying what still works. */
const autoOffData = () => {
    const d = data();
    d.autoRefresh = { on: false, beat: d.autoRefresh.beat.map(b => ({ ...b, ms: 0, active: false })) };
    return d;
};

/**
 * ‼️ X-305 — ONE RULE, THEN MANY, THEN THE FORM. One and many are two pictures
 * (a card row alone wraps differently from one in a stack), and the form is a
 * third: it exists only after a press, so the scene PRESSES Edit on the first
 * rule the way a reader would — the step list, the nested step editor and the
 * chips all have to lay out together, and nothing before this scene drew them.
 */
const oneRuleData = () => {
    const d = data();
    d.policies = policiesFor(d.accounts, RULES.slice(0, 1));
    return d;
};
const rulesData = () => {
    const d = data();
    d.policies = policiesFor(d.accounts, RULES);
    return d;
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

/**
 * ‼️ X-275 — THE TWO STATES `health` COULD NOT EXPRESS, drawn beside a row that
 * is simply fine so the difference is the picture rather than the caption.
 *
 * One slot is still working and stops in three days — the 🟡 badge keeps the
 * OK colour on purpose (it does work), and the days are what makes it not the
 * same fact as the amber one. The other is dead while the machine's own sign-in
 * is THIS SAME account: the exact state the user hit, where signing in again
 * changed nothing visible and the row gave no reason. Both carry the panel that
 * says why, and only these two do — a scene where every card warned would hide
 * how the odd card reads.
 */
const signinData = () => {
    const d = data();
    d.accounts = d.accounts.map(a => {
        if (a.id === 'personal') {
            return {
                ...a, health: 'ready',
                signin: {
                    state: 'expiring', refreshExpiresAt: NOW + 3 * 24 * 3600 * 1000,
                    hoursLeft: 72, liveIsSame: true, liveHealth: 'ready'
                }
            };
        }
        if (a.id === 'spare') {
            return {
                ...a, health: 'needs-signin', percent: -1, usageState: 'no-auth',
                signin: {
                    state: 'needs-signin', refreshExpiresAt: NOW - 2 * 24 * 3600 * 1000,
                    hoursLeft: -48, liveIsSame: true, liveHealth: 'ready'
                }
            };
        }
        return a;
    });
    return d;
};

/**
 * X-114 — ‼️ THE TWO ROWS THE BASE SCENE NEEDS, and no more: one route that can
 * run and one that cannot, which is the same pair the profiles above draw. The
 * states that only appear after something has happened — a pass, a failure, a
 * refusal, a verdict about a configuration that has since changed — are their
 * own scene below, because a base scene carrying all of them would be the
 * "every card warns" montage that hides the ordinary case.
 */
function baseHealth(NOW) {
    return [
        {
            engine: 'claude',
            axis: 'provider',
            source: 'agent-farm-profile',
            cli: { present: true, version: '2.1.0' },
            problems: [],
            notes: [],
            rows: [
                {
                    engine: 'claude', providerId: 'kimi', label: 'Kimi (Moonshot)',
                    configured: true, configuredBy: 'a route Agent Farm holds',
                    available: 'yes', problems: [], notes: [],
                    models: 2, modelRefs: ['kimi-k2-thinking', 'kimi-k2']
                },
                {
                    engine: 'claude', providerId: 'minimax', label: 'MiniMax',
                    configured: true, configuredBy: 'a route Agent Farm holds',
                    available: 'no',
                    problems: ['"MiniMax" has no stored key, so a run on it would reach '
                        + 'https://api.minimax.io/anthropic unauthenticated.'],
                    notes: [],
                    models: 0, modelRefs: []
                }
            ]
        }
    ];
}

/**
 * ‼️ EVERY STATE THAT ONLY EXISTS AFTER SOMETHING HAPPENED, in one place,
 * because each of them was a reading the first draft of these chips collapsed
 * into a red cross: a pass, a failure with the engine's own words, a check that
 * never ran at all, a verdict about a route that has since been edited, and a
 * provider nobody has read a catalog for. Plus the two notes that are NOT
 * faults — an empty credentials file on an engine that owns its own, and a
 * variant a hosted card cannot carry.
 */
function healthData() {
    const d = data();
    const NOW = d.now;
    const key = (over) => ({
        engine: 'claude', providerId: 'kimi', modelId: 'kimi-k2-thinking',
        adapter: 'claude-route@1', cli: '2.1.0', revision: 3, ...over
    });
    d.providerHealth = [
        {
            engine: 'claude',
            axis: 'provider',
            source: 'agent-farm-profile',
            cli: { present: true, version: '2.1.0' },
            // ‼️ THE THIRD ANSWER TO THE ROUTE QUESTION, and the one nothing
            // could reach before: clearing the inherited environment does not
            // touch a name the CLI reads out of its own settings file.
            problems: ['ANTHROPIC_BASE_URL is set in the CLI\'s own settings.json env block, which a '
                + 'spawn cannot clear — the route chosen here is answered a second time from inside '
                + 'the process'],
            notes: ['ANTHROPIC_API_KEY is present in the inherited environment; a launch on a route '
                + 'clears them by name (X-101), so this is only a route for a run started with no '
                + 'route at all'],
            rows: [
                {
                    engine: 'claude', providerId: 'kimi', label: 'Kimi (Moonshot)',
                    configured: true, configuredBy: 'a route Agent Farm holds',
                    available: 'yes', problems: [], notes: [],
                    models: 2, modelRefs: ['kimi-k2-thinking', 'kimi-k2'],
                    tested: {
                        key: key(), ok: true, at: NOW - 3 * 60 * 1000, ms: 2900,
                        detail: 'Answered in 2.9s on kimi-k2-thinking — this route, this model and '
                            + 'this CLI all work.'
                    }
                },
                {
                    engine: 'claude', providerId: 'minimax', label: 'MiniMax',
                    configured: true, configuredBy: 'a route Agent Farm holds',
                    available: 'yes',
                    problems: [],
                    notes: ['this route names no endpoint of its own, so it is the engine\'s '
                        + 'first-party one and its sign-in lives in the credentials file rather than here'],
                    models: 1, modelRefs: ['MiniMax-M2'],
                    tested: {
                        key: key({ providerId: 'minimax', modelId: 'MiniMax-M2', revision: 1 }),
                        ok: false, at: NOW - 22 * 60 * 1000, ms: 8100,
                        detail: 'The command exited 1.',
                        error: 'invalid_api_key: the key stored for this route was rejected'
                    }
                },
                {
                    engine: 'claude', providerId: 'anthropic', label: 'Anthropic (first-party)',
                    configured: true, configuredBy: 'a route Agent Farm holds',
                    available: 'no',
                    problems: ['the "sonnet" tier maps to no model, so a run picking it would ask '
                        + 'for a model with no name'],
                    notes: [],
                    models: 1, modelRefs: ['claude-opus-5'],
                    // ‼️ A verdict that is not about this configuration any
                    // more. Dropping it would say "never tested" about a route
                    // tested twenty minutes ago; showing it as current would
                    // claim a pass for an endpoint that has since changed.
                    testedSuperseded: {
                        key: key({ providerId: 'anthropic', modelId: 'claude-opus-5', revision: 2 }),
                        ok: true, at: NOW - 20 * 60 * 1000, ms: 2100, detail: 'Answered in 2.1s.'
                    },
                    testedSupersededWhy: 'the route has been edited since (revision 2 → 3)'
                }
            ]
        },
        {
            engine: 'opencode',
            axis: 'provider',
            source: 'engine-reported',
            cli: { present: true, version: '1.18.19' },
            problems: [],
            // ‼️ MEASURED, AND NOT A FAULT: with a completely empty auth.json
            // the CLI still lists and runs its own connected provider.
            notes: ['~/.local/share/opencode/auth.json holds no credential, and on this engine that '
                + 'is not a fault: its own connected provider lists and runs models with an empty '
                + 'credentials file (measured) — a provider the catalog offers is available whether '
                + 'or not one is stored'],
            rows: [
                {
                    engine: 'opencode', providerId: 'opencode', label: 'opencode',
                    configured: true, configuredBy: 'the engine\'s own catalog',
                    available: 'yes', problems: [],
                    notes: [
                        'no credential is stored for this engine, and it is offering this provider anyway',
                        'this provider publishes 2 reasoning variants (thinking, standard); a headless '
                            + 'run can pick one, while a hosted card cannot — ACP declares only model '
                            + 'and mode, and the interactive TUI takes no --variant flag'
                    ],
                    models: 7,
                    modelRefs: ['opencode/big-pickle', 'opencode/ling-3.0-flash-fin-free',
                        'opencode/muse-spark-1.3-contributor-free'],
                    tested: {
                        key: { engine: 'opencode', providerId: 'opencode',
                            modelId: 'opencode/big-pickle', adapter: 'opencode@1', cli: '1.18.19' },
                        ok: false, refused: 'a turn would fail for a reason already known',
                        at: NOW - 6 * 60 * 1000, ms: 0,
                        detail: 'No free model is on offer from the providers connected here.'
                    }
                },
                {
                    engine: 'opencode', providerId: 'anthropic', label: 'anthropic',
                    configured: true, configuredBy: 'the engine\'s own catalog',
                    // ‼️ UNKNOWN IS AN ANSWER. Nothing is wrong here and nothing
                    // was read; drawing it amber would send somebody looking for
                    // a fault that does not exist.
                    available: 'unknown', problems: [], notes: [],
                    models: 0, modelRefs: []
                }
            ]
        }
    ];
    // one row with a turn in the air, so the disabled state is drawn too
    d.providerTesting = ['claude/minimax'];
    return d;
}

module.exports = {
    script: 'engines.js',
    data,
    brokenData,
    variants: () => [
        { id: 'enginespanel', label: 'Engines panel', data: data() },
        {
            id: 'engineshealth',
            label: 'Engines panel — route health: a pass, a failure, a superseded verdict, an unknown row and the two notes that are not faults',
            data: healthData()
        },
        { id: 'enginesbroken', label: 'Engines panel — all three verdicts', data: brokenData() },
        { id: 'enginesprompt', label: 'Engines panel — one slot on the simplified prompt', data: promptDriftData() },
        { id: 'enginesincomplete', label: 'Engines panel — a slot missing three clauses of its contract', data: incompleteData() },
        { id: 'enginesoneslot', label: 'Engines panel — a single captured account', data: oneSlotData() },
        { id: 'enginessignin', label: 'Engines panel — a sign-in running out, and one dead while the machine is signed in as it', data: signinData() },
        { id: 'enginesautooff', label: 'Engines panel — the background quota beat switched OFF (X-241)', data: autoOffData() },
        { id: 'enginesonerule', label: 'Engines panel — one account rule of the user\'s own', data: oneRuleData() },
        { id: 'enginesrules', label: 'Engines panel — four rules: a chain, a walled one, one stepping through another, an emptiest one over three slots', data: rulesData() },
        {
            id: 'enginesruleform', label: 'Engines panel — the rule form open on @Gece_Nobeti, a step open in the nested editor',
            data: rulesData(),
            act: (r) => {
                r.query('[data-poledit="Gece_Nobeti"]')[0].click();
                r.query('[data-afl="edit"]')[2].click();
            }
        },
        {
            id: 'enginesruleemptiest', label: 'Engines panel — the form open on the emptiest rule @Ucu_Birden, the switch free (X-324)',
            data: rulesData(),
            act: (r) => { r.query('[data-poledit="Ucu_Birden"]')[0].click(); }
        },
        {
            id: 'enginesrulelocked', label: 'Engines panel — @Ucu_Birden after a rule step was kept: the switch LOCKED on chain (X-324)',
            data: rulesData(),
            act: (r) => {
                r.query('[data-poledit="Ucu_Birden"]')[0].click();
                r.query('[data-afact="step-new"]')[0].click();
                r.query('[data-afact="step-keep"]')[0].click();
            }
        }
    ]
};
