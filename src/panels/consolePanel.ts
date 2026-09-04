import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { ConsoleHost, describeAttachment, looksLikeUri, safeAttachmentName } from '../core/consolehost';
import {
    Attachment, ATTACH_LIMITS, carriedTotals, ConsoleMessage, ConsoleSessionState, OlderHistory,
    PERMISSION_GRANTS, PERMISSION_MODES_LIVE, sessionAllowRule, transcriptPos
} from '../core/consoleproto';
import {
    filterResumable, isResumeFiltered, RESUME_DEFAULT_N, RESUME_MAX, ResumeQuery
} from '../core/consoleresume';
import {
    EngineId, engineFlagFor, engineNote, engineOf, ENGINES, engineTakesEffort, noTranscriptNote
} from '../core/consoleEngine';
import { EngineOption, engineRefusal } from '../core/engines';
import { ProviderForm, ProviderPick, ProviderTransport } from '../core/launchProvider';
import { EngineModels, narrowLaunch } from '../core/models';
import {
    EFFORT_CHOICES, LastLaunch, LaunchOptions, modelChoices, PERMISSION_CHOICES,
    rememberedOn, RunSurface
} from '../core/launch';
import { totalTokens, Usage } from '../core/pricing';
import { PromptSnippetsSnapshot } from '../core/prompts';
import { conversationTitle, SessionInfo, SessionIndex, sessionOrigin, lastRunDimensions } from '../core/sessions';
import { SESSION_COLORS } from '../core/sessionmarks';
// K-30 — the same two functions the bridge's toolbox.slashCommands op uses.
import { getSlashCommands, reportToSources, SlashReport } from '../core/slashCommands';
import { scanSlashSources } from '../core/toolbox';
import { handleAfNav, htmlShell, promptSnippetMessage, wikiMarksOf, wikiMarkMessage } from './base';
import { afConfig } from '../core/settingsDoor';

/**
 * The composer's chip list, back as attachments.
 *
 * Only the PATH is trusted from the webview — everything else is re-derived
 * here, so a file swapped since it was hung on the message is described as it
 * is now, not as it was.
 */
function attachmentsOf(msg: Record<string, unknown>): Attachment[] {
    const raw = Array.isArray(msg.attach) ? msg.attach as { path?: unknown }[] : [];
    const seen = new Set<string>();
    const out: Attachment[] = [];
    for (const a of raw) {
        if (typeof a?.path !== 'string' || seen.has(a.path)) { continue; }
        seen.add(a.path);
        const d = describeAttachment(a.path);
        if (d) { out.push(d); }
        if (out.length >= ATTACH_LIMITS.count) { break; }
    }
    return out;
}

/** Staged drops older than a week — the folder is a staging area, not an archive. */
function sweepSpills(dir: string): void {
    const week = 7 * 24 * 60 * 60 * 1000;
    try {
        for (const f of fs.readdirSync(dir)) {
            const p = path.join(dir, f);
            try {
                if (Date.now() - fs.statSync(p).mtimeMs > week) { fs.unlinkSync(p); }
            } catch { /* in use or already gone — not worth a word */ }
        }
    } catch { /* no folder yet */ }
}

/**
 * DALGA 1 — the Console: the panel stops being a window onto the terminal and
 * becomes a place you can talk in.
 *
 * Left: the sessions this window is hosting, plus your shelf and the recent
 * transcripts (a click resumes one *into* the Console). Right: the
 * conversation and a composer whose controls are the launcher's own vocabulary
 * — agent · model · effort · permission mode — except that here the permission
 * mode is live: when a tool is refused, the same control grants it and the
 * agent retries. Nothing about this is a mock: every row comes from a real
 * `claude` process this window owns.
 */

/**
 * A route as a card can say it. Everything here is public: the endpoint lives
 * in an ordinary setting, and the credential has no field to travel in.
 */
export interface ConsoleRoute {
    /** the profile (Claude) or provider (OpenCode) id the card was started on */
    id: string;
    /** its own name, which is what the reader sees */
    label: string;
    /** the word THIS engine uses — `Route` on Claude, `Provider` on OpenCode */
    noun: string;
    /** Claude only: which tier of that route, when the launch named one */
    tier?: string;
    /** where it points. Public, and the one line that makes the mark checkable */
    baseUrl?: string;
    authKind?: string;
    /** how long the pick lasts, in the adapter's own words */
    scopeNote: string;
    /**
     * ‼️ X-105 — WHO IS SERVING IT NOW, when that is no longer who it started
     * with — and only ever on an engine whose scope allows the difference.
     *
     * `id`/`label` above are the LAUNCH record and they do not move: X-102 made
     * the launch manifest immutable precisely so a card that ran three turns on
     * one provider and then moved does not become a card that always ran on the
     * second. But on OpenCode the model IS `provider/model`, so a mid-session
     * model change moves the provider — and a pill that went on naming the
     * launch value would be describing an endpoint the session stopped talking
     * to. Both facts, one subject, one panel.
     *
     * ‼️ DERIVED FROM THE MODEL THE CARD IS ON, NEVER STORED A SECOND TIME. The
     * model is already kept true by the engine's own answers
     * (`applyOpencodeConfig`), so a stored copy of its provider half would be a
     * second answer with its own way of going stale. And it is derived only
     * where the engine VOUCHES for the prefix (`splitQualifiedRef`), which is
     * the anti-guess rule this family is built on.
     */
    now?: { id: string; label: string };
    /**
     * ‼️ X-105 — WHO SERVED THE TURN THAT ALREADY RAN, when that is not who the
     * next one will run on. The REPORTED half of the pair X-102 built: `now`
     * above is what the engine is configured on for the next turn, this is what
     * the engine's own events say served the last one, and between a turn-
     * boundary change landing and the next turn starting they genuinely differ.
     *
     * ‼️ EMPTY ON CLAUDE FOR EVER, AND THAT IS MEASURED RATHER THAN MISSING. The
     * transcript names a model and never a route (23 Aug 2026: two processes on
     * separate routes under one model name, indistinguishable afterwards), and
     * reading a provider out of a model name is the one thing this family
     * forbids. So on that engine this is absent, which is the honest answer.
     */
    lastTurn?: { id: string; label: string };
}

export interface ConsoleDeps {
    extensionUri: vscode.Uri;
    host: ConsoleHost;
    getAgents(): AgentInfo[];
    index: SessionIndex;
    /**
     * ‼️ K-35 — THE USER'S OWN COLOUR ON A SESSION, read from the marks store
     * on every payload rather than captured.
     *
     * A live card is a hosted PROCESS record, not a `SessionInfo`, so the colour
     * the index projects onto the resumable rows never reaches it. Without this
     * the same session would be coloured on the "where you left off" row and
     * grey on the card three lines above it — which is the one thing a colour
     * must never do, because its whole job is to be the same everywhere.
     */
    colorFor?(sessionId: string): string;
    /** K-35 — set (or clear with '') that colour. Optional for the same reason
     *  every other write dep here is: a host that cannot do it draws a card
     *  whose dot is read-only rather than a page that throws. */
    setColor?(sessionId: string, color: string): void | Promise<void>;
    modelAliases(): string[];
    /**
     * S-20 — the model/effort vocabulary PER ENGINE, read from what each engine
     * is currently offering rather than from a constant. A dep and read on every
     * payload, for the same reason `engines` is: the Codex catalog is refreshed
     * by the CLI behind our back, and a list captured at activation would be the
     * stale list this exists to replace. Optional — absent means every engine
     * falls back to the flat `models`/`efforts` lists.
     */
    engineModels?(): Record<EngineId, EngineModels>;
    /**
     * ‼️ WHICH ENGINES THIS MACHINE CAN ACTUALLY START (X-18).
     *
     * A dep rather than a constant, and read on every payload rather than once:
     * installing the CLI or signing in happens in a terminal, WHILE this panel
     * is open, and a picker that had cached "not installed" for the session
     * would go on refusing an engine the user has just made ready. It walks PATH
     * and reads three small files, and this page rebuilds its snapshot several
     * times a second while a turn runs — so the panel holds the answer for a few
     * seconds (see `engineList`) rather than doing that walk per streamed line.
     */
    engines(): EngineOption[];
    launchDefaults(): { engine?: string; model?: string; effort?: string; permissionMode?: string };
    /**
     * ‼️ X-105 — WHICH ROUTE A CARD IS ON, DESCRIBED BY THE ENGINE'S OWN
     * ADAPTER.
     *
     * The card has carried `providerId` since X-103 and said nothing about it,
     * which made the one fact this whole family of items exists to establish —
     * what a conversation is actually served by — the one fact the reader could
     * not see. It is asked for per engine because the two engines with a
     * provider axis do not mean the same thing by it: on Claude it is a ROUTE
     * that Agent Farm injects and that is fixed for the session; on OpenCode it
     * is the engine's OWN provider, which the engine may legitimately change at
     * a turn boundary. The noun and the scope note are the adapter's own words,
     * never this panel's — a description invented here would be a fifth place
     * that can disagree with the four that already exist.
     *
     * `undefined` is the ordinary answer: four of the five engines have no
     * provider axis at all, and most Claude launches pick no route.
     *
     * ‼️ NOTHING SECRET. The endpoint is public (it is in the settings file);
     * the credential is not, is not read here, and has no field to arrive in.
     */
    routeOf?(
        engine: string, providerId?: string, tier?: string,
        /** ‼️ X-105 — the model the card is on RIGHT NOW, because on one engine
         *  that is what names the provider. See `ConsoleRoute.now`. */
        modelRef?: string,
        /** ‼️ X-105 — and the one the engine REPORTED for the turn that already
         *  ran. See `ConsoleRoute.lastTurn`. */
        reportedModelRef?: string
    ): ConsoleRoute | undefined;
    /**
     * ‼️ X-105 — WHAT THE COMPOSER MAY PICK, ASKED OF THE ENGINE'S OWN ADAPTER.
     *
     * `routeOf` above answers "what is this card served by" for a card that
     * already exists. This is the other half and a different question: what may
     * a session ABOUT to start be pointed at. It is the SAME reader the
     * launcher's route row is built from (`providerFormFor` → `launchProviderForm`),
     * so the words on the composer, the words in the launcher and the words on
     * the card are one statement rather than three.
     *
     * The transport is always `acp` here — a hosted card is spoken to over ACP,
     * and the transport is what decides whether a variant may be offered at all
     * (measured: the bare TUI takes no `--variant`, ACP declares none). Passing
     * the panel's own transport rather than letting the form guess is the only
     * way a control this panel draws cannot be one the panel then drops.
     */
    providerForm?(engine: string, pick: ProviderPick, transport: ProviderTransport): ProviderForm;
    /**
     * A pick narrowed to what the engine and route really carry, with whatever
     * had to go SAID OUT LOUD. Asked on every change rather than at start: a
     * tier that stops existing because the route moved must leave the box as the
     * route moves, not survive on screen until Send and vanish silently then.
     */
    prunePick?(engine: string, pick: ProviderPick, transport: ProviderTransport): ProviderPick;
    /**
     * ‼️ X-169 — WHICH SIGN-INS THIS ENGINE HAS ON THIS MACHINE, and which one
     * the next session takes if nobody says otherwise.
     *
     * Asked per engine, and the empty list is the ordinary answer: an engine
     * whose sign-in cannot be isolated has no accounts to offer and the composer
     * then shows no control at all — a control with no referent is what
     * docs/CONVENTIONS.md forbids, and one that pretended to switch accounts on
     * an engine that ignores the variable would be worse than absent.
     *
     * ‼️ NOTHING SECRET. A slot is an id, a label and a health verdict; no token
     * is read here and none has a field to arrive in.
     */
    accountsFor?(engine: string): {
        id: string; label: string; health: string; active: boolean;
        /** ‼️ X-170 — how much of the 5-hour window that plan has spent, or -1
         *  where nothing has measured it. The figure the choice turns on, so it
         *  travels with the row rather than costing a click. */
        percent: number;
    }[];
    /**
     * ‼️ S-34 — WHAT ONE AGENT WAS LAST STARTED WITH, and where.
     *
     * The composer is one of ten doors onto the same launch, and it was the one
     * that always opened on the fleet defaults: an agent last run on `opus` at
     * high effort came back at whatever the settings said, so the setup was
     * "remembered" in the launcher and forgotten everywhere a person actually
     * works. The panel does not own the record — `extension.ts` holds the one
     * copy in `globalState` — so it asks for it and writes back through these
     * two, exactly like every other door.
     */
    lastLaunch(agentId: string): LastLaunch | undefined;
    /** …and the write-back, made by `start` because `start` is the launch. */
    rememberLaunch(agentId: string, o: LaunchOptions, surface: RunSurface): void;
    /**
     * ‼️ K-36 — THE SLASH CATALOG, WHICH IS THE SAME KIND OF MEMORY AS ABOVE.
     *
     * One live session's `system:init` answer, what this install last proved it
     * has, and the write-back. Three functions rather than a store handed over,
     * for the reason `lastLaunch` is three: the panel does not own where it is
     * kept, and a second reader of `globalState` is a second answer.
     */
    slashReport?(s: ConsoleSessionState): SlashReport | undefined;
    recallSlash?(engine: string, agentId?: string): SlashReport | undefined;
    learnSlash?(engine: string, agentId: string | undefined, report: SlashReport): void;
    /**
     * Which sessions a live process already owns (the CLI's own registry).
     *
     * This is what stops the Console from telling a lie: `claude --resume <id>`
     * on a session that is already open in a terminal starts a SECOND process
     * on the same transcript. Both write to it, neither sees the other's
     * turns, and Agent Farm would show the interleaved result as one
     * conversation that no participant actually had.
     */
    liveOwners(): { sessionId: string; pid: number; entrypoint?: string; status?: string; cwd?: string }[];
    /** the conversation a session already had, off its transcript — display
     *  only, so a resume opens where you left off instead of on a blank page */
    history(sessionId: string): ConsoleMessage[];
    /**
     * ‼️ K-23 — the piece of the transcript ABOVE what the card is holding.
     *
     * The resume window stops at a few hundred rows so a huge transcript cannot
     * stall the panel, and everything older used to be reachable only by opening
     * the file in an editor — a conversation the Console had, in a place the
     * Console would not show. `have` is the positions already drawn, read off
     * the row ids, so what comes back is a strict addition and the same turn is
     * never drawn twice. Reading is free: the file is on this disk and no token
     * is spent (see core/consolehistory.ts).
     */
    olderHistory(sessionId: string, have: number[]): OlderHistory;
    /**
     * The sessions the PREVIOUS window was hosting when it went away.
     *
     * A hosted process belongs to its window: when VS Code closes (or crashes,
     * or the extension reloads) the conversation ends — leaving it running
     * orphaned is the leak 3.29.1 was about. What must not end with it is
     * knowing where you were: these rows put the sessions you were actually in
     * back on top of the Console, one click from continuing.
     */
    lastWindow(): { sessionId: string; agentName: string; title: string; cwd: string; endedAt: number }[];
    /** take a row off that shelf (resumed, or not wanted) */
    forgetLastWindow(sessionId: string): void;
    /**
     * Is this session held by a `claude` OUR Console started and nobody is
     * reading any more — an extension reload's leftover? See the extension's
     * `leftoverOwner`: it is the one owner a resume can honestly offer to end.
     */
    leftoverOwner(sessionId: string): { pid: number } | undefined;
    /** end that leftover, resolving once the session is really free */
    endLeftover(sessionId: string, pid: number): Promise<boolean>;
    /**
     * What the tokens a running turn has spent are worth, at the rates the rest
     * of the extension prices everything else with.
     *
     * The CLI only says what a turn cost once the turn has ENDED, so without
     * this the live strip could show the time and the tokens and then go silent
     * on the one number the user actually asks ("was that worth it?"). It is an
     * estimate and is marked as one; the line that closes the turn carries the
     * CLI's own figure, and every session total on this page is the CLI's.
     */
    estimateCost(model: string, usage: Usage): number;

