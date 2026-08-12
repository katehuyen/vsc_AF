# Agent Farm — Arama motoru ve kompakt kontrol paneli

Bu belge arama sisteminin geçerli sözleşmesidir. Arama sayfası bir sihirbaz değildir;
sorgu ile sonuç arasına ayrı aşamalar ve büyük seçim kartları koymaz. Tek kompakt
kontrol panelinde üç karar aynı anda okunur:

1. Sorgu nasıl anlaşılacak?
2. Bir kaydın hangi içeriği aranacak?
3. Hangi oturumlar taranacak?

Bu yoğunluk rozetlerin varlık sebebidir: az dikey alanda çoklu seçim ve zengin kapsam.
Ayrıntılı oturum filtreleri gerektiğinde açılır, sonra yeniden kapanır. Sonuç yüzeyi
panelin hemen altında cevabın kapsamını ve eksik bırakılan önizlemeleri açıkça gösterir.

## 1. Değişmezler

- Filtreler sonuç listesini sonradan elemez; taranacak oturum havuzunu önce daraltır.
- Proje üyeliği ajan adına bakılarak tahmin edilmez. Her oturum için proje çözümleyicisi
  çalışır: açık üyelik → kod kökü → ajan varsayılanı → `Unassigned`.
- Önizleme sınırı eşleşme sınırı değildir. Motor bütün eşleşmeleri sayar; kaçını
  gösterdiğini ve kaçını göstermediğini ayrı döndürür.
- Seçili durum yalnız hover veya renkle anlatılmaz. Dolgu, çerçeve, onay işareti ve
  `aria-pressed=true` birlikte kullanılır.
- Açıklama taşıyan hover yerli `title` kullanmaz. `AFTip` geniş, kaydırılabilir ve
  işaretçinin içine girebildiği paneldir.
- Text ve Regex, kullanıcı yazmayı bıraktıktan 500 ms sonra en az üç karakterle
  kendiliğinden yeniden aranır. `Search` beklenmez; `Ctrl/⌘+Enter` hemen arar.
- Anlam araması ücretli olabileceği için hiçbir filtre değişiminde otomatik çalışmaz.
- Anlam araması metin araması gibi davranıyormuş gibi gösterilmez; kapsamadığı
  seçenekler devre dışıdır ve sınırı görünür bir açıklamada yazılıdır.

## 2. Giriş ve veri akışı

### İnsan yüzeyi

`agentfarm.searchTranscripts` → `src/panels/searchPanel.ts` → `media/search.js`

Arama; Filo, Ajan veya tek Oturum kapsamıyla açılabilir. Açılış kapsamı görünür bir
etiket taşır ve tek hareketle filo kapsamına döner.

### Ajan yüzeyi

Köprü op'u `search.transcripts`, aynı `scopeSessions` ve `searchTranscripts`
fonksiyonlarını kullanır. UI ile köprüde ayrı filtre veya sorgu dili yoktur.

### Akış

```text
sorgu + içerik seçimi + oturum filtreleri
                    │
                    ▼
          gerçek oturum havuzu
         index.allWithExternal()
                    │
                    ▼
      scopeSessions(project resolver)
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
      text / regex          meaning
   searchTranscripts     SemanticIndex
          │                   │
          └─────────┬─────────┘
                    ▼
      found / shown / omitted / failures
                    │
                    ▼
      session cards + exact hit previews
```

## 3. Sorgu biçimleri

### Text

Ortak dil `media/afQuery.js` içindedir ve host da aynı dosyayı yükler.

| Yazım | Anlam |
|---|---|
| `a b` | İki terim de bulunmalı; sıra önemli değil |
| `a OR b` | İkisinden biri bulunmalı; `OR` büyük harftir |
| `-a` | Bu terimi içeren kayıtları dışla |
| `(a OR b) c` | Birleşik seçimi grupla |
| `"session id"` | Kelimeleri birlikte, tam öbek olarak bul |
| `refact*` | Kelimenin devamını serbest bırak |

`Match case` büyük/küçük harfi ayırır. `Whole words`, çıplak kelimeyi daha uzun bir
kelimenin içinde bulmayı durdurur. Türkçe harfler için `\b` değil Unicode harf/sayı
lookaround'u kullanılır.

