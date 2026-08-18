/**
 * Farm Settings → Engines (X-3 phase 1), with the three states a row can be in
 * side by side: on a plan, on a key, and not installed at all.
 *
 * ‼️ THE THIRD ONE IS THE REAL CASE ON THIS MACHINE. `~/.codex/auth.json` says
 * `auth_mode: chatgpt` while `codex` is not on PATH — a signed-in account for a
 * CLI that is not installed. A row that reads the credentials file and stops
 * there would call that "ready"; the shape here is the check that it does not.
 */
const engines = () => ([
    {
        id: 'claude', label: 'Claude Code',
        cli: { command: 'claude', found: true, path: 'C:\\Users\\x\\AppData\\Roaming\\npm\\claude.cmd' },
        auth: {
            mode: 'subscription', file: '.claude/.credentials.json',
            refreshedAt: Date.parse('2026-08-09T09:12:00Z'),
            detail: 'Signed in with a Claude plan (claudeAiOauth).'
        },
        key: { env: 'ANTHROPIC_API_KEY', inVault: false },
        ready: true,
        next: 'Ready, on a plan. Nothing to pay per token and no key to keep.',
        loginCommand: 'claude /login',
        installCommand: 'npm install -g @anthropic-ai/claude-code',
        billing: 'A Claude Pro or Max plan, signed in once in the browser. An API key is the alternative, not the normal route.',
        docs: 'https://code.claude.com/docs/en/authentication'
    },
    {
        id: 'codex', label: 'Codex',
        cli: { command: 'codex', found: false },
        auth: {
            mode: 'subscription', file: '.codex/auth.json',
            refreshedAt: Date.parse('2026-08-09T10:31:36Z'),
            detail: 'Signed in with a ChatGPT plan (auth_mode: chatgpt). No API key is involved.'
        },
        key: { env: 'OPENAI_API_KEY', inVault: false },
        ready: false,
        next: 'Codex is not installed on this machine — nothing can start until the codex command exists.'
            + ' Install it with: npm install -g @openai/codex.'
            + ' The sign-in is already on disk, so this is the only step left.',
        loginCommand: 'codex login',
        installCommand: 'npm install -g @openai/codex',
        billing: 'A ChatGPT Plus, Pro, Team or Business plan, signed in once in the browser — exactly like Claude Code. An API key is the alternative.',
        docs: 'https://developers.openai.com/codex/auth'
    },
    {
        id: 'gemini', label: 'Gemini',
        cli: { command: 'gemini', found: true, path: 'C:\\Users\\x\\AppData\\Roaming\\npm\\gemini.cmd' },
        auth: { mode: 'apikey', detail: 'An API key (GEMINI_API_KEY) from the vault or the environment.' },
        key: { env: 'GEMINI_API_KEY', inVault: true },
        ready: true,
        next: 'Ready, on a key (GEMINI_API_KEY) — this one is billed per token.',
        installCommand: 'npm install -g @google/gemini-cli',
        billing: 'An API key. The "sign in with Google" route this CLI used to have was retired in June 2026, so a plan is no longer a way to pay for it.',
        docs: 'https://github.com/google-gemini/gemini-cli'
    },
    {
        // ‼️ THE FOURTH STATE, AND THE ONE THE LAYOUT HAD NEVER BEEN DRAWN FOR:
        // an engine with NO KEY AT ALL and no install command. Every other row
        // ends in an "Add key" button and names a variable; this one has neither
        // — the sign-in belongs to the Antigravity app — so the fixture is here
        // to make sure the row still reads as a row rather than as a gap where a
        // button used to be.
        id: 'agy', label: 'Antigravity',
        cli: { command: 'agy', found: true, path: 'C:\\Users\\x\\AppData\\Local\\agy\\bin\\agy.exe' },
        auth: {
            mode: 'subscription', file: '.gemini/antigravity-cli/cache/onboarding.json',
            detail: 'Signed in through the Antigravity app (consumer onboarding complete). '
                + 'The grant itself belongs to the app — there is no credential file here to read, and no key.'
        },
        key: { env: '', inVault: false },
        ready: true,
        next: 'Ready, on a plan. Nothing to pay per token and no key to keep.',
        billing: 'A Google account signed into the Antigravity app — the CLI borrows that sign-in. There is no API key for this engine and nothing to keep in the vault.',
        docs: 'https://antigravity.google'
    },
    {
        // ‼️ U-59 — THE FIFTH STATE, AND THE ONE THAT BREAKS THE ROW'S OLD
        // ASSUMPTION: READY WITH AN EMPTY CREDENTIAL FILE.
        //
        // Every row above answers "can it run?" by finding a grant somewhere.
        // Measured in A-16 on opencode 1.18.18, this one runs with `auth.json`
        // empty: its own connected `opencode` provider lists seven models and
        // takes real turns with no sign-in at all. So the row has to read as
        // READY while naming no credential — and must NOT offer "Add key",
        // which would tell the user to go and fix something that is not broken.
        // That is a claim about what is DRAWN, so it is drawn here.
        id: 'opencode', label: 'OpenCode',
        cli: { command: 'opencode', found: true, path: 'C:\\Users\\x\\AppData\\Roaming\\npm\\opencode.cmd' },
        auth: {
            mode: 'builtin', file: '.local/share/opencode/auth.json',
            detail: 'No credential is needed for its own connected `opencode` provider — measured: '
                + 'seven models, zero credentials, real turns. Signing in adds the paid providers beside them.'
        },
        key: { env: '', inVault: false },
        ready: true,
        next: 'Ready, with no sign-in — its own connected provider needs none.',
        loginCommand: 'opencode auth login',
        installCommand: 'npm install -g opencode-ai',
        billing: 'Its own connected `opencode` provider needs no sign-in at all. Signing in with `opencode auth login`, or adding a provider key, is how you reach the paid models beside them.',
        docs: 'https://opencode.ai/docs/cli/'
    }
]);

