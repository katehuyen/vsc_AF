# Introduce your agents

Agent Farm treats every folder containing a `CLAUDE.md`, under the folders you add as an **agent root**, as an **agent**:

```
D:\agents\
├── assistant\    ← has CLAUDE.md → agent
├── psychologist\ ← has CLAUDE.md → agent
└── notes\        ← no CLAUDE.md → invisible
```

Once you add a root, your agents appear in the **Agents** tree: together with their memory files, skills, MCP servers and session history.

> Setting: `agentFarm.agentRoots` — more than one root can be added.
