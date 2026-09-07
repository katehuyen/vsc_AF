/*
 * ‼️ THE EXTENSION ACTUALLY TURNS ON.
 *
 * Every other file in this suite tests a piece. Not one of them had ever called
 * `activate()`, and on 2026-09-06 that gap cost the user a working extension:
 * 3.399.0…3.399.3 shipped with a `const` read from inside a closure that a
 * constructor called before the declaration ran — a temporal dead zone. The
 * suite was green (298 files, 18 972 assertions), the vsix verified 16/16, the
 * package installed, and the extension threw
 *
 *     ReferenceError: Cannot access 'storedAccounts' before initialization
 *
 * on the first line of activate(). Nothing registered. Every page in the
 * product answered "command not found". A test that fails silently is not a
 * test (Principle 1): the suite could not see the one failure that matters more
 * than all the others, because being able to open the extension is the
 * precondition of everything the other 18 972 assertions describe.
 *
 * So this file does the only thing that can catch that class: it loads the
 * COMPILED extension against a stand-in `vscode`, calls `activate()`, and
 * insists it comes back having registered its commands. Ordering bugs,
 * import-time throws, a missing `out/` file, a constructor that reads a setting
 * that no longer exists — all of them land here and nowhere else.
 *
 * ‼️ WHAT THE STAND-IN IS AND IS NOT. It is a recording no-op: every property
 * is answered, every call returns another no-op, and `workspace.getConfiguration`
 * hands back the DEFAULT of whatever is asked for. So this is activation on a
 * machine with an untouched configuration — the coldest start there is, and the
 * one a first install actually gets. It is not a functional test of any surface;
 * a surface that needs settings to be interesting is tested by its own file.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');

/*
 * ‼️ X-265 — AND THE STAND-IN WAS NOT ENOUGH: THIS TEST WAS ACTIVATING THE
 * EXTENSION AGAINST THE USER'S REAL MACHINE.
 *
 * The comment above says "activation on a machine with an untouched
 * configuration". It was not, and the gap is exactly one function:
 * `cfgValueRaw` (`core/settingsDoor.ts`) asks the vscode registry FIRST and,
 * when it answers `undefined` — which the stand-in always does, because it hands
 * back the default and there is no default to hand — falls back to READING THE
 * USER'S OWN settings.json OFF THE DISK. So `activate()` here ran with this
 * machine's real `agentFarm.*` values, `os.homedir()` pointed at the real home,
 * and every `fs` write inside activation landed on the developer's own machine.
 *
 * Measured 2026-09-07: a suite run rewrote `~/.claude/settings.json` and created
 * a settings file in all three captured account directories. Nothing was
 * damaged — the writes were the ones the feature under test is supposed to make
 * — but "the test suite edits the machine it runs on" is true either way, and
 * the next fs write in activation might not be so harmless.
 *
 * So the sandbox is made real before anything is required: the home and the
 * three Windows profile variables point at an empty temp directory, which is
 * what `os.homedir()` and `vscodeUserSettingsFile()` both read. Now the file
 * tests what its own first paragraph promises — the coldest start there is.
 */
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'af-activation-'));
for (const [k, v] of Object.entries({
    USERPROFILE: SANDBOX,
    HOME: SANDBOX,
    APPDATA: path.join(SANDBOX, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(SANDBOX, 'AppData', 'Local'),
    XDG_CONFIG_HOME: path.join(SANDBOX, '.config')
})) {
    process.env[k] = v;
    try { fs.mkdirSync(v, { recursive: true }); } catch { /* best effort */ }
}

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'extension.js');

// ---------- the stand-in ----------
/*
 * A Proxy that answers anything: reading a property gives another one, calling
 * it gives another one, `new`-ing it gives another one. That is enough for the
 * whole vscode namespace EXCEPT the handful of places where the extension reads
 * a real value back out of what it was given — those are written out below,
 * because a Proxy that returns a Proxy where a string was expected turns a
 * crash into a wrong answer, and a wrong answer is the thing we came to catch.
 */
const registered = { commands: [], views: [], disposables: 0 };

