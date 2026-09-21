import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { FleetWait } from '../core/waits';
import { watchStatus } from '../core/duties';
import { Insight } from '../core/health';
import { SessionIndex, SessionInfo, sessionMission, sessionOrigin, sessionHeadless } from '../core/sessions';
import { CtxWindow, PricingEngine, contextWindowOf, totalTokens } from '../core/pricing';
import { SubsystemStatus } from '../core/farmstatus';
import { PlanUsageSnapshot } from '../core/planusage';
import { ProjectCostRow as ProjectRollup } from '../core/projects';
import { dayKey } from '../core/util';
import { handleAfNav, htmlShell } from './base';
import { buildData as buildViewerData } from './sessionViewer';
import { afConfig } from '../core/settingsDoor';
import { LaunchManifest, manifestOf } from '../core/launchManifest';
import { billingReader, describeDrift, runDrift, sessionIdentity, turnRuntimes } from '../core/turnRuntime';
import { DollarPart, sumDollars } from '../core/billing';
import { SESSION_BREAK_MIN, sessionSpan } from '../core/sessionSpan';
import { Baton } from '../core/baton';
import { batonCardView } from '../core/batonView';

export interface DashboardDeps {
    extensionUri: vscode.Uri;
    getAgents(): AgentInfo[];
    index: SessionIndex;
    getInsights(): Insight[];
    getPricing(): PricingEngine;
    windowTokenLimit(): number;
    /** Ceiling for the WEIGHTED 5h figure (0 = not set) — see QUOTA_WEIGHTS. */
    windowWeightedTokenLimit?(): number;
    budgets(): Record<string, number>;
    mediaCost(): { today: number; month: number };
    /** D1: rolling 14-day quality average by agent id. */
    quality?(agentId: string): { avg?: number; count: number };
    /** Z1: per-subsystem activation rows for the Farm Status card. */
    farmStatus?(): SubsystemStatus[];
    /** Plan usage card: the cached snapshot (no network) for the render. */
    planUsage?(): PlanUsageSnapshot | undefined;
    /** Plan usage card: refresh it; `force` bypasses the cache TTL. */
    refreshPlanUsage?(force: boolean): Promise<PlanUsageSnapshot | undefined>;
    /** Plan usage card: the beat it must run on — ms between automatic reads
     *  (0 = manual only) and which window that is (an agent mid-turn = fast). */
    planUsageBeat?(): { ms: number; active: boolean };
    /** U-27 — every engine's limit state, and the one currently on show. */
    planUsageEngines?(): unknown[];
    planUsageEngine?(): string;
    /** ‼️ X-212 — whose sign-in of that engine the figures belong to
     *  ('Machine Global' for the machine's own; '' where the engine cannot hold
     *  a second one). The card names it for the same reason the status bar's
     *  heading does: an owner-less percentage is read as the reader's own. */
    planUsageAccount?(engine: string): string;
    /**
     * ‼️ X-244 — EVERY SIGN-IN THIS MACHINE HOLDS, with its own reading.
     *
     * `planUsageAccount` names ONE owner — the standing one — which is the
     * right answer to "whose figures are these" and no answer at all to "and
     * how are the others doing". On a machine rotating between sign-ins that
     * second question is the one the card is opened for, and until this it was
     * a page away. Each row carries its own bars, so switching is a redraw and
     * never a second request.
     */
    planUsageAccounts?(): unknown[];
    /** B1: per-project rollup for the Projects card (empty = no projects declared). */
    projects?(): ProjectRollup[];
    /** B1: agent name → project name, so rows can be grouped client-side. */
    agentProjects?(): Record<string, string>;
    /** A project's colour and icon by name — so the sessions table marks a
     *  project the same way the sidebar and its own page do. */
    projectStyle?(name: string): { icon?: string; color?: string } | undefined;
    /**
     * X-102 - the launch manifests, so a session row can say what its run was
     * SET UP to be. Optional like `projectStyle`: a page can be built before the
     * store exists, and a missing manifest degrades to a row that says nothing
     * rather than to one that guesses.
     */
    launchManifests?(): readonly LaunchManifest[];
    /**
     * ‼️ X-251 (3/n) — what the recorded sign-in is CALLED. The manifest
     * holds a slot id; the viewer and the timeline already put the label on
     * the page, so the table asks the same host for the same words rather
     * than printing a directory name.
     */
    accountLabel?(stated: string): string;
    /** X-231 — every open wait in the fleet, already in the shared shape. */
    waits?(): FleetWait[];
}

interface AgentSummary {
    id: string;
    name: string;
    active: boolean;
    lastActivity: number;
    contextLoad: number;
    memoryFiles: number;
    sessions: number;
    daily: Record<string, { cost: number; tokens: number; wTokens: number; msgs: number }>;
    totalCost: number;
    /** X-112 - the kinds of dollar in `totalCost`, sent ONLY when there is more
     *  than one: the row then says (mixed) and the breakdown is its hover. */
    costParts?: DollarPart[];
    totalTokens: number;
    /** The same spend against the plan limit — see QUOTA_WEIGHTS. */
    totalWTokens: number;
    errors: number;
    toolCalls: number;
    usage: { input: number; output: number; cacheWrite: number; cacheRead: number };
    insightCounts: { error: number; warning: number; info: number };
    budget?: number;
    duties: number;
    pendingDuties: number;
    quality?: number;
    qualityCount: number;
    /**
     * ‼️ HOW MANY SESSIONS THE AGENT REALLY HAS, beside how many the money
     * covers (X-35). `sessions` above is the Claude-only count every figure on
     * the row is measured from — correct, and the documented split. But the
     * agent's own page already counts every engine, so the two surfaces printed
     * different numbers for the same agent with nothing to explain the gap, and
     * an agent driven mostly through Codex looked idle on the Dashboard while
     * its page showed a full table.
     */
    sessionsAll: number;
}

