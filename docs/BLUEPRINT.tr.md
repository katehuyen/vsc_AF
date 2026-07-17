# Agent Farm — Kılavuz ve Blueprint

> Bu belge eklentiyle birlikte sürekli geliştirilir. Arayüzdeki her **?** düğmesi seni bu kılavuzun ilgili bölümüne getirir. Komut paletinden `Agent Farm: Open Guide` ile de her an açabilirsin.

## Agent Farm Nedir

Agent Farm, bilgisayarında yaşayan **Claude Code ajanlarının komuta merkezi**dir. Ajanlarını tek panelden görüntüler, yönetir, maliyetlerini hesaplar ve sağlıklarını denetler.

Tamamen yereldir: hiçbir veri makinenden çıkmaz, hiçbir sunucuya bağlanmaz. İki veri kaynağını okur:

1. **Ajan klasörlerin** (`agentFarm.agentRoots` ayarındaki kökler) — içinde `CLAUDE.md`, `.claude` ya da `memory/` olan alt klasörler ajanlardır; kimlik, hafıza, araç ve izin dosyaları oradan okunur. Alt klasörleri ajan olan bir kök **yuvadır** — kökün kendi `CLAUDE.md`'si tüm ajanlarının yüklediği ortak talimat sayılır (Claude Code'un üst `CLAUDE.md` dosyalarını ele alışıyla birebir aynı), ajan sayılmaz. Ajan-görünümlü alt klasörü olmayan kök ise tek başına bir ajandır. Kökler ve klasör dışlamaları Farm Settings'teki **Agent folders** bölümünden yönetilir (2.61.0).
2. **Claude Code oturum kayıtların** (`~/.claude/projects/*/*.jsonl`) — her oturumun modeli, token kullanımı, araç çağrıları ve zaman damgaları buradan okunur. Oturumlar, çalışma dizinlerine bakılarak ajanlarla eşleştirilir.

## Hızlı Başlangıç

Hiç bilmiyorsan buradan başla. Bu bölüme her an komut paletinden (`Ctrl+Shift+P`) **Agent Farm: Quick Start** yazarak dönebilirsin.

> Bu kılavuzun yanında bir de **Örnek Kullanımlar** belgesi var: gerçek çalıştırmalarla test edilmiş 11 adım-adım operasyon senaryosu (inbox nöbeti, devirli zincir, bağlam diyeti, vault karnesi…). Komut paleti → **Agent Farm: Open Examples**. Medya/video üretim iş akışları (storyboard → görsel → video → kurgu) için durum ve gelişim yol haritası ayrı bir canlı belgede: [ROADMAP.media.tr.md](ROADMAP.media.tr.md).

### İlk 3 Dakika: Paneli Tanı

