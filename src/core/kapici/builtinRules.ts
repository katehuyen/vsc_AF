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

export const TRIGGER_HAS_WORK: KapiciRule = {
    id: 'trigger.has-work',
    version: 1,
    description: 'Does this firing carry real work for the agent it would wake?',
    providers: ['jev', 'llm'],
    questions: {
        work: {
            type: 'noul',
            instructions: 'This change would wake an AI agent to act on it. Is there real work in it for the agent?',
            criteria: 'Noise is not work: an auto-save with no real change, a lock, temp or backup file, a whitespace- or formatting-only edit, an empty file.'
        }
    },
    decide: { passIf: { q: 'work', noulGt: 0.5 } },
    minConfidence: 0.6,
    onLowConfidence: 'mechanical',
    onFailure: 'open',
    inputBudgetChars: 12000,
    golden: [
        { state: { event: 'watch change', file: 'yeni-gorev.md', content: 'Ödeme hatırlatmalarını gönder: 3 müşteri gecikmede.' }, expect: { work: true } },
        { state: { event: 'watch change', file: 'notlar.md', diff: '-Toplantı saat 3\n+Toplantı saat 4\n+Yarın müşteriye teklif gönder' }, expect: { work: true } },
        { state: { event: 'watch change', file: '~$rapor.docx', content: '' }, expect: { work: false } },
        { state: { event: 'watch change', file: 'index.lock', content: '' }, expect: { work: false } },
        { state: { event: 'watch change', file: 'app.ts', diff: '-const a=1;\n+const a = 1;' }, expect: { work: false } }
    ]
};

export const BUILTIN_RULES: KapiciRule[] = [DISPATCH_ROUTE, RETRY_NEXT_ACTION, TRIGGER_HAS_WORK];