const anyNode = (label) => {
    const target = function () { };
    target.__af = label;
    return new Proxy(target, {
        get(_t, prop) {
            if (prop === 'then') { return undefined; }              // not a thenable
            if (prop === Symbol.toPrimitive) { return () => label; }
            if (prop === 'toString') { return () => label; }
            if (prop === Symbol.iterator) { return function* () { }; }
            if (prop === 'dispose') { return () => { registered.disposables++; }; }
            return anyNode(label + '.' + String(prop));
        },
        apply() { return anyNode(label + '()'); },
        construct() { return anyNode('new ' + label); },
        has() { return true; }
    });
};

const disposable = () => ({ dispose() { registered.disposables++; } });

class FakeEventEmitter {
    constructor() { this.listeners = []; }
    get event() {
        return (fn) => { this.listeners.push(fn); return disposable(); };
    }
    fire(v) { for (const fn of this.listeners) { try { fn(v); } catch { /* the host swallows these too */ } } }
    dispose() { this.listeners.length = 0; }
}

const fakeUri = (p) => ({
    fsPath: p, path: p.replace(/\\/g, '/'), scheme: 'file', toString: () => 'file://' + p,
    with: () => fakeUri(p)
});

const vscodeStub = {
    version: '1.90.0',
    Uri: {
        file: fakeUri,
        parse: (s) => fakeUri(String(s)),
        joinPath: (u, ...bits) => fakeUri(path.join(u.fsPath, ...bits.map(String)))
    },
    EventEmitter: FakeEventEmitter,
    Disposable: class { constructor(fn) { this._fn = fn; } dispose() { registered.disposables++; if (this._fn) { this._fn(); } } },
    ThemeIcon: class { constructor(id, color) { this.id = id; this.color = color; } },
    ThemeColor: class { constructor(id) { this.id = id; } },
    TreeItem: class { constructor(label, state) { this.label = label; this.collapsibleState = state; } },
    MarkdownString: class {
        constructor(v) { this.value = v || ''; this.isTrusted = false; this.supportHtml = false; }
        appendMarkdown(v) { this.value += v; return this; }
        appendText(v) { this.value += v; return this; }
    },
    Position: class { constructor(l, c) { this.line = l; this.character = c; } },
    Range: class { constructor(a, b, c, d) { Object.assign(this, { a, b, c, d }); } },
    Selection: class { constructor(a, b, c, d) { Object.assign(this, { a, b, c, d }); } },
    RelativePattern: class { constructor(base, pattern) { this.base = base; this.pattern = pattern; } },
    CancellationTokenSource: class {
        constructor() { this.token = { isCancellationRequested: false, onCancellationRequested: () => disposable() }; }
        cancel() { this.token.isCancellationRequested = true; }
        dispose() { }
    },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ViewColumn: { Active: -1, Beside: -2, One: 1, Two: 2, Three: 3 },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    ExtensionMode: { Production: 1, Development: 2, Test: 3 },
    ProgressLocation: { SourceControl: 1, Window: 10, Notification: 15 },
    UIKind: { Desktop: 1, Web: 2 },
    TextEditorRevealType: { Default: 0, InCenter: 1, InCenterIfOutsideViewport: 2, AtTop: 3 },
    QuickPickItemKind: { Separator: -1, Default: 0 },
    TerminalLocation: { Panel: 1, Editor: 2 },
    FileType: { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 },
    env: {
        appName: 'Visual Studio Code', uriScheme: 'vscode', language: 'en',
        machineId: 'af-test', sessionId: 'af-test-session', uiKind: 1,
        openExternal: async () => true,
        clipboard: { writeText: async () => { }, readText: async () => '' },
        asExternalUri: async (u) => u
    },
    commands: {
        registerCommand: (id, fn) => { registered.commands.push({ id, fn }); return disposable(); },
        registerTextEditorCommand: (id, fn) => { registered.commands.push({ id, fn }); return disposable(); },
        executeCommand: async () => undefined,
        getCommands: async () => registered.commands.map(c => c.id)
    },
    window: {
        activeTextEditor: undefined,
        visibleTextEditors: [],
        terminals: [],
        activeTerminal: undefined,
        tabGroups: { all: [], onDidChangeTabs: () => disposable(), close: async () => true },
        createStatusBarItem: () => ({
            text: '', tooltip: '', command: undefined, color: undefined, backgroundColor: undefined,
            alignment: 2, priority: 0, name: '', accessibilityInformation: undefined,
            show() { }, hide() { }, dispose() { registered.disposables++; }
        }),
        createOutputChannel: () => ({
            name: 'af', append() { }, appendLine() { }, replace() { }, clear() { },
            show() { }, hide() { }, dispose() { registered.disposables++; }
        }),
        createTreeView: (id, opts) => {
            registered.views.push(id);
            return {
                visible: false, selection: [], title: '', description: '', badge: undefined,
                message: '', onDidChangeVisibility: () => disposable(),
                onDidChangeSelection: () => disposable(), onDidExpandElement: () => disposable(),
                onDidCollapseElement: () => disposable(), onDidChangeCheckboxState: () => disposable(),
                reveal: async () => { }, dispose() { registered.disposables++; },
                _provider: opts && opts.treeDataProvider
            };
        },
        registerTreeDataProvider: (id) => { registered.views.push(id); return disposable(); },
        registerWebviewViewProvider: (id) => { registered.views.push(id); return disposable(); },
        registerWebviewPanelSerializer: () => disposable(),
        registerUriHandler: () => disposable(),
        registerTerminalLinkProvider: () => disposable(),
        registerFileDecorationProvider: () => disposable(),
        createWebviewPanel: () => anyNode('webviewPanel'),
        createTerminal: () => anyNode('terminal'),
        createQuickPick: () => anyNode('quickPick'),
        createInputBox: () => anyNode('inputBox'),
        showInformationMessage: async () => undefined,
        showWarningMessage: async () => undefined,
        showErrorMessage: async () => undefined,
        showQuickPick: async () => undefined,
        showInputBox: async () => undefined,
        showOpenDialog: async () => undefined,
        showSaveDialog: async () => undefined,
        showTextDocument: async () => anyNode('textEditor'),
        withProgress: async (_o, fn) => fn({ report() { } }, { isCancellationRequested: false, onCancellationRequested: () => disposable() }),
        setStatusBarMessage: () => disposable(),
        onDidChangeActiveTextEditor: () => disposable(),
        onDidChangeVisibleTextEditors: () => disposable(),
        onDidChangeTextEditorSelection: () => disposable(),
        onDidCloseTerminal: () => disposable(),
        onDidOpenTerminal: () => disposable(),
        onDidChangeActiveTerminal: () => disposable(),
        onDidChangeWindowState: () => disposable(),
        onDidChangeActiveColorTheme: () => disposable(),
        state: { focused: true, active: true }
    },
    workspace: {
        workspaceFolders: undefined,
        name: undefined,
        rootPath: undefined,
        fs: {
            readFile: async () => new Uint8Array(),
            writeFile: async () => { },
            stat: async () => ({ type: 1, ctime: 0, mtime: 0, size: 0 }),
            readDirectory: async () => [],
            createDirectory: async () => { },
            delete: async () => { }
        },
        // ‼️ THE DEFAULT IS THE ANSWER. A cold machine has no settings written,
        // so every reader gets the fallback it declared — which is exactly the
        // configuration a first install activates under.
        getConfiguration: () => ({
            get: (_key, dflt) => dflt,
            has: () => false,
            inspect: () => undefined,
            update: async () => { }
        }),
        onDidChangeConfiguration: () => disposable(),
        onDidSaveTextDocument: () => disposable(),
        onDidOpenTextDocument: () => disposable(),
        onDidCloseTextDocument: () => disposable(),
        onDidChangeTextDocument: () => disposable(),
        onDidChangeWorkspaceFolders: () => disposable(),
        createFileSystemWatcher: () => ({
            onDidCreate: () => disposable(), onDidChange: () => disposable(),
            onDidDelete: () => disposable(), dispose() { registered.disposables++; }
        }),
        openTextDocument: async () => anyNode('textDocument'),
        applyEdit: async () => true,
        asRelativePath: (p) => String(p && p.fsPath ? p.fsPath : p),
        getWorkspaceFolder: () => undefined,
        findFiles: async () => []
    },
    languages: {
        registerHoverProvider: () => disposable(),
        registerCodeLensProvider: () => disposable(),
        createDiagnosticCollection: () => anyNode('diagnostics')
    },
    extensions: { getExtension: () => undefined, all: [], onDidChange: () => disposable() },
    authentication: { getSession: async () => undefined, onDidChangeSessions: () => disposable() }
};

