'use strict';
const fs = require('fs');

const TR = [
'#### 8. Kullanıcı yüzeyi — tek Missions odası, iki çalışma türü (U-64)',
'* **Klasik Misyon:** formun bugüne kadar sorduğu tek şey buydu — lead, ekip, turlar, limitler. Adaptif bir hedef ancak köprüden başlatılabiliyordu.',
'* **Adaptif Objective:** aynı sayfa, aynı form, başında kalıcı bir seçim. ‼️ **Klasik varsayılandır ve hiçbir şeyi değişmez**: alanları, DOM\'u ve gönderdiği mesaj aynıdır ve klasik bir Start **hiç `mode` anahtarı göndermez** — host `adaptive` dizesinden başka her şeyi klasik okur, dolayısıyla anahtarın yokluğu cevabın kendisidir. Adaptif tarafta temel görünüm bir sonucun üç sorusunu sorar (**ne elde etmek istiyorsun**, run\'ın **yapmaması gerekenler**, sonucun **nasıl yargılanacağı**); zaten varsayılanı olan her şey — lead, havuz, workdir, limitler, motorlar, onay kapısı — **Advanced** katının altındadır. Kriter varsayılan olarak `required`\'dır (kimsenin başarısız olamayacağı bir hedef, hedef değildir) ve her biri koşu boyunca değişmeyen kimliğini (`c1`, `c2`…) taşır; sonraki her evaluation ona bu adla atıf yapar. **Mod değiştirmek formu önce okur:** öteki modda yazılan hiçbir şey silinmez, yalnız gizlenir. **Model ve efor kutuları artık hangi motorda olduklarını bilir** — satırın motoru değişince o motorun canlı kataloğu model kutusuna düşer, efor yeteneği olmayan bir motorda efor kutusu ölü çizilir ve bunu hangi motorun kararlaştırdığını söyler.',
'* **Adaptif koşu detayı** klasik koşuda hiç olmayan yedi bölüm açar — her birinin tek konusu vardır ve hiçbir olgu ikisinde birden yazmaz: **Objective** (her kriterin, başarı kapısının kullandığı bayatlama kuralıyla okunan güncel hükmü), **Strategy** (yürürlükteki yaklaşım + ‼️ her revizyonun **neden** kesildiği — bu yarı yalnızca journal\'da vardır), **Guide next decision** (tek seferlik steer; **nereye** indiğini açıkça söyler: bir sonraki planner sınırı, asla şu an koşan delegasyon), **Cast** (lead\'in runtime\'da **bağladığı** roller — adaptif bir koşunun "ekip"inin olgu olduğu tek yer), **Conversations** (gerçekten söylenmiş mesajları sayan tek satırlık özet), **Evaluations** (bayat olanlar dahil bütün hükümler) ve **Runtime graph** (gerçekte olan, düğüm düğüm, her düğümün fan-in\'iyle — hiçbiri önceden çizilmemiştir). ‼️ **Lead\'in gizli düşünme zinciri çizilmez**; gösterilen her cümle kayda geçmek üzere söylenmiş bir cümledir. Dürüst bir kapanış artık **ulaşamadığını da adlandırır** — başarı kapısının reddettiği kriter kimliklerini.',
'',
''
].join('\n');

const EN = [
'#### 8. The user surface — one Missions room, two kinds of work (U-64)',
'* **Classic Mission:** the only thing this form has ever asked for — a lead, a team, rounds, limits. An adaptive objective could only be started from the bridge.',
'* **Adaptive Objective:** the same page and the same form, with a permanent choice at the top of it. ‼️ **Classic is the default and nothing about it moved**: its fields, its DOM and the message it posts are unchanged, and a classic Start sends **no `mode` key at all** — the host reads anything that is not the exact string `adaptive` as classic, so the absent key IS the answer. On the adaptive side the basic view asks the three questions an outcome is made of (**what you want to end up with**, what the run **may not do**, and **how the result is judged**); everything that already has a default — lead, pool, workdir, limits, engines, approval gate — lives under **Advanced**. A criterion is `required` by default (an objective nobody can fail is not one) and each carries the stable id (`c1`, `c2`…) every later evaluation refers to for the life of the run. **Switching mode reads the form first:** nothing typed in the other one is lost, it is hidden. **And the model and effort boxes now know which engine they are on** — change a row\'s engine and that engine\'s live catalog lands in its model box; an engine with no effort setting draws the box dead and says which engine decided that.',
'* **The adaptive run detail** opens seven sections a classic run does not grow, each with one subject and no fact repeated between them: **Objective** (every criterion with the latest verdict that still speaks for the work, read by the same staleness rule the success gate uses), **Strategy** (the approach in force + ‼️ **why** each revision was cut — the half that exists only in the journal), **Guide next decision** (a one-off steer that says plainly WHERE it lands: the next planner boundary, never the delegation running now), **Cast** (the roles the lead BOUND at runtime — the only place an adaptive run\'s team is a fact), **Conversations** (a one-line summary counting only messages that were really spoken), **Evaluations** (every verdict, stale ones kept) and **Runtime graph** (what actually happened, node by node, with each one\'s fan-in — nothing here was drawn in advance). ‼️ **The lead\'s hidden reasoning is not drawn**; every sentence shown was said for the record. And an honest ending now **names what it did not reach** — the criterion ids the success gate refused on.',
'',
''
].join('\n');

/**
 * Insert AFTER the numbered comparison and BEFORE the separator that closes it.
 * Anchored on the heading that follows, then walked back over the `---` — the
 * blueprints are CRLF files and hard-coding the separator with its line endings
 * is exactly the kind of match that silently finds nothing.
 */
const put = (file, block, heading) => {
    const text = fs.readFileSync(file, 'utf8');
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const h = text.indexOf(heading);
    if (h < 0) { throw new Error('heading not found in ' + file); }
    const sep = text.lastIndexOf('---', h);
    if (sep < 0 || h - sep > 20) { throw new Error('separator not found before the heading in ' + file); }
    const body = block.split('\n').join(eol);
    fs.writeFileSync(file, text.slice(0, sep) + body + text.slice(sep), 'utf8');
    console.log(file + ': section 8 written after 7');
};

put('docs/BLUEPRINT.tr.md', TR, '#### Hangi Durumda Hangisi Tercih Edilmeli?');
put('docs/BLUEPRINT.en.md', EN, '#### Selection Guide: When to Use Which?');
