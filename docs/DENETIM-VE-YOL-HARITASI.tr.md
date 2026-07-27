# Agent Farm — Ürün Denetimi ve Yol Haritası

*2026-07-26 · v3.22.0 üzerinde yapılmış kod denetimi. Önceki iki plan (`GELISIM-PLANI` A–F fazları, `ULTRA-GELISIM` G–J fazları) tamamlandı; bu belge **"herkesin kullanabileceği zengin bir ürün"** hedefine göre bugünkü boşlukları çıkarır ve sıradaki dalgaları tanımlar.*

**Denetimin kapsamı:** repo kodu (37.125 satır TS + 9.532 satır webview JS), `package.json` katkıları, köprü op kataloğu, git geçmişi (168 commit), belgeler, ve §3 için referans ürünün kendi kaynakları. Ölçüm yapılan her sayı aşağıda kaynağıyla verilir; ölçülmemiş şeyler "tahmin" diye işaretlenir.

**İlerleme:** **§2/A (Etkileşim ve kontrol) 3.24.0'da tamamen kapandı** — A1 · A2 · A3 · A4. Aşağıdaki §0 envanteri denetim günündeki (3.22.0) sayıları taşır, güncellenmez; kapanan maddeler kendi başlıklarında işaretlidir.

---

## 0. Bugün nerede duruyoruz — envanter

| Ölçüt | Değer | Kaynak |
|---|---|---|
| Sürüm | 3.22.0 | `package.json` |
| Komut | **174** | `contributes.commands` |
| Ayar | **85** | `contributes.configuration` |
| Yan panel ağacı | 7 (Agents · Tasks · Missions · Toolbox · Recent Sessions · Insights · Live Feed) | `contributes.views` |
| Webview sayfası | 23 panel + 25 media betiği | `src/panels/`, `media/` |
| Ajan-yüzlü köprü op'u | **85 op / 19 ad alanı** | `op: '<ns>.<x>'` kayıtları |
| Test | 65 dosya / 2250 kontrol | CHANGELOG 3.22.0 |
| Geliştirme hızı | 168 commit / 18 gün (2026-07-08 →) | `git log` |
| Klavye kısayolu | **1** (`ctrl+alt+q`) | `contributes.keybindings` |
| Çalışma-zamanı bağımlılığı | **0** (`dependencies: {}`) | `package.json` |

**Kategori olarak sağlam duran alanlar** (bu denetimde eksik bulunmadı): maliyet/token analitiği, oturum gezgini + arama, canlı zaman çizelgesi, sağlık/insight motoru, nöbet görevleri (DUTIES), zamanlayıcı + tetikleyici + iş akışı, misyonlar, Toolbox (skill · subagent · command · MCP · hook · plugin · style · settings envanteri), Notices/Queue mesaj panoları, gömülü Airtable Motoru MCP'si, filtre altyapısı.

Yani **özellik sayısı sorun değil.** Sorun, aşağıdaki tek yapısal boşlukta ve onun etrafında toplanan ikinci sınıf eksiklerde.

---

## 1. YAPISAL BOŞLUK — Agent Farm görüyor ama konuşamıyor

### Bulgu

Agent Farm bir **gözlem + başlatma** aracı. Filodaki her şeyi okuyabiliyor; hiçbir şeye **cevap veremiyor.** Diyaloğun tamamı terminalde geçiyor.

Kanıtlar (hepsi kodda doğrulandı):

1. **Oturum başlatma çıplak.** `agentfarm.startSession` → `launchClaudeTerminal(..., 'claude')`. Model seçici yok, izin modu seçici yok, efor seçici yok, ilk prompt yok, oturum adı yok (`extension.ts:4692`).
2. **İzin isteğine panelden cevap verilemiyor.** "Needs You" kuyruğunda `kind: 'permission'` satırının aksiyonları yalnızca `⌨ Terminal` · `Open Session` · `Timeline` (`core/needs.ts:176`). Yani eklenti ajanın izin beklediğini **görüyor**, ama *evet* diyemiyor — kullanıcı terminale gitmek zorunda. Aynısı `stalled` ve `your-turn` için de geçerli.
3. **Hiçbir yerde yazma kutusu yok.** Kod tabanında tek bir compose/chat yüzeyi yok; `sendText` yalnızca terminale komut yazmak için kullanılıyor.
4. **Devam mesajı gönderilemiyor.** Çalışan bir oturuma ikinci bir talimat vermenin eklenti içi yolu yok. Queue (You → Agent) asenkron bir kuyruk; canlı oturuma bağlanmıyor.

### Sonucu

- Kullanıcının **her turu** VS Code ↔ terminal arasında bağlam değiştirmesi gerekiyor.
- İzin bekleyen ajan, kullanıcı terminale bakana kadar bekliyor — otomasyonun gerçek darboğazı bu.
- Ekranda görülen zengin bilgi (maliyet, bağlam, sağlık) ile **eylem** arasında bir uçurum var: karar veriyorsun ama uygulayamıyorsun.
- Eklentinin kendi çalıştırdığı headless görevler (`claude -p`) ile kullanıcının konuştuğu oturumlar iki ayrı dünya. 3.20.0'daki 🧑/🤖 kolonu bu ayrımı *gösteriyor* ama kapatmıyor.

### Çözüm yolu (doğrulanmış)

Claude Code'un **streaming-input** modu tam olarak bunun için var. Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) dokümantasyonundan doğrulanan yetenekler:

> Uzun ömürlü bir süreç olarak çalışır; kullanıcı girdisi alır, **kesintileri yönetir, izin isteklerini yüzeye çıkarır** ve oturum yönetimini üstlenir. Sıraya alınmış mesajlar, görsel ekleme, gerçek zamanlı akış, bağlam sürekliliği.

Bu, AF'nin ihtiyacı olan dört şeyin hepsini tek mimariyle veriyor: **canlı sohbet · panel-içi izin cevabı · mesaj kuyruğu · kesme (interrupt).**