1. Sol kenardaki Activity Bar'da **dört düğümlü ağ ikonuna** tıkla — Agent Farm paneli açılır. Altı bölüm görürsün:
   - **Agents** — ajanların; yeşil nokta = şu anda çalışıyor. Ajanı genişlet: kimliği, nöbet görevleri, hafızası, izinleri, oturumları.
   - **Tasks** — ajanlara sıraya koyduğun işler, zamanlanmış görevler, şablonlar ve iş akışları.
   - **Missions** — çok-ajanlı misyonlar: her koşu tur ve delegasyonlarıyla ağaçta; onay/soru bekleyenler satırdan yanıtlanır. ([detay](#missions))
   - **Recent Sessions** — filodaki son oturumlar; tıkla → okunur transkript.
   - **Insights** — sağlık bulguları: ne şişmiş, ne kopmuş, ne bayatlamış.
   - **Live Feed** — filodaki son olaylar.

   > **Bölümlerden biri görünmüyor mu?** VS Code, bir görünüm bir kez gizlenmiş ya da başka panele sürüklenmişse bunu kalıcı hatırlar. Agent Farm panelinde herhangi bir bölüm başlığına **sağ tıkla** → listede eksik bölümü (ör. **Tasks**) işaretle; geri gelir. Bölüm başka panele sürüklenmişse aynı listeden bulup Agent Farm'a geri sürükleyebilirsin.
2. Alt durum çubuğuna bak: `🤖 1 active • $2.4 today`. Tıkla → **Dashboard** açılır: bugünkü maliyet, grafikler, ajan kartları, en pahalı oturumlar.
3. Dashboard'da bir ajan kartına tıkla → o ajanın **detay sayfası**: maliyet trendi, hafıza tablosu, sağlık bulguları, oturum listesi.

Arayüzde gördüğün her **?** düğmesi seni bu kılavuzun ilgili bölümüne getirir — kaybolman imkânsız.

### İlk 10 Dakika: Üç Temel Alışkanlık

1. **Canlı gözlemi kur (bir kere):** Komut paleti → `Agent Farm: Install Live Hooks` → User settings → onayla → açık claude oturumlarını yeniden başlat. Artık ajanlar canlı izlenir, izin bekleyince bildirim gelir. ([detay](#canli-gozlem))
2. **İlk nöbet görevini ekle:** Agents ağacında bir ajanın **Duties** satırına sağ tıkla → **Add Standing Duty**. Ajanla "şuraya her tur bak" anlaşmalarını buraya taşı. ([detay](#nobet-gorevleri))
3. **Bütçe koy:** Ayarlar → `agentFarm.budgets` → `{"psikolog": 20, "*": 50}` gibi. Aşınca haber gelir. ([detay](#butce-uyarilari))

### Ne Yapmak İstiyorsun? (Tarif Listesi)

| İstediğin | Nereden |
| --- | --- |
| Bugün ne harcadım? | Durum çubuğu, veya Dashboard → Cost today |
| Bu ajan neye para yakıyor? | Ajan kartı → Detail → Cost by model + Top sessions |
| Ajan şu an ne yapıyor? | Agents ağacı (WORKING/TOOL rozetleri) veya `Open Live Timeline` |
| Geçmiş bir konuşmayı oku | Recent Sessions → tıkla; içinde arama kutusu var |
| Ajanı başlat / devam ettir | Ajana sağ tık → Start / Continue Latest Session |
| Yeni ajan kur | Agents başlığındaki **+** → şablon iskelet hazır gelir |
| Ajana iş sırala | Tasks → **+** Add Task (Interactive/Headless) |
| Her sabah 08:30 otomatik iş | Tasks → takvim ikonu → Daily 08:30 ([VS Code kapalıyken de olsun mu?](#vs-code-disinda-zamanlama-windows)) |
| Ajanları zincirle çalıştır | Tasks → `New Multi-Agent Workflow…` — `{prev_output}` ile devir ([koşullar](#kosullu-dallanma)) |
| Hedef ver, lead ajan tur tur yönetsin | Sol paneldeki **Missions** bölümü → **+**, ya da her sayfanın üstündeki **Missions** düğmesi ([detay](#missions)) |
| "Şuraya her tur bak" anlaşması | Duties → Add Standing Duty ([detay](#nobet-gorevleri)) |
| Ajanlardaki kopya hafızaları eşitle | Komut paleti → `Sync Shared Memory…` |
| Haftalık karne / vault raporu | `Export Fleet Report` veya otomatik: `autoReport` ayarı |
| Gece işleri ne üretti? | `Export Task Outputs Digest` |
| Bir şey bozuk mu? | Insights görünümü — tıkla, ilgili dosya açılır |
| Bunu hangi ajanla konuşmuştum? | Recent Sessions başlığındaki 🔍 → `Search Transcripts…` ([detay](#transcript-arama)) |
| Ajanlar kaliteli mi çalışıyor? | `Sample Output Quality Now` → Dashboard'da Quality kolonu ([detay](#kalite-karnesi)) |
| Ajan hep aynı hatayı yapıyor | `Scan for Instruction Suggestions…` → Insights'taki 💡 önerisini uygula ([detay](#talimat-onerileri)) |
| "Cümleyle söyleyeyim, o kursun" | Tasks başlığındaki 🚀 → `Natural Language Command…` ([detay](#dogal-dil-komuta)) |
| Anlamıyla ara ("neydi o konu?") | Arama panelinde **semantic** kutusu ([detay](#transcript-arama)) |
| Ajan siteye girip veri toplasın | Zincire Browser step ([detay](#tarayici-adimlari)) |
| Gelen iş doğru ajana kendisi gitsin | Tetik eylemi: Dispatch ([detay](#dispatcher-is-dagitici)) |
| Laptop'taki filoyu da buradan izle | Senkron klasör + `extraClaudeDirs` ([detay](#coklu-makine)) |
| Günlük karne Telegram'a düşsün | `agentFarm.dailyDigest` = "21:30" ([detay](#gunluk-ozet-karti-cebe)) |
| Ajanı başka makineye taşı / paylaş | Ajana sağ tık → `Export Agent Pack…` ([detay](#ajan-paketleri)) |
| Ajan Antigravity'de de çalışsın | Ajana sağ tık → `Sync Agent with Antigravity…` ([detay](#antigravity-uyumlulugu)) |

### Kavramlar (30 Saniyede)

- **Ajan** = içinde `CLAUDE.md` olan klasör. Agent Farm hiçbir şeyi değiştirmez, sadece okur (senin onayınla yazdığı üç istisna: yeni ajan iskeleti, hook kurulumu, nöbet görevi dosyası).
- **Maliyet** = token kullanımının API karşılığı değeri; abonelikte fatura değil, verim ölçüsüdür.
- **Nöbet görevi** = ajanla süreklilik anlaşması ("şuraya bak, değişince şunu yap") — `DUTIES.md`'de yaşar.
- **Görev/Workflow** = senin başlattığın işler; nöbet görevinden farkı, ajanın oturum içinde kendi kendine değil, kuyruktan tetiklenmesidir.

## Modüller

### Agents Ağacı

Yan paneldeki ana ağaç. Her ajan şu alt bölümlerle açılır:

| Bölüm | İçerik |
| --- | --- |
| Identity | `CLAUDE.md` — tıklayınca açılır, yanında tahmini token boyutu |
| Duties | Nöbet görevleri (`DUTIES.md`) — bkz. [Nöbet Görevleri](#nobet-gorevleri) |
| Memory | `memory/` altındaki dosyalar; token, son değişiklik + **30 günlük recall sayısı ve orphan işareti** — bkz. [Hafıza Yönetimi](#hafiza-yonetimi) (2.14.0) |
| Tools | `tools/` klasöründeki scriptler |
| MCP | Ajanın MCP sunucuları + 30 günlük gerçek kullanım — bkz. [MCP Yönetimi](#mcp-yonetimi) |
| Skills | Agent Skills (`.claude/skills` + `~/.claude/skills`) + 30 günlük gerçek kullanım — bkz. [Skill Yönetimi](#skill-yonetimi) (2.12.0) |
| Permissions | `.claude/settings.local.json` izin özeti |
| Sessions | Son 15 oturum; tıklayınca Oturum Görüntüleyici açılır |

Ajan üzerinde sağ tık menüsü: **Start Claude Session**, **Continue Latest Session**, **Open Agent Detail**, **Open in New Window**, **Reveal in File Explorer**.

Oturum satırında sağ tık menüsü (2.7.0):

- **Resume Session in Terminal** — o oturumun klasöründe terminal açıp `claude --resume <oturum-id>` çalıştırır: **herhangi bir geçmiş oturuma** kaldığın yerden devam edersin (Continue Latest yalnızca en son oturumu sürdürür). Satırın üzerine gelince çıkan ⏵ ikonu da aynısını yapar. Oturum Görüntüleyicinin sağ üstündeki **⏵ Resume** düğmesi de aynı işi görür.
- **Focus Session Terminal (2.58.0)** — üzerine gelince çıkan ⌨/terminal ikonu (ve sağ tık menüsü) doğrudan o oturumun terminal penceresine atlar. Aynı ⌨, oturumun göründüğü **her** yüzeyde var: Dashboard ve Ajan Detay tablo satırları, Timeline canlı kartları, Oturum Görüntüleyicinin üst çubuğu ve Needs You maddeleri.
- **Rename Session…** — oturuma kendi adını ver (hatırlamak için); boş bırakırsan otomatik başlık geri gelir. Adlar kalıcıdır, transcript dosyasına dokunulmaz.

Oturum başlıkları 2.7.0'dan itibaren konuşmadan türetilir: `/compact` gibi komutlar, `<...>` harness blokları ve `!` kabuk satırları artık başlık olmaz — ilk gerçek kullanıcı cümlesi başlıktır.

### Dashboard

Filonun genel panosu. `Agent Farm: Open Dashboard` komutuyla veya durum çubuğuna tıklayarak açılır.

**Her sayfada tek başlık (2.59.0):** her panelin üst çubuğu tek bir ortak bileşenden çizilir; hizalama, boşluk ve sıralama her yerde birebir aynıdır — başlık ve alt yazı solda, sağa yaslı tek araç çubuğu. Araç çubuğu ince bir ayraçla iki yarıya bölünür: **sol yarı sayfanın kendi** kapsam kontrolleri ve eylemleri (aralık/pencere seçicileri, Start/Resume/⌨/Export…); **sağ yarı ise küresel küme — her sayfada aynı düğmeler, aynı sırada:** **Dashboard · Live Timeline · (ilgili panel) · ⌕ Search · ⚙ Settings · Refresh · ? Guide** — yalnızca zaten üzerinde olduğun sayfa listeden düşer. ⌕ Search anlamlı olduğu yerde ön-kapsamlıdır (bu ajan / bu oturum). Sayfalar sol yarılarında farklılaşır; sağ yarı kas hafızasıdır.

- **KPI kartları**: aktif ajan sayısı, bugünkü maliyet, seçili aralık maliyeti, oturum sayısı, 5 saatlik pencere, toplam bulgu sayısı.
- **Farm Status kartı (2.39.0):** KPI'ların hemen altında, alt sistem başına dürüst bir aktivasyon satırı — **yeşil nokta = canlı kullanımda, mavi = kurulu ama boşta, gri = hiç kullanılmamış.** Dokuz satır: canlı izleme, görevler/zamanlama, tetikleyiciler, iş akışları, medya hattı, harici CLI'lar, varlık alımı (ingest), zeki gözetim, sır kasası. Uyuyan her satırın yanında **tek tık uyandırma** düğmesi vardır (örnek kurulum, anahtar ekleme, ilgili ayar/kılavuz). Bir şey uyuyorsa kart açık gelir; her şey canlıysa tek satır özete katlanır. Harici CLI satırı adaptörlerin fail-soft doğasını da hatırlatır: profil var ama hiç oturum görünmüyorsa bu bir format kayması işareti olabilir.
- **Daily cost by agent**: ajan bazında yığılmış maliyet grafiği. Aralık seçici (2.13.0 ile genişledi): **7 / 14 / 30 / 90 / 180 / 365 gün**. 120 günü aşan aralıklarda çubuklar okunur kalsın diye günlükler otomatik **haftalık gruplanır** (başlıkta "weekly buckets" notu). Tüm günlük veri zaten oturum kayıtlarından geldiği için 1 yıllık görünüm ek yük getirmez.
- **Cost by model**: hangi modele ne kadar harcandığını gösteren halka grafik.
- **Token types**: input / output / cache write / cache read dağılımı. Cache read oranın yüksekse prompt cache verimli çalışıyor demektir — bu iyidir.
- **Activity heatmap**: haftanın günü × saat bazında mesaj yoğunluğu. Çalışma ritmini gösterir.
- **Agent kartları**: durum, bugün/aralık maliyeti, mini trend çizgisi, bulgu rozetleri. Karta tıkla → detay sayfası.
- **Sessions tablosu (2.50.0 — eski Top/Recent tabloları birleşti; 2.57.0'dan beri Ajan Detay sayfasıyla ortak)**: tek tablo, **Sort by** seçicisiyle — Recent (varsayılan) · Cost · Tokens · **Ctx now** (2.57.0) · Duration · Turns; hangi kriteri seçersen seç çiftliğin gerçek zirvesi gösterilir, seçim hatırlanır. Kolonlarda araç/hata sayıları ve **Ctx now** var — oturumun son cevabından sonra model penceresindeki yaklaşık bağlam, "hangi oturum compact zamanına yaklaştı?" sorusunun anlık cevabı (— ise transkript kaydetmemiş demektir). Yeşil **●** o an aktif oturumları işaretler; **her satırda ⌨ düğmesi var** (2.58.0) — oturum boşta beklerken de terminal penceresi açık olabilir; ⌨ o oturumun terminaline atlar, pencere bulunamazsa dürüstçe söyler. Satır başındaki **▸** o oturumun **tur listesini** açar — her turun başlığı, tur başına token ve maliyetiyle; transkriptten istek anında hesaplanır. Oturum satırları tonlu ve vurgu kenarlıdır, böylece açılan satırın turları iç içe içerik olarak okunur. Tur kontrolleri görüntüleyicideki akordeonla aynı: **Expand all / Collapse all / Single-open** (aynı anda tek oturumun turları açık, hatırlanır). Satırın kendisine tıklamak transkripti açar; **tur satırına tıklamak transkripti tam o turdan açar** (2.51.0) — görüntüleyici zaten açıksa ikincisi açılmaz, o sekme öne getirilip tura kaydırılır.
- Üst satırda **Live Timeline** düğmesi (2.22.0): Refresh ile Guide arasında — panodan kulvar görünümüne tek tık.

Dashboard, oturum kayıtları değiştikçe kendini otomatik günceller.

### Ajan Detay Sayfası

Tek bir ajanın komuta ekranı:

- Üst düğme satırında **Dashboard** ve **Live Timeline** (2.43.0) — üç ana yüzey arasında tek tık geçiş.
- Toplam maliyet, oturum başına ortalama, araç çağrısı ve hata sayıları.
- Son 30 günün maliyet grafiği ve model dağılımı.
- **Fixed context load**: her oturumda otomatik yüklenen sabit bağlam (`CLAUDE.md` + `MEMORY.md` + `AGENTS.md`) bütçe çubuğu. Detay için aşağıdaki Sağlık bölümüne bak.
- **Top tools**: ajanın en çok kullandığı araçlar — ajanın gerçekte ne iş yaptığının röntgeni.
- **Health & optimization**: bu ajana özel bulgular; satıra tıklayınca ilgili dosya açılır.
- **Task health** kartı: bu ajana delege edilen işlerin 30 günlük karnesi — detay için [Görev Sağlığı](#gorev-sagligi).
- **Memory files**: boyut, token ve tazelik bilgisiyle hafıza tablosu.
- **Sessions (2.57.0'dan beri Dashboard'un gelişmiş tablosu)**: bu ajanın oturumları, Dashboard'daki Sessions tablosuyla **birebir aynı bileşende** — Sort by (Recent · Cost · Tokens · **Ctx now** · Duration · Turns, sayfa başına hatırlanır), tur başına token/maliyet gösteren ve tıklayınca transkripti tam o turdan açan **▸ tur akordeonu**, **Expand all / Collapse all / Single-open**, aktif satırlarda yeşil ● + **her satırda ⌨ terminale atla** (2.58.0), süre/tur/araç/hata/token/**Ctx now**/maliyet kolonları. Dashboard'un 12'sine karşılık kriter başına ajanın ilk 50'si gösterilir.

### Oturum Görüntüleyici

Bir oturumun ham JSONL kaydını okunur konuşmaya çevirir:

- Mesajlar renk kodludur: mavi = kullanıcı, yeşil = asistan, sarı = araç çağrısı, mor = araç sonucu. Hatalı araç sonuçları kırmızı kenarlıkla ve açık halde gelir.
- Her asistan mesajında model, token ve maliyet görünür. Yalnızca araç çağrısı yapan (metinsiz) asistan adımlarının token'ı da kaybolmaz — ilk araç çağrısı satırında görünür (2.6.0).
- **Tur bantları (2.6.0, 2.8.0'da belirginleştirildi):** her kullanıcı komutu yeni bir tur açar. Tur başlangıcı artık ince bir çizgi değil, **tam genişlikte renkli bir bant**: vurgu renkli sol kenar, kalın `Turn 3/12`, komutun ilk cümlesi ve o turun token/maliyeti. Bant **yapışkandır** — hızlı kaydırırken içinde olduğun turun bandı üstte sabit kalır, tur geçişleri kaçmaz. Banttaki **onay kutusu** o turun MD dışa aktarımına dahil olup olmayacağını seçer; **↑ ↓ okları** (2.9.0) kaydırmadan bir önceki/sonraki tura zıplatır — bant yapışkan olduğu için oklar hep elinin altındadır (↑ okunun hiç kaydırmama hatası 2.11.0'da giderildi).
- **Tur akordeonu (2.48.0):** tur bantları aynı zamanda katlama başlığıdır — **banda tek tık** o turu bandına kadar katlar (▸/▾ ok işareti durumu gösterir; katlı bant mesaj sayısını da yazar), ikinci tık geri açar. Mesaj listesinin üstündeki `Turns:` satırında **Expand all / Collapse all** vardır — Collapse all tüm oturumu tıklanabilir vurgulu bant listesine çevirir, sonra yalnız ilgilendiğin turları açarsın. **Single-open** akordeonu tek-tur moduna alır: bir turu açınca önceki açık tur kendiliğinden katlanır (mod hatırlanır). Bir tura atlayan her şey — breakdown tablosu, ↑ ↓ okları, timeline/arama/feed tıkları — hedefini otomatik açar. Katlama yalnız görünümdür: filtreler, replay ve Export MD bundan etkilenmez.
- **⬇ Export MD (2.8.0):** o an gördüğün görünümü Markdown dosyasına aktarır — **ne görüyorsan onu**: Show chip'leri (örn. yalnız Dialog ya da yalnız Tool calls), metin filtresi ve replay konumu aynen uygulanır; seçimden çıkarılan turlar dışarıda kalır. Dosya başında oturum kimliği, süre, toplamlar ve uygulanan filtrelerin özeti bulunur. Kaydetme penceresi **en son kaydettiğin klasörde** açılır (2.9.0; ilk kullanımda oturumun kendi klasörü); önerilen dosya adı **tarih + saat damgası** taşır (`session-abcd1234-2026-07-10_143522.md`, 2.11.0) — aynı oturumu arka arkaya dışa aktarınca dosyalar çakışmaz. Kayıttan sonra dosya editörde açılır.
- **Export seçimi (2.9.0):** tur seçimi iki yerden, **senkron** yapılır — turun bandındaki kutu ve Turn breakdown tablosundaki `md` kolonu aynı seçimi gösterir, birinden değiştirince öbürü anında güncellenir. Tablodaki **All / None / Invert** düğmeleri toplu seçim yapar; satırdaki **only** düğmesi tek hamlede "yalnız bu turu" seçer. Başlık satırı ve Export MD düğmesi seçim varken `12/37 in export` sayacını gösterir.
- **Turn breakdown tablosu (2.7.0):** KPI kartlarının hemen altındaki açılır kutu tüm turları **tek tabloda** listeler: tur no, komutun ilk cümlesi, token, maliyet. Satıra tıkla → o turun ayracına atlar (replay'deyken oynatmayı o tura taşır). Tur toplamları artık oturum toplamıyla birebir tutar — düşünme (thinking) adımlarının token'ı da turuna yazılır.
- **Show filtresi (2.7.0; 2.52.0'dan beri varsayılan Dialog):** mesaj listesinin üstündeki chip satırı türlere göre filtreler: **All · Dialog · User · Assistant · Tool calls · Results · Errors**. "Dialog" yalnız sen + asistan konuşmasını bırakır (araç trafiği gizlenir) ve görüntüleyici artık bununla açılır — **All**'a tek tık her şeyi geri getirir. Chip'ler çoklu seçilebilir. Filtre **replay'i de etkiler** — Dialog seçiliyken replay'de yalnız diyalog akar. Filtrenin gizlediği bir şeye giden derin link (timeline/arama/feed/tur satırı) hedefi kaçırmak yerine **filtreyi temizler**.
- **Tur başına model (2.52.0):** her tur bandı, breakdown tablosu ve Markdown dışa aktarımı o tura hizmet eden modeli gösterir — model her dört seansın yaklaşık birinde seans ortasında değiştiği için bu bilgi seans başına değil **tur başına** verilir. Model kimlikleri transkriptten **verbatim** okunur: yarın çıkan bir model burada güncelleme gerektirmez (yalnızca fiyat kuralı ister). Aynı mekanizma, Claude Code bir effort/reasoning etiketi yazmaya başladığı an onu da gösterir — bugün yazmıyor, dolayısıyla gösterilmiyor.
- **⏵ Resume (2.7.0):** sağ üstteki düğme bu oturumu terminalde `claude --resume` ile devam ettirir.
- **⌨ Terminal (2.55.0, 2.56.0'dan beri oturum-hassas):** odağı **tam olarak bu oturumun** terminaline atlar — aynı düğme Dashboard'daki aktif oturum satırlarında ve Timeline canlı-oturum kartlarında da var. Her başlatma kendi terminalini kaydeder, canlı monitör oturum kimliğini ona bağlar; böylece aynı ajanın eşzamanlı iki oturumu kendi pencerelerine odaklanır. Oturum terminalleri `claude: <ajan> #n` başlığını taşır (her başlatmada benzersiz); harici Windows Terminal oturumları kendi penceresinde açılır ve o sabitlenmiş başlıkla bulunur. Oturum hakkında hiçbir şey bilinmiyorsa (2.55.0'dan önce ya da Agent Farm dışında başlatıldıysa) ajanın en son terminaline düşülür — o da bulunamazsa dürüst bir mesaj söyler.
- **Context now kartı (2.6.0, 2.11.0'da model-farkındalıklı):** son isteğin bağlam boyutu (prompt + cache + çıktı) ve **oturumun modelinin bağlam penceresi** içindeki yüzdesi. Tavan artık sabit 200K değil, modelden bulunur: Fable 5 / Mythos 5 / Opus 4.6–4.8 / Sonnet 4.6+ → 1M; Haiku 4.5 ve daha eski nesiller → 200K. %70'te sararır ve `/compact` ya da `/clear` önerir, %90'da kızarır. **Model tabloda yoksa** yüzde ve renk gösterilmez — sadece ham bağlam boyutu yazılır (tahmini tavan uydurulmaz). `agentFarm.contextWindowTokens` ayarına değer girerek sabit tavan zorlanabilir (0 = otomatik). Oturum çalışırken kayıt her değiştiğinde kart **canlı** tazelenir — "bağlam doldu mu, compact zamanı mı?" sorusunun anlık cevabı.
- Üstteki arama kutusu mesajları ve araç adlarını filtreler; kutu doluyken sağında beliren **✕** tek tıkla filtreyi temizler (2.37.0).
- **Open raw JSONL** ham kaydı editörde açar.
- **⌂ \<ajan\> (2.60.0):** hemen yanındaki düğme oturumun **sahibi olan ajanı** adıyla gösterir ve tek tıkla o ajanın sayfasını açar — "bu kimin oturumuydu?" diye Dashboard'a dönmek gerekmez. Ajan köklerinin dışında yaşayan oturumların sahibi yoktur, düğme de görünmez.
- Çok uzun oturumlarda son N mesaj gösterilir (`agentFarm.maxTranscriptMessages` ayarı, varsayılan 1500).
- **▶ Replay** oturumu adım adım oynatır — ayrıntı için [Oturum Replay](#oturum-replay).

### Insights Ağacı

Tüm filonun sağlık bulguları tek listede: ⛔ hata, ⚠ uyarı, ℹ bilgi. Bulguya tıklayınca ilgili dosya açılır. Bulgular aşağıdaki Sağlık kurallarından üretilir.

### Live Feed

Filodaki son olayların canlı akışı: kullanıcı komutları (prompt), araç çağrıları ve hatalar, ajan adıyla birlikte. Oturum kayıtları değiştikçe kendiliğinden yenilenir. Bir olaya tıklayınca ait olduğu oturum açılır ve görüntüleyici **tam o olayın mesajına kayar** (2.42.0 — timeline ve arama ile aynı mekanizma).

### Durum Çubuğu

`🤖 N active • $X today` — aktif ajan sayısı ve bugünkü toplam maliyet. Üzerine gelince 5 saatlik pencere özetini de gösterir. 30 saniyede bir ve her veri değişiminde güncellenir.

**Token lap sayacı (2.6.0):** kronometrelerin lap tuşu ya da arabalardaki günlük kilometre sayacı gibi — ana sayaçlar (bugün / 5 saatlik pencere) transcript'lerden türediği için sıfırlanamaz, ama **kendi sıfırlanabilir sayacını** başlatabilirsin:

- **Agent Farm: Reset Token Lap** — o andan itibaren tüm filonun token/maliyet/mesajını saymaya başlar; durum çubuğunda `⏱ 84.2K` olarak görünür, tooltip'te ayrıntısı ve sıfırlama/temizleme linkleri vardır.
- Yeni tur için tekrar **Reset Token Lap**; sayacı kaldırmak için **Clear Token Lap**.
- Sınır: lap, son 48 saatlik mesaj penceresinden beslenir — 48 saatten yaşlı bir lap yalnızca son 48 saati sayar (tooltip'te uyarır).

## Terminal Render Sağlığı

VS Code'un terminali gerçek bir terminal değildir — Chromium içinde çalışan **xterm.js** emülatörüdür (shell → PTY → xterm.js → Electron → GPU). Katman sayısı yüzünden uzun TUI oturumlarında (claude gibi) render aksaklıkları görülebilir: yazarken varmış gibi görünen hayalet boşluklar, kaybolan/bozulan satırlar, kaydırınca düzelen görüntü. İki çare var, ikisi de tek komutta: **Agent Farm: Terminal Rendering Fix…**

- **Apply render fix (önerilen):** `terminal.integrated.gpuAcceleration: off` + `smoothScrolling: off` — GPU/WebGL yerine DOM renderer. Hayalet boşluk/satır kaybı raporlarının çoğunu bu çözer. Yeni açılan terminallerde geçerli olur.
- **Claude sessions in external terminal:** `agentFarm.externalTerminal` ayarını açar/kapatır. Açıkken **Start Session / Continue Latest / Resume** oturumları VS Code terminali yerine **işletim sistemi terminalinde** açılır (Windows Terminal varsa o, yoksa düz cmd penceresi) — xterm.js tamamen devre dışı, native render. Farm görevleri bilerek entegre terminalde kalır: yaşam döngüleri terminal kapanma olayından izlenir.
- **Disable persistent sessions:** reload sonrası geri yüklenen terminaller de sık bir bozuk-görüntü kaynağıdır; bu seçenek geri yüklemeyi kapatır (bedeli: reload'da terminaller kaybolur).
- **Restore VS Code defaults:** üç ayarı da varsayılana döndürür. Komut açılırken mevcut durumu gösterir (`gpu off · smoothScrolling off · …`).

## Canlı Gözlem

Faz 2 ile gelen gerçek zamanlı izleme katmanı. Oturum kayıtları diske birkaç saniye gecikmeyle düşer; canlı gözlem ise **Claude Code hook'ları** üzerinden olayları anında yakalar: komut girildiği an, araç çalıştığı an, izin beklendiği an.

### Nasıl Çalışır

1. Eklenti, yalnızca bu makineden erişilebilen küçük bir dinleyici açar: `127.0.0.1:8377` (ayarlanabilir).
2. Claude Code'un hook sistemine 9 olay için tek satırlık bir `curl` komutu eklenir; her olay dinleyiciye JSON olarak POST edilir.
3. Eklenti olaylardan oturum başına bir **durum makinesi** yürütür:

| Durum | Anlamı |
| --- | --- |
| WORKING | Komut alındı, model düşünüyor |
| TOOL | Şu anda bir araç çalışıyor (adı gösterilir) |
| PERMISSION? | **İzin onayı bekliyor** — sen onaylayana kadar duruyor |
| YOUR TURN | Turunu bitirdi, senin girdini bekliyor |
| STALLED | Çalışıyordu ama uzun süredir olay yok — takılmış olabilir |
| IDLE / ENDED | Boşta / oturum kapandı |

Hiçbir veri makineden çıkmaz; dinleyici yalnızca localhost'a bağlıdır.

### Kurulum: Install Live Hooks

1. Komut paletinden **Agent Farm: Install Live Hooks** çalıştır.
2. Hedef seç: **User settings** (önerilen — tüm oturumları kapsar, tek dosya: `~/.claude/settings.json`) veya ajan başına `.claude/settings.local.json`.
3. Onay ver. Eklenti mevcut ayarlarına **dokunmaz**: kendi girdilerini yanına ekler, ilk yazımda `.agentfarm-bak` yedeği alır, senin elle koyduğun hook'ları korur.
4. **Önemli:** Hook'lar oturum başlarken okunur — halihazırda açık claude oturumlarını yeniden başlatmadan olay gelmez.

Kaldırmak için: **Agent Farm: Remove Live Hooks** — yalnızca Agent Farm'ın kendi girdilerini siler, seninkilere dokunmaz.

### Zaman Çizelgesi (Timeline)

**Agent Farm: Open Live Timeline** komutuyla veya Live Feed görünümündeki nabız ikonuyla açılır.

- **Kulvarlar (swim lanes):** Her ajan bir şerit; yeşil bloklar araç koşularını (süresiyle), noktalar/elmaslar olayları gösterir: mavi nokta = komut, kırmızı elmas = izin bekleme, mor elmas = compaction, turuncu nokta = subagent bitti, çizgi = tur sonu.
- **Aynı ajanın eşzamanlı oturumları (2.45.0):** Aynı ajan aynı anda birden çok oturumda açıksa her eşzamanlı oturum **kendi satırını** alır (`dev #1`, `dev #2` …) — olaylar artık üst üste binmez. Ardışık (çakışmayan) oturumlar ise eskisi gibi tek satırı paylaşır, satır sayısı şişmez. Oturum kartları, bildirimler ve Needs You kuyruğu da aynı `#k` etiketini kullanır; ajan ağacında durum yanında `×2` rozeti görünür.
- **Tıkla → tam o ana git (2.37.0):** Kulvardaki herhangi bir işarete **veya yeşil araç bloğuna** tıklayınca Oturum Görüntüleyici yalnızca açılmakla kalmaz, kayıtta **tam o olayın olduğu mesaja** kayar ve mesajı kısa süreliğine çerçeveyle vurgular. Görüntüleyici zaten açıksa aynı tık onu öne getirip o noktaya taşır.
- **Sıra-sende bildirimleri (2.22.0):** Her kulvarın solundaki dört kutucuk — **♪ ses · ◎ odak · ▣ modal · ▭ toast** — o ajan **YOUR TURN**'e geçtiğinde (görev bitip senin girdini beklemeye başlayınca) çalışacak eylemleri seçer. Ajan başına bağımsızdır; kutucuğa tıkla, seç/kaldır. Seçim `globalState`'e yazılır ve tetikleme host tarafındadır — **panel kapalıyken de çalışır**. *Ses:* kısa bip (Windows'ta PowerShell beep). *Odak:* timeline panelini öne getirir (VS Code'un OS penceresini garanti öne getiren API'si yoktur; modal en güçlü dikkat çekicidir). *Modal:* "Sıra sende: <ajan>" bloklayıcı diyaloğu + Transkripti aç. *Toast:* köşede non-modal bildirim. Aynı tura tek bildirim düşer (3 sn'lik oturum-başı yutma). Bu, global `notifyTurnEnd` ayarından ayrıdır — o tüm ajanlar için tek bir toast atar; bu ise ajan-seçmeli ve zengin eylemlidir.
- **Oturum-bazlı uyarı override'ı (2.45.0):** Kulvar kutucukları ajanın **varsayılanıdır** ve tüm oturumlarını kapsar; belirli BİR oturumu farklı ayarlamak istersen o oturumun **Live sessions kartındaki** chip'lere tıkla — değişiklik yalnız o oturuma işler (kart "session override — reset" gösterir; reset ile varsayılana döner). Tüm chip'leri kapatmak o oturumu susturur, ajan varsayılanı diğer oturumlarda çalışmaya devam eder. Override'lar oturum kimliğiyle saklanır ve oturum kapanınca otomatik temizlenir.
- Kırmızı dikey çizgi = şu an. Pencere seçici (2.43.0 ile genişledi): **15m / 1h / 4h / 8h / 16h / 24h** ayrıntılı kulvar görünümü + **3d / 7d / 30d** yoğunluk görünümü. 16h ve 24h de artık klasik akış (kulvar) olarak çizilir — monitör 24 saati bellekte tuttuğundan bar'lara düşmek yalnız 3 gün ve üzerinde gerekir.
- Sağ üstte **Dashboard** düğmesi (2.43.0): Dashboard ↔ Ajan Detayı ↔ Timeline üçgeninde tek tık geçiş (Dashboard'da Live Timeline, Ajan Detayında her ikisi de var).
- **Yoğunluk görünümü (24h+):** o ölçekte tek tek noktalar okunmaz — her kulvar 168 zaman dilimine bölünür, dilim başına aktivite çubuğu çizilir (yeşil = araçlar, mavi = komutlar, √ ölçek); şeridin üstündeki kırmızı bant = o dilimde izin beklemesi yaşandı. Amaç desenleri görmek: hangi ajan hangi gün/saatte çalışmış, nerede takılmış.
- **Kalıcılık (2.13.0):** olaylar artık `globalStorage/live-events.jsonl` dosyasına yazılır — VS Code'u kapatıp açmak zaman çizelgesini sıfırlamaz. Bellekte son 24 saat tutulur (uzun aralıklar diskten okunur), dosyada son **31 gün** saklanır (üstü otomatik budanır, boyut sınırı 64MB). 31 günden geriye gitmemesinin nedeni yük değil anlam: hook olayları o ölçekte desen bilgisi taşımaz — uzun vadeli bakış için Dashboard (1 yıla kadar) doğru araçtır.
- **Live sessions kartları:** Her oturumun anlık durumu, son komutu, sayaçları ve başlangıç saati (2.45.0); başlıkta gerekiyorsa `#k` oturum etiketi; sıra-sende chip'leri karttan oturum-bazlı ayarlanabilir; "Open transcript" ile kayda atlanır.
- Panel olay geldikçe kendini günceller.
- Not: 2.13.0 öncesi olaylar diske yazılmadığından, kurulumdan sonra uzun aralıklar zamanla dolar.

### Bildirimler

| Ayar | Varsayılan | Ne zaman |
| --- | --- | --- |
| `agentFarm.notifyPermission` | açık | Ajan izin onayı beklemeye başlayınca |
| `agentFarm.notifyStuck` | açık | Çalışan oturumdan `stuckThresholdSeconds` (240 sn) boyunca olay gelmeyince |
| `agentFarm.notifyTurnEnd` | kapalı | Ajan turunu her bitirdiğinde (gürültülü olabilir) |

Bildirimdeki **Open Timeline** düğmesi seni doğrudan kulvar görünümüne götürür. Ayrıca durum çubuğu izin/takılma varken sarıya döner: `🤖 2 active • $1.42 today • 🔔 1 waiting`.

### Güvenlik ve Performans

- Dinleyici yalnızca `127.0.0.1` — dışarıdan erişilemez, hiçbir dış servise veri gitmez.
- Hook komutu `curl -m 3 ... || cd .` kalıbındadır: dinleyici kapalıysa en fazla 3 saniyede sessizce vazgeçer ve **ajanı asla bloklamaz** (çıkış kodu her zaman 0).
- Her araç çağrısına ~2 küçük süreç (curl) eklenir; pratikte hissedilmez.
- İki VS Code penceresi açıksa dinleyiciyi ilk açılan alır; diğeri Timeline başlığında "port in use" gösterir — sorun değildir, tek dinleyici yeter.

## Görev Kuyruğu

Faz 3 ile gelen koordinasyon katmanı. Yan paneldeki **Tasks** görünümünden ajanlarına iş sıralarsın; her görev ajanın klasöründe bir terminal açıp `claude` komutunu senin prompt'unla başlatır.

### Tek Tık Örnek Kurulum (2.39.0)

Boş sayfa problemine karşı: **Agent Farm: Set Up Example Automation…** üç çalışan örnekten birini gerçek, düzenlenebilir bir tanım olarak kurar — 📥 **Inbox nöbeti** (klasör seç → watch trigger + tasnif görevi), 🌅 **Sabah brifingi** (ajan seç → her gün 09:00 headless görev), 🔗 **İki ajanlı zincir** (A analiz → `{prev_text}` → B özet workflow'u, istersen hemen koştur). Kurulan şey sihir değildir; Tasks görünümünde görünür, düzenlenir, silinir. Komut palete ek olarak Tasks görünümünün boş karşılama ekranından, Dashboard'daki Farm Status kartından ve kurulum turundan (walkthrough) da erişilir. VS Code'un **Welcome → Walkthroughs** bölümündeki "Agent Farm: Beş Adımda Kurulum" turu, ajan tanıtmadan ilk otomasyona beş adımı sırayla yürütür.

### Görev Ekleme ve Çalıştırma

1. Tasks görünümünde **+** (Add Task): ajan seç → başlık → prompt → mod seç.
2. İki mod var:
   - **Interactive:** `claude "prompt"` — oturum açılır, prompt ilk mesaj olarak gider, sen devam edebilirsin.
   - **Headless:** `claude -p "prompt"` — görevi çalıştırır, çıktıyı terminale basar ve çıkar. Otomasyon için idealdir.
3. Kuyruktaki görevler sırayla bekler; ▶ ile başlatırsın, ↑↓ ile sıralarsın.
4. Görev terminali kapanınca (veya headless komut bitince) görev otomatik **done** olur. Shell integration açıksa çıkış koduna göre **failed** da işaretlenir. İstediğin an ✓ ile elle tamamlayabilirsin.
5. `agentFarm.queueAutoAdvance` ayarını açarsan, bir görev bitince o ajanın kuyruğundaki sıradaki görev kendiliğinden başlar — zincirleme çalışma.

Görev durumları: ○ queued → ⟳ running → ✓ done / ⛔ failed / ⊘ cancelled. Çalışan göreve tıklayınca terminali öne gelir.

**Dedup koruması (2.18.0):** aynı ajana birebir aynı prompt zaten kuyruktaysa Add Task seni uyarır — kazara ikinci kez eklemeyi önler.

### Yeniden Çalıştırma ve Öncelik

Biten veya bekleyen görevlerde tek tıkla (2.18.0):

- **Retry** (biten görevlerde ⟳): görevi taze bir kopya olarak yeniden kuyruğa alır (`(retry N)` başlığı, artan deneme sayacı). **Retry with edited prompt…** aynısını, prompt'u önce düzeltmen için bir kutuyla açar. `done`/`failed`/`cancelled` görevlerin hepsinde çalışır.
- **Resume workflow from this step** (⏵, workflow adımına ait biten görevlerde): zinciri o adımdan yeniden başlatır; besleme (handoff) aynı koşudaki bir önceki adımın çıktısından yeniden kurulur — baştan çalıştırmadan kaldığın yerden devam.
- **Run Next** (⌃, bekleyen görevlerde): görevi kuyruğun önüne alır (önceliğini diğer bekleyenlerin üstüne çıkarır); kapasite açılınca ilk o başlar. Satırda `⬆ next` etiketiyle görünür.

**Öncelik ve yaşlanma:** kuyruk artık salt ekleme sırası değil — yüksek öncelikli önce başlar, eşitlikte eski görev önce. Bekleyen her görev her 30 dakikada +1 öncelik kazanır (yaşlanma), böylece sürekli yüksek-öncelikli iş gelse bile eskiler aç kalmaz.

### Uzun İş Dayanıklılığı (Dalga F)

Saatlik render'lar ve gece koşuları pencere kapanışına dayanır (2.33.0):

- **Medya reattach:** fal/Replicate işi kuyruğa girdiği anda poll URL'leri göreve yazılır (diske persist). Pencere render ortasında kapanırsa bir sonraki pencere işe **yeniden bağlanır** — poll kaldığı yerden sürer, asset'ler iner, galeri meta'sı yazılır ve zincir olduğu adımdan devam eder (arşivde "reattached" notu düşer). Süresi dolmuş işler aşağıdaki resume teklifine düşer. **Paralel grup istisnası (2.36.0):** reattach edilen iş bir paralel grubun dalıysa zinciri İLERLETMEZ — grubun fan-in durumu pencereyle birlikte öldüğünden koşu duraklatılır ve son dal tamamlanınca Resume teklif edilir (Resume grubu baştan koşturur; bildirimde açıkça söylenir).
- **Yarıda kalan run tespiti + resume teklifi:** pencere kapanırken koşan workflow adımları eskiden sonsuza dek bekleyen zombi satırlara dönüşür, zincir sessizce ölürdü. Artık dürüstçe *cancelled* işaretlenirler (başarı oranı analitiğine girmezler, arşive "Interrupted" notu düşer) ve açılışta tek bildirim **Resume** teklif eder: her run, yarıda kalan en erken adımından, önceki adımın çıktısı diskten yeniden kurularak devam eder (paralel gruplar grup başından yeniden fan-out olur — fan-in durumu bellekteydi, dürüst sınır). Reddedersen görev satırlarındaki Resume butonları her zaman durur; teklif tek seferliktir.
- Ad-hoc medya koşuları (kalıcı workflow'u olmayanlar) resume teklif edilmez — reattach penceresi geçtiyse yeniden üretmek için galeriden **Re-run** kullan.
- **Ağ kesintisi toleransı (2.35.0):** tüm medya/webhook poll döngüleri geçici hatalara (ağ hatası, 5xx, 429) artan beklemelerle dayanır; kalıcı hatalar (4xx) anında düşer. **Submit asla yeniden denenmez** — çifte kuyruk/çifte ücret riski. Provider çağrıları çitlendi: beklenmedik hata artık task'ı sonsuza dek "running" bırakmaz, adım `onFail` yoluyla dürüstçe düşer.

### Zamanlanmış Görevler

Tasks görünümündeki takvim ikonuyla (**Add Scheduled Task**) tekrarlayan işler kurarsın:

- **Daily** — her gün belirtilen saatte (örn. sabah 08:30 gün planı)
- **Weekly** — haftanın belirli günü ve saati (örn. Pazar 21:00 haftalık rapor)
- **Once** — tek seferlik, tarih+saat

Kurulu bir zamanlamayı değiştirmek için sağ tık → **Edit Schedule…** (2.42.0): başlık, prompt, saat ve (haftalıkta) gün yerinde düzenlenir — eskiden sil + yeniden kur gerekiyordu.

Zamanı gelen görev otomatik olarak kuyruğa eklenir, başlatılır ve bildirim düşer. Tek seferlikler çalıştıktan sonra kendini kapatır.

**Önemli sınır:** Bu zamanlayıcı VS Code açıkken çalışır — kapalıysa o çalıştırma atlanır (gün içinde açarsan o günün görevi gecikmeli tetiklenir). VS Code'dan bağımsız çalışması gerekenler için bir sonraki bölüme bak.

### VS Code Dışında Zamanlama (Windows)

Bir zamanlanmış görevi **Windows Görev Zamanlayıcı**'ya taşıyabilirsin: zamanlama üzerinde sağ tık → **Export as Windows Scheduled Task…**

1. Eklenti, ajan klasöründe `claude -p "prompt"` çalıştırıp çıktıyı log dosyasına yazan bir `.cmd` script'i üretir.
2. Hazır `schtasks /Create ...` komutu panoya kopyalanır — terminale yapıştırıp çalıştırınca kayıt tamamlanır.
3. Artık görev VS Code (hatta oturumun) kapalıyken bile işler; çıktılar log dosyasında birikir ("Open log folder" ile ulaşırsın).

Gereksinim: `claude` komutunun PATH'te olması. Kaldırmak için: `schtasks /Delete /TN "AgentFarm\<isim>"`.

### Görev Çıktı Arşivi

Headless görevler (0.4.0'dan itibaren) terminalde değil, **arka plan süreci** olarak çalışır ve tüm çıktı otomatik arşivlenir:

- Her headless görevin çıktısı başlık/ajan/başlangıç bilgili bir Markdown dosyasına yazılır; sonuna çıkış kodu ve süre eklenir.
- Görev bittikten sonra sağ tık → **Open Task Output** ile açarsın (çalışırken de kısmi çıktıyı görebilirsin).
- Çıkış kodu 0 değilse görev otomatik **failed** işaretlenir — güvenilir otomasyon sinyali.
- Görev silinince veya **Clear Finished Tasks** deyince çıktı dosyaları da temizlenir.

### Görev Şablonları

Sık kullandığın görevleri şablonlaştır: görev üzerinde sağ tık → **Save as Template**. Şablon bir ajana bağlanabilir ya da "any agent" olur (çalıştırırken sorar). Tasks görünümündeki **Templates** bölümünden ▶ ile tek tıkta yeni görev üretir. Örnek şablonlar: "Günlük plan", "Haftalık özet", "Hafıza bakımı".

### Eşzamanlılık ve Kota Bekçisi

0.8.0'dan itibaren kuyruk gerçek bir kuyruk: aynı anda koşan görev sayısı sınırlıdır (`maxConcurrentTasks` varsayılan 2, `maxConcurrentPerAgent` varsayılan 1). Sınıra takılan başlatma **iptal edilmez** — "deferred" rozetiyle bekler ve kapasite açılınca kendiliğinden koşar.

**Kota bekçisi:** `windowTokenLimit` tanımlıysa ve `quotaGuardPercent` (örn. 85) ayarlıysa, 5 saatlik pencere o doluluğa ulaştığında **otomatik** işler ertelenir — bir gece fabrikası sabah kotanı yemiş olmaz. Pencere gevşeyince ertelenenler sırayla başlar.

**Çoklu pencere güvenliği (2.38.0):** Görev kuyruğunu aynı anda yalnızca **tek** VS Code penceresi yürütür. Pencereler açılışta bir kira dosyası (`tasks.owner`) için yarışır; kirayı alan pencere pompayı/zamanlayıcıyı çalıştırır, diğerleri **salt-okunur takipçi** olur — Tasks görünümünün başında kilit rozetli "Read-only — another window runs the queue" satırı görünür, liste yürütücünün kayıtlarını canlı yansıtır. Takipçide yapılan değişiklik kaydedilmez (uyarı çıkar; görev yönetimini yürütücü pencerede yap). Yürütücü pencere kapanınca kira ~20 saniye içinde boşa düşer ve takipçilerden biri **kendiliğinden devralır** (yarıda kalan koşular o anda tespit edilip Resume teklif edilir). Önceden iki pencere aynı zamanlanmış görevi çift başlatabilir ve birbirinin koşan satırlarını "iptal" diye ezebilirdi — bu yapısal olarak kapandı.

### Görev Maliyeti (2.40.0)

Headless biten her görev, `claude -p` koşusunun yazdığı transkriptle **yaşam süresi eşleşmesi** üzerinden buluşturulur ve transkriptin fiyatlanmış token maliyeti görev satırına rozet olarak düşer (`done • $0.12 • 3m ago`); günlük digest'e de günün toplamı eklenir. Dürüstlük kuralı: aynı ajan klasöründe aynı anda ikinci bir oturum varsa (belirsizlik) rakam **uydurulmaz** — görev maliyetsiz kalır. Terminal modundaki görevlerde eşleştirme yapılmaz (oturum görevden sonra da sürer). Eşleşen transkript görevin tooltip'inde durur; medya adımlarının `mediaCost`'u bundan ayrıdır.

### Görev Tarihçesi

Biten görevler kaybolmaz: liste tavana gelince veya **Clear Finished Tasks** deyince kayıtlar aylık `task-history/YYYY-AA.jsonl` dosyalarına taşınır (`Open Task History` komutuyla aç). Çıktı arşivi klasörü de `outputsMaxMB` tavanını aşınca en eski, referanssız çıktılardan temizlenir.

### Görev Öngörüsü (Forecast)

**Task Forecast** (Tasks görünümünün başlığındaki takvim ikonu, 2.21.0) — sonraki günlerde neyin, ne zaman koşacağını bir markdown belgesinde gösterir:

- **Zamanlanmış koşular:** her zamanlamanın sonraki `forecastDays` (varsayılan 7) gündeki ateşleme zamanları, güne göre gruplu; her koşunun yanında aynı işin **son 30 gündeki medyan süresi ve başarı oranı** (Görev Sağlığı verisinden — geçmiş yoksa boş).
- **Şu an çalışan** ve **kuyrukta bekleyen** görevler (bekleyenlerde erteleme nedeni).
- Üstte toplam koşu sayısı ve tahmini **ajan-süresi** (bilinen medyanların toplamı).

Not: Süre öngörüsü yalnız başarılı koşuların medyanından hesaplanır (hızlı bir hata süreyi çarpıtmasın). Görev başına dolar maliyeti izlenmediğinden (token maliyeti oturum transkriptinde, göreve bağlı değil) forecast dolar değil süre/başarı öngörür; medya maliyeti ayrıca Dashboard'da.

### Görev Sağlığı

Delege ettiğin işler ne kadar güvenilir dönüyor? (2.17.0) Tarihçe arşivi + canlı görev listesi birleştirilip üç yüzeye işlenir:

- **Ajan Detay sayfasında "Task health" kartı** — son 30 günün karnesi: koşu sayısı (✓/✗/iptal), başarı yüzdesi (yeşil ≥%80, kırmızı <%50), medyan süre, retry ve verify sayıları, kaynak dökümü (manual/schedule/trigger/workflow), medya maliyeti, o anki kuyruk durumu. Üst üste başarısızlık varsa kırmızı uyarı satırı son başarısız görevi adıyla gösterir.
- **Yetenek Matrisi'nde Tasks ızgarası** — aşağıda [Yetenek Matrisi](#yetenek-matrisi) bölümüne bak.
- **Insights uyarıları** — bir ajanın 30 günlük başarı oranı %50'nin altına düşerse (en az 5 tamamlanmış koşuyla) ve bir görev ailesinin son koşuları hep FAILED ise `task` kategorisinde uyarı düşer: zincir kırık, kota yakmaya devam etmeden çıktıya bak.

Tekrarlanan koşular **görev ailesi** olarak gruplanır: başlıktaki `(retry N)` eki, tarih ve sayılar normalize edilir — "Nöbet turu 2026-07-08" ile "Nöbet turu 2026-07-09" aynı ailedir. İptal edilen görevler başarı oranına katılmaz (kullanıcı kararıdır, hata değil).

## Tetikleyiciler

Otomasyonun kalbi (0.8.0): işler yalnızca saatle değil, **olayla** başlar. Tasks görünümünde ⚡ **Triggers** bölümü.

### Tetikleyici Türleri

- **Watch (klasör/dosya):** İzlenen yol değişince ateşler. Nöbet sisteminin eyleme köprüsü: nöbet "ajan çalışırken bakar", tetikleyici ise **ajan kapalıyken bile** değişiklik anında görevi/zinciri başlatır. Örnek: FAST_NOTE'a dosya düştü → 10 sn sonra tasnif zinciri koşuyor.
- **Hook (canlı olay):** Bir canlı olay ateşler (Live Hooks kurulu olmalı): `stop` (ajan turunu bitirdi), `end` (oturum kapandı), `permission`, `compact`, `subagent`. İsteğe bağlı ajan filtresi. Örnek: psikolog oturumu bitince asistan özet görevi koşsun.

### Eylem ve Korumalar

Tetik ateşleyince üç eylemden birini yapar (sihirbaz "What should it do when it fires?" diye sorar):

- **Run a task on an agent you pick** — bir sonraki adımda **ajanı sen seçersin**, sonra prompt'u yazarsın (prompt'ta `{watch}` izlenen yolu, `{payload}` webhook gövdesini verir). "Olay olunca şu ajana şu komutu ver" kurulumunun yolu budur.
- **Dispatch — route to the best agent automatically** — sabit ajan yok; her ateşlemede kurallar (`agentFarm.dispatchRules`) + ucuz model sınıflandırıcısı işi en uygun ajana yönlendirir. Ajan seçme adımı **bilerek** yoktur.
- **Run a workflow** — kayıtlı bir zinciri koşturur.

Fırtına korumaları yerleşiktir ve **2.8.0'dan itibaren her tetik için ayrı ayarlanır** — sihirbazın son adımı "Default timing / Customize timing…" diye sorar:

- **Debounce** (varsayılan watch'ta 10 sn): art arda değişiklikler tek ateşe iner.
- **Cooldown** (varsayılan 60 sn): ateş sonrası sessiz dönem.
- **Saatlik tavan** (varsayılan 6/saat, 0 = sınırsız): aşılırsa uyarıyla atlanır.
- Kendi çıktı arşivini izleyen tetik kurulamazsa/kurulmuşsa devre dışı kalır (geri besleme döngüsü koruması).

Yönetim: **Add Trigger** sihirbazı; tetik satırında ▶ (elle ateşle), aç/kapat, sil; sağ tık → **Edit Trigger** ile ad, prompt, hedef ajan, debounce, cooldown ve saatlik tavan sonradan değiştirilir (2.8.0 — `farm-tasks.json`'ı elle düzenlemek artık gerekmez). Kaç kez ateşlediği ve son ateşleme zamanı satırda görünür. Watch yolu kaybolursa satır kırmızı "PATH MISSING" gösterir.

## Çoklu-Ajan İş Akışları

Faz 4'ün en güçlü aracı: **Workflows** — birden çok ajanın sırayla çalıştığı zincirler. `Agent Farm: New Multi-Agent Workflow…` ile kurulur: adım adım ajan + başlık + prompt + mod seçersin.

Sihirbazı bitirmek (2.8.0'da düzeltildi): en az bir adım ekledikten sonra ajan listesinin **en üstünde** `✓ Finish & save workflow` görünür — onu seç, zincir kaydedilir ve Tasks görünümündeki **Workflows** bölümüne düşer. Esc'ye basarsan emek çöpe gitmez: "Save / Discard" diye sorar. Bir adımın ortasında (başlık/prompt kutusunda) vazgeçersen yalnızca **o adım** iptal olur, sihirbaz adım seçicide kalır. Adım kurulurken sorulan "If this step fails: stop the workflow" seçeneği zinciri bitirme komutu değildir — o adım **hata verirse** ne olacağını seçer (bkz. [Koşullu Dallanma](#kosullu-dallanma)).

- Bir adım **done** olunca sonraki adım kendiliğinden başlar (farklı ajan olabilir). Adım **failed** olursa zincir durur ve bildirim düşer.
- **Devir mekanizması:** Bir adımın prompt'unda `{prev_output}` yazarsan, önceki adımın arşivlenmiş çıktı dosyasının yolu oraya yerleştirilir. Sonraki ajan o dosyayı okuyarak işe başlar — ajandan ajana gerçek bilgi devri.
- Zincir adımları Tasks görünümünde `Akış adı 1/3: ...` biçiminde numaralı görünür.
- Adımlar için **headless** önerilir (çıktı arşivlenir ve devredilir); interactive adım terminali kapanınca zincir devam eder.

Örnek: "Sabah rutini" = 1. psikolog (headless): "dünkü günlüğü analiz et" → 2. asistan (headless): "şu analizi kullanarak gün planı çıkar: {prev_output}".

### Koşullu Dallanma

0.5.0 ile zincirler düz çizgi olmaktan çıktı — her adım için iki dallanma aracı var (wizard kurulumda sorar):

- **Koşullu çalıştırma (runIf):** Adıma bir regex verirsen, adım yalnızca **önceki adımın çıktısı** bu desenle eşleşiyorsa çalışır; eşleşmezse atlanır ve zincir sonraki adımdan devam eder (çıktı devri bozulmaz). Örnek: psikolog analizi "ALARM" içeriyorsa asistan acil plan yapsın, içermiyorsa o adım atlansın.
- **Hata yönlendirmesi (onFail):** Adım başarısız olursa ne olacağını seçersin: **Stop** (varsayılan — zincir durur), **Continue** (sonraki adıma geç) veya **Jump to step N** (belirli adıma sıçra — örn. temizlik/telafi adımı).

Güvenlik: `onFail` sıçramalarıyla oluşabilecek sonsuz döngülere karşı her çalıştırma **25 adım yürütmeyle** sınırlıdır; sınıra gelen zincir uyarıyla durur.

Örnek akıllı zincir: 1. psikolog: "günlüğü tara" → 2. asistan (runIf: `ALARM`): "acil müdahale planı: {prev_output}" → 3. genel (her zaman): "günü arşivle" (onFail: Continue).

### Doğrulayıcı Adımlar (Verify)

Gece koşan işe güvenin anahtarı (0.8.0): headless bir adıma **doğrulama ölçütü** verirsen, adım bitince ucuz bir "hakem" çağrısı (haiku — `judgeArgs` ayarı) çıktıyı ölçüte göre PASS/FAIL değerlendirir:

- **PASS** → zincir normal ilerler; karar, çıktı arşivinin sonuna yazılır (`Verify (attempt 1): PASS — …`).
- **FAIL** → adım, hakemin gerekçesi prompt'a eklenerek **yeniden denenir** (`retries`, varsayılan 1). Denemeler tükenirse adım failed sayılır ve onFail yoluna düşer.

Görev satırında `verify pass/fail` rozeti görünür. Hakem çağrıları da ajanın oturum kayıtlarına düştüğü için maliyetleri karneye otomatik yansır.

### Yapılandırılmış Devir (JSON)

`{prev_output}` (dosya yolu) ve `{prev_text}` (çıktı metni) yanında artık **alan bazlı devir** var (0.8.0):

1. Adımın **output contract**'ını JSON yap → adım `--output-format json` ile koşar.
2. Modelden JSON isteyen bir prompt yaz (çite sarsa da, düz yazının içine gömse de ayrıştırıcı toleranslıdır).
3. Sonraki adımda `{prev_json.alan}` (iç içe: `{prev_json.a.b}`) gerçek değerle değiştirilir.
4. Koşullarda `json:alan~regex` sözdizimi: `runIf: json:durum~ALARM` — metin tesadüflerine takılmadan alan üstünden dallanır.

### Paralel Adımlar (Fan-out / Fan-in)

Bağımsız işleri aynı anda koştur, sonra sonuçları birleştir (2.20.0). Bir adımı **parallel** işaretlersin (sihirbazda "Parallel" seçeneği ya da Edit Step → Parallel); **ardışık parallel adımlar bir grup** oluşturur.

- **Fan-out:** zincir gruba gelince grubun TÜM adımları aynı anda, aynı besleme (handoff) ile başlar. (Gerçek eşzamanlılık `maxConcurrentTasks`/`maxConcurrentPerAgent` ayarlarının izin verdiği kadar; aksi halde sırayla ama yine grup olarak biterler.)
- **Fan-in:** grubun tüm dalları bitince çıktıları **tek beslemede birleşir** ve gruptan sonraki adıma geçer. `{prev_text}` = her dalın çıktısı başlığıyla etiketli; `{prev_json.branches}` = `[{step, text, json}]` dizisi. (Birleşik beslemenin tek dosyası yoktur — `{prev_output}` fan-in'de boştur.)
- **Dal koşulu:** her dalın kendi `runIf`'i olabilir; tutmayan dal sessizce atlanır (grubu düşürmez).
- **Grup hatası:** bir dal bile başarısızsa grubun **ilk adımının onFail**'i uygulanır (stop/continue/jump).
- Grup üyeleri Tasks ağacında ∥ (mor git-merge ikonu) ile işaretlenir.
- **Uyarı:** koşan bir grup VS Code kapanırsa (in-flight run durumu bellekte tutulur) fan-in tamamlanmaz — bu mevcut workflow-run davranışıyla aynıdır. Onay/webhook/media/browser adımları da bir grupta yer alabilir; tek istisna, insan-onay adımı grup içinde beslemeyi geçirmez (kendi APPROVED notunu katar).

### Onay Adımı (İnsan Kapısı)

Zincire bir **Approval gate** koyarsın (2.19.0): o adıma gelince zincir DURUR ve senin onayını bekler — ajan yok, model çağrısı yok. New Workflow sihirbazında **$(check) Approval gate** seçeneği; isteğe bağlı bir mesaj sorar (`{prev_text}`/`{prev_json.x}` çözülür).

- Onay isteği hem bildirim olarak hem de **Needs You** panelinde çıkar (aynı istek, ilk cevap kazanır) — Approve/Reject.
- **Approve:** bir önceki adımın çıktısı (handoff) olduğu gibi sonraki adıma geçer — onay notu araya girmez.
- **Reject:** adımın **onFail** politikası uygulanır (varsayılan: zinciri durdur; Edit Step ile continue/jump yapabilirsin).
- Onay adımı Tasks ağacında görünür bir satırdır (`approval`), çıktı arşivine APPROVED/REJECTED damgası düşer.
- **Uyarı:** onay kapısı yalnızca VS Code açıkken çalışır; headless serviste (sen yokken) kapı otomatik onaylanır ki zincir asılı kalmasın.

### Görsel Seçim Adımı (Dalga B)

Üretimin kalbi: **8 aday görselden 2'sini seç, yalnız onlarla devam et.** Zincire **$(checklist) Select assets (visual pick)** adımı koyarsın (2.24.0): o adıma gelince, run'ın o ana kadar ürettiği tüm varlıklar bir **galeri-picker** panelinde açılır; kaç tane tutacağını seçersin (min veya min-max).

- Sihirbaz sorar: başlık, picker mesajı (`{prev_text}`/`{prev_json.x}` çözülür), kaç tane tutulacak (`2` ya da `1-3` ya da boş = en az 1).
- Panelde adaylara tıklayıp seçersin; min sağlanana kadar **Use selected** pasiftir, max'a ulaşınca fazlası engellenir.
- **Seçilenlerin URL'leri handoff olur:** sonraki adım `{prev_json.selected.0}` (tek URL) veya `{prev_text}` (satır satır tüm seçilen URL'ler) ile yalnız seçilenlerle çalışır. Kritik incelik: yerel dosya yolu değil, modelin ürettiği **uzak URL** akar — böylece bir sonraki fal.ai adımı (görsel→video) doğrudan tüketir.
- Seçilmeyenler galeride `✗ dropped`, seçilenler `✓ kept` rozetiyle işaretlenir.
- **Cancel:** adımın **onFail** politikası uygulanır. Tasks ağacında görünür `select` satırı; headless'ta (UI yoksa) hepsi tutulur ki zincir asılı kalmasın.

Tipik zincir: *ajan prompt yazar → media (4 aday üret) → **görsel seçim (2 tut)** → media (görsel→video, `{prev_json.selected.0}`)*.

### Workflow Düzenleme

Kurulu bir zinciri silip yeniden kurmana gerek yok (0.7.0):

- **Workflow üzerinde:** ▶ çalıştır, **+** adım ekle, çöp kutusu sil; sağ tık → **Rename Workflow**.
- **Adım üzerinde:** kalem ikonu → **Edit Step…** hangi alanı değiştireceğini sorar (başlık / prompt / ajan / mod / on-fail / run-if); ↑↓ ile sırala; sağ tık → adımı sil.
- Değişiklikler kalıcıdır ve bir sonraki çalıştırmada geçerli olur; süren bir koşuyu etkilemez.

### Zincirlerin Görselleştirilmesi

Live Timeline'da artık **Workflow runs** bölümü var: son 4 saatte koşan her zincir kendi şeridinde, adımlar numaralı bloklar halinde — yeşil = bitti, mavi = çalışıyor, kırmızı = başarısız. Bloğun üzerine gel: adım adı, ajan ve süre. İki ajanın birbirine iş devrettiğini kelimenin tam anlamıyla izlersin.

## Missions {#missions}

İş akışları önceden çizilir: her adım, dal ve sıçrama koşu başlamadan sabittir. **Mission** (2.62.0) bunun tersidir — bir **hedef**, bir **lead ajan** ve bir **ekip** verirsin; sıradaki adımın ne olacağına **çalışma anında**, tur tur, önceki sonuçlara bakılarak karar verilir. "Orkestratör analiz eder, coder yazar, reviewer inceler, tester testleri koşar, lead hepsini birleştirir" — bunu önce DAG olarak çizmeden. Başarısız bir delegasyon misyonu öldürmez; lead'in üzerine yeniden plan kurduğu bilgidir.

**Nasıl çalışır.** `Agent Farm: Missions` (her sayfanın üst araç çubuğundaki **Missions** düğmesi ya da sol paneldeki **Missions** bölümü — 2.63.0) → **+ New Mission**. Eklenti sonra bir planlayıcı döngüsü sürer:

1. **Lead ajan** headless çağrılır; brifing: hedef, ekip listesi (adlar + senin rol etiketlerin + her ajanın kendi CLAUDE.md'sinden bir kimlik satırı), kalan bütçe ve katı bir JSON karar şeması.
2. Lead her turda tek kararla yanıt verir: **delegate** (ekip ajanlarına işler; her biri kendi kendine yeten prompt + başarı ölçütüyle), **ask_user** (sana bir soru) ya da **finish/abort** (hüküm + özet).
3. Delegasyonlar **sıradan headless görev** olarak koşar — Tasks görünümünde görünür, çıktıları arşivlenir, maliyetleri ölçülür, kota/eşzamanlılık frenleri uygulanır. Hiçbir şey yeniden icat edilmez.
4. Sonuçlar (durum, maliyet, her çıktının özü, tam arşivin yolu) **aynı planlayıcı oturumuna** geri beslenir (`claude -p --resume`) — lead bağlamını ve prompt cache'ini turlar boyunca korur. Resume ölürse eklenti tarafındaki kompakt defter taze oturumu yeniden tohumlar.
5. Lead bitirene — ya da bir limit bitirtene — kadar tekrar.

**Katı limitler — asla modelin insafına değil.** Her misyonun bütçesi vardır: azami maliyet, tur, görev, dakika (seni beklerken geçen süre sayılmaz) ve paralel delegasyon. Biri tükenince planlayıcıya **yalnız-bitir turu** verilir: delegate reddedilir, dürüst bir hükümle (`success / partial / failed`) kapanmak zorundadır. Aynı işi aynı ajana ikinci kez göndermek engellenir (planlama-döngüsü kilidi); mutlak bir planlayıcı-çağrı tavanı her şeyi yedekler.

**Onay modları.** Varsayılan **each round**: turun delegasyonları **Needs You**'ya (ve bir toast'a) Approve/Reject ile düşer — ret, lead'e geri beslenir ve yeniden planlar. **auto** kapısız koşar; katı limitler yine geçerlidir. `ask_user` soruları da Needs You'ya (Answer…) ve panele düşer; sen yanıtlayana kadar duvar saati durur.

**Workdir emniyeti.** Misyona bir workdir ver — her delegasyon onun içinde koşar ve **iki yazıcı asla paralel koşmaz**: planlayıcının `readonly` işaretlediği adımlar (araştırma, inceleme) aynı dalgayı paylaşabilir, yazıcılar sıraya alınır.

**Planlayıcı planlar — işi yapmaz (2.64.0).** Lead'in planlama çağrısı bir *karardır*, çalışma oturumu değil; ve bu güvene değil mekaniğe bağlanmıştır: planlayıcı çağrılarında yazma araçları (Edit/Write/Bash/…) kapalıdır, keşfe dalıp kaybolan lead'i sert bir tur tavanı durdurur (tur düşmeden önce aynı oturumda bir kez "ŞİMDİ karar ver" dürtmesi denenir) ve zaman aşımına uğrayan çağrı gerçekten öldürülür — süreç ağacıyla birlikte — arka planda faturaya devam etmez. Brifing aynı şeyi sözle de söyler: *eforu hedefe göre ölçekle; küçük hedef = tek kısa tur.* Derin araştırma gerekiyorsa `readonly` delegasyon olur — orada izlenir ve bütçelenir.

**Kim hangi modelle koşar (2.64.0).** Üç katman, en özel olan kazanır: **Planner model** alanı lead'in planlama çağrılarını sabitler; her ekip üyesinin **model** alanı o üyenin delegasyonlarını sabitler; boş bırakılan her şey önce genel **model-policy kurallarına** (Farm Settings), en son ajanın kendi varsayılanına düşer. "Akıllı model planlasın, ucuz modeller çalışsın" tek formluk iş — seçilen modeller koşunun ekip çiplerinde ve her görevin çıktı başlığında görünür.

**Nefes aldığını görürsün.** Koşu aktifken sayfada canlı bir **now şeridi** vardır — *lead is planning round 2 · 1m 40s*, *round 2: running coder + reviewer (wave 1/2)* — motorun zaten yazdığı durum olaylarından beslenir (koşuya sıfır ek yük). Sol paneldeki koşu satırı da aynı satırı taşır.

**Mission control — her şey tek yerden (2.67.0).** Koşu sayfası, misyon uçuştayken tam bir gözlem odasıdır; tamamı eklentinin zaten elinde olan veriden kurulur (hook olayları, görev çıktıları, oturum index'i — yeni poller yok):

- **Live activity** (açılır-kapanır, now şeridinin altında): başlıkta katılımcı-başına durum çipleri — *lead (lead): working · coder: tool (Edit) · reviewer: quiet* — altında misyona-özel hook olay akışı (prompt'lar, araç başlangıç/bitişleri, **izin beklemeleri vurgulu**), en yenisi üstte, sadece bu koşunun ajanları ve bu koşunun başlangıcından itibaren. Transkripti olan her satır **tek tıkla oturum görüntüleyicide tam o âna** gider. Açık sayfa saniyede en fazla bir kez tazelenir; boşta duran çiftlik hiçbir bedel ödemez.
- **Adım akordeonu — kime ne dendi, ne cevap verdi:** herhangi bir delegasyon satırına tıkla: lead'in gönderdiği **tam prompt** (başarı ölçütleriyle) ve çıktı kutusu — adım koşarken **canlı tail** (3 sn'de bir tazelenir, host dosyanın sadece son KB'lerini okur), bitince son çıktının kuyruğu olur; yanında tam-dosya bağlantısı. Aynı anda tek adım açılır — tail sorgusu sınırlı kalır. Koşan adımın satırında ajanının canlı çipi de görünür (*tool (Bash)*).
- **Planner transcript** bağlantısı koşu başlığında: lead'in tüm konuşması — brifingler, düşünceler, kararlar, tur sonuçları — oturum görüntüleyicide açılır.
- **Ledger** (açılır-kapanır, turların altında): planlayıcının tur-başına-tek-satır sıkıştırılmış tarihi — resume edilen planlayıcıya yeniden verilen brifingin ta kendisi.
- **Zengin bütçe satırı:** maliyet, tur, **görev ve dakika** harcanan/limit tek bakışta.

**Panelin geri kalanıyla tek tasarım dili (2.68.0).** Missions sayfası artık kendi tarzını değil, eklentinin yerleşik dilini konuşur: **koşu listesi akordeondur** — tıklanana kadar sade satırlar (**Tokens** kolonuyla), tıklayınca tam detay satırın altında açılır; listenin üstünde viewer'ın chip kontrolleri (**Expand all / Collapse all / Single-open**); hiçbir şey kendiliğinden açılmaz. Her **tur, oturum görüntüleyicinin turn bandı olarak** çizilir — caret, renkli bant, kalın `R2`, aksiyon etiketi, bant başlığında planlayıcının düşüncesi ve sağa yaslı `token · maliyet · saat` istatistikleri (katlanmış bant `N delegation(s)` özeti gösterir); tıkla → katla/aç. **Token, maliyetin aktığı her yere akar:** planlayıcı zarfının usage'ı tura, delegenin oturum token'ları aynı maliyet-eşleme mekanizmasıyla adıma, koşu toplamları liste satırına ve bütçe satırına düşer. Durum rozetleri (`done`, `failed`, `running`, beklemeler) **outline stile** geçti — sayfa arkaplanı üstünde renkli çerçeve + renkli metin — açık ve koyu temada aynı okunurluk. Ve publisher/eklenti-kimliği değişimi eski kayıtları artık ortada bırakmaz: önceki globalStorage kimliği altındaki görev/misyon çıktı yolları **açılışta bir kez taşınır**.

**Dürüst geri bildirimli Pause.** Pause hiçbir zaman aktiviteyi ortasından kesmez — süren planlayıcı çağrısı ya da dalga önce biter. 2.64.0'dan beri isteğin kendisi görünürdür: düğme basılı **Pausing… (undo)** hâline geçer, bir bekleme şeridi ne olacağını anlatır; tekrar tıklamak isteği geri çeker. Park edildikten sonra **Resume**, toplanan sonuçları lead'in kendi oturumuna geri besler.

**Kesintiler ve hatalar.** Pencere yeniden yüklenirse koşan misyonlar *paused* olarak park edilir; Needs You **Resume** sunar — delegasyon durumları görev kayıtlarından yeniden toplanır ve lead kendi oturumunda devam eder. İptal her an mümkündür; iptal, koşan delegasyonları da iptal eder. **Başarısız** biten koşu asla sessizce düşmez: neden (zaman aşımı, geçersiz planlayıcı cevabı, bütçe durdurması…) kapanış bildiriminde, koşu sayfasındaki kırmızı bantta ve sol paneldeki tooltip'te yazar.

**İyi bir lead'i ne yapar:** CLAUDE.md'si işi kendisi yapmak yerine planlayıp delege ettiğini söyleyen bir ajan — ör. *"Çok-ajanlı misyonları yönetirsin: hedefi parçala, kendi kendine yeten prompt'lar ve kabul ölçütleriyle delege et, sonuçları şüpheyle değerlendir, bütçeyi yakmaktansa kısmi sonuçla bitirmeyi tercih et."* Ekip üyelerinin yanına yazdığın rol etiketleri ("coder", "reviewer", "tester", "researcher", "git") lead'e ipucu olarak ulaşır.

Panel her koşuyu tur tur gösterir — lead'in gerekçesi, delegasyon tablosu (durum / maliyet / çıktı bağlantıları), soru-cevaplar, bütçe barı ve nihai hüküm. Kapanış özeti bildirim ve `mission` webhook olayı olarak da dışarı gider.

**Sol paneldeki Missions bölümü (2.63.0)** aynı takibin ağaç hâlidir — Tasks ile Recent Sessions arasında. Her koşu durum/hüküm ikonu, tur sayısı (`R3/8`), harcanan dolar ve yaşıyla listelenir; genişletince turlar ve her turun delegasyonları (durum, maliyet — tıkla → arşivlenmiş çıktı) görünür. Onay bekleyen tur ve lead'in sorusu **eyleme dönük satırlar** olarak en üste düşer: Approve/Reject ve Answer doğrudan satırdan. Satır eylemleri: Pause / Resume / Cancel, **Run again** (aynı hedef-ekip-limitlerle yeni koşu, onaylı) ve **Delete run**. Koşuya tıklamak tam Missions sayfasını açar.

## MCP Yönetimi

Ajanlarının dış dünyaya açılan araç kapıları — MCP sunucuları — artık panelde görünür (0.9.0). Agents ağacında her ajanın **MCP** bölümü:

- Sunucular, Claude Code'un okuduğu aynı dosyalardan okunur (`.mcp.json`, `.claude/settings*.json`); ad, taşıma tipi (stdio/http/sse) ve tanım kaynağı görünür.
- **Bir bakışta durum (2.13.0):** bölüm başlığı `N server(s) • M used (30d) • K disabled` özetini gösterir. Sunucu satırında son kullanım zamanı (`last 3h`) yazar; tooltip'te **en çok çağrılan araçların dökümü** (`vault_read ×394, search_query ×88…`) — hangi MCP aracının gerçekten iş gördüğü tek bakışta belli olur.
- **Gerçek kullanım:** her sunucunun son 30 gündeki gerçek araç çağrısı sayısı satırda yazar (oturum kayıtlarından `mcp__sunucu__araç` sayımı). Yeşil fiş = kullanılıyor.
- **Ekle/Kaldır:** bölümde **+** → sihirbaz ajanın `.mcp.json`'ına yazar; sunucuda çöp ikonu → kaynağından siler (bir kerelik `.afbak` yedeğiyle).
- **Yönetim (2.13.0, sağ tık):**
  - **Edit MCP Server…** — komutu/URL'yi yerinde düzenler (yedekli).
  - **Disable / Enable MCP Server** — sunucuyu ajanın `.claude/settings.local.json` içindeki `disabledMcpjsonServers` listesine ekler/çıkarır (Claude Code'un onurlandırdığı aynı anahtar). Silmeden geçici kapatmak için; kapalı sunucu ağaçta ⊘ ile gri görünür.
  - **Copy MCP Server to Agent…** — tanımı başka bir ajanın `.mcp.json`'ına kopyalar (filo genelinde tek tanımı yayma).
- Değişiklik, ajanın yeni oturumunda geçerli olur.
- **Insights denetimi:** 30 gündür hiç kullanılmayan tanımlı sunucu bilgi bulgusu üretir — her sunucu oturum açılışına yük ekler, ölü olanı temizle.

## Skill Yönetimi

Ajanların öğretilmiş yetenekleri — Agent Skills (SKILL.md klasörleri) — panelde görünür (2.12.0). Agents ağacında her ajanın **Skills** bölümü:

- Skill'ler, Claude Code'un okuduğu aynı klasörlerden okunur: ajan klasöründeki `.claude/skills/` (**agent** kapsamı) + `~/.claude/skills/` (**user** kapsamı — bütün ajanlar paylaşır). Aynı ada sahip skill'de agent kapsamı user kapsamını gölgeler. Satırda ad, kapsam ve SKILL.md frontmatter'ındaki açıklama (tooltip) görünür; tıklamak SKILL.md'yi açar.
- **Bir bakışta durum (2.13.0):** bölüm başlığı `N skill(s) • M used (30d)` özetini gösterir; skill satırında son kullanım zamanı (`last 2d`) yazar.
- **Gerçek kullanım:** son 30 gündeki çağrı sayısı satırda yazar — hem modelin `Skill` aracıyla yaptığı çağrılar hem senin yazdığın `/skill-adi` komutları oturum kayıtlarından sayılır. Yeşil kıvılcım = kullanılıyor.
- **Ekle/Kaldır:** bölümde **+** → ad + tek satır açıklama sorulur, ajanın `.claude/skills/<ad>/SKILL.md` iskeleti oluşturulup açılır (talimatları sen yazarsın); skill satırında çöp ikonu → klasörü siler (bir kerelik yedek `.claude/skills.afbak/` altına alınır). User kapsamındaki bir skill silinirken bütün ajanların kaybedeceği modalda açıkça söylenir.
- **Yönetim (2.13.0, sağ tık):**
  - **Copy Skill to Agent…** — skill klasörünü (içindeki yardımcı dosyalarla) başka bir ajana kopyalar.
  - **Move Skill Between Agent/User Scope…** — agent kapsamındaki bir skill'i `~/.claude/skills`'e taşır (tüm ajanlarla paylaş) ya da user kapsamındakini bu ajanın klasörüne indirir (özelleştir). Onaylı, tek hareket.
  - **Reveal Skill Folder** — SKILL.md klasörünü sistem dosya yöneticisinde açar.
- Değişiklik, ajanın yeni oturumunda geçerli olur.
- **Insights denetimi (2.13.0):** açıklamasız SKILL.md için uyarı (claude açıklamaya bakarak skill'i yükler — açıklama yoksa nadiren ateşlenir) + 30 gündür kullanılmayan agent-kapsamı skill için bilgi bulgusu.
- Not: eklenti kurulumuyla gelen plugin skill'leri bu klasörlerin dışında yaşar ve listede görünmez — panel, senin yönettiğin dosya tabanlı skill'lere odaklanır.

## Yetenek Matrisi

**Agent Farm: Open Capability Matrix** (Agents ağacının başlığındaki tablo ikonu) — filonun bütün skill ve MCP yeteneklerini tek ızgarada gösterir (2.13.0). Amaç: hangi ajanda hangi yetenek var, hangisi gerçekten kullanılıyor, hangisi ölü ağırlık — hepsi bir bakışta.

- **İki matris:** *Skills × Ajanlar* ve *MCP sunucuları × Ajanlar*. Satır = yetenek, sütun = ajan.
- **Hücreler:** yeşil dolu rozet + sayı = son 30 günde kullanılmış (renk yoğunluğu = çağrı sıklığı); soluk ✓ = kurulu ama kullanılmamış; ⏻ = o ajanda kapalı; **＋** = kurulu değil — tıklayınca yeteneği başka bir ajandan **o ajana kopyalar** (onaylı).
- **Özet çipleri:** her matriste toplam / kullanılan (30g) / kullanılmayan sayısı. Hiçbir ajanın 30 günde kullanmadığı satır sarı ● ile işaretlenir — filo genelinde temizlenebilecek yetenekler.
- Satır adına ya da dolu bir hücreye tıklamak ilgili SKILL.md / config dosyasını açar. Herhangi bir kopyalama/düzenleme sonrası matris kendini tazeler.
- **Memory files matrisi (2.16.0):** aynı adlı hafıza dosyalarının hangi ajanlarda olduğu, hücrede 30 günlük recall sayısı; **turuncu halkalı hücre = kopya en yenisinden SAPMIŞ** (içerik farklı — birinde güncellenmiş, diğeri eski). ＋ ile dosyayı o ajana kopyala (hedef MEMORY.md'ye indeks satırıyla). Çok-ajanlı satırlar üstte — senkron/diverjans asıl orada önemli.
- **Duties matrisi (2.16.0):** nöbet başlıkları × ajanlar; hücrede kadans kısaltması (`turn/start/daily/weekly/manual`), ⏸ = duraklatılmış; tooltip watch/do gösterir; ＋ ile nöbeti o ajana kopyala (hedefte CLAUDE.md DUTIES.md referansı yoksa onayla eklenir).
- **Tasks matrisi (2.17.0):** görev aileleri × ajanlar — son 30 günün en yoğun 30 ailesi ([Görev Sağlığı](#gorev-sagligi)). Hücrede tamamlanmış koşu sayısı: yeşil = hepsi başarılı, kırmızı = hepsi başarısız, turuncu halka = karışık (`2✓/1✗`); satır etiketi kaynağını söyler (`man/sch/trg/wf`), son koşuları hep başarısız aile kırmızı ● alır. Hücreye/satıra tıklamak tam görev tarihçesini açar.

## Sır Kasası

API anahtarları ayar dosyalarında düz metin gezmesin (0.9.0): **Set Secret…** komutu değeri **işletim sistemi anahtarlığına** (VS Code SecretStorage) koyar. Kasadaki sırlar iki yoldan işe karışır:

1. **Ortam değişkeni olarak:** her görev/workflow sürecine otomatik enjekte edilir (`FAL_KEY` diye kaydettiysen süreç `FAL_KEY` env'ini görür).
2. **Şablon değişkeni olarak:** webhook adımlarının URL/gövdesinde ve bildirim URL'sinde `{secret:FAL_KEY}` yazımı çağrı anında gerçek değerle değiştirilir — değer hiçbir dosyaya yazılmaz.

`List Secrets` yalnızca adları gösterir; değerler asla görüntülenmez. Sağlık motoru, ayar dosyalarında anahtara benzeyen düz metin görürse (`sk-…` vb.) kasaya taşıman için uyarır.

### API Anahtarı Nasıl Eklenir (adım adım)

Örnek: fal.ai anahtarını bağlamak —

1. [fal.ai](https://fal.ai) hesabında **Keys** bölümünden anahtarını kopyala (biçimi `xxxx:yyyy` şeklindedir).
2. VS Code'da `Ctrl+Shift+P` → **Agent Farm: Set Secret…**
3. Ad sorusuna **`FAL_KEY`** yaz (medya adımları varsayılan olarak bu adı arar; farklı ad istersen `agentFarm.mediaAuthSecret` ayarını değiştir).
4. Değer sorusuna anahtarı yapıştır (yazdıkça gizlenir) → Enter. Bitti — anahtar işletim sistemi anahtarlığında.
5. Kontrol: **List Secrets** komutu adı listeler (değeri asla göstermez). Medya adımı çalıştığında anahtar otomatik kullanılır.

Aynı yöntem her servis için geçerlidir: `ELEVENLABS_KEY`, `N8N_TOKEN`… — ad ne olursa görevlere env değişkeni olarak girer ve `{secret:AD}` şablonuyla erişilir. **Üç altın kural:** anahtarı asla bir dosyaya/prompt'a yazma; sohbete/ekrana yapıştırdıysan servis panelinden yenile (rotate); kullanmadığını **Delete Secret…** ile sil.

## Medya Üretim Hattı

1.0 ile eklenti kategori değiştirdi: metin ajanların ve **medya modelleri** (görsel/video/ses) aynı zincirde çalışır — İçerik Fabrikası.

### Medya Adımı (🎬)

Workflow kurarken **Media step** seç: adım bir üretim modeli çağırır. Model kimliği serbest metindir ve **hangi sağlayıcıya gideceğini kimliğin öneki belirler** (2.26.0 — MediaProvider soyutlaması):

- **fal.ai (varsayılan):** önek yoksa fal.ai kuyruk API'sine gider — `fal-ai/flux/schnell` gibi. Tek kapı stratejisiyle Kling, Seedance, Veo, Flux, Nano Banana sınıfı yüzlerce modele erişirsin. Anahtar: **FAL_KEY**. Mevcut tüm workflow'lar değişmeden çalışır (önek eklenmedi).
- **Replicate:** `replicate:` önekiyle Replicate prediction API'sine gider — `replicate:black-forest-labs/flux-schnell` (en yeni) ya da `replicate:owner/name:<version>` (sabit sürüm). Anahtar: **REPLICATE_API_TOKEN** (secret olarak sakla; ayar `agentFarm.replicateAuthSecret`).

Sağlayıcı farkı adım için şeffaftır: indirme, asset arşivi, galeri, maliyet, seçim ve vision QA hepsi aynı çalışır. Yeni sağlayıcılar tek arayüzle (`submit/poll/assets`) eklenir; fal davranışı birebir korunur.

- **Girdi şablonu** JSON'dur ve `{prev_text}` / `{prev_json.alan}` çözülür: ajanın yazdığı prompt doğruca modele akar.
- Üretilen **varlıklar (asset) indirilir ve arşivlenir**; yanıt JSON'u sonraki adımın devri olur (`{prev_json.images.0.url}` gibi).
- Uzun video işleri dakikalarca sürebilir — adım `running` kalır, kuyruk durumu düzenli yoklanır (adım başına zaman aşımı ayarlanabilir).
- Ön koşul: **FAL_KEY** sırrı (yukarıdaki adımlar). Anahtar yoksa adım koşmaz ve net bir mesajla failed olur; kredi bittiyse fal'ın hatası arşive düşer.
- **Görsel kalite denetimi (vision QA — 2.25.0):** media adımına isteğe bağlı bir kalite ölçütü verirsin (sihirbaz sorar). Üretim biter bitmez **vision yetenekli bir model** (ucuz yargıç, varsayılan haiku) üretilen dosyayı **Read aracıyla açıp** inceler ve ölçüte göre PASS/FAIL + gerekçe döner. FAIL ise adım, gerekçeyi input'un `prompt` alanına ekleyip **kendini yeniden üretir** (ayarlanan deneme sayısına kadar); son denemede de geçemezse onFail uygulanır. Metin `verify` ölçütünün görsel karşılığıdır — "tek kişi, net yüz, altı parmak yok, tarife uygun" gibi. Yargıç çalışamazsa (model/izin) hattı bloke etmez, geçirir.

### Medya Galerisi

`Agent Farm: Open Media Gallery` (Tasks başlığındaki kamera ikonu): üretilmiş tüm görsel/video/sesler — önizleme, model, girdi, tahmini maliyet, hangi zincirden geldiği. **Re-run** aynı parametrelerle yeniden üretir; **Vary…** girdiyi düzenletip üretir; **Feedback… (2.40.0)** "neyi beğenmedin?" diye sorar ve eleştirini prompt'a enjekte edip yeniden üretir (vision-QA retry'ının elle hali). **Scene…** varlığı bir prodüksiyon sahnesine bağlar/çözer. Tıkla → dosya açılır.

### Prodüksiyon Sahneleri (Dalga A)

Sahne-sahne ilerleyen üretimler (storyboard → görsel → video → kurgu) için **prodüksiyon manifesti**: ajanın klasöründe `production.json` — proje başlığı + sahneler (her sahnenin durumu: `draft / generating / review / approved`). Elle düzenlenebilir; `Agent Farm: New Production` sihirbazıyla da kurulur (başlık + virgüllü sahne listesi).

- Galeride üstteki **prodüksiyon / sahne / kaynak** filtreleriyle varlıkları süzersin.
- Seçili prodüksiyonun **sahne durum panosu**: satır = sahne, sütun = varlık türü (görsel/video/ses/diğer); hücreye tıkla → o sahneyi süz, durum rozetine tıkla → durumu değiştir (`production.json`'a yazılır).
- Media adımı sihirbazında (manifest varsa) üretilen varlıklar bir sahneye bağlanabilir; galeriden **Scene…** ile sonradan da atanır.

### Harici Varlık Alımı (Ingest — Dalga A)

fal.ai dışı üretimler (Higgsfield/Flow'dan elle indirilen klip, Premiere export'u, ComfyUI çıktısı) da sisteme girer:

- **İzlenen klasörler** (`agentFarm.ingestFolders`): her 30 sn'de bir taranır; yeni görsel/video/ses dosyaları galeriye **yerinde** kaydedilir (kopya yok — video büyük). İndirme sürerken dosya büyümesi tamamlanana kadar beklenir; 48 saatten eski dosyalar taranmaz. Klasöre proje/sahne ön-ataması yapılabilir.
- **Elle kayıt:** `Agent Farm: Register Media Asset(s)…` — dosya(lar) seç, istersen sahneye bağla. Harici varlıklar galeride `external:` rozetiyle işaretlenir; Re-run/Vary onlara uygulanmaz (kaynak parametre yok).

### Medya Maliyeti ve Bütçesi

`agentFarm.mediaPricing` kurallarıyla (görsel başına / saniye başına / istek başına USD) her işin tahmini maliyeti hesaplanır, galeriye ve Dashboard'daki **Media cost** kartına işlenir — metin + medya, tüm AI harcaman tek karnede. Varsayılan fiyatlar yer tutucudur: fal.ai fiyat sayfasından doğrula ve ayarla. **Aylık bütçe uyarısı:** `agentFarm.mediaBudgetMonthUSD` (0 = kapalı) — son 30 günün tahmini medya maliyeti eşiği aşınca ayda bir kez uyarır (webhook forward'a da düşer).

### Kurgu Köprüsü — Premiere Sekansı (Dalga D)

Sahneleri tek tek üretip onayladıktan sonra **"klasördeki klipler"i Premiere'de açılır bir sekansa** çevirirsin: `Agent Farm: Export Premiere Sequence` (ya da galeride prodüksiyon seçiliyken **Export sequence →** butonu).

- Prodüksiyon manifestindeki **sahne sırasına** göre, her sahnenin varlığından bir klip dizilir. Seçim yaptıysan **tuttuğun (selected) video** tercih edilir; yoksa video, yoksa görsel; reddedilenler alınmaz; varlığı olmayan sahne atlanır.
- İki dosya yazılır: **FCP7 XML** (`.xml` — Premiere `File → Import` ile açar; bin/klip yapısı sahne sırasını taşır) ve **CMX3600 EDL** (`.edl`). Kare hızı (24/25/30/60) ve sahne başına varsayılan klip süresi sorulur; süreler kurguda incelenir.
- **Adlandırma konvansiyonu:** izlenen (ingest) klasöre bir prodüksiyon bağlıysa, dosya adındaki sahne belirteci (`…_s03_…` ya da `…_S3_…`) otomatik o sahneye bağlanır. Böylece Premiere export'unu `P01_S03_T02.mp4` gibi adlandırıp geri koyduğunda doğru sahneye düşer — döngü kapanır.
- **Export watch:** render/export klasörünü `agentFarm.ingestFolders`'a ekleyip bir watch-trigger'a bağlayarak "export düştü → sonraki adım/görev" otomasyonu kurulabilir (mevcut tetik altyapısı).

### Reçeteler

`Agent Farm: New Recipe Workflow…` hazır fabrika şablonları kurar: **Metin → Görsel**, **Metin → Görsel → Video**, **Ses → Metin (Whisper)**. Kurulan zincirdeki yer tutucuları (KONU, URL) düzenleyip çalıştırırsın — boş sayfa problemi yok.

## Tarayıcı Adımları

API'si olmayan servislerin kapısı: zincire **Browser step** ekle — adımın ajanı, kendi tarayıcı MCP'siyle siteye girer, hedefi yerine getirir ve bulgularını sonraki adıma `{prev_text}` olarak devreder.

**Ön koşul:** ajanda bir tarayıcı MCP sunucusu kurulu olmalı (Agents ağacı → MCP → **Add MCP Server…** → örn. `npx chrome-devtools-mcp@latest` veya Playwright MCP). Agent Farm tarayıcı motoru taşımaz; güvenlik zarfını taşır:

- **Alan adı allowlist'i (pazarlıksız):** adımın `allowHosts` listesi ya da global `agentFarm.browserAllowHosts` URL'yi kapsamıyorsa adım **hiç çalışmadan** failed olur (onFail kuralların işler). Alt alan adları dahildir.
- **Adım başı onay:** `agentFarm.browserApproval` = `ask` (varsayılan) — her koşudan önce URL+hedefle modal onay; `auto` yalnız bilinçli tercihle.
- Ajan prompt'una sert kurallar gömülür: listedışı bağlantı açma, kimlik bilgisi uydurma, MCP yoksa deneme — "BROWSER MCP YOK" raporla.

Kurulum: `New Multi-Agent Workflow…` → **Browser step** → ajan + URL + hedef + izinli alan adları. `Edit Step…` ile URL/hedef/allowlist sonradan değişir; URL ve hedefte `{prev_text}`/`{prev_json.x}` çözülür.

## Webhook Köprüsü

Dış dünya bağlantısının evrensel kapısı (0.9.0): n8n, Make, Zapier — webhook konuşan her şey.

### Dışarı: Webhook Adımı

Workflow kurarken ajan yerine **🌐 Webhook step** seçebilirsin: adım, claude değil bir HTTP çağrısıdır.

- URL ve JSON gövde şablonlarında `{prev_text}`, `{prev_json.alan}`, `{prev_output}` ve `{secret:NAME}` çözülür.
- Yanıt gövdesi arşive yazılır ve **sonraki adımın devri olur** — n8n'in döndürdüğü JSON'dan `{prev_json.alan}` ile okumaya devam edersin. 2xx dışı yanıt adımı failed yapar (onFail kuralların işler).
- Örnek zincir: psikolog analiz → webhook adımı analizi n8n'e POST'lar (n8n Telegram'a iletir) → n8n yanıtı zincirde kullanılır.
- **Auth başlığı (2.27.0):** sihirbaz opsiyonel bir başlık sorar (`Authorization: Bearer {secret:MY_TOKEN}` gibi; `{secret:}` çözülür) — kimlik isteyen API'lere bağlanmak için.
- **Poll modu (2.27.0) — genel kuyruk istemcisi:** sihirbazda "Poll until done?" sorulunca webhook adımı **submit → poll** yapan bir kuyruk istemcisine dönüşür. İlk çağrı işi başlatır; yanıttaki bir JSON yolundan (`urlField`, ör. `urls.get`/`status_url`/`name`) poll URL'si okunur; her poll'da bir durum alanı (`statusField`, ör. `status`) verilen "done"/"fail" regex'lerine göre değerlendirilir; iş bitince final yanıt devir olur. Böylece **provider yazmadan herhangi kuyruklu API** (Gemini gibi uzun-süren operasyon API'leri, self-hosted kuyruklar) zincire girer — auth başlığı poll isteklerine de taşınır, zaman aşımı ve aralık ayarlanır.

### İçeri: /trigger Ucu

**Add Trigger → Webhook** yeni bir gizli URL üretir: `http://127.0.0.1:<port>/trigger/<token>` (panoya kopyalanır; tetik satırından tekrar kopyalanabilir). Bu adrese POST gelen her istek tetiği ateşler; JSON gövde, görev prompt'una `{payload}` olarak girer. n8n tarafında bir HTTP Request node'u yeter: Gmail'e fatura düştü → n8n → Agent Farm "faturayı işle" görevi.

Güvenlik: uç yalnızca 127.0.0.1 dinler + token ister; yanlış token 404 alır; cooldown/saatlik tavan korumaları tetikte geçerlidir. Dış ağdan erişim gerekiyorsa bilinçli olarak kendi tünelini kurarsın (n8n yereldeyse gerekmez).

### Bildirim Yönlendirme (Cebe Düşen Filo)

`agentFarm.notifyWebhookUrl` ayarla → seçtiğin olaylar (izin bekliyor, takıldı, bütçe aşıldı, zincir bitti/başarısız — `notifyWebhookEvents`) o adrese JSON olarak POST'lanır: `{source:"agent-farm", type, message, ts}`. n8n'de webhook→Telegram akışı kurduğunda mutfaktayken telefonuna "psikolog izin bekliyor" düşer. URL'de `{secret:NAME}` kullanılabilir.

## Nöbet Görevleri

Ajanlarla yaptığın **süreklilik anlaşmalarının** sistemi: "şu dosyaya her tur bak, cevap gelmişse gereğini yap", "şu klasörü her gün kontrol et, dosya birikmişse tasnif et" gibi tetikte-kalma görevleri. Bunlar zamanla çoğalıp karışır — hangi klasördü, görev neydi, her tur muydu her gün müydü? Bu sistem hepsini tek yerde toplar.

### Nasıl Çalışır: Tek Kaynak, İki Okuyucu

Görevler, ajanın klasöründe **`DUTIES.md`** dosyasında yaşar. Bu bilinçli bir tasarım kararı:

- **Ajan okur:** CLAUDE.md'deki kısa bir yönergeyle ajan her oturum başında DUTIES.md'yi okur ve kurallarına uyar. Dosyanın başındaki şablon, ajan için kadans kurallarını da içerir ([every-turn] = her tur kontrol et, vb.).
- **Sen ve panel okursunuz:** Agents ağacında her ajanın **Duties** bölümü bu dosyadan beslenir — bir bakışta tüm nöbetler, kadansları ve **bekleyen iş durumu**.
- **Esneklik:** Dosyayı elle de düzenleyebilirsin; panel senin eklediğin satırları korur. Biçim basittir: `## Başlık [kadans]` + `- **Watch:**` + `- **Do:**` satırları.

### Görev Ekleme

Agents ağacında ajanın **Duties** satırına sağ tık → **Add Standing Duty** (ya da ajan detay sayfasındaki **Add duty**):

1. **Başlık** — örn. "Netleştirme istekleri"
2. **Kadans** — `every-turn` (her tur) / `session-start` (oturum başı) / `daily` / `weekly` / `manual`
3. **Watch** — izlenecek hedef: dosya seç, klasör seç, elle yol yaz veya boş bırak (hedefsiz görev de olur: "her tur ruh halimi kontrol et" gibi)
4. **Do** — değişiklik görünce yapılacak iş: "Cevaplanmış soruların gereğini yap ve soruyu dosyadan sil"

İlk görevi eklerken ajanın CLAUDE.md'sinde DUTIES.md referansı yoksa eklenti fark eder ve **onayınla** kısa bir yönerge bölümü ekler — referanssız görev, ajanın hiç bakmayacağı görevdir.

### Bir Bakışta Takip

Panelin asıl gücü burada — Duties bölümü sadece liste değil, **durum göstergesi**:

- İzlenen **klasörde** dosya birikmişse: turuncu göz + `3 waiting` — inbox'ta iş var demek. **Tooltip artık bekleyenleri gösterir (2.14.0):** hangi dosyaların beklediği (ilk 5 ad) ve en eskisinin ne zamandır oturduğu (`oldest 3d ago`) — panele gitmeden "ne birikmiş" görürsün.
- İzlenen **dosya** son 24 saatte değişmişse: turuncu göz + `changed 2h ago` — muhtemelen cevap yazdın, ajan henüz işlemedi.
- İzlenen yol **kayıpsa**: kırmızı uyarı + Insights'ta bulgu — klasör taşınmış, görev kopmuş.
- **Duraklatılmış** görevler soluk görünür ve ajan şablon kuralı gereği onları atlar.

Yönetim: göreve sağ tık → **Edit Duty…** (2.14.0 — başlık/kadans/watch/do/not alanlarını mevcut değerleriyle önceden doldurulmuş sihirbazda değiştir; dosyayı elle açmak gerekmez), **Pause/Resume** (silmeden dondur), **Delete**, **Open DUTIES.md** (elle düzenleme), **Move Up / Move Down** (2.15.0 — DUTIES.md'deki blok sırasını değiştirir; ajan dosyayı yukarıdan aşağı okur, önemli nöbeti üste al). Ajan detay sayfasında da tam tablo var: başlık, kadans, watch, do, durum.

2.15.0 ile gelen üç yönetim derinliği:

- **Add Duty from Template…** (Duties bölümüne sağ tık): kanıtlanmış nöbet kalıpları tek seçimle kurulur — *Soru-cevap döngüsü* (izlenen dosyada cevaplananların gereğini yap), *Inbox tasnifi* (klasörde birikenleri adlandır/taşı), *Haftalık hafıza bakımı*, *Çıktı klasörü nöbeti*. Şablon watch hedefini sorar, sonrasını Edit Duty… ile incelt.
- **Automate Duty (create trigger)…** (göreve sağ tık): nöbet ile otomasyon arasındaki köprü. Manuel nöbet yalnız **ajan çalışırken** işler; bu komut, watch hedefi gerçek bir dosya/klasör olan nöbetten bir **watch tetikleyicisi** üretir — hedef değiştiğinde ajan **boştayken bile** headless bir görev ateşlenir (debounce 10s, cooldown 60s, en çok 6/saat; Tasks görünümünden yönetilir). Nöbet DUTIES.md'de durur; ikisi birbirini tamamlar.
- **Copy Duty to Agent…** (göreve sağ tık): nöbeti başka ajana kopyalar (aynı başlık varsa uyarır); hedef ajanın CLAUDE.md'si DUTIES.md'ye referans vermiyorsa onayla ekletir.

**Ajan gerçekten bakıyor mu? (0.7.0)** Duties başlığında artık bir uyum göstergesi var: `read 2h ago` = ajan DUTIES.md'ye en son o zaman dokundu (oturum kayıtlarından tespit edilir); `never read` = kayıtlı oturumlarda hiç bakmamış. Ajan bu hafta oturum yaptığı hâlde dosyayı hiç okumadıysa Insights'a uyarı düşer — anlaşma kâğıt üzerinde kalmış demektir; CLAUDE.md yönergesini güçlendir.

### Örnekler

```
## Netleştirme istekleri [every-turn]
- **Watch:** `D:\zone\know\note\obsidian\NETLEŞTİRME İSTEKLERİ.md`
- **Do:** Cevaplanmış soru varsa gereğini yap ve soruyu dosyadan sil; aydınlatılması gereken yeni soruların varsa dosyaya ekle.

## Inbox tasnifi [every-turn]
- **Watch:** `D:\zone\know\note\obsidian\01_INBOX\00_FAST_NOTE`
- **Do:** İçerideki her dosyayı inbox girişi say: uygun isim ver, uygun klasöre taşı.

## Haftalık hafıza bakımı [weekly]
- **Do:** memory/ altındaki dosyaları gözden geçir; bayatlamış olanları güncelle veya arşivle.
```

**İpucu:** Görev/Workflow ile farkı karıştırma — nöbet görevi ajanın **oturum içindeyken** kendi kendine yaptığı kontroldür; Tasks kuyruğu ise senin (veya zamanlayıcının) dışarıdan başlattığı işlerdir. "Her tur bak" ancak ajan çalışırken işler; ajan hiç açılmıyorsa daily bir Task ile oturumu tetiklemek gerekir — ikisi birbirini tamamlar.

## Hafıza Yönetimi

Ajanın hafızası (`memory/*.md`) artık yalnız listelenmiyor — **gerçekten kullanılıp kullanılmadığı** ölçülüyor ve panelden yönetiliyor (2.14.0). Agents ağacında **Memory** bölümü:

- **Bir bakışta durum:** bölüm başlığı `N files • ~X tok • M recalled (30d)` — kaç dosya var, toplam ağırlığı ne, kaçı son 30 günde gerçekten hatırlanmış.
- **Recall takibi:** her dosya satırında `recalled ×5 (30d), last 2h` ya da `not recalled (30d)` yazar; hatırlanan dosyanın ikonu yeşildir. "Recall" = ajanın dosyayı bir araçla (Read/Edit/Write) **açıkça** açması — oturum kayıtlarından sayılır. MEMORY.md indeksi her oturumda pasif yüklendiği için bu metrikten muaftır (`index — loads every session` diye işaretli). Skills/MCP'deki "used/unused" mantığının hafıza karşılığı: 30 gündür hiç hatırlanmayan dosya, indekste yer kaplayan ölü ağırlık adayıdır.
- **Orphan işareti:** MEMORY.md'de referansı olmayan dosya satırda `⚠ orphan` gösterir — ajan indeksten bulamayacağı için o hafıza fiilen kayıptır.
- **Tooltip'te kimlik:** dosyanın frontmatter `type`'ı (project/feedback/user/reference) ve `description`'ı tooltip'te görünür.
- **New Memory File…** (bölümde **+**): ad + tür + tek satır açıklama sorar; frontmatter'lı dosyayı kurar ve **MEMORY.md'ye pointer satırını otomatik ekler** — yeni hafıza asla yetim doğmaz.
- **Archive Memory File** (dosya satırında arşiv ikonu): silmek yerine `memory/archive/` klasörüne taşır (tarama kapsamı dışı) ve MEMORY.md'deki satırını düşürür (indeks yedeklenir). "Belki lazım olur" dosyaları context'ten çıkarmanın güvenli yolu.
- **Copy Memory File to Agent…** (2.15.0, sağ tık): dosyayı başka ajana kopyalar ve hedefin MEMORY.md'sine pointer satırını otomatik ekler — kopya yetim doğmaz.
- **Scan Memory Contradictions…** (2.16.0, Memory bölümü sağ tık): ucuz model, ajanın hafıza dosyalarını çapraz okuyup **birbiriyle çelişen ifadeleri** listeler (hangi iki dosya, hangi iki iddia, kısa değerlendirme) — sonuç markdown raporu olarak açılır. Tarih/güncellik farkı çelişki sayılmaz; model çıktısı JSON doğrulamasından ve limit-mesajı korumasından geçer. **Bulgular öneri niteliğindedir: doğrulamadan silme/birleştirme yapma.**
- **Frontmatter denetimi (2.16.0):** description'sız hafıza dosyası Insights'a bilgi bulgusu düşürür — indeks satırı ve anlamsal arama açıklamaya dayanır.
- **Fix Memory Index…** (2.15.0, Memory bölümü/MEMORY.md sağ tık): indeksi tek seferde onarır — yetim dosyalara pointer satırı ekler (açıklama frontmatter'dan), var olmayan dosyalara işaret eden ölü satırları düşürür. Önerilen düzeltmeler tek tek seçilebilir; indeks yedeklenir.

### Hafıza Grafiği (Memory Graph)

**Agent Farm: Open Memory Graph** (Memory bölümüne sağ tık ya da komut paleti) — hafıza kayıtlarını birbirine bağlayan `[[wikilink]]` dokusunu görünür kılar (2.15.0). Kayıt yazma disiplininin ("ilgili kayıtlara [[ad]] ile bağlan") gerçekte işleyip işlemediğini burada görürsün:

- **Graf:** her kayıt bir düğüm (boyut = token ağırlığı, yeşil = son 30 günde hatırlanmış, sarı kesikli halka = MEMORY.md'de yok), her `[[link]]` bir kenar. `[[hedef]]` hem dosya adına hem frontmatter `name:` slug'ına çözülür. Düğüme tıkla → dosya açılır. MEMORY.md indeks olduğu için düğüm değildir.
- **Broken links:** hiçbir dosyaya çözülmeyen `[[hedefler]]` — yazım hatası ya da "yazılması planlanıp unutulmuş" kayıt. (Kullanıcı sözleşmesine göre kırık link hata değil, yazılacak kayıt işaretidir — ama farkında olmak istersin.)
- **Islands:** hiç link vermeyen/almayan kayıtlar — dokuya bağlanmamış bilgi; bağla ya da arşivle.
- **Hubs:** en çok link alan kayıtlar — bilginin merkezleri; bunları şişirme, bakımlı tut.
- **Not in MEMORY.md** kartındaki **Fix Memory Index…** düğmesi onarımı panelden başlatır.
- Ajan seçici üstte; veriler her açılış/Refresh'te dosyalardan taze okunur.

## Hafıza Senkronizasyonu

Sağlık motorunun yakaladığı **kopya hafıza** sorununun çözüm aracı: `Agent Farm: Sync Shared Memory…`

1. Ajanlar arasında aynı isimle bulunan hafıza dosyaları listelenir (✓ birebir aynı, ⚠ sapmış).
2. Dosyayı seç → iki eylemden biri:
   - **Compare two copies:** iki ajanın kopyasını VS Code diff ekranında yan yana karşılaştır — sapma tam olarak nerede, gör.
   - **Sync all copies from one source:** kaynak kopyayı seç (en yenisi işaretli gelir), onayla; diğer tüm kopyaların üzerine yazılır.
3. Üzerine yazılan her dosyanın yanına zaman damgalı `.afbak` yedeği bırakılır — pişmanlık geri alınabilir.

Senkron sonrası Insights kendini yeniler; grup "birebir aynı" durumuna düşer.

### Birleştirme Taslağı (Merge Draft)

Kopyalar sapmışsa ve ikisinde de değerli bilgi varsa "birini seç, diğerini ez" yetmez. Üçüncü seçenek **Create merge draft**:

1. Tüm kopyalar `=== FROM ajan (kaç gün önce) ===` başlıklarıyla tek bir taslak belgede alt alta açılır (en yenisi üstte).
2. Taslağı elinle düzenleyip nihai hâline getirirsin — işaret satırlarını ve istemediğin kısımları sil, iki kopyadaki değerli satırları birleştir.
3. `Agent Farm: Apply Merged Memory` komutunu çalıştır: düzenlediğin içerik (kalan işaret satırları otomatik ayıklanarak) **tüm kopyalara** yazılır; her dosyanın `.afbak` yedeği alınır.

Boş sonuç koruması vardır: taslağı tamamen silersen hiçbir dosyaya yazılmaz.

## Filo Raporu

`Agent Farm: Export Fleet Report (Markdown)` — filonun karşılaştırmalı karnesini Markdown dosyası olarak üretir (7/30/90 gün). Obsidian vault'una kaydetmek için biçilmiş kaftandır.

İçerik: filo toplamları, ajan karşılaştırma tablosu (oturum, maliyet, token, araç, hata oranı, **cache verimliliği**, bağlam yükü, hafıza sayısı), model kullanım tablosu, en pahalı oturumlar, sağlık bulguları.

**Cache verimliliği** = prompt token'larının cache'ten okunan payı. Yüksekse (%90+) aynı bağlam tekrar tekrar ucuza okunuyor demektir; düşükse oturumların kısa ve bağlamın sürekli yeniden yazılıyor olabilir — birleştirilebilecek kısa oturumları düşün.

Aynı karşılaştırma tablosu Dashboard'da da **Agent comparison** bölümünde canlı görünür; satıra tıklayınca ajan detayına gider.

### Otomatik Rapor (Vault'a)

Raporu elle almak yerine otomatiğe bağlayabilirsin — Obsidian vault'una düzenli karne düşer:

1. `agentFarm.autoReportFolder` ayarına hedef klasörü yaz (örn. vault içindeki bir klasör).
2. `agentFarm.autoReport` ayarını `daily` veya `weekly` yap.
3. Eklenti saatte bir kontrol eder; o gün/haftanın raporu yoksa üretir (`AgentFarm-Report-2026-07-08.md` veya `AgentFarm-Report-2026-W28.md`) ve bildirim düşer. Kapsanan dönem `agentFarm.autoReportDays` ile ayarlanır (varsayılan 7 gün).

VS Code açıkken çalışır; gün içinde ilk açılışta o günün raporu üretilir.

0.7.0'dan itibaren dönem içinde arşivlenmiş headless görev çıktısı varsa, **Task outputs** bölümü otomatik rapora eklenir — karne ve iş çıktıları tek belgede. İstemezsen `agentFarm.autoReportIncludeOutputs: false`.

### Görev Çıktı Özeti

`Agent Farm: Export Task Outputs Digest (Markdown)` — arşivlenmiş headless görev çıktılarını tek belgede toplar (bugün / 7 gün / 30 gün). Her görev için ajan, süre, durum ve çıktının kendisi (uzunsa kırpılır); başarısız görevler ⛔ ile işaretlenir. Zamanlanmış işlerin ve workflow'ların gün sonunda "ne üretmiş bunlar?" sorusunun tek bakışta cevabı. Varsayılan kayıt yeri `autoReportFolder` (ayarlıysa) — yani vault'una düşer.

## Sağlık ve Optimizasyon

Agent Farm ajanlarını sekiz kuralla denetler. Amaç: **daha ucuz, daha tutarlı, daha az unutan ajanlar.**

### Insight Yaşam Döngüsü (2.41.0)

Insights artık salt-okunur bir liste değil — her bulgunun bir **kapanış yolu** var. Satırın üzerine gelince (veya sağ tık) üç eylem çıkar:

- **🛠 Fix** — mekanik düzeltmesi zaten var olan kategorilerde tek tık ilgili akışı başlatır: `memory-index` → indeks onarımı, `duplicate-memory` → birleştirme taslağı, `stale-memory`/`large-memory` → distilasyon, `antigravity` → senkron, `secrets` → anahtarı kasaya taşı, `pulse` → nabzı yeniden koş. Yalnız düzeltilebilir kategorilerde görünür.
- **🚀 Delegate to Agent** — bulguyu (ya da görünüm başlığındaki düğmeyle **birden çok bulguyu**) seçilen ajana headless görev olarak havale eder. İş emri otomatik yazılır: bulgular numaralı listelenir, "önce oku, kök nedeni anla, güvenle düzeltebildiğini düzelt, emin olmadığını YAPMA — raporla" kuralları eklidir. Çoklu havalede her bulgu **kendi ajanına** gider (ajanı olmayan filo-geneli bulgular için bir kez ajan seçersin); ajan başına tek görev açılır. Görev bitince çıktı arşivinde ne düzeltildiğinin raporu durur.
- **✕ Dismiss** — "olmuş bir olay" niteliğindeki bulgular (maliyet anomalisi gibi) sonsuza dek listede kalmasın: 1 gün / 7 gün / kalıcı gizle. Gizlenenler dürüstçe sayılır — listenin altında "n dismissed insight(s) hidden" satırı belirir; tıklayınca geri alma seçicisi açılır (görünüm menüsünde **Restore Dismissed Insights…**). Kimlik mesaj metnine değil ajan+kategori+dosyaya bağlıdır: "4.2×" yarın "3.9×" olsa da aynı bulgu gizli kalır.

**Tık davranışı da akıllandı:** `cost-anomaly` / `trend` / `budget` / `error-rate` bulgularına tıklamak artık kılavuz paragrafı değil, **ajanın kendi maliyet görünümünü** (Ajan Detayı) açar — kanıt oradadır.

**Otomatik havale (opsiyonel, varsayılan kapalı):** `agentFarm.insightAutoDelegate` ayarına kategori adları yaz (örn. `["memory-index", "duties"]`) — o kategorilerin warning/error bulguları belirir belirmez kendi ajanına headless görev olarak düşer. Aynı soruna 24 saatte en fazla bir görev açılır (bekleyen uyarı saat başı görev doğurmaz); görevleri yalnız görev-yürütücü pencere kuyruğa alır ve her otomatik havale bildirimle haber verilir. Ajan zamanı/parası harcadığı için bilinçli açılır.

### Sağlık: Bağlam Yükü

`CLAUDE.md` + `memory/MEMORY.md` + `.agents/AGENTS.md` her oturum başında otomatik olarak bağlama yüklenir — buna **sabit bağlam yükü** diyoruz ve her oturumda yeniden ödenir. `agentFarm.contextBudgetTokens` bütçesini (varsayılan 8.000 token) aşan ajanlar uyarı alır.

**Nasıl düzeltilir:** CLAUDE.md'yi kısalt; ayrıntıyı hafıza dosyalarına taşı (onlar sadece gerekince okunur); MEMORY.md indeksini tek satırlık özetlerle sınırla.

### Sağlık: Hafıza İndeksi

`MEMORY.md` indeksi ile diskteki dosyalar karşılaştırılır:

- İndekste geçen ama diskte olmayan dosya → **uyarı** (kırık bağlantı).
- Diskte olan ama indekste geçmeyen dosya → **bilgi** (yetim dosya — ajan onu asla hatırlamayabilir).
- Hafıza dosyaları var ama hiç MEMORY.md yok → **uyarı**.

### Sağlık: Kopya Hafıza

Aynı isimli hafıza dosyası birden çok ajanda varsa:

- İçerikler birebir aynıysa → **bilgi**: tek kaynağa bağlamayı düşün.
- İçerikler farklılaşmışsa → **uyarı**: kopyalar birbirinden saptı, ajanların birbiriyle çelişebilir. En günceli seçip diğerlerini eşitle.

### Sağlık: Bayat Hafıza

`agentFarm.staleMemoryDays` gününden (varsayılan 45) uzun süredir dokunulmamış hafıza dosyaları işaretlenir. Gözden geçir: hâlâ doğruysa dokun ve bırak, değilse güncelle veya arşivle.

### Sağlık: Büyük Dosya

20 KB'ı aşan hafıza dosyaları uyarı alır. Büyük dosya = ajan her okuduğunda büyük token maliyeti. Konuya göre parçala.

### Sağlık: Kimlik

`CLAUDE.md` olmayan ajan klasörü **hata** alır — kimliksiz ajan her oturumda kişiliksiz başlar.

### Sağlık: Hata Oranı

Son 7 günde araç çağrılarının %10'undan fazlası hata verdiyse uyarı üretilir. Yüksek hata oranı genelde şunlardan olur: bozuk araç scripti, eksik izin, yanlış yol varsayan hafıza kaydı.

## Zeki Gözetim

Maliyeti zaten görüyorsun; bu bölüm **kaliteyi** de aynı karneye koyar. Dört araç: kalite karnesi, talimat önerileri, haftalık akıllı özet ve transcript arama. İçeride model çağrısı gerektiren üçü daima ucuz modelle (`agentFarm.judgeArgs`) çalışır ve otomatik döngüleri varsayılan olarak **kapalıdır** — sen açana kadar hiçbir API harcaması yapılmaz; elle komutlar her zaman kullanılabilir.

### Kalite Karnesi

Ucuz model hakem, ajanların son oturumlarından örnekler alır: oturumun ilk isteğine karşı ajanın son cevabını okur ve 1-5 puanlar.

- **Elle:** `Agent Farm: Sample Output Quality Now` — ajan başına `qualitySamplesPerAgent` (varsayılan 2) puanlanmamış yeni oturumu skorlar.
- **Otomatik:** `agentFarm.qualitySample` = `daily` veya `weekly` (varsayılan `off`).
- **Nerede görünür:** Dashboard karşılaştırma tablosunda **Quality** kolonu (son 14 gün ortalaması), filo raporunda Quality kolonu.
- **Uyarılar:** bu haftanın ortalaması geçen haftadan belirgin düşerse (≥0,8 puan) veya son iki haftanın ortalaması 3'ün altındaysa Insights'ta `quality` uyarısı çıkar.

Puanlar `quality.json`'da (globalStorage) yaşar; aynı oturum iki kez puanlanmaz. Maliyet düşük ama kalite de düşükse otomasyon zarar — iki eğriyi yan yana izle.

### Talimat Önerileri

Ajanın kendini iyileştirme döngüsü: ucuz model, son 14 günün oturumlarındaki **takip mesajlarını** (ilk istek hariç — düzeltmeler oradadır) tarar ve tekrarlayan düzeltme kalıplarından CLAUDE.md kuralı önerir ("başlıkları Türkçe yaz" gibi).

- **Elle:** `Agent Farm: Scan for Instruction Suggestions…` — ajan seçersin; yeterli takip mesajı yoksa (en az 4) tarama yapmaz.
- **Otomatik:** `agentFarm.suggestScan` = `weekly` (varsayılan `off`).
- **Nerede görünür:** Insights'ta 💡 satırı olarak. Tıklayınca inceleme açılır: **Apply to CLAUDE.md** kuralı ajanın CLAUDE.md'sine `## Learned rules (Agent Farm)` bölümü altına ekler; **Dismiss** öneriyi kapatır. Hiçbir kural onaysız yazılmaz.
- Tüm açık önerileri gözden geçirmek için: `Agent Farm: Review Instruction Suggestions…` (Insights başlığındaki 💡).

### Haftalık Akıllı Özet

Sinyal yorgunluğuna karşı: on ayrı uyarı yerine haftada bir, üç cümlelik insan dili özet — maliyet gidişatı, dikkat gerektiren sorunlar (bütçe/hata/nöbet/kalite) ve tek öneri.

- **Elle:** `Agent Farm: Generate Weekly Summary Now`.
- **Otomatik:** `agentFarm.weeklySummary` = `true` (varsayılan `false`) — her ISO haftasının ilk VS Code açılışında bir kez çalışır.
- Özet bildirim olarak gösterilir, `autoReportFolder` ayarlıysa `AgentFarm-Weekly-Summary-<hafta>.md` olarak vault'a da yazılır ve `notifyWebhookUrl` üzerinden (`summary` olayı) cebe iletilebilir.

### Transcript Arama

"Bunu bir ajanla konuşmuştum ama hangisiyle?" — filo büyüyünce hafıza panelin işidir.

- **Aç:** `Agent Farm: Search Transcripts…`, Recent Sessions başlığındaki 🔍, ya da Dashboard / Ajan Detay / Oturum Görüntüleyicideki **⌕ Search** düğmeleri (2.53.0) — son ikisi paneli o ajana / o oturuma **ön-kapsamlı** açar; kapsam rozetindeki ✕ tekrar tüm filoya genişletir.
- **Ne taranır (2.53.0):** varsayılan **Dialog** — senin isteklerin + ajan cevapları. Chip satırı kapsamı **araç girdilerine** (dosya yolları, komutlar, kod — "bu dosyaya hangi seansta dokunuldu?") ve **araç sonuçlarına** (çıktılar, hata mesajları) genişletir; *Everything* dördünü de kapsar. ~95 MB'lık filoda tam everything-taraması ~1.5 sn altında ölçüldü. İki ek kaynak kendi kutusuyla eşlik eder: ajanların **hafıza notları** (`memory/*.md`, isabet dosyayı açar) ve **öksüz canlı olaylar** — transkripti artık var olmayan olaylar (harici CLI'lar, budanmış oturumlar); transkripti duran olaylar bilerek dışarıda, onları transkript taraması zaten kapsıyor.
- **Ajan seçici (onay kutulu menü, 2.60.0):** `Agents: all ▾` düğmesi tüm ajanların işaretlenebilir listesini açar — **herhangi bir kombinasyon** seçilir: bir, iki, biri hariç hepsi… Toplu işlemler için **Select all / Clear** bağlantıları. Varsayılan hepsi işaretli (yeni ajan kendiliğinden dahil olur), bu yüzden ayrı bir "tüm ajanlar" moduna gerek yok; işaret kaldırmak taramayı daraltır (hafıza notları ve canlı olaylar da aynı seçime uyar). Düğme `Agent: dev`, `Agents: 2/7` ya da `Agents: none` diye okunur — hiçbir şey işaretli değilse arama dürüstçe boş döner. Panel Ajan Detay sayfasından açılınca yalnız o ajan işaretli gelir; seçim değişince bayatlayan ajan rozeti kendiliğinden kalkar.
- Diğer seçenekler: `regex` kutusu (düz metin varsayılan, büyük/küçük harf duyarsız), `match case`.
- **Arama kendiliğinden yeniden koşar** (2.54.0): herhangi bir kontrolü değiştirmek — ajan, chip'ler, kaynaklar, regex/case — aramayı anında yeniler (ölçümle ucuz; geçersiz kalan aramanın sonucu atılır). Yalnız semantik mod Enter bekler, çünkü her semantik sorgu ücretli bir embedding çağrısıdır.
- **Sonuçlar oturum başına gruplu, tur alt-başlıklı** (2.53.0): her oturum tek blok (başlığa tık → oturumu aç), içindeki isabetler `Turn 3 — <açılış komutu>` etiketli; araç isabetleri araç adını taşır. İsabete tıklayınca oturum görüntüleyici açılır ve **tam eşleşen mesaja kayar** (2.40.0) — kısa süreliğine çerçeveyle vurgulanır.
- Sonuçlar oturum başına 3, toplam 150 ile sınırlıdır (tek-oturum kapsamında sınırlar çok daha yüksektir) — taşarsa sorguyu daralt. Azgın bir regex **10 sn'lik süre bütçesiyle** kesilir; kısmi sonuç dürüstçe söylenir.

**Semantik mod (anlamsal arama):** kelime değil anlam arar — *"ajanla motivasyon düşüklüğünü konuştuğum yer"* gibi sorular için. Paneldeki **semantic** kutusunu işaretle.

- Kurulum: `agentFarm.embeddingsProvider` = `gemini` (Google API — `GEMINI_API_KEY` sırrını Set Secret ile ekle) veya `openai` (OpenAI-uyumlu herhangi bir uç — **tamamen yerel** istersen Ollama: `embeddingsBaseUrl` = `http://127.0.0.1:11434/v1`, model örn. `nomic-embed-text`, anahtar gerekmez).
- İndeks: **Build Semantic Index** komutu son `semanticMaxSessions` (300) oturumu parçalar halinde vektörler; dosya tabanlıdır, artımlı çalışır (yalnız yeni/değişen oturumlar) ve her semantik aramada 20 oturuma kadar kendini tazeler.
- Sonuçlarda benzerlik yüzdesi rozeti görünür; semantik modda yazarken otomatik arama yapılmaz (her sorgu bir embedding çağrısıdır), Enter'la ararsın.

## Komuta Merkezi

Filo büyüyünce dar boğaz sensin: kim izin bekliyor, hangi tarayıcı adımı onay istiyor, bütçe nerede taştı? Komuta Merkezi katmanı (Faz G) bu soruların tek ekranda cevaplanması içindir.

### Onay Kuyruğu

**Agent Farm: Open Needs You (Approval Queue)** — sana gelen her şey tek, aciliyet sıralı kuyrukta:

1. 🛡️ **İzin bekleyen oturumlar** (canlı hook verisinden) — tek tıkla oturumu veya Timeline'ı aç.
2. 🌐 **Onay bekleyen tarayıcı adımları** — kuyruktan doğrudan **Run / Reject**. Bildirim ile kuyruk yarışır; ilk karar kazanır. Bildirimi kaçırırsan istek kuyrukta bekler, workflow onayını alana kadar ilerlemez.
3. ⛓ **Yarıda kalan workflow koşuları (2.42.0)** — pencere kapanışında kesilen zincirler artık yalnız açılış bildirimi değil: kuyrukta kalıcı bir satırdır, **Resume / Dismiss** düğmeleri satırın üstündedir ve karar verilene dek durum çubuğu rozetine sayılır. Açılıştaki toast'ı kaçırmak koşuyu kaybettirmez.
4. ⏳ **Takılmış (stalled) oturumlar** · 💸 **bütçe aşımları** · ⇄ **Antigravity çakışmaları** (tek tık uzlaştırma) · 💡 **açık talimat önerileri** · 🕓 **park edilmiş görevler** (eşzamanlılık/kota) · 💬 **sırası sende** oturumları.

Durum çubuğu artık bu kuyruğu sayar: `🔔 N need you` görünüyorsa tıklamak kuyruğu açar. İş engelleyen üç tür sayılır: izin, tarayıcı onayı, stalled.

### Kanban Panosu

**Agent Farm: Open Task Board (Kanban)** (Tasks başlığındaki $(layout) simgesi) — görev kuyruğunun yönetici yüzeyi:

- Kolonlar: **📥 Inbox** (kuyrukta, elle başlatılacak) · **🕓 Parked** (kapasite/kota bekleyen) · **⚙️ Running** · **🛡️ Needs Approval** (izin + tarayıcı onayları, kart üstünde Run/Reject) · **🏁 Done** (son 30).
- Kartları **sürükle-bırak**: Inbox→Running = başlat, Running→Done = tamamla, Inbox→Done = iptal. Kart üstünde ajan, süre, verify rozeti, medya maliyeti; çıktı arşivi olan karta **çift tık** = çıktıyı aç.
- Panonun üstünde **komuta çubuğu**: doğal dil cümleni yaz, ucuz model plana çevirir, önizleme onayıyla kurulur (aşağıdaki Doğal Dil Komuta ile aynı akış).

### Maliyet Anomalisi

Sabit bütçe eşiği kör noktalıdır; anomali dedektörü "bugün her zamankinden çok farklı" gününü istatistikle yakalar:

- Ajan (ve filo) başına son **14 günün medyanı + MAD** (sağlam sapma) hesaplanır; bugün `medyan + 3.5σ` üstünde **ve** medyanın en az 2 katıysa Insights'a ⚠ düşer: *"psikolog bugün normalinin 4.2 katında"*.
- `agentFarm.costAnomalyMinUsd` (varsayılan 1$) altındaki günler gürültü sayılır; 0 dedektörü kapatır. Bütçelerden bağımsız çalışır, model çağrısı yoktur.
- **Agent Farm: Cost Anomaly Report** — tablo halinde bugün/medyan/çarpan + **ağır toplar raporu**: son 7 günde token'ın %50'sini yiyen oturumların listesi ("oturumların %5'i token'ın yarısını yedi").

### Eval Seti

Kalite karnesinin doğal evrimi: kötü giden üretim izleri **regresyon test vakası** olur (trace→dataset döngüsü).

1. **Add Eval Case…** — aday listesi otomatik gelir: düşük puanlı kalite örnekleri (≤2/5), verify FAIL olmuş adımlar, ya da elle yaz. Vaka = **girdi** (ajana yeniden sorulacak istem) + **beklenti** (hakem ölçütü, düz dil).
2. **Run Eval Set…** — onaylı ve maliyeti belli: her vaka bir ajan çağrısı (`agentFarm.evalRunArgs`, varsayılan haiku — gerçek modeli test etmek istersen boşalt) + bir ucuz hakem çağrısı. Sonuç karne: *"12/14 geçti, 2 geriledi"* — önceki koşuya göre gerileme/düzelme vaka adlarıyla raporlanır.
3. **Review Eval Cases…** — vakaları gözden geçir/sil. CLAUDE.md'yi değiştirdikten sonra seti koşmak, talimat değişikliğinin etkisini ölçülebilir yapar.

### Oturum Replay

Oturum görüntüleyicide **▶ Replay** — "ne oldu?" sorusunun en hızlı cevabı: mesajlar ve araç çağrıları gerçek zaman aralıklarına sadık kalarak (5 sn tavanlı, 1x-8x hız) adım adım akar. **next error ⚠** ve **next prompt 💬** düğmeleriyle kritik anlara atla; −1/+1 ile kare kare ilerle.

Kontrol çubuğu **yapışkandır** (2.6.0): mesajlar aşağı aktıkça çubuk ekranın üstüne sabitlenir — oynatma ne kadar ilerlerse ilerlesin Pause/hız/atlama düğmeleri hep elinin altındadır. Çubukta **✕ Exit** de vardır (2.7.0) — replay'den çıkmak için yukarı kaydırmak gerekmez.

Replay, **Show filtresine** uyar (2.7.0): Dialog seçiliyse yalnız diyalog mesajları oynar; Turn breakdown tablosunda bir satıra tıklamak oynatmayı o turun başına taşır.

### Subagent Ağacı

Subagent'lar maliyetin görünmez kısmıdır. Recent Sessions ve ajan oturum listeleri artık **ağaç**tır: alt-ajan kayıtları (`…/oturum-id/subagents/*.jsonl`) ebeveyn oturumun altında toplanır, ebeveyn satırında **⧉ N sub • $X total** rollup'ı görünür (kendisi + 5 seviyeye kadar altları). Tek tek maliyetler alt satırlarda durur.

## Güvenlik ve Güvenilirlik

Otonom filo büyüdükçe iki soru kritikleşir: "ajanlarım neye izinli?" ve "otomasyonuma güvenebilir miyim?" (Faz H).

### Guardrail Denetçisi

Her ajanın `.claude/settings(.local).json` izin kuralları otomatik denetlenir (`agentFarm.permissionLint`, varsayılan açık) ve bulgular Insights'a düşer; tıklayınca ayar dosyası açılır, kuralı orada daraltırsın:

- ⛔ **bypass modu:** `defaultMode: bypassPermissions` — tüm izin soruları kapalı demek.
- ⛔ **tehlikeli kalıp:** allow kuralının içinde `rm -rf`, `curl … | sh`, `-EncodedCommand`, `git push --force`, disk format gibi kalıplar (`--force-with-lease` muaf).
- ⚠ **aşırı geniş kural:** `Bash(*)`, çıplak `Bash`, `*`, `WebFetch(domain:*)` — her şey sorusuz koşar.
- ℹ **kullanılmayan geniş kural:** joker içeren kural ama o araç son 30 günde hiç çağrılmamış — bedava risk yüzeyi.
- ℹ **mükerrer kural** ve bozuk JSON uyarısı.

### Tetik Karnesi

Otomasyona güven ölçülebilir olmalı. Tasks ağacındaki her tetik satırı artık karnesini taşır: `fired 12× • 7d: 9✓/1✗ • start ~4s` (7 günlük başarı/başarısızlık + medyan başlama gecikmesi). **Agent Farm: Trigger Reliability Report** tam tabloyu verir. İki koku Insights'a otomatik düşer:

- ⚠ **hep fail:** tetiğin son koşuları üst üste FAILED — başlattığı zincir kırık.
- ℹ **hiç ateşlenmemiş:** tetik kurulu ama hiç çalışmamış — watch yolu/hook filtresi/webhook çağıranı kontrol et.

### Nabız Kontrolü

Sorunlar iş üstünde değil, nabızda yakalansın: her ajana sabit ucuz bir "kim olduğunu tek cümlede söyle" promptu gider, ucuz hakem cevabın CLAUDE.md kimliğiyle tutarlılığını PASS/FAIL'ler. Kırık CLI, bozulmuş CLAUDE.md, cevap veremeyen ajan gerçek işe girmeden görünür.

- `agentFarm.pulse`: `off` (varsayılan) / `nightly` / `weekly`; elle: **Run Pulse Check Now**.
- FAIL olan ajan Insights'ta ⛔ olur; maliyet ajan başına iki ucuz çağrıdır (`judgeArgs` modeli).

### Headless Servis

"VS Code açıkken" kısıtının ilacı: **Install Headless Service (Windows)…** küçük bir node sürecini oturum açılışına (schtasks, mevcut kullanıcı) kaydeder. Servis:

- VS Code çalışırken **uyur** (eklentinin 30 sn'de bir yazdığı heartbeat'e bakar) — çakışma olmaz; VS Code kapanınca ~90 sn içinde devralır.
- Devraldığında **zamanlanmış görevleri** ve **watch tetiklerini** işler: `claude -p` headless koşar, çıktıyı aynı arşive yazar, görev kayıtlarını `farm-tasks.json`'a ekler — panel açıldığında her şey yerli yerindedir ve "servis sen yokken N görev koştu" bildirimi gelir.
- Kapsam bilinçli olarak dar: hook/webhook tetikleri canlı dinleyici, workflow/dispatch aksiyonları tam motor ister — onlar VS Code'da kalır. Servis görevleri daima headless koşar.
- `node` PATH'te olmalı. Durum: **Headless Service Status**; kaldırma: **Remove Headless Service**. Günlük: `service-runs.jsonl`.

## Doğal Dil Komuta

Kurulum arayüzünün kestirmesi: Tasks başlığındaki 🚀 (veya `Agent Farm: Natural Language Command…`) → tek cümle yaz:

> *"yarın 09:00'da psikolog haftalık analizi koşsun"* · *"önce yazar taslak yazsın, sonra editör düzeltsin"* · *"asistana şimdi şu işi ver: …"*

Ucuz model cümleyi yapılandırılmış bir plana çevirir (tek seferlik iş / zamanlama / çok adımlı zincir), sana **insan diliyle önizleme** gösterilir — *Create* veya *Create & Run* demeden hiçbir şey kurulmaz. Plan doğrulanır: yalnızca gerçek ajan adların kabul edilir, saatler ve adımlar kontrol edilir; model saçmalarsa ham çıktıyla birlikte hata görürsün, sessizce yanlış bir şey kurulmaz. "Yarın" gibi ifadeler o anki tarihe göre hesaplanır.

## Dispatcher (İş Dağıtıcı)

Filo büyüyünce "bu iş hangi ajana?" sorusu da otomatikleşir. Tetikleyici eklerken eylem olarak **Dispatch — route to the best agent** seç: her ateşlemede gelen metne (webhook gövdesi / izlenen yol) bakılır ve iş en uygun ajana verilir.

1. **Kurallar önce:** `agentFarm.dispatchRules` — regex → ajan; ilk eşleşen kazanır. Örn. `[{"match": "uyku|kaygı", "agent": "psikolog"}]`. Deterministik ve bedava.
2. **Sınıflandırıcı sonra:** kural tutmazsa ucuz model, ajanların CLAUDE.md rol özetlerine bakarak seçer (`agentFarm.dispatchClassifier`, varsayılan açık; kapatırsan kural tutmayan iş düşer ve bildirilir).

Görev başlığına seçilen ajan ve yöntem yazılır (`inbox işi → psikolog [model]`). Kurmadan denemek için: `Agent Farm: Test Dispatcher…` — metni yaz, kimin alacağını ve gerekçeyi gör.

## Zekâ Derinliği

Talimat mühendisliğini tahminden ölçüme taşıyan katman (Faz I): her CLAUDE.md değişikliği kayıtlı, etkisi ölçülü, hafıza bakımı yarı-otomatik.

### Talimat Sürümleme

Her ajanın CLAUDE.md'si değiştiğinde otomatik olarak zaman damgalı tarihçeye alınır (içerikle birlikte — geriye dönüp bakabilirsin). **Instruction History & Impact…** komutu sürüm tablosunu açar: her sürümün hükmü boyunca kaç oturum koştu, kalite ortalaması ne oldu (▲/▼ önceki sürüme göre), günlük maliyet neydi. *"Bu kuraldan sonra kalite +0.6"* artık bir tablo satırıdır. A/B deneyinin kazananı uygulandığında da tarihçeye işlenir.

### A/B Talimat Deneyi

**A/B Instruction Experiment…** — iki CLAUDE.md varyantı, aynı istem seti, yan yana hakem:

1. B varyantı üç kaynaktan gelebilir: açık bir **talimat önerisini** dene (mevcut + kural), **dosyadan** seç veya kuralı **elle yaz**.
2. İstem seti: ajanın **eval vakaları** varsa otomatik onlar (en fazla 5); yoksa `;` ile ayırıp yazarsın.
3. Her istem iki izole kum havuzunda koşar (geçici klasör: varyant CLAUDE.md + memory kopyası — gerçek ajana dokunulmaz). Ucuz hakem cevapları **rastgele sırayla** görür (konum yanlılığı korunur) ve 1/2/EŞİT der.
4. Rapor: A-B-eşit skoru + istem başına gerekçeler. **B kazandıysa** tek tıkla kalıcı yapılır (.afbak yedekli, sürüm tarihçesine işlenir).

### Hafıza Distilasyonu

Bağlam diyetinin yarı-otomatik hali: **Distill Memory File…** → şişmiş (~2000+ token) veya bayat dosyalar aday listesinde önce gelir → ucuz model yoğunlaştırma taslağı üretir (tekrarlar birleşik, çelişkiler `⚠ ÇELİŞKİ:` ile işaretli, bayat satırlar "Arşiv adayı" bölümünde, frontmatter aynen) → **diff ekranında** karşılaştırırsın → Apply dersen .afbak yedeğiyle uygulanır. Korumalar: model limit/hata mesajı asla taslak sayılmaz; frontmatter'ı düşüren taslak reddedilir; MEMORY.md indeksi hiç aday olmaz (el emeği).

### Semantik Hafıza Sorgusu

Transcript araması geçmişi bulur; bu, **bilgiyi** bulur. **Ask Fleet Memory…** → *"kullanıcının uyku düzeni hakkında ne biliniyor?"* → tüm ajanların memory/*.md dosyaları embedding indeksinde aranır (aynı sağlayıcı ayarları: `embeddingsProvider`), sonuçlar ajan + dosya + benzerlik yüzdesiyle listelenir, seçince dosya açılır. İndeks artımlıdır (yalnız değişen dosyalar yeniden vektörlenir) ve transcript indeksinden ayrıdır.

### Model Politikası

Kota bekçisinin proaktif hali: görev nereden doğduysa ona göre model.

- `agentFarm.modelPolicy` kuralları — ilk eşleşen kazanır: `[{"source": "trigger", "model": "haiku"}]` = tetikten doğan her rutin iş ucuz modelde; `source` = trigger/schedule/workflow/manual/any, ayrıca `agent` ve `promptMatch` regex'leri.
- **Kota düşürme:** `quotaDowngradePercent` (örn. 70) — 5 saatlik pencere bu doluluk yüzdesini aşınca fabrika kaynaklı her görev `quotaDowngradeModel`'e (varsayılan haiku) zorlanır. Elle açtığın oturumlara karışılmaz.
- Uygulanan politika headless çıktı başlığına yazılır (`Model policy: quota window 82% ≥ 70% — downgraded…`) — neyin neden ucuz koştuğu hep izlenebilir.

## Ölçek ve Taşınabilirlik

Filo tek makineye sığmadığında: başka makinelerin oturumlarını aynı panelde izle, günlük karneyi cebine gönder, ajanlarını tek dosyayla taşı.

### Çoklu Makine

İkinci makinenin `.claude` klasörünü bir senkron aracıyla (Syncthing, OneDrive, SSH kopyası) bu makineye salt-okunur aynala, sonra:

```json
"agentFarm.extraClaudeDirs": [
  { "name": "laptop", "dir": "D:/sync/laptop/.claude" }
]
```

- O makinenin oturumları panele **⇄ laptop** rozetiyle gelir; maliyet, karne ve arama hepsini kapsar.
- Ajan eşleştirme yine çalışma dizinine bakar: iki makinede aynı klasör düzenini kullanıyorsan uzak oturumlar doğru ajana sayılır; eşleşmeyenler `Other projects (laptop)` altında toplanır (`includeUnmatchedProjects` açıkken).
- Senkron kopyada `projects` klasörü bulunamazsa açılışta uyarı alırsın — senkronun çalıştığını kontrol et.
- Agent Farm uzak klasöre **hiçbir şey yazmaz**; izleme tek yönlüdür.

### Günlük Özet Kartı (Cebe)

Haftalık akıllı özetin küçük kardeşi — model çağrısı yok, saf veri, telefon dostu tek mesaj: bugünün maliyeti, aktif ajanlar, en çok harcayanlar (bütçe yüzdesiyle), görev/nöbet durumu ve uyarılar.

- **Elle:** `Agent Farm: Send Daily Digest Now`.
- **Otomatik:** `agentFarm.dailyDigest` = `"21:30"` gibi bir saat — o saatten sonraki ilk kontrolde günde bir kez `notifyWebhookUrl`'e `digest` olayı olarak gönderilir (n8n → Telegram hattıyla cebe düşer).
- Webhook ayarlı değilse elle çalıştırma sonucu bildirim olarak gösterir.

### Ajan Paketleri

Ajanı şablonlaştırıp başka makineye taşımak veya paylaşmak için tek dosya: `.agentpack`.

- **Dışa aktar:** ajana sağ tık → **Export Agent Pack…** (veya komut paleti). Pakete girenler: `CLAUDE.md`, `DUTIES.md`, `tools/`, `.claude` ayarları, `.mcp.json` + ajanın karıştığı workflow/tetik/zamanlama/şablonlar.
- **ASLA girmeyenler:** `memory/` (kişisel hafıza) ve sırlar. İçinde kimlik bilgisi kokan dosyalar otomatik atlanır ve uyarı verilir; webhook token'ları paketten çıkarılır. `{secret:AD}` referansları korunur — hedef makinede aynı adla sır tanımlayınca çalışır.
- **İçe aktar:** **Import Agent Pack…** → paket dosyasını seç → kök klasör + yeni isim → onay. Taze `memory/MEMORY.md` iskeleti kurulur; workflow adımları yeni ajana bağlanır (aynı isimli yerel ajanlar isimle çözülür, bulunamayan self'e düşer ve uyarı verilir); tetikleyiciler ve zamanlamalar **kapalı** gelir — gözden geçirip kendin açarsın.

### Antigravity Uyumluluğu

Ajanların Claude için optimize; ama istersen aynı ajan Google Antigravity (Gemini) altında da çalışır. Antigravity'nin standardı: kökte **AGENTS.md** (araçlar-arası talimat dosyası), `.agents/workflows/*.md` (slash-komut iş akışları), `.agents/skills/` (beceri kılavuzları); MCP yapılandırması global `~/.gemini/config/mcp_config.json` (Claude'un `.mcp.json`'ı ile aynı `mcpServers` şeması). `memory/` dosyaları düz markdown olduğundan **iki taraf da olduğu gibi kullanır — dönüşüm gerekmez**.

**Kur:** ajana sağ tık → **Sync Agent with Antigravity…**

- `CLAUDE.md` → `AGENTS.md` üretilir (öz-referanslar uyarlanır; dosya başında senkron işareti).
- Aktif nöbet görevleri → `.agents/workflows/` dosyaları (Antigravity'de `/nobet-adi` diye çağrılır).
- `.mcp.json` varsa → `.agents/mcp_config.suggested.json` önerisi (global gemini dosyasına elle birleştirirsin — Agent Farm `~/.gemini`'ye asla yazmaz).

**Yaşat (yönlü senkron):** Bu tek seferlik bir dışa aktarım değil. Her senkronda içerik parmak izleri `.agents/af-antigravity-sync.json`'a yazılır; sonraki çalıştırmada hangi taraf ilerlemiş anlaşılır:

- **CLAUDE.md değişti** → Insights'ta hatırlatma; komut AGENTS.md'yi tazeler.
- **AGENTS.md değişti** (Antigravity oturumu ajana bir şey öğretti) → komut sorar: **Apply to CLAUDE.md** dersen kazanım yedekli olarak CLAUDE.md'ye taşınır — optimizasyon mirası iki tarafta da yaşar.
- **İkisi de değişti** → çakışma uyarısı (warning): Diff görüntüle veya yön seç; kaybeden taraf `.afbak` yedeğiyle korunur.
- Elle düzenlediğin workflow dosyalarına ve senin yazdığın (bizim üretmediğimiz) AGENTS.md'ye onaysız dokunulmaz.

### Paralel Worktree Koşuları

Kod ajanları için ölçek anahtarı (Faz J): aynı repo'da birden çok iş, sıfır çakışma.

- **Run Parallel Worktrees…** → ajan (git repo olmalı) → istemleri `;` ile ayır → her istem kendi `git worktree`'sinde (`af/` dallı, repo'nun yanındaki `.af-worktrees-*` klasöründe) headless koşar; ajana "bitince commit et" talimatı otomatik eklenir. Kartlar panoda `⑂` önekiyle görünür.
- **Worktree Runs…** → koşu listesi: kaç commit, diffstat, kaydedilmemiş değişiklik var mı → seçince üç aksiyon: **Merge** (mevcut dala `--no-ff`, sonra worktree temizliği), **Open** (yeni pencerede aç, elle incele), **Discard** (worktree + dal silinir, onaylı).
- Eski git sürümlerinde (`worktree remove` yoksa) temizlik elle silme + `worktree prune` ile yapılır — sürüm kontrolü otomatik.

### Canlı Relay (Uzak Makine)

E1 klasör-senkronu geçmişi taşır; relay **canlılığı** taşır. Kurulum:

1. Bu makinede: **Save Relay Script for Another Machine…** → `farmRelay.js`'i kaydet, diğer makineye kopyala.
2. Diğer makinede: `node farmRelay.js --claude %USERPROFILE%\.claude --out <senkronKlasörü>\relay-laptop.jsonl --machine laptop` (başlangıca da koyabilirsin). Script transcript'lere eklenen satırları izler ve kompakt olay akışı yazar — ağ yok, taşıma senin senkron aracın.
3. Bu makinede: `agentFarm.relayFeeds` = `[{"name": "laptop", "file": "D:\\Sync\\relay-laptop.jsonl"}]` → olaylar canlı monitöre akar: uzak ajan Live Feed'de/ajan satırında WORKING görünür. Ajan eşleşmesi klasör adıyla yapılır (iki makinede aynı isimli ajan klasörü = aynı ajan).

### OpenTelemetry Dışa Aktarım

**Export Traces (OpenTelemetry JSON)…** — tüm oturumlar (subagent ağaçları ebeveyn-çocuk span ilişkisiyle) OTLP/JSON dosyasına yazılır: Langfuse, Grafana Tempo veya herhangi bir OTLP tüketicisine besleyebilirsin. Yerellik korunur: yalnızca dosya yazılır, nereye göndereceğin senin kararın. Span öznitelikleri: ajan, model, token'lar (`gen_ai.*`), maliyet, araç sayısı, hatalar (hatalı oturum = ERROR status).

### Agentpack Galerisi

Ajan paketlerinin tüketim tarafı: `agentFarm.packGalleryRepos` = git URL'leri veya yerel klasörler → **Browse Agent Pack Gallery…** kaynakları senkronlar (git: sığ klon + pull), bulunan `.agentpack`'leri listeler, seçtiğin normal **güvenli import akışıyla** kurulur (hafıza/sır asla pakette yok, tetikler kapalı gelir, yeni webhook token).

### Çoklu-CLI Yürütücü

Görev yürütücü artık claude'a kilitli değil: `agentFarm.cliProfiles` = `[{"name": "gemini", "headless": "gemini -p \"{prompt}\"", "interactive": "gemini"}]` → Add Task sihirbazı CLI seçtirir. **Beklenti sınırı net:** claude-dışı yürütücüler çıktı arşivi + çıkış kodu durumu alır; transcript analizi, canlı hook'lar, maliyet ve kalite katmanları Claude'a özgüdür. Antigravity senkronu (1.3.0) ile aynı ajan kimliği iki tarafta da çalışır.

**Farklı bir modelle sezon aç (2.29.0 — Dalga E1):** Ajanda sağ tık → **Start Session With… (choose CLI)** ya da komut paletinden aynısı: bir CLI seçtirir (Claude Code varsayılan + `cliProfiles`'taki gemini/codex/…) ve o profilin `interactive` komutuyla ajan klasöründe bir terminal oturumu açar. **Claude yolu birebir korunur** — bu ayrı bir kardeş komuttur, mevcut Start Claude Session'a dokunmaz. Ajan başına son kullandığın CLI hatırlanır ve listede üste gelir (`externalTerminal` ayarına da uyar). Not: interaktif oturum için profilin `interactive` alanını sade launcher yaz (`"gemini"` gibi).

**Harici oturumların yaşam döngüsü izlenir (2.30.0 — Dalga E2a):** Start Session With… ile açılan claude-dışı oturum artık Live Timeline'da görünür — terminal açılınca kulvara `idle` satır düşer, terminal kapanınca `ended` olur. Oturum kimliği `cli:<cliId>:...` ile namespace'lenir (claude UUID'leriyle çakışmaz), kartta CLI rozeti + "external CLI — lifecycle only" ibaresi görünür. **Dürüst sınır:** CLI hook yaymadığı için ara durumlar (çalışıyor/araç/maliyet) izlenmez — yalnız açık/kapalı; `externalTerminal` modunda terminal nesnesi olmadığından yaşam döngüsü hiç izlenmez. Reload sonrası satır, adı eşleşen geri yüklenen terminale yeniden bağlanır; terminal geri gelmediyse satır dürüstçe kapatılır.

**Hook köprüsü — harici CLI'dan zengin olay (2.31.0 — Dalga E2b):** Start Session With… terminali `AGENT_FARM_SESSION` / `AGENT_FARM_CWD` / `AGENT_FARM_EVENT_PORT` / `AGENT_FARM_HOOK` ortam değişkenlerini taşır; eklentiyle gelen `cliHook.js` köprü script'i bu değişkenleri okuyup olayı canlı dinleyiciye POST'lar. CLI'ın notify/hook mekanizmasına ya da bir wrapper'a bağla: **codex için** `~/.codex/config.toml` içine `notify = ["node", "<cliHook.js yolu>"]` yeter — codex payload JSON'unu SON ARGÜMAN olarak verir ve köprü bunu otomatik algılar (2.36.0; bilinen türler eşlenir: `agent-turn-complete`→Stop). Elle kullanım: `node "%AGENT_FARM_HOOK%" --event Stop`, `--event PreToolUse --tool Bash`, `--event UserPromptSubmit --prompt "..."`; stdin'den JSON veren araçlar için `--json`. Hazır komut için: **Copy CLI Hook Bridge Command**. Köprü fail-soft'tur: daima 0 ile çıkar, CLI'ı asla bloklamaz; session env'i yoksa aynı klasörün olayları kararlı `cli:external:<klasör>` kulvarında toplanır. Claude terminallerine env verilmez — claude yolu değişmedi. **Dürüst sınır:** hangi CLI'ın hangi olayı yayabildiği CLI'a bağlıdır (kablolama kullanıcı tarafında).

**Harici oturum geçmişi (2.32.0 — Dalga E3a):** Harici CLI oturumları Sessions ağacında ve ajanın Sessions bölümünde görünür (terminal ikonu + CLI rozeti + prompt/araç sayıları; tık → Live Timeline; transcript olmadığından viewer/rename/delete/resume menüleri yok) ve dashboard'da dürüst tek satır özet çıkar. Veri, canlı olay deposundan (`cli:` kulvarları, ~31 gün) türetilir — yabancı log formatı TAHMİN EDİLMEZ; token/maliyet dürüstçe yok sayılır (0 bile denmez, toplamlara girmez). Mimari: `SessionSource` arayüzü yabancı oturumları `SessionInfo`'ya normalize eder ama index'te **yan listede** tutulur — `all()`/`forAgent()` claude-only kalır, yani claude'a özgü analitikler (context health, cache verimi, skill/MCP/memory kullanımı, raporlar, arama, OTLP) yapısal olarak yabancı oturum görmez. **Codex & Gemini transcript adaptörleri (2.34.0 — Dalga E3b):** Codex CLI rollout transcript'leri (`~/.codex/sessions/**/rollout-*.jsonl` + arşivlenenler; `agentFarm.codexHome` ile özelleştirilebilir) ve Gemini CLI sohbet dosyaları (`~/.gemini/tmp/<hash>/chats/`; `agentFarm.geminiDir`) taranır, GERÇEK token kullanımıyla harici oturum geçmişine girer. Ajan eşleşmesi: codex'te transcript'teki `cwd` alanından, gemini'de klasör adındaki `sha256(projeKökü)` hash'i ajan klasörlerinin hash'iyle karşılaştırılarak. **Maliyet dürüstlüğü:** her modelin kullanımı `agentFarm.pricing` kurallarından geçer — kural eklersen (ör. `"gpt-5"`, `"gemini-2\\.5-pro"`) gerçek dolar değeri görünür; kural yoksa $0 + bilinmeyen-model uyarısı. Oturuma tıklamak ham transcript'i açar. Formatlar upstream kaynak kodundan (openai/codex protocol + gemini-cli, Temmuz 2026) alındı ve fail-soft — tanınmayan dosya/satır sessizce atlanır, format kayarsa hiçbir şey bozulmaz sadece o oturum görünmez; canlı-olay kulvarıyla çakışan transcript tekilleştirilir (transcript kazanır).

### Sesli Brifing

NoteScribe döngüsünün dönüş yarısı: **Speak Daily Briefing (TTS)** günlük özet kartını fal.ai TTS modelinden geçirir ve mp3'ü `digestTtsFolder`'a (telefonla senkron bir klasör / vault) düşürür. Ayarlar: `digestTtsModel` (fal'daki gerçek model kimliğini doğrula), anahtar aynı `FAL_KEY` sırrı. Klasör boşsa `autoReportFolder` kullanılır.

### Marketplace / Yayın

Eklenti yayın kalitesinde hazırlandı: `LICENSE` (MIT), `CHANGELOG.md`, README'de gizlilik beyanı ("telemetri yok") ve yayın adımları. Marketplace/Open VSX'e çıkmak bir ürünleşme kararıdır ve sana aittir — adımlar README'nin "Publishing" bölümünde (publisher hesabı + `vsce publish`).

## Maliyet Hesabı

Token kullanımı yerel kayıtlardan okunur ve `agentFarm.pricing` kurallarıyla fiyatlanır (milyon token başına USD; ilk eşleşen regex kazanır):

| Model deseni | Input | Output | Cache Write | Cache Read |
| --- | --- | --- | --- | --- |
| opus | 15 | 75 | 18.75 | 1.50 |
| fable, mythos | 15 | 75 | 18.75 | 1.50 |
| sonnet | 3 | 15 | 3.75 | 0.30 |
| haiku | 1 | 5 | 1.25 | 0.10 |

**Önemli:** Abonelik planında (Pro/Max) bu rakamlar fatura değildir — kullanımının **API karşılığı değeridir**. "Bu ay aboneliğimden ne kadar değer çıkardım?" sorusunun cevabıdır. Fiyat listesi güncellenirse ayarlardan düzelt; eşleşmeyen modeller Dashboard'un altında uyarı olarak listelenir ve 0$ sayılır.

Bu oranları JSON'a dokunmadan düzenleyebilirsin: bir ajanın detay sayfasını aç ve **Model pricing** editörünü kullan. Değişiklik **yalnızca ileriye** uygulanır — daha önce kaydedilmiş oturumlar faturalandıkları oranı korur, yani bir fiyatı güncellemek geçmiş maliyetleri asla yeniden yazmaz. Oranlar bir dahaki açılışta hatırlanır (`agentFarm.pricing` ayarında tutulur); arka planda tutulan tarihli geçmiş sayesinde her mesaj, çalıştığı andaki oranla fiyatlanır (2.47.0).

**5 saatlik pencere:** Abonelik planlarında kota ~5 saatlik yuvarlanan pencerelerle işler. Dashboard son 5 saatteki token toplamını gösterir; `agentFarm.windowTokenLimit` ayarına plan limitini yazarsan yüzde çubuğu görürsün.

### Bütçe Uyarıları

`agentFarm.budgets` ayarıyla ajan başına (ve `"*"` ile filo geneli) **günlük bütçe** tanımlarsın:

```
"agentFarm.budgets": { "psikolog": 20, "*": 50 }
```

- Bütçenin **%80'ine** gelen ajan Insights'ta ⚠ uyarı alır; **aşan** ajan ⛔ hata olur ve günde bir kez bildirim düşer.
- Dashboard'da bütçeli ajan kartlarında doluluk çubuğu görünür; filo bütçesi "Cost today" kartına işlenir.
- Rakamlar API karşılığı değerdir — abonelikte fatura değil, tüketim disiplinidir: "psikolog bugün değer olarak 20$'ı geçmesin" gibi.

### Trend Uyarıları

Bütçe "bugün"e bakar; trend uyarısı **haftalık gidişata** bakar. Bir ajanın son 7 günlük maliyeti, önceki 7 günün `agentFarm.trendAlertFactor` katına (varsayılan 2x) ulaşırsa Insights'ta uyarı belirir: *"Weekly cost trend: $24 this week vs $6 last week (4.0x)."* Filo geneli de ayrıca izlenir.

Gürültü koruması: önceki hafta 0.50$'ın, bu hafta 1$'ın altındaysa uyarı üretilmez (küçük rakamlarda kat sayısı anlamsızdır). `trendAlertFactor: 0` tamamen kapatır. Bu uyarı "kötü" demek değildir — bazen yoğun bir proje haftasıdır; amacı sessiz maliyet sürünmesini erken göstermektir.

## Ayarlar

### Farm Settings sayfası (2.54.0)

VS Code'un ayar arayüzünde kazı yapmana gerek yok: **Agent Farm: Farm Settings** (Dashboard'daki **⚙ Settings** düğmesi de) **tüm `agentFarm.*` ayarlarını** tek sayfada açar — alana göre gruplu (Core, Live Monitoring, Cost, Tasks, Media, Search, Multi-CLI, Health, Reports), filtre kutulu; her ayarın açıklaması adının altında, tam anahtar + varsayılan değeri tooltip'te. Boolean'lar onay kutusu, enum'lar açılır liste, liste/nesneler doğrulamalı JSON editörü — bozuk değer yazılmaz, satırın altında hatayla reddedilir. Varsayılandan farklı ayarlar işaretlidir ve tek tıkla **↺ reset** edilir. Değişiklikler anında kullanıcı ayarlarına kaydedilir; başka yerden yapılan düzenlemeler sayfaya canlı yansır.

Sayfa **şema-güdümlüdür**: eklenti manifestinin bildirdiği her şeyi çizer — gelecekte eklenen bir ayar kendiliğinden görünür.

**Ayar setleri:** mevcut varsayılan-dışı değerleri adlı bir set olarak kaydet (*Save current as…*), sonra **Apply** ile geri yükle — set uygulanırken setin anmadığı değiştirilmiş ayarlar da varsayılana döner, yani set bir katman değil **tam bir durumdur** (onay penceresi tam kaç değerin değişeceğini söyler). Setler **JSON dosyasına aktarılıp geri alınabilir** — makineler arası taşınabilir.

**Agent folders bölümü (2.61.0):** sayfanın ilk bölümü **ajanların nerede yaşadığını** yönetir — eskiden bir kerelik kurulum sorusu ve ham JSON dizisi olan parça. `agentFarm.agentRoots`'taki her kök bir satırdır; rozeti, keşfin o kökten ne anladığını söyler: **nest · N agents** (ajanlar alt klasörlerdir; kökün kendi `CLAUDE.md`'si ortak talimattır, ajan değildir), **single agent**, düz **N agents**, **folder missing** ya da **duplicate entry** (aynı klasörün iki farklı yazımı — tek tıkla temizlenir; büyük/küçük harf ve eğik çizgi farkları artık keşfi bozamaz). Her satır ajanlarını çip olarak listeler: ada tıklayınca o ajanın sayfası açılır; **Exclude** klasörü çiftlikten tamamen çıkarır — görünümler, analitik, oturum sahipliği dahil her yerde ajan olmaktan çıkar, **Include** ile geri gelir; dışlananlar soluk görünmeye devam eder ki geri dönüş hep tek tık olsun. **+ Add root…** klasör seçici açar; **Remove** kökü taramayı bırakır (onay penceresi kaç ajanın görünümlerden çıkacağını açıkça söyler; klasörün kendisine asla dokunulmaz); **Reveal** dosya gezgininde gösterir. Artık hiçbir şeye denk gelmeyen bayat dışlama kayıtları ayrı listelenir, tek tıkla silinir. Bölüm arka planda `agentFarm.agentRoots` / `agentFarm.excludeAgentDirs` ayarlarını düzenler — elle yapılan düzenlemeler ve ayar setleri sayfayla senkron kalır.

**Claude Code (claude CLI) bölümü (2.55.0):** aynı sayfa **claude'un kendi** `~/.claude/settings.json` dosyasını da düzenler — terminaldeki *"Set CLAUDE_CODE_USE_POWERSHELL_TOOL=1 …"* gibi ipuçlarının arkasındaki dosya. Açıklamalı seçilmiş katalog: varsayılan model, izin varsayılan modu, co-authored-by, transkript saklama süresi (`cleanupPeriodDays` — Agent Farm'ın arama ve analitiğinin ne kadar geriye görebildiğini sınırlar), output style ve bilinen env anahtarları (PowerShell tool önizlemesi, thinking/çıktı token tavanları, bash zaman aşımı, oto-güncelleme/telemetri kapatmaları). Bir değeri temizlemek anahtarı dosyadan siler — Claude'un kendi varsayılanı devreye girer. Geri kalan her şey kataloğun altındaki doğrulamalı **ham JSON editöründen** düzenlenir — bozuk JSON asla kaydedilmez, dosyanın yanında bir kerelik `.agentfarm-backup` kopyası tutulur. Değişiklikler **yeni** claude oturumlarına uygulanır.

### Referans tablosu

| Ayar | Varsayılan | Ne işe yarar |
| --- | --- | --- |
| `agentFarm.agentRoots` | `["D:/zone/agent/ajanlar"]` | Ajan klasörlerinin tarandığı kökler (bkz. Agent folders bölümü) |
| `agentFarm.excludeAgentDirs` | [] | Ajan gibi görünse de asla ajan sayılmayacak klasörler |
| `agentFarm.claudeDir` | boş (`~/.claude`) | Claude Code veri dizini |
| `agentFarm.extraClaudeDirs` | [] | Diğer makinelerin senkronlu `.claude` klasörleri (`{name, dir}`) |
| `agentFarm.activeThresholdSeconds` | 150 | Bu süre içinde kaydı değişen oturum "aktif" sayılır |
| `agentFarm.staleMemoryDays` | 45 | Bayat hafıza eşiği |
| `agentFarm.contextBudgetTokens` | 8000 | Sabit bağlam yükü bütçesi |
| `agentFarm.windowTokenLimit` | 0 (kapalı) | 5 saatlik pencere limiti (yüzde çubuğu için) |
| `agentFarm.maxTranscriptMessages` | 1500 | Oturum görüntüleyicide gösterilen en fazla mesaj |
| `agentFarm.contextWindowTokens` | 0 (otomatik) | "Context now" tavanı. 0 = oturumun modelinden otomatik bulunur (bilinmeyen modelde yüzde gösterilmez); sabit tavan zorlamak için değer gir |
| `agentFarm.includeUnmatchedProjects` | false | Ajan köklerine eşleşmeyen oturumları da dahil et |
| `agentFarm.pricing` | yukarıdaki tablo | Model fiyat kuralları |
| `agentFarm.liveMonitor` | true | Canlı olay dinleyicisini çalıştır |
| `agentFarm.livePort` | 8377 | Dinleyici portu (değiştirince hook'ları yeniden kur) |
| `agentFarm.stuckThresholdSeconds` | 240 | Takılma eşiği |
| `agentFarm.notifyPermission` | true | İzin bekleme bildirimi |
| `agentFarm.notifyStuck` | true | Takılma bildirimi |
| `agentFarm.notifyTurnEnd` | false | Tur sonu bildirimi |
| `agentFarm.queueAutoAdvance` | false | Görev bitince sıradakini otomatik başlat |
| `agentFarm.taskExtraArgs` | boş | Görev komutlarına eklenen CLI argümanları (örn. `--model haiku`) |
| `agentFarm.judgeArgs` | haiku | Doğrulayıcı (hakem) çağrılarının CLI argümanları — ucuz model kalsın |
| `agentFarm.maxConcurrentTasks` | 2 | Filoda aynı anda koşan görev tavanı (0 = sınırsız) |
| `agentFarm.maxConcurrentPerAgent` | 1 | Ajan başına eşzamanlı görev tavanı |
| `agentFarm.quotaGuardPercent` | 0 (kapalı) | 5h penceresi bu doluluğa gelince otomatik işleri ertele |
| `agentFarm.outputsMaxMB` | 200 | Çıktı arşivi boyut tavanı |
| `agentFarm.notifyWebhookUrl` | boş | Bildirimlerin iletileceği webhook (n8n→Telegram vb.) |
| `agentFarm.notifyWebhookEvents` | hepsi | İletilecek olay türleri |
| `agentFarm.mediaAuthSecret` | FAL_KEY | Medya anahtarını tutan sır adı |
| `agentFarm.mediaPricing` | tablo | Medya maliyet tahmin kuralları (fal.ai'den doğrula) |
| `agentFarm.mediaBaseUrl` | boş | fal kuyruk adresi override (test/proxy) |
| `agentFarm.autoReport` | off | Otomatik filo raporu: off / daily / weekly |
| `agentFarm.autoReportFolder` | boş | Otomatik raporların yazılacağı klasör (vault) |
| `agentFarm.autoReportDays` | 7 | Otomatik raporun kapsadığı gün sayısı |
| `agentFarm.budgets` | {} | Ajan başına günlük USD bütçe; `"*"` = filo geneli |
| `agentFarm.trendAlertFactor` | 2 | Haftalık maliyet kat eşiği (0 = kapalı) |
| `agentFarm.autoReportIncludeOutputs` | true | Otomatik rapora görev çıktılarını ekle |
| `agentFarm.qualitySample` | off | Otomatik kalite örneklemesi: off / daily / weekly |
| `agentFarm.qualitySamplesPerAgent` | 2 | Örnekleme başına ajan başına puanlanacak oturum sayısı |
| `agentFarm.suggestScan` | off | Haftalık talimat önerisi taraması: off / weekly |
| `agentFarm.weeklySummary` | false | Haftada bir üç cümlelik akıllı filo özeti |
| `agentFarm.dailyDigest` | off | Günlük özet kartının webhook'a gönderileceği saat (örn. "21:30") |
| `agentFarm.dispatchRules` | [] | Dispatcher kuralları: regex → ajan (ilk eşleşen kazanır) |
| `agentFarm.dispatchClassifier` | true | Kural tutmazsa ucuz model ajan seçsin |
| `agentFarm.embeddingsProvider` | off | Semantik arama: gemini / openai (Ollama dahil) |
| `agentFarm.embeddingsModel` | boş (otomatik) | Embedding modeli |
| `agentFarm.embeddingsBaseUrl` | boş (otomatik) | Uç adresi override (Ollama: http://127.0.0.1:11434/v1) |
| `agentFarm.embeddingsSecret` | boş (otomatik) | Anahtarı tutan sır adı (GEMINI_API_KEY / OPENAI_API_KEY) |
| `agentFarm.semanticMaxSessions` | 300 | Semantik indeksin kapsadığı oturum sayısı |
| `agentFarm.browserAllowHosts` | [] | Tarayıcı adımları için global alan adı allowlist'i |
| `agentFarm.browserApproval` | ask | Tarayıcı adımı öncesi onay: ask / auto |
| `agentFarm.costAnomalyMinUsd` | 1 | Maliyet anomali dedektörü tabanı (USD); 0 kapatır |
| `agentFarm.agentRowCostUnit` | tokens | Agents görünümünde her ajan satırındaki günlük kullanım birimi: tokens / cost |
| `agentFarm.evalRunArgs` | --model haiku… | Eval koşularının CLI argümanları; boş = ajanın varsayılan modeli |
| `agentFarm.permissionLint` | true | İzin kurallarının guardrail denetimi (Insights) |
| `agentFarm.pulse` | off | Sentetik nabız kontrolü: off / nightly / weekly |
| `agentFarm.modelPolicy` | [] | Kural tabanlı model yönlendirme (source/agent/promptMatch → model) |
| `agentFarm.quotaDowngradePercent` | 0 | Pencere bu %'yi aşınca fabrika görevleri ucuz modele düşer |
| `agentFarm.quotaDowngradeModel` | haiku | Kota düşürmede zorlanan model |
| `agentFarm.cliProfiles` | [] | Alternatif CLI yürütücüleri ({prompt}/{args} şablonları) |
| `agentFarm.relayFeeds` | [] | Uzak makine canlı relay dosyaları ({name, file}) |
| `agentFarm.packGalleryRepos` | [] | Agentpack galeri kaynakları (git URL / yerel klasör) |
| `agentFarm.digestTtsModel` | boş | Sesli brifing için fal.ai TTS model kimliği |
| `agentFarm.digestTtsFolder` | boş | Brifing mp3'ünün düştüğü klasör (boş = autoReportFolder) |

## Komutlar

Tümü komut paletinde `Agent Farm:` önekiyle:

- **Open Dashboard** — genel pano
- **Open Guide** — bu belge
- **Refresh** — ajanları ve oturumları yeniden tara
- **New Agent** — şablondan yeni ajan iskeleti (CLAUDE.md + memory + .claude)
- **Add Agent Root Folder** — yeni kök klasör ekle
- **Start Claude Session / Continue Latest Session** — ajan klasöründe terminal açıp `claude` başlatır
- **Open Agent in New Window / Reveal in File Explorer**
- **Open Live Timeline** — kulvar görünümü (canlı gözlem)
- **Install Live Hooks / Remove Live Hooks** — canlı gözlem hook'larını kur/kaldır
- **Add Task / Add Scheduled Task** — görev kuyruğu ve zamanlama
- **Add Trigger** — olay tetikleyicisi (watch/hook/webhook); tetik satırında ▶ = elle ateşle
- **Open Task History** — aylık görev tarihçesi kayıtları
- **Set Secret… / Delete Secret… / List Secrets** — sır kasası
- **Add MCP Server… / Remove MCP Server** — MCP envanteri (Agents ağacındaki MCP bölümünden)
- **Add Skill… / Remove Skill** — skill envanteri (Agents ağacındaki Skills bölümünden; SKILL.md iskeleti kurar / yedekli siler)
- **Copy Skill to Agent… / Move Skill Between Agent/User Scope… / Reveal Skill Folder** — skill filo yönetimi (sağ tık)
- **Edit MCP Server… / Disable MCP Server / Enable MCP Server / Copy MCP Server to Agent…** — MCP yönetimi (sağ tık)
- **Open Capability Matrix (Skills × MCP × Agents)** — filonun yetenek ızgarası, kullanım yoğunluğu ve tek tıkla kopyalama
- **Copy Webhook URL** — webhook tetiğinin gizli adresi
- **Open Media Gallery** — üretilen medyalar (önizleme + Re-run/Vary)
- **New Recipe Workflow…** — hazır fabrika şablonları
- **New Multi-Agent Workflow… / Run Workflow** — çoklu-ajan zincirleri
- **Edit Step… / Add Step / Rename Workflow** — kurulu zinciri düzenleme
- **Missions / New Mission…** — dinamik orkestrasyon: lead ajan tur tur planlar, ekibe delege eder (bkz. [Missions](#missions))
- **Save as Template / New Task from Template** — görev şablonları
- **Open Task Output** — headless görev çıktı arşivi
- **Export as Windows Scheduled Task…** — VS Code'dan bağımsız zamanlama
- **Sync Shared Memory… / Apply Merged Memory** — kopya hafıza senkronizasyonu ve elle birleştirme
- **Export Fleet Report (Markdown)** — karşılaştırmalı filo raporu
- **Export Task Outputs Digest (Markdown)** — headless çıktıların toplu özeti
- **Quick Start (Hızlı Başlangıç)** — bu kılavuzun başlangıç bölümünü açar
- **Add Standing Duty / Add Duty from Template… / Edit Duty… / Copy Duty to Agent… / Automate Duty… / Move Duty Up-Down / Open DUTIES.md** — nöbet görevi yönetimi
- **New Memory File… / Archive Memory File / Copy Memory File to Agent… / Fix Memory Index… / Scan Memory Contradictions…** — hafıza yönetimi (frontmatter iskeleti + otomatik indeks satırı / yedekli arşivleme / tek-tık indeks onarımı / ucuz modelle çelişki taraması)
- **Open Memory Graph** — hafızanın [[wikilink]] dokusu: hub'lar, adalar, kırık hedefler, recall renklendirmesi
- **Search Transcripts…** — tüm oturum kayıtlarında metin/regex arama
- **Sample Output Quality Now** — kalite karnesi için elle örnekleme (ucuz model)
- **Scan for Instruction Suggestions… / Review Instruction Suggestions…** — düzeltme kalıplarından CLAUDE.md kuralı önerisi ve onaylı uygulama
- **Generate Weekly Summary Now** — üç cümlelik akıllı filo özeti (ucuz model)
- **Send Daily Digest Now** — günlük özet kartını webhook'a/bildirime gönder
- **Export Agent Pack… / Import Agent Pack…** — ajanı tek dosyayla taşı/paylaş (hafıza ve sırlar hariç)
- **Sync Agent with Antigravity…** — AGENTS.md + workflow üretimi ve iki yönlü fark senkronu
- **Natural Language Command…** — cümleden onaylı görev/zamanlama/zincir kurulumu (ucuz model)
- **Test Dispatcher…** — bir metni dispatcher kimin alacağını göster
- **Build Semantic Index** — anlamsal arama için oturum vektör indeksini kur/tazele
- **Open Ultra Roadmap (Ultra Gelişim)** — araştırma temelli ikinci nesil yol haritası
- **Open Needs You (Approval Queue)** — sana gelen her şey tek aciliyet sıralı kuyrukta
- **Open Task Board (Kanban)** — sürükle-bırak görev panosu + komuta çubuğu
- **Cost Anomaly Report** — medyan+MAD anomali tablosu ve ağır toplar raporu
- **Add Eval Case… / Run Eval Set… / Review Eval Cases…** — kötü izlerden regresyon seti kur ve koş
- **Run Pulse Check Now** — tüm ajanlara sentetik nabız (ucuz model + ucuz hakem)
- **Trigger Reliability Report** — tetik güvenilirlik tablosu (ateşlenme, ✓/✗, gecikme)
- **Install / Remove Headless Service (Windows), Headless Service Status** — VS Code kapalıyken zamanlama/watch tetiklerini işleten yerel servis
- **Instruction History & Impact…** — CLAUDE.md sürüm tarihçesi + kalite/maliyet korelasyonu
- **A/B Instruction Experiment…** — iki talimat varyantını aynı istemlerle yarıştır, kazananı uygula
- **Distill Memory File…** — şişmiş/bayat hafıza dosyasına ucuz modelle yoğunlaştırma taslağı (diff + onay)
- **Ask Fleet Memory… (Semantic)** — "filo bu konuda ne biliyor?" — memory dosyalarında anlamsal arama
- **Run Parallel Worktrees… / Worktree Runs…** — çakışmasız paralel kod koşuları + merge/discard yönetimi
- **Export Traces (OpenTelemetry JSON)…** — oturumlar OTLP span'leri olarak dışarı
- **Browse Agent Pack Gallery…** — git/klasör kaynaklı paket galerisinden içe aktar
- **Speak Daily Briefing (TTS)** — günlük özeti fal.ai TTS ile mp3'e seslendir
- **Save Relay Script for Another Machine…** — uzak makine canlı relay script'i

## Veri ve Gizlilik

- **Telemetri yok.** Eklenti hiçbir veri toplamaz, hiçbir yere raporlamaz.
- **Kendi başına ağ isteği yapmaz.** Ağa çıkan yalnızca senin yapılandırdıkların: medya üretimi (fal.ai anahtarınla), webhook iletimi (senin URL'lerin) ve senin başlattığın `claude` koşuları. Canlı olay dinleyicisi yalnızca `127.0.0.1`'e bağlanır.
- **Sırlar** OS anahtarlığında (SecretStorage) yaşar — dosyalara yazılmaz, ajan paketlerine girmez.
- Oturum kayıtlarını Claude Code zaten tutuyor; Agent Farm onları yalnızca okur. Yazdığı yerler hep senin onayınla ve bellidir: yeni ajan iskeleti, hook kurulumu (yedekli), DUTIES.md, rapor/paket dosyaları.
- Ajan eşleştirme kuralı: oturumun çalışma dizini (`cwd`) bir ajan klasörünün altındaysa o ajana sayılır. Kökler dışındaki projeler varsayılan olarak kapsam dışıdır.

## SSS

**Ajanım listede yok.** Klasöründe `CLAUDE.md` (ya da `.claude` / `memory/`) var mı? Farm Settings → **Agent folders** bölümüne bak: kökü listede mi, klasör orada dışlanmış mı, kök missing/duplicate olarak mı işaretli? Sonra **Refresh**.

**Bir klasör ajan olarak görünüyor ama ajan değil.** Farm Settings → **Agent folders**'ta o klasöre **Exclude** de. Not: alt klasörleri ajan olan bir kök hiçbir zaman kendisi ajan olarak görünmez — `CLAUDE.md`'si ortak talimat (yuva) sayılır.

**Maliyetler 0 görünüyor.** Model, fiyat kurallarından hiçbiriyle eşleşmemiş olabilir — Dashboard'un altındaki uyarıya bak ve `agentFarm.pricing`'e kural ekle.

**"ACTIVE" hiç yanmıyor.** Aktiflik, transcript dosyasının son değişme zamanına bakar. Oturum başka makinede/dizinde çalışıyorsa görünmez. Eşiği `activeThresholdSeconds` ile genişletebilirsin.

**Rakamlar ccusage ile birebir aynı değil.** Yuvarlama ve pencere tanımı farkları normaldir; büyük resim aynıdır.

**Subagent (sub rozetli) oturumlar ne?** Ana oturumun yan görevleri (sidechain). Maliyetleri ayrı satır olarak görünür ki nereye token gittiğini görebil.

**Timeline boş, "No live events yet" diyor.** Üç sebep olabilir: (1) hook'lar kurulmadı — **Install Live Hooks** çalıştır; (2) hook'lar kuruldu ama açık claude oturumları yeniden başlatılmadı; (3) dinleyici portu başka pencere tarafından tutuluyor — başlıktaki duruma bak.

**Live Feed ile Timeline farkı ne?** İkisi de canlı olayları gösterir; Feed liste halinde yan panelde, Timeline zaman ekseninde kulvarlarla. Hook'lar yokken Feed, oturum kayıtlarından türetilmiş (birkaç saniye gecikmeli) olaylara döner.

**Zamanlanmış görev saatinde çalışmadı.** VS Code o saatte açık mıydı? Zamanlayıcı yalnızca VS Code açıkken işler. Ayrıca prompt'un içindeki çift tırnaklar tek tırnağa çevrilir — komut satırı güvenliği için.

**Görev bitti ama "running" görünüyor.** Terminal hâlâ açık olabilir; terminali kapat veya ✓ ile elle tamamla. Shell integration açıksa (VS Code varsayılanı) komut bitiminde otomatik işaretlenir.

**Senkronda yanlış kaynağı seçtim.** Üzerine yazılan her dosyanın yanında zaman damgalı `.afbak` yedeği durur — içeriği geri kopyala.

**Workflow adımı takıldı / zincir ilerlemiyor.** Adım "done" olmadan sonraki başlamaz. Interactive adımda terminali kapatman gerekir; headless adımda `claude` çıkış kodunu bekler. Zincir failed ile durduysa bildirimde hangi adım olduğu yazar; görevi düzeltip workflow'u yeniden çalıştır.

**Headless görev başlamadı / anında failed oldu.** `claude` PATH'te mi? Çıktı dosyasını aç (Open Task Output) — spawn hatası ve stderr orada görünür.

**runIf koşulum hiç tutmuyor.** Desen, önceki adımın **çıktı dosyası içeriğine** karşı büyük/küçük harf duyarsız test edilir. İlk adımda önceki çıktı olmadığından ilk adıma runIf koyma (wizard zaten sormaz). Interactive adımların çıktısı arşivlenmediği için sonraki adımın runIf'i eşleşmez — koşullu zincirlerde headless kullan.

**Bütçe bildirimi tekrar tekrar gelir mi?** Hayır — ajan başına günde bir kez. Insights'ta durum sürekli görünür.

**Ajan nöbet görevlerine bakmıyor.** İki şart var: (1) CLAUDE.md'de DUTIES.md referansı olmalı (Insights uyarır, ekleme sihirbazı önerir); (2) ajanın açık bir oturumu olmalı — nöbet görevleri ajan çalışırken işler. Oturum açıkken de aksıyorsa CLAUDE.md'deki yönergeyi güçlendir ("her turun sonunda DUTIES.md kontrolünü raporla" gibi).

**DUTIES.md'yi elle düzenledim, panel bozulur mu?** Hayır — biçim satırlarını (`## Başlık [kadans]`, `- **Watch:**`, `- **Do:**`) koruduğun sürece panel elle eklediğin her şeyi tanır ve yeniden yazımlarda korur.

## Yol Haritası

Tamamlanan fazlar (hepsi 2026-07-08):

- ~~**Faz 2 — Canlı gözlem**~~ ✅ 0.2.0 · ~~**Faz 3 — Koordinasyon**~~ ✅ 0.3.0 · ~~**Faz 4 — Otomasyon**~~ ✅ 0.4.0 · ~~**Faz 5 — Zekâ**~~ ✅ 0.5.0 · ~~**Faz 6 — Nöbet**~~ ✅ 0.6.0 · ~~**Faz 7 — Cila**~~ ✅ 0.7.x (+ gerçek test kampanyası)

**Bundan sonrası ayrı ve ayrıntılı bir belgede yaşıyor:** komut paletinden **Agent Farm: Open Development Plan** — uzak görüşlü gelişim planı: olay tetikleyicileri, doğrulayıcı adımlar, MCP paneli, n8n/webhook köprüsü, multimedya üretim hattı (Kling/Seedance/Nano Banana sınıfı modellerle içerik fabrikası), zeki gözetim, çoklu makine ve vizyoner ufuk. Kodlama o plandaki öncelik sırasını izler.

## Sürüm Notları

### 2.21.0 — Görev Öngörüsü & Digest Sonuçları, Dalga 4 (2026-07-11)

- **Task Forecast:** sonraki 7 günün zamanlı koşuları + kuyruk + çalışanlar, her koşuda 30g medyan süre/başarı; tahmini ajan-süresi. Tasks başlığındaki takvim ikonu. Bkz. [Görev Öngörüsü](#gorev-ongorusu-forecast).
- **Günlük digest'e görev sonuçları:** günlük özet kartına "Bugün biten: X✓ Y✗ — hata: …" satırı.
- Dolar-maliyet tahmini bilinçli ertelendi (görev başına token maliyeti izlenmiyor); forecast süre/başarı öngörür. **Tasks yol haritası (Dalga 1-4) tamamlandı.**

### 2.20.0 — Paralel Adımlar & Fan-in, Dalga 3b (2026-07-11)

- **Parallel adım grupları:** ardışık `parallel` adımlar aynı anda başlar (fan-out), hepsi bitince çıktıları tek beslemede birleşip sonraki adıma geçer (fan-in). Her dalın kendi runIf'i; grup hatasında ilk adımın onFail'i. Lineer motorla tam geriye uyumlu (bayraksız adımlar bugünkü gibi). Bkz. [Paralel Adımlar](#paralel-adimlar-fan-out--fan-in). Dalga 3 (DAG orkestrasyon) tamamlandı.

### 2.19.0 — Workflow Onay Adımı, Dalga 3a (2026-07-11)

- **Approval gate (insan kapısı):** workflow zincirine onay adımı — o adımda zincir durur, Needs You panelinde/bildirimle onay bekler. Approve → önceki çıktı olduğu gibi geçer; Reject → onFail. Ajan/model yok. Bkz. [Onay Adımı](#onay-adimi-insan-kapisi). (Dalga 3'ün ilk yarısı; paralel adım/fan-in ayrı dalga.)

### 2.18.0 — Görev Yaşam Döngüsü Ergonomisi, Dalga 2 (2026-07-11)

Delege edilen işi yönetmek tek tıka indi ([Yeniden Çalıştırma ve Öncelik](#yeniden-calistirma-ve-oncelik)):

- **Retry / Retry with edited prompt:** biten görevi taze kopya olarak yeniden kuyruğa al (isteğe bağlı prompt düzeltmesiyle).
- **Resume workflow from this step:** başarısız workflow zincirini kaldığı adımdan, önceki adımın çıktısını yeniden besleyerek devam ettir — baştan koşma yok.
- **Run Next + öncelik/yaşlanma:** bekleyen görevi kuyruğun önüne al; kuyruk önceliğe göre sıralanır, bekleyen görevler yaşlandıkça öncelik kazanır (açlık önleme).
- **Dedup koruması:** aynı ajana birebir aynı prompt zaten kuyruktaysa Add Task uyarır.

### 2.17.0 — Görev Sağlığı & Analitiği, Dalga 1 (2026-07-11)

Skills/MCP/hafızanın "bir bakışta + sağlık" olgunluğu görev sistemine taşındı. Kaynak: canlı görev listesi + `task-history` arşivi birleşimi ([Görev Sağlığı](#gorev-sagligi)).

- **Ajan Detayında "Task health" kartı:** 30 günlük karne — koşular (✓/✗/iptal), başarı yüzdesi, medyan süre, retry/verify, kaynak dökümü, medya maliyeti, anlık kuyruk; üst üste başarısızlıkta kırmızı uyarı + son başarısız görev.
- **Yetenek Matrisi'ne Tasks ızgarası:** görev aileleri × ajanlar (retry/tarih gürültüsü normalize edilir); hücre yeşil = hep başarılı, kırmızı = hep başarısız, turuncu halka = karışık; kaynak etiketi (`man/sch/trg/wf`); tıkla → görev tarihçesi.
- **Insights `task` uyarıları:** başarı oranı %50 altına düşen ajan (≥5 koşu) ve son koşuları hep FAILED olan görev ailesi uyarı düşürür.

### 2.16.0 — Hafıza & Nöbet Yönetimi Dalga 3: Birleşik Zekâ (2026-07-11)

- **Yetenek Matrisi'ne iki yeni matris:** *Memory files × Ajanlar* (recall yoğunluğu + **diverjans halkası** — kopya en yeni sürümden sapmışsa turuncu; ＋ ile indeksli kopyalama) ve *Duties × Ajanlar* (kadans/⏸ hücreleri, ＋ ile nöbet kopyalama). Filonun tüm bilgi ve nöbet dokusu tek ekranda.
- **Ajan Detayında "Context health" kartı:** hafıza (dosya/token/orphan/hatırlanmayan/bayat), skills ve MCP kullanım özetleri, nöbet uyumu (DUTIES.md son okuma + haftalık oturum sayısı) — "bu ajanın zihni ne durumda" tek kart. Memory files tablosuna **Recalls 30d** kolonu ve orphan işareti eklendi.
- **Scan Memory Contradictions…:** ucuz modelle hafıza dosyaları arasında çelişki taraması; markdown rapor. Bkz. [Hafıza Yönetimi](#hafiza-yonetimi).
- **Frontmatter denetimi:** description'sız hafıza dosyaları Insights'ta.

### 2.15.0 — Hafıza & Nöbet Yönetimi Dalga 2 (2026-07-11)

- **Memory Graph paneli:** hafıza kayıtlarının `[[wikilink]]` dokusu — düğüm boyu token, yeşil = hatırlanmış, sarı halka = indekste yok; broken links / islands / hubs kartları; düğüme tıkla → dosya. Ayrıntı: [Hafıza Grafiği](#hafiza-grafigi-memory-graph).
- **Fix Memory Index…:** yetim dosyalara pointer ekle + ölü indeks satırlarını düş — seçmeli, yedekli, tek komut.
- **Copy Memory File to Agent…:** dosya + hedef MEMORY.md pointer'ı birlikte.
- **Add Duty from Template…:** kanıtlanmış 4 nöbet kalıbı (soru-cevap döngüsü, inbox tasnifi, haftalık hafıza bakımı, çıktı nöbeti).
- **Automate Duty…:** watch'lu nöbetten tek tıkla watch tetikleyicisi — ajan boştayken de ateşlenir; nöbet yerinde kalır.
- **Copy Duty to Agent… / Move Duty Up-Down:** nöbetleri filoda çoğalt, DUTIES.md sırasını panelden düzenle.

### 2.14.0 — Hafıza & Nöbet Yönetimi Dalga 1 (2026-07-11)

Skills/MCP'ye gelen "bir bakışta gör + tek tıkla yönet" olgunluğu hafıza ve nöbetlere taşındı:

- **Hafıza recall takibi:** Memory bölümü artık `N files • ~X tok • M recalled (30d)`; her dosyada gerçek hatırlanma sayısı/zamanı (`recalled ×5, last 2h` / `not recalled (30d)`), yeşil = kullanılıyor. Recall = ajanın dosyayı araçla açıkça açması (oturum kayıtlarından). Ayrıntı: [Hafıza Yönetimi](#hafiza-yonetimi).
- **Orphan işareti:** MEMORY.md'de referansı olmayan dosya satırda `⚠ orphan`; tooltip'te frontmatter type/description.
- **New Memory File… / Archive Memory File:** frontmatter iskeleti + otomatik indeks satırı; arşivleme `memory/archive/`'e taşır ve indeks satırını yedekli düşürür.
- **Edit Duty…:** nöbet görevini önceden doldurulmuş sihirbazla düzenle (başlık/kadans/watch/do/not) — DUTIES.md'yi elle açmak gerekmez.
- **Watch önizleme:** `3 waiting` tooltip'i artık bekleyen dosya adlarını ve en eskisinin yaşını gösterir.
- **Oturum görüntüleyici varsayılanı:** `maxTranscriptMessages` 400 → **1500**.
- **Ayrıca (2.13.1–2.13.2):** timeline session-start işareti maviye döndü; bazı oturum sayfalarının "Loading…"de takılması düzeltildi (transkriptte `</script>` geçen oturumlar inline script'i bozuyordu — enjeksiyon artık kaçışlı).

### 2.13.0 — Yetenek Yönetiminde Derinlik + Uzun Zaman Aralıkları (2026-07-10)

**Skills & MCP yönetimi — bir bakışta gör, tek tıkla yönet:**

- **Yetenek Matrisi paneli** (yeni): Skills × Ajanlar ve MCP × Ajanlar ızgaraları; 30 günlük kullanım yoğunluğu, özet çipleri, ölü yetenek işaretleri ve boş hücreden tek tıkla kopyalama. Bkz. [Yetenek Matrisi](#yetenek-matrisi).
- **Ağaçta bir-bakışta durum:** MCP/Skills bölüm başlıkları artık `N • M used (30d)` (+ MCP'de `K disabled`); satırlarda son kullanım zamanı; MCP tooltip'inde en çok çağrılan araç dökümü.
- **MCP yönetimi (sağ tık):** Edit MCP Server… (yerinde düzenle, yedekli), Disable/Enable MCP Server (ajanın `disabledMcpjsonServers` listesi), Copy MCP Server to Agent…
- **Skill yönetimi (sağ tık):** Copy Skill to Agent…, Move Skill Between Agent/User Scope…, Reveal Skill Folder.
- **Sağlık bulguları:** açıklamasız SKILL.md uyarısı + kullanılmayan agent-kapsamı skill bilgisi.

**Uzun zaman aralıkları:**

- **Live Timeline** artık **8h** ayrıntı + **24h / 3d / 7d / 30d** yoğunluk görünümü sunuyor. Yoğunluk görünümünde her kulvar zaman dilimlerine bölünüp aktivite çubuklarıyla çizilir (araçlar/komutlar/izin beklemeleri). Olaylar `globalStorage/live-events.jsonl`'e yazıldığı için **reload zaman çizelgesini sıfırlamıyor**; bellekte 24 saat, diskte 31 gün tutulur (64MB tavan). Neden 31 gün: hook olayları daha uzun ölçekte desen taşımaz; uzun vade için Dashboard doğru araç.
- **Dashboard** maliyet aralığına **180g ve 365g** eklendi; 120 günü aşınca çubuklar okunur kalsın diye günlükler haftalık gruplanıyor. Ek yük yok — veri zaten oturum kayıtlarında.

### 2.12.0 — Skill Yönetimi (2026-07-10)

- **Agents ağacına Skills bölümü:** her ajanın altında MCP'nin yanına — Claude Code'un okuduğu aynı klasörlerden (`.claude/skills/` agent kapsamı + `~/.claude/skills/` user kapsamı, agent gölgeler) SKILL.md envanteri; ad, kapsam, açıklama (tooltip) ve **son 30 gündeki gerçek çağrı sayısı** (modelin `Skill` aracı çağrıları + senin yazdığın `/komut` çağrıları oturum kayıtlarından sayılır; yeşil kıvılcım = kullanılıyor). Tıkla → SKILL.md açılır. Ayrıntı: [Skill Yönetimi](#skill-yonetimi).
- **Add Skill… / Remove Skill:** bölümde **+** ad + açıklama sorup `.claude/skills/<ad>/SKILL.md` iskeletini kurar ve açar; çöp ikonu klasörü siler (bir kerelik yedek `.claude/skills.afbak/` altında; user kapsamlı skill silinirken "bütün ajanlar kaybeder" uyarısı modalda).

### 2.11.0 — ↑ Zıplama Düzeltmesi, Model Bazlı Context Tavanı, Damgalı Export (2026-07-10)

- **↑ oku düzeltildi:** tur bandındaki ↑ (ve Turn breakdown tablosunda yukarıdaki bir tura tıklama) hiçbir şey yapmıyordu. Neden: bantlar yapışkan (`position: sticky`) olduğundan geçilmiş her bant tarayıcıya "zaten ekranın tepesindeyim" diyor, `scrollIntoView` da yerinden kıpırdamıyordu. Zıplama artık turun ilk mesajını çapa alıp bant yüksekliği kadar pay bırakarak kaydırıyor — iki yön de çalışıyor.
- **Context now tavanı modele göre:** sabit 200K varsayımı kalktı. Tavan oturumun modelinden bulunur (Fable 5 / Mythos 5 / Opus 4.6–4.8 / Sonnet 4.6+ → 1M; Haiku 4.5 ve eski nesiller → 200K); model tabloda yoksa yüzde/renk yok, sadece ham bağlam boyutu. `agentFarm.contextWindowTokens` varsayılanı artık **0 = otomatik**.
- **Export MD dosya adına zaman damgası:** `session-<id>-YYYY-MM-DD_HHMMSS.md` (yerel saat) — aynı gün içindeki tekrarlı dışa aktarımlar aynı adı önermez.

### 2.10.0 — Terminal Render Çareleri (2026-07-10)

- **Terminal Rendering Fix… komutu:** hayalet boşluk / satır kaybı yaşayanlara tek durak — mevcut ayar durumunu gösterir; render fix (`gpuAcceleration: off` + `smoothScrolling: off`), persistent sessions kapatma, varsayılana dönüş ve tüm terminal ayarlarına kısayol.
- **`agentFarm.externalTerminal`:** Start/Continue/Resume oturumları Windows Terminal'de (yoksa cmd) açılır — uzun claude oturumları xterm.js'e hiç girmez. Farm görevleri izleme için entegre terminalde kalır. Ayrıntı: [Terminal Render Sağlığı](#terminal-render-sagligi).

### 2.9.0 — Export Seçim Kolaylıkları, Tur Gezinmesi, Odak Denetimi (2026-07-10)

2.8.0'a anında gelen geri bildirimin ("toplu seçim ve gezinme söylenmeden gelmeli") karşılığı:

- **Export seçimi her yerden:** Turn breakdown tablosuna tur başına onay kutusu (`md` kolonu) — **bantlardaki kutularla canlı senkron**; satırda **only** (yalnız bu tur), üstte **All / None / Invert** toplu düğmeleri; başlıkta ve Export MD düğmesinde `12/37 in export` sayacı.
- **Tur gezinmesi:** her bantta **↑ ↓** — kaydırmadan önceki/sonraki tura atla (bant yapışkan, oklar hep görünür).
- **Export MD son kaydedilen klasörü hatırlar;** bir sonraki kayıt penceresi oradan açılır.
- **Odak kaybı denetimi (tüm eklenti):** dengeli-parantez taramasıyla 38 QuickPick/InputBox adımının pencere odak kaybında **sessizce kapandığı** bulundu — sihirbaz ortasında akışı mesajsız öldürüyordu ("ajan sorusu hiç gelmedi" deneyiminin en olası nedeni). 38'i de düzeltildi. Ayrıca çapraz doğrulama: tanımlı her komut kayıtlı, her menü referansı geçerli, her sağ-tık `when` koşulu gerçek bir ağaç durumuyla eşleşiyor.
- **Add Trigger ajan sorusu netleşti:** "Which agent runs this task when the trigger fires?" + kurulum onayı hedefi söylüyor ("armed — runs on psikolog…"). Workflow sihirbazındaki "Run now" artık tam olarak yeni kurulan zinciri koşturuyor.

### 2.8.0 — Tur Bantları, MD Dışa Aktarım, Sihirbaz ve Tetik Düzeltmeleri (2026-07-10)

Üçüncü geri bildirim turu:

- **Belirgin tur bantları:** silik `Turn n/m` çizgisi tam genişlikte **renkli ve yapışkan** banda dönüştü — vurgu renkli kenar, kalın tur numarası, komut özeti, token/maliyet. Kaydırırken aktif turun bandı üstte sabit kalır.
- **⬇ Export MD:** görüntüleyicideki **o anki görünüm** Markdown dosyasına iner — Show chip'leri (yalnız Dialog, yalnız Tool calls…), metin filtresi ve replay konumu aynen uygulanır. Her tur bandındaki onay kutusuyla turlar tek tek dahil/hariç edilir. Dosya başına oturum kimliği, toplamlar ve filtre özeti yazılır; kayıt sonrası dosya editörde açılır.
- **Workflow sihirbazı düzeltildi:** `✓ Finish & save workflow` artık adım seçicinin **en üstünde**; adım varken Esc'ye basmak sihirbazı sessizce çöpe atmak yerine **Save / Discard** diye sorar ("workflow oluşturamıyorum" şikâyetinin kökü buydu); adım ortasında vazgeçmek yalnız o adımı iptal eder. Adım sorusundaki "Stop workflow" etiketi netleşti: "If this step fails: stop the workflow" — bu, hata durumu seçimidir, sihirbazı bitirmez.
- **Tetik başına zamanlama:** Add Trigger sihirbazının son adımı **Default timing / Customize timing…** — debounce, cooldown ve saatlik tavan artık her tetik için ayrı ayarlanır. Kurulu tetikte sağ tık → **Edit Trigger**: ad, prompt, hedef ajan ve üç zamanlama alanı panelden düzenlenir; `farm-tasks.json`'ı elle açmak gerekmez.
- **Tetik eylemi netleşti:** "Run a task **on an agent you pick**" (sonraki adımda ajanı sen seçersin) ile "Dispatch — route to the best agent **automatically**" (ajan seçimi bilerek yok; kural + sınıflandırıcı yönlendirir) ayrımı etikette; ajan seçici pencere odak kaybında artık sessizce kapanmıyor.

### 2.7.0 — Oturum Görüntüleyici Cilası (2026-07-10)

İkinci geri bildirim turu — hepsi oturum inceleme deneyimi üzerine:

- **Herhangi bir oturumdan devam:** oturum satırında ⏵ / sağ tık → **Resume Session in Terminal** (`claude --resume <id>`); Oturum Görüntüleyicide sağ üstte **⏵ Resume**. Continue Latest artık tek seçenek değil.
- **Turn breakdown tablosu:** tüm turlar tek tabloda (no, komut özeti, token, maliyet); satıra tıkla → tura atla. Tur muhasebesi düzeltildi: thinking-only asistan adımlarının token'ı artık turuna yazılıyor — tur toplamları oturum toplamını birebir tutuyor (önceden büyük kısmı görünmüyordu).
- **Show filtresi:** All / Dialog / User / Assistant / Tool calls / Results / Errors chip'leri; pasif görünümü de replay akışını da filtreler. "Dialog" = yalnız sen + asistan.
- **Replay çubuğunda ✕ Exit** — çıkış için yukarı kaydırma bitti.
- **Oturum adları insanlaştı:** `<command-name>…` blokları, `/komutlar` ve `!` satırları başlık olmaz; başlık ilk gerçek cümleden gelir (array içerikli yeni transcript formatı da destekli). Tur etiketlerinde komutlar `/clear` gibi kısa adla görünür.
- **Rename Session…:** oturuma kalıcı özel ad ver; boş bırak → otomatik başlık geri gelir.
- Arayüzdeki "Kılavuz" kelimeleri temizlendi (arayüz dili İngilizce).

### 2.6.0 — Gözlemlenebilirlik Cilası (2026-07-10)

İlk gerçek kullanıcı geri bildirimi turu. Dört istek, dört özellik:

- **Tur bazlı token dökümü:** oturum görüntüleyicide her kullanıcı komutu bir tur ayracı açar — `Turn 3/12 · 45.2K tok · $0.31`. Oturum toplamının hangi turda harcandığı artık görünür. Yalnız araç çağıran (metinsiz) asistan adımlarının token'ı da artık kaybolmuyor: ilk araç satırında gösterilir.
- **Context now göstergesi:** son isteğin bağlam boyutu ve `contextWindowTokens` yüzdesi; %70'te sarı + `/compact` önerisi, %90'da kırmızı. Oturum kaydı değiştikçe görüntüleyici kendini **canlı** tazeler; Recent Sessions tooltip'inde de `Context now: ~181.9K tokens` satırı var.
- **Yapışkan replay çubuğu:** replay kontrolleri artık mesajlarla birlikte yukarı kayıp kaybolmuyor — çubuk ekranın üstüne sabitlenir, Pause/hız her an elinin altında.
- **Token lap sayacı:** `Reset Token Lap` komutu kronometre lap'ı / günlük km sayacı gibi ikinci bir sayaç başlatır; durum çubuğunda `⏱ 84.2K`, tooltip'te ayrıntı ve sıfırlama linkleri. `Clear Token Lap` kaldırır. (Son 48 saatlik pencereden beslenir.)
- Ayrıca: Quick Start'a "bölüm görünmüyorsa" notu (VS Code'un gizlenmiş görünümleri hatırlaması).

### 2.5.0 — Ölçek ve Ekosistem / Ultra Faz J (2026-07-09) — ULTRA PLAN TAMAM

- **Paralel worktree koşuları (J1):** `Run Parallel Worktrees…` her istemi kendi git worktree'sinde koşturur (af/ dalları); `Worktree Runs…` ile diffstat + Merge/Open/Discard; eski git sürümü geri düşüşü
- **Canlı relay (J2):** uzak makinede `farmRelay.js` transcript olaylarını senkron dosyasına yazar; `agentFarm.relayFeeds` bu dosyayı canlı monitöre akıtır — uzak ajan WORKING görünür
- **OpenTelemetry dışa aktarım (J3):** oturumlar (subagent ağacı ebeveyn-çocuk span'leriyle) OTLP/JSON — Langfuse/Tempo'ya beslenebilir
- **Agentpack galerisi (J4):** `packGalleryRepos` (git/klasör) → `Browse Agent Pack Gallery…` → güvenli import akışı
- **Çoklu-CLI (J5):** `cliProfiles` ile gemini/codex görevleri ({prompt}/{args} şablonları); derin gözlem Claude'a özgü kalır
- **Sesli brifing (J6):** `Speak Daily Briefing (TTS)` — günlük özet fal.ai TTS ile mp3 olarak telefona/vault'a

### 2.4.0 — Zekâ Derinliği / Ultra Faz I (2026-07-09)

- **Talimat sürümleme (I1):** her CLAUDE.md değişikliği içeriğiyle tarihçeye; `Instruction History & Impact…` sürüm başına oturum/kalite/maliyet korelasyon tablosu ("bu kuraldan sonra kalite ▲0.6")
- **A/B talimat deneyi (I2):** iki varyant izole kum havuzlarında aynı istemlerle koşar (eval vakaları otomatik istem seti olur), hakem rastgele sırayla karşılaştırır; B kazanırsa tek tık kalıcı (.afbak + tarihçe)
- **Hafıza distilasyonu (I3):** şişmiş/bayat memory dosyalarına ucuz model yoğunlaştırma taslağı → diff → onaylı uygulama; limit mesajı/frontmatter kaybı korumaları
- **Semantik hafıza sorgusu (I4):** `Ask Fleet Memory…` — memory/*.md dosyalarında anlam bazlı arama, ajan bazlı sonuç (transcript indeksinden ayrı artımlı indeks)
- **Model politikası (I5):** `agentFarm.modelPolicy` kurallarıyla kaynak/ajan/istem bazlı model yönlendirme + `quotaDowngradePercent` ile pencere dolunca otomatik ucuza düşürme; karar çıktı başlığına yazılır

### 2.3.0 — Güvenlik ve Güvenilirlik / Ultra Faz H (2026-07-09)

- **Guardrail denetçisi (H1):** izin kuralları otomatik denetlenir — bypass modu, tehlikeli kalıplar (`rm -rf`, `curl|sh`, force push…), aşırı geniş kurallar (`Bash(*)`), 30 gündür kullanılmayan joker kurallar, mükerrerler; bulgular Insights'ta, tık = ayar dosyası
- **Tetik karnesi (H2):** tetik satırında `fired 12× • 7d: 9✓/1✗ • start ~4s`; `Trigger Reliability Report` tablosu; "hep fail" ve "hiç ateşlenmemiş" uyarıları
- **Nabız kontrolü (H3):** ajan başına sabit ucuz prompt + kimlik tutarlılığı hakemi; `agentFarm.pulse` nightly/weekly veya elle; FAIL → Insights ⛔
- **Headless servis (H4):** VS Code kapalıyken zamanlama + watch tetiklerini işleten yerel node servisi (schtasks, logon); heartbeat ile çakışmasız devir; çıktılar aynı arşive, "sen yokken N görev koştu" bildirimi

### 2.2.0 — Komuta Merkezi / Ultra Faz G (2026-07-09)

- **Onay kuyruğu (G1):** "Needs You" paneli — izin bekleyenler, tarayıcı onayları (kuyruktan Run/Reject), stalled, bütçe aşımı, Antigravity çakışması, talimat önerileri, park edilmiş görevler tek aciliyet sıralı listede; durum çubuğu rozeti artık kuyruğu sayar ve tıklayınca açar
- **Kanban panosu (G5):** Inbox/Parked/Running/Needs Approval/Done kolonları, sürükle-bırak geçişler, kart rozetleri, üstte doğal dil komuta çubuğu
- **Maliyet anomalisi (G2):** 14 gün medyan+MAD dedektörü (bütçeden bağımsız, model çağrısız) + `Cost Anomaly Report` (ağır toplar: token'ın %50'sini yiyen oturumlar)
- **Eval seti (G3):** düşük puanlı/verify-FAIL izler tek adımda regresyon vakası; onaylı koşu + "12/14 geçti, 2 geriledi" karnesi
- **Oturum replay (G4):** görüntüleyicide ▶ Replay — gerçek aralıklarla adım adım oynatma, hız 1x-8x, hata/prompt atlama
- **Subagent ağacı (G6):** oturum listeleri ağaç oldu; ebeveyn satırında ⧉ maliyet rollup'ı (5 seviye)

### 2.1.0 — Semantik Arama + Tarayıcı Adımları + Ultra Yol Haritası (2026-07-09)

- **Semantik arama (D4 tamam):** arama panelinde "semantic" modu — anlam bazlı sorgu; Gemini API veya OpenAI-uyumlu uç (Ollama ile tamamen yerel olabilir); dosya tabanlı artımlı vektör indeksi, `Build Semantic Index` komutu, benzerlik rozetleri
- **Tarayıcı adımları (F3 tamam):** zincirde Browser step — ajan kendi tarayıcı MCP'siyle koşar; alan adı allowlist'i pazarlıksız (kapsamayan URL hiç çalışmaz), adım başı modal onay varsayılan; onFail kuralları işler
- **ULTRA Gelişim Planı:** internet araştırmasına dayalı ikinci nesil yol haritası (G/H/I/J fazları — onay kuyruğu, maliyet anomalisi, eval seti, kanban pano, guardrail denetçisi…) — `Open Ultra Roadmap` komutu
- Testler: 20 kontrol — sahte embedding sunucusuyla (OpenAI+Gemini şemaları) tam semantik hat, artımlılık/kalıcılık/prune, allowlist ve prompt korumaları

### 2.0.0 — Doğal Dil Komuta ve Dispatcher / Plan Faz F çekirdeği (2026-07-09)

- **🚀 Doğal Dil Komuta:** tek cümle → ucuz model → doğrulanmış plan (görev/zamanlama/zincir) → insan-okur önizleme → onayla kurulum; yalnızca gerçek ajan adları kabul edilir, "yarın" gibi ifadeler o anki tarihe göre çözülür
- **Dispatcher:** tetik eylemi "Dispatch" — gelen işi kurallar (regex→ajan) yönlendirir, tutmazsa ucuz model CLAUDE.md rol özetlerinden seçer; `Test Dispatcher…` ile kurmadan dene
- Faz F durumu: F1+F2 kod olarak tamam; F3 (tarayıcı otomasyonu) tarayıcı MCP + MCP paneliyle bugün de kurulabilir (özel adım tipi ertelendi); F4 (ses döngüsü) mevcut Whisper reçetesi + inbox tetiğiyle karşılanıyor (S20); F5 (çoklu-CLI) düşük öncelikle ertelendi
- Testler: 16 kontrol — plan doğrulama/önizleme, kural yönlendirme; gerçek haiku ile "yarın 09:00" zaman hesabı, 2 adımlı zincir sırası ve sınıflandırıcının doğru ajanı seçmesi

### 1.3.0 — Antigravity Uyumluluğu (2026-07-09)

- **Sync Agent with Antigravity…:** CLAUDE.md → AGENTS.md üretimi (senkron işaretli), aktif nöbetler → `.agents/workflows/` slash-komutları, `.mcp.json` → global gemini yapılandırması için birleştirme önerisi; `memory/` dokunulmaz (iki araç da düz markdown okur)
- **Yönlü senkron:** parmak izi takibiyle hangi tarafın ilerlediği algılanır — Claude→Antigravity tazeleme, Antigravity→Claude geri taşıma (yedekli), çakışmada Diff/yön seçimi; elle düzenlenen dosyalar korunur
- **Insights:** `antigravity` kategorisi — tek taraf ilerlemişse info hatırlatma, iki taraf da değiştiyse warning
- Testler: 27 kontrol — dönüşüm/geri dönüşüm, tam yaşam döngüsü (none→in-sync→ahead→conflict→çözüm), yabancı dosya koruması, sıfır gürültü

### 1.2.0 — Ölçek ve Taşınabilirlik / Plan Faz E (2026-07-09)

- **Çoklu makine:** `extraClaudeDirs` ile diğer makinelerin senkronlu `.claude` klasörleri aynı panelde; oturumlarda ⇄ makine rozeti, cwd ile ajan eşleşmesi, eksik senkron uyarısı
- **Günlük özet kartı:** telefon dostu, model çağrısız günlük karne — `dailyDigest` saatiyle webhook'a (`digest` olayı) veya elle
- **Ajan paketleri:** `.agentpack` dışa/içe aktarım — kimlik+nöbet+araçlar+workflow/tetik/zamanlama tek dosyada; hafıza ve sırlar asla pakete girmez, sır kokan dosyalar otomatik atlanır, içe aktarılan tetik/zamanlamalar kapalı gelir
- **Yayın hazırlığı:** LICENSE (MIT), CHANGELOG.md, README gizlilik beyanı + yayın adımları — Marketplace kararı kullanıcıda
- Testler: 26 kontrol — paket roundtrip/sır dışlama/yol kaçışı/yeniden bağlama, digest içerikleri, çoklu makine taraması gerçek dosyalarla

### 1.1.0 — Zeki Gözetim / Plan Faz D (2026-07-09)

- **Kalite Karnesi:** ucuz model hakem son oturumları 1-5 puanlar; Dashboard ve filo raporunda Quality kolonu; düşüş trendi ve düşük ortalama uyarıları Insights'ta
- **Talimat Önerileri:** takip mesajlarındaki tekrarlanan düzeltmelerden CLAUDE.md kuralı önerisi; Insights'ta 💡, tek tıkla onaylı uygulama (`## Learned rules` bölümü)
- **Haftalık Akıllı Özet:** bütçe-trend-hata-kalite başlıklarının üç cümlelik insan dili özeti; bildirim + vault dosyası + webhook (`summary` olayı)
- **Transcript Arama:** tüm oturum kayıtlarında metin/regex arama paneli (ajan filtresi, vurgulu bağlam, oturuma atlama)
- Otomatik döngüler varsayılan kapalı (`qualitySample`, `suggestScan`, `weeklySummary`) — elle komutlar her zaman açık; iç çağrılar daima ucuz model
- Testler: 28 kontrol — kalite örnekleme/trend, öneri motoru (dedupe + CLAUDE.md'ye ekleme), arama (regex/filtre/sınır), özet; gerçek haiku çağrılarıyla uçtan uca

### 1.0.0 — İçerik Fabrikası / Plan Faz C (2026-07-09)

- **🎬 Medya adımları:** fal.ai kuyruk API'siyle görsel/video/ses üretimi zincirin içinde; varlıklar arşive iner, yanıt sonraki adıma devrolur; anahtarsız/kredisiz durumlar net hatayla yakalanır
- **Medya Galerisi:** önizlemeli panel (görsel/video/ses), model+girdi+maliyet+köken bilgisi, Re-run ve Vary
- **Medya maliyeti:** kural tabanlı tahmin, galeri toplamı ve Dashboard "Media cost" kartı — metin+medya tek karnede
- **Reçeteler:** Metin→Görsel, Metin→Görsel→Video, Ses→Metin hazır şablonları
- **API anahtarı rehberi:** Sır Kasası bölümüne adım adım "anahtar nasıl eklenir" + üç altın kural
- Testler: sahte fal sunucusuyla tam hat (indirme/meta/maliyet/devir) + gerçek fal.ai kimlik-hata yolu (anahtar tanındı, bakiye hatası zarifçe yakalandı)

### 0.9.0 — Dış Dünya Köprüsü / Plan Faz B (2026-07-09)

- **MCP Yönetimi:** ajan başına sunucu envanteri (gerçek 30 günlük kullanım sayılarıyla), panelden ekle/kaldır, kullanılmayan sunucu denetimi
- **Sır Kasası:** anahtarlar OS anahtarlığında; görevlere env enjeksiyonu + `{secret:NAME}` şablonu; düz metin anahtar uyarısı
- **Webhook Köprüsü:** 🌐 webhook adımı (yanıt zincire devrolur), `/trigger/<token>` içeri ucu (`{payload}` değişkeni), n8n/Make/Zapier ile çift yönlü entegrasyon
- **Bildirim Yönlendirme:** izin/takılma/bütçe/zincir olayları seçilebilir filtreli webhook'a JSON POST — telefona düşen filo
- Tümü gerçek HTTP mekanikleriyle test edildi (yerel sunucu + gerçek dinleyici; filo MCP kullanımı gerçek transcript'lerden doğrulandı: obsidian=394 çağrı/30g)

### 0.8.0 — Otomasyon Çekirdeği / Plan Faz A (2026-07-09)

- **Tetikleyiciler:** watch (dosya/klasör değişince) ve hook (canlı olay) tetikleri → görev veya workflow; debounce/cooldown/saatlik tavan fırtına korumaları; `{watch}` değişkeni; Tasks'ta ⚡ Triggers bölümü
- **Doğrulayıcı adımlar:** ucuz-model hakem (PASS/FAIL) + gerekçeli otomatik retry; karar arşive işlenir; `verify pass/fail` rozetleri
- **Yapılandırılmış devir:** JSON output contract, `{prev_text}` ve `{prev_json.alan}` değişkenleri, `json:alan~regex` koşulları; çit/gömülü JSON'a toleranslı ayrıştırıcı (gerçek testin yakaladığı ders)
- **Eşzamanlılık + kota bekçisi:** görev tavanları, "deferred" bekletme ve otomatik pompa; 5h penceresi doluluk eşiğinde otomatik işleri erteleme
- **Görev tarihçesi:** aylık JSONL arşivi (Open Task History), çıktı klasörü boyut tavanı
- Çıkış ölçütü gerçek testle kanıtlandı: inbox'a bırakılan dosya, tetikleyici→zincir→hakem onayı→arşiv döngüsünü elle hiç dokunmadan tamamladı

### 0.7.2 — Gerçek Test Kampanyası (2026-07-08)

- **11 senaryonun tamamı gerçek çalıştırmalarla test edildi** (13 haiku oturumu, $0.17) — Örnek Kullanımlar belgesinde her senaryoya test notu eklendi
- **Düzeltme (runIf):** koşul artık yalnızca modelin çıktısına bakar — eskiden arşiv başlığındaki workflow adı/prompt metni koşulu yanlışlıkla tetikleyebiliyordu (gerçek testin yakaladığı bug)
- **Düzeltme (stdin):** headless görevlerde claude'un 3 saniyelik stdin beklemesi ve arşivlere sızan "no stdin data" uyarısı giderildi — görevler daha hızlı, çıktılar temiz

### 0.7.1 — Örnekler ve Ucuz Otomasyon (2026-07-08)

- **Örnek Kullanımlar belgesi:** 11 adım-adım operasyon senaryosu (`Agent Farm: Open Examples`); kritik akışlar gerçek haiku çalıştırmalarıyla test edildi
- **`agentFarm.taskExtraArgs`:** görev/workflow komutlarına CLI argümanı ekleme — rutin otomasyonu `--model haiku` ile ucuza koşturmanın anahtarı
- Kılavuz paneli artık birden çok belgeyi destekliyor
- Ajan kökünde `deneme` alıştırma ajanı (testlerde kuruldu; senaryoların uygulama sahası — istenirse silinebilir)

### 0.7.0 — Cila (2026-07-08)

- **Workflow düzenleyici:** adım düzenle (başlık/prompt/ajan/mod/on-fail/run-if), sırala, ekle, sil; workflow yeniden adlandır — silip kurmak tarih oldu
- **Timeline'da zincirler:** Workflow runs bölümü — her koşu kendi şeridinde, numaralı adım blokları, durum renkleri
- **Haftalık trend uyarıları:** son 7 gün önceki 7 günün `trendAlertFactor` katına ulaşınca Insights uyarısı (ajan + filo)
- **Nöbet uyumu:** Duties başlığında `read 2h ago / never read`; oturum yapıp DUTIES.md'ye hiç bakmayan ajan için uyarı
- **Otomatik raporda çıktılar:** dönemin görev çıktı özeti rapora eklenir (`autoReportIncludeOutputs`)
- **Eklenti ikonu:** Extensions görünümünde Agent Farm artık kendi yüzüyle görünüyor

### 0.6.0 — Nöbet ve Erişilebilirlik (2026-07-08)

- **Nöbet Görevleri (Standing Duties):** ajanla süreklilik anlaşmaları tek sistemde — `DUTIES.md` (ajan okur + panel yönetir), kadanslar (every-turn/session-start/daily/weekly/manual), Watch/Do alanları, sihirbazla ekleme, duraklat/sil, elle düzenleme korunur
- **Bir bakışta durum:** izlenen klasörde biriken dosya sayısı (`3 waiting`), dosyada son değişiklik, kayıp yol uyarısı — Agents ağacında ve ajan detay tablosunda
- **CLAUDE.md entegrasyonu:** referans yoksa onayla otomatik yönerge ekleme; Insights denetimleri (referanssız DUTIES.md, kayıp watch yolu, Do'suz görev)
- **Türkçe Hızlı Başlangıç:** ilk 3 dakika turu, üç temel alışkanlık, 14 maddelik "ne yapmak istiyorsun?" tarif listesi, 30 saniyede kavramlar; `Agent Farm: Quick Start` komutu

### 0.5.0 — Zekâ (2026-07-08)

- **Koşullu dallanma:** adım başına `runIf` (önceki çıktıya regex koşulu; tutmazsa adım atlanır) ve `onFail` (Stop / Continue / Jump to step N); 25 yürütmelik döngü koruması
- **Bütçe uyarıları:** `agentFarm.budgets` ile ajan/filo günlük bütçeleri; %80'de uyarı, aşımda hata + günde bir bildirim; Dashboard'da bütçe çubukları
- **Birleştirme taslağı:** sapmış hafıza kopyalarını tek belgede aç, elle birleştir, `Apply Merged Memory` ile yedekli olarak hepsine yaz
- **Görev Çıktı Özeti:** arşivlenmiş headless çıktıların dönemlik toplu Markdown raporu

### 0.4.0 — Otomasyon (2026-07-08)

- **Çoklu-Ajan İş Akışları:** ajan zincirlerinde otomatik adım geçişi; `{prev_output}` ile önceki adımın çıktısını sonraki ajana devretme; hata durumunda zincir durur
- **Headless çıktı arşivi:** headless görevler arka plan süreci olarak çalışır; çıktı başlık+çıkış kodu+süre ile Markdown'a arşivlenir; Open Task Output
- **Görev şablonları:** Save as Template / New Task from Template; ajana bağlı veya serbest
- **Otomatik filo raporu:** günlük/haftalık, hedef klasöre (Obsidian vault) kendiliğinden yazılır
- **Windows Görev Zamanlayıcı dışa aktarımı:** zamanlanmış görevi VS Code'dan bağımsız çalışan schtasks kaydına çevirir (script + panoya hazır komut)

### 0.3.0 — Koordinasyon (2026-07-08)

- **Tasks görünümü:** ajan başına görev kuyruğu; interactive/headless modlar, başlat/sırala/tamamla/iptal, terminal takibiyle otomatik done/failed, isteğe bağlı otomatik ilerleme (`queueAutoAdvance`)
- **Zamanlanmış görevler:** günlük / haftalık / tek seferlik; VS Code açıkken otomatik tetiklenir, bildirim düşer
- **Sync Shared Memory:** kopya hafıza gruplarını bul, diff'le karşılaştır, tek kaynaktan yedekli senkronla
- **Export Fleet Report:** karşılaştırmalı Markdown karne (cache verimliliği, hata oranı, bağlam yükü…) — Obsidian dostu
- Dashboard'a **Agent comparison** tablosu eklendi

### 0.2.0 — Canlı Gözlem (2026-07-08)

- **Live Timeline paneli:** ajan başına kulvar, araç koşu blokları, olay işaretleri, 15m/1h/4h pencere, canlı "şu an" çizgisi
- **Hook dinleyicisi:** 127.0.0.1 üzerinde yerel HTTP dinleyici; 9 hook olayı (PreToolUse, PostToolUse, UserPromptSubmit, Notification, Stop, SubagentStop, SessionStart, SessionEnd, PreCompact)
- **Install/Remove Live Hooks:** yedekli, mevcut ayarları koruyan güvenli kurulum sihirbazı
- **Durum makinesi:** WORKING / TOOL / PERMISSION? / YOUR TURN / STALLED / IDLE / ENDED
- **Bildirimler:** izin bekleme, takılma (ayarlanabilir eşik), isteğe bağlı tur sonu
- Agents ağacı ve durum çubuğu canlı durumla besleniyor; bekleyen ajan varken durum çubuğu sarıya döner
- Live Feed gerçek zamanlı hook olaylarını gösteriyor (hook yokken transcript'e döner)

### 0.1.0 — İlk sürüm (2026-07-08)

- Agents / Recent Sessions / Insights / Live Feed ağaçları
- Dashboard: KPI'lar, ajan bazlı günlük maliyet, model dağılımı, token tipleri, ısı haritası, 5 saatlik pencere, en pahalı oturumlar
- Ajan Detay Sayfası ve Oturum Görüntüleyici
- 8 kurallı sağlık/optimizasyon motoru
- Maliyet motoru (düzenlenebilir fiyat kuralları, cache ayrımı, tekrar sayım koruması)
- Yeni ajan iskeleti, oturum başlat/devam ettir, durum çubuğu
- Bu kılavuz
