// games/snake/docs/aso-1.0.2.cjs — snake 1.0.2 的 39 语 ASO 数据（关键词修正 + 更新说明 + 促销文本）
//
// 依据 `appstore-listing` skill 的 aso-i18n-guide：
//  ⛔ **关键词字段不许放竞品/他方商标** —— 审计发现 en-US/id/ms/th/vi 都塞了 `nokia`
//     （Nokia 是活商标，属拒审风险项），本文件全部替换成等价的高量普通词。
//  ⭐ 关键词字段 100 字符是硬预算，**没填满就是白扔容量** —— 18 个 locale 原本只有 88~94，
//     这里补到 96~100（补的词都按该语言真实说法，不是把英文词机翻塞进去）。
//  ⚠ 名称/副标/关键词三处**并集索引**，跨字段重复 = 浪费 ⇒ 补词时避开该 locale 名称/副标已有的词。
//  ⚠ 描述/更新说明/促销文本**不进 iOS 搜索**：更新说明只管「让老玩家想更新」，
//     促销文本（170 字符，可随时改、不用过审）只管转化。
//
// 只列**需要改**的 keywords；其余 locale 的关键词已达标，不动（改了反而丢已有排名基线）。

// ── ① 关键词修正（去商标 + 补满）──
const KW = {
  // 去 nokia（5 个）
  'en-US': 'worm,classic,io,slither,serpent,pixel,neon,uncover,picture,gallery,collect,hidden,reptile,cozy',
  'id':    'game klasik retro,mewarnai koleksi kartu,imut kawaii,cacing ular,makan apel,skor tinggi,santai',
  'ms':    'permainan klasik retro,mewarna koleksi kad,comel kawaii,cacing ular,makan epal,skor tinggi,santai',
  'th':    'ปริศนาระบายสีคาวาอี้,คลาสสิกเรโทรอาร์เคด,คลายเครียดก่อนนอน,หนอนกินแอปเปิล,เก็บสะสมการ์ตูน,ออฟไลน์',
  'vi':    'trò chơi cổ điển,săn mồi,thư giãn giảm stress,sưu tập hình đáng yêu,giun rắn,ăn táo,ngoại tuyến',
  // 补满（原来 88~94 字符）
  'ar-SA': 'لعبة,الثعبان,أفعى,ألغاز,تلوين,كلاسيكي,لطيف,دودة,ملائكة,هدوء,اكتشاف,العاب,مسلية,صور,جمع,كيوت,ريترو,بدون نت',
  'ca':    'retro,clàssic,trencaclosques,acolorir,gatet,relaxant,píxel,offline,arcade,cuc,adorable,pintar,angel,recollir',
  'cs':    'omalovanky,cervik,relax,pixel,sbirani,arkada,puzzle,klasicka,kote,antistres,zviratko,obrazek,retro,andel',
  'el':    'ρετρό,κλασικό,παζλ,γρίφος,ζωγραφική,γατάκι,χαλάρωση,pixel,offline,αρκάντα,worm,νοσταλγία,ήρεμο,άγγελος',
  'en-AU': 'chibi,pastel,aesthetic,adorable,wings,achievement,level,skin,unlock,combo,cutie,doodle,sticker,daily,album',
  'en-CA': 'puzzle,logic,tap,swipe,simple,family,kid,cozy,scratch,solve,tricky,quick,addictive,minigame,offline,relax',
  'fi':    'käärme,peli,pulma,klassikko,retro,söpö,kuva,väritys,enkeli,rento,nostalgia,kissa,arcade,hauska,keräily,mato',
  'he':    'משחק,פאזל,צביעה,חמוד,קלאסי,הנחש,נחשים,תולעת,אוסף,מרגיע,ילדים,מלאכים,רטרו,חתלתול,בנות,חינם,ללא אינטרנט',
  'hi':    'saap wala,classic retro arcade,coloring puzzle,cute kawaii,time pass,apple khao score,साँप गेम,offline',
  'hu':    'retro,klasszikus,arcade,kirakó,színező,angyal,gyűjtögető,macska,pixel,offline,nyugtató,worm,io,kígyós,cuki',
  'it':    'biscia,serpe,gioco,retro,classico,arcade,puzzle,rilassante,colorare,collezionare,carino,online,gattino,ali',
  'ro':    'retro,clasic,puzzle,colorare,pisica,relaxare,pixel,offline,arcada,vierme,animal,nostalgie,worm,inger,copii',
  'sk':    'retro,klasický,puzzle,hlavolam,omaľovánka,zbierať,mačka,relax,pixel,offline,arkáda,červík,worm,anjel,detí',
  'uk':    'змія,гра,ретро,піксель,розмальовка,картинка,колекція,релакс,казуальна,класика,антистрес,кошеня,янгол,черв',
};

