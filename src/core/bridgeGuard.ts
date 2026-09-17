/**
 * ‼️ B-23 — THE BRIDGE RULE, ENFORCED BY CODE: A SESSION ID IS NOT SEARCHED FOR
 * ON DISK.
 *
 * WHY THIS EXISTS. Agent Farm's own data — sessions, transcripts, turns, tasks,
 * missions, projects — is asked of the bridge first; that is written down and
 * it is quietly broken. Measured 2026-09-17: two runs went hunting for a
 * session id through the file system and guessing the engine's layout, one of
 * them for over ten minutes, while `af.js sessions.find q=<id>` answers in one
 * call. A written rule with nothing watching it is not a rule (the first
 * principle), so it is watched here.
 *
 * ‼️ WHAT IS REFUSED, AND WHAT IS EXPRESSLY NOT. The refusal is narrow on
 * purpose: this runs in front of EVERY tool call every agent on this machine
 * makes, and a guard that over-fires is worse than the habit it corrects.
 *
 *   - Only the tools that SEARCH: Grep, Glob, and a shell command whose verb is
 *     a search (find · grep · rg · ls · dir · Get-ChildItem · Select-String).
 *     An Edit, a Write, a Read of a named path is never touched.
 *   - Only when the text really names a session: a FULL session id (the
 *     36-character form no other string on a disk takes by accident), or a
 *     short form that matches a session this machine actually knows.
 *     ‼️ THE SHORT FORM IS KNOWN-ONLY AND THAT IS NOT A DETAIL — an 8-character
 *     hex string is also every abbreviated git hash in existence, and refusing
 *     `git log <sha>` would be this guard breaking real work to enforce a rule
 *     about something else.
 *   - Never when the call is already USING the bridge (`af.js`, `sessions.`):
 *     the command that obeys the rule must not be stopped by it.
 *   - Never when the caller says it means it: `af:allow-id` anywhere in the
 *     command or pattern is the escape hatch, because a legitimate file
 *     operation on a transcript exists and the coder owns the way out.
 *
 * Pure: no `fs`, no `vscode`. The host supplies the known ids and carries out
 * the refusal.
 */

/** The bridge call that answers the question the search was asking. */
export const BRIDGE_FIND_HINT = 'af.js sessions.find q=<id>';

/** Anywhere in the command or pattern, this turns the guard off for that call. */
export const BRIDGE_GUARD_ESCAPE = 'af:allow-id';

/** The tools whose whole job is to look for a string on disk. */
export const SEARCH_TOOLS = ['Grep', 'Glob'] as const;

