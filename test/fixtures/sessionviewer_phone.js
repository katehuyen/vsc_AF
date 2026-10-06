// X-456 — the session viewer as a phone's view draws it: __AFUI__.remote is set,
// so what opens a file, a terminal, an editor or a save dialog on the PC is not
// drawn. Same scenes as `sessionviewer`, except reading aloud (U-199): the phone
// draws no 🔊, ■ or ▶ (reading plays on the PC), so the PC's three reading scenes
// are one phone scene — every step hovered, mid-reading, ⧉ alone.
//   node test/shoot_page.js sessionviewer_phone --phone
const base = require('./sessionviewer');
const READING = ['sessionviewer-read-hover', 'sessionviewer-reading', 'sessionviewer-reading-paused'];
module.exports = Object.assign({}, base, {
    window: { __AFUI__: { remote: true } },
    variants: () => {
        const all = base.variants();
        const hover = all.find(v => v.id === 'sessionviewer-read-hover');
        const reading = all.find(v => v.id === 'sessionviewer-reading');
        return all.filter(v => !READING.includes(v.id)).concat([{
            id: 'sessionviewer-phone-read',
            label: 'Session viewer on a phone — every step hovered while the PC reads the answer: ⧉ alone, no 🔊 or ■',
            data: reading.data,
            act: hover.act
        }]);
    }
});
