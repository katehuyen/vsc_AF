/**
 * H1 — Guardrail auditor (permission lint). Scans an agent's
 * .claude/settings(.local).json permission rules for the classic footguns:
 * blanket allows, dangerous command patterns, bypassed permission modes and
 * broad rules that nothing actually uses. Pure string/data logic — testable
 * without vscode.
 */

export type LintSeverity = 'error' | 'warning' | 'info';

export interface LintFinding {
    severity: LintSeverity;
    code: 'bypass-mode' | 'broad-allow' | 'dangerous-pattern' | 'unused-broad' | 'duplicate-rule' | 'unparseable';
    entry?: string;
    message: string;
}

/** Patterns inside allow rules that grant destructive or arbitrary execution. */
const DANGEROUS_SNIPPETS: { re: RegExp; why: string }[] = [
    { re: /rm\s+-rf|rm\s+-fr/i, why: 'recursive force delete' },
    { re: /\brd\s+\/s|\bdel\s+\/[sfq]/i, why: 'recursive delete (cmd)' },
    { re: /remove-item[^)]*-recurse[^)]*-force|remove-item[^)]*-force[^)]*-recurse/i, why: 'recursive force delete (PowerShell)' },
    { re: /(curl|wget|iwr|invoke-webrequest)[^)]*\|\s*(sh|bash|zsh|iex|powershell)/i, why: 'download-and-execute pipe' },
    { re: /-encodedcommand/i, why: 'encoded PowerShell payload' },
    { re: /git\s+push[^)]*--force(?!-with-lease)/i, why: 'force push' },
    { re: /\bformat\s+[a-z]:/i, why: 'disk format' },
    { re: /\bmkfs\b|\bdd\s+if=/i, why: 'disk overwrite' },
    { re: /reg\s+(add|delete)\s+hklm|schtasks\s+\/create/i, why: 'system-level persistence' },
    { re: /taskkill[^)]*\/im\s+\*/i, why: 'kill-all processes' }
];

/** An allow entry that effectively whitelists a whole tool (or everything). */
function broadAllowWhy(entry: string): string | undefined {
    const e = entry.trim();
    if (e === '*' || e === '**') { return 'allows every tool'; }
    const m = /^([A-Za-z_]+)\s*\(\s*(.*?)\s*\)$/.exec(e);
    const tool = m ? m[1] : /^[A-Za-z_]+$/.test(e) ? e : undefined;
    const arg = m ? m[2] : undefined;
    if (!tool) { return undefined; }
    const riskTools = new Set(['bash', 'powershell', 'shell', 'webfetch']);
    const wildcardArg = arg === undefined || arg === '' || arg === '*' || arg === '**' ||
        arg === '*:*' || arg === 'domain:*' || /^\*[\s:]*\*?$/.test(arg ?? '');
    if (wildcardArg && riskTools.has(tool.toLowerCase())) {
        return `blanket ${tool} access — any ${tool.toLowerCase() === 'webfetch' ? 'URL' : 'command'} runs without asking`;
    }
    return undefined;
}

/** Tool name an allow entry belongs to (for usage matching). */
export function allowEntryTool(entry: string): string | undefined {
    const m = /^([A-Za-z_]+)\s*(\(|$)/.exec(entry.trim());
    return m ? m[1] : undefined;
}

export interface PermissionDoc {
    defaultMode?: string;
    allow: string[];
    deny: string[];
}

export function parsePermissions(settingsRaw: string): PermissionDoc | undefined {
    try {
        const json = JSON.parse(settingsRaw) as {
            permissions?: { defaultMode?: string; allow?: unknown; deny?: unknown };
            defaultMode?: string;
        };
        const p = json.permissions ?? {};
        return {
            defaultMode: p.defaultMode ?? json.defaultMode,
            allow: Array.isArray(p.allow) ? p.allow.map(String) : [],
            deny: Array.isArray(p.deny) ? p.deny.map(String) : []
        };
    } catch { return undefined; }
}

/**
 * Lint one agent's permission rules. `toolUsage` maps tool name → call count
 * over the observation window (from indexed transcripts); pass undefined to
 * skip usage-based findings.
 */
export function lintPermissions(
    settingsRaw: string,
    toolUsage?: Map<string, number>
): LintFinding[] {
    const findings: LintFinding[] = [];
    const doc = parsePermissions(settingsRaw);
    if (!doc) {
        return [{
            severity: 'warning', code: 'unparseable',
            message: 'Settings file is not valid JSON — permissions cannot be audited.'
        }];
    }

    if (doc.defaultMode && /bypass/i.test(doc.defaultMode)) {
        findings.push({
            severity: 'error', code: 'bypass-mode', entry: doc.defaultMode,
            message: `defaultMode "${doc.defaultMode}" disables permission prompts entirely — every tool call runs unchecked.`
        });
    }

    const seen = new Set<string>();
    for (const entry of doc.allow) {
        const norm = entry.trim().toLowerCase();
        if (seen.has(norm)) {
            findings.push({
                severity: 'info', code: 'duplicate-rule', entry,
                message: `Duplicate allow rule: "${entry}".`
            });
            continue;
        }
        seen.add(norm);

        for (const d of DANGEROUS_SNIPPETS) {
            if (d.re.test(entry)) {
                findings.push({
                    severity: 'error', code: 'dangerous-pattern', entry,
                    message: `Allow rule "${entry}" whitelists a dangerous pattern (${d.why}).`
                });
                break;
            }
        }

        const broad = broadAllowWhy(entry);
        if (broad) {
            findings.push({
                severity: 'warning', code: 'broad-allow', entry,
                message: `Overly broad allow rule "${entry}" — ${broad}. Narrow it to the specific commands the agent actually needs.`
            });
        } else if (toolUsage) {
            const tool = allowEntryTool(entry);
            // A wildcard-ish rule for a tool that was never used in the window:
            // permission surface with zero benefit.
            if (tool && entry.includes('*') && !(toolUsage.get(tool) ?? 0)) {
                findings.push({
                    severity: 'info', code: 'unused-broad', entry,
                    message: `Allow rule "${entry}" was never exercised in the last 30 days — consider removing it (unused permission surface).`
                });
            }
        }
    }
    return findings;
}
