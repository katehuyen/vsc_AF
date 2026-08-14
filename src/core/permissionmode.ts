/**
 * ‼️ K-22 — "BYPASS" ON THE CARD HAS TO MEAN BYPASS IN THE PROCESS.
 *
 * The user's decision on this is not a preference, it is a contract: a Console
 * session whose permission control says `bypassPermissions` — chosen outright,
 * or `Default` resolving to it through Claude's own settings — must never open
 * a permission window. A card that says bypass and then asks is the failure
 * this module exists to prevent.
 *
 * It was failing, and the reason was one flag standing in for another. S-18
 * added `--allow-dangerously-skip-permissions` to the hosted launch, which
 * *permits* bypass to be chosen later; it does not *apply* it. So a session
 * requested as bypass started in the ordinary asking mode and every tool call
 * went back through `can_use_tool`. Measured on the reported session
 * (`1963cc5a`, Claude 2.1.232): settings, first native user event and Console
 * state all said `bypassPermissions`, while the process argv held only
 * `--permission-prompt-tool stdio --allow-dangerously-skip-permissions`.
 *
 * So there are THREE separate facts, and collapsing any two of them is how the
 * contract broke:
 *   - REQUESTED — what the launcher asked for ('' = the Default entry);
 *   - FROM SETTINGS — what Claude's own layers make `Default` mean;
 *   - ENFORCED — the mode the flags actually put the process in.
 *
 * A policy can forbid bypass outright (`permissions.disableBypassPermissionsMode`).
 * When it does, bypass is NOT quietly downgraded to asking here — the CLI's own
 * answer is to fall back to `default` with a warning, which is precisely the
 * "says bypass, then asks" state the user rejected. A session that would carry
 * a label it cannot honour is refused before it starts instead.
 *
 * ‼️ ONE THING THIS CANNOT SEE, and it is written down rather than pretended
 * away: the CLI also disables bypass from a remote feature gate
 * (`tengu_disable_bypass_permissions_mode`), which is not in any file on this
 * machine. If that ever fires, the process starts in `default` behind a bypass
 * label — and the reducer's auto-answer (consoleproto.ts) is what keeps the
 * contract anyway: the requests arrive and the user still never sees one.
 *
 * Pure: it is given the settings files' text and answers. Reading them off disk
 * is `permissionLayerPaths` + the caller's own fs.
 */

export const BYPASS = 'bypassPermissions';

/** Claude's settings layers, in ITS precedence order — highest first. */
export type PermissionLayerId = 'managed' | 'local' | 'project' | 'user';

export interface PermissionLayer {
    id: PermissionLayerId;
    file: string;
    /** The file's text; absent/unreadable is simply an absent layer. */
    text?: string;
}

export interface EffectivePermission {
    /** What the launcher asked for. '' = the "Default" entry, i.e. no flag. */
    requested: string;
    /** What the settings layers make a new session start in ('' = nothing said). */
    fromSettings: string;
    /** Which file said it ('' when nothing did). */
    settingsFile: string;
    /** The mode the session will really run in. */
    effective: string;
    /** True only when the launch can actually ENFORCE bypass. */
    bypass: boolean;
    /** Set when bypass is wanted and a managed policy forbids it. A session in
     *  this state is refused rather than started under a label it cannot keep. */
    blocked?: { file: string; why: string };
    /** One line, for the card and for the refusal — where the answer came from. */
    why: string;
}

