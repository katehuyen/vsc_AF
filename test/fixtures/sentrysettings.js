/**
 * X-193 — Settings ▸ Sentry, in the two states that decide whether the section
 * is worth having:
 *
 *   1. CONFIGURED — the machine has a vault and a project, so every variable
 *      resolves and the rows show real Windows paths. This is the state that
 *      proves the DENSITY claim: the reader sees where each row points without
 *      opening anything.
 *   2. ‼️ HALF-RESOLVED — one variable has nothing behind it on this machine.
 *      That path is CANCELLED, and the row has to say so where the reader is
 *      already looking. It is drawn as the loud one, because it is the failure
 *      the section exists for: silently looking in the wrong folder is how a
 *      whole night is spent reading somebody else's handover note.
 *
 * The lists are given the real distribution — several rows, a mixture of
 * variable and plain paths, and Turkish folder names — because a one-row list
 * makes any reordering control look fine and a list of `C:\a` makes any width
 * look fine.
 */
const VAULT = 'D:\\zone\\know\\note\\obsidian';
const REPO = 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm';
const PROJECT = VAULT + '\\00_AGENT_AREA\\10_PROJECTS\\PRS.MuratVural_DEV_VSC.AgentFarm';

const VARS = (vault) => ([
    { name: 'home', describe: 'The signed-in user\'s home folder.', value: 'C:\\Users\\rotam' },
    { name: 'workspace', describe: 'The folder open in this VS Code window.', value: REPO },
    { name: 'repo', describe: 'The repository the campaign works in.', value: REPO },
    { name: 'vault', describe: 'agentFarm.vaultDir — the Obsidian vault, when there is one.', value: vault },
    { name: 'project', describe: 'The campaign\'s project NAME.', value: 'PRS.MuratVural_DEV_VSC.AgentFarm' },
    { name: 'projectFolder', describe: 'That project\'s own folder.', value: vault ? PROJECT : '' },
    { name: 'projectNotes', describe: 'Where that project keeps its notes (10_Notes).', value: vault ? PROJECT + '\\10_Notes' : '' },
    { name: 'agentDir', describe: 'The agent\'s own folder.', value: 'D:\\zone\\agent\\ajanlar\\developer' },
    { name: 'today', describe: 'Today, as YYYY-MM-DD.', value: '2026-09-05' },
    { name: 'yesterday', describe: 'Yesterday, as YYYY-MM-DD.', value: '2026-09-04' },
    { name: 'sessionId', describe: 'The session a path is being resolved FOR.', value: '' },
    { name: 'sessionId8', describe: 'The first eight characters of that session id.', value: '' }
]);

const FOLDERS = [
    '${vault}\\00_AGENT_AREA\\00_OUTPUT\\01_CEVAPLAR',
    '${projectNotes}',
    '${vault}\\00_AGENT_AREA\\90_ARSIV\\${today}',
    'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm\\docs\\handover'
];

const POOL = [
    '${vault}\\00_AGENT_AREA\\99_SYSTEM\\Nöbet Tembihleri.md',
    '${agentDir}\\memory\\nobet-tembihleri.md'
];

/**
 * The host's answer for one list.
 *
 * ‼️ audit B-05 — IT IS THE RESOLVER'S ANSWER, NOT A COPY OF IT. This helper
 * used to build the refusal sentence itself, under a comment claiming it was
 * "the resolver's own sentence, verbatim" — and it hardcoded `${vault}` into
 * every one. So the no-vault scene showed the `${projectNotes}` row saying
 * «⚠ ${vault} has nothing behind it on this machine», naming a variable that is
 * not in that row at all. The real resolver names the variables the TEMPLATE
 * carries, one row at a time, so it is called instead of imitated.
 */
const previewPathList = require(
    require('path').join(__dirname, '..', '..', 'out', 'core', 'pathVars.js')
).previewPathList;

/** `${today}` must not be a clock: the scene's dates are fixed, so the resolver
 *  is handed the same instant the VARS strip above is written for. */
const NOW = Date.UTC(2026, 8, 5, 12, 0, 0);

const ctxOf = (vault) => {
    const ctx = { now: NOW };
    for (const v of VARS(vault)) { ctx[v.name] = v.value; }
    return ctx;
};

const preview = (templates, vault) => previewPathList(templates, ctxOf(vault));

