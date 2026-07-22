// LIVE smoke of the Airtable Engine MCP server against the user's real engine.
// NOT part of run-all (test_* prefix only): it needs a live instance and real
// configured roots. Run by hand: node test/smoke_airtable_live.js
//
// Discipline (handover report §7.5): the live engine is REAL data. This smoke
// only reads — except one full create→verify→HARD-DELETE cycle of a throwaway
// record referencing a temp file; the hard delete also clears the search index,
// leaving zero trace.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.resolve(__dirname, '../out/mcp/airtable');

async function main() {
    // Config: prefer the extension's mirrored config; fall back to W:/zome/db.
    const mirrored = path.join(process.env.APPDATA ?? '', 'Code', 'User', 'globalStorage', 'muvusoft.agent-farm', 'airtable-config.json');
    let cfgFile = mirrored;
    if (!fs.existsSync(mirrored)) {
        cfgFile = path.join(os.tmpdir(), 'af-live-smoke-config.json');
        fs.writeFileSync(cfgFile, JSON.stringify({ databaseRoots: ['W:/zome/db'], requestTimeoutMs: 8000 }));
    }
    console.log('config:', cfgFile);

    const child = spawn(process.execPath, [path.join(OUT, 'index.js')],
        { env: { ...process.env, AIRTABLE_MCP_CONFIG: cfgFile }, stdio: ['pipe', 'pipe', 'pipe'] });
    const rl = readline.createInterface({ input: child.stdout });
    const pending = new Map();
    rl.on('line', l => {
        try { const m = JSON.parse(l); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } catch { }
    });
    let id = 0;
    const rpc = (method, params) => new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, resolve);
        setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); reject(new Error('timeout ' + method)); } }, 20000);
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: mid, method, params }) + '\n');
    });
    const call = async (name, args) => {
        const r = await rpc('tools/call', { name, arguments: args ?? {} });
        return { isError: !!r.result.isError, text: r.result.content[0].text };
    };

    try {
        const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
        ok('initialize', init.result?.serverInfo?.name === 'airtable-engine');

        const inst = await call('airtable_instances');
        console.log(inst.text.slice(0, 400));
        ok('instances lists a live engine', !inst.isError && inst.text.includes('"alive": true'));
        const live = JSON.parse(inst.text).instances.filter(i => i.alive);
        if (!live.length) { throw new Error('no live instance — start one and rerun'); }
        const instName = live[0].name;

        const stats = await call('airtable_stats', { instance: instName });
        ok('stats round-trips', !stats.isError && stats.text.includes('lessons'));

        const search = await call('airtable_search', { instance: instName, collection: 'media', limit: 3 });
        ok('search media returns hits', !search.isError && JSON.parse(search.text).total >= 1);

        const tpl = await call('airtable_media_templates', { instance: instName });
        ok('templates listed', !tpl.isError);

        // ---- full record cycle with a throwaway file ----
        const tmpPng = path.join(os.tmpdir(), 'af-smoke-' + Date.now() + '.png');
        fs.writeFileSync(tmpPng, Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            Buffer.from([0, 0, 0, 13]), Buffer.from('IHDR'),
            Buffer.from([0, 0, 0, 10, 0, 0, 0, 10, 8, 6, 0, 0, 0])
        ]));
        const saved = await call('airtable_media_save', {
            instance: instName, file: tmpPng,
            topic: 'AF 3.0.0 smoke test — will be hard-deleted',
            content: 'temporary verification record',
            tags: ['af-smoke-test'], status: 'quarantine'
        });
        ok('media_save creates', !saved.isError);
        const { id: recId, rel } = JSON.parse(saved.text);
        console.log('  created', recId, rel);

        const got = await call('airtable_get', { instance: instName, collection: 'media', id: recId });
        ok('get finds the record', !got.isError && got.text.includes('af-smoke-test'));

        const upd = await call('airtable_media_update', {
            instance: instName, id: recId, patch: { content: 'updated by smoke' }
        });
        ok('media_update bumps version', !upd.isError && JSON.parse(upd.text).version >= 2);

        // cleanup: hard delete via the engine API (clears file + index)
        const eng = live[0];
        const del = await fetch(`http://${eng.host}:${eng.port}/api/file?rel=${encodeURIComponent(rel)}&mode=hard`, { method: 'DELETE' });
        ok('hard delete cleans up', del.ok);
        const gone = await call('airtable_get', { instance: instName, collection: 'media', id: recId });
        ok('record is gone', gone.isError);
        fs.unlinkSync(tmpPng);
    } finally {
        child.kill();
    }
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