    /**
     * The projects a session can be started under.
     *
     * ‼️ The composer's picker answers for the SESSION IT IS ABOUT TO START and
     * writes nothing else (see ConsolePanel.composerProject). It used to be the
     * window's active project, so a project chosen once — in the status bar,
     * for other work — filed and briefed every session started here from then
     * on, and "this one, under nothing" could not be said without changing what
     * the whole window meant. A new session is under no project until somebody
     * says otherwise; the status bar keeps its own answer, and neither writes
     * the other.
     */
    projects(): { id: string; name: string; icon?: string; color?: string; status: string }[];
    /**
     * ‼️ THE EXACT TEXT A SESSION IS GIVEN — read back off the file that was
     * handed to the CLI, not rebuilt for display.
     *
     * The channel is invisible: it never appears in the transcript, so the user
     * cannot see it the way they see their own message. That makes showing it
     * an obligation rather than a nicety — 3.50.0 was titled "the composer
     * stops lying about what it is sending", and sending something on the
     * user's behalf that they cannot inspect is the same fault with a different
     * channel. Describing the text would be no better; it has to be the text.
     */
    projectContextText(projectId: string): string;
    /**
     * ‼️ X-133 — THE OTHER HALF OF THE SAME INVISIBLE CHANNEL.
     *
     * `--append-system-prompt-file` takes ONE file, so the engineering
     * discipline the switch turns on is appended to the very same text the
     * project chip exists to make readable. It is therefore shown the same way:
     * verbatim, on hover, from the same composition the spawn will use. A
     * switch that says "on" and cannot show what "on" put in front of the model
     * is the transparency debt this panel already paid off once.
     */
    superpowersText(): string;
    /** Whether the folder can supply anything at all, and — when it cannot —
     *  the one sentence saying what is missing. A switch that silently does
     *  nothing is worse than no switch: the model would be believed to be
     *  working to a discipline it was never told about. */
    superpowersHealth(): { usable: boolean; why: string; skills: number };
    /** What this agent starts with when nobody has touched the switch
     *  (agentFarm.superpowersDefaults). */
    superpowersDefault(agentName: string): boolean;
    /**
     * ‼️ THE PROJECT A SESSION ALREADY BELONGS TO — what a RESUME must be told.
     *
     * A resume is not a new session, so the window's active project has nothing
     * to do with it and the composer's picker has been cleared by then anyway.
     * Without this the panel's own resume handed `ConsoleHost.start` no project
     * at all, it fell back to the window's active one (normally none), and a
     * conversation that had been running under a project came back under none:
     * the strip above the box said "No project" and the brief the agent was
     * re-told was the wrong one, or missing. See `sessionOwnProject` — the
     * membership order that answers this for every other surface too.
     */
    sessionProject(s: { sessionId?: string; agentId?: string; agentName?: string; cwd?: string }): string;

    /**
     * The phrases you say over and over, read off the user's own markdown file
     * (`agentFarm.promptSnippetsFile`).
     *
     * ‼️ READ ON DEMAND, NEVER ON THE PAYLOAD. This page rebuilds its data on
     * every event of every hosted session — several times a second while a turn
     * runs — and a file read on that path would be one disk hit per event for
     * something nobody is looking at. It is read when the menu is opened, which
     * also means the block you added in Obsidian thirty seconds ago is there
     * without reloading anything.
     */
    promptSnippets(): PromptSnippetsSnapshot;
}

export class ConsolePanel {
    private static current?: ConsolePanel;
    private disposables: vscode.Disposable[] = [];
    private selected?: string;
    /** agent to preselect in the composer (opened from an agent row) */
    private presetAgent?: string;
    /**
     * Is the resume list open, and what is it being asked for?
     *
     * Both live here rather than in the page because the ANSWER is built here:
     * the page can only filter what it was sent, and the whole point of the
     * filter is to reach a session that is not in the newest fifteen. When the
     * section is closed nothing is computed at all — this snapshot is rebuilt
     * on every event of every hosted session.
     */
    private resumeOpen = false;
    private resumeQuery: ResumeQuery = {};

    /**
     * ‼️ THE PROJECT THE NEXT SESSION WILL BE STARTED UNDER — the composer's own
     * answer, and it is `''` (no project) until somebody says otherwise.
     *
     * It used to BE the window's active project: the box read it, changing the
     * box moved it, and a session started here inherited it. So a project
     * chosen once, for something else, silently filed and briefed every session
     * started afterwards — and the box could not say "this one, no project"
     * without changing what the status bar meant for the whole window.
     * They are separate now. This is per-session; the status bar's active
     * project is the window's, and neither writes the other.
     */
    private composerProject = '';

    /**
     * ‼️ X-133 — THE ENGINEERING DISCIPLINE THE NEXT SESSION WILL BE STARTED
     * WITH, and `undefined` is a THIRD answer, not a missing one.
     *
     * Untouched, the switch shows the AGENT's own default — `developer` opens
     * with it on, an agent that files notes does not — and it has to keep
     * following that default as the agent picker is changed, or picking a
     * different agent would silently carry the last one's answer across. Once
     * the user touches it, it is theirs: `true` and `false` both mean "I said
     * so", and neither is overwritten by the next agent.
     *
     * Per composer for the same reason the project is: it is about the session
     * being started, not about the window. Cleared on `start`, exactly as the
     * project picker is — the next session gets its own agent's default back.
     */
    private composerSuperpowers: boolean | undefined = undefined;

    /**
     * ‼️ X-103 — THE ROUTE THE DOOR THAT OPENED THIS COMPOSER PICKED.
     *
     * The launcher's "Where: the Console panel" hands its whole setup over and
     * lets the person keep editing it; every OTHER dimension of that setup has a
     * box on the page, and this one does not yet — a provider control in the
     * composer is X-105's item, together with the identity the card then shows.
     *
     * ‼️ SO IT IS CARRIED RATHER THAN DROPPED, and the difference is not a
     * detail: dropped, the launcher would show a route row, take the person's
     * pick, and start a card on a completely different endpoint without a word.
     * Carried, the pick they made is the pick that runs. It is per composer for
     * the same reason the project and the discipline are, and cleared on `start`
     * so the NEXT session does not inherit a route nobody chose for it.
     */
    private composerRoute: { providerId?: string; tier?: string } | undefined = undefined;
    /**
     * ‼️ X-169 — WHICH SIGN-IN THE NEXT CARD STARTS ON.
     *
     * Held here rather than on the page for the same reason the route is: it
     * has to survive a repaint that rebuilds the whole strip, and it is pruned
     * by the engine (a Claude account is not a Codex one). `undefined` is the
     * ordinary answer and means "whatever `agentFarm.activeAccounts` says at
     * spawn" — which is the one place the "use this next" button writes.
     */
    private composerAccount: string | undefined = undefined;

    /**
     * ‼️ K-34 — A SETUP THE COMPOSER OPENS ON, rather than a session spawned
     * behind the user's back.
     *
     * The launcher's "Where: the Console panel" used to call `startConsoleSession`
     * the instant Start was pressed: the session spawned with the setup baked in,
     * and every dimension became unchangeable at the moment the person finally
     * had a window to change them in. Now the launcher hands the setup HERE and
     * the composer opens on it — the same answers, still editable, nothing
     * spawned until Send.
     *
     * One-shot, like `presetAgent`: it seeds a composer once (a bumped
     * `composerSeed` is what makes the page read it) and is let go on the next
     * start, or the setup would silently reapply itself to a later session.
     *
     * ‼️ AND IT NAMES THE ENGINE IT WAS BUILT FOR. A model is a word in one
     * engine's vocabulary; handed over without saying whose, the page has no
     * way to tell a value it should keep (an alias this engine runs but does
     * not advertise) from one it must drop (the model of the engine the user
     * just switched away from). Both look identical in the box.
     */
    private composerLaunch?: {
        model?: string; effort?: string; permissionMode?: string; prompt?: string; engine?: string;
    };

