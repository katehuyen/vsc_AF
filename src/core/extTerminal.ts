import * as cp from 'child_process';

/**
 * Opens `command` in the OS terminal instead of the integrated one.
 *
 * VS Code's terminal is xterm.js inside Chromium — long TUI sessions (claude) can hit
 * rendering glitches there (ghost spaces, lost lines). Native terminals don't.
 * Windows: prefers Windows Terminal (`wt`), falls back to a plain cmd window.
 */
export function openExternalTerminal(cwd: string | undefined, command: string): void {
    if (process.platform === 'win32') {
        const wtArgs = [...(cwd ? ['-d', cwd] : []), 'cmd', '/k', command];
        const wt = cp.spawn('wt', wtArgs, { detached: true, stdio: 'ignore' });
        wt.on('error', () => {
            const startArgs = ['/c', 'start', '', ...(cwd ? ['/D', cwd] : []), 'cmd', '/k', command];
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
