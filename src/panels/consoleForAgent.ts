import type { LaunchDoorCtx } from '../launch/doors/index';
import { treeMenuDoor } from '../launch/doors/treeMenu';
import type { ConsoleOpenOpts } from './consolePanel';

/**
 * X-552 — WHAT "TALK TO THIS AGENT" OPENS THE CONSOLE ON, said once.
 *
 * The PC's command (agentfarm.consoleForAgent → ConsolePanel.show) and a
 * phone's Console view opened from an agent row (ConsolePanel.openOn) hand
 * the Console the same thing: the composer on that agent, PINNED, on the
 * tree menu door's whole answer (src/launch/doors/treeMenu.ts, X-151) — the
 * engine named beside the setup, because the composer opens on it (S-34).
 * Two call sites building it by hand would be two answers to one question.
 */
export function consoleOptsForAgent(agentId: string, door: Pick<LaunchDoorCtx, 'seed' | 'accountFor'>): ConsoleOpenOpts {
    const { engine, ...launch } = treeMenuDoor.collect({ agentId, seed: door.seed, accountFor: door.accountFor });
    return { agentId, pinAgent: true, ...(engine ? { engine } : {}), launch };
}