    /**
     * The engine the NEXT session will be started on, and the answer cache.
     *
     * The choice is per-composer for the same reason the project is: it is about
     * the session being started, not about the window. It opens on
     * `launchDefaults().engine` (empty = claude), so "always Codex" is settable
     * once in Farm Settings instead of picked every time.
     *
     * ‼️ THE CACHE IS NOT AN OPTIMISATION LOOKING FOR A PROBLEM. `data()` runs on
     * every event of every hosted session — several times a second while a turn
     * streams — and the engine matrix walks every PATH entry looking for three
     * commands. Held for 5s: long enough that a streaming turn does not walk
     * PATH a hundred times, short enough that an install you did in a terminal
     * is offered before you have finished reading the toast.
     */
    private composerEngine?: string;
    /**
     * A new-agent entry point is a new composer, even when the Console panel is
     * already open. The webview keeps drafts and picker state deliberately, so
     * it needs one explicit edge telling it when those launch settings must be
     * reseeded from the current defaults instead of inherited from the agent
     * that happened to be composed previously.
     */
    private composerSeed = 0;
    private engineCache?: { at: number; list: EngineOption[] };
    private static readonly ENGINE_TTL_MS = 5000;

    private engineList(): EngineOption[] {
        const now = Date.now();
        if (!this.engineCache || now - this.engineCache.at > ConsolePanel.ENGINE_TTL_MS) {
            this.engineCache = { at: now, list: this.deps.engines() };
        }
        return this.engineCache.list;
    }

    /** The composer's engine, defaulting to the launch default and then to
     *  `claude` — resolved in one place so the payload, the refusal and the
     *  spawn can never disagree about which engine was chosen. */
    private chosenEngine(): string {
        return (this.composerEngine ?? this.deps.launchDefaults().engine ?? '').trim() || 'claude';
    }

    /**
     * The agent this composer is FIXED to, when it was opened from that agent.
     * `presetAgent` seeds the picker once; this replaces the picker with the
     * name, because a composer reached from an agent's row is about that agent
     * and a dropdown there is only a way to lose it by accident. It is let go
     * the moment a session starts, or when the user says so.
     */
    private pinnedAgent?: string;

    static show(deps: ConsoleDeps, opts?: {
        sessionId?: string; agentId?: string; pinAgent?: boolean; projectId?: string;
        /** the engine a start picker already settled — the composer opens on it
         *  instead of asking the same question a second time */
        engine?: string;
        /** ‼️ K-34 — the whole setup a launcher already settled, so the composer
         *  opens on it instead of a session being spawned with it. */
        launch?: {
            model?: string; effort?: string; permissionMode?: string;
            prompt?: string; superpowers?: boolean;
            /** X-103 — the route the calling door picked; carried to the start
             *  because the composer has no control for it yet (X-105). */
            providerId?: string; tier?: string;
            /** X-169 — the sign-in the calling door resolved. Absent leaves the
             *  engine's active account to answer at the spawn. */
            account?: string;
        };
    }): void {
        const apply = (c: ConsolePanel): void => {
            if (opts?.sessionId) { c.selected = opts.sessionId; }
            if (opts?.engine) { c.composerEngine = opts.engine; }
            if (opts?.agentId) {
                // "talk to THIS agent": composer mode, nothing spawned yet
                // This is also a fresh launch decision. An already-open Console
                // must not lend it the previous agent's engine/model/effort.
                const d = c.deps.launchDefaults();
                // ‼️ S-34 — …and THIS agent's own last setup is what it opens on
                // instead. The rule that made the line above right is "not the
                // PREVIOUS agent's"; falling all the way through to the fleet
                // defaults was never the point, and it is why an agent you last
                // ran on opus came back on the settings file's model.
                const remembered = c.deps.lastLaunch(opts.agentId);
                c.composerEngine =
                    (opts.engine ?? remembered?.engine ?? d.engine ?? '').trim() || 'claude';
                // ‼️ S-34 (reopened) — AND THE RECORD IS READ FOR THE ENGINE THIS
                // COMPOSER IS ABOUT TO SHOW. This door reads the record directly
                // rather than through `withLastLaunch`, so the rule in core did
                // not reach it: told to open on Claude for an agent whose record
                // says Antigravity, it handed the composer the Antigravity model
                // under a Claude engine box. `rememberedOn` is that one rule, and
                // both readers now go through it.
                const last = remembered
                    ? rememberedOn(c.composerEngine, remembered) : undefined;
                c.composerSeed++;
                c.presetAgent = opts.agentId;
                c.selected = '';
                c.pinnedAgent = opts.pinAgent ? opts.agentId : undefined;
                // A caller that handed over a setup of its own is answered by
                // the block below; this is the door that handed over nothing.
                if (!opts.launch && last) {
                    c.composerLaunch = {
                        model: last.model, effort: last.effort,
                        permissionMode: last.permissionMode, engine: c.composerEngine
                    };
                    c.composerSuperpowers = last.superpowers;
                }
            }
            // ‼️ K-34 — the setup lands on the composer, and the seed is bumped
            // so the page actually reads it: `applyComposerSeed` is edge-driven,
            // and a setup delivered without a new seed would be ignored by an
            // already-open Console, which is the case this exists for.
            if (opts?.launch) {
                const l = opts.launch;
                // The engine is `composerEngine` and not something the setup
                // carries separately: the caller states it in the same call
                // (`opts.engine`), and a setup describing one engine while the
                // panel opens on another is the disagreement this records.
                c.composerLaunch = {
                    model: l.model, effort: l.effort,
                    permissionMode: l.permissionMode, prompt: l.prompt,
                    engine: c.composerEngine
                };
                c.composerSuperpowers = l.superpowers;
                // ‼️ X-103 — the route the calling door picked, carried rather
                // than dropped. ‼️ X-105 — and now NARROWED on the way in, by
                // the engine this composer is opening on: a door that offered a
                // Claude route and then opened the panel on another engine used
                // to leave the pick sitting in state where the new box could not
                // show it and Send would still have used it.
                c.composerRoute = c.prunedRoute((l.providerId ?? '').trim()
                    ? { providerId: l.providerId, tier: l.tier }
                    : undefined);
                // ‼️ X-169 — and the sign-in, narrowed the same way: a door that
                // resolved a Claude account and then opened the panel on Codex
                // would leave a pick in state that no box can show and that Send
                // would still have used.
                c.composerAccount = c.prunedAccount((l.account ?? '').trim() || undefined);
                c.composerSeed++;
            }
            // undefined = "I have no opinion"; '' = "explicitly no project"
            if (opts?.projectId !== undefined) { c.composerProject = opts.projectId; }
        };
        if (ConsolePanel.current) {
            ConsolePanel.current.panel.reveal();
            apply(ConsolePanel.current);
            ConsolePanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.console', 'Console', vscode.ViewColumn.Active,
            { enableScripts: true, retainContextWhenHidden: true });
        const fresh = new ConsolePanel(panel, deps);
        ConsolePanel.current = fresh;
        // ‼️ S-50 — APPLY, THEN LOAD. The order is the whole fix: what the door
        // came to say has to be in the page's first payload, because a push
        // aimed at a page that has not run yet lands nowhere (see `mount`).
        apply(fresh);
        fresh.mount();
    }

    /** Live update while the panel is open (the host fires on every event). */
    /**
     * ‼️ U-37 — A SESSION ON A NEW ENGINE NEVER GOT A NAME, AND THE CAUSE WAS
     * ONE WORD.
     *
     * The title was read from `index.all()`, which is DELIBERATELY the
     * Claude-only half: external sessions are kept out of it so Claude's
     * analytics can never see them (see core/sessionSource.ts). A Codex or
     * Antigravity card therefore looked itself up in a list it is structurally
     * absent from, found nothing, and read "(no name yet)" for ever — which
     * looked like a naming feature that had not been built for them rather
     * than a lookup in the wrong list.
     *
     * Three layers, in order: the index (a rename or a transcript-derived
     * name, from EITHER half), then the conversation itself. The last one is
     * the one that makes a name appear immediately: the host already holds
     * the first thing the user said, and `conversationTitle` is the same
     * function the transcript scan uses — so a hosted session is named by the
     * same rule as a terminal one, and it is named on the FIRST message
     * instead of whenever a transcript happens to be parsed.
     */
    private titleFor(s: { sessionId?: string; messages?: { role?: string; text?: string }[] }): string {
        const id = s.sessionId;
        if (id) {
            const known = this.deps.index.all().find(x => x.sessionId === id)
                ?? this.deps.index.external().find(x => x.sessionId === id);
            if (known?.title && known.title !== '(untitled session)') { return known.title; }
        }
        for (const m of s.messages ?? []) {
            if (m.role !== 'user' || !m.text) { continue; }
            // `conversationTitle` returns '' for a slash command, a harness
            // notice or an attachment-only message — the same judgment the
            // transcript scan makes, so the two cannot name a session
            // differently. An empty answer means "keep looking".
            const said = conversationTitle(m.text);
            if (said) { return said; }
        }
        return '';
    }

    static refreshIfOpen(): void {
        ConsolePanel.current?.refresh();
    }

    /**
     * Is the user looking at THIS conversation right now?
     *
     * The turn-finished notice exists for turns you are not watching; firing it
     * for the one on your screen would be the extension telling you what you
     * can already see, which is how a useful notice becomes noise.
     */
    static isWatching(hostId: string): boolean {
        const c = ConsolePanel.current;
        return !!c && c.panel.visible && c.selected === hostId;
    }

    private constructor(private panel: vscode.WebviewPanel, private deps: ConsoleDeps) {
        panel.webview.onDidReceiveMessage(m => void this.onMessage(m), null, this.disposables);
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.disposables.push(deps.host.onChange(() => this.refresh()));
    }

    /**
     * ‼️ S-50 — THE PAGE IS LOADED AFTER THE DOOR HAS SAID WHAT IT CAME TO SAY.
     *
     * The shell used to be built in the constructor, which runs BEFORE
     * `show`'s `apply` — so on the cold path (the Console is closed and this
     * call is what creates it) the bootstrap `window.__DATA__` carried none of
     * the caller's answers, and the `refresh()` that followed pushed them into
     * a webview whose script had not run yet. A push into an unloaded page is
     * not late, it is LOST; and because `presetAgent` is one-shot (`data()`
     * consumes it) the agent went with it and no later refresh could say it
     * again. Hence "the play button works, but only if the Console was already
     * open".
     *
     * Loading the page is therefore a second step the caller takes once the
     * instance describes what is to be shown. An already-open panel is
     * untouched by this: it keeps arriving by push, which is the channel a
     * loaded page reads.
     */
    private mount(): void {
        this.mounted = true;
        this.panel.webview.html = htmlShell(this.panel.webview, this.deps.extensionUri,
            'Console', this.data(), 'console.js');
    }

    /** Has the page been loaded? Until it has, a push has nowhere to land. */
    private mounted = false;

