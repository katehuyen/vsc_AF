/**
 * The bridge parity gate — B-11.
 *
 * ‼️ THE SCAN THAT PRODUCED B-3 WAS DONE BY HAND, AND A SCAN DONE BY HAND IS
 * A SCAN THAT ROTS THE DAY IT FINISHES. Six sub-items closed 62 gaps between
 * what the UI can do and what an agent can ask for; the 63rd will be opened by
 * the next feature that ships a button and forgets the op — which is exactly
 * how the first 62 happened, one commit at a time, each of them reasonable on
 * its own. `_REF/agentfarm-dev.md` states the rule; this file is the thing
 * that MEASURES it, so the rule stops depending on somebody remembering.
 *
 * What it does: reads the three places a user-triggerable capability can be
 * declared — `contributes.commands`, the right-click catalogue, and the
 * `case '…':` arms of the panels' own message handlers — and checks every one
 * of them against `parity.manifest.json`, where each capability is recorded
 * with its UI entry points and EITHER the bridge op(s) that do the same thing
 * OR a reasoned exemption. A capability the manifest does not mention fails
 * the build. So does an exemption whose reason is "later".
 *
 * This module is PURE — no vscode, no fs — because the test requires the
 * compiled file and feeds it the real sources (same contract as core/bridge.ts
 * and core/ctxmenu.ts). Everything it needs to know arrives as text.
 */

// ---------------------------------------------------------------------------
// what an exemption may say
// ---------------------------------------------------------------------------

/**
 * ‼️ THE CLOSED LIST. An exemption is not "this one is awkward" — it is one of
 * five things, and anything else is a gap wearing a hat. In particular
 * "we will do it later" is NOT on this list: an unfinished capability belongs
 * in the backlog, where somebody can see it, not in the manifest, where it
 * looks settled.
 */
export const EXEMPT_KINDS = {
    navigation: 'Opens, reveals, focuses or copies to the clipboard. Changes no state and produces no data an agent could ask for.',
    visual: 'A purely visual filter, sort, expand or theme choice — the same data, drawn differently.',
    'file-picker': 'The UI adaptor in front of a capability that IS on the bridge: the picker chooses a path, the core call behind it is the op.',
    secrets: 'The secret vault, deliberately off the bridge (a deliberate security exception — `_REF/bridge.md`).',
    'human-only': 'Documented as requiring a person: an eval run or an A/B experiment whose point is a human judgement.'
} as const;

export type ExemptKind = keyof typeof EXEMPT_KINDS;

/** Words that mean "not decided yet" — refused as a reason, by name. */
const EXCUSE = /\b(later|todo|tbd|for now|not yet|sonra|yapılacak|yapilacak|wip)\b/i;

// ---------------------------------------------------------------------------
// the manifest
// ---------------------------------------------------------------------------

export interface ParityEntry {
    /** Stable name of the thing a person can do. Also the manifest's key. */
    capability: string;
    /**
     * Every UI door onto it: `cmd:agentfarm.addTask`, `page:tasksPanel.ts#add`.
     * One capability, several doors — a command, its right-click item and the
     * page button behind it are the same act and are recorded once.
     */
    ui: string[];
    /** The bridge op(s) that do the same thing. */
    ops?: string[];
    /**
     * ‼️ The symbol BOTH sides must go through — the half of the rule that a
     * list of op names cannot check: an op that REIMPLEMENTS what the page
     * does is a second source of truth, and the day they disagree the bridge
     * is lying.
     *
     * It is normally left out, because the audit DERIVES it: the shared
     * vocabulary of a UI handler and an op handler is computed on every run,
     * and an entry whose two sides share nothing fails. Naming it here pins a
     * particular symbol, for a capability where the automatic answer is not
     * the one that matters.
     */
    core?: string[];
    /**
     * `despite` answers the code when the code is wrong: a handler that writes
     * a scratch file it then opens is still navigation, and saying so in a
     * sentence is the difference between overruling the gate and hiding from
     * it. Without it, a write in a navigation-exempt handler fails the build.
     */
    exempt?: { kind: ExemptKind; why: string; despite?: string };
    /**
     * ‼️ A DOOR THAT ONLY OPENS THE ROOM SAYS WHICH ROOM. Most commands in
     * this extension do not do the thing — they open the page with the right
     * card up, and the page's own handler is the capability (U-14). Naming it
     * here turns "this is only navigation" from prose into something the gate
     * checks: the capability has to exist, and if it is ever deleted or
     * renamed this door stops being explained.
     */
    fronts?: string;
    /**
     * ‼️ AN OPEN GAP, NAMED. Not an exemption — the opposite of one: this
     * capability SHOULD be on the bridge and is not. It is written down rather
     * than exempted so that the number of them is a figure somebody can read,
     * and `gapBudget` makes that figure a ratchet: it may shrink, never grow.
     * A new capability cannot be dropped in here to make the build pass,
     * because the budget would have to be raised in the same commit and that
     * is a line in a diff with somebody's name on it.
     */
    gap?: { why: string };
}

