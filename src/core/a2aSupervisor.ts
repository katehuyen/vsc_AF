import { A2ANote, A2ANotesStore, HumanDirective } from './a2aNotes';
import { A2ATask, A2ATasksStore, A2A_TERMINAL } from './a2aTasks';
import { argStr, BridgeRefusal, BridgeRegistry, need, optStr } from './bridge';

/**
 * N-7 — THE SUPERVISOR'S HAND ON THE A2A BOARD. Everything else under `a2a.*`
 * is agents talking to agents; these four ops are the one place a PERSON
 * reaches into that traffic — the user's word on a card (steer · veto ·
 * constraint), taking it off again, moving work somebody else was given, and
 * starting a session that takes a task now rather than waiting for its agent
 * to come and look.
 *
 * ‼️ THEY LIVE HERE RATHER THAN IN `a2aBridge.ts` because the cockpit page
 * (`media/afA2A.js`) calls exactly this set, and a file that holds one
 * subject can be read by whoever is changing that subject. The helpers the
 * handlers need arrive as `ctx` — the same closures the agent-facing ops use,
 * so a lookup or a refusal reads identically on both sides.
 */

export interface A2ASupervisorDeps {
    notes: A2ANotesStore;
    tasks: A2ATasksStore;
    /**
     * N-7 — start a session that takes this task NOW. Only a window that owns
     * a launcher can answer; the headless service leaves it undefined and the
     * op refuses by name rather than pretending to have started something.
     */
    runTaskNow?: (task: A2ATask) => { agent: string; surface: string } | { refused: string };
    onChange?: () => void;
}

export interface A2ASupervisorCtx {
    noteById: (id: string) => A2ANote;
    taskById: (id: string) => A2ATask;
    written: <T>(v: T | undefined) => T;
    changed: () => void;
    queryProject: (args: Record<string, unknown>) => string | undefined;
    capabilities: (args: Record<string, unknown>, key: string) => string[];
}

export const DIRECTIVE_KINDS: HumanDirective['kind'][] = ['steer', 'veto', 'constraint'];

export function registerA2ASupervisorOps(
    bridge: BridgeRegistry, deps: A2ASupervisorDeps, ctx: A2ASupervisorCtx
): void {
    /** The directive a page or a shell just described, validated as one. */
    const directiveArg = (args: Record<string, unknown>): HumanDirective => {
        const kind = argStr(args, 'kind');
        need(DIRECTIVE_KINDS.includes(kind as HumanDirective['kind']),
            `kind must be one of ${DIRECTIVE_KINDS.join(' | ')} — got "${kind}".`);
        return { kind: kind as HumanDirective['kind'], text: argStr(args, 'text'), ts: Date.now() };
    };

    bridge.register([
        {
            op: 'a2a.directive.set',
            describe: 'N-4 — THE USER\'S WORD ON A NOTE OR A TASK (humanDirective), which every agent treats as the '
                + 'highest rule there is: steer (do it this way), veto (not this — do something else), constraint '
                + '(within these limits). One directive per card; setting again replaces it. args: id (a note n… or a '
                + 'task t… id), kind (steer | veto | constraint), text.',
            handler: (args) => {
                const id = argStr(args, 'id');
                const directive = directiveArg(args);
                const out = id.startsWith('t')
                    ? ctx.written(deps.tasks.direct(ctx.taskById(id).id, directive))
                    : ctx.written(deps.notes.direct(ctx.noteById(id).id, directive));
                ctx.changed();
                return out;
            }
        },
        {
            op: 'a2a.directive.remove',
            describe: 'N-4 — TAKE THE USER\'S DIRECTIVE OFF A NOTE OR A TASK. args: id (a note n… or a task t… id).',
            handler: (args) => {
                const id = argStr(args, 'id');
                const out = id.startsWith('t')
                    ? ctx.written(deps.tasks.direct(ctx.taskById(id).id, undefined))
                    : ctx.written(deps.notes.direct(ctx.noteById(id).id, undefined));
                ctx.changed();
                return out;
            }
        },
        {
            op: 'a2a.tasks.reroute',
            describe: 'N-4 — THE USER RE-ASSIGNS A TASK (human reroute). Like a2a.tasks.handoff — a new task carrying '
                + 'the trail, the old one closed — but ‼️ UNDER HUMAN AUTHORITY: the loop guard is not applied and the '
                + 'new task starts at handoffDepth 0, because a person deciding where blocked work goes IS what the guard '
                + 'was waiting for. Whoever holds it loses it. args: id, targetRole, requires? (string[] | csv; default the '
                + 'task\'s own), project? / workdir? (move it as well), why? (recorded on the old task).',
            handler: (args) => {
                const id = argStr(args, 'id');
                const t = ctx.taskById(id);
                need(!A2A_TERMINAL.includes(t.state), `${id} is ${t.state} — nothing left to reroute.`);
                const requires = ctx.capabilities(args, 'requires');
                const r = deps.tasks.handoff(id, {
                    targetRole: argStr(args, 'targetRole'), ...(requires.length ? { requires } : {}),
                    project: ctx.queryProject(args), workdir: optStr(args, 'workdir') || undefined
                }, 'user', Date.now(), { override: true, why: optStr(args, 'why') });
                ctx.changed();
                if ('refused' in r) { throw new BridgeRefusal(`Reroute refused: ${r.refused}.`, { taskId: id, refused: r.refused }); }
                return r.task;
            }
        },
        {
            op: 'a2a.tasks.runNow',
            describe: 'N-7 — START A SESSION THAT TAKES THIS TASK NOW, instead of leaving it on the board until the '
                + 'agent it is for comes and looks. A Console session opens on the agent the task names — its holder '
                + 'if it has one, else its target role — with the claim as its first prompt. ‼️ NOTHING ABOUT THE TASK '
                + 'IS CHANGED HERE: the session claims it through the same a2a.tasks.claim every agent uses, so one '
                + 'somebody else takes first is refused there rather than run twice. Refused when the task is closed, '
                + 'when its target is a broadcast ("*") or names no agent on this machine, and on a host with no '
                + 'launcher (the headless service). args: id.',
            handler: (args) => {
                const id = argStr(args, 'id');
                const t = ctx.taskById(id);
                need(!A2A_TERMINAL.includes(t.state), `${id} is ${t.state} — nothing left to run.`);
                const run = deps.runTaskNow;
                need(!!run, 'a2a.tasks.runNow needs a window that can start sessions — this host has no launcher.');
                const r = (run as NonNullable<typeof run>)(t);
                if ('refused' in r) { throw new BridgeRefusal(`Run Now refused: ${r.refused}.`, { taskId: id, refused: r.refused }); }
                ctx.changed();
                return { task: t.id, ...r };
            }
        }
    ]);
}
