// X-456 — the Dashboard as a phone's view draws it: __AFUI__.remote is set, so what
// opens an agent's page, starts a session, makes an agent, opens the guide or a
// settings editor on the PC is not drawn. Same board as `dashboard`.
//   node test/shoot_page.js dashboard_phone --phone
const base = require('./dashboard');
module.exports = Object.assign({}, base, {
    window: { __AFUI__: Object.assign({}, base.window.__AFUI__, { remote: true }) }
});
