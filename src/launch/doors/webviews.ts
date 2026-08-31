import { LaunchIntent } from '../../core/launchDimensions';
import { LaunchDoor, LaunchDoorCtx, pick } from './index';

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
    /** Measured: seeds with the whole remembered setup, forwards five named fields. */
    collect(ctx: LaunchDoorCtx): LaunchIntent {
        return pick(ctx.seed(ctx.agentId ?? ''),
            ['engine', 'model', 'effort', 'permissionMode', 'superpowers']);
    }
};
