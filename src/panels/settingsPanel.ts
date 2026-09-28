import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    buildSettingsModel, sanitizeValue, snapshotProfile, profileApplyPlan,
    parseImportedProfiles, pathPreviews, SettingsProfile, SettingsCategory
} from '../core/settingsops';
import { PreviewedPath } from '../core/pathVars';
import { FlexDeps, flexSettingsState } from '../core/flexActions';
import { flexCardMessage } from './settingsFlex';
import {
    CC_CATALOG, buildClaudeModel, coerceClaudeValue, patchClaudeSettings,
    validateRawClaudeSettings
} from '../core/claudesettings';
import { PromptSnippetsSnapshot } from '../core/prompts';
import { EngineId, ENGINE_IDS, EngineStatus } from '../core/engines';
import {
    AgentEngineDefaults, resolveDefault, storedAccount, storedDefault, withAgentDefault
} from '../core/agentDefaults';
import { accountResolution } from '../core/accountStore';
import { EngineModels } from '../core/models';
import { normPath } from '../core/util';
import { revealPath } from '../core/reveal';
import { WikiHealth } from '../core/wiki';
import { SuperpowersHealth } from '../core/superpowers';
import {
    handleAfNav, htmlShell, TelegramBridgeHost, telegramCardData, telegramCardMessage
} from './base';

/** Webview-ready snapshot of one agent root for the Agent folders section. */
export interface AgentFolderReport {
    root: string;
    kind: 'nest' | 'single-agent' | 'plain' | 'missing';
    duplicate: boolean;
    /** model = the folder's effective default model (settings.local.json,
     *  falling back to settings.json); '' when none is set. */
    candidates: { dir: string; name: string; excluded: boolean; agentId: string; model: string }[];
}

