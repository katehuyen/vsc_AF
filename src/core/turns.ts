import { BridgeRegistry, need, optNum, optStr } from './bridge';
import { deliverDocument, exportStamp } from './exportDoc';
import { ENGINE_ENUM } from './consoleEngine';
import { CtxWindowSource, contextWindowOf } from './pricing';
import { SessionInfo, SessionOrigin, sessionHeadless, sessionMission, sessionOrigin } from './sessions';
import { ChainIndex, RunCategory, chainIndexNow, runCategory } from './chainMembership';
import { RunIdentity } from './turnRuntime';
import { RouteNames, turnMark } from './routeName';
import { matchesAny, profileOf, providersOf, RUN_SELECTION_ARGS, runSelectionArgs, selectionArg } from './runFilter';

/**
 * Turns page data: every session unrolled into one row per user turn. Turn
 * rollups are collected once at transcript-parse time (SessionInfo.turns), so
 * building the page is a cheap map over the index — no re-reading transcripts.
 */

export interface TurnRow {
    file: string;
    sessionId: string;
    cwd: string;
    /** Display name incl. machine label, like the Sessions tables. */
    agent: string;
    /** Raw agent name — the filter select matches on this. */
    agentName: string;
    /** Session title (short column; the full text rides in the tooltip). */
    session: string;
    /** 1-based turn number within its session. */
    n: number;
    /** The session's total turn count (context for "turn n of N"). */
    of: number;
    /** Opening prompt snippet — the row's identity. */
    label: string;
    ts: number;
    /**
     * Milliseconds until the next turn opened (last turn: until the session's
     * end). Milliseconds rather than minutes because every surface formats a
     * duration with the same helper now, and rounding to minutes here threw
     * away what that helper shows below one (see charts.js fmtDur).
     */
    durationMs: number;
    /** How long the turn itself ran — prompt to its last line. */
    ms: number;
    /** Round trips, and every step they carried — see SessionTurn.steps. */
    apiCalls: number;
    steps: number;
    /** Of those steps, the ones that were the model reasoning. */
    thinking: number;
    /** What the window held when the turn ended. */
    endCtx: number;
    /**
     * ‼️ X-113 — AND THE CEILING THAT READING IS A FRACTION OF. The page had
     * none, so it divided every turn of every engine by 200 000 and printed a
     * percentage: wrong by a third on a Codex thread and by five on a
     * million-token model, and exact-looking in both. 0 means nobody stated
     * one — then the page prints no fraction.
     *
     * Resolved against the turn's OWN last model, not the session's: a session
     * that switched models mid-way has turns with different ceilings, and the
     * session-level figure is the wrong one for all but the last of them.
     */
    ctxWindow: number;
    /** Which of the three answers that was — see contextWindowOf. */
    ctxWindowSource: CtxWindowSource;
    tokens: number;
    /** The same turn against the plan limit — see SessionTurn.wTokens. */
    wTokens: number;
    cost: number;
    tools: number;
    errors: number;
    models: string[];
    /** ‼️ X-108 — provider(s) the engine itself named for this turn. Empty on
     *  every engine that publishes none, which is Claude for ever. */
    providerIds: string[];
    /**
     * ‼️ X-111 — THE PROVIDER(S) THIS TURN WAS SERVED BY, resolved by the one
     * rule (media/afRunFilter.js): the turn's own report when it made one,
     * else the route its session was launched on. This is how "only Kimi's
     * turns" finds the Claude-via-Kimi turns, which never name Kimi themselves
     * and were unfindable while `providerIds` was the only column.
     */
    providers: string[];
    /** X-521 — `providerIds` with a lent route read back as its company, and OpenCode's own model by its catalog name. */
    servedBy: string[];
    modelLabel: string;
    servedLabel: string;
    /** The stored profile the session was launched on — Claude routes only, '' elsewhere. */
    profile: string;
    /** The session's declared route (its provider id), '' when it was launched on none. */
    route: string;
    routeLabel: string;
    sidechain: boolean;
    /** Who started the session this turn belongs to — 'user' dialog or 'auto' run. */
    origin: SessionOrigin;
    /** U-191 — the Sessions table's category, its relay chain and leg, its mission, and whether it ran with no terminal. */
    category: RunCategory;
    chainId: string;
    chainLeg: number;
    mission: { id: string; title: string } | null;
    /** The project the session's work belongs to, as the Sessions table names it ('' = no resolver). */
    project: string;
    headless: boolean;
    active: boolean;
    /**
     * ‼️ WHICH ENGINE RAN THE TURN (X-35). Named exactly as the sessions tables
     * name it (`SessionInfo.source ?? 'claude'`), because a Claude transcript
     * states no engine and the answer being an ABSENCE is why this page could
     * not say "Claude" out loud. Every row carries it, so a page listing four
     * engines' turns can be read and filtered.
     */
    engine: string;
}

