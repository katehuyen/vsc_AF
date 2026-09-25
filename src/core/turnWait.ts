/**
 * U-148 — A TURN CAN BE WAITING TOO, NOT ONLY A TURN THAT ENDED.
 *
 * `liveWait.ts` turns a RESTING session with background work behind it purple.
 * A session can also wait INSIDE its turn: it started a command in the
 * background, then blocks in a call whose only job is to wait for it — a shell
 * `until … sleep` loop, a bare `sleep`, `TaskOutput` with `block`. The model is
 * idle, nothing is waiting on the user, and the card said "working". The call
 * is classified when it is made, from its FULL input (the message keeps only a
 * cut of the command), and the card reads the mark while that call is the last
 * thing the CLI has not answered. Pure.
 */

const SHELLS = new Set(['Bash', 'PowerShell']);
const LOOP = /\b(until|while)\b[\s\S]*\b(sleep|Start-Sleep)\b/i;
const BARE = /^\s*(sleep|Start-Sleep)\s+\S+\s*$/i;

/** Is this tool call a wait on something already running? */
export function isWaitCall(name: string, input: Record<string, unknown> | undefined): boolean {
    if (name === 'TaskOutput') { return input?.block !== false; }
    if (!SHELLS.has(name) || input?.run_in_background === true) { return false; }
    const cmd = String(input?.command ?? '');
    return LOOP.test(cmd) || BARE.test(cmd);
}

interface Msg { role: string; tool?: { name: string; detail: string; wait?: boolean } }

/** What a WORKING turn is blocked waiting on right now ('' = it is not): its last, unanswered call, marked as a wait. */
export function turnWaitingOn(s: { status: string; messages: readonly Msg[] }): string {
    if (s.status !== 'working') { return ''; }
    const m = s.messages[s.messages.length - 1];
    return m && m.role === 'tool' && m.tool?.wait ? (m.tool.detail || m.tool.name) : '';
}