export interface FarmSettingsDeps {
    extensionUri: vscode.Uri;
    /** U-152 — the flex points and presets card; the same deps the flex.* / presets.* ops use */
    flex?: FlexDeps;
    /** the agentFarm.* schema straight from package.json — the page renders it.
     *  `x-af-browse` is how a setting declares itself a path and earns a
     *  Browse… button (see SettingSpec.browse for why not `format`). */
    schema(): Record<string, {
        type?: unknown; enum?: unknown; default?: unknown;
        description?: string; markdownDescription?: string; 'x-af-browse'?: unknown;
    }>;
    /**
     * ‼️ X-193 — THE PATH VARIABLES, AND WHAT EACH IS ON THIS MACHINE.
     *
     * The dictionary lives in `core/pathVars.ts` and is exported so this page
     * DRAWS it rather than repeating it — a variable added there turns up here
     * without the page being touched. The value is sent with the name because
     * of MIRROR: the reader's question about `${vault}` is what it is, not what
     * it means, and a legend of definitions answers the question nobody asked.
     * A variable with nothing behind it says so; that is the honest half.
     */
    pathVarValues?(): { name: string; describe: string; value: string }[];
    /**
     * Resolve a whole path setting's entries at once (X-193). One call per
     * setting, not one per row — see `pathPreviews` in core/settingsops.ts.
     */
    previewPaths?(templates: string[]): PreviewedPath[];
    getProfiles(): SettingsProfile[];
    setProfiles(list: SettingsProfile[]): Thenable<void>;
    /** Claude Code's own ~/.claude/settings.json (honors agentFarm.claudeDir). */
    claudeSettingsFile(): string;
    /** Live root scan + excludes for the Agent folders section. */
    agentFolders?(): { reports: AgentFolderReport[]; excludes: string[] };
    /** Report/answer .md "open with" default + custom external app (Notepad etc.). */
    docOpen?(): { defaultMode: string; customCommand: string; customArgs: string; modes: string[] };
    setDocOpen?(patch: { defaultMode?: string; customCommand?: string; customArgs?: string }): void;
    /**
     * Saved prompts: which file the feature resolves to right now, and what was
     * read out of it.
     *
     * ‼️ THE SECTION SHOWS THE PARSED RESULT, NOT JUST THE PATH, and that is the
     * whole reason it exists rather than a text box under "Display & Labels".
     * A path in a box tells you nothing about whether the feature works — the
     * previous shape of this setting was blank for a week and looked merely
     * unconfigured. Reading the file here means the page answers "is it
     * working?" with the blocks themselves.
     */
    promptSnippets?(): PromptSnippetsSnapshot;
    /** Write the chosen path — '' hands the feature back to the built-in one. */
    setPromptSnippetsFile?(file: string): Thenable<void>;
    /**
     * X-3 — the engine matrix: which agent CLI is installed, how it is paid for
     * (a plan sign-in or a key), and the one thing to do next. See
     * core/engines.ts for why this is not simply "the API keys".
     */
    engines?(): EngineStatus[];
    /**
     * X-255 — THE SIGN-INS THIS MACHINE HOLDS, plus the machine-wide standing
     * choice, so an agent's row can draw the account it stands on.
     *
     * ‼️ THE MACHINE-WIDE MAP TRAVELS WITH THE SLOTS BECAUSE THE BOX'S ZERO ROW
     * NEEDS IT. "Default" on this box means "clear my choice", and what applies
     * after the clearing is the Engines page's standing choice — a zero row that
     * could not name it would be the U-29 mystery again, one axis over.
     */
    accountChoices?(): {
        slots: { id: string; engine: string; label: string }[];
        /** `agentFarm.activeAccounts` — engine id → slot id. */
        standing: Record<string, string>;
    };
    /**
     * Write one of the engine's own commands into a real terminal — the install
     * or the sign-in — WITHOUT running it. One gesture for both, because it is
     * one act: the user reads the line and presses Enter. Agent Farm never sees
     * a grant; the browser and the CLI settle that between them.
     */
    engineCommand?(command: string): void;
    /** Hand the key route to the vault's own form, on that exact name. */
    engineKey?(name: string): void;
    /** Open the Engines panel — the page this section is the summary of (X-14). */
    openEngines?(): void;
    /** X-237 — open the Accounts page, the Engines page's accounts section on its own. */
    openAccounts?(): void;
    /** U-155 — Kapıcı's status (the key present or not, never its value; rules; shadow agreement) and the vault it points to */
    kapici?(): unknown;
    /** B-28 — give every Claude Code session the kapici_* MCP tools (true), or take them back */
    kapiciMcp?(on: boolean): void;
    openSecrets?(): void;
    /** U-29 — what each engine currently offers, so the per-agent model box
     *  is drawn from the engine's own catalog rather than a typed list. */
    engineModels?(): Record<string, EngineModels>;
    /**
     * ‼️ X-57 — THE WIKI ROOT, READ RATHER THAN MERELY PRINTED.
     *
     * Same lesson as `promptSnippets` above, and it cost the same week: a path
     * in a box is a string, and the question a person has is "does a compile
     * work from here?". So the section is handed what is actually ON DISK at
     * the resolved path — which of the three files a compile needs are there,
     * how many categories, and whether the folder is compilable at all — and
     * the button that fixes it stands next to the answer.
     */
    wikiHealth?(): WikiHealth;
    /** Create the root and whatever starter file is missing. Creates only:
     *  an existing law is the user's own and is never rewritten. */
    wikiInit?(): { ok: boolean; created?: string[]; existed?: string[]; error?: string };
    /** Open the cockpit over the candidate pool — the page this section
     *  configures, so the reader can go and use what they just set up. */
    openWiki?(): void;
    /**
     * ‼️ X-136 — THE DISCIPLINE, READ RATHER THAN TYPED.
     *
     * Same lesson as the wiki root one section up. `superpowersDefaults` is a
     * `Record<string, boolean>` keyed by an agent's NAME: a JSON box cannot say
     * which names exist, so a misspelling is a switch that silently never
     * fires. And the folder has one file that decides everything — without
     * `using-superpowers/SKILL.md` a switched-on session is given nothing at
     * all, which reads as the feature working. So the section is handed the
     * health of the resolved folder AND every discovered agent with its
     * resolved answer, and the box is only the escape hatch.
     */
    superpowers?(): SuperpowersPage | null;
    /** Write one agent's default back. The host owns the write because the
     *  normalisation (onto the row already there) is shared with the bridge. */
    superpowersSet?(agent: string, on: boolean): Promise<void>;
    /**
     * ‼️ A-21 — THE ALERT SOUNDS, RESOLVED RATHER THAN PRINTED.
     *
     * Third time for the lesson the wiki root and the Superpowers folder each
     * cost a week: `agentFarm.alerts.voices` is an object that is EMPTY out of
     * the box, so the two JSON boxes this card replaces showed `{}` for a
     * feature that already plays five different sounds. What a person wants
     * from this page is "which sound will I hear, and why that one" — which
     * only the resolution chain can answer, so the host hands the answer over
     * and the boxes are gone rather than merely decorated.
     */
    alerts?(): AlertsPage | null;
    /** Every write and every ▶ goes back to the host, because each one is the
     *  same act as an `alerts.*` bridge op and they share the function. */
    alertsSetOn?(event: string, on: boolean): Promise<void>;
    alertsSetVoice?(event: string, voice: string): Promise<void>;
    /** A-22 — the gate. The same two functions the status bar and the
     *  `alerts.mute` / `alerts.quiet` ops go through. */
    alertsSetMuted?(on: boolean): Promise<void>;
    alertsSetQuiet?(patch: { on?: boolean; from?: string; to?: string }): Promise<void>;
    /** U-123 — the nudge's three fields, through the same host function
     *  `alerts.nudge` uses. Only what changed is sent; the rest keeps its value. */
    alertsSetNudge?(patch: { minutes?: number; repeat?: number; voice?: string }): Promise<void>;
    /** Unmute ONE session from the card that listed it as muted — the row says
     *  which conversation is quiet, so it has to be able to undo it. */
    alertsUnmuteSession?(sessionId: string): Promise<void>;
    /** Play one voice by id — "what does this one sound like". Named after the
     *  host function it is wired to, so the parity gate can SEE that the ▶ and
     *  `alerts.play` are the same act rather than two implementations. */
    alertsPlayVoice?(voice: string): Promise<void>;
    /** Add / rename / drop one of the user's own sounds. `add` opens the file
     *  picker itself: the host owns the dialog, the page owns the gesture. */
    alertsVoiceAdd?(): Promise<void>;
    alertsVoiceRename?(id: string, label: string): Promise<void>;
    alertsVoiceRemove?(id: string): Promise<void>;
    /** Open (creating if need be) the folder the card suggests sounds go in. */
    alertsOpenFolder?(): Promise<void>;
    /**
     * ‼️ A-25 — THE ANNOUNCEMENT'S OWN CONTROLS, through the same host
     * functions `alerts.speak` uses. `agentFarm.alerts.speak` is a seven-field
     * object and was a raw JSON box: one of those fields is a voice NAME that
     * has to exist on THIS machine, and a box cannot know whether it does.
     */
    alertsSetSpeak?(patch: Record<string, unknown>): Promise<void>;
    alertsSetSpeakEvent?(event: string, on: boolean): Promise<void>;
    /** Speak something RIGHT NOW, gate and queue bypassed — "does this machine
     *  talk at all" is not the same question as "is the feature on". */
    alertsSpeakTest?(text?: string): Promise<void>;
    /** Ask the machine which voices it has. Costs a shell, so the page asks
     *  once and the host keeps the answer; `force` is the reader who has just
     *  installed a language pack and wants it in the list now. */
    alertsLoadSpeechVoices?(force?: boolean): Promise<void>;
    /** Clear ONE conversation's own announcement voice, from the strip that
     *  listed it — the same act as `alerts.speak { sessionId, voice: '' }`. */
    alertsClearSessionSpeech?(sessionId: string): Promise<void>;
    /**
     * ‼️ U-84 — THE TELEGRAM BRIDGE, WHICH FOUR SETTINGS ROWS CANNOT REPORT ON.
     *
     * Reaching the farm from a phone is configured here — the switch, the
     * allowlist, the ceiling and the default agent are all `access` category
     * rows. What none of them can say is whether the thing WORKS: the token is
     * in the secret vault, the day's spend is in `globalState`, and whether the
     * poller is alive is a fact about a running process. A page made of settings
     * rows is exactly where somebody goes to find out why their phone gets no
     * answer, so the host hands over the same card the Toolbox draws.
     */
    telegram?: TelegramBridgeHost;
    /** ‼️ U-84 (d) — the agent names a `x-af-values: "agent"` setting offers.
     *  Read live: an agent added since the window opened is in the picker on the
     *  next draw, and a name typed from memory into a text box is not. */
    agentNames?(): string[];
}

/** One event's row on the Alert sounds card: what is armed, what was chosen,
 *  and what would ACTUALLY play — the three are not the same thing. */
export interface AlertEventRow {
    event: string;
    on: boolean;
    /** what the user picked for everybody; '' when nobody has picked */
    chosen: string;
    /** the built-in answer behind that blank */
    fallback: string;
    voice: string;
    origin: string;
    file: string;
    playable: boolean;
    skipped: { origin: string; voice: string; why: string }[];
}

/** A-22 — who is holding the gate shut, drawn on the same card that says which
 *  tone would play. The two questions are asked together and answering only the
 *  second is how "I set it up and heard nothing" happens. */
export interface AlertsGate {
    muted: boolean;
    quiet: {
        configured: boolean; inside: boolean; from: string; to: string;
        nextChangeAt: number; inMinutes: number; error?: string; line: string;
    };
    silence: { silent: boolean; reason?: string; reasons: string[]; detail?: string };
    mutedSessions: { sessionId: string; label: string }[];
    /** U-123 — the second tap on the shoulder. `on` is the resolved answer
     *  (either number at zero switches it off), `armed` is how many questions
     *  are waiting for one right now — the figure that makes a policy visible. */
    nudge: {
        minutes: number; repeat: number; voice: string;
        on: boolean; armed: number;
        defaults: { minutes: number; repeat: number; voice: string };
    };
}

/**
 * A-25 — the announcement, resolved rather than printed. `voice` is a loose
 * fragment (`Tolga` finds `Microsoft Tolga - Turkish (Turkey)`), so the setting
 * alone does not say what will be heard; `resolved` is what it actually reaches
 * on this machine and empty means NOTHING does — which fails the announcement
 * rather than reading it out in the wrong language.
 */