export interface ParityManifest {
    version: number;
    /** The most gaps this build is allowed to carry. Lower it, never raise it. */
    gapBudget: number;
    entries: ParityEntry[];
}

// ---------------------------------------------------------------------------
// reading the sources
// ---------------------------------------------------------------------------

/**
 * Walk TypeScript/JavaScript source keeping track of what is code and what is
 * not. Brace counting over raw text is wrong the moment a string contains `}`
 * — and this repo's `describe` lines are full of prose — so every scan below
 * goes through here rather than through a regex over the whole file.
 */
function scanCode(src: string, from: number, onChar: (i: number, ch: string) => boolean): number {
    let i = from;
    let quote = '';
    let comment: '' | 'line' | 'block' = '';
    while (i < src.length) {
        const ch = src[i];
        const next = src[i + 1];
        if (comment === 'line') {
            if (ch === '\n') { comment = ''; }
            i++; continue;
        }
        if (comment === 'block') {
            if (ch === '*' && next === '/') { comment = ''; i += 2; continue; }
            i++; continue;
        }
        if (quote) {
            if (ch === '\\') { i += 2; continue; }
            if (ch === quote) { quote = ''; }
            i++; continue;
        }
        if (ch === '/' && next === '/') { comment = 'line'; i += 2; continue; }
        if (ch === '/' && next === '*') { comment = 'block'; i += 2; continue; }
        if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; i++; continue; }
        if (onChar(i, ch)) { return i; }
        i++;
    }
    return -1;
}

/** The text from an opening bracket to its match, brackets included. */
function balanced(src: string, open: number): string {
    const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']' };
    const want = pairs[src[open]];
    if (!want) { return ''; }
    let depth = 0;
    const end = scanCode(src, open, (_i, ch) => {
        if (ch === src[open]) { depth++; return false; }
        if (ch === want) { depth--; return depth === 0; }
        return false;
    });
    return end < 0 ? src.slice(open) : src.slice(open, end + 1);
}

export interface UiAction {
    /** `cmd:agentfarm.addTask`, `page:tasksPanel.ts#add`, `ctx:agentfarm.pin` */
    id: string;
    kind: 'command' | 'page' | 'ctx';
    /** The file it is declared in. */
    file: string;
    /** The handler body, as text — what the classifier reads. */
    body: string;
    /**
     * The body PLUS the expressions the host wired to every `deps.<key>` it
     * uses. A panel calls `deps.costReport()` and an op calls `deps.costReport()`
     * — the function underneath is only visible once both are expanded, and
     * that function is the parity being asserted.
     */
    wired?: string;
}

/**
 * Every `agentfarm.*` command that has a handler, with that handler's body.
 * A command contributed in package.json with no registration is a different
 * bug and is caught by `test_ctxmenu.js`; here we want the bodies.
 */
export function discoverCommandHandlers(src: string, file = 'extension.ts'): UiAction[] {
    const out: UiAction[] = [];
    const re = /registerCommand\(\s*'([^']+)'\s*,/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
        const bodyStart = src.indexOf('{', m.index + m[0].length);
        const arrow = src.slice(m.index + m[0].length, bodyStart < 0 ? undefined : bodyStart);
        // `() => Panel.show(x)` has no brace body — take the rest of the call.
        const call = balanced(src, src.indexOf('(', m.index + 'registerCommand'.length));
        const body = /=>\s*\{/.test(arrow) || /\{\s*$/.test(arrow) ? balanced(src, bodyStart) : call;
        out.push({ id: `cmd:${m[1]}`, kind: 'command', file, body: body || call });
    }
    return out;
}

/**
 * Every `case '…':` arm of a panel's message handler, with the code it runs.
 *
 * A page action is a capability in its own right: the button on the page is
 * the only door onto a good many of them, and `agentfarm.ctx.*` relays the
 * same act from the right-click menu. The arm ends at the next `case`, the
 * `default:` or the end of the switch — whichever comes first.
 */
