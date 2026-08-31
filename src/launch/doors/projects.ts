import { LaunchIntent } from '../../core/launchDimensions';
import { LaunchDoor, LaunchDoorCtx, pick } from './index';

export const projectsDoor: LaunchDoor = {
    id: 'projects',
    wired: true,
    label: 'Projects tree and page',
    surface: 'console',
    why: 'start a session under a project. It once stated the FLEET default engine as its own '
        + 'answer and then RECORDED it, which is the whole of "sometimes it insists on '
        + 'Antigravity and then suddenly it is Claude again" - two doors writing one record.',
    exempt: {
        prompt: 'the composer opens for the person to type in.',
        name: 'not asked for at this door.',
        resume: 'this door starts a session under a project; it does not pick a conversation.',
        continueLast: 'this door starts work under a project; continuing an existing '
            + 'conversation is a different question and a different door.'
    },
    /**
     * A DOOR IS ONLY AS GOOD AS ITS WEAKEST ARM, AND THIS ONE HAS TWO.
     *
     * The terminal arm hands the whole seeded setup to the spawner. The CONSOLE
     * arm names four fields into ConsolePanel.show plus the engine - so
     * providerId, tier and variant reach this door and stop. The weaker arm is
     * what is modelled, because a dimension that survives one route and not the
     * other is not carried.
     */
    collect(ctx: LaunchDoorCtx): LaunchIntent {
        return pick(ctx.seed(ctx.agentId ?? ''),
            ['engine', 'model', 'effort', 'permissionMode', 'superpowers']);
    }
};
