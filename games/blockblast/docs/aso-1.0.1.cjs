// games/blockblast/docs/aso-1.0.1.cjs — Cube Blast 1.0.1 的 39 语商店页数据
//
// 依据 `appstore-listing` skill 的 aso-i18n-guide：
//  ⭐ **只有 name / subtitle / keywords 三处进 iOS 搜索索引**，三者取并集 ⇒ 跨字段重复 = 浪费容量。
//     keywords 是 100 字符硬预算，没填满就是白扔。
//  ⚠ description / whatsNew / promotionalText **不进搜索**：描述管转化，更新说明管「老玩家凭什么更新」，
//     促销文本（170 字符）可随时改、不用过审。
//
// ⛔ 两条命名红线（avoiding-clone-spam-rejection）：
//   1. **商店名绝不能出现 "Block Blast"** —— 那是 Hungry Studio 的活商标 + 爆款。
//      本作叫 "Cube Blast: Block Puzzle"：block 与 blast **分属不同短语、用冒号隔开**。
//      各语言的本地化名同样守这条：blast/爆破 与 block/方块 不许连在一起。
//   2. keywords 里**不许放竞品或他方商标**（block blast / woodoku / tetris 一个都不许）。
//      "block puzzle" / "wood block" 这类是公有品类词，可以用。
//
// ⛔ 措辞红线（DESIGN §2）：公平承诺只能写「块流由种子定死、发牌不看你的棋盘」，
//   **绝不能写成「保证你能赢」「永远发你需要的块」**。

// ── ① 名称（≤30 字符）与副标题（≤30 字符）──
const NAME = {
  'en-US': 'Cube Blast: Block Puzzle', 'en-GB': 'Cube Blast: Block Puzzle',
  'en-AU': 'Cube Blast: Block Puzzle', 'en-CA': 'Cube Blast: Block Puzzle',
  'zh-Hans': '方块爆破：消除拼图', 'zh-Hant': '方塊爆破：消除拼圖',
  'ja': 'キューブブラスト：ブロック', 'ko': '큐브 블라스트: 블록 퍼즐',
  'de-DE': 'Cube Blast: Block-Puzzle', 'fr-FR': 'Cube Blast : Puzzle de blocs',
  'es-ES': 'Cube Blast: Puzle de bloques', 'es-MX': 'Cube Blast: Puzle de bloques',
  'it': 'Cube Blast: Puzzle a blocchi', 'pt-BR': 'Cube Blast: Quebra-blocos',
  'pt-PT': 'Cube Blast: Quebra-blocos', 'ru': 'Cube Blast: блочный пазл',
  'uk': 'Cube Blast: блочний пазл', 'nl-NL': 'Cube Blast: Blokpuzzel',
  'pl': 'Cube Blast: Puzzle z klocków', 'tr': 'Cube Blast: Blok Bulmaca',
  'ar-SA': 'Cube Blast: ألغاز المكعبات', 'he': 'Cube Blast: פאזל קוביות',
  'th': 'Cube Blast: ปริศนาบล็อก', 'vi': 'Cube Blast: Xếp Khối',
  'id': 'Cube Blast: Teka-teki Balok', 'ms': 'Cube Blast: Teka-teki Blok',
  'hi': 'Cube Blast: ब्लॉक पहेली', 'sv': 'Cube Blast: Blockpussel',
  'no': 'Cube Blast: Blokkpuslespill', 'da': 'Cube Blast: Blokpuslespil',
  'fi': 'Cube Blast: Palapeli', 'cs': 'Cube Blast: Blokové puzzle',
  'sk': 'Cube Blast: Blokové puzzle', 'hu': 'Cube Blast: Blokk kirakó',
  'ro': 'Cube Blast: Puzzle cu blocuri', 'hr': 'Cube Blast: Blok slagalica',
  'el': 'Cube Blast: Παζλ με μπλοκ', 'ca': 'Cube Blast: Puzle de blocs',
  'fr-CA': 'Cube Blast : Puzzle de blocs',
};

const SUBTITLE = {
  'en-US': 'Seed-fair blocks · 300 levels', 'en-GB': 'Seed-fair blocks · 300 levels',
  'en-AU': 'Seed-fair blocks · 300 levels', 'en-CA': 'Seed-fair blocks · 300 levels',
  'zh-Hans': '出块可查 · 300 关 · 离线玩', 'zh-Hant': '出塊可查 · 300 關 · 離線玩',
  'ja': '出るブロックは種で確定・300面', 'ko': '시드로 고정된 블록 · 300 레벨',
  'de-DE': 'Faire Teile · 300 Level', 'fr-FR': 'Pièces vérifiables · 300 niv.',
  'es-ES': 'Piezas justas · 300 niveles', 'es-MX': 'Piezas justas · 300 niveles',
  'it': 'Pezzi equi · 300 livelli', 'pt-BR': 'Peças verificáveis · 300 fases',
  'pt-PT': 'Peças verificáveis · 300 fases', 'ru': 'Честные фигуры · 300 уровней',
  'uk': 'Чесні фігури · 300 рівнів', 'nl-NL': 'Eerlijke stukjes · 300 levels',
  'pl': 'Uczciwe klocki · 300 poziomów', 'tr': 'Adil parçalar · 300 bölüm',
  'ar-SA': 'قطع عادلة · 300 مرحلة', 'he': 'חלקים הוגנים · 300 שלבים',
  'th': 'บล็อกยุติธรรม · 300 ด่าน', 'vi': 'Khối công bằng · 300 màn',
  'id': 'Balok adil · 300 level', 'ms': 'Blok adil · 300 tahap',
  'hi': 'निष्पक्ष ब्लॉक · 300 स्तर', 'sv': 'Rättvisa bitar · 300 nivåer',
  'no': 'Rettferdig · 300 nivåer', 'da': 'Fair brikker · 300 baner',
  'fi': 'Reilut palat · 300 tasoa', 'cs': 'Férové dílky · 300 úrovní',
  'sk': 'Férové dieliky · 300 úrovní', 'hu': 'Tiszta játék · 300 pálya',
  'ro': 'Piese corecte · 300 niveluri', 'hr': 'Poštene kocke · 300 razina',
  'el': 'Δίκαια κομμάτια · 300 πίστες', 'ca': 'Peces justes · 300 nivells',
  'fr-CA': 'Pièces vérifiables · 300 niv.',
};