/** One row per session for the Sessions tables (dashboard + agent detail).
 *  The webview sorts client-side by any criterion and shows the top N — so
 *  instead of shipping every session, the pool is the union of the true top-N
 *  per sortable criterion (recency, cost, tokens, ctx-now, duration, turns):
 *  whatever sort the user picks, its genuine top N is guaranteed to be
 *  present. The union is taken PER ORIGIN (user / auto), because the table
 *  filters by origin client-side and defaults to User — a pool built over the
 *  mixed list would leave the User view short whenever automation dominates
 *  the top rows. N follows the user's Show box (webview 'setTableN' message);
 *  n = 0 means "all" — every session ships and the union shortcut is moot.
 *  Exported for tests and reused by the agent detail page. */
export const SESSION_TABLE_N = 12;
/** Default row counts of the two Sessions tables (the Show box seeds these).
 *  The dashboard is a fleet-wide glance; the agent page is that agent's log. */
export const DASHBOARD_SESSION_TABLE_N = 20;
export const AGENT_SESSION_TABLE_N = 50;

/** S-77 — the relay store, handed in once by the host: every sessions table's ⑂ column reads it. */
let batonSource: (() => readonly Baton[]) | undefined;
export function setBatonSource(fn: () => readonly Baton[]): void { batonSource = fn; }