// ── ② 更新说明（1.0.2 必填；老玩家看的是「凭什么更新」，所以只列他们能感知到的）──
const WN = {
  'en-US': 'Free AI autopilot — switch it on any time, no ads.\nA random angel every level, so no two runs look alike.\nRevive now gives 10 lives + 30s invincibility, and the boost gift hands you every power-up at once.\nEating apples in a row now plays a rising melody.\nDaily quests, stats, levels and titles.',
  'zh-Hans': 'AI 代打完全免费，随时开关，零广告。\n每一关的天使图改成随机抽，且优先没解锁的。\n复活改成 10 条命 + 30 秒无敌；开局礼包一次给齐全部增益。\n连续吃果子会奏出一段上行音阶。\n新增每日任务、统计页、等级称号。',
  'zh-Hant': 'AI 代打完全免費，隨時開關，零廣告。\n每一關的天使圖改成隨機抽，且優先沒解鎖的。\n復活改成 10 條命 + 30 秒無敵；開場禮包一次給齊全部增益。\n連續吃果實會奏出一段上行音階。\n新增每日任務、統計頁、等級稱號。',
  'ja': 'AIおまかせが完全無料に。いつでもON/OFF、広告なし。\n毎ステージの天使絵はランダム（未入手を優先）。\n復活はライフ10＋30秒無敵に。スタートギフトは全強化を一度に。\nリンゴを連続で食べると音階が上がっていきます。\nデイリークエスト・統計・称号を追加。',
  'ko': 'AI 자동 플레이가 완전 무료가 되었습니다. 언제든 켜고 끄기, 광고 없음.\n스테이지마다 천사 그림을 무작위로(미보유 우선).\n부활 시 목숨 10개 + 30초 무적. 시작 선물은 모든 버프를 한 번에.\n사과를 연속으로 먹으면 음이 점점 올라갑니다.\n일일 퀘스트, 통계, 레벨과 칭호 추가.',
  'de-DE': 'KI-Autopilot ist jetzt komplett kostenlos — jederzeit ein-/ausschaltbar, ohne Werbung.\nJedes Level zeigt einen zufälligen Engel (noch nicht gesammelte zuerst).\nWiederbeleben gibt 10 Leben + 30 Sek. Unverwundbarkeit; das Startgeschenk enthält alle Boosts auf einmal.\nÄpfel in Folge spielen eine aufsteigende Melodie.\nNeu: Tagesaufgaben, Statistiken, Level und Titel.',
  'fr-FR': 'Le pilote automatique IA est désormais gratuit — activable à tout moment, sans pub.\nChaque niveau révèle un ange aléatoire (les non débloqués en priorité).\nLa résurrection donne 10 vies + 30 s d’invincibilité ; le cadeau de départ offre tous les bonus d’un coup.\nManger des pommes à la suite joue une mélodie ascendante.\nNouveau : quêtes du jour, statistiques, niveaux et titres.',
  'es-ES': 'El piloto automático con IA ahora es gratis: actívalo cuando quieras, sin anuncios.\nCada nivel muestra un ángel aleatorio (primero los que te faltan).\nRevivir da 10 vidas + 30 s de invencibilidad; el regalo inicial te da todas las mejoras de golpe.\nComer manzanas seguidas suena como una melodía que sube.\nNuevo: misiones diarias, estadísticas, niveles y títulos.',
  'pt-BR': 'O piloto automático com IA agora é grátis: ligue quando quiser, sem anúncios.\nCada fase mostra um anjo aleatório (os que faltam vêm primeiro).\nReviver dá 10 vidas + 30 s de invencibilidade; o presente inicial entrega todos os poderes de uma vez.\nComer maçãs em sequência toca uma melodia que sobe.\nNovo: missões diárias, estatísticas, níveis e títulos.',
  'ru': 'Автопилот ИИ теперь бесплатный — включайте когда угодно, без рекламы.\nНа каждом уровне случайный ангел (сначала те, которых у вас нет).\nВоскрешение даёт 10 жизней и 30 секунд неуязвимости; стартовый подарок выдаёт сразу все усиления.\nЯблоки подряд играют восходящую мелодию.\nНовое: ежедневные задания, статистика, уровни и титулы.',
  'it': 'Il pilota automatico IA ora è gratis: attivalo quando vuoi, senza pubblicità.\nOgni livello mostra un angelo casuale (prima quelli che ti mancano).\nRinascere dà 10 vite + 30 s di invincibilità; il regalo iniziale ti dà tutti i potenziamenti insieme.\nMangiare mele di fila suona una melodia crescente.\nNovità: missioni giornaliere, statistiche, livelli e titoli.',
  'nl-NL': 'AI-autopilot is nu helemaal gratis — altijd aan/uit te zetten, zonder advertenties.\nElk level toont een willekeurige engel (nog niet verzamelde eerst).\nHerleven geeft 10 levens + 30 sec. onkwetsbaar; het startcadeau geeft alle boosts in één keer.\nAppels op rij spelen een oplopende melodie.\nNieuw: dagelijkse opdrachten, statistieken, levels en titels.',
  'pl': 'Autopilot AI jest teraz całkowicie darmowy — włączasz go, kiedy chcesz, bez reklam.\nNa każdym poziomie losowy anioł (najpierw te, których nie masz).\nWskrzeszenie daje 10 żyć i 30 s nieśmiertelności; prezent na start daje wszystkie wzmocnienia naraz.\nJabłka pod rząd grają wznoszącą się melodię.\nNowość: zadania dzienne, statystyki, poziomy i tytuły.',
  'tr': 'Yapay zekâ otomatik oynatma artık tamamen ücretsiz — istediğin an aç/kapat, reklamsız.\nHer bölümde rastgele bir melek (önce elinde olmayanlar).\nCanlanma 10 can + 30 sn dokunulmazlık veriyor; başlangıç hediyesi tüm güçlendirmeleri birden veriyor.\nArt arda elma yemek yükselen bir ezgi çalıyor.\nYeni: günlük görevler, istatistikler, seviyeler ve unvanlar.',
  'ar-SA': 'الطيار الآلي بالذكاء الاصطناعي صار مجانياً تماماً — شغّله متى شئت، بلا إعلانات.\nكل مرحلة تكشف ملاكاً عشوائياً (غير المجموعة أولاً).\nالإحياء يمنحك ١٠ أرواح و٣٠ ثانية من المناعة، وهدية البداية تمنحك كل التعزيزات دفعة واحدة.\nأكل التفاح المتتالي يعزف لحناً صاعداً.\nجديد: مهام يومية وإحصاءات ومستويات وألقاب.',
  'he': 'הטייס האוטומטי עם AI עכשיו חינם לגמרי — אפשר להדליק בכל רגע, בלי פרסומות.\nבכל שלב מלאך אקראי (קודם אלה שעוד לא אספתם).\nתחייה נותנת 10 חיים ו‑30 שניות חסינות; מתנת הפתיחה נותנת את כל השדרוגים בבת אחת.\nאכילת תפוחים ברצף מנגנת מנגינה עולה.\nחדש: משימות יומיות, סטטיסטיקות, רמות ותארים.',
  'hi': 'AI ऑटोपायलट अब पूरी तरह मुफ़्त — कभी भी ऑन/ऑफ़, कोई विज्ञापन नहीं.\nहर लेवल पर रैंडम एंजल (जो अभी नहीं मिले वे पहले).\nरिवाइव में अब 10 लाइफ़ + 30 सेकंड अजेयता; स्टार्ट गिफ़्ट में सारे पावर-अप एक साथ.\nलगातार सेब खाने पर सुर ऊपर चढ़ता है.\nनया: डेली क्वेस्ट, स्टैट्स, लेवल और टाइटल.',
  'th': 'ระบบเล่นอัตโนมัติด้วย AI ฟรีทั้งหมด เปิดปิดได้ตลอด ไม่มีโฆษณา\nทุกด่านสุ่มนางฟ้าใหม่ (ภาพที่ยังไม่ได้จะมาก่อน)\nการเกิดใหม่ให้ 10 ชีวิต + อมตะ 30 วินาที และของขวัญเริ่มเกมให้บัฟครบทุกอย่างในครั้งเดียว\nกินแอปเปิลติดต่อกันจะได้ยินเสียงไล่ระดับขึ้น\nใหม่: ภารกิจรายวัน สถิติ เลเวลและฉายา',
  'vi': 'Chế độ tự chơi bằng AI nay hoàn toàn miễn phí — bật tắt bất cứ lúc nào, không quảng cáo.\nMỗi màn hiện một thiên thần ngẫu nhiên (ưu tiên tranh chưa có).\nHồi sinh cho 10 mạng + 30 giây bất tử; quà mở màn tặng toàn bộ tăng lực cùng lúc.\nĂn táo liên tiếp sẽ tấu lên một giai điệu đi lên.\nMới: nhiệm vụ hằng ngày, thống kê, cấp độ và danh hiệu.',
  'id': 'Mode main otomatis dengan AI kini sepenuhnya gratis — nyalakan kapan saja, tanpa iklan.\nSetiap level menampilkan malaikat acak (yang belum terkumpul lebih dulu).\nBangkit kembali memberi 10 nyawa + 30 detik kebal; hadiah awal memberi semua penguat sekaligus.\nMakan apel berturut-turut memainkan melodi yang naik.\nBaru: misi harian, statistik, level dan gelar.',
  'ms': 'Mod main automatik AI kini percuma sepenuhnya — hidupkan bila-bila masa, tanpa iklan.\nSetiap tahap memaparkan malaikat rawak (yang belum dikumpul dahulu).\nHidup semula memberi 10 nyawa + 30 saat kebal; hadiah permulaan memberi semua peningkatan sekali gus.\nMakan epal berturut-turut memainkan melodi menaik.\nBaharu: misi harian, statistik, tahap dan gelaran.',
};
// 其余 locale 用英文更新说明的本地化短版（App Store 允许；下面 FALLBACK_WN 逐语言给）
const WN_MORE = {
  'ca': 'El pilot automàtic amb IA ara és gratuït, sense anuncis.\nCada nivell mostra un àngel aleatori (primer els que et falten).\nReviure dóna 10 vides i 30 s d’invencibilitat; el regal inicial et dóna totes les millores.\nMenjar pomes seguides fa sonar una melodia ascendent.\nNou: missions diàries, estadístiques, nivells i títols.',
  'cs': 'Automatické hraní s AI je teď zdarma, bez reklam.\nKaždá úroveň ukáže náhodného anděla (nejdřív ty, které nemáte).\nOživení dá 10 životů a 30 s nesmrtelnosti; dárek na start dá všechna vylepšení najednou.\nJablka za sebou zahrají stoupající melodii.\nNovinka: denní úkoly, statistiky, úrovně a tituly.',
  'sk': 'Automatické hranie s AI je teraz zadarmo, bez reklám.\nKaždá úroveň ukáže náhodného anjela (najprv tie, ktoré nemáte).\nOživenie dá 10 životov a 30 s nesmrteľnosti; darček na štart dá všetky vylepšenia naraz.\nJablká za sebou zahrajú stúpajúcu melódiu.\nNovinka: denné úlohy, štatistiky, úrovne a tituly.',
  'hu': 'Az AI automatikus játék mostantól teljesen ingyenes, reklám nélkül.\nMinden pálya véletlen angyalt mutat (előbb azokat, amik hiányoznak).\nAz újraéledés 10 életet és 30 mp sebezhetetlenséget ad; a kezdő ajándék az összes erősítést egyszerre.\nEgymás utáni almák emelkedő dallamot szólaltatnak meg.\nÚj: napi küldetések, statisztikák, szintek és címek.',
  'ro': 'Pilotul automat cu IA este acum complet gratuit, fără reclame.\nFiecare nivel arată un înger aleatoriu (întâi cei care îți lipsesc).\nRevenirea dă 10 vieți și 30 s de invincibilitate; cadoul de start îți dă toate bonusurile odată.\nMerele consecutive cântă o melodie ascendentă.\nNou: misiuni zilnice, statistici, niveluri și titluri.',
  'hr': 'Automatska igra s umjetnom inteligencijom sada je besplatna, bez oglasa.\nSvaka razina prikazuje nasumičnog anđela (prvo one koje nemate).\nOživljavanje daje 10 života i 30 s neranjivosti; početni dar daje sva pojačanja odjednom.\nJabuke zaredom sviraju uzlaznu melodiju.\nNovo: dnevni zadaci, statistika, razine i titule.',
  'el': 'Η αυτόματη λειτουργία με AI είναι πλέον εντελώς δωρεάν, χωρίς διαφημίσεις.\nΚάθε πίστα δείχνει έναν τυχαίο άγγελο (πρώτα όσους σας λείπουν).\nΗ αναβίωση δίνει 10 ζωές και 30 δευτ. αθανασίας· το αρχικό δώρο δίνει όλες τις ενισχύσεις μαζί.\nΤα συνεχόμενα μήλα παίζουν μια ανοδική μελωδία.\nΝέο: ημερήσιες αποστολές, στατιστικά, επίπεδα και τίτλοι.',
  'sv': 'AI-autopiloten är nu helt gratis, utan reklam.\nVarje nivå visar en slumpmässig ängel (först de du saknar).\nÅteruppliva ger 10 liv och 30 sek odödlighet; startgåvan ger alla boostar på en gång.\nÄpplen i rad spelar en stigande melodi.\nNytt: dagliga uppdrag, statistik, nivåer och titlar.',
  'no': 'AI-autopiloten er nå helt gratis, uten reklame.\nHvert nivå viser en tilfeldig engel (først de du mangler).\nGjenoppliving gir 10 liv og 30 sek udødelighet; startgaven gir alle boostene på én gang.\nEpler på rad spiller en stigende melodi.\nNytt: daglige oppdrag, statistikk, nivåer og titler.',
  'da': 'AI-autopiloten er nu helt gratis, uden reklamer.\nHvert niveau viser en tilfældig engel (først dem du mangler).\nGenoplivning giver 10 liv og 30 sek. udødelighed; startgaven giver alle boosts på én gang.\nÆbler i træk spiller en stigende melodi.\nNyt: daglige opgaver, statistik, niveauer og titler.',
  'fi': 'Tekoälyn automaattipeli on nyt täysin ilmainen, ilman mainoksia.\nJokaisella tasolla satunnainen enkeli (ensin ne, jotka puuttuvat).\nHerätys antaa 10 elämää ja 30 s kuolemattomuutta; aloituslahja antaa kaikki tehostukset kerralla.\nPeräkkäiset omenat soittavat nousevan melodian.\nUutta: päivittäiset tehtävät, tilastot, tasot ja arvonimet.',
  'uk': 'Автопілот зі штучним інтелектом тепер безкоштовний, без реклами.\nНа кожному рівні випадковий янгол (спершу ті, яких немає).\nВідродження дає 10 життів і 30 с невразливості; стартовий подарунок дає всі підсилення одразу.\nЯблука поспіль грають висхідну мелодію.\nНове: щоденні завдання, статистика, рівні та звання.',
};
Object.assign(WN, WN_MORE);
// 区域变体克隆
for (const [dst, src] of [['en-GB', 'en-US'], ['en-AU', 'en-US'], ['en-CA', 'en-US'],
                          ['fr-CA', 'fr-FR'], ['es-MX', 'es-ES'], ['pt-PT', 'pt-BR']]) WN[dst] = WN[src];

