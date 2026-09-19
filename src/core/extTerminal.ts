import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Opens `command` in the OS terminal instead of the integrated one.
 *
 * VS Code's terminal is xterm.js inside Chromium — long TUI sessions (claude) can hit
 * rendering glitches there (ghost spaces, lost lines). Native terminals don't.
 * Windows: prefers Windows Terminal (`wt`), falls back to a plain cmd window.
 *
 * `title` pins the tab/window title (suppressing the app's own title updates on wt)
 * so the window can later be found again by focusExternalTerminal.
 */
export interface ExternalRunOptions {
    /**
     * ‼️ M-26 — DOES THE WINDOW STAY WHEN THE COMMAND RETURNS?
     *
     * Default true, which is what every caller before this meant: a person
     * opened a session and the window is theirs. An interactive TASK set to
     * `auto-close` means the opposite — the window was there to be watched, and
     * once the answer is printed it is only something to dismiss.
     */
    keepOpen?: boolean;
    /**
     * ‼️ M-26 — WHERE THE COMMAND'S OWN EXIT CODE IS LEFT.
     *
     * A detached launcher returns the moment the terminal has taken the command,
     * so the caller's `child.on('exit')` is about the launcher and says nothing
     * about the run. Nothing else can be observed about a window this process
     * does not own. So the command line grows a second statement that writes the
     * code to this path, and the caller reads it — the process's own answer,
     * through the only channel there is.
     */
    exitFile?: string;
    /**
     * ‼️ X-104 — THE ENVIRONMENT THIS WINDOW RUNS IN, in the same shape the
     * integrated terminal takes: a value SETS, `null` CLEARS.
     *
     * The OS window was the one launch surface in the extension that carried no
     * environment at all. The integrated terminal has taken an overlay since
     * X-101 — the agent's own variables plus the route's endpoint and key, and
     * the names to clear so an inherited Anthropic route cannot answer the same
     * question a second time — and the external branch dropped every bit of it.
     * A person with `agentFarm.externalTerminal` on therefore ran on the DEFAULT
     * route while the launcher, the badge and the manifest all said Kimi.
     *
     * Absent means "inherit, untouched", which is what every caller written
     * before this meant and what an unrouted window must keep doing.
     */
    env?: Record<string, string | null>;
}

/**
 * The overlay split into the two things a shell can be told: what to set and
 * what to unset. Empty values count as clears — a shell has no third state, and
 * "set to nothing" is how a leftover route name would survive as a falsy answer
 * nobody meant to give.
 */
function envParts(env: Record<string, string | null> | undefined):
    { set: Array<[string, string]>; clear: string[] } {
    const out: { set: Array<[string, string]>; clear: string[] } = { set: [], clear: [] };
    for (const [name, value] of Object.entries(env || {})) {
        // A name a shell cannot hold is not written at all; passing it on would
        // put a broken statement in front of the command that matters.
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) { continue; }
        if (value === null || value === undefined || value === '') { out.clear.push(name); }
        else { out.set.push([name, String(value)]); }
    }
    return out;
}

/** A value as one POSIX single-quoted word — the only quoting that leaves `$`,
 *  a backtick and `!` alone, which an API key may contain. */
