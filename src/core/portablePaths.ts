/**
 * Portable paths — the farm's persisted stores (farm-tasks.json, missions.json,
 * task-history) are git-synced between machines, yet they record absolute
 * machine-specific paths (C:\Users\<name>\.claude\…, …\globalStorage\…). On
 * save, every occurrence of a known machine root inside any stored string is
 * replaced with a token (${claudeDir} / ${globalStorage} / ${home}); on load,
 * tokens expand to THIS machine's roots — the same store file works wherever
 * it is pulled.
 *
 * Legacy stores predate the tokens, so expansion also HEALS whole-string
 * absolute paths that clearly point into a known root recorded on another
 * machine: a path through `…\.claude\` is re-rooted onto the current claude
 * dir, one through `…\globalStorage\<ext-id>\` onto the current extension
 * storage. Prose strings (prompts, notes) are never healed — only values that
 * are themselves absolute paths.
 */

export interface PortableRoot {
    token: string;    // e.g. '${claudeDir}'
    path: string;     // this machine's absolute root, no trailing slash
}

/** The three standard roots, most specific first (claudeDir and globalStorage
 *  usually live under home — order prevents home from swallowing them). */
export function standardRoots(opts: { claudeDir: string; globalStorage: string; home: string }): PortableRoot[] {
    const clean = (p: string) => p.replace(/[\\/]+$/, '');
    return [
        { token: '${claudeDir}', path: clean(opts.claudeDir) },
        { token: '${globalStorage}', path: clean(opts.globalStorage) },
        { token: '${home}', path: clean(opts.home) }
    ].filter(r => r.path.length > 3); // never tokenize a bare drive root
}

/** Regex matching one root path, case-insensitive, either slash style. */
function rootRegex(rootPath: string): RegExp {
    // ‼️ WRITTEN AS AN ESCAPE, NEVER AS THE BYTE ITSELF. A literal NUL in a
    // source file makes ripgrep (and therefore every search in this repo, by a
    // person or an agent) call the whole file BINARY and skip it silently — this
    // one was invisible to `grep` for as long as it was here. `'\u0000'` is the
    // same character to the runtime and an ordinary line to everything else.
    const pattern = rootPath
        .replace(/[\\/]+/g, '\u0000')                      // separator placeholder
        .replace(/[.*+?^${}()|[\]\\/]/g, ch => '\\' + ch)  // escape regex chars
        .replace(/\u0000/g, '[\\\\/]');
    return new RegExp(pattern, 'gi');
}

/** Replace every occurrence of every root with its token (prose included —
 *  a prompt naming a home path round-trips portably too). */
export function tokenizePath(s: string, roots: PortableRoot[]): string {
    let out = s;
    for (const r of roots) {
        out = out.replace(rootRegex(r.path), r.token);
    }
    return out;
}

const ABS = /^([A-Za-z]:[\\/]|\\\\)/;   // drive letter or UNC — "this value IS a path"

/** Expand tokens back to this machine's roots; then heal legacy whole-string
 *  absolute paths recorded on another machine. */
export function expandPath(s: string, roots: PortableRoot[]): string {
    let out = s;
    for (const r of roots) {
        out = out.split(r.token).join(r.path);
    }
    if (!ABS.test(out)) { return out; }
    // already under a current root → nothing to heal
    for (const r of roots) {
        if (out.search(rootRegex(r.path)) === 0) { return out; }
    }
    const claude = roots.find(r => r.token === '${claudeDir}');
    const storage = roots.find(r => r.token === '${globalStorage}');
    const mClaude = /[\\/]\.claude(?=[\\/]|$)/i.exec(out);
    if (claude && mClaude) {
        return claude.path + out.slice(mClaude.index + mClaude[0].length);
    }
    const mStore = /[\\/]globalStorage[\\/][^\\/]+(?=[\\/]|$)/i.exec(out);
    if (storage && mStore) {
        return storage.path + out.slice(mStore.index + mStore[0].length);
    }
    return out;
}

/** Deep-walk any JSON-shaped value, transforming every string. */
function walk(value: unknown, fn: (s: string) => string): unknown {
    if (typeof value === 'string') { return fn(value); }
    if (Array.isArray(value)) { return value.map(v => walk(v, fn)); }
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) { out[k] = walk(v, fn); }
        return out;
    }
    return value;
}

export function tokenizeDeep<T>(value: T, roots: PortableRoot[]): T {
    return walk(value, s => tokenizePath(s, roots)) as T;
}

export function expandDeep<T>(value: T, roots: PortableRoot[]): T {
    return walk(value, s => expandPath(s, roots)) as T;
}

/**
 * ‼️ X-57 — A PATH SOMEBODY TYPED, NOT A PATH THE FARM STORED.
 *
 * Everything above is about the farm's OWN stores: values it wrote, tokenised
 * on the way out so the file survives being pulled onto another machine. This
 * is the other direction — a folder the USER typed into a setting, in whichever
 * spelling their shell taught them — and the two must not be confused, because
 * a setting is never rewritten behind the user's back. What they typed stays in
 * `settings.json` exactly as typed; only what the code OPENS is expanded, so
 * the same `settings.json` can be synced to a machine with a different home.
 *
 * The forms are the ones people actually type: `~` (POSIX, and every tutorial),
 * `%USERPROFILE%` (cmd, and how a Windows path gets pasted), `$HOME` and
 * `${env:VAR}` (VS Code's own settings grammar), plus `${workspaceRoot}` /
 * `${workspaceFolder}` for a folder inside the open project.
 *
 * ‼️ AN UNKNOWN VARIABLE IS LEFT ALONE RATHER THAN BLANKED. `${nope}/wiki`
 * collapsing to `/wiki` would quietly name the drive root and the compile would
 * read an empty folder as an empty wiki; left unexpanded, the path visibly does
 * not exist and the page says so.
 */
export function expandUserPath(
    raw: string,
    ctx: { home?: string; workspaceRoot?: string; env?: Record<string, string | undefined> } = {}
): string {
    const s = String(raw ?? '').trim();
    if (!s) { return ''; }
    const env = ctx.env ?? process.env;
    const trail = (p: string) => p.replace(/[\\/]+$/, '');
    const home = trail(ctx.home || env.USERPROFILE || env.HOME || '');
    const ws = trail(ctx.workspaceRoot || '');
    const lookup = (name: string): string | undefined => {
        const k = name.toLowerCase();
        if (k === 'workspaceroot' || k === 'workspacefolder') { return ws || undefined; }
        if (k === 'home' || k === 'userhome') { return home || undefined; }
        // Case-insensitive, because Windows environment variables are: a path
        // typed as %userprofile% is the same path as %USERPROFILE%.
        const hit = Object.keys(env).find(n => n.toLowerCase() === k);
        return hit ? env[hit] : undefined;
    };
    let out = s;
    // `~` only at the start and only as a whole segment: `~/wiki` is home, but
    // `C:\PROGRA~1\wiki` is a real folder name on a real disk.
    if (out === '~') { out = home || out; }
    else if (/^~[\\/]/.test(out) && home) { out = home + out.slice(1); }
    out = out.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (m, n) => lookup(n) ?? m);
    out = out.replace(/\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, n) => lookup(n) ?? m);
    out = out.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (m, n) => lookup(n) ?? m);
    return out;
}