export interface AlertsSpeak {
    on: boolean;
    events: string[];
    template: string;
    rate: number;
    volume: number;
    voice: string;
    defaults: { on: boolean; events: string[]; template: string; rate: number; volume: number; voice: string };
    max: number;
    preview: string;
    voices: { id: string; name: string; culture: string; engine: string; label: string }[];
    /** ‼️ false is "not asked yet", NOT "this machine has no voices". */
    voicesLoaded: boolean;
    voicesError: string;
    voicesNote: string;
    resolved: string;
    /** the matched voice's full name — what the picker's option is keyed on,
     *  because `Tolga` is a legal setting and no option is called that */
    resolvedName: string;
    sessions: { sessionId: string; label: string; voice: string }[];
}

export interface AlertsPage {
    gate: AlertsGate;
    speak: AlertsSpeak;
    folder: string;
    limit: number;
    /** extensions any player on THIS machine can open */
    formats: string[];
    /** the events a Timeline row's own ♪ can arm without this page */
    sessionEvents: string[];
    voices: {
        id: string; label: string; file: string; builtin: boolean;
        exists: boolean; playable: boolean; backend: string | null;
    }[];
    events: AlertEventRow[];
}

/** What the Superpowers section draws: the folder's own health, plus who
 *  starts with the switch on and whether anybody said so explicitly. */
export interface SuperpowersPage extends SuperpowersHealth {
    /** The setting as it stands — the escape hatch's current contents. */
    defaults: Record<string, boolean>;
    /** The built-in list an agent nobody named falls back to. */
    defaultAgents: string[];
    /** Every discovered agent, with the answer it would actually get. */
    agents: { id: string; name: string; on: boolean; explicit: boolean }[];
}

const CONFIG_SECTION = 'agentFarm';

/** Rich settings page: every agentFarm.* setting with live editing, defaults,
 *  search, and named setting-sets (save / apply / export / import). */
export class FarmSettingsPanel {
    private static current: FarmSettingsPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    /** Which engine the per-agent default boxes are editing. Page state, so
     *  it lives here rather than in a setting: it is a view, not a preference,
     *  and it has to survive the refresh that follows every write. */
    private defaultsEngine: EngineId = 'claude';

