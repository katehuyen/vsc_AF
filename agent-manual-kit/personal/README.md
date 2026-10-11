# Personal rules after the Agent Manual ships (optional)

Not part of the product. This is about the author's own rule files (`info/KURALLAR/_REF/*.md`), which end users
never have. Once the Agent Manual ships, **how Agent Farm works** lives in the product; personal rules only need
**what this user prefers**. Keeping both means two truths that drift.

Nothing here has to be done. If it is, do it after the extension with the manual is installed and the live
checks of `INTEGRATION.md` §3 pass.

## What moves where

| Personal file | Product mechanics now in the manual | Keep in the personal file |
|---|---|---|
| `_REF/bridge.md` | calling `af.js`, args, `@file.json`, stdin, `--out`, timeouts and `detail.state`, discovery, "ask the bridge, never the disk", session lookup ops, cleanup, effects → `farm.guide`, areas `basics`, `sessions` | the zero-trap directive (it is about developing Agent Farm: move it to `_REF/agentfarm-dev.md`), Windows/PowerShell habits of this machine |
| `_REF/a2a.md` | notes vs tasks, claim/finish/handoff → area `a2a`, playbook `delegate-to-agent` | which roles/agents this user's fleet uses |
| `_REF/missions.md` | missions, criteria, leader, preview → area `missions`, playbook `team-mission` | this user's budgets and default leaders |
| `_REF/queue.md` | work queue → area `notices`, playbook `work-queue` | how this user triages |
| `_REF/notices.md` | posting, reports, questions → playbook `notify-user` | this user's report style and folders |
| `_REF/duties.md`, `automation-gate.md` | duties, the automation gate → areas `agents` (duties) and `automation`, playbooks `standing-duty`, `troubleshoot-automation` | which duties this user runs |
| `_REF/handover.md` | baton relay mechanics → area `relay`, playbooks `baton-relay`, `pass-the-baton` | this user's handover note format |
| `_REF/project-session.md` | project sessions, close → area `projects`, playbook `project-session-close` | this user's project conventions |
| `_REF/kapici.md` | the Gatekeeper → area `kapici` | — |

Everything else in `_REF` (engineering, git, test discipline, UI conventions, vault layout, language, machine
setup) is personal or about developing the product, and stays.

## How to slim a file

1. Install the build with the manual; run `node "$HOME/.agentfarm/af.js" farm.guide` and the playbook for the
   topic (`farm.guide id=<playbook>`).
2. Remove from the personal file every line the manual already says (the table above names where). Keep only
   preferences, local paths and habits.
3. Put one line on top: "How Agent Farm works: `node "$HOME/.agentfarm/af.js" farm.guide`. This file only adds my
   preferences." — so an agent that reads the personal file goes to the product for the mechanics.

`_REF/bridge.md` in this folder is a worked example of step 2 for the bridge file (10.6 KB → 1.3 KB).
