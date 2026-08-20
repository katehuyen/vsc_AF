// Post one or more bridge requests and print the answers.
// Usage: node .tmp/bridge.js <payload-file.json>   (an array of {op,args})
const fs = require('fs');
const path = require('path');

const DIR = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage',
    'muvusoft.agent-farm', 'bridge');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function post(payload, i) {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const name = `developer-${stamp}-${i}-${Math.random().toString(36).slice(2, 7)}`;
    const req = path.join(DIR, name + '.request.json');
    const res = path.join(DIR, name + '.response.json');
    fs.writeFileSync(req, JSON.stringify(payload), 'utf8');
    for (let w = 0; w < 90; w++) {
        if (fs.existsSync(res)) {
            const raw = fs.readFileSync(res, 'utf8').replace(/^﻿/, '');
            fs.unlinkSync(res);
            return JSON.parse(raw);
        }
        await sleep(1000);
    }
    return { ok: false, error: 'no response in 90s — is VS Code open?' };
}

(async () => {
    const list = JSON.parse(fs.readFileSync(process.argv[2], 'utf8').replace(/^﻿/, ''));
    let i = 0;
    for (const p of list) {
        const out = await post(p, i++);
        console.log('--- ' + p.op + ' ---');
        console.log(JSON.stringify(out, null, 1).slice(0, 3000));
    }
})();
