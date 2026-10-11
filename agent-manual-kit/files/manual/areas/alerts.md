---
id: alerts
title: Sounds and read-aloud — how the farm gets the user's attention
order: 21
summary: Which events play which sound, mute and quiet hours, spoken announcements, read-aloud of answers, per-session "your turn" alerts.
ui: "Agent Farm: Sound: Open"; 🔇 in the status bar; swim-lane controls on the Live Timeline
keywords: [sound, alert, ping, chime, notify me, mute, quiet hours, silence, read aloud, speak, voice, tts, your turn, attention]
related: [notices, remote, console]
---
# Sounds and read-aloud

- Everything in one call: `alerts.status`. Why nothing was heard: `alerts.gate`. Which sound an event would play and why: `alerts.resolve`.
- Mute: `alerts.mute` (toggle fleet-wide), `alerts.mute on=true scope=session sessionId=<id>` (one session).
- Quiet hours: `alerts.quiet on=true from=23:00 to=08:00`.
- Which events sound: `alerts.on event=<e> enabled=true` (events: turn-ready, question, stalled, ended, error, notice, notice-question, gate, quota, mission).
- Sounds: `alerts.voices`, `alerts.voice.set`, `alerts.voice.add`; volume: `alerts.volume`.
- Say which agent out loud: `alerts.speak`. Read a session's answers aloud as turns end: `alerts.read`. Read one answer now: `alerts.readNow sessionId=<id> last=true`.
- A session's "your turn" alerts (sound, focus, modal, toast): `live.alerts.get`, `live.alerts.set`, `live.alerts.test`.
- A finishing sound for one run: `finishSound=<id>` on `tasks.add`, `schedules.add` and the like.

Change sound settings only when the user asks; they are personal preferences.
