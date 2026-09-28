/**
 * M-54 — THE BROWSER RECIPE BOOK. A browser step that names a recipe runs on
 * Agent Farm's own Playwright MCP server instead of whatever browser MCP the
 * agent happens to have: a persistent profile per recipe (the user signs in
 * once, `browser.login`), and a download folder whose new files are filed into
 * the gallery and the library when the step ends (src/core/browserDownloads.ts).
 * A step with no recipe keeps the agent's own MCP, unchanged. Pure.
 */
import * as path from 'path';
import { resolveFlex } from './flexResolve';

export const BROWSER_SERVER = 'afbrowser';
export const PLAYWRIGHT_MCP = '@playwright/mcp@latest';

export interface BrowserRecipe {
    id: string;
    label: string;
    /** where the step starts when its own URL is empty */
    url: string;
    /** the hosts the step may visit when it names none of its own */
    hosts: string[];
    /** how the site works, told to the agent */
    hint: string;
    /** for the person choosing it (hover) */
    note: string;
}

export const BROWSER_RECIPES: BrowserRecipe[] = [
    {
        id: 'web', label: 'Any site (own profile)', url: '', hosts: [], hint: '',
        note: 'Any site, on a browser profile of its own that keeps a login. Name the start URL and the allowed hosts on the step.'
    },
    {
        id: 'flow', label: 'Google Flow (Veo)', url: 'https://labs.google/fx/tools/flow',
        hosts: ['labs.google', 'accounts.google.com'],
        hint: 'Google Flow: open or create a project, choose the model the goal names, type the prompt, generate, and wait until the clip has finished rendering (minutes - wait and look again, never submit twice). Then open the clip and use its Download button (the original MP4 if it asks).',
        note: 'Google Flow has no public API: this drives the web app on its own signed-in profile. Sign in once with browser.login recipe=flow.'
    },
    {
        id: 'higgsfield', label: 'Higgsfield (web)', url: 'https://higgsfield.ai',
        hosts: ['higgsfield.ai'],
        hint: 'Higgsfield: pick the tool the goal names (image or video), enter the prompt, generate once, wait until it has finished, then download the result with its download button. Every generation spends the account\'s credits - never generate again on your own.',
        note: 'Higgsfield web app on its own signed-in profile. Higgsfield also ships an official CLI for agents (npm i -g @higgsfield/cli, higgsfield auth login, npx skills add higgsfield-ai/skills) that spends the same plan credits without a browser.'
    }
];

export function browserRecipe(id: string | undefined): BrowserRecipe | undefined {
    const k = String(id ?? '').trim().toLowerCase();
    return k ? BROWSER_RECIPES.find(r => r.id === k) : undefined;
}

/** Why a step's recipe is refused, or ''. */
export function browserRecipeRefusal(v: unknown): string {
    if (v === undefined || v === null || v === '') { return ''; }
    return browserRecipe(String(v)) ? '' : `browser.recipe "${String(v)}" is not a recipe (${BROWSER_RECIPES.map(r => r.id).join(', ')})`;
}

export interface BrowserStepSpec {
    url?: string; goal?: string; allowHosts?: string[];
    recipe?: string; confirm?: string; downloadDir?: string;
}

export interface BrowserPlan {
    recipe?: BrowserRecipe;
    url: string;
    hosts: string[];
    confirm: 'ask' | 'auto';
    /** a recipe step only */
    profileDir?: string;
    downloadDir?: string;
    /** one sentence per resolved point */
    why: string[];
}

const list = (v?: string[]) => (v ?? []).map(x => String(x).trim()).filter(Boolean);

