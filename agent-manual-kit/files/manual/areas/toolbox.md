---
id: toolbox
title: Toolbox — skills, subagents, commands, MCP servers, hooks, plugins
order: 23
summary: Inventory and manage Claude Code extensions per agent and user scope; copy or share skills and MCP servers; probe MCP tools; bind secrets.
ui: "Agent Farm: Open Toolbox", "Open Capability Matrix"
keywords: [skill, subagent, slash command, mcp, mcp server, tool, plugin, hook, output style, install skill, share skill, capability]
related: [agents, engines]
---
# Toolbox

- Inventory: `toolbox.list` (filter by `kind`, `scope`, `agent`, `q`); one item: `toolbox.inspect kind=<k> name=<n>`.
- Install or edit: `toolbox.install kind=skill|subagent|command|mcp name=<n> agent=<a>` (skills, subagents and commands are scaffolded files you then write).
- Copy between agents or share a skill to every agent: `toolbox.copy kind=skill name=<n> from=<a> to=user`.
- On or off without removing: `toolbox.enable`. Remove (backup kept): `toolbox.remove`.
- What an MCP server actually offers: `toolbox.mcptools server=<name>`.
- Give an MCP server a secret by name: `mcp.servers.bindSecret`.
- What can be typed after "/": `toolbox.slashCommands`.

User scope applies to every agent on the machine; an agent-scope item with the same name shadows it.
