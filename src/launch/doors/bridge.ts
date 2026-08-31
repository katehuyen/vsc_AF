import { LaunchIntent } from '../../core/launchDimensions';
import { LaunchDoor, LaunchDoorCtx, pick } from './index';

export const bridgeDoor: LaunchDoor = {
    id: 'bridge',
    label: 'Bridge sessions.start',
    surface: 'either',
    why: 'what an agent drives, and the same launch the Start Session command runs. The one '
        + 'deliberate asymmetry in this layer: it RECORDS and does not inherit.',
    exempt: {
        cli: 'M-22 - the bridge starts an ENGINE; a CLI profile is a different executor, and '
            + 'validateLaunch refuses the pair rather than blending them.'
    },
    /**
     * Every dimension the op names, read straight off its arguments. It does NOT
     * seed from the record - S-34 inheritance is the panels rule, and a headless
     * caller that got yesterday model without asking for it would be the harder
     * bug to find.
     */
    collect(ctx: LaunchDoorCtx): LaunchIntent {
        return pick((ctx.picked ?? {}) as never,
            ['engine', 'providerId', 'tier', 'model', 'variant', 'effort',
                'permissionMode', 'name', 'prompt', 'resume', 'continueLast']);
    }
};