// ---------- the fake context ----------
const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'af-activate-'));
const memento = () => {
    const map = new Map();
    return {
        get: (k, d) => (map.has(k) ? map.get(k) : d),
        update: async (k, v) => { map.set(k, v); },
        keys: () => [...map.keys()],
        setKeysForSync: () => { }
    };
};
const extRoot = path.join(__dirname, '..');
const context = {
    subscriptions: [],
    globalState: memento(),
    workspaceState: memento(),
    secrets: {
        get: async () => undefined, store: async () => { }, delete: async () => { },
        onDidChange: () => disposable()
    },
    extensionUri: fakeUri(extRoot),
    extensionPath: extRoot,
    globalStorageUri: fakeUri(path.join(storage, 'global')),
    globalStoragePath: path.join(storage, 'global'),
    storageUri: fakeUri(path.join(storage, 'workspace')),
    storagePath: path.join(storage, 'workspace'),
    logUri: fakeUri(path.join(storage, 'log')),
    logPath: path.join(storage, 'log'),
    extensionMode: 3,
    environmentVariableCollection: anyNode('envVarCollection'),
    asAbsolutePath: (p) => path.join(extRoot, p),
    extension: { id: 'muvusoft.agent-farm', packageJSON: require(path.join(extRoot, 'package.json')) }
};

