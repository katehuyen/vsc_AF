/**
 * Farm Settings — pure model behind the rich settings page.
 *
 * The page is SCHEMA-DRIVEN: it renders whatever `package.json` contributes
 * under `agentFarm.*` (type, enum, default, description), so a setting added
 * tomorrow appears automatically — categories only give known keys a nicer
 * home; unknown ones land in "Other". No setting is ever listed here by hand
 * twice: this file only maps keys to groups and validates values.
 */

/**
 * ‼️ MEASURED — VS CODE CAN DROP ONE KEY ITS OWN MANIFEST DECLARES.
 *
 * Exactly one of the 124 settings this build contributes,
 * `agentFarm.budgetsUnlimited`, is missing from the running window's
 * configuration registry: `getConfiguration().get()` hands back `undefined`
 * instead of the declared default `false`, and `update()` refuses it with
 * "is not a registered configuration". The manifest is not at fault — the key
 * occurs exactly once, with a valid boolean schema, in the installed folder's
 * `package.json`, and the keys either side of it in the same object both work.
 * Whatever the registry did, no extension can argue with it from inside.
 *
 * A setting that vanishes is not a setting, so the READER stops trusting the
 * registry alone: when it hands back nothing, the user's own `settings.json` is
 * read for that key and the figure they typed is honoured. The fallback is on
 * the read side only — reading a file cannot corrupt it, and hand-patching a
 * user's JSONC is not a risk worth taking for a switch.
 *
 * `settings.json` is JSONC: comments and trailing commas are legal there, and a
 * `//` inside a string — every Windows path, every URL in that file — has to
 * survive the stripping.
 */
export function stripJsonc(text: string): string {
    let out = '';
    const commas: number[] = [];
    let inStr = false, esc = false, inLine = false, inBlock = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i], n = text[i + 1];
        if (inLine) { if (c === '\n') { inLine = false; out += c; } continue; }
        if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
        if (inStr) {
            out += c;
            if (esc) { esc = false; } else if (c === '\\') { esc = true; } else if (c === '"') { inStr = false; }
            continue;
        }
        if (c === '"') { inStr = true; out += c; continue; }
        if (c === '/' && n === '/') { inLine = true; i++; continue; }
        if (c === '/' && n === '*') { inBlock = true; i++; continue; }
        if (c === ',') { commas.push(out.length); }
        out += c;
    }
    // Trailing commas, resolved against the comma positions this pass already
    // knows are outside a string — a regex over the whole text would eat the
    // comma in `"one, two"` whenever a `}` happened to follow it.
    const chars = out.split('');
    for (const at of commas) {
        let j = at + 1;
        while (j < chars.length && /\s/.test(chars[j])) { j++; }
        if (chars[j] === '}' || chars[j] === ']') { chars[at] = ' '; }
    }
    return chars.join('');
}

/** One key out of a JSONC settings file: flat `a.b` first, then the nested
 *  spelling VS Code also accepts. `found` distinguishes "set to false" from
 *  "not there", which is the whole point of reading the file at all. */
export function readFlatSetting(text: string, key: string): { found: boolean; value?: unknown } {
    let obj: unknown;
    try { obj = JSON.parse(stripJsonc(text)); } catch { return { found: false }; }
    if (!obj || typeof obj !== 'object') { return { found: false }; }
    const flat = obj as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(flat, key)) { return { found: true, value: flat[key] }; }
    let cur: unknown = obj;
    for (const part of key.split('.')) {
        if (!cur || typeof cur !== 'object'
            || !Object.prototype.hasOwnProperty.call(cur as object, part)) { return { found: false }; }
        cur = (cur as Record<string, unknown>)[part];
    }
    return { found: true, value: cur };
}

