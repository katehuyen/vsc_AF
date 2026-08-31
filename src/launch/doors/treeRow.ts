import { LaunchIntent } from '../../core/launchDimensions';
import { LaunchDoor, LaunchDoorCtx, pick } from './index';

export const treeRowDoor: LaunchDoor = {
    id: 'treeRow',
    wired: true,
    label: 'Agents tree, inline play',
    surface: 'terminal',
    why: 'the play button on an agent row - the shortest path to a session, and therefore '
        + 'the one a new dimension is most likely to be forgotten at.',
    exempt: {
        superpowers: 'LEFT UNSTATED ON PURPOSE, and the call site says so: unstated is '
            + 'precisely how agentFarm.superpowersDefaults gets to answer it (K-34, three states).',
        prompt: 'this door starts a FRESH session and asks nothing - there is no first prompt.',
        name: 'no name is asked for; the session takes the agent own name.',
        resume: 'this door STARTS. Continuing is agentfarm.continueSession, its own door.',
        continueLast: 'same: starting and continuing are two doors, deliberately.'
    },
    /**
     * X-145 - THE PER-ENGINE DEFAULT, RESOLVED FROM SETTINGS, NOT FROM THE LAST
     * RUN. Deterministic: the same agent on the same engine gives the same
     * session every time, whatever anybody did in another window ten minutes
     * ago. The whole object travels - this door names no fields.
     */
    collect(ctx: LaunchDoorCtx): LaunchIntent {
        const agentId = ctx.agentId ?? '';
        return (ctx.engineSeed && ctx.engine)
            ? ctx.engineSeed(agentId, ctx.engine) as LaunchIntent
            : ctx.seed(agentId) as LaunchIntent;
    }
};
