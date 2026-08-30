/**
 * WHICH AGENT A COMMAND WAS INVOKED ABOUT.
 *
 * ‼️ S-48 — THE ROW YOU PRESSED IS THE ANSWER, AND IT HAS TO SURVIVE BEING
 * RESOLVED.
 *
 * Twenty commands take "an agent" and every surface knows a different amount:
 * a sidebar row hands over its whole tree node (`{kind:'agent', agent}`), a
 * webview row publishes an `agentId`, an older caller publishes a name. That
 * was already read in one place — and it read the node's own `AgentInfo`
 * straight back out, which is a SNAPSHOT of the fleet as it was when the row
 * was last drawn. An agent renamed, moved or removed since then started a
 * session in a folder that is not there any more, silently, because the object
 * still looked like an agent.
 *
 * So the argument NAMES an agent; the fleet ANSWERS. What comes back is one of
 * three things and never a guess:
 *
 *   - `{ agent }`  the caller named one and the fleet still has it;
 *   - `{ stale }`  the caller named one and the fleet does not — the name is
 *                  carried out so the refusal can say WHICH, because a command
 *                  that quietly picks somebody else is the defect this whole
 *                  file exists to make impossible;
 *   - `{}`         the caller named nobody at all, which is a real answer (the
 *                  Command Palette, a view-title button) and is the ONLY case
 *                  in which anyone is entitled to ask.
 *
 * Pure on purpose: no `vscode`, so the three outcomes are testable without a
 * window, which is what the acceptance for S-48 asks to be proved.
 */

/** The least an agent has to be for this file to answer about it. */
export interface AgentLike {
    id: string;
    name: string;
}

/**
 * Everything a caller may hand over. `agent` is the tree node's own object —
 * read for its KEYS, never returned as the answer.
 */
export type AgentArgShape = {
    agentId?: string;
    agentName?: string;
    agent?: { id?: string; name?: string };
} | undefined;

export interface AgentArgResult<T extends AgentLike> {
    /** the fleet's own row for the agent the caller named */
    agent?: T;
    /** the caller named an agent this fleet no longer has, by this name/id */
    stale?: string;
}

/** The keys a caller published, whatever shape they published them in. */
export function agentKeysOf(arg: AgentArgShape): { id: string; name: string } {
    const id = (arg?.agent?.id ?? arg?.agentId ?? '').trim();
    const name = (arg?.agent?.name ?? arg?.agentName ?? '').trim();
    return { id, name };
}

/**
 * Resolve what the caller published against the fleet as it is NOW.
 *
 * The id leads because it is the one key every surface publishes; the name is
 * the fallback for the surfaces that only ever had one (and for a row whose id
 * changed under it). Matching by name is not a guess — it is the caller's own
 * word — but it only counts when exactly one agent answers to it, or "manager"
 * on a fleet with two of them would start whichever happened to be first.
 */
export function resolveAgentArg<T extends AgentLike>(
    arg: AgentArgShape, agents: readonly T[]
): AgentArgResult<T> {
    const { id, name } = agentKeysOf(arg);
    if (!id && !name) { return {}; }
    if (id) {
        const byId = agents.find(a => a.id === id);
        if (byId) { return { agent: byId }; }
    }
    if (name) {
        const byName = agents.filter(a => a.name === name);
        if (byName.length === 1) { return { agent: byName[0] }; }
    }
    return { stale: name || id };
}
