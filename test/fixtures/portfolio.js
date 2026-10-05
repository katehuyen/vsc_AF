/**
 * The Agents page (Portfolio): five agents in two projects and one unassigned,
 * one working, one dormant, one over its daily budget. Shapes as
 * src/panels/portfolioPanel.ts buildPortfolioRows draws them. The picture is
 * the phone: one card per agent at 360px.
 */
const row = (id, project, extra) => ({
    id, name: id, dir: 'D:\\zone\\agent\\ajanlar\\' + id, project, status: 'idle', active: false,
    quietDays: 1, dormant: false, sessions7: 4, cost7: 3.2, sessions30: 15, cost30: 12.4, costToday: 0.4,
    tokens30: 4200000, wTokens30: 900000, filesEdited30: 22, duties: 3, dutiesWaiting: 0, dutiesPaused: 0,
    errors: 0, warnings: 1, memoryFiles: 12, contextLoad: 9800, budget: 0, ...extra
});

const data = () => ({
    generatedAt: Date.now(),
    rows: [
        row('developer', 'Agent Farm', { status: 'working', active: true, quietDays: 0, cost30: 184.2, cost7: 61.5, sessions30: 88, sessions7: 21, budget: 40, costToday: 46.1, dutiesWaiting: 2 }),
        row('manager', 'Agent Farm', { quietDays: 0, cost30: 22.8, errors: 1 }),
        row('psikolog', 'Kişisel', { quietDays: 3, cost30: 4.1, sessions30: 6, sessions7: 1, memoryFiles: 31 }),
        row('basit', 'Unassigned', { quietDays: 19, dormant: true, cost30: 0.6, sessions30: 2, sessions7: 0, cost7: 0, duties: 0, warnings: 0 }),
        row('youtuber', 'Kişisel', { status: 'waiting-input', quietDays: 0, cost30: 9.9, dutiesPaused: 1 })
    ],
    projects: ['Agent Farm', 'Kişisel'],
    dormantDays: 14,
    roots: ['D:\\zone\\agent\\ajanlar'],
    models: [], defaultModel: '', canCreate: true
});

module.exports = { script: 'portfolio.js', data };