const ITEMS = () => ([
    {
        key: 'agentFarm.handoverSources', type: 'array', default: [], modified: true,
        value: ['transcript', 'configured', 'projectNotes', 'fallback'],
        shape: { kind: 'list', itemType: 'string', itemAllowed: ['transcript', 'configured', 'projectNotes', 'fallback'] },
        description: 'Where a sentry campaign looks for the handover note of the session that just ended, and in which order. Empty = all four, most truthful first.'
    },
    {
        key: 'agentFarm.handoverFolders', type: 'array', default: [], modified: true, value: FOLDERS,
        shape: { kind: 'list', itemType: 'string', itemBrowse: 'folder' },
        description: 'The folders the `configured` handover source looks in, in order. Takes the path variables above.'
    },
    {
        key: 'agentFarm.sentryTemplatesFile', type: 'string', default: '', browse: 'file', modified: true,
        value: '${vault}\\00_AGENT_AREA\\99_SYSTEM\\Nöbet Şablonları.md',
        description: 'A markdown file holding the words a sentry campaign starts the NEXT session with. First file of the pool.'
    },
    {
        key: 'agentFarm.sentryInstructionFiles', type: 'array', default: [], modified: true, value: POOL,
        shape: { kind: 'list', itemType: 'string', itemBrowse: 'file' },
        description: 'The POOL of your own saved instructions, as an ordered list. A verdict heading is a template; every block is material the leader blends.'
    },
    {
        key: 'agentFarm.sentryLeaderModel', type: 'string', default: '', value: 'haiku', modified: true,
        description: 'The model a sentry LEADER turn runs on. Cheap on purpose. Empty = haiku.'
    },
    {
        key: 'agentFarm.sentryLeaderBudgetUsd', type: 'number', default: 2, value: 2, modified: false,
        description: 'Daily budget for leader turns, per campaign. 0 = no cap, and that is the figure to think twice about.'
    },
    {
        key: 'agentFarm.sentryLeaderMaxUsd', type: 'number', default: 0.25, value: 0.25, modified: false,
        description: 'Cost ceiling for ONE leader turn. Over it, the turn is cut and the round falls to the template.'
    },
    {
        key: 'agentFarm.sentryLeaderMaxSeconds', type: 'number', default: 120, value: 120, modified: false,
        description: 'Time ceiling for ONE leader turn.'
    },
    {
        key: 'agentFarm.sentryLeaderFailLimit', type: 'number', default: 3, value: 3, modified: false,
        description: 'After this many failed leader turns in a row the mode drops to mechanical and says so.'
    },
    {
        key: 'agentFarm.sentryFailureLimit', type: 'number', default: 3, value: 5, modified: true,
        description: 'How many barren rounds in a row stop a campaign.'
    },
    {
        key: 'agentFarm.sentryIdlePollMin', type: 'number', default: 5, value: 5, modified: false,
        description: 'How often the watchdog looks at a running round.'
    },
    {
        key: 'agentFarm.sentryStallMin', type: 'number', default: 20, value: 20, modified: false,
        description: 'A round that has produced nothing for this many minutes is ended — it is probably waiting for a permission nobody is there to give.'
    },
    // Deliberately NOT in any group: the section must still draw it, under
    // "More", or a setting added tomorrow would be invisible.
    {
        key: 'agentFarm.sentryDaydreamMinutes', type: 'number', default: 0, value: 0, modified: false,
        description: 'A setting this page has not been told where to file — it must still appear.'
    }
]);

const base = (vault) => ({
    focus: '', profiles: [], prompts: null, docOpen: null, folders: null,
    claude: null, engines: null, engineModels: null, wiki: null, superpowers: null,
    alerts: null, telegram: null,
    modelAliases: ['haiku', 'sonnet', 'opus', 'fable'],
    categories: [{ id: 'sentry', label: 'Sentry — unattended campaigns', items: ITEMS() }],
    pathVars: VARS(vault),
    pathPreview: {
        'agentFarm.handoverFolders': preview(FOLDERS, vault),
        'agentFarm.sentryInstructionFiles': preview(POOL, vault),
        'agentFarm.sentryTemplatesFile': preview(
            ['${vault}\\00_AGENT_AREA\\99_SYSTEM\\Nöbet Şablonları.md'], vault)
    },
    valueSources: { agent: [] }
});

const data = () => base(VAULT);

const variants = () => ([
    {
        id: 'sentrysettings',
        label: 'Settings ▸ Sentry — every variable resolves, so every row says where it points',
        data: base(VAULT)
    },
    {
        id: 'sentrysettings-novault',
        label: 'Settings ▸ Sentry — ‼️ no vault on this machine: those paths are CANCELLED, and say so',
        data: base('')
    }
]);

module.exports = { script: 'settings.js', data, variants };