/**
 * ‼️ U-29 — THE AGENT FOLDERS SECTION, WITH THE THING THAT WAS A MYSTERY.
 *
 * The per-agent default used to be one box that wrote Claude's settings file
 * whatever engine it was for. It is per engine now, and every box names what
 * "Default" resolves to — which is a VISUAL claim, so it is drawn here rather
 * than only asserted as a string. The two agents below are the two cases that
 * matter: one with a Claude default set in its own file and nothing for the
 * other engines, and one with the opposite.
 */
const resolved = (value, origin, note) => ({ value, origin, note });

const folders = () => ({
    excludes: [],
    reports: [{
        root: 'D:\\zone\\agent\\ajanlar',
        kind: 'nest',
        duplicate: false,
        candidates: [
            {
                dir: 'D:\\zone\\agent\\ajanlar\\developer', name: 'developer',
                excluded: false, agentId: 'developer', model: 'sonnet',
                engines: {
                    claude: {
                        model: 'sonnet', effort: '',
                        resolved: resolved('sonnet', 'agent-file',
                            'sonnet — this agent\u2019s own .claude/settings.local.json, which Claude Code reads itself.'),
                        resolvedEffort: resolved('', 'cli', 'Claude Code decides.')
                    },
                    codex: {
                        model: 'gpt-5.6-terra', effort: 'high',
                        resolved: resolved('gpt-5.6-terra', 'farm',
                            'gpt-5.6-terra — set here for this agent on Codex; passed as --model.'),
                        resolvedEffort: resolved('high', 'farm', 'high — passed as --effort.')
                    },
                    gemini: {
                        model: '', effort: '',
                        resolved: resolved('', 'cli', 'Gemini decides — nothing is set for this agent.'),
                        resolvedEffort: resolved('', 'cli', 'Gemini decides.')
                    },
                    agy: {
                        model: '', effort: '',
                        resolved: resolved('', 'cli', 'Antigravity decides — nothing is set for this agent.'),
                        resolvedEffort: resolved('', 'cli', 'Antigravity decides.')
                    },
                    // ‼️ U-59 — THE BOX THE USER WAS NEVER OFFERED. The per-agent
                    // engines were a hand-typed list that stopped at four, so
                    // OpenCode simply had no row here. Its model is
                    // `provider/model`, which is the widest label in this
                    // section — drawn on purpose, because the long-label case is
                    // where a picker's width fails and no string test would say so.
                    opencode: {
                        model: 'opencode/nemotron-3.5-lightning-free', effort: '',
                        resolved: resolved('opencode/nemotron-3.5-lightning-free', 'farm',
                            'opencode/nemotron-3.5-lightning-free — set here for this agent on OpenCode; passed as -m.'),
                        resolvedEffort: resolved('', 'cli',
                            'OpenCode decides. Effort is `--variant` here and only on models that declare one.')
                    }
                }
            },
            {
                dir: 'D:\\zone\\agent\\ajanlar\\basit', name: 'basit',
                excluded: false, agentId: 'basit', model: '',
                engines: {
                    claude: {
                        model: '', effort: '',
                        resolved: resolved('haiku', 'launch-defaults',
                            'haiku — from agentFarm.launchDefaults, which applies to every agent.'),
                        resolvedEffort: resolved('low', 'launch-defaults', 'low — from agentFarm.launchDefaults.')
                    },
                    codex: {
                        model: '', effort: '',
                        resolved: resolved('haiku', 'launch-defaults',
                            'haiku — from agentFarm.launchDefaults, which applies to every agent and every engine.'),
                        resolvedEffort: resolved('low', 'launch-defaults', 'low — from agentFarm.launchDefaults.')
                    },
                    gemini: { model: '', effort: '', resolved: resolved('', 'cli', 'Gemini decides.'), resolvedEffort: resolved('', 'cli', '') },
                    agy: { model: '', effort: '', resolved: resolved('', 'cli', 'Antigravity decides.'), resolvedEffort: resolved('', 'cli', '') },
                    // The empty case beside the set one: nothing chosen, so the
                    // engine's own default stands and the box says which.
                    opencode: { model: '', effort: '', resolved: resolved('', 'cli', 'OpenCode decides — nothing is set for this agent.'), resolvedEffort: resolved('', 'cli', 'OpenCode decides.') }
                }
            }
        ]
    }]
});