/** Where each layer lives. `home` is the user's home, `cwd` the session's folder. */
export function permissionLayerPaths(
    cwd: string, home: string, platform: string = process.platform
): { id: PermissionLayerId; file: string }[] {
    const managed = platform === 'win32'
        ? `${process.env.PROGRAMDATA || 'C:\\ProgramData'}\\ClaudeCode\\managed-settings.json`
        : platform === 'darwin'
            ? '/Library/Application Support/ClaudeCode/managed-settings.json'
            : '/etc/claude-code/managed-settings.json';
    const join = (...p: string[]) => p.join(platform === 'win32' ? '\\' : '/');
    return [
        { id: 'managed', file: managed },
        ...(cwd ? [
            { id: 'local' as const, file: join(cwd, '.claude', 'settings.local.json') },
            { id: 'project' as const, file: join(cwd, '.claude', 'settings.json') }
        ] : []),
        ...(home ? [{ id: 'user' as const, file: join(home, '.claude', 'settings.json') }] : [])
    ];
}

function parse(text?: string): Record<string, unknown> | undefined {
    if (!text?.trim()) { return undefined; }
    try {
        const v = JSON.parse(text) as unknown;
        return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
    } catch { return undefined; }
}

function modeIn(json: Record<string, unknown> | undefined): string {
    const perms = json?.['permissions'] as Record<string, unknown> | undefined;
    const m = perms?.['defaultMode'] ?? json?.['defaultMode'];
    return typeof m === 'string' ? m.trim() : '';
}

/**
 * Resolve what a hosted session will ACTUALLY run in.
 *
 * `requested` beats the settings layers because it becomes a CLI flag and a
 * flag beats a file — except for the managed layer, which is policy and beats
 * everything, including us.
 */
export function resolveEffectivePermission(
    requested: string, layers: PermissionLayer[]
): EffectivePermission {
    const want = (requested ?? '').trim();
    let fromSettings = '';
    let settingsFile = '';
    let blocked: { file: string; why: string } | undefined;
    for (const layer of layers) {
        const json = parse(layer.text);
        if (!json) { continue; }
        if (!fromSettings) {
            const m = modeIn(json);
            if (m) { fromSettings = m; settingsFile = layer.file; }
        }
        // ‼️ THE KEY AND ITS PATH ARE MEASURED, NOT GUESSED.
        //
        // Read out of the installed CLI (2026-08-14 build) rather than taken
        // from documentation: `c = n.permissions?.disableBypassPermissionsMode
        // === "disable"`, where `n` is the MERGED settings — so it is
        // `permissions.disableBypassPermissionsMode`, not a top-level key, and
        // it is honoured from whichever layer the merge took it from, not only
        // the managed file. Checking the wrong path would have let a policy the
        // CLI obeys pass silently, which is the shape of this whole item.
        if (!blocked) {
            const perms = json['permissions'] as Record<string, unknown> | undefined;
            if (String(perms?.['disableBypassPermissionsMode'] ?? '') === 'disable') {
                blocked = {
                    file: layer.file,
                    why: 'permissions.disableBypassPermissionsMode is "disable"'
                        + (layer.id === 'managed' ? ' in the managed policy' : ` in the ${layer.id} settings`)
                };
            }
        }
    }
    const effective = want || fromSettings;
    const wantsBypass = effective === BYPASS;
    if (wantsBypass && blocked) {
        return {
            requested: want, fromSettings, settingsFile, effective, bypass: false, blocked,
            why: `bypass was ${want ? 'chosen' : `inherited from ${settingsFile}`}, and ${blocked.why}`
        };
    }
    return {
        requested: want, fromSettings, settingsFile, effective, bypass: wantsBypass,
        why: wantsBypass
            ? (want
                ? 'bypass was chosen in the launcher — enforced with --dangerously-skip-permissions'
                : `Default resolves to bypassPermissions through ${settingsFile} — enforced with --dangerously-skip-permissions`)
            : want
                ? `${want} was chosen in the launcher`
                : fromSettings
                    ? `Default resolves to ${fromSettings} through ${settingsFile}`
                    : 'Default — the CLI asks, as configured'
    };
}

/**
 * The permission flags for a hosted spawn.
 *
 * ‼️ `--allow-dangerously-skip-permissions` GRANTS NOTHING. The CLI's own help
 * says so: "Enable bypassing all permission checks as an option, without it
 * being enabled by default." It is what makes the panel's live ⚠ control work,
 * and it stays for exactly that — it is never allowed to stand in for a bypass
 * that was actually asked for, which is the substitution that produced K-22.
 */
