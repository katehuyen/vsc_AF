// The Settings page's source as one text: media/settings.js and every media/afSetting*.js
// part split out of it (U-225). A test that reads the page's code reads it here, so moving
// a function into a part never reads as the function having gone.
'use strict';
const fs = require('fs');
const path = require('path');

const MEDIA = path.join(__dirname, '..', 'media');

function settingsPageSource() {
    const parts = fs.readdirSync(MEDIA).filter(f => /^afSetting\w*\.js$/.test(f)).sort();
    return ['settings.js', ...parts].map(f => fs.readFileSync(path.join(MEDIA, f), 'utf8')).join('\n');
}

/** What a sweep over media/*.js reads for one file: settings.js or one of its parts reads as the whole page. */
function mediaSource(file) {
    return /^(settings|afSetting\w*)\.js$/.test(file) ? settingsPageSource() : fs.readFileSync(path.join(MEDIA, file), 'utf8');
}

module.exports = { settingsPageSource, mediaSource };
