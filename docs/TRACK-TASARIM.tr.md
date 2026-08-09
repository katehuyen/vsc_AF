# Agent Farm — Track sekmesi tasarımı (backlog kalemi P-5)

*Proje sayfasının **Track** sekmesini taslaktan çıkarıp Backlog sekmesiyle aynı
kalibreye getirme tasarımı. Dev-internal belge: Türkçe, çevrilmez.*

---

## 0. Bugün ne var

**Yüzey — taslak.** `media/projects.js → trackHtml()` 56 satır. Kod başlıklı bir
kart, altında oturum satırları, oturum satırında tur düğmeleri (basınca o
transcript o ana açılıyor), en altta Backloglog'dan okunan insan notu. Filtre
yok, arama yok, sıralama yok, görünüm yok, eylem yok, sağ tık yok, boşluk raporu
yok. Host tarafı da (`projectTrackView`) taslak olduğunu kendi yorumunda
söylüyor.

**Veri katmanı — hazır ve sağlam.** `src/core/backlogTrack.ts` şunları taşıyor:

| Parça | Ne yapar |
|---|---|
| Ledger (`_tracks/backlog-track.jsonl`) | Append-only olay defteri: `code · event · ts · session · turn · agent · by · uncertain · note` |
| `TrackEvent` | `touch · doing · done · cancelled · reopen` — `touch` "baktım, bitmedi" demek, tarihin asıl gövdesi |
| `TrackSource` | `agent · panel · outside · backfill` — kaydın nereden geldiği |
| `TrackDoubt` | `multi · none · stale · turn · guess` — atıf neden kesin değil |
| `summarizeCode` | Bir kodun oturum/tur/kapanış özeti |
| `reconcileOutside` | Obsidian'da elle atılmış tik'i sessiz boşluk bırakmadan yakalar |
| `backfillFromHits` | Transcript aramasından geçmişi geri kurar (ipucu ya da hiç) |
| `renderBacklogLog` / `parseBacklogLog` | Makine satırlarını yazar, insanın yazdığı her satırı aynen korur |

Köprüde üç op zaten var: `projects.track` · `projects.tracks` ·
`projects.tracks.backfill`.

**Sonuç: eksik olan mekanizma değil, YÜZEY.** Bu tasarımın konusu da o.

---

## 1. Kalibrasyon — Backlog sekmesi neyi doğru yapıyor

"Aynı ayarda bir şey" demek bir liste değil, bir katman sayısı demek. Backlog
sekmesinin envanteri:

1. **İki katmanlı üst bar** — sayaçlar (open/doing/done/unfiled), dosya yolu,
   `?` yardım balonu, toplu eylemler (⚭ Gather · 🧹 Tidy · 🗄 Archive), Open with
   bölünmüş düğmesi.
2. **Capture kartı** — çok alanlı form: metin + alan + tip + öncelik + boyut +
   parent kutusu + kuyruk pozisyonu + metin araçları. Eksenler repaint'ten sağ
   çıkıyor (arka arkaya kalem girmenin vergisi kalkıyor).
3. **Chip satırı** — alan chip'leri (toplanır, değiştirmez), aile daralması
   chip'i, `⚙ filters (n)`, `clear`.
4. **Katlanır filtre paneli** — tip / öncelik / boyut / "and" satırları; her
   satırın **kendi** ✕'i, sadece o eksen bir şey daraltıyorsa çizilir.
5. **Sorgu satırı** — AFQuery gramerli arama kutusu (içinde ✕), çoklu seçim
   picker'ları, 11 seçenekli sıralama, yön düğmesi, "cut at N chars", `N of M`
   sayacı (daraldığında işaretli).
6. **Next up şeridi** — kuyruğun önü, sürükle-bırak ile yeniden sıralama, `┊`
   kesim işareti, chip başına zengin AFTip hover'ı, stale kuyruk uyarısı.
7. **Satır = editör** — tutamak (kuyruk numarası + bant rengi + sürükleme),
   checkbox, kod (dosyayı **o satırda** açar), metin (kes + `more` + zengin
   hover), rozetler (tip · öncelik · boyut · ▶ started · 📅 due · ✅ closedAt ·
   ↳ parent · ⊂ parts · 🆔 plan · ⛔ blocked · ⚠ warn), eylemler (↗ ✎ ▶ ✕ ↳ ▲▼),
   her rozet bir menü, ▲▼ hover'da 2/3/4/5/10/15/20/uç menüsü, yerinde metin
   düzenleme.
