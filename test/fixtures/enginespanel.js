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

module.exports = {
    script: 'engines.js',
    data,
    variants: () => [{ id: 'enginespanel', label: 'Engines panel', data: data() }]
};
