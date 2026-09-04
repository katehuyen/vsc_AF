import { LaunchIntent } from '../../core/launchDimensions';
import { LaunchDoor, LaunchDoorCtx, pick, withAccount } from './index';

export const automationDoor: LaunchDoor = {
    id: 'automation',
    label: 'Schedule, trigger, template, workflow step',
    surface: 'headless',
    why: 'X-106 - an automation fires with nobody at a window, so anything about the run has '
        + 'to be stated when the automation is WRITTEN or it is never stated at all. A nightly '
        + 'job took whichever standing route the agent happened to have at 3 a.m.',
    exempt: {
        continueLast: 'same as the task it becomes: the most recent is undefined at fire time.',
        name: 'the automation has its own name; the session takes the agent own.',
        resume: 'a schedule produces a NEW run each time it fires.'
    },
    /** It becomes a task, so it carries the task dimensions - by shape, since X-106. */
    collect(ctx: LaunchDoorCtx): LaunchIntent {
        return withAccount(ctx, pick(ctx.seed(ctx.agentId ?? '', ctx.picked as never),
            ['engine', 'account', 'model', 'effort', 'permissionMode', 'providerId', 'tier',
                'cli', 'superpowers', 'prompt']));
    }
};
