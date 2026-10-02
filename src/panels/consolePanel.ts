import * as fs from 'fs';
import { turnWaitingOn } from '../core/turnWait';
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
import { MACHINE_ACCOUNT, MACHINE_GLOBAL_ROW } from '../core/accountStore';
import { isPolicyId } from '../core/accountPolicy';
import { UsageBar } from '../core/accountUsage';
import { EngineOption, engineRefusal } from '../core/engines';
import { ProviderForm, ProviderPick, ProviderTransport } from '../core/launchProvider';
import { EngineModels, narrowLaunch } from '../core/models';
import {
    EFFORT_CHOICES, LastLaunch, LaunchOptions, modelChoices, PERMISSION_CHOICES, permissionChoicesByEngine,
    rememberedOn, RunSurface
} from '../core/launch';
import { LaunchIntent } from '../core/launchDimensions';
import { catalog as launchCatalog, narrow as narrowIntent } from '../core/aflaunch';
import { contextWindowOf, totalTokens, Usage } from '../core/pricing';
import { RunIdentity } from '../core/turnRuntime';
import { PromptSnippetsSnapshot } from '../core/prompts';
import { conversationTitle, SessionInfo, SessionIndex, sessionOrigin } from '../core/sessions';
import { SESSION_COLORS } from '../core/sessionmarks';
// K-30 — the same two functions the bridge's toolbox.slashCommands op uses.
import { getSlashCommands, reportToSources, SlashReport } from '../core/slashCommands';
import { scanSlashSources } from '../core/toolbox';
import { handleAfNav, htmlShell, promptSnippetMessage, wikiMarksOf, wikiMarkMessage } from './base';
import { AlertMessageDeps, handleAlertMessage, soundSurface } from './alertMessages';
import { desktopHost, type PanelHost } from './panelHost';
import { afConfig } from '../core/settingsDoor';
import { normalizeLegCeiling } from '../core/baton';
import { ReopenSetup } from '../core/closingSetup';
import { ReopenQuery } from '../launch/reopen';

/**
 * ‼️ X-113 - WHAT A LIVE CARD'S CONTEXT READING IS A FRACTION OF.
 *
 * Measured on a running Claude session: `ctx 234.9k`, window null. The card
 * asks the engine, and Claude states no window - so the surface a person
 * actually watches while a turn runs drew a raw token count with no ceiling,
 * no percentage and no bar, while every table on the other pages had known the
 * answer since X-35. The rule is core/pricing's (contextWindowOf); the model
 * asked is the APPLIED one, which on a card that switched mid-session is not
 * the one it was launched with.
 */
function liveWindow(
    s: { contextWindowTokens?: number; applied?: { model: string }; model?: string },
    forced: number
): { contextWindowTokens: number; contextWindowSource: string } {
    const w = contextWindowOf(s.contextWindowTokens ?? 0, s.applied?.model || s.model || '', forced);
    return { contextWindowTokens: w.tokens, contextWindowSource: w.source };
}

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
    /**
     * ‼️ X-110 — THE PROVIDER THAT ROUTE TALKS TO, which is what the colour is
     * keyed on. `id` above is a PROFILE on Claude ("Kimi (work)", "Kimi
     * (personal)"), and colouring by it would give one company two colours in
     * one table — the exact disagreement a shared chip exists to end. On
     * OpenCode a provider is its own id and this is the same string.
     */
    shape?: string;
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
    /** U-180 — the sound host acts; the session panel (afSoundPop) is answered through them */
    sound?(): AlertMessageDeps;
    /** U-181 — the card's speaker and mark (core/soundCard.ts) */
    soundCard?(sessionId: string): unknown;
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
     * ‼️ THE AGENT'S OWN DEFAULT FOR THIS ENGINE — the layer that sits BETWEEN
     * the composer's boxes and the fleet-wide `launchDefaults`.
     *
     * Farm Settings draws a model and an effort box on every agent chip and
     * writes `agentFarm.agentEngineDefaults[<agent>][<engine>]`. Every other
     * launch door resolves through it (`withAgentEngineDefaults` in
     * extension.ts) — the ▶ on an agent row, `sessions.start` on the bridge,
     * a terminal start. The Console composer was the one door that did not:
     * it read `launchDefaults()` and nothing else, so an empty box jumped
     * straight over the per-agent answer to the fleet one. An agent set to
     * `xhigh` in Settings started at the fleet effort and nothing said so —
     * the U-29 shape again, a control that stores what it is told and changes
     * nothing.
     *
     * It is the SAME function the other doors call, handed in as a dep rather
     * than reimplemented here: a second reader would be a second answer to
     * "what does this agent run as", and the resolution walks layers only the
     * host can see (the agent's own Claude settings file among them).
     *
     * Optional, like every other read dep here: a host that cannot answer
     * leaves the chain exactly as it was.
     */
    agentEngineDefaults?(dir: string, engine: string): { model?: string; effort?: string };
    /**
     * ‼️ THE SAME LAYER, ASKED FOR A BOX INSTEAD OF FOR A COMMAND LINE — and the
     * difference is one field wide.
     *
     * `agentEngineDefaults` above is the SPAWN's reader, and it returns an empty
     * model on Claude deliberately: that engine's CLI reads the agent's own
     * `.claude/settings.local.json`, so passing the same value again as a flag
     * would be a second source of truth (X-145). Correct for a spawn, and a lie
     * on a control — an agent the user had set to `opus` in Farm Settings opened
     * the composer with `Model: Default` beside an effort box reading the `xhigh`
     * they had chosen in the same row of the same page, because the effort has
     * no settings file to hide in.
     *
     * So the box is seeded from THIS one, which folds Claude's file back in, and
     * the spawn still resolves through the one above. Two questions, two
     * readers, neither answering the other's.
     */
    agentSeedDefaults?(dir: string, engine: string): { model: string; effort: string };
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
     * ‼️ X-112 — WHAT THIS CONVERSATION'S FIGURES MEAN, from the run's own
     * launch record. `routeOf` above answers "which endpoint", which is the
     * name; this answers "and therefore whose window and whose bill", which is
     * what the ⚖ and the $ on every card were asserting without being asked.
     * The same reader the Sessions table, the Timeline and the viewer use, so
     * one run cannot be off-plan on one page and on the plan on another.
     */
    identityFor?(sessionId: string, engine?: string): RunIdentity | undefined;
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
        /** ‼️ X-215 round 2 — every window this account is walled by, each
         *  naming itself. The picker prints them all; `percent` is the fullest,
         *  which is the one a rotation is decided on. */
        bars?: UsageBar[];
        resetsAt?: number;
        window?: string;
    }[];
    /**
     * ‼️ X-305 — THE RULES THIS ENGINE OFFERS, the twin of `accountsFor`.
     *
     * A slot is an answer that was true when somebody picked it; a rule is
     * re-decided at every launch. They are different kinds of choice, so the
     * page draws them as two groups and is handed them as two lists — joining
     * them here would be the host deciding a layout.
     *
     * `picks` / `note` / `refusal` are about THIS MOMENT (which slot the rule
     * comes to and on what figure, or why none); `detail` is the rule's
     * standing description. MIRROR draws the first over the second, so they
     * travel apart.
     */
    policiesFor?(engine: string): {
        id: string; label: string; detail: string;
        picks: string; note: string; refusal: string;
    }[];
    /**
     * ‼️ X-213 — CAN THIS ENGINE HOLD A SECOND SIGN-IN AT ALL?
     *
     * Separate from `accountsFor` because it answers a different question: that
     * one says which slots exist, this one says whether the axis exists. An
     * empty list on Claude means "capture one" and still deserves the box with
     * Machine Global in it; an empty list on Gemini means the picker would be a
     * control with no referent. Both used to look identical.
     */
    accountAxis?(engine: string): boolean;
    /** ‼️ X-213 — a STATED account in words: a slot's label, `Machine Global`
     *  for the machine's own, '' for nothing stated. One translation, host-side,
     *  so the sentinel never reaches a page and no surface invents a name. */
    accountLabel?(stated: string | undefined): string;
    /** ‼️ X-109 R2 — write this card's launch manifest; the id goes on the card. */
    recordConsoleLaunch?(o: {
        agentId: string; agentName: string; cwd: string; options: LaunchOptions; projectId?: string
    }): string | undefined;
    /**
     * ‼️ WHICH SIGN-IN A RECORDED SESSION ACTUALLY RAN UNDER.
     *
     * The transcript cannot say it: every slot's `projects` folder is a junction
     * onto one shared root, so five accounts write into the same directory and
     * the file names no owner. The launch manifest recorded it at the spawn, and
     * `sessionAccountOf` in `extension.ts` is the one reader every surface asks
     * — this is that reader, reaching the door that resumes a session off the
     * shelf. Without it that door started the session with no account stated at
     * all, and the card came back reading `Machine Global` for a conversation
     * that had been running on a slot. The user reported exactly that.
     */
    sessionAccount?(sessionId: string): string | undefined;
    /** S-102 — what the session's own launch asked for (its manifest), for what its transcript is silent on */
    sessionRequested?(sessionId: string, engine: string): { model?: string; effort?: string; permissionMode?: string; superpowers?: boolean };
    /** ‼️ S-109 — the one reopen answer: what this session CLOSED with (src/launch/reopen.ts) */
    reopenSetup?(q: ReopenQuery): ReopenSetup;
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
     * ‼️ K-38 — WHAT `show` WAS LAST SET TO, for a panel that is opening cold.
     *
     * The card's own filter (K-21) lives in the webview's state, and that state
     * does not survive the panel being closed or the window reloading — nor do
     * the session ids it is keyed by. So the reading a person chose came back as
     * the shipped default every time. This is the seed a FRESH page starts its
     * cards from; it never touches a card that is already on screen.
     *
     * ‼️ K-40 — keyed by the CLI's session id, never one value for the panel:
     * a card with no record starts on Dialog, whatever another card was left
     * on. `null` = chosen, and the choice was everything.
     */
    rememberedKinds?(): Record<string, string[] | null>;
    /** …and the write-back, made when the picker moves on a card. */
    rememberKinds?(sessionId: string, kinds: string[] | null): void;
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
    /** M-63 — the session of the card open in the Console changed (the relay status bar follows it) */
    focusChanged(sessionId: string | undefined): void;
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
     * ‼️ S-64 (5/n) — the first message of the fresh run that continues a
     * handed-over session: the host finds the note (a folder search, so only
     * on the click) and writes the paragraph. `note` and `pct` are what it
     * found, for the answer the bridge gives.
     */
    handoverContinue(sessionId: string, projectId?: string): { prompt: string; note?: string; pct?: number };
    /** the host's own views for one card — context signal, bridge-guard stops, baton leg (the console.sessions op's builder) */
    cardViews?(sessionId: string): { contextSignalView: unknown; bridgeGuardView: unknown; batonView: unknown };
    /** S-82 — ⑂ Attach relay: baton.attach's own body (attachRelay) for this card's session */
    batonAttach?(sessionId: string, account: string, maxHops: unknown): Promise<{ ok: true; sentence: string } | { ok: false; why: string }>;
    /** S-82 — ⑂ Pass now: the handover order for this runner, worded for its relay (passNowText) */
    batonPassNowText?(sessionId: string): string;
    /** the fleet's leg ceiling (agentFarm.batonMaxHops), for the empty max-legs boxes */
    batonMaxLegs?(): number;
    /** S-77 — the card's ✕: every live baton of the chain stops, recorded (`stopBatons`). Answers how many. */
    batonStopChain(chainId: string): number;
    /** S-99 — the card's ⑂⊣: this run's leg becomes the chain's last, or not (baton.lastLeg's body, applyLastLeg) */
    batonLastLeg?(sessionId: string, on: boolean): { ok: true; sentence: string } | { ok: false; why: string };
    /** S-103 — a right-click on ⑂⊣: the chain's legs menu, written by baton.setLegs's body (applyChainLegs) */
    batonLegs?(chainId: string): Promise<void>;
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
    /**
     * ‼️ X-177 — THE SENTRY CAMPAIGN, for the one line at the top of this page.
     *
     * The Console is where the user's eye already is, so it is where the fact
     * that something is running unattended RIGHT NOW belongs — who is working,
     * on which account, how much of that window is left. It is the same payload
     * the Missions page is built from (`sentryPayload`) rather than a reading
     * of its own: the two surfaces divide the SUBJECT (here the live moment,
     * there the setup and the history), never the source.
     *
     * Optional, and `null` when nothing is configured — a host that has no
     * campaign to describe draws no strip at all, which is also what the fixture
     * pages and every other embedder get for free.
     */
    sentry?(): Record<string, unknown> | null;
}

