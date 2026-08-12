# X-35 — MULTI MOTOR ADAPTASYONU · kapanış kaydı

**Durum: kapandı.** Devir notunun saydığı altı kod açığı 3.120.0'da giderildi;
paket kuruldu ve doğrulandı. Bu dosya artık bir "kalanlar" listesi değil, işin
nerede bittiğinin kaydıdır. Eski kalanlar metni git geçmişindedir (`dfaaa5c`).

## Mimari karar — değişmedi, sadece kenarları netleşti

`SessionIndex` iki farklı doğru kümeyi korur:

| Çağrı | Anlamı |
| --- | --- |
| `all()` / `forAgent()` | Claude transkript biçimine göre tanımlı ölçüm ve analitikler |
| `allWithExternal()` / `forAgentWithExternal()` | Bütün motorların eksiksiz kayıt/log yüzeyleri |

Bir Sessions tablosu, geçmiş, arama ya da dışa aktarım her motoru listeler.
Maliyet, cache, kalite, MCP/skill/hafıza kullanımı gibi Claude biçimine bağlı bir
analitik Claude kümesinde kalır ve dışarıda bıraktığını açıkça söyler. Yabancı
motorların dürüst sıfırlarını ortalamaya katmak da, kayıt yüzeyinden konuşmaları
saklamak da yanlıştır.

**Bu teslimatın eklediği ayrım:** *canlılık bir ölçüm değil, log olgusudur.*
`isSessionActive` yalnız mtime okur ve her motorun satırı onu dürüstçe taşır;
dolayısıyla `isAgentActive`, `activeAgentIds` ve `activeSessions` bütün motorları
kapsar. Bu, bölünmenin baştan izin verdiği genişleme — her çağıranda ayrı ayrı
değil, kaynağında yapıldı.

## Kapatılan altı açık

1. **Sol ağaç Sessions sayacı** — başlık ile altındaki satırlar tek bir
   `sessionsUnder()` listesinden gelir; kesme sessizce uygulanmak yerine yazılır
   (`15 of 42`), hover motor dağılımını söyler. `src/views/trees.ts`
2. **Turns ayrıntı ve MD export** — tablo `allWithExternal()` ile kurulurken
   arkasındaki her arama `all()` okuyordu: görünen bir Codex turu açılmıyor ve
   export'tan düşüyordu. Dördü de tablonun havuzuna çekildi. Bridge'deki
   `turns.list` op'u da — dört motoru sayan bir `engine` süzgecini Claude-only bir
   havuz üzerinde sunuyordu. `src/panels/turnsPanel.ts`, `src/extension.ts`
3. **Cost Anomaly Report** — "fleet / all sessions / heavy hitters" başlıkları
   artık ortak kapsam cümlesini taşır; heavy-hitter payı "all tokens" yerine
   "measured tokens" der. `src/extension.ts`
4. **Ajan başına Health kapsamı** — kapsam cümlesi mesajın kuyruğu olmaktan
   çıkıp `Insight.scope` alanına taşındı. Kenar çubuğu bulguyu etikette,
   cümleyi hover'da tutar; ajan sayfası tablosunun **üstünde bir kez** yazar
   (her satırda sekiz kez değil). Yalnız gerçekten yabancı oturumu olan ajanda
   görünür. `src/core/health.ts`, `src/views/trees.ts`,
   `src/panels/agentDetail.ts`, `media/agentDetail.js`
5. **Portfolio canlılık fallback'i** — `isAgentActive` kaynağında genişletildi;
   kenar çubuğu noktası, Portfolio, Dashboard kartı, durum çubuğu ve
   `agents.list` aynı cevabı verir. `src/core/sessions.ts`
6. **Sol ağaç yabancı oturum davranışı** — `session-external` baypası kaldırıldı.
   Tek kurucu her satırı çizer; farklar satırın kendi olgularından doğar (cwd yok
   → resume yok, transkript yok → tıklama nedenini motorun diliyle söyler).
   Hover, fiyat bildirmeyen motorda `$0.00` yerine token gösterir.
   `src/views/trees.ts`

## Aynı sınıftan, dokunulurken bulunan ve kapatılanlar

- `agents.list` roster'ı bütün motorları sayar; ölçülen alt küme
  `measuredSessions` olarak ayrıca verilir.
- `projects.sessions` op'u "sayfanın Sessions düğmesinin verisi" diyordu ama o
  sayfadan dar bir küme dönüyordu; artık `sessionsOfProject(..., { withExternal:
  true })` ile aynı listeyi okur, satırlar `engine` taşır.
- Oturum rafı (`sessionShelf`): `pinned()` her motoru kapsarken "Recent" yarısı
  kapsamıyordu — tek listede iki kapsam. Fiyat bildirmeyen motorda token gösterir.
- Filo durumu panosunun son oturum listesi bütün motorları içerir
  (`tokensToday` ölçüm olarak Claude'da kalır).
- Proje track satırları: tur numarası ve oturum eşlemesi yabancı motorda da
  çözülür — aksi hâlde Codex'ten yazılan bir iz hiçbir yere gitmiyordu.

## Doğrulama

- Tam test paketi: **137 dosya · 8303 geçti · 0 başarısız**.
- Ajan sayfası ilk render fixture'ını kazandı (`test/fixtures/agentdetail.js`) —
  dört motorlu bir ajan, bulgular bir kez kapsamlanmış; koyu ve açık temada
  Chromium ile bakıldı.
- `dist/render/**` VSIX'ten çıkarıldı: paket 8.49 MB → **2.39 MB**.
- Paket `dist/vsix/agent-farm-3.120.0.vsix`, kuruldu ve `extensions.json`
  üzerinden **3.120.0** doğrulandı.

## Bilerek yapılmayan

Kod tabanının **yeni baştan tam bir motor denetimi** bu teslimata dahil değildir;
kullanıcı bunu açıkça sonraya bıraktı. `index.all()` çağrılarının geri kalanı
(maliyet toplamları, kalite örneklemesi, semantik indeks, proje maliyet rollup'ı)
ölçüm yüzeyi oldukları için bilinçli olarak Claude kümesinde bırakıldı. Yeniden
bakılacaksa başlangıç noktası: her `index.all()` çağrısı için tek soru — *bu bir
kayıt mı, ölçüm mü?*