8. **Sağ tık** — `afBacklogRow` bölümü, `when` koşullarıyla (afCoded, afQueued,
   afParts) değişen menü.
9. **Hover sözleşmesi** — `title` yalnız figür okuması, metin olan her şey
   `AFTip`.

Track'in hedefi: **görünüm modu + filtre ekseni + sıralama + satır içi eylem +
sağ tık + zengin hover + kendini anlatan `?` + veri sağlığı** — hepsi.

---

## 2. Track hangi soruları cevaplamalı

Backlog "ne yapılacak" listesidir; Track **"ne yapıldı"** kaydıdır. Cevaplaması
gereken yedi soru:

1. **"Bu daha önce nasıl çözüldü?"** — kod → oturumlar → turlar → transcript'in
   tam o anı. (Bugün yalnız bu var.)
2. **"Bu projede son zamanlarda ne oldu?"** — kronolojik olay akışı.
3. **"O oturum aslında ne yaptı?"** — oturum → o oturumda dokunulan kalemler.
4. **"Kim çalıştı?"** — ajan kırılımı.
5. **"Tahmin tuttu mu?"** — `effort: L` denen kalem kaç tur yedi. Backlog'un
   tahminini Track'in gerçeğiyle karşılaştıran tek yer burası.
6. **"Ne zaman, nerede kapandı, kapanış notu ne?"**
7. **"Bu kayıt ne kadar güvenilir?"** — kaç olay `uncertain`, kaçı `backfill`,
   kaç kodun hiç izi yok. Bir kaydın değeri, deliklerinin bilinmesiyle ölçülür.

---

## 3. Tasarım

### 3.1 Dört görünüm — tek filtre kümesi

Sekmenin üstünde bir görünüm anahtarı. **Filtreler dördünde de aynıdır**: bir
görünümden diğerine geçmek soruyu değiştirir, kapsamı değiştirmez.

| Görünüm | Özne | Cevapladığı soru |
|---|---|---|
| **⬢ Items** (varsayılan) | backlog kodu | "bu kalem nasıl çözüldü" (1, 5, 6) |
| **≡ Timeline** | tek olay | "ne oldu" (2) |
| **⌸ Sessions** | oturum | "o oturum ne yaptı" (3, 4) |
| **⚕ Gaps** | eksik/şüpheli kayıt | "kayıt ne kadar güvenilir" (7) |

### 3.2 Üst bar — sayaçlar figür, düğmeler eylem

`tracked · events · sessions · turns · agents · span · ⚠ uncertain · ○ untracked`

Her sayaç bir hover taşır ve hover **türetilmiş figürlerle** dolar (CONVENTIONS →
Hover: ince tooltip bir hatadır). Örnek — `turns` hover'ı:

```
Turns: 214
Per item: 3.1
Per session: 6.7
Busiest item: U-9 (28 turns)
Busiest session: 9c4d1f2a (41 turns)
```

Yanında: Backloglog yolu + `Open with` bölünmüş düğmesi, ledger yolu (kopyalanır),
`?` yardım balonu ve üç eylem düğmesi (§3.9).

### 3.3 Filtre ekseni

| Eksen | Kontrol | Not |
|---|---|---|
| arama | AFQuery kutusu (içinde ✕) | kod + kalem metni + not + ajan + oturum id + olay notu |
| alan | chip'ler (P·K·S·M·N·B·A·U·X) | backlog'un kendi başlıklarından, toplanır |
| olay | chip'ler (touch·doing·done·cancelled·reopen) | |
| kaynak | chip'ler (agent·panel·outside·backfill) | |
| şüphe | chip'ler (multi·none·stale·turn·guess) + "yalnız şüpheliler" | |
| kalem durumu | chip'ler (open·doing·done·cancelled) | backlog'daki **bugünkü** hâli |
| ajan | çoklu seçim picker (AFFilter.multi) | ad tıklaması = "yalnız bu" |
| tarih | from/to + hazır aralıklar (bugün · 7g · 30g · tümü) | `change`, asla `input` |
| anahtarlar | "notu olan" · "burada kapananlar" · "backfill'i gizle" | |

Daraltmanın görünür olması şart: `N of M` sayacı ve `⚙ filters (n)` rozeti
Backlog'daki gibi. Filtre bir kaydı gizliyorsa bunu ekranda söyleyen bir şey
olmalı — yoksa "kayıtlarım kayboldu" şikâyeti geri gelir.

### 3.4 Sıralama

