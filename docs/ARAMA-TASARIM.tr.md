# Agent Farm — Arama çalışma alanı

Bu belge arama sisteminin geçerli sözleşmesidir. Arama; bir sorgu kutusu ve yanına
eklenmiş rozetlerden oluşmaz. Üç kararı sırasıyla alan bir çalışma alanıdır:

1. Sorgu nasıl anlaşılacak?
2. Bir kaydın hangi içeriği aranacak?
3. Hangi oturumlar taranacak?

Sonuç yüzeyi, bu üç kararın ürettiği cevabın kapsamını ve eksik bırakılan önizlemeleri
açıkça gösterir.

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
- Ağır metin taraması yazarken kendiliğinden çalışmaz. Enter veya ana `Search`
  düğmesi aramayı başlatır.
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

Düz tık bir rolü ekler/çıkarır; Ctrl/⌘-tık yalnız o rolü bırakır. Son rol çıkarılırsa
boş ve anlaşılmaz bir kapsam yerine `Conversation` geri gelir. Ek kaynaklar `Memory
notes` ve transcript'i kalmamış `Orphaned events` olarak ayrı seçilir.

## 5. Oturum kapsamı

Ana eksenler daima görünürdür:

- Agent
- Engine
- Project
- Model
- Session id, title or path

İkincil eksenler `More session filters` altında bulunur:

- Started by: insan / otomasyon
- Lane: ana / alt ajan
- Pinned only
- Has errors
- Mesaj tarih aralığı
- Sonuç grup sırası

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

Arama sayfası üç numaralı karttan oluşur:

1. **Ask** — büyük sorgu alanı, Text/Regex/Meaning, kip seçenekleri ve birincil Search.
2. **Choose content** — preset'ler, altı rol kartı, ek kaynaklar.
3. **Narrow sessions** — ana filtreler sürekli görünür, seyrek filtreler ikinci katmanda.

Sonuç özeti dört ayrı rakam gösterir: bulunan, gösterilen, eşleşen oturum, taranan
oturum. Eksik önizleme, zaman aşımı ve parse hatası sarı kapsam notunda yazılır.
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
