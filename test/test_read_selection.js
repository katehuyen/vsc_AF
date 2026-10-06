// U-202 — "Sound: Read Selection": the text selected on any Agent Farm page (media/afCtx.js puts it
// in the right-click's context, so the item shows only over a selection) or in the editor, read
// through alerts.readNow { text } — the same cleaner and language choice as every reading.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const { selectionOf, readSelection } = require(path.join(ROOT, 'out', 'core', 'readSelection.js'));

// 1. the page stamps the selection on the right-click
{
    let sel = '  a passage worth hearing \n';
    const listeners = [];
    const body = { dataset: { vscodeContext: JSON.stringify({ afPanel: 'x#1' }) } };
    const sandbox = {
        window: { getSelection: () => ({ toString: () => sel }) },
        document: { body, addEventListener: (ev, fn, capture) => listeners.push({ ev, fn, capture }) }
    };
    vm.createContext(sandbox);
    vm.runInContext(read('media', 'afCtx.js'), sandbox);
    const l = listeners.find(x => x.ev === 'contextmenu');
    ok('‼️ the right-click is caught in the CAPTURE phase, before VS Code reads the context', !!l && l.capture === true);
    l.fn();
    let ctx = JSON.parse(body.dataset.vscodeContext);
    ok('a selection rides in the context, trimmed', ctx.afSelection === 'a passage worth hearing');
    ok('…beside what the body already said', ctx.afPanel === 'x#1');
    sel = '   ';
    l.fn();
    ctx = JSON.parse(body.dataset.vscodeContext);
    ok('no selection: the key is gone, so the item is not offered', !('afSelection' in ctx) && ctx.afPanel === 'x#1');
}

// 1b. a step's 🔊 reads only what is selected inside that step
{
    const posted = [];
    const sandbox = { window: {}, document: {} };
    vm.createContext(sandbox);
    vm.runInContext(read('media', 'afReadAloud.js'), sandbox);
    const R = sandbox.window.AFRead;
    R.init(m => posted.push(m), null);
    const inside = { id: 'in' }, outside = { id: 'out' };
    const step = { contains: n => n === inside };
    let s = { text: 'just this part', anchorNode: inside, focusNode: inside };
    sandbox.window.getSelection = () => ({ toString: () => s.text, anchorNode: s.anchorNode, focusNode: s.focusNode });
    const b = { dataset: { readSid: 'S', read: 'k1' } };
    R.press(b, step);
    ok('‼️ a selection inside the step: only it is read, in that conversation', posted.length === 1 && posted[0].pick.text === 'just this part' && posted[0].sessionId === 'S');
    s = { text: 'elsewhere', anchorNode: outside, focusNode: outside };
    R.press(b, step);
    ok('a selection outside the step: the whole step', posted[1].pick.msg === 'k1' && !('text' in posted[1].pick));
    s = { text: 'half in', anchorNode: inside, focusNode: outside };
    ok('a selection that runs out of the step is not this step\'s', R.selectedIn(step) === '');
    R.press(b, null);
    ok('no step handed: the whole step, as before', posted[3] ? false : posted[2].pick.msg === 'k1');
    ok('the transcript and the Console hand their step', /window\.AFRead\.press\(rd, rd\.closest\('\.msg\[data-idx\]'\)\)/.test(read('media', 'sessionViewer.js'))
        && /window\.AFRead\.press\(b, row\)/.test(read('media', 'console.js')) && /window\.AFRead\.selectedIn\(row\) \|\| String\(m\.text/.test(read('media', 'console.js')));
}

// 2. the command's body
(async () => {
    ok('the menu hands the text and the row\'s conversation', JSON.stringify(selectionOf({ afSelection: ' hi ', sessionId: 's1', webviewSection: 'x' })) === '{"text":"hi","sessionId":"s1"}'
        && selectionOf(undefined).text === '' && selectionOf({ afSelection: 3 }).text === '');
    const run = async (o, arg) => {
        const said = [], asks = [];
        const r = await readSelection({
            editorSelection: () => o.editor || '',
            read: async ask => { asks.push(ask); if (o.refuse && (o.refuse === 'all' || ask.sessionId)) { throw new Error('no transcript'); } return {}; },
            say: t => said.push(t)
        }, arg);
        return { r, said, asks };
    };
    let x = await run({ editor: 'editor words' }, { afSelection: 'page words', sessionId: 's1' });
    ok('‼️ a page selection is read, in its conversation\'s voice', x.r === 'page' && x.asks.length === 1 && x.asks[0].text === 'page words' && x.asks[0].sessionId === 's1');
    x = await run({ editor: 'editor words' });
    ok('from the editor (or the palette): the editor\'s selection, no conversation', x.r === 'editor' && x.asks[0].text === 'editor words' && !('sessionId' in x.asks[0]));
    x = await run({ editor: '' });
    ok('nothing selected anywhere: said so, nothing read', x.r === null && !x.asks.length && /select some text first/.test(x.said.join()));
    x = await run({ refuse: 'session' }, { afSelection: 'page words', sessionId: 'gone' });
    ok('a conversation whose transcript is gone only loses its voice: read again in the fleet\'s', x.r === 'page' && x.asks.length === 2 && !('sessionId' in x.asks[1]));
    x = await run({ refuse: 'all' }, { afSelection: 'page words' });
    ok('a refusal of the text itself is said in its own words', x.r === null && /Agent Farm: no transcript/.test(x.said.join()));

    // 3. the manifest, the catalogue, the host
    const pkg = JSON.parse(read('package.json'));
    const cmd = pkg.contributes.commands.find(c => c.command === 'agentfarm.readSelection');
    ok('the command is declared under the Sound: family', !!cmd && cmd.title === 'Sound: Read Selection');
    const ed = (pkg.contributes.menus['editor/context'] || []).find(m => m.command === 'agentfarm.readSelection');
    ok('the editor\'s right-click offers it over a selection', !!ed && ed.when === 'editorHasSelection');
    const wv = (pkg.contributes.menus['webview/context'] || []).find(m => m.command === 'agentfarm.readSelection');
    ok('‼️ every page\'s right-click offers it exactly when text is selected', !!wv && wv.when === 'afSelection');
    const ext = read('src', 'extension.ts');
    ok('‼️ the reading is alerts.readNow\'s own body', /registerCommand\('agentfarm\.readSelection'[\s\S]{0,500}read: ask => readNow\(readerDeps, ask, 'selection'\)/.test(ext));
    ok('the editor hands every non-empty selection', /e\.selections\.map\(s => e\.document\.getText\(s\)\)\.filter\(Boolean\)\.join/.test(ext));
    const man = JSON.parse(read('parity.manifest.json'));
    const cap = man.entries.find(c => c.capability === 'readSelection');
    ok('the parity manifest maps both doors to alerts.readNow', !!cap && cap.ops.join() === 'alerts.readNow' && cap.ui.includes('ctx:agentfarm.readSelection'));

    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
