'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const AF = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage',
    'muvusoft.agent-farm', 'bridge', 'af.js');
const P = 'prj_9ujsbtzr';

function call(op, args) {
    const f = path.join('.tmp', 'arg-' + Math.random().toString(36).slice(2) + '.json');
    fs.writeFileSync(f, JSON.stringify(args), 'utf8');
    try {
        const out = execFileSync(process.execPath, [AF, op, '@' + f, '-r', '-t', '60000'],
            { encoding: 'utf8' });
        const j = JSON.parse(out);
        console.log(op, '=>', j.ok ? 'ok' : ('FAIL ' + j.error));
    } catch (e) {
        console.log(op, '=> THREW', String(e.stdout || e.message).slice(0, 300));
    } finally { try { fs.unlinkSync(f); } catch { } }
}

call('projects.log', {
    project: P,
    entry: 'v11.18 (3.229.0, paketlendi+kuruldu+doğrulandı) — üç iş. (a) M-19 kalan iki kalemi kapandı ve iki gerçek hata çıkardı: konuşmacıya kadro/muhatap hiç söylenmiyordu (kayıt "Ada → Rev, Cy" diyor, Ada bilmiyor) ve metinsiz dönen tur step.status\'ü done bırakıyordu, bu yüzden lead\'e altı seçenekli replan menüsü hiç gösterilmiyordu. (b) X-46 GERÇEK KOŞU yapıldı (Haiku planner + iki ücretsiz-model OpenCode delegesi): planner message primitive\'ini doğru seçti, konuşma açıldı, tur koştu — ve birim testin bulamayacağı iki hata çıktı: delegenin arşivi ham JSONL akışı olarak mesaj metnine giriyordu (engineReplyText ile tek yerde çözüldü), ve filo bütçesinin park ettiği delegasyon misyonda hiç görünmüyordu (step.held). (c) M-20 COUNCIL kuruldu: kürsü + tavan + yedi adlandırılmış çıkış, ayrı motor değil, turları sıradan M-19 mesajları. Testler 210 dosya / 12 860 kontrol / 0 hata.'
});

call('projects.backlog.check', {
    project: P, code: 'M-19',
    note: 'KAPANDI (v11.17 3.228.0 + v11.18 3.229.0). Kalan iki kalem yapıldı ve ikisi de gerçek hata çıkardı. (1) one-to-many: `to` alanı kayda, satıra ve journal\'a ulaşıyordu ama KONUŞMACIYA hiç ulaşmıyordu — buildSpeakerPrompt artık kadroyu (konuşmacı işaretli) ve muhatabı adlandırıyor. (2) mesaja özel duplicate: dupKey ajan+prompt hash\'liyor, tekrarlanan konuşma turu ise FARKLI prompt üretiyor (devam ettirilen şerit kendi ön sözünü taşır), yani koruma hiç çalışmıyordu — refuseMessage\'a "arada hiçbir şey söylenmemişken aynı tur" reddi eklendi; başarısız turdan sonraki retry tekrar sayılmıyor. YAN BULGU: metinsiz dönen tur msg.state=failed alıyordu ama step.status done kalıyordu, tur mesajı adım durumundan üretildiği için lead\'e retry/revise/replan/skip/ask_user/partial menüsü HİÇ gösterilmiyordu — düzeltildi. UI yüzeyi hâlâ U-65\'in kapsamında, bilerek yapılmadı.'
});

call('projects.backlog.check', {
    project: P, code: 'M-20',
    note: 'KAPANDI (v11.18, 3.229.0). Council ayrı motor DEĞİL: src/core/missionCouncil.ts saf modül + `council` composite primitive. Bir council sıradan bir M-19 konusması açar ve açılış turlarını aynı kararda sipariş eder; ondan sonraki her tur sıradan `message`, yani katılımcı kilidi/ref denetimi/şerit dürüstlüğü/tekrar koruması AYNI olanlar. Eklediği şey: question, chair, maxTurns, ve yedi adlandırılmış çıkış (COUNCIL_EXITS). Lead olmayan bir kürsü GERÇEKTEN kürsülük yapar — başkasının turu kürsünün son mesajını refs\'te adlandırmak zorunda, açılış turu tek istisna. TASARIM SIRASINDA ÇIKAN İKİ GERÇEK HATA: (1) açılış konuşmacıları council brief\'ini alamıyordu (council prepareMessage\'dan SONRA yaratılıyordu; artık önce push, reddedilirse pop), (2) tavana ulaşmış bir council ASLA kapatılamıyordu çünkü kapatan tur da bir tur — artık tavanı aşan tek tura izin var, o da yalnız kapatıyorsa. Oy: tercih oy verenin kendi sözcüğünden okunuyor, okunamıyorsa unclear, beraberlik beraberlik. Köprü: missions.council + missions.status\'ta tek satır. YAPILMAYAN (bilerek): council\'ın graph\'ta tek composite node olarak çizilmesi ve iç transcript/claims/votes ayrıntısının UI yüzeyi — o U-64/U-65 kapsamı. Testler: test/test_mission_council.js, 85 kontrol.'
});

