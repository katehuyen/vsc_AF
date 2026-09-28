import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { sendToTerminalWhenReady } from '../core/shellReady';
import { addUsage, contextAfter, emptyUsage, PricingEngine, RawUsage, toUsage, totalTokens, Usage, weightedTokens } from '../core/pricing';
import { conversationTitle, SessionOrigin, sessionOrigin, sessionHeadless } from '../core/sessions';
import { StepKind, stepKindForTool } from '../core/stepkind';
import { collectEdits, fileStats, groupByFile } from '../core/codeedits';
import { parseCliViewer } from '../core/cliViewer';
import { ContextSignalView } from '../core/contextGuard';
import { RunIdentity } from '../core/turnRuntime';
import { oneShotEnv } from '../core/oneShot';
import { revealPath } from '../core/reveal';
import { buildSessionMarkdown, SessionExportView } from '../core/sessionExport';
import { chainIndexNow, chainPlace } from '../core/chainMembership';
import { askExportOptions, handleAfNav, htmlShell, speakerSettings, wikiMarksOf, wikiMarkMessage } from './base';

export interface ViewerDeps {
    extensionUri: vscode.Uri;
    getPricing(): PricingEngine;
    maxMessages(): number;
    /** Context-window size for the "Context now" gauge, resolved from the session's
     *  current model (agentFarm.contextWindowTokens > 0 overrides). 0 = unknown model —
     *  the gauge then shows the raw token count without a percent or color. */
    /** The ceiling a context reading is a fraction of. `stated` is what the
     *  engine itself published for this session, when there is one; the host
     *  decides the precedence once (core/pricing.ts contextWindowOf). */
    contextLimitFor(model: string, stated?: number): number;
    /**
     * ‼️ S-64 — WAS THIS RUN TOLD ITS WINDOW WAS FULL, and did it obey? The
     * gauge above says how full the window got; without this, a page showing
     * 41% and a run that kept working look like disobedience on every engine,
     * including the ones the sentence can never reach. Undefined = the guard
     * is not wired here (a panel that builds a viewer for a preview), which is
     * silence, never "nothing was sent".
     */
    contextSignalFor?(sessionId: string): ContextSignalView | undefined;
    /** User-set session name (rename feature); wins over the transcript-derived title. */
    titleFor?(sessionId: string): string | undefined;
    /** On the user's shelf (sessionmarks.ts). A session is pinnable from six
     *  surfaces and its OWN page was the one that neither showed the mark nor
     *  let you set it — see the ★ in the header. */
    pinnedFor?(sessionId: string): boolean;
    /** Labels the user put on this session — read-only here; the same marks
     *  store the star comes from, so the header can say what the row says. */
    tagsFor?(sessionId: string): string[];
    /**
     * ‼️ X-251 — WHOSE PLAN THIS SESSION RAN ON, and why it is ASKED for.
     *
     * Every slot's `projects` folder is a junction onto one shared root, so
     * five accounts write their transcripts into the same directory and the
     * FILE cannot name its owner. The account is knowable at exactly one
     * moment — the launch — and it was recorded there, on the manifest the
     * session reaches by its `launchId`. Deriving it here would be inventing
     * the one certainty this family refuses.
     *
     * ‼️ TWO PARTS, AND THEY ARE NOT INTERCHANGEABLE. The label is a thing to
     * read; the id is a SLOT, and the `/context` capture resumes on it. A page
     * given only the label could show the right sign-in while capturing on the
     * wrong one — which is the exact failure this item exists to end.
     *
     * `undefined` = nothing recorded. That is silence, never "this machine".
     */
    accountFor?(sessionId: string): { id: string; label: string } | undefined;
    /**
     * ‼️ X-110 — AND WHICH PROVIDER SERVED IT, the same way and for the same
     * reason as the account above: it is a fact about the LAUNCH plus what the
     * engine reported, and this page cannot derive either. It ALWAYS answers
     * (X-108) — `binding` says which kind of nothing a blank is, so an old run,
     * a foreign transcript and one nobody recorded stop sharing a blank space.
     */
    identityFor?(sessionId: string): RunIdentity | undefined;
    /** Export MD remembers the last folder saved to; falls back to session cwd / home. */
    lastExportDir?(): string | undefined;
    setLastExportDir?(dir: string): void;
    /** Resume honors agentFarm.externalTerminal when provided by the extension host. */
    launchTerminal?(name: string, cwd: string | undefined, command: string, sessionId?: string): void;
    /** Owner agent of a session (index lookup, cwd fallback) — powers the header's
     *  "⌂ <agent>" button. undefined = the session lives outside the agent roots. */
    agentForSession?(file: string, cwd?: string): { agentId: string; agentName: string } | undefined;
    /** True while the session has a live claude process (live monitor). Guards
     *  Capture now: we never `--resume` a session that another process is writing. */
    isSessionLive?(sessionId: string): boolean;
    /** Which of Agent Farm's own mechanisms started this run, when one did —
     *  see SessionInfo.launchedBy. Decides the origin and names the schedule
     *  in the subtitle instead of "automation run". */
    launchedByFor?(sessionId: string): { kind: string; label: string; mode?: string } | undefined;
    /**
     * ‼️ WHICH ENGINE RAN IT (U-26). Not derivable here: this page is built by
     * PARSING one transcript, and a transcript does not name the CLI that wrote
     * it — `SessionInfo.source` does, and only the index has that. Absent means
     * Claude, which is what an unset `source` has always meant.
     */
    engineFor?(sessionId: string): string | undefined;
    /**
     * ‼️ X-25 — IS THE WHOLE TRANSCRIPT A DELEGATION LANE?
     *
     * A subagent conversation usually lives inside its parent's file, one
     * `isSidechain` line at a time, and that flag is read here. But it can also
     * be a file of its own (`…/<parentId>/subagents/x.jsonl`), and there the
     * per-line flag is absent — the index knows only because it knows the
     * folder depth. Without this the speakers in such a file would be labelled
     * USER and AGENT, which is the very confusion X-25 is about.
     */
    laneFor?(file: string): boolean;
    /** U-167 — a session's transcript, for the chain arrows */
    fileForSession?(sessionId: string): string | undefined;
    /**
     * ‼️ S-37 — WHO RAN THIS, ANSWERED BY THE SIDE THAT HOLDS THE EVIDENCE.
     *
     * This page is built by PARSING one transcript, and a transcript cannot
     * tell a person typing in the Console from a headless `claude -p`: the CLI
     * writes `entrypoint: "sdk-cli"` for both. Only the index can, because only
     * it holds the ids the Console hosted and the launcher that started the run
     * — which is why calling `sessionOrigin`/`sessionHeadless` HERE, with an
     * object missing `consoleHosted`, printed 🤖🌙 "automation run" over a
     * conversation the Sessions table, reading the same two functions off the
     * full record, correctly showed as 🧑 yours.
     *
     * So the verdict is ASKED FOR rather than recomputed, and both halves come
     * back together: two deps would be two chances to wire only one of them,
     * and the next fact `sessionOrigin` learns to read would go missing here
     * again. Undefined = the index has never seen this session (a transcript
     * opened straight off a path), and only then does the page fall back to
     * what the transcript alone can support.
     */
    originFor?(sessionId: string): { origin: SessionOrigin; headless: boolean } | undefined;
}