/** What a browser step will do: its URL, hosts, approval and — for a recipe — its profile and download folder. */
export function planBrowser(b: BrowserStepSpec, env: {
    settingsHosts?: string[]; settingsApproval?: string; profilesRoot: string; runDir: string;
}): BrowserPlan {
    const recipe = browserRecipe(b.recipe);
    const own = list(b.allowHosts);
    const fromRecipe = !own.length && !!recipe?.hosts.length;
    const setHosts = list(env.settingsHosts);
    const h = resolveFlex('browser.hosts', {
        ...(setHosts.length ? { settings: setHosts } : {}),
        ...(own.length ? { step: own } : fromRecipe ? { step: recipe!.hosts } : {})
    }, fromRecipe ? { step: recipe!.id } : {});
    const approval = env.settingsApproval && env.settingsApproval !== 'ask' ? env.settingsApproval : undefined;
    const c = resolveFlex('browser.confirm', { ...(approval ? { settings: approval } : {}), ...(b.confirm ? { step: b.confirm } : {}) });
    const plan: BrowserPlan = {
        ...(recipe ? { recipe } : {}),
        url: String(b.url ?? '').trim() || recipe?.url || '',
        hosts: Array.isArray(h.value) ? h.value as string[] : [],
        confirm: c.value === 'auto' ? 'auto' : 'ask',
        why: [`hosts: ${h.sentence}`, `confirm: ${c.sentence}`]
    };
    if (recipe) {
        const d = resolveFlex('browser.downloadDir', { ...(b.downloadDir ? { step: b.downloadDir } : {}) });
        plan.profileDir = path.join(env.profilesRoot, recipe.id);
        plan.downloadDir = String(d.value || '') || env.runDir;
        plan.why.push(`downloadDir: ${d.value ? d.sentence : `a folder of the step's own (${env.runDir})`}`);
    }
    return plan;
}

export const GUARD_MARK = 'BLOCKED BY AGENT FARM';

/**
 * The step's hosts held by the browser, not only by the prompt: a haiku told "labs.google only"
 * walked to flow.google.com and into Switch account (measured, M-54). Runs before the site's own
 * code in every page; top frame only, because sites embed other hosts' frames (sign-in, video).
 * The page is swapped for about:blank carrying the reason: stopping it in place leaves the
 * navigation waiting for a DOMContentLoaded that never comes (measured: a 30 s timeout).
 */
export function hostGuardScript(hosts: string[]): string {
    const list = JSON.stringify(hosts.map(h => h.trim().toLowerCase()).filter(Boolean));
    return `(() => {
  if (window.top !== window) { return; }
  const mark = '${GUARD_MARK}';
  const host = String(location.hostname || '').toLowerCase();
  if (!host) {
    const said = decodeURIComponent(String(location.hash || '').slice(1));
    if (!said.startsWith(mark)) { return; }
    const show = () => { document.title = mark; (document.body || document.documentElement).textContent = said; };
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', show); } else { show(); }
    return;
  }
  const hosts = ${list};
  if (!hosts.length || hosts.some(h => host === h || host.endsWith('.' + h))) { return; }
  window.stop();
  location.replace('about:blank#' + encodeURIComponent(mark + ': ' + host + ' is outside this step\\'s allowed hosts (' + hosts.join(', ') + '). Go back to an allowed page and never open this host again.'));
})();
`;
}

/** The MCP config a recipe step's claude runs with — its only browser; `guardFile` holds hostGuardScript. */
export function playwrightMcpConfig(plan: BrowserPlan, platform: string = process.platform, guardFile?: string): Record<string, unknown> {
    const args = ['-y', PLAYWRIGHT_MCP, '--user-data-dir', plan.profileDir ?? '', '--output-dir', plan.downloadDir ?? '',
        ...(guardFile ? ['--init-script', guardFile] : [])];
    const server = platform === 'win32' ? { command: 'cmd', args: ['/c', 'npx', ...args] } : { command: 'npx', args };
    return { mcpServers: { [BROWSER_SERVER]: server } };
}

/** The flags that give a claude run the recipe's browser and nothing else. */
export function browserMcpArgs(configFile: string): string {
    return `--mcp-config "${configFile}" --strict-mcp-config --allowedTools mcp__${BROWSER_SERVER}`;
}

/** The prompt a recipe step runs with. */
export function buildRecipePrompt(plan: BrowserPlan, goal: string): string {
    const r = plan.recipe!;
    return `Browser task. Use ONLY the ${BROWSER_SERVER} browser tools (Playwright). ` +
        `1) Go to: ${plan.url} 2) GOAL: ${goal} ` +
        (r.hint ? `How this site works: ${r.hint} ` : '') +
        `HARD RULE: navigate only within these domains: ${plan.hosts.join(', ')} - never open a link outside them or type another address; a page that says "${GUARD_MARK}" is one you must leave. ` +
        `This browser keeps its own profile for this site, so an earlier sign-in is still there. Never switch, add or sign out of an account. If the site asks you to sign in, do NOT type or invent credentials: stop and report exactly "LOGIN NEEDED: ${r.label}". ` +
        `To keep a result, use the site's own download button: every download is saved automatically and filed into the gallery after you finish - do not move or rename files. ` +
        `When you are done, report in plain text what you did and the names of the files you downloaded (the next step receives it as {prev_text}).`;
}

/** Where Chrome usually lives; the first one that exists opens the login window. */
export function chromeCandidates(env: Record<string, string | undefined>, platform: string = process.platform): string[] {
    if (platform === 'win32') {
        return [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA]
            .filter((d): d is string => !!d).map(d => path.join(d, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    }
    if (platform === 'darwin') { return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']; }
    return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];
}

/** A plain Chrome window on the recipe's profile — a person signs in there, never an automated browser. */
export function loginArgs(profileDir: string, url: string): string[] {
    return [`--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', url];
}
