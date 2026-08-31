import { LaunchIntent } from '../../core/launchDimensions';
import { LaunchDoor, LaunchDoorCtx, pick } from './index';

export const treeMenuDoor: LaunchDoor = {
    id: 'treeMenu',
    wired: true,
    label: 'Agents tree, right-click',
    surface: 'console',
    why: 'the context menu. Its own launch path is consoleForAgent (Talk to agent), which '
        + 'opens the composer on this agent remembered setup - and startSessionWith, which is '
        + 'where a CLI profile is chosen.',
    exempt: {
        prompt: 'the composer opens for the person to type in; nothing is sent on their behalf.',
        name: 'not asked for at this door.',
        resume: 'the menu opens a composer, it does not pick a conversation.',
        continueLast: 'the menu opens a composer for a NEW session; continuing the last one '
            + 'is agentfarm.continueSession.'
    },
    /**
     * MEASURED, AND IT IS NOT A PASS-THROUGH. agentfarm.consoleForAgent seeds
     * with the whole remembered setup and then forwards FIVE NAMED FIELDS into
     * ConsolePanel.show. Everything else stops here - which is exactly the shape
     * X-103 and X-105 were filed against, written out rather than smoothed over
     * so the matrix can count it.
     */
    collect(ctx: LaunchDoorCtx): LaunchIntent {
        const o = ctx.seed(ctx.agentId ?? '');
        return {
            ...pick(o, ['engine', 'model', 'effort', 'permissionMode', 'superpowers']),
            ...pick((ctx.picked ?? {}) as never, ['cli'])
        };
    }
};
