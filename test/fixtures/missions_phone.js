// X-466 — the Missions page as a phone's view draws it: __AFUI__.remote is set, so the
// folder picker, a run's Sessions page button, the output-file links and the guide
// link are not drawn. Same form and runs as `missions`.
//   node test/shoot_page.js missions_phone --phone
const base = require('./missions');
module.exports = Object.assign({}, base, {
    window: Object.assign({}, base.window, { __AFUI__: { remote: true } })
});
