// X-456 — the session viewer as a phone's view draws it: __AFUI__.remote is set,
// so what opens a file, a terminal, an editor or a save dialog on the PC is not
// drawn. Same scenes as `sessionviewer`.
//   node test/shoot_page.js sessionviewer_phone --phone
const base = require('./sessionviewer');
module.exports = Object.assign({}, base, { window: { __AFUI__: { remote: true } } });
