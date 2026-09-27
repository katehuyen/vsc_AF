// M-50 — a production's brand kit, read by any step as {brand.<path>}.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');

class FakeEmitter {
    constructor() { this._cbs = []; }
    get event() { return (cb) => { this._cbs.push(cb); return { dispose() { } }; }; }
    fire(v) { for (const cb of this._cbs) { cb(v); } }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: FakeEmitter,
    window: {
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined),
        createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }),
        onDidCloseTerminal: () => ({ dispose() { } })
    }
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.call(this, request, parent, isMain);
};
const B = require(path.join(ROOT, 'out/core/brandKit.js'));
const P = require(path.join(ROOT, 'out/core/production.js'));
const { registerBrandOps, productionRef } = require(path.join(ROOT, 'out/core/brandBridge.js'));
const { BridgeRegistry } = require(path.join(ROOT, 'out/core/bridge.js'));
const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const KIT = {
    style: 'sıcak pastel, 35mm', negative: 'metin, filigran', voice: 'tr-TR-Ahmet', aspect: '9:16', logo: 'keep',
    character: { ana: { name: 'Ada', ref: 'D:/brand/ada.png', desc: 'kızıl saçlı' } }
};

/* ---------- the kit's shape ---------- */
{
    eq('a sound kit is kept, trimmed', B.cleanBrand({ ...KIT, style: '  sıcak pastel, 35mm ' }), KIT);
    eq('blanks and unknown fields are dropped; nothing left = no kit', B.cleanBrand({ style: ' ', nope: 'x' }), undefined);
    eq('a character with no fields is dropped', B.cleanBrand({ character: { ana: {}, b: { name: 'B' } } }), { character: { b: { name: 'B' } } });
    ok('‼️ an unknown field is refused by name', /brand\.colour is not a kit field/.test(B.brandRefusal({ colour: 'red' })));
    ok('a logo outside remove|keep|place is refused', /brand\.logo must be one of remove \| keep \| place/.test(B.brandRefusal({ logo: 'hide' })));
    ok('a bad character key is refused', /brand\.character\.1a: a key is/.test(B.brandRefusal({ character: { '1a': { name: 'x' } } })));
    ok('an unknown character field is refused', /brand\.character\.ana\.img is not a character field/.test(B.brandRefusal({ character: { ana: { img: 'x' } } })));
    ok('text that is not text is refused', /brand\.style must be text/.test(B.brandRefusal({ style: 3 })));
    eq('absent, and null for removal, are fine', [B.brandRefusal(undefined), B.brandRefusal({ style: null, character: { ana: null } })], ['', '']);
    eq('the paths a kit sets', B.brandPaths(KIT), ['style', 'negative', 'voice', 'aspect', 'logo', 'character.ana.name', 'character.ana.ref', 'character.ana.desc']);
}

/* ---------- a change, field by field ---------- */
{
    const p = B.patchBrand(KIT, { style: 'noir', negative: '', voice: null, character: { ana: { ref: 'D:/brand/ada2.png' }, bo: { name: 'Bo' } } });
    eq('a given field replaces, "" and null remove, a character changes only what it names',
        [p.style, p.negative, p.voice, p.character.ana, p.character.bo],
        ['noir', undefined, undefined, { name: 'Ada', ref: 'D:/brand/ada2.png', desc: 'kızıl saçlı' }, { name: 'Bo' }]);
    eq('a character given as null is removed whole', Object.keys(B.patchBrand(KIT, { character: { ana: null } }) || {}).includes('character'), false);
    eq('removing everything leaves no kit', B.patchBrand({ style: 'x' }, { style: '' }), undefined);
}

/* ---------- the step's own fields over the production's, with origin ---------- */
{
    const r = B.resolveBrand(KIT, { style: 'noir', character: { ana: { desc: 'gri saçlı' } } }, 'kanal-a');
    eq('the step wins field by field', [r.kit.style, r.kit.voice, r.kit.character.ana], ['noir', 'tr-TR-Ahmet', { name: 'Ada', ref: 'D:/brand/ada.png', desc: 'gri saçlı' }]);
    eq('‼️ and each field says where it came from',
        [r.origin.style, r.origin.voice, r.origin['character.ana.ref'], r.origin['character.ana.desc'], r.production],
        ['step', 'production', 'production', 'step', 'kanal-a']);
    ok('the production\'s kit is not changed by resolving', KIT.style === 'sıcak pastel, 35mm' && KIT.character.ana.desc === 'kızıl saçlı');
}

