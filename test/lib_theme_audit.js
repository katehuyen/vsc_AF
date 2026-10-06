// U-236 — WHAT A RENDER LOOKS LIKE, IN NUMBERS. A render (test/render_page.js) is opened in
// headless Chrome and measured in place:
//   · every visible text against what is really behind it — the background colours of its
//     ancestors composed up to the first opaque one, its own and its ancestors' opacity — as a
//     WCAG contrast ratio, with the ratio it needs (4.5, or 3 for large text);
//   · a FINGERPRINT of every element's computed colours (text, background, four borders,
//     shadow, outline, opacity) — two renders with the same fingerprint draw the same colours.
// The light theme is held to the first; the dark theme to the second, unchanged.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { headlessFlags } = require('./headless_chrome');

const MARK = 'AF-THEME-AUDIT';

/** Runs inside the page; returns { texts, low, fp, elements }. */
const PROBE = `(function(){
  function parse(c){var m=/rgba?\\(([^)]+)\\)/.exec(c||'');if(!m){return null;}var p=m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number);return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};}
  function over(t,u){var a=t.a+u.a*(1-t.a);if(!a){return {r:0,g:0,b:0,a:0};}return {r:(t.r*t.a+u.r*u.a*(1-t.a))/a,g:(t.g*t.a+u.g*u.a*(1-t.a))/a,b:(t.b*t.a+u.b*u.a*(1-t.a))/a,a:a};}
  function behind(el){var layers=[];for(var e=el;e;e=e.parentElement){var c=parse(getComputedStyle(e).backgroundColor);if(c&&c.a>0){layers.push(c);if(c.a>=1){break;}}}
    var acc={r:255,g:255,b:255,a:1};for(var i=layers.length-1;i>=0;i--){acc=over(layers[i],acc);}return acc;}
  function lum(c){function f(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);}
  function ratio(a,b){var x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}
  var out={texts:0,low:[],elements:0},fp=[];
  var all=document.querySelectorAll('.rndr-page *');
  for(var i=0;i<all.length;i++){var el=all[i],cs=getComputedStyle(el);
    fp.push([el.tagName,cs.color,cs.backgroundColor,cs.borderTopColor,cs.borderRightColor,cs.borderBottomColor,cs.borderLeftColor,cs.boxShadow,cs.outlineColor,cs.opacity].join('|'));
    var own=false;for(var n=el.firstChild;n;n=n.nextSibling){if(n.nodeType===3&&n.data.trim()){own=true;break;}}
    if(!own){continue;}var r=el.getBoundingClientRect();if(!r.width||!r.height||cs.visibility==='hidden'){continue;}
    var op=1;for(var e=el;e;e=e.parentElement){op*=Number(getComputedStyle(e).opacity);}
    if(op===0){continue;}
    var txt='';for(var m=el.firstChild;m;m=m.nextSibling){if(m.nodeType===3){txt+=m.data;}}
    if(/^[\\p{Extended_Pictographic}\\uFE0F\\u200D\\s]+$/u.test(txt)){continue;}
    var fg=parse(cs.color);if(!fg){continue;}var bg=behind(el);fg.a*=op;var k=ratio(over(fg,bg),bg);
    var size=parseFloat(cs.fontSize),bold=Number(cs.fontWeight)>=700,need=size>=18.66||(size>=14&&bold)?3:4.5;
    out.texts++;
    if(k<need){out.low.push({i:i,text:txt.trim().slice(0,40),ratio:Math.round(k*100)/100,need:need,color:cs.color,bg:'rgb('+Math.round(bg.r)+','+Math.round(bg.g)+','+Math.round(bg.b)+')',where:el.tagName.toLowerCase()+(el.className&&typeof el.className==='string'?'.'+el.className.trim().split(/\\s+/).join('.'):'')});}
  }
  var s=fp.join('\\n'),h=2166136261;for(var j=0;j<s.length;j++){h^=s.charCodeAt(j);h=Math.imul(h,16777619)>>>0;}
  out.elements=fp.length;out.fingerprint=h.toString(16);return out;})()`;

/** Measure one render file. `bin`: the Chrome to use (test/shoot_page.js browser()). */
function audit(htmlFile, bin) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-theme-audit-'));
    try {
        const page = path.join(tmp, 'page.html');
        const html = fs.readFileSync(htmlFile, 'utf8').replace('</body>', '<script>window.addEventListener("load",function(){var out;'
            + 'try{out=JSON.stringify(' + PROBE + ');}catch(e){out=JSON.stringify({error:String(e&&e.message||e)});}'
            + 'document.body.innerHTML="<pre id=\\"' + MARK + '\\"></pre>";document.getElementById("' + MARK + '").textContent=out;});</script></body>');
        fs.writeFileSync(page, html, 'utf8');
        const profile = path.join(tmp, 'profile');
        const dom = execFileSync(bin, headlessFlags(profile).concat(['--window-size=1400,900', '--virtual-time-budget=5000', '--dump-dom',
            'file:///' + page.replace(/\\/g, '/')]), { encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
        const m = new RegExp('<pre id="' + MARK + '">([\\s\\S]*?)</pre>').exec(dom);
        if (!m) { return { error: 'the page drew no measurement' }; }
        return JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Chrome still holds it */ }
    }
}

module.exports = { audit };