// ── ② 关键词（100 字符硬预算；⛔ 无竞品商标；避开该 locale 名称/副标已用的词）──
const KEYWORDS = {
  'en-US': 'block puzzle,wood,brick,cube,tile,fit,drop,logic,brain,offline,no wifi,relax,daily,crystal,angel',
  'en-GB': 'block puzzle,wood,brick,cube,tile,fit,drop,logic,brain,offline,no wifi,relax,daily,crystal,angel',
  'en-AU': 'block puzzle,wood,brick,cube,tile,fit,drop,logic,brain,offline,relax,daily,crystal,collect,skin',
  'en-CA': 'block puzzle,wood,brick,cube,tile,fit,drop,logic,brain,offline,relax,daily,crystal,collect,coach',
  'zh-Hans': '方块拼图,木块,砖块,益智,消除,脑力,休闲,单机,不用网,水晶,天使,收集,每日,解谜,经典,免费',
  'zh-Hant': '方塊拼圖,木塊,磚塊,益智,消除,腦力,休閒,單機,不用網,水晶,天使,收集,每日,解謎,經典,免費',
  'ja': 'ブロックパズル,木製,ひまつぶし,脳トレ,無料,オフライン,暇つぶし,パズルゲーム,天使,collection,毎日',
  'ko': '블록 퍼즐,나무,벽돌,두뇌,무료,오프라인,심심풀이,퍼즐게임,천사,수집,매일,클래식,힐링,논리',
  'de-DE': 'Steine,Holz,Klötze,Knobel,Gehirn,Denkspiel,offline,ohne WLAN,entspannen,täglich,Kristall,Engel',
  'fr-FR': 'blocs,bois,brique,casse-tête,cerveau,logique,hors ligne,sans wifi,détente,quotidien,cristal,ange',
  'es-ES': 'bloques,madera,ladrillo,rompecabezas,cerebro,lógica,sin conexión,relax,diario,cristal,ángel,clásico',
  'es-MX': 'bloques,madera,ladrillo,rompecabezas,cerebro,lógica,sin internet,relax,diario,cristal,ángel,gratis',
  'it': 'blocchi,legno,mattoni,rompicapo,cervello,logica,offline,senza wifi,relax,cristallo,angelo',
  'pt-BR': 'blocos,madeira,tijolo,quebra-cabeça,cérebro,lógica,offline,sem internet,relaxar,diário,cristal,anjo',
  'pt-PT': 'blocos,madeira,tijolo,quebra-cabeças,cérebro,lógica,offline,sem internet,relaxar,diário,cristal,anjo',
  'ru': 'блоки,дерево,кирпич,головоломка,мозг,логика,офлайн,без интернета,релакс,ежедневно,кристалл,ангел',
  'uk': 'блоки,дерево,цегла,головоломка,мозок,логіка,офлайн,без інтернету,релакс,щодня,кристал,янгол,класика',
  'nl-NL': 'blokken,hout,steen,puzzel,brein,logica,offline,zonder wifi,ontspannen,dagelijks,kristal,engel',
  'pl': 'klocki,drewno,cegła,łamigłówka,mózg,logika,offline,bez internetu,relaks,codziennie,kryształ,anioł',
  'tr': 'bloklar,ahşap,tuğla,zeka,beyin,mantık,çevrimdışı,internetsiz,rahatla,günlük,kristal,melek,klasik',
  'ar-SA': 'مكعبات,خشب,طوب,ألغاز,ذكاء,منطق,بدون نت,استرخاء,يومي,بلورة,ملاك,كلاسيكي,مجاني,تركيب,عقل',
  'he': 'קוביות,עץ,לבנים,חידה,מוח,היגיון,ללא אינטרנט,הרפיה,יומי,גביש,מלאך,קלאסי,חינם,הרכבה,חשיבה',
  'th': 'บล็อก,ไม้,อิฐ,ปริศนา,สมอง,ตรรกะ,ออฟไลน์,ไม่ใช้เน็ต,ผ่อนคลาย,รายวัน,คริสตัล,เทวดา,คลาสสิก,ฟรี',
  'vi': 'khối,gỗ,gạch,giải đố,trí não,logic,ngoại tuyến,không mạng,thư giãn,hằng ngày,pha lê,thiên thần',
  'id': 'balok,kayu,bata,teka-teki,otak,logika,offline,tanpa internet,santai,harian,kristal,malaikat,gratis',
  'ms': 'blok,kayu,bata,teka-teki,otak,logik,luar talian,tanpa internet,santai,harian,kristal,malaikat,klasik',
  'hi': 'ब्लॉक,लकड़ी,ईंट,पहेली,दिमाग,तर्क,ऑफलाइन,बिना इंटरनेट,आराम,रोज़ाना,क्रिस्टल,फ़रिश्ता,मुफ़्त',
  'sv': 'block,trä,tegel,pussel,hjärna,logik,offline,utan wifi,koppla av,dagligt,kristall,ängel,klassisk',
  'no': 'blokker,tre,murstein,puslespill,hjerne,logikk,offline,uten nett,slappe av,daglig,krystall,engel',
  'da': 'blokke,træ,mursten,puslespil,hjerne,logik,offline,uden internet,slap af,krystal,engel,klassisk',
  'fi': 'palikat,puu,tiili,pulma,aivot,logiikka,offline,ilman nettiä,rentoutus,päivittäin,kristalli,enkeli',
  'cs': 'kostky,dřevo,cihla,hlavolam,mozek,logika,offline,bez internetu,relax,denně,krystal,anděl,klasika',
  'sk': 'kocky,drevo,tehla,hlavolam,mozog,logika,offline,bez internetu,relax,denne,kryštál,anjel,klasika',
  'hu': 'kockák,fa,tégla,fejtörő,agy,logika,offline,internet nélkül,pihenés,napi,kristály,angyal,klasszikus',
  'ro': 'blocuri,lemn,cărămidă,puzzle,creier,logică,offline,fără internet,relaxare,zilnic,cristal,înger',
  'hr': 'kocke,drvo,cigla,zagonetka,mozak,logika,offline,bez interneta,opuštanje,dnevno,kristal,anđeo',
  'el': 'μπλοκ,ξύλο,τούβλο,γρίφος,μυαλό,λογική,χωρίς ίντερνετ,χαλάρωση,καθημερινό,κρύσταλλο,άγγελος',
  'ca': 'blocs,fusta,maó,trencaclosques,cervell,lògica,sense connexió,relax,diari,cristall,àngel,clàssic',
  'fr-CA': 'blocs,bois,brique,casse-tête,cerveau,logique,hors ligne,sans wifi,détente,quotidien,cristal,ange',
};