export function discoverPageActions(file: string, src: string): UiAction[] {
    const out: UiAction[] = [];
    const marks: { act: string; at: number; end: number }[] = [];
    // ‼️ Some handlers are an `if (msg.type === '…')` chain, not a switch — 11
    // arms in four panels were doors the gate could not see.
    const re = /case\s+'([^']+)'\s*:|\bif\s*\(\s*(?:msg|m|message)\.type\s*===\s*'([^']+)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
        marks.push({ act: m[1] ?? m[2], at: m.index, end: m.index + m[0].length });
    }
    const bodies = marks.map((mark, i) =>
        src.slice(mark.end, i + 1 < marks.length ? marks[i + 1].at : Math.min(src.length, mark.end + 1200)));
    // ‼️ `case 'approve': case 'reject': …` — the first arm has no body of its
    // own and FALLS THROUGH; its code is the next arm's. Read as the text up to
    // the next `case` it was empty, so the gate saw a door that went nowhere.
    for (let i = bodies.length - 2; i >= 0; i--) {
        if (!withoutComments(bodies[i]).trim()) { bodies[i] = bodies[i + 1]; }
    }
    for (const [i, mark] of marks.entries()) {
        out.push({ id: `page:${file}#${mark.act}`, kind: 'page', file, body: bodies[i] });
    }
    return out;
}

export interface BridgeOpDecl {
    op: string;
    file: string;
    /** Whether the registration really carries a handler — an op in the
     *  catalogue with nothing behind it answers `undefined` and looks fine. */
    hasHandler: boolean;
    hasDescribe: boolean;
    body: string;
    /** As on a UiAction: the body with its wired dependencies folded in. */
    wired?: string;
}

/** A body with every `deps.<key>` it uses replaced by what the host gave that key. */
export function wireBody(body: string, hostSrc: string): string {
    const seen = new Set<string>();
    let out = body;
    for (const m of body.matchAll(/\bdeps\.([A-Za-z_$][\w$]*)/g)) {
        if (seen.has(m[1])) { continue; }
        seen.add(m[1]);
        out += '\n' + valueOfKey(hostSrc, m[1]).join('\n');
    }
    return out;
}

