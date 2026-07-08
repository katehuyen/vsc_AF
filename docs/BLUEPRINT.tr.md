# Agent Farm — Kılavuz ve Blueprint

> Bu belge eklentiyle birlikte sürekli geliştirilir. Arayüzdeki her **?** düğmesi seni bu kılavuzun ilgili bölümüne getirir. Komut paletinden `Agent Farm: Open Guide` ile de her an açabilirsin.

## Agent Farm Nedir

Agent Farm, bilgisayarında yaşayan **Claude Code ajanlarının komuta merkezi**dir. Ajanlarını tek panelden görüntüler, yönetir, maliyetlerini hesaplar ve sağlıklarını denetler.

Tamamen yereldir: hiçbir veri makinenden çıkmaz, hiçbir sunucuya bağlanmaz. İki veri kaynağını okur:

1. **Ajan klasörlerin** (`agentFarm.agentRoots` ayarındaki kökler) — içinde `CLAUDE.md` olan her klasör bir ajandır. Kimlik, hafıza, araç ve izin dosyaları buradan okunur.
2. **Claude Code oturum kayıtların** (`~/.claude/projects/*/*.jsonl`) — her oturumun modeli, token kullanımı, araç çağrıları ve zaman damgaları buradan okunur. Oturumlar, çalışma dizinlerine bakılarak ajanlarla eşleştirilir.

## Hızlı Başlangıç

1. Sol Activity Bar'da **Agent Farm** ikonuna tıkla (dört düğümlü ağ ikonu).
2. **Agents** ağacında ajanların listelenir. Yeşil nokta = şu anda aktif oturum var.
3. Üstteki grafik ikonuyla (**Open Dashboard**) genel panoyu aç.
4. Bir ajana tıkla → **Ajan Detay Sayfası** açılır.
5. Ajan kartındaki **Start session** ile o ajanın klasöründe yeni bir Claude oturumu başlat.

Alt durum çubuğunda her an şunu görürsün: `🤖 2 active • $1.42 today` — tıklarsan Dashboard açılır.

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

## Komutlar

Tümü komut paletinde `Agent Farm:` önekiyle:

- **Open Dashboard** — genel pano
- **Open Guide (Kılavuz)** — bu belge
- **Refresh** — ajanları ve oturumları yeniden tara
- **New Agent** — şablondan yeni ajan iskeleti (CLAUDE.md + memory + .claude)
- **Add Agent Root Folder** — yeni kök klasör ekle
- **Start Claude Session / Continue Latest Session** — ajan klasöründe terminal açıp `claude` başlatır
- **Open Agent in New Window / Reveal in File Explorer**

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

## Yol Haritası

- **Faz 2 — Canlı gözlem:** Hook tabanlı gerçek zamanlı olay akışı (araç çağrısı anında düşer), takılı ajan/izin bekliyor bildirimleri, kulvar (swim-lane) zaman çizelgesi.
- **Faz 3 — Koordinasyon:** Görev kuyruğu, zamanlanmış görev takvimi, ajanlar arası ortak hafıza senkronizasyon sihirbazı, karşılaştırmalı ajan raporları.
- Fikirlerin oldukça bu belge ve eklenti birlikte büyüyecek.

## Sürüm Notları

### 0.1.0 — İlk sürüm (2026-07-08)

- Agents / Recent Sessions / Insights / Live Feed ağaçları
- Dashboard: KPI'lar, ajan bazlı günlük maliyet, model dağılımı, token tipleri, ısı haritası, 5 saatlik pencere, en pahalı oturumlar
- Ajan Detay Sayfası ve Oturum Görüntüleyici
- 8 kurallı sağlık/optimizasyon motoru
- Maliyet motoru (düzenlenebilir fiyat kuralları, cache ayrımı, tekrar sayım koruması)
- Yeni ajan iskeleti, oturum başlat/devam ettir, durum çubuğu
- Bu kılavuz
