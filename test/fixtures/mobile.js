/**
 * U-247 — the two pages under 📱 Mobile beside Now: Web (AFWeb.card) and Devices (AFPhoneApp.card).
 *
 * ‼️ THE SHAPE HERE IS THE SHAPE `MobilePanel.data()` POSTS: `webCardData()` and `remoteCard()` compose
 * the cards, so the verdicts, the link, the QR code and the phone rows are asked of the same core
 * functions here rather than typed out — a hand-drawn QR is a picture of a code that was never encoded.
 */
const path = require('path');
const out = (...p) => require(path.join(__dirname, '..', '..', 'out', ...p));
const { webStatus, webUrl } = out('core', 'webCockpit.js');
const { qrEncode, qrSvg } = out('core', 'qr.js');
const { remoteCardData } = out('core', 'remoteCard.js');
const { firewallVerdict } = out('core', 'firewallVerdict.js');

/** X-444 — the Devices card, composed by the same function the panel calls. */
const RNOW = Date.parse('2026-08-30T09:00:00Z');
const FARM = { id: 'farm_7c1d9a', name: 'MURAT-PC' };
const phone = (id, name, scope, daysAgo, revoked) =>
    ({ id, name, scope, pairedAt: RNOW - daysAgo * 864e5, revoked: !!revoked });
const remote = (o) => remoteCardData(Object.assign({
    mode: 'lan', port: 7443, runner: true,
    status: {
        listening: true, farm: FARM, port: 7443,
        addresses: ['192.168.1.40:7443'], fingerprint: '3fa4'.repeat(16), sockets: 1
    },
    devices: [phone('d1', 'Pixel 8', 'answer', 3)]
}, o || {}), RNOW);

/** U-85 — one web block, built the way `webCardData()` builds it: the verdict, the link AND the code asked for. */
const web = (o) => {
    const s = Object.assign({
        enabled: true, port: 8378, bind: 'lan',
        token: '9f2c1a4e77b0d3568ae1cc02f4b9d716',
        serving: true, lanAddress: '192.168.1.40'
    }, o || {});
    const status = webStatus({
        enabled: s.enabled, port: s.port, bind: s.bind,
        hasToken: !!s.token, serving: s.serving, lanAddress: s.lanAddress
    });
    const url = s.token
        ? webUrl({ bind: s.bind, port: s.port, token: s.token, lanAddress: s.lanAddress }) : '';
    return Object.assign({
        enabled: s.enabled, port: s.port, bind: s.bind, hasToken: !!s.token,
        serving: s.serving, lanAddress: s.lanAddress, url, status
    }, status.phoneReachable && url
        ? { qr: qrSvg(qrEncode(url), { scale: 4, title: 'Open Agent Farm on your phone' }) }
        : {});
};

const onWeb = (w) => ({ view: 'web', web: w });
const onDevices = (r) => ({ view: 'devices', remote: r });
const data = () => onWeb(web());

