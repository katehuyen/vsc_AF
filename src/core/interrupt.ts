/**
 * Interrupt — "stop what you are doing" for an interactive session.
 *
 * Headless work (tasks, missions) has always been stoppable: the farm spawned
 * the process and can kill its tree. A session the user is talking to is a
 * different animal — it lives inside a terminal, and the only thing that stops
 * a running turn is the key a human would press: **Esc**. So that is exactly
 * what this does — it types Esc into the session's own terminal. No signals,
 * no killed processes: the session survives, its turn does not.
 *
 * The honest limit is the external-terminal mode: an OS terminal window is not
 * ours to type into, so there the interrupt resolves to "focus that window" +
 * a message saying to press Esc. Better a truthful hand-off than a button that
 * pretends.
 *
 * Pure resolution here (which terminal is this session's?), the VS Code calls
 * live in the extension.
 */

/** ESC — the interrupt key of the Claude Code TUI. Sent as a single byte with
 *  no newline, exactly as a keypress arrives. */
export const INTERRUPT_KEY = '\u001b';

/**
 * ‼️ U-119 — ANSWERING A PERMISSION PROMPT WITHOUT GOING TO FIND THE TERMINAL.
 *
 * A CLI session that stops for permission stops on its own tty. Agent Farm knew
 * about it — the live monitor puts the lane in `waiting-permission` and Needs
 * You draws a row — and then offered "⌨ Terminal": a signpost. So the farm's
 * answer to "an agent is blocked on you" was to send you looking for a window,
 * which on 2026-08-28 meant a session sat blocked for an hour and a half with
 * no alert of any kind.
 *
 * Esc has been typed into these terminals since the interrupt was built, so the
 * channel was always there. Only the other half of it was missing.
 *
 * ‼️ AND THE KEYSTROKE IS A SETTING, NOT A CONSTANT. What a permission prompt
 * accepts belongs to the CLI, not to us, and it has worn more than one shape (a
 * y/n line, a numbered chooser). A hard-coded key a later build stops honouring
 * would make this button do NOTHING, silently — the worst possible failure for
 * a control whose whole promise is "answered". So: the default is stated here,
 * the user can correct it in one setting, and every send reports the exact keys
 * AND brings the terminal forward, so a wrong key is visible in one second
 * rather than being a mystery.
 */
export type PermissionAnswer = 'allow' | 'allowAlways' | 'deny';

/**
 * The defaults, and why each one:
 *   · `allow` — `1`, the first entry of the CLI's chooser, which is the plain
 *     "yes, this once". A number selects outright, and there is no Enter behind
 *     it: an Enter arriving at an already-answered prompt lands in the prompt
 *     box instead, and that is a keystroke nobody asked for.
 *   · `allowAlways` — `2`, "yes, and stop asking for this". A different
 *     decision, not a faster one, so it is a different button.
 *   · `deny` — ESC. The one answer here that is measured rather than reasoned:
 *     it is the same key the interrupt has sent since it was built.
 */
export const PERMISSION_KEYS: Record<PermissionAnswer, string> = {
    allow: '1',
    allowAlways: '2',
    deny: INTERRUPT_KEY
};

/**
 * What to type, given whatever the user has put in the setting.
 *
 * A blank or absent entry means "the built-in", never "send nothing": a control
 * that quietly sent an empty string would report success and answer nothing,
 * which is exactly the shape of failure this feature exists to end.
 */
export function permissionKeys(
    answer: PermissionAnswer, override?: Record<string, unknown>
): { keys: string; fromSetting: boolean } {
    const raw = override ? override[answer] : undefined;
    const keys = typeof raw === 'string' ? raw : '';
    return keys ? { keys, fromSetting: true } : { keys: PERMISSION_KEYS[answer], fromSetting: false };
}

/** Keys as a person reads them back — `ESC`, `Ctrl-C`, `1`. A message that said
 *  "sent ESC" would be reporting a byte, not an answer. */