export function sessionRowPool(
    sessions: SessionInfo[],
    isActive?: (s: SessionInfo) => boolean,
    n = SESSION_TABLE_N,
    /** B1: which project owns this session (undefined = none declared). */
    projectOf?: (s: SessionInfo) => string | undefined,
    /**
     * The project's own colour and icon, by name.
     *
     * A project has had both since 3.52.0, and every surface that shows one is
     * supposed to be recognisable at a glance — the sidebar and the Projects
     * page were, and the table that lists sessions BY project was not. Optional
     * because the dashboard can be asked for rows before the registry is
     * available, and a missing mark must degrade to the plain name.
     */
    projectStyle?: (name: string) => { icon?: string; color?: string; detail?: string } | undefined,
    /**
     * ‼️ X-102 — THE LAUNCH MANIFESTS, so a row can say what its run was SET UP
     * to be and not only what came out of it.
     *
     * Optional for the same reason `projectStyle` is: a table can be asked for
     * rows before the store is available, and a missing manifest must degrade to
     * a row that says nothing rather than to a row that guesses. The lookup is
     * by the launchId the BINDING wrote onto the session — nothing here reads a
     * route off a transcript, because no transcript carries one (measured).
     */
    manifests?: readonly LaunchManifest[],
    /**
     * ‼️ X-251 (3/n) — WHAT THE RECORDED SIGN-IN IS CALLED, resolved by the
     * host rather than spelt out here.
     *
     * The manifest records a SLOT ID (`claude-aicozums`) because that is the
     * only value a launch can be sure of; it is a directory name the reader
     * never chose. The session viewer and the timeline both put the label on
     * the page (`statedAccountLabel`), so a table printing the id was the same
     * fact in two spellings.
     *
     * Optional like `manifests` and `projectStyle`, and for the same reason: a
     * table can be asked for rows before the account store exists. Missing
     * degrades to the raw id — unreadable still names the right account, blank
     * would name none.
     */
    accountLabel?: (stated: string) => string
): unknown[] {
    /**
     * ‼️ THE DENOMINATOR UNDER THE CTX CELL, PER ENGINE (X-35).
     *
     * The cell's hover printed "Of a 200k window" for every row on the page.
     * That is Claude's window written into a table that had just learned to
     * show four engines: a measured Codex thread runs against 258 400, so the
     * percentage was wrong by a third while looking authoritative — and the
     * two engines whose window nobody has measured were being given Claude's.
     *
     * Three answers, in order, and the third one is a real answer: the window
     * the ENGINE ITSELF stated on the session (Codex does, every turn), the
     * model table for the ones we know (Claude), and ZERO for "nobody said" —
     * on which the hover prints the token count and no fraction rather than a
     * confident figure with the wrong ceiling underneath it.
     */
    /**
     * ‼️ X-102 — THE HALF OF A RUN NO TRANSCRIPT CARRIES, put on the row.
     *
     * Measured on a real Claude JSONL (2.1.251, 1373 records): the file names
     * the model, the cwd, the version and the permission mode, and says NOTHING
     * about which route served it, which stored profile at which revision, or
     * what was REQUESTED as opposed to what came back. Every one of those is a
     * question a person asks of a row, and until now the only honest answer the
     * table could give was silence.
     *
     * ‼️ X-108 — NO MANIFEST IS STILL AN ANSWER, AND IT USED TO BE SILENCE.
     * Returning null made three different facts share one blank space: our own
     * run from before the manifest existed (`legacy` — backfillable from
     * evidence later, X-116), somebody else's transcript we merely read
     * (`external` — there was never anything to record), and asked-with-no-answer
     * (`unknown` — the only one worth going to look at). `binding` names which,
     * and NO VALUE IS INVENTED to go with it: the route, the requested model and
     * the account stay empty, because filling those in from the model name is
     * the certainty this whole family refuses.
     */
    const launchFacts = (s: SessionInfo) => {
        const m = manifests ? manifestOf(manifests, s) : undefined;
        const engine = s.source ?? 'claude';
        const reports = (s.turns ?? []).map(t => ({ n: t.n, models: t.models, providerIds: t.providerIds }));
        // X-111 — the ONE identity rule (external, manifest, engine) lives in
        // core now, so the Turns page and the bridge answer the same as this row.
        const identity = sessionIdentity(s, manifests);
        if (!m) {
            return {
                route: '', revision: null, requested: '', surface: '', account: '', at: 0,
                agreement: identity.agreement, note: describeDrift(runDrift(turnRuntimes(m, engine, reports))),
                identity
            };
        }
        const drift = runDrift(turnRuntimes(m, engine, reports));
        return {
            identity,
            // The route, named the way `describeManifest` names it: a label when
            // one was injected, and "inherited route" when nothing was — which
            // is NOT "Anthropic". Nothing was injected and nothing was cleared,
            // so the run took whatever the window already carried.
            route: m.identity.providerLabel || m.identity.providerId
                || (m.identity.origin === 'not-applicable' ? '' : 'inherited route'),
            revision: m.identity.providerProfileRevision ?? null,
            // What was ASKED FOR, kept apart from what came back on purpose:
            // folded together, "which model ran" stops being answerable.
            requested: [m.requested.tier ? `tier ${m.requested.tier}` : '',
                m.requested.model || 'default model', m.requested.variant || '', m.requested.effort || '']
                .filter(Boolean).join(' · '),
            surface: m.surface,
            // ‼️ X-251 — WHOSE PLAN PAID FOR THIS RUN. Empty on a run that
            // injected no sign-in, and `line` drops an empty — because "it ran
            // as this machine" is the ordinary case and a row that said so
            // every time is a row nobody reads. The transcript cannot supply
            // this on any engine (the accounts share one projects folder), so
            // the manifest is the only witness there will ever be.
            // ‼️ X-251 (3/n) — and it is the LABEL, not the slot id: the viewer
            // and the timeline already say it in words, and one surface
            // spelling it as a directory name is the same fact twice.
            account: m.account ? (accountLabel ? accountLabel(m.account) : m.account) : '',
            at: m.at,
            agreement: drift.agreement,
            // ‼️ EMPTY ON AN ORDINARY RUN. A line stating "all fine" on every
            // row is a column the reader learns to stop looking at.
            note: describeDrift(drift)
        };
    };
    const forced = afConfig().get<number>('contextWindowTokens', 0);
    // ‼️ X-113 — the three answers now live in core/pricing (contextWindowOf),
    // because this was one of four hand-written copies of them and no two
    // agreed on the order.
    const windowOf = (s: SessionInfo): CtxWindow => contextWindowOf(
        s.ctxWindow ?? 0,
        s.models?.length ? s.models[s.models.length - 1] : '',
        forced);
    const ctxWindowFields = (s: SessionInfo) => {
        const w = windowOf(s);
        return {
            // …and what it is a fraction OF, on this engine — see windowOf. 0
            // means nobody stated one, and the hover says so instead of
            // assuming Claude's.
            ctxWindow: w.tokens,
            // …and WHICH answer that was: a percentage taken against the
            // reader's own override is not the same claim as one taken against
            // a window the engine published, and the row could not tell them
            // apart.
            ctxWindowSource: w.source
        };
    };
    // ‼️ S-52 — HOW LONG A SESSION WAS LEFT, and therefore how long it ran. A
    // conversation resumed the next morning has always read as a day and a half
    // on this table, because the wall clock was the only figure on the row. 0
    // switches the question off and every figure goes back to the wall clock.
    const breakMin = afConfig().get<number>('sessionBreakMin', SESSION_BREAK_MIN);
    const spanFields = (s: SessionInfo) => {
        const v = sessionSpan(s, breakMin);
        return {
            // the figure this table has always shown, unchanged and still named
            // the same thing — every surface that reads `durationMin` keeps
            // reading the wall clock
            durationMin: Math.round(v.wallMs / 60000),
            // …and what it actually ran, with the stretches nobody was there
            // for taken out. Equal to the wall clock on a session that was
            // never put down, which is most of them.
            activeMin: Math.round(v.activeMs / 60000),
            // ‼️ S-53 — and the turns' own time, which is what the row now
            // leads with. Sent only when it was really measured: an absent
            // field is what makes the table's ladder fall back to `activeMin`
            // rather than print a zero it was handed.
            ...(v.busyMeasured ? { busyMin: Math.round(v.busyMs / 60000) } : {}),
            awayMin: Math.round(v.awayMs / 60000),
            breaks: v.breaks
        };
    };
    const batons = (() => { try { return batonSource?.() ?? []; } catch { return []; } })();
    const relayIds = new Set<string>();
    for (const b of batons) { relayIds.add(b.from.sessionId); if (b.toSessionId) { relayIds.add(b.toSessionId); } }
    const rows = sessions.map(s => ({
        ...spanFields(s),
        file: s.file,
        agent: (s.agentName ?? '?') + (s.machine ? ` ⇄ ${s.machine}` : ''),
        agentName: s.agentName ?? '',
        // ⌨ focus button: sessionId finds the exact terminal, cwd is the
        // fallback when the terminal registry doesn't know the session
        sessionId: s.sessionId,
        cwd: s.cwd ?? '',
        title: s.title,
        // what the transcript itself suggests — shown in the tooltip when a
        // launch name or a rename is what you see in the column
        autoTitle: s.autoTitle,
        ts: s.lastTs || s.mtime || 0,
        // The other end of the session. The table showed "3m" and "2h ago" and
        // there was no way to ask WHEN it ran without opening it — a duration
        // with only one endpoint on the row cannot answer that.
        firstTs: s.firstTs || 0,
        turns: s.userTurns,
        toolCalls: s.toolCalls,
        errors: s.errors,
        tokens: totalTokens(s.usage),
        // …and the same session measured against the plan limit. Both columns,
        // never one: the raw figure answers "how much text moved", this one
        // answers "how much of the window did it burn", and the two are not
        // proportional — measured ratio 0.80x-3.86x (see QUOTA_WEIGHTS).
        wTokens: Math.round(s.wTokens),
        // "Ctx now" — approximate context after the session's last reply
        ctx: s.lastCtxTokens ?? 0,
        ...ctxWindowFields(s),
        cost: s.cost,
        sidechain: s.isSidechain,
        // ‼️ S-32 — the row exists BECAUSE the transcript could not be read, and
        // says so. Every figure above it is an unread zero, so the table marks
        // the row rather than letting it pass for a session that did nothing.
        scanLimit: s.scanLimit ?? null,
        // 🧑 your own dialog vs 🤖 an automation run — the table's default scope
        origin: sessionOrigin(s),
        // ‼️ S-35 — and, when it IS a robot, whether anybody could have been
        // watching: a headless `claude -p` (🌙) or a task that opened a real
        // terminal. Decided host-side by core/sessions.ts, never re-derived in
        // the page, so every table and the viewer say the same thing.
        headless: sessionHeadless(s),
        // ‼️ X-95 — and the THIRD fact about a run: a mission opened it. Null on
        // every session that is not a mission's. The table draws its own glyph
        // for these (never 🧑/🤖, which they would be indistinguishable under)
        // and leaves them out by default: on a farm that runs missions they are
        // the majority of the log, and the log is first of all a person's own.
        mission: sessionMission(s) ?? null,
        // S-77 — this run's leg of a baton relay (the card's own view); null off a relay
        chain: s.sessionId && relayIds.has(s.sessionId) ? (batonCardView(batons, s.sessionId) ?? null) : null,
        // shelf marks: pinned rows sort first and survive every top-N cut
        pinned: s.pinned === true,
        tags: s.tags ?? [],
        // B1: the project this session's work belongs to ('' = none declared)
        project: projectOf?.(s) ?? '',
        projectIcon: projectStyle?.(projectOf?.(s) ?? '')?.icon ?? '',
        projectColor: projectStyle?.(projectOf?.(s) ?? '')?.color ?? '',
        // What the project IS, not just its name — the hover shows it, so a row
        // no longer sends you to the Projects page to find out where the work
        // it belongs to actually lives. Built once per project by the host.
        projectDetail: projectStyle?.(projectOf?.(s) ?? '')?.detail ?? '',
        // B3: how many distinct files this session wrote to (counted during the
        // index's own parse — the per-edit detail is read on demand)
        files: Object.keys(s.filesEdited ?? {}).length,
        active: isActive ? isActive(s) : false,
        // ---- what a HOVER answers. Everything below is here for the column
        // tooltips and nothing else: the row's eleven cells used to carry one
        // sentence about the right-click menu, so the pointer was already on
        // the most informative surface on the page and it said nothing about
        // the figure underneath it. None of it costs a second parse — the index
        // counted all of it while reading the transcript once.
        //
        // The model(s) that served the session. It CAN change mid-session, so
        // this is a list and the tooltip prints it as one.
        models: s.models ?? [],
        // Round trips. `tokens` says how much text moved and `turns` says how
        // many times you asked; neither answers "how many times did it go to
        // the model", which is the number the spend actually follows.
        apiCalls: s.assistantMsgs,
        // The token total, split the way it is billed. A session that is 90%
        // cache reads and one that is 90% output cost wildly different money
        // for the same total, and the column could not show the difference.
        usage: {
            input: s.usage.input, output: s.usage.output,
            cacheRead: s.usage.cacheRead, cacheWrite: s.usage.cacheWrite
        },
        // What it mostly DID — the four tools it reached for most, with counts.
        // "312 tool calls" says how busy it was and nothing about the work.
        topTools: Object.entries(s.tools ?? {})
            .sort((a, b) => b[1] - a[1]).slice(0, 4)
            .map(([name, n]) => ({ name, n })),
        // ‼️ WHICH ENGINE RAN IT (U-26). `source` is the external-CLI id and is
        // undefined for a Claude transcript — which is the whole reason the
        // table could not say "Claude" out loud: the answer was an absence.
        // Named once, here, so every embedding of the table reads the same field.
        engine: s.source ?? 'claude',
        // The circumstances of the run, all read verbatim off the transcript.
        branch: s.gitBranch ?? '',
        version: s.version ?? '',
        permissionMode: s.permissionMode ?? '',
        // How the CLI was entered ('cli', 'sdk-cli', 'claude-desktop'…) — the
        // field the 🧑/🤖 column is decided from, so the column can show its
        // own evidence instead of asking to be trusted.
        entrypoint: s.entrypoint ?? '',
        consoleHosted: s.consoleHosted === true,
        // The name the session was STARTED with (`claude -n …`), when there was
        // one — different from a rename, and the Title tooltip says which.
        cliName: s.cliName ?? '',
        // The opening ask, whole. The Title column shows eighty characters of
        // it; the hover shows the prompt (see media/afTip.js), which is the
        // difference between "which session" and "what was it asked to do".
        firstPrompt: s.firstPrompt ?? '',
        // Which of Agent Farm's own mechanisms started this run, when one did —
        // a recorded fact, not a reading of the entrypoint. Decides the origin
        // column and names the schedule/task in its hover.
        launchedBy: s.launchedBy ?? null,
        // Skills and typed /commands the session used, counted in the same
        // parse — "312 tool calls" says how busy it was, this says what it
        // reached for that a plain tool count cannot show.
        topSkills: Object.entries(s.skillCalls ?? {})
            .sort((a, b) => b[1] - a[1]).slice(0, 4)
            .map(([name, n]) => ({ name, n })),
        // How many memory files it opened — the recall signal, on the row that
        // already knows it.
        memoryReads: Object.keys(s.memoryReads ?? {}).length,
        // ‼️ X-102 — WHAT THIS RUN WAS ASKED TO BE. Null on every session with
        // no manifest, which is most of them for a while and is an ABSENCE the
        // hover states rather than fills in.
        launch: launchFacts(s)
    }));
    type Row = typeof rows[number];
    if (!(n > 0) || n >= rows.length) {
        return rows.sort((a, b) => b.ts - a.ts);
    }
    const keys: ((r: Row) => number)[] = [
        r => r.ts, r => r.cost, r => r.tokens, r => r.wTokens, r => r.ctx, r => r.durationMin, r => r.turns
    ];
    const pool = new Set<Row>();
    // The shelf is not a top-N: a pinned session is on the table because the
    // user put it there, whatever it costs or how long ago it ran.
    rows.filter(r => r.pinned).forEach(r => pool.add(r));
    // ‼️ X-95 — THREE LANES, NOT TWO. A mission's sessions are `auto`, so they
    // used to compete with the schedules and triggers for the same top-N — and
    // one busy mission could take the whole automation lane, leaving the pool
    // with nothing to show the moment somebody turned the mission filter OFF.
    // A lane of their own means both scopes stay honest at every N.
    const laneOf = (r: Row): string => (r.mission ? 'mission' : r.origin);
    for (const lane0 of ['user', 'auto', 'mission']) {
        const lane = rows.filter(r => laneOf(r) === lane0);
        for (const key of keys) {
            lane.slice().sort((a, b) => key(b) - key(a)).slice(0, n)
                .forEach(r => pool.add(r));
        }
    }
    // newest first — the webview re-sorts anyway; this is just a stable wire order
    return [...pool].sort((a, b) => b.ts - a.ts);
}