interface ViewMessage {
    role: 'user' | 'assistant' | 'tool' | 'toolResult' | 'system';
    ts: number;
    text?: string;
    tool?: string;
    input?: string;
    isError?: boolean;
    sidechain?: boolean;
    model?: string;
    tokens?: number;
    /** the same step against the plan limit — see QUOTA_WEIGHTS */
    wTokens?: number;
    cost?: number;
    /** WHAT KIND of step this is, and therefore where its cost comes from —
     *  see stepkind.ts. The transcript said what happened and never what it
     *  was: a local Read and a nine-second think looked like the same event. */
    kind?: StepKind;
    /** 1-based turn number (a turn starts at each top-level user prompt). */
    turn?: number;
    /** True on the message that opens a turn — the viewer draws the turn divider here. */
    turnStart?: boolean;
}

/** Ceiling for TOOL payloads only (a Read of a big file, a huge JSON result).
 *  The conversation itself is never cut — see clipTool. */
const TOOL_LIMIT = 200_000;

/** How much of a turn's opening prompt travels with the turn table, for the
 *  hover that shows it whole. Higher than the index's own cap because this is
 *  fetched on demand for ONE session, not held for every session for ever. */
const TURN_PROMPT_MAX = 8000;

/** Hard ceiling for the tab caption: `Session #<8-char id>` is 17, so this
 *  leaves the name about a dozen characters — a hint, not a headline. Tabs are
 *  sized to fit their label, so this number IS the width of the tab. */
const TAB_MAX = 30;

/**
 * What a transcript tab is called.
 *
 * One string is all a webview tab has — VS Code gives a `WebviewPanel` a
 * `title` and no tooltip of its own, and the tab's hover *is* that title — so
 * both jobs share it: the **id** leads, because that is what identifies the
 * session against a terminal, a log line or another tab, and the **name**
 * follows as a hint. The ceiling is the whole point: with tabs sized to fit
 * their label, a long name made one tab as wide as three, so it is the name
 * that gets cut, never the id.
 */
export function tabCaption(sessionId: string, title?: string): string {
    const name = (title ?? '').trim();
    const base = `Session #${String(sessionId ?? '').slice(0, 8)}`;
    const full = name && name !== '(untitled session)' ? `${base} · ${name}` : base;
    return full.length > TAB_MAX ? full.slice(0, TAB_MAX - 1).trimEnd() + '…' : full;
}

/** Run-attribute keys we look for next to the model (effort / reasoning level /
 *  service tier …). Claude Code does not record any of these today — probed
 *  across 40 real transcripts, zero hits — so this normally yields nothing and
 *  the UI stays clean.
 *
 *  The values are never interpreted: whatever string the transcript holds is
 *  shown verbatim, exactly like the model id. So a NEW model ("claude-nova-9")
 *  or a NEW effort level ("ultra") needs no code change ever — only a brand-new
 *  *key name* would, and that is one string in this list. */
const ATTR_KEYS = [
    'effort', 'reasoning_effort', 'reasoningEffort', 'thinking_effort',
    'reasoning', 'service_tier', 'serviceTier'
];

/** Pull run attributes out of a transcript line (message level first, then the
 *  line itself). Scalars only — an object value would be config, not a label. */
function readAttrs(line: Record<string, unknown>, msg: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const src of [msg, line]) {
        for (const k of ATTR_KEYS) {
            const v = src?.[k];
            if (v === undefined || v === null || typeof v === 'object') { continue; }
            const s = String(v).trim();
            if (s && out[k] === undefined) { out[k] = s.slice(0, 40); }
        }
    }
    return out;
}

/**
 * Tool payloads only — never the conversation.
 *
 * A tool result can be a whole file (megabytes); the words a person and an
 * agent said to each other cannot. Cutting the conversation at 4 000
 * characters made the one page whose entire purpose is *reading the
 * transcript* stop halfway through a long answer, so it does not any more:
 * user and assistant text travels whole, and only tool input/output meets a
 * ceiling — a high one, and it says so when it is reached.
 */
function clipTool(s: string): string {
    return s.length > TOOL_LIMIT
        ? s.slice(0, TOOL_LIMIT) + `\n… [tool payload cut here — ${s.length.toLocaleString()} characters total; "Open raw JSONL" has all of it]`
        : s;
}

/** Human-readable prompt snippet: slash commands show as their name, harness XML is skipped. */
function promptLabel(text: string): string {
    const t = text.replace(/\s+/g, ' ').trim();
    const cmd = /<command-name>([^<]+)<\/command-name>/.exec(t);
    if (cmd) { return cmd[1].trim(); }
    return t.slice(0, 90);
}

/** ‼️ The page does NOT have its own idea of what names a session — it asks the
 *  index's (`conversationTitle`). Two copies of this judgment is how the rule
 *  drifted apart before, and a viewer that disagreed with the tables about a
 *  session's name is a bug nobody can explain from either side. */
const titleCandidate = conversationTitle;

function contentToText(content: unknown): string {
    if (typeof content === 'string') { return content; }
    if (Array.isArray(content)) {
        const parts: string[] = [];
        for (const b of content as { type?: string; text?: string; content?: unknown }[]) {
            if (b?.type === 'text' && b.text) { parts.push(b.text); }
        }
        return parts.join('\n');
    }
    return '';
}

/** One row of the `/context` "usage by category" table (System prompt, MCP tools,
 *  Memory files, Free space, Autocompact buffer …). */
interface ContextCategory { label: string; tokens: number; pct: number; }
/** Parsed snapshot of a `/context` run captured from the transcript. Reflects the
 *  moment the user last ran /context in the terminal — carries its own timestamp so
 *  the UI can say how fresh it is (it may lag the live "Context now" gauge). */
interface ContextReport {
    ts: number; tokens: number; limit: number; pct: number; categories: ContextCategory[];
}

/** "9.4k" → 9400, "849.3k" → 849300, "26k" → 26000, "967k" → 967000, "512" → 512. */
function parseTok(s: string): number {
    const m = /^([\d.]+)\s*([km])?$/i.exec(s.trim());
    if (!m) { return 0; }
    const n = parseFloat(m[1]);
    if (!isFinite(n)) { return 0; }
    const unit = (m[2] || '').toLowerCase();
    return Math.round(unit === 'k' ? n * 1000 : unit === 'm' ? n * 1_000_000 : n);
}

/** Parse `/context` output into a report. The CLI prints TWO different shapes:
 *
 *  - interactive TUI (recorded to the transcript as a system/local_command line):
 *    ANSI-colored glyph gauge with labelled rows — "System prompt: 9.4k tokens (1.0%)"
 *  - print mode (`claude -p "/context"`, also what a Capture-now run returns):
 *    a markdown table — "| System prompt | 6.6k | 3.3% |"
 *
 *  Both are handled here; returns null when the text is not a recognizable
 *  context report (so an unrelated local command is ignored). Fully format-driven:
 *  a brand-new category label needs no code change — whatever rows the CLI prints
 *  are shown verbatim. */