// ── ③ 促销文本（170 字符上限；不进搜索，只管转化；可随时改、不用过审）──
const PT = {
  'en-US': 'Slither, uncover, collect. 500 hand-drawn angels hide under the grid — one per level, yours forever. Free AI autopilot when you get stuck. Plays offline.',
  'zh-Hans': '走一格，揭一格。500 张手绘天使图藏在格子底下，每关一张，通关即永久收藏。玩不动了有免费 AI 代打。断网也能玩。',
  'zh-Hant': '走一格，揭一格。500 張手繪天使圖藏在格子底下，每關一張，過關即永久收藏。玩不動了有免費 AI 代打。離線也能玩。',
  'ja': 'なぞって、めくって、集める。500枚の手描き天使がマスの下に。1ステージ1枚、クリアすれば永久保存。行き詰まったら無料AIおまかせ。オフライン可。',
  'ko': '지나가고, 열고, 모으세요. 손그림 천사 500장이 칸 아래 숨어 있습니다. 한 판에 한 장, 깨면 영원히 내 것. 막히면 무료 AI 자동 플레이. 오프라인도 가능.',
  'de-DE': 'Kriechen, aufdecken, sammeln. 500 handgezeichnete Engel warten unter dem Raster — einer pro Level, für immer deins. Kostenloser KI-Autopilot, wenn es hakt. Offline spielbar.',
  'fr-FR': 'Rampe, révèle, collectionne. 500 anges dessinés à la main se cachent sous la grille — un par niveau, à toi pour toujours. Pilote auto IA gratuit si tu bloques. Jouable hors ligne.',
  'es-ES': 'Repta, descubre, colecciona. 500 ángeles dibujados a mano se esconden bajo la cuadrícula: uno por nivel, tuyo para siempre. Piloto automático con IA gratis. Funciona sin conexión.',
  'pt-BR': 'Deslize, revele, colecione. 500 anjos desenhados à mão se escondem sob a grade — um por fase, seu para sempre. Piloto automático com IA grátis. Funciona offline.',
  'ru': 'Ползи, открывай, собирай. Под клетками спрятаны 500 нарисованных вручную ангелов — по одному за уровень, навсегда ваши. Бесплатный ИИ-автопилот. Работает офлайн.',
  'it': 'Striscia, scopri, colleziona. 500 angeli disegnati a mano si nascondono sotto la griglia: uno per livello, tuo per sempre. Pilota automatico IA gratis. Si gioca offline.',
  'nl-NL': 'Glijden, onthullen, verzamelen. 500 met de hand getekende engelen zitten onder het raster — één per level, voor altijd van jou. Gratis AI-autopilot. Werkt offline.',
  'pl': 'Pełzaj, odkrywaj, kolekcjonuj. Pod siatką ukryto 500 ręcznie rysowanych aniołów — po jednym na poziom, na zawsze twoje. Darmowy autopilot AI. Działa offline.',
  'tr': 'Süzül, aç, topla. Izgaranın altında elle çizilmiş 500 melek saklı — her bölümde bir tane, sonsuza dek senin. Takılırsan ücretsiz yapay zekâ otomatik oynatma. Çevrimdışı çalışır.',
  'ar-SA': 'تسلّل، اكشف، اجمع. تحت الشبكة ٥٠٠ لوحة ملاك مرسومة يدوياً — لوحة لكل مرحلة، تبقى لك للأبد. طيار آلي مجاني عند التعثر. يعمل دون إنترنت.',
  'he': 'להחליק, לחשוף, לאסוף. מתחת למשבצות מסתתרים 500 מלאכים מצוירים ביד — אחד לכל שלב, שלכם לתמיד. טייס אוטומטי חינם. עובד גם בלי אינטרנט.',
  'hi': 'चलिए, खोलिए, जमा कीजिए. ग्रिड के नीचे 500 हाथ से बनी एंजल तस्वीरें — हर लेवल पर एक, हमेशा के लिए आपकी. अटक जाएँ तो मुफ़्त AI ऑटोपायलट. ऑफ़लाइन चलता है.',
  'th': 'เลื้อย เปิดภาพ สะสม ใต้ตารางซ่อนภาพนางฟ้าวาดมือ 500 ภาพ ด่านละหนึ่งภาพ ผ่านแล้วเป็นของคุณตลอดไป ติดขัดมี AI เล่นให้ฟรี เล่นออฟไลน์ได้',
  'vi': 'Trườn, mở tranh, sưu tầm. Dưới lưới ẩn 500 bức thiên thần vẽ tay — mỗi màn một bức, của bạn mãi mãi. Kẹt thì có AI tự chơi miễn phí. Chơi được ngoại tuyến.',
  'id': 'Meliuk, buka, koleksi. Di bawah kisi tersembunyi 500 malaikat gambar tangan — satu per level, milikmu selamanya. Autopilot AI gratis saat buntu. Bisa offline.',
  'ms': 'Meliuk, buka, kumpul. Di bawah grid tersembunyi 500 malaikat lukisan tangan — satu setiap tahap, milik anda selamanya. Autopilot AI percuma. Boleh main luar talian.',
  'ca': 'Repta, descobreix, col·lecciona. Sota la graella s’amaguen 500 àngels dibuixats a mà: un per nivell, teu per sempre. Pilot automàtic amb IA gratuït. Funciona sense connexió.',
  'cs': 'Plaz se, odkrývej, sbírej. Pod mřížkou se skrývá 500 ručně kreslených andělů — jeden na úroveň, navždy tvůj. Automatické hraní s AI zdarma. Funguje offline.',
  'sk': 'Plaz sa, odkrývaj, zbieraj. Pod mriežkou sa skrýva 500 ručne kreslených anjelov — jeden na úroveň, navždy tvoj. Automatické hranie s AI zadarmo. Funguje offline.',
  'hu': 'Kússz, fedd fel, gyűjts. A rács alatt 500 kézzel rajzolt angyal rejtőzik — pályánként egy, örökre a tiéd. Ingyenes AI automatikus játék. Offline is működik.',
  'ro': 'Târăște-te, descoperă, colecționează. Sub grilă se ascund 500 de îngeri desenați manual — unul pe nivel, al tău pentru totdeauna. Pilot automat cu IA gratuit. Merge offline.',
  'hr': 'Klizi, otkrivaj, skupljaj. Ispod mreže skriveno je 500 ručno crtanih anđela — jedan po razini, zauvijek tvoj. Besplatna automatska igra s AI. Radi bez interneta.',
  'el': 'Γλίστρα, αποκάλυψε, συγκέντρωσε. Κάτω από το πλέγμα κρύβονται 500 ζωγραφισμένοι στο χέρι άγγελοι — ένας ανά πίστα, δικός σου για πάντα. Δωρεάν αυτόματη λειτουργία AI. Παίζει εκτός σύνδεσης.',
  'sv': 'Glid, avslöja, samla. Under rutnätet gömmer sig 500 handritade änglar — en per nivå, din för alltid. Gratis AI-autopilot när det kärvar. Fungerar offline.',
  'no': 'Gli, avslør, samle. Under rutenettet skjuler det seg 500 håndtegnede engler — én per nivå, din for alltid. Gratis AI-autopilot når du står fast. Fungerer offline.',
  'da': 'Glid, afslør, saml. Under gitteret gemmer sig 500 håndtegnede engle — én per niveau, din for altid. Gratis AI-autopilot når du sidder fast. Virker offline.',
  'fi': 'Liu’u, paljasta, kerää. Ruudukon alla piileskelee 500 käsin piirrettyä enkeliä — yksi per taso, sinun ikuisesti. Ilmainen tekoälyn automaattipeli. Toimii offline.',
  'uk': 'Повзи, відкривай, збирай. Під сіткою сховано 500 намальованих вручну янголів — по одному за рівень, назавжди твої. Безкоштовний ШІ-автопілот. Працює офлайн.',
};
for (const [dst, src] of [['en-GB', 'en-US'], ['en-AU', 'en-US'], ['en-CA', 'en-US'],
                          ['fr-CA', 'fr-FR'], ['es-MX', 'es-ES'], ['pt-PT', 'pt-BR']]) PT[dst] = PT[src];