    static show(deps: FarmSettingsDeps, focus?: string): void {
        if (FarmSettingsPanel.current) {
            FarmSettingsPanel.current.panel.reveal();
            if (focus) { void FarmSettingsPanel.current.panel.webview.postMessage({ type: 'focus', key: focus }); }
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.settings',
            'Agent Farm — Settings',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        FarmSettingsPanel.current = new FarmSettingsPanel(panel, deps, focus);
    }

    /** Redraw if the page is up — used when something OUTSIDE the settings
     *  system changes what this page offers, e.g. an engine's model catalog
     *  answering after the page was drawn (U-31). */
    static refreshIfOpen(): void { FarmSettingsPanel.current?.refresh(); }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: FarmSettingsDeps, focus?: string) {
        this.panel.webview.html = htmlShell(
            this.panel.webview,
            this.deps.extensionUri,
            'Farm Settings',
            { ...this.buildData(), focus: focus ?? '' },
            'settings.js'
        );
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
        // external edits (settings.json, other panels) refresh the page live
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(CONFIG_SECTION)) { this.refresh(); }
        }, null, this.disposables);
    }

    /**
     * ‼️ U-29/U-33 — EVERY AGENT'S DEFAULTS, PER ENGINE, WITH WHAT "Default"
     * RESOLVES TO ALREADY WORKED OUT.
     *
     * The webview must not do this: the resolution walks three layers (the
     * agent's own Claude settings file, Agent Farm's per-engine store, the
     * fleet-wide launchDefaults) and only the host can read two of them. It is
     * computed here, once per draw, by the pure module that also decides what
     * the launcher does — so the sentence the box prints and the value the
     * session gets can never disagree.
     */
    private foldersWithDefaults(): unknown {
        const rep = this.deps.agentFolders?.();
        if (!rep) { return null; }
        const store = vscode.workspace.getConfiguration()
            .get<AgentEngineDefaults>('agentFarm.agentEngineDefaults', {}) ?? {};
        const launch = vscode.workspace.getConfiguration()
            .get<{ model?: string; effort?: string }>('agentFarm.launchDefaults', {}) ?? {};
        const engines = (this.deps.engines?.() ?? []).map(e => ({ id: e.id, label: e.label }));
        // The live matrix when there is one; otherwise every engine there IS
        // (U-59). The fallback used to be a hand-typed list — complete on the
        // day it was written and silently short of OpenCode ever after, which is
        // a per-agent default box the user simply never got offered.
        const ids: EngineId[] = engines.length
            ? engines.map(e => e.id as EngineId)
            : ENGINE_IDS;
        const choices = this.deps.accountChoices?.() ?? { slots: [], standing: {} };
        const slots = choices.slots;
        const standing = choices.standing;
        const slotName = (id: string): string => slots.find(s => s.id === id)?.label || id;
        return {
            ...rep,
            reports: rep.reports.map(r => ({
                ...r,
                candidates: r.candidates.map(c => {
                    const per: Record<string, unknown> = {};
                    for (const id of ids) {
                        const label = engines.find(e => e.id === id)?.label ?? id;
                        const own = storedDefault(store, c.dir, id);
                        const mine = storedAccount(store, c.dir, id);
                        const agentFile = id === 'claude' ? this.agentFileModel(c.dir) : '';
                        per[id] = {
                            model: id === 'claude' ? (agentFile || own.model || '') : (own.model || ''),
                            effort: own.effort || '',
                            resolved: resolveDefault(id, 'model', {
                                agentFile, farm: own.model, launch: launch.model, engineLabel: label
                            }),
                            resolvedEffort: resolveDefault(id, 'effort', {
                                farm: own.effort, launch: launch.effort, engineLabel: label
                            }),
                            /**
                             * ‼️ WHAT THE **Default** ROW REALLY MEANS — the same
                             * resolver with THIS AGENT'S OWN LAYERS LEFT OUT.
                             *
                             * The two above walk every layer including the value
                             * the box itself holds, which is right for the box's
                             * hover ("what applies now") and wrong for its zero
                             * row: that row means "clear my choice", so the value
                             * beside it has to be what would apply AFTER the
                             * clearing. Measured on the `engines` fixture before
                             * this existed: an agent set to `sonnet` drew
                             * `model → sonnet` on the row that removes `sonnet`.
                             *
                             * The agent file goes out with the farm value because
                             * it is this agent's answer too — on Claude it is the
                             * very file this page writes.
                             */
                            resolvedZero: resolveDefault(id, 'model', {
                                launch: launch.model, engineLabel: label
                            }),
                            resolvedEffortZero: resolveDefault(id, 'effort', {
                                launch: launch.effort, engineLabel: label
                            }),
                            /**
                             * ‼️ X-255 — AND WHICH SIGN-IN THIS AGENT STANDS ON.
                             *
                             * Resolved by `accountStore.accountResolution` — the
                             * one order the spawn itself uses — rather than by a
                             * second rule here, so the sentence this box prints
                             * and the plan the session really spends cannot part
                             * company. The zero row leaves this agent's own
                             * answer out for the same reason the model's does:
                             * it means "clear my choice", so it has to name what
                             * would apply AFTER the clearing.
                             */
                            account: mine,
                            resolvedAccount: accountResolution(
                                '', id, standing, mine, slotName),
                            resolvedAccountZero: accountResolution(
                                '', id, standing, '', slotName),
                            accounts: slots.filter(s => s.engine === id)
                                .map(s => ({ id: s.id, label: s.label }))
                        };
                    }
                    return { ...c, engines: per };
                })
            }))
        };
    }

    /**
     * One agent's default for one NON-Claude engine.
     *
     * ‼️ THIS IS A SETTING AND NOT A FILE, AND THE DIFFERENCE IS STATED RATHER
     * THAN HIDDEN: Codex, Gemini and Antigravity have no per-folder settings
     * file, so there is nowhere on disk that a session started outside Agent
     * Farm would read. Agent Farm keeps the value and passes it as a flag when
     * IT starts the session — which is what the box's own hover says.
     */
    private async writeFarmDefault(
        dir: string, engine: unknown, patch: { model?: string; effort?: string; account?: string }
    ): Promise<void> {
        const id = String(engine ?? '').trim().toLowerCase();
        const ids = (this.deps.engines?.() ?? []).map(e => String(e.id));
        if (!id || (ids.length && !ids.includes(id))) { return; }
        const cfg = vscode.workspace.getConfiguration();
        const store = cfg.get<AgentEngineDefaults>('agentFarm.agentEngineDefaults', {}) ?? {};
        await cfg.update('agentFarm.agentEngineDefaults',
            withAgentDefault(store, dir, id as EngineId, patch),
            vscode.ConfigurationTarget.Global);
    }

    /** What `<agent>/.claude/settings.local.json` says — Claude's own layer,
     *  and the only one that works for a session started in a terminal. */
    private agentFileModel(dir: string): string {
        for (const name of ['settings.local.json', 'settings.json']) {
            try {
                const raw = fs.readFileSync(path.join(dir, '.claude', name), 'utf8');
                const v = validateRawClaudeSettings(raw);
                if (v.ok && typeof v.json.model === 'string') { return v.json.model.trim(); }
            } catch { /* not there, or not ours to read */ }
        }
        return '';
    }

    private categories(): SettingsCategory[] {
        const cfg = vscode.workspace.getConfiguration();
        return buildSettingsModel(this.deps.schema(), key => cfg.get(key));
    }

    /** Read Claude Code's settings.json — missing file is a valid empty state. */
    private readClaude(): { json: Record<string, unknown>; raw: string; parseError: string } {
        const file = this.deps.claudeSettingsFile();
        let raw = '';
        try { raw = fs.readFileSync(file, 'utf8'); } catch { /* not created yet */ }
        if (!raw.trim()) { return { json: {}, raw: '{}', parseError: '' }; }
        const v = validateRawClaudeSettings(raw);
        return v.ok
            ? { json: v.json, raw, parseError: '' }
            : { json: {}, raw, parseError: v.error };
    }

    /** Write it back — pretty JSON, with a one-time .agentfarm-backup of the
     *  original next to it (live product: an edit must always be undoable). */
    private writeClaude(json: Record<string, unknown>): string {
        const file = this.deps.claudeSettingsFile();
        try {
            const backup = file + '.agentfarm-backup';
            if (fs.existsSync(file) && !fs.existsSync(backup)) {
                fs.copyFileSync(file, backup);
            }
            fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
            return '';
        } catch (e) {
            return String((e as Error).message).slice(0, 200);
        }
    }

    private buildData(): Record<string, unknown> {
        const cc = this.readClaude();
        // Built once: the path previews are derived from these same items, and
        // rebuilding the model to ask it a second question would be two answers
        // to one draw.
        const cats = this.categories();
        return {
            // the user's model-name knowledge base — feeds every model picker
            modelAliases: vscode.workspace.getConfiguration()
                .get<string[]>('agentFarm.modelAliases', ['haiku', 'sonnet', 'opus', 'fable']),
            // ‼️ U-29 — WHAT EACH ENGINE ACTUALLY OFFERS. The per-agent model box
            // used to draw the alias list whatever engine it was for, which is
            // the same expiry-dated constant core/models.ts exists to end.
            engineModels: this.deps.engineModels?.() ?? null,
            // …and which engine the boxes are currently editing (page state,
            // held on the host so it survives the refresh after every write).
            agentDefaultsEngine: this.defaultsEngine,
            folders: this.foldersWithDefaults(),
            categories: cats,
            // ‼️ X-193 — read on every draw, like the folders above: `${today}`
            // changes at midnight under an open page, and a vault the user just
            // configured is exactly the change they came back here to confirm.
            pathVars: this.deps.pathVarValues?.() ?? null,
            pathPreview: this.deps.previewPaths
                ? pathPreviews(cats, this.deps.previewPaths.bind(this.deps)) : null,
            profiles: this.deps.getProfiles().map(p => ({
                name: p.name, savedAt: p.savedAt, count: Object.keys(p.values).length
            })),
            claude: {
                file: this.deps.claudeSettingsFile(),
                items: buildClaudeModel(cc.json),
                raw: cc.raw,
                parseError: cc.parseError
            },
            docOpen: this.deps.docOpen?.() ?? null,
            prompts: this.deps.promptSnippets?.() ?? null,
            // X-57 — read on every draw, like the engines below: the folder is
            // one somebody edits in Obsidian while this page is open, and a
            // cached "index.md is missing" would be a lie thirty seconds later.
            wiki: this.deps.wikiHealth?.() ?? null,
            // X-136 — read on every draw for the wiki's reason above: the
            // skills folder is one somebody edits by hand, and an agent added
            // to a root five minutes ago belongs in the matrix.
            superpowers: this.deps.superpowers?.() ?? null,
            // A-21 — read on every draw for the two folders' reason above: a
            // sound file the user moved or deleted in Explorer is exactly the
            // change this card exists to make visible, and a cached "playable"
            // would be a lie the next time the alert fires.
            alerts: this.deps.alerts?.() ?? null,
            // X-3 — which agent CLIs this machine can run and how each is paid
            // for. Read on every build rather than cached: a sign-in that
            // happened in the terminal thirty seconds ago is exactly the change
            // somebody comes back to this page to confirm.
            engines: this.deps.engines?.() ?? null,
            kapici: this.deps.kapici?.() ?? null,
            // U-84 — read on every draw for the same reason the four above are:
            // a token connected in another window, a poll that has just failed
            // and today's spend are all facts that change under an open page.
            // Composed by `telegramCardData`, so this page and the Toolbox draw
            // one card rather than two that agree until one of them is touched.
            telegram: telegramCardData(this.deps.telegram) ?? null,
            // ‼️ U-84 (d) — the live values a picker setting offers, keyed by the
            // source its schema names (`x-af-values`). A hand-written list of
            // keys on the page would go stale the first time a setting is added;
            // a source declared in the manifest travels with the setting.
            valueSources: { agent: this.deps.agentNames?.() ?? [] },
            // U-152 — derived from the flex registry on every draw: a new point gains its row here.
            flex: this.deps.flex ? flexSettingsState(this.deps.flex) : null
        };
    }

    private refresh(): void {
        void this.panel.webview.postMessage({ type: 'data', data: this.buildData() });
    }

    /** ‼️ A-21 — A REFUSED SOUND IS SHOWN, NOT SWALLOWED. Every rule the host
     *  enforces (a built-in id, the limit of ten, a format no player here
     *  opens) comes back as a sentence the user can act on; silence would be
     *  indistinguishable from the alert simply being off. */
    private alertError(error: string): void {
        void this.panel.webview.postMessage({
            type: 'error', key: 'agentFarm.alerts.voices', error: error.slice(0, 300)
        });
    }

    /** Run one of the card's gestures and redraw — the row's resolved sound
     *  changes with every write, so the card is never left showing the state
     *  before the click. */
    private async alertAct(run: () => Promise<void> | undefined): Promise<void> {
        try { await run(); this.refresh(); }
        catch (e) { this.alertError(String((e as Error).message)); }
    }

    private async setValue(key: string, value: unknown): Promise<string> {
        const spec = this.deps.schema()[key];
        if (!spec) { return 'unknown setting'; }
        if (value === undefined) { // reset to default
            await vscode.workspace.getConfiguration().update(key, undefined, vscode.ConfigurationTarget.Global);
            return '';
        }
        const s = sanitizeValue(
            { type: Array.isArray(spec.type) ? String(spec.type[0]) : String(spec.type ?? 'string'), enum: Array.isArray(spec.enum) ? spec.enum.map(String) : undefined },
            value);
        if (!s.ok) { return s.error; }
        await vscode.workspace.getConfiguration().update(key, s.value, vscode.ConfigurationTarget.Global);
        return '';
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
        // U-84 — the bridge card's own messages, handled by the module the
        // Toolbox handles them with. One card, one set of rules, two pages.
        if (await telegramCardMessage(msg, {
            ...(this.deps.telegram ? { host: this.deps.telegram } : {}),
            webview: this.panel.webview,
            warn: t => void vscode.window.showWarningMessage('Agent Farm: ' + t),
            refresh: () => this.refresh()
        })) { return; }
        // U-152 — a written value refreshes through onDidChangeConfiguration, like `set`.
        if (this.deps.flex && await flexCardMessage(msg, this.deps.flex, error =>
            void this.panel.webview.postMessage({ type: 'error', key: 'flex', error: error.slice(0, 300) }))) { return; }
        switch (msg.type) {
            case 'set': {
                const key = String(msg.key ?? '');
                const error = await this.setValue(key, msg.value);
                if (error) {
                    void this.panel.webview.postMessage({ type: 'error', key, error });
                }
                // success refreshes via onDidChangeConfiguration
                break;
            }
            case 'reset':
                await this.setValue(String(msg.key ?? ''), undefined);
                break;
            /**
             * Browse… on a path setting (schema `format: file-path` /
             * `folder-path`). The dialog opens where the setting already points
             * — picking a new prompts file means going back to the folder the
             * old one was in, and starting at the last-used directory instead
             * would cost that walk every time.
             */
            /**
             * ‼️ U-108 — THE SAME DIALOG FOR ONE ROW OF A LIST, and the
             * answer goes BACK TO THE PAGE instead of into the setting.
             *
             * `browse` above writes what was picked straight through, because
             * on a scalar path setting the picked path IS the whole value. A
             * row is not: the list around it is still being edited, and
             * saving here would commit every other row at the same moment —
             * including the ones the user was in the middle of removing.
             *
             * The dialog opens where THAT ROW already points, so replacing
             * one root does not start the walk from the top again.
             */
            case 'browseRow': {
                const key = String(msg.key ?? '');
                const index = Number(msg.index);
                const folders = String(msg.kind ?? 'folder') === 'folder';
                const current = (() => {
                    const v = vscode.workspace.getConfiguration().get(key);
                    const row = Array.isArray(v) ? v[index] : undefined;
                    return String(row ?? '').trim();
                })();
                const picked = await vscode.window.showOpenDialog({
                    canSelectFolders: folders, canSelectFiles: !folders, canSelectMany: false,
                    openLabel: folders ? 'Use this folder' : 'Use this file',
                    ...(current ? { defaultUri: vscode.Uri.file(current) } : {})
                });
                const file = picked?.[0]?.fsPath;
                if (!file) { break; }
                void this.panel.webview.postMessage({
                    type: 'browsedRow', key, index, path: file
                });
                break;
            }
            case 'browse': {
                const key = String(msg.key ?? '');
                const folders = String(msg.kind ?? 'file') === 'folder';
                const current = String(vscode.workspace.getConfiguration().get(key) ?? '').trim();
                const picked = await vscode.window.showOpenDialog({
                    canSelectFolders: folders, canSelectFiles: !folders, canSelectMany: false,
                    openLabel: folders ? 'Use this folder' : 'Use this file',
                    ...(current ? { defaultUri: vscode.Uri.file(current) } : {})
                });
                const file = picked?.[0]?.fsPath;
                if (!file) { break; }
                const error = await this.setValue(key, file);
                if (error) { void this.panel.webview.postMessage({ type: 'error', key, error }); }
                break;
            }
            /**
             * Saved prompts — the same three gestures the Console picker has,
             * so the two doors behave alike (that promise is in consolePanel's
             * `pickPromptSnippets` comment, and this is the other half of it).
             *
             * `promptsUseDefault` REMOVES the key rather than writing '': an
             * explicit empty string is a value, and a value outranks the
             * built-in path for good. Removing it is the only thing that
             * actually means "I have chosen nothing".
             */
            case 'promptsPick': {
                const current = this.deps.promptSnippets?.().file ?? '';
                const picked = await vscode.window.showOpenDialog({
                    canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
                    openLabel: 'Use this file',
                    filters: { 'Markdown / text': ['md', 'markdown', 'txt'], 'All files': ['*'] },
                    ...(current ? { defaultUri: vscode.Uri.file(current) } : {})
                });
                const file = picked?.[0]?.fsPath;
                if (file) { await this.deps.setPromptSnippetsFile?.(file); }
                this.refresh();
                break;
            }
            case 'promptsUseDefault':
                await this.deps.setPromptSnippetsFile?.('');
                this.refresh();
                break;
            case 'promptsOpen': {
                const file = this.deps.promptSnippets?.().file ?? '';
                if (file) { void vscode.window.showTextDocument(vscode.Uri.file(file)); }
                break;
            }
            // Re-read the file without changing anything — the list is a view of
            // a document somebody edits in Obsidian while this page is open.
            case 'promptsReload':
                this.refresh();
                break;
            // From a setting's right-click menu: the same key, in VS Code's own
            // settings editor — where its raw JSON, its scope and its history
            // live. This page is a curated view, not a replacement for that.
            case 'openSettingsUi':
                if (typeof msg.key === 'string' && msg.key) {
                    void vscode.commands.executeCommand('workbench.action.openSettings', msg.key);
                }
                break;
            // U-139 — the FILE this whole page is a view of. Every box writes
            // into it and the ↺ buttons remove keys from it, so a reader who
            // wants to read it, paste a block in, or repair a value the schema
            // refuses should not have to know the command palette.
            case 'openSettingsJson':
                void vscode.commands.executeCommand('workbench.action.openSettingsJson');
                break;
            // ---- X-3: the engine rows ------------------------------------
            // ‼️ The page asks; the host acts. A credential is never decided
            // here and never travels through the webview: the sign-in is the
            // CLI's own command in a real terminal, and the key route is the
            // vault's own form.
            case 'engineCommand':
                if (typeof msg.command === 'string' && msg.command) {
                    this.deps.engineCommand?.(msg.command);
                }
                break;
            case 'openEngines':
                this.deps.openEngines?.();
                break;
            case 'openAccounts':
                this.deps.openAccounts?.();
                break;
            case 'openSecrets':
                this.deps.openSecrets?.();
                break;
            case 'kapiciMcp':
                if (typeof msg.on === 'boolean') {
                    this.deps.kapiciMcp?.(msg.on);
                    this.refresh();
                }
                break;
            case 'engineKey':
                if (typeof msg.name === 'string' && msg.name) {
                    this.deps.engineKey?.(msg.name);
                }
                break;
            case 'engineDocs':
                if (typeof msg.url === 'string' && /^https:\/\//.test(msg.url)) {
                    void vscode.env.openExternal(vscode.Uri.parse(msg.url));
                }
                break;
            case 'docOpenSet': {
                const field = String(msg.field ?? '');
                if (field === 'defaultMode' || field === 'customCommand' || field === 'customArgs') {
                    this.deps.setDocOpen?.({ [field]: String(msg.value ?? '') });
                    this.refresh();
                }
                break;
            }
            case 'saveProfile': {
                const name = String(msg.name ?? '').trim();
                if (!name) { break; }
                const profile = snapshotProfile(name, this.categories());
                const list = this.deps.getProfiles().filter(p => p.name !== profile.name);
                list.push(profile);
                list.sort((a, b) => a.name.localeCompare(b.name));
                await this.deps.setProfiles(list);
                this.refresh();
                void vscode.window.showInformationMessage(
                    `Agent Farm: setting set "${profile.name}" saved (${Object.keys(profile.values).length} non-default value(s)).`);
                break;
            }
            case 'applyProfile': {
                const profile = this.deps.getProfiles().find(p => p.name === msg.name);
                if (!profile) { break; }
                const plan = profileApplyPlan(profile, this.categories());
                const resets = plan.filter(p => p.value === undefined).length;
                const pick = await vscode.window.showWarningMessage(
                    `Apply setting set "${profile.name}"? ${plan.length - resets} value(s) will be set` +
                    (resets ? `, ${resets} other modified setting(s) reset to default` : '') + '.',
                    { modal: true }, 'Apply');
                if (pick !== 'Apply') { break; }
                for (const step of plan) {
                    await this.setValue(step.key, step.value === undefined ? undefined : step.value);
                }
                this.refresh();
                break;
            }
            case 'deleteProfile': {
                await this.deps.setProfiles(this.deps.getProfiles().filter(p => p.name !== msg.name));
                this.refresh();
                break;
            }
            case 'exportProfiles': {
                const list = this.deps.getProfiles();
                if (!list.length) { break; }
                const uri = await vscode.window.showSaveDialog({
                    saveLabel: 'Export setting sets',
                    filters: { JSON: ['json'] },
                    defaultUri: vscode.Uri.file('agent-farm-setting-sets.json')
                });
                if (!uri) { break; }
                try {
                    fs.writeFileSync(uri.fsPath, JSON.stringify(list, null, 2), 'utf8');
                    void vscode.window.showInformationMessage(`Agent Farm: ${list.length} setting set(s) exported.`);
                } catch (e) {
                    void vscode.window.showErrorMessage('Agent Farm: export failed — ' + String((e as Error).message));
                }
                break;
            }
            case 'importProfiles': {
                const uris = await vscode.window.showOpenDialog({
                    openLabel: 'Import setting sets', filters: { JSON: ['json'] }, canSelectMany: false
                });
                if (!uris?.length) { break; }
                let imported: SettingsProfile[] = [];
                try { imported = parseImportedProfiles(fs.readFileSync(uris[0].fsPath, 'utf8')); } catch { /* unreadable */ }
                if (!imported.length) {
                    void vscode.window.showWarningMessage('Agent Farm: no valid setting sets in that file.');
                    break;
                }
                const list = this.deps.getProfiles().filter(p => !imported.some(i => i.name === p.name));
                list.push(...imported);
                list.sort((a, b) => a.name.localeCompare(b.name));
                await this.deps.setProfiles(list);
                this.refresh();
                void vscode.window.showInformationMessage(`Agent Farm: imported ${imported.length} setting set(s).`);
                break;
            }
            case 'ccSet': {
                const item = CC_CATALOG.find(i => i.id === msg.id);
                if (!item) { break; }
                const cc = this.readClaude();
                if (cc.parseError) {
                    void this.panel.webview.postMessage({ type: 'ccError', id: item.id, error: 'settings.json is not valid JSON — fix it in the raw editor first' });
                    break;
                }
                const coerced = coerceClaudeValue(item, msg.value);
                if (!coerced.ok) {
                    void this.panel.webview.postMessage({ type: 'ccError', id: item.id, error: coerced.error });
                    break;
                }
                const err = this.writeClaude(patchClaudeSettings(cc.json, item.path, coerced.value));
                if (err) { void vscode.window.showErrorMessage('Agent Farm: could not write settings.json — ' + err); }
                this.refresh();
                break;
            }
            case 'ccClear': {
                const item = CC_CATALOG.find(i => i.id === msg.id);
                if (!item) { break; }
                const cc = this.readClaude();
                if (!cc.parseError) {
                    this.writeClaude(patchClaudeSettings(cc.json, item.path, undefined));
                }
                this.refresh();
                break;
            }
            case 'ccRaw': {
                const v = validateRawClaudeSettings(String(msg.text ?? ''));
                if (!v.ok) {
                    void this.panel.webview.postMessage({ type: 'ccError', id: '__raw__', error: v.error });
                    break;
                }
                const err = this.writeClaude(v.json);
                if (err) { void vscode.window.showErrorMessage('Agent Farm: could not write settings.json — ' + err); }
                this.refresh();
                break;
            }
            case 'ccOpenFile':
                void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(this.deps.claudeSettingsFile()));
                break;
            // ---- Agent folders section ----
            // Every write below lands in settings.json; onDidChangeConfiguration
            // then re-scans and refreshes this page (and every other surface).
            case 'rootAdd':
                await vscode.commands.executeCommand('agentfarm.addAgentRoot');
                break;
            case 'rootRemove': {
                const root = String(msg.root ?? '');
                if (!root) { break; }
                const rep = this.deps.agentFolders?.().reports.find(r => r.root === root);
                const n = rep ? rep.candidates.filter(c => !c.excluded).length : 0;
                const pick = await vscode.window.showWarningMessage(
                    `Remove agent root "${root}"?` +
                    (n ? ` Its ${n} agent(s) leave the farm views.` : '') +
                    ' The folder itself is not touched.',
                    { modal: true }, 'Remove');
                if (pick !== 'Remove') { break; }
                const cfg = vscode.workspace.getConfiguration();
                await cfg.update('agentFarm.agentRoots',
                    cfg.get<string[]>('agentFarm.agentRoots', []).filter(r => r !== root),
                    vscode.ConfigurationTarget.Global);
                break;
            }
            case 'rootReveal':
                if (typeof msg.root === 'string' && msg.root) {
                    void revealPath(msg.root);
                }
                break;
            /**
             * X-57 — the four gestures of the Wiki section. Three of them do
             * nothing this page decides: the scaffold, the reveal and the
             * cockpit all belong to code that already exists, and the page's
             * job is to put them next to the sentence that says why you would
             * press them.
             */
            case 'wikiInit': {
                const r = this.deps.wikiInit?.();
                if (r && !r.ok) {
                    void this.panel.webview.postMessage({
                        type: 'error', key: 'agentFarm.wikiRoot', error: r.error ?? 'could not create it'
                    });
                } else if (r) {
                    void vscode.window.showInformationMessage(
                        r.created?.length
                            ? `Agent Farm: wiki started — ${r.created.join(', ')} created.`
                            : 'Agent Farm: the wiki already holds all three files; nothing was written.');
                }
                this.refresh();
                break;
            }
            // Read the folder again without changing anything. It is a folder
            // somebody edits in Obsidian while this page is open, so "nothing
            // changed" is a real and useful answer.
            case 'wikiRescan':
                this.refresh();
                break;
            case 'wikiReveal': {
                const root = this.deps.wikiHealth?.().root ?? '';
                if (root) { void revealPath(root); }
                break;
            }
            case 'wikiOpen':
                this.deps.openWiki?.();
                break;
            /**
             * X-136 — the three gestures of the Superpowers section. The path
             * itself is the ordinary text box and the ordinary Browse…, and
             * [Reset to default] is the ordinary reset — the only thing this
             * section had to add is the per-agent answer, which had no surface
             * at all before, plus the re-read and the reveal a folder edited by
             * hand needs.
             */
            case 'spDefault': {
                const agent = String(msg.agent ?? '').trim();
                if (!agent) { break; }
                await this.deps.superpowersSet?.(agent, msg.on !== false);
                this.refresh();
                break;
            }
            case 'spRescan':
                this.refresh();
                break;
            case 'spReveal': {
                const root = this.deps.superpowers?.()?.root ?? '';
                if (root) { void revealPath(root); }
                break;
            }
            /**
             * ‼️ A-21 — THE ALERT SOUNDS CARD. Every one of these is the same
             * act as an `alerts.*` bridge op and goes through the same host
             * function; the page holds no rule of its own about reserved ids,
             * the limit of ten, or which formats play.
             *
             * Every refusal is SHOWN, on the card, against the control that
             * caused it — a sound feature that fails silently is
             * indistinguishable from one that is merely switched off, which is
             * the whole failure mode A-18 was opened for.
             */
            case 'alertOn':
                await this.alertAct(() =>
                    this.deps.alertsSetOn?.(String(msg.event ?? ''), msg.on !== false));
                break;
            case 'alertVoice':
                await this.alertAct(() =>
                    this.deps.alertsSetVoice?.(String(msg.event ?? ''), String(msg.voice ?? '')));
                break;
            // A-22 — the gate. A refused quiet window (a time that is not
            // HH:MM) comes back through the same `alertError` channel and is
            // shown against the card, because a schedule that reads as
            // configured and silences nothing is the worst of the outcomes.
            case 'alertMute':
                await this.alertAct(() => this.deps.alertsSetMuted?.(msg.on !== false));
                break;
            case 'alertQuiet':
                await this.alertAct(() => this.deps.alertsSetQuiet?.({
                    ...(msg.on === undefined ? {} : { on: msg.on !== false }),
                    ...(msg.from === undefined ? {} : { from: String(msg.from) }),
                    ...(msg.to === undefined ? {} : { to: String(msg.to) })
                }));
                break;
            /**
             * ‼️ U-123 — THE NUDGE'S THREE FIELDS, one message, exactly like the
             * quiet hours above it. The page sends only what it changed; the
             * host keeps the rest and clamps what it is given, so a number a
             * box should never have produced is never stored.
             *
             * `on: false` is `minutes: 0` — the setting's own way of saying off,
             * rather than a fourth field that could disagree with the other
             * three. Switching it back on with the numbers still at zero would
             * arm nothing, so the defaults answer for whichever half is empty.
             */
            case 'alertNudge': {
                const patch: { minutes?: number; repeat?: number; voice?: string } = {};
                if (msg.on !== undefined) {
                    if (msg.on === false) {
                        patch.minutes = 0;
                    } else {
                        patch.minutes = Number(msg.minutes) || 0;
                        patch.repeat = Number(msg.repeat) || 0;
                    }
                }
                if (msg.minutes !== undefined && msg.on === undefined) {
                    patch.minutes = Number(msg.minutes);
                }
                if (msg.repeat !== undefined && msg.on === undefined) {
                    patch.repeat = Number(msg.repeat);
                }
                if (msg.voice !== undefined) { patch.voice = String(msg.voice); }
                await this.alertAct(() => this.deps.alertsSetNudge?.(patch));
                break;
            }
            case 'alertUnmuteSession':
                await this.alertAct(() =>
                    this.deps.alertsUnmuteSession?.(String(msg.sessionId ?? '')));
                break;
            // ▶ — plays and changes nothing, so the page is NOT redrawn: a
            // redraw under the hand would close the picker the reader just
            // opened to compare two tones.
            case 'alertPlay':
                try { await this.deps.alertsPlayVoice?.(String(msg.voice ?? '')); }
                catch (e) { this.alertError(String((e as Error).message)); }
                break;
            case 'alertVoiceAdd':
                await this.alertAct(() => this.deps.alertsVoiceAdd?.());
                break;
            case 'alertVoiceRename': {
                const id = String(msg.id ?? '').trim();
                const label = String(msg.label ?? '').trim();
                if (!id || !label) { break; }
                await this.alertAct(() => this.deps.alertsVoiceRename?.(id, label));
                break;
            }
            case 'alertVoiceRemove': {
                const id = String(msg.id ?? '').trim();
                if (!id) { break; }
                await this.alertAct(() => this.deps.alertsVoiceRemove?.(id));
                break;
            }
            /**
             * ‼️ A-25 — EVERY FLEET-WIDE WRITE ON THE ANNOUNCEMENT STRIP, one
             * message. The page sends only the fields it changed and the host
             * merges them through `speakConfig`, so a rate the box should never
             * have produced is clamped rather than stored.
             */
            case 'alertSpeak': {
                const patch: Record<string, unknown> = {};
                for (const k of ['on', 'template', 'rate', 'volume', 'voice']) {
                    if (msg[k] !== undefined) { patch[k] = msg[k]; }
                }
                if (msg.event !== undefined) {
                    await this.alertAct(() =>
                        this.deps.alertsSetSpeakEvent?.(String(msg.event), msg.on !== false));
                    break;
                }
                await this.alertAct(() => this.deps.alertsSetSpeak?.(patch));
                break;
            }
            case 'alertSpeakTest':
                // Not through `alertAct`: speaking changes no setting, so the
                // redraw it would trigger is a page that flickers for nothing.
                try {
                    await this.deps.alertsSpeakTest?.(
                        msg.text === undefined ? undefined : String(msg.text));
                } catch (e) { this.alertError(String((e as Error).message)); }
                break;
            case 'alertSpeakVoices':
                await this.alertAct(() =>
                    this.deps.alertsLoadSpeechVoices?.(msg.force === true));
                break;
            case 'alertSpeakSession':
                await this.alertAct(() =>
                    this.deps.alertsClearSessionSpeech?.(String(msg.sessionId ?? '')));
                break;
            case 'alertFolder':
                await this.alertAct(() => this.deps.alertsOpenFolder?.());
                break;
            case 'rootCleanDupes': {
                const cfg = vscode.workspace.getConfiguration();
                const roots = cfg.get<string[]>('agentFarm.agentRoots', []);
                const seen = new Set<string>();
                const clean = roots.filter(r => {
                    if (seen.has(normPath(r))) { return false; }
                    seen.add(normPath(r));
                    return true;
                });
                if (clean.length !== roots.length) {
                    await cfg.update('agentFarm.agentRoots', clean, vscode.ConfigurationTarget.Global);
                    void vscode.window.showInformationMessage(
                        `Agent Farm: ${roots.length - clean.length} duplicate root entry(ies) removed.`);
                }
                break;
            }
            case 'agentExclude': {
                const dir = String(msg.dir ?? '');
                if (!dir) { break; }
                const cfg = vscode.workspace.getConfiguration();
                const list = cfg.get<string[]>('agentFarm.excludeAgentDirs', []);
                if (!list.some(x => normPath(x) === normPath(dir))) {
                    await cfg.update('agentFarm.excludeAgentDirs', [...list, dir], vscode.ConfigurationTarget.Global);
                }
                break;
            }
            case 'agentInclude': {
                const dir = String(msg.dir ?? '');
                if (!dir) { break; }
                const cfg = vscode.workspace.getConfiguration();
                const next = cfg.get<string[]>('agentFarm.excludeAgentDirs', [])
                    .filter(x => normPath(x) !== normPath(dir));
                await cfg.update('agentFarm.excludeAgentDirs', next, vscode.ConfigurationTarget.Global);
                break;
            }
            // ‼️ U-29 — WHICH ENGINE THESE DEFAULTS ARE FOR is now part of the
            // message, and it decides WHERE the value goes: Claude's into the
            // file its own CLI reads, every other engine's into Agent Farm's
            // store (they have no per-folder settings file — see
            // core/agentDefaults.ts).
            case 'agentDefaultsEngine': {
                const want = String(msg.engine ?? '').trim().toLowerCase();
                const ids = (this.deps.engines?.() ?? []).map(e => String(e.id));
                if (ids.length && !ids.includes(want)) { break; }
                this.defaultsEngine = (want || 'claude') as EngineId;
                this.refresh();
                break;
            }
            case 'agentEffort': {
                const dir = String(msg.dir ?? '');
                const known = this.deps.agentFolders?.().reports
                    .some(r => r.candidates.some(c => c.dir === dir));
                if (!dir || !known) { break; }
                await this.writeFarmDefault(dir, msg.engine, { effort: String(msg.effort ?? '').trim() });
                this.refresh();
                break;
            }
            /**
             * ‼️ X-255 — THIS AGENT'S STANDING SIGN-IN, and it goes into Agent
             * Farm's store on EVERY engine including Claude.
             *
             * The model above is Claude's own file's because its CLI reads that
             * file itself. An account is not that kind of answer: it is a
             * directory handed to the process in its environment at spawn, and
             * Claude Code has no settings key for one. Writing it into the
             * agent's `.claude/settings.local.json` would be inventing a key
             * nothing reads — the U-29 bug exactly, arriving one axis over.
             *
             * ‼️ AND AN ID NOBODY HOLDS IS NOT STORED. A webview that could
             * write an arbitrary string here would be a webview that can refuse
             * every future launch of this agent (`launchAccountRefusal`), which
             * is a worse failure than the box not working.
             */
            case 'agentAccount': {
                const dir = String(msg.dir ?? '');
                const known = this.deps.agentFolders?.().reports
                    .some(r => r.candidates.some(c => c.dir === dir));
                if (!dir || !known) { break; }
                const engine = String(msg.engine ?? 'claude').trim().toLowerCase();
                const account = String(msg.account ?? '').trim();
                const slots = this.deps.accountChoices?.().slots ?? [];
                if (account && !slots.some(s => s.id === account && s.engine === engine)) { break; }
                await this.writeFarmDefault(dir, engine, { account });
                this.refresh();
                break;
            }
            case 'agentModel': {
                // Per-agent default model. Only scanned agent folders are
                // writable from here — the webview must not be able to point us
                // at arbitrary paths.
                const dir = String(msg.dir ?? '');
                const model = String(msg.model ?? '').trim();
                const known = this.deps.agentFolders?.().reports
                    .some(r => r.candidates.some(c => c.dir === dir));
                if (!dir || !known) { break; }
                const engine = String(msg.engine ?? 'claude').trim().toLowerCase();
                if (engine && engine !== 'claude') {
                    await this.writeFarmDefault(dir, engine, { model });
                    this.refresh();
                    break;
                }
                // …and Claude's still goes in the file, because that is what
                // makes it apply to a session started in a terminal too.
                ('' as string);
                const file = path.join(dir, '.claude', 'settings.local.json');
                let json: Record<string, unknown> = {};
                try {
                    const v = validateRawClaudeSettings(fs.readFileSync(file, 'utf8'));
                    if (!v.ok) {
                        void vscode.window.showErrorMessage(
                            `Agent Farm: ${file} is not valid JSON — fix the file first.`);
                        break;
                    }
                    json = v.json;
                } catch { /* not created yet — start empty */ }
                try {
                    fs.mkdirSync(path.dirname(file), { recursive: true });
                    fs.writeFileSync(file,
                        JSON.stringify(patchClaudeSettings(json, ['model'], model || undefined), null, 2) + '\n',
                        'utf8');
                } catch (e) {
                    void vscode.window.showErrorMessage(
                        'Agent Farm: could not write ' + file + ' — ' + String((e as Error).message));
                }
                this.refresh();
                break;
            }
            case 'openAgent':
                if (typeof msg.agentId === 'string' && msg.agentId) {
                    void vscode.commands.executeCommand('agentfarm.openAgentDetail', { agentId: msg.agentId });
                }
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'refresh':
                this.refresh();
                break;
        }
    }

    private dispose(): void {
        FarmSettingsPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