export function parseContextReport(content: string): ContextReport | null {
    const clean = content
        // eslint-disable-next-line no-control-regex
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/<\/?local-command-stdout>/g, '');
    if (!/Context Usage/.test(clean)) { return null; }

    let tokens = 0, limit = 0, pct = 0;
    // Total: TUI "84.7k/967k tokens (9%)" · print "**Tokens:** 20.2k / 200k (10%)"
    const totalM = /([\d.]+[km]?)\s*\/\s*([\d.]+[km]?)\s*(?:tokens\s*)?\((\d+(?:\.\d+)?)%\)/i.exec(clean);
    if (totalM) {
        tokens = parseTok(totalM[1]);
        limit = parseTok(totalM[2]);
        pct = Math.round(parseFloat(totalM[3]));
    }

    const categories: ContextCategory[] = [];

    // Markdown-table rows first: "| <Label> | <num> | <pct>% |". Requiring cell 2
    // to be a number and cell 3 a percent keeps out the header ("| Category |
    // Tokens |…"), the divider row, and the per-tool MCP/Skills tables (their
    // middle cell is a server/source name, not a number).
    const mdRe = /^\|\s*([A-Za-z][^|]*?)\s*\|\s*([\d.]+[km]?)\s*\|\s*([\d.]+)%\s*\|/gim;
    let m: RegExpExecArray | null;
    while ((m = mdRe.exec(clean)) !== null && categories.length < 24) {
        categories.push({ label: m[1].trim(), tokens: parseTok(m[2]), pct: parseFloat(m[3]) });
    }

    // TUI rows: "<Label>: <num>[ tokens] (<pct>%)". The glyph column shares the
    // physical line, so we anchor on the label (letters/spaces) + colon and let
    // the leftmost letter start the match — leading glyphs are skipped naturally.
    // Only when the markdown table produced nothing: in the print shape this
    // pattern would falsely match the "**Tokens:** a / b (c%)" total line.
    if (!categories.length) {
        const re = /([A-Za-z][A-Za-z ]*?):\s*([\d.]+[km]?)\s*(?:tokens\s*)?\((\d+(?:\.\d+)?)%\)/gi;
        while ((m = re.exec(clean)) !== null && categories.length < 24) {
            categories.push({ label: m[1].trim(), tokens: parseTok(m[2]), pct: parseFloat(m[3]) });
        }
    }
    if (!categories.length && !tokens) { return null; }
    return { ts: 0, tokens, limit, pct, categories };
}

/** On-demand capture: run `claude --resume <sid> -p "/context"` in the session's
 *  cwd and parse the stdout. /context is a LOCAL command — verified live: the run
 *  makes no API call (no usage line, no cost) and appends only a harmless
 *  system/local_command line to the same session file (no fork). `model` (the
 *  session's last model, verbatim) sizes the context window correctly.
 *  Only for NON-live sessions — the caller guards; racing a live TUI writer on
 *  one transcript file is a risk we don't take. */
export function runContextCapture(
    file: string, cwd: string, model: string | undefined,
    cb: (r: { ok: boolean; report?: ContextReport; error?: string }) => void,
    /**
     * ‼️ X-260 — WHICH SIGN-IN PICKS THE CONVERSATION BACK UP.
     *
     * This spawn resumes the USER'S OWN session, and it passed no environment
     * at all: it ran as whichever account the VS Code window happened to hold.
     * Because every slot's `projects` folder is a junction onto one shared root
     * (X-251), the transcript is FOUND either way — so the failure is silent by
     * construction: the capture succeeds and the wrong plan pays for it.
     *
     * Unstated is not "the machine": it is the standing choice of that engine,
     * the same answer every other launch resolves to. Naming the account this
     * session actually ran as is the session viewer's half of X-251, which is
     * where the manifest reaches this surface — it is passed in, never guessed
     * here.
     */
    account?: string
): void {
    const sid = path.basename(file, '.jsonl');
    if (!/^[0-9a-fA-F-]{8,}$/.test(sid)) { cb({ ok: false, error: 'unrecognized session id' }); return; }
    if (!cwd || !fs.existsSync(cwd)) {
        cb({ ok: false, error: 'session folder no longer exists — /context needs the original cwd to resume' });
        return;
    }
    const modelArg = model && /^[\w.-]+$/.test(model) ? ` --model ${model}` : '';
    let child: cp.ChildProcess;
    try {
        // shell:true — `claude` is a .cmd shim on Windows. sid/model are validated
        // above (uuid chars / word chars only), nothing user-typed reaches the line.
        child = cp.spawn(`claude --resume ${sid}${modelArg} -p "/context"`,
            { cwd, shell: true, windowsHide: true, env: oneShotEnv({ account }) });
    } catch (e) { cb({ ok: false, error: String(e) }); return; }
    let out = '', err = '', done = false;
    const finish = (r: { ok: boolean; report?: ContextReport; error?: string }): void => {
        if (!done) { done = true; cb(r); }
    };
    const timer = setTimeout(() => {
        try { child.kill(); } catch { /* already gone */ }
        finish({ ok: false, error: 'claude timed out (90s)' });
    }, 90_000);
    child.stdout?.on('data', d => { out += String(d); });
    child.stderr?.on('data', d => { err += String(d); });
    child.on('error', e => { clearTimeout(timer); finish({ ok: false, error: String(e) }); });
    child.on('close', code => {
        clearTimeout(timer);
        const report = parseContextReport(out);
        if (report) { report.ts = Date.now(); finish({ ok: true, report }); return; }
        finish({ ok: false, error: (err.trim() || out.trim() || `claude exited with code ${code}`).slice(0, 400) });
    });
}

