/**
 * X-173 — the Secrets page, so the toolbar can be LOOKED at.
 *
 * ‼️ THE VARIANT THAT MATTERS IS THE EMPTY ONE. `+ Add secret` moved out of the
 * header's action slot — where it sat in the same row as twelve global
 * navigation buttons — and down beside the filter, which is the row that is
 * already about the list underneath. On a page with no secrets yet that button
 * is the only thing to do, and the empty state points straight at it, so a
 * picture of that state answers the whole item: is it findable, is it on the
 * row it belongs to, and does the row still read as one thing.
 */
const NOW = Date.parse('2026-09-04T09:00:00Z');

const agents = [
    { id: 'a1', name: 'developer' },
    { id: 'a2', name: 'asistan' },
    { id: 'a3', name: 'basit' }
];

const base = (secrets) => ({
    secrets,
    agents,
    agentCount: agents.length
});

const FULL = [
    {
        name: 'ANTHROPIC_API_KEY', description: 'Per-token route, used only when a plan is not the answer.',
        allAgents: true, agents: [], updatedAt: NOW - 3 * 86400e3
    },
    {
        name: 'REPLICATE_API_TOKEN', description: 'The media pipeline’s own key.',
        allAgents: false, agents: [{ id: 'a1', name: 'developer' }], updatedAt: NOW - 36 * 3600e3
    },
    {
        name: 'TELEGRAM_BOT_TOKEN', description: '',
        allAgents: false, agents: [{ id: 'a2', name: 'asistan' }], updatedAt: NOW - 20 * 60e3
    },
    {
        name: 'TYPESAFE_API_KEY', description: 'Gatekeeper decision gate — Agent Farm reads it itself.',
        allAgents: false, farmOnly: true, agents: [], updatedAt: NOW - 5 * 60e3
    }
];

const data = () => base(FULL);

const variants = () => ([
    { id: 'secrets', label: 'Secrets — four stored, one farm only', data: base(FULL) },
    {
        id: 'secrets-farm-form',
        label: 'Secrets — menu: edit card of a farm-only key (agent ticks hidden)',
        data: base(FULL),
        act: r => { r.query('[data-edit="TYPESAFE_API_KEY"]').slice(0, 1).forEach(b => b.fire('click')); }
    },
    {
        id: 'secrets-agent-form',
        label: 'Secrets — menu: edit card of an agent-scoped key (farm only off, agents shown)',
        data: base(FULL),
        act: r => { r.query('[data-edit="REPLICATE_API_TOKEN"]').slice(0, 1).forEach(b => b.fire('click')); }
    },
    {
        id: 'secrets-empty',
        label: 'Secrets — ‼️ nothing stored yet, where the one gesture has to be findable',
        data: base([])
    }
]);

module.exports = { script: 'secrets.js', data, variants };
