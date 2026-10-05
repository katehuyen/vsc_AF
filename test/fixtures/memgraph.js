/**
 * The Memory Graph, with the shapes its parts really get: a hub several notes
 * point at, a broken [[target]], islands, a file missing from MEMORY.md, an
 * index repair plan of both kinds, a file shared by two agents that has drifted
 * apart, and a second agent so the agent picker has more than one button.
 */
'use strict';

const NOW = new Date('2026-10-06T09:00:00+07:00').getTime();
const DAY = 86400000;

const node = (name, o) => Object.assign({
    name, path: 'D:/zone/agent/ajanlar/developer/memory/' + name, tokens: 300,
    mtime: NOW - 3 * DAY, incoming: 0, outgoing: 0, recalls: 0, inIndex: true,
    type: 'feedback', description: ''
}, o);

function data() {
    const nodes = [
        node('user_profile.md', { tokens: 1400, incoming: 5, recalls: 22, type: 'user', description: 'who the user is and how they work' }),
        node('feedback_exact_scope.md', { incoming: 3, outgoing: 1, recalls: 9, description: 'only the asked thing; the gate is never skipped' }),
        node('feedback_status_plainly.md', { incoming: 2, outgoing: 1, recalls: 4 }),
        node('feedback_full_survey_first.md', { incoming: 1, outgoing: 2, recalls: 6 }),
        node('feedback_system_over_agents.md', { outgoing: 2, recalls: 3 }),
        node('project_local_airtable.md', { tokens: 900, outgoing: 1, type: 'project', recalls: 2 }),
        node('reference_workarea.md', { tokens: 200, type: 'reference', recalls: 11 }),
        node('feedback_no_fal_spend.md', { tokens: 150, mtime: NOW - 80 * DAY }),
        node('feedback_shell_ascii_only.md', { tokens: 260, inIndex: false, recalls: 1 }),
        node('project_old_plan.md', { tokens: 2100, mtime: NOW - 120 * DAY, inIndex: false, type: 'project' })
    ];
    const links = [
        { from: 'feedback_exact_scope.md', to: 'user_profile.md' },
        { from: 'feedback_status_plainly.md', to: 'user_profile.md' },
        { from: 'feedback_full_survey_first.md', to: 'feedback_exact_scope.md' },
        { from: 'feedback_full_survey_first.md', to: 'user_profile.md' },
        { from: 'feedback_system_over_agents.md', to: 'feedback_exact_scope.md' },
        { from: 'feedback_system_over_agents.md', to: 'feedback_status_plainly.md' },
        { from: 'project_local_airtable.md', to: 'user_profile.md' },
        { from: 'feedback_status_plainly.md', to: 'feedback_exact_scope.md' },
        { from: 'feedback_exact_scope.md', to: 'user_profile.md' },
        { from: 'project_local_airtable.md', to: 'airtable_media_rules', broken: true }
    ];
    const files = nodes.map(n => ({
        name: n.name, path: n.path, tokens: n.tokens, mtime: n.mtime,
        staleDays: Math.floor((NOW - n.mtime) / DAY), stale: NOW - n.mtime > 45 * DAY
    }));
    return {
        generatedAt: NOW,
        selectAgentId: 'developer',
        agents: [
            {
                id: 'developer', name: 'developer',
                graph: { nodes, links },
                fixes: [
                    { kind: 'add', target: 'feedback_shell_ascii_only.md', line: '- [Shell ASCII only](feedback_shell_ascii_only.md) — Bash lines pure ASCII' },
                    { kind: 'add', target: 'project_old_plan.md', line: '- [Old plan](project_old_plan.md) — the first plan' },
                    { kind: 'remove', target: 'feedback_gone.md', line: '- [Gone](feedback_gone.md) — removed long ago' }
                ],
                files
            },
            {
                id: 'manager', name: 'manager',
                graph: { nodes: [node('user_profile.md', { path: 'D:/zone/agent/ajanlar/manager/memory/user_profile.md', recalls: 4 })], links: [] },
                fixes: [],
                files: []
            }
        ],
        allAgents: [{ id: 'developer', name: 'developer' }, { id: 'manager', name: 'manager' }, { id: 'psikolog', name: 'psikolog' }],
        memoryTypes: ['project', 'feedback', 'user', 'reference'],
        duplicates: [{
            name: 'user_profile.md', identical: false,
            copies: [
                { agentId: 'developer', agentName: 'developer', path: 'D:/zone/agent/ajanlar/developer/memory/user_profile.md', mtime: NOW - DAY, size: 5734 },
                { agentId: 'manager', agentName: 'manager', path: 'D:/zone/agent/ajanlar/manager/memory/user_profile.md', mtime: NOW - 9 * DAY, size: 4210 }
            ]
        }],
        embeddingsOn: true,
        canDistill: true
    };
}

module.exports = {
    script: 'memgraph.js',
    data,
    variants: () => [{ id: 'memgraph', label: 'Memory Graph', data: data() }]
};
