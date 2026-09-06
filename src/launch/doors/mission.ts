import { LaunchIntent } from '../../core/launchDimensions';
import { LaunchDoor, LaunchDoorCtx, pick, withAccount } from './index';

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
     * MEASURED: requested is { engine, model, effort, permissionMode, account }
     * (src/core/missions.ts). providerId, tier, variant and superpowers reach
     * this door and stop - left as gaps, because whether a mission should carry
     * a route is a decision somebody has to take, not one to smuggle in here.
     *
     * X-225 - THE ACCOUNT IS NO LONGER ONE OF THEM, and the exemption it
     * replaced is worth reading before anybody puts it back. It said a mission
     * runs for hours, so an account frozen into it would pin round nine to a
     * plan round two exhausted. That risk is real; refusing the dimension is not
     * an answer to it, it is the decision taken away from the person who owns
     * the plans - and the model, the effort and the permission mode beside it
     * were overridable both mission-wide and per member all along. It also
     * bought nothing: the planner spawned with no environment and the delegates
     * were queued with no account, so "each delegate resolves its own at spawn"
     * described no code. Stating nothing still means nothing here: the run
     * reaches the task launch path unstated and the standing sign-in answers
     * there, exactly as it always has.
     */
    collect(ctx: LaunchDoorCtx): LaunchIntent {
        return withAccount(ctx, pick(ctx.seed(ctx.agentId ?? '', ctx.picked as never),
            ['engine', 'model', 'effort', 'permissionMode', 'account', 'prompt']));
    }
};