export interface SettingSpec {
    key: string;                      // full key, e.g. "agentFarm.livePort"
    type: string;                     // schema type: string|number|boolean|array|object
    enum?: string[];
    default: unknown;
    description: string;
    markdownDescription?: string;
    /**
     * ‼️ A PATH SETTING GETS A BROWSE BUTTON, AND THE SCHEMA IS WHERE IT SAYS
     * SO. The settings page is schema-driven on purpose — a setting added
     * tomorrow appears without anybody editing the page — so "this one is a
     * path" has to travel the same way, or the page grows a hand-written list
     * of keys that goes stale the first time somebody forgets it. Declare
     * `"x-af-browse": "file"` (or `"folder"`) in package.json and the text box
     * gets a picker beside it. Anything else is just a text box.
     *
     * ‼️ THE KEY IS `x-af-browse` AND NOT `format`, WHICH COST A RELEASE. VS
     * Code validates every configuration property it is offered, and `format`
     * is a JSON-Schema keyword it knows: given a value it does not recognise it
     * REFUSES THE WHOLE PROPERTY. The setting then has no registered default,
     * so `getConfiguration().get()` returns nothing and the page — which builds
     * its rows from the raw manifest, not from the registry — draws the row
     * with an empty box. It looks exactly like a setting nobody has filled in.
     * An `x-` prefixed key is outside the vocabulary VS Code checks and rides
     * through untouched.
     */
    browse?: 'file' | 'folder';
}

export interface SettingItem extends SettingSpec {
    value: unknown;                   // effective value right now
    modified: boolean;                // differs from default
}

export interface SettingsCategory {
    id: string;
    label: string;
    items: SettingItem[];
}

/** key (without the agentFarm. prefix) → category id. */
const CATEGORY_OF: Record<string, string> = {
    // core
    agentRoots: 'core', excludeAgentDirs: 'core', claudeDir: 'core', extraClaudeDirs: 'core',
    includeUnmatchedProjects: 'core', guideLanguage: 'core', newAgentModel: 'core',
    agentEngineDefaults: 'core',
    modelAliases: 'core', launchDefaults: 'core', launchProfiles: 'core', projects: 'core',
    // projects — the umbrella everything else hangs under
    projectsRoot: 'core', projectSkeleton: 'core', projectStaleDays: 'core',
    projectsArchiveRoot: 'core', projectTemplates: 'core',
    projectContextExtra: 'core',
    projectDigestDay: 'core', projectDigestHour: 'core',
    // display & labels
    speakerLabelTemplate: 'display', speakerLabelCase: 'display', speakerLabelFallback: 'display',
    consoleDropZone: 'display',
    // saved prompts — a section of its own, because the setting is one path and
    // the thing the user needs to see is what came OUT of that path
    promptSnippetsFile: 'prompts',
    // live monitoring & alerts
    liveMonitor: 'live', livePort: 'live', activeThresholdSeconds: 'live',
    stuckThresholdSeconds: 'live', notifyPermission: 'live', notifyStuck: 'live',
    notifyTurnEnd: 'live', notifyConsoleTurnEnd: 'live',
    maxTranscriptMessages: 'live', contextWindowTokens: 'live',
    // cost & budgets
    pricing: 'cost', budgets: 'cost', budgetsUnlimited: 'cost', windowTokenLimit: 'cost',
    windowWeightedTokenLimit: 'cost', quotaWeightMode: 'cost', quotaWeights: 'cost',
    quotaBrakeBasis: 'cost',
    planUsageRefreshMinutes: 'cost', planUsageActiveRefreshSeconds: 'cost',
    planUsageStatusBar: 'cost', planUsageWarnPercent: 'cost', planUsageDangerPercent: 'cost',
    planUsageEngine: 'cost',
    mediaBudgetMonthUSD: 'cost', mediaPricing: 'cost', trendAlertFactor: 'cost',
    costAnomalyMinUsd: 'cost', forecastDays: 'cost', agentRowCostUnit: 'cost',
    // tasks & automation
    taskExtraArgs: 'tasks', externalTerminal: 'tasks', maxConcurrentTasks: 'tasks',
    maxConcurrentPerAgent: 'tasks', quotaGuardPercent: 'tasks', queueAutoAdvance: 'tasks',
    dispatchRules: 'tasks', dispatchClassifier: 'tasks', modelPolicy: 'tasks',
    quotaDowngradePercent: 'tasks', quotaDowngradeModel: 'tasks',
    judgeArgs: 'tasks', evalRunArgs: 'tasks', taskRetry: 'tasks',
    // media pipeline & browser
    mediaAuthSecret: 'media', replicateAuthSecret: 'media', replicateBaseUrl: 'media',
    mediaBaseUrl: 'media', outputsMaxMB: 'media', ingestFolders: 'media',
    browserAllowHosts: 'media', browserApproval: 'media',
    // search & semantic
    embeddingsProvider: 'search', embeddingsModel: 'search', embeddingsBaseUrl: 'search',
    embeddingsSecret: 'search', semanticMaxSessions: 'search',
    // multi-CLI
    cliProfiles: 'cli', codexHome: 'cli', geminiDir: 'cli', agyHome: 'cli',
    // ‼️ NOT a path like the three above: OpenCode publishes no transcript file,
    // so what this switches is whether its CLI is RUN to read the history at all.
    opencodeHistory: 'cli', relayFeeds: 'cli',
    // reaching the farm from outside this VS Code window
    'web.enabled': 'access', 'web.port': 'access', 'web.bind': 'access', 'web.token': 'access',
    'telegram.enabled': 'access', 'telegram.allowedChats': 'access',
    'telegram.maxDailyUSD': 'access', 'telegram.defaultAgent': 'access',
    // health & insights
    livingChecks: 'health', noticeStaleHours: 'health', idleSessionNoticeMinutes: 'health',
    staleMemoryDays: 'health', contextBudgetTokens: 'health', permissionLint: 'health',
    pulse: 'health', insightAutoDelegate: 'health', qualitySample: 'health',
    qualitySamplesPerAgent: 'health', suggestScan: 'health', packGalleryRepos: 'health',
    // reports, digest & outbound
    dailyDigest: 'reports', weeklySummary: 'reports', autoReport: 'reports',
    autoReportFolder: 'reports', autoReportDays: 'reports', autoReportIncludeOutputs: 'reports',
    digestTtsModel: 'reports', digestTtsFolder: 'reports', reportDir: 'reports',
    notifyWebhookUrl: 'reports', notifyWebhookEvents: 'reports',
    // work queue (user→agent async channel) + its answer folder
    answerDir: 'queue', 'queue.groupSize': 'queue', 'queue.maxAgeHours': 'queue',
    'queue.targets': 'queue',
    // ‼️ B-14 (X-50) — the LLM wiki's root. It sits beside the other two folders
    // agents WRITE into (the report folder and the answer folder), because that
    // is the question a reader has about it: where does what the agents produce
    // end up.
    wikiRoot: 'reports',
    // M-23 — and who writes it. Same category as the root for the same reason:
    // both answer "where does what the agents produce end up, and by whose hand".
    wikiAgent: 'reports'
};

