import { LaunchIntent } from '../../core/launchDimensions';
import { LaunchDoor, LaunchDoorCtx, pick } from './index';

export const profileDoor: LaunchDoor = {
    id: 'profile',
    label: 'Saved launch profiles',
    surface: 'either',
    why: 'a saved setup REPRODUCES a launch, so a dimension it does not store is a dimension '
        + 'the profile silently changes every time it is used.',
    exempt: {
        name: 'the name on a profile is the PROFILE own. A -n inside it would rename every '
            + 'session started from it, which is not what save this setup means to anybody.',
        resume: 'a profile is a SETUP, not a session - it cannot store which conversation to rejoin.',
        continueLast: 'a profile cannot mean continue the last session either - which last '
            + 'one, on which agent, months after it was saved.',
        cli: 'M-22 - a profile saves engine flags; a CLI profile is a different executor.',
        account: 'X-169 - a profile is a SETUP and an account is a STATE. Stored, it would pin '
            + 'a saved launch to a plan that may be exhausted by the time anybody presses it, '
            + 'and it would outrank the use-this-next gesture the same way a per-agent memory '
            + 'would - which is the decision that item took. A launch from a profile still runs '
            + 'on the resolved account; it is simply not the profile that answers.'
    },
    /**
     * THE STORED LIST IS PROFILE_KEYS (src/core/launchProfiles.ts), and all three
     * of profileFrom / applyProfile / matchProfile iterate it - which is how
     * surface came to be stored on save and dropped on load, and why the list
     * lives in one place now. This mirrors it exactly.
     */
    collect(ctx: LaunchDoorCtx): LaunchIntent {
        return pick(ctx.seed(ctx.agentId ?? '', ctx.picked as never),
            ['engine', 'providerId', 'tier', 'model', 'variant', 'effort',
                'permissionMode', 'prompt']);
    }
};
