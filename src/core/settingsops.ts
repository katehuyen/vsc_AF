/**
 * Farm Settings — pure model behind the rich settings page.
 *
 * The page is SCHEMA-DRIVEN: it renders whatever `package.json` contributes
 * under `agentFarm.*` (type, enum, default, description), so a setting added
 * tomorrow appears automatically — categories only give known keys a nicer
 * home; unknown ones land in "Other". No setting is ever listed here by hand
 * twice: this file only maps keys to groups and validates values.
 */

export interface SettingSpec {
    key: string;                      // full key, e.g. "agentFarm.livePort"
    type: string;                     // schema type: string|number|boolean|array|object
    enum?: string[];
    default: unknown;
    description: string;
    markdownDescription?: string;
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
    modelAliases: 'core',
    // display & labels
    speakerLabelTemplate: 'display', speakerLabelCase: 'display', speakerLabelFallback: 'display',
    // live monitoring & alerts
    liveMonitor: 'live', livePort: 'live', activeThresholdSeconds: 'live',
    stuckThresholdSeconds: 'live', notifyPermission: 'live', notifyStuck: 'live',
    notifyTurnEnd: 'live', maxTranscriptMessages: 'live', contextWindowTokens: 'live',
    // cost & budgets
    pricing: 'cost', budgets: 'cost', windowTokenLimit: 'cost',
    mediaBudgetMonthUSD: 'cost', mediaPricing: 'cost', trendAlertFactor: 'cost',
    costAnomalyMinUsd: 'cost', forecastDays: 'cost', agentRowCostUnit: 'cost',
    // tasks & automation
    taskExtraArgs: 'tasks', externalTerminal: 'tasks', maxConcurrentTasks: 'tasks',
    maxConcurrentPerAgent: 'tasks', quotaGuardPercent: 'tasks', queueAutoAdvance: 'tasks',
    dispatchRules: 'tasks', dispatchClassifier: 'tasks', modelPolicy: 'tasks',
    quotaDowngradePercent: 'tasks', quotaDowngradeModel: 'tasks',
    judgeArgs: 'tasks', evalRunArgs: 'tasks',
    // media pipeline & browser
    mediaAuthSecret: 'media', replicateAuthSecret: 'media', replicateBaseUrl: 'media',
    mediaBaseUrl: 'media', outputsMaxMB: 'media', ingestFolders: 'media',
    browserAllowHosts: 'media', browserApproval: 'media',
    // search & semantic
    embeddingsProvider: 'search', embeddingsModel: 'search', embeddingsBaseUrl: 'search',
    embeddingsSecret: 'search', semanticMaxSessions: 'search',
    // multi-CLI
    cliProfiles: 'cli', codexHome: 'cli', geminiDir: 'cli', relayFeeds: 'cli',
    // health & insights
    staleMemoryDays: 'health', contextBudgetTokens: 'health', permissionLint: 'health',
    pulse: 'health', insightAutoDelegate: 'health', qualitySample: 'health',
    qualitySamplesPerAgent: 'health', suggestScan: 'health', packGalleryRepos: 'health',
    // reports, digest & outbound
    dailyDigest: 'reports', weeklySummary: 'reports', autoReport: 'reports',
    autoReportFolder: 'reports', autoReportDays: 'reports', autoReportIncludeOutputs: 'reports',
    digestTtsModel: 'reports', digestTtsFolder: 'reports', reportDir: 'reports',
    notifyWebhookUrl: 'reports', notifyWebhookEvents: 'reports'
};

export const CATEGORY_LABELS: [string, string][] = [
    ['core', 'Core & Agents'],
    ['display', 'Display & Labels'],
    ['live', 'Live Monitoring & Alerts'],
    ['cost', 'Cost & Budgets'],
    ['tasks', 'Tasks & Automation'],
    ['media', 'Media & Browser'],
    ['search', 'Search & Semantic'],
    ['cli', 'Multi-CLI'],
    ['health', 'Health & Insights'],
    ['reports', 'Reports & Digest'],
    ['other', 'Other']
];

/** Deep-enough equality for setting values (JSON-shaped data only). */
export function sameValue(a: unknown, b: unknown): boolean {
    if (a === b) { return true; }
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

/** Build the category → items model from the live schema + current values. */
export function buildSettingsModel(
    properties: Record<string, { type?: unknown; enum?: unknown; default?: unknown; description?: string; markdownDescription?: string }>,
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
