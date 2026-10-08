import * as vscode from 'vscode';
import { SettingsProfile, SettingsCategory } from '../core/settingsops';
import { PreviewedPath } from '../core/pathVars';
import { FlexDeps } from '../core/flexActions';
import { PromptSnippetsSnapshot } from '../core/prompts';
import { EngineStatus } from '../core/engines';
import { EngineModels } from '../core/models';
import { WikiHealth } from '../core/wiki';
import { SuperpowersHealth } from '../core/superpowers';
import { TelegramBridgeHost } from './base';
import { AlertMessageDeps } from './alertMessages';

/** Webview-ready snapshot of one agent root for the Agent folders section. */
export interface AgentFolderReport {
    root: string;
    kind: 'nest' | 'single-agent' | 'plain' | 'missing';
    duplicate: boolean;
    /** model = the folder's effective default model (settings.local.json,
     *  falling back to settings.json); '' when none is set. */
    candidates: { dir: string; name: string; excluded: boolean; agentId: string; model: string }[];
}

export interface FarmSettingsDeps extends AlertMessageDeps {
    extensionUri: vscode.Uri;
    /** U-152 — the flex points and presets card; the same deps the flex.* / presets.* ops use */
    flex?: FlexDeps;
    /** the agentFarm.* schema straight from package.json — the page renders it.
     *  `x-af-browse` is how a setting declares itself a path and earns a
     *  Browse… button (see SettingSpec.browse for why not `format`). */
    schema(): Record<string, {
        type?: unknown; enum?: unknown; default?: unknown; minimum?: unknown; maximum?: unknown;
        description?: string; markdownDescription?: string; 'x-af-browse'?: unknown;
    }>;
    /** X-470 — THE settings model, assembled once by the host (values through cfgValueRaw, a value refused in
     *  the settings file, what a bounded box acts at): required, so the page draws exactly what the bridge reads. */
    categories(): SettingsCategory[];
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
     * ‼️ U-84 — THE TELEGRAM BRIDGE, WHICH FOUR SETTINGS ROWS CANNOT REPORT ON.
     *
     * Reaching the farm from a phone is configured here — the switch, the
     * allowlist, the ceiling and the default agent are all rows of the
     * Telegram group (Remote Access). What none of them can say is whether the thing WORKS: the token is
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
