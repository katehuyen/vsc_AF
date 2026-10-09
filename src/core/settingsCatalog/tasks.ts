import { CatalogSection } from './types';

export const tasks: CatalogSection = {
    id: 'tasks',
    label: 'Tasks & Queue',
    about: 'How many tasks run at once, how they are dispatched, judged and retried, and the work queue.',
    groups: [
        { id: 'concurrency', label: 'Concurrency', about: 'How many tasks run at once, and whether the queue moves on by itself.' },
        { id: 'running', label: 'Running and retry', about: 'Where a task runs, the arguments it is started with, and what happens when it fails.' },
        { id: 'dispatch', label: 'Dispatch', about: 'Which agent and which model a new piece of work goes to.' },
        { id: 'judge', label: 'Judge', about: 'How a finished task is judged, and which models are tried in turn.' },
        { id: 'workflows', label: 'Workflows', about: 'What a workflow step is handed, when it asks for help, and where its spending stops.' },
        {
            // answerDir is where an answer is WRITTEN, so it belongs to the work queue; A2A sits beside the user's queue (N-5)
            id: 'queue', label: 'Work queue',
            about: 'How the questions and requests you leave for agents are grouped, aged and answered.'
        }
    ],
    rows: {
        maxConcurrentTasks: {
            group: 'concurrency', tier: 'basic',
            label: 'Tasks at once',
            summary: 'How many tasks may run at the same time across the farm.'
        },
        maxConcurrentPerAgent: {
            group: 'concurrency', tier: 'basic',
            label: 'Tasks at once per agent',
            summary: 'How many tasks one agent may run at the same time.'
        },
        queueAutoAdvance: {
            group: 'concurrency', tier: 'basic',
            label: 'Start the next queued task',
            summary: 'When a task finishes, starts the same agent\'s next queued task.'
        },
        taskRetry: {
            group: 'running', tier: 'basic',
            label: 'Retry after a failure',
            summary: 'How often a failed unattended task is tried again, and how long it waits.',
            fieldOptions: {
                backoff: { same: 'Same wait', double: 'Doubling', linear: 'Growing evenly', formula: 'Formula' },
                when: { limit: 'Limit failures', any: 'Any failure' },
                behavior: { simple: 'Simple retry', smart: 'Smart', supervisor: 'Supervisor decides' },
                unknownProgressFallback: { park: 'Hold it', simple: 'Simple retry', stop: 'Stop', ask: 'Ask me' }
            }
        },
        // The integrated terminal is xterm.js, which garbles long TUI sessions; a task stays there because its status
        // is read from the terminal.
        externalTerminal: {
            group: 'running', tier: 'basic',
            label: 'Sessions in the OS terminal',
            summary: 'Opens Start, Continue and Resume terminals in the system terminal instead of VS Code.'
        },
        taskExtraArgs: {
            group: 'running',
            label: 'Extra task arguments',
            summary: 'Command-line arguments added to every task\'s claude command.'
        },
        evalRunArgs: {
            group: 'running',
            label: 'Eval replay arguments',
            summary: 'Command-line arguments for replaying an eval set.'
        },
        dispatchRules: {
            group: 'dispatch',
            label: 'Dispatch rules',
            summary: 'Which agent a dispatch trigger hands its work to; the first matching rule wins.',
            fields: { match: 'Text pattern', agent: 'Agent' }
        },
        dispatchClassifier: {
            group: 'dispatch',
            label: 'A model picks the agent',
            summary: 'When no dispatch rule matches, a cheap model picks the agent.'
        },
        modelPolicy: {
            group: 'dispatch',
            label: 'Model rules',
            summary: 'Which model a task the farm launches runs on; the first matching rule wins.',
            fields: { source: 'Launched by', agent: 'Agent pattern', promptMatch: 'Prompt pattern', model: 'Model' },
            fieldOptions: {
                source: { any: 'Any launch', trigger: 'Trigger', schedule: 'Schedule', workflow: 'Workflow', manual: 'By hand' }
            }
        },
        judgeArgs: {
            group: 'judge',
            label: 'Judge arguments',
            summary: 'Command-line arguments for the calls that check finished work.'
        },
        judgeUnjudged: {
            group: 'judge',
            label: 'When a check cannot judge',
            summary: 'What happens when a quality check cannot judge a file; it never counts as a pass.',
            options: { ask: 'Ask me', pass: 'Continue unjudged', stop: 'Stop the step' }
        },
        judgeCompare: {
            group: 'judge',
            label: 'Show the check the source',
            summary: 'Whether an edit\'s quality check also sees what the edit started from.',
            options: { auto: 'With the source', never: 'Result only' }
        },
        // One run sets its own with workflows.run judgeLadder=.
        judgeLadder: {
            group: 'judge', control: 'orderedChips', from: 'model', engine: 'claude',
            label: 'Judge ladder',
            summary: 'The models a workflow step\'s quality check climbs, cheapest first.'
        },
        workflowPrevTextChars: {
            group: 'workflows', unit: 'chars',
            label: 'Previous step text carried',
            summary: 'How much of the previous step\'s text a workflow step is handed.'
        },
        workflowAskEscalation: {
            group: 'workflows',
            label: 'Who answers a workflow question',
            summary: 'Who is asked when a workflow a mission started needs an answer.',
            options: { 'leader-then-human': 'Lead, then me', leader: 'Lead only', human: 'Me directly' }
        },
        // A workflow sets its own with workflows.add spendCap=, one run with workflows.run spendCap=. The soft
        // ceiling is a Wake condition on cost.run.
        workflowSpendCap: {
            group: 'workflows', unit: '$', zeroMeans: 'off',
            label: 'Workflow spend cap',
            summary: 'The most one workflow run may spend before it stops.'
        },
        // From the bridge a workflow binds roles with workflows.add roles=; workflows.roles says who fills what and
        // why.
        showrunner: {
            group: 'workflows', control: 'agent',
            label: 'Showrunner',
            summary: 'The agent that fills every workflow role nobody else is bound to.'
        },
        answerDir: {
            group: 'queue',
            label: 'Answers folder',
            summary: 'Where the detailed answer to a work queue item is written.'
        },
        'queue.groupSize': {
            group: 'queue',
            label: 'Batch size',
            summary: 'How many items for one target are gathered before they are handed out together.'
        },
        'queue.maxAgeHours': {
            group: 'queue', unit: 'h',
            label: 'Batch age limit',
            summary: 'How long a group\'s oldest item may wait before the group is handed out anyway.'
        },
        'queue.targets': {
            group: 'queue',
            label: 'Queue targets',
            summary: 'Extra targets offered in the work queue\'s add form and filter.'
        },
        'a2a.preferredGraceHours': {
            group: 'queue', unit: 'h',
            label: 'Preferred role wait',
            summary: 'How long a note or task for a preferred role is that role\'s alone.'
        }
    }
};
