import { LaunchIntent } from '../../core/launchDimensions';
import { LaunchDoor, LaunchDoorCtx, pick, withAccount } from './index';

export const composerDoor: LaunchDoor = {
    id: 'composer',
    label: 'Console composer',
    surface: 'console',
    why: 'the pre-spawn strip. X-103 put providerId and tier on the type and this is the door '
        + 'that went three versions without a box for either - the failure the family is named after.',
    exempt: {
        cli: 'M-22 - the Console hosts an ENGINE process; a CLI profile is a different program.',
        continueLast: 'a card is resumed by id, because the Console knows which seat it is.'
    },
    /**
     * The fields HostedSessionInit really carries (src/core/consolehost.ts).
     * variant and name are NOT among them, and they are left as GAPS rather than
     * exempted: nobody has decided they do not belong here, and a gap somebody
     * has to look at is worth more than an excuse nobody wrote.
     */
    collect(ctx: LaunchDoorCtx): LaunchIntent {
        return withAccount(ctx, pick(ctx.seed(ctx.agentId ?? '', ctx.picked as never),
            ['engine', 'account', 'model', 'effort', 'permissionMode', 'providerId', 'tier',
                'superpowers', 'prompt', 'resume']));
    }
};