export function permissionFlags(
    decision: EffectivePermission
): { launch: string[]; mode: string[] } {
    if (decision.bypass) {
        // The one flag that ENFORCES it, and no `--permission-mode` beside it:
        // the mode is what the flag already says, and the CLI is not asked to
        // reconcile two spellings of the same instruction.
        return { launch: ['--dangerously-skip-permissions'], mode: [] };
    }
    return {
        launch: ['--allow-dangerously-skip-permissions'],
        mode: decision.requested ? ['--permission-mode', decision.requested] : []
    };
}

/**
 * ‼️ THE ONE THING BYPASS DOES NOT COVER — and it is refused, never approved.
 *
 * Claude keeps a circuit breaker that bypass cannot switch off: a recursive
 * delete aimed at a filesystem root or a home directory. If a request like that
 * ever reaches us on a bypassed session, auto-approving it is the worst
 * possible reading of "never ask me" — the user asked not to be interrupted,
 * not to have the machine deleted while they were not looking. So it is denied
 * automatically, recorded, and handed back to the agent as an ordinary tool
 * error, which is a thing an agent knows how to deal with.
 */
const CATASTROPHIC: { re: RegExp; why: string }[] = [
    { re: /\brm\s+(-[a-z]*[rR][a-z]*f|-[a-z]*f[a-z]*[rR])\s+["']?(\/|~|\$HOME|%USERPROFILE%)["']?\s*(\*|\/?\s*$)/, why: 'recursive force delete of / or the home directory' },
    { re: /\brm\s+(-[a-z]*[rR][a-z]*f|-[a-z]*f[a-z]*[rR])\s+["']?[a-zA-Z]:[\\/]?["']?\s*(\*)?\s*$/, why: 'recursive force delete of a drive root' },
    { re: /remove-item[\s\S]*-recurse[\s\S]*-force|remove-item[\s\S]*-force[\s\S]*-recurse/i, why: 'recursive force delete (PowerShell)' },
    { re: /\brd\s+\/s\s+\/q\s+["']?[a-zA-Z]:[\\/]?/i, why: 'recursive delete of a drive root (cmd)' },
    { re: /\bdel\s+\/[sfq]\s+[a-zA-Z]:[\\/]/i, why: 'recursive delete of a drive root (cmd)' },
    { re: /\bformat\s+[a-zA-Z]:/i, why: 'disk format' },
    { re: /\bmkfs\b|\bdd\s+if=[^\s]+\s+of=\/dev\//, why: 'disk overwrite' }
];

/** What a bypassed session does with a permission request that arrived anyway. */
export type BypassVerdict =
    | { kind: 'allow' }
    | { kind: 'deny'; why: string }
    | { kind: 'ask' };

/**
 * A `can_use_tool` on a session that IS in enforced bypass — a CLI regression,
 * because a bypassed process is not supposed to send one.
 *
 * - A question for the person (AskUserQuestion) is NOT a permission window and
 *   is left alone: the contract is "do not ask me for permission", not "do not
 *   let the agent talk to me".
 * - The catastrophic shapes above are denied.
 * - Everything else is approved silently and counted, so the session behaves
 *   the way its label promises.
 */
export function bypassVerdict(
    toolName: string, input: Record<string, unknown>, hasQuestions: boolean
): BypassVerdict {
    if (hasQuestions) { return { kind: 'ask' }; }
    const text = [input['command'], input['script'], input['cmd'], input['file_path'], input['path']]
        .filter(v => typeof v === 'string').join(' ; ');
    if (text) {
        for (const c of CATASTROPHIC) {
            if (c.re.test(text)) { return { kind: 'deny', why: c.why }; }
        }
    }
    void toolName;
    return { kind: 'allow' };
}