export class ConsolePanel {
    private static current?: ConsolePanel;
    private disposables: vscode.Disposable[] = [];
    private selected?: string;
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
     * ‼️ X-152 — THE COMPOSER'S WHOLE INTENT, IN ONE RECORD, ON THIS SIDE.
     *
     * The strip's answers used to live in two places with five rules between
     * them: the engine, the route, the sign-in and the discipline here (each
     * its own field, each pruned by its own handler), the model, the effort
     * and the permission mode in the page's own state (narrowed there, seeded
     * from a one-shot record the page had to notice), and Send stitched the
     * two halves back together. Every race this family is named after — a
     * cold open losing the setup (S-50), the boxes answering only when the
     * hand let go (S-51) — was the seam between those halves.
     *
     * This is the seam closed: every dimension of the next session is a field
     * of ONE `LaunchIntent`, held here, narrowed here by the one rule
     * (`core/aflaunch.ts` = `media/afLaunch.js`, X-149), and pushed to the page
     * whole. The page draws it and asks for changes (`setIntent`); it does not
     * keep a copy. The four accessors below are the old names over the new
     * record, so the readers that grew up on them are not rewritten.
     *
     * What is NOT in it: the project (not a launch dimension — it is what the
     * session is filed under) and the agent (the subject of the intent, not a
     * dimension of it); both are siblings. The draft and the attachments are
     * content, not intent, and stay on the page.
     */
    private composerIntent: LaunchIntent = {};
    /** …and WHO the next session is for — the page's picker echoes into it. */
    private composerAgent = '';
    /**
     * S-82 — whether the next session opens a baton relay, and its chain's own
     * leg ceiling. A sibling of the intent, not a launch dimension: nothing is
     * spawned differently, the card is only sealed as leg 1 once it runs.
     * One-shot, cleared on `start` like the project.
     */
    private composerRelay: { on: boolean; maxLegs?: number } = { on: false };
    private focusSent?: string;

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
    private get composerSuperpowers(): boolean | undefined { return this.composerIntent.superpowers; }
    private set composerSuperpowers(v: boolean | undefined) { this.composerIntent.superpowers = v; }

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
    private get composerRoute(): { providerId?: string; tier?: string } | undefined {
        const { providerId, tier } = this.composerIntent;
        return providerId ? { providerId, ...(tier ? { tier } : {}) } : undefined;
    }
    private set composerRoute(v: { providerId?: string; tier?: string } | undefined) {
        this.composerIntent.providerId = v?.providerId || undefined;
        this.composerIntent.tier = v?.providerId ? (v.tier || undefined) : undefined;
    }
    /**
     * ‼️ X-169 — WHICH SIGN-IN THE NEXT CARD STARTS ON.
     *
     * Held here rather than on the page for the same reason the route is: it
     * has to survive a repaint that rebuilds the whole strip, and it is pruned
     * by the engine (a Claude account is not a Codex one). `undefined` is the
     * ordinary answer and means "whatever `agentFarm.activeAccounts` says at
     * spawn" — which is the one place the "use this next" button writes.
     */
    private get composerAccount(): string | undefined { return this.composerIntent.account; }
    private set composerAccount(v: string | undefined) { this.composerIntent.account = v || undefined; }

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
     * ‼️ X-152 — the eight dimensions of that setup go straight into the record
     * (`seedIntent`, narrowed for the engine the caller states in the same
     * call); what is left here is the one part that is CONTENT rather than
     * intent: the first prompt, into the box the user is about to type in.
     * One-shot: a bumped `composerSeed` is what makes the page read it, and it
     * is let go on the next start, or it would reapply itself to a session
     * nobody launched from it.
     */
    private composerPrompt?: string;

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
    private get composerEngine(): string | undefined { return this.composerIntent.engine; }
    private set composerEngine(v: string | undefined) {
        this.composerIntent.engine = ((v ?? '').trim() || undefined) as EngineId | undefined;
    }
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
     * `composerAgent` is who the record is for; this replaces the picker with
     * the name, because a composer reached from an agent's row is about that agent
     * and a dropdown there is only a way to lose it by accident. It is let go
     * the moment a session starts, or when the user says so.
     */
    private pinnedAgent?: string;

    /**
     * ‼️ S-64 (5/n) — CONTINUE FROM A HANDOVER: THE COMPOSER, NOT A SPAWN.
     *
     * The law sends the next run into a fresh session that starts from the
     * note, and this is the one door for it, shared by the card's button and
     * the bridge (`console.continueFromHandover open=true`). It opens the
     * composer on the card's agent with the card's setup — engine, model,
     * effort, permission mode, superpowers, route, sign-in, project — and the
     * host's first message already in the box, and STOPS there: a run that
     * handed over on the quota trigger is exactly the one whose account the
     * user wants to change before pressing Send. What was found is returned
     * so the bridge can say it. Undefined when the card has no session id
     * yet — there is nothing to continue from.
     */
    static continueFromHandover(deps: ConsoleDeps, id: string): { prompt: string; note?: string; pct?: number } | undefined {
        const s = deps.host.get(String(id ?? '').trim());
        if (!s?.sessionId) { return undefined; }
        const found = deps.handoverContinue(s.sessionId, s.projectId);
        ConsolePanel.show(deps, {
            agentId: s.agentId, pinAgent: true,
            projectId: s.projectId ?? '',
            engine: s.engine,
            launch: {
                model: s.model, effort: s.effort, permissionMode: s.permissionMode,
                superpowers: s.superpowers, providerId: s.providerId, tier: s.tier,
                account: s.account, prompt: found.prompt
            }
        });
        return found;
    }

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
                c.selected = '';
                c.pinnedAgent = opts.pinAgent ? opts.agentId : undefined;
                // A caller that handed over a setup of its own is answered by
                // the block below; this is the door that handed over nothing.
                /**
                 * ‼️ …AND THE MEMORY IS NOT THE ONLY LAYER THIS DOOR HAS.
                 *
                 * It used to seed ONLY from the record, so an agent that had
                 * never been started — or one whose record is silent on a field —
                 * fell straight through to the fleet defaults and jumped over the
                 * answer the user had typed into Farm Settings for that agent on
                 * that engine. Measured on `developer`: the record held
                 * `effort: xhigh` for Claude and no model, so the composer opened
                 * `Effort: xhigh` (right, by luck) beside `Model: Default` on an
                 * agent whose Claude model is set to `opus` — one question
                 * answered two ways in one row.
                 *
                 * The order is the one every other door resolves at spawn, per
                 * FIELD rather than per record: the memory → this agent's own
                 * setting for this engine → the fleet. Resolved HERE rather than
                 * in the page because only the host can read the third layer's
                 * Claude settings file, and because `applyComposerSeed` treats
                 * the handed-over setup as all-or-nothing (K-34) — a half-filled
                 * record would otherwise silence the fleet layer entirely.
                 */
                const agentDir = c.deps.getAgents().find(a => a.id === opts.agentId)?.dir ?? '';
                const own = agentDir
                    ? c.deps.agentSeedDefaults?.(agentDir, c.composerEngine) ?? { model: '', effort: '' }
                    : { model: '', effort: '' };
                // ‼️ X-152 — the record knows who it is for, and opens with the
                // same three layers below, narrowed here for the engine above.
                // A door that hands over no prompt leaves none pending either:
                // this is a new launch decision, not the launcher's.
                c.composerAgent = opts.agentId;
                c.composerPrompt = undefined;
                if (!opts.launch && (last || own.model || own.effort)) {
                    const pick = (...v: (string | undefined)[]) =>
                        v.map(x => (x ?? '').trim()).find(x => x) ?? '';
                    c.composerSuperpowers = last?.superpowers;
                    c.seedIntent({
                        model: pick(last?.model, own.model, d.model),
                        effort: pick(last?.effort, own.effort, d.effort),
                        permissionMode: pick(last?.permissionMode, d.permissionMode)
                    }, true);
                } else if (!opts.launch) {
                    // nothing remembered, nothing set for this agent: the fleet
                    // defaults, and the catalogue decides whether the engine
                    // can run them (no `keep` — they name no engine)
                    c.composerSuperpowers = undefined;
                    c.seedIntent({ model: d.model, effort: d.effort, permissionMode: d.permissionMode }, false);
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
                // (`opts.engine`), and the record is narrowed for that engine
                // as the setup is written into it — trusted, because it is a
                // real launch's answer (X-152).
                c.composerPrompt = (l.prompt ?? '').trim() || undefined;
                c.composerSuperpowers = l.superpowers;
                c.seedIntent(l, true);
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
            ConsolePanel.current.surface.reveal();
            apply(ConsolePanel.current);
            ConsolePanel.current.refresh();
            return;
        }
        const fresh = new ConsolePanel(desktopHost({ viewType: 'agentfarm.console', title: 'Console', column: vscode.ViewColumn.Active }), deps);
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
     * U-181 — open one conversation's sound panel in the Console, when the
     * Console is open and that conversation is one of its cards. False sends
     * the caller to its own fallback (the list the palette always had).
     */
    static openSound(sessionId: string): boolean {
        const c = ConsolePanel.current;
        const s = sessionId ? c?.deps.host.list().find(x => x.sessionId === sessionId) : undefined;
        if (!c || !s) { return false; }
        c.selected = s.id;
        c.refresh();
        c.surface.reveal();
        void Promise.resolve(c.surface.webview.postMessage({ type: 'afctx', act: 'soundPop', ctx: { sessionId } }))
            .then(undefined, () => undefined);
        return true;
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
        return !!c && c.surface.visible && c.selected === hostId;
    }

    /**
     * ‼️ X-243 — WHICH SIGN-IN THE READER IS LOOKING AT.
     *
     * The status bar normally answers for the STANDING account, which is who
     * the next session would run as. The conversation on screen may already be
     * running as somebody else, and then that is the account whose wall the
     * reader is about to hit. Absent `account` is not a gap: it means the card
     * took whatever was standing, so there is nothing to follow.
     */
    static watchedAccount(): { engine: string; account: string } | undefined {
        const c = ConsolePanel.current;
        if (!c || !c.surface.visible || !c.selected) { return undefined; }
        const s = c.deps.host.list().find(x => x.id === c.selected);
        // `accountNext` is deliberately not read: it is what the NEXT message
        // will run as, and the figures on the bar are about the turn in front
        // of the reader.
        return s?.account ? { engine: s.engine || 'claude', account: s.account } : undefined;
    }

    private static watchChanged = new vscode.EventEmitter<void>();
    /** X-243 — fires whenever `watchedAccount()` has changed its answer. */
    static readonly onWatchedAccountChanged = ConsolePanel.watchChanged.event;
    private static lastWatch = '';
    /**
     * ‼️ ONLY ON A REAL CHANGE. `refresh()` runs on every host event, which on
     * a streaming turn is many a second; a repaint per token would be the
     * indicator costing more than the thing it reports on.
     */
    private static announceWatch(): void {
        const w = ConsolePanel.watchedAccount();
        const key = w ? `${w.engine}/${w.account}` : '';
        if (key === ConsolePanel.lastWatch) { return; }
        ConsolePanel.lastWatch = key;
        ConsolePanel.watchChanged.fire();
    }

    /** X-441 — the Console on a phone: one instance per view, never the desktop's one tab. */
    static openOn(surface: PanelHost, deps: ConsoleDeps): void {
        new ConsolePanel(surface, deps).mount();
    }

    private constructor(private surface: PanelHost, private deps: ConsoleDeps) {
        surface.webview.onDidReceiveMessage(m => void this.onMessage(m), null, this.disposables);
        surface.onDidDispose(() => this.dispose(), null, this.disposables);
        this.disposables.push(deps.host.onChange(() => this.refresh()));
        // X-243 — the panel going behind another tab is a change of subject for
        // the status bar just as much as selecting a different conversation is.
        surface.onDidChangeViewState(() => ConsolePanel.announceWatch(), null, this.disposables);
    }

    /**
     * ‼️ S-50 — THE PAGE IS LOADED AFTER THE DOOR HAS SAID WHAT IT CAME TO SAY.
     *
     * The shell used to be built in the constructor, which runs BEFORE
     * `show`'s `apply` — so on the cold path (the Console is closed and this
     * call is what creates it) the bootstrap `window.__DATA__` carried none of
     * the caller's answers, and the `refresh()` that followed pushed them into
     * a webview whose script had not run yet. A push into an unloaded page is
     * not late, it is LOST — the door's agent and setup went with it, and no
     * later refresh could say them again. Hence "the play button works, but
     * only if the Console was already open".
     *
     * Loading the page is therefore a second step the caller takes once the
     * instance describes what is to be shown. An already-open panel is
     * untouched by this: it keeps arriving by push, which is the channel a
     * loaded page reads.
     */
    private mount(): void {
        this.mounted = true;
        this.surface.webview.html = htmlShell(this.surface.webview, this.deps.extensionUri,
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
        // What the strip above the box is ABOUT (see chipProjectId below): the
        // selected session's own project, or — in composer mode — the picker's.
        const chipProject = this.selected
            ? (hosted.find(s => s.id === this.selected)?.projectId ?? '')
            : this.composerProject;
        // ‼️ K-38 / K-40 — the `show` each hosted session was left on, keyed
        // by its CLI session id; only the cards on the shelf travel. A card
        // with no entry starts on Dialog, and `null` is itself a choice here
        // ("everything").
        const remembered = this.deps.rememberedKinds?.() ?? {};
        const kindsBy: Record<string, string[] | null> = {};
        hosted.forEach(s => {
            if (s.sessionId && Object.prototype.hasOwnProperty.call(remembered, s.sessionId)) {
                kindsBy[s.sessionId] = remembered[s.sessionId];
            }
        });
        const projectList = this.deps.projects();
        return {
            generatedAt: Date.now(),
            selected: this.selected ?? '',
            composerSeed: this.composerSeed,
            prefs: { kindsBy },
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
                // ‼️ X-112 — …AND WHOSE WINDOW AND WHOSE BILL THAT MAKES IT. The
                // card prints ⚖ and $ on every row; without this both were
                // claiming the Claude plan whatever route answered.
                // ‼️ THE ENGINE TRAVELS WITH THE ASK. A card whose first turn has
                // not landed is not in the index yet, and without the engine the
                // reader would fall back to Claude — putting a brand-new Codex
                // conversation's ⚖ on the Claude plan, which is the exact claim
                // this item exists to stop.
                identity: this.deps.identityFor?.(s.sessionId ?? '', s.engine ?? 'claude') ?? null,
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
                /**
                 * ‼️ X-213 — WHOSE PLAN THIS CARD IS SPENDING, and whose the
                 * next turn will spend when the two differ.
                 *
                 * The card carried the account since X-169 and said nothing
                 * about it on any surface, which is the half of the ghost that
                 * survives a correct picker: the choice was right and invisible.
                 * `accountLabel` is the words (the sentinel never reaches a
                 * page); `account` is the value the box is set to, so what is
                 * shown and what is sealed are one field.
                 */
                account: s.account ?? '',
                accountLabel: this.deps.accountLabel?.(s.account) ?? '',
                // ‼️ K-41 — WHETHER THAT NAME IS A RULE OR A SIGN-IN, decided
                // by the one function that owns the question. The card needs it
                // because the two read the same on the pill and mean different
                // things in the panel: a sign-in IS what the conversation is
                // spending, a rule is what CHOSE what it is spending. The page
                // must not test for the '@' itself — that is the rule living in
                // two places, and the first half of this bug was exactly that
                // kind of second opinion.
                accountIsPolicy: isPolicyId(s.account),
                accountNext: s.accountNext ?? '',
                accountNextLabel: this.deps.accountLabel?.(s.accountNext) ?? '',
                accountNextIsPolicy: isPolicyId(s.accountNext),
                // …and whether this engine can be moved at all, which is the
                // same fact the composer's box is drawn from.
                accountAxis: this.deps.accountAxis?.(engineOf(s.engine).id) === true,
                // ‼️ …and THIS card's engine's slots, not the composer's. The
                // composer's engine is a different question and two cards on two
                // engines are drawn from the same payload; reusing the composer's
                // list here is how a Codex card would come to offer Claude's
                // sign-ins. Empty on an engine with no axis, where nothing is
                // drawn anyway.
                accountRows: this.deps.accountAxis?.(engineOf(s.engine).id)
                    ? (this.deps.accountsFor?.(engineOf(s.engine).id) ?? []) : [],
                // ‼️ X-305 — …and THIS card's engine's rules, on the same rule
                // as the slots above: a card's engine is its own question.
                policyRows: this.deps.accountAxis?.(engineOf(s.engine).id)
                    ? (this.deps.policiesFor?.(engineOf(s.engine).id) ?? []) : [],
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
                ...liveWindow(s, afConfig().get<number>('contextWindowTokens', 0)),
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
                // S-62 — what the CLI is still running behind the turn, its own
                // list as it came; the strip draws one chip per task and the
                // Interrupt button says it will end them with the turn.
                backgroundTasks: s.backgroundTasks ?? [],
                // U-148 — a working turn blocked in a call that only waits on it
                waitingOn: turnWaitingOn(s),
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
                // K-43 — the countdown under the question, decided by the host
                autoAnswer: s.pendingAsk ? this.deps.host.autoAnswerView(s.id) : null,
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
                // P-18 — the square beside the colour dot carries the project's own colour
                projectColor: s.projectId
                    ? (this.deps.projects().find(p => p.id === s.projectId)?.color ?? '') : '',
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
                // U-181 — what this conversation sounds like: the composer's
                // speaker, and the card's mark when it differs from the rest
                soundView: s.sessionId ? (this.deps.soundCard?.(s.sessionId) ?? null) : null,
                // S-64 / B-23 / S-77 — what the card's status line, its
                // Continue-from-handover button and its ⑂ chip are drawn from
                ...(s.sessionId ? this.deps.cardViews?.(s.sessionId) : undefined),
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
                superpowers: this.deps.superpowersDefault(a.name)
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
            // …and WHAT IS CURRENTLY PICKED is two fields of `composerIntent`
            // (providerId · tier), echoed rather than inferred from the form: a
            // vocabulary cannot say "chosen, and since deleted in Settings".
            /**
             * ‼️ X-169 — THE SIGN-INS THIS ENGINE HAS. Which one is picked is
             * `composerIntent.account` (accountShown), kept apart for the
             * reason the route's two fields are: the list is a vocabulary and
             * the pick is an answer, and a page that inferred one from the
             * other could not tell "nobody chose" from "chosen, and the slot
             * has since been forgotten".
             *
             * An empty list is the ordinary answer on four of the five engines
             * and on a machine that has never captured an account — the page
             * draws nothing at all for it, because a control offering a choice
             * of one thing that is already true is the control with no referent
             * docs/CONVENTIONS.md forbids.
             */
            composerAccounts: this.deps.accountsFor?.(engineOf(this.chosenEngine()).id) ?? [],
            /**
             * ‼️ X-305 — …AND THE RULES THE COMPOSER MAY PICK. Same engine, same
             * moment, one reader: a rule that reads `@emptiest → Work` here and
             * something else on the card below it would be two answers to one
             * question.
             */
            composerPolicies: this.deps.policiesFor?.(engineOf(this.chosenEngine()).id) ?? [],
            /**
             * ‼️ X-213 — WHETHER THE BOX EXISTS IS A FACT ABOUT THE ENGINE, not
             * about the length of the list.
             *
             * The page used to draw the account axis only when a slot had been
             * captured, so a machine with none had no box — and therefore no
             * statement anywhere of which sign-in it was working on. "Nothing
             * captured yet" is not "there is nothing to know": the machine's own
             * account is running the session either way, and the reader is
             * entitled to see whose plan they are spending before they press
             * Send. An engine that cannot hold a second sign-in still draws
             * nothing, because there the picker really would have no referent.
             */
            composerAccountAxis: this.deps.accountAxis?.(engineOf(this.chosenEngine()).id) === true,
            // Two lists, because they are two different questions. Starting a
            // session picks a FLAG (and "Default" — pass none — is a real
            // answer). Moving a running one sends `set_permission_mode`, which
            // has its own, shorter vocabulary and refuses the rest — measured,
            // see PERMISSION_MODES_LIVE. One list served both and offered three
            // rows that could not work.
            permissions: PERMISSION_CHOICES,
            // S-60 — the rows an engine can keep, where they differ from the one list.
            permissionsByEngine: permissionChoicesByEngine(),
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
            // ‼️ K-35 — the fixed swatches come DOWN rather than being a list in
            // the page. The same ten are what `sessions.color` documents to an
            // agent, and a palette written out twice is a palette that drifts.
            sessionColors: SESSION_COLORS,
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
                ...r, color: r.sessionId ? (this.deps.colorFor?.(r.sessionId) ?? '') : '',
                ...this.projectMark(r, projectList)
            }))
                /**
                 * ‼️ S-55 — A SESSION THIS WINDOW IS SHOWING A CARD FOR IS NOT
                 * "WHERE YOU LEFT OFF", WHATEVER STATE THAT CARD IS IN.
                 *
                 * This used to hide a shelf row only while a LIVE card held the
                 * same session, so the moment a card ended, the same
                 * conversation was drawn twice in one column — the ended card
                 * and its shelf twin, same agent, same title, same id. And it
                 * is the whole of "End & remove does not remove the card": the
                 * card left `host.list()`, this filter stopped hiding the row,
                 * and the session reappeared one section down in the same
                 * breath. It had not stayed; it had moved.
                 *
                 * The shelf is for what the LAST window left. A card in this
                 * one answers for the session already, and the removal itself
                 * now dismisses the shelf row too (agentfarm.consoleEndAndRemove),
                 * so the row cannot come back the instant the card goes.
                 */
                .filter(r => !hosted.some(h => h.sessionId === r.sessionId)),
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
            // ‼️ X-152 — THE WHOLE INTENT, ALREADY NARROWED, and who it is for:
            // the one record the page draws its strip from. The composer's
            // choice for the discipline is its `superpowers` (null = the
            // agent's own, X-133), the route its `providerId`/`tier`, the
            // sign-in its `account`, the engine its `engine`.
            composerIntent: this.composerIntentShown(),
            batonMaxLegs: this.deps.batonMaxLegs?.() ?? null,
            composerAgent: this.composerAgent,
            // …and the one part of a handed-over setup that is CONTENT rather
            // than intent: the first prompt, into the box, once per seed (K-34)
            composerPrompt: this.composerPrompt ?? '',
            // the exact text, for the hover — never a description of it
            superpowersText: this.deps.superpowersText(),
            superpowersHealth: this.deps.superpowersHealth(),
            // the agent this composer is fixed to, when it was opened from one
            pinnedAgent: this.pinnedAgent ?? '',
            // X-177 — the unattended campaign, drawn as ONE line under the
            // header. Null is the ordinary answer on a machine nobody has set
            // one up on, and the page draws nothing for it.
            sentry: this.deps.sentry?.() ?? null,
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
        const projects = this.deps.projects();
        return {
            resumable: hit.rows.map(r => this.resumeRow(r.s, projects)),
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
        // ‼️ X-213 — the machine's own sign-in belongs to no engine and survives
        // every engine change: it is the absence of a slot, and every engine has
        // one of those. Pruning it would silently turn a stated choice back into
        // an unstated one, which is the ghost the sentinel exists to prevent.
        if (want === MACHINE_ACCOUNT) { return MACHINE_ACCOUNT; }
        const engine = engineOf(this.chosenEngine()).id;
        // ‼️ X-305 R2 — a RULE is kept when this engine offers it. Checked
        // against the slot list only, `@round-robin` was pruned to nothing and
        // the box fell back to the standing slot — a walled one, measured.
        if (isPolicyId(want)) {
            return (this.deps.policiesFor?.(engine) ?? []).some(p => p.id === want) ? want : undefined;
        }
        const mine = this.deps.accountsFor?.(engine) ?? [];
        return mine.some(a => a.id === want) ? want : undefined;
    }

    /**
     * ‼️ X-213 — WHAT THE BOX SHOWS **IS** WHAT THE SESSION WILL RUN AS.
     *
     * The ghost selection was this function's absence. The box's value was ''
     * with no row for '', so the browser drew the FIRST account as selected
     * while the composer stated nothing — and stating nothing does not mean the
     * main sign-in, it falls through to whatever the Engines page's "use this
     * next" last pointed at. Three different accounts could be involved: the one
     * shown, the one the tooltip described, and the one that ran.
     *
     * So the composer always has an explicit answer, and this is it:
     *
     *  1. what the person picked in this composer, if they picked;
     *  2. otherwise the STANDING account of this engine — the choice they
     *     already made, on the Engines page, and the box says so with its dot;
     *  3. otherwise the machine's own sign-in, BY NAME (`MACHINE_ACCOUNT`),
     *     never as a blank.
     *
     * '' comes back only where the engine cannot hold a second sign-in at all,
     * and then no box is drawn and nothing is stated — which is the behaviour
     * every engine but Claude and Codex has always had, unchanged.
     */
    private accountShown(): string {
        const engine = engineOf(this.chosenEngine()).id;
        if (!this.deps.accountAxis?.(engine)) { return ''; }
        const own = this.prunedAccount(this.composerAccount);
        if (own) { return own; }
        const standing = (this.deps.accountsFor?.(engine) ?? []).find(a => a.active);
        return standing ? standing.id : MACHINE_ACCOUNT;
    }

    private engineModelsFor(engine: string | undefined): EngineModels | undefined {
        const map = this.deps.engineModels?.();
        if (!map) { return undefined; }
        return map[(engine || 'claude') as EngineId];
    }

    /**
     * ‼️ X-152 — WHAT THE COMPOSER'S ENGINE IS OFFERING, in the one shape the
     * narrowing rule reads. The same three sources the page's `composerCatalog`
     * assembles, assembled here instead: the engine's published catalogue, the
     * alias rows when it has none, the flat effort list to fall back on, and
     * whether the engine has an effort flag at all (a fact about the engine,
     * true before any handshake has landed).
     */
    private composerCatalogFor(engine: string) {
        const em = this.engineModelsFor(engine);
        return launchCatalog({
            known: true,
            em: em ?? null,
            models: em?.models ?? modelChoices(this.deps.modelAliases()),
            efforts: EFFORT_CHOICES,
            takesEffort: engineTakesEffort(engine)
        });
    }

    /**
     * The model and the effort, narrowed by the engine the composer is on — the
     * one rule, applied on this side (X-149). `keep` is S-34: a pair a real
     * launch on THIS engine ran is runnable on it whatever the catalogue
     * advertises; `preferModelDefault` is a model picked by hand, whose own
     * default effort then wins.
     */
    private narrowComposer(keep: { model?: string; effort?: string } | null, preferModelDefault: boolean): void {
        const engine = engineOf(this.chosenEngine()).id;
        const out = narrowIntent(this.composerCatalogFor(engine),
            { model: this.composerIntent.model ?? '', effort: this.composerIntent.effort ?? '' },
            { keep, preferModelDefault });
        this.composerIntent.model = out.model || undefined;
        this.composerIntent.effort = out.effort || undefined;
    }

    /**
     * ‼️ X-152 — A DOOR SEEDS THE COMPOSER, HERE (S-49, now literally on this
     * side). The handed-over three are written into the record and narrowed by
     * the engine the composer is opening on. `trusted` is S-34: a setup a real
     * launch ran, or the agent's own per-engine answer, beats the catalogue;
     * the fleet defaults name no engine and are not trusted (no `keep`).
     */
    private seedIntent(
        from: { model?: string; effort?: string; permissionMode?: string }, trusted: boolean
    ): void {
        this.composerIntent.model = (from.model ?? '').trim() || undefined;
        this.composerIntent.effort = (from.effort ?? '').trim() || undefined;
        this.composerIntent.permissionMode = (from.permissionMode ?? '').trim() || undefined;
        const keep = trusted && (this.composerIntent.model || this.composerIntent.effort)
            ? { model: this.composerIntent.model, effort: this.composerIntent.effort } : null;
        this.narrowComposer(keep, false);
    }

    /**
     * ‼️ X-152 — THE ENGINE MOVED. Everything under it is answered again, here,
     * by the order every door resolves at spawn (X-145): this agent's memory
     * for the NEW engine → its own setting for that engine in Farm Settings →
     * nothing, then narrowed by what the engine offers (with the first two
     * layers trusted as `keep`, because both are per-engine facts). The route
     * and the sign-in are pruned by the engine's own adapter, as before.
     */
    private moveEngine(next: string): void {
        this.composerEngine = next;
        const engine = engineOf(this.chosenEngine()).id;
        const agentId = this.composerAgent;
        const remembered = agentId ? this.deps.lastLaunch(agentId) : undefined;
        const mem = remembered ? rememberedOn(engine, remembered) : undefined;
        const agentDir = this.deps.getAgents().find(a => a.id === agentId)?.dir ?? '';
        const own = agentDir
            ? this.deps.agentSeedDefaults?.(agentDir, engine) ?? { model: '', effort: '' }
            : { model: '', effort: '' };
        this.composerIntent.model = mem?.model || own.model || undefined;
        this.composerIntent.effort = mem?.effort || own.effort || undefined;
        this.composerIntent.permissionMode = mem?.permissionMode || undefined;
        const keep = (this.composerIntent.model || this.composerIntent.effort)
            ? { model: this.composerIntent.model, effort: this.composerIntent.effort } : null;
        this.narrowComposer(keep, false);
        this.composerRoute = this.prunedRoute(this.composerRoute);
        this.composerAccount = this.prunedAccount(this.composerAccount);
    }

    /**
     * ‼️ X-152 — ONE CHANGE TO THE INTENT, BY FIELD. This is the whole of what
     * the page may ask for about the next session: it names a dimension and a
     * value, and the answer — narrowed, pruned, or refused into the default —
     * comes back with the next push. A field this record does not hold is
     * ignored rather than stored: the page cannot invent a dimension.
     */
    private applyIntent(field: string, value: unknown): void {
        const s = typeof value === 'string' ? value.trim() : '';
        // a map rather than a switch: the parity gate reads every `case` arm of
        // this file as a door of its own, and the one door here is `setIntent`
        const apply: Record<string, () => void> = {
            engine: () => this.moveEngine(s),
            model: () => {
                this.composerIntent.model = s || undefined;
                this.narrowComposer(null, true);
            },
            effort: () => { this.composerIntent.effort = s || undefined; },
            permissionMode: () => { this.composerIntent.permissionMode = s || undefined; },
            // X-133 — `''`/null is the way back to the agent's own default
            superpowers: () => {
                this.composerSuperpowers = value === true || value === 'on' ? true
                    : value === false || value === 'off' ? false : undefined;
            },
            account: () => { this.composerAccount = this.prunedAccount(s); },
            // X-105 — the route is the one above the tier: moving it clears the tier
            providerId: () => { this.composerRoute = this.prunedRoute(s ? { providerId: s } : undefined); },
            tier: () => {
                const providerId = this.composerRoute?.providerId;
                this.composerRoute = this.prunedRoute(
                    providerId ? { providerId, ...(s ? { tier: s } : {}) } : undefined);
            },
            agentId: () => { this.composerAgent = s; },
            // S-82 — the composer's ⑂ Relay chip and its max-legs box
            baton: () => { this.composerRelay = { ...this.composerRelay, on: value === true || value === 'on' }; },
            batonMaxHops: () => { this.composerRelay = { ...this.composerRelay, maxLegs: normalizeLegCeiling(value) }; }
        };
        if (Object.prototype.hasOwnProperty.call(apply, field)) { apply[field](); }
    }

    /**
     * The intent as the page draws it: every dimension present, `''` where
     * nothing is stated (the page's "Default" row), the engine and the sign-in
     * already resolved the way their boxes show them. `superpowers` keeps its
     * three answers (X-133): true, false, or null for "the agent's own".
     */
    private composerIntentShown(): Record<string, string | boolean | null> {
        const i = this.composerIntent;
        return {
            engine: this.chosenEngine(),
            model: i.model ?? '', effort: i.effort ?? '', permissionMode: i.permissionMode ?? '',
            providerId: i.providerId ?? '', tier: i.tier ?? '',
            account: this.accountShown(),
            superpowers: i.superpowers === undefined ? null : i.superpowers,
            baton: this.composerRelay.on,
            batonMaxHops: this.composerRelay.maxLegs === undefined ? '' : String(this.composerRelay.maxLegs)
        };
    }

    /** P-18 — the project square's four fields, for a row whose project is resolved rather than stamped on a card. */
    private projectMark(
        s: { sessionId?: string; agentName?: string; cwd?: string },
        projects: { id: string; name: string; icon?: string; color?: string }[]
    ): { projectId: string; projectName: string; projectIcon: string; projectColor: string } {
        const projectId = this.deps.sessionProject({ sessionId: s.sessionId, agentName: s.agentName, cwd: s.cwd });
        const p = projectId ? projects.find(x => x.id === projectId) : undefined;
        return { projectId: p ? projectId : '', projectName: p?.name ?? '', projectIcon: p?.icon ?? '', projectColor: p?.color ?? '' };
    }

    private resumeRow(s: SessionInfo, projects = this.deps.projects()): Record<string, unknown> {
        return {
            ...this.projectMark(s, projects),
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
            // ‼️ X-113 — …and when the engine states none, which is Claude for
            // ever, the model's own published window is still a real answer.
            // This row asked only the session and so showed a bare numerator on
            // every Claude conversation in the list — the exact ambiguity the
            // paragraph above exists to close.
            contextWindowTokens: contextWindowOf(s.ctxWindow ?? 0, s.lastModel ?? '',
                afConfig().get<number>('contextWindowTokens', 0)).tokens,
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
            models: s.models ?? [], tags: s.tags ?? [],
            // X-112 — the shelf row carries ⚖ and $ in its panel too, and it is
            // the surface a reader picks a conversation from.
            identity: this.deps.identityFor?.(s.sessionId, s.source || 'claude') ?? null
        };
    }

    refresh(): void {
        // ‼️ S-50 — a page that has not been loaded cannot read a push. The
        // window this closes is short (construction to `mount()`), but it is the
        // window a host event landing in it would lose the door's message in.
        if (!this.mounted) { return; }
        ConsolePanel.announceWatch();
        const data = this.data();
        const focus = this.selected ? this.deps.host.list().find(s => s.id === this.selected)?.sessionId : undefined;
        if (focus !== this.focusSent) { this.focusSent = focus; this.deps.focusChanged?.(focus); }
        // The tab says how many conversations are waiting for you, so the nudge
        // reaches you with the Console in the background — the one place a
        // count is useful and can never be in the way.
        const waiting = (data.sessions as { status: string; turns: number; queued: string[] }[])
            .filter(s => s.status === 'idle' && s.turns > 0 && !s.queued.length).length;
        const title = waiting ? `Console (${waiting})` : 'Console';
        if (this.surface.title !== title) { this.surface.title = title; }
        void this.surface.webview.postMessage({ type: 'data', data });
    }

    /**
     * ‼️ X-326 — IN-PLACE ACCOUNT OPTIONS SYNC.
     *
     * Pushes the latest in-memory account readings and rules to the webview
     * without triggering a full page rebuild (no M-33 repaint).
     */
    postAccounts(): void {
        if (!this.mounted) { return; }
        const chosenEngine = engineOf(this.chosenEngine()).id;
        const composerAccounts = this.deps.accountsFor?.(chosenEngine) ?? [];
        const composerPolicies = this.deps.policiesFor?.(chosenEngine) ?? [];
        const sessionAccounts = this.deps.host.list().map((s: { id: string; engine?: string }) => {
            const sEng = engineOf(s.engine).id;
            return {
                id: s.id,
                accountRows: this.deps.accountAxis?.(sEng) ? (this.deps.accountsFor?.(sEng) ?? []) : [],
                policyRows: this.deps.accountAxis?.(sEng) ? (this.deps.policiesFor?.(sEng) ?? []) : []
            };
        });
        void this.surface.webview.postMessage({
            type: 'accounts',
            composerAccounts,
            composerPolicies,
            sessionAccounts
        });
    }

    static postAccountsIfOpen(): void {
        ConsolePanel.current?.postAccounts();
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
        if (files.length) { void this.surface.webview.postMessage({ type: 'attached', files }); return; }
        // ‼️ A GESTURE THAT PRODUCES NOTHING MUST SAY SO. Every path here failed
        // `statSync` — dropped from an archive, from a remote/virtual folder, or
        // a name the drag carried without a file behind it. Returning quietly
        // leaves the user looking at an unchanged panel with no way to tell
        // "nothing was attached" from "attached, and the panel never shows it".
        if (paths.length) {
            void this.surface.ask.warn(
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
            void this.surface.ask.warn('Agent Farm: that dropped file could not be staged for sending.');
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
        if (await promptSnippetMessage(this.surface.webview, () => this.deps.promptSnippets(), msg.type)) {
            return;
        }
        // The wiki tagger does the same on every surface that draws a badge (K-26).
        if (wikiMarkMessage(this.surface.webview, msg)) { return; }
        // U-180 — the session sound panel, answered by the handler the Sound page uses.
        const sound = this.deps.sound?.();
        if (sound && await handleAlertMessage(msg, sound, soundSurface(this.surface.webview))) { return; }
        switch (msg.type) {
            case 'refresh': this.refresh(); break;
            case 'getAccounts': this.postAccounts(); break;
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
                void this.surface.webview.postMessage({
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
            /**
             * ‼️ X-152 — ONE DIMENSION OF THE NEXT SESSION, CHANGED. The page
             * names a field and a value; the record is narrowed here and pushed
             * back whole. This is the ONE message every composer control sends:
             * the engine (re-answering the three under it — moveEngine), the
             * model (its own default effort — preferModelDefault), the effort,
             * the permission mode, the discipline (X-133: null is the way back
             * to the agent's own default), the route and the tier under it
             * (X-105: moving the route clears the tier, and the engine's own
             * adapter prunes what it cannot serve), the sign-in (X-169: pruned
             * by the engine the same way), and the agent (S-49: the agent alone).
             */
            case 'setIntent':
                this.applyIntent(str('field'), msg.value);
                this.refresh();
                break;
            // "this composer is no longer about that agent" — the way out of a
            // pin, so a fixed agent is never a trap (see pinnedAgent).
            case 'unpinAgent':
                this.pinnedAgent = undefined;
                this.refresh();
                break;
            case 'start': {
                // ‼️ X-152 — THE PAGE SENDS CONTENT; THE SETUP IS THE RECORD.
                // Who the session is for and every dimension it starts with are
                // `composerAgent` and `composerIntent`, seeded by the door and
                // changed by `setIntent`; Send carries the text and the files.
                const agent = this.agentById(this.composerAgent);
                if (!agent) {
                    void this.surface.ask.warn('Agent Farm: pick an agent first.');
                    return;
                }
                const d = this.deps.launchDefaults();
                const i = this.composerIntent;
                // ‼️ THE ENGINE IS CHECKED HERE, NOT TRUSTED FROM THE PAGE. The
                // picker already disables what cannot run, but the page is a
                // webview: the refusal has to live on this side of the wall, and
                // it is the same sentence every other entry point uses
                // (engineRefusal). Starting on an absent CLI produces a session
                // that dies on its first turn with a shell error.
                const engine = this.chosenEngine().toLowerCase();
                const refused = engineRefusal(this.engineList(), engine);
                if (refused) {
                    void this.surface.ask.warn(`Agent Farm: ${refused}`);
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
                /**
                 * ‼️ …AND THE AGENT'S OWN SETTING IS THE LAYER UNDER THE BOX.
                 *
                 * An empty box means "the default, please" — and the default
                 * this agent has is the one on its chip in Farm Settings, not
                 * the fleet's. Reading only `launchDefaults()` here made the
                 * per-agent model and effort boxes on that page decorative for
                 * every session started from this composer. Order: the box →
                 * this agent on this engine → the fleet.
                 */
                const own = this.deps.agentEngineDefaults?.(agent.dir, engine) ?? {};
                const started: LaunchOptions = {
                    engine: engine as EngineId,
                    model: i.model || own.model || d.model,
                    effort: i.effort || own.effort || d.effort,
                    permissionMode: i.permissionMode || d.permissionMode,
                    // ‼️ X-133 — RESOLVED HERE NOW (X-152): the record's third
                    // answer, `undefined`, means "this agent's own default".
                    superpowers: i.superpowers ?? this.deps.superpowersDefault(agent.name),
                    // ‼️ X-103 — from the composer's carried value, NOT from the
                    // page: there is no route control on it yet (X-105), so a
                    // `str('providerId')` here would read an empty box and erase
                    // the very pick the launcher handed over.
                    ...(this.composerRoute ?? {}),
                    // ‼️ X-213 — from the SAME function the box was drawn from,
                    // so the answer that ran is the answer that was on screen.
                    // Always explicit where the engine has the axis at all,
                    // including "the machine's own" — which used to be the
                    // absence of a statement and therefore silently became the
                    // standing account (see accountShown).
                    ...(this.accountShown() ? { account: this.accountShown() } : {})
                };
                // ‼️ X-305 R2 — a rule in the box is turned into ONE slot here,
                // against the figures of this moment, and the card is started
                // on that slot. `started` keeps the rule, so the next composer
                // for this agent is seeded with the rule rather than the slot.
                const pick: { id: string; note: string; refusal?: string } = isPolicyId(started.account)
                    ? host.pickAccount(engine, started.account, agent.id, started.model)
                    : { id: started.account ?? '', note: '' };
                if (pick.refusal) {
                    void this.surface.ask.warn(`Agent Farm: ${pick.refusal}`);
                    return;
                }
                // ‼️ X-109 R2 — the manifest, written before the process starts and
                // on the SLOT that really runs, so a resume can pin this card.
                const launchId = this.deps.recordConsoleLaunch?.({
                    agentId: agent.id, agentName: agent.name, cwd: agent.dir,
                    options: { ...started, account: pick.id || undefined },
                    ...(this.composerProject ? { projectId: this.composerProject } : {})
                });
                this.selected = host.start({
                    agentId: agent.id, agentName: agent.name, cwd: agent.dir,
                    engine: engine as EngineId,
                    ...(launchId ? { launchId } : {}),
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
                    account: pick.id || undefined,
                    // ‼️ ALWAYS EXPLICIT, including the empty string. Leaving it
                    // out means "inherit the window's active project" one layer
                    // down (ConsoleHost.start), which is the inheritance the box
                    // above exists to replace.
                    projectId: this.composerProject,
                    superpowers: started.superpowers === true,
                    firstPrompt: str('text') || undefined,
                    firstAttachments: attachmentsOf(msg)
                });
                // S-82 — ⑂ Relay: sealed as leg 1 once the card's session is known;
                // the pool is the RULE in the Account box, never the slot it picked
                if (this.composerRelay.on) {
                    host.wantRelay(this.selected, { account: started.account, maxLegs: this.composerRelay.maxLegs });
                }
                this.composerRelay = { on: false };
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
                // ‼️ K-34 — one-shot. A prompt left standing would reapply itself
                // to the NEXT session, which nobody launched from it.
                this.composerPrompt = undefined;
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
                    const go = await this.surface.ask.warn(
                        `"${row.title}" is still running from an earlier window of Agent Farm (pid ${leftover.pid}) — nothing is reading it.`,
                        {
                            modal: true,
                            detail: 'Claude Code cannot join a running session, so this conversation cannot be picked up while that process holds it.\n\n'
                                + 'Agent Farm can end the leftover and continue here: the transcript stays on disk and everything that was said comes back with it. Only whatever it was doing this second is lost.'
                        },
                        'End it and continue here');
                    if (go !== 'End it and continue here') { return; }
                    if (!await this.deps.endLeftover(sessionId, leftover.pid)) {
                        void this.surface.ask.warn(
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
                    const choice = await this.surface.ask.warn(
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
                    // …and the same three-layer order as the composer: the box
                    // (X-152: the host's own record of it), then THIS agent's
                    // own Settings row, then the fleet.
                    const box = this.composerIntent;
                    const ownNew = agentForNew
                        ? this.deps.agentEngineDefaults?.(agentForNew.dir, engine) ?? {}
                        : {};
                    const fresh = narrowLaunch(this.engineModelsFor(engine),
                        box.model || ownNew.model || dn.model,
                        box.effort || ownNew.effort || dn.effort);
                    this.selected = host.start({
                        agentId: agentForNew?.id ?? '', agentName: row.agentName ?? 'session',
                        cwd: row.cwd, engine,
                        model: fresh.model,
                        effort: fresh.effort,
                        permissionMode: box.permissionMode || dn.permissionMode,
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
                // ‼️ S-102 — an ended card of its own brings it back the way that card's Resume does (its
                // recorded model, effort, mode and sign-in), the same on every door
                const card = host.list().find(x => x.sessionId === sessionId && (x.status === 'ended' || x.status === 'error'));
                if (card) { void vscode.commands.executeCommand('agentfarm.consoleResumeSession', { hostId: card.id }); break; }
                const agent = this.deps.getAgents().find(a => a.name === row.agentName);
                const d = this.deps.launchDefaults();
                // X-152 — the composer's boxes are the host's own record
                const box = this.composerIntent;
                // ‼️ X-30 / K-17 — the composer's boxes and the fleet defaults
                // are BOTH written without knowing which engine this row was
                // recorded with, so they are narrowed to what that engine (and
                // that model) actually offers before they become flags.
                // !! S-45 - THE SESSION'S OWN LAST SETTING COMES FIRST, and it has
                // to be first for the feature to exist at all: the composer's
                // boxes are seeded FROM `launchDefaults()`, so the record's model
                // is normally holding the fleet default rather than nothing,
                // and a transcript value placed after it could never win. The
                // order is therefore transcript -> box -> fleet default.
                //
                // The MODE is inherited on the same rule and is not trusted for
                // it: ConsoleHost resolves what actually reaches the command
                // line against the folder's own layers (K-22), so a bypass
                // carried back from a transcript can never grant more than
                // starting a fresh session in that folder would.
                // ‼️ S-109 — that order now lives in ONE place (reopenSetup), with
                // the card's durable record as its newest layer; the boxes ride
                // as the door's SOFT layer, under the session and over the agent.
                const reopened = this.deps.reopenSetup?.({
                    sessionId, engine, agentName: row.agentName,
                    soft: { model: box.model, effort: box.effort, permissionMode: box.permissionMode }
                });
                const back = reopened
                    ? { model: reopened.model, effort: reopened.effort }
                    : narrowLaunch(this.engineModelsFor(engine), box.model || d.model, box.effort || d.effort);
                // S-102 — its own launch's ask, for the one switch the transcript does not record
                const asked = this.deps.sessionRequested?.(sessionId, engine) ?? {};
                this.selected = host.start({
                    agentId: agent?.id ?? '', agentName: row.agentName ?? 'session',
                    cwd: row.cwd, resume: sessionId, engine,
                    model: back.model,
                    effort: back.effort,
                    // S-45 — the mode the transcript last stated (see above).
                    permissionMode: reopened?.permissionMode || box.permissionMode || d.permissionMode,
                    // ‼️ …and the project it comes back UNDER is its OWN. Left
                    // out, ConsoleHost.start falls back to the window's active
                    // project — which is not this session's answer and is
                    // normally none at all, so a resumed conversation lost the
                    // project it had been running under (K-11). Every other
                    // resume route already passes this; this one did not.
                    projectId: this.deps.sessionProject({
                        sessionId, agentId: agent?.id, agentName: row.agentName, cwd: row.cwd
                    }),
                    // ‼️ …AND THE SIGN-IN IT RAN ON, for the same reason
                    // the project above is here: a resurrection is only as honest
                    // as its dimensions, and this door stated none — so a
                    // conversation that had been running on a slot came back
                    // reading `Machine Global`. Only the launch manifest knows
                    // (the transcript cannot: every slot's `projects` folder is a
                    // junction onto one shared root), so a session with no
                    // manifest states nothing and takes the standing choice —
                    // which is the truth rather than a slot invented for it.
                    account: reopened ? reopened.account : this.deps.sessionAccount?.(sessionId),
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
                        : { superpowers: asked.superpowers ?? this.deps.superpowersDefault(row.agentName ?? '') }),
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
             * ‼️ K-38 / K-40 — the picker moved on a card, so the NEXT cold
             * page knows where THAT session was left.
             *
             * The page names the card (`id`, the Console's own); the session id
             * it is filed under is read from the host's registry here, not
             * trusted from the page. A card that has no session yet (a composer
             * that has not spawned) has nothing to file under, and the page's
             * own state carries it until the panel closes — as before.
             *
             * No refresh: nothing on screen changes, and a repaint here would
             * push the host's data back over the card the reader is filtering.
             * Anything that is not an array of strings is "everything" (null) —
             * the one other value the filter has.
             */
            case 'rememberKinds': {
                const k = msg.kinds;
                const sid = this.deps.host.list().find(s => s.id === String(msg.id || ''))?.sessionId;
                if (sid) { this.deps.rememberKinds?.(sid, Array.isArray(k) ? k.map(String) : null); }
                break;
            }
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
            case 'openProject':
                if (str('project')) { void vscode.commands.executeCommand('agentfarm.openProject', { id: str('project') }); }
                break;
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
                    void this.surface.ask.warn(
                        'Agent Farm: that session has ended — start a new one to keep talking.');
                } else if (r.refused) {
                    // The composer cleared itself the moment you pressed Send.
                    // A refusal therefore has to GIVE THE MESSAGE BACK — text
                    // and files — or the refusal costs you what you wrote.
                    void this.surface.ask.warn(`Agent Farm: ${r.refused}`);
                    void this.surface.webview.postMessage({
                        type: 'restore',
                        text: str('text'),
                        files: attachmentsOf(msg)
                    });
                }
                break;
            }
            case 'attachTooMany':
                void this.surface.ask.warn(
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
                    const picked = await this.surface.ask.open({
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
                void this.surface.ask.warn(
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
                        void this.surface.ask.warn(
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
            case 'interrupt': {
                // X-480 — the stop names where it came from: this page on the PC or on a phone, by Esc or by ⎋.
                const esc = str('how') === 'esc';
                host.interrupt(str('id'), this.surface.remote
                    ? (esc ? 'phone-esc' : 'phone-button')
                    : (esc ? 'console-esc' : 'console-button'));
                break;
            }
            case 'stopTask': {
                // S-62 — one background command, by the CLI's own task id
                const r = host.stopTask(str('id'), str('taskId'));
                if (!r.ok) { void this.surface.ask.warn(`Agent Farm: ${r.note}`); }
                break;
            }
            case 'setModel': {
                // mid-session model switch — the CLI's own `/model`
                const sid = str('id');
                if (!host.setModel(sid, str('model'))) {
                    void this.surface.ask.warn(
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
                    void this.surface.ask.warn(
                        'Agent Farm: that session cannot take an effort change right now.');
                }
                break;
            /**
             * ‼️ X-213 — MID-SESSION ACCOUNT SWITCH, which is the one live
             * control that cannot be a control request.
             *
             * The refusal is SHOWN rather than swallowed: this box, unlike the
             * others, has real reasons to say no (a session with no id yet, a
             * shared connection), and a picker that silently snaps back is the
             * failure Principle 1 is about.
             */
            case 'setLiveAccount': {
                const done = host.setAccount(str('id'), str('account'));
                if (!done.ok && done.note) {
                    void this.surface.ask.warn(`Agent Farm: ${done.note}`);
                }
                this.refresh();
                break;
            }
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
                    void this.surface.ask.info(
                        'Agent Farm: that question is no longer waiting for an answer.');
                }
                break;
            }
            // K-43 — Stop timer: this question waits for a person now.
            case 'askHold':
                host.holdAutoAnswer(str('id'));
                break;
            // K-45 — a pick or a keystroke on the card: kept for the timer, the clock runs on.
            case 'askPicks':
                host.noteAskPicks(str('id'), str('requestId'), msg.picks, str('response'));
                break;
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
                    if (got.reason) { void this.surface.ask.info(`Agent Farm: ${got.reason}`); }
                    break;
                }
                host.prependHistory(id, got.head, got.rows);
                this.refresh();
                break;
            }
            case 'close':
                host.close(str('id'));
                break;
            case 'forget': {
                // ‼️ S-55 — AND THE SHELF ROW GOES WITH THE CARD.
                // `rememberLastWindow` unions this window's own hosted
                // sessions into "where you left off", and drops a row from
                // that file only when it is resumed or dismissed — so
                // removing the card used to hand the same conversation
                // straight back one section up the column, which is the
                // whole of "the card does not go away". The id is read
                // BEFORE the removal, because afterwards there is nothing
                // left to read it off.
                const gone = host.get(str('id'))?.sessionId;
                host.forget(str('id'));
                if (gone) { this.deps.forgetLastWindow(gone); }
                break;
            }
            case 'openFile':
                void vscode.commands.executeCommand('agentfarm.openEditedFile',
                    { file: str('file'), diff: msg.diff === true });
                break;
            // Renaming a Console row goes through VS Code's own right-click menu
            // (`webview/context` → agentfarm.renameSession), which is why there
            // is no 'rename' message here: the row carries its identity in
            // `data-vscode-context` and the command does the rest.
            case 'continueFromHandover': {
                // ‼️ S-64 (5/n) — the card was told to hand over (or wrote the
                // note): the next run is a FRESH session, opened in the composer
                // with this card's whole setup and the host's first message.
                ConsolePanel.continueFromHandover(this.deps, str('id'));
                break;
            }
            case 'batonStopChain': {
                const chain = str('chainId');
                if (!chain) { break; }
                const n = this.deps.batonStopChain(chain);
                void this.surface.ask.info(n
                    ? `Agent Farm: baton chain ${chain} stopped — ${n} baton${n === 1 ? '' : 's'} recorded as stopped, no further leg opens.`
                    : `Agent Farm: nothing in baton chain ${chain} was still waiting — it had already ended.`);
                this.refresh();
                break;
            }
            // S-99 — ⑂⊣ Last leg: a toggle, pressed state drawn from the store on the refresh
            case 'batonLastLeg': {
                const s = host.get(str('id'));
                if (!s?.sessionId || !this.deps.batonLastLeg) { break; }
                const r = this.deps.batonLastLeg(s.sessionId, msg.on === true);
                void (r.ok ? this.surface.ask.info(`Agent Farm: ${r.sentence}`)
                    : this.surface.ask.warn(`Agent Farm: ${r.why}`));
                this.refresh();
                break;
            }
            // S-103 — a right-click on ⑂⊣: the chain's legs menu (baton.setLegs's body)
            case 'batonLegs': {
                if (!this.deps.batonLegs || !str('chainId')) { break; }
                await this.deps.batonLegs(str('chainId'));
                this.refresh();
                break;
            }
            // S-82 — ⑂ Attach relay: this card's run becomes leg 1, sealed at once (baton.attach's body)
            case 'batonAttach': {
                const s = host.get(str('id'));
                if (!s?.sessionId || !this.deps.batonAttach) { break; }
                const r = await this.deps.batonAttach(s.sessionId, str('account'), msg.maxHops);
                void (r.ok ? this.surface.ask.info(`Agent Farm: ${r.sentence}`)
                    : this.surface.ask.warn(`Agent Farm: ${r.why}`));
                this.refresh();
                break;
            }
            // …and ⑂ Pass now: the handover order said into the run, through console.send's own door
            case 'batonPassNow': {
                const s = host.get(str('id'));
                const text = s?.sessionId ? this.deps.batonPassNowText?.(s.sessionId) : undefined;
                if (!s || !text) { break; }
                const r = host.send(s.id, text);
                if (!r || r.refused) {
                    void this.surface.ask.warn(`Agent Farm: ${r?.refused || 'that session has ended — there is no run to pass from.'}`);
                }
                break;
            }
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
                void this.surface.ask.info(`Agent Farm: ${noTranscriptNote(engine)}`);
                break;
            }
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
            case 'afnav': handleAfNav(msg.to); break;
        }
    }

    private dispose(): void {
        if (ConsolePanel.current !== this) {
            this.disposables.forEach(d => d.dispose());
            this.surface.dispose();
            return;
        }
        ConsolePanel.current = undefined;
        // …and the bar goes back to the standing account in the same step, not
        // at the next minute's wake.
        ConsolePanel.announceWatch();
        // The sessions deliberately OUTLIVE the panel: closing a tab must not
        // kill a conversation. They end with the window, or when you close them.
        this.disposables.forEach(d => d.dispose());
        this.surface.dispose();
    }
}
