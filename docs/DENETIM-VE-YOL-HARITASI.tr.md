# Agent Farm — Ürün Denetimi ve Yol Haritası

*2026-07-26 · v3.21.0 üzerinde yapılmış kod denetimi. Önceki iki plan (`GELISIM-PLANI` A–F fazları, `ULTRA-GELISIM` G–J fazları) tamamlandı; bu belge **"herkesin kullanabileceği zengin bir ürün"** hedefine göre bugünkü boşlukları çıkarır ve sıradaki dalgaları tanımlar.*

**Denetimin kapsamı:** repo kodu (36.777 satır TS + 9.532 satır webview JS), `package.json` katkıları, köprü op kataloğu, git geçmişi (167 commit), belgeler. Ölçüm yapılan her sayı aşağıda kaynağıyla verilir; ölçülmemiş şeyler "tahmin" diye işaretlenir.

---

## 0. Bugün nerede duruyoruz — envanter

| Ölçüt | Değer | Kaynak |
|---|---|---|
| Sürüm | 3.21.0 | `package.json` |
| Komut | **173** | `contributes.commands` |
| Ayar | **85** | `contributes.configuration` |
| Yan panel ağacı | 7 (Agents · Tasks · Missions · Toolbox · Recent Sessions · Insights · Live Feed) | `contributes.views` |
| Webview sayfası | 23 panel + 19 media betiği | `src/panels/`, `media/` |
| Ajan-yüzlü köprü op'u | **84 op / 18 ad alanı** | `op: '<ns>.<x>'` kayıtları |
| Test | 64 dosya / 2202 kontrol | CHANGELOG 3.21.0 |
| Geliştirme hızı | 167 commit / 18 gün (2026-07-08 →) | `git log` |
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

### A. Etkileşim ve kontrol

**A1. Oturum başlatma diyaloğu yok.** ⭐⭐⭐
Model · efor · izin modu · başlangıç promptu · oturum adı seçmeden `claude` çalışıyor. `agentFarm.newAgentModel` yalnızca *yeni ajan iskeleti* için; başlatmayı etkilemiyor. `modelPolicy` motoru sadece headless görevlerde devrede.
→ Kullanıcı her seferinde terminalde elle `--model`, `/model`, izin ayarı yapıyor.

**A2. Oturum sabitleme (pin) / etiketleme yok.** ⭐⭐
Kod tabanında `pin`/`favorite`/`star` kavramı yok (grep: 0 sonuç). `renameSession` var, ama 253 oturumluk bir listede "sürekli döndüğüm 6 iş" ayrı bir raf değil.
→ Uzun süreli işler (bir proje, bir müşteri, bir ürün) her gün yeniden aranıyor.

**A3. Kesme (interrupt) yok.** ⭐⭐
Çalışan bir oturumu panelden durdurmanın yolu yok; `taskkill /T` yalnızca headless task/mission için.

**A4. Klavye kısayolu neredeyse yok.** ⭐
Tek kısayol: `ctrl+alt+q` (queueAdd). 173 komutluk bir eklentide komut paleti dışında hızlı erişim yok.

### B. Kapsam ve veri modeli

