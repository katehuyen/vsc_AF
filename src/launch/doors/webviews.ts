import { LaunchIntent } from '../../core/launchDimensions';
import { LaunchDoor, LaunchDoorCtx, pick, withAccount } from './index';

export const webviewsDoor: LaunchDoor = {
    id: 'webviews',
    label: 'Agent detail, dashboard, missions, portfolio',
    surface: 'console',
    why: 'four pages with a Talk to agent button each. S-34 - it is the door with the fewest '
        + 'questions in it, which is exactly why it must not be the door that quietly answers '
        + 'them all with the fleet defaults.',
    exempt: {
        prompt: 'the composer opens for the person to type in; nothing is sent on their behalf.',
        name: 'not asked for at this door.',
        resume: 'these buttons open a composer, they do not pick a conversation.',
        continueLast: 'the buttons open a composer for a new session; the pages list the '
            + 'existing ones separately, which is where continuing belongs.'
    },
    /** Measured: the buttons run agentfarm.consoleForAgent, so this is the tree menu's list (X-506: the route on it). */
    collect(ctx: LaunchDoorCtx): LaunchIntent {
        return withAccount(ctx, pick(ctx.seed(ctx.agentId ?? ''),
            ['engine', 'model', 'effort', 'permissionMode', 'superpowers', 'providerId', 'tier']));
    }
};