    private data(): Record<string, unknown> {
        const hosted = this.deps.host.list();
        if (this.selected && !hosted.some(s => s.id === this.selected)) { this.selected = undefined; }
        // An explicit "new session" (selected === '') is respected; only an
        // unset selection falls back to the newest hosted session.
        if (this.selected === undefined && hosted.length) { this.selected = hosted[0].id; }
        const d = this.deps.launchDefaults();
        const preset = this.presetAgent;
        this.presetAgent = undefined;   // one-shot: it seeds the picker once
        // What the strip above the box is ABOUT (see chipProjectId below): the
        // selected session's own project, or — in composer mode — the picker's.
        const chipProject = this.selected
            ? (hosted.find(s => s.id === this.selected)?.projectId ?? '')
            : this.composerProject;
        return {
            generatedAt: Date.now(),
            selected: this.selected ?? '',
            presetAgent: preset ?? '',
            composerSeed: this.composerSeed,
            // the conversation of the selected session in full; the others as headers
            sessions: hosted.map(s => ({
                id: s.id, agentId: s.agentId, agentName: s.agentName,
                sessionId: s.sessionId ?? '', cwd: s.cwd,
                // ‼️ WHICH ENGINE IS ANSWERING — on the row, not one click away.
                // Two sessions of the same agent can be running on two different
                // engines at the same moment, and everything the reader is about
                // to do differs between them: whether a message typed now steers
                // or is held, whether the pickers apply to this turn or the next,
                // whether the figure they are looking at is a price or a token
                // count. A badge is the cheapest place that difference can live.
                engine: s.engine ?? 'claude',
                engineLabel: engineOf(s.engine).label,
                // …and what that engine CHANGES, derived where the transport is
                // defined so a card cannot claim a shape the host does not have.
                turnShape: engineOf(s.engine).shape,
                steerable: engineOf(s.engine).liveControls,
                // ‼️ X-19: does a finished turn come with a price at all. False
                // means the strip shows tokens and says why there is no dollar —
                // never a zero, which reads as "that turn was free".
                reportsCost: engineOf(s.engine).reportsCost,
                // ‼️ X-105 — …AND WHAT IS ANSWERING ON THE OTHER SIDE OF IT.
                // The engine is the program; the route is the endpoint that
                // program talks to, and two cards on the same engine can be two
                // different companies' models. The card has carried the pick
                // since X-103 and said nothing about it, so the one fact this
                // family of items exists to establish was the one fact the
                // reader could not check. Resolved through the engine's own
                // adapter (see ConsoleDeps.routeOf); null on the four engines
                // with no provider axis and on every launch that picked none,
                // which is most of them — a mark for "nothing" would be noise
                // on every row.
                route: this.deps.routeOf?.(
                    s.engine ?? 'claude', s.providerId, s.tier, s.model, s.lastTurn?.model) ?? null,
                // the session's own title — the same one the side panel and the
                // viewer show, so a rename anywhere is a rename everywhere
                title: this.titleFor(s),
                status: s.status, cost: s.costUSD, turns: s.turns,
                // the texts themselves, not a count: a message that is waiting
                // is not in the conversation yet, so the composer has to show it
                queued: s.queued,
                tokens: s.tokens,
                // …and the same session against the plan limit. The raw count
                // is what moved; this is what it cost the window (QUOTA_WEIGHTS).
                wTokens: Math.round(s.wTokens ?? 0),
                model: s.model ?? '', effort: s.effort ?? '',
                permissionMode: s.permissionMode,
                // ‼️ K-22 — what the process is REALLY in, beside what was asked
                // for. They are different facts and showing only the request is
                // how a card came to say bypass while every tool call asked.
                enforcedPermissionMode: s.enforcedPermissionMode ?? '',
                permissionWhy: s.permissionWhy ?? '',
                // …and how many permission requests a bypassed session had to
                // answer on its own — above zero means the CLI asked when it
                // should not have, which is worth showing rather than hiding.
                bypassAutoApproved: s.bypassAutoApproved ?? 0,
                // ‼️ X-43 — THE FOUR CONTEXT FACTS TRAVEL TOGETHER OR NOT AT ALL.
                // `contextTokens` alone was read as "how full is it", which is a
                // question it cannot answer, and a turn total was quietly
                // answering it: the card showed `ctx 5.4M` on a 258 400 window.
                // What is in the window, what the window holds, where the
                // reading came from and how old it is — the strip draws the
                // first two and the AFTip carries all four.
                contextTokens: s.contextTokens ?? 0,
                contextWindowTokens: s.contextWindowTokens ?? 0,
                contextSource: s.contextSource ?? '',
                contextMeasuredAt: s.contextMeasuredAt ?? 0,
                contextStale: !!s.contextStale,
                lastTs: s.lastTs,
                // the working strip counts from here
                turnStartedAt: s.turnStartedAt ?? 0,
                // …and says what THIS TURN has spent, while it is still running:
                // the session's totals belong under the composer, a turn is the
                // unit you are watching. The money is an estimate — see
                // ConsoleDeps.estimateCost.
                turnTokens: s.turnTokensAt !== undefined ? Math.max(0, s.tokens - s.turnTokensAt) : 0,
                // …the same turn in limit terms, live. This is the figure that
                // tracks the 5-hour window; the raw one beside it does not.
                turnWTokens: Math.round(s.turnWTokens ?? 0),
                // …how many ROUND TRIPS those tokens took, and how many steps
                // they carried — two different numbers, and the tokens follow
                // the first (see turnApiCalls). The steps are counted by the
                // reducer, not by the strip walking its own rows: only the
                // reducer sees a thinking block, which is never drawn and is
                // the dearest step there is (see turnSteps / turnThinking).
                turnApiCalls: s.turnApiCalls ?? 0,
                turnSteps: s.turnSteps ?? 0,
                turnThinking: s.turnThinking ?? 0,
                // …priced at the RUNNING turn's own model: a switch applies from
                // the next turn, so `model` can already be the next one's.
                // ‼️ …and NOT ESTIMATED AT ALL on an engine that states no price
                // (X-19). Our rate card is Anthropic's; running it over a
                // ChatGPT plan's tokens would produce a number that is wrong
                // twice over — wrong rates, and a price where the billing model
                // has none. The tokens are exact and are what the strip shows.
                turnCost: s.turnUsage && engineOf(s.engine).reportsCost
                    ? this.deps.estimateCost(s.turnModel || s.model || '', s.turnUsage) : 0,
                // …and what it is thinking WITH — the CLI's own answer for this
                // turn (get_settings.applied), never the pickers: those are what
                // was ASKED for, and "Default" asks for nothing at all while the
                // turn still runs on a real model at a real effort (see
                // consoleproto's turnModel).
                turnModel: s.turnModel ?? '', turnEffort: s.turnEffort ?? '',
                // …and once it is over, the same strip keeps saying what it cost
                // until your next prompt starts a new turn (see lastTurn)
                lastTurn: s.lastTurn ?? null,
                pendingPermission: s.pendingPermission ?? null,
                // the question the turn is parked on — the card and the composer
                // both need it, and it outranks everything else on the page
                // …with the STANDING rule its third button would install spelled
                // out, derived where the rule itself is built so the button can
                // never promise something else (see sessionAllowRule). Null for
                // an AskUserQuestion: there is no permission to widen there.
                pendingAsk: s.pendingAsk
                    ? {
                        ...s.pendingAsk,
                        alwaysLabel: s.pendingAsk.questions.length
                            ? '' : sessionAllowRule(s.pendingAsk).label
                    }
                    : null,
                exitReason: s.exitReason ?? '',
                // the project this session was STARTED under — a badge on the
                // card, because the stamp is otherwise invisible and a session
                // filed somewhere the user did not expect must be noticeable
                projectId: s.projectId ?? '',
                projectName: s.projectId
                    ? (this.deps.projects().find(p => p.id === s.projectId)?.name ?? '') : '',
                // the project's own mark, so a card, a table row and the sidebar
                // all point at the same thing in the same way
                projectIcon: s.projectId
                    ? (this.deps.projects().find(p => p.id === s.projectId)?.icon ?? '') : '',
                // K-26 — which turns of this conversation are already in the
                // candidate pool. Only for the card being read: the badge is
                // drawn on its rows and nowhere else, and the other cards carry
                // no messages either (above).
                wikiMarks: s.id === this.selected && s.sessionId ? wikiMarksOf(s.sessionId) : [],
                // U-94 — and EVERY card carries its own whole-conversation
                // badge, which needs to know only whether anything of it is
                // kept. That is the turn each mark starts at (0 = the whole
                // thing) — a figure per mark rather than every mark of every
                // conversation on every repaint.
                wikiKept: s.sessionId ? wikiMarksOf(s.sessionId).map(m => m.from) : [],
                // K-35 — the user's own colour, keyed by session id like every
                // other mark. Empty until they pick one, and empty for a card
                // whose session has not written its id yet.
                color: s.sessionId ? (this.deps.colorFor?.(s.sessionId) ?? '') : '',
                messages: s.id === this.selected ? s.messages.slice(-400) : []
            })),
            agents: this.deps.getAgents().map(a => ({
                id: a.id, name: a.name, dir: a.dir,
                // X-133 — …and whether THIS one opens the composer with the
                // engineering discipline already on. It rides on the agent row
                // rather than as a map beside it because the page resolves the
                // switch against whichever agent the picker is showing, and a
                // second list keyed by name would have to be kept in step with
                // this one for no gain.
                superpowers: this.deps.superpowersDefault(a.name),
                // ‼️ S-34 — …and what THIS one was last started with, on the row
                // for the same reason the switch above is: the picker can change
                // the agent without the host hearing about it, and the boxes
                // have to follow the agent that is showing. `null` is "never
                // started", which falls through to the fleet defaults — a
                // different answer from a record that says nothing.
                lastLaunch: this.deps.lastLaunch(a.id) ?? null
            })),
            // The flat pair stays as the FALLBACK every surface had before
            // engines existed; `engineModels` below is what a picker actually
            // reads once it knows which engine is in play.
            models: modelChoices(this.deps.modelAliases()),
            efforts: EFFORT_CHOICES,
            engineModels: this.deps.engineModels?.() ?? null,
            /**
             * ‼️ X-105 — THE ROUTE THE NEXT SESSION WILL RUN ON, AS A CONTROL.
             *
             * X-103 made the route pickable in the launcher and X-105 (2/n) made
             * the started card SAY it. Between those two the composer carried
             * the pick blind: a route handed over by a launcher was applied and
             * had no box, so the person about to press Send could not see it,
             * change it, or clear it. This is that box's data.
             *
             * `applies: false` on four of five engines is the ordinary answer
             * and the page draws nothing at all for it — a disabled row asking a
             * question with no answers is the control with no referent
             * `docs/CONVENTIONS.md` forbids.
             */
            composerForm: this.deps.providerForm?.(
                engineOf(this.chosenEngine()).id, this.composerRoute ?? {}, 'acp') ?? null,
            /**
             * …and WHAT IS CURRENTLY PICKED, echoed separately rather than read
             * back out of the form. The form is a vocabulary; the pick is an
             * answer, and a page that had to infer one from the other could not
             * tell "nothing chosen" from "chosen, and the catalog has since
             * stopped offering it" — which is exactly the case a route deleted
             * in Settings produces.
             */
            composerPick: this.composerRoute ?? null,
            /**
             * ‼️ X-169 — THE SIGN-INS THIS ENGINE HAS, AND WHICH ONE IS PICKED.
             *
             * Two fields for the reason the route needs two: the list is a
             * vocabulary and the pick is an answer, and a page that inferred one
             * from the other could not tell "nobody chose" from "chosen, and the
             * slot has since been forgotten".
             *
             * An empty list is the ordinary answer on four of the five engines
             * and on a machine that has never captured an account — the page
             * draws nothing at all for it, because a control offering a choice
             * of one thing that is already true is the control with no referent
             * docs/CONVENTIONS.md forbids.
             */
            composerAccounts: this.deps.accountsFor?.(engineOf(this.chosenEngine()).id) ?? [],
            composerAccount: this.composerAccount ?? '',
            // Two lists, because they are two different questions. Starting a
            // session picks a FLAG (and "Default" — pass none — is a real
            // answer). Moving a running one sends `set_permission_mode`, which
            // has its own, shorter vocabulary and refuses the rest — measured,
            // see PERMISSION_MODES_LIVE. One list served both and offered three
            // rows that could not work.
            permissions: PERMISSION_CHOICES,
            livePermissions: PERMISSION_MODES_LIVE,
            grants: PERMISSION_GRANTS,
            // ‼️ THE ENGINE AXIS (X-18). Every row carries whether it can run
            // here and, when it cannot, the ONE thing to do about it — the
            // picker offers it disabled with that sentence attached rather than
            // hiding it, because an engine that is simply absent from the list
            // is indistinguishable from an engine this build does not have.
            engines: this.engineList().map(e => ({
                ...e,
                shape: ENGINES[e.id].shape,
                steerable: ENGINES[e.id].liveControls,
                reportsCost: ENGINES[e.id].reportsCost,
                // ‼️ U-59 — THE FLAG NAMES, DERIVED, so the composer's tooltips
                // stop printing Claude's over every engine. `engineFlagFor` runs
                // the engine's own argument builder and reads back what ended up
                // in front of the value; '' means this engine names no such
                // flag, and the webview then draws no parenthesis at all.
                modelFlag: engineFlagFor(e.id, 'model'),
                effortFlag: engineFlagFor(e.id, 'effort'),
                // ‼️ …AND WHETHER IT HAS AN EFFORT AT ALL, which is a fact about
                // the engine and not about whether its catalog has answered yet.
                // Reading it off an empty effort list works only once the
                // handshake has landed; before that the page fell back to the
                // flat list and drew Claude's five levels on an engine that has
                // none. This is the same answer the bridge refuses on.
                takesEffort: engineTakesEffort(e.id),
                // one line: what changes about talking to it
                note: engineNote(e.id)
            })),
            engine: this.chosenEngine(),
            // ‼️ K-35 — the fixed swatches come DOWN rather than being a list in
            // the page. The same ten are what `sessions.color` documents to an
            // agent, and a palette written out twice is a palette that drifts.
            sessionColors: SESSION_COLORS,
            defaults: {
                engine: d.engine ?? '', model: d.model ?? '',
                effort: d.effort ?? '', permissionMode: d.permissionMode ?? ''
            },
            // The page-wide drop zone, and a way to turn it off. It is on by
            // default; the switch exists because a drag-and-drop that misbehaves
            // on a particular machine must be something the user can END, not
            // something they have to live with until a fix ships. 📎 and paste
            // are unaffected — they are the routes that never listen for a drag.
            dropZone: afConfig().get<boolean>('consoleDropZone', true),
            // The ceiling has ONE definition (ATTACH_LIMITS) and the composer is
            // told it rather than repeating the number — a limit typed twice is
            // a limit that drifts, and the half that drifts is always the one
            // that stages twenty temp files before refusing the twenty-first.
            attachMax: ATTACH_LIMITS.count,
            // sessions a live process owns right now — the resume list marks
            // them instead of offering a second process on the same transcript
            owned: this.deps.liveOwners().map(o => o.sessionId),
            // where you were when the last window went away (see lastWindow) —
            // minus anything already running here again
            // K-35 — …coloured too. "Where you left off" is a card in the same
            // panel, so a session the user coloured is coloured there as well;
            // a colour that is on two of the three surfaces is a colour that
            // cannot be trusted anywhere.
            lastWindow: this.deps.lastWindow().map(r => ({
                ...r, color: r.sessionId ? (this.deps.colorFor?.(r.sessionId) ?? '') : ''
            }))
                .filter(r => !hosted.some(h => h.sessionId === r.sessionId
                    && h.status !== 'ended' && h.status !== 'error')),
            // The project a new session will be started under, and the exact
            // text it will be given. Open projects only: starting work under an
            // archived project is not a thing anybody means to do.
            projects: this.deps.projects()
                .filter(p => p.status !== 'done' && p.status !== 'archived')
                .map(p => ({ id: p.id, name: p.name, icon: p.icon ?? '', color: p.color ?? '' })),
            // ‼️ the COMPOSER's project, not the window's — see composerProject.
            // This one answers for the PICKER, which only exists before a
            // session is started.
            activeProjectId: this.composerProject,
            // ‼️ …and this one answers for the CHIP, which is a different
            // question: what is on screen right now running under. With a
            // session selected that is the session's own project; only in
            // composer mode is it the picker's answer.
            //
            // They used to be one field, and that is the whole of K-11's most
            // visible half: `start` hands the panel over to the new session and
            // clears the picker on purpose (the next session picks its own), so
            // the instant you pressed "Start session" the chip flipped to "No
            // project" — about a session that had just been started under one.
            // Nothing was lost; the strip was answering the wrong question.
            chipProjectId: chipProject,
            // see ConsoleDeps.projectContextText — the chip shows this verbatim,
            // so it is read for the project the chip is about
            projectContext: this.deps.projectContextText(chipProject),
            /**
             * ‼️ X-133 — THE SUPERPOWERS SWITCH, and it answers the SAME two
             * questions the project chip does with the same split.
             *
             * With a session selected the answer is that session's own — it was
             * written into its system prompt at spawn and cannot be changed
             * under it, so the switch is a READING there, not a control. In
             * composer mode it is a choice about the session being started, and
             * `''` means "nobody has touched it": the page resolves that against
             * the agent it is showing (see agents[].superpowers).
             */
            superpowersOn: this.selected
                ? !!hosted.find(s => s.id === this.selected)?.superpowers
                : undefined,
            superpowersChoice: this.composerSuperpowers === undefined
                ? '' : (this.composerSuperpowers ? 'on' : 'off'),
            // ‼️ K-34 — null, not an empty object: "no setup was handed over" is
            // a different answer from "a setup that says nothing", and only the
            // first may fall through to the user's launch defaults.
            composerLaunch: this.composerLaunch ?? null,
            // the exact text, for the hover — never a description of it
            superpowersText: this.deps.superpowersText(),
            superpowersHealth: this.deps.superpowersHealth(),
            // the agent this composer is fixed to, when it was opened from one
            pinnedAgent: this.pinnedAgent ?? '',
            // the shelf + the transcripts the query asks for (see resumeList)
            ...this.resumeList()
        };
    }

