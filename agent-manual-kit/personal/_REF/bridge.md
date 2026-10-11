# Farm Bridge — my preferences

> How Agent Farm works, what it can do and how to call it is in the product:
> `node "$HOME/.agentfarm/af.js" farm.guide` (the map) · `… find <what you need>` · `… help <op>`.
> This file only adds how I want it used on my machines. Codebase development rule: `_REF/agentfarm-dev.md`.

## Do it, don't describe it

When I say "set up this task / start this mission / add a schedule", you do it yourself through the bridge,
then tell me what now exists and its id. Find the playbook first (`find …`), read it, then act.

## Shell habits on this machine (Windows, PowerShell 5.1)

- The command is `node "$HOME/.agentfarm/af.js"`; never write `C:\Users\…` or the globalStorage path.
- Long, multi-line or non-ASCII text (Turkish titles, markdown reports) goes in a UTF-8 JSON file passed as
  `"@args.json"` — quoted, so PowerShell does not splat it. Piping: only `--stdin-base64`.
- Answers to files: `--out <file>`, never `>` (PowerShell re-encodes).
- Bodies in PowerShell: single-quoted here-strings (`@'…'@`).

## Cost

Ops marked `[run]` (tasks, missions, workflows, templates) spend my plans: only on my explicit instruction.

## Language

`_REF/lang.md` decides: what I read (chat, notices, reports) is Turkish; what agents read (task prompts, A2A
notes, delegation) is English.