**Önemli kısıt:** AF'nin ilkesi "tamamen yerel, kullanıcının kendi Claude aboneliği". O yüzden bu Messages API (`ANTHROPIC_API_KEY`) üzerinden **değil**, kullanıcının kurulu `claude` CLI'ı üzerinden yapılmalı — SDK zaten CLI'ı sarmalıyor. Ayrı bir API anahtarı gerekmez, maliyet modeli değişmez, `.claude` transcript'leri aynı yere yazılır (yani mevcut analitik/sağlık/zaman çizelgesi motorlarının hiçbiri bozulmaz).

**Ürün adı önerisi:** *Console* — global nav'a Dashboard'un yanına.

---

## 2. Bağımsız denetim — kalan eksikler

Önem sırasına göre. Her madde: **ne · kanıt · neden önemli.**

### A. Etkileşim ve kontrol — **KAPANDI (3.24.0)**

Dördü de terminal yolu üzerinde çözüldü; Console'u (§1) beklemeden. Ayrıntı: `CHANGELOG.md` 3.24.0 + kılavuzun **Oturum Başlatma ve Denetim** bölümü.

**A1. Oturum başlatma diyaloğu yok.** ⭐⭐⭐ → **ÇÖZÜLDÜ.** İki katman: her başlatmanın taşıdığı `agentFarm.launchDefaults` (model · efor · izin modu; Start/Continue/Resume dahil, boş alan hiç bayrak üretmez) + **Start Session… launcher'ı** (`ctrl+alt+s`) — ajan · model · efor · izin modu · oturum adı · ilk prompt, ve **Start satırının açıklaması çalışacak tam komut satırı**. Profiller (`agentFarm.launchProfiles`) ve ajan başına son-kullanılan hafızası. Model listesi `modelAliases` bilgi tabanından. Köprü: `sessions.start`.

**A2. Oturum sabitleme (pin) / etiketleme yok.** ⭐⭐ → **ÇÖZÜLDÜ.** Sessions tablolarında **★** kolonu; pinli oturum **listenin başında ve satır sınırından muaf** (havuz host tarafında da pinlileri her zaman taşır). **Label Session…** ile serbest etiketler — çip olarak görünür, metin filtresi onları da arar. Recent Sessions ağacında pinliler 30'luk kesmenin dışında en üstte. **Session shelf…** (`ctrl+alt+p`) rafın kendisi: Enter devam ettirir. Köprü: `sessions.pin` · `sessions.tag` · `sessions.shelf`.

**A3. Kesme (interrupt) yok.** ⭐⭐ → **ÇÖZÜLDÜ.** Oturumun kendi terminaline **Esc yazılır** — tur biter, oturum ve bağlam kalır. Sessions tabloları (çalışan satır) · Timeline canlı kartları · Needs You (stalled) · `ctrl+alt+i` · sağ tık. Hedefleme: tam başlatma → ajanın en yeni terminali → harici pencere; **kimliği çözülemeyen oturuma dokunulmaz**. Harici terminal modunda pencere öne getirilip "Esc'e orada bas" denir (sahte düğme yok). Köprü: `sessions.interrupt`.

**A4. Klavye kısayolu neredeyse yok.** ⭐ → **ÇÖZÜLDÜ.** `ctrl+alt+f` = **Quick Menu** (gruplu, yazarak süzülen; her satır kendi kısayolunu yazar) + altı doğrudan tuş (s · p · i · d · n · l), `ctrl+alt+q` olduğu gibi. Türkçe-Q'da AltGr'nin karakter ürettiği **Q/E/T** harflerine yeni tuş konmadı — bunu bir test denetliyor.

### B. Kapsam ve veri modeli — **KAPANDI (3.25.0)**