// ── ③ 促销文本（170 字符；可随时改、不用过审 ⇒ 放最新卖点）──
const PROMO = {
  'en-US': 'New: 300 levels in 30 chapters, and a coach that shows the best move — then tells you which move cost you the run. Piece order is still fixed by a seed you can copy.',
  'zh-Hans': '新增：300 关 / 30 章，以及会指出最优一手的教练 —— 它还会告诉你，是哪一手把这局输掉的。出块顺序照旧由种子定死，随时可查。',
  'zh-Hant': '新增：300 關 / 30 章，以及會指出最佳一手的教練 —— 它還會告訴你，是哪一手把這局輸掉的。出塊順序照舊由種子定死，隨時可查。',
  'ja': '新登場：300ステージ／30章、そして最善手を教えてくれるコーチ（どの一手で負けたのかも教えます）。ピースの並びは今までどおりシードで固定です。',
  'ko': '새로워졌습니다: 300 레벨 30 챕터, 그리고 최선의 수를 알려주는 코치 — 어느 수에서 판이 무너졌는지도 알려줍니다. 블록 순서는 여전히 시드로 고정.',
  'de-DE': 'Neu: 300 Level in 30 Kapiteln und ein Coach, der den besten Zug zeigt — und dir sagt, welcher Zug die Runde gekostet hat. Die Teilefolge steht weiterhin per Seed fest.',
  'fr-FR': 'Nouveau : 300 niveaux en 30 chapitres et un coach qui montre le meilleur coup — puis vous dit quel coup a coûté la partie. L’ordre des pièces reste fixé par une graine.',
  'es-ES': 'Nuevo: 300 niveles en 30 capítulos y un entrenador que enseña la mejor jugada — y te dice cuál te costó la partida. El orden de las piezas sigue fijado por una semilla.',
  'es-MX': 'Nuevo: 300 niveles en 30 capítulos y un entrenador que enseña la mejor jugada — y te dice cuál te costó la partida. El orden de las piezas sigue fijado por una semilla.',
  'it': 'Novità: 300 livelli in 30 capitoli e un coach che mostra la mossa migliore — e ti dice quale mossa ti è costata la partita. L’ordine dei pezzi resta fissato da un seed.',
  'pt-BR': 'Novo: 300 fases em 30 capítulos e um treinador que mostra a melhor jogada — e diz qual jogada custou a partida. A ordem das peças continua fixada por uma seed.',
  'pt-PT': 'Novo: 300 níveis em 30 capítulos e um treinador que mostra a melhor jogada — e diz qual jogada custou a partida. A ordem das peças continua fixada por uma seed.',
  'ru': 'Новое: 300 уровней в 30 главах и тренер, который показывает лучший ход — и говорит, какой ход стоил вам партии. Порядок фигур по-прежнему задаёт сид.',
  'uk': 'Нове: 300 рівнів у 30 розділах і тренер, який показує найкращий хід — і каже, який хід коштував вам партії. Порядок фігур і далі задає сид.',
  'nl-NL': 'Nieuw: 300 levels in 30 hoofdstukken en een coach die de beste zet toont — en vertelt welke zet je het potje kostte. De volgorde ligt nog steeds vast via een seed.',
  'pl': 'Nowość: 300 poziomów w 30 rozdziałach i trener, który pokazuje najlepszy ruch — oraz mówi, który ruch kosztował cię grę. Kolejność klocków wciąż ustala ziarno.',
  'tr': 'Yeni: 30 kısımda 300 bölüm ve en iyi hamleyi gösteren bir koç — hangi hamlenin oyunu kaybettirdiğini de söylüyor. Parça sırası yine bir tohumla sabit.',
  'ar-SA': 'جديد: 300 مرحلة في 30 فصلاً، ومدرّب يُريك أفضل حركة — ثم يخبرك أي حركة كلفتك الجولة. ترتيب القطع ما زال تحدده بذرة يمكنك نسخها.',
  'he': 'חדש: 300 שלבים ב-30 פרקים ומאמן שמראה את המהלך הטוב ביותר — ואומר איזה מהלך עלה לכם במשחק. סדר החלקים עדיין נקבע על ידי זרע.',
  'th': 'ใหม่: 300 ด่านใน 30 บท และโค้ชที่ชี้ตาเดินที่ดีที่สุด — พร้อมบอกว่าตาไหนทำให้คุณแพ้ ลำดับบล็อกยังคงกำหนดด้วยซีดเหมือนเดิม',
  'vi': 'Mới: 300 màn trong 30 chương và huấn luyện viên chỉ nước đi tốt nhất — rồi nói cho bạn nước nào đã làm hỏng ván. Thứ tự khối vẫn do seed quy định.',
  'id': 'Baru: 300 level dalam 30 bab dan pelatih yang menunjukkan langkah terbaik — lalu memberi tahu langkah mana yang membuatmu kalah. Urutan balok tetap ditentukan seed.',
  'ms': 'Baharu: 300 tahap dalam 30 bab dan jurulatih yang menunjukkan langkah terbaik — lalu memberitahu langkah mana yang merugikan anda. Urutan blok tetap ditetapkan benih.',
  'hi': 'नया: 30 अध्यायों में 300 स्तर, और सबसे अच्छी चाल दिखाने वाला कोच — जो बताता भी है कि किस चाल ने खेल बिगाड़ा। टुकड़ों का क्रम अब भी सीड से तय होता है।',
  'sv': 'Nytt: 300 nivåer i 30 kapitel och en coach som visar bästa draget — och berättar vilket drag som kostade omgången. Bitordningen bestäms fortfarande av ett frö.',
  'no': 'Nytt: 300 nivåer i 30 kapitler og en coach som viser beste trekk — og sier hvilket trekk som kostet deg runden. Brikkerekkefølgen er fortsatt låst av et frø.',
  'da': 'Nyt: 300 baner i 30 kapitler og en coach, der viser bedste træk — og fortæller, hvilket træk der kostede dig omgangen. Brikkernes rækkefølge er stadig låst af et frø.',
  'fi': 'Uutta: 300 tasoa 30 luvussa ja valmentaja, joka näyttää parhaan siirron — ja kertoo, mikä siirto vei pelin. Palojen järjestys on yhä kiinni siemenluvusta.',
  'cs': 'Novinka: 300 úrovní ve 30 kapitolách a kouč, který ukáže nejlepší tah — a řekne, který tah tě stál hru. Pořadí dílků stále určuje seed.',
  'sk': 'Novinka: 300 úrovní v 30 kapitolách a tréner, ktorý ukáže najlepší ťah — a povie, ktorý ťah ťa stál hru. Poradie dielikov stále určuje seed.',
  'hu': 'Új: 300 pálya 30 fejezetben, és egy edző, aki megmutatja a legjobb lépést — és megmondja, melyik vitte el a játszmát. A sorrendet továbbra is egy mag rögzíti.',
  'ro': 'Nou: 300 de niveluri în 30 de capitole și un antrenor care arată cea mai bună mutare — și ce mutare te-a costat partida. Ordinea rămâne fixată de o sămânță.',
  'hr': 'Novo: 300 razina u 30 poglavlja i trener koji pokazuje najbolji potez — te kaže koji te potez stajao partije. Redoslijed dijelova i dalje određuje sjeme.',
  'el': 'Νέο: 300 πίστες σε 30 κεφάλαια και προπονητής που δείχνει την καλύτερη κίνηση — και ποια κίνηση σου στοίχισε την παρτίδα. Η σειρά ορίζεται από έναν σπόρο.',
  'ca': 'Nou: 300 nivells en 30 capítols i un entrenador que mostra la millor jugada — i et diu quina t’ha costat la partida. L’ordre de les peces continua fixat per una llavor.',
  'fr-CA': 'Nouveau : 300 niveaux en 30 chapitres et un coach qui montre le meilleur coup — puis vous dit quel coup a coûté la partie. L’ordre des pièces reste fixé par une graine.',
};
PROMO['en-GB'] = PROMO['en-US']; PROMO['en-AU'] = PROMO['en-US']; PROMO['en-CA'] = PROMO['en-US'];

