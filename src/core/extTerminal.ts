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
export function openExternalTerminal(cwd: string | undefined, command: string, title?: string): void {
    if (process.platform === 'win32') {
        const wtArgs = [
            ...(title ? ['--title', title, '--suppressApplicationTitle'] : []),
            ...(cwd ? ['-d', cwd] : []),
            'cmd', '/k', command
        ];
        const wt = cp.spawn('wt', wtArgs, { detached: true, stdio: 'ignore' });
        wt.on('error', () => {
            const startArgs = ['/c', 'start', title ?? '', ...(cwd ? ['/D', cwd] : []), 'cmd', '/k', command];
            cp.spawn('cmd', startArgs, { detached: true, stdio: 'ignore' }).unref();
        });
        wt.unref();
        return;
    }
    if (process.platform === 'darwin') {
        const script = `tell application "Terminal" to do script "${(cwd ? `cd ${JSON.stringify(cwd)} && ` : '') + command.replace(/"/g, '\\"')}"`;
        cp.spawn('osascript', ['-e', script, '-e', 'tell application "Terminal" to activate'],
            { detached: true, stdio: 'ignore' }).unref();
        return;
    }
    const sh = `${cwd ? `cd ${JSON.stringify(cwd)} && ` : ''}${command}; exec $SHELL`;
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
