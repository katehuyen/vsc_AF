/**
 * ‼️ K-33 — A COMMAND IS GIVEN TO A SHELL THAT IS READY FOR IT, NOT TO A PTY.
 *
 * Every terminal this extension opens was driven the same way:
 *
 *     const terminal = vscode.window.createTerminal({ … });
 *     terminal.show();
 *     terminal.sendText(command, true);
 *
 * The line is written on the statement AFTER the pty is created — before the
 * shell inside it has run its own startup (a PowerShell profile, oh-my-posh,
 * conda init, nvm). On a slow profile the written line is swallowed by, or
 * interleaved with, that startup's own output. The visible failure is specific
 * and was reported as such: a `claude --resume <id>` that loses its tail runs
 * as a bare `claude`, and a fresh process with no conversation opens the
 * ONBOARDING / LOGIN screen. The user's session appears to have evaporated.
 *
 * ‼️ THE FIX IS THE SIGNAL, NOT THE DELIVERY. VS Code knows when the shell has
 * finished starting — that is exactly when it can install its own integration
 * and `Terminal.shellIntegration` becomes defined. So this waits for that
 * signal and then sends the line with `sendText`, EXACTLY as before.
 * `TerminalShellIntegration.executeCommand` was the obvious alternative and is
 * deliberately not used: it interrupts whatever is running with ^C first, and
 * what these terminals run is a full-screen TUI. The race was never about how
 * the text was delivered; it was about when.
 *
 * Three ways out, so this can never hang a launch:
 *   · shell integration is switched off in the user's settings — the signal
 *     will never come, so nothing is waited for and the send is immediate.
 *     Otherwise every launch would pay the ceiling for a promise nobody made.
 *   · the ceiling passes — send anyway. That is today's behaviour, so the worst
 *     case of this change is exactly the behaviour it replaces.
 *   · the terminal is closed first — send nothing at all.
 *
 * The RULE is pure — the host is an interface, so it is tested directly rather
 * than through a pty. `terminalShellHost` below is the one adapter that knows
 * about VS Code, and it is here rather than at the three call sites so that
 * "when is a shell ready" has one answer in this codebase instead of three.
 */
import * as vscode from 'vscode';

/**
 * How long a launch may wait for the shell to say it has started.
 *
 * Long enough for a heavy Windows PowerShell profile, short enough that a user
 * whose integration silently never arrives is not left staring at an empty
 * terminal. When integration IS working the wait is normally a few hundred
 * milliseconds and nobody sees it.
 */
export const SHELL_READY_CEILING_MS = 3000;

export interface Disposable { dispose(): void }

/** Everything the rule needs from a real terminal, and nothing else. */
export interface ShellReadyHost {
    /** Has the shell already announced itself? (`terminal.shellIntegration`) */
    ready(): boolean;
    /** Could it ever? False when the user has switched integration off. */
    possible(): boolean;
    /** Fires when THIS terminal's shell integration arrives. */
    onReady(cb: () => void): Disposable;
    /** Fires when THIS terminal is closed. */
    onClosed(cb: () => void): Disposable;
    /** The delivery, unchanged: `terminal.sendText(line, true)`. */
    send(line: string): void;
    /** `setTimeout`, injected so the ceiling is testable without waiting. */
    timer(ms: number, cb: () => void): Disposable;
}

/**
 * Send `lines` in order, once the shell is ready to receive them.
 *
 * ‼️ ONCE. A resumed session sent twice would put two processes on one
 * transcript — the failure this codebase refuses everywhere else — so the
 * listener, the close watcher and the timer are all torn down by whichever of
 * them fires first, and the send is guarded by a flag as well as by that.
 */
export function sendWhenShellReady(
    host: ShellReadyHost,
    lines: string[],
    ceilingMs: number = SHELL_READY_CEILING_MS
): void {
    const send = () => { for (const line of lines) { host.send(line); } };

    // Already up, or never going to be: neither case has anything to wait for.
    if (host.ready() || !host.possible()) { send(); return; }

    let done = false;
    const subs: Disposable[] = [];
    const finish = (act: boolean) => {
        if (done) { return; }
        done = true;
        for (const s of subs) { try { s.dispose(); } catch { /* already gone */ } }
        if (act) { send(); }
    };

    subs.push(host.onReady(() => finish(true)));
    // A terminal closed before its shell reported in takes nothing: writing to
    // a dead pty is at best a no-op and at worst a line typed into whatever
    // reused its slot.
    subs.push(host.onClosed(() => finish(false)));
    // …and the ceiling, which is the old behaviour: send blind rather than
    // silently never start the session the user asked for.
    subs.push(host.timer(ceilingMs, () => finish(true)));
}

/**
 * The real thing: one terminal, VS Code's own signals.
 *
 * ‼️ `possible()` reads the SETTING rather than assuming. Shell integration is
 * on by default and injects into the shell's own startup, and a user who has
 * turned it off (or whose shell has no injection script) would otherwise pay
 * the full ceiling on every single launch for an event that cannot arrive.
 */
export function terminalShellHost(terminal: vscode.Terminal): ShellReadyHost {
    return {
        ready: () => !!terminal.shellIntegration,
        possible: () => vscode.workspace
            .getConfiguration('terminal.integrated.shellIntegration')
            .get<boolean>('enabled', true) !== false,
        onReady: (cb) => vscode.window.onDidChangeTerminalShellIntegration(e => {
            if (e.terminal === terminal) { cb(); }
        }),
        onClosed: (cb) => vscode.window.onDidCloseTerminal(t => {
            if (t === terminal) { cb(); }
        }),
        send: (line) => terminal.sendText(line, true),
        timer: (ms, cb) => {
            const h = setTimeout(cb, ms);
            return { dispose: () => clearTimeout(h) };
        }
    };
}

/** The whole pattern in one call — what every `createTerminal` site wants. */
export function sendToTerminalWhenReady(terminal: vscode.Terminal, ...lines: string[]): void {
    sendWhenShellReady(terminalShellHost(terminal), lines);
}