**B1 → ÇÖZÜLDÜ.** `agentFarm.projects` (ad → ajanlar/klasörler, günlük bütçe, not) + **tek sahiplik kuralı** (bir ajan tek projede; toplam daima filo toplamına eşit, artığı `Unassigned`). Dashboard'da Projects tablosu (satıra tıkla → alttaki Sessions o projeye daralır), Sessions tablolarında Project kolonu + filtresi, portföyde gruplama. `Manage Projects…` + ajan sağ tık `Assign Agent to Project…`. Köprü: `projects.list` · `projects.assign` · `projects.set`.
**B2 → ÇÖZÜLDÜ.** **Agent Portfolio** sayfası (global nav'da *Agents*): ajan başına satır, projeye göre gruplu, her kolondan sıralanır — şu anki durum, **kaç gündür sessiz** (💤 >14g), 7g/30g oturum-maliyet-token, yazılan dosya, nöbetler (⏳/⏸), bulgular, hafıza, sabit bağlam; projeye süz, uykudakileri gizle, satırdan başlat/ata/klasör aç.
**B3 → ÇÖZÜLDÜ.** Oturum Görüntüleyici'de **Files changed**: dosya · yazma sayısı · ±satır · turlar; dosyayı açınca **oturumun kendi hunk'ları** (transkriptin öncesi/sonrası metni — dosyanın bugünkü hâli değil). Yanında ayrı bir soru olarak **vs HEAD** (VS Code diff). Hata dönen çağrı *failed — not applied*, hiçbir sayıya girmez. Sessions tablolarında **Files** kolonu (indeksin tek geçişinde sayılır). Köprü: `sessions.files`.

*Aşağısı denetim günündeki tespitlerdir, kayıt olarak duruyor.*

**B1. Proje / müşteri kavramı yok.** ⭐⭐⭐
`AgentInfo` = `{id, name, dir, claudeMd, memory, tools, duties, ...}` — **etiket yok, grup yok, müşteri yok, proje yok** (`core/agents.ts:21`). Ajanlar düz bir liste; oturumlar `cwd`'ye göre ilişkilendiriliyor.
→ "Bu müşteri için bu ay ne harcadım", "bu projenin tüm oturumları", "şu üç ajan bir takım" sorulabilir değil. Filo büyüdükçe (ve birden fazla iş/müşteri girdikçe) bu en çok acıyacak eksik.
→ Çözüm ucuz: `AgentInfo`'ya `tags: string[]` + bir `projects` ayarı (ad → klasör/ajan eşlemesi); dashboard, maliyet, Tasks ve Timeline'a "Proje" filtresi (filtre altyapısı 3.21.0'da zaten paylaşımlı hale geldi, bedava gelir).

**B2. Ajan portföyü görünümü yok.** ⭐
Ajan başına detay sayfası zengin; ama "filodaki 12 ajanı yan yana koy, hangisi ne iş yapıyor, hangisi ölü" tek ekranı yok (Dashboard maliyet odaklı, Living sistem-sağlığı odaklı).

**B4. Ürün sıfır ajanla geliyor — "zenginlik" burada kırılıyor.** ⭐⭐⭐
`agentfarm.newAgent` bir klasör + 12 satırlık `CLAUDE_MD_TEMPLATE` + boş `MEMORY.md` yazıyor (`extension.ts:156`, `:7039`). Rol seçici yok, hazır ajan yok. `agentFarm.packGalleryRepos` varsayılanı `[]` — galeri motoru var, **içinde hiçbir şey yok**. `agentpack` dışa/içe aktarma da yalnızca kullanıcının kendi ajanını taşır.
→ Eklentiyi ilk kuran kişi bomboş bir komuta merkeziyle karşılaşıyor: 174 komut, 23 sayfa, sıfır ajan. Filo yönetim aracı ama filo kurmuyor.
→ Referans üründe (§3) satılan şey **tam olarak budur**: sekreter · CFO · pazarlama · araştırma ajanı dosyaları. Bizde motor onlarda içerik var.

**B3. Ajanın koda ne yaptığı görünmüyor.** ⭐⭐⭐
Git entegrasyonu yalnızca iki yerde: `core/worktree.ts` (paralel koşular) ve `core/packgallery.ts` (agentpack deposu klonlama). `diff` kelimesinin geçtiği modüller hafıza senkronu, capabilities, instrhistory, forecast — **kod değişikliği incelemesi yok.**
→ Bir kod ajanı komuta merkezinin en beklenen yüzeyi eksik: "bu oturum hangi dosyaları değiştirdi, diff'i göster, geri al / kabul et". Transcript'te `Edit`/`Write` araç çağrıları zaten kayıtlı — veri var, yüzey yok.
→ Console (§1) ile doğal eşleşir: ajan dosyayı değiştirdiğinde diff panelde belirir, oradan onaylanır.

### C. Erişim

**C1. Yalnızca VS Code.** ⭐⭐⭐
Eklenti bir webview kümesi; dışarıdan erişim yok. `livePort` (8377) yalnızca hook olaylarını dinleyen bir `127.0.0.1` sunucusu (`core/live.ts:324`), UI servis etmiyor.
→ Telefondan bakılamıyor, ikinci makineden bakılamıyor, VS Code kapalıyken (headless servis çalışsa bile) hiçbir yüzey yok.
→ Bu, videodaki adamın en görünür avantajı (aşağıda §3).

**C2. Sesli giriş yok.** ⭐
`briefing.ts` TTS ile *çıkış* üretiyor (digest → mp3). Girişte hiçbir şey yok — kullanıcının kendi ürünü TalkScribe bir dikte ürünü olduğu halde.

**C3. Gelen mesajlaşma kanalı yok.** ⭐⭐
`notifyWebhookUrl` **dışarı** bildirim atıyor; `/trigger/<token>` endpoint'i n8n/Make'ten **görev tetikliyor**. Ama "Telegram'dan yazdığım mesaj bir ajan oturumu olsun, cevabı Telegram'a dönsün" yok.

### D. Ürünleşme ve dağıtım

**D1. `agentFarm.agentRoots` varsayılanı hâlâ kullanıcının kendi yolu.** ⭐⭐⭐ **(hata)**
`package.json:1885` → `"default": ["D:/zone/agent/ajanlar"]`.
Bu, v2.92.0'da Airtable için temizlenen sorunun aynısı ve o iş "ürün = SIFIR kullanıcı-özel hardcode" diye kapatılmıştı. Başka birinin makinesinde bu klasör yok; ilk açılışta `viewsWelcome` doğru şeyi söylüyor ama ayar sayfasında yabancı bir yol duruyor.
→ Varsayılan `[]` olmalı.

**D2. Marketplace meta verisi eksik.** ⭐⭐
`repository`, `bugs`, `homepage` alanlarının **hiçbiri yok**. `categories: ["Other","Visualization"]` — "AI", "Chat", "Machine Learning", "Programming Languages" yok. `vsce package` bunlar için uyarır, listeleme sayfası repo/issue bağlantısız kalır.

**D3. README'de tek ekran görüntüsü yok.** ⭐⭐
6,7 KB düz metin. Marketplace'te bir eklentiyi sattıran şey ilk ekrandaki GIF'tir; 23 webview sayfası olan bir üründe bunun olmaması ciddi kayıp. (`docs/info/` altında zaten bir PNG var — kullanılmıyor.)

**D4. Headless servis yalnızca Windows.** ⭐⭐
`installFarmService` → `schtasks /create ... /sc onlogon` (`extension.ts:7600`). macOS `launchd` / Linux `systemd` karşılığı yok. `exportSchtask` de aynı şekilde Windows'a bağlı.
→ Kodun geri kalanı `process.platform` ayrımlarını doğru yapıyor (extTerminal, mcpProbe, tasks kill) — yalnız servis katmanı taşınmamış.

**D5. UI yerelleştirmesi yok.** ⭐
`l10n` bundle yok, `%nls%` kullanımı yok. Kural doğru (UI daima İngilizce) ama *ürün* olarak VS Code'un l10n mekanizması hiç kurulmamış; ileride Türkçe/başka dil isteği gelirse sıfırdan iş.

### E. Arayüz zenginliği — "var ama yeterince iyi değil"

**E1. Insights → aksiyon zinciri zayıf.** Bulgu satırında Fix/Delegate/Dismiss var; ama "bu bulgunun tarihçesi", "kaç kere tekrar etti", "düzelttim mi işe yaradı mı" yok. `instrhistory` + `abtest` altyapısı var, insight'lara bağlanmamış.

**E2. Media Gallery ile Production/Premiere hattı ayrık.** `gallery` · `production` · `premiere` · `mediaProviders` modülleri var, ama tek bir "içerik üretim" sayfası yok; Toolbox/Tasks gibi birleştirilmemiş.

**E3. Guide sayfası devasa ama aranabilir değil.** `BLUEPRINT.tr.md` 1907 satır; `openGuide` bölüm çapalarıyla açılıyor. Kılavuz içi arama yok.

**E4. Dashboard tek düzey.** KPI + grafik + tablo iyi, ama kişiselleştirme (kart gizle/sırala), karşılaştırma dönemi dışında kayıtlı görünüm yok.

**E5. "Needs You" global nav'da yok.** ⭐⭐⭐ **(hata)**
`media/pageHeader.js:24` NAV dizisi: Dashboard · Living · Notices · Queue · Timeline · Tasks · Missions · Toolbox. **Needs You bu listede değil.** Oysa ULTRA-GELISIM'de G1 olarak ⭐⭐⭐ ile açılan ve gerekçesi "filo büyüyünce dar boğaz sensin, sana gelen her şey tek kuyrukta olmalı" olan yüzey tam da bu. Bugün yalnızca komut paletinden (`agentfarm.openNeeds`) açılıyor.
→ Filo ölçeğinde en sık bakılması gereken sayfa, hiçbir sayfadan tek tıkla erişilemiyor. Kural (v2.89.0'da konmuştu): **ana fonksiyon butonları `pageHeader.js` NAV'da olmalı.**
→ Aynı sebeple nav dışında kalan diğerleri (ikinci öncelik): Task Analytics, Capabilities, Turns, Memory Graph, Gallery.

**E6. 174 komut, 1 kısayol.** ⭐⭐
Tek `keybinding` `ctrl+alt+q`. Günde onlarca kez açılan yüzeyler (Needs You, Dashboard, Console, Command Bar) klavyeden erişilemiyor. Kısayol tanımlamak `package.json`'a beş satır.

### F. Kod sağlığı

**F1. `src/extension.ts` 8.365 satır.** ⭐⭐
Tüm kod tabanının %23'ü tek dosyada; 173 komut kaydı, köprü op'ları, terminal yönetimi, servis kurulumu hep burada. `src/core/` 70 modüle güzelce bölünmüşken aktivasyon katmanı monolit kalmış.
→ Riski somut: yeni özellik eklerken bu dosyaya dokunmak zorunlu, çakışma ve regresyon yüzeyi büyük.
→ Öneri: komut kayıtlarını alan bazlı `src/commands/*.ts` modüllerine böl (mekanik, davranış değiştirmeyen refactor; testler zaten yeşil).

---

## 3. Referans ürün — Doruk Yalçınsoy'un "ajan sistemi"

### 3.0 Kaynak ve doğrulama durumu (önce bu okunmalı)

Bu bölümün her iddiası bir kaynağa bağlıdır. Kaynakların ne olduğu ve neyin **doğrulanamadığı** açıkça yazılmıştır — çünkü bir yol haritasını doğrulanmamış varsayım üzerine kurmak en pahalı hatadır.

| Kaynak | Durum |
|---|---|
| 4 saatlik kurs videosu (`kgmm1Tqp_yU`, 4:02:41) | **Altyazı yok.** Gerçek tarayıcıdan doğrulandı: `ytInitialPlayerResponse.captions === null`, transkript paneli yok, `timedtext` boş dönüyor. **İçeriği okunamadı.** |
| Aynı videonun bölüm başlıkları (12 bölüm, zaman damgalı) | Okundu — kursun **iskeleti** buradan çıkarıldı |
| "Claude ajanları artık sürü gibi çalışıyor — Yeni Agent View" (`camJ88uN0Ko`) | Tam transkript okundu |
| "Bilgisayarı Kapatınca Duran Yapay Zekadan Bıktıysan İzle" (`Z_Cx0XGWX_s`) | Tam transkript okundu — **mimarinin ana kaynağı** |
| "4'lü Claude matrisi" (`kneHloyQnvY`) | Tam transkript okundu |
| "Claude ajanları vs Hermes" (`pnpfPznn-sM`) | Tam transkript okundu |
| Ekran görüntüsü (kullanıcının paylaştığı) | **Görüntü bu oturumda okunamadı.** Ama transkriptten aynı ekranın ne olduğu kesinleşti — bkz. 3.1 |

**4 saatlik videonun bölüm haritası** (ne anlattığının kanıtı):
`00:00` Giriş · `01:05` Kurulum, niye VS Code · `29:25` Claude limitlerini aş · `46:23` Bulut ve Lokal (+ 4'lü matris) · `1:28:03` n8n alternatifi hızlı otomasyon · `1:44:26` **Claude Ajanları (48 dk — en uzun bölüm)** · `2:32:50` 10 dakikada sunum · `2:42:15` Mentor ajan · `2:53:24` Gelen arama · `3:23:01` Giden arama · `3:35:05` Her aramanın raporu · `3:42:45` Satış stratejileri.

---

### 3.1 En önemli düzeltme: o ekran bir eklenti değil

Kullanıcının "acaba nasıl yapmış" diye sorduğu, tek pencerede ajanların yan yana listelendiği web-sayfası görünümlü ekran **üçüncü parti bir eklenti değil.** Kendi videosunda birebir şunu söylüyor:

> "VS Code'dayız şu an. **Ücretsiz bir arayüz bu.** VS Code'un içinde `claude agents` dediğimde, demin açtığım arkada çalışan ajanlar buraya da geldi… Tek bir pencerede bir sürü ajan çalışıyor."

Yani ekranda görünen şey **Claude Code'un kendi yeni Agent View'ı**. Anthropic'in ürünü, ücretsiz, kurulum gerektirmiyor. Videonun tamamı zaten bunun *değerlendirmesi*: "bu güncelleme bizim ajan yapımızı gereksiz kılar mı?"

**Sonuçları — üçü de yol haritasını doğrudan etkiler:**

1. **Kopyalanacak bir rakip yok.** Onun "sistemi" = klasör dolusu `.md` dosyası + Claude Code + cron + Telegram. Yazılım değil, **kurulum**. AF'nin ona karşı ölçülmesi yanlış eksen.
2. **Asıl karşılaştırma Claude Code'un kendisiyle.** Anthropic tek pencerede paralel oturum yüzeyini ücretsiz veriyor. AF'nin "her ajanı ayrı terminalde başlat" modeli bu yüzden artık sadece eksik değil, **geride**.
3. **Onun kendi ayrımı bize hazır konumlandırma veriyor.** Videodaki tezi: Agent View bağlamsız, tek atışlık, hızlı işler için; kalıcı hafızalı, sürekli öğrenen, motordan bağımsız yapı "agentic operating system". AF'nin sattığı şey tam olarak ikincisi — ve AF'de bunun *altyapısı* (hafıza, duties, insight, cross-engine sync) onunkinden kat kat güçlü. Eksik olan yüzey.

---

### 3.2 Onun sisteminin gerçek mimarisi

Transkriptlerden çıkan tam resim (hepsi kendi ağzından):

```
Sürekli açık makine (Mac Mini — "eski bir Windows bilgisayar da olur")
  └─ VS Code + Claude Code (abonelik; API anahtarı DEĞİL) + Codex (20$)
       └─ Google Drive ile senkron klasör  ("Stream Files" modu)
            └─ agents/  ← her ajan bir klasör, içi .md dosyaları
                 ├─ sekreter · pazarlama · YouTube · yatırım · PT (kişisel) …
                 ├─ hafıza .md'leri (sürekli güncelleniyor)
                 └─ activity log .md
       ├─ cron  → gece 03:00 işleri, kendi kendine dönen görevler
       ├─ Telegram MCP  → telefondan çift yönlü kanal
       │    └─ ElevenLabs API  → sesli cevap
       └─ AnyDesk  → makineye uzaktan masaüstü
```

**"19'dan fazla ajan 7/24 çalışıyor. Ben uyurken iş yapıyorlar. Sabah Telegram'ı açıyorum; sekreter e-postaları önceliklendirmiş, takvime bakmış, bugün ne önemli göstermiş."**

Ajanların gerçek dünya yetkinlikleri (kendi listesi): e-posta okuma + cevap taslağı, telefonla arama yapma, rakip video izleyip özetleme, toplantı özeti, günün öncelikleri, sosyal medya içeriği, gelen/giden çağrı raporu.

**Karar çerçevesi — "4'lü matris"** (kursun `46:23` bölümü, ayrı videoda detaylı). İki soru sorup görevi dört kutuya atıyor:

| | **Bağlam gerekmiyor** | **Bağlam gerekiyor** |
|---|---|---|
| **Masa başı** | Claude Desktop / Cowork / Chrome eklentisi | **VS Code + Claude Code + ajanlar** ← "kırılım noktası" |
| **Uzaktan** | Claude / ChatGPT uygulaması | **Telegram MCP → ajanlara bağlı** |

Kendi ifadesiyle sol-alt kutu (masa başı + bağlamlı) "en esnek, en etkili yapı"; sağ-alt (uzaktan + bağlamlı) ise "trendin gittiği yer" ama bugün limitli: **tek bağlam, yeni pencere açılamıyor, ~3-5 dakikada timeout.**

---

### 3.3 Özellik-özellik karşılaştırma

Sol sütun onun sisteminde **kanıtlanmış** olarak var olan şey; sağ sütun AF'nin bugünkü durumu (kodda doğrulandı).

| Yetenek | Onda | Agent Farm'da | Boşluk |
|---|---|---|---|
| Ajanlar = klasör + `.md` hafıza | ✅ | ✅ (daha olgun: MEMORY index, distilasyon, semantik sorgu, çelişki taraması) | — |
| 7/24 çalışma, VS Code kapalıyken | ✅ cron + sürekli açık makine | ✅ `installFarmService` (**yalnız Windows**) | D4 |
| Zamanlanmış / tetiklenen iş | ✅ cron | ✅✅ schedules + triggers + workflows + missions + karne | AF üstün |
| **Telefondan çift yönlü kanal** | ✅ **Telegram MCP** | ❌ `notifyWebhookUrl` yalnız **dışarı**; `/trigger/<token>` yalnız **görev tetikler** | **C3 — en görünür fark** |
| **Sesli giriş** | ✅ Telegram ses kaydı | ❌ yok | C2 |
| Sesli çıkış | ✅ ElevenLabs | ✅ `speakDigest` (fal.ai TTS) | — |
| **Tek pencerede çoklu canlı oturum** | ✅ Claude Code Agent View (Anthropic'in, bedava) | ❌ her oturum ayrı terminal | **§1 — yapısal** |
| Çalışan oturuma mesaj yazma | ✅ | ❌ hiçbir yazma kutusu yok | §1 |
| Çok makineli senkron | ✅ Google Drive "Stream Files" | ◐ `syncMemory` + `agentpack` + `farmRelay` var; **klasör senkron reçetesi yok** | belge eksiği |
| Motor bağımsızlığı (Codex/Çin modelleri) | ✅ | ✅✅ `cliProfiles` + Antigravity/Codex sync + ortak anayasa yayımı (3.22.0) | AF üstün |
| **Hazır ajan kütüphanesi** | ✅ **ürünün kendisi bu** (sekreter/CFO/pazarlama dosyaları) | ❌ `packGalleryRepos: []`, `newAgent` 12 satır iskelet | **B4** |
| Maliyet analitiği / anomali | ❌ ("minimum token" bir slogan, ölçüm yok) | ✅✅ pricing + anomali + tahmin + karne + bütçe | **AF çok üstün** |
| Sağlık / insight / nöbet denetimi | ❌ | ✅✅ health · living · duties · pulse · permlint · eval | **AF çok üstün** |
| Oturum gezgini / arama / replay | ❌ | ✅✅ | **AF çok üstün** |
| Onay kuyruğu ("sana ihtiyacı olanlar") | ❌ | ✅ Needs You (**ama nav'da yok — E5**) | AF üstün |
| Ajan→insan mesaj panosu | ◐ Telegram | ✅ Notices + Queue | AF üstün |
| Gelen/giden telefon araması | ✅ (kursun 50 dakikası) | ❌ | kapsam dışı — bkz. 3.5 |

---

### 3.4 Alınmaya değer dört şey ve nasıl yapılacağı

Sıralama etkiye göre. Her biri AF'nin mevcut altyapısına oturur; hiçbiri sıfırdan mimari değildir.

#### (1) Telegram köprüsü — uzaktan + bağlamlı kanal ⭐⭐⭐
**Neden:** Onun sistemindeki tek gerçek üstünlük bu. AF'nin görebildiği her şey (Needs You, Notices, maliyet uyarısı, biten görev) bugün **sadece VS Code açıkken** görünüyor. Ajan gece 03:00'te iş bitirdiğinde kimseye ulaşamıyor.

**Nasıl:** Sıfırdan iş değil — iskeletin dörtte üçü duruyor.
- `farmService` (headless, VS Code'suz çalışıyor) uzun ömürlü süreç olarak zaten var.
- `/trigger/<token>` HTTP endpoint'i **gelen** isteği görev yapmayı zaten biliyor.
- `notifyWebhookUrl` **giden** bildirimi zaten atıyor.
- `secrets` kasası bot token'ını saklamayı zaten biliyor.

Eksik olan tek parça: **kalıcı sohbet↔oturum eşlemesi**. `<globalStorage>/channels/telegram.json` içinde `chatId → {agent, sessionId}`; gelen mesaj eşlenmiş ajana `claude -p --resume <id>` ile gider, çıktı Telegram'a döner. Onun yaşadığı 3-5 dakikalık timeout sorunu bizde **yok olur**, çünkü AF görevi kuyruğa alıp bittiğinde haber verebilir — `tasks` motoru bunu zaten yapıyor.

**Köprü karşılığı** (§19.C zorunlu): `channels.list` · `channels.bind` · `channels.send` · `channels.unbind`.

**Ürünleştirme notu:** Telegram'ı özel-durum olarak gömmek yerine **kanal soyutlaması** yazılmalı (`telegram` ilk sürücü; sonra Discord/Slack/e-posta aynı arayüze takılır). Aksi halde ikinci kanal geldiğinde her şey yeniden yazılır.

#### (2) Ajan rol kütüphanesi — "danışmanlar kurulu" ⭐⭐⭐
**Neden:** Kullanıcının "danışmanlar kurulu kurmuş" diye dikkatini çeken şey bu, ve B4'te çıkan boşluğun tam karşılığı. AF bugün mükemmel bir **boş** komuta merkezi.

**Nasıl:** Format hazır — `agentpack` dışa/içe aktarma motoru çalışıyor, `packGalleryRepos` galeri motoru çalışıyor. Eksik olan **içerik**.
- Repo içine `packs/` klasörü: her paket bir `CLAUDE.md` + `DUTIES.md` + `memory/MEMORY.md` iskeleti.
- İlk set (rol, sektörden bağımsız): **Sekreter** (gelen kutusu + takvim + günün öncelikleri) · **Araştırmacı** (rakip/pazar taraması → rapor) · **Editör** (metin/içerik) · **Analist** (veri + rapor) · **Nöbetçi** (sağlık/log izleyip Notices'a yazar).
- `newAgent` akışına rol seçici: *Boş · Paketten · Galeriden*.
- `packGalleryRepos` varsayılanına **repo'nun kendi `packs/` klasörü** girer — böylece eklenti kutudan dolu çıkar.

**Dikkat:** Paketler İngilizce yazılır (anayasa: sistem dosyaları İngilizce) ve **hiçbir kullanıcı-özel yol içermez** (v2.92.0 dersi).

#### (3) 4'lü matris → onboarding'in karar yüzeyi ⭐⭐
**Neden:** Onun matrisi bir özellik değil, bir **öğretme aracı** — ve AF'nin en zayıf tarafı yeni kullanıcıya "bunu ne zaman kullanırım" diyememesi (walkthrough 5 adım, hepsi mekanik: ajanı tanıt, hook kur, dashboard aç…).

**Nasıl:** Ucuz iş. Walkthrough'a bir adım + Guide'a bir bölüm: "Hangi işi nerede yaparım?" — iki soru (bağlam gerekiyor mu? masa başında mısın?), dört cevap, her cevabın altında **AF'nin o kutudaki butonu**. Sol-alt kutu AF'nin kendisi; sağ-alt kutu (1)'deki Telegram kanalı olunca matris AF içinde tamamlanır. Bu, ürünün ne olduğunu tek ekranda anlatır.

#### (4) Sesli giriş — döngünün eksik yarısı ⭐⭐
**Neden:** O, telefondan ses kaydı atıp sesli cevap alıyor. AF sadece **konuşuyor** (`speakDigest`), **dinlemiyor**. Kullanıcının kendi ürünü TalkScribe bir dikte ürünüyken bu boşluk ayrıca tuhaf.

**Nasıl:** `mediaProviders` + fal.ai anahtarı + fiyatlandırma zaten kurulu; whisper çağrısı bir sağlayıcı daha demek. İki uç: (a) Console kompozitörüne mikrofon, (b) Telegram kanalındaki sesli mesajın otomatik yazıya çevrilmesi — (1) yapıldıysa neredeyse bedava gelir.

---

### 3.5 Kasıtlı olarak ALINMAYACAKLAR

Bir denetimin yarısı neyin yapılmayacağını yazmaktır.

- **Gelen/giden telefon araması + arama raporu** (kursun ~50 dakikası). Bu bir **satış otomasyonu dikeyi** (Vapi/Retell/telefon sağlayıcısı + CRM), ajan komuta merkezi değil. AF'ye gömülürse ürün odağını kaybeder. Doğru yeri: kullanıcının kendi ajanının MCP'si olarak, AF'nin **dışında**.
- **Kurs/topluluk/satış katmanı.** Onun ürünü eğitim; bizimki yazılım.
- **Google Drive'a bağımlılık.** Onun senkron çözümü bir üründen çok bir alışkanlık. AF'nin `agentpack` + `farmRelay`'i zaten daha temiz. Yapılacak iş kod değil **belge**: BLUEPRINT'e "ajan klasörünü iki makinede senkron tutmak" reçetesi (bulut sürücü ya da git — ikisinin de tuzaklarıyla).
- **VPS.** Kendisi de "VPS olmuyor" diyor; AF'nin yerellik ilkesiyle de çelişir.

---

### 3.6 Korunması gereken üstünlükler (konumlandırma)

Denetimin sonucu "geride kalmışız" değil. Onda **olmayan** ve AF'de olgun olan şeyler:

- **Ölçüm.** O "minimum token maliyeti" diyor ama ölçmüyor. AF: gerçek fiyatlandırma, anomali dedektörü, tahmin, ajan başına karne, bütçe. Bu tek başına bir ürün.
- **Denetlenebilirlik.** `health` · `living` · `permlint` · `pulse` · `evals` · tetik güvenilirlik karnesi. Onun sisteminde bir ajan sessizce ölse haberi olmaz.
- **Yönetişim.** `DUTIES.md` + Insights + Notices/Queue + missions onay akışı. Filo büyüdükçe fark açılır.
- **Motor bağımsızlığı ve ortak anayasa** (3.22.0). O da bağımsızlık iddia ediyor ama elle; AF bunu **senkronlayıp sapmayı raporluyor**.
- **Sıfır bağımlılık, sıfır telemetri, tamamen yerel.**

**Stratejik sonuç:** AF, Claude Code Agent View'ın **rakibi değil kabuğu** olarak konumlanmalı. Anthropic tek pencerede paralel oturumu veriyor; AF'nin katması gereken şey onun vermediği katman: hafıza, maliyet, sağlık, nöbet, çok-motor, uzaktan erişim. §1'deki Console bu yüzden "Claude'un yaptığını tekrar yapmak" değil — **Claude'un yüzeyini AF'nin verisiyle sarmak**.

---

## 4. Yol haritası

Sıralama iki kurala göre: (a) **önce yapısal boşluk**, çünkü kalan işlerin yarısı ona bağlanıyor; (b) **ucuz ve bağımsız olanlar** araya serpiştirilir, böylece her dalga tek başına kullanılabilir bir sürüm çıkarır.

### DALGA 0 — Ürün hijyeni (yarım gün, bağımsız) 🔧

Hepsi mekanik, hepsi bugün yapılabilir, hiçbiri mimariye dokunmuyor. Bunlar durdukça eklenti "birinin kişisel aracı" gibi görünüyor.

| # | İş | Dosya |
|---|---|---|
| 0.1 | `agentFarm.agentRoots` varsayılanını `[]` yap **(hâlâ `["D:/zone/agent/ajanlar"]` — 3.22.0'da doğrulandı)** | `package.json:1885` |
| 0.2 | `repository` · `bugs` · `homepage` alanlarını ekle; `categories`'e `AI` + `Chat` ekle | `package.json` |
| 0.3 | README'ye 4–5 ekran görüntüsü + bir GIF (Dashboard · Timeline · Tasks · Toolbox · Missions) | `README.md`, `docs/img/` |
| 0.4 | Headless servis: macOS `launchd` plist + Linux `systemd --user` unit üretimi (Windows `schtasks` yolu aynen kalır) | `extension.ts` servis bölümü |
| 0.5 | ~~Kısayol seti: Needs You, Dashboard, Tasks, Command Bar (E6)~~ **YAPILDI (3.24.0)** — `ctrl+alt+f` Quick Menu + 6 doğrudan tuş | `package.json` keybindings |
| 0.6 | **Needs You'yu global NAV'a ekle** (E5) — bekleyen sayısı rozetiyle, Notices'taki desenin aynısı | `media/pageHeader.js:24` |

### DALGA 1 — **Console**: eklentinin konuşmaya başlaması ⭐⭐⭐

Tek büyük iş bu. §1'deki boşluğu kapatır ve arkasından gelen üç maddeyi bedava getirir.

**1.1 — Oturum ana makinesi (session host).** Claude Code'u streaming-input modunda eklenti içinden çalıştıran bir servis: uzun ömürlü süreç, mesaj kuyruğu, kesme, izin isteklerinin yüzeye çıkması. Kullanıcının kendi `claude` kurulumunu ve aboneliğini kullanır — ayrı API anahtarı **yok**, maliyet modeli değişmez, transcript aynı `~/.claude/projects` altına yazılır (mevcut analitik/sağlık/timeline motorları bozulmaz).

**1.2 — Console sayfası.** Global nav'a yeni sekme. Sol: oturum listesi (sabitlenenler + son oturumlar + arama — mevcut `sessions` + `search` altyapısı üstüne). Sağ: konuşma + yazma kutusu.

**1.3 — Kompozitör kontrolleri.** Yazma kutusunun altında: **ajan seçici · model seçici · efor · izin modu**. Sözlük 3.24.0'da `core/launch.ts`'te kuruldu (seçenekler + komut satırı üretimi, saf ve testli) — Console kompozitörü aynı modülü kullanır, ikinci bir sözlük yazılmaz. A1 terminal yolunda **zaten çözüldü** (Start Session… launcher'ı); burada kalan iş, aynı seçimlerin Console oturumuna uygulanmasıdır.

**1.4 — Panel-içi izin cevabı.** `needs.ts`'teki `permission` satırına gerçek **Allow / Allow always / Deny** aksiyonları. Console'un barındırdığı oturumlarda doğrudan; terminalde başlatılmış oturumlarda mevcut "⌨ Terminal" davranışı korunur (dürüst ayrım, sahte buton yok).

**1.5 — Kesme (interrupt) + kuyruk.** Çalışan turu durdurma; sıraya alınmış mesajlar. *(Kesme, terminal yolunda 3.24.0'da geldi — `core/interrupt.ts` + `sessions.interrupt`; Console'un kendi barındırdığı oturumlarda protokol düzeyinde kesme buna eklenir, kuyruk yeni iştir.)*

**1.6 — Diff yüzeyi (B3).** Oturumda `Edit`/`Write` geçtiğinde değişen dosyaların listesi + VS Code diff görünümü + geri al. Veri transcript'te zaten var.

**Köprü karşılığı:** `console.send` · `console.sessions` · `console.answerPermission` · `console.interrupt` — böylece manager ajanı da aynı kanalı kullanabilir (§19.C kuralı: her yeni kullanıcı-tetiklenebilir fonksiyon aynı commit'te köprüye op olarak eklenir).

### DALGA 2 — Proje / müşteri boyutu ⭐⭐⭐

**2.1** `AgentInfo`'ya `tags: string[]`; `agentFarm.projects` ayarı (ad → ajan/klasör eşlemesi).
**2.2** Dashboard · Tasks · Timeline · Turns · Task Analytics'e **Proje** filtresi (3.21.0'ın paylaşımlı filtre bileşeni sayesinde satır maliyeti düşük).
**2.3** Proje başına maliyet/bütçe: `agentFarm.budgets` zaten var, anahtarı ajandan projeye genişlet.
**2.4** ~~Oturum sabitleme (A2)~~ **YAPILDI (3.24.0)** — pin + serbest etiketler oturum düzeyinde geldi (`core/sessionmarks.ts`). Bu dalgada kalan iş **proje** boyutudur: ajan/klasör bazlı proje tanımı ve oturum etiketlerinin projeye bağlanması (oturum etiketi ≠ proje; ikisi ayrı eksen, birleştirme bu dalganın işi).

Bu dalga "çoklu müşteri/proje yönetimi"ni açar: kim için ne kadar harcadım, hangi işin hangi ajanları var.

### DALGA 2.5 — Kutudan dolu çıkan ürün ⭐⭐⭐ *(§3.4-2 · B4)*

Ucuz, bağımsız, ve "herkesin kullanabileceği ürün" hedefine tek maddede en çok yaklaşan iş. Console'u beklemez.

**2.5.1** Repo içine `packs/` — her paket `CLAUDE.md` + `DUTIES.md` + `memory/MEMORY.md` iskeleti. İlk set: Sekreter · Araştırmacı · Editör · Analist · Nöbetçi. İngilizce, sıfır kullanıcı-özel yol.
**2.5.2** `agentfarm.newAgent` akışına rol seçici: *Boş · Paketten · Galeriden*.
**2.5.3** `agentFarm.packGalleryRepos` varsayılanına repo'nun kendi `packs/` klasörü.
**2.5.4** Walkthrough'a "4'lü matris" adımı + Guide bölümü (§3.4-3) — ürünün ne zaman kullanılacağını tek ekranda anlatır.

**Köprü karşılığı:** `packs.list` · `packs.apply`.

### DALGA 3 — Erişim ⭐⭐

**3.1 — Yerel web yüzeyi.** Headless servis (`farmService`) zaten var ve VS Code'suz çalışıyor; üstüne `127.0.0.1` (opsiyonel LAN) üzerinden **read-only** bir web panosu: Living + Needs You + Notices + son oturumlar. Aynı webview HTML'i yeniden kullanılır.
**3.2 — Console'un web yarısı** (3.1 oturduktan sonra): telefondan mesaj yazıp cevap okumak.
**3.3 — Sesli giriş.** Kompozitöre mikrofon; kullanıcının kendi `fal.ai` anahtarıyla whisper (media hattı ve fiyatlandırma zaten kurulu) — TalkScribe döngüsünün eksik yarısı.
**3.4 — Gelen mesajlaşma kanalı.** ⭐⭐⭐ *(§3.4-1 · referans üründeki tek gerçek üstünlük)* **Kanal soyutlaması** + ilk sürücü olarak Telegram: gelen mesaj → oturum, cevap → kanal. `farmService` · `/trigger/<token>` · `notifyWebhookUrl` · `secrets` iskeletinin dörtte üçü hazır; eksik olan kalıcı eşleme (`<globalStorage>/channels/telegram.json`: `chatId → {agent, sessionId}`). Referans üründeki 3–5 dakikalık timeout bizde yok olur: `tasks` motoru işi kuyruğa alır, bitince kanaldan haber verir.
**Köprü karşılığı:** `channels.list` · `channels.bind` · `channels.send` · `channels.unbind`.
**Uyarı:** Telegram özel-durum olarak gömülmemeli — ikinci kanal (Discord/Slack/e-posta) aynı arayüze takılmalı, yoksa her şey yeniden yazılır.

### DALGA 4 — Olgunlaştırma ⭐

**4.1** `extension.ts` bölünmesi (F1) — alan bazlı `src/commands/*.ts`.
**4.2** Insight tarihçesi: bulgu tekrar sayacı + "düzelttim, işe yaradı mı" ölçümü (`instrhistory`/`abtest` motorlarına bağla).
**4.3** İçerik üretim sayfası: `gallery` + `production` + `premiere` + `mediaProviders` tek yüzeyde (Tasks/Toolbox birleştirmesinin aynısı).
**4.4** Kılavuz içi arama.
**4.5** Dashboard kişiselleştirme (kart gizle/sırala, kayıtlı görünüm).
**4.6** `l10n` altyapısını kur (içerik İngilizce kalır; mekanizma hazır olur).
**4.7** Çok makineli senkron **reçetesi** (§3.5): BLUEPRINT'e "ajan klasörünü iki makinede senkron tutmak" bölümü — bulut sürücü ve git yolları, ikisinin de tuzaklarıyla. Kod işi değil belge işi; `agentpack` + `farmRelay` zaten var, kullanıcı bilmiyor.

---

## 5. Açık soru — kullanıcıya

**Eklenti gerçekten yayımlanacak mı?** "Herkesin kullanabileceği zengin bir ürün" hedefinin tamamı buna bağlı. Bugün `muvusoft.agent-farm` kimliği ve LICENSE hazır, ama `repository`/`bugs`/`homepage` yok, README'de ekran görüntüsü yok, `agentRoots` varsayılanı hâlâ tek bir makineye ait. Dalga 0 bu sorunun cevabı "evet"se yarım günlük iş; "hayır, kendi aracım"sa D1 dışındaki maddeler gereksiz. Yol haritasının sıralaması bu cevaba göre değişir — bu yüzden karar alınmadan Dalga 0.2/0.3 yapılmamalı.

---

## İlkeler (değişmez — önceki planlardan devralındı)

1. Tamamen yerel, telemetrisiz; ağa yalnızca kullanıcının yapılandırdıkları çıkar.
2. Bağımlılıksız çalışma zamanı — native modül yok, dosya tabanlı depolama.
3. İç model çağrıları daima ucuz model; otomatik döngüler varsayılan kapalı.
4. Onaysız yazma yok; her üzerine yazmada `.afbak` yedeği.
5. **Sıfır kullanıcı-özel hardcode** — makineye özellik ayarla gelir.
