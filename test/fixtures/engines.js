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
    }
]);

const data = () => ({
    focus: '', profiles: [], prompts: null, modelAliases: [],
    categories: [{
        id: 'live', label: 'Live', items: [
            { key: 'agentFarm.livePort', type: 'number', default: 0, description: 'listener port', value: 9000, modified: true }
        ]
    }],
    folders: { excludes: [], reports: [] },
    engines: engines()
});

module.exports = { script: 'settings.js', data, engines };
