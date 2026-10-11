---
id: remote
title: Remote — phone, web view, Telegram and other machines
order: 22
summary: Reach the farm from a phone (paired app over TLS, read-only web view, Telegram bot), wake and pairing, and watching other machines' sessions.
ui: "Agent Farm: Open Mobile: Devices", "Open Mobile: Web"; Farm Settings ▸ Remote
keywords: [phone, mobile, android, remote, pair, qr, web view, browser link, telegram, bot, chat, tailscale, lan, firewall, away, other machine, relay feed]
related: [notices, alerts, settings]
---
# Remote

- Phone app host: `remote.status`, `remote.listen mode=lan` (off, local, lan, tailscale), `remote.pair` (one-time QR link), `remote.devices`, `remote.scope`, `remote.revoke`, `remote.audit`. Windows firewall: `remote.firewall`; `remote.firewall.allow` shows an admin prompt the user must accept.
- Read-only web view: `web.status`, `web.enable bind=local confirm=true` (lan only when the user asks), `web.stop`, `web.token.new confirm=true` (revokes old links).
- Telegram: `telegram.status`, `telegram.commands`, `telegram.routing`, `telegram.focus`.
- While VS Code is closed: `farm.away`; the headless service (area automation) keeps schedules running.
- Another machine's sessions: `export.relayScript` writes the relay watcher to run there.

Opening the farm to a network is a security decision: do it only on the user's explicit request and say what becomes reachable.