    /**
     * The resume list: what it shows, how much of it there is, and who is in it.
     *
     * Closed, this costs nothing — and closed is the normal state, so the
     * snapshot a streaming turn rebuilds ten times a second stays small. Open,
     * it is one pass over the index with the page's own query applied
     * (`core/consoleresume.ts`), which is the same work the unfiltered version
     * always did.
     */
    private resumeList(): Record<string, unknown> {
        if (!this.resumeOpen) {
            return {
                resumable: [], resumeTotal: 0, resumeAgents: [], resumeMax: RESUME_MAX,
                resumeDefaultN: RESUME_DEFAULT_N, resumeFiltered: isResumeFiltered(this.resumeQuery)
            };
        }
        // ‼️ K-17 — BOTH HALVES OF THE INDEX. `all()` is deliberately the
        // Claude-only one (external sessions are kept out of it so Claude's
        // analytics can never see them — core/sessionSource.ts), so a list
        // headed "Resume an existing session" that read only there was not a
        // filtered list: every conversation the user had had with Codex,
        // Gemini or Antigravity was unreachable from the one panel whose job
        // is to continue a conversation, and nothing on the panel said so.
        // This is a LOG surface, which is exactly what `allWithExternal` is
        // for (see SessionIndex). A row with no `cwd` still drops out — a
        // session whose folder we never learned cannot be started anywhere.
        const pool = this.deps.index.allWithExternal()
            .filter(s => !s.isSidechain && !s.machine && s.cwd)
            .map(s => ({
                s, title: s.title, agentName: s.agentName ?? '', tags: s.tags ?? [],
                pinned: !!s.pinned, sessionId: s.sessionId,
                ts: s.lastTs || s.mtime, origin: sessionOrigin(s), source: s.source
            }));
        // Every agent that has a session to resume — including agents no longer
        // in the fleet, which is exactly when you go looking for an old session.
        const agents = [...new Set(pool.map(r => r.agentName).filter(Boolean))].sort();
        const hit = filterResumable(pool, this.resumeQuery, Date.now());
        return {
            resumable: hit.rows.map(r => this.resumeRow(r.s)),
            resumeTotal: hit.total,
            resumeAgents: agents,
            resumeMax: RESUME_MAX,
            resumeDefaultN: RESUME_DEFAULT_N,
            resumeFiltered: isResumeFiltered(this.resumeQuery)
        };
    }

    /**
     * What ONE engine is currently offering — the same object the page reads,
     * so the host and the picker cannot narrow a pair differently (X-30).
     * `undefined` when the dep is absent or the id is not one of ours: nothing
     * is known, so `narrowLaunch` narrows nothing.
     */
    /**
     * ‼️ X-105 — THE PICK, NARROWED BY THE ENGINE THAT WILL RUN IT.
     *
     * One place, because two callers need it and they must not be able to
     * disagree: choosing a route, and moving the engine underneath one already
     * chosen. Both are "what of this pick survives", and the answer is the
     * adapter's — `prunePick` says out loud what it dropped, so a tier that
     * stops existing is not something the user discovers at Send.
     *
     * A dep-less build (the tests' minimal panel) keeps the pick as given: this
     * is a narrowing, and a narrowing nobody can perform is not a reason to
     * throw the answer away.
     */
    private prunedRoute(
        pick: { providerId?: string; tier?: string } | undefined
    ): { providerId?: string; tier?: string } | undefined {
        if (!pick?.providerId) { return undefined; }
        const engine = engineOf(this.chosenEngine()).id;
        const out = this.deps.prunePick?.(engine, pick, 'acp') ?? pick;
        const providerId = (out.providerId ?? '').trim();
        if (!providerId) { return undefined; }
        const tier = (out.tier ?? '').trim();
        return { providerId, ...(tier ? { tier } : {}) };
    }

    /**
     * ‼️ X-169 — AN ACCOUNT BELONGS TO ONE ENGINE, exactly as a route does.
     * A Claude slot carried onto Codex names a directory Codex never reads, so
     * the session would start on the main account while the strip claimed
     * otherwise — the quiet failure this whole family exists to end. The list is
     * the engine's own (`accountsFor`), so the pruning is a lookup rather than a
     * rule written here.
     */
    private prunedAccount(id: string | undefined): string | undefined {
        const want = (id ?? '').trim();
        if (!want) { return undefined; }
        const engine = engineOf(this.chosenEngine()).id;
        const mine = this.deps.accountsFor?.(engine) ?? [];
        return mine.some(a => a.id === want) ? want : undefined;
    }

    private engineModelsFor(engine: string | undefined): EngineModels | undefined {
        const map = this.deps.engineModels?.();
        if (!map) { return undefined; }
        return map[(engine || 'claude') as EngineId];
    }

    private resumeRow(s: SessionInfo): Record<string, unknown> {
        return {
            sessionId: s.sessionId, title: s.title, agentName: s.agentName ?? '',
            // ‼️ K-17 — every row wears its engine, Claude included. An unbadged
            // row means "Claude" or it means "this surface never learned about
            // engines", and those look identical (docs/CONVENTIONS.md → the
            // badge). `source` is empty for everything in `index.all()`, which
            // IS Claude by definition, so the page reads the absence as claude.
            engine: s.source || 'claude',
            cwd: s.cwd ?? '', pinned: !!s.pinned, ts: s.lastTs || s.mtime, cost: s.cost,
            // K-35 — the index projects the mark onto every SessionInfo, so a
            // resumable row is coloured by the same fact the live card is.
            color: s.color ?? '',
            // what the session spent — the figure the card leads with, because
            // "$0.03" alone does not say whether that was haiku or opus
            tokens: totalTokens(s.usage),
            wTokens: Math.round(s.wTokens),
            // "Ctx now" — the same figure the sessions tables show, so a row
            // says what resuming it would cost you in window before you do
            contextTokens: s.lastCtxTokens ?? 0,
            // …against the capacity that session itself reported (X-43). Codex
            // states an operational window on every turn boundary and it is not
            // the model catalogue's published ceiling; a row that showed only
            // the numerator left the reader to guess which of the two it was a
            // fifth or a whole of.
            contextWindowTokens: s.ctxWindow ?? 0,
            // …and where that reading came from: the index read it off the
            // conversation's own last call, which is the only thing it may mean.
            contextSource: s.lastCtxTokens ? 'transcript-last-call' : '',
            // ‼️ U-50 — WHAT THIS CONVERSATION WAS, so choosing one does not mean
            // opening it first. `firstPrompt` rides on the session for exactly
            // this reason (see SessionInfo) and the Sessions tables already show
            // it on hover; this list — the one where a hundred titles are read
            // against each other — was the surface that never got it. Everything
            // here is already in the index: no row costs a second query.
            firstPrompt: s.firstPrompt ?? '',
            startedAt: s.firstTs,
            turns: s.userTurns, tools: s.toolCalls, errors: s.errors,
            models: s.models ?? [], tags: s.tags ?? []
        };
    }

