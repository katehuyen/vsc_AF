# Agent Farm — Kılavuz ve Blueprint

> Bu belge eklentiyle birlikte sürekli geliştirilir. Arayüzdeki her **?** düğmesi seni bu kılavuzun ilgili bölümüne getirir. Komut paletinden `Agent Farm: Open Guide` ile de her an açabilirsin.

## Agent Farm Nedir

Agent Farm, bilgisayarında yaşayan **Claude Code ajanlarının komuta merkezi**dir. Ajanlarını tek panelden görüntüler, yönetir, maliyetlerini hesaplar ve sağlıklarını denetler.

Tamamen yereldir: hiçbir veri makinenden çıkmaz, hiçbir sunucuya bağlanmaz. İki veri kaynağını okur:

1. **Ajan klasörlerin** (`agentFarm.agentRoots` ayarındaki kökler) — içinde `CLAUDE.md` olan her klasör bir ajandır. Kimlik, hafıza, araç ve izin dosyaları buradan okunur.
2. **Claude Code oturum kayıtların** (`~/.claude/projects/*/*.jsonl`) — her oturumun modeli, token kullanımı, araç çağrıları ve zaman damgaları buradan okunur. Oturumlar, çalışma dizinlerine bakılarak ajanlarla eşleştirilir.

## Hızlı Başlangıç

Hiç bilmiyorsan buradan başla. Bu bölüme her an komut paletinden (`Ctrl+Shift+P`) **Agent Farm: Quick Start** yazarak dönebilirsin.

> Bu kılavuzun yanında bir de **Örnek Kullanımlar** belgesi var: gerçek çalıştırmalarla test edilmiş 11 adım-adım operasyon senaryosu (inbox nöbeti, devirli zincir, bağlam diyeti, vault karnesi…). Komut paleti → **Agent Farm: Open Examples**.

### İlk 3 Dakika: Paneli Tanı

