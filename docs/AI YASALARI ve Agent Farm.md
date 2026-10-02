
Motorların resmi standartları ve Agent Farm sistemindeki kullanım şekillerini gösteren tablolar aşağıdadır:

---

### Tablo 1: Ortak Anayasa (Tüm Ajanlar İçin Geçerli Temel Kurallar)

| Motor | Motorun Normal / Resmi Beklentisi | Bizim Sistemde Nerede Yaşar? | Nasıl Çalışır / Nasıl Okunur? |
|---|---|---|---|
| **Claude Code** | Üst klasörlerdeki `CLAUDE.md` veya global `~/.claude/CLAUDE.md` | `ajanlar/CLAUDE.md` *(Ana Kaynak / Source of Truth)* | **Doğrudan Yerel Hiyerarşi:** Ajan klasöründen (`ajanlar/developer/`) çalıştırıldığında bir üst klasöre (`ajanlar/`) kendiliğinden çıkar ve okur. |
| **OpenAI Codex** | Git kökünden aşağı doğru klasörlerdeki `AGENTS.md` | `ajanlar/AGENTS.md` *(Türetilmiş Ayna)* | **Aşağı Yürüme (Walk-down):** Agent Farm `constitution.sync` ile anayasayı buraya kopyalar. Codex git kökünden başlarken bunu otomatik olarak hafızaya alır. |
| **Google Antigravity** | Global `~/.gemini/GEMINI.md` veya çalışma alanı kökü `.agents/AGENTS.md` | Her ajanın kendi `.agents/AGENTS.md` dosyası içine gömülür | **İçine Gömme (Inline Injection):** Antigravity üst klasöre çıkmadığı için, Agent Farm anayasayı her ajanın `<ajan>/.agents/AGENTS.md` dosyasının en başına `<!-- agent-farm:shared-constitution -->` etiketiyle otomatik yazar. |
| **OpenCode** | Global `~/.config/opencode/AGENTS.md` veya worktree'deki `AGENTS.md` | `ajanlar/AGENTS.md` (ve gerekirse `opencode.json`) | **Worktree & Pointer:** Standart düzende `ajanlar/AGENTS.md`'yi görür. Eğer ajan klasörü bağımsız bir git reposu ise `opencode.json` içine `instructions: ["../AGENTS.md"]` eklenerek anayasayı okuması sağlanır. |

---

### Tablo 2: Ajana Özel Yasalar (Ajanın Kendi Kimliği, Misyonu ve Görevleri)

| Motor                  | Motorun Normal / Resmi Beklentisi           | Bizim Sistemde Nerede Yaşar?                                   | Nasıl Çalışır / Nasıl Okunur?                                                                                                                                                                        |
| ---------------------- | ------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Code**        | Çalışma alanı kökündeki `CLAUDE.md`         | `ajanlar/<ajan>/CLAUDE.md` *(Ana Kaynak / Source of Truth)*    | **Doğrudan Kaynak:** Agent Farm hiçbir dönüştürme yapmaz, Claude doğrudan bu dosyayı kendi yerel kuralı olarak okur.                                                                                 |
| **OpenAI Codex**       | Çalışma alanı kökündeki `AGENTS.md`         | `ajanlar/<ajan>/AGENTS.md` *(Türetilmiş)*                      | **Sync ile Üretim:** Agent Farm `agents.sync` ile ajanın `CLAUDE.md` içeriğini buraya aktarır. Codex ajanın klasöründe bu dosyayı okur.                                                              |
| **Google Antigravity** | `.agents/AGENTS.md` ve `.agents/workflows/` | `ajanlar/<ajan>/.agents/AGENTS.md` ve `.agents/workflows/*.md` | **Kombine Dosya & Workflow:** Agent Farm, ajanın kendi kurallarını anayasa bloğunun hemen altına ekler. `DUTIES.md` dosyalarını da Antigravity'nin resmi `workflows/<görev>.md` dosyalarına çevirir. |
| **OpenCode**           | `AGENTS.md` ve `.opencode/command/`         | `ajanlar/<ajan>/AGENTS.md` ve `.opencode/command/*.md`         | **Ajan Kuralı & Komutlar:** Codex şeridindeki `AGENTS.md`'yi okur. Nöbetçi görevleri ise `.opencode/command/` altına dönüştürülerek slash komutu haline getirilir.                                   |