/** Aggregate one agent's sessions inside [from, to] for the comparison table.
 *  Two precision tiers, honestly separated:
 *  - windows starting within the last 24h sum recentMsgs (48h retention,
 *    per-message timestamps) → hour-exact;
 *  - anything older falls back to the daily buckets → whole-day granularity
 *    (from/to are treated as local day boundaries).
 *  Exported pure for tests. */
export function agentWindowTotals(
    sessions: Pick<SessionInfo, 'firstTs' | 'lastTs' | 'daily' | 'recentMsgs'>[],
    from: number, to: number, now = Date.now()
): { sessions: number; cost: number; tokens: number; wTokens: number; msgs: number; exact: boolean } {
    const out = { sessions: 0, cost: 0, tokens: 0, wTokens: 0, msgs: 0, exact: from >= now - 24 * 3600 * 1000 };
    for (const s of sessions) {
        if (s.firstTs > 0 && s.lastTs >= from && s.firstTs <= to) { out.sessions++; }
        if (out.exact) {
            for (const m of s.recentMsgs) {
                if (m.ts >= from && m.ts <= to) {
                    out.cost += m.cost;
                    out.tokens += m.tokens;
                    out.wTokens += m.wTokens;
                    out.msgs++;
                }
            }
        } else {
            for (const [day, b] of Object.entries(s.daily)) {
                const dayStart = new Date(day + 'T00:00:00').getTime();
                if (isNaN(dayStart) || dayStart + 24 * 3600 * 1000 <= from || dayStart > to) { continue; }
                out.cost += b.cost;
                out.tokens += totalTokens(b.usage);
                out.wTokens += b.wTokens;
                out.msgs += b.assistantMsgs;
            }
        }
    }
    out.cost = Math.round(out.cost * 10000) / 10000;
    out.wTokens = Math.round(out.wTokens);
    return out;
}