`last worked` (varsayılan, yeniden eskiye) · `first worked` · `turns` ·
`sessions` · `span` (ilk→son geçen süre) · `code` · `state` · `area` · `closed`.
Yön düğmesi (↑/↓) Backlog'daki ile aynı.

### 3.5 Items satırı — anatomi

```
┌ U-9  [done]  ⊞ 4 sessions · 28 turns · 6 gün   ✅ 9c4d1f2a#3   L→28t ⚠      ↗ ⧉ ✎ ⚕
│ Kalemin metni, kesilir, `more` ile açılır ve zengin hover taşır…
│   ├ `aaaa1111` #11–14 · 5 Ağu 14:02 → 15:40 · developer · touch,doing   [multi]
│   ├ `bbbb2222` #3 · 6 Ağu 09:20 · developer · done — "kök neden bulundu"
│   └ _no session_ · 7 Ağu 11:04 noticed · outside · done
│ ▸ Kapanış notu (Backloglog'dan, salt okunur)
└
```

- **kod** — kalıcı; tıklayınca **backlog dosyasını o kalemin satırında** açar
  (Backlog sekmesindeki `data-blgo` ile aynı sözleşme).
- **durum rozeti** — backlog'daki bugünkü hâli, Backlog'un renkleriyle.
- **özet** — oturum sayısı · tur sayısı · ilk→son aralık.
- **damga** — `9c4d1f2a#3`, kapanışın adresi; tıklayınca o transcript o ana açılır.
- **`L→28t`** — *tahmin karşılaştırması*: `effort` ile gerçekleşen tur sayısı yan
  yana. Sapma büyükse ⚠. Bu, iki dosyanın birleşiminden çıkan ve başka hiçbir
  yerde olmayan tek figür; kalemin varlık sebeplerinden biri.
- **run satırı** — kısa oturum id (tam id hover'da + kopyalanır, **tam oturum sağ
  tık menüsü** `AFSessionCtx.row` ile), tur düğmeleri (her biri kendi `ts`'i ile
  o ana açılır), zaman aralığı (`AFTime`), ajan, olay listesi, şüphe rozeti
  (nedenini söyler), olay notu.