function shQuote(value: string): string {
    return `'${value.split("'").join(`'\\''`)}'`;
}

/**
 * ‼️ M-26 — ON WINDOWS THE COMMAND TRAVELS AS A FILE, NOT AS A COMMAND LINE.
 *
 * node → wt → cmd is three parsers in a row and they do not agree about
 * quoting. node escapes an inner `"` as `\"` — the C runtime's rule, which
 * `cmd.exe` has never understood — and EVERY command that reaches here has
 * inner quotes, because the prompt is one. Measured on this machine: a wt
 * launch carrying `node -e "…" & …` opened a window that ran nothing and left
 * no exit file, while the identical launch without inner quotes worked. So the
 * surface was not "mostly working": it never worked at all.
 *
 * A script crosses none of those parsers. It is also the only place the exit
 * code can be read correctly: a batch file is parsed A LINE AT A TIME, so
 * `%ERRORLEVEL%` on the line after the command is that command's own. On a
 * one-line `&` chain it is expanded before anything has run — measured as a
 * literal `0` whatever the CLI returned, which is the quietest possible way to
 * report every failure as a success. (And `echo 0> f` is not an echo at all:
 * a digit touching `>` is a HANDLE, so that line redirected STDIN and left the
 * file empty — `Number('')` is 0, so that read as success too.)
 *
 * The one thing a script does to a command that a command line does not is `%`:
 * in batch it opens a variable, so every `%` is doubled here. Round-tripped
 * against a prompt carrying `%`, `!`, `&`, `<`, `>` and quotes — intact.
 *
 * It removes itself on its last line: cmd has already read that line by the
 * time it runs, so a window nobody is watching leaves nothing behind.
 *
 * Exported for the same reason `posixEnvPrefix` is: the script IS the channel
 * on this platform, so what it says about the environment can only be measured
 * by reading it — and X-117 runs the real CLI through one, which needs the path
 * without opening a window on somebody's desktop.
 */
export function writeWindowsRunScript(
    cwd: string | undefined, command: string, title: string | undefined,
    exitFile?: string, env?: Record<string, string | null>
): string {
    const esc = (s: string): string => s.split('%').join('%%');
    // The OS scratch folder, not the task outputs folder: this file deletes
    // itself on its last line, so it is a launcher and never a record.
    const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const file = path.join(os.tmpdir(), `af-run-${stamp}.cmd`);
    const lines = ['@echo off'];
    // The window names ITSELF, which is what lets the `start` fallback below
    // pass an empty title (see there) and still be findable by AppActivate.
    if (title) { lines.push('title ' + esc(title)); }
    if (cwd) { lines.push(`cd /d "${esc(cwd)}"`); }
    const parts = envParts(env);
    // Clearing is names only, and a name is not a secret — it goes in the script.
    for (const name of parts.clear) { lines.push(`set "${name}="`); }
    if (parts.set.length) {
        /**
         * ‼️ X-104 — THE VALUES TRAVEL IN A FILE THE SCRIPT EATS, AND THEY DO
         * NOT TRAVEL IN THE SCRIPT.
         *
         * A route's value is an API key. There is no in-memory channel to an OS
         * window: `wt.exe` is a thin client when Windows Terminal is already
         * running, so the new window is created by a process that started long
         * before this one and inherits nothing we could set here — measured
         * behaviour of `wt`, and the reason an `env:` on the spawn cannot be
         * the answer on this platform.
         *
         * So the key does reach disk, and the design is about how briefly. The
         * script's FIRST act after `cd` is to read this file and DELETE it, so
         * the window closing at any later moment — with the CLI still running,
         * killed, or never reaching the end of the script — leaves nothing.
         * Writing the values into the script itself would instead leave them
         * for as long as the session lasts, because `del "%~f0"` is the LAST
         * line and a session is exactly the case that never reaches it.
         *
         * `tokens=1,* delims==` splits on the FIRST `=` only, so a value
         * carrying `=` (a base64 key) arrives whole; the value is substituted
         * after parsing, so `%` and `!` in it are not re-read.
         */
        const envFile = path.join(os.tmpdir(), `af-env-${stamp}.txt`);
        fs.writeFileSync(envFile,
            parts.set.map(([k, v]) => `${k}=${v}`).join('\r\n') + '\r\n',
            { encoding: 'utf8', mode: 0o600 });
        lines.push(`for /f "usebackq tokens=1,* delims==" %%A in ("${esc(envFile)}") do set "%%A=%%B"`);
        lines.push(`del /q "${esc(envFile)}" >nul 2>&1`);
    }
    lines.push(esc(command));
    if (exitFile) { lines.push(`(echo %ERRORLEVEL%)> "${esc(exitFile)}"`); }
    lines.push('del /q "%~f0" >nul 2>&1');
    fs.writeFileSync(file, lines.join('\r\n') + '\r\n', 'utf8');
    return file;
}

/**
 * The `export`/`unset` statements a POSIX shell needs, as one prefix.
 *
 * ‼️ NOTHING REACHES DISK HERE. A POSIX terminal is spawned by THIS process, so
 * the statements travel in the command line the shell is handed — which is the
 * channel Windows does not have (see writeWindowsRunScript).
 *
 * Exported so the QUOTING can be measured on its own. By the time these
 * statements reach `cp.spawn` they have been through the launcher's own two
 * layers — `bash -c '…'` on Linux, an AppleScript string on macOS — and a test
 * reading them there would be asserting against three escapings at once, which
 * is how a quoting bug hides inside a passing test.
 */
export function posixEnvPrefix(env: Record<string, string | null> | undefined): string {
    const parts = envParts(env);
    const out: string[] = [];
    for (const name of parts.clear) { out.push(`unset ${name}`); }
    for (const [name, value] of parts.set) { out.push(`export ${name}=${shQuote(value)}`); }
    return out.length ? out.join('; ') + '; ' : '';
}

export function openExternalTerminal(
    cwd: string | undefined, command: string, title?: string, opts: ExternalRunOptions = {}
): void {
    const keepOpen = opts.keepOpen !== false;
    if (process.platform === 'win32') {
        const script = writeWindowsRunScript(cwd, command, title, opts.exitFile, opts.env);
        const wtArgs = [
            // own window per session: as a tab in a shared window the pinned
            // title hides behind the active tab's — AppActivate can't find it
            '-w', 'new',
            ...(title ? ['--title', title, '--suppressApplicationTitle'] : []),
            ...(cwd ? ['-d', cwd] : []),
            'cmd', keepOpen ? '/k' : '/c', script
        ];
        const wt = cp.spawn('wt', wtArgs, { detached: true, stdio: 'ignore' });
        wt.on('error', () => {
            // ‼️ THE TITLE IS AN EMPTY ARGUMENT HERE, ALWAYS. `start` reads its
            // first token as the window title only when that token is QUOTED,
            // and a title without a space reaches it unquoted — at which point
            // `start` goes looking for a program by that name and answers "The
            // system cannot find the file …". Measured. The script names its own
            // window, so nothing is lost by leaving this empty.
            const startArgs = ['/c', 'start', '', ...(cwd ? ['/D', cwd] : []),
                'cmd', keepOpen ? '/k' : '/c', script];
            cp.spawn('cmd', startArgs, { detached: true, stdio: 'ignore' }).unref();
        });
        wt.unref();
        return;
    }
    const posixTail = opts.exitFile
        ? `; printf '%s' "$?" > ${JSON.stringify(opts.exitFile)}`
        : '';
    // ‼️ X-104 — BEFORE THE `cd`, so a route named here is in force for
    // everything the window runs, including anything the folder's own shell
    // startup would read.
    const envPrefix = posixEnvPrefix(opts.env);
    if (process.platform === 'darwin') {
        const body = envPrefix + (cwd ? `cd ${JSON.stringify(cwd)} && ` : '') + command + posixTail
            + (keepOpen ? '' : '; exit');
        const script = `tell application "Terminal" to do script "${body.replace(/"/g, '\\"')}"`;
        cp.spawn('osascript', ['-e', script, '-e', 'tell application "Terminal" to activate'],
            { detached: true, stdio: 'ignore' }).unref();
        return;
    }
    const sh = envPrefix + `${cwd ? `cd ${JSON.stringify(cwd)} && ` : ''}${command}${posixTail}`
        + (keepOpen ? '; exec $SHELL' : '');
    cp.spawn('x-terminal-emulator', ['-e', `bash -c '${sh.replace(/'/g, "'\\''")}'`],
        { detached: true, stdio: 'ignore' }).unref();
}

/** Bring an external terminal window to the foreground by trying each title in
 *  order (Windows: WScript AppActivate matches window titles — the wt window
 *  title is its active tab's title, which openExternalTerminal pins).
 *  Calls back with true when one of the titles matched. */
export function focusExternalTerminal(titles: string[], done: (found: boolean) => void): void {
    if (process.platform !== 'win32') { done(false); return; }
    const list = titles.filter(Boolean).map(t => `'${t.replace(/'/g, "''")}'`).join(',');
    if (!list) { done(false); return; }
    const script = `$w=New-Object -ComObject WScript.Shell; foreach($t in @(${list})){ if($w.AppActivate($t)){ exit 0 } }; exit 1`;
    cp.execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script],
        { timeout: 5000, windowsHide: true },
        (err) => done(!err));
}