/* ---------- {brand.*} in a step's words ---------- */
{
    eq('fields and character fields are filled', B.fillBrand('{brand.style} / {brand.character.ana.ref} / {brand.logo}', KIT), 'sıcak pastel, 35mm / D:/brand/ada.png / keep');
    eq('a field the kit does not set reads empty', B.fillBrand('[{brand.colors}]', KIT), '[]');
    eq('‼️ with no kit at all the placeholder stays as written', B.fillBrand('{brand.style}', undefined), '{brand.style}');
    eq('a whole character reads as JSON', B.fillBrand('{brand.character.ana}', KIT), JSON.stringify(KIT.character.ana));
    eq('the refs a set of texts reads', B.brandRefs(['{brand.style}', { a: ['{brand.character.ana.ref}'] }]), ['style', 'character.ana.ref']);
    eq('which production: workflow < media step\'s own < run',
        [B.brandProductionFor({ production: 'w' }, {}), B.brandProductionFor({ production: 'w' }, { media: { projectId: 's' } }),
            B.brandProductionFor({ production: 'w' }, { media: { projectId: 's' } }, { production: 'r' }), B.brandProductionFor({}, {})],
        ['w', 's', 'r', undefined]);
}

/* ---------- production.json carries it ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-brand-'));
const agentDir = path.join(tmp, 'studio'); fs.mkdirSync(agentDir, { recursive: true });
const agent = { id: 'a1', name: 'yazar', dir: agentDir };
{
    P.writeProduction(path.join(agentDir, 'production.json'), { ...P.newProduction('Kanal A', ['Açılış']), brand: KIT });
    const back = P.readProduction(agentDir);
    eq('the kit is read back with the production', back.brand, KIT);
    P.setSceneStatus(back, 's01', 'review');
    P.writeProduction(path.join(agentDir, 'production.json'), back);
    eq('‼️ a scene status write keeps the kit', P.readProduction(agentDir).brand, KIT);
    eq('a production by title → its id; "" clears; unknown refused by name',
        [productionRef([agent], 'kanal a').id, productionRef([agent], '').id, /no production "yok"/.test(productionRef([agent], 'yok').error), productionRef([agent], undefined)],
        ['kanal-a', '', true, {}]);
}

(async () => {
    /* ---------- the bridge ---------- */
    const flows = [];
    const reg = new BridgeRegistry();
    registerBrandOps(reg, { getAgents: () => [agent], workflow: ref => flows.find(w => w.id === ref || w.title === ref) });
    const got = await reg.dispatch('studio.brand.get', { production: 'Kanal A' });
    eq('studio.brand.get: the kit as stored', [got.ok, got.result.production, got.result.brand], [true, 'kanal-a', KIT]);
    const set = await reg.dispatch('studio.brand.set', { production: 'kanal-a', brand: { colors: 'turuncu, lacivert', character: { bo: { name: 'Bo', ref: 'D:/brand/bo.png' } } } });
    ok('studio.brand.set merges field by field', set.ok && set.result.brand.colors === 'turuncu, lacivert' && set.result.brand.style === KIT.style && set.result.brand.character.bo.name === 'Bo');
    eq('…and it is in the file', P.readProduction(agentDir).brand.character.bo.ref, 'D:/brand/bo.png');
    const bad = await reg.dispatch('studio.brand.set', { production: 'kanal-a', brand: { logo: 'hide' } });
    ok('‼️ a refused kit writes nothing and says why', !bad.ok && /brand\.logo must be one of/.test(bad.error) && P.readProduction(agentDir).brand.logo === 'keep');
    const none = await reg.dispatch('studio.brand.get', { production: 'yok' });
    ok('an unknown production is refused by name', !none.ok && /No production "yok"/.test(none.error));
    const rep = await reg.dispatch('studio.brand.set', { production: 'kanal-a', brand: KIT, replace: true });
    eq('replace: the kit becomes exactly what was given', rep.result.brand, KIT);
    flows.push({ id: 'w1', title: 'Akış', production: 'kanal-a', steps: [{ title: 'yaz' }, { title: 'çiz', brand: { style: 'noir' } }] });
    const at2 = await reg.dispatch('studio.brand.get', { workflow: 'Akış', step: 2 });
    eq('‼️ studio.brand.get workflow= step=: what that step reads, and from where',
        [at2.result.production, at2.result.brand.style, at2.result.origin.style, at2.result.origin['character.ana.ref']],
        ['kanal-a', 'noir', 'step', 'production']);

    /* ---------- ‼️ ACCEPTANCE: two steps read the same character from the kit; a step's own field wins ---------- */
    const kits = { 'kanal-a': KIT };
    const mgr = new TaskManager(path.join(tmp, 'f.json'), () => [agent], () => false, () => '',
        { quotaCheck: () => 'hold', productionBrand: id => kits[id] });
    const step = (title, prompt, extra) => ({ agentId: 'a1', agentName: 'yazar', title, prompt, mode: 'headless', parallel: true, ...extra });
    const w = mgr.addWorkflow('Marka', [
        step('senarist', 'Karakter: {brand.character.ana.name} ({brand.character.ana.ref}) — {brand.style}'),
        step('prompt', 'Görsel: {brand.character.ana.ref}, stil {brand.style}', { brand: { style: 'noir' } })
    ]);
    w.production = 'kanal-a';
    mgr.runWorkflow(w);
    const rows = mgr.tasks.filter(t => t.workflowId === w.id).sort((a, b) => a.stepIndex - b.stepIndex);
    eq('both steps started', rows.length, 2);
    eq('‼️ step 1 reads the kit', rows[0] && rows[0].prompt, 'Karakter: Ada (D:/brand/ada.png) — sıcak pastel, 35mm');
    eq('‼️ step 2 reads the same character, and its own style', rows[1] && rows[1].prompt, 'Görsel: D:/brand/ada.png, stil noir');
    const plain = mgr.addWorkflow('Markasız', [step('x', 'Stil: {brand.style}')]);
    mgr.runWorkflow(plain);
    eq('with no production the placeholder is left for anyone to see', (mgr.tasks.find(t => t.workflowId === plain.id) || {}).prompt, 'Stil: {brand.style}');

    /* ---------- the surfaces ---------- */
    const flex = read('media/afFlex.js');
    ok('workflow.production is a flex point: the workflow box and the media step\'s own production',
        /id: 'workflow\.production'/.test(flex) && /workflow: \{ surface: 'media\/afBrand\.js#wf-production', bridge: 'workflows\.add:production' \}/.test(flex)
        && /step: \{ surface: 'media\/tasksPage\.js#st-mScene', bridge: 'workflows\.add:steps\.media\.projectId' \}/.test(flex));
    const base = read('src/panels/base.ts');
    ok('every page loads afBrand.js', /'afBrand\.js'/.test(base) && /src="\$\{brand\}"/.test(base));
    const page = read('media/tasksPage.js');
    ok('the workflow form draws and wires the box', /window\.AFBrand\.workflowBox\(c, DATA\.scenes, C\)/.test(page) && /window\.AFBrand\.wireWf\(byId, \(\) => composer\)/.test(page));
    const panel = read('src/panels/tasksPanel.ts');
    ok('‼️ a page edit keeps a step\'s own brand (draft both ways)', /\.\.\.\(s\.brand \? \{ brand: s\.brand \} : \{\}\)/.test(panel) && /const brand = cleanBrand\(raw\.brand\);/.test(panel));
    ok('the page save refuses a production that is gone, and seeds the box', /Production: no production/.test(panel) && /production: w\.production \?\? ''/.test(panel));
    const ext = read('src/extension.ts');
    ok('extension wires the ops and the kit reader', /registerBrandOps\(bridge, \{/.test(ext) && /productionBrand: \(id\) => findProductionIn/.test(ext));
    ok('workflows.add/update take production; a step\'s brand is checked', /const prod = productionRef\(agents, args\.production\);/.test(ext) && /const brandNo = brandRefusal\(brandIn\);/.test(ext));

    /* ---------- the page box ---------- */
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const C = { esc, option: (v, l, o) => `<option value="${esc(v)}"${o && o.selected ? ' selected' : ''}>${esc(l)}</option>` };
    global.window = {};
    require(path.join(ROOT, 'media/afBrand.js'));
    const AFB = global.window.AFBrand;
    const scenes = [{ id: 'kanal-a', label: 'Kanal A — the whole production' }, { id: 'kanal-a/s01', label: 'Kanal A · Açılış' }];
    eq('the productions, off the scene list', AFB.productions(scenes), [{ id: 'kanal-a', label: 'Kanal A' }]);
    const html = AFB.workflowBox({ production: 'kanal-a' }, scenes, C);
    ok('the box shows the current production, with a MIRROR tooltip', /id="nt-wf-production"/.test(html) && /<option value="kanal-a" selected>Kanal A/.test(html) && /title="Kanal A/.test(html));
    ok('a production that is gone stays visible, marked', /⚠ eski/.test(AFB.workflowBox({ production: 'eski' }, scenes, C)));

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\ntest_brand_kit.js: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
