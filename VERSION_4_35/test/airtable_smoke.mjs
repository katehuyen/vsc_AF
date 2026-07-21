// Manual live smoke test for the Airtable engine MCP server.
// NOT run by the suite (name is not test_*.js) — run it by hand when an engine
// instance is up:  node test/airtable_smoke.mjs
//
// It spawns out/mcp/airtable/index.js, does the MCP handshake, and — if an
// instance is live — writes a media record for a TEMP png, searches/gets it, then
// deletes the record via DELETE /api/file (mode=hard, file + index) and removes the
// temp file. Nothing is left behind in the real database.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '..', 'out', 'mcp', 'airtable', 'index.js');

const child = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });
const pending = new Map();
let buffer = '';
child.stdout.setEncoding('utf-8');
child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim(); buffer = buffer.slice(nl + 1);
        if (!line) { continue; }
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    }
});

let nextId = 1;
const call = (method, params) => new Promise((resolve) => {
    const id = nextId++; pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const notify = (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
const text = (resp) => { const c = resp?.result?.content?.[0]?.text; try { return JSON.parse(c); } catch { return c; } };
const banner = (t) => console.log(`\n===== ${t} =====`);

// 1x1 red PNG.
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=', 'base64');

async function main() {
    banner('initialize');
    const init = await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
    console.log(JSON.stringify(init.result));
    notify('notifications/initialized');

    banner('tools/list');
    const list = await call('tools/list');
    console.log(list.result.tools.map((t) => t.name).join(', '));

    banner('airtable_instances');
    const inst = await call('tools/call', { name: 'airtable_instances', arguments: {} });
    const instData = text(inst);
    console.log(JSON.stringify(instData, null, 2));

    const live = (instData.instances || []).find((i) => i.live);
    if (!live) { console.log('\nNo live instance — skipping the write/read/delete path.'); return finish(); }

    const tmp = path.join(os.tmpdir(), `airtable-smoke-${Date.now()}.png`);
    fs.writeFileSync(tmp, PNG_1x1);

    banner(`airtable_media_save -> ${live.name}`);
    const save = text(await call('tools/call', {
        name: 'airtable_media_save',
        arguments: {
            instance: live.name, file_path: tmp,
            topic: 'MCP smoke gorsel', content: 'airtable-mcp smoke dogrulama -- otomatik silinecek.',
            tags: ['airtable-smoke', 'deneme'], style: 'marketing', content_role: 'concept', usage_context: 'test', status: 'draft',
            provenance: { generation_prompt: 'smoke test image', model: 'test', seed: 12345, origin: 'ai_generated' },
        },
    }));
    console.log(JSON.stringify(save, null, 2));

    banner('airtable_search tags=[airtable-smoke]');
    console.log(JSON.stringify(text(await call('tools/call', { name: 'airtable_search', arguments: { instance: live.name, collection: 'media', tags: ['airtable-smoke'] } })), null, 2));

    if (save?.id) {
        banner('airtable_get (verify media core + provenance)');
        const rec = text(await call('tools/call', { name: 'airtable_get', arguments: { instance: live.name, collection: 'media', id: save.id } }));
        console.log(JSON.stringify({ id: rec.id, status: rec.status, topic: rec.topic, tags: rec.tags, media: rec.media, prompt: rec?.provenance?.generation_prompt, seed: rec?.provenance?.seed, version: rec.version }, null, 2));
    }

    banner('cleanup (DELETE /api/file mode=hard) + temp file');
    if (save?.rel) {
        const q = new URLSearchParams({ lang: save.lang || 'TR', rel: save.rel, mode: 'hard' }).toString();
        try {
            const r = await fetch(`http://${live.host}:${live.port}/api/file?${q}`, { method: 'DELETE' });
            console.log(`delete ${save.rel} -> ${r.status} ${r.ok ? 'OK (file + index clean)' : await r.text()}`);
        } catch (e) { console.log(`cleanup failed: ${e.message} (manual delete: ${save.rel})`); }
    }
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    finish();
}

function finish() { child.stdin.end(); setTimeout(() => process.exit(0), 300).unref(); }
main().catch((e) => { console.error('SMOKE ERROR:', e); child.kill(); process.exit(1); });