- **run hover'ı** — dürüst türetme: `Session turns: 41 · This item: 5 (12%) ·
  Model: … · Started: … · Agent: …`. **Oturum maliyeti kalem başına bölünmez** —
  bir oturum onlarca kaleme dokunur, bölmek uydurma figür üretir (CONVENTIONS:
  paydası bölmeye değmeyen figürü icat etme).
- **satır eylemleri** — `↗` backlog satırını aç · `⧉` kodu/damgayı kopyala ·
  `✎` bu koda elle olay kaydet · `⚕` yalnız bu kodu backfill et.
- **sağ tık** — yeni `afTrackRow` bölümü.

### 3.6 Timeline satırı

Düz akış, yeniden eskiye. Bir satır = bir `TrackRecord`:

```
6 Ağu 09:20 │ ⬤ done │ U-9 │ bbbb2222 #3 │ developer │ agent │ "kök neden bulundu"
```

Olay tipi renkli bir nokta; kod tıklanır (Items'a o koda odaklanarak geçer);
oturum+tur tıklanır (transcript'e gider); kaynak ve şüphe rozet. Gün başlıkları
araya girer. Bu görünüm "dün ne yaptım" sorusunun cevabı ve Timeline sekmesinden
farkı, **backlog kodu ekseninde** olması.

### 3.7 Sessions satırı

Oturum başına bir kart: kısa id + ajan + tarih + o oturumda dokunulan kod
chip'leri (kapatılanlar işaretli) + tur sayısı + tam oturum sağ tık menüsü +
"transcript'i aç". Bir oturumun **backlog'a ne yaptığının** tek özeti.

### 3.8 Gaps — veri sağlığı

Dört blok, her biri sayı + gerekçe + eylem:

1. **İzi olmayan kodlar** — backlog'da var, ledger'da yok. Liste + `⚕ Backfill
   all` düğmesi. (Şu an bu projede 84 kalemin çoğu bu durumda.)
2. **Şüpheli atıflar** — `uncertain` kırılımı (multi/none/stale/turn/guess), her
   biri "bu ne demek" açıklamasıyla.
3. **Geri kurulmuş satırlar** — `by: backfill` sayısı; gözlemlenenden ayırt
   edilebilir olması bu kaydın güvenilirliğinin şartı.
4. **Oturumsuz kapanışlar** — `loose` kayıtlar: Obsidian'da elle kapatılmış,
   dolayısıyla turu bilinmeyen kalemler.

Backfill **önce önizleme**: `projects.tracks.backfill` preview modunda ne
yazacağını satır satır gösterir, `Apply` ayrı bir düğmedir. Ledger'a yazan bir
işlem tek tıkla olmaz.

### 3.9 Eylemler

| Eylem | Nerede | Host | Köprü |
|---|---|---|---|
| Backloglog'u yeniden kur | üst bar `↻` | `refreshBacklogLog` | **yeni** `projects.backloglog` |
| Geçmişi geri kur (önizle/uygula) | üst bar `⚕` + satır `⚕` | mevcut backfill akışı | `projects.tracks.backfill` |
| Elle olay kaydet | üst bar `✎` + satır `✎` | `recordTrack` (`by: 'panel'`) | `projects.track` |
| Backlog satırını aç | kod, `↗` | `backlogOpenItem` | `projects.backlog.open` |
| Transcript'i o anda aç | tur düğmesi | `agentfarm.openSession` | `sessions.open` |
| Backloglog / ledger'ı aç | üst bar | `openProjectDoc` | `projects.doc.read` |
| Kopyala (kod · oturum id · damga) | satır `⧉` | — | — |

`_REF/agentfarm-dev.md` gereği: panelden tetiklenebilen **yeni** işlev aynı
commit'te köprüye op olarak girer. Burada yalnız bir tane yeni: Backloglog'u
yeniden kurma.

### 3.10 Hover sözleşmesi

- `title` → yalnız figür okuması (`Label: value` satırları).
- `AFTip` → metin olan her şey: kalem metni, kapanış notu, olay notu, oturumun
  açılış prompt'u.
- Sütunun ne anlama geldiği bir kez, başlığında söylenir; her satırda
  tekrarlanmaz.

---

## 4. Veri sözleşmesi — host payload

`projectTrackView(id)` bugünkü dar çıktısının yerine:

```jsonc
{
  "state": "ok",
  "folder": "…",
  "path": "Backloglog.md",              // null = belge yok
  "backlogPath": "Backlog.md",          // kod → satır açmak için
  "ledger": "90_Archive/_tracks/backlog-track.jsonl",
  "events": 135,                        // ledger'daki toplam kayıt
  "truncated": false,                   // TRACK_PAGE_MAX aşıldıysa true
  "areas":  [{ "code": "P", "label": "Projeler" }],
  "agents": ["developer", "manager"],
  "rows": [{
    "code": "U-9", "text": "…", "state": "done", "section": "U — Arayüz",
    "area": "U", "line": 118,           // 1-tabanlı, backlog dosyasındaki
    "priority": "high", "effort": "L", "kinds": ["feat"],
    "parent": null, "children": ["U-20"], "plan": null, "due": null,
    "sessions": 4, "turns": 28, "firstTs": 0, "lastTs": 0,
    "closedTs": 0, "closedBy": "agent", "closedEvent": "done",
    "stamp": "9c4d1f2a#3", "note": "…",       // insanın Backloglog notu
    "doubtful": true, "backfilled": false,
    "sources": ["agent", "panel"],
    "runs": [{
      "session": "…", "short": "aaaa1111", "file": "…/x.jsonl",
      "agent": "developer", "span": "#11–14", "firstTs": 0, "lastTs": 0,
      "uncertain": "multi",
      "turns": [{ "n": 11, "ts": 0 }],
      "events": [{ "event": "touch", "ts": 0, "by": "agent", "note": "…" }]
    }],
    "loose": [{ "event": "done", "ts": 0, "at": "…", "by": "outside", "uncertain": "none", "note": "…" }]
  }],
  "untracked": [{ "code": "K-3", "text": "…", "state": "done", "line": 61 }],
  "sessionInfo": {                      // id → oturumun kendi gerçekleri
    "…": { "file": "…", "agent": "developer", "title": "…",
           "turns": 41, "firstTs": 0, "model": "opus", "cost": 0 }
  },
  "gaps": { "untracked": 71, "uncertain": 6, "backfilled": 0, "noSession": 3 }
}
```

**Neden hepsi bir seferde:** Backlog sekmesindeki takas aynen geçerli — birkaç yüz
satır göndermek ucuz, her chip için gidiş-dönüş pahalı. **Tavan:** ledger
`TRACK_PAGE_MAX = 5000` kaydı aşarsa yalnız en yeni 5000 gönderilir ve
`truncated` bayrağı sayfada söylenir. Sessizce kesmek yok.

**Neden `sessionInfo` ayrı harita:** aynı oturum onlarca satırda geçer; oturumun
gerçeklerini her satıra kopyalamak payload'ı katlar.

---

## 5. Mesajlar

Sayfa → host (`projectsPanel.ts` `onMessage`):

| Mesaj | Argüman | Ne yapar |
|---|---|---|
| `trackRecord` | `code, event, note` | `recordTrack` (`by: 'panel'`) |
| `trackBackfill` | `apply?, code?` | önizleme ya da uygulama |
| `trackRebuild` | — | `refreshBacklogLog` |

Mevcutlar yeniden kullanılır: `openSession` (tur düğmesi), `backlogOpenItem`
(kod), `openDoc` (Backloglog/ledger), `openLink`.

Host → sayfa: `trackBackfill` önizlemesi `{ type: 'trackBackfill', rows, applied }`
olarak döner; sayfa onu bir kartta gösterir.

---

## 6. Yol haritası

| Faz | İş | Dosya |
|---|---|---|
| **F1** | Host payload'u genişlet (§4) + `TRACK_PAGE_MAX` | `src/extension.ts` |
| **F2** | Panel mesajları + `ProjectsPanelDeps` üç yeni yöntem | `src/panels/projectsPanel.ts` |
| **F3** | Köprü: `projects.backloglog` | `src/extension.ts` |
| **F4** | Sayfa iskeleti: durum değişkenleri, görünüm anahtarı, stat bar, `?` | `media/projects.js` |
| **F5** | Filtreler + sıralama + arama + `N of M` | `media/projects.js` |
| **F6** | Items satırı (§3.5) + sağ tık `afTrackRow` | `media/projects.js`, `package.json` |
| **F7** | Timeline görünümü | `media/projects.js` |
| **F8** | Sessions görünümü | `media/projects.js` |
| **F9** | Gaps + backfill önizleme + elle kayıt + rebuild | `media/projects.js` |
| **F10** | CSS | `media/projects.js` (sayfanın kendi stil bloğu) |
| **F11** | Testler + CHANGELOG + sürüm | `test/`, `CHANGELOG.md` |

---

## 7. Testler

- **`test/test_track_page.js`** — DOM-stub, `lib_page_dom.js` üzerinden gerçek
  sayfa kodu. Kanıtlanacaklar: dört görünüm de çiziliyor · filtre eksenleri
  **liste** (toplanıyor, değiştirmiyor) · arama AFQuery gramerinden geçiyor ·
  tur düğmesi doğru `file` + `ts` yolluyor · kod satırı **host'un kendi
  1-tabanlı satırını** kaydırmadan geri veriyor · backfill `Apply` basılmadan
  ledger'a yazan bir mesaj **yollamıyor** · sağ tık yükü doğru anahtarları
  taşıyor.
- **`test/test_bridge.js`** — `projects.backloglog` dispatch'i.
- **`test/test_ctxmenu.js`** — `afTrackRow` bölümünün menüye ulaşması.
- Mevcut `test_backlog_track.js` (çekirdek) ve `test_projects_tabs.js`
  regresyon olarak koşar.

---

## 8. Kararlar ve riskler

1. **Ledger'a UI asla elle yazmaz.** Append-only defter makinenin; panelden gelen
   her şey `recordTrack` üzerinden, `by: 'panel'` damgasıyla geçer. Satır silme,
   düzenleme yok — kayıt düzeltmesi `reopen` olayıyla yapılır.
2. **Backloglog'un insan yazısına dokunulmaz.** Sekme notu **okur**; yazma yalnız
   `renderBacklogLog`'un koruma sözleşmesinden geçer.
3. **Backfill önce önizleme.** Uygulama ayrı düğme, ve her satır `by: backfill` +
   `uncertain: guess` damgalı kalır.
4. **Maliyet kalem başına bölünmez.** Oturumun maliyeti oturumun gerçeğidir;
   kaleme pay biçmek uydurmadır.
5. **Payload tavanı sessiz değildir.** 5000 kayıt aşılırsa sayfa bunu söyler.
6. **Track, Backlog'un kopyası değildir.** Kalemi düzenleme, kuyruk, öncelik
   burada yoktur — o Backlog'un işi. Buradaki tek "backlog eylemi" satırı açmak
   ve o koda odaklanmaktır. İki sekmenin aynı şeyi iki türlü yapması, projeler
   sisteminin daha önce düzeltilmiş hatasıdır.
