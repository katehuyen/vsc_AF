import type * as vscode from 'vscode';
import type { WorkItem, WorkQueueStore } from '../core/workqueue';
import type { ProjectRef } from './noticesPanel';

/** Everything the Work Queue page needs from the extension host — one object for the desktop tab and a phone's view. */
export interface QueueDeps {
    extensionUri: vscode.Uri;
    store: WorkQueueStore;
    /** Known routing targets (products / agent names) for the filter + add form. */
    targets: () => string[];
    agentNames: () => string[];
    /**
     * ‼️ X-49 — the engines an item can ASK FOR, and what each one offers.
     *
     * The queue does not start anything, so this is a vocabulary and not a
     * launcher: it is here so the three little boxes on a row offer the models
     * that engine actually has instead of a free-text field where `sonet` and
     * `sonnet` are the same amount of true. Same shape the Tasks form is given
     * (`launch` in tasksPanel), because two surfaces disagreeing about what
     * `codex` can run is the bug S-20 was filed for.
     */
    engineChoices?: () => { id: string; label: string; takesEffort?: boolean }[];
    engineModels?: () => Record<string, { models: { id: string; label: string }[]; efforts: Record<string, { id: string; label: string }[]>; defaultEffort?: Record<string, string>; note?: string }>;
    efforts?: () => { id: string; label: string }[];
    /**
     * ‼️ X-254 (2/n) — WHICH SIGN-INS EACH ENGINE HAS, so the fourth box on a
     * row is a picker and not a text field.
     *
     * The core half shipped the axis in 3.430.0 and the page could not draw it,
     * because the page was never handed the accounts at all. Same shape the
     * Tasks form is given (`engineAccounts` in tasksPanel) for the same reason
     * the engines are: two surfaces disagreeing about which sign-ins exist is a
     * row offering a plan that cannot pay.
     *
     * ‼️ AND THE QUEUE STILL STARTS NOTHING. This is a vocabulary, exactly as
     * `engineChoices` is: what an item ASKS for, which a runner filters on. The
     * five-hour figure travels with each row because that is the fact the
     * choice turns on, but nothing here spends it.
     */
    engineAccounts?: () => Record<string, { id: string; label: string; health: string; active: boolean; percent?: number; resetsAt?: number }[]>;
    /**
     * ‼️ X-305 — …AND THE RULES, which is the answer an item in a QUEUE usually
     * wants. An item waits, sometimes for hours, and a slot named today is the
     * one fact about it most likely to be stale when somebody takes it; a rule
     * is re-decided at that moment. `picks` / `refusal` describe RIGHT NOW and
     * `detail` is the standing description — MIRROR wants them apart.
     */
    enginePolicies?: () => Record<string, {
        id: string; label: string; detail: string;
        picks: string; note: string; refusal: string;
    }[]>;
    /** Open projects, for the capture box, the row picker and the filter. */
    projects: () => ProjectRef[];
    /** The window's active project — what a capture made here is stamped with. */
    activeProjectId: () => string;
    /** Open a project's page, from an item's project mark. */
    openProject?: (id: string) => void;
    onChange?: () => void;
    /** Cross-link back to Notices, focused on the source notice. */
    openNotice?: (noticeId: string) => void;
    /** "Hand to agent": open the item's target agent terminal, prefilled with the
     *  item text (typed, NOT sent — the user reviews and presses Enter). */
    handoff?: (item: WorkItem) => void;
    // --- Feature A: live status mirror for agent-tracked (delegated) items ---
    /** Current status/title of the mission run an item was delegated into. */
    missionStatus?: (missionId: string) => { status: string; title?: string } | undefined;
    /** Current status/title of the task an item was delegated into. */
    taskStatus?: (taskId: string) => { status: string; title?: string } | undefined;
    // --- Feature B: shared "open with" for report/answer .md links ---
    /** Open a resolved report/answer file with a mode (default when omitted). */
    openDoc?: (filePath: string, mode?: string) => void;
    /** Current doc-open default, for the split-button UI. */
    docOpenConfig?: () => { mode: string; hasCustom: boolean };
    /** Launch the host-side "configure default + custom app" flow. */
    configureDocOpen?: () => void;
}
