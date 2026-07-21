# Ajanlarını tanıt

Agent Farm, **ajan kökü** olarak eklediğin klasörlerin altında `CLAUDE.md` içeren her klasörü bir **ajan** sayar:

```
D:\ajanlar\
├── asistan\      ← CLAUDE.md var → ajan
├── psikolog\     ← CLAUDE.md var → ajan
└── notlar\       ← CLAUDE.md yok → görünmez
```

Kökü ekledikten sonra ajanların **Agents** ağacında belirir: hafıza dosyaları, skill'leri, MCP sunucuları ve oturum geçmişiyle birlikte.

> Ayar: `agentFarm.agentRoots` — birden çok kök eklenebilir.
