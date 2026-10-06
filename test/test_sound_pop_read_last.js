// U-200 — THE SESSION SOUND PANEL'S ▶ Read last answer, measured in a real Chrome. The button is
// put beside the Read-aloud switch AFTER the panel is drawn (afSoundPop.js render: closest('.sp-line')
// + insertAdjacentHTML), which the page shim cannot run — its elements have no ancestors. So the
// panel is opened here the way a page opens it (attach → open → the host's soundPopData) and the
// laid-out DOM is asked: is the button there, on the switch's own line, inside the panel, and does a
// press ask the host to read this session's last answer? On a phone it is not drawn at all.
//   node test/test_sound_pop_read_last.js --keep <file.html>  → also leaves the drawn page there
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { headlessFlags } = require('./headless_chrome');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

let bin;
try { bin = require('./shoot_page').browser(); } catch { bin = null; }
if (!bin) { console.log('test_sound_pop_read_last: no Chrome here — skipped'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const media = f => fs.readFileSync(path.join(ROOT, 'media', f), 'utf8').replace(/<\/script/gi, '<\\/script');
const MARK = 'AF-SPREAD';

const PROFILE = {
    sessionId: 's1', label: 'developer #2', sound: 'like-all', read: true, speechVoice: '', fleetSpeechVoice: 'Tolga',
    tones: [{ event: 'turn-ready', chosen: '', voice: 'crystal', origin: 'default' }, { event: 'question', chosen: 'bell', voice: 'bell', origin: 'session' }],
    also: { focus: true, modal: false, toast: false }
};
const ALERTS = {
    voices: [
        { id: 'crystal', label: 'Crystal', builtin: true, playable: true, exists: true },
        { id: 'bell', label: 'Bell', builtin: true, playable: true, exists: true }
    ],
    speak: { voices: [{ name: 'Tolga', label: 'Tolga (tr-TR)' }] }
};

// The page a webview would be: the shell's sheet, the panel's two helpers, the panel, and a host
// stand-in that records what the panel posts. Without ?af=measure it just stays drawn (the picture).
const SETUP = `window.__sent=[];window.__send=function(d){window.dispatchEvent(new MessageEvent('message',{data:d}));};
window.__show=function(){AFSoundPop.open('s1',{right:24,top:24});window.__send({type:'soundPopData',profile:${JSON.stringify(PROFILE)},alerts:${JSON.stringify(ALERTS)}});};
AFSoundPop.attach({postMessage:function(m){window.__sent.push(m);}});window.__show();`;

const MEASURE = `(function(){
    var r={}, sent=window.__sent;
    r.asked=sent.length?sent[0]:null;
    var b=document.querySelector('[data-spreadlast]');
    r.drawn=!!b;
    if(!b){return r;}
    r.text=b.textContent.trim();
    var line=b.closest('.sp-line'), sw=line&&line.querySelector('[data-spread]');
    r.sameLine=!!sw;
    var pop=document.querySelector('.sp-pop').getBoundingClientRect(), bb=b.getBoundingClientRect();
    r.box={w:Math.round(bb.width),h:Math.round(bb.height)};
    r.inside=bb.width>0&&bb.height>0&&bb.left>=pop.left&&bb.right<=pop.right&&bb.top>=pop.top&&bb.bottom<=pop.bottom;
    var hit=document.elementFromPoint(bb.left+bb.width/2,bb.top+bb.height/2);
    r.onTop=!!hit&&(hit===b||b.contains(hit));
    r.title=b.getAttribute('title')||'';
    var before=sent.length;
    b.click();
    r.posted=sent.slice(before);
    r.stillOpen=!!document.querySelector('.sp-pop');
    window.__AFUI__={remote:true};
    window.__show();
    r.phonePanel=!!document.querySelector('.sp-pop');
    r.phoneDrawn=!!document.querySelector('[data-spreadlast]');
    window.AFPhoneRead={on:true,mute:false};
    window.__show();
    r.speakingDrawn=!!document.querySelector('[data-spreadlast]');
    return r;
})()`;

function page() {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
        + fs.readFileSync(path.join(ROOT, 'media', 'common.css'), 'utf8')
        + 'body{background:#1f1f1f;color:#ccc;font-family:Segoe UI,sans-serif;font-size:13px;}</style></head><body>'
        + ['charts.js', 'afSoundCard.js', 'afSoundPop.js', 'afReadAloud.js'].map(f => '<script>' + media(f) + '</script>').join('')
        + '<script>' + SETUP + '</script>'
        + '<script>if(location.search.indexOf("af=measure")>=0){window.addEventListener("load",function(){var out;'
        + 'try{out=JSON.stringify(' + MEASURE + ');}catch(e){out=JSON.stringify("ERROR: "+e.message);}'
        + 'document.body.innerHTML="<pre id=\\"' + MARK + '\\"></pre>";document.getElementById("' + MARK + '").textContent=out;});}</script>'
        + '</body></html>';
}

function measure(file) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'af-spread-'));
    try {
        const dom = execFileSync(bin, headlessFlags(profile).concat(['--window-size=900,640', '--virtual-time-budget=3000',
            '--dump-dom', 'file:///' + file.replace(/\\/g, '/') + '?af=measure']), { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
        const m = new RegExp('<pre id="' + MARK + '">([\\s\\S]*?)</pre>').exec(dom);
        const r = m ? JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : null;
        if (typeof r === 'string') { console.log('  page error: ' + r); return {}; }
        return r || {};
    } finally {
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ }
    }
}

const kIdx = process.argv.indexOf('--keep');
const keep = kIdx >= 0 ? path.resolve(process.argv[kIdx + 1] || '') : '';
const file = keep || path.join(os.tmpdir(), 'af-spread-' + process.pid + '.html');
fs.writeFileSync(file, page(), 'utf8');
let r;
try { r = measure(file); } finally { if (!keep) { fs.rmSync(file, { force: true }); } }

ok('opening the panel asks the host for this session\'s profile', !!r.asked && r.asked.type === 'alertSessionOpen' && r.asked.sessionId === 's1');
ok('‼️ the panel draws ▶ Read last answer (the shim cannot — this is the only proof it is drawn)', r.drawn === true && r.text === '▶ Read last answer');
ok('it sits on the Read-aloud switch\'s own line', r.sameLine === true);
ok('inside the panel, with a real size, and nothing covers it', r.inside === true && r.onTop === true && !!r.box && r.box.w > 0);
ok('its hover says what it reads', /last answer aloud/.test(r.title || ''));
const p = (r.posted || [])[0] || {};
ok('a press asks the host to read this session\'s last answer, from the sound panel, and nothing else',
    (r.posted || []).length === 1 && p.type === 'readAloud' && p.sessionId === 's1'
    && JSON.stringify(p.pick) === '{}' && p.surface === 'soundPanel');
ok('the press leaves the panel open', r.stillOpen === true);
ok('on a phone that cannot speak the panel opens without it (a phone never makes the PC speak)', r.phonePanel === true && r.phoneDrawn === false);
ok('on a phone that speaks it is drawn — the phone reads it with its own voice (U-209)', r.speakingDrawn === true);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
