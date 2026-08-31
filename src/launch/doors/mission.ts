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
        name: 'the mission names the work; the session takes the agent own name.'
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