---

### Senkronizasyon Akışı ve Muaf / İşleyen Alanlar Tablosu

| Motor | Ana Kaynak (Nereden?) | Senkronize Edilen Hedef (Nereye?) | Tetikleme Yöntemi | Sync'ten Muaf Ama Motorun İşlettiği / Okuduğu Alanlar |
|---|---|---|---|---|
| **Claude Code** | `ajanlar/CLAUDE.md`<br>`<ajan>/CLAUDE.md`<br>`<ajan>/DUTIES.md` | *(Hedef yok — Kendisi zaten "Tek Gerçek Kaynak"tır)* | Manuel düzenleme (Kaynak doğrudan yazılır) | • `~/.claude/CLAUDE.md` *(Global profil)*<br>• `~/.claude/skills/*` *(Beceriler)*<br>• `memory/` *(Hafıza)*<br>• `_REF/` *(Referans prosedürleri)* |
| **Google Antigravity** | `ajanlar/CLAUDE.md`<br>+ `<ajan>/CLAUDE.md`<br>+ `<ajan>/DUTIES.md` | • `<ajan>/.agents/AGENTS.md`<br>• `<ajan>/.agents/workflows/*.md`<br>• `.agents/af-antigravity-sync.json`<br>• `.agents/*mcp*suggested*` | `constitution.sync`<br>+ `agents.sync`<br>*(Veya UI: "Sync Agent with Antigravity")* | • **`<ajan>/.agents/rules/*.md`** *(Özel yerel kurallar - otomatik taranır)*<br>• **`<ajan>/.agents/skills/*`** *(Antigravity becerileri)*<br>• **`~/.gemini/` ve `~/.gemini/config/`** *(Global ayarlar/kurallar)* |
| **OpenAI Codex** | `ajanlar/CLAUDE.md`<br>+ `<ajan>/CLAUDE.md` | • `ajanlar/AGENTS.md`<br>• `<ajan>/AGENTS.md` | `constitution.sync`<br>+ `agents.sync` | • `~/.codex/` *(Global motor ayarları)*<br>• Ajan klasörü dışındaki alt/üst dizinlerde açılacak bağımsız `AGENTS.md` dosyaları |
| **OpenCode** | `ajanlar/CLAUDE.md`<br>+ `<ajan>/CLAUDE.md`<br>+ `<ajan>/DUTIES.md` | • `<ajan>/opencode.json`<br>• `<ajan>/.opencode/command/*.md`<br>• `.opencode/af-opencode-sync.json`<br>• `.opencode/mcp.suggested.json` | `agents.sync` | • `~/.config/opencode/AGENTS.md` *(Global kural)*<br>• `~/.claude/skills/` *(OpenCode Claude becerilerini otomatik doğrudan okur)* |

---

### Tablonun Kritik Detayları ve Çalışma Prensipleri

1. **Neden Çift Yönlü Çatışma Önlenir?**
   * Agent Farm, ürettiği dosyaların (`.agents/AGENTS.md`, `opencode.json` vb.) hash parmak izlerini `.agents/af-antigravity-sync.json` içinde saklar. 
   * Eğer üretilen bir dosyayı elle değiştirirseniz, sistem bunu fark eder (`diverged` durumu) ve `force: true` demediğiniz sürece değişikliği korumaya çalışır (atlayarak bildirir). Ancak kalıcı olması için her zaman kaynağa (`CLAUDE.md`) yazılması esastır.

2. **Muaf Alanların Gücü:**
   * Antigravity tarafında örneğin **`developer/.agents/rules/benim_kuralim.md`** dosyası oluşturduğunuzda:
     * Antigravity bunu otomatik olarak her oturumda tam kural olarak işler. Başka dosyaya tetikleyici koymaya gerek yoktur, buradaki md dosyalarını otomatik okur.
     * Agent Farm sync komutu çalıştırıldığında bu klasörü taramaz, silmez veya üzerine yazmaz.
   * Aynı şekilde `~/.gemini/` ve `~/.claude/` gibi `USERPROFILE` dizinindeki global alanlar Agent Farm tarafından asla el sürülmeyen güvenli bölgelerdir.
