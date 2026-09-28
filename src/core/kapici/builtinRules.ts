/**
 * X-410 — the rules Agent Farm's own decisions use, shipped in code (the
 * lowest layer: a system or project rule with the same id replaces one).
 * Written in English, Jev's first language; the state may be Turkish.
 */
import { KapiciRule } from './types';

const AGENTS = {
    developer: 'Writes, debugs and ships code in the user\'s software projects.',
    psikolog: 'Talks about feelings, stress, motivation and the user\'s inner life.',
    muhasebe: 'Handles invoices, payments, taxes and bookkeeping.'
};

export const DISPATCH_ROUTE: KapiciRule = {
    id: 'dispatch.route',
    version: 1,
    description: 'Which agent should take this request? The candidates arrive with the call.',
    providers: ['jev', 'llm'],
    questions: {
        agent: {
            type: 'choice',
            instructions: 'Which agent is the right one to handle this request? Pick the agent whose description fits the request best.',
            criteria: '$call'
        }
    },
    decide: { actionFrom: 'agent' },
    minConfidence: 0.7,
    onLowConfidence: 'mechanical',
    onFailure: 'fallback',
    inputBudgetChars: 8000,
    golden: [
        { state: 'Uzantıdaki kaydetme butonu çalışmıyor, konsolda TypeError var', options: { agent: AGENTS }, expect: { agent: 'developer' } },
        { state: 'Bu hafta çok gerginim, hiçbir şeye odaklanamıyorum', options: { agent: AGENTS }, expect: { agent: 'psikolog' } },
        { state: 'Eylül faturalarını kesip KDV beyannamesini hazırla', options: { agent: AGENTS }, expect: { agent: 'muhasebe' } },
        { state: 'Fix the failing unit test in the parser module', options: { agent: AGENTS }, expect: { agent: 'developer' } },
        { state: 'Ödemesi gecikmiş müşterilerin listesini çıkar', options: { agent: AGENTS }, expect: { agent: 'muhasebe' } }
    ]
};

export const RETRY_NEXT_ACTION: KapiciRule = {
    id: 'retry.next-action',
    version: 1,
    description: 'What should a run that hit its limit after doing work do next?',
    providers: ['jev', 'llm'],
    questions: {
        action: {
            type: 'choice',
            instructions: 'Given the incident, which continuation is right?',
            criteria: {
                resume: 'The run was on track; continue the same session.',
                retryOriginal: 'The run took a wrong turn; start the original task again.',
                wait: 'Nothing is wrong with the work; the limit has to reset first.',
                stop: 'The task cannot succeed as written.',
                needsUser: 'A human decision is required before anything else.'
            }
        }
    },
    decide: { actionFrom: 'action' },
    minConfidence: 0.75,
    onLowConfidence: 'mechanical',
    onFailure: 'fallback',
    inputBudgetChars: 40000,
    golden: [
        { state: { failure: 'usage limit reached', resetAt: '2026-09-28T15:50:00Z', lastOutput: 'Tests pass, committing the change.' }, expect: { action: 'wait' } },
        { state: { failure: 'max turns reached', lastOutput: 'Step 3 of 5 done, moving on to step 4.', resumable: true }, options: { action: ['resume', 'retryOriginal', 'stop', 'needsUser'] }, expect: { action: 'resume' } },
        { state: { failure: 'max turns reached', lastOutput: 'Editing the wrong repository; none of the requested files exist here.' }, expect: { action: 'retryOriginal' } },
        { state: { failure: 'error', lastOutput: 'The file the task asks to edit was deleted from the project months ago.' }, expect: { action: 'stop' } },
        { state: { failure: 'max turns reached', lastOutput: 'Two designs are possible; the user has to choose between A and B before I continue.' }, expect: { action: 'needsUser' } }
    ]
};

export const BUILTIN_RULES: KapiciRule[] = [DISPATCH_ROUTE, RETRY_NEXT_ACTION];
