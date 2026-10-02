/**
 * S-80 — Settings ▸ Handover Discipline, in the two states that decide whether
 * the section works:
 *
 *   1. SHIPPED — nothing has been retuned. Every threshold is the law's own
 *      figure and `disciplineOrders` is EMPTY, which is the arity the reader
 *      actually gets first and the one a form is most likely to get wrong: six
 *      boxes with nothing in them, each having to say — in its placeholder —
 *      the built-in sentence that stays in charge while it is empty.
 *   2. RETUNED — the user has moved the quota pair and rewritten one branch.
 *      A filled long-text box is a different layout from an empty one (it
 *      wraps, it pushes the row's description under it) and `modified` marks
 *      change, so it is its own scene rather than a claim about the first.
 *
 * ‼️ THE ROWS ARE DERIVED FROM THE MANIFEST, NEVER TYPED (audit B-05). The
 * whole point of the section is what `shapeOf` makes of `disciplineOrders` —
 * a form of six declared fields — so a hand-written row could photograph a
 * control the product does not have.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const S = require(path.join(ROOT, 'out', 'core', 'settingsops.js'));
const STAY = require(path.join(ROOT, 'out', 'core', 'stayAccount.js'));
const WALL = require(path.join(ROOT, 'out', 'core', 'startRoom.js'));
const PROPS = require(path.join(ROOT, 'package.json')).contributes.configuration.properties;

const KEYS = [
    'agentFarm.contextConvergePct',
    'agentFarm.contextHandoverPct',
    'agentFarm.quotaConvergePct',
    'agentFarm.quotaHandoverPct',
    'agentFarm.disciplineOrders',
    'agentFarm.batonMaxHops',
    'agentFarm.batonInjectedDirective',
    'agentFarm.batonHandoverTemplate',
    'agentFarm.batonEmergencyTemplate',
    'agentFarm.defaultAccountCeiling',
    'agentFarm.contextHandoverStayAccountPct'
];

const categories = (values) => {
    const props = {};
    for (const k of KEYS) { props[k] = PROPS[k]; }
    const valueOf = (k) => (k in values ? values[k] : props[k].default);
    // X-470 — the row note the host writes, from the same core functions it calls
    const inForceOf = (k) => (k === 'agentFarm.contextHandoverStayAccountPct'
        ? STAY.stayInForceNote(valueOf(k), WALL.startWall({ setting: valueOf('agentFarm.defaultAccountCeiling'), handoverPct: valueOf('agentFarm.quotaHandoverPct') }))
        : undefined);
    return S.buildSettingsModel(props, valueOf, { inForceOf });
};

const base = (values) => ({
    focus: '', profiles: [], prompts: null, docOpen: null, folders: null,
    claude: null, engines: null, engineModels: null, wiki: null, superpowers: null,
    alerts: null, telegram: null,
    modelAliases: ['haiku', 'sonnet', 'opus', 'fable'],
    categories: categories(values),
    pathVars: [],
    pathPreview: {},
    valueSources: { agent: [] }
});

const data = () => base({});

const variants = () => ([
    {
        id: 'disciplinesettings',
        label: 'Settings ▸ Handover Discipline — as shipped: the law\'s figures, and six EMPTY order boxes '
            + 'whose placeholders carry the built-in sentence',
        data: base({})
    },
    {
        id: 'disciplinesettings-tuned',
        label: 'Settings ▸ Handover Discipline — ‼️ retuned: a quota converge line at 85, a handover line at 92, '
            + 'and one branch rewritten in the user\'s own words',
        data: base({
            'agentFarm.quotaConvergePct': 85,
            'agentFarm.quotaHandoverPct': 92,
            'agentFarm.disciplineOrders': {
                converge: 'Start nothing new. Finish the step in flight, commit it, and say in one line what is left '
                    + '— the next run reads that line first.',
                handover: 'Stop. Commit, write the handover note into 00_OUTPUT/01_CEVAPLAR, name its path in your '
                    + 'last message and end the run — do NOT try to finish the item (_REF/handover.md).'
            },
            // S-82 — the relay's own header and a standing rule, both text boxes
            'agentFarm.batonInjectedDirective': 'Run npm test before you pass the baton.',
            'agentFarm.batonHandoverTemplate': '=== RELAY {chain} · leg {hop}/{maxHops} ===\n'
                + 'You continue {agentId}\'s work after session {fromSessionId} ({why}).\n'
                + 'Rule: {userDirective}\n---\n{agentPrompt}',
            // S-83 — the header of a leg the failsafe opened
            'agentFarm.batonEmergencyTemplate': '=== RESCUE {chain} · leg {hop}/{maxHops} ===\n'
                + 'Session {fromSessionId} stopped without passing: {why}.\n---\n{evidence}'
        })
    },
    {
        id: 'disciplinesettings-staywall',
        label: 'Settings ▸ Handover Discipline — ‼️ X-470, the user\'s own settings on 2026-10-02: stay line 90 over an '
            + 'Account ceiling of 70 — the stay row says it acts at 70',
        data: base({ 'agentFarm.contextHandoverStayAccountPct': 90, 'agentFarm.defaultAccountCeiling': 70 })
    }
]);

module.exports = { script: 'settings.js', data, variants };
