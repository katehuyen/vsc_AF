// S-33 — the OpenCode history hat, end to end, against the REAL binary.
//
// `node tools/opencode_history_probe.js` runs the harvester over this repo, then
// reads what it wrote through the same source and the same viewer the extension
// uses, and prints every row it produced.
//
// ‼️ IT COSTS NO MODEL TOKENS. `session list` and `export` are local reads of the
// CLI's own SQLite store, and nothing here writes to it — the cache directory is
// a temporary one and is removed at the end.
//
// The second harvest is the point of the whole run: it must export ZERO. That is
// the cost control (an unchanged conversation is never exported twice) proving
// itself against the real clock rather than against a fixture. A root that does
// not exist is expected to appear as one `failed` — that branch is deliberately
// exercised here.
//
// Beside `tools/opencode_acp_probe.js`: that one measures the live protocol,
// this one measures the history.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const origLoad = Module._load;
class Emitter {
    constructor() { this.h = []; }
    get event() { return fn => { this.h.push(fn); return { dispose() {} }; }; }
    fire(v) { for (const f of this.h) { f(v); } }
    dispose() {}
}
Module._load = function (request) {
    if (request === 'vscode') {
        return {
            EventEmitter: Emitter,
            window: { showInformationMessage: () => Promise.resolve(), showWarningMessage: () => Promise.resolve() },
            commands: { executeCommand: () => Promise.resolve() }
        };
    }
    return origLoad.apply(this, arguments);
};

const ROOT = path.join(__dirname, '..');
const { OpencodeHarvester, nodeOpencodeCli } = require(path.join(ROOT, 'out/core/opencodeharvest.js'));
const { opencodeSessionsSource } = require(path.join(ROOT, 'out/core/cliTranscripts.js'));
const { parseCliViewer } = require(path.join(ROOT, 'out/core/cliViewer.js'));
const { PricingEngine } = require(path.join(ROOT, 'out/core/pricing.js'));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-opencode-probe-'));
const harvester = new OpencodeHarvester({
    dir: () => dir,
    // the second root is deliberately not there — a folder that cannot be
    // listed from must be a counted failure, never a crash
    roots: () => [ROOT, path.join(os.homedir(), 'af-probe-no-such-folder')],
    cli: nodeOpencodeCli(),
    enabled: () => true
});

(async () => {
    const t0 = Date.now();
    const r = await harvester.harvest(true);
    console.log('harvest:', JSON.stringify(r), `${Date.now() - t0} ms`);
    console.log('cached files:', fs.readdirSync(dir).length);

    const rows = opencodeSessionsSource(() => dir, () => ({}), () => new PricingEngine([]), 0).scan();
    console.log('rows:', rows.length);
    for (const s of rows.sort((a, b) => b.lastTs - a.lastTs)) {
        console.log(`  ${s.sessionId}  "${s.title}"  turns=${s.userTurns}/${s.assistantMsgs}`
            + ` tools=${s.toolCalls} tok=${s.usage.input}/${s.usage.output}/${s.usage.cacheRead}`
            + ` ctx=${s.lastCtxTokens ?? '-'} cost=${s.cost} cwd=${s.cwd}`);
    }

    const withTools = rows.find(s => s.toolCalls > 0) ?? rows[0];
    if (withTools) {
        const p = parseCliViewer(fs.readFileSync(withTools.file, 'utf8'), withTools.file, new PricingEngine([]));
        console.log(`viewer: engine=${p.engine} turns=${p.turnCount} msgs=${p.messages.length}`
            + ` tools=${p.toolCalls} think=${p.messages.filter(m => m.kind === 'think').length}`
            + ` ctx=${p.context.tokens}`);
        for (const t of p.turns) {
            console.log(`  T${t.n} "${t.label.slice(0, 40)}" tok=${t.tokens} steps=${t.steps}`
                + ` think=${t.thinking} tools=${t.tools} api=${t.apiCalls} endCtx=${t.endCtx}`);
        }
    }

    const again = await harvester.harvest(true);
    console.log('second harvest (must export 0):', JSON.stringify(again));
    fs.rmSync(dir, { recursive: true, force: true });
})();
