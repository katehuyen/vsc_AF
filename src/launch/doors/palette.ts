import { LaunchIntent } from '../../core/launchDimensions';
import { LaunchDoor, LaunchDoorCtx, pick } from './index';

export const paletteDoor: LaunchDoor = {
    id: 'palette',
    label: 'Command palette and status bar',
    surface: 'terminal',
    why: 'the keyboard path, and the one that CONTINUES rather than starts. It has no picker '
        + 'at all, so whatever it does not carry is a dimension nobody at this door can supply.',
    exempt: {
        prompt: 'a continue rejoins a conversation that already has one.',
        name: 'the session being rejoined already has its name.'
    },
    /**
     * MEASURED, AND IT IS TWO FIELDS: agentfarm.continueSession spawns with
     * { engine, continueLast }, or { engine, resume } on an engine that resumes
     * by id (the latest in this folder is the CLI own idea of latest, and it
     * does not know about the other three).
     *
     * Whether a continue SHOULD re-apply the remembered setup is a real question
     * and it is deliberately not answered here: the remaining dimensions are
     * left as gaps for somebody to decide, not exempted by a comment.
     */
    collect(ctx: LaunchDoorCtx): LaunchIntent {
        return pick(ctx.seed(ctx.agentId ?? '', ctx.picked as never),
            ['engine', 'resume', 'continueLast']);
    }
};