function buildData(deps: DashboardDeps, tableN = DASHBOARD_SESSION_TABLE_N): Record<string, unknown> {
    const now = Date.now();
    const agents = deps.getAgents();
    const sessions = deps.index.all();
    const insights = deps.getInsights();

    const billOf = billingReader(deps.launchManifests?.() ?? []);
    const agentSummaries: AgentSummary[] = agents.map(a => {
        const list = deps.index.forAgent(a.id);
        const daily: AgentSummary['daily'] = {};
        const usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
        let totalCost = 0, agentTokens = 0, agentWTokens = 0, errors = 0, toolCalls = 0, lastActivity = 0;
        for (const s of list) {
            totalCost += s.cost;
            agentTokens += totalTokens(s.usage);
            agentWTokens += s.wTokens;
            errors += s.errors;
            toolCalls += s.toolCalls;
            lastActivity = Math.max(lastActivity, s.mtime);
            usage.input += s.usage.input;
            usage.output += s.usage.output;
            usage.cacheWrite += s.usage.cacheWrite;
            usage.cacheRead += s.usage.cacheRead;
            for (const [day, b] of Object.entries(s.daily)) {
                const d = daily[day] ?? (daily[day] = { cost: 0, tokens: 0, wTokens: 0, msgs: 0 });
                d.cost += b.cost;
                d.tokens += totalTokens(b.usage);
                d.wTokens += b.wTokens;
                d.msgs += b.assistantMsgs;
            }
        }
        const counts = { error: 0, warning: 0, info: 0 };
        for (const ins of insights) {
            if (ins.agentId === a.id) { counts[ins.severity]++; }
        }
        return {
            id: a.id,
            name: a.name,
            active: deps.index.isAgentActive(a.id, now),
            lastActivity,
            contextLoad: a.contextLoad.total,
            memoryFiles: a.memoryFiles.length,
            sessions: list.length,
            daily,
            totalCost,
            costParts: (d => d.mixed ? d.parts : undefined)(sumDollars(list, s => s.cost, billOf)),
            totalTokens: agentTokens,
            totalWTokens: Math.round(agentWTokens),
            errors,
            toolCalls,
            usage,
            insightCounts: counts,
            budget: deps.budgets()[a.name],
            duties: a.duties.length,
            pendingDuties: a.duties.filter(d => !d.paused && watchStatus(d.watch)?.pending).length,
            quality: deps.quality?.(a.id)?.avg,
            qualityCount: deps.quality?.(a.id)?.count ?? 0,
            sessionsAll: deps.index.forAgentWithExternal(a.id).length
        };
    });

    // Per-model totals + token-type totals + combined heatmap
    const modelTotals: Record<string, { cost: number; tokens: number; wTokens: number }> = {};
    const tokenTypes = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
    const heat = new Array(168).fill(0);
    for (const s of sessions) {
        for (const m of s.models) {
            const mt = modelTotals[m] ?? (modelTotals[m] = { cost: 0, tokens: 0, wTokens: 0 });
            // attribute the whole session to each model it used (rare to mix)
            mt.cost += s.cost / s.models.length;
            mt.tokens += totalTokens(s.usage) / s.models.length;
            mt.wTokens += s.wTokens / s.models.length;
        }
        tokenTypes.input += s.usage.input;
        tokenTypes.output += s.usage.output;
        tokenTypes.cacheWrite += s.usage.cacheWrite;
        tokenTypes.cacheRead += s.usage.cacheRead;
        for (let i = 0; i < 168; i++) { heat[i] += s.heat[i]; }
    }

    const projectByAgent = deps.agentProjects?.() ?? {};
    // ‼️ THE TABLE IS THE LOG, AND THE LOG IS EVERY ENGINE (X-27). Everything
    // measured above runs on `sessions` — claude-only, deliberately, because
    // cost/model/cache figures are defined against that transcript format. The
    // table underneath is not a measurement: it is "which conversations
    // happened", and it was answering that question with a quarter of them.
    const sessionRows = sessionRowPool(deps.index.allWithExternal(),
        s => deps.index.isSessionActive(s, now), tableN,
        s => (s.agentName ? projectByAgent[s.agentName] : undefined),
        name => deps.projectStyle?.(name), deps.launchManifests?.(),
        stated => deps.accountLabel?.(stated) ?? stated);

    const win = deps.index.windowUsage(now);

    return {
        generatedAt: now,
        today: dayKey(now),
        agents: agentSummaries,
        modelTotals,
        tokenTypes,
        heat,
        sessionRows,
        sessionTableN: tableN,
        // B1: the project axis. Empty until projects are declared, and then
        // every figure below can be read per customer / product / contract.
        projects: deps.projects?.() ?? [],
        agentProjects: deps.agentProjects?.() ?? {},
        window: { ...win, limit: deps.windowTokenLimit(), wLimit: deps.windowWeightedTokenLimit?.() ?? 0 },
        fleetBudget: deps.budgets()['*'] ?? 0,
        // X-231 (d) — what the fleet is waiting for, decided in core/waits.ts
        // and handed over whole: this page counts and draws, it does not judge.
        waits: deps.waits?.() ?? [],
        mediaCost: deps.mediaCost(),
        insightTotals: {
            error: insights.filter(i => i.severity === 'error').length,
            warning: insights.filter(i => i.severity === 'warning').length,
            info: insights.filter(i => i.severity === 'info').length
        },
        unknownModels: [...deps.getPricing().unknownModels],
        farmStatus: deps.farmStatus?.() ?? [],
        // Plan usage card — the cached snapshot only; the webview asks for a
        // refresh itself (on its timer and on ⟳), so a render never blocks on
        // a network round trip.
        planUsage: deps.planUsage?.(),
        planUsageBeat: deps.planUsageBeat?.() ?? { ms: 5 * 60000, active: false },
        // every engine's limit state, and which one the card opens on — the
        // same two the status bar draws from (U-27)
        planUsageEngines: deps.planUsageEngines?.() ?? [],
        planUsageEngine: deps.planUsageEngine?.() ?? 'claude',
        planUsageAccount: deps.planUsageAccount?.(deps.planUsageEngine?.() ?? 'claude') ?? '',
        // X-244 — …and the other sign-ins, each with its own reading, so the
        // picker on the card switches without asking the host anything.
        planUsageAccounts: deps.planUsageAccounts?.() ?? [],
        // E3: external-CLI sessions (side list — excluded from every cost/usage
        // figure above; surfaced as an honest one-liner).
        externalSessions: (() => {
            const bySource: Record<string, number> = {};
            for (const s of deps.index.external()) {
                if (s.source) { bySource[s.source] = (bySource[s.source] ?? 0) + 1; }
            }
            return bySource;
        })()
    };
}