**B1. Proje / müşteri kavramı yok.** ⭐⭐⭐
`AgentInfo` = `{id, name, dir, claudeMd, memory, tools, duties, ...}` — **etiket yok, grup yok, müşteri yok, proje yok** (`core/agents.ts:21`). Ajanlar düz bir liste; oturumlar `cwd`'ye göre ilişkilendiriliyor.
→ "Bu müşteri için bu ay ne harcadım", "bu projenin tüm oturumları", "şu üç ajan bir takım" sorulabilir değil. Filo büyüdükçe (ve birden fazla iş/müşteri girdikçe) bu en çok acıyacak eksik.
→ Çözüm ucuz: `AgentInfo`'ya `tags: string[]` + bir `projects` ayarı (ad → klasör/ajan eşlemesi); dashboard, maliyet, Tasks ve Timeline'a "Proje" filtresi (filtre altyapısı 3.21.0'da zaten paylaşımlı hale geldi, bedava gelir).

**B2. Ajan portföyü görünümü yok.** ⭐
Ajan başına detay sayfası zengin; ama "filodaki 12 ajanı yan yana koy, hangisi ne iş yapıyor, hangisi ölü" tek ekranı yok (Dashboard maliyet odaklı, Living sistem-sağlığı odaklı).

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

### F. Kod sağlığı

**F1. `src/extension.ts` 8.365 satır.** ⭐⭐
Tüm kod tabanının %23'ü tek dosyada; 173 komut kaydı, köprü op'ları, terminal yönetimi, servis kurulumu hep burada. `src/core/` 70 modüle güzelce bölünmüşken aktivasyon katmanı monolit kalmış.
→ Riski somut: yeni özellik eklerken bu dosyaya dokunmak zorunlu, çakışma ve regresyon yüzeyi büyük.
→ Öneri: komut kayıtlarını alan bazlı `src/commands/*.ts` modüllerine böl (mekanik, davranış değiştirmeyen refactor; testler zaten yeşil).

---

## 3. Referans ürün — "İş Güç Konsol" (Doruk Yalçınsoy)

*(Bu bölüm video transkripti ve ekran görüntüsü üzerinden yazıldı — kaynak ayrımı bölüm sonunda.)*

---

## 4. Yol haritası

Sıralama iki kurala göre: (a) **önce yapısal boşluk**, çünkü kalan işlerin yarısı ona bağlanıyor; (b) **ucuz ve bağımsız olanlar** araya serpiştirilir, böylece her dalga tek başına kullanılabilir bir sürüm çıkarır.

### DALGA 0 — Ürün hijyeni (yarım gün, bağımsız) 🔧

Hepsi mekanik, hepsi bugün yapılabilir, hiçbiri mimariye dokunmuyor. Bunlar durdukça eklenti "birinin kişisel aracı" gibi görünüyor.

| # | İş | Dosya |
|---|---|---|
| 0.1 | `agentFarm.agentRoots` varsayılanını `[]` yap | `package.json` |
| 0.2 | `repository` · `bugs` · `homepage` alanlarını ekle; `categories`'e `AI` + `Chat` ekle | `package.json` |
| 0.3 | README'ye 4–5 ekran görüntüsü + bir GIF (Dashboard · Timeline · Tasks · Toolbox · Missions) | `README.md`, `docs/img/` |
| 0.4 | Headless servis: macOS `launchd` plist + Linux `systemd --user` unit üretimi (Windows `schtasks` yolu aynen kalır) | `extension.ts` servis bölümü |
| 0.5 | Kısayol seti: Console, Dashboard, Tasks, Command Bar | `package.json` keybindings |

### DALGA 1 — **Console**: eklentinin konuşmaya başlaması ⭐⭐⭐

Tek büyük iş bu. §1'deki boşluğu kapatır ve arkasından gelen üç maddeyi bedava getirir.

**1.1 — Oturum ana makinesi (session host).** Claude Code'u streaming-input modunda eklenti içinden çalıştıran bir servis: uzun ömürlü süreç, mesaj kuyruğu, kesme, izin isteklerinin yüzeye çıkması. Kullanıcının kendi `claude` kurulumunu ve aboneliğini kullanır — ayrı API anahtarı **yok**, maliyet modeli değişmez, transcript aynı `~/.claude/projects` altına yazılır (mevcut analitik/sağlık/timeline motorları bozulmaz).

**1.2 — Console sayfası.** Global nav'a yeni sekme. Sol: oturum listesi (sabitlenenler + son oturumlar + arama — mevcut `sessions` + `search` altyapısı üstüne). Sağ: konuşma + yazma kutusu.

**1.3 — Kompozitör kontrolleri.** Yazma kutusunun altında: **ajan seçici · model seçici · efor · izin modu**. Seçimler `modelPolicy` motoruyla aynı sözlüğü kullanır. Bu tek satır, A1'i tamamen çözer.

**1.4 — Panel-içi izin cevabı.** `needs.ts`'teki `permission` satırına gerçek **Allow / Allow always / Deny** aksiyonları. Console'un barındırdığı oturumlarda doğrudan; terminalde başlatılmış oturumlarda mevcut "⌨ Terminal" davranışı korunur (dürüst ayrım, sahte buton yok).

**1.5 — Kesme (interrupt) + kuyruk.** Çalışan turu durdurma; sıraya alınmış mesajlar.

**1.6 — Diff yüzeyi (B3).** Oturumda `Edit`/`Write` geçtiğinde değişen dosyaların listesi + VS Code diff görünümü + geri al. Veri transcript'te zaten var.

**Köprü karşılığı:** `console.send` · `console.sessions` · `console.answerPermission` · `console.interrupt` — böylece manager ajanı da aynı kanalı kullanabilir (§19.C kuralı: her yeni kullanıcı-tetiklenebilir fonksiyon aynı commit'te köprüye op olarak eklenir).

### DALGA 2 — Proje / müşteri boyutu ⭐⭐⭐

**2.1** `AgentInfo`'ya `tags: string[]`; `agentFarm.projects` ayarı (ad → ajan/klasör eşlemesi).
**2.2** Dashboard · Tasks · Timeline · Turns · Task Analytics'e **Proje** filtresi (3.21.0'ın paylaşımlı filtre bileşeni sayesinde satır maliyeti düşük).
**2.3** Proje başına maliyet/bütçe: `agentFarm.budgets` zaten var, anahtarı ajandan projeye genişlet.
**2.4** Oturum sabitleme (A2) — proje etiketiyle birlikte gelir.

Bu dalga "çoklu müşteri/proje yönetimi"ni açar: kim için ne kadar harcadım, hangi işin hangi ajanları var.

### DALGA 3 — Erişim ⭐⭐

**3.1 — Yerel web yüzeyi.** Headless servis (`farmService`) zaten var ve VS Code'suz çalışıyor; üstüne `127.0.0.1` (opsiyonel LAN) üzerinden **read-only** bir web panosu: Living + Needs You + Notices + son oturumlar. Aynı webview HTML'i yeniden kullanılır.
**3.2 — Console'un web yarısı** (3.1 oturduktan sonra): telefondan mesaj yazıp cevap okumak.
**3.3 — Sesli giriş.** Kompozitöre mikrofon; kullanıcının kendi `fal.ai` anahtarıyla whisper (media hattı ve fiyatlandırma zaten kurulu) — TalkScribe döngüsünün eksik yarısı.
**3.4 — Gelen mesajlaşma kanalı.** Telegram bot köprüsü: gelen mesaj → oturum, cevap → Telegram. `/trigger/<token>` endpoint'i ve `notifyWebhookUrl` iskeleti hazır; eksik olan kalıcı eşleme (sohbet ↔ oturum).

### DALGA 4 — Olgunlaştırma ⭐

**4.1** `extension.ts` bölünmesi (F1) — alan bazlı `src/commands/*.ts`.
**4.2** Insight tarihçesi: bulgu tekrar sayacı + "düzelttim, işe yaradı mı" ölçümü (`instrhistory`/`abtest` motorlarına bağla).
**4.3** İçerik üretim sayfası: `gallery` + `production` + `premiere` + `mediaProviders` tek yüzeyde (Tasks/Toolbox birleştirmesinin aynısı).
**4.4** Kılavuz içi arama.
**4.5** Dashboard kişiselleştirme (kart gizle/sırala, kayıtlı görünüm).
**4.6** `l10n` altyapısını kur (içerik İngilizce kalır; mekanizma hazır olur).

---

## İlkeler (değişmez — önceki planlardan devralındı)

1. Tamamen yerel, telemetrisiz; ağa yalnızca kullanıcının yapılandırdıkları çıkar.
2. Bağımlılıksız çalışma zamanı — native modül yok, dosya tabanlı depolama.
3. İç model çağrıları daima ucuz model; otomatik döngüler varsayılan kapalı.
4. Onaysız yazma yok; her üzerine yazmada `.afbak` yedeği.
5. **Sıfır kullanıcı-özel hardcode** — makineye özellik ayarla gelir.