    refresh(): void {
        // ‼️ S-50 — a page that has not been loaded cannot read a push, and the
        // push would still SPEND the one-shot `presetAgent` on the way out. The
        // window this closes is short (construction to `mount()`), but it is the
        // window a host event landing in it would empty the door's message in.
        if (!this.mounted) { return; }
        const data = this.data();
        // The tab says how many conversations are waiting for you, so the nudge
        // reaches you with the Console in the background — the one place a
        // count is useful and can never be in the way.
        const waiting = (data.sessions as { status: string; turns: number; queued: string[] }[])
            .filter(s => s.status === 'idle' && s.turns > 0 && !s.queued.length).length;
        const title = waiting ? `Console (${waiting})` : 'Console';
        if (this.panel.title !== title) { this.panel.title = title; }
        void this.panel.webview.postMessage({ type: 'data', data });
    }

    /**
     * Hand the composer real paths.
     *
     * This is the ONLY way a file gets into the chip list, whichever gesture
     * started it — so the composer never has to know about temp files, URIs or
     * the difference between the three drops.
     */
    private postAttached(paths: string[]): void {
        const files = paths.map(describeAttachment).filter(Boolean);
        if (files.length) { void this.panel.webview.postMessage({ type: 'attached', files }); return; }
        // ‼️ A GESTURE THAT PRODUCES NOTHING MUST SAY SO. Every path here failed
        // `statSync` — dropped from an archive, from a remote/virtual folder, or
        // a name the drag carried without a file behind it. Returning quietly
        // leaves the user looking at an unchanged panel with no way to tell
        // "nothing was attached" from "attached, and the panel never shows it".
        if (paths.length) {
            void vscode.window.showWarningMessage(
                'Agent Farm: nothing could be attached from that — the files were not readable at those paths. '
                + 'Use 📎 to pick them instead.');
        }
    }

    /**
     * Bytes with no path of their own — an OS drag or a pasted screenshot —
     * get one under the system temp dir.
     *
     * Old spills are swept on the way in (7 days): the folder is a staging
     * area, not an archive, and nothing else would ever delete from it.
     */
    private async spillToTemp(name: string, base64: string, mediaType = ''): Promise<string | undefined> {
        try {
            const dir = path.join(os.tmpdir(), 'agentfarm-attachments');
            await fs.promises.mkdir(dir, { recursive: true });
            sweepSpills(dir);
            // ‼️ KEEP THE NAME THE USER KNOWS — `\w` is ASCII, so the old rule
            // rewrote "deneme dosyası.txt" as "deneme dosyas_.txt": every
            // Turkish letter replaced by an underscore in the one string the
            // user has to recognise the file by. Only what a Windows filename
            // genuinely cannot hold is replaced. The clipboard's own media type
            // comes along because a pasted screenshot frequently has no name,
            // and a suffix is what decides whether the model SEES it.
            const safe = safeAttachmentName(path.basename(name), mediaType);
            const target = path.join(dir, `${Date.now().toString(36)}-${safe}`);
            await fs.promises.writeFile(target, Buffer.from(base64, 'base64'));
            return target;
        } catch {
            void vscode.window.showWarningMessage('Agent Farm: that dropped file could not be staged for sending.');
            return undefined;
        }
    }