Sorgu denetimi tek satırlık dar bir input değildir: panelin kalan genişliğini alan,
iki satır yüksekliğinde başlayan ve gerektiğinde 180 px'e kadar büyütülebilen bir
textarea'dır. Yanında sabit genişlikte yalnız ana `Search` düğmesi bulunur.

### Regex

Sorgu doğrudan JavaScript `RegExp` olarak derlenir. Text grameri bu kipte çalışmaz.
Kontrolsüz örüntü için 10 saniyelik tarama bütçesi vardır; bütçe dolarsa sonuç
`timedOut` ve `truncated` olarak işaretlenir.

### Meaning

Anlam araması yalnız semantik indekste bulunan ana-oturum konuşma parçalarını tarar.
Araç çağrıları, araç sonuçları, memory, live event, mesaj tarihi ve indekste olmayan
motorlar bu kipin parçası değildir.

Oturum metadatası filtreleri anlam aramasında da geçerlidir. İzin verilen oturum ID'leri
vektör sıralamasından **önce** uygulanır; global ilk 20 sonucu sonradan elemek yasaktır.
Bu, dar kapsamda geçerli bir sonucun global sıralama yüzünden kaybolmasını önler.

## 4. İçerik kapsamı

Altı transcript rolü vardır:

| Rol | Kaynak |
|---|---|
| `user` | Bir insanın yazdığı prompt |
| `assistant` | Ana ajanın cevabı |
| `delegator` | Bir ajanın başka ajana verdiği iş |
| `handler` | İşi alan alt ajanın cevabı |
| `tool` | Araç adı ve girdisi |
| `toolResult` | Araç sonucu |

Hazır kümeler: `Conversation`, `Delegation`, `Tool trail`, `Everything`.

Hazır kümeler rollerin devamı gibi çizilmez: mor çerçeveli `Quick scope` grubunda
durur; roller ayrı satır/grid alanındadır. Görünen rol adları kısa ve kanoniktir:
`You · Agent · Delegator · Handler · Tools · Results`. Tam anlam ve tıklama davranışı
uzun, kaydırılabilir `AFTip` içindedir.

Düz tık bir rolü ekler/çıkarır; Ctrl/⌘-tık yalnız o rolü bırakır. Son rol çıkarılırsa
boş ve anlaşılmaz bir kapsam yerine `Conversation` geri gelir. Ek kaynaklar `Memory
notes` ve transcript'i kalmamış `Orphaned events` olarak ayrı seçilir.

## 5. Oturum kapsamı

`Agent` seçici ana kontrol panelinde görünür. Geri kalan bütün oturum eksenleri tek
`⚙ Filters (n)` rozetiyle açılıp kapanan ayrıntı panelindedir:

- Engine
- Project
- Model
- Session id, title or path
- Started by: insan / otomasyon
- Lane: ana / alt ajan
- Pinned only
- Has errors
- Mesaj tarih aralığı
- Sonuç grup sırası

Session kutusu bu satırın esnek ana sütunudur; motor/proje/model kutularından önce
kalan alanı alır. `Clear filters`, daraltan bir seçim varsa panel kapalıyken de Filters
yanında görünür. `Reset`, sorgu, kip, içerik, kaynak ve bütün oturum süzgeçlerini tek
hareketle ilk duruma getirir. Rozetlerde onay işareti alanı her durumda ayrılır ve
seçim yazı kalınlığını değiştirmez; bu yüzden tıklamak hiçbir rozeti ya da Filters
düğmesini büyütüp küçültmez.

Bilinen bir oturuma metin araması yapmadan gitmek için üst satırdaki
`Find session ID…`, ana sorguyu başlangıç değeri olarak alıp bütün motorların tüm
oturum indeksini doğrudan tarar. Tam kimlik veya sekiz karakterlik önek yeterlidir.
Motor filtresi, o gün oturumu görünmese bile tek ürün motor kayıt defterindeki dört
yerleşik motoru da daima taşır: Claude, Codex, Gemini ve Antigravity.

Çoklu seçicide `null = hepsi`, `[] = hiçbiri`, `[a,b] = tam bu küme` anlamına gelir.
Seçicideki düğme seçimi kısa gösterir; `AFTip` bütün seçili değerleri, eksenin anlamını
ve kullanım hareketlerini kaydırılabilir panelde gösterir.