/** All turn rows of one session, newest data included. */
export function turnRowsFor(
    s: SessionInfo, active: boolean, forced = 0, identity?: RunIdentity, chains?: ChainIndex, project = '', names?: RouteNames
): TurnRow[] {
    const origin = sessionOrigin(s);
    const mission = sessionMission(s) ?? null;
    const at = chains?.bySession.get(s.sessionId);
    const run = {
        category: runCategory(origin, mission?.id, !!at), chainId: at?.chainId ?? '',
        chainLeg: at?.leg ?? 0, mission, project, headless: sessionHeadless(s)
    };
    const profile = profileOf(identity);
    return s.turns.map((t, i) => {
        const next = s.turns[i + 1];
        const endTs = next?.ts || s.lastTs || t.ts;
        const win = contextWindowOf(
            s.ctxWindow ?? 0,
            t.models?.length ? t.models[t.models.length - 1] : '',
            forced);
        const mark = turnMark(s.source ?? 'claude', identity, t.providerIds, t.models, names);
        return {
            file: s.file,
            sessionId: s.sessionId,
            cwd: s.cwd ?? '',
            agent: (s.agentName ?? '?') + (s.machine ? ` ⇄ ${s.machine}` : ''),
            agentName: s.agentName ?? '',
            session: s.title,
            n: t.n,
            of: s.turns.length,
            label: t.label,
            ts: t.ts,
            durationMs: t.ts && endTs >= t.ts ? endTs - t.ts : 0,
            ms: t.ms,
            apiCalls: t.apiCalls,
            steps: t.steps,
            thinking: t.thinking,
            endCtx: t.endCtx,
            ctxWindow: win.tokens,
            ctxWindowSource: win.source,
            tokens: t.tokens,
            wTokens: t.wTokens,
            cost: t.cost,
            tools: t.tools,
            errors: t.errors,
            models: t.models,
            providerIds: t.providerIds ?? [],
            ...mark,
            providers: providersOf(identity, mark.servedBy),
            profile,
            route: identity?.providerId ?? '',
            routeLabel: identity?.providerLabel ?? '',
            sidechain: s.isSidechain,
            origin,
            ...run,
            active,
            engine: s.source ?? 'claude'
        };
    });
}

/** Every turn across the farm, newest first. */
export function buildTurnRows(
    sessions: SessionInfo[],
    isActive: (s: SessionInfo) => boolean,
    /** The reader's own ceiling override, when the caller has the settings
     *  door; core has none of its own. */
    forced = 0,
    /** X-111 — the session's identity, as the Sessions table states it
     *  (`sessionIdentity`). Absent, every turn is on no route. */
    identityOf?: (s: SessionInfo) => RunIdentity | undefined,
    /** U-191 — the relay chains, so a leg's turns read ⑂ Baton. */
    chains?: ChainIndex,
    /** U-191 — the session's project, by the Sessions table's own resolver. */
    projectOf?: (s: SessionInfo) => string | undefined,
    names?: RouteNames
): TurnRow[] {
    const rows: TurnRow[] = [];
    for (const s of sessions) {
        rows.push(...turnRowsFor(s, isActive(s), forced, identityOf?.(s), chains, projectOf?.(s) ?? '', names));
    }
    return rows.sort((a, b) => b.ts - a.ts);
}

