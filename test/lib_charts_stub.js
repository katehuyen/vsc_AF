/**
 * ‼️ U-130 — A STUBBED `AFCharts` IS A COPY, AND A COPY DRIFTS.
 *
 * `lib_page_dom.js` runs the REAL `media/charts.js` (see its own note). The
 * older webview tests build their own sandbox and hand-write an `AFCharts`
 * with the three or four functions that page happened to call — so the day a
 * shared helper is added to `charts.js`, every one of those tests dies with
 * `C.<new thing> is not a function` while the extension itself is fine. That
 * is a false alarm on one side and no alarm at all on the other.
 *
 * This hands back the real object with the test's own overrides on top: a test
 * that wants a plainer `esc` for readable assertions keeps it, and everything
 * it did NOT think about is the real implementation rather than a hole.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let real = null;
function realCharts() {
    if (!real) {
        const box = { window: {} };
        vm.createContext(box);
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'media', 'charts.js'), 'utf8'), box);
        real = box.window.AFCharts;
    }
    return real;
}

/** The real `window.AFCharts`, with `over` merged over it. */
function charts(over) {
    return Object.assign({}, realCharts(), over || {});
}

module.exports = { charts, realCharts };