// ── ④ 更新说明（更新版**必填**；老玩家看的是「凭什么更新」⇒ 只列他们感知得到的）──
const WHATSNEW = {
  'en-US': '300 levels across 30 chapters (was 30).\nA coach built from the same solver that verifies every level: it shows the best move, and after a loss it tells you which move cost you the run.\nWatch an ad for two hands of single blocks when you are stuck.\n500 angels to collect, 20 themes, daily quests and streak rewards.\nRebuilt sound: coins, crystals, brilliant moves and a heartbeat when the board fills up.',
  'zh-Hans': '关卡从 30 关扩到 300 关 / 30 章。\n新增教练：和「验证每一关都能通」的是同一套求解器 —— 它会指出最优一手；输了之后还会告诉你，是哪一手把这局输掉的。\n卡住时可以看广告换两手全是单格方块。\n500 张天使图收集、20 款皮肤、每日任务与连续奖励。\n音效重做：金币、水晶、妙手，以及盘面变满时的心跳声。',
  'zh-Hant': '關卡從 30 關擴到 300 關 / 30 章。\n新增教練：和「驗證每一關都能通」的是同一套求解器 —— 它會指出最佳一手；輸了之後還會告訴你，是哪一手把這局輸掉的。\n卡住時可以看廣告換兩手全是單格方塊。\n500 張天使圖收集、20 款皮膚、每日任務與連續獎勵。\n音效重做：金幣、水晶、好手，以及盤面變滿時的心跳聲。',
  'ja': 'ステージが30から300（30章）に増えました。\n「全ステージがクリア可能か」を検証しているのと同じソルバーを使ったコーチを追加：最善手を教え、負けたあとはどの一手が原因かも教えます。\n詰まったら広告を見て、1マスブロックだけの手を2回もらえます。\n天使500枚の収集、テーマ20種、デイリークエストと連続報酬。\n効果音を作り直しました（コイン・クリスタル・好手・盤面が埋まると鼓動）。',
  'ko': '레벨이 30개에서 300개(30챕터)로 늘었습니다.\n모든 레벨의 클리어 가능 여부를 검증하는 것과 같은 솔버로 만든 코치 추가: 최선의 수를 보여주고, 패배 후에는 어느 수가 판을 무너뜨렸는지 알려줍니다.\n막혔을 때 광고를 보면 1칸 블록만 나오는 두 손을 받습니다.\n천사 500장 수집, 테마 20종, 일일 퀘스트와 연속 보상.\n사운드 전면 재작업.',
  'de-DE': '300 Level in 30 Kapiteln (vorher 30).\nNeu: ein Coach aus demselben Solver, der prüft, dass jedes Level lösbar ist — er zeigt den besten Zug und sagt nach einer Niederlage, welcher Zug die Runde gekostet hat.\nFeststeckt? Ein Video bringt zwei Hände voller Einzelblöcke.\n500 Engel zum Sammeln, 20 Designs, Tagesaufgaben und Serienbelohnungen.\nKomplett neuer Sound.',
  'fr-FR': '300 niveaux en 30 chapitres (contre 30).\nNouveau coach, issu du même solveur qui vérifie que chaque niveau est gagnable : il montre le meilleur coup et, après une défaite, vous dit quel coup a coûté la partie.\nBloqué ? Une pub vous donne deux mains de blocs unitaires.\n500 anges à collectionner, 20 thèmes, quêtes du jour et récompenses de série.\nSons entièrement refaits.',
  'es-ES': '300 niveles en 30 capítulos (antes 30).\nNuevo entrenador, hecho con el mismo solucionador que verifica que cada nivel se puede ganar: enseña la mejor jugada y, tras perder, te dice qué jugada te costó la partida.\n¿Atascado? Un anuncio te da dos manos de piezas de una casilla.\n500 ángeles, 20 temas, misiones diarias y recompensas por racha.\nSonido rehecho.',
  'es-MX': '300 niveles en 30 capítulos (antes 30).\nNuevo entrenador, hecho con el mismo solucionador que verifica que cada nivel se puede ganar: enseña la mejor jugada y, tras perder, te dice qué jugada te costó la partida.\n¿Atascado? Un anuncio te da dos manos de piezas de una casilla.\n500 ángeles, 20 temas, misiones diarias y recompensas por racha.\nSonido rehecho.',
  'it': '300 livelli in 30 capitoli (prima 30).\nNuovo coach, costruito con lo stesso solver che verifica che ogni livello sia vincibile: mostra la mossa migliore e, dopo una sconfitta, ti dice quale mossa ti è costata la partita.\nBloccato? Un video ti dà due mani di blocchi singoli.\n500 angeli, 20 temi, missioni giornaliere e ricompense di serie.\nAudio rifatto.',
  'pt-BR': '300 fases em 30 capítulos (antes 30).\nNovo treinador, feito com o mesmo solucionador que verifica se cada fase tem solução: mostra a melhor jogada e, após uma derrota, diz qual jogada custou a partida.\nTravado? Um anúncio dá duas mãos de blocos de uma casa.\n500 anjos para colecionar, 20 temas, missões diárias e recompensas por sequência.\nSom refeito.',
  'pt-PT': '300 níveis em 30 capítulos (antes 30).\nNovo treinador, feito com o mesmo solucionador que verifica se cada nível tem solução: mostra a melhor jogada e, após uma derrota, diz qual jogada custou a partida.\nEncravado? Um anúncio dá duas mãos de blocos de uma casa.\n500 anjos, 20 temas, missões diárias e recompensas por sequência.\nSom refeito.',
  'ru': '300 уровней в 30 главах (было 30).\nНовый тренер на том же солвере, который проверяет проходимость каждого уровня: показывает лучший ход, а после поражения говорит, какой ход стоил вам партии.\nЗастряли? Реклама даёт две руки одноклеточных фигур.\n500 ангелов, 20 оформлений, ежедневные задания и награды за серию.\nЗвук переделан.',
  'uk': '300 рівнів у 30 розділах (було 30).\nНовий тренер на тому ж солвері, що перевіряє прохідність кожного рівня: показує найкращий хід, а після поразки каже, який хід коштував вам партії.\nЗастрягли? Реклама дає дві руки одноклітинних фігур.\n500 янголів, 20 оформлень, щоденні завдання та нагороди за серію.\nЗвук перероблено.',
  'nl-NL': '300 levels in 30 hoofdstukken (was 30).\nNieuwe coach, gebouwd op dezelfde solver die controleert of elk level te winnen is: hij toont de beste zet en vertelt na verlies welke zet je het potje kostte.\nVast? Een video geeft twee handen met losse blokjes.\n500 engelen, 20 thema’s, dagelijkse opdrachten en reeksbeloningen.\nGeluid opnieuw gemaakt.',
  'pl': '300 poziomów w 30 rozdziałach (było 30).\nNowy trener oparty na tym samym solwerze, który sprawdza, czy każdy poziom da się ukończyć: pokazuje najlepszy ruch, a po przegranej mówi, który ruch kosztował cię grę.\nUtknąłeś? Reklama daje dwie ręce pojedynczych klocków.\n500 aniołów, 20 motywów, zadania dzienne i nagrody za serię.\nNowe dźwięki.',
  'tr': '30 kısımda 300 bölüm (önceden 30).\nHer bölümün bitirilebilir olduğunu doğrulayan aynı çözücüyle yapılan yeni koç: en iyi hamleyi gösterir, yenilgiden sonra hangi hamlenin oyunu kaybettirdiğini söyler.\nSıkıştın mı? Bir reklam iki el tek kare blok verir.\n500 melek, 20 tema, günlük görevler ve seri ödülleri.\nSesler yenilendi.',
  'ar-SA': '300 مرحلة في 30 فصلاً (بدلاً من 30).\nمدرّب جديد مبني على نفس المحلّل الذي يتحقق من إمكانية إنهاء كل مرحلة: يُريك أفضل حركة، وبعد الخسارة يخبرك أي حركة كلفتك الجولة.\nعالق؟ إعلان واحد يمنحك جولتين من المكعبات المفردة.\n500 ملاك للجمع، 20 مظهرًا، مهام يومية ومكافآت تتابع.\nإعادة بناء المؤثرات الصوتية.',
  'he': '300 שלבים ב-30 פרקים (במקום 30).\nמאמן חדש שנבנה על אותו פותר שמוודא שכל שלב ניתן לניצחון: הוא מראה את המהלך הטוב ביותר, ואחרי הפסד אומר איזה מהלך עלה לכם במשחק.\nתקועים? פרסומת נותנת שתי ידיים של קוביות בודדות.\n500 מלאכים, 20 ערכות, משימות יומיות ותגמולי רצף.\nהסאונד נבנה מחדש.',
  'th': '300 ด่านใน 30 บท (เดิม 30 ด่าน)\nโค้ชใหม่ที่สร้างจากตัวแก้ปริศนาเดียวกับที่ตรวจว่าทุกด่านผ่านได้: ชี้ตาเดินที่ดีที่สุด และหลังแพ้จะบอกว่าตาไหนทำให้คุณแพ้\nติดอยู่ใช่ไหม? ดูโฆษณาแล้วรับบล็อกเดี่ยวสองชุด\nเทวดา 500 ภาพ, 20 ธีม, ภารกิจรายวันและรางวัลต่อเนื่อง\nทำเสียงใหม่ทั้งหมด',
  'vi': '300 màn trong 30 chương (trước là 30).\nHuấn luyện viên mới, dựng từ chính bộ giải dùng để kiểm tra mọi màn đều thắng được: chỉ nước đi tốt nhất, và sau khi thua sẽ nói nước nào đã làm hỏng ván.\nBí? Xem quảng cáo để nhận hai lượt toàn khối đơn.\n500 thiên thần, 20 giao diện, nhiệm vụ hằng ngày và thưởng chuỗi.\nLàm lại âm thanh.',
  'id': '300 level dalam 30 bab (sebelumnya 30).\nPelatih baru, dibangun dari solver yang sama yang memverifikasi setiap level bisa dimenangkan: menunjukkan langkah terbaik, dan setelah kalah memberi tahu langkah mana yang membuatmu kalah.\nBuntu? Satu iklan memberi dua putaran balok satuan.\n500 malaikat, 20 tema, misi harian dan hadiah rentetan.\nSuara dibuat ulang.',
  'ms': '300 tahap dalam 30 bab (sebelum ini 30).\nJurulatih baharu, dibina daripada penyelesai yang sama yang mengesahkan setiap tahap boleh dimenangi: menunjukkan langkah terbaik, dan selepas kalah memberitahu langkah mana yang merugikan anda.\nTersekat? Satu iklan memberi dua pusingan blok tunggal.\n500 malaikat, 20 tema, misi harian dan ganjaran rentetan.\nBunyi dibina semula.',
  'hi': '30 अध्यायों में 300 स्तर (पहले 30)।\nनया कोच, उसी सॉल्वर से बना जो जाँचता है कि हर स्तर जीता जा सकता है: सबसे अच्छी चाल दिखाता है, और हारने के बाद बताता है कि किस चाल ने खेल बिगाड़ा।\nफँस गए? एक विज्ञापन देखकर दो बार सिर्फ़ एक-खाने वाले ब्लॉक पाएँ।\n500 फ़रिश्ते, 20 थीम, रोज़ के काम और लगातार खेलने के इनाम।\nआवाज़ें नए सिरे से बनाई गईं।',
  'sv': '300 nivåer i 30 kapitel (tidigare 30).\nNy coach, byggd på samma lösare som verifierar att varje nivå går att klara: visar bästa draget och berättar efter en förlust vilket drag som kostade omgången.\nFast? En annons ger två händer med enrutorsbitar.\n500 änglar, 20 teman, dagliga uppdrag och sviktbelöningar.\nLjudet är omgjort.',
  'no': '300 nivåer i 30 kapitler (før 30).\nNy coach, bygget på samme løser som verifiserer at hvert nivå kan klares: viser beste trekk, og etter et tap sier den hvilket trekk som kostet deg runden.\nFast? En annonse gir to hender med enkeltblokker.\n500 engler, 20 temaer, daglige oppdrag og rekkebelønninger.\nLyden er laget på nytt.',
  'da': '300 baner i 30 kapitler (før 30).\nNy coach, bygget på samme løser, som verificerer at hver bane kan klares: viser bedste træk, og efter et nederlag fortæller den, hvilket træk der kostede dig omgangen.\nSidder du fast? En reklame giver to hænder med enkeltblokke.\n500 engle, 20 temaer, daglige opgaver og stribebelønninger.\nLyden er lavet om.',
  'fi': '300 tasoa 30 luvussa (aiemmin 30).\nUusi valmentaja, rakennettu samasta ratkaisijasta, joka varmistaa jokaisen tason läpäistävyyden: näyttää parhaan siirron ja kertoo tappion jälkeen, mikä siirto vei pelin.\nJumissa? Mainos antaa kaksi kättä yhden ruudun paloja.\n500 enkeliä, 20 teemaa, päivittäiset tehtävät ja putkipalkinnot.\nÄänet tehty uusiksi.',
  'cs': '300 úrovní ve 30 kapitolách (dříve 30).\nNový kouč postavený na stejném solveru, který ověřuje, že každá úroveň jde dohrát: ukáže nejlepší tah a po prohře řekne, který tah tě stál hru.\nZaseknutý? Reklama dá dvě ruky jednopolíčkových dílků.\n500 andělů, 20 motivů, denní úkoly a odměny za sérii.\nZvuky předělány.',
  'sk': '300 úrovní v 30 kapitolách (predtým 30).\nNový tréner postavený na tom istom solveri, ktorý overuje, že každá úroveň sa dá dohrať: ukáže najlepší ťah a po prehre povie, ktorý ťah ťa stál hru.\nZaseknutý? Reklama dá dve ruky jednopolíčkových dielikov.\n500 anjelov, 20 motívov, denné úlohy a odmeny za sériu.\nZvuky prerobené.',
  'hu': '300 pálya 30 fejezetben (korábban 30).\nÚj edző, ugyanazzal a megoldóval építve, amely ellenőrzi, hogy minden pálya teljesíthető: megmutatja a legjobb lépést, vereség után pedig megmondja, melyik lépés vitte el a játszmát.\nElakadtál? Egy hirdetés két kör egymezős elemet ad.\n500 angyal, 20 kinézet, napi feladatok és sorozatjutalmak.\nÚj hangok.',
  'ro': '300 de niveluri în 30 de capitole (înainte 30).\nAntrenor nou, construit pe același rezolvator care verifică dacă fiecare nivel poate fi câștigat: arată cea mai bună mutare, iar după o înfrângere îți spune ce mutare te-a costat partida.\nBlocat? O reclamă îți dă două mâini de blocuri de o casetă.\n500 de îngeri, 20 de teme, misiuni zilnice și recompense de serie.\nSunet refăcut.',
  'hr': '300 razina u 30 poglavlja (prije 30).\nNovi trener, izgrađen na istom rješavaču koji provjerava može li se svaka razina osvojiti: pokazuje najbolji potez, a nakon poraza kaže koji te potez stajao partije.\nZapeo? Reklama daje dvije ruke jednodijelnih kocki.\n500 anđela, 20 tema, dnevni zadaci i nagrade za niz.\nZvuk je iznova napravljen.',
  'el': '300 πίστες σε 30 κεφάλαια (πριν 30).\nΝέος προπονητής, φτιαγμένος με τον ίδιο λύτη που επαληθεύει ότι κάθε πίστα κερδίζεται: δείχνει την καλύτερη κίνηση και μετά από ήττα σου λέει ποια κίνηση σου στοίχισε την παρτίδα.\nΚόλλησες; Μια διαφήμιση δίνει δύο χέρια με μονά μπλοκ.\n500 άγγελοι, 20 θέματα, καθημερινές αποστολές και έπαθλα σερί.\nΝέοι ήχοι.',
  'ca': '300 nivells en 30 capítols (abans 30).\nNou entrenador, fet amb el mateix resolutor que verifica que cada nivell es pot guanyar: mostra la millor jugada i, després d’una derrota, et diu quina jugada t’ha costat la partida.\nEncallat? Un anunci et dóna dues mans de blocs d’una casella.\n500 àngels, 20 temes, missions diàries i recompenses de ratxa.\nSo refet.',
  'fr-CA': '300 niveaux en 30 chapitres (contre 30).\nNouveau coach, issu du même solveur qui vérifie que chaque niveau est gagnable : il montre le meilleur coup et, après une défaite, vous dit quel coup a coûté la partie.\nBloqué ? Une pub vous donne deux mains de blocs unitaires.\n500 anges, 20 thèmes, quêtes du jour et récompenses de série.\nSons refaits.',
};
WHATSNEW['en-GB'] = WHATSNEW['en-US']; WHATSNEW['en-AU'] = WHATSNEW['en-US']; WHATSNEW['en-CA'] = WHATSNEW['en-US'];

