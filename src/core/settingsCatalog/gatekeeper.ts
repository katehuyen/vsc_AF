import { CatalogSection } from './types';

export const gatekeeper: CatalogSection = {
    id: 'gatekeeper',
    label: 'Gatekeeper',
    about: 'A cheap check asked before a trigger, a dispatch, a workflow step or a retry spends a model.',
    groups: [
        { id: 'switches', label: 'Where it decides', about: 'Which decisions Gatekeeper is asked about: off, watching in the shadow, or on.' },
        { id: 'classifier', label: 'Classifier', about: 'The road to the classifier, who is asked in turn, its key, how long it may take and your own rules.' }
    ],
    rows: {
        'kapici.trigger': {
            group: 'switches', tier: 'basic',
            label: 'Trigger check',
            summary: 'Whether Gatekeeper is asked before a trigger wakes an agent.',
            options: { off: 'Off', shadow: 'Shadow', on: 'On' }
        },
        'kapici.dispatch': {
            group: 'switches',
            label: 'Dispatch check',
            summary: 'Whether Gatekeeper helps pick which agent takes incoming work.',
            options: { off: 'Off', shadow: 'Shadow', on: 'On' }
        },
        'kapici.workflow': {
            group: 'switches',
            label: 'Workflow steps',
            summary: 'Whether a workflow\'s Gatekeeper steps are asked.',
            options: { off: 'Off', shadow: 'Shadow', on: 'On' }
        },
        'kapici.retry': {
            group: 'switches',
            label: 'Held retries',
            summary: 'Whether Gatekeeper helps decide a task whose retry waits for a supervisor.',
            options: { off: 'Off', shadow: 'Shadow', on: 'On' }
        },
        'kapici.route': {
            group: 'classifier', tier: 'basic',
            label: 'Classifier road',
            summary: 'Which service Gatekeeper reaches its classifier through.',
            options: { auto: 'By key', typesafe: 'TypeSafe', vercel: 'Vercel gateway', openrouter: 'OpenRouter' }
        },
        'kapici.providers': {
            group: 'classifier',
            label: 'Who is asked',
            summary: 'Who Gatekeeper asks, in order, when a rule names no one.'
        },
        'kapici.keyName': {
            group: 'classifier', control: 'secret',
            label: 'Classifier key',
            summary: 'The Secrets name of the classifier\'s key.'
        },
        'kapici.timeoutMs': {
            group: 'classifier', unit: 'ms',
            label: 'Classifier wait',
            summary: 'How long Gatekeeper waits for the classifier before the usual path decides.'
        },
        'kapici.rulesDir': {
            group: 'classifier',
            label: 'Rules folder',
            summary: 'The folder of your own Gatekeeper rules.'
        }
    }
};
