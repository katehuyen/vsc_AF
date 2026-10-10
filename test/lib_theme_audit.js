// U-236 — WHAT A RENDER LOOKS LIKE, IN NUMBERS. A render (test/render_page.js) is opened in
// headless Chrome and measured in place:
//   · every visible text against what is really behind it — the background colours of its
//     ancestors composed up to the first opaque one, its own and its ancestors' opacity — as a
//     WCAG contrast ratio, with the ratio it needs (4.5, or 3 for large text);
//   · a FINGERPRINT of every element's computed colours (text, background, four borders,
//     shadow, outline, opacity) — two renders with the same fingerprint draw the same colours.
// The light theme is held to the first; the dark theme to the second, unchanged.
// A colour it cannot read is listed (`unread`), never skipped: color-mix() computes to
// color(srgb …), and reading only rgb() once dropped those texts and grounds unseen.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { headlessFlags } = require('./headless_chrome');

const MARK = 'AF-THEME-AUDIT';

/** Runs inside the page; returns { texts, low, fingerprint, elements, ground: the body's own background }. */
const PROBE = `(function(){
  function parse(c){var m=/rgba?\\(([^)]+)\\)/.exec(c||''),k=1;if(!m){m=/^color\\(srgb ([^)]+)\\)$/.exec(c||'');k=255;}if(!m){return null;}var p=m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number);return {r:p[0]*k,g:p[1]*k,b:p[2]*k,a:p.length>3?p[3]:1};}
  function over(t,u){var a=t.a+u.a*(1-t.a);if(!a){return {r:0,g:0,b:0,a:0};}return {r:(t.r*t.a+u.r*u.a*(1-t.a))/a,g:(t.g*t.a+u.g*u.a*(1-t.a))/a,b:(t.b*t.a+u.b*u.a*(1-t.a))/a,a:a};}
  function unread(c){if(out.unread.indexOf(c)<0){out.unread.push(c);}}
  function behind(el){var layers=[];for(var e=el;e;e=e.parentElement){var raw=getComputedStyle(e).backgroundColor,c=parse(raw);if(!c){unread(raw);}if(c&&c.a>0){layers.push(c);if(c.a>=1){break;}}}
    var acc={r:255,g:255,b:255,a:1};for(var i=layers.length-1;i>=0;i--){acc=over(layers[i],acc);}return acc;}
  function lum(c){function f(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);}
  function ratio(a,b){var x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}
  function opac(el){var op=1;for(var e=el;e;e=e.parentElement){op*=Number(getComputedStyle(e).opacity);}return op;}
  function where(el){return el.tagName.toLowerCase()+(el.className&&typeof el.className==='string'?'.'+el.className.trim().split(/\\s+/).join('.'):'');}
  /* A BOX is a fill that differs from its ground or a drawn line (an inset box-shadow is one); its EDGE is the
     stronger of fill-to-ground and line-to-ground, and needs 3:1 to be seen (WCAG 1.4.11, which exempts a
     disabled control). Every box and every
     control is listed [index, edge x100, box 0/1, where]: the same fixture draws the same elements in every
     theme, so a box in one theme can be looked up in another by its index. */
  function edge(el,cs){var r=el.getBoundingClientRect();if(r.width<8||r.height<8||cs.visibility==='hidden'||el.disabled===true){return;}var op=opac(el);if(!op){return;}
    var gr=el.parentElement?behind(el.parentElement):{r:255,g:255,b:255,a:1};
    var ctl=/^(BUTTON|SELECT|TEXTAREA)$/.test(el.tagName)||(el.tagName==='INPUT'&&!/^(checkbox|radio|range|color|hidden|file)$/.test(el.type));
    var own=parse(cs.backgroundColor),fill=1,line=0,drawn=false;if(own&&own.a>0){own.a*=op;fill=ratio(over(own,gr),gr);}
    function seen(c){if(c&&c.a>0){drawn=true;c.a*=op;line=Math.max(line,ratio(over(c,gr),gr));}}
    var S=['Top','Right','Bottom','Left'];for(var s=0;s<4;s++){var st=cs['border'+S[s]+'Style'];if(parseFloat(cs['border'+S[s]+'Width'])>=1&&st!=='none'&&st!=='hidden'){seen(parse(cs['border'+S[s]+'Color']));}}
    var sh=/^(rgba?\\([^)]*\\)|color\\(srgb [^)]*\\)) 0px 0px 0px ([\\d.]+)px inset/.exec(cs.boxShadow||'');if(sh&&parseFloat(sh[2])>=1){seen(parse(sh[1]));}
    var box=drawn||fill>=1.05;if(!box&&!ctl){return;}if(box){out.boxes++;}var k=Math.max(fill,line);
    out.edges.push([i,Math.round(k*100),box?1:0,where(el)]);}
  var out={texts:0,low:[],elements:0,unread:[],boxes:0,edges:[]},fp=[];
  var all=document.querySelectorAll('.rndr-page *');
  for(var i=0;i<all.length;i++){var el=all[i],cs=getComputedStyle(el);
    fp.push([el.tagName,cs.color,cs.backgroundColor,cs.borderTopColor,cs.borderRightColor,cs.borderBottomColor,cs.borderLeftColor,cs.boxShadow,cs.outlineColor,cs.opacity].join('|'));
    edge(el,cs);
    var own=false;for(var n=el.firstChild;n;n=n.nextSibling){if(n.nodeType===3&&n.data.trim()){own=true;break;}}
    if(!own){continue;}var r=el.getBoundingClientRect();if(!r.width||!r.height||cs.visibility==='hidden'){continue;}
    var op=1;for(var e=el;e;e=e.parentElement){op*=Number(getComputedStyle(e).opacity);}
    if(op===0){continue;}
    var txt='';for(var m=el.firstChild;m;m=m.nextSibling){if(m.nodeType===3){txt+=m.data;}}
    if(/^[\\p{Extended_Pictographic}\\uFE0F\\u200D\\s]+$/u.test(txt)){continue;}
    var fg=parse(cs.color);if(!fg){unread(cs.color);continue;}var bg=behind(el);fg.a*=op;var k=ratio(over(fg,bg),bg);
    var size=parseFloat(cs.fontSize),bold=Number(cs.fontWeight)>=700,need=size>=18.66||(size>=14&&bold)?3:4.5;
    out.texts++;
    if(k<need){out.low.push({i:i,text:txt.trim().slice(0,40),ratio:Math.round(k*100)/100,need:need,color:cs.color,bg:'rgb('+Math.round(bg.r)+','+Math.round(bg.g)+','+Math.round(bg.b)+')',where:el.tagName.toLowerCase()+(el.className&&typeof el.className==='string'?'.'+el.className.trim().split(/\\s+/).join('.'):'')});}
  }
  var s=fp.join('\\n'),h=2166136261;for(var j=0;j<s.length;j++){h^=s.charCodeAt(j);h=Math.imul(h,16777619)>>>0;}
  out.elements=fp.length;out.fingerprint=h.toString(16);out.ground=getComputedStyle(document.body).backgroundColor;return out;})()`;

/** Measure one render file. `bin`: the Chrome to use (test/shoot_page.js browser()). */
function audit(htmlFile, bin) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-theme-audit-'));
    try {
        const page = path.join(tmp, 'page.html');
        // A pulse caught mid-frame made the same page fingerprint differently run to run (U-237):
        // the declared styles are measured, not a moment of an animation.
        const html = fs.readFileSync(htmlFile, 'utf8').replace('</body>', '<style>*,*::before,*::after{animation:none!important;transition:none!important}</style>'
            + '<script>window.addEventListener("load",function(){var out;'
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