export class DashboardPanel {
    private static current: DashboardPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    /** Sessions-table row count chosen in the webview's Show box (0 = all). */
    private tableN = DASHBOARD_SESSION_TABLE_N;

    /** A project name the sessions table must be scoped to on arrival. */
    private pendingProjectFilter?: string;

    /**
     * `scrollTo: 'top'` is for the callers that come from a status-bar
     * indicator (see OPEN_DASHBOARD_AT_TOP): the page is retained when hidden,
     * so revealing it lands wherever the reader last left it, which is not where
     * the number they just clicked is shown. A FRESH panel is at the top by
     * definition and needs nothing — and could not be told anyway, since its
     * script is not listening yet.
     *
     * `projectFilter` is the same problem with a different answer. A caller
     * asking for ONE project's sessions cannot be answered by a message on a
     * fresh panel either, so it travels in the initial payload instead; on a
     * panel that is already up, it goes as a message. Either way the table
     * arrives scoped — landing on an unfiltered dashboard would make the button
     * that sent you look broken.
     */
    static show(deps: DashboardDeps, opts?: { scrollTo?: 'top'; projectFilter?: string }): void {
        if (DashboardPanel.current) {
            DashboardPanel.current.panel.reveal();
            DashboardPanel.current.refresh();
            if (opts?.projectFilter !== undefined) {
                void DashboardPanel.current.panel.webview.postMessage({
                    type: 'projectFilter', name: opts.projectFilter
                });
            }
            if (opts?.scrollTo === 'top') {
                void DashboardPanel.current.panel.webview.postMessage({ type: 'scrollTo', target: 'top' });
            }
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.dashboard',
            'Agent Farm — Dashboard',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        DashboardPanel.current = new DashboardPanel(panel, deps, opts?.projectFilter);
    }

    static refreshIfOpen(): void {
        DashboardPanel.current?.refresh();
    }

    /**
     * Plan usage read by somebody else (the status-bar indicator's beat) —
     * hand it to an open card so both surfaces show one figure on one beat.
     * `push: true` marks it as unsolicited: the card's ⟳ must keep showing it
     * is busy until ITS answer arrives, not until any answer arrives.
     */
    /**
     * ‼️ U-27 — THE PUSH CARRIES EVERY ENGINE, NOT JUST CLAUDE'S SNAPSHOT.
     * The card grew mini tabs, and a tab whose figures arrive on a different
     * beat from the tab beside it is two cards pretending to be one — so all
     * four ride the same message the indicator already sends.
     */
    static pushPlanUsage(
        usage: PlanUsageSnapshot | undefined,
        beat: { ms: number; active: boolean },
        engines?: unknown[],
        engine?: string,
        account?: string
    ): void {
        const panel = DashboardPanel.current;
        if (!panel) { return; }
        void panel.panel.webview.postMessage({
            type: 'planUsage', usage, beat, engines, engine, account, push: true,
            // X-244 — read here rather than taken as a sixth argument: the list
            // is a fact about the machine, not about this beat, and a caller
            // that forgot to pass it would silently empty the picker.
            accounts: panel.deps.planUsageAccounts?.() ?? []
        });
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: DashboardDeps, projectFilter?: string) {
        this.pendingProjectFilter = projectFilter;
        this.render();
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
        this.deps.index.onDidUpdate(() => this.refresh(), null, this.disposables);
    }

    private render(): void {
        const data = buildData(this.deps, this.tableN) as Record<string, unknown>;
        // consumed once, by the page's first paint — a filter that reapplied on
        // every refresh would fight the reader's own filter box
        if (this.pendingProjectFilter !== undefined) {
            data.projectFilter = this.pendingProjectFilter;
            this.pendingProjectFilter = undefined;
        }
        this.panel.webview.html = htmlShell(
            this.panel.webview,
            this.deps.extensionUri,
            'Agent Farm Dashboard',
            data,
            'dashboard.js'
        );
    }

    refresh(): void {
        this.panel.webview.postMessage({ type: 'data', data: buildData(this.deps, this.tableN) });
    }

    private onMessage(msg: { type: string; [k: string]: unknown }): void {
        switch (msg.type) {
            case 'openAgent':
                vscode.commands.executeCommand('agentfarm.openAgentDetail', { agentId: msg.agentId });
                break;
            case 'openSession':
                // ts (optional) = the clicked turn's opening prompt — the viewer
                // reveals an already-open panel and scrolls it right there.
                vscode.commands.executeCommand('agentfarm.openSession', msg.file,
                    typeof msg.ts === 'number' && msg.ts > 0 ? msg.ts : undefined);
                break;
            case 'startSession':
                vscode.commands.executeCommand('agentfarm.startSession', { agentId: msg.agentId });
                break;
            case 'newAgent':
                vscode.commands.executeCommand('agentfarm.newAgent');
                break;
            case 'openGuide':
                vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
            case 'openTimeline':
                vscode.commands.executeCommand('agentfarm.openTimeline');
                break;
            case 'openSearch':
                vscode.commands.executeCommand('agentfarm.searchTranscripts');
                break;
            case 'openFarmSettings':
                vscode.commands.executeCommand('agentfarm.openFarmSettings');
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'focusTerminal':
                vscode.commands.executeCommand('agentfarm.focusSessionTerminal', {
                    sessionId: typeof msg.sessionId === 'string' && msg.sessionId ? msg.sessionId : undefined,
                    agentName: typeof msg.agentName === 'string' ? msg.agentName : undefined,
                    cwd: typeof msg.cwd === 'string' && msg.cwd ? msg.cwd : undefined
                });
                break;
            case 'manageProjects':
                // the page, not a quick-pick: a project is edited where it can
                // be seen
                void vscode.commands.executeCommand('agentfarm.openProjects');
                break;
            // U-27 — the card's engine tabs. The COMMAND owns the choice (it
            // writes the setting the status bar reads and pushes both surfaces),
            // so this hands it over rather than keeping a second copy.
            case 'setUsageEngine':
                void vscode.commands.executeCommand('agentfarm.setUsageEngine',
                    typeof msg.id === 'string' ? msg.id : '');
                break;
            case 'pinSession':
                // the star already flipped in the webview — pass the state it
                // wants, not a toggle, so the two can never disagree
                void vscode.commands.executeCommand('agentfarm.pinSession', {
                    sessionId: typeof msg.sessionId === 'string' ? msg.sessionId : '',
                    wantPinned: msg.pinned === true
                });
                break;
            case 'interruptSession':
                void vscode.commands.executeCommand('agentfarm.interruptSession', {
                    sessionId: typeof msg.sessionId === 'string' && msg.sessionId ? msg.sessionId : undefined,
                    agentName: typeof msg.agentName === 'string' ? msg.agentName : undefined
                });
                break;
            case 'refresh':
                this.refresh();
                break;
            case 'planUsage': {
                // The card's own beat (and its ⟳ button, which sets force).
                // Answered out-of-band so a slow endpoint never stalls the page.
                void (async () => {
                    const usage = await this.deps.refreshPlanUsage?.(msg.force === true);
                    // the beat rides along: it changes with the fleet, not with
                    // a setting, so the card re-arms itself from every answer
                    void this.panel.webview.postMessage({
                        type: 'planUsage', usage, beat: this.deps.planUsageBeat?.(),
                        // X-212 — the owner rides with the figures, so a card
                        // refreshed by its own ⟳ cannot fall behind the heading
                        account: this.deps.planUsageAccount?.(
                            this.deps.planUsageEngine?.() ?? 'claude') ?? '',
                        // X-244 — and the pickable sign-ins with them, so ⟳
                        // moves every figure on the card and not just the one
                        // that happens to be on show.
                        accounts: this.deps.planUsageAccounts?.() ?? []
                    });
                })();
                break;
            }
            case 'setTableN': {
                // Sessions-table Show box (0 = all). The pool is rebuilt host-side
                // so the requested top-N is genuine, not a re-slice of the old pool.
                const n = typeof msg.n === 'number' && isFinite(msg.n) ? Math.floor(msg.n) : -1;
                if (n < 0) { break; }
                this.tableN = n;
                this.refresh();
                break;
            }
            case 'sessionTurns': {
                // On-demand per-turn breakdown for an expanded session row.
                // Only files the index actually lists are readable from here —
                // the webview must not be able to point us at arbitrary paths.
                const file = typeof msg.file === 'string' ? msg.file : '';
                // X-27: the table now lists every engine, so the guard has to
                // recognise every engine's file too — otherwise expanding a
                // Codex row silently returns nothing and reads as a hang.
                if (!file || !this.deps.index.allWithExternal().some(s => s.file === file)) { break; }
                let turns: unknown = [];
                try {
                    // reuse the session viewer's proven transcript parse; we only
                    // keep the turn table (maxMessages 1 keeps the throwaway
                    // message payload minimal — turns are computed before the cut)
                    turns = buildViewerData(file, {
                        extensionUri: this.deps.extensionUri,
                        getPricing: () => this.deps.getPricing(),
                        maxMessages: () => 1,
                        contextLimitFor: () => 0
                    }).turns;
                } catch { /* fail-soft: an unreadable file shows an empty turn list */ }
                void this.panel.webview.postMessage({ type: 'sessionTurns', file, turns });
                break;
            }
            case 'compareWindow': {
                // Agent-comparison window: per-agent totals inside [from, to].
                const from = typeof msg.from === 'number' ? msg.from : 0;
                const to = typeof msg.to === 'number' ? msg.to : Date.now();
                if (!(from >= 0) || !(to > from)) { break; }
                const rows = this.deps.getAgents().map(a => ({
                    id: a.id,
                    name: a.name,
                    ...agentWindowTotals(this.deps.index.forAgent(a.id), from, to)
                }));
                void this.panel.webview.postMessage({ type: 'compareWindow', from, to, rows });
                break;
            }
            case 'statusAction': {
                /**
                 * Farm Status card buttons. Commands stay whitelisted — a
                 * webview must not be able to run arbitrary commands — but the
                 * list is DERIVED from the card that was just published rather
                 * than typed out here.
                 *
                 * ‼️ X-234 — THE HAND-WRITTEN SET WAS THE BUG. It held three
                 * commands and `agentfarm.openEngines` was not one of them, so
                 * pressing the Engines button posted a message this handler
                 * dropped without a word. X-203 had just fixed that button's
                 * DISAPPEARANCE, so the user finally had a control to press and
                 * still got nothing — the worst of both. A list typed beside the
                 * thing it is supposed to describe goes stale the first time
                 * somebody adds a row, and nothing fails when it does.
                 *
                 * Deriving costs one rebuild of a small pure record per click
                 * and makes the guarantee structural: a door this card can draw
                 * is a door this handler will open, by construction.
                 */
                const ALLOWED = new Set(
                    (this.deps.farmStatus?.() ?? [])
                        .filter(r => r.action && r.action.kind === 'command')
                        .map(r => String(r.action?.value ?? '')));
                if (msg.kind === 'command' && typeof msg.value === 'string' && ALLOWED.has(msg.value)) {
                    void vscode.commands.executeCommand(msg.value);
                } else if (msg.kind === 'command') {
                    // ‼️ AND A REFUSAL IS NOT A SILENCE. Swallowing the press is
                    // exactly the defect above; if this ever fires, the reader
                    // needs to know it was refused rather than that the button
                    // is broken.
                    void vscode.window.showWarningMessage(
                        `Agent Farm: that button asked for "${String(msg.value)}", which the Farm Status `
                        + 'card is not currently offering, so it was refused rather than run.');
                } else if (msg.kind === 'guide' && typeof msg.value === 'string') {
                    void vscode.commands.executeCommand('agentfarm.openGuide', msg.value);
                } else if (msg.kind === 'settings' && typeof msg.value === 'string') {
                    void vscode.commands.executeCommand('workbench.action.openSettings', msg.value);
                }
                break;
            }
        }
    }

    private dispose(): void {
        DashboardPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
