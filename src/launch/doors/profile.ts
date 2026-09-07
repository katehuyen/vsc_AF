import { LaunchIntent } from '../../core/launchDimensions';
import { LaunchDoor, LaunchDoorCtx, pick, withAccount } from './index';

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
        cli: 'M-22 - a profile saves engine flags; a CLI profile is a different executor.'
    },
    /**
     * THE STORED LIST IS PROFILE_KEYS (src/core/launchProfiles.ts), and all three
     * of profileFrom / applyProfile / matchProfile iterate it - which is how
     * surface came to be stored on save and dropped on load, and why the list
     * lives in one place now. This mirrors it exactly.
     *
     * ‼️ X-253 - AND THE ACCOUNT IS ON IT NOW, by the user's decision, in the
     * SOFT form. The exemption this door carried was written under X-169 ("a
     * profile is a SETUP and an account is a STATE") and the risk it named was
     * real - a saved launch pinned to a plan that may be exhausted, or deleted,
     * by the time anybody presses it. That risk is answered by name rather than
     * by dropping the dimension: `profileAccountGone` empties the box and SAYS
     * which sign-in it dropped, `matchProfile` treats a stored one as a seed
     * the reader may move, and `withAccount` below means a profile that stores
     * NONE still launches on the resolved account exactly as it did before.
     */
    collect(ctx: LaunchDoorCtx): LaunchIntent {
        return withAccount(ctx, pick(ctx.seed(ctx.agentId ?? '', ctx.picked as never),
            ['engine', 'providerId', 'tier', 'account', 'model', 'variant', 'effort',
                'permissionMode', 'prompt']));
    }
};
