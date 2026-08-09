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