const variants = () => ([
    /**
     * ‼️ U-85 — FOUR PICTURES, SMALLEST FIRST, because the card changes SHAPE between them and not just
     * colour: the off state has two buttons and no code block, and the working one grows a 200px square
     * beside a link that has to wrap. The middle one is the scene this card exists for — every switch
     * correct, and the phone still cannot open anything.
     */
    { id: 'mobile-web-off', label: 'Mobile — Web: the web view is off (the smallest the card gets)', data: onWeb(web({ enabled: false, serving: false })) },
    { id: 'mobile-web-notoken', label: 'Mobile — Web: on, but no token, so the server refuses to start', data: onWeb(web({ token: '', serving: false })) },
    { id: 'mobile-web-local', label: 'Mobile — Web: ‼️ every switch right, bound to local, and NO phone can open it', data: onWeb(web({ bind: 'local' })) },
    { id: 'mobile-web-lan', label: 'Mobile — Web: reachable from the network, with the code that opens it', data: data() },
    // X-444 — the Devices card, smallest first: off with no phone, one phone listening, the firewall's
    // fix, a fresh pairing code beside many phones, the activity line, and a mode that could not listen
    {
        id: 'mobile-devices-off', label: 'Mobile — Devices: the Agent Farm app is off and no phone is paired',
        data: onDevices(remote({ mode: 'off', devices: [],
            status: { listening: false, farm: FARM, addresses: [], sockets: 0, reason: 'agentFarm.remote.listen is off' } }))
    },
    {
        id: 'mobile-devices-one', label: 'Mobile — Devices: listening on the Wi-Fi, one phone paired and none connected, so the firewall hint shows',
        data: onDevices(remote({ status: { listening: true, farm: FARM, port: 7443,
            addresses: ['192.168.1.40:7443'], fingerprint: '3fa4'.repeat(16), sockets: 0 } }))
    },
    {
        id: 'mobile-devices-firewall', label: 'Mobile — Devices: listening on a Public Wi-Fi where Windows Firewall stops phones, with the one-click fix',
        data: onDevices(remote({ status: { listening: true, farm: FARM, port: 7443,
            addresses: ['192.168.1.42:7443'], fingerprint: '3fa4'.repeat(16), sockets: 0 },
            firewall: firewallVerdict({ active: ['Public'], enabled: ['Domain', 'Private', 'Public'], shields: [], allow: ['Private'],
                block: [], ourPorts: [], ourProfiles: [] }, 7443) }))
    },
    {
        id: 'mobile-devices-pair', label: 'Mobile — Devices: a fresh pairing code beside four phones, one revoked',
        data: onDevices(remote({
            mode: 'tailscale',
            status: { listening: true, farm: FARM, port: 7443, addresses: ['100.101.12.7:7443'], fingerprint: '3fa4'.repeat(16), sockets: 2 },
            devices: [phone('d1', 'Pixel 8', 'answer', 3), phone('d2', 'Samsung Galaxy Tab S9 Ultra (salon)', 'manage', 40),
                phone('d3', 'Eski telefon', 'read', 120, true), phone('d4', 'İş telefonu', 'admin', 1)],
            pair: { link: 'agentfarm://pair?v=1&farm=farm_7c1d9a&name=MURAT-PC&code=483920&fp=' + '3fa4'.repeat(16)
                + '&a=100.101.12.7:7443', addresses: ['100.101.12.7:7443'], until: RNOW + 9 * 60e3 }
        }))
    },
    {
        id: 'mobile-devices-activity', label: 'Mobile — Devices: three phones with their scope to choose and when each was last seen, and the recent activity line',
        data: onDevices(remote({
            devices: [
                { ...phone('d1', 'Pixel 8', 'manage', 3), lastSeen: RNOW - 5 * 60e3, lastAddress: '192.168.1.20' },
                { ...phone('d2', 'Samsung Galaxy Tab S9 Ultra (salon)', 'read', 40), lastSeen: RNOW - 3 * 864e5, lastAddress: '100.101.12.9' },
                phone('d3', 'Eski telefon', 'manage', 120, true)
            ],
            audit: [
                { ts: RNOW - 4 * 60e3, what: 'action', device: 'd1', name: 'Pixel 8', ok: true, page: 'chains', op: 'stop' },
                { ts: RNOW - 9 * 60e3, what: 'call', device: 'd1', name: 'Pixel 8', ok: true, op: 'console.send' },
                { ts: RNOW - 30 * 60e3, what: 'call', device: 'd2', name: 'Samsung Galaxy Tab S9 Ultra (salon)', ok: false, op: 'console.start',
                    detail: 'scope: console.start needs manage, this device has read' },
                { ts: RNOW - 864e5, what: 'refused', device: 'd3', name: 'Eski telefon', ok: false, detail: 'revoked', address: '192.168.1.33' },
                { ts: RNOW - 2 * 864e5, what: 'scope', device: 'd2', name: 'Samsung Galaxy Tab S9 Ultra (salon)', ok: true, detail: 'manage -> read' },
                { ts: RNOW - 3 * 864e5, what: 'pair-refused', device: '', name: 'Unknown', ok: false, address: '192.168.1.77' }
            ]
        }))
    },
    {
        id: 'mobile-devices-failed', label: 'Mobile — Devices: Tailscale chosen, but this machine has no tailnet address',
        data: onDevices(remote({ mode: 'tailscale',
            status: { listening: false, farm: FARM, addresses: [], sockets: 0,
                reason: 'no Tailscale address on this machine (100.64.0.0/10) - is Tailscale running?' } }))
    }
]);

module.exports = { script: 'mobile.js', data, variants, web, remote, phone, onWeb, onDevices };
