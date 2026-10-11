// X-447 — A PAGE ASKS WHOEVER IS LOOKING AT IT. On the desktop a panel's
// message, confirmation, pick or typed answer is vscode.window itself, the same
// call with the same arguments; on a phone it is a sheet on the phone, and the
// phone's answer settles it. A page on the panel host never reaches past its
// host to vscode.window — a confirmation opened on the PC from a phone's tap
// waited forever for a person who was not there.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

class EventEmitter {
    constructor() { this.listeners = []; }
    get event() {
        return (fn, thisArg, bag) => {
            const f = thisArg ? fn.bind(thisArg) : fn;
            this.listeners.push(f);
            const d = { dispose: () => { this.listeners = this.listeners.filter(x => x !== f); } };
            if (Array.isArray(bag)) { bag.push(d); }
            return d;
        };
    }
    fire(e) { for (const f of [...this.listeners]) { f(e); } }
    dispose() { this.listeners = []; }
}
const calls = [];
const answerOf = {};
const shown = name => (...args) => { calls.push({ name, args }); return answerOf[name] = Promise.resolve('from-' + name); };
const uri = p => ({ path: p, fsPath: p, toString: () => 'file://' + p });
const vscodeStub = {
    EventEmitter,
    Uri: { joinPath: (b, ...parts) => uri([b.path, ...parts].join('/')), file: uri, parse: uri },
    window: {
        showInformationMessage: shown('info'), showWarningMessage: shown('warn'), showErrorMessage: shown('error'),
        showQuickPick: shown('pick'), showInputBox: shown('input'), showOpenDialog: shown('open')
    },
    env: { clipboard: { writeText: t => { calls.push({ name: 'clipboard', args: [t] }); return Promise.resolve(); } } }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { desktopAsk, RemoteAsk } = require(path.join(ROOT, 'out', 'panels', 'panelAsk.js'));
const { RemoteViews } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
Module._load = origLoad;

(async () => {
    // ---------------------------------------------------------------- the desktop: vscode.window itself
    {
        const a = desktopAsk();
        const opts = { modal: true, detail: 'd' };
        const got = a.warn('m', opts, 'A', 'B');
        ok('a warning is showWarningMessage with the very same arguments',
            calls[0].name === 'warn' && calls[0].args.length === 4 && calls[0].args[0] === 'm' && calls[0].args[1] === opts
            && calls[0].args[2] === 'A' && calls[0].args[3] === 'B');
        ok('…and its answer is VS Code\'s own promise', got === answerOf.warn);
        a.info('i'); a.error('e', 'X');
        ok('info and error likewise', calls[1].name === 'info' && calls[1].args.join() === 'i' && calls[2].name === 'error' && calls[2].args.join() === 'e,X');
        const items = [{ label: 'a' }], po = { placeHolder: 'p' };
        ok('a pick is showQuickPick(items, options)', a.pick(items, po) === answerOf.pick && calls[3].args[0] === items && calls[3].args[1] === po);
        const io = { prompt: 'p' };
        ok('a typed answer is showInputBox(options)', a.input(io) === answerOf.input && calls[4].args[0] === io && calls[4].args.length === 1);
        const oo = { canSelectMany: true };
        ok('a file choice is showOpenDialog(options)', a.open(oo) === answerOf.open && calls[5].args[0] === oo);
    }

    // ---------------------------------------------------------------- a phone: asked on the phone
    {
        const out = [];
        const r = new RemoteAsk(m => out.push(m));
        ok('a note (no buttons) is said on the phone and answers at once', await r.warn('Agent Farm: refused') === undefined
            && out[0].type === 'afAsk' && out[0].kind === 'note' && out[0].level === 'warn' && out[0].message === 'Agent Farm: refused' && !out[0].id);
        const p = r.warn('End it?', { modal: true, detail: 'why' }, 'End it and continue here', 'Other');
        const q = out[1];
        ok('a confirmation is a question on the phone with its buttons', q.kind === 'message' && q.modal === true && q.detail === 'why'
            && q.buttons.join('|') === 'End it and continue here|Other' && typeof q.id === 'string');
        ok('the phone\'s answer settles it with the button\'s own value', r.answer({ id: q.id, value: 0 }) === true && await p === 'End it and continue here');
        ok('…once', r.answer({ id: q.id, value: 1 }) === false);
        const item = { title: 'Go' };
        const p2 = r.info('Go?', item);
        r.answer({ id: out[2].id, value: 0 });
        ok('a MessageItem answer is the item itself', await p2 === item);
        const picks = [{ label: 'one', description: 'd1' }, { label: 'two', detail: 'x' }];
        const p3 = r.pick(Promise.resolve(picks), { placeHolder: 'which' });
        await new Promise(res => setImmediate(res));
        const pq = out[3];
        ok('a pick sends labels, descriptions and details', pq.kind === 'pick' && pq.placeHolder === 'which'
            && pq.items[0].label === 'one' && pq.items[0].description === 'd1' && pq.items[1].detail === 'x');
        r.answer({ id: pq.id, value: 1 });
        ok('…and the answer is the picked item itself', await p3 === picks[1]);
        const p4 = r.pick(['a', 'b']);
        await new Promise(res => setImmediate(res));
        r.answer({ id: out[4].id, value: 7 });
        ok('an answer out of range is no answer', await p4 === undefined);
        const p5 = r.input({ prompt: 'name', value: 'x', password: true });
        ok('a typed answer asks with its prompt, value and whether it is secret', out[5].kind === 'input' && out[5].prompt === 'name' && out[5].value === 'x' && out[5].password === true);
        r.answer({ id: out[5].id, value: 'yeni ad' });
        ok('…and gets the words', await p5 === 'yeni ad');
        const p6 = r.input({});
        r.answer({ id: out[6].id, value: 42 });
        ok('a typed answer that is not text is no answer', await p6 === undefined);
        ok('choosing PC files from a phone is refused aloud, as a cancelled dialog', await r.open({}) === undefined
            && out[7].kind === 'note' && /not available on the phone/.test(out[7].message));
        const rows = [{ label: '$(check) $(blank) Ajan Çiftliği', description: 'active', picked: true }, { label: '', kind: -1 },
            { label: '$(circle-slash) No project', description: '$(sync~spin) busy', detail: 'x' }, '$(add) New'];
        const p8 = r.pick(rows);
        await new Promise(res => setImmediate(res));
        const sq = out[8];
        ok('‼️ a phone is never sent a VS Code icon or a separator row', sq.kind === 'pick' && sq.items.length === 3
            && !JSON.stringify(sq.items).includes('$(') && sq.items[1].label === 'No project' && sq.items[1].description === 'busy' && sq.items[2].label === 'New');
        ok('…and a tick still says which one is chosen', sq.items[0].label === '✓ Ajan Çiftliği');
        r.answer({ id: sq.id, value: 1 });
        ok('‼️ …and the answer is the item at THAT place, not the separator\'s neighbour', await p8 === rows[2]);
        const manyRows = [{ label: 'a', picked: true }, { label: '', kind: -1 }, { label: 'b' }, { label: 'c', picked: true }];
        const p9 = r.pick(manyRows, { canPickMany: true, placeHolder: 'which ones' });
        await new Promise(res => setImmediate(res));
        const mq = out[9];
        ok('a many-pick tells the phone so, with the rows already ticked', mq.many === true && mq.items.length === 3
            && mq.items[0].picked === true && !mq.items[1].picked && mq.items[2].picked === true);
        r.answer({ id: mq.id, value: [2, 1, 2, 9, -1, 'x', 1.5] });
        const got9 = await p9;
        ok('‼️ …and answers with the ticked items in their order, nothing out of range, nothing twice',
            Array.isArray(got9) && got9.length === 2 && got9[0] === manyRows[2] && got9[1] === manyRows[3]);
        const p10 = r.pick(['x', 'y'], { canPickMany: true });
        await new Promise(res => setImmediate(res));
        r.answer({ id: out[10].id, value: 1 });
        ok('a many-pick answered with one place is no answer (VS Code answers it with a list)', await p10 === undefined);
        ok('a single pick sends no ticks', !('many' in out[8]) && !out[8].items.some(i => 'picked' in i));
        const outBefore = out.length;
        await r.copy('chn_x1\ncorpus');
        ok('‼️ X-552: a text the farm made goes to the PHONE\'s clipboard, written by the page', out.length === outBefore + 1
            && out[outBefore].type === 'afAsk' && out[outBefore].kind === 'copy' && out[outBefore].text === 'chn_x1\ncorpus' && !('id' in out[outBefore]));
        await desktopAsk().copy('on the PC');
        ok('…and on the desktop it is the PC\'s clipboard, as before', calls.some(c => c.name === 'clipboard' && c.args[0] === 'on the PC'));
        const p7 = r.warn('pending', { modal: true }, 'A');
        r.end();
        ok('a view that closes answers what it left open with nothing', await p7 === undefined);
        const before = out.length;
        ok('…and a closed view asks nothing more', await r.warn('late', 'A') === undefined && out.length === before);
    }

    // ---------------------------------------------------------------- the view routes the answer, not the page
    {
        const pageGot = [];
        const posted = [];
        let hostOf;
        const views = new RemoteViews({
            media: uri('/ext/media'), atLeast: (have, need) => ['read', 'answer', 'manage'].indexOf(have) >= ['read', 'answer', 'manage'].indexOf(need),
            pages: { p: { open: 'read', act: 'manage', looks: [], answers: [], pcOnly: [], make: h => { hostOf = h; h.webview.onDidReceiveMessage(m => pageGot.push(m)); } } }
        });
        const caller = { device: 'd1', scope: 'read' };
        views.open(caller, 'v1', 'p', undefined, m => posted.push(m));
        ok('a phone\'s view carries the phone\'s asker', hostOf && hostOf.ask instanceof RemoteAsk);
        const p = hostOf.ask.warn('Sure?', { modal: true }, 'Yes');
        const q = posted.find(m => m.type === 'afAsk');
        ok('the question goes out through the view', !!q && q.buttons[0] === 'Yes');
        views.message(caller, 'v1', { type: 'afAskAnswer', id: 'nope', value: 0 });
        ok('an answer naming nothing never reaches the page', pageGot.length === 0);
        views.message(caller, 'v1', { type: 'afAskAnswer', id: q.id, value: 0 });
        ok('the answer settles the question and never reaches the page', await p === 'Yes' && pageGot.length === 0);
        const p2 = hostOf.ask.warn('Again?', { modal: true }, 'Yes');
        views.close(caller, 'v1');
        ok('closing the view answers what was open with nothing', await p2 === undefined);
    }

    // ---------------------------------------------------------------- the gate: a page on the host asks its host
    {
        const hosted = ['consolePanel.ts', 'needsPanel.ts', 'nowPanel.ts', 'sessionsPanel.ts', 'tasksPanel.ts', 'sessionViewer.ts', 'noticesPanel.ts', 'dashboard.ts', 'missionsPanel.ts', 'queuePanel.ts'];
        const direct = /vscode\.window\.(showInformationMessage|showWarningMessage|showErrorMessage|showQuickPick|showInputBox|showOpenDialog)\(/;
        for (const f of hosted) {
            const src = fs.readFileSync(path.join(ROOT, 'src', 'panels', f), 'utf8');
            ok(`‼️ ${f} asks through its host, never vscode.window directly`, !direct.test(src));
        }
        const desk = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'panelHost.ts'), 'utf8');
        ok('a desktop tab asks through vscode.window (desktopAsk)', /ask: desktopAsk\(\)/.test(desk));
    }

    // ---------------------------------------------------------------- the page side, in a real Chrome at phone width
    let bin;
    try { bin = require('./shoot_page').browser(); } catch { bin = null; }
    if (!bin) { console.log('  (no Chrome here — the page side is skipped)'); } else {
        const os = require('os');
        const { execFileSync } = require('child_process');
        const { headlessFlags } = require('./headless_chrome');
        const { withPhoneLayer, windowSize, PHONE } = require('./phone_frame');
        const askJs = fs.readFileSync(path.join(ROOT, 'media', 'afAsk.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
        const page = withPhoneLayer('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="af-head"></div></body></html>', 'console')
            .replace(/<\/body>(?![\s\S]*<\/body>)/i, '<script>' + askJs + '</script></body>');
        const expr = `(function(){
            var sent=[]; window.acquireVsCodeApi=function(){return{postMessage:function(m){sent.push(m);}};};
            var A=window.AFAsk, r={};
            A.onAsk({type:'afAsk',id:'q1',kind:'message',level:'warn',modal:true,message:'End it?',detail:'why',buttons:['End it and continue here','Other']});
            var box=document.getElementById('af-sheet');
            r.msgButtons=box?box.querySelectorAll('[data-afaskat]').length:-1;
            r.msgFits=box?box.getBoundingClientRect().width<=window.innerWidth:false;
            r.msgText=box?box.textContent.indexOf('End it?')>=0&&box.textContent.indexOf('why')>=0:false;
            box.querySelector('[data-afaskat="0"]').click();
            r.msgAnswer=sent.slice(); r.msgClosed=!document.getElementById('af-sheet');
            sent.length=0;
            var items=[];for(var i=0;i<10;i++){items.push({label:'agent'+i,description:i===3?'the third':''});}
            A.onAsk({type:'afAsk',id:'q2',kind:'pick',items:items,placeHolder:'which'});
            box=document.getElementById('af-sheet');
            var f=box.querySelector('[data-afaskfilter]'); r.hasFilter=!!f;
            f.value='third'; f.dispatchEvent(new Event('input'));
            r.shown=[].slice.call(box.querySelectorAll('[data-afaskat]')).filter(function(b){return b.style.display!=='none';}).length;
            box.querySelector('[data-afaskat="3"]').click();
            r.pickAnswer=sent.slice(); sent.length=0;
            A.onAsk({type:'afAsk',id:'q7',kind:'pick',many:true,items:[{label:'one',picked:true},{label:'two'},{label:'three',picked:true}]});
            box=document.getElementById('af-sheet');
            var mrows=[].slice.call(box.querySelectorAll('[data-afaskat]'));
            r.manyTicks=mrows.map(function(b){return b.getAttribute('aria-pressed')+':'+b.querySelector('[data-afasktick]').textContent;}).join(',');
            r.manyMinH=Math.min.apply(null,mrows.concat([box.querySelector('[data-afaskok]')]).map(function(b){return b.getBoundingClientRect().height;}));
            mrows[1].click(); mrows[2].click();
            r.manyOpen=!!document.getElementById('af-sheet')&&sent.length===0;
            r.manyAfter=mrows.map(function(b){return b.querySelector('[data-afasktick]').textContent;}).join('');
            box.querySelector('[data-afaskok]').click();
            r.manyAnswer=sent.slice(); sent.length=0;
            A.onAsk({type:'afAsk',id:'q8',kind:'pick',many:true,items:[{label:'one',picked:true}]});
            document.getElementById('af-sheet').querySelector('[data-afaskno]').click();
            r.manyCancel=sent.slice(); sent.length=0;
            A.onAsk({type:'afAsk',id:'q3',kind:'input',prompt:'name',value:'eski',password:false});
            box=document.getElementById('af-sheet');
            var inp=box.querySelector('[data-afaskin]'); r.inputValue=inp.value; inp.value='yeni ad';
            box.querySelector('[data-afaskok]').click();
            r.inputAnswer=sent.slice(); sent.length=0;
            A.onAsk({type:'afAsk',id:'q4',kind:'message',level:'info',message:'Go?',buttons:['Go']});
            document.querySelector('[data-afsheetx]').click();
            r.closeAnswer=sent.slice(); sent.length=0;
            A.onAsk({type:'afAsk',id:'q5',kind:'message',level:'info',message:'First?',buttons:['A']});
            A.onAsk({type:'afAsk',id:'q6',kind:'message',level:'info',message:'Second?',buttons:['B']});
            r.replaced=sent.slice(); sent.length=0;
            window.AFMobile.closeSheet(); sent.length=0;
            var copied=[]; window.AFCtx=window.AFCtx||{}; window.AFCtx.copy=function(v){copied.push(v);};
            A.onAsk({type:'afAsk',kind:'copy',text:'chn_x1'});
            r.copied=copied.slice(); r.copySent=sent.length; r.copySheet=!!document.getElementById('af-sheet');
            A.onAsk({type:'afAsk',kind:'note',level:'warn',message:'Agent Farm: refused',detail:'because'});
            var t=document.getElementById('af-ask-toast');
            r.toast=t?t.textContent:''; r.noteSent=sent.length;
            return r;})()`;
        const MARK = 'AF-ASK';
        const probe = '<script>window.addEventListener("load",function(){var out;try{out=JSON.stringify(' + expr + ');}catch(e){out=JSON.stringify("ERROR: "+e.message);}'
            + 'document.body.innerHTML="<pre id=\\"' + MARK + '\\"></pre>";document.getElementById("' + MARK + '").textContent=out;});</script>';
        const file = path.join(os.tmpdir(), 'af-ask-' + process.pid + '.html');
        fs.writeFileSync(file, page.replace(/<\/body>(?![\s\S]*<\/body>)/i, probe + '</body>'), 'utf8');
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'af-ask-'));
        let r = null;
        try {
            const dom = execFileSync(bin, headlessFlags(profile).concat([windowSize(PHONE.portrait), '--virtual-time-budget=3000',
                '--dump-dom', 'file:///' + file.replace(/\\/g, '/')]), { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
            const m = new RegExp('<pre id="' + MARK + '">([\\s\\S]*?)</pre>').exec(dom);
            r = m ? JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : null;
        } finally {
            fs.rmSync(file, { force: true });
            try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ }
        }
        if (typeof r === 'string') { console.log('  page error: ' + r); r = null; }
        r = r || {};
        ok('a confirmation is a sheet with its buttons, its words and its detail', r.msgButtons === 2 && r.msgText === true);
        ok('…that fits the phone\'s width', r.msgFits === true);
        ok('a tapped button answers with its place, once, and the sheet goes',
            JSON.stringify(r.msgAnswer) === JSON.stringify([{ type: 'afAskAnswer', id: 'q1', value: 0 }]) && r.msgClosed === true);
        ok('a long pick gets a filter that narrows it', r.hasFilter === true && r.shown === 1);
        ok('…and a picked row answers with its place', JSON.stringify(r.pickAnswer) === JSON.stringify([{ type: 'afAskAnswer', id: 'q2', value: 3 }]));
        ok('a many-pick opens with the host\'s ticks shown', r.manyTicks === 'true:☑,false:☐,true:☑');
        ok('…a tap ticks a row on or off and answers nothing yet', r.manyOpen === true && r.manyAfter === '☑☑☐');
        ok('‼️ …OK answers with every ticked place', JSON.stringify(r.manyAnswer) === JSON.stringify([{ type: 'afAskAnswer', id: 'q7', value: [0, 1] }]));
        ok('…Cancel answers nothing', JSON.stringify(r.manyCancel) === JSON.stringify([{ type: 'afAskAnswer', id: 'q8' }]));
        ok('every row and OK of a many-pick is a finger\'s height (measured ' + r.manyMinH + ')', r.manyMinH >= 44);
        ok('a typed answer starts from the host\'s value and answers with the words',
            r.inputValue === 'eski' && JSON.stringify(r.inputAnswer) === JSON.stringify([{ type: 'afAskAnswer', id: 'q3', value: 'yeni ad' }]));
        ok('closing the sheet answers nothing (a dismissed dialog)',
            Array.isArray(r.closeAnswer) && r.closeAnswer.length === 1 && r.closeAnswer[0].id === 'q4' && r.closeAnswer[0].value === undefined);
        ok('a second question closes the first as unanswered', Array.isArray(r.replaced) && r.replaced.length === 1 && r.replaced[0].id === 'q5' && r.replaced[0].value === undefined);
        ok('‼️ a copy the farm sends is written through the page\'s own clipboard door, with no sheet and no answer',
            JSON.stringify(r.copied) === '["chn_x1"]' && r.copySent === 0 && r.copySheet === false);
        ok('a note is a toast without the "Agent Farm:" prefix and posts nothing back',
            /refused/.test(r.toast || '') && /because/.test(r.toast || '') && !/Agent Farm:/.test(r.toast || '') && r.noteSent === 0);
    }

    console.log(`test_panel_ask: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