/** A shell command is only a search when its verb is one of these. */
const SHELL_SEARCH_RE =
    /(^|[|&;(`]|\s)(find|grep|egrep|fgrep|rg|ripgrep|ls|dir|gci|Get-ChildItem|Select-String|sls)(\s|$)/i;

/** The full session id — 8-4-4-4-12 hex. Nothing else on a disk looks like it. */
const FULL_ID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

/** The short form, which is ONLY a session id when this machine says it is. */
const HEX8_RE = /\b[0-9a-f]{8}\b/gi;

/** A call that is already going through the bridge is never stopped by it. */
const USING_BRIDGE_RE = /(af\.js|farm\.ops|sessions\.(find|read|recent)|search\.transcripts)/i;

export interface BridgeGuardAsk {
    /** the tool about to run */
    tool?: string;
    /** its input, as the hook payload carries it */
    input?: Record<string, unknown>;
    /** the session ids this machine knows, short form (8 chars) or full */
    known?: Iterable<string>;
}

export interface BridgeGuardVerdict {
    /** the id that was found in the call */
    id: string;
    /** `full` = the 36-character form · `known` = a short form the index knows */
    how: 'full' | 'known';
    /** which tool was about to run */
    tool: string;
    /** the one line the agent is given instead */
    reason: string;
}

/** The fields of a tool input that can carry something to search FOR. */
const TEXT_KEYS = ['pattern', 'command', 'query', 'q', 'glob', 'path', 'file_path'];

function textOf(input: Record<string, unknown> | undefined): string {
    if (!input) { return ''; }
    const parts: string[] = [];
    for (const k of TEXT_KEYS) {
        const v = input[k];
        if (typeof v === 'string' && v) { parts.push(v); }
        // An argv-shaped command is the same command.
        else if (Array.isArray(v)) { parts.push(v.filter(x => typeof x === 'string').join(' ')); }
    }
    return parts.join('\n');
}

/** The 8-character form of whatever id shape the host handed in. */
function shortOf(id: string): string {
    return String(id ?? '').trim().toLowerCase().replace(/-/g, '').slice(0, 8);
}

/**
 * Is this call a search? Grep and Glob always are; a shell call is one only
 * when its verb says so, because `node build.js` mentioning a path is not a
 * hunt through the file system.
 */
export function isSearchCall(tool: string | undefined, text: string): boolean {
    const t = String(tool ?? '').trim();
    if ((SEARCH_TOOLS as readonly string[]).includes(t)) { return true; }
    if (t === 'Bash' || t === 'PowerShell' || t === 'Shell') { return SHELL_SEARCH_RE.test(text); }
    return false;
}

/**
 * ‼️ THE ONE DECISION. Undefined is the ordinary answer and the one this is
 * tuned to give: everything that is not provably an agent hunting for a session
 * id on disk goes through untouched.
 */
export function bridgeGuardVerdict(ask: BridgeGuardAsk): BridgeGuardVerdict | undefined {
    const text = textOf(ask.input);
    if (!text) { return undefined; }
    if (text.includes(BRIDGE_GUARD_ESCAPE)) { return undefined; }
    if (USING_BRIDGE_RE.test(text)) { return undefined; }
    if (!isSearchCall(ask.tool, text)) { return undefined; }

    const tool = String(ask.tool ?? 'this tool');
    const full = FULL_ID_RE.exec(text);
    if (full) { return { id: full[0], how: 'full', tool, reason: refusalFor(full[0], 'full') }; }

    const known = new Set<string>();
    for (const k of ask.known ?? []) {
        const s = shortOf(k);
        if (s.length === 8) { known.add(s); }
    }
    if (!known.size) { return undefined; }
    HEX8_RE.lastIndex = 0;
    for (let m = HEX8_RE.exec(text); m; m = HEX8_RE.exec(text)) {
        const hit = m[0].toLowerCase();
        if (known.has(hit)) { return { id: m[0], how: 'known', tool, reason: refusalFor(m[0], 'known') }; }
    }
    return undefined;
}

/**
 * The sentence the agent gets instead of the search. It has to do three things
 * in one line, because one line is all a refusal gets read for: say what the
 * string is, say the call that answers the question, and say the way out — a
 * refusal with no escape teaches an agent to fight the guard.
 */
export function refusalFor(id: string, how: 'full' | 'known'): string {
    return `"${id}" is ${how === 'full' ? 'a session id' : 'the id of a session this machine knows'}, `
        + 'and Agent Farm data is asked of the bridge, never hunted for on disk — the file system layout '
        + `is the engine's and it changes. Run \`${BRIDGE_FIND_HINT}\` instead: it answers in one call `
        + '(the file, the engine, the agent, the cwd), and `sessions.read id=<id>` hands over the '
        + `conversation itself. If you really do need this search, put \`${BRIDGE_GUARD_ESCAPE}\` in the `
        + 'command and it runs.';
}

/**
 * The listener's answer for a `PreToolUse` hook it is refusing. A second shape
 * beside `hookResponseBody`'s: that one ADDS to the model's context, this one
 * stops the call — the CLI reads `permissionDecision` and never runs the tool,
 * printing `permissionDecisionReason` to the agent instead.
 */
export function denyResponseBody(eventName: string | undefined, verdict: BridgeGuardVerdict | undefined): string | undefined {
    if (!verdict || eventName !== 'PreToolUse') { return undefined; }
    return JSON.stringify({
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: verdict.reason
        }
    });
}

/** A refusal as it is kept: the verdict, when, and whose call it was. */
export interface BridgeGuardCatch extends BridgeGuardVerdict {
    ts: number;
    sessionId: string;
}

export type BridgeGuardChannel = 'claude-hook' | 'codex-hook' | 'none';

/** Whether an engine's tool calls have this guard in front of them, and why. */
export interface BridgeGuardCoverage {
    engine: string;
    guarded: boolean;
    channel: BridgeGuardChannel;
    why: string;
}

const UNGUARDED = ' — nothing stands in front of its tool calls, so on this engine the rule is written and not held.';

/**
 * ‼️ WHICH ENGINES THE RULE IS HELD ON — said per engine, because a guard that
 * silently covers two engines out of five reads as covering all of them.
 * Codex is here on measurement, not by analogy: codex-cli 0.149.0 parses
 * `permissionDecision` on PreToolUse, refuses only `ask` and `allow`, and
 * prints "Command blocked by PreToolUse hook: <reason>"; its shell tool
 * reaches the hook as `Bash`, which is the name this guard already reads.
 */
export function bridgeGuardCoverage(engine: string): BridgeGuardCoverage {
    const e = String(engine ?? '').trim().toLowerCase();
    switch (e) {
        case 'claude':
            return { engine: e, guarded: true, channel: 'claude-hook',
                why: 'Claude Code\'s PreToolUse hook: the listener answers it with a deny and the CLI never runs the call (Grep, Glob, Bash, PowerShell).' };
        case 'codex':
            return { engine: e, guarded: true, channel: 'codex-hook',
                why: 'Codex\'s PreToolUse hook from the hooks.json the fleet writes: a deny blocks the command (measured on codex-cli 0.149.0). Codex searches through its shell tool, which the hook names Bash. Held only while that wire is installed and trusted.' };
        case 'gemini':
            return { engine: e, guarded: false, channel: 'none', why: 'Agent Farm installs no hook for Gemini CLI' + UNGUARDED };
        case 'agy':
            return { engine: e, guarded: false, channel: 'none', why: 'Antigravity gives Agent Farm no hook before a tool call' + UNGUARDED };
        case 'opencode':
            return { engine: e, guarded: false, channel: 'none', why: 'OpenCode runs tool hooks only as plugins, and Agent Farm installs none' + UNGUARDED };
        default:
            return { engine: e, guarded: false, channel: 'none', why: `No hook of ${e || 'this engine'} reaches Agent Farm${UNGUARDED}` };
    }
}

/** What a surface says about one session's refusals — the words, derived once. */
export interface BridgeGuardView {
    count: number;
    /** SHORTHAND for a dense strip */
    chip: string;
    /** the long form, the panel's first line */
    head: string;
    lines: string[];
}

/** How many refusals a panel lists before it says how many more there were. */
const VIEW_LIST_CAP = 5;

/**
 * Undefined while nothing was refused — on a guarded engine that silence is
 * the honest answer, and a chip saying "0" on every card would be noise.
 */
export function bridgeGuardView(
    catches: readonly BridgeGuardCatch[] | undefined,
    ago?: (ts: number) => string
): BridgeGuardView | undefined {
    if (!catches || !catches.length) { return undefined; }
    const newest = [...catches].sort((a, b) => b.ts - a.ts);
    const n = newest.length;
    const lines = [`Stopped: ${n} search${n === 1 ? '' : 'es'} for a session id`];
    for (const c of newest.slice(0, VIEW_LIST_CAP)) {
        lines.push(`${ago ? ago(c.ts) + ' ago' : new Date(c.ts).toISOString()}: ${c.tool} · ${c.id}`
            + (c.how === 'known' ? ' (a short id this machine knows)' : ''));
    }
    if (n > VIEW_LIST_CAP) { lines.push(`…and ${n - VIEW_LIST_CAP} earlier (sessions.bridgeGuard lists them all).`); }
    lines.push(
        `Each time the agent was handed ${BRIDGE_FIND_HINT} instead of the search — Agent Farm data is asked of the bridge.`,
        `Way out: ${BRIDGE_GUARD_ESCAPE} in the command · switch: agentFarm.bridgeGuard`
    );
    return {
        count: n,
        chip: `guard ${n}`,
        head: `Bridge guard — ${n} search${n === 1 ? '' : 'es'} for a session id stopped`,
        lines
    };
}