/** Every `{ op, describe, handler }` this build registers, from the source. */
export function discoverOps(sources: { file: string; src: string }[]): BridgeOpDecl[] {
    const out: BridgeOpDecl[] = [];
    for (const { file, src } of sources) {
        const re = /(^|[\s{,])op:\s*'([a-zA-Z0-9_.]+)'/gm;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) {
            // The object literal this `op:` belongs to — back up to its brace.
            let open = src.lastIndexOf('{', m.index);
            while (open > 0 && /[a-zA-Z0-9_$]/.test(src.slice(0, open).trimEnd().slice(-1))) {
                // a `${` inside a template string, not an object literal
                open = src.lastIndexOf('{', open - 1);
            }
            const body = open >= 0 ? balanced(src, open) : '';
            const hasHandler = /(^|[\s{,])handler:/m.test(body);
            const hasDescribe = /(^|[\s{,])describe:/m.test(body);
            /**
             * ‼️ X-231 — A REFERENCE TO AN OP IS NOT A REGISTRATION OF ONE.
             *
             * This matched every `op: '…'` in extension.ts and the core, which was
             * right while the only thing that ever wrote an op name was the registry.
             * `farm.waits` broke that: a wait says WHICH OP ENDS IT, so a plain data
             * table now names `tasks.unpark` and `missions.approve` — and the scanner
             * read those four references as second registrations and failed the build
             * for a duplicate nobody had written.
             *
             * The discriminator is the registry's own contract rather than a file
             * list: a registration is `{ op, describe, handler }`, so an object literal
             * carrying NEITHER is somebody naming an op, not declaring one. The gate
             * keeps its teeth — a registration missing one half still has the other,
             * and is still reported as hollow.
             */
            if (!hasHandler && !hasDescribe) { continue; }
            out.push({ op: m[2], file, hasHandler, hasDescribe, body });
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// classifying what a handler actually does
// ---------------------------------------------------------------------------

/**
 * Calls that move somebody's eyes and nothing else. The list is deliberately
 * short and deliberately literal: the moment "it looked navigational" is a
 * judgement, the classifier starts exempting real capabilities quietly.
 */
const NAVIGATION_ONLY = [
    'showTextDocument', 'openTextDocument', 'revealFileInOS', 'clipboard.writeText',
    'openExternal', 'handleAfNav', 'openGuide', 'reveal(', '.show(', 'refreshIfOpen',
    'showInformationMessage', 'showWarningMessage', 'postMessage', 'executeCommand(\'vscode.open',
    'executeCommand(\'revealInExplorer', 'executeCommand(\'vscode.diff'
];

/**
 * Calls that UNMISTAKABLY change something on disk, in settings or on the
 * machine. Deliberately narrow: this list is what the gate uses to CONTRADICT
 * an exemption ("you called this navigation and it writes files"), so a loose
 * entry here would block a legitimate exemption rather than catch a bad one.
 * A method on a manager is caught by `HOST_STATE` below instead, where the
 * consequence is a proposal being withheld rather than a build being failed.
 */
const STATEFUL = [
    'writeFileSync', 'appendFileSync', 'mkdirSync', 'renameSync', 'unlinkSync', 'rmSync',
    'copyFileSync', 'globalState.update', 'workspaceState.update', 'ConfigurationTarget',
    'spawn(', 'execFile', 'cp.exec('
];

/**
 * ‼️ THE ONLY CALLS A HANDLER MAY MAKE AND STILL BE AUTO-EXEMPTED.
 *
 * "Does it look navigational" is a judgement, and a judgement made by a regex
 * exempts real capabilities quietly. So the generator asks a question with a
 * yes/no answer instead: what does this handler CALL? Every callee is matched
 * against the list below by its last segment, and one name that is not on it
 * — `taskManager.cancel`, `store.save`, anything at all — withholds the
 * proposal and leaves the capability for a person to decide.
 */
const HARMLESS_CALLS = new Set([
    // showing, opening, revealing
    'show', 'reveal', 'refreshIfOpen', 'refreshOpen', 'showTextDocument', 'openTextDocument',
    'showInformationMessage', 'showWarningMessage', 'showErrorMessage', 'showQuickPick',
    'showInputBox', 'showOpenDialog', 'showSaveDialog', 'revealFileInOS', 'openExternal',
    'executeCommand', 'file', 'parse', 'handleAfNav', 'openGuide', 'postMessage', 'postCtx',
    'createWebviewPanel', 'asWebviewUri', 'joinPath', 'writeText',
    // repainting and promise plumbing — the panel telling itself to draw again
    'refresh', 'render', 'dispose', 'then', 'catch', 'finally', 'all', 'race',
    'resolve', 'reject', 'refreshAll', 'repaint',
    // resolving who/what the command is about
    'resolveAgent', 'agentById', 'findAgent', 'agentFor', 'cfg', 'get', 'getAgents',
    // reading
    'existsSync', 'readFileSync', 'statSync', 'readdirSync', 'realpathSync', 'basename',
    'dirname', 'join', 'resolve', 'relative', 'extname', 'normalize', 'isAbsolute',
    // plain language
    'String', 'Number', 'Boolean', 'Array', 'isArray', 'stringify', 'keys', 'values',
    'entries', 'assign', 'from', 'Set', 'Map', 'Date', 'now', 'Error', 'RegExp',
    'filter', 'map', 'find', 'findIndex', 'some', 'every', 'sort', 'slice', 'splice',
    'split', 'concat', 'includes', 'indexOf', 'lastIndexOf', 'trim', 'trimEnd', 'trimStart',
    'toLowerCase', 'toUpperCase', 'replace', 'replaceAll', 'test', 'exec', 'match',
    'matchAll', 'padStart', 'padEnd', 'startsWith', 'endsWith', 'repeat', 'toFixed',
    'push', 'pop', 'shift', 'unshift', 'reduce', 'flat', 'flatMap', 'reverse', 'has',
    'toString', 'valueOf', 'round', 'floor', 'ceil', 'max', 'min', 'abs'
]);

/** The same closed list, readable from a test that has to reason about it. */
export const HARMLESS: ReadonlySet<string> = HARMLESS_CALLS;

/** Every callee in a body, reduced to the name that identifies what it does. */
export function calleesIn(body: string): string[] {
    const out: string[] = [];
    for (const m of body.matchAll(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g)) {
        const parts = m[1].split('.');
        const last = parts[parts.length - 1];
        // `SomePanel.compose` / `composeDuty` — the door shape, whatever it is called
        out.push(/^compose/.test(last) ? 'show' : last);
    }
    return out;
}

/** Control-flow keywords the callee regex picks up; not calls at all. */
const NOT_A_CALL = new Set([
    'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'await', 'function',
    'constructor', 'super', 'void', 'new', 'do', 'else', 'async', 'yield', 'case',
    'instanceof', 'delete', 'in', 'of', 'as', 'satisfies'
]);

/**
 * ‼️ THE COMMONEST DOOR IN THIS EXTENSION IS A DOOR (U-14). Six memory acts,
 * five toolbox acts, the eval cards, the duty forms — the command does not do
 * the thing, it OPENS THE PAGE with the right card up, and the page's own
 * message handler is the capability. Recognising that shape is what keeps the
 * manifest about capabilities instead of about menu entries.
 */
const PANEL_DOOR = /\b[A-Za-z]+Panel\.(show|compose[A-Za-z]*|reveal|refreshIfOpen)\(/;

export interface Classification {
    /** `navigation` = provably eyes-only; `stateful` = provably not;
     *  `unclear` = the body says neither, so a person decides. */
    verdict: 'navigation' | 'stateful' | 'unclear';
    evidence: string[];
}

/**
 * ‼️ WHAT IS ALLOWED TO CONTRADICT AN EXEMPTION — narrower than `STATEFUL` on
 * purpose. Failing a build is a strong move, so it is reserved for evidence
 * that survives a second look: a write to a real file, a change to the user's
 * VS Code settings, a process spawned. Two things deliberately do NOT count.
 * A file written under `tmpdir()` is a scratch buffer for a diff view, not
 * state. And `globalState.update` is as often "remember which section was
 * collapsed" as it is a real record — weak evidence, and a gate that fails on
 * weak evidence teaches people to route around it.
 */
export function contradictsNavigation(body: string): string[] {
    return STATEFUL.filter(s => {
        // Weak evidence: as often "remember which section was collapsed" as a
        // real record.
        if (s === 'globalState.update' || s === 'workspaceState.update') { return false; }
        // Launching the user's chosen viewer is how a document is OPENED on
        // Windows. A spawned process is not, by itself, a change of state.
        if (s === 'spawn(' || s === 'execFile' || s === 'cp.exec(') { return false; }
        return body.includes(s);
    });
}

export function classify(body: string): Classification {
    const hits = STATEFUL.filter(s => body.includes(s));
    if (hits.length) { return { verdict: 'stateful', evidence: hits }; }
    const nav = NAVIGATION_ONLY.filter(s => body.includes(s));
    if (PANEL_DOOR.test(body)) { nav.unshift('opens a page card'); }
    if (nav.length) { return { verdict: 'navigation', evidence: nav }; }
    return { verdict: 'unclear', evidence: [] };
}

/**
 * Stricter than `classify` and used for a different job: whether the generator
 * may PROPOSE an exemption without a person looking. It has to be provably
 * eyes-only AND touch none of the extension's state objects — the gate can
 * afford a false "unclear", it cannot afford a false "exempt".
 */
export function proposeNavigation(body: string): Classification | undefined {
    const c = classify(body);
    if (c.verdict !== 'navigation') { return undefined; }
    const strangers = calleesIn(body)
        .filter(n => !NOT_A_CALL.has(n) && !HARMLESS_CALLS.has(n));
    return strangers.length ? undefined : c;
}

/** Identifiers a file imports from `core/…` — the shared-core vocabulary. */
export function coreImports(src: string): Set<string> {
    const names = new Set<string>();
    // ‼️ `[^}]` AND NOT `[\s\S]*?` — A LAZY SCAN SWALLOWS THE IMPORTS BETWEEN.
    // A specifier list cannot contain a brace, so stopping at one is exact. A
    // lazy scan is not: at `import { A } from 'vscode'` it fails on the first
    // `}` (wrong `from`), backtracks, and runs on until it reaches a core
    // import — capturing `A } from 'vscode'; import { B` as one "name", which
    // matches no identifier and is dropped. B, a real core symbol, silently
    // leaves the vocabulary. Worse, the damage MOVES: adding one core import
    // re-pairs every run of imports below it, so an unrelated capability loses
    // the symbol that proved it shares core with its op and this gate reports
    // drift that is not there. Measured 2026-09-12 — adding `portableState`
    // (S-61) failed `settingsPanel.ts#docOpenSet`, which nothing had touched.
    const re = /import\s*\{([^}]*)\}\s*from\s*'[^']*core\/[^']+'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
        for (const raw of m[1].split(',')) {
            const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
            if (name && /^[A-Za-z_$][\w$]*$/.test(name)) { names.add(name); }
        }
    }
    return names;
}

/**
 * ‼️ A PANEL DOES NOT CALL THE CORE — IT CALLS ITS DEPS, and the host wires
 * those deps to the core (`askMemory: (q) => askFleetMemory(q)`). Without this
 * hop a page action looks as if it goes nowhere, and the evidence that it and
 * an op share a core function is invisible. So: for `deps.<key>(…)` in a page
 * handler, read the value `<key>` was given where the deps object was built,
 * and take the core symbols out of THAT.
 */
export function valueOfKey(src: string, key: string): string[] {
    const out: string[] = [];
    // ‼️ COMMENTS ARE BLANKED FIRST. `…in its own store: a mark` in a doc
    // comment matched `store:` and the scan ran on until a bracket balanced —
    // 38 KB of host code stapled onto every side that used `deps.store`, so
    // two sides with nothing in common "shared" everything. The gate had been
    // green by accident; deleting that sentence turned it red on a capability
    // nobody had touched (measured 2026-09-12).
    const code = withoutComments(src);
    const re = new RegExp(`(^|[\\s{,])${key}\\s*:`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
        const from = m.index + m[0].length;
        let depth = 0;
        const end = scanCode(code, from, (_i, ch) => {
            if ('([{'.includes(ch)) { depth++; return false; }
            if (')]}'.includes(ch)) { depth--; return depth < 0; }
            return depth === 0 && ch === ',';
        });
        const value = code.slice(from, end < 0 ? Math.min(code.length, from + 600) : end);
        out.push(value + hostDeclarationsIn(code, value));
    }
    return out;
}

/**
 * Comments blanked in place — every character keeps its offset, so a scan
 * over the result still indexes the code it pointed at. Only a `//` that owns
 * its line is blanked: `'https://…'` inside a string must survive.
 */
const blankCache = new Map<string, string>();
export function withoutComments(src: string): string {
    let b = blankCache.get(src);
    if (b === undefined) {
        b = src
            .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\r\n]/g, ' '))
            .replace(/(^|\n)([ \t]*)\/\/[^\r\n]*/g, (m, lead, indent) =>
                lead + indent + ' '.repeat(m.length - lead.length - indent.length));
        if (blankCache.size > 64) { blankCache.clear(); }
        blankCache.set(src, b);
    }
    return b;
}

/**
 * ‼️ A DEP VALUE THAT IS A BARE NAME IS READ THROUGH TO WHAT THE HOST BUILT.
 * `store: docOpenStore` and `setDocOpen: (p) => docOpenStore.set(p)` share
 * nothing as text; the host's `const docOpenStore = new DocOpenStore(…)` is
 * where both were handed the same object, and `convertToQueue:
 * convertNoticeToQueue` names a function whose BODY is the act. One hop, the
 * initializer only, capped — enough to see the core class or the store
 * methods both sides go through, not enough to staple the host onto a side.
 */
function hostDeclarationsIn(code: string, value: string): string {
    let extra = '';
    const seen = new Set<string>();
    for (const m of value.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
        const id = m[1];
        if (id.length <= 3 || seen.has(id) || NOT_A_CALL.has(id)) { continue; }
        seen.add(id);
        const decl = new RegExp(`\\b(?:const|let)\\s+${id}\\s*(?::\\s*[^=;]+)?=(?![=>])`).exec(code);
        if (!decl) { continue; }
        const from = decl.index + decl[0].length;
        let depth = 0;
        const end = scanCode(code, from, (_i, ch) => {
            if ('([{'.includes(ch)) { depth++; return false; }
            if (')]}'.includes(ch)) { depth--; return depth < 0; }
            return depth === 0 && ch === ';';
        });
        extra += '\n' + code.slice(from, Math.min(end < 0 ? code.length : end, from + 2500));
    }
    return extra;
}

/**
 * The vocabulary a page handler shares with the bridge.
 *
 * Two kinds of name qualify, and only two. The DEP KEY itself — `askMemory`,
 * `distill`, `setPendingMerge` — because a bridge module that was handed the
 * same callback calls it by the same name, and two surfaces calling one
 * wired-up function by one name is exactly the parity being asserted. And any
 * CORE symbol that turns up in the expression the host gave that key, because
 * that is the function underneath both. Nothing else: a coincidental
 * identifier recorded as "the shared core" would make the gate look green
 * while checking nothing.
 */
export function depsVocabulary(body: string, hostSrc: string, hostCore: Set<string>): Set<string> {
    const found = new Set<string>();
    for (const m of body.matchAll(/\bdeps\.([A-Za-z_$][\w$]*)/g)) {
        found.add(m[1]);
        for (const value of valueOfKey(hostSrc, m[1])) {
            for (const sym of hostCore) {
                if (new RegExp(`\\b${sym}\\b`).test(value)) { found.add(sym); }
            }
        }
    }
    return found;
}

/**
 * The METHOD names a handler calls on something that is not plain language.
 *
 * Most of this extension's state is reached through a manager rather than
 * through an imported function — `taskManager.cancelTask(row)` on the command
 * side, and the op that cancels a task calls the very same method. That shared
 * method name is the evidence, and without it every manager-mediated
 * capability would look as if it and its op had nothing to do with each other.
 */
export function methodVocabulary(body: string): Set<string> {
    const out = new Set<string>();
    for (const m of body.matchAll(/\.([A-Za-z_$][\w$]*)\s*\(/g)) {
        const name = m[1];
        if (name.length > 3 && !HARMLESS_CALLS.has(name) && !NOT_A_CALL.has(name)) {
            out.add(name);
        }
    }
    return out;
}

/**
 * ‼️ THE ONE PIECE OF EVIDENCE THAT A BUTTON AND AN OP ARE THE SAME ACT: they
 * go through the same core function. Names lie (`agentfarm.startTask` vs
 * `tasks.runNext`), bodies do not — so a mapping is proposed only where a core
 * symbol the UI actually calls turns up inside an op's handler, and that
 * symbol is then recorded as the entry's `core`, where the gate re-checks it
 * on every build. A symbol so common that half the catalogue uses it proves
 * nothing and is ignored.
 */
export function suggestMapping(
    uiBodies: string[],
    vocabulary: Set<string>,
    ops: BridgeOpDecl[],
    maxOpsPerSymbol = 3
): { ops: string[]; core: string[] } | undefined {
    const used = [...vocabulary].filter(sym =>
        sym.length > 3 && uiBodies.some(b => new RegExp(`\\b${sym}\\b`).test(b)));
    const opsOut = new Set<string>();
    const coreOut = new Set<string>();
    for (const sym of used) {
        const re = new RegExp(`\\b${sym}\\b`);
        const hits = ops.filter(o => re.test(o.body));
        if (!hits.length || hits.length > maxOpsPerSymbol) { continue; }
        coreOut.add(sym);
        for (const h of hits) { opsOut.add(h.op); }
    }
    return opsOut.size ? { ops: [...opsOut].sort(), core: [...coreOut].sort() } : undefined;
}

// ---------------------------------------------------------------------------
// the audit
// ---------------------------------------------------------------------------

export interface ParityWorld {
    ui: UiAction[];
    ops: BridgeOpDecl[];
    /**
     * The names a UI handler could share with an op and MEAN something by it:
     * core imports and the deps keys the host wired to them. Supplied by the
     * caller because it takes the host source to work out, and computed once
     * per action rather than once per comparison.
     */
    vocabularyOf(action: UiAction): Set<string>;
}

export interface ParityProblem {
    kind: 'unlisted' | 'stale' | 'duplicate' | 'no-answer' | 'bad-exemption'
    | 'wrong-exemption' | 'missing-op' | 'no-handler' | 'no-core' | 'core-drift'
    | 'dangling-front';
    subject: string;
    detail: string;
}

/**
 * Everything that is wrong between the manifest and the build, as a list. An
 * empty list is the only passing answer — the test prints them and fails.
 */
export function auditParity(manifest: ParityManifest, world: ParityWorld): ParityProblem[] {
    const problems: ParityProblem[] = [];
    const uiById = new Map(world.ui.map(u => [u.id, u]));
    const opByName = new Map(world.ops.map(o => [o.op, o]));
    const known = new Set(manifest.entries.map(e => e.capability));

    // ---- every UI door is owned by exactly one capability
    const owner = new Map<string, string>();
    for (const entry of manifest.entries) {
        for (const id of entry.ui) {
            const already = owner.get(id);
            if (already) {
                problems.push({
                    kind: 'duplicate', subject: id,
                    detail: `claimed by both "${already}" and "${entry.capability}" — a door belongs to one capability`
                });
            }
            owner.set(id, entry.capability);
            if (!uiById.has(id)) {
                problems.push({
                    kind: 'stale', subject: id,
                    detail: `"${entry.capability}" lists a UI entry point that no longer exists — delete it or fix the id`
                });
            }
        }
    }
    for (const action of world.ui) {
        if (owner.has(action.id)) { continue; }
        const verdict = classify(action.body).verdict;
        problems.push({
            kind: 'unlisted', subject: action.id,
            detail: verdict === 'navigation'
                ? 'not in parity.manifest.json — it reads as navigation, so add it with an exemption saying so'
                : 'not in parity.manifest.json — a user-triggerable action is recorded with its bridge op(s) or a reasoned exemption'
        });
    }

    // ---- every capability answers the question
    for (const entry of manifest.entries) {
        const ops = entry.ops ?? [];
        if (entry.gap) {
            if (ops.length || entry.exempt) {
                problems.push({
                    kind: 'bad-exemption', subject: entry.capability,
                    detail: 'recorded as an open gap AND answered — a gap is what is left when neither answer is true'
                });
            } else if ((entry.gap.why ?? '').trim().length < 12) {
                problems.push({
                    kind: 'bad-exemption', subject: entry.capability,
                    detail: 'a gap says what the missing op would have to do — that sentence is the next person\'s brief'
                });
            }
            continue;
        }
        if (!ops.length && !entry.exempt) {
            problems.push({
                kind: 'no-answer', subject: entry.capability,
                detail: 'neither a bridge op nor an exemption — one of the two is the whole point of the record'
            });
            continue;
        }
        if (entry.exempt) {
            if (ops.length) {
                problems.push({
                    kind: 'bad-exemption', subject: entry.capability,
                    detail: 'it is both exempt and mapped to an op — say which'
                });
            }
            if (!(entry.exempt.kind in EXEMPT_KINDS)) {
                problems.push({
                    kind: 'bad-exemption', subject: entry.capability,
                    detail: `"${entry.exempt.kind}" is not one of: ${Object.keys(EXEMPT_KINDS).join(', ')}`
                });
            }
            const why = (entry.exempt.why ?? '').trim();
            if (why.length < 12) {
                problems.push({
                    kind: 'bad-exemption', subject: entry.capability,
                    detail: 'the reason has to be a sentence somebody can disagree with'
                });
            } else if (EXCUSE.test(why)) {
                problems.push({
                    kind: 'bad-exemption', subject: entry.capability,
                    detail: `"${why}" is a plan, not an exemption — an unfinished capability belongs in the backlog`
                });
            }
            // ‼️ A door that only opens a room has to say which room, and the
            // room has to be there. Rename the capability behind it and this
            // exemption stops explaining anything — which is the moment to
            // notice, not months later.
            if (entry.fronts !== undefined) {
                if (entry.exempt.kind !== 'navigation') {
                    problems.push({
                        kind: 'dangling-front', subject: entry.capability,
                        detail: '`fronts` says "this only opens the surface" — that is a navigation exemption or nothing'
                    });
                } else if (!known.has(entry.fronts)) {
                    problems.push({
                        kind: 'dangling-front', subject: entry.capability,
                        detail: `fronts "${entry.fronts}", which is not a capability in this manifest`
                    });
                } else if (entry.fronts === entry.capability) {
                    problems.push({
                        kind: 'dangling-front', subject: entry.capability,
                        detail: 'fronts itself — a door cannot be its own room'
                    });
                }
            }
            // ‼️ And the code gets a vote: a handler that demonstrably writes
            // cannot be exempt as navigation, whatever the sentence says.
            if (entry.exempt.kind === 'navigation' || entry.exempt.kind === 'visual') {
                for (const id of entry.ui) {
                    const action = uiById.get(id);
                    if (!action) { continue; }
                    const hits = contradictsNavigation(action.body);
                    if (hits.length && (entry.exempt.despite ?? '').trim().length < 12) {
                        problems.push({
                            kind: 'wrong-exemption', subject: entry.capability,
                            detail: `${id} is exempt as ${entry.exempt.kind}, but its handler calls ${hits.slice(0, 3).join(', ')}`
                        });
                    }
                }
            }
            continue;
        }

        // ---- mapped: the op has to be there, and be real
        for (const op of ops) {
            const decl = opByName.get(op);
            if (!decl) {
                problems.push({
                    kind: 'missing-op', subject: entry.capability,
                    detail: `"${op}" is not registered anywhere — the catalogue is built from these declarations`
                });
                continue;
            }
            if (!decl.hasHandler || !decl.hasDescribe) {
                problems.push({
                    kind: 'no-handler', subject: entry.capability,
                    detail: `"${op}" is registered without a ${decl.hasHandler ? 'describe' : 'handler'}`
                });
            }
        }

        // ---- …and both sides go through the same core
        //
        // ‼️ DERIVED, NOT DECLARED. What makes a button and an op the same act
        // is that they end in the same function; asking a person to retype
        // that name into the manifest only records what they believed. So the
        // shared vocabulary is computed here, every run, and an entry whose
        // two sides have nothing in common is the exact failure this gate
        // exists for — an op that reimplements the page.
        const actions = entry.ui.map(id => uiById.get(id)).filter(Boolean) as UiAction[];
        const opDecls = ops.map(o => opByName.get(o)).filter(Boolean) as BridgeOpDecl[];
        if (!actions.length || !opDecls.length) { continue; }
        const shared = new Set<string>();
        for (const action of actions) {
            const left = action.wired ?? action.body;
            for (const symbol of world.vocabularyOf(action)) {
                if (symbol.length <= 3) { continue; }
                const re = new RegExp(`\\b${symbol}\\b`);
                if (re.test(left) && opDecls.some(o => re.test(o.wired ?? o.body))) { shared.add(symbol); }
            }
        }
        if (!shared.size) {
            problems.push({
                kind: 'core-drift', subject: entry.capability,
                detail: `nothing links ${entry.ui.join(', ')} to ${ops.join(', ')} — no core function or wired dependency appears on both sides, so the op is either the wrong one or a second implementation`
            });
        }
        // An explicitly pinned symbol is checked as well as derived.
        for (const symbol of entry.core ?? []) {
            const inUi = actions.some(a => a.body.includes(symbol));
            const inOp = opDecls.some(o => o.body.includes(symbol));
            if (!inUi || !inOp) {
                problems.push({
                    kind: 'core-drift', subject: entry.capability,
                    detail: `"${symbol}" is pinned as the shared core but appears only on the ${inUi ? 'UI' : 'bridge'} side`
                });
            }
        }
    }
    return problems;
}

/** A one-line count for the test's summary — no hard-coded totals anywhere. */
export function parityCoverage(manifest: ParityManifest): {
    capabilities: number; mapped: number; exempt: number; gaps: number; doors: number;
    byExemption: Record<string, number>;
} {
    const byExemption: Record<string, number> = {};
    let mapped = 0, exempt = 0, gaps = 0, doors = 0;
    for (const e of manifest.entries) {
        doors += e.ui.length;
        if (e.gap) { gaps++; } else if (e.exempt) {
            exempt++;
            byExemption[e.exempt.kind] = (byExemption[e.exempt.kind] ?? 0) + 1;
        } else if (e.ops?.length) { mapped++; }
    }
    return { capabilities: manifest.entries.length, mapped, exempt, gaps, doors, byExemption };
}
