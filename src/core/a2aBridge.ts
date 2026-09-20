import { A2ANotesStore, A2A_CATEGORIES, A2A_STRICTNESS, A2ACategory, A2ANote, A2AStrictness, HumanDirective, NoteQuery } from './a2aNotes';
import { A2A_TASK_STATES, A2ATask, A2ATasksStore, A2ATaskState, ClaimantView, isOpen, LEASE_MS } from './a2aTasks';
import { argStr, BridgeCaller, BridgeRefusal, BridgeRegistry, need, optBool, optNum, optStr } from './bridge';

/**
 * N-4 — THE A2A STORES, REACHABLE FROM A SHELL. N-3 built two stores nothing
 * could talk to; this file is the door an agent in a headless run, a Console
 * card or a terminal uses to leave a note, hand over a task, take one, keep
 * its lease alive and say how it ended. Every handler CALLS the store — the
 * page that comes in N-6 will call the same methods, so nothing here decides
 * anything the store does not.
 *
 * ‼️ THE CALLER SAYS WHO IT IS, OR THE SESSION DOES. An `agent=` argument is
 * taken as written; without one the session id the CLI published to its own
 * children (X-310) is looked up on the host, and only an agent that can be
 * named may post, claim, finish or hand over. A note from "unknown" is a note
 * nobody can answer.
 *
 * ‼️ THE PROJECT IS FILLED IN THE WAY NOTICES FILL IT IN (N-1). Omitted, it
 * is the project the calling agent is running under — unambiguously or not
 * at all; `project="*"` is the one way to say "every project" and mean it.
 * A name or an id both resolve to the id, so a note filed under a project by
 * name and a query by id meet on the same coordinate.
 */

export interface A2ABridgeDeps {
    notes: A2ANotesStore;
    tasks: A2ATasksStore;
    /** the agent a published session id belongs to, when the host can see it */
    agentOfSession?: (sessionId: string) => string | undefined;
    /** the project an agent is running under right now — one answer or none */
    inferProject?: (agentName: string | undefined) => string | undefined;
    /** a project id or name → its id */
    resolveProject?: (key: string) => string | undefined;
    onChange?: () => void;
}

/** A `string[]` or a comma-separated string — both arrive over the CLI. */
export function listArg(args: Record<string, unknown>, key: string): string[] {
    const v = args[key];
    if (Array.isArray(v)) { return v.filter(x => typeof x === 'string' && x.trim()).map(x => (x as string).trim()); }
    if (typeof v === 'string') { return v.split(',').map(s => s.trim()).filter(Boolean); }
    return [];
}

const oneOf = <T extends string>(v: string, allowed: readonly T[], what: string): T | undefined => {
    if (!v) { return undefined; }
    need(allowed.includes(v as T), `${what} must be one of ${allowed.join(' | ')} — got "${v}".`);
    return v as T;
};