// ── ⑤ 描述（不进搜索 ⇒ 只管转化：先给差异化，再给内容量，最后给「没有暗坑」）──
//    ⚠ 用一个模板 + 每语言的填空，保证 39 语都说同一件事、不走样。
const DESC = {
  'en-US': `The pieces are decided before you start.

Every run is generated from a seed you can read, copy and share. Dealing never looks at your board, your score, whether you are close to a record, or whether you paid. The piece weights are printed inside the game. That is the whole promise, and you can check it.

WHAT IS IN IT
· 300 levels across 30 chapters — free the crystals, work around the stones
· Endless mode with combo scoring: the streak is where the points are
· A daily puzzle — the same pieces worldwide, so scores really are comparable
· A coach built from the same solver that verifies every level is winnable: it shows the best move, and after a loss it tells you which move cost you the run
· 500 collectible angel artworks, 20 themes, 44 achievements, daily quests and streak rewards

ABOUT ADS
No interstitials at all for your first 50 games. After that, at most one every 10 games, and only after a win — never mid-game, never on a loss. Everything else is a rewarded video you choose to watch; decline and nothing happens.

Plays offline. No account needed.`,
  'zh-Hans': `出块顺序在你落第一子之前就定好了。

每一局都由一个你看得见、复制得走、分享得出去的种子生成。发牌从不读取你的棋盘、分数、是否接近纪录、是否付过费。出块权重原样印在游戏里的「公平」页上。这就是全部承诺，而且你可以亲自验证。

里面有什么
· 300 关 / 30 章 —— 解放水晶，绕开石块
· 无尽模式与连击计分：分数几乎全部来自连击
· 每日谜题 —— 全球同一条块流，分数真的可比
· 教练：和「验证每一关都能通」的是同一套求解器，它会指出最优一手；输了之后还会告诉你是哪一手把这局输掉的
· 500 张天使画像收集、20 款皮肤、44 个成就、每日任务与连续奖励

关于广告
前 50 盘完全没有插屏。之后每 10 盘至多一个，且只在赢了之后 —— 局中永远不出，失败永远不出。其余全是你自己选择要不要看的激励视频；拒绝了，什么也不会发生。

可离线游玩，无需注册账号。`,
};
// 其余 locale：先用英文描述（苹果允许），后续按需要逐语补写 —— ⚠ 描述不进搜索，优先级低于关键词。
for (const loc of Object.keys(NAME)) if (!DESC[loc]) DESC[loc] = DESC['en-US'];
DESC['zh-Hant'] = DESC['zh-Hans'].replace(/出块/g, '出塊').replace(/关/g, '關').replace(/无尽/g, '無盡');

