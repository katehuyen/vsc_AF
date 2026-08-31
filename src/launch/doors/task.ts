import { LaunchIntent } from '../../core/launchDimensions';
import { LaunchDoor, LaunchDoorCtx, pick } from './index';

export const taskDoor: LaunchDoor = {
    id: 'task',
    label: 'Tasks (headless and interactive)',
    surface: 'task',
    why: 'RunDimensions. A task is written now and runs later, so a dimension it drops cannot '
        + 'be supplied by anybody watching - there is nobody watching.',
    exempt: {
        continueLast: 'a task fires later with nobody at a window, so the most recent session '
            + 'is undefined at fire time. The task family names the session it continues by id '
            + '(resumeSessionId) instead. Measured: continueLast appears 0 times in core/tasks.ts.',
        name: 'a task has its own title, which is not the session -n.'
    },
    /** The RunDimensions contract (src/core/tasks.ts), as it stands after X-106. */
    collect(ctx: LaunchDoorCtx): LaunchIntent {
        return pick(ctx.seed(ctx.agentId ?? '', ctx.picked as never),
            ['engine', 'model', 'effort', 'permissionMode', 'providerId', 'tier',
                'cli', 'superpowers', 'prompt', 'resume']);
    }
};
