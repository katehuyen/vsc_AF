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
        maxConcurrentTasks: { group: 'concurrency', tier: 'basic' },
        maxConcurrentPerAgent: { group: 'concurrency', tier: 'basic' },
        queueAutoAdvance: { group: 'concurrency', tier: 'basic' },
        taskRetry: { group: 'running', tier: 'basic' },
        externalTerminal: { group: 'running', tier: 'basic' },
        taskExtraArgs: { group: 'running' },
        evalRunArgs: { group: 'running' },
        dispatchRules: { group: 'dispatch' },
        dispatchClassifier: { group: 'dispatch' },
        modelPolicy: { group: 'dispatch' },
        judgeArgs: { group: 'judge' },
        judgeUnjudged: { group: 'judge' },
        judgeCompare: { group: 'judge' },
        judgeLadder: { group: 'judge', control: 'orderedChips', from: 'model', engine: 'claude' },
        workflowPrevTextChars: { group: 'workflows', unit: 'chars' },
        workflowAskEscalation: { group: 'workflows' },
        workflowSpendCap: { group: 'workflows', unit: '$' },
        showrunner: { group: 'workflows', control: 'agent' },
        answerDir: { group: 'queue' },
        'queue.groupSize': { group: 'queue' },
        'queue.maxAgeHours': { group: 'queue', unit: 'h' },
        'queue.targets': { group: 'queue' },
        'a2a.preferredGraceHours': { group: 'queue', unit: 'h' }
    }
};
