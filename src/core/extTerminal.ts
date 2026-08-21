import * as cp from 'child_process';

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
}

export function openExternalTerminal(
    cwd: string | undefined, command: string, title?: string, opts: ExternalRunOptions = {}
): void {
    const keepOpen = opts.keepOpen !== false;
    if (process.platform === 'win32') {
        // `&` and not `&&`: the code has to be written whether the CLI succeeded
        // or not, and `&&` would skip it on exactly the runs worth reporting.
        // The quotes around the path are what lets it live under a user folder
        // with a space in the name.
        const full = opts.exitFile
            ? `${command} & echo %ERRORLEVEL%> "${opts.exitFile}"`
            : command;
        const wtArgs = [
            // own window per session: as a tab in a shared window the pinned
            // title hides behind the active tab's — AppActivate can't find it
            '-w', 'new',
            ...(title ? ['--title', title, '--suppressApplicationTitle'] : []),
            ...(cwd ? ['-d', cwd] : []),
            'cmd', keepOpen ? '/k' : '/c', full
        ];
        const wt = cp.spawn('wt', wtArgs, { detached: true, stdio: 'ignore' });
        wt.on('error', () => {
            const startArgs = ['/c', 'start', title ?? '', ...(cwd ? ['/D', cwd] : []),
                'cmd', keepOpen ? '/k' : '/c', full];
            cp.spawn('cmd', startArgs, { detached: true, stdio: 'ignore' }).unref();
        });
        wt.unref();
        return;
    }
    const posixTail = opts.exitFile
        ? `; printf '%s' "$?" > ${JSON.stringify(opts.exitFile)}`
        : '';
    if (process.platform === 'darwin') {
        const body = (cwd ? `cd ${JSON.stringify(cwd)} && ` : '') + command + posixTail
            + (keepOpen ? '' : '; exit');
        const script = `tell application "Terminal" to do script "${body.replace(/"/g, '\\"')}"`;
        cp.spawn('osascript', ['-e', script, '-e', 'tell application "Terminal" to activate'],
            { detached: true, stdio: 'ignore' }).unref();
        return;
    }
    const sh = `${cwd ? `cd ${JSON.stringify(cwd)} && ` : ''}${command}${posixTail}`
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
