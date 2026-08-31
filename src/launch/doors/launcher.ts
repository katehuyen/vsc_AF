import { LaunchIntent } from '../../core/launchDimensions';
import { LaunchDoor, LaunchDoorCtx, pick } from './index';

export const launcherDoor: LaunchDoor = {
    id: 'launcher',
    wired: true,
    label: 'Multi-dimension launcher',
    surface: 'either',
    why: 'the quickpick that asks every dimension in turn - the one door that has always had '
        + 'to know the whole list, and therefore the one that shows soonest when it grows.',
    exempt: {
        cli: 'M-22 - a CLI profile REPLACES the command line rather than adding to it, so it '
            + 'cannot be a row in a launcher that is building engine flags. It is its own door '
            + '(right-click, Start session with...), and validateLaunch refuses the pair.',
        continueLast: 'the launcher assembles a NEW setup; continuing is its own door.'
    },
    /**
     * The launcher opens ON the remembered setup and overwrites whatever the
     * person answers. The whole object travels: this door names no fields, which
     * is why a new dimension shows up here first.
     */
    collect(ctx: LaunchDoorCtx): LaunchIntent {
        return { ...(ctx.seed(ctx.agentId ?? '') as LaunchIntent), ...(ctx.picked ?? {}) };
    }
};