/** Bridge access (constitution §19.C): the Turns page's data as an op. */
export function registerTurnsOps(
    bridge: BridgeRegistry,
    deps: {
        sessions(): SessionInfo[];
        isActive(s: SessionInfo): boolean;
        /** The reader's ceiling override, so the op answers the same
         *  percentage the page draws. */
        forcedWindow?(): number;
        /** X-111 — the session's identity, so the op's provider filter finds
         *  what the page's does. */
        identityOf?(s: SessionInfo): RunIdentity | undefined;
        /** U-191 — the session's project, so `project=` finds what the page's picker does. */
        projectOf?(s: SessionInfo): string | undefined;
        /** X-521 — the route names, so a turn's badge reads what the page's does. */
        routeNames?(): RouteNames;
        /**
         * B-21 — the Turns page's own Markdown builder (`buildTurnsMarkdown`),
         * injected because it reads the reader's settings and this module is
         * vscode-free. The op must never assemble a second document of its own:
         * an export that describes a turn differently from the page it came
         * from is a quieter answer to the same question.
         */
        exportMarkdown?(
            shown: { file: string; n: number }[],
            openKeys: Set<string>,
            roles: string[],
            opts: { view: boolean; foldedTitles: boolean }
        ): string;
        /** Where an exported document lands when the caller names no file. */
        defaultReportDir?(): string;
    }
): void {
    /**
     * The turn selection both reading ops ask for, applied once. `turns.list`
     * and `turns.export` are the same question with two answers (rows · a
     * document), so the filters cannot be allowed to drift apart.
     */
    const select = (args: Record<string, unknown>, limitDefault: number): TurnRow[] => {
        const agent = optStr(args, 'agent').toLowerCase();
        const engine = optStr(args, 'engine').toLowerCase();
        const origin = optStr(args, 'origin').toLowerCase();
        const cats = optStr(args, 'category').toLowerCase().split(',').map(c => c.trim()).filter(Boolean);
        const hl = args.headless === undefined ? undefined : String(args.headless) === 'true';
        const sel = runSelectionArgs(args);
        // U-191 — the page's Chains / Missions / Projects pickers; any named value matches, case aside
        const pick = (k: string) => (selectionArg(args[k]) ?? []).map(v => v.toLowerCase());
        const chainSel = pick('chain'), missionSel = pick('mission'), projectSel = pick('project');
        const named = (want: string[], ...have: (string | undefined)[]) =>
            !want.length || have.some(v => !!v && want.includes(v.toLowerCase()));
        // ‼️ B-25 — `optNum`, not a `typeof === 'number'` test. The CLI's
        // `limit=50` shorthand and a hand-written arg both arrive as TEXT,
        // and a type test drops them for the default without saying so —
        // the same silence that queued four items at the bottom.
        const limit = Math.max(1, Math.floor(optNum(args, 'limit', limitDefault)) || limitDefault);
        return buildTurnRows(deps.sessions(), deps.isActive, deps.forcedWindow?.() ?? 0, deps.identityOf, chainIndexNow(), deps.projectOf,
            deps.routeNames?.())
            .filter(r => !agent || r.agentName.toLowerCase() === agent)
            // ‼️ The same axis the page filters on — an agent calling this op
            // to ask "what has Codex been doing" had no way to say so.
            .filter(r => !engine || engine === 'all' || r.engine.toLowerCase() === engine)
            .filter(r => origin !== 'user' && origin !== 'auto' ? true : r.origin === origin)
            .filter(r => !cats.length || cats.includes(r.category))
            .filter(r => hl === undefined || r.headless === hl)
            .filter(r => named(chainSel, r.chainId) && named(missionSel, r.mission?.id, r.mission?.title)
                && named(projectSel, r.project))
            // X-111 — the three axes the page filters on, by the same rule;
            // `providers` is already the resolved value, so no turn report.
            .filter(r => matchesAny(r.providers, sel.providers)
                && matchesAny([r.profile].filter(Boolean), sel.profiles)
                && matchesAny(r.models, sel.models))
            .slice(0, limit);
    };

    bridge.register({
        op: 'turns.export',
        describe: 'B-21 — THE TURNS TABLE AS A DOCUMENT. The page\'s Export MD without the page: the same header line per turn (agent, turn n/of, the prompt label, session, models, who served it, steps, duration, tokens, context, cost, tools, errors) and each turn\'s full content — user text, assistant text, tool calls and tool results — assembled by the very function the page uses, so the two can never describe a turn differently. Selects exactly like turns.list. ‼️ TURN CONTENT IS HEAVY, so the default is 50 turns rather than the whole farm, and the answer always names how many MATCHED: a caller that got 50 of 900 is told so rather than handed a file that stops. args: every turns.list filter (agent?, engine?, origin?, category?, headless?, chain?, mission?, project?, provider/profile/model selection, limit? — default 50) · file? (write there, atomically) · save? (let it land in the report folder). Returns the content when neither is given.',
        handler: (args) => {
            need(deps.exportMarkdown, 'Turn export is not wired on this host.');
            const limit = Math.max(1, Math.floor(optNum(args, 'limit', 50)) || 50);
            const matched = select({ ...args, limit: 1e9 }, 1e9).length;
            const rows = select(args, 50);
            need(rows.length > 0, 'No turn matches those filters — turns.list shows what is there.');
            const md = (deps.exportMarkdown as NonNullable<typeof deps.exportMarkdown>)(
                rows.map(r => ({ file: r.file, n: r.n })), new Set<string>(), [],
                { view: false, foldedTitles: false });
            return {
                turns: rows.length, matched, truncated: matched > rows.length ? matched - rows.length : 0, limit,
                ...deliverDocument(args, md, `AgentFarm-Turns-${exportStamp()}.md`,
                    () => deps.defaultReportDir?.() ?? '')
            };
        }
    });

    bridge.register({
        op: 'turns.list',
        describe: 'Every user turn across the farm, newest first (the Turns page as data). args: agent? (name filter), engine? (' + ENGINE_ENUM + ' — which engine ran the turn), origin? ("user" = turns of sessions a person started interactively — the page default; "auto" = turns of automation runs (schedule/trigger/task/mission); omit or "all" = both), category? (user | baton | auto | mission, comma-separated: the Sessions table\'s four categories and the page\'s You/Baton/Auto/Mission switches; a mission stamp wins, then a relay leg a program started, then who started it), headless? (true = only runs with no terminal behind them, false = none of them), chain? / mission? / project? (the page\'s Chains, Missions and Projects pickers: a relay chain id, a mission id or title, a project name — several comma-separated, case aside; a turn on none matches no value), ' + RUN_SELECTION_ARGS + ', limit? (default 20). Each row carries ctx (what the window held when the turn ended), ctxWindow (the ceiling it is a fraction of, 0 = nobody stated one), ctxWindowSource (forced | engine | model | ""), providerIds (what the engine itself named for the turn — empty on Claude for ever) and providers (what served it: the turn\'s own, else its session\'s route — the value the filter matches).',
        handler: (args) => {
            return select(args, 20)
                .map(r => ({
                    agent: r.agentName, engine: r.engine,
                    session: r.session, turn: `${r.n}/${r.of}`,
                    label: r.label, ts: r.ts, origin: r.origin, tokens: r.tokens,
                    category: r.category, chain: r.chainId ? `${r.chainId} leg ${r.chainLeg}` : null,
                    mission: r.mission?.title ?? null, project: r.project || null, headless: r.headless,
                    // ‼️ X-113 — the context reading AND its ceiling, because
                    // the figure alone cannot be read: an agent asking how
                    // full a turn left the window was previously given the
                    // number and left to assume 200 000.
                    ctx: r.endCtx, ctxWindow: r.ctxWindow,
                    ctxWindowSource: r.ctxWindowSource,
                    wTokens: Math.round(r.wTokens),
                    cost: Math.round(r.cost * 10000) / 10000,
                    tools: r.tools, errors: r.errors, models: r.models, providerIds: r.providerIds,
                    providers: r.providers, profile: r.profile || null, route: r.route || null, modelLabel: r.modelLabel || null,
                    servedLabel: r.servedLabel || null
                }));
        }
    });
}
