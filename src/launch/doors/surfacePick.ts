import { LaunchIntent } from '../../core/launchDimensions';
import { LaunchDoor, LaunchDoorCtx, pick } from './index';

export const surfacePickDoor: LaunchDoor = {
    id: 'surfacePick',
    label: 'Terminal or Console picker',
    surface: 'either',
    why: 'it decides WHERE a launch lands. A dimension dropped while crossing it would arrive '
        + 'on one surface and not the other, which is the hardest kind of difference to notice.',
    /**
     * THIS DOOR ANSWERS WHERE, NOT WHAT, AND IT CARRIES EVERY DIMENSION BY
     * PASSING THE WHOLE SETUP THROUGH - measured in src/extension.ts, where its
     * options take setup?: (engine) => LaunchOptions and it returns a RunChoice.
     * It names no dimension because it decides about none.
     */
    collect(ctx: LaunchDoorCtx): LaunchIntent {
        return { ...(ctx.seed(ctx.agentId ?? '') as LaunchIntent), ...(ctx.picked ?? {}) };
    }
};
