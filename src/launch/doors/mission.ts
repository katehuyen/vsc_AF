import { LaunchIntent } from '../../core/launchDimensions';
import { LaunchDoor, LaunchDoorCtx, pick } from './index';

export const missionDoor: LaunchDoor = {
    id: 'mission',
    label: 'Missions and delegation',
    surface: 'task',
    why: 'a mission default with a member override on top. A dimension missing here silently '
        + 'returns a delegated run to the fleet default, on somebody else behalf.',
    exempt: {
        continueLast: 'a delegation is a new run.',
        resume: 'a delegated run rejoins nothing - the mission is what carries the thread, '
            + 'and it does that in its own record rather than in a session id.',
        name: 'the mission names the work; the session takes the agent own name.',
        account: 'X-169 - a mission runs for HOURS across rounds and its delegates spawn one '
            + 'at a time. An account frozen into the mission would pin round nine to a plan '
            + 'that round two exhausted, and it would do it silently. Each delegate run '
            + 'resolves the account at its own spawn, from the one place that holds it.'
    },
    /**
     * MEASURED: requested is { engine, model, effort, permissionMode }
     * (src/core/missions.ts). providerId, tier, variant and superpowers reach
     * this door and stop - left as gaps, because whether a mission should carry
     * a route is a decision somebody has to take, not one to smuggle in here.
     */
    collect(ctx: LaunchDoorCtx): LaunchIntent {
        return pick(ctx.seed(ctx.agentId ?? '', ctx.picked as never),
            ['engine', 'model', 'effort', 'permissionMode', 'prompt']);
    }
};