export function buildData(file: string, deps: ViewerDeps): Record<string, unknown> {
    let raw = '';
    try { raw = fs.readFileSync(file, 'utf8'); } catch { /* gone */ }

    // Codex/Gemini write real transcripts too, but not in Claude's schema. The
    // old path fed those files into the Claude loop below: it found no messages,
    // used the rollout filename instead of the thread id, and consequently the
    // engine lookup fell back to Claude. One normalized parser now hands the
    // shared page the same message/turn vocabulary while preserving each CLI's
    // own ids, models, efforts and token semantics.
    const cli = parseCliViewer(raw, file, deps.getPricing());
    if (cli) {
        const max = deps.maxMessages();
        const launchedBy = deps.launchedByFor?.(cli.sessionId);
        // S-37 — the index's verdict first, so this page and the row that
        // opened it cannot disagree about the same session.
        const verdict = deps.originFor?.(cli.sessionId);
        // X-251 — the recorded sign-in, on the foreign-CLI path too: an account
        // is a fact about the LAUNCH, and every engine's launch is recorded the
        // same way. A field only Claude sessions carried would be a page that
        // answers for one engine and shrugs at four.
        const acct = deps.accountFor?.(cli.sessionId);
        return {
            ...cli,
            file,
            title: deps.titleFor?.(cli.sessionId) || cli.title || '(untitled session)',
            pinned: deps.pinnedFor?.(cli.sessionId) === true,
            tags: deps.tagsFor?.(cli.sessionId) ?? [],
            account: acct?.label ?? '',
            accountId: acct?.id ?? '',
            // X-110 - which provider served it, on the foreign-CLI path too.
            identity: deps.identityFor?.(cli.sessionId) ?? null,
            // S-41 — every fact the rule reads, written out even where the
            // answer is "this page cannot know": a foreign-CLI transcript
            // states no entrypoint, and the two facts only the index holds
            // (`consoleHosted`, `agentId`) are exactly why `verdict` is asked
            // for first. Omitting them silently is what made this page and the
            // row that opened it disagree about the same session.
            origin: verdict?.origin ?? sessionOrigin({
                entrypoint: undefined, consoleHosted: undefined,
                launchedBy, agentId: undefined
            }),
            // S-35 — a foreign-CLI transcript states no entrypoint at all, so
            // with no record to ask there is no evidence either way and the
            // page claims none.
            headless: verdict?.headless ?? false,
            launchedBy: launchedBy ?? null,
            engine: deps.engineFor?.(cli.sessionId) || cli.engine,
            context: {
                ...cli.context,
                limit: deps.contextLimitFor(cli.context.model, cli.context.limit || 0)
            },
            contextSignal: deps.contextSignalFor?.(cli.sessionId) ?? null,
            contextReport: null,
            files: [],
            messageCount: cli.messages.length,
            truncatedCount: Math.max(0, cli.messages.length - max),
            messages: cli.messages.slice(-max)
        };
    }

    const messages: ViewMessage[] = [];
    const usage: Usage = emptyUsage();
    const models = new Set<string>();
    const seen = new Set<string>();
    let cost = 0, wTokens = 0, errors = 0, toolCalls = 0, firstTs = 0, lastTs = 0;
    let ctxTokens = 0, ctxTs = 0;
    let ctxModel = '';
    // Latest `/context` snapshot seen in the transcript (last one wins — most recent run).
    let contextReport: ContextReport | null = null;
    let title = '';
    let cwd = '';
    let permissionMode = '';
    let entrypoint = '';
    // Turn accounting runs inside the parse loop: usage on assistant lines whose content
    // never renders (e.g. thinking-only stream lines) must still bill to the open turn.
    let inTurn = 0;
    /**
     * Per-turn accounting.
     *
     * `apiCalls` and `steps` are two different questions and the surfaces used
     * to answer only the second: a STEP is one thing the agent did (it reasoned,
     * it wrote, or it called a tool), an API CALL is one round trip, and one
     * call routinely carries several steps. The tokens follow the calls, so a
     * turn whose call count halved while its steps held looked unchanged while
     * its total moved. `thinking` is the share of the steps that was the model
     * reasoning — counted in the same pass, off the same blocks, so the two
     * cannot drift (see SessionTurn.steps for why it belongs in the total).
     *
     * `endTs` and `endCtx` close the other gap: the turn row said what it spent
     * but never how long it took or where it left the window.
     */
    const turnTotals: Record<number, {
        tokens: number; wTokens: number; cost: number; apiCalls: number; steps: number;
        thinking: number; endTs: number; endCtx: number;
    }> = {};
    const turnAcc = (n: number): {
        tokens: number; wTokens: number; cost: number; apiCalls: number; steps: number;
        thinking: number; endTs: number; endCtx: number;
    } => (turnTotals[n] ?? (turnTotals[n] =
        { tokens: 0, wTokens: 0, cost: 0, apiCalls: 0, steps: 0, thinking: 0, endTs: 0, endCtx: 0 }));
    // Which model(s) served each turn — the model can change mid-session (it does
    // in ~1 of 4 real sessions), so this is per turn, not per session.
    const turnModels: Record<number, Set<string>> = {};
    const turnAttrs: Record<number, Record<string, string>> = {};

    for (const lineText of raw.split('\n')) {
        if (!lineText.trim()) { continue; }
        let line: {
            type?: string; subtype?: string; content?: string;
            summary?: string; isMeta?: boolean; isSidechain?: boolean;
            timestamp?: string; cwd?: string; permissionMode?: string; requestId?: string;
            entrypoint?: string;
            costUSD?: number; toolUseResult?: unknown;
            message?: {
                id?: string; model?: string; content?: unknown;
                usage?: RawUsage;
            };
        };
        try { line = JSON.parse(lineText); } catch { continue; }

        const ts = line.timestamp ? Date.parse(line.timestamp) : 0;
        if (ts) {
            if (!firstTs) { firstTs = ts; }
            lastTs = Math.max(lastTs, ts);
        }
        if (line.cwd && !cwd) { cwd = line.cwd; }
        if (line.entrypoint && !entrypoint) { entrypoint = line.entrypoint; }
        if (line.type === 'summary' && line.summary && !title) { title = line.summary; continue; }
        if (line.type === 'permission-mode' && line.permissionMode) { permissionMode = line.permissionMode; continue; }
        // `/context` is recorded as a system/local_command line; capture the latest one.
        if (line.type === 'system' && line.subtype === 'local_command'
            && typeof line.content === 'string' && line.content.includes('Context Usage')) {
            const parsed = parseContextReport(line.content);
            if (parsed) { parsed.ts = ts || parsed.ts; contextReport = parsed; }
            continue;
        }
        /**
         * ‼️ S-37 — WHAT THE CLI SAID BACK IS PART OF THE CONVERSATION.
         *
         * Every other `system` line was read for its metadata and then dropped,
         * so a slash command's own answer — "`/login` isn't available in this
         * environment", the output of `/clear`, a hook's refusal — appeared
         * nowhere. Measured: session `9490331f-…` is five lines long and ALL of
         * its content is of this kind, so the page opened blank over a file that
         * was not empty, with the filter's "No messages match." as the only
         * explanation on offer. The `Context Usage` report above is the one that
         * keeps its own home; everything else is shown.
         */
        if (line.type === 'system' && typeof line.content === 'string' && line.content.trim()) {
            messages.push({
                role: 'system', ts,
                text: line.content.replace(/<\/?local-command-stdout>/g, '').trim(),
                sidechain: line.isSidechain
            });
            continue;
        }

        if (line.type === 'user' && line.message) {
            const content = line.message.content;
            if (typeof content === 'string') {
                if (!line.isMeta) {
                    messages.push({ role: 'user', ts, text: content, sidechain: line.isSidechain });
                    if (!line.isSidechain) { inTurn++; }
                    if (!title) { title = titleCandidate(content); }
                }
            } else if (Array.isArray(content)) {
                for (const b of content as { type?: string; is_error?: boolean; content?: unknown; text?: string }[]) {
                    if (b?.type === 'tool_result') {
                        if (b.is_error) { errors++; }
                        messages.push({
                            role: 'toolResult', ts,
                            text: clipTool(contentToText(b.content) || String(b.text ?? '')),
                            isError: !!b.is_error, kind: 'result',
                            sidechain: line.isSidechain
                        });
                    } else if (b?.type === 'text' && b.text && !line.isMeta) {
                        // isMeta is the harness talking, not the user. A string-content
                        // meta line was already skipped above; the array form was not,
                        // so it opened a turn nobody asked for — and every turn after it
                        // carried the number, and the tokens, of the one before. The
                        // session index never counted it, so the same transcript showed
                        // one turn count on the page and another in the tables.
                        messages.push({ role: 'user', ts, text: b.text, sidechain: line.isSidechain });
                        if (!line.isSidechain) { inTurn++; }
                        if (!title) { title = titleCandidate(b.text); }
                    }
                }
            }
            continue;
        }

        if (line.type === 'assistant' && line.message) {
            const msg = line.message;
            if (msg.model && msg.model !== '<synthetic>') { models.add(msg.model); }
            if (inTurn > 0) {
                if (msg.model && msg.model !== '<synthetic>') {
                    (turnModels[inTurn] ?? (turnModels[inTurn] = new Set())).add(msg.model);
                }
                const attrs = readAttrs(
                    line as unknown as Record<string, unknown>,
                    msg as unknown as Record<string, unknown>);
                for (const [k, v] of Object.entries(attrs)) {
                    (turnAttrs[inTurn] ?? (turnAttrs[inTurn] = {}))[k] = v;
                }
            }
            // A synthetic row's usage is all zeros; adopting it blanked the
            // "Context now" card on any session that ended on one — see
            // contextAfter. Zero means "no measurement", not "empty window".
            const ctxNow = contextAfter(msg.usage);
            if (ctxNow > 0) {
                ctxTokens = ctxNow;
                ctxTs = ts || ctxTs;
                if (msg.model && msg.model !== '<synthetic>') { ctxModel = msg.model; }
                // Where the turn left the window. A sub-agent's messages are
                // not this conversation's window (see contextAfter's callers in
                // consoleproto) but a sidechain line here belongs to the same
                // conversation, so it counts.
                if (inTurn > 0) { turnAcc(inTurn).endCtx = ctxNow; }
            }
            if (inTurn > 0 && ts) { turnAcc(inTurn).endTs = Math.max(turnAcc(inTurn).endTs, ts); }
            let msgTokens = 0, msgCost = 0, msgWTokens = 0;
            const key = `${msg.id ?? ''}:${line.requestId ?? ''}`;
            if (msg.usage && (key === ':' || !seen.has(key))) {
                if (key !== ':') { seen.add(key); }
                // ‼️ toUsage, never field by field — the flat cache-creation
                // number hides the TTL split and a 1-hour write costs 1.6x a
                // 5-minute one (see Usage.cacheWrite1h).
                const u: Usage = toUsage(msg.usage);
                addUsage(usage, u);
                msgTokens = totalTokens(u);
                // …and what the same line charged the plan limit, off the model
                // that served it. Same line, same dedup guard as the raw figure.
                msgWTokens = weightedTokens(msg.model ?? '', u);
                wTokens += msgWTokens;
                msgCost = typeof line.costUSD === 'number'
                    ? line.costUSD
                    : deps.getPricing().costFor(msg.model ?? '', u, ts);
                cost += msgCost;
                if (inTurn > 0 && (msgTokens || msgCost)) {
                    const t = turnAcc(inTurn);
                    t.tokens += msgTokens;
                    t.wTokens += msgWTokens;
                    t.cost += msgCost;
                    // One round trip. Counted HERE, inside the dedup guard, so
                    // it is the same set of lines the tokens came from — the
                    // two figures can never tell different stories.
                    t.apiCalls++;
                }
            }
            if (Array.isArray(msg.content)) {
                for (const b of msg.content as { type?: string; text?: string; name?: string; input?: unknown }[]) {
                    // ‼️ Thinking is a STEP, and the most expensive kind (see
                    // SessionTurn.steps). The rows are still not rendered — the
                    // model's private working is not conversation — but the
                    // count is no longer missing from the total.
                    if (b?.type === 'thinking' || b?.type === 'redacted_thinking') {
                        if (inTurn > 0) { turnAcc(inTurn).steps++; turnAcc(inTurn).thinking++; }
                    } else if (b?.type === 'text' && b.text?.trim()) {
                        messages.push({
                            role: 'assistant', ts, text: b.text,
                            model: msg.model, tokens: msgTokens, wTokens: Math.round(msgWTokens) || undefined,
                            cost: msgCost, kind: 'say',
                            sidechain: line.isSidechain
                        });
                        if (inTurn > 0) { turnAcc(inTurn).steps++; }
                        msgTokens = 0; msgCost = 0; msgWTokens = 0; // attribute once
                    } else if (b?.type === 'tool_use' && b.name) {
                        toolCalls++;
                        if (inTurn > 0) { turnAcc(inTurn).steps++; }
                        // Tool-only assistant turns still cost tokens — attribute them to the first tool block.
                        messages.push({
                            role: 'tool', ts, tool: b.name,
                            input: clipTool(JSON.stringify(b.input ?? {}, null, 2)),
                            model: msgTokens ? msg.model : undefined,
                            tokens: msgTokens || undefined, wTokens: Math.round(msgWTokens) || undefined,
                            cost: msgCost || undefined, kind: stepKindForTool(b.name),
                            sidechain: line.isSidechain
                        });
                        msgTokens = 0; msgCost = 0; msgWTokens = 0;
                    }
                }
            }
        }
    }

    // Second pass tags each message with its turn (totals were billed in the parse loop,
    // where usage from non-rendering assistant lines is still visible).
    let turnNo = 0;
    const turnLabels: Record<number, string> = {};
    const turnPrompts: Record<number, string> = {};
    const turnTs: Record<number, number> = {};
    // Per-turn tool activity. Counted here rather than in the parse loop because
    // this is where a message finally knows which turn it belongs to — and the
    // turn row said what it SPENT while saying nothing about what it did.
    const turnTools: Record<number, number> = {};
    const turnErrors: Record<number, number> = {};
    const turnToolNames: Record<number, Record<string, number>> = {};
    for (const m of messages) {
        if (m.role === 'user' && !m.sidechain) {
            turnNo++;
            m.turnStart = true;
            turnLabels[turnNo] = promptLabel(m.text ?? '');
            // The opening ask WHOLE, for the hover (media/afTip.js). Only the
            // turn table travels with it and only on demand, so unlike the
            // index's `firstPrompt` this is not a permanent cost.
            turnPrompts[turnNo] = String(m.text ?? '').trim().slice(0, TURN_PROMPT_MAX);
            turnTs[turnNo] = m.ts;
        }
        if (turnNo > 0) {
            m.turn = turnNo;
            if (m.role === 'tool') {
                turnTools[turnNo] = (turnTools[turnNo] ?? 0) + 1;
                const name = m.tool ?? '?';
                const bag = turnToolNames[turnNo] ?? (turnToolNames[turnNo] = {});
                bag[name] = (bag[name] ?? 0) + 1;
            }
            if (m.role === 'toolResult' && m.isError) {
                turnErrors[turnNo] = (turnErrors[turnNo] ?? 0) + 1;
            }
        }
    }
    // Flat per-turn table for the "Turn breakdown" box. `ts` (the opening prompt's
    // time) lets other surfaces deep-link into a turn via openSession(file, focusTs).
    // `models`/`attrs` are verbatim transcript values — see ATTR_KEYS.
    const turns: {
        n: number; label: string; prompt: string; ts: number;
        tokens: number; wTokens: number; cost: number;
        apiCalls: number; steps: number; thinking: number; ms: number; endCtx: number;
        tools: number; errors: number; topTools: { name: string; n: number }[];
        models: string[]; attrs: Record<string, string>;
    }[] = [];
    for (let n = 1; n <= turnNo; n++) {
        const acc = turnTotals[n];
        const startTs = turnTs[n] ?? 0;
        turns.push({
            n, label: turnLabels[n] ?? '',
            // the whole ask, for the hover — see turnPrompts above
            prompt: turnPrompts[n] ?? '',
            tools: turnTools[n] ?? 0,
            errors: turnErrors[n] ?? 0,
            topTools: Object.entries(turnToolNames[n] ?? {})
                .sort((a, b) => b[1] - a[1]).slice(0, 4)
                .map(([name, c]) => ({ name, n: c })),
            ts: startTs,
            tokens: acc?.tokens ?? 0,
            wTokens: Math.round(acc?.wTokens ?? 0),
            cost: acc?.cost ?? 0,
            apiCalls: acc?.apiCalls ?? 0,
            steps: acc?.steps ?? 0,
            thinking: acc?.thinking ?? 0,
            // How long the turn ran: from the prompt to its last recorded line.
            // A turn still running has no end yet — 0, and the surfaces then
            // count from `ts` themselves rather than showing a frozen figure.
            ms: startTs && acc?.endTs && acc.endTs > startTs ? acc.endTs - startTs : 0,
            endCtx: acc?.endCtx ?? 0,
            models: [...(turnModels[n] ?? [])],
            attrs: turnAttrs[n] ?? {}
        });
    }

    const max = deps.maxMessages();
    const truncatedCount = Math.max(0, messages.length - max);

    const sessionId = path.basename(file, '.jsonl');
    // ‼️ S-37 — ONE VERDICT, FROM THE RECORD. The two lines below used to call
    // `sessionOrigin`/`sessionHeadless` themselves, with an object built out of
    // this transcript — and a transcript has no `consoleHosted`, so every
    // conversation held in the Console read as 🤖🌙 automation on its own page
    // while its row in the table read 🧑. Same functions, different evidence.
    // Now the index answers, and the page only decides when nothing has ever
    // indexed this file. See ViewerDeps.originFor.
    const verdict = deps.originFor?.(sessionId);
    /**
     * ‼️ X-251 — WHOSE PLAN PAID, AND THE ID THAT SPENDS IT.
     *
     * '' rather than a guess: a session with no manifest, or one whose launch
     * injected no sign-in, is genuinely unattributed and the page says nothing.
     * "It ran as this machine" would be a claim, and on a farm with five slots
     * under one engine it is the claim most likely to be wrong.
     */
    const acct = deps.accountFor?.(sessionId);
    return {
        file,
        sessionId,
        account: acct?.label ?? '',
        accountId: acct?.id ?? '',
        // X-110 - which provider served it. Always answers; `binding` says which
        // kind of nothing a blank is, so the page never guesses a route.
        identity: deps.identityFor?.(sessionId) ?? null,
        title: deps.titleFor?.(sessionId) || title || '(untitled session)',
        // The shelf mark, so the page can show it and change it — the same fact
        // the Dashboard row's ★ shows, read from the same store.
        pinned: deps.pinnedFor?.(sessionId) === true,
        tags: deps.tagsFor?.(sessionId) ?? [],
        cwd,
        permissionMode,
        // Who started this session — the same 🧑/🤖 distinction the Sessions
        // tables filter on, so opening a transcript says it too, and by the
        // same rule: a run the farm's own record names beats a reading of the
        // entrypoint (see core/sessions.ts sessionOrigin).
        // S-41 — the whole field set, including the two this page has no way of
        // knowing. Written rather than omitted: a missing field used to change
        // the answer without saying so.
        origin: verdict?.origin ?? sessionOrigin({
            entrypoint, consoleHosted: undefined,
            launchedBy: deps.launchedByFor?.(sessionId), agentId: undefined
        }),
        // S-35 — 🌙: an automation run with no terminal behind it. Same rule as
        // the tables', from core/sessions.ts, so the page and the row agree.
        headless: verdict?.headless ?? sessionHeadless({
            entrypoint, consoleHosted: undefined,
            launchedBy: deps.launchedByFor?.(sessionId), agentId: undefined
        }),
        launchedBy: deps.launchedByFor?.(sessionId) ?? null,
        // The badge beside the title — see EngineFor above for why it is asked
        // for rather than worked out.
        engine: deps.engineFor?.(sessionId) || 'claude',
        firstTs,
        lastTs,
        models: [...models],
        usage,
        totalTokens: totalTokens(usage),
        totalWTokens: Math.round(wTokens),
        cost,
        errors,
        toolCalls,
        context: { tokens: ctxTokens, ts: ctxTs, limit: deps.contextLimitFor(ctxModel), model: ctxModel },
        contextSignal: deps.contextSignalFor?.(sessionId) ?? null,
        contextReport,
        turnCount: turnNo,
        turnTotals,
        turns,
        // K-26 — which turns of this conversation are already in the candidate
        // pool, so the band's 🔖 is green from the first paint.
        wikiMarks: wikiMarksOf(sessionId),
        // What this session did to the code, summarised. The hunks themselves
        // are fetched per file on demand ('sessionFileEdits') — a Write of a
        // 3000-line file has no business travelling in every render.
        files: groupByFile(collectEdits(raw.split('\n'))).map(f => {
            const st = fileStats(f);
            return {
                file: f.file, edits: f.edits, written: f.written, failed: f.failed,
                added: st.added, removed: st.removed, turns: f.turns, lastTs: f.lastTs
            };
        }),
        messageCount: messages.length,
        truncatedCount,
        messages: messages.slice(-max)
    };
}