## 6. Transcript okuma ve önbellek

`src/core/search.ts`, Claude ve yabancı motor transcript'lerini aynı normalize mesaj
biçimine dönüştürür. Codex/Gemini/Antigravity için Session Viewer'ın kullandığı
`parseCliViewer` verilir; ikinci bir format okuyucusu yazılmaz.

Normalize kayıt:

```ts
{ role, text, ts, turn, turnLabel, tool? }
```

Claude ve yabancı transcript'leri `mtime + size + engine + lane` imzasıyla önbelleğe
alınır. LRU sınırı 80 dosya ve yaklaşık 48 milyon karakterdir. Filtre değişimi aynı
95 MB'ı tekrar tekrar JSON ayrıştırmaz; dosya değiştiğinde imza önbelleği düşürür.

Bir user JSONL kaydındaki birden fazla text block tek turn sayılır. `<` ile başlayan
normal kullanıcı metni korunur; yalnız bilinen sistem zarfı etiketleri dışlanır.
Okunamayan dosyalar sessizce başarı sayılmaz, `parseFailures` olarak döner.

## 7. Sonuç sözleşmesi

`SearchResult` şunları taşır:

- `matchesFound`: taramada bulunan bütün eşleşmeler
- `matchesShown`: döndürülen önizlemeler
- `sessionsMatched`: en az bir eşleşmesi olan oturumlar
- `omittedMatches`: bulunan ama önizlenmeyenler
- `sessionMatches[]`: oturum başına found/shown
- `filesScanned`
- `parseFailures`
- `timedOut` / `truncated`

Filo aramasında oturum başına varsayılan 12, toplamda 250 önizleme vardır. Motor bu
sınırlardan sonra eşleşme saymayı sürdürür. Arayüz bir oturum başlığında `12 of 47
shown`, üst özette `47 found / 12 shown` diyebilir; üç önizlemeyi bütün cevapmış gibi
sunamaz.

Oturum grupları ilk hit zamanıyla değil `sessionTs` ile sıralanır. Bir hit oturum
dosyası, ID'si, motoru, gerçek projesi, mesaj zamanı ve turn bilgisiyle açılır.

## 8. Arayüz sözleşmesi

Arama sayfasının üstünde tek kompakt panel bulunur:

1. İlk ince satır sorgu kutusu ve birincil `Search` düğmesidir.
2. İkinci satır Text/Regex/Meaning, Match case, Whole word, Syntax, açılış kapsamı ve
   Agent seçicisidir.
3. Üçüncü satır hazır içerik kümeleri, altı rol rozeti, Memory/Events ve `⚙ Filters`
   rozetidir.

Bu numaralar arayüzde çizilmez; yalnız yerleşim sözleşmesini tarif eder. Hazır kümeler
ve roller kart değildir, açılıp kapanan kompakt rozetlerdir. Seçili rozet onay işareti,
dolgu, odak çerçevesi ve `aria-pressed` taşır. Uzun açıklama rozetin içinde yer kaplamaz;
zengin, kaydırılabilir `AFTip` içindedir.

Sonuç özeti dört büyük kutu değil tek ince satırdır: bulunan, gösterilen, eşleşen
oturum, taranan oturum. Eksik önizleme, zaman aşımı ve parse hatası sarı kapsam
notunda yazılır. 1180 px render fixture'ında kapalı panel 115 px yüksekliğindedir ve
ilk sonuç yüzeyi sayfanın 219. pikselinde başlar.
Her oturum ayrı karttır; motor rozeti, ajan, başlık, proje, etkinlik zamanı ve o
oturumdaki found/shown sayısı tek başlıkta bulunur.

## 9. Doğrulama

- Sorgu grameri, Unicode whole-word, rol ayrımı ve yabancı motor ayrıştırması
- Oturum başına found/shown hesabı ve global cap
- Birden fazla text block'un tek turn kalması
- Semantik kapsamın top-k öncesi uygulanması
- UI'da her seçimin `aria-pressed` ve kalıcı görsel işareti
- Arama kutusu ve çoklu seçicilerde yerli `title` bulunmaması
- Koyu ve açık temada `test/render_page.js search` görseli
- `search.transcripts` köprü op'unun aynı kapsam ve sayaçları döndürmesi