export const CATEGORY_LABELS: [string, string][] = [
    ['core', 'Core & Agents'],
    ['display', 'Display & Labels'],
    ['prompts', 'Saved prompts'],
    ['live', 'Live Monitoring & Alerts'],
    ['cost', 'Cost & Budgets'],
    ['tasks', 'Tasks & Automation'],
    ['media', 'Media & Browser'],
    ['search', 'Search & Semantic'],
    ['cli', 'Multi-CLI'],
    ['health', 'Health & Insights'],
    ['reports', 'Reports & Digest'],
    ['queue', 'Work Queue'],
    ['access', 'Access (web view · messaging)'],
    ['other', 'Other']
];

/** Deep-enough equality for setting values (JSON-shaped data only). */
export function sameValue(a: unknown, b: unknown): boolean {
    if (a === b) { return true; }
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

/** Build the category → items model from the live schema + current values. */
export function buildSettingsModel(
    properties: Record<string, {
        type?: unknown; enum?: unknown; default?: unknown;
        description?: string; markdownDescription?: string; 'x-af-browse'?: unknown;
    }>,
    valueOf: (key: string) => unknown
): SettingsCategory[] {
    const byCat = new Map<string, SettingItem[]>();
    for (const [key, p] of Object.entries(properties)) {
        const short = key.replace(/^agentFarm\./, '');
        const cat = CATEGORY_OF[short] ?? 'other';
        const value = valueOf(key);
        const item: SettingItem = {
            key,
            type: Array.isArray(p.type) ? String(p.type[0]) : String(p.type ?? 'string'),
            enum: Array.isArray(p.enum) ? p.enum.map(String) : undefined,
            default: p.default,
            description: p.description ?? p.markdownDescription ?? '',
            markdownDescription: p.markdownDescription,
            ...(p['x-af-browse'] === 'file' ? { browse: 'file' as const } : {}),
            ...(p['x-af-browse'] === 'folder' ? { browse: 'folder' as const } : {}),
            value,
            modified: !sameValue(value, p.default)
        };
        (byCat.get(cat) ?? byCat.set(cat, []).get(cat)!).push(item);
    }
    const out: SettingsCategory[] = [];
    for (const [id, label] of CATEGORY_LABELS) {
        const items = byCat.get(id);
        if (items?.length) {
            items.sort((a, b) => a.key.localeCompare(b.key));
            out.push({ id, label, items });
        }
    }
    return out;
}

/** Parse + validate a raw string from the page into a typed setting value. */
export function sanitizeValue(
    spec: { type: string; enum?: string[] },
    raw: unknown
): { ok: true; value: unknown } | { ok: false; error: string } {
    switch (spec.type) {
        case 'boolean':
            return { ok: true, value: raw === true || raw === 'true' };
        case 'number': {
            const n = Number(raw);
            if (!isFinite(n)) { return { ok: false, error: 'not a number' }; }
            return { ok: true, value: n };
        }
        case 'array':
        case 'object': {
            if (typeof raw !== 'string') {
                // already structured (profile apply) — accept as-is
                return { ok: true, value: raw };
            }
            const text = raw.trim();
            if (!text) { return { ok: true, value: spec.type === 'array' ? [] : {} }; }
            try {
                const v = JSON.parse(text);
                if (spec.type === 'array' && !Array.isArray(v)) { return { ok: false, error: 'expected a JSON array' }; }
                if (spec.type === 'object' && (typeof v !== 'object' || v === null || Array.isArray(v))) {
                    return { ok: false, error: 'expected a JSON object' };
                }
                return { ok: true, value: v };
            } catch (e) {
                return { ok: false, error: 'invalid JSON: ' + String((e as Error).message).slice(0, 80) };
            }
        }
        default: {
            const s = String(raw ?? '');
            if (spec.enum && spec.enum.length && !spec.enum.includes(s)) {
                return { ok: false, error: `must be one of: ${spec.enum.join(', ')}` };
            }
            return { ok: true, value: s };
        }
    }
}

export interface SettingsProfile {
    name: string;
    savedAt: number;
    /** only values that differ from the schema default — small and portable. */
    values: Record<string, unknown>;
}

/** Snapshot the current non-default values as a named profile. */
export function snapshotProfile(name: string, categories: SettingsCategory[]): SettingsProfile {
    const values: Record<string, unknown> = {};
    for (const cat of categories) {
        for (const it of cat.items) {
            if (it.modified) { values[it.key] = it.value; }
        }
    }
    return { name: name.trim().slice(0, 60) || 'unnamed', savedAt: Date.now(), values };
}

/** What applying a profile will change: set every profile value, and reset to
 *  default every currently-modified key the profile doesn't mention — so a
 *  profile is a complete state, not an overlay. */
export function profileApplyPlan(
    profile: SettingsProfile,
    categories: SettingsCategory[]
): { key: string; value: unknown }[] {
    const plan: { key: string; value: unknown }[] = [];
    const known = new Set<string>();
    for (const cat of categories) { for (const it of cat.items) { known.add(it.key); } }
    for (const [key, value] of Object.entries(profile.values ?? {})) {
        if (known.has(key)) { plan.push({ key, value }); } // unknown keys are stale — skip
    }
    const mentioned = new Set(Object.keys(profile.values ?? {}));
    for (const cat of categories) {
        for (const it of cat.items) {
            if (it.modified && !mentioned.has(it.key)) {
                plan.push({ key: it.key, value: undefined }); // reset to default
            }
        }
    }
    return plan;
}

/** Validate an imported profiles JSON (from file) — fail-soft, keep the sane ones. */
export function parseImportedProfiles(text: string): SettingsProfile[] {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return []; }
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const out: SettingsProfile[] = [];
    for (const p of list) {
        if (!p || typeof p !== 'object') { continue; }
        const o = p as Partial<SettingsProfile>;
        if (typeof o.name !== 'string' || !o.values || typeof o.values !== 'object') { continue; }
        out.push({
            name: o.name.slice(0, 60),
            savedAt: typeof o.savedAt === 'number' ? o.savedAt : Date.now(),
            values: o.values as Record<string, unknown>
        });
    }
    return out;
}