export class SessionViewerPanel {
    private static open = new Map<string, SessionViewerPanel>();
    private disposables: vscode.Disposable[] = [];
    private watcher?: fs.FSWatcher;
    private pushTimer?: NodeJS.Timeout;
    /** When our own Capture-now run last touched the file — its append must not
     *  make the mtime-freshness check read the session as "live". */
    private lastCaptureAt = 0;
    private capturing = false;

    /**
     * focusTs: scroll to (and flash) the message nearest this timestamp — the
     * timeline passes the clicked mark's time so the viewer opens right there.
     *
     * ‼️ `roles` IS THE OPENER'S SCOPE, AND THE PAGE OPENS IN IT. A search made
     * in Dialog is a question about the conversation, so the transcript it
     * lands on has no business opening with every tool call in it: the reader
     * already said what they were looking through. Searched in Everything, the
     * page opens in everything, for exactly the same reason. Only openers that
     * HAVE a scope pass one; a timeline mark or a table row has none and the
     * page keeps its own default (Dialog).
     */
    static show(
        file: string, deps: ViewerDeps, focusTs?: number, roles?: string[], resetView = false
    ): void {
        const existing = SessionViewerPanel.open.get(file);
        if (existing) {
            existing.panel.reveal();
            if (resetView) {
                void existing.panel.webview.postMessage({ type: 'resetView' });
            } else if (focusTs) {
                void existing.panel.webview.postMessage({
                    type: 'focus', ts: focusTs, ...(roles?.length ? { roles } : {})
                });
            }
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.session',
            tabCaption(path.basename(file, '.jsonl')),
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        SessionViewerPanel.open.set(file,
            new SessionViewerPanel(panel, file, deps, focusTs, roles, resetView));
    }

    /** A session renamed anywhere is renamed here too — tab caption included. */
    static refreshOpen(): void {
        for (const p of SessionViewerPanel.open.values()) {
            void p.panel.webview.postMessage({ type: 'data', data: p.viewData(), auto: true });
        }
    }

    private constructor(
        readonly panel: vscode.WebviewPanel,
        private file: string,
        private deps: ViewerDeps,
        focusTs?: number,
        roles?: string[],
        resetView = false
    ) {
        const data = this.viewData();
        if (focusTs) { data.focusTs = focusTs; }
        if (roles?.length) { data.focusRoles = roles; }
        if (resetView) { data.resetView = true; }
        panel.webview.html = htmlShell(
            panel.webview,
            deps.extensionUri,
            'Session Viewer',
            data,
            'sessionViewer.js'
        );
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
        this.watchFile();
        // Speaker-label config lives in the HTML shell (window.__AFUI__), so a
        // settings change needs a re-render, not just a data push.
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('agentFarm.speakerLabelTemplate')
                || e.affectsConfiguration('agentFarm.speakerLabelCase')
                || e.affectsConfiguration('agentFarm.speakerLabelFallback')) {
                this.panel.webview.html = htmlShell(
                    this.panel.webview, this.deps.extensionUri, 'Session Viewer',
                    this.viewData(), 'sessionViewer.js');
            }
        }, null, this.disposables);
    }

    private async saveMarkdown(md: string, cwd: string): Promise<void> {
        const remembered = this.deps.lastExportDir?.();
        const dir = remembered && fs.existsSync(remembered) ? remembered
            : cwd && fs.existsSync(cwd) ? cwd
                : os.homedir();
        const d = new Date();
        const p2 = (n: number) => String(n).padStart(2, '0');
        const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
        const name = `session-${path.basename(this.file, '.jsonl').slice(0, 8)}-${stamp}.md`;
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(dir, name)),
            filters: { Markdown: ['md'] }
        });
        if (!uri) { return; }
        try {
            fs.writeFileSync(uri.fsPath, md, 'utf8');
            this.deps.setLastExportDir?.(path.dirname(uri.fsPath));
            void vscode.window.showTextDocument(uri);
        } catch (e) {
            void vscode.window.showErrorMessage(`Agent Farm: export failed — ${String(e)}`);
        }
    }

    /** buildData + the owner agent (webview data only — buildData itself stays pure). */
    private viewData(): Record<string, unknown> {
        const data = buildData(this.file, this.deps);
        const owner = this.deps.agentForSession?.(this.file, (data.cwd as string) || undefined);
        if (owner) {
            data.agentId = owner.agentId;
            data.agentName = owner.agentName;
        }
        if (this.deps.laneFor?.(this.file)) { data.lane = true; }
        const place = chainPlace(chainIndexNow(), String(data.sessionId ?? ''));
        if (place) {
            data.chain = {
                chainId: place.chainId, leg: place.leg, of: place.legs[place.legs.length - 1]?.leg ?? place.leg,
                prev: place.prev ?? '', next: place.next ?? '', first: place.first, last: place.last, open: place.open
            };
        }
        this.panel.title = tabCaption(String(data.sessionId ?? ''), String(data.title ?? ''));
        return data;
    }

    /**
     * U-167 — ‹ › walk a chain IN THIS TAB, like a browser's history: the
     * panel takes the other leg's transcript (its watcher too). A leg already
     * open in a tab of its own is revealed there instead of opened twice.
     */
    private goTo(file: string): void {
        const other = SessionViewerPanel.open.get(file);
        if (other && other !== this) { other.panel.reveal(); return; }
        SessionViewerPanel.open.delete(this.file);
        this.file = file;
        SessionViewerPanel.open.set(file, this);
        try { this.watcher?.close(); } catch { /* already closed */ }
        this.watchFile();
        this.panel.webview.html = htmlShell(
            this.panel.webview, this.deps.extensionUri, 'Session Viewer', this.viewData(), 'sessionViewer.js');
    }

    /** Live refresh: push fresh data (KPIs, context gauge, new messages) while the session is still running. */
    private watchFile(): void {
        try {
            const base = path.basename(this.file);
            this.watcher = fs.watch(path.dirname(this.file), (_event, filename) => {
                if (filename && filename.toString() !== base) { return; }
                if (this.pushTimer) { clearTimeout(this.pushTimer); }
                this.pushTimer = setTimeout(() => {
                    this.pushTimer = undefined;
                    if (!fs.existsSync(this.file)) { return; }
                    void this.panel.webview.postMessage(
                        { type: 'data', data: this.viewData(), auto: true });
                }, 800);
            });
        } catch { /* watch unavailable — Refresh stays manual */ }
    }

    /** Live check for Capture now: the live monitor is authoritative; a transcript
     *  written to in the last 90s counts as live too (sessions the monitor can't
     *  see, e.g. started outside Agent Farm) — unless the last writer was our own
     *  capture run. */
    /**
     * ‼️ THE ONE PLACE THIS PANEL ASKS "WHICH SESSION AM I?" (X-35).
     *
     * `buildData` parses the transcript and knows the answer — Codex states it
     * in `session_meta.session_id`, Gemini inside its JSON — and two actions on
     * this panel went back to `path.basename(file, '.jsonl')` instead, which is
     * the session id only on Claude. So a Codex viewer asked the live monitor
     * about `rollout-2026-08-12T14-…` and focused a terminal by a name nothing
     * is called: both simply missed, one silently, the other by opening the
     * wrong window.
     */
    private sessionId(): string {
        const id = this.viewData().sessionId;
        return typeof id === 'string' && id ? id : path.basename(this.file, '.jsonl');
    }

    private looksLive(): boolean {
        if (this.deps.isSessionLive?.(this.sessionId())) { return true; }
        try {
            const m = fs.statSync(this.file).mtimeMs;
            if (Date.now() - m < 90_000 && m > this.lastCaptureAt) { return true; }
        } catch { /* file gone — not live */ }
        return false;
    }

    private onMessage(msg: { type: string; [k: string]: unknown }): void {
        // The wiki tagger answers for itself, on every page that draws a badge
        // (K-26 — see wikiMarkMessage in ./base).
        if (wikiMarkMessage(this.panel.webview, msg)) { return; }
        switch (msg.type) {
            case 'openRaw':
                vscode.commands.executeCommand('vscode.open', vscode.Uri.file(this.file));
                break;
            // One step's words onto the clipboard. The webview could do this
            // itself, but `navigator.clipboard` is permission-gated there and a
            // copy that silently failed is worse than no button — so the host
            // writes it and answers, and the button only draws its ✓ then.
            case 'copyStep': {
                const text = typeof msg.text === 'string' ? msg.text : '';
                const idx = typeof msg.idx === 'number' ? msg.idx : -1;
                if (!text) { break; }
                void vscode.env.clipboard.writeText(text).then(
                    () => this.panel.webview.postMessage({ type: 'copied', idx, ok: true }),
                    () => this.panel.webview.postMessage({ type: 'copied', idx, ok: false }));
                break;
            }
            // ---- what the agent did to the code (B3) ----
            case 'sessionFileEdits': {
                // One file's hunks, read on demand. Long hunks are cut here (not
                // in the webview) so a Write of a huge file never travels whole.
                const want = typeof msg.file === 'string' ? msg.file : '';
                let raw = '';
                try { raw = fs.readFileSync(this.file, 'utf8'); } catch { /* gone */ }
                const group = groupByFile(collectEdits(raw.split('\n'))).find(f => f.file === want);
                // High enough that a real edit is never cut; only a Write of a
                // whole large file meets it, and the row says so.
                const CUT = 4000;
                const clip = (t?: string) => {
                    if (t === undefined) { return { text: undefined, clipped: false }; }
                    const lines = t.split('\n');
                    return lines.length > CUT
                        ? { text: lines.slice(0, CUT).join('\n'), clipped: true }
                        : { text: t, clipped: false };
                };
                void this.panel.webview.postMessage({
                    type: 'sessionFileEdits', file: want,
                    records: (group?.records ?? []).map(r => {
                        const o = clip(r.oldText), n = clip(r.newText);
                        return {
                            tool: r.tool, ts: r.ts, turn: r.turn, hunk: r.hunk, failed: !!r.failed,
                            bytes: r.bytes, oldText: o.text, newText: n.text,
                            clipped: o.clipped || n.clipped
                        };
                    })
                });
                break;
            }
            // The session's own page carries the two session-level actions that
            // used to exist only in the side panel's right-click menu.
            case 'resumeConsole': {
                const data = this.viewData();
                void vscode.commands.executeCommand('agentfarm.resumeInConsole', {
                    sessionId: String(data.sessionId ?? ''),
                    title: String(data.title ?? ''),
                    cwd: String(data.cwd ?? ''),
                    agentName: data.agentName,
                    source: data.engine,
                    models: data.models
                });
                break;
            }
            case 'renameSession': {
                const data = this.viewData();
                void vscode.commands.executeCommand('agentfarm.renameSession', {
                    sessionId: String(data.sessionId ?? ''), title: String(data.title ?? '')
                });
                break;
            }
            // The shelf. `wantPinned` is stated rather than left to the command's
            // own toggle: the page knows what it is showing, and a toggle decided
            // twice (here and there) is a race that ends with the star saying one
            // thing and the store holding another. The command re-pushes every
            // open page, so this panel repaints on the answer.
            case 'pinSession': {
                const data = this.viewData();
                void vscode.commands.executeCommand('agentfarm.pinSession', {
                    sessionId: String(data.sessionId ?? ''),
                    title: String(data.title ?? ''),
                    wantPinned: msg.pinned === true
                });
                break;
            }
            case 'openEditedFile':
                if (typeof msg.file === 'string' && msg.file) {
                    void vscode.commands.executeCommand('agentfarm.openEditedFile',
                        { file: msg.file, diff: msg.diff === true });
                }
                break;
            // From a changed file's right-click menu. The path comes from the
            // transcript's own edit records, never from arbitrary webview input.
            case 'revealFile':
                if (typeof msg.file === 'string' && msg.file) {
                    void revealPath(msg.file);
                }
                break;
            case 'ctxCapture': {
                const data = this.viewData();
                if (String(data.engine ?? 'claude') !== 'claude') {
                    void this.panel.webview.postMessage({
                        type: 'ctxCapture', status: 'error',
                        error: 'this engine does not publish Claude /context category reports'
                    });
                    break;
                }
                if (this.capturing) { break; }
                if (this.looksLive()) {
                    // A second writer racing the live TUI on one transcript file is
                    // a risk we don't take — the live path is the terminal itself.
                    void this.panel.webview.postMessage({ type: 'ctxCapture', status: 'live' });
                    break;
                }
                this.capturing = true;
                /**
                 * X-251 — AND IT RESUMES ON THE SIGN-IN THE SESSION RAN ON.
                 *
                 * This spawn continues the USER'S OWN conversation, and it
                 * passed no account: it ran as whatever the VS Code window
                 * happened to hold. Because every slot's projects folder is a
                 * junction onto one shared root the transcript is FOUND either
                 * way, so the failure was silent by construction — the capture
                 * succeeded and the wrong plan paid for it.
                 *
                 * The SLOT ID, not the label: a label is a thing to read.
                 */
                runContextCapture(
                    this.file,
                    typeof msg.cwd === 'string' ? msg.cwd : '',
                    typeof msg.model === 'string' && msg.model ? msg.model : undefined,
                    r => {
                        this.capturing = false;
                        this.lastCaptureAt = Date.now();
                        void this.panel.webview.postMessage(r.ok
                            ? { type: 'ctxCapture', status: 'ok', report: r.report }
                            : { type: 'ctxCapture', status: 'error', error: r.error });
                    },
                    // ‼️ ASKED OF THE HOST, NOT TAKEN FROM THE PAGE. Which plan a
                    // spawn spends is not a fact a webview should be able to
                    // state — the same rule the origin verdict follows two
                    // hundred lines up.
                    this.deps.accountFor?.(path.basename(this.file, '.jsonl'))?.id);
                break;
            }
            case 'resume': {
                const data = this.viewData();
                const sessionId = String(data.sessionId || path.basename(this.file, '.jsonl'));
                const engine = String(data.engine || 'claude');
                if (engine !== 'claude') {
                    // The measured external resume path is the Console transport
                    // (`codex exec resume`, `agy --conversation`). Never feed an
                    // external thread id to `claude --resume` from this page.
                    void vscode.commands.executeCommand('agentfarm.resumeInConsole', {
                        sessionId, source: engine, title: data.title,
                        cwd: data.cwd, agentName: data.agentName, models: data.models
                    });
                    break;
                }
                const cwd = typeof msg.cwd === 'string' && msg.cwd && fs.existsSync(msg.cwd)
                    ? msg.cwd : undefined;
                const name = `claude: ${sessionId.slice(0, 8)}`;
                const command = `claude --resume ${sessionId}`;
                if (this.deps.launchTerminal) {
                    // sessionId known up front (--resume) — the ⌨ button binds instantly
                    this.deps.launchTerminal(name, cwd, command, sessionId);
                    break;
                }
                const terminal = vscode.window.createTerminal({ name, cwd });
                terminal.show();
                // K-33 — the fallback path takes the same gate as the dep does:
                // this is the one that literally sends `claude --resume <id>`.
                sendToTerminalWhenReady(terminal, command);
                break;
            }
            case 'refresh':
                this.panel.webview.postMessage({ type: 'data', data: this.viewData() });
                break;
            case 'chainGo': {
                const sid = typeof msg.sessionId === 'string' ? msg.sessionId : '';
                const file = sid ? this.deps.fileForSession?.(sid) : undefined;
                if (file) { this.goTo(file); } else {
                    void vscode.window.showInformationMessage(`Agent Farm: session ${sid.slice(0, 8)} has no transcript on this machine.`);
                }
                break;
            }
            case 'openAgent': {
                const owner = this.deps.agentForSession?.(this.file,
                    typeof msg.cwd === 'string' && msg.cwd ? msg.cwd : undefined);
                if (owner) {
                    void vscode.commands.executeCommand('agentfarm.openAgentDetail', { agentId: owner.agentId });
                } else {
                    void vscode.window.showInformationMessage(
                        'Agent Farm: this session does not belong to a known agent.');
                }
                break;
            }
            case 'exportChoose': {
                // B-21 — the page sends the view it is showing (roles, text
                // filter, unticked and folded turns, replay position); the two
                // Export-MD questions are asked here, and the document is built
                // by the function sessions.export uses — from the same data the
                // page was drawn from, so the file says what the screen says.
                const sent = (msg.view && typeof msg.view === 'object' ? msg.view : {}) as SessionExportView;
                const cwd = typeof msg.cwd === 'string' ? msg.cwd : '';
                void askExportOptions('collapsed turns', !!msg.hasFolded).then(opts => {
                    if (!opts) { return; }
                    const md = buildSessionMarkdown(this.viewData(), {
                        ...sent, view: opts.view, foldedTitles: opts.foldedTitles, speaker: speakerSettings()
                    });
                    void this.saveMarkdown(md, cwd);
                });
                break;
            }
            // Quick cross-navigation between the three main surfaces.
            case 'openDashboard':
                vscode.commands.executeCommand('agentfarm.openDashboard');
                break;
            case 'openTimeline':
                vscode.commands.executeCommand('agentfarm.openTimeline');
                break;
            case 'afnav':
                if (msg.to === 'search') {
                    // pre-scoped to this session; ✕ in the panel widens to fleet
                    vscode.commands.executeCommand('agentfarm.searchTranscripts', { file: this.file });
                } else { handleAfNav(msg.to); }
                break;
            case 'focusTerminal':
                vscode.commands.executeCommand('agentfarm.focusSessionTerminal', {
                    sessionId: this.sessionId(),
                    cwd: typeof msg.cwd === 'string' ? msg.cwd : undefined
                });
                break;
            case 'openGuide':
                vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
        }
    }

    private dispose(): void {
        SessionViewerPanel.open.delete(this.file);
        try { this.watcher?.close(); } catch { /* already closed */ }
        if (this.pushTimer) { clearTimeout(this.pushTimer); }
        for (const d of this.disposables) { d.dispose(); }
    }
}
