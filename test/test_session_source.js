// E3: sessionSource — live-events store → external SessionInfo; cache; fail-soft;
// SessionIndex side list keeps all()/forAgent() claude-only.
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

class Emitter {
    constructor() { this.handlers = []; }
    get event() { return (fn) => { this.handlers.push(fn); return { dispose() { } }; }; }
    fire(v) { for (const h of this.handlers) h(v); }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: Emitter,
    window: {
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined)
    },
    commands: { executeCommand: () => Promise.resolve(undefined) },
    Disposable: class { dispose() { } }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.apply(this, arguments);
};
const { buildExternalSessions, liveEventsSource } = require(require('path').resolve(__dirname, '../out/core/sessionSource.js'));
const { SessionIndex } = require(require('path').resolve(__dirname, '../out/core/sessions.js'));
const { PricingEngine } = require(require('path').resolve(__dirname, '../out/core/pricing.js'));

let pass = 0, fail = 0;
const eq = (n, got, want) => {
    if (JSON.stringify(got) === JSON.stringify(want)) { pass++; }
    else { fail++; console.log(`  FAIL ${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

const now = Date.now();
const min = 60000;
const ev = (sessionId, kind, tsAgoMin, extra) => JSON.stringify(Object.assign(
    { ts: now - tsAgoMin * min, sessionId, agentId: 'dev', agentName: 'developer', kind }, extra));

const store = path.join(os.tmpdir(), 'af-test-source-' + Date.now() + '.jsonl');
fs.writeFileSync(store, [
    ev('cli:gemini:dev:1', 'start', 120, { detail: 'gemini' }),
    ev('cli:gemini:dev:1', 'prompt', 118, { detail: 'logoyu yeniden çiz' }),
    ev('cli:gemini:dev:1', 'toolStart', 110, { tool: 'shell' }),
    ev('cli:gemini:dev:1', 'toolStart', 100, { tool: 'shell' }),
    ev('cli:gemini:dev:1', 'prompt', 90, { detail: 'ikinci istek' }),
    ev('cli:gemini:dev:1', 'end', 80, { detail: 'terminal closed' }),
    ev('cli:codex:web:2', 'start', 60, { detail: 'codex', agentId: 'web', agentName: 'webagent' }),
    // claude UUID + relay lanes must NOT become external sessions
    ev('0a1b-uuid', 'prompt', 50, { detail: 'claude işi' }),
    ev('laptop:0a1b', 'prompt', 40, { detail: 'relay işi' }),
    'bozuk satır {{{'
].join('\n') + '\n', 'utf8');

// -- parsing --
const src = liveEventsSource(() => store, 0 /* no cache window for test */);
let list = src.scan();
eq('only cli: lanes become sessions', list.map(s => s.sessionId).sort(), ['cli:codex:web:2', 'cli:gemini:dev:1']);
const g = list.find(s => s.sessionId === 'cli:gemini:dev:1');
eq('source', g.source, 'gemini');
eq('agent from events', [g.agentId, g.agentName], ['dev', 'developer']);
eq('title = first prompt', g.title, 'logoyu yeniden çiz');
eq('userTurns', g.userTurns, 2);
eq('toolCalls + breakdown', [g.toolCalls, g.tools.shell], [2, 2]);
eq('cost honestly 0', g.cost, 0);
eq('models empty (unknown)', g.models, []);
eq('firstTs/lastTs span', [g.firstTs, g.lastTs], [now - 120 * min, now - 80 * min]);
eq('no transcript file', g.file, '');

// -- cache: same stat → same object, appended file → reparse --
const src2 = liveEventsSource(() => store, 0);
const first = src2.scan();
const second = src2.scan();
eq('unchanged file → cached array', first === second, true);
fs.appendFileSync(store, ev('cli:qwen:dev:3', 'start', 5, { detail: 'qwen' }) + '\n');
const third = src2.scan();
eq('appended file → reparsed', third.length, 3);

// -- fail-soft merge --
const boom = { id: 'boom', scan() { throw new Error('kaboom'); } };
const merged = buildExternalSessions([boom, src2]);
eq('broken source skipped, good one kept', merged.length, 3);
eq('missing file → empty', liveEventsSource(() => path.join(os.tmpdir(), 'yok-boyle-dosya.jsonl'), 0).scan(), []);

// -- SessionIndex side list isolation --
const index = new SessionIndex(path.join(os.tmpdir(), 'af-no-claude-dir'), () => [], new PricingEngine([]), () => [], () => false, () => 150000);
let fired = 0;
index.onDidUpdate(() => fired++);
index.setExternal(merged);
eq('external() returns list', index.external().length, 3);
eq('externalForAgent filters', index.externalForAgent('web').map(s => s.sessionId), ['cli:codex:web:2']);
eq('all() stays claude-only', index.all().length, 0);
eq('forAgent() stays claude-only', index.forAgent('dev').length, 0);
eq('update fired once', fired, 1);
index.setExternal(merged.slice());
eq('same content → no refire', fired, 1);
index.setExternal([]);
eq('changed content → refire', fired, 2);

index.dispose();
fs.unlinkSync(store);
console.log(`\n${pass} passed, ${fail} failed`);
Module._load = origLoad;
process.exit(fail ? 1 : 0);