/** What each engine currently offers — the same shape core/models.ts returns. */
const engineModels = () => ({
    claude: {
        models: [{ id: '', label: 'Default' }, { id: 'haiku', label: 'haiku' },
            { id: 'sonnet', label: 'sonnet' }, { id: 'opus', label: 'opus' },
            { id: 'fable', label: 'fable' },
            { id: 'claude-fable-5[1m]', label: 'Fable · 1m' }],
        efforts: { '': [{ id: '', label: 'Default' }, { id: 'low', label: 'low' }, { id: 'high', label: 'high' }] },
        defaultEffort: {}, source: 'catalog', note: 'aliases plus what the CLI recorded for this account'
    },
    codex: {
        models: [{ id: '', label: 'Default' }, { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' },
            { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' }],
        efforts: {
            '': [{ id: '', label: 'Default' }, { id: 'low', label: 'low' }, { id: 'high', label: 'high' }],
            'gpt-5.6-terra': [{ id: '', label: 'Default' }, { id: 'low', label: 'low' },
                { id: 'medium', label: 'medium' }, { id: 'high', label: 'high' }]
        },
        defaultEffort: {}, source: 'catalog', note: 'read from Codex\u2019s own catalog'
    },
    gemini: {
        models: [{ id: '', label: 'Default' }], efforts: { '': [{ id: '', label: 'Default' }] },
        defaultEffort: {}, source: 'settings', note: 'this engine states no model catalog'
    },
    agy: {
        models: [{ id: '', label: 'Default' }, { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
            { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Thinking)' },
            { id: 'gpt-oss-120b', label: 'GPT-OSS 120B' }],
        efforts: {
            'gemini-3.6-flash': [{ id: '', label: 'Default' }, { id: 'low', label: 'low' },
                { id: 'medium', label: 'medium' }, { id: 'high', label: 'high' }],
            'claude-sonnet-4-6': [{ id: '', label: 'Default' }]
        },
        defaultEffort: {}, source: 'catalog', note: 'read from Antigravity\u2019s own `agy models`'
    },
    // \u203c\ufe0f U-59 \u2014 THE CATALOGUE THAT IS READ, NOT THE ONE THAT EXISTS.
    //
    // OpenCode knows of 184 providers and is CONNECTED to one. Drawing the whole
    // catalogue would offer 184 providers' models as if they were selectable and
    // make every one of them fail at run time with a credential error; drawing a
    // static alias list would go stale the first time the provider changes. So
    // the picker shows what the connected provider itself listed when the session
    // opened \u2014 measured, seven \u2014 and the note says when it was read, because a
    // catalogue with no age is a claim that cannot be checked.
    //
    // The ids are `provider/model` and they are LONG: this is the widest option
    // text any picker on this page has to hold, which is a layout question and
    // therefore drawn rather than asserted.
    opencode: {
        models: [{ id: '', label: 'Default' },
            { id: 'opencode/nemotron-3.5-lightning-free', label: 'opencode/nemotron-3.5-lightning-free' },
            { id: 'opencode/deepseek-v4-flash-free', label: 'opencode/deepseek-v4-flash-free' },
            { id: 'opencode/laguna-s-2.1-free', label: 'opencode/laguna-s-2.1-free' },
            { id: 'opencode/mimo-v2.5-free', label: 'opencode/mimo-v2.5-free' },
            { id: 'opencode/nemotron-3-ultra-free', label: 'opencode/nemotron-3-ultra-free' },
            { id: 'opencode/hy3-free', label: 'opencode/hy3-free' }],
        // \u203c\ufe0f Effort is `--variant` on this engine and HEADLESS-ONLY, and only
        // some models declare one \u2014 so the box is not drawn per model by habit.
        efforts: { '': [{ id: '', label: 'Default' }] },
        defaultEffort: {}, source: 'catalog',
        note: '7 models, as OpenCode itself listed them when the session opened'
    }
});

const base = () => ({
    focus: '', profiles: [], prompts: null, modelAliases: ['haiku', 'sonnet', 'opus', 'fable'],
    categories: [{
        id: 'live', label: 'Live', items: [
            { key: 'agentFarm.livePort', type: 'number', default: 0, description: 'listener port', value: 9000, modified: true }
        ]
    }],
    folders: folders(),
    engineModels: engineModels(),
    agentDefaultsEngine: 'claude',
    engines: engines()
});

const data = base;

/** Two pictures, because the point of the change is that they DIFFER: the same
 *  two agents with the boxes editing Claude's defaults, and then Codex's. */
const variants = () => ([
    { id: 'engines', label: 'Settings — agent defaults for CLAUDE', data: base() },
    {
        id: 'engines-codex', label: 'Settings — the same agents, defaults for CODEX',
        data: { ...base(), agentDefaultsEngine: 'codex' }
    },
    // ‼️ U-59 — THE LONG-LABEL CASE, AND IT IS NOT HYPOTHETICAL. Every other
    // engine names a model in a word or two (`sonnet`, `gpt-5.6-terra`);
    // OpenCode's are `provider/model` and run past thirty characters, which is
    // the width no string test measures and the one a picker fails at. Drawn
    // beside an agent that has nothing set, so the widest and the emptiest box
    // are in the same picture.
    {
        id: 'engines-opencode', label: 'Settings — defaults for OPENCODE, where a model id is a sentence',
        data: { ...base(), agentDefaultsEngine: 'opencode' }
    }
]);

module.exports = { script: 'settings.js', data, variants, engines, folders, engineModels };