// ── 预算校验（超长会被 ASC 直接 400）──
const LIMIT = { name: 30, subtitle: 30, keywords: 100, promotionalText: 170, whatsNew: 4000, description: 4000 };
const errs = [];
for (const loc of Object.keys(NAME)) {
  const row = { name: NAME[loc], subtitle: SUBTITLE[loc], keywords: KEYWORDS[loc],
                promotionalText: PROMO[loc], whatsNew: WHATSNEW[loc], description: DESC[loc] };
  for (const [k, v] of Object.entries(row)) {
    if (v == null) { errs.push(`${loc}.${k} 缺`); continue; }
    if (v.length > LIMIT[k]) errs.push(`${loc}.${k} 超长 ${v.length}/${LIMIT[k]}`);
  }
  // ⛔ 商标红线：名称里 block 与 blast 绝不能连着出现
  if (/block\s*blast/i.test(NAME[loc])) errs.push(`${loc}.name 触碰商标红线（Block Blast）`);
  if (/block\s*blast/i.test(KEYWORDS[loc] || '')) errs.push(`${loc}.keywords 含竞品商标`);
}
if (errs.length) { throw new Error('[aso] 校验不过:\n' + errs.join('\n')); }

module.exports = { NAME, SUBTITLE, KEYWORDS, PROMO, WHATSNEW, DESC, LOCALES: Object.keys(NAME) };
