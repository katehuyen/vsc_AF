// Türkçe — the Projects page (media/projects.js and its backlog place box, media/afBlPlace.js). A part of the catalog (media/afI18n.js LANGS).
(function (table) {
    'use strict';
    if (typeof module !== 'undefined' && module.exports) { module.exports = table; }
    if (typeof window !== 'undefined' && window.AFI18n) { window.AFI18n.add('tr', table); }
})({
    'One place further down the queue (a bigger number)': 'Kuyrukta bir sıra aşağı (daha büyük numara)',
    'One place further up the queue (a smaller number)': 'Kuyrukta bir sıra yukarı (daha küçük numara)',
    'The place to move it to, 1 to {n}: the small ▲ ▼ or the wheel set it, ✓ or Enter moves it':
        'Taşınacağı sıra, 1–{n}: yanındaki küçük ▲ ▼ ya da tekerlek ayarlar, ✓ ya da Enter taşır',
    'Move it to the place in the box': 'Kutudaki sıraya taşı'
});
