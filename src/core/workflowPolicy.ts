/**
 * X-371 — WHAT A WORKFLOW'S CONDITIONS CAN READ.
 *
 * The second dictionary of the condition engine (src/core/policyEngine.ts):
 * the facts measured when a workflow step ends, as a person writes a rule
 * against them ("wake the supervisor when the judge FAILs", "when the run has
 * cost more than $2"). A field added here turns up in any editor that draws
 * the dictionary. Pure.
 */
import { evaluateConditions, FieldSpec, PolicyDictionary, snapshotFacts, Condition } from './policyEngine';

export interface WorkflowFacts {
    step: {
        kind: string; status: string;
        /** 1 for the first run of this step in this run, 2 for its first retry … */
        attempt?: number;
        elapsedMs?: number;
        costUSD?: number;
        /** the step is a checkpoint — the supervisor is asked there unconditionally */
        checkpoint?: boolean;
    };
    verify?: { verdict?: string };
    /** undefined when no judge ran — then its fields were not measured */
    judge?: { score?: number; modality?: string };
    run?: { costUSD?: number };
    assets?: { count: number };
    /** the step's answer — where an error, a refusal or a keyword shows up */
    output?: string;
}

export const WORKFLOW_FIELDS: FieldSpec[] = [
    { field: 'always', type: 'boolean', describe: 'always true — the one condition "wake it every step" is made of' },
    {
        field: 'step.kind', type: 'enum', values: ['agent', 'webhook', 'media', 'browser', 'approval', 'select', 'checkpoint'],
        describe: 'what kind of step just ended'
    },
    { field: 'step.status', type: 'enum', values: ['done', 'failed', 'cancelled'], describe: 'how it ended' },
    { field: 'verify.verdict', type: 'enum', values: ['pass', 'fail', 'unjudged', ''], describe: 'what its quality check said ("" = it has none)' },
    { field: 'judge.score', type: 'number', describe: 'the score the judge gave, where it gives one' },
    { field: 'judge.modality', type: 'enum', values: ['image', 'video', 'audio', 'pdf', 'text', ''], describe: 'what the judge was asked to look at' },
    { field: 'attempt', type: 'number', describe: 'which attempt of this step this was — 1, then 2 on its first retry' },
    { field: 'cost.step', type: 'number', describe: 'what this step cost, in dollars' },
    { field: 'cost.run', type: 'number', describe: 'what the whole run has cost so far, in dollars' },
    { field: 'asset.count', type: 'number', describe: 'how many assets the step produced' },
    { field: 'output', type: 'text', describe: 'the step\'s answer — match an error or a keyword in it' },
    { field: 'elapsed', type: 'number', describe: 'how long the step took, in seconds' },
    { field: 'checkpoint', type: 'boolean', describe: 'the step is a checkpoint' }
];

function read(field: string, f: WorkflowFacts): unknown {
    switch (field) {
        case 'always': return true;
        case 'step.kind': return f.step?.kind ?? '';
        case 'step.status': return f.step?.status ?? '';
        case 'verify.verdict': return f.verify?.verdict ?? '';
        case 'judge.score': return f.judge?.score;
        case 'judge.modality': return f.judge ? (f.judge.modality ?? '') : undefined;
        case 'attempt': return f.step?.attempt ?? 1;
        case 'cost.step': return f.step?.costUSD ?? 0;
        case 'cost.run': return f.run?.costUSD ?? 0;
        case 'asset.count': return f.assets?.count ?? 0;
        case 'output': return f.output ?? '';
        case 'elapsed': return f.step?.elapsedMs === undefined ? undefined : Math.round(f.step.elapsedMs / 1000);
        case 'checkpoint': return !!f.step?.checkpoint || f.step?.kind === 'checkpoint';
        default: return undefined;
    }
}

export const WORKFLOW_DICTIONARY: PolicyDictionary<WorkflowFacts> = {
    noun: 'workflow', when: 'at this step', fields: WORKFLOW_FIELDS, read
};

export const workflowFactsSnapshot = (facts: WorkflowFacts): Record<string, unknown> => snapshotFacts(WORKFLOW_DICTIONARY, facts);

export const evaluateWorkflowConditions = (conditions: readonly Condition[] | undefined, facts: WorkflowFacts) =>
    evaluateConditions(WORKFLOW_DICTIONARY, conditions, facts);