    private agentById(id: string): AgentInfo | undefined {
        return this.deps.getAgents().find(a => a.id === id);
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
        const host = this.deps.host;
        const str = (k: string) => (typeof msg[k] === 'string' ? msg[k] as string : '');
        const idx = (k: string) => (typeof msg[k] === 'number' ? Math.floor(msg[k] as number) : -1);
        // The saved-prompt picker answers for itself, on every page that has one
        // (see promptSnippetMessage in ./base).
        if (await promptSnippetMessage(this.panel.webview, () => this.deps.promptSnippets(), msg.type)) {
            return;
        }
        // The wiki tagger does the same on every surface that draws a badge (K-26).
        if (wikiMarkMessage(this.panel.webview, msg)) { return; }
        switch (msg.type) {
            case 'refresh': this.refresh(); break;
            /**
             * ‼️ K-30 — WHAT THIS BOX COULD TYPE AFTER A "/", ANSWERED ON
             * DEMAND. The same merge the bridge's `toolbox.slashCommands`
             * performs, through the same two functions — never a second
             * catalog, because a picker that offered a different list from the
             * one an agent is told about is a picker that teaches the wrong
             * commands.
             *
             * ‼️ NEVER ON THE PAYLOAD, for the reason the saved prompts are not
             * either: this page rebuilds its data on every event of every hosted
             * session, several times a second while a turn runs, and
             * `scanSlashSources` walks three folders. It is read when the picker
             * opens — which also means a command file written thirty seconds ago
             * is there without reloading anything.
             *
             * The context comes back with the answer so the page can drop a
             * late one: the agent picker moves while the disk is being read.
             */
            case 'slashCommands': {
                const engine = (str('engine') || this.chosenEngine()).trim().toLowerCase();
                const agentRef = str('agent');
                const agent = agentRef
                    ? this.deps.getAgents().find(a => a.name === agentRef || a.id === agentRef)
                    : undefined;
                const sessionRef = str('session');
                const live = sessionRef
                    ? host.list().find(x => x.id === sessionRef || x.sessionId === sessionRef)
                    : undefined;
                const disk = scanSlashSources(agent?.dir, os.homedir());
                /**
                 * ‼️ K-36 — THE ANSWER IS THE INSTALL'S, NOT THE BUILD'S, EVEN
                 * WITH NOTHING RUNNING.
                 *
                 * The composer's `/` is pressed BEFORE a session exists, so the
                 * one authoritative source was never there when it was needed
                 * and the picker fell back to 18 shipped rows — against 49 in
                 * the same machine's terminal. Two thirds of that list is
                 * skills and plugins, so no shipped table could ever close it.
                 *
                 * Three tries, in the order of how much each one knows:
                 *  1. the session this card IS, if it reported;
                 *  2. any other live session on the same engine — the same CLI
                 *     on the same machine gives the same answer, and this is
                 *     what makes the composer right while a session runs beside
                 *     it;
                 *  3. what was remembered from the last one that did.
                 * A report seen here is LEARNED, so the next composer — and any
                 * agent asking through the bridge — opens on a measured fact.
                 */
                const owner = live?.slashCommands?.length
                    ? live
                    : host.list()
                        .filter(s => (s.engine || 'claude') === engine && s.slashCommands?.length)
                        .sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0))[0];
                let report = owner ? this.deps.slashReport?.(owner) : undefined;
                if (report) { this.deps.learnSlash?.(engine, owner?.agentId, report); }
                else { report = this.deps.recallSlash?.(engine, agent?.id); }
                void this.panel.webview.postMessage({
                    type: 'slashCommands',
                    engine, agent: agentRef, session: sessionRef,
                    sources: {
                        reported: report?.names.length ?? 0,
                        // ‼️ WHERE THE REPORT CAME FROM, because "49 commands on
                        // a composer that has started nothing" is a surprising
                        // list and a reader has to be able to explain it.
                        reportedFrom: owner ? (owner === live ? 'session' : 'live') : (report ? 'remembered' : 'none'),
                        commands: disk.commands.length,
                        skills: disk.skills.length,
                        workflows: disk.workflows.length
                    },
                    commands: getSlashCommands({
                        engine,
                        sources: { ...disk, ...reportToSources(report) }
                    })
                });
                break;
            }
            case 'select':
                this.selected = str('id');
                this.refresh();
                break;
            // The picker above the composer answers for the SESSION IT IS ABOUT
            // TO START — it no longer moves the window's active project. See
            // composerProject for why the two were separated.
            case 'setProject':
                this.composerProject = str('id');
                this.refresh();
                break;
            // ‼️ X-133 — the engineering discipline the NEXT session opens with.
            // `null` is the way back to the agent's own default, so a switch
            // touched by accident is not a decision the user is stuck with for
            // the rest of the composer's life (see composerSuperpowers).
            case 'setSuperpowers':
                this.composerSuperpowers = msg.on === null || msg.on === undefined
                    ? undefined : msg.on === true;
                this.refresh();
                break;
            // Which engine the next session opens on. It is only ever a choice
            // about the session being started — a running one cannot change
            // engine, and the composer does not draw the box for it.
            case 'setEngine':
                this.composerEngine = str('id');
                // ‼️ X-105 — A ROUTE BELONGS TO ONE ENGINE, exactly as a model
                // does. A Claude route carried onto Codex is an endpoint its CLI
                // was never going to be pointed at, and the pick is dropped by
                // the new engine's own adapter rather than by a rule written
                // here — an engine with no provider axis prunes everything away
                // and says so, which is the honest answer for four of the five.
                this.composerRoute = this.prunedRoute(this.composerRoute);
                // ‼️ X-169 — and the sign-in with it, for the same reason and by
                // the same rule: an account belongs to one engine.
                this.composerAccount = this.prunedAccount(this.composerAccount);
                this.refresh();
                break;
            /**
             * ‼️ X-105 — WHICH ROUTE THE NEXT SESSION RUNS ON.
             *
             * It goes back to the host rather than into the page's own state for
             * the same two reasons the engine does: the narrowing lives here
             * (the adapter is the only thing that knows a tier stopped existing
             * when the route moved), and the answer has to survive a repaint
             * that rebuilds the whole row. `''` is a real answer and the
             * important one — "no route" means the child inherits this window's
             * environment, which is what every launch made before X-101 did.
             */
            /**
             * ‼️ X-169 — WHICH SIGN-IN THE NEXT SESSION RUNS ON.
             *
             * It goes back to the host rather than into the page's own state for
             * the two reasons the route does: the narrowing lives here (only this
             * side knows the slot list), and the answer has to survive a repaint
             * that rebuilds the whole strip. `''` is a real answer and the
             * important one — it means the main sign-in, which is what every
             * session started before this ran as.
             */
            case 'setAccount':
                this.composerAccount = this.prunedAccount(str('id'));
                this.refresh();
                break;
            case 'setRoute': {
                const providerId = str('providerId');
                const tier = str('tier');
                this.composerRoute = this.prunedRoute(
                    providerId ? { providerId, ...(tier ? { tier } : {}) } : undefined);
                this.refresh();
                break;
            }
            // "this composer is no longer about that agent" — the way out of a
            // pin, so a fixed agent is never a trap (see pinnedAgent).
            case 'unpinAgent':
                this.pinnedAgent = undefined;
                this.refresh();
                break;
            case 'start': {
                const agent = this.agentById(str('agentId'));
                if (!agent) {
                    void vscode.window.showWarningMessage('Agent Farm: pick an agent first.');
                    return;
                }
                const d = this.deps.launchDefaults();
                // ‼️ THE ENGINE IS CHECKED HERE, NOT TRUSTED FROM THE PAGE. The
                // picker already disables what cannot run, but the page is a
                // webview: the refusal has to live on this side of the wall, and
                // it is the same sentence every other entry point uses
                // (engineRefusal). Starting on an absent CLI produces a session
                // that dies on its first turn with a shell error.
                const engine = (str('engine') || this.chosenEngine()).trim().toLowerCase();
                const refused = engineRefusal(this.engineList(), engine);
                if (refused) {
                    void vscode.window.showWarningMessage(`Agent Farm: ${refused}`);
                    return;
                }
                /**
                 * ‼️ S-34 — WHAT ACTUALLY RUNS, IN ONE OBJECT, so the record
                 * written below cannot drift from the launch above it.
                 *
                 * The memory is NOT applied here even though it is applied at
                 * every other door: these boxes are on screen and they were
                 * SEEDED from it, so an empty one is a person saying "the
                 * default, please" — and re-filling it from the record would be
                 * the panel arguing with a control the user just cleared.
                 * Seeding is the mechanism; a second layer at the last moment
                 * would make the visible setup a lie.
                 */
                const started: LaunchOptions = {
                    engine: engine as EngineId,
                    model: str('model') || d.model,
                    effort: str('effort') || d.effort,
                    permissionMode: str('permissionMode') || d.permissionMode,
                    superpowers: msg.superpowers === true,
                    // ‼️ X-103 — from the composer's carried value, NOT from the
                    // page: there is no route control on it yet (X-105), so a
                    // `str('providerId')` here would read an empty box and erase
                    // the very pick the launcher handed over.
                    ...(this.composerRoute ?? {}),
                    // ‼️ X-169 — from the composer's carried value for the same
                    // reason, and absent when nobody picked one: absent is what
                    // lets the engine's active account answer at the spawn.
                    ...(this.composerAccount ? { account: this.composerAccount } : {})
                };
                this.selected = host.start({
                    agentId: agent.id, agentName: agent.name, cwd: agent.dir,
                    engine: engine as EngineId,
                    model: started.model,
                    effort: started.effort,
                    permissionMode: started.permissionMode,
                    // ‼️ X-103 — the card is started ON the route, and keeps it:
                    // ConsoleSessionState holds it so a window reload cannot move
                    // a live conversation to a different endpoint.
                    providerId: started.providerId, tier: started.tier,
                    // ‼️ X-169 — and ON the account, kept on the card's state so
                    // a re-spawn cannot follow the "use this next" button into
                    // somebody else's plan mid-conversation.
                    account: started.account,
                    // ‼️ ALWAYS EXPLICIT, including the empty string. Leaving it
                    // out means "inherit the window's active project" one layer
                    // down (ConsoleHost.start), which is the inheritance the box
                    // above exists to replace.
                    projectId: this.composerProject,
                    // ‼️ X-133 — RESOLVED BY THE PAGE, because the page is where
                    // the agent picker lives: the switch's untouched state means
                    // "whatever this agent's default is", and the panel does not
                    // know which agent is showing until this message arrives.
                    // The choice itself is still kept here (composerSuperpowers)
                    // so a repaint cannot lose it.
                    superpowers: msg.superpowers === true,
                    firstPrompt: str('text') || undefined,
                    firstAttachments: attachmentsOf(msg)
                });
                // ‼️ S-34 — and THIS is a launch, so it is remembered like one.
                // The composer used to be the door that read the record and
                // never wrote to it, which made the launcher reopen on a setup
                // the agent had not run in a week.
                this.deps.rememberLaunch(agent.id, started, 'console');
                // the next new session starts its own two answers from scratch
                this.composerProject = '';
                // …and its own agent's answer for the discipline, rather than
                // the last session's — see composerSuperpowers.
                this.composerSuperpowers = undefined;
                // …and its own route: a card started from the launcher must not
                // hand its endpoint to the next session nobody launched from it.
                this.composerRoute = undefined;
                // …and its own account, for the same reason: a card started on
                // the second plan must not hand it to the next session nobody
                // launched from it.
                this.composerAccount = undefined;
                // ‼️ K-34 — one-shot. A setup left standing would reapply itself
                // to the NEXT session, which nobody launched from it.
                this.composerLaunch = undefined;
                // ‼️ …but NOT the engine. A project is about one piece of work
                // and the next session is usually different work; an engine is
                // about which machine you are working on today, and re-picking
                // it after every start is the kind of friction that makes a
                // second engine unused. It stays until it is changed, or until
                // the window goes away and the default takes over again.
                this.pinnedAgent = undefined;
                this.refresh();
                break;
            }
            case 'resume': {
                const sessionId = str('sessionId');
                // K-17: the same two halves the list was built from, or a row
                // the panel offered could not be looked up when it was clicked.
                const row = this.deps.index.allWithExternal().find(s => s.sessionId === sessionId);
                if (!row?.cwd) { return; }
                // …and the engine it was HAD with, which is the engine it comes
                // back on. Left out, `ConsoleHost.start` defaults to claude and
                // a Codex conversation would be handed to a CLI that has never
                // heard of its thread.
                const engine = (row.source || 'claude') as EngineId;
                // ‼️ First: is the thing holding it OUR OWN leftover?
                //
                // An extension reload leaves the hosted `claude` running with
                // nobody on the other end of the pipe. Everything downstream
                // then behaves correctly and traps you: the timeline draws it
                // as running (it is), the resume is refused (it must be), and
                // the shelf keeps offering "continue" on a conversation that
                // can never be continued. The way out is to end that leftover
                // — asked for explicitly, because it stops a real process.
                const leftover = this.deps.leftoverOwner(sessionId);
                if (leftover) {
                    const go = await vscode.window.showWarningMessage(
                        `"${row.title}" is still running from an earlier window of Agent Farm (pid ${leftover.pid}) — nothing is reading it.`,
                        {
                            modal: true,
                            detail: 'Claude Code cannot join a running session, so this conversation cannot be picked up while that process holds it.\n\n'
                                + 'Agent Farm can end the leftover and continue here: the transcript stays on disk and everything that was said comes back with it. Only whatever it was doing this second is lost.'
                        },
                        'End it and continue here');
                    if (go !== 'End it and continue here') { return; }
                    if (!await this.deps.endLeftover(sessionId, leftover.pid)) {
                        void vscode.window.showWarningMessage(
                            `Agent Farm: pid ${leftover.pid} is still holding that session — nothing was resumed. Stop it by hand and try again.`);
                        return;
                    }
                }
                // The guard that makes "same session" true instead of a story:
                // if a process already owns this session id, resuming would
                // start a second one on the same transcript.
                const owner = this.deps.liveOwners().find(o => o.sessionId === sessionId);
                if (owner) {
                    const where = owner.entrypoint === 'sdk-cli'
                        ? 'a program (a Console session or a headless run)'
                        : 'a terminal';
                    const choice = await vscode.window.showWarningMessage(
                        `That session is open right now in ${where} (pid ${owner.pid}).\n\n` +
                        'Claude Code cannot join a running session: resuming it here would start a SECOND process on the same transcript. ' +
                        'Both would write to it and neither would see the other\'s turns — it would look like one conversation that nobody actually had.',
                        { modal: true },
                        'Jump to that terminal', 'New session in the same folder');
                    if (choice === 'Jump to that terminal') {
                        void vscode.commands.executeCommand('agentfarm.focusSessionTerminal',
                            { sessionId, agentName: row.agentName, cwd: row.cwd });
                        return;
                    }
                    if (choice !== 'New session in the same folder') { return; }
                    const agentForNew = this.deps.getAgents().find(a => a.name === row.agentName);
                    const dn = this.deps.launchDefaults();
                    const fresh = narrowLaunch(this.engineModelsFor(engine),
                        str('model') || dn.model, str('effort') || dn.effort);
                    this.selected = host.start({
                        agentId: agentForNew?.id ?? '', agentName: row.agentName ?? 'session',
                        cwd: row.cwd, engine,
                        model: fresh.model,
                        effort: fresh.effort,
                        permissionMode: str('permissionMode') || dn.permissionMode,
                        // A fresh session, but reached by trying to continue that
                        // one: it is the same work, so it starts under the same
                        // project rather than under whatever the window says.
                        projectId: this.deps.sessionProject({
                            sessionId, agentId: agentForNew?.id,
                            agentName: row.agentName, cwd: row.cwd
                        })
                    });
                    this.refresh();
                    return;
                }
                const agent = this.deps.getAgents().find(a => a.name === row.agentName);
                const d = this.deps.launchDefaults();
                // ‼️ X-30 / K-17 — the composer's boxes and the fleet defaults
                // are BOTH written without knowing which engine this row was
                // recorded with, so they are narrowed to what that engine (and
                // that model) actually offers before they become flags.
                // !! S-45 - THE SESSION'S OWN LAST SETTING COMES FIRST, and it has
                // to be first for the feature to exist at all: the composer's
                // boxes are seeded FROM `launchDefaults()`, so `str('model')`
                // is normally holding the fleet default rather than nothing,
                // and a transcript value placed after it could never win. The
                // order is therefore transcript -> box -> fleet default.
                //
                // The MODE is inherited on the same rule and is not trusted for
                // it: ConsoleHost resolves what actually reaches the command
                // line against the folder's own layers (K-22), so a bypass
                // carried back from a transcript can never grant more than
                // starting a fresh session in that folder would.
                const inherit = lastRunDimensions(row);
                const back = narrowLaunch(this.engineModelsFor(engine),
                    inherit.model || str('model') || d.model,
                    inherit.effort || str('effort') || d.effort);
                this.selected = host.start({
                    agentId: agent?.id ?? '', agentName: row.agentName ?? 'session',
                    cwd: row.cwd, resume: sessionId, engine,
                    model: back.model,
                    effort: back.effort,
                    // S-45 — the mode the transcript last stated (see above).
                    permissionMode: inherit.permissionMode || str('permissionMode') || d.permissionMode,
                    // ‼️ …and the project it comes back UNDER is its OWN. Left
                    // out, ConsoleHost.start falls back to the window's active
                    // project — which is not this session's answer and is
                    // normally none at all, so a resumed conversation lost the
                    // project it had been running under (K-11). Every other
                    // resume route already passes this; this one did not.
                    projectId: this.deps.sessionProject({
                        sessionId, agentId: agent?.id, agentName: row.agentName, cwd: row.cwd
                    }),
                    // ‼️ X-133 — …AND THE DISCIPLINE COMES BACK TOO, on the same
                    // flag and for the same measured reason: the appended system
                    // prompt does not survive `--resume`, so a conversation that
                    // was working to TDD and root-cause debugging would quietly
                    // stop the moment it was picked up again.
                    //
                    // A card the panel STILL HOLDS answers for itself — its seat
                    // remembers what it was started with, including a switch the
                    // user turned off by hand — so nothing is passed for it. A
                    // transcript coming back off the shelf has no such memory
                    // (the flag is not in the transcript), and the honest
                    // fallback is the agent's own default.
                    ...(host.list().some(x => x.sessionId === sessionId)
                        ? {}
                        : { superpowers: this.deps.superpowersDefault(row.agentName ?? '') }),
                    // resume means CONTINUE: what was said comes back with it
                    history: this.deps.history(sessionId),
                    // …and so does what it cost, or the composer's line would
                    // describe this window's process instead of the session
                    carried: carriedTotals(row)
                });
                // it is running again — it is no longer somewhere you "were"
                this.deps.forgetLastWindow(sessionId);
                this.refresh();
                break;
            }
            case 'forgetLastWindow':
                this.deps.forgetLastWindow(str('sessionId'));
                this.refresh();
                break;
            /**
             * ‼️ K-35 — THE COLOUR IS VALIDATED BY THE STORE, NOT BY THE PAGE.
             *
             * What arrives here is a string a webview chose, and it ends up in a
             * `style` attribute. `setColor` normalises it to `#rrggbb` or to
             * nothing at all, so a page (or a bridge caller, or a hand-edited
             * globalState) cannot put anything else in front of the reader.
             * Clearing is the same door with an empty string — the card's own
             * "no colour" swatch sends exactly that.
             */
            case 'setSessionColor': {
                const id = str('sessionId');
                if (!id) { break; }
                void Promise.resolve(this.deps.setColor?.(id, str('color'))).then(() => this.refresh());
                break;
            }
            // The page owns the controls, the host owns the answer: it can see
            // every session, the page only what it was sent.
            case 'resumeQuery': {
                const q = (msg.query ?? {}) as ResumeQuery;
                this.resumeOpen = msg.open === true;
                this.resumeQuery = {
                    text: typeof q.text === 'string' ? q.text : '',
                    agent: typeof q.agent === 'string' ? q.agent : '',
                    when: typeof q.when === 'string' ? q.when : '',
                    from: typeof q.from === 'string' ? q.from : '',
                    to: typeof q.to === 'string' ? q.to : '',
                    pinnedOnly: q.pinnedOnly === true,
                    userOnly: q.userOnly === true,
                    limit: typeof q.limit === 'number' ? q.limit : undefined
                };
                this.refresh();
                break;
            }
            case 'send': {
                // `hold` is the composer's Hold button: park it instead of
                // saying it into the running turn (see acceptUserText).
                const r = host.send(str('id'), str('text'), msg.hold === true, attachmentsOf(msg));
                if (!r) {
                    void vscode.window.showWarningMessage(
                        'Agent Farm: that session has ended — start a new one to keep talking.');
                } else if (r.refused) {
                    // The composer cleared itself the moment you pressed Send.
                    // A refusal therefore has to GIVE THE MESSAGE BACK — text
                    // and files — or the refusal costs you what you wrote.
                    void vscode.window.showWarningMessage(`Agent Farm: ${r.refused}`);
                    void this.panel.webview.postMessage({
                        type: 'restore',
                        text: str('text'),
                        files: attachmentsOf(msg)
                    });
                }
                break;
            }
            case 'attachTooMany':
                void vscode.window.showWarningMessage(
                    `Agent Farm: ${ATTACH_LIMITS.count} files is the limit for one message — send the rest in another.`);
                break;
            // ---- attachments -------------------------------------------------
            // Three ways in, one way out: whatever the user did, the panel
            // answers with real paths, and the composer only ever holds paths.
            case 'attachPick': {
                void (async () => {
                    // ‼️ `canSelectFiles` AND `canSelectFolders` TOGETHER IS NOT
                    // "BOTH" ON WINDOWS — the native dialog has no such mode, so
                    // Electron falls back to the FOLDER picker: every file
                    // vanishes from the list and there is nothing left to select.
                    // The button that exists to attach a file showed no files.
                    // Files it is, with the filter row a file dialog is expected
                    // to have; a FOLDER is attached by dropping it on the page
                    // (the drop path takes folders exactly as it always did).
                    const picked = await vscode.window.showOpenDialog({
                        canSelectMany: true, canSelectFiles: true, canSelectFolders: false,
                        openLabel: 'Attach',
                        title: 'Attach files to the message',
                        // "All files" is first because it is the honest default:
                        // this feature takes anything, and a picker that opens
                        // narrowed teaches you it does not.
                        filters: {
                            'All files': ['*'],
                            'Images (sent inside the message)': ['png', 'jpg', 'jpeg', 'gif', 'webp'],
                            'Text and code': ['txt', 'md', 'json', 'yaml', 'yml', 'csv', 'log',
                                'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cs', 'go', 'rs', 'sql',
                                'html', 'css', 'sh', 'ps1', 'ini', 'xml'],
                            'Documents': ['pdf', 'docx', 'xlsx', 'pptx', 'odt', 'ods']
                        }
                    });
                    if (picked?.length) { this.postAttached(picked.map(u => u.fsPath)); }
                })();
                break;
            }
            case 'attachUris': {
                // Dragged out of the VS Code Explorer — that drag carries real
                // URIs. It can also carry the path as PLAIN TEXT and nothing
                // else, and `Uri.parse` does not refuse those: it reads
                // `D:\a\b.png` as a URI with a made-up scheme and hands back a
                // path that never existed. So the shape decides the reader.
                const uris = Array.isArray(msg.uris) ? msg.uris as string[] : [];
                const paths: string[] = [];
                for (const u of uris) {
                    try {
                        paths.push(looksLikeUri(u) ? vscode.Uri.parse(u).fsPath : vscode.Uri.file(u).fsPath);
                    } catch { /* not a path we can use */ }
                }
                if (paths.length) { this.postAttached(paths); }
                break;
            }
            case 'attachNothing':
                // The drop landed, and carried nothing this panel can open.
                void vscode.window.showWarningMessage(
                    'Agent Farm: that drop carried no file — drag from the Explorer or a file manager, '
                    + 'or use 📎 to pick one.');
                break;
            case 'attachDrop': {
                // Dropped from the OS file manager, or pasted from the clipboard:
                // the webview sees the BYTES but never the path (browser
                // security), so the bytes land in a temp file and THAT is the
                // path everything downstream already knows how to handle.
                void (async () => {
                    const files = Array.isArray(msg.files)
                        ? msg.files as { name?: unknown; data?: unknown; type?: unknown }[]
                        : [];
                    const written: string[] = [];
                    for (const f of files) {
                        const name = typeof f.name === 'string' && f.name ? f.name : 'attachment';
                        const data = typeof f.data === 'string' ? f.data : '';
                        if (!data) { continue; }
                        const p = await this.spillToTemp(name, data, typeof f.type === 'string' ? f.type : '');
                        if (p) { written.push(p); }
                    }
                    if (written.length) { this.postAttached(written); return; }
                    // ‼️ AND IF NOTHING SURVIVED, SAY SO. Every gesture answers;
                    // this was the one path that could still end in an unchanged
                    // panel and no word about why (`spillToTemp` warns when a
                    // write throws, but a payload that arrived empty warned
                    // about nothing at all).
                    if (files.length) {
                        void vscode.window.showWarningMessage(
                            'Agent Farm: nothing could be attached from that — the dropped data was empty. '
                            + 'Use 📎 to pick the file instead.');
                    }
                })();
                break;
            }
            // A held message can still be changed, dropped or said now — the
            // page already has its text, so pulling it back into the composer
            // is a take here and a paste there.
            case 'queueTake':
                host.takeQueued(str('id'), idx('index'));
                break;
            case 'queueSend':
                host.releaseQueued(str('id'), idx('index'));
                break;
            case 'interrupt':
                host.interrupt(str('id'));
                break;
            case 'setModel': {
                // mid-session model switch — the CLI's own `/model`
                const sid = str('id');
                if (!host.setModel(sid, str('model'))) {
                    void vscode.window.showWarningMessage(
                        'Agent Farm: that session cannot take a model change right now.');
                    break;
                }
                // ‼️ X-30 — AND THE EFFORT FOLLOWS IT. The two boxes are filled
                // at different moments, so the effort chosen for the model you
                // had a second ago is still the session's effort — and on an
                // engine that states its levels per model that pair is not
                // "roughly right", it is a refusal before the turn starts
                // (`gemini-3.1-pro has no "medium" effort`). The page narrows
                // its own boxes the same way (media/console.js
                // reconcileComposer); this is the half that a LIVE session,
                // where the model is switched mid-conversation, never had.
                const cur = host.get(sid);
                const want = narrowLaunch(
                    this.engineModelsFor(cur?.engine), str('model'), cur?.effort);
                if (cur && want.effort !== (cur.effort ?? '')) { host.setEffort(sid, want.effort); }
                break;
            }
            case 'setEffort':
                // mid-session effort switch — the CLI's own `/effort`
                if (!host.setEffort(str('id'), str('effort'))) {
                    void vscode.window.showWarningMessage(
                        'Agent Farm: that session cannot take an effort change right now.');
                }
                break;
            // The answer to a parked question (see ConsoleAsk). The page sends
            // what you picked; deciding what is answerable is the host's job.
            case 'askAnswer': {
                const kind = str('kind');
                // The page is trusted, but this ends up inside a tool's input:
                // only strings and lists of strings, keyed by question text.
                const raw = (msg.answers && typeof msg.answers === 'object' && !Array.isArray(msg.answers))
                    ? msg.answers as Record<string, unknown> : {};
                const answers: Record<string, string | string[]> = {};
                for (const [q, v] of Object.entries(raw)) {
                    if (typeof v === 'string' && v) { answers[q] = v; }
                    else if (Array.isArray(v)) {
                        const list = v.filter(x => typeof x === 'string' && x) as string[];
                        if (list.length) { answers[q] = list; }
                    }
                }
                const done = host.answer(str('id'),
                    kind === 'deny' ? { kind: 'deny', message: str('message') }
                        : kind === 'allow' ? { kind: 'allow' }
                            // the terminal's middle option — see sessionAllowRule
                            : kind === 'allowAlways' ? { kind: 'allow', always: true }
                                : { kind: 'answer', answers, response: str('response') });
                if (!done) {
                    // A stale click: the CLI already took the question back, or
                    // it was answered from somewhere else. Say so — silence here
                    // reads as a dead button on a session that looks stuck.
                    void vscode.window.showInformationMessage(
                        'Agent Farm: that question is no longer waiting for an answer.');
                }
                break;
            }
            case 'permissionMode':
                // The standing RULE — how much may happen without stopping to
                // ask at all. One specific request is settled by 'askAnswer'.
                // The retry nudge is HANDED OVER, not sent: it goes out when
                // the CLI has agreed to the wider mode, and not at all when it
                // refuses (see setPermissionMode).
                host.setPermissionMode(str('id'), str('mode'), msg.retry === true
                    ? 'Permission granted — please retry the action you were refused.'
                    : undefined);
                break;
            case 'clearQueue':
                host.clearQueue(str('id'));
                break;
            // ‼️ K-23 — READING FURTHER BACK IS A READ, AND NOTHING ELSE.
            // No process is touched, no token is spent and the session is not
            // disturbed: the transcript is a file on this disk and this puts
            // more of it on the card. The positions already drawn are read off
            // the rows themselves, so what comes back cannot overlap them.
            case 'loadOlder': {
                const id = str('id');
                const seat = host.get(id);
                if (!seat?.sessionId) { break; }
                const have = seat.messages
                    .map(m => transcriptPos(m.id))
                    .filter(n => n >= 0);
                const got = this.deps.olderHistory(seat.sessionId, have);
                if (got.reason !== undefined) {
                    // an empty reason is "you are at the start" — a fact, not
                    // something to open a dialog about
                    if (got.reason) { void vscode.window.showInformationMessage(`Agent Farm: ${got.reason}`); }
                    break;
                }
                host.prependHistory(id, got.head, got.rows);
                this.refresh();
                break;
            }
            case 'close':
                host.close(str('id'));
                break;
            case 'forget':
                host.forget(str('id'));
                break;
            case 'openFile':
                void vscode.commands.executeCommand('agentfarm.openEditedFile',
                    { file: str('file'), diff: msg.diff === true });
                break;
            // Renaming a Console row goes through VS Code's own right-click menu
            // (`webview/context` → agentfarm.renameSession), which is why there
            // is no 'rename' message here: the row carries its identity in
            // `data-vscode-context` and the command does the rest.
            case 'openTranscript': {
                // ‼️ A VISIBLE BUTTON THAT DOES NOTHING IS WORSE THAN NO BUTTON
                // (X-35). This searched the Claude-only pool, so on a Codex,
                // Gemini or Antigravity row it found nothing and returned in
                // silence — the user pressed "Open transcript" and the editor
                // simply did not react. Three of the four engines DO leave a
                // readable file; the fourth never will, and that is a sentence,
                // not a no-op.
                const sessionId = str('sessionId');
                const row = this.deps.index.byId(sessionId);
                if (row?.file) {
                    void vscode.commands.executeCommand('agentfarm.openSession', row.file);
                    break;
                }
                // The engine comes from the record when there is one and from
                // the live session otherwise — a conversation started moments
                // ago has not been indexed yet, and the note must still name the
                // right CLI.
                const engine = row?.source
                    ?? this.deps.host.list().find(h => h.sessionId === sessionId)?.engine;
                void vscode.window.showInformationMessage(`Agent Farm: ${noTranscriptNote(engine)}`);
                break;
            }
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
            case 'afnav': handleAfNav(msg.to); break;
        }
    }

    private dispose(): void {
        ConsolePanel.current = undefined;
        // The sessions deliberately OUTLIVE the panel: closing a tab must not
        // kill a conversation. They end with the window, or when you close them.
        this.disposables.forEach(d => d.dispose());
        this.panel.dispose();
    }
}