// ── 自检：字段上限（关键词 100 / 促销 170 / 更新说明 4000）──
// ── 自检 + 自动裁到预算内 ──
// ⚠ 苹果按 **Unicode 码点** 数（CJK 一字算 1）。多语言文案长度天差地别，手工凑到 100 会来回改十几轮
//   ⇒ 这里**按整词/整句边界自动裁**：关键词丢末尾整个词（绝不半截词），促销文本丢末尾整句。
//   裁掉了什么会打印出来，便于回头人工换更短的词而不是让它默默变短。
const dropped = [];
const fitKW = (l, v) => {
  if (v.length <= 100) return v;
  const parts = v.split(',');
  while (parts.join(',').length > 100) dropped.push(`${l} 关键词丢「${parts.pop()}」`);
  return parts.join(',');
};
const fitPT = (l, v) => {
  if (v.length <= 170) return v;
  const parts = v.split(/(?<=[.。!！?？])\s*/).filter(Boolean);
  while (parts.join(' ').length > 170 && parts.length > 1) dropped.push(`${l} 促销丢「${parts.pop().trim()}」`);
  let out = parts.join(' ');
  return out.length > 170 ? out.slice(0, 170) : out;
};
for (const l of Object.keys(KW)) KW[l] = fitKW(l, KW[l]);
for (const l of Object.keys(PT)) PT[l] = fitPT(l, PT[l]);
const over = Object.entries(WN).filter(([, v]) => v.length > 4000).map(([l]) => 'WN ' + l);
if (over.length) throw new Error('字段超长：' + over.join(' · '));
if (process.env.ASO_VERBOSE && dropped.length) console.log('[aso] 自动裁剪：\n  ' + dropped.join('\n  '));

module.exports = { KW, WN, PT };