// ---------- run it ----------
(async () => {
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') { return vscodeStub; }
        return origLoad.apply(this, arguments);
    };

    let mod, importError, activateError;
    try {
        mod = require(OUT);
    } catch (e) {
        importError = e;
    }

    ok('out/extension.js loads (compiled, and its imports resolve)',
        !importError || (console.log('  ↳ ' + (importError && importError.stack || importError)), false));

    if (mod) {
        ok('it exports activate()', typeof mod.activate === 'function');
        try {
            await mod.activate(context);
        } catch (e) {
            activateError = e;
        }
    }

    /*
     * ‼️ THIS IS THE ASSERTION THE PRODUCT LIVES ON. If activate() throws, the
     * user has no extension at all — not a broken page, no pages. The stack is
     * printed because the whole value of catching it here rather than in the
     * VS Code log is that it names the line.
     */
    ok('activate() completes without throwing',
        !activateError || (console.log('  ↳ ' + (activateError && activateError.stack || activateError)), false));

    // A silent activate() that registers nothing would satisfy the line above
    // and still leave every surface answering "command not found" — the exact
    // symptom of the 3.399.x break. So the count is part of the claim.
    ok('commands are registered (the surfaces have doors)', registered.commands.length > 50);
    ok('the tree views are registered', registered.views.length > 0);
    ok('activate() files its disposables on the context', context.subscriptions.length > 10);

    // Every id VS Code is told about in package.json must exist after activation,
    // or the palette offers a command that answers "not found" — which is how
    // the 3.399.x failure showed itself to the user.
    const declared = (context.extension.packageJSON.contributes.commands || []).map(c => c.command);
    const live = new Set(registered.commands.map(c => c.id));
    const missing = declared.filter(id => !live.has(id));
    ok('every command package.json declares is actually registered'
        + (missing.length ? ' — missing: ' + missing.slice(0, 12).join(', ') : ''),
        missing.length === 0);

    // ‼️ X-265 — AND THE SANDBOX IS CHECKED, not assumed. A test that quietly
    // stopped being isolated is how this file came to edit the machine it runs
    // on; the assertion is cheap and it is the only thing standing between the
    // next fs write inside activate() and somebody's real configuration.
    ok('‼️ activation ran against a sandbox home, not the developer\'s machine',
        os.homedir() === SANDBOX
        && !fs.existsSync(path.join(os.homedir(), '.claude', 'settings.json')));

    Module._load = origLoad;
    try { fs.rmSync(storage, { recursive: true, force: true }); } catch { /* temp dir */ }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch { /* temp dir */ }

    console.log(`test_activation.js: ${pass} passed, ${fail} failed`);
    // ‼️ activate() leaves timers and watchers running — the same ones that keep
    // the extension alive in the host. Nothing here disposes them, so the
    // process is told to end rather than waited on.
    process.exit(fail ? 1 : 0);
})();
