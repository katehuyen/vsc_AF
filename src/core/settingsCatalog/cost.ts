import { CatalogSection } from './types';

export const cost: CatalogSection = {
    id: 'cost',
    label: 'Quota & Cost',
    about: 'How plan usage is read and shown, what things cost and where spending stops.',
    groups: [
        { id: 'planUsage', label: 'Plan usage', about: 'How often each account\'s plan usage is read, and when its figure turns to a warning.' },
        { id: 'budgets', label: 'Budgets', about: 'The spending limits per agent and for media each month.' },
        { id: 'prices', label: 'Prices and weights', about: 'What a token costs on each model, and how a window\'s use is weighed.' },
        { id: 'brakes', label: 'Brakes', about: 'When an unattended start waits, or drops to a cheaper model, because the quota is running out.' },
        { id: 'forecast', label: 'Alerts and forecast', about: 'When a rising cost is flagged, and how far ahead spending is forecast.' },
        { id: 'display', label: 'Display', about: 'How cost is shown on an agent\'s row.' }
    ],
    rows: {
        planUsageStatusBar: { group: 'planUsage', tier: 'basic' },
        planUsageWarnPercent: { group: 'planUsage', tier: 'basic', unit: '%' },
        planUsageDangerPercent: { group: 'planUsage', tier: 'basic', unit: '%' },
        planUsageRefreshMinutes: { group: 'planUsage', unit: 'min' },
        planUsageActiveRefreshSeconds: { group: 'planUsage', unit: 's' },
        planUsageMinIntervalSeconds: { group: 'planUsage', unit: 's' },
        planUsageEngine: { group: 'planUsage' },
        agyUsageRefreshMinutes: { group: 'planUsage', unit: 'min', zeroMeans: 'off' },
        agyUsageActiveRefreshSeconds: { group: 'planUsage', unit: 's' },
        accountsAutoRefresh: { group: 'planUsage' },
        budgets: { group: 'budgets', tier: 'basic' },
        budgetsUnlimited: { group: 'budgets' },
        mediaBudgetMonthUSD: { group: 'budgets', unit: '$', zeroMeans: 'off' },
        pricing: { group: 'prices' },
        mediaPricing: { group: 'prices' },
        quotaWeights: { group: 'prices' },
        quotaWeightMode: { group: 'prices' },
        windowTokenLimit: { group: 'prices', unit: 'tokens' },
        windowWeightedTokenLimit: { group: 'prices', unit: 'tokens', zeroMeans: 'off' },
        quotaBrakeBasis: { group: 'brakes' },
        quotaGuardPercent: { group: 'brakes', tier: 'basic', unit: '%', zeroMeans: 'off' },
        quotaDowngradePercent: { group: 'brakes', unit: '%', zeroMeans: 'off' },
        quotaDowngradeModel: { group: 'brakes' },
        trendAlertFactor: { group: 'forecast' },
        costAnomalyMinUsd: { group: 'forecast', unit: '$' },
        forecastDays: { group: 'forecast', unit: 'days' },
        agentRowCostUnit: { group: 'display' }
    }
};