export function registerA2AOps(bridge: BridgeRegistry, deps: A2ABridgeDeps): void {
    const changed = (): void => { try { deps.onChange?.(); } catch { /* best-effort */ } };

    const sessionOf = (args: Record<string, unknown>, from?: BridgeCaller): string | undefined =>
        optStr(args, 'session') || String(from?.sessionId ?? '').trim() || undefined;

    /** Who is speaking — stated, or read off the session the CLI published. */
    const who = (args: Record<string, unknown>, from?: BridgeCaller): string | undefined => {
        const said = optStr(args, 'agent');
        if (said) { return said; }
        const sid = sessionOf(args, from);
        return sid ? deps.agentOfSession?.(sid) : undefined;
    };
    const mustBe = (args: Record<string, unknown>, from?: BridgeCaller): string => {
        const a = who(args, from);
        need(a, 'Say who you are: agent=<name> — or run this from a session Agent Farm can see.');
        return a as string;
    };

    /** The project coordinate: stated (name or id → id), inferred, or '*'. */
    const projectOf = (args: Record<string, unknown>, agent: string | undefined):
        { project: string; projectFrom?: string } => {
        const key = optStr(args, 'project');
        if (key === '*') { return { project: '*' }; }
        if (key) { return { project: deps.resolveProject?.(key) ?? key }; }
        const inferred = deps.inferProject?.(agent);
        return inferred
            ? { project: inferred, projectFrom: 'the session this agent is running in' }
            : { project: '*' };
    };
    const queryProject = (args: Record<string, unknown>): string | undefined => {
        const key = optStr(args, 'project');
        if (!key) { return undefined; }
        return key === '*' ? '*' : (deps.resolveProject?.(key) ?? key);
    };

    const noteQuery = (args: Record<string, unknown>, reader: string | undefined): NoteQuery => ({
        project: queryProject(args),
        subsystem: optStr(args, 'subsystem') || undefined,
        topic: optStr(args, 'topic') || undefined,
        role: optStr(args, 'role') || undefined,
        category: oneOf(optStr(args, 'category'), A2A_CATEGORIES, 'category'),
        reader,
        unreadOnly: optBool(args, 'unreadOnly', false),
        includeResolved: optBool(args, 'includeResolved', false),
        includeExpired: optBool(args, 'includeExpired', false)
    });

    const claimant = (args: Record<string, unknown>, agent: string, from?: BridgeCaller): ClaimantView => ({
        agent,
        sessionId: sessionOf(args, from),
        role: optStr(args, 'role') || undefined,
        project: queryProject(args),
        workdir: optStr(args, 'workdir') || undefined,
        capabilities: listArg(args, 'capabilities')
    });

    const noteById = (id: string): A2ANote => {
        deps.notes.load();
        const n = deps.notes.get(id);
        need(n, `No such note "${id}" — a2a.notes.list shows the board.`);
        return n as A2ANote;
    };
    const taskById = (id: string): A2ATask => {
        deps.tasks.load();
        const t = deps.tasks.get(id);
        need(t, `No such task "${id}" — a2a.tasks.list shows the board.`);
        return t as A2ATask;
    };
    const written = <T>(v: T | undefined): T => {
        need(v !== undefined, 'The A2A store is busy (another host holds the lock) — try again in a moment.');
        return v as T;
    };

    /** FIFO among what this agent could take right now — the oldest first. */
    const openFor = (args: Record<string, unknown>, by: ClaimantView): A2ATask[] =>
        deps.tasks.list({ claimableBy: by, project: queryProject(args), topic: optStr(args, 'topic') || undefined })
            .sort((a, b) => a.ts - b.ts);

    bridge.register([
        // ---------------------------------------------------------------- notes
        {
            op: 'a2a.notes.post',
            describe: 'N-4 — LEAVE A NOTE FOR OTHER AGENTS (agent→agent; the user\'s board is notices.post, not this). '
                + 'A note is passive: nobody is assigned it, whoever the coordinates fit reads it. args: title, body? '
                + '(markdown), agent? (who is writing — omitted, read off your session), project? (name or id; omitted = '
                + 'the project you are running under; "*" = every project), subsystem? (workdir or module it is about, '
                + 'default *), topic? (the anchor readers search by, default *), targetRole? (who should read it — a role, '
                + 'capability or agent name; default *), strictness? (hard | preferred | any, default preferred — hard '
                + 'hides it from anyone whose coordinates miss, any shows it to everyone), category? (info | warning | '
                + 'convention | discovery | result, default info), contextFiles? (string[] | csv of paths worth opening), '
                + 'ttlHours? (after which it is history; omitted = never). Answers the note and `projectFrom` when the '
                + 'host filled the project in.',
            handler: (args, from) => {
                const agent = mustBe(args, from);
                const { project, projectFrom } = projectOf(args, agent);
                const ttl = optNum(args, 'ttlHours', 0);
                const note = written(deps.notes.add({
                    fromAgent: agent, fromSessionId: sessionOf(args, from),
                    title: argStr(args, 'title'), body: optStr(args, 'body'),
                    project, subsystem: optStr(args, 'subsystem'), topic: optStr(args, 'topic'),
                    targetRole: optStr(args, 'targetRole'),
                    strictness: oneOf(optStr(args, 'strictness'), A2A_STRICTNESS, 'strictness'),
                    category: oneOf(optStr(args, 'category'), A2A_CATEGORIES, 'category'),
                    contextFiles: listArg(args, 'contextFiles'),
                    ttlMs: ttl > 0 ? ttl * 3_600_000 : 0
                }));
                changed();
                return { ...note, projectFrom };
            }
        },
        {
            op: 'a2a.notes.list',
            describe: 'N-4 — THE NOTES THAT FIT YOUR COORDINATES, best fit first, newest within a fit. Every '
                + 'coordinate you leave out is a wildcard. args: agent? (you — needed for unreadOnly; omitted, read off '
                + 'your session), project? (name, id or *), subsystem?, topic?, role? (your role or name — matched against '
                + 'each note\'s targetRole), category?, unreadOnly? (only what you have not read), fromMe? (only what '
                + 'you wrote), includeResolved?, includeExpired?, limit? (default 50). Listing does not mark anything '
                + 'read — a2a.notes.get does.',
            handler: (args, from) => {
                const reader = who(args, from);
                need(!optBool(args, 'unreadOnly', false) || reader,
                    'unreadOnly needs to know who you are: agent=<name>.');
                let rows = deps.notes.read(noteQuery(args, reader));
                if (optBool(args, 'fromMe', false)) {
                    need(reader, 'fromMe needs to know who you are: agent=<name>.');
                    rows = rows.filter(n => n.fromAgent.toLowerCase() === (reader as string).toLowerCase());
                }
                const limit = Math.max(1, optNum(args, 'limit', 50));
                return { total: rows.length, reader: reader ?? null, rows: rows.slice(0, limit) };
            }
        },
        {
            op: 'a2a.notes.get',
            describe: 'N-4 — ONE NOTE IN FULL, and reading it MARKS IT READ for you (readBy), so a later unreadOnly '
                + 'list does not show it again. args: id, agent? (you; omitted, read off your session — with neither, '
                + 'nothing is marked), markRead? (false to look without leaving a trace).',
            handler: (args, from) => {
                const id = argStr(args, 'id');
                const reader = who(args, from);
                let note = noteById(id);
                if (reader && optBool(args, 'markRead', true) && !note.readBy.includes(reader)) {
                    note = written(deps.notes.markRead(id, reader));
                    changed();
                }
                return note;
            }
        },
        {
            op: 'a2a.notes.resolve',
            describe: 'N-4 — CLOSE A NOTE (or reopen it): a resolved note leaves every list unless includeResolved is '
                + 'asked for, and once its ttl has also passed a2a.notes.sweep drops it. args: id, resolved? '
                + '(default true; false reopens).',
            handler: (args) => {
                const id = argStr(args, 'id');
                noteById(id);
                const note = written(deps.notes.resolve(id, optBool(args, 'resolved', true)));
                changed();
                return note;
            }
        },
        {
            op: 'a2a.notes.sweep',
            describe: 'N-4 — DROP THE NOTES THAT ARE BOTH RESOLVED AND PAST THEIR TTL — history the board no longer '
                + 'owes. Nothing unresolved and nothing without a ttl is touched. args: none. Answers how many went.',
            handler: () => {
                deps.notes.load();
                const dropped = deps.notes.sweep();
                if (dropped) { changed(); }
                return { dropped, remaining: deps.notes.notes.length };
            }
        },
        // ---------------------------------------------------------------- tasks
        {
            op: 'a2a.tasks.add',
            describe: 'N-4 — HAND WORK TO ANOTHER AGENT. Unlike a note, a task is CLAIMED by exactly one agent, and a '
                + 'claim is a lease (30 min without a heartbeat and it goes back to queued). args: title, instructions? '
                + '(markdown — what to do), expectedOutput? (what "done" looks like), agent? (who is handing it over; '
                + 'omitted, read off your session), project? (name or id; omitted = yours; * = any), workdir? (default *), '
                + 'topic? (default *), targetRole? (who should take it — role, capability or agent name; default *), '
                + 'strictness? (hard | preferred | any, default preferred), requires? (string[] | csv of capabilities the '
                + 'taker must have, e.g. write_tools,browser), maxCostUSD?, maxTurns? (0 = no ceiling of its own), '
                + 'sourceQueueItemId? (the user\'s Work Queue item behind it, for cross-lineage).',
            handler: (args, from) => {
                const agent = mustBe(args, from);
                const { project, projectFrom } = projectOf(args, agent);
                const task = written(deps.tasks.add({
                    fromAgent: agent, fromSessionId: sessionOf(args, from),
                    title: argStr(args, 'title'), instructions: optStr(args, 'instructions'),
                    expectedOutput: optStr(args, 'expectedOutput'),
                    project, workdir: optStr(args, 'workdir'), topic: optStr(args, 'topic'),
                    targetRole: optStr(args, 'targetRole'),
                    strictness: oneOf(optStr(args, 'strictness'), A2A_STRICTNESS, 'strictness'),
                    requires: listArg(args, 'requires'),
                    maxCostUSD: optNum(args, 'maxCostUSD', 0), maxTurns: optNum(args, 'maxTurns', 0),
                    sourceQueueItemId: optStr(args, 'sourceQueueItemId') || undefined
                }));
                changed();
                return { ...task, projectFrom };
            }
        },
        {
            op: 'a2a.tasks.fromNote',
            describe: 'N-4 — PROMOTE A NOTE TO A TASK: the note\'s title, body, coordinates and files become a task '
                + 'carrying sourceNoteId, so the trail from "somebody noticed" to "somebody did it" survives. ‼️ A note '
                + 'that already has a live task is REFUSED with that task\'s id — promote it twice and two agents do the '
                + 'same work; pass again=true to mean it. args: id (the note), agent? (who is promoting; omitted, read '
                + 'off your session), targetRole? / requires? / workdir? / instructions? / expectedOutput? / strictness? / '
                + 'maxCostUSD? / maxTurns? (override what the note implies), resolveNote? (true to close the note now '
                + 'that it is work; default false — others may still need to read it).',
            handler: (args, from) => {
                const agent = mustBe(args, from);
                const id = argStr(args, 'id');
                const note = noteById(id);
                const prior = deps.tasks.list().find(t => t.sourceNoteId === id && !['done', 'failed', 'cancelled'].includes(t.state));
                if (prior && !optBool(args, 'again', false)) {
                    throw new BridgeRefusal(
                        `Note ${id} already has a live task (${prior.id}, ${prior.state}) — pass again=true to make another.`,
                        { taskId: prior.id, state: prior.state });
                }
                const files = note.contextFiles.length ? `\n\nFiles: ${note.contextFiles.join(' · ')}` : '';
                const task = written(deps.tasks.add({
                    fromAgent: agent, fromSessionId: sessionOf(args, from), sourceNoteId: id,
                    title: note.title,
                    instructions: optStr(args, 'instructions') || `${note.body}${files}`.trim(),
                    expectedOutput: optStr(args, 'expectedOutput'),
                    project: note.project, workdir: optStr(args, 'workdir') || note.subsystem, topic: note.topic,
                    targetRole: optStr(args, 'targetRole') || note.targetRole,
                    strictness: oneOf(optStr(args, 'strictness'), A2A_STRICTNESS, 'strictness') ?? note.strictness,
                    requires: listArg(args, 'requires'),
                    maxCostUSD: optNum(args, 'maxCostUSD', 0), maxTurns: optNum(args, 'maxTurns', 0)
                }));
                if (optBool(args, 'resolveNote', false)) { written(deps.notes.resolve(id, true)); }
                changed();
                return task;
            }
        },
        {
            op: 'a2a.tasks.list',
            describe: 'N-4 — THE TASK BOARD, newest first. Reading it also collects zombies: a claim whose lease ran out '
                + 'is back to queued by the time you see it. args: agent? (you; omitted, read off your session), state? '
                + '(queued | claimed | running | done | failed | blocked | cancelled), project? (name, id or *), topic?, '
                + 'fromMe? (only what you handed over — how your own handoffs are doing), mine? (only what you hold), '
                + 'claimable? (only what you could take right now — uses role?, workdir?, capabilities? like '
                + 'a2a.tasks.claim), limit? (default 50).',
            handler: (args, from) => {
                const me = who(args, from);
                const wantMine = optBool(args, 'mine', false) || optBool(args, 'fromMe', false) || optBool(args, 'claimable', false);
                need(!wantMine || me, 'mine / fromMe / claimable need to know who you are: agent=<name>.');
                let rows = optBool(args, 'claimable', false)
                    ? openFor(args, claimant(args, me as string, from))
                    : deps.tasks.list({
                        state: oneOf(optStr(args, 'state'), A2A_TASK_STATES, 'state') as A2ATaskState | undefined,
                        project: queryProject(args), topic: optStr(args, 'topic') || undefined
                    });
                const same = (a: string | undefined) => !!a && a.toLowerCase() === (me as string).toLowerCase();
                if (optBool(args, 'fromMe', false)) { rows = rows.filter(t => same(t.fromAgent)); }
                if (optBool(args, 'mine', false)) { rows = rows.filter(t => same(t.claimedBy?.agent)); }
                const limit = Math.max(1, optNum(args, 'limit', 50));
                return { total: rows.length, agent: me ?? null, rows: rows.slice(0, limit) };
            }
        },
        {
            op: 'a2a.tasks.next',
            describe: 'N-4 — THE ONE TASK YOU SHOULD TAKE: the oldest open task your coordinates and capabilities '
                + 'allow, or null. args: agent? (you; omitted, read off your session), role?, project? (omitted = any), '
                + 'workdir?, capabilities? (string[] | csv — a task whose `requires` you lack is not offered), topic?, '
                + 'claim? (true to claim it in the same call — the answer is then the claimed task, lease started). '
                + 'Answers `task` and `waiting` (how many more you could take).',
            handler: (args, from) => {
                const me = mustBe(args, from);
                const by = claimant(args, me, from);
                const open = openFor(args, by);
                const task = open[0];
                if (!task) { return { task: null, waiting: 0 }; }
                if (!optBool(args, 'claim', false)) { return { task, waiting: open.length - 1 }; }
                const r = deps.tasks.claim(task.id, by, Date.now(), Math.max(1, optNum(args, 'leaseMinutes', LEASE_MS / 60_000)) * 60_000);
                if ('refused' in r) {
                    throw new BridgeRefusal(`Could not claim ${task.id}: ${r.refused} — somebody was faster; call again.`, { taskId: task.id, refused: r.refused });
                }
                changed();
                return { task: r.task, waiting: open.length - 1, claimed: true };
            }
        },
        {
            op: 'a2a.tasks.claim',
            describe: 'N-4 — TAKE A TASK. Decided inside the store\'s lock against what is on disk that instant, so two '
                + 'agents asking together get one winner and one refusal that says why (already claimed · not open · '
                + 'missing a required capability · the coordinates are not yours). The claim is a LEASE: heartbeat within '
                + 'leaseMinutes or it goes back to queued. args: id, agent? (you; omitted, read off your session), role?, '
                + 'project?, workdir?, capabilities? (string[] | csv), leaseMinutes? (default 30).',
            handler: (args, from) => {
                const me = mustBe(args, from);
                const id = argStr(args, 'id');
                taskById(id);
                const r = deps.tasks.claim(id, claimant(args, me, from), Date.now(),
                    Math.max(1, optNum(args, 'leaseMinutes', LEASE_MS / 60_000)) * 60_000);
                if ('refused' in r) {
                    throw new BridgeRefusal(`Claim refused: ${r.refused}.`, { taskId: id, refused: r.refused });
                }
                changed();
                return r.task;
            }
        },
        {
            op: 'a2a.tasks.heartbeat',
            describe: 'N-4 — STILL ON IT, AND HERE IS WHERE IT GOT TO. Pushes the lease forward and records `progress` '
                + 'so a watcher can tell "working, slowly" from "gone" without waiting for the lease to die; the first '
                + 'heartbeat moves the task from claimed to running. Only the holder\'s heartbeat counts. args: id, '
                + 'agent? (you; omitted, read off your session), progress? (one line), leaseMinutes? (default 30).',
            handler: (args, from) => {
                const me = mustBe(args, from);
                const id = argStr(args, 'id');
                const t = taskById(id);
                need(t.claimedBy && t.claimedBy.agent.toLowerCase() === me.toLowerCase(),
                    `${id} is not held by ${me}` + (t.claimedBy ? ` (held by ${t.claimedBy.agent})` : ` (state ${t.state})`) + '.');
                const out = written(deps.tasks.heartbeat(id, t.claimedBy!.agent, optStr(args, 'progress'), Date.now(),
                    Math.max(1, optNum(args, 'leaseMinutes', LEASE_MS / 60_000)) * 60_000));
                changed();
                return out;
            }
        },
        {
            op: 'a2a.tasks.finish',
            describe: 'N-4 — SAY HOW IT ENDED. Only the holder may finish a task. By default a RESULT NOTE is left for '
                + 'the agent that handed it over (category result, targetRole = that agent, same project and topic), '
                + 'so the caller is woken by its own next a2a.notes.list rather than by polling. args: id, agent? (you; '
                + 'omitted, read off your session), state? (done | failed | blocked, default done), result? (the '
                + 'summary — what was delivered, or why not), notify? (default true; false leaves no note).',
            handler: (args, from) => {
                const me = mustBe(args, from);
                const id = argStr(args, 'id');
                const t = taskById(id);
                need(t.claimedBy && t.claimedBy.agent.toLowerCase() === me.toLowerCase(),
                    `${id} is not held by ${me}` + (t.claimedBy ? ` (held by ${t.claimedBy.agent})` : ` (state ${t.state})`) + '.');
                const state = oneOf(optStr(args, 'state'), ['done', 'failed', 'blocked'] as const, 'state') ?? 'done';
                const result = optStr(args, 'result');
                const out = written(deps.tasks.finish(id, t.claimedBy!.agent, state, result));
                let note: A2ANote | undefined;
                if (optBool(args, 'notify', true)) {
                    note = written(deps.notes.add({
                        fromAgent: me, fromSessionId: sessionOf(args, from),
                        title: `${state}: ${t.title}`,
                        body: `${result || '(no summary given)'}\n\nTask ${id} · handed over by ${t.fromAgent}`,
                        project: t.project, subsystem: t.workdir, topic: t.topic,
                        targetRole: t.fromAgent, strictness: 'preferred', category: 'result'
                    }));
                }
                changed();
                return { task: out, resultNote: note ?? null };
            }
        },
        {
            op: 'a2a.tasks.cancel',
            describe: 'N-4 — STOP A TASK, whoever holds it — the poster\'s or the user\'s call. A task already done, '
                + 'failed or cancelled is left as it is. args: id, why? (recorded as the result summary).',
            handler: (args) => {
                const id = argStr(args, 'id');
                taskById(id);
                const out = written(deps.tasks.cancel(id, optStr(args, 'why')));
                changed();
                return out;
            }
        },
        {
            op: 'a2a.tasks.handoff',
            describe: 'N-4 — PASS A TASK ON TO ANOTHER ROLE (agent→agent). A NEW task is made carrying parentTaskId '
                + 'and handoffDepth+1, and this one is closed as handed on, so the trail of who tried what survives. ‼️ '
                + 'THE LOOP GUARD: the third handoff is refused and the task goes BLOCKED — a person decides where it goes '
                + '(a2a.tasks.reroute). Only the holder or the poster may hand a task on. args: id, targetRole, agent? '
                + '(you; omitted, read off your session), requires? (string[] | csv; default the task\'s own).',
            handler: (args, from) => {
                const me = mustBe(args, from);
                const id = argStr(args, 'id');
                const t = taskById(id);
                const isHolder = !!t.claimedBy && t.claimedBy.agent.toLowerCase() === me.toLowerCase();
                const isPoster = t.fromAgent.toLowerCase() === me.toLowerCase();
                need(isHolder || isPoster, `${id} is neither held nor posted by ${me} — only the holder or the poster hands a task on.`);
                need(!['done', 'failed', 'cancelled'].includes(t.state), `${id} is ${t.state} — nothing left to hand on.`);
                const requires = listArg(args, 'requires');
                const r = deps.tasks.handoff(id, { targetRole: argStr(args, 'targetRole'), ...(requires.length ? { requires } : {}) }, me);
                changed();
                if ('refused' in r) {
                    throw new BridgeRefusal(`Handoff refused: ${r.refused}.`, { taskId: id, refused: r.refused, state: 'blocked' });
                }
                return r.task;
            }
        },
        // ------------------------------------------------------------ supervisor
        {
            op: 'a2a.directive.set',
            describe: 'N-4 — THE USER\'S WORD ON A NOTE OR A TASK (humanDirective), which every agent treats as the '
                + 'highest rule there is: steer (do it this way), veto (not this — do something else), constraint '
                + '(within these limits). One directive per card; setting again replaces it. args: id (a note n… or a '
                + 'task t… id), kind (steer | veto | constraint), text.',
            handler: (args) => {
                const id = argStr(args, 'id');
                const kind = oneOf(argStr(args, 'kind'), ['steer', 'veto', 'constraint'] as const, 'kind') as HumanDirective['kind'];
                const directive: HumanDirective = { kind, text: argStr(args, 'text'), ts: Date.now() };
                const out = id.startsWith('t')
                    ? written(deps.tasks.direct(taskById(id).id, directive))
                    : written(deps.notes.direct(noteById(id).id, directive));
                changed();
                return out;
            }
        },
        {
            op: 'a2a.directive.remove',
            describe: 'N-4 — TAKE THE USER\'S DIRECTIVE OFF A NOTE OR A TASK. args: id (a note n… or a task t… id).',
            handler: (args) => {
                const id = argStr(args, 'id');
                const out = id.startsWith('t')
                    ? written(deps.tasks.direct(taskById(id).id, undefined))
                    : written(deps.notes.direct(noteById(id).id, undefined));
                changed();
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
                const t = taskById(id);
                need(!['done', 'failed', 'cancelled'].includes(t.state), `${id} is ${t.state} — nothing left to reroute.`);
                const requires = listArg(args, 'requires');
                const r = deps.tasks.handoff(id, {
                    targetRole: argStr(args, 'targetRole'), ...(requires.length ? { requires } : {}),
                    project: queryProject(args), workdir: optStr(args, 'workdir') || undefined
                }, 'user', Date.now(), { override: true, why: optStr(args, 'why') });
                changed();
                if ('refused' in r) { throw new BridgeRefusal(`Reroute refused: ${r.refused}.`, { taskId: id, refused: r.refused }); }
                return r.task;
            }
        },
        {
            op: 'a2a.status',
            describe: 'N-4 — THE A2A BOARD IN FIGURES FOR ONE AGENT, the session-start glance: notes unread for you, '
                + 'tasks you could take, tasks you hold (with lease left), tasks you handed over by state, and anything '
                + 'blocked waiting for a person. args: agent? (you; omitted, read off your session), role?, project?, '
                + 'workdir?, capabilities? (string[] | csv).',
            handler: (args, from) => {
                const me = who(args, from);
                const now = Date.now();
                const notes = deps.notes.read({ ...noteQuery(args, me), unreadOnly: !!me });
                const tasks = deps.tasks.list();
                const same = (a: string | undefined) => !!me && !!a && a.toLowerCase() === me.toLowerCase();
                const held = tasks.filter(t => same(t.claimedBy?.agent) && !['done', 'failed', 'cancelled'].includes(t.state));
                const handedOver = tasks.filter(t => same(t.fromAgent));
                const byState: Record<string, number> = {};
                for (const t of handedOver) { byState[t.state] = (byState[t.state] ?? 0) + 1; }
                return {
                    agent: me ?? null,
                    unreadNotes: notes.length,
                    claimable: me ? openFor(args, claimant(args, me, from)).length : tasks.filter(t => isOpen(t, now)).length,
                    held: held.map(t => ({ id: t.id, title: t.title, state: t.state, leaseLeftMin: Math.max(0, Math.round(((t.claimedBy?.leaseExpiresAt ?? now) - now) / 60_000)), progress: t.claimedBy?.progress ?? '' })),
                    handedOver: byState,
                    blocked: tasks.filter(t => t.state === 'blocked').map(t => ({ id: t.id, title: t.title, why: t.resultSummary ?? '' })),
                    directives: [...notes.filter(n => n.humanDirective).map(n => n.id), ...held.filter(t => t.humanDirective).map(t => t.id)]
                };
            }
        }
    ]);
}

export type { A2ACategory, A2AStrictness };
