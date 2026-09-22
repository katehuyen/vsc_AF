// B-26 — the last four doors that had no op of their own, or an op that did the
// same act by a second road: the terminal rendering repair, the working
// examples, the sequence export and the doc-open default. Each is tested at the
// shared function AND at the op, and the page/command is checked to call that
// same function rather than a copy of it.
const fs = require('fs');
const os = require('os');
const path = require('path');
const OUT = path.resolve(__dirname, '../out/core');
const { BridgeRegistry } = require(path.join(OUT, 'bridge.js'));
const tr = require(path.join(OUT, 'terminalRender.js'));
const ex = require(path.join(OUT, 'examples.js'));
const seq = require(path.join(OUT, 'sequenceExport.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const src = (f) => fs.readFileSync(path.resolve(__dirname, '..', 'src', f), 'utf8');
const ext = src('extension.ts');
const commandBody = (id) => {
    const at = ext.indexOf(`registerCommand('${id}'`);
    return at < 0 ? '' : ext.slice(at, ext.indexOf('\n        }),', at));
};

(async () => {
    // ------------------------------------------------ terminal rendering
    const section = (init) => {
        const values = { ...init };
        const writes = [];
        return {
            values, writes,
            get: (k, d) => (k in values ? values[k] : d),
            update: async (k, v) => { writes.push(k); if (v === undefined) { delete values[k]; } else { values[k] = v; } }
        };
    };
    {
        const term = section({ gpuAcceleration: 'on', smoothScrolling: true });
        const farm = section({});
        ok('state reads the three terminal keys and the farm switch',
            JSON.stringify(tr.terminalRenderState(term, farm)) === JSON.stringify({
                gpuAcceleration: 'on', smoothScrolling: true, enablePersistentSessions: true,
                externalTerminal: false, fixed: false
            }));
        const w = await tr.applyTerminalRender('fix', term, farm);
        ok('fix turns gpuAcceleration and smoothScrolling off, and names what it wrote',
            term.values.gpuAcceleration === 'off' && term.values.smoothScrolling === false
            && w['terminal.integrated.gpuAcceleration'] === 'off' && Object.keys(w).length === 2);
        ok('…and the state then reads as fixed', tr.terminalRenderState(term, farm).fixed === true);
        await tr.applyTerminalRender('persist', term, farm);
        ok('persist turns persistent sessions off', term.values.enablePersistentSessions === false);
        const r = await tr.applyTerminalRender('restore', term, farm);
        ok('restore removes the three overrides (null = removed)',
            !('gpuAcceleration' in term.values) && !('enablePersistentSessions' in term.values)
            && r['terminal.integrated.smoothScrolling'] === null);
        await tr.applyTerminalRender('external', term, farm);
        ok('external with no `on` flips the farm switch, as the palette item does', farm.values.externalTerminal === true);
        await tr.applyTerminalRender('external', term, farm, true);
        ok('…and `on` sets it outright', farm.values.externalTerminal === true);
        ok('‼️ nothing outside the allowlist was ever written to terminal.integrated',
            term.writes.every(k => tr.TERMINAL_RENDER_KEYS.includes(k)));

        const reg = new BridgeRegistry();
        const t2 = section({});
        const f2 = section({});
        tr.registerTerminalRenderOps(reg, { term: () => t2, farm: () => f2 });
        const got = await reg.dispatch('terminal.render.get', {});
        ok('terminal.render.get answers the state', got.ok && got.result.gpuAcceleration === 'auto');
        const ap = await reg.dispatch('terminal.render.apply', { action: 'fix' });
        ok('terminal.render.apply fix writes through the same function',
            ap.ok && t2.values.gpuAcceleration === 'off' && ap.result.now.fixed === true);
        const off = await reg.dispatch('terminal.render.apply', { action: 'external', on: false });
        ok('…external with on:false', off.ok && f2.values.externalTerminal === false);
        const bad = await reg.dispatch('terminal.render.apply', { action: 'fontSize' });
        ok('‼️ an action outside the four is refused by name', !bad.ok && /fix, external, persist, restore/.test(bad.error));

        const body = commandBody('agentfarm.terminalRenderFix');
        ok('the palette command writes through applyTerminalRender and nothing else',
            /applyTerminalRender\(/.test(body) && !/\.update\(/.test(body));
    }

    // ------------------------------------------------ working examples
    {
        const a = { id: 'a1', name: 'Alpha' };
        const b = { id: 'b1', name: 'Beta' };
        const trig = ex.inboxExample(a, 'D:\\drop\\inbox');
        ok('inbox = an enabled watch trigger on the folder, a headless task for the agent',
            trig.type === 'watch' && trig.watchPath === 'D:\\drop\\inbox' && trig.enabled === true
            && trig.action.agentId === 'a1' && trig.action.mode === 'headless' && trig.title === 'Inbox: inbox');
        const sch = ex.morningExample(a);
        ok('morning = a daily 09:00 schedule', sch.kind === 'daily' && sch.hour === 9 && sch.minute === 0 && sch.enabled === true);
        const ch = ex.chainExample(a, b);
        ok('chain = two steps, the second fed by {prev_text}',
            ch.steps.length === 2 && ch.steps[0].agentId === 'a1' && ch.steps[1].agentId === 'b1'
            && ch.steps[1].prompt.includes('{prev_text}'));

        const made = { triggers: [], schedules: [], workflows: [], runs: [] };
        const reg = new BridgeRegistry();
        ex.registerExampleOps(reg, {
            agents: () => [{ ...a, dir: '/a' }, { ...b, dir: '/b' }],
            addTrigger: (t) => { const r = { ...t, id: 'T' + made.triggers.length }; made.triggers.push(r); return r; },
            addSchedule: (s) => { const r = { ...s, id: 'S' + made.schedules.length }; made.schedules.push(r); return r; },
            addWorkflow: (title, steps) => { const r = { id: 'W' + made.workflows.length, title, steps }; made.workflows.push(r); return r; },
            runWorkflow: (w) => { made.runs.push(w.id); return 'task-1'; }
        });
        const inbox = await reg.dispatch('examples.setup', { example: 'inbox', agent: 'alpha', folder: 'D:\\drop\\inbox' });
        ok('examples.setup inbox creates the same trigger the palette does',
            inbox.ok && JSON.stringify({ ...made.triggers[0], id: undefined }) === JSON.stringify({ ...trig, id: undefined }));
        const noFolder = await reg.dispatch('examples.setup', { example: 'inbox', agent: 'Alpha' });
        ok('…and refuses one with no folder', !noFolder.ok && made.triggers.length === 1);
        const morning = await reg.dispatch('examples.setup', { example: 'morning', agent: 'b1' });
        ok('morning by agent id', morning.ok && made.schedules[0].agentName === 'Beta');
        const chain = await reg.dispatch('examples.setup', { example: 'chain', agent: 'Alpha', agentB: 'Beta' });
        ok('‼️ a chain is created, NOT run, unless run:true',
            chain.ok && made.workflows.length === 1 && made.runs.length === 0 && /not run/.test(chain.result.note));
        const run = await reg.dispatch('examples.setup', { example: 'chain', agent: 'Alpha', agentB: 'Beta', run: true });
        ok('…and run:true starts it', run.ok && made.runs.length === 1 && run.result.started === 'task-1');
        const who = await reg.dispatch('examples.setup', { example: 'morning', agent: 'Gamma' });
        ok('an unknown agent is named, not guessed', !who.ok && /no agent "Gamma"/.test(who.error));
        const what = await reg.dispatch('examples.setup', { example: 'party', agent: 'Alpha' });
        ok('an unknown example is refused', !what.ok && /inbox, morning or chain/.test(what.error));

        const body = commandBody('agentfarm.setupExample');
        ok('the palette walk-through builds through the same three functions',
            /inboxExample\(/.test(body) && /morningExample\(/.test(body) && /chainExample\(/.test(body)
            && !/Inbox triage/.test(body));
    }

    // ------------------------------------------------ sequence export
    {
        const production = { id: 'my film', title: 'Film', scenes: [
            { id: 's01', title: 'Açılış', status: 'approved' }, { id: 's02', title: 'Orta', status: 'review' }] };
        const metas = [
            { taskId: 'a', projectId: 'my film', sceneId: 's01', assetFiles: ['/o/a.mp4'], assetUrls: ['http://x/a'] },
            { taskId: 'b', projectId: 'my film', sceneId: 's02', assetFiles: ['/o/b.png'], assetUrls: ['http://x/b'] }
        ];
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-seq-'));
        const def = seq.defaultSequenceFile(path.join(dir, 'production.json'), production.id);
        ok('the default file sits beside production.json, named after a safe id',
            def === path.join(dir, 'my-film.xml') && seq.defaultSequenceFile('/p/production.json', 'x', 'edl').endsWith('x.edl'));
        const both = seq.writeSequence(production, metas, def, { format: 'both' });
        ok('both = the XML at the file and the EDL beside it',
            both.clips === 2 && both.files.length === 2 && fs.existsSync(def)
            && fs.existsSync(path.join(dir, 'my-film.edl')) && both.fps === 30 && both.clipSeconds === 5);
        ok('…the XML is an xmeml sequence', fs.readFileSync(def, 'utf8').includes('<xmeml'));
        const edlOnly = path.join(dir, 'sub', 'cut.edl');
        const e = seq.writeSequence(production, metas, edlOnly, { format: 'edl', fps: 25 });
        ok('edl alone, into a folder that did not exist', e.files.join() === edlOnly && fs.existsSync(edlOnly) && e.fps === 25);
        const none = seq.writeSequence({ ...production, id: 'empty' }, metas, path.join(dir, 'none.xml'));
        ok('‼️ no assigned asset = nothing written, said as clips:0', none.clips === 0 && !fs.existsSync(path.join(dir, 'none.xml')));
        fs.rmSync(dir, { recursive: true, force: true });

        const page = src('panels/studioPanel.ts');
        ok('the Studio card writes through writeSequence, XML + EDL',
            /writeSequence\(found\.production, this\.metas\(\), uri\.fsPath, \{\s*format: 'both'/.test(page)
            && !/buildFcpXml|buildEdl/.test(page));
        const bridge = src('core/studioBridge.ts');
        const at = bridge.indexOf("op: 'studio.export'");
        const op = bridge.slice(at, bridge.indexOf('\n        }', at));
        ok('studio.export writes through the same function, and offers both',
            /writeSequence\(/.test(op) && /defaultSequenceFile\(/.test(op) && /fcpxml\|edl\|both/.test(op)
            && !/buildFcpXml|buildEdl/.test(bridge));
    }

    // ------------------------------------------------ doc-open default
    {
        const at = ext.indexOf('const configureDocOpen = async');
        const flow = ext.slice(at, ext.indexOf('\n    };', at));
        ok('the palette flow writes the store and refreshes through docOpenChanged',
            /docOpenStore\.set\(patch\)/.test(flow) && /docOpenChanged\(\)/.test(flow) && !/refreshIfOpen/.test(flow));
        ok('…the op is wired to the very same refresh', /registerDocOpenOps\(bridge, \{ store: docOpenStore, onChange: docOpenChanged \}\)/.test(ext));
    }

    console.log(`${pass} passed, ${fail} failed`);
    if (fail) { process.exit(1); }
})();
