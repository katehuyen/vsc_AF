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
        'kapici.trigger': { group: 'switches', tier: 'basic' },
        'kapici.dispatch': { group: 'switches' },
        'kapici.workflow': { group: 'switches' },
        'kapici.retry': { group: 'switches' },
        'kapici.route': { group: 'classifier', tier: 'basic' },
        'kapici.providers': { group: 'classifier' },
        'kapici.keyName': { group: 'classifier' },
        'kapici.timeoutMs': { group: 'classifier', unit: 'ms' },
        'kapici.rulesDir': { group: 'classifier' }
    }
};
