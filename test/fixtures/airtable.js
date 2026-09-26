/**
 * X-416 — the Airtable Engine page, so an instance card can be LOOKED at.
 *
 * ‼️ THE CARD THAT MATTERS IS THE DOWN ONE: it now carries Start (node
 * server.js, hidden, no browser) where it used to say "start_admin.bat in its
 * folder starts it". One live card beside it shows the two states side by
 * side; the smallest scene is a single down instance, the one a user meets
 * when nothing is running yet.
 */
const NOW = Date.parse('2026-09-26T12:00:00Z');

const LIVE = {
    name: 'stem', dir: 'W:/zome/db/stem', host: 'localhost', port: 3003,
    alive: true, title: 'Airtable Ders Motoru Yönetim Paneli', isDefault: true, url: 'http://localhost:3003/',
    stats: { lessons: 7, sentences: 770, media: 25 }
};
const DOWN = (name, port) => ({
    name, dir: 'W:/zome/db/' + name, host: 'localhost', port,
    alive: false, error: 'fetch failed', isDefault: false, url: `http://localhost:${port}/`
});

const base = instances => ({
    generatedAt: NOW,
    store: { databaseRoots: ['w:\\zome\\db'], mediaRoots: ['D:/zome/media'], defaultInstance: 'stem', defaultLang: 'TR', requestTimeoutMs: 8000 },
    expandedRoots: ['w:\\zome\\db'],
    registration: {
        registered: true, upToDate: true, currentPath: '${APPDATA}/Code/User/globalStorage/muvusoft.agent-farm/mcp/airtable/index.js',
        configFile: 'C:/Users/demo/.claude.json', current: { command: 'node', args: ['${APPDATA}/Code/User/globalStorage/muvusoft.agent-farm/mcp/airtable/index.js'] }
    },
    staging: { dir: 'C:/store/mcp/airtable', version: '3.677.0', extensionVersion: '3.677.0' },
    configFile: 'C:\\Users\\demo\\AppData\\Roaming\\Code\\User\\globalStorage\\muvusoft.agent-farm\\airtable-config.json',
    configFileToken: '${APPDATA}\\Code\\User\\globalStorage\\muvusoft.agent-farm\\airtable-config.json',
    probe: { ok: true, tools: [{ name: 'airtable_media_save', description: 'CREATE a media record.' }], probedAt: NOW - 120000 },
    instances
});

const data = () => base([LIVE, DOWN('stem-draft', 3004), DOWN('TEST', 3000)]);

const variants = () => ([
    { id: 'airtable-one-down', label: 'Airtable — ‼️ one instance, not running: Start is the one thing to do', data: base([DOWN('stem', 3003)]) },
    { id: 'airtable', label: 'Airtable — one live, two down', data: data() }
]);

module.exports = { script: 'airtablePage.js', data, variants };
