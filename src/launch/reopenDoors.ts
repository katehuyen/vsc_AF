/**
 * ‼️ S-109 — EVERY DOOR THAT REOPENS A SESSION, AS DATA.
 *
 * The rule — a reopened session opens with what it CLOSED with — was repaired
 * door by door nine times and broke at the door nobody had listed. The new
 * session doors have had a register and a matrix since X-151; the reopen
 * doors had neither, so a tenth door or a new dimension failed no test.
 *
 * `test/test_reopen_parity.js` reads this file against the source: each door's
 * anchor must exist, a `reopenFor` door must ask the one answer and must not
 * order the layers itself, a Console spawn that resumes outside every listed
 * door fails the build, and every launch dimension in `media/afDimensions.js`
 * must say here how it comes back.
 *
 * `via`:
 *   reopenFor — asks `src/launch/reopen.ts` (directly, or through a dep named
 *               reopenSetup / reopenLate)
 *   card      — reopens a LIVE card from the card's own state, which is the
 *               closing answer itself (the listener beside the card is what
 *               writes the durable record the other doors read)
 *   delegate  — hands the click to a door above
 */
export type ReopenVia = 'reopenFor' | 'card' | 'delegate';

export interface ReopenDoor {
    id: string;
    file: string;
    /** A string that occurs EXACTLY ONCE in `file` and opens the door's block. */
    anchor: string;
    /** `same` reopens the conversation itself; `continuation` opens its successor. */
    kind: 'same' | 'continuation';
    via: ReopenVia;
    why: string;
}

export const REOPEN_DOORS: readonly ReopenDoor[] = [
    {
        id: 'card-resume', file: 'src/extension.ts', anchor: "registerCommand('agentfarm.consoleResumeSession'",
        kind: 'same', via: 'card', why: 'an ended card restarts from its own state, the closing answer itself'
    },
    {
        id: 'console-list-resume', file: 'src/panels/consolePanel.ts', anchor: "case 'resume': {",
        kind: 'same', via: 'reopenFor', why: 'the Console\'s resume list, the phone\'s Console page included'
    },
    {
        id: 'resume-in-console', file: 'src/extension.ts', anchor: "registerCommand('agentfarm.resumeInConsole'",
        kind: 'same', via: 'reopenFor', why: 'Sessions right-click, session page, palette, Continue in the Console'
    },
    {
        id: 'bridge-console-start', file: 'src/extension.ts', anchor: "op: 'console.start',",
        kind: 'same', via: 'reopenFor', why: 'console.start resume='
    },
    {
        id: 'bridge-sessions-start', file: 'src/extension.ts', anchor: "op: 'sessions.start',",
        kind: 'same', via: 'reopenFor', why: 'sessions.start resume= (a terminal)'
    },
    {
        id: 'terminal-resume', file: 'src/extension.ts', anchor: "registerCommand('agentfarm.resumeSession'",
        kind: 'same', via: 'reopenFor', why: 'Resume in a terminal; its account picker leads with the closing account'
    },
    {
        id: 'session-page-resume', file: 'src/panels/sessionViewer.ts', anchor: "case 'resume': {",
        kind: 'same', via: 'delegate', why: 'the session page hands Resume to the terminal or Console door'
    },
    {
        id: 'continue-latest', file: 'src/extension.ts', anchor: "registerCommand('agentfarm.continueSession'",
        kind: 'same', via: 'reopenFor', why: 'Continue: the latest row, resumed by id on what it closed with'
    },
    {
        id: 'revive', file: 'src/extension.ts', anchor: 'const reviveAfterRestart = async',
        kind: 'same', via: 'card', why: 'a restart with resume=true re-spawns each card from its full snapshot'
    },
    {
        id: 'account-move', file: 'src/core/consolehost.ts', anchor: 'private async reseal(',
        kind: 'same', via: 'card', why: 'moving a card to another account: the new slot is the explicit answer, the rest is the card'
    },
    {
        id: 'task-resume', file: 'src/core/tasks.ts', anchor: 'if (task.resumeSessionId && this.opts.reopenSetup) {',
        kind: 'same', via: 'reopenFor', why: 'a task continuing its conversation (revive after a window, smart retry, next round)'
    },
    {
        id: 'baton-leg', file: 'src/extension.ts', anchor: 'door: opener => {',
        kind: 'continuation', via: 'reopenFor', why: 'every successor of a relay (pass, seal, rescue, flagged); the account is S-106\'s'
    },
    {
        id: 'continue-from-handover', file: 'src/panels/consolePanel.ts', anchor: 'static continueFromHandover(',
        kind: 'continuation', via: 'card', why: 'fills the composer from the live card; the boxes are on screen and the person sends'
    }
];

/**
 * Spawns that resume a conversation but are NOT a reopen, by name and why —
 * the parity test refuses a resuming spawn anywhere else.
 */
export const NOT_REOPENS: readonly { file: string; anchor: string; why: string }[] = [
    { file: 'src/extension.ts', anchor: 'findSession: (id) => {', why: 'sessions.context: a /context measurement on the model that answered last' },
    { file: 'src/panels/sessionViewer.ts', anchor: 'export function runContextCapture(', why: 'the page\'s Capture now: a one-turn `-p "/context"` measurement, not a reopen' }
];

/**
 * How each launch dimension comes back on a reopen. A dimension added to
 * `media/afDimensions.js` and missing here fails test_reopen_parity.
 */
export const REOPEN_DIMENSIONS: Readonly<Record<string, string>> = {
    engine: 'the session\'s own: a conversation belongs to its transcript\'s engine',
    account: 'closing: explicit → the card\'s record → the launch; a baton leg: S-106; a task: its own policy',
    providerId: 'the X-109 gate pins the conversation\'s own route',
    tier: 'rides with providerId through the gate',
    variant: 'not carried back: the engine\'s own default',
    model: 'closing: explicit → newest of card record and transcript → launch → agent → fleet',
    effort: 'closing: as model',
    permissionMode: 'closing: as model; K-22 still resolves it against the folder',
    superpowers: 'the launch manifest\'s, else the agent default',
    permission: 'farm: K-22 resolves it at the spawn',
    name: 'not carried: a reopen keeps the session\'s title',
    prompt: 'not carried: the reopen\'s own words',
    resume: 'the reopened session itself',
    continueLast: 'resolved to a session id where one is known (continue-latest)',
    routePinned: 'the X-109 gate',
    projectContextFile: 'the session\'s own project, re-told (sessionOwnProject)',
    cwd: 'the session\'s own folder',
    cli: 'not carried back: the door\'s launch value'
};
