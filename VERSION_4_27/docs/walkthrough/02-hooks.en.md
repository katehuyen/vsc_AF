# Install the live hooks

**Install Live Hooks** adds small hook commands to your Claude Code settings. Every event (command, tool call, permission wait, turn end) is POSTed to a local listener at `127.0.0.1` — **no data leaves the machine.**

What runs on them:

- **Live Timeline** — a lane per agent, in real time
- **Your-turn notifications** — sound/focus/alert when an agent starts waiting for your input
- **Stall and permission warnings** — the status bar turns yellow

> Important: hooks are read at session start — after installing, **restart your open claude sessions**.
