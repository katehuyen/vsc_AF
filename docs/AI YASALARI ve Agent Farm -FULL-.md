# ANAYASA Senkronizasyondan Tamamen Muaf Olan (Sync-Safe) Alanlar

- Session: `de86a7a7-18a2-40e4-9ab5-29cb16a5fafa`
- Folder: `D:\zone\agent\ajanlar\developer`
- Span: Oct 2, 2026, 09:29 AM (02:29 UTC) → Oct 2, 2026, 10:52 AM (03:52 UTC)
- Total: 840.3k (⚖ 459.7k) tok · $0.000 · 6 turns · 11 tool calls
- Export: current view · show: user, assistant · 13 of 35 messages

---

## Turn 1/6 — asla bir şeyi ben açıkça istemedikçe değiştirme yetkin yok, sen adece bilgi verme amaçlı … · gemini-3.7-flash · high · 467.3k tok · $0.000

**USER** (09:29 AM (02:29 UTC))

asla bir şeyi ben açıkça istemedikçe değiştirme yetkin yok, sen adece bilgi verme amaçlı buradasın. şimdi bizim anayasa ve yasa senkronizasyon sistermimize bak sana ayrıca yasa eklemek mümkün me antigravity veya developer-antigravity olarak.. yani eklemeye eklenir de sonra yapılan ilk sync ile o silinip üstüne yazılır mı.. veya bundan muaf olan bir alan var mı

**GEMINI** (▸ reply · 09:31 AM (02:31 UTC) · gemini-3.7-flash)