1. Sol kenardaki Activity Bar'da **dört düğümlü ağ ikonuna** tıkla — Agent Farm paneli açılır. Beş bölüm görürsün:
   - **Agents** — ajanların; yeşil nokta = şu anda çalışıyor. Ajanı genişlet: kimliği, nöbet görevleri, hafızası, izinleri, oturumları.
   - **Tasks** — ajanlara sıraya koyduğun işler, zamanlanmış görevler, şablonlar ve iş akışları.
   - **Recent Sessions** — filodaki son oturumlar; tıkla → okunur transkript.
   - **Insights** — sağlık bulguları: ne şişmiş, ne kopmuş, ne bayatlamış.
   - **Live Feed** — filodaki son olaylar.
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
| "Şuraya her tur bak" anlaşması | Duties → Add Standing Duty ([detay](#nobet-gorevleri)) |
| Ajanlardaki kopya hafızaları eşitle | Komut paleti → `Sync Shared Memory…` |
| Haftalık karne / vault raporu | `Export Fleet Report` veya otomatik: `autoReport` ayarı |
| Gece işleri ne üretti? | `Export Task Outputs Digest` |
| Bir şey bozuk mu? | Insights görünümü — tıkla, ilgili dosya açılır |

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
| Memory | `memory/` altındaki tüm dosyalar; token tahmini ve son değişiklik zamanı |
| Tools | `tools/` klasöründeki scriptler |
| Permissions | `.claude/settings.local.json` izin özeti |
| Sessions | Son 15 oturum; tıklayınca Oturum Görüntüleyici açılır |

Ajan üzerinde sağ tık menüsü: **Start Claude Session**, **Continue Latest Session**, **Open Agent Detail**, **Open in New Window**, **Reveal in File Explorer**.

### Dashboard

Filonun genel panosu. `Agent Farm: Open Dashboard` komutuyla veya durum çubuğuna tıklayarak açılır.

- **KPI kartları**: aktif ajan sayısı, bugünkü maliyet, seçili aralık maliyeti, oturum sayısı, 5 saatlik pencere, toplam bulgu sayısı.
- **Daily cost by agent**: son 7/14/30/90 günün ajan bazında yığılmış maliyet grafiği. Sağ üstteki aralık seçiciyle değiştirilir.
- **Cost by model**: hangi modele ne kadar harcandığını gösteren halka grafik.
- **Token types**: input / output / cache write / cache read dağılımı. Cache read oranın yüksekse prompt cache verimli çalışıyor demektir — bu iyidir.
- **Activity heatmap**: haftanın günü × saat bazında mesaj yoğunluğu. Çalışma ritmini gösterir.
- **Agent kartları**: durum, bugün/aralık maliyeti, mini trend çizgisi, bulgu rozetleri. Karta tıkla → detay sayfası.
- **Top sessions by cost**: en pahalı oturumlar; satıra tıkla → transkript.

Dashboard, oturum kayıtları değiştikçe kendini otomatik günceller.

### Ajan Detay Sayfası

Tek bir ajanın komuta ekranı:

- Toplam maliyet, oturum başına ortalama, araç çağrısı ve hata sayıları.
- Son 30 günün maliyet grafiği ve model dağılımı.
- **Fixed context load**: her oturumda otomatik yüklenen sabit bağlam (`CLAUDE.md` + `MEMORY.md` + `AGENTS.md`) bütçe çubuğu. Detay için aşağıdaki Sağlık bölümüne bak.
- **Top tools**: ajanın en çok kullandığı araçlar — ajanın gerçekte ne iş yaptığının röntgeni.
- **Health & optimization**: bu ajana özel bulgular; satıra tıklayınca ilgili dosya açılır.
- **Memory files**: boyut, token ve tazelik bilgisiyle hafıza tablosu.
- **Sessions**: tüm oturum listesi; süre, tur, araç, hata, token, maliyet kolonlarıyla.

### Oturum Görüntüleyici

Bir oturumun ham JSONL kaydını okunur konuşmaya çevirir:

- Mesajlar renk kodludur: mavi = kullanıcı, yeşil = asistan, sarı = araç çağrısı, mor = araç sonucu. Hatalı araç sonuçları kırmızı kenarlıkla ve açık halde gelir.
- Her asistan mesajında model, token ve maliyet görünür.
- Üstteki arama kutusu mesajları ve araç adlarını filtreler.
- **Open raw JSONL** ham kaydı editörde açar.
- Çok uzun oturumlarda son N mesaj gösterilir (`agentFarm.maxTranscriptMessages` ayarı, varsayılan 400).

### Insights Ağacı

Tüm filonun sağlık bulguları tek listede: ⛔ hata, ⚠ uyarı, ℹ bilgi. Bulguya tıklayınca ilgili dosya açılır. Bulgular aşağıdaki Sağlık kurallarından üretilir.

### Live Feed

Filodaki son olayların canlı akışı: kullanıcı komutları (prompt), araç çağrıları ve hatalar, ajan adıyla birlikte. Oturum kayıtları değiştikçe kendiliğinden yenilenir. Bir olaya tıklayınca ait olduğu oturum açılır.

### Durum Çubuğu

`🤖 N active • $X today` — aktif ajan sayısı ve bugünkü toplam maliyet. Üzerine gelince 5 saatlik pencere özetini de gösterir. 30 saniyede bir ve her veri değişiminde güncellenir.

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
- Kırmızı dikey çizgi = şu an. Pencere seçici: 15 dakika / 1 saat / 4 saat.
- **Live sessions kartları:** Her oturumun anlık durumu, son komutu, sayaçları; "Open transcript" ile kayda atlanır.
- Panel olay geldikçe kendini günceller.

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

### Görev Ekleme ve Çalıştırma

1. Tasks görünümünde **+** (Add Task): ajan seç → başlık → prompt → mod seç.
2. İki mod var:
   - **Interactive:** `claude "prompt"` — oturum açılır, prompt ilk mesaj olarak gider, sen devam edebilirsin.
   - **Headless:** `claude -p "prompt"` — görevi çalıştırır, çıktıyı terminale basar ve çıkar. Otomasyon için idealdir.
3. Kuyruktaki görevler sırayla bekler; ▶ ile başlatırsın, ↑↓ ile sıralarsın.
4. Görev terminali kapanınca (veya headless komut bitince) görev otomatik **done** olur. Shell integration açıksa çıkış koduna göre **failed** da işaretlenir. İstediğin an ✓ ile elle tamamlayabilirsin.
5. `agentFarm.queueAutoAdvance` ayarını açarsan, bir görev bitince o ajanın kuyruğundaki sıradaki görev kendiliğinden başlar — zincirleme çalışma.

Görev durumları: ○ queued → ⟳ running → ✓ done / ⛔ failed / ⊘ cancelled. Çalışan göreve tıklayınca terminali öne gelir.

### Zamanlanmış Görevler

Tasks görünümündeki takvim ikonuyla (**Add Scheduled Task**) tekrarlayan işler kurarsın:

- **Daily** — her gün belirtilen saatte (örn. sabah 08:30 gün planı)
- **Weekly** — haftanın belirli günü ve saati (örn. Pazar 21:00 haftalık rapor)
- **Once** — tek seferlik, tarih+saat

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

## Çoklu-Ajan İş Akışları

Faz 4'ün en güçlü aracı: **Workflows** — birden çok ajanın sırayla çalıştığı zincirler. `Agent Farm: New Multi-Agent Workflow…` ile kurulur: adım adım ajan + başlık + prompt + mod seçersin.

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

### Workflow Düzenleme

Kurulu bir zinciri silip yeniden kurmana gerek yok (0.7.0):

- **Workflow üzerinde:** ▶ çalıştır, **+** adım ekle, çöp kutusu sil; sağ tık → **Rename Workflow**.
- **Adım üzerinde:** kalem ikonu → **Edit Step…** hangi alanı değiştireceğini sorar (başlık / prompt / ajan / mod / on-fail / run-if); ↑↓ ile sırala; sağ tık → adımı sil.
- Değişiklikler kalıcıdır ve bir sonraki çalıştırmada geçerli olur; süren bir koşuyu etkilemez.

### Zincirlerin Görselleştirilmesi

Live Timeline'da artık **Workflow runs** bölümü var: son 4 saatte koşan her zincir kendi şeridinde, adımlar numaralı bloklar halinde — yeşil = bitti, mavi = çalışıyor, kırmızı = başarısız. Bloğun üzerine gel: adım adı, ajan ve süre. İki ajanın birbirine iş devrettiğini kelimenin tam anlamıyla izlersin.

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

- İzlenen **klasörde** dosya birikmişse: turuncu göz + `3 waiting` — inbox'ta iş var demek.
- İzlenen **dosya** son 24 saatte değişmişse: turuncu göz + `changed 2h ago` — muhtemelen cevap yazdın, ajan henüz işlemedi.
- İzlenen yol **kayıpsa**: kırmızı uyarı + Insights'ta bulgu — klasör taşınmış, görev kopmuş.
- **Duraklatılmış** görevler soluk görünür ve ajan şablon kuralı gereği onları atlar.

Yönetim: göreve sağ tık → **Pause/Resume** (silmeden dondur), **Delete**, **Open DUTIES.md** (elle düzenleme). Ajan detay sayfasında da tam tablo var: başlık, kadans, watch, do, durum.

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

## Maliyet Hesabı

Token kullanımı yerel kayıtlardan okunur ve `agentFarm.pricing` kurallarıyla fiyatlanır (milyon token başına USD; ilk eşleşen regex kazanır):

| Model deseni | Input | Output | Cache Write | Cache Read |
| --- | --- | --- | --- | --- |
| opus | 15 | 75 | 18.75 | 1.50 |
| fable, mythos | 15 | 75 | 18.75 | 1.50 |
| sonnet | 3 | 15 | 3.75 | 0.30 |
| haiku | 1 | 5 | 1.25 | 0.10 |

**Önemli:** Abonelik planında (Pro/Max) bu rakamlar fatura değildir — kullanımının **API karşılığı değeridir**. "Bu ay aboneliğimden ne kadar değer çıkardım?" sorusunun cevabıdır. Fiyat listesi güncellenirse ayarlardan düzelt; eşleşmeyen modeller Dashboard'un altında uyarı olarak listelenir ve 0$ sayılır.

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

| Ayar | Varsayılan | Ne işe yarar |
| --- | --- | --- |
| `agentFarm.agentRoots` | `["D:/zone/agent/ajanlar"]` | Ajan klasörlerinin tarandığı kökler |
| `agentFarm.claudeDir` | boş (`~/.claude`) | Claude Code veri dizini |
| `agentFarm.activeThresholdSeconds` | 150 | Bu süre içinde kaydı değişen oturum "aktif" sayılır |
| `agentFarm.staleMemoryDays` | 45 | Bayat hafıza eşiği |
| `agentFarm.contextBudgetTokens` | 8000 | Sabit bağlam yükü bütçesi |
| `agentFarm.windowTokenLimit` | 0 (kapalı) | 5 saatlik pencere limiti (yüzde çubuğu için) |
| `agentFarm.maxTranscriptMessages` | 400 | Oturum görüntüleyicide gösterilen en fazla mesaj |
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
| `agentFarm.autoReport` | off | Otomatik filo raporu: off / daily / weekly |
| `agentFarm.autoReportFolder` | boş | Otomatik raporların yazılacağı klasör (vault) |
| `agentFarm.autoReportDays` | 7 | Otomatik raporun kapsadığı gün sayısı |
| `agentFarm.budgets` | {} | Ajan başına günlük USD bütçe; `"*"` = filo geneli |
| `agentFarm.trendAlertFactor` | 2 | Haftalık maliyet kat eşiği (0 = kapalı) |
| `agentFarm.autoReportIncludeOutputs` | true | Otomatik rapora görev çıktılarını ekle |

## Komutlar

Tümü komut paletinde `Agent Farm:` önekiyle:

- **Open Dashboard** — genel pano
- **Open Guide (Kılavuz)** — bu belge
- **Refresh** — ajanları ve oturumları yeniden tara
- **New Agent** — şablondan yeni ajan iskeleti (CLAUDE.md + memory + .claude)
- **Add Agent Root Folder** — yeni kök klasör ekle
- **Start Claude Session / Continue Latest Session** — ajan klasöründe terminal açıp `claude` başlatır
- **Open Agent in New Window / Reveal in File Explorer**
- **Open Live Timeline** — kulvar görünümü (canlı gözlem)
- **Install Live Hooks / Remove Live Hooks** — canlı gözlem hook'larını kur/kaldır
- **Add Task / Add Scheduled Task** — görev kuyruğu ve zamanlama
- **New Multi-Agent Workflow… / Run Workflow** — çoklu-ajan zincirleri
- **Edit Step… / Add Step / Rename Workflow** — kurulu zinciri düzenleme
- **Save as Template / New Task from Template** — görev şablonları
- **Open Task Output** — headless görev çıktı arşivi
- **Export as Windows Scheduled Task…** — VS Code'dan bağımsız zamanlama
- **Sync Shared Memory… / Apply Merged Memory** — kopya hafıza senkronizasyonu ve elle birleştirme
- **Export Fleet Report (Markdown)** — karşılaştırmalı filo raporu
- **Export Task Outputs Digest (Markdown)** — headless çıktıların toplu özeti
- **Quick Start (Hızlı Başlangıç)** — bu kılavuzun başlangıç bölümünü açar
- **Add Standing Duty / Open DUTIES.md** — nöbet görevi yönetimi

## Veri ve Gizlilik

- Eklenti **hiçbir ağ isteği yapmaz**. Tüm veri diskinden okunur, hiçbir şey yazılmaz (yalnızca "New Agent" komutu senin istediğin iskeleti oluşturur).
- Oturum kayıtlarını Claude Code zaten tutuyor; Agent Farm onları yalnızca okur.
- Ajan eşleştirme kuralı: oturumun çalışma dizini (`cwd`) bir ajan klasörünün altındaysa o ajana sayılır. Kökler dışındaki projeler varsayılan olarak kapsam dışıdır.

## SSS

**Ajanım listede yok.** Klasöründe `CLAUDE.md` var mı? `agentFarm.agentRoots` doğru mu? Sonra **Refresh**.

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

- ~~**Faz 2 — Canlı gözlem**~~ ✅ 0.2.0: hook tabanlı gerçek zamanlı olay akışı, izin/takılma bildirimleri, kulvar zaman çizelgesi.
- ~~**Faz 3 — Koordinasyon**~~ ✅ 0.3.0: görev kuyruğu, zamanlanmış görevler, hafıza senkronizasyon sihirbazı, karşılaştırmalı filo raporu.
- ~~**Faz 4 — Otomasyon**~~ ✅ 0.4.0: çoklu-ajan iş akışları, headless çıktı arşivi, görev şablonları, otomatik vault raporu, Windows Görev Zamanlayıcı dışa aktarımı.
- ~~**Faz 5 — Zekâ**~~ ✅ 0.5.0: koşullu dallanma (runIf + onFail), görev çıktı özeti, bütçe uyarıları, birleştirme taslağı.
- ~~**Faz 6 — Nöbet ve Erişilebilirlik**~~ ✅ 0.6.0: nöbet görevleri sistemi (DUTIES.md), kapsamlı Türkçe Hızlı Başlangıç.
- ~~**Faz 7 — Cila**~~ ✅ 0.7.0: workflow düzenleyici, otomatik raporda çıktı özeti, haftalık trend uyarıları, Timeline'da zincir görselleştirme, nöbet uyum izleme, eklenti ikonu.
- **Sonrası:** birikmiş büyük fikir kalmadı — bundan sonrası kullanım geri bildirimlerinle şekillenecek. Aday küçük işler: nöbet görevlerine watch-değişince-bildirim, session viewer'da dışa aktarma, çoklu makine senaryosu.
- Fikirlerin oldukça bu belge ve eklenti birlikte büyüyecek.

## Sürüm Notları

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