export function describeKeys(keys: string): string {
    return String(keys ?? '').split('').map(ch => {
        if (ch === INTERRUPT_KEY) { return 'ESC'; }
        if (ch === '\r' || ch === '\n') { return 'Enter'; }
        if (ch < ' ') { return `Ctrl-${String.fromCharCode(ch.charCodeAt(0) + 64)}`; }
        return ch;
    }).join(' ');
}

/** A launch record, reduced to what the resolver needs. */
export interface TermRecord {
    /** pinned launch title ("claude: dev #7") — how an external window is found */
    title: string;
    /** the session this launch turned out to be, once the live monitor bound it */
    sessionId?: string;
    /** does this record still have a live integrated terminal? */
    hasTerminal: boolean;
    /** index into the caller's own terminal list (integrated only) */
    terminalIndex?: number;
}

export type InterruptTarget =
    | { kind: 'integrated'; terminalIndex: number; how: string }
    | { kind: 'external'; titles: string[]; how: string }
    | { kind: 'none'; how: string };

/** Terminal-name pattern of a farm-launched session: "claude: <agent> #3",
 *  "gemini: <agent>", or the pre-2.56 "claude: <agent>". Mirrors the matcher
 *  agentfarm.focusSessionTerminal uses, so both commands find the same window. */
export function terminalNamePattern(agentName: string): RegExp {
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return agentName
        ? new RegExp(`^[^:]+: ${esc(agentName)}( #\\d+)?$`)
        : /^claude: /;
}

/**
 * Which terminal should the Esc go to?
 *  1. the exact launch this session came from (bound by the live monitor);
 *  2. failing that, the newest integrated terminal named for the agent;
 *  3. failing that, an external window by its pinned title;
 *  4. nothing — say so.
 */
export function resolveInterrupt(input: {
    sessionId?: string;
    agentName?: string;
    /** launch records, oldest first */
    bindings: TermRecord[];
    /** names of the currently open integrated terminals, in VS Code's order */
    terminalNames: string[];
}): InterruptTarget {
    const { sessionId, agentName = '', bindings, terminalNames } = input;
    const binding = sessionId ? bindings.find(b => b.sessionId === sessionId) : undefined;
    if (binding?.hasTerminal && binding.terminalIndex !== undefined
        && binding.terminalIndex >= 0 && binding.terminalIndex < terminalNames.length) {
        return {
            kind: 'integrated', terminalIndex: binding.terminalIndex,
            how: 'the terminal this session was launched in'
        };
    }
    // A binding without a terminal means the session was launched into an OS
    // window — never fall through to a same-named integrated terminal, that
    // would interrupt somebody else's session. And without an agent name there
    // is nothing to match ON: focusing a random claude window is harmless, but
    // typing Esc into one is not, so an unidentifiable session gets a "no".
    if (agentName && !(binding && !binding.hasTerminal)) {
        const pattern = terminalNamePattern(agentName);
        let hit = -1;
        terminalNames.forEach((n, i) => { if (pattern.test(n)) { hit = i; } }); // newest wins
        if (hit >= 0) {
            return {
                kind: 'integrated', terminalIndex: hit,
                how: agentName ? `the newest terminal named for ${agentName}` : 'the newest claude terminal'
            };
        }
    }
    // Nothing integrated matched. An external window is only worth searching
    // for when there is something to search BY — this session's own pinned
    // launch title, or the agent's name. Without either, say so instead of
    // grabbing whatever window happens to be called "claude".
    const titles = [
        ...(binding && !binding.hasTerminal ? [binding.title] : []),
        ...(agentName ? [`claude: ${agentName}`, agentName] : [])
    ];
    if (titles.length) {
        return { kind: 'external', titles, how: 'an external terminal window — Esc has to be pressed there' };
    }
    return { kind: 'none', how: 'no terminal found for this session' };
}
