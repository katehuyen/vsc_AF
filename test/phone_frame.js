/**
 * U-176 — A PHONE'S SCREEN FOR shoot_page / measure_page.
 *
 * ‼️ HEADLESS CHROME WILL NOT LAY A PAGE OUT BELOW 500px. `--window-size=360,800`
 * is silently widened: measured on the Now page, `innerWidth` answered 500 and
 * a "360px" picture was a 500px layout cut down the right side — every narrow
 * rule untested, in a picture that looked like a phone. So the page is drawn
 * inside an iframe of the phone's exact size (`srcdoc`, so it keeps the parent's
 * origin and a measurement can reach into it), and the window around it only
 * has to be wide enough to hold the frame.
 */

const fs = require('fs');
const path = require('path');

const PHONE = {
    portrait: { w: 360, h: 800, tag: 'phone' },
    landscape: { w: 800, h: 360, tag: 'phone-land' }
};
const MIN_WINDOW = 500;
const FRAME = 'af-phone';

/** `--phone` → portrait, `--phone land` → landscape, absent → null. */
function phoneSize(args) {
    const i = args.indexOf('--phone');
    if (i < 0) { return null; }
    return /^land/.test(String(args[i + 1] || '')) ? PHONE.landscape : PHONE.portrait;
}

function attr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }

/**
 * A render is static markup — the page's scripts ran in the tests' DOM shim —
 * so the phone layer is run here, on the laid-out page, as it runs on a phone.
 */
function withPhoneLayer(html, page) {
    const js = fs.readFileSync(path.join(__dirname, '..', 'media', 'afMobile.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
    const run = `<script>${js}</script><script>window.AFMobile&&window.AFMobile.page(${JSON.stringify(page || '')});</script>`;
    const marked = String(html).replace(/<html\b/i, '<html data-af-phone="1"');
    return /<\/body>/i.test(marked) ? marked.replace(/<\/body>(?![\s\S]*<\/body>)/i, run + '</body>') : marked + run;
}

/** The page inside a phone-sized frame; `outer` is appended to the frame's parent. */
function phoneWrap(html, size, outer, page) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
        + '<body style="margin:0;background:#777">'
        + `<iframe id="${FRAME}" srcdoc="${attr(withPhoneLayer(html, page))}" style="border:0;display:block;width:${size.w}px;height:${size.h}px"></iframe>`
        + (outer || '') + '</body></html>';
}

function windowSize(size) { return `--window-size=${Math.max(size.w, MIN_WINDOW)},${size.h}`; }

module.exports = { PHONE, MIN_WINDOW, FRAME, phoneSize, phoneWrap, withPhoneLayer, windowSize };