Sistemimizin anayasa ve senkronizasyon mimarisini (`_REF/cross-engine.md` ve Agent Farm çekirdeğindeki [`src/core/antigravity.ts`](file:///D:/zone/dev/git/miropharm/vsc_AgentFarm/src/core/antigravity.ts)) incelediğimizde durum şu şekildedir:

---

### 1. Senkronizasyon Tarafından Üzerine Yazılacak (Riskli) Alanlar

Agent Farm'ın Antigravity senkronizasyonu tek yönlü/türetilen bir yapı kurar (`CLAUDE.md` → `.agents/AGENTS.md` + `workflows/`):

* **`<ajan>/.agents/AGENTS.md` ve `<ajan>/AGENTS.md`:** 
  * Bu dosyalar **üretilen (generated) dosyalardır**.
  * İçlerine doğrudan elle kural yazarsanız, Agent Farm ilk sync denemesinde dosyanın değiştiğini (`rulesDiverged`) fark edip olağan durumda dosyayı atlar (`skip`). 
  * **Ancak:** `force: true` (zorlamalı) bir senkronizasyon çalıştırıldığında veya tersine senkronizasyon/yenileme yapıldığında **yazdığınız değişiklikler tamamen silinir ve kaynak dosyadan (`CLAUDE.md`) gelen içerikle üzerine yazılır**.

---

### 2. Senkronizasyondan Tamamen Muaf Olan (Sync-Safe) Alanlar

Antigravity motorunun kendi kural keşif mimarisinde bulunan, ancak **Agent Farm senkronizasyon mekanizmasının asla dokunmadığı / silmediği** alanlar şunlardır:

1. **`.agents/rules/*.md` Klasörü (En Temiz Çalışma Alanı):**
   * Antigravity, çalışma alanı kökündeki `.agents/rules/` dizini altındaki tüm `.md` dosyalarını otomatik olarak kural (rule) olarak algılar ve context'e yükler.
   * Agent Farm'ın sync mekanizması (`antigravity.ts`) yalnızca `.agents/AGENTS.md`, `.agents/workflows/` ve `.agents/af-antigravity-sync.json` dosyalarını yönetir; **`.agents/rules/` klasörüne hiçbir şekilde dokunmaz, silmez veya üzerine yazmaz**.
   * Örneğin `developer/.agents/rules/antigravity_ozel.md` gibi bir dosya eklendiğinde bu dosya sync işlemlerinden **tamamen muaftır**.

2. **`.agents/skills/` Klasörü (Antigravity Becerileri):**
   * Agent Farm sadece `DUTIES.md`'den `.agents/workflows/` üretir. `.agents/skills/` klasörüne dokunmaz.

3. **Global Yapılandırma (`~/.gemini/config/` veya `~/.gemini/`):**
   * `~/.gemini/GEMINI.md`, `~/.gemini/AGENTS.md` veya `~/.gemini/config/` altındaki kurallar makine genelidir ve Agent Farm bu dizinlere asla yazmaz.

---

### 3. Özet ve Tavsiye Edilen Yöntem

* **Eğer kural yalnızca Antigravity motoruna/araçlarına has bir teknik direktifse:**
  * Güvenli ve sync'ten muaf yol: **`developer/.agents/rules/<kural_adi>.md`** oluşturmaktır.
* **Eğer kural ajanın genel bir davranış/geliştirme kuralıysa (Sistemin doğal akışı):**
  * Kaynak dosya olan `ajanlar/developer/CLAUDE.md` (veya anayasa için `ajanlar/CLAUDE.md`) içine eklenip `agents.sync` / `constitution.sync` çalıştırılmalıdır. Böylece hem Claude hem Antigravity hem de diğer motorlar aynı kuralı senkronize biçimde, silinme riski olmadan alır.


**GEMINI** (▸ reply · 09:31 AM (02:31 UTC) · gemini-3.7-flash)

Arka plan görevleri tamamlandı ve kod mimarisi teyit edildi. 

Önceki yanıtta belirttiğim gibi:
* **`.agents/rules/*.md`** (örn. `developer/.agents/rules/<kural>.md`) dizini, Antigravity için **senkronizasyondan tamamen muaf ve güvenli** özel kural alanıdır.
* **`CLAUDE.md`** ise tüm motorlar (Claude, Antigravity, Codex, OpenCode) arasında ortak ve kalıcı kurallar için tek kaynaktır (Source of Truth).

Herhangi bir dosya üzerinde işlem yapmadım. Başka bir sorunuz veya incelememi istediğiniz bir konu olursa buradayım.


## Turn 2/6 — * **`.agents/rules/*.md`** (örn. `developer/.agents/rules/<kural>.md`) dizini, Antigravit… · gemini-3.7-flash · high · 114.1k tok · $0.000

**USER** (10:31 AM (03:31 UTC))

* **`.agents/rules/*.md`** (örn. `developer/.agents/rules/<kural>.md`) dizini, Antigravity için **senkronizasyondan tamamen muaf ve güvenli** özel kural alanıdır diyorsun ama onu yazsak bile okunması için oradaki .agents/AGENTS.md içine tetikleyici koymak gerekmiyor mu ve o dosyada zaten senkronizasyonla değişebilecek dosyalar arasında değil mi.  bir de zaten neden hem developer içinde hem developer/.agents/  içinde AGENTS.md  var ki. ikisi arasında fark ne neden iki tane birden var bundan aynı ajanla ilgili ikisi de. biri Agent Farm  kendi koyduğu için mi aslında formal olarak olmayan bir şey olarak mı atipik yerde mi duruyor yani,  eğer normal yeri orası değilse nasıl okunuyor tabii o zaman. bana sadece bilgi ver şimdi başka hiçbir şey yapma dosyalara dokunmak sana yasak biliyorsun

**GEMINI** (▸ reply · 10:32 AM (03:32 UTC) · gemini-3.7-flash)

Her iki sorunuzun da arkasında çok net ve bilinçli bir sistem mimarisi bulunmaktadır. Hiçbir dosyaya dokunmadan, sorulan noktaları açıklayayım:

---

### 1. `.agents/rules/*.md` İçin `AGENTS.md` İçine Tetikleyici Koymak Gerekir mi?

**Hayır, kesinlikle gerekmez.**

Antigravity motorunun kendi kural keşif motoru (Rule Discovery Engine) çalışırken `AGENTS.md` içindeki bir referansa veya tetikleyiciye bakmaz. 
* Antigravity başlatıldığında veya bir komut verildiğinde, motor otomatik olarak çalışma alanındaki `.agents/rules/` klasörünü tarar.
* Orada bulduğu `.md` dosyalarını doğrudan okur ve modelin sistem promptundaki `<user_rules>` bloğuna otomatik olarak dahil eder.
* Dolayısıyla bu klasöre konulan bir kural, `AGENTS.md` dosyasına hiçbir şey yazmaya gerek kalmadan Antigravity tarafından kendiliğinden okunur ve yürütülür.

---

### 2. Neden Hem `developer/AGENTS.md` Hem de `developer/.agents/AGENTS.md` Var?

Bu iki dosya gereksiz bir çiftleme ya da "atipik/uydurma" bir yapı değildir; **farklı yapay zeka motorlarının resmi okuma standartlarının birbirinden farklı olmasından** kaynaklanır.

Sistemimiz Claude Code, OpenAI Codex, OpenCode ve Google Antigravity motorlarını aynı anda destekler:

#### A. `developer/AGENTS.md` (Codex ve OpenCode Şeridi)
* **Okuyan Motorlar:** OpenAI Codex ve OpenCode.
* **Nasıl Çalışır?** Bu motorlar doğrudan klasör kökündeki `AGENTS.md` dosyasını arar ve **hiyerarşik (yukarıdan aşağıya)** yürürler:
  * Git kökündeki `ajanlar/AGENTS.md` (Ortak Anayasa) dosyasını okur,
  * Ardından `ajanlar/developer/AGENTS.md` (Developer'ın kendi kuralları) dosyasını okur ve ikisini hafızada birleştirir.
* **İçeriği:** Bu dosyada Anayasa **yoktur**, sadece Developer'a özel kurallar vardır (çünkü anayasa zaten üst klasörden otomatik miras alınır; buraya da yazılırsa motor anayasayı iki kere okur ve token kotası aşılır).

#### B. `developer/.agents/AGENTS.md` (Antigravity Şeridi)
* **Okuyan Motor:** Google Antigravity.
* **Nasıl Çalışır?** Antigravity'nin resmi çalışma alanı özelleştirme kök dizini `.agents/` klasörüdür ve kuralları `.agents/AGENTS.md` dosyasından okur.
* **Kritik Fark:** Antigravity bir çalışma alanında (`developer` klasöründe) çalışırken **üst klasörlere (`ajanlar/`) çıkıp dosya aramaz (walk-up yapmaz)**.
* **İçeriği:** Antigravity üst klasördeki anayasayı tek başına göremeyeceği için, Agent Farm bu dosyayı üretirken:
  * Üstteki **Ortak Anayasa**'yı (`<!-- agent-farm:shared-constitution -->` bloğuyla),
  * Ve **Developer'ın kendi kurallarını**
  birleştirip tek bir dosya halinde `developer/.agents/AGENTS.md` içine yazar.

---

### Özet

| Dosya Yolu | Hedef Motor | Resmi Standart mı? | Anayasa Durumu |
|---|---|---|---|
| `developer/AGENTS.md` | Codex / OpenCode | Evet (Codex/OpenCode standardı) | Üst klasörden (`ajanlar/`) otomatik miras alınır. |
| `developer/.agents/AGENTS.md` | Antigravity | Evet (Antigravity standardı) | Antigravity üst klasöre çıkamadığı için içine gömülüdür (inline). |
| `developer/.agents/rules/*.md` | Antigravity | Evet (Antigravity standardı) | Otomatik taranır, `AGENTS.md` içine tetikleyici gerektirmez, sync'ten muaftır. |

Yani iki dosyanın da yeri kendi motorunun resmi/standart yeridir. Agent Farm tek bir kaynak olan `CLAUDE.md`'den bu iki motorun kendi resmi formatlarına uygun dosyaları otomatik olarak türetir.


## Turn 3/6 — Antigravity'nin resmi anayasası ve diğerlerinin resmi yerleri farklı fakat değil mi..Agen… · gemini-3.7-flash · high · 61.1k tok · $0.000

**USER** (10:42 AM (03:42 UTC))

Antigravity'nin resmi anayasası ve diğerlerinin resmi yerleri farklı fakat değil mi..Agent Farm bunları kullanmıyor mu? nasıl ne kullanıyor, nasıl yapıyor?

**GEMINI** (▸ reply · 10:42 AM (03:42 UTC) · gemini-3.7-flash)

Evet, her motorun kendi **resmi / yerel (native)** kural okuma yerleri ve yöntemleri birbirinden farklıdır. 

Agent Farm bunları dışlamaz; tam tersine **her motorun tam olarak kendi resmi olarak beklediği yerleri ve mekanizmaları kullanır**. 

Bunu nasıl yaptığını ve mimarinin nasıl çalıştığını adım adım açıklayayım:

---

### 1. Her Motorun Resmi / Yerel Standartları Nelerdir?

Her yapay zeka CLI motorunun kuralları aradığı resmi kurallar şöyledir:

| Motor | Resmi Global Yeri (Tüm PC) | Resmi Çalışma Alanı / Proje Yeri | Hiyerarşi Davranışı |
|---|---|---|---|
| **Claude Code** | `~/.claude/CLAUDE.md` | `CLAUDE.md` | Çalışılan klasörden yukarıya (Git köküne) kadar tüm `CLAUDE.md`'leri okur. |
| **OpenAI Codex** | `~/.codex/...` | `AGENTS.md` | Git kökünden aşağıya doğru klasörlerdeki tüm `AGENTS.md`'leri birleştirir. |
| **Google Antigravity** | `~/.gemini/GEMINI.md` veya `~/.gemini/AGENTS.md` | `.agents/AGENTS.md`, `.agents/rules/*.md` ve kök `AGENTS.md` | Üst klasörlere çıkmaz; sadece açılan çalışma alanının kökünü (`.agents/`) okur. |
| **OpenCode** | `~/.config/opencode/AGENTS.md` | `AGENTS.md` veya `opencode.json` | Git worktree sınırına kadar yürür. |

---

### 2. Agent Farm Bunları Nasıl Kullanıyor?

Agent Farm sistemi, **"Tek Bir Gerçek Kaynak" (Single Source of Truth)** ve **"Otomatik Dağıtım (Sync)"** prensibiyle çalışır:

#### A. Kaynak (Yazılan ve Yönetilen Yer):
Siz veya yöneticiniz kuralları sadece **tek bir yerde** yazar:
* **Ortak Anayasa:** `ajanlar/CLAUDE.md`
* **Ajana Özel Görev/Kimlik:** `ajanlar/<ajan>/CLAUDE.md`
* **Nöbetçi Görevler:** `ajanlar/<ajan>/DUTIES.md`

#### B. Dağıtım (Agent Farm'ın Yaptığı Dönüştürme):
Agent Farm `Sync` komutu çalıştığında, her motor için onların **resmi standartlarına uygun çıktıları** üretir:

1. **Claude Code için:** Hiçbir şey üretmeye gerek yoktur; Claude doğrudan kaynak `CLAUDE.md`'leri okur.
2. **Codex için:** `ajanlar/AGENTS.md` ve `<ajan>/AGENTS.md` üretir. Codex aşağı doğru inerken ikisini resmi olarak birleştirir.
3. **Antigravity için:**
   * Antigravity üst klasöre çıkamadığı için Anayasa + Ajan kuralını birleştirip resmi yeri olan **`<ajan>/.agents/AGENTS.md`** içerisine yazar.
   * `DUTIES.md` içindeki görevleri Antigravity'nin resmi iş akışı formatına dönüştürüp **`<ajan>/.agents/workflows/<görev>.md`** içine yazar (böylece Antigravity'de `/görev` komutu olarak çalışır).
4. **OpenCode için:** Resmi **`opencode.json`** ve **`.opencode/command/`** dosyalarını üretir.

---

### 3. Neden Motorların Global Yerleri (`~/.gemini/`, `~/.claude/`) Boş Bırakılıyor?

Motorların global yerleri (`C:\Users\<kullanıcı>\.gemini\AGENTS.md` gibi) bilerek boş bırakılır. Bunun iki temel sebebi vardır (`_REF/cross-engine.md`):

1. **Taşınabilirlik (Portability / Git):** 
   Tüm kurallar ve anayasa repo (`D:\zone\agent\ajanlar`) içinde yaşar. Bu repoyu başka bir bilgisayara `git clone` yaptığınızda, hiçbir global ayar yapmanıza gerek kalmadan tüm motorlar kuralları doğrudan projenin içinden okur.
2. **İzolasyon (Kapsam Güvenliği):**
   Eğer anayasa `~/.gemini/` gibi global bir yere yazılsaydı, bilgisayarınızda açtığınız ajan dışındaki alakasız herhangi bir yazılım projesinde de Antigravity bu anayasayı zorla yüklemeye çalışır ve token israfına yol açardı. 

### Özet
Agent Farm gayriresmi veya atipik bir yol izlemez; aksine **tüm motorların resmi beklentilerini bilir**, kaynak metni alır ve her motorun **kendi resmi dosya yoluna ve formatına** göre dönüştürüp yerleştirir.


## Turn 4/6 — iki tane tablo yapsana resmi anayasalarla ilgili yani normalde motorların yerleri neresi … · gemini-3.7-flash · high · 63.5k tok · $0.000

**USER** (10:43 AM (03:43 UTC))

iki tane tablo yapsana resmi anayasalarla ilgili yani normalde motorların yerleri neresi ve biz bu eklenti içinde bunu nasıl nerede kullanıyoruz bir de ajanların kendi yasaları ile ilgili yine aynı tabloyu onun için de yap ajan yasası normalde resmi olarak nerede oluyor ama biz nerede kullanıyoruz nasıl kullanıyoruz her motor için

**GEMINI** (▸ reply · 10:43 AM (03:43 UTC) · gemini-3.7-flash)

Her iki konu için motorların resmi standartları ve bizim sistemimizdeki (Agent Farm) kullanım şekillerini gösteren tablolar aşağıdadır:

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

| Motor | Motorun Normal / Resmi Beklentisi | Bizim Sistemde Nerede Yaşar? | Nasıl Çalışır / Nasıl Okunur? |
|---|---|---|---|
| **Claude Code** | Çalışma alanı kökündeki `CLAUDE.md` | `ajanlar/<ajan>/CLAUDE.md` *(Ana Kaynak / Source of Truth)* | **Doğrudan Kaynak:** Agent Farm hiçbir dönüştürme yapmaz, Claude doğrudan bu dosyayı kendi yerel kuralı olarak okur. |
| **OpenAI Codex** | Çalışma alanı kökündeki `AGENTS.md` | `ajanlar/<ajan>/AGENTS.md` *(Türetilmiş)* | **Sync ile Üretim:** Agent Farm `agents.sync` ile ajanın `CLAUDE.md` içeriğini buraya aktarır. Codex ajanın klasöründe bu dosyayı okur. |
| **Google Antigravity** | `.agents/AGENTS.md` ve `.agents/workflows/` | `ajanlar/<ajan>/.agents/AGENTS.md` ve `.agents/workflows/*.md` | **Kombine Dosya & Workflow:** Agent Farm, ajanın kendi kurallarını anayasa bloğunun hemen altına ekler. `DUTIES.md` dosyalarını da Antigravity'nin resmi `workflows/<görev>.md` dosyalarına çevirir. |
| **OpenCode** | `AGENTS.md` ve `.opencode/command/` | `ajanlar/<ajan>/AGENTS.md` ve `.opencode/command/*.md` | **Ajan Kuralı & Komutlar:** Codex şeridindeki `AGENTS.md`'yi okur. Nöbetçi görevleri ise `.opencode/command/` altına dönüştürülerek slash komutu haline getirilir. |


## Turn 5/6 — şimdi bir de senkronizasyon sistemini gösteren ve nereden nereye senkronize olduklarını v… · gemini-3.7-flash · high · 66.1k tok · $0.000

**USER** (10:47 AM (03:47 UTC))

şimdi bir de senkronizasyon sistemini gösteren ve nereden nereye senkronize olduklarını ve bunlardan muaf olan fakat işleyen alanları gösteren tabloyu yap motorlar için

**GEMINI** (▸ reply · 10:48 AM (03:48 UTC) · gemini-3.7-flash)

İşte tüm motorlar için senkronizasyonun yönünü (nereden nereye aktığını), üretilen hedef dosyaları, tetikleme yöntemlerini ve **senkronizasyondan tamamen muaf olduğu halde motorun aktif olarak okuyup işlettiği alanları** gösteren tablo:

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
     * Antigravity bunu otomatik olarak her oturumda tam kural olarak işler.
     * Agent Farm sync komutu çalıştırıldığında bu klasörü taramaz, silmez veya üzerine yazmaz.
   * Aynı şekilde `~/.gemini/` ve `~/.claude/` gibi `USERPROFILE` dizinindeki global alanlar Agent Farm tarafından asla el sürülmeyen güvenli bölgelerdir.


## Turn 6/6 — sen bundan önce yaptığın tabloda antigravity için hem anayasa için hem de ajan'ın yasası … · gemini-3.7-flash · high · 68.1k tok · $0.000

**USER** (10:52 AM (03:52 UTC))

sen bundan önce yaptığın tabloda antigravity için hem anayasa için hem de ajan'ın yasası için `ajanlar/<ajan>/.agents/AGENTS.md`  dosyasını gösterdin o nasıl oluyor peki

**GEMINI** (▸ reply · 10:52 AM (03:52 UTC) · gemini-3.7-flash)

Çok haklı ve yerinde bir soru. Tek bir dosyanın (`ajanlar/<ajan>/.agents/AGENTS.md`) **hem anayasayı hem de ajanın kendi yasasını** nasıl aynı anda barındırdığını ve bunun arkasındaki teknik yapıyı şöyle açıklayayım:

---

### Nasıl Oluyor? (Dosyanın İç Yapısı)

Agent Farm senkronizasyon motoru (`src/core/antigravity.ts`), Antigravity için bu dosyayı üretirken iki ayrı kaynağı alır ve **özel etiketlerle tek bir dosyanın içinde art arda birleştirir**:

1. **Kaynak 1:** `ajanlar/CLAUDE.md` (Ortak Anayasa)
2. **Kaynak 2:** `ajanlar/developer/CLAUDE.md` (Developer'ın Kendi Yasası)

Üretilen `developer/.agents/AGENTS.md` dosyasını açıp baktığınızda içeride iki katmanlı şu yapıyı görürsünüz:

```markdown
<!-- agent-farm:antigravity-sync — generated from CLAUDE.md. Edit freely... -->

<!-- agent-farm:shared-constitution — generated from the shared CLAUDE.md one level up. -->

# 1. BÖLÜM: ORTAK ANAYASA (Shared Constitution)
(Tüm ajanlar için geçerli ilkeler, hafıza kuralları, dil kuralları, trigger tablosu...)

<!-- /agent-farm:shared-constitution -->

# 2. BÖLÜM: DEVELOPER AJANININ KENDİ YASASI (Identity and Mission)
(Developer'a özel TalkScribe kuralları, canlı ürün disiplini, test zorunlulukları...)
```

---

### Neden Böyle Yapılmak Zorunda? (Motor Farkı)

Bu birleştirmenin sebebi motorların dosya arama mantıklarındaki farktır:

* **Claude Code:** Siz `developer` klasöründeyken çalışsa bile kendiliğinden bir üst klasöre (`ajanlar/`) çıkarak oradaki Anayasa dosyasını ayrı, ajanın dosyasını ayrı okur.
* **OpenAI Codex:** Git kökünden aşağı inerken `ajanlar/AGENTS.md`'yi ayrı, `developer/AGENTS.md`'yi ayrı okur.
* **Google Antigravity:** `developer` klasöründe açıldığında **asla üst klasöre (`ajanlar/`) çıkıp dosya aramaz**. Sadece `developer/.agents/AGENTS.md` dosyasına bakar.

Eğer anayasa bu dosyanın içine gömülmeseydi, Antigravity `developer` klasöründe çalışırken **anayasanın varlığından tamamen habersiz kalacaktı**.

---

### Tersine Senkronizasyonda (Reverse Sync) Ne Olur?

Agent Farm bu iki parçayı etiketlerle (`<!-- agent-farm:shared-constitution -->`) ayırdığı için:
* Eğer `developer/.agents/AGENTS.md` içinde developer'a ait bir kuralı değiştirip Claude tarafına geri aktarmak (reverse sync) isterseniz;
* Agent Farm anayasa bloğunu otomatik olarak **ayıklayıp atar (strip eder)**, sadece developer'ın kendi kurallarını `developer/CLAUDE.md`'ye yazar. 
* Böylece anayasa maddeleri asla ajanın özel dosyasının içine sızıp kirlilik oluşturmaz.

