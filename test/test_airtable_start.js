// X-416 — starting a local Airtable engine without a browser (src/core/airtableStart.ts).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const S = require(path.join(ROOT, 'out/core/airtableStart.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const run = async () => {
    const inst = { name: 'stem', dir: path.join('W:', 'zome', 'db', 'stem'), host: 'localhost', port: 3003, configPath: '' };
    const LOG = path.join('C:', 'store');
    const all = () => true;

    /* ---------- the plan ---------- */
    const plan = S.engineStartPlan(inst, LOG, all);
    ok('‼️ it runs node server.js in Admin — not start_admin.bat (no npm install, no build, no browser)',
        plan.cmd === 'node' && plan.args.join(' ') === 'server.js' && plan.cwd === path.join(inst.dir, 'Admin'));
    ok('its output goes to a log named for the instance', plan.log === path.join(LOG, 'airtable-engine-stem.log'));
    ok('no server.js — said', /no Admin\\server\.js/.test(S.engineStartPlan(inst, LOG, p => !p.endsWith('server.js')).error));
    ok('no node_modules — says to run start_admin.bat once', /run start_admin\.bat in .* once/.test(S.engineStartPlan(inst, LOG, p => !p.endsWith('node_modules')).error));

    /* ---------- starting, with the clock and the engine faked ---------- */
    let t = 0, spawned = [], up = false, polls = 0;
    const deps = extra => Object.assign({
        has: all, now: () => t, sleep: async ms => { t += ms; },
        spawn: p => { spawned.push(p); }, alive: async () => { polls++; return up; }
    }, extra || {});

    up = true;
    let r = await S.startEngine(inst, LOG, deps());
    ok('‼️ an engine already answering is left alone', r.ok && r.alreadyRunning && spawned.length === 0);

    up = false; t = 0; spawned = []; polls = 0;
    r = await S.startEngine(inst, LOG, deps({ alive: async () => { polls++; return polls > 3; } }));
    ok('down → started once → waits until it answers', r.ok && !r.alreadyRunning && spawned.length === 1 && r.ms === 1500 && r.port === 3003);

    t = 0; spawned = [];
    r = await S.startEngine(inst, LOG, deps({ timeoutMs: 3000 }));
    ok('‼️ never answering → not ok, the port and the wait said', !r.ok && /nothing answered on port 3003 within 3 s/.test(r.error) && spawned.length === 1);

    t = 0; spawned = [];
    r = await S.startEngine(inst, LOG, deps({ spawn: () => { throw new Error('ENOENT node'); } }));
    ok('node not found → said, no wait', !r.ok && /could not start node: ENOENT/.test(r.error) && r.ms === 0);

    t = 0; spawned = [];
    r = await S.startEngine(inst, LOG, deps({ has: p => !p.endsWith('node_modules') }));
    ok('a plan refusal starts nothing', !r.ok && spawned.length === 0 && /node_modules/.test(r.error));

    /* ---------- finding the instance by name ---------- */
    const T = fs.mkdtempSync(path.join(os.tmpdir(), 'af-atstart-'));
    try {
        for (const [n, port] of [['stem', 3003], ['TEST', 3000]]) {
            fs.mkdirSync(path.join(T, n), { recursive: true });
            fs.writeFileSync(path.join(T, n, 'config.json'), JSON.stringify({ server: { port, host: 'localhost' } }));
        }
        const hit = S.findInstance([T], 'test');
        ok('found by name, case-insensitive', hit.name === 'TEST' && hit.port === 3000);
        ok('an unknown name lists the real ones', /no instance "nope" — .*stem/.test(S.findInstance([T], 'nope').error));
        ok('no name at all — said', /no instance named/.test(S.findInstance([T], '').error));
    } finally {
        fs.rmSync(T, { recursive: true, force: true });
    }

    /* ---------- one door for the page and the bridge ---------- */
    const ext = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
    const i = ext.indexOf("op: 'airtable.start'");
    const block = i < 0 ? '' : ext.slice(i, ext.indexOf('\n        },', i));
    ok('‼️ airtable.start is on the bridge through startNamedInstance', /startNamedInstance\(/.test(block) && /without a browser/i.test(block));
    const panel = fs.readFileSync(path.join(ROOT, 'src/panels/airtablePanel.ts'), 'utf8');
    ok('…and the page\'s Start calls the same door', /case 'start':[\s\S]{0,200}startNamedInstance\(/.test(panel));

    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
};
run().catch(e => { console.log('  FAIL threw', e); process.exit(1); });