call('projects.track', {
    project: P, code: 'X-46', event: 'touch',
    note: 'İLK GERÇEK UÇTAN UCA KOŞU YAPILDI, KAPANMADI. Kurulu 3.227.0 üstünde gerçek adaptif misyon koşuldu (runId mt49g05dlnfvx): mode adaptive, planner Haiku (planner ZORUNLU Claude — kontrol akışı `claude -p --output-format json` ayrıştırıyor), delegasyonlar OpenCode ücretsiz modellerde (nemotron-3.5-lightning-free / mimo-v2.5-free), permissionMode plan. SONUÇ: planner `message` primitive\'ini doğru seçti, doğru kadroyla konuşma açtı, gerçek konuşma turu koştu ve teslim edildi. ‼️ İKİ GERÇEK HATA ÇIKTI, ikisi de birim testle bulunamazdı ve ikisi de düzeltildi (v11.18): (1) delegenin arşivi ham OpenCode JSONL akışı olarak mesaj metnine giriyordu — sonraki konuşmacıya "öteki ajan şunu dedi" diye 4 KB tasıma belgesi gösterilecekti; engineReplyText (motora anahtarlı, tek yer) ile çözüldü, review/compare/revise malzemesi de aynı yoldan düzeldi. (2) filo günlük bütçesinin park ettiği delegasyon misyonda hiç görünmüyordu: adım her yüzeyde "running", misyon bütün duvar saatini bekleyerek harcadı ve "hard-limit" ile durdu; step.held eklendi. ‼️ KOŞU BÜTÇE KAPISINA TAKILDI: filo günlük bütçesi $487/$300 aşılmıştı, kullanıcı onayıyla geçici $600 yapıldı ve koşu sonrası $300\'e geri alındı. Misyonun kendisi maxMinutes 15\'i park sırasında doldurduğu için hard-limit ile bitti — yani ÇOK TURLU tam bir tartışma (challenge→response→synthesis) henüz gerçek motorlarda koşulmadı. SIRADAKİ: 3.229.0 üstünde, park riski olmayan bir günde, maxMinutes\'i yüksek tutarak tam bir council koşusu.'
});

call('projects.decision.add', {
    project: P,
    title: 'Council ayrı bir motor değil, M-19 konuşmasının üstünde composite bir primitive',
    text: 'M-20 için iki yol vardı: (a) kendi tur protokolü olan bir council motoru, (b) mevcut konuşmanın üstünde yalnız manda taşıyan bir primitive. (b) seçildi. SEBEP: "1. tur A, 2. tur B, 3. tur sentez" henüz kimsenin yaşamadığı bir tartışma hakkında bir tahmindir — ikinci konuşmacı ilk cümlesinde teslim olsa bile 2. ve 3. turlar yine satın alınır, ve transkript müzakere gibi okunur çünkü şekil kimse konuşmadan önce basılmıştır. Bu, M-19\'un yapısal olarak imkânsız kıldığı sahteliğin protokol kılığına girmiş hâlidir. SONUÇ: council yeni bir konuşma biçimi eklemiyor; sıradan bir konuşma açıyor ve ekstra olarak yalnız soru, kürsü, tur tavanı ve yedi adlandırılmış çıkış taşıyor. Turları sıradan `message`, dolayısıyla katılımcı kilidi, ref denetimi, şerit dürüstlüğü ve tekrar koruması tek takım hâlinde kalıyor — iki kopya olsaydı biri diğerinden ayrışırdı. Lead olmayan kürsünün gerçekten kürsülük yapması da aynı ilkeyle çözüldü: kürsünün seçimini anlatı olmaktan çıkarmak için başkasının turu kürsünün GERÇEK mesajını refs\'te adlandırmak zorunda, böylece konuşmacı lead\'in aktarımını değil kürsünün yazdığını okuyor. Ve bir council kendi sorusuna karar verir, hedefe asla: çoğunluk bir success criterion\'un yerine geçseydi kriterler dekoratif olurdu.'
});

call('projects.deliver', {
    project: P,
    what: 'Agent Farm 3.229.0 (v11.18) — X-46 ilk gerçek adaptif koşu + düzeltmeleri, M-20 Council',
    version: '3.229.0',
    date: '2026-08-22',
    where: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm\\dist\\vsix\\agent-farm-3.229.0.vsix (paketlendi, kuruldu, extensions.json ile doğrulandı)'
});
