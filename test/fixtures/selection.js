/**
 * A workflow's select step: keep 1-2 of the candidate assets. The candidates
 * carry every kind the page draws differently - pictures, a clip, a sound and a
 * kind it has no preview for - with a long title among them.
 */
'use strict';

const swatch = (fill, label) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="${fill}"/>`
    + `<text x="320" y="190" font-size="48" text-anchor="middle" fill="#fff">${label}</text></svg>`);

function data() {
    return {
        title: 'Cover for the autumn episode',
        message: 'keep the strongest frame',
        min: 1,
        max: 2,
        candidates: [
            { url: 'https://cdn.example/a.png', title: 'Wide shot, warm light', kind: 'image', src: swatch('#7a4b2a', 'A') },
            { url: 'https://cdn.example/b.png', title: 'Close-up', kind: 'image', src: swatch('#2a5a7a', 'B') },
            { url: 'https://cdn.example/c.png', title: 'A very long title for a frame taken at the end of the shoot, after sunset', kind: 'image', src: swatch('#3a7a2a', 'C') },
            { url: 'https://cdn.example/d.mp4', title: 'Teaser clip', kind: 'video', src: '' },
            { url: 'https://cdn.example/e.mp3', title: 'Voice-over take 2', kind: 'audio', src: '' },
            { url: 'https://cdn.example/f.json', title: 'Caption set', kind: 'text', src: '' }
        ]
    };
}

module.exports = {
    script: 'selection.js',
    data,
    variants: () => [{ id: 'selection', label: 'A workflow\'s selection step', data: data() }]
};
