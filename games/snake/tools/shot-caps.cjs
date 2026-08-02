// games/snake/tools/shot-caps.cjs — 商店截图的 39 语文案（大字标题 / 高亮词 / 副标 / 胶囊）
//
// ⚠ 不是机翻英文那套：每语言按该语言的自然说法写（aso-i18n-guide 同规）。
// ⚠ `hl`（渐变高亮词）**必须是 h 的子串**，否则替换不生效 —— 文件末尾有断言。
// ⚠ app UI 只有 10 语；其余 locale 用**英文 UI 的 raw 图 + 本地化大字标题**（苹果允许，
//    比纯英文图强很多）。raw 语言映射见 RAWLANG。
//
// 每个 locale 一个数组，8 项，顺序 = SHOTS：
//   0 hero · 1 揭图 · 2 图鉴 · 3 过关 · 4 成就 · 5 每日 · 6 统计 · 7 皮肤
// 形状：[h, hl, s]；另有 pills1（hero 两枚胶囊）与 pills4（过关两枚胶囊）。

const C = {};

// ── 英文（主语言；en-GB/AU/CA 克隆）──
C['en-US'] = {
  t: [
    ['Snake that paints 500 angels', '500 angels', 'Every tile you cross reveals the art beneath'],
    ['One apple reveals 9 tiles', '9 tiles', 'Chase combos, uncover faster'],
    ['500 angels to collect', '500', 'Every clear adds one to your album'],
    ['Clear it, keep it forever', 'forever', 'Three stars for a clean, fast run'],
    ['120 achievements', '120', 'Fruits, combos, streaks — all of it counts'],
    ['A reason to come back daily', 'daily', '3 quests a day · free angel gift · streak rewards'],
    ['Watch your wings grow', 'wings', 'Levels, titles and lifetime stats'],
    ['Four dreamy themes', 'dreamy', 'Clouds, night sky, candy, forest'],
  ],
  pills1: ['👼 500 artworks', '🎨 4 themes'], pills4: ['★ No deaths', '⚡ Under 2 min'],
};

// ── 简体中文 ──
C['zh-Hans'] = {
  t: [
    ['一边玩蛇，一边画出 500 位天使', '500 位天使', '走过的每一格，都揭开下面的画'],
    ['吃一颗苹果，揭开 9 格', '9 格', '连击越长，画面开得越快'],
    ['500 张天使图等你收集', '500 张', '每通一关，图鉴就多一张'],
    ['通关即永久收藏', '永久', '不死、够快，就是三星'],
    ['120 个成就', '120', '果子、连击、连续天数，都算数'],
    ['每天都有回来的理由', '每天', '每日 3 个任务 · 免费天使 · 连续奖励'],
    ['看着自己的翅膀长大', '翅膀', '等级、称号和终身统计'],
    ['四款梦幻皮肤', '梦幻', '云端、星空、马卡龙、天国花园'],
  ],
  pills1: ['👼 500 张图', '🎨 4 款皮肤'], pills4: ['★ 零死亡', '⚡ 2 分钟内'],
};

// ── 繁体中文（词汇不是简繁逐字转）──
C['zh-Hant'] = {
  t: [
    ['一邊玩蛇，一邊畫出 500 位天使', '500 位天使', '走過的每一格，都揭開底下的畫'],
    ['吃一顆蘋果，揭開 9 格', '9 格', '連擊越長，畫面開得越快'],
    ['500 張天使圖等你收藏', '500 張', '每過一關，圖鑑就多一張'],
    ['過關即永久收藏', '永久', '不死、夠快，就是三星'],
    ['120 個成就', '120', '果實、連擊、連續天數，通通算數'],
    ['每天都有回來的理由', '每天', '每日 3 個任務 · 免費天使 · 連續獎勵'],
    ['看著自己的翅膀長大', '翅膀', '等級、稱號與終身統計'],
    ['四款夢幻主題', '夢幻', '雲端、星空、馬卡龍、天國花園'],
  ],
  pills1: ['👼 500 張圖', '🎨 4 款主題'], pills4: ['★ 零死亡', '⚡ 2 分鐘內'],
};

// ── 日语（片假名外来语 + 汉字混排，商店惯用）──
C['ja'] = {
  t: [
    ['遊ぶほど天使が現れる', '天使', 'なぞったマスの下から絵が出てくる'],
    ['リンゴ1個で9マス公開', '9マス', 'コンボをつなぐほど早くめくれる'],
    ['集める天使は500枚', '500枚', 'クリアするたび図鑑が増える'],
    ['クリアしたら永久保存', '永久', 'ノーミス＆速攻で星3つ'],
    ['実績は120個', '120', 'フルーツもコンボも連続日数も対象'],
    ['毎日戻ってくる理由', '毎日', '1日3つのデイリー · 無料天使 · 連続ボーナス'],
    ['自分の翼が育つ', '翼', 'レベル・称号・累計スタッツ'],
    ['夢かわスキン4種', '夢かわ', '雲・星空・マカロン・天国の庭'],
  ],
  pills1: ['👼 500枚', '🎨 スキン4種'], pills4: ['★ ノーミス', '⚡ 2分以内'],
};

// ── 韩语（외래어 위주 + 한영 혼용）──
C['ko'] = {
  t: [
    ['플레이할수록 천사가 드러나요', '천사', '지나간 칸마다 그림이 열립니다'],
    ['사과 하나로 9칸 공개', '9칸', '콤보를 이을수록 빨리 열려요'],
    ['모을 천사 500장', '500장', '한 판 깰 때마다 도감이 늘어요'],
    ['깨면 영원히 내 것', '영원히', '노데스 + 스피드런이면 별 3개'],
    ['업적 120개', '120', '과일도 콤보도 연속 출석도 전부 카운트'],
    ['매일 돌아올 이유', '매일', '하루 3개 퀘스트 · 무료 천사 · 연속 보상'],
    ['날개가 자라는 걸 지켜보세요', '날개', '레벨, 칭호, 누적 통계'],
    ['몽환적인 테마 4종', '몽환적인', '구름 · 밤하늘 · 마카롱 · 천국의 정원'],
  ],
  pills1: ['👼 천사 500장', '🎨 테마 4종'], pills4: ['★ 노데스', '⚡ 2분 이내'],
};

// ── 德语（复合词；英文外来词 DE 区量大）──
C['de-DE'] = {
  t: [
    ['Snake, das 500 Engel malt', '500 Engel', 'Jedes Feld deckt das Bild darunter auf'],
    ['Ein Apfel deckt 9 Felder auf', '9 Felder', 'Combos jagen, schneller aufdecken'],
    ['500 Engel zum Sammeln', '500', 'Jedes geschaffte Level füllt dein Album'],
    ['Geschafft heißt für immer deins', 'für immer', 'Drei Sterne für einen sauberen, schnellen Lauf'],
    ['120 Erfolge', '120', 'Früchte, Combos, Serien — alles zählt'],
    ['Ein Grund, täglich zurückzukommen', 'täglich', '3 Aufgaben pro Tag · Gratis-Engel · Serien-Boni'],
    ['Sieh deine Flügel wachsen', 'Flügel', 'Level, Titel und Gesamtstatistik'],
    ['Vier verträumte Designs', 'verträumte', 'Wolken, Nachthimmel, Macaron, Garten'],
  ],
  pills1: ['👼 500 Bilder', '🎨 4 Designs'], pills4: ['★ Ohne Tod', '⚡ Unter 2 Min'],
};

// ── 法语（可见文案带音标）──
C['fr-FR'] = {
  t: [
    ['Le serpent qui peint 500 anges', '500 anges', 'Chaque case révèle le dessin caché'],
    ['Une pomme révèle 9 cases', '9 cases', 'Enchaîne les combos, découvre plus vite'],
    ['500 anges à collectionner', '500', 'Chaque niveau réussi enrichit ton album'],
    ['Réussi, gardé pour toujours', 'pour toujours', 'Trois étoiles pour une partie propre et rapide'],
    ['120 succès', '120', 'Fruits, combos, séries — tout compte'],
    ['Une raison de revenir chaque jour', 'chaque jour', '3 quêtes par jour · ange offert · bonus de série'],
    ['Regarde tes ailes grandir', 'ailes', 'Niveaux, titres et statistiques à vie'],
    ['Quatre thèmes de rêve', 'de rêve', 'Nuages, ciel étoilé, macaron, jardin'],
  ],
  pills1: ['👼 500 images', '🎨 4 thèmes'], pills4: ['★ Sans mourir', '⚡ Moins de 2 min'],
};

// ── 西语（西班牙）──
C['es-ES'] = {
  t: [
    ['La serpiente que pinta 500 ángeles', '500 ángeles', 'Cada casilla revela el dibujo de debajo'],
    ['Una manzana revela 9 casillas', '9 casillas', 'Encadena combos y descubre más rápido'],
    ['500 ángeles para coleccionar', '500', 'Cada nivel superado suma uno a tu álbum'],
    ['Si lo superas, es tuyo para siempre', 'para siempre', 'Tres estrellas por una partida limpia y rápida'],
    ['120 logros', '120', 'Frutas, combos, rachas: todo cuenta'],
    ['Un motivo para volver cada día', 'cada día', '3 misiones al día · ángel gratis · premios por racha'],
    ['Mira crecer tus alas', 'alas', 'Niveles, títulos y estadísticas de por vida'],
    ['Cuatro temas de ensueño', 'de ensueño', 'Nubes, cielo nocturno, macaron, jardín'],
  ],
  pills1: ['👼 500 imágenes', '🎨 4 temas'], pills4: ['★ Sin morir', '⚡ Menos de 2 min'],
};

// ── 意语 ──
C['it'] = {
  t: [
    ['Il serpente che dipinge 500 angeli', '500 angeli', 'Ogni casella scopre il disegno sotto'],
    ['Una mela scopre 9 caselle', '9 caselle', 'Concatena combo e scopri più in fretta'],
    ['500 angeli da collezionare', '500', 'Ogni livello superato aggiunge una figura'],
    ['Superalo e resta tuo per sempre', 'per sempre', 'Tre stelle per una partita pulita e veloce'],
    ['120 obiettivi', '120', 'Frutti, combo, serie: conta tutto'],
    ['Un motivo per tornare ogni giorno', 'ogni giorno', '3 missioni al giorno · angelo gratis · bonus serie'],
    ['Guarda crescere le tue ali', 'ali', 'Livelli, titoli e statistiche di sempre'],
    ['Quattro temi da sogno', 'da sogno', 'Nuvole, cielo notturno, macaron, giardino'],
  ],
  pills1: ['👼 500 immagini', '🎨 4 temi'], pills4: ['★ Senza morire', '⚡ Meno di 2 min'],
};

// ── 葡语（巴西）──
C['pt-BR'] = {
  t: [
    ['A cobrinha que pinta 500 anjos', '500 anjos', 'Cada casa revela o desenho embaixo'],
    ['Uma maçã revela 9 casas', '9 casas', 'Emende combos e revele mais rápido'],
    ['500 anjos para colecionar', '500', 'Cada fase concluída soma um ao álbum'],
    ['Concluiu, é seu para sempre', 'para sempre', 'Três estrelas por uma partida limpa e rápida'],
    ['120 conquistas', '120', 'Frutas, combos, sequências: tudo conta'],
    ['Um motivo para voltar todo dia', 'todo dia', '3 missões por dia · anjo grátis · bônus de sequência'],
    ['Veja suas asas crescerem', 'asas', 'Níveis, títulos e estatísticas de sempre'],
    ['Quatro temas dos sonhos', 'dos sonhos', 'Nuvens, céu noturno, macaron, jardim'],
  ],
  pills1: ['👼 500 imagens', '🎨 4 temas'], pills4: ['★ Sem morrer', '⚡ Menos de 2 min'],
};

// ── 俄语 ──
C['ru'] = {
  t: [
    ['Змейка, которая рисует 500 ангелов', '500 ангелов', 'Каждая клетка открывает картинку под ней'],
    ['Одно яблоко открывает 9 клеток', '9 клеток', 'Держите комбо — открывайте быстрее'],
    ['500 ангелов для коллекции', '500', 'Каждый пройденный уровень добавляет картинку'],
    ['Прошли — осталось навсегда', 'навсегда', 'Три звезды за чистый и быстрый забег'],
    ['120 достижений', '120', 'Фрукты, комбо, серии — считается всё'],
    ['Повод возвращаться каждый день', 'каждый день', '3 задания в день · бесплатный ангел · бонусы за серию'],
    ['Смотрите, как растут крылья', 'крылья', 'Уровни, титулы и статистика за всё время'],
    ['Четыре сказочные темы', 'сказочные', 'Облака, звёздное небо, макарон, сад'],
  ],
  pills1: ['👼 500 картинок', '🎨 4 темы'], pills4: ['★ Без смертей', '⚡ Меньше 2 минут'],
};

// ── 乌克兰语 ──
C['uk'] = {
  t: [
    ['Змійка, що малює 500 янголів', '500 янголів', 'Кожна клітинка відкриває малюнок під нею'],
    ['Одне яблуко відкриває 9 клітинок', '9 клітинок', 'Тримайте комбо — відкривайте швидше'],
    ['500 янголів для колекції', '500', 'Кожен пройдений рівень додає картинку'],
    ['Пройшли — лишилося назавжди', 'назавжди', 'Три зірки за чистий і швидкий забіг'],
    ['120 досягнень', '120', 'Фрукти, комбо, серії — рахується все'],
    ['Привід повертатися щодня', 'щодня', '3 завдання на день · безкоштовний янгол · бонуси за серію'],
    ['Дивіться, як ростуть крила', 'крила', 'Рівні, звання та статистика за весь час'],
    ['Чотири казкові теми', 'казкові', 'Хмари, зоряне небо, макарон, сад'],
  ],
  pills1: ['👼 500 картинок', '🎨 4 теми'], pills4: ['★ Без смертей', '⚡ Менш ніж 2 хв'],
};

// ── 荷兰语（英文外来词接受度极高）──
C['nl-NL'] = {
  t: [
    ['Snake die 500 engelen schildert', '500 engelen', 'Elk vakje onthult de tekening eronder'],
    ['Eén appel onthult 9 vakjes', '9 vakjes', 'Rijg combo’s aaneen en onthul sneller'],
    ['500 engelen om te verzamelen', '500', 'Elk voltooid level vult je album'],
    ['Uitgespeeld is voor altijd van jou', 'voor altijd', 'Drie sterren voor een schone, snelle ronde'],
    ['120 prestaties', '120', 'Fruit, combo’s, reeksen — alles telt'],
    ['Een reden om dagelijks terug te komen', 'dagelijks', '3 opdrachten per dag · gratis engel · reeksbonus'],
    ['Zie je vleugels groeien', 'vleugels', 'Levels, titels en statistieken'],
    ['Vier dromerige thema’s', 'dromerige', 'Wolken, sterrenhemel, macaron, tuin'],
  ],
  pills1: ['👼 500 plaatjes', '🎨 4 thema’s'], pills4: ['★ Zonder dood', '⚡ Onder 2 min'],
};

// ── 波兰语（主格/高量形）──
C['pl'] = {
  t: [
    ['Wężyk, który maluje 500 aniołów', '500 aniołów', 'Każde pole odsłania obrazek pod spodem'],
    ['Jedno jabłko odsłania 9 pól', '9 pól', 'Łącz kombinacje i odsłaniaj szybciej'],
    ['500 aniołów do kolekcji', '500', 'Każdy ukończony poziom dokłada obrazek'],
    ['Ukończone zostaje z tobą na zawsze', 'na zawsze', 'Trzy gwiazdki za czystą i szybką rundę'],
    ['120 osiągnięć', '120', 'Owoce, kombinacje, serie — liczy się wszystko'],
    ['Powód, by wracać codziennie', 'codziennie', '3 zadania dziennie · darmowy anioł · nagrody za serię'],
    ['Patrz, jak rosną twoje skrzydła', 'skrzydła', 'Poziomy, tytuły i statystyki'],
    ['Cztery bajkowe motywy', 'bajkowe', 'Chmury, nocne niebo, makaronik, ogród'],
  ],
  pills1: ['👼 500 obrazków', '🎨 4 motywy'], pills4: ['★ Bez śmierci', '⚡ Poniżej 2 min'],
};

// ── 土耳其语（充分本地化）──
C['tr'] = {
  t: [
    ['500 melek çizen yılan', '500 melek', 'Geçtiğin her kare altındaki resmi açar'],
    ['Bir elma 9 kare açar', '9 kare', 'Komboyu sürdür, daha hızlı aç'],
    ['Toplanacak 500 melek', '500', 'Bitirdiğin her bölüm albüme bir resim ekler'],
    ['Bitirdin mi, sonsuza dek senin', 'sonsuza dek', 'Temiz ve hızlı tur için üç yıldız'],
    ['120 başarım', '120', 'Meyveler, combo’lar, seriler — hepsi sayılır'],
    ['Her gün dönmek için bir sebep', 'Her gün', 'Günde 3 görev · ücretsiz melek · seri ödülleri'],
    ['Kanatlarının büyümesini izle', 'Kanatlarının', 'Seviyeler, unvanlar ve tüm zamanlar istatistikleri'],
    ['Dört rüya gibi tema', 'rüya gibi', 'Bulutlar, gece göğü, makaron, bahçe'],
  ],
  pills1: ['👼 500 görsel', '🎨 4 tema'], pills4: ['★ Ölmeden', '⚡ 2 dakikadan az'],
};

// ── 阿拉伯语（RTL；避赌博框架，这里本就无关）──
C['ar-SA'] = {
  t: [
    ['ثعبان يرسم ٥٠٠ ملاك', '٥٠٠ ملاك', 'كل مربع تمر به يكشف الرسمة تحته'],
    ['تفاحة واحدة تكشف ٩ مربعات', '٩ مربعات', 'واصل السلسلة لتكشف أسرع'],
    ['٥٠٠ ملاك للجمع', '٥٠٠', 'كل مرحلة تُنهيها تضيف صورة إلى ألبومك'],
    ['أنهِها لتبقى لك للأبد', 'للأبد', 'ثلاث نجوم لجولة نظيفة وسريعة'],
    ['١٢٠ إنجازاً', '١٢٠', 'الفواكه والسلاسل والأيام المتتالية… كلها تُحتسب'],
    ['سبب للعودة كل يوم', 'كل يوم', '٣ مهام يومياً · ملاك مجاني · مكافآت التتابع'],
    ['شاهد جناحيك يكبران', 'جناحيك', 'المستويات والألقاب وإحصاءات العمر'],
    ['أربعة تصاميم حالمة', 'حالمة', 'غيوم، سماء ليلية، ماكارون، حديقة'],
  ],
  pills1: ['👼 ٥٠٠ صورة', '🎨 ٤ تصاميم'], pills4: ['★ بلا موت', '⚡ أقل من دقيقتين'],
};

// ── 希伯来语（RTL）──
C['he'] = {
  t: [
    ['נחש שמצייר 500 מלאכים', '500 מלאכים', 'כל משבצת שעוברים חושפת את הציור שמתחת'],
    ['תפוח אחד חושף 9 משבצות', '9 משבצות', 'שמרו על רצף וחשפו מהר יותר'],
    ['500 מלאכים לאסוף', '500', 'כל שלב שמסיימים מוסיף תמונה לאלבום'],
    ['סיימתם — נשאר שלכם לתמיד', 'לתמיד', 'שלושה כוכבים לסיבוב נקי ומהיר'],
    ['120 הישגים', '120', 'פירות, רצפים וימים ברצף — הכול נספר'],
    ['סיבה לחזור כל יום', 'כל יום', '3 משימות ביום · מלאך חינם · פרסי רצף'],
    ['תראו את הכנפיים גדלות', 'הכנפיים', 'רמות, תארים וסטטיסטיקה לכל הזמנים'],
    ['ארבע ערכות חלומיות', 'חלומיות', 'עננים, שמי לילה, מקרון, גן'],
  ],
  pills1: ['👼 500 תמונות', '🎨 4 ערכות'], pills4: ['★ בלי למות', '⚡ פחות מ־2 דק’'],
};

// ── 泰语（无空格）──
C['th'] = {
  t: [
    ['งูที่วาดนางฟ้า 500 ภาพ', '500 ภาพ', 'ทุกช่องที่ผ่านจะเปิดภาพข้างใต้'],
    ['แอปเปิลลูกเดียวเปิด 9 ช่อง', '9 ช่อง', 'ต่อคอมโบให้ยาว เปิดภาพได้ไวขึ้น'],
    ['นางฟ้า 500 ภาพให้สะสม', '500', 'ผ่านด่านหนึ่งครั้ง อัลบั้มเพิ่มหนึ่งภาพ'],
    ['ผ่านแล้วเป็นของคุณตลอดไป', 'ตลอดไป', 'สามดาวสำหรับรอบที่ไม่ตายและรวดเร็ว'],
    ['120 ความสำเร็จ', '120', 'ผลไม้ คอมโบ และวันต่อเนื่อง นับหมด'],
    ['เหตุผลที่จะกลับมาทุกวัน', 'ทุกวัน', 'วันละ 3 ภารกิจ · นางฟ้าฟรี · รางวัลต่อเนื่อง'],
    ['ดูปีกของคุณเติบโต', 'ปีก', 'เลเวล ฉายา และสถิติตลอดกาล'],
    ['สี่ธีมในฝัน', 'ในฝัน', 'ก้อนเมฆ ท้องฟ้ายามค่ำ มาการง สวนสวรรค์'],
  ],
  pills1: ['👼 500 ภาพ', '🎨 4 ธีม'], pills4: ['★ ไม่ตายเลย', '⚡ ไม่ถึง 2 นาที'],
};

// ── 越南语（可见文案保留完整音标）──
C['vi'] = {
  t: [
    ['Rắn săn mồi vẽ nên 500 thiên thần', '500 thiên thần', 'Mỗi ô đi qua lại mở ra bức tranh bên dưới'],
    ['Một quả táo mở 9 ô', '9 ô', 'Giữ combo để mở tranh nhanh hơn'],
    ['500 thiên thần để sưu tầm', '500', 'Mỗi màn hoàn thành thêm một tranh vào album'],
    ['Qua màn là của bạn mãi mãi', 'mãi mãi', 'Ba sao cho ván chơi sạch và nhanh'],
    ['120 thành tựu', '120', 'Trái cây, combo, chuỗi ngày — đều được tính'],
    ['Lý do quay lại mỗi ngày', 'mỗi ngày', '3 nhiệm vụ mỗi ngày · thiên thần miễn phí · thưởng chuỗi'],
    ['Ngắm đôi cánh của bạn lớn dần', 'đôi cánh', 'Cấp độ, danh hiệu và thống kê trọn đời'],
    ['Bốn chủ đề mộng mơ', 'mộng mơ', 'Mây, trời đêm, macaron, khu vườn'],
  ],
  pills1: ['👼 500 tranh', '🎨 4 chủ đề'], pills4: ['★ Không chết', '⚡ Dưới 2 phút'],
};

// ── 印尼语 ──
C['id'] = {
  t: [
    ['Ular yang melukis 500 malaikat', '500 malaikat', 'Setiap kotak yang dilewati membuka gambar di bawahnya'],
    ['Satu apel membuka 9 kotak', '9 kotak', 'Sambung combo, buka lebih cepat'],
    ['500 malaikat untuk dikoleksi', '500', 'Setiap level yang tuntas menambah satu gambar'],
    ['Tuntas berarti milikmu selamanya', 'selamanya', 'Tiga bintang untuk ronde bersih dan cepat'],
    ['120 pencapaian', '120', 'Buah, combo, rentetan harian — semuanya dihitung'],
    ['Alasan untuk kembali setiap hari', 'setiap hari', '3 misi per hari · malaikat gratis · hadiah rentetan'],
    ['Lihat sayapmu tumbuh', 'sayapmu', 'Level, gelar, dan statistik sepanjang masa'],
    ['Empat tema seindah mimpi', 'seindah mimpi', 'Awan, langit malam, makaron, taman'],
  ],
  pills1: ['👼 500 gambar', '🎨 4 tema'], pills4: ['★ Tanpa mati', '⚡ Di bawah 2 menit'],
};

// ── 马来语 ──
C['ms'] = {
  t: [
    ['Ular yang melukis 500 malaikat', '500 malaikat', 'Setiap petak yang dilalui mendedahkan lukisan di bawahnya'],
    ['Sebiji epal membuka 9 petak', '9 petak', 'Sambung combo, dedahkan lebih pantas'],
    ['500 malaikat untuk dikumpul', '500', 'Setiap tahap yang tamat menambah satu gambar'],
    ['Tamat bermakna milik anda selamanya', 'selamanya', 'Tiga bintang untuk pusingan bersih dan pantas'],
    ['120 pencapaian', '120', 'Buah, combo, rentetan harian — semua dikira'],
    ['Sebab untuk kembali setiap hari', 'setiap hari', '3 misi sehari · malaikat percuma · ganjaran rentetan'],
    ['Lihat sayap anda membesar', 'sayap', 'Tahap, gelaran dan statistik sepanjang masa'],
    ['Empat tema bagai mimpi', 'bagai mimpi', 'Awan, langit malam, makaron, taman'],
  ],
  pills1: ['👼 500 gambar', '🎨 4 tema'], pills4: ['★ Tanpa mati', '⚡ Bawah 2 minit'],
};

// ── 印地语（Hinglish 混英文是常态）──
C['hi'] = {
  t: [
    ['500 एंजल पेंट करने वाला Snake', '500 एंजल', 'हर खाना पार करते ही नीचे की तस्वीर खुलती है'],
    ['एक सेब से 9 खाने खुलते हैं', '9 खाने', 'Combo बनाए रखें, तस्वीर तेज़ी से खोलें'],
    ['जमा करने को 500 एंजल', '500', 'हर लेवल पूरा होते ही एल्बम में एक तस्वीर'],
    ['पूरा किया मतलब हमेशा के लिए आपका', 'हमेशा', 'बिना मरे और तेज़ी से — तीन स्टार'],
    ['120 अचीवमेंट', '120', 'फल, combo, डेली स्ट्रीक — सब गिना जाता है'],
    ['रोज़ लौटने की वजह', 'रोज़', 'रोज़ 3 quest · मुफ़्त एंजल · स्ट्रीक इनाम'],
    ['अपने पंख बढ़ते देखिए', 'पंख', 'लेवल, टाइटल और लाइफ़टाइम स्टैट्स'],
    ['चार सपनों जैसी थीम', 'सपनों जैसी', 'बादल, रात का आसमान, मकारों, बगीचा'],
  ],
  pills1: ['👼 500 तस्वीरें', '🎨 4 थीम'], pills4: ['★ बिना मरे', '⚡ 2 मिनट से कम'],
};

// ── 北欧 / 中东欧 ──
C['sv'] = { t: [
  ['Snake som målar 500 änglar', '500 änglar', 'Varje ruta du korsar avslöjar bilden under'],
  ['Ett äpple avslöjar 9 rutor', '9 rutor', 'Håll combon igång och avslöja snabbare'],
  ['500 änglar att samla', '500', 'Varje klarad nivå fyller albumet'],
  ['Klarad är din för alltid', 'för alltid', 'Tre stjärnor för en ren och snabb runda'],
  ['120 utmärkelser', '120', 'Frukter, combos, serier — allt räknas'],
  ['En anledning att komma tillbaka varje dag', 'varje dag', '3 uppdrag om dagen · gratis ängel · seriebonusar'],
  ['Se dina vingar växa', 'vingar', 'Nivåer, titlar och statistik'],
  ['Fyra drömska teman', 'drömska', 'Moln, natthimmel, macaron, trädgård'],
], pills1: ['👼 500 bilder', '🎨 4 teman'], pills4: ['★ Utan att dö', '⚡ Under 2 min'] };

C['no'] = { t: [
  ['Snake som maler 500 engler', '500 engler', 'Hver rute du krysser avslører bildet under'],
  ['Ett eple avslører 9 ruter', '9 ruter', 'Hold comboen i gang og avslør raskere'],
  ['500 engler å samle', '500', 'Hvert fullførte nivå fyller albumet'],
  ['Fullført er ditt for alltid', 'for alltid', 'Tre stjerner for en ren og rask runde'],
  ['120 prestasjoner', '120', 'Frukt, comboer, serier — alt teller'],
  ['En grunn til å komme tilbake hver dag', 'hver dag', '3 oppdrag om dagen · gratis engel · seriebonuser'],
  ['Se vingene dine vokse', 'vingene', 'Nivåer, titler og statistikk'],
  ['Fire drømmeaktige temaer', 'drømmeaktige', 'Skyer, nattehimmel, macaron, hage'],
], pills1: ['👼 500 bilder', '🎨 4 temaer'], pills4: ['★ Uten å dø', '⚡ Under 2 min'] };

C['da'] = { t: [
  ['Snake, der maler 500 engle', '500 engle', 'Hvert felt du krydser afslører billedet nedenunder'],
  ['Ét æble afslører 9 felter', '9 felter', 'Hold comboen kørende og afslør hurtigere'],
  ['500 engle at samle', '500', 'Hvert gennemført niveau fylder albummet'],
  ['Gennemført er dit for altid', 'for altid', 'Tre stjerner for en ren og hurtig runde'],
  ['120 præstationer', '120', 'Frugter, combos, serier — alt tæller'],
  ['En grund til at vende tilbage hver dag', 'hver dag', '3 opgaver om dagen · gratis engel · seriebonusser'],
  ['Se dine vinger vokse', 'vinger', 'Niveauer, titler og statistik'],
  ['Fire drømmeagtige temaer', 'drømmeagtige', 'Skyer, nattehimmel, macaron, have'],
], pills1: ['👼 500 billeder', '🎨 4 temaer'], pills4: ['★ Uden at dø', '⚡ Under 2 min'] };

C['fi'] = { t: [
  ['Mato, joka maalaa 500 enkeliä', '500 enkeliä', 'Jokainen ylitetty ruutu paljastaa alla olevan kuvan'],
  ['Yksi omena paljastaa 9 ruutua', '9 ruutua', 'Pidä komboa yllä ja paljasta nopeammin'],
  ['500 enkeliä kerättäväksi', '500', 'Jokainen läpäisty taso täyttää albumia'],
  ['Läpäisty on sinun ikuisesti', 'ikuisesti', 'Kolme tähteä puhtaasta ja nopeasta kierroksesta'],
  ['120 saavutusta', '120', 'Hedelmät, combot, putket — kaikki lasketaan'],
  ['Syy palata joka päivä', 'joka päivä', '3 tehtävää päivässä · ilmainen enkeli · putkipalkinnot'],
  ['Katso siipiesi kasvavan', 'siipiesi', 'Tasot, arvonimet ja tilastot'],
  ['Neljä unenomaista teemaa', 'unenomaista', 'Pilvet, yötaivas, macaron, puutarha'],
], pills1: ['👼 500 kuvaa', '🎨 4 teemaa'], pills4: ['★ Kuolematta', '⚡ Alle 2 min'] };

C['cs'] = { t: [
  ['Had, který maluje 500 andělů', '500 andělů', 'Každé políčko odkryje obrázek pod ním'],
  ['Jedno jablko odkryje 9 políček', '9 políček', 'Držte kombo a odkrývejte rychleji'],
  ['500 andělů ke sbírání', '500', 'Každá dokončená úroveň přidá obrázek'],
  ['Dokončené zůstane navždy vaše', 'navždy', 'Tři hvězdy za čisté a rychlé kolo'],
  ['120 úspěchů', '120', 'Ovoce, komba, série — počítá se všechno'],
  ['Důvod vracet se každý den', 'každý den', '3 úkoly denně · anděl zdarma · odměny za sérii'],
  ['Sledujte, jak vám rostou křídla', 'křídla', 'Úrovně, tituly a statistiky'],
  ['Čtyři snové motivy', 'snové', 'Mraky, noční obloha, makronka, zahrada'],
], pills1: ['👼 500 obrázků', '🎨 4 motivy'], pills4: ['★ Bez smrti', '⚡ Do 2 minut'] };

C['sk'] = { t: [
  ['Had, ktorý maľuje 500 anjelov', '500 anjelov', 'Každé políčko odkryje obrázok pod ním'],
  ['Jedno jablko odkryje 9 políčok', '9 políčok', 'Držte kombo a odkrývajte rýchlejšie'],
  ['500 anjelov na zbieranie', '500', 'Každá dokončená úroveň pridá obrázok'],
  ['Dokončené zostane navždy vaše', 'navždy', 'Tri hviezdy za čisté a rýchle kolo'],
  ['120 úspechov', '120', 'Ovocie, kombá, série — počíta sa všetko'],
  ['Dôvod vracať sa každý deň', 'každý deň', '3 úlohy denne · anjel zadarmo · odmeny za sériu'],
  ['Sledujte, ako vám rastú krídla', 'krídla', 'Úrovne, tituly a štatistiky'],
  ['Štyri snové témy', 'snové', 'Oblaky, nočná obloha, makrónka, záhrada'],
], pills1: ['👼 500 obrázkov', '🎨 4 témy'], pills4: ['★ Bez smrti', '⚡ Do 2 minút'] };

C['hu'] = { t: [
  ['Kígyó, amely 500 angyalt fest', '500 angyalt', 'Minden mező felfedi az alatta lévő képet'],
  ['Egy alma 9 mezőt fed fel', '9 mezőt', 'Tartsd a kombót, gyorsabban fedj fel'],
  ['500 angyal gyűjthető', '500', 'Minden teljesített pálya egy képpel bővíti az albumot'],
  ['Ha teljesíted, örökre a tiéd', 'örökre', 'Három csillag a tiszta és gyors körért'],
  ['120 teljesítmény', '120', 'Gyümölcsök, kombók, sorozatok — minden számít'],
  ['Ok, hogy naponta visszatérj', 'naponta', 'Napi 3 küldetés · ingyen angyal · sorozatjutalmak'],
  ['Nézd, ahogy nő a szárnyad', 'szárnyad', 'Szintek, címek és statisztikák'],
  ['Négy álomszerű téma', 'álomszerű', 'Felhők, éjszakai égbolt, macaron, kert'],
], pills1: ['👼 500 kép', '🎨 4 téma'], pills4: ['★ Halál nélkül', '⚡ 2 perc alatt'] };

C['ro'] = { t: [
  ['Șarpele care pictează 500 de îngeri', '500 de îngeri', 'Fiecare pătrat traversat dezvăluie desenul de dedesubt'],
  ['Un măr dezvăluie 9 pătrate', '9 pătrate', 'Ține combo-ul și dezvăluie mai repede'],
  ['500 de îngeri de colecționat', '500', 'Fiecare nivel terminat adaugă o imagine'],
  ['Terminat înseamnă al tău pentru totdeauna', 'pentru totdeauna', 'Trei stele pentru o rundă curată și rapidă'],
  ['120 de realizări', '120', 'Fructe, combo-uri, serii — totul contează'],
  ['Un motiv să revii în fiecare zi', 'în fiecare zi', '3 misiuni pe zi · înger gratuit · recompense pentru serii'],
  ['Privește cum îți cresc aripile', 'aripile', 'Niveluri, titluri și statistici'],
  ['Patru teme de vis', 'de vis', 'Nori, cer nocturn, macaron, grădină'],
], pills1: ['👼 500 imagini', '🎨 4 teme'], pills4: ['★ Fără să mori', '⚡ Sub 2 minute'] };

C['hr'] = { t: [
  ['Zmija koja slika 500 anđela', '500 anđela', 'Svako polje koje prijeđeš otkriva sliku ispod'],
  ['Jedna jabuka otkriva 9 polja', '9 polja', 'Drži kombinaciju i otkrivaj brže'],
  ['500 anđela za skupljanje', '500', 'Svaka prijeđena razina dodaje sliku u album'],
  ['Prijeđeno ostaje tvoje zauvijek', 'zauvijek', 'Tri zvjezdice za čistu i brzu rundu'],
  ['120 postignuća', '120', 'Voće, kombinacije, nizovi — sve se broji'],
  ['Razlog za povratak svaki dan', 'svaki dan', '3 zadatka dnevno · besplatan anđeo · nagrade za niz'],
  ['Gledaj kako ti rastu krila', 'krila', 'Razine, titule i statistika'],
  ['Četiri sanjive teme', 'sanjive', 'Oblaci, noćno nebo, macaron, vrt'],
], pills1: ['👼 500 slika', '🎨 4 teme'], pills4: ['★ Bez smrti', '⚡ Ispod 2 min'] };

C['el'] = { t: [
  ['Το φίδι που ζωγραφίζει 500 αγγέλους', '500 αγγέλους', 'Κάθε τετράγωνο αποκαλύπτει την εικόνα από κάτω'],
  ['Ένα μήλο αποκαλύπτει 9 τετράγωνα', '9 τετράγωνα', 'Κράτα το combo και αποκάλυψε πιο γρήγορα'],
  ['500 άγγελοι για συλλογή', '500', 'Κάθε πίστα που τελειώνεις προσθέτει μια εικόνα'],
  ['Ό,τι τελειώνεις μένει για πάντα δικό σου', 'για πάντα', 'Τρία αστέρια για καθαρό και γρήγορο γύρο'],
  ['120 επιτεύγματα', '120', 'Φρούτα, combo, σερί — όλα μετράνε'],
  ['Ένας λόγος να επιστρέφεις κάθε μέρα', 'κάθε μέρα', '3 αποστολές τη μέρα · δωρεάν άγγελος · έπαθλα σερί'],
  ['Δες τα φτερά σου να μεγαλώνουν', 'φτερά', 'Επίπεδα, τίτλοι και στατιστικά'],
  ['Τέσσερα ονειρικά θέματα', 'ονειρικά', 'Σύννεφα, νυχτερινός ουρανός, macaron, κήπος'],
], pills1: ['👼 500 εικόνες', '🎨 4 θέματα'], pills4: ['★ Χωρίς θάνατο', '⚡ Κάτω από 2 λεπτά'] };

C['ca'] = { t: [
  ['La serp que pinta 500 àngels', '500 àngels', 'Cada casella que travesses revela el dibuix de sota'],
  ['Una poma revela 9 caselles', '9 caselles', 'Encadena combos i descobreix més ràpid'],
  ['500 àngels per col·leccionar', '500', 'Cada nivell superat suma una imatge a l’àlbum'],
  ['Superat vol dir teu per sempre', 'per sempre', 'Tres estrelles per una partida neta i ràpida'],
  ['120 assoliments', '120', 'Fruites, combos, ratxes: tot compta'],
  ['Un motiu per tornar cada dia', 'cada dia', '3 missions al dia · àngel gratuït · premis de ratxa'],
  ['Mira com creixen les teves ales', 'ales', 'Nivells, títols i estadístiques'],
  ['Quatre temes de somni', 'de somni', 'Núvols, cel nocturn, macaron, jardí'],
], pills1: ['👼 500 imatges', '🎨 4 temes'], pills4: ['★ Sense morir', '⚡ Menys de 2 min'] };

// ── 区域变体：克隆主语言（ASO 的关键词各自独立，图上文案可共用）──
for (const [dst, src] of [['en-GB', 'en-US'], ['en-AU', 'en-US'], ['en-CA', 'en-US'],
                          ['fr-CA', 'fr-FR'], ['es-MX', 'es-ES'], ['pt-PT', 'pt-BR']]) {
  C[dst] = JSON.parse(JSON.stringify(C[src]));
}
// es-MX / pt-PT 的少数词按当地说法调一下（其余共用）
C['es-MX'].t[7] = ['Cuatro temas de ensueño', 'de ensueño', 'Nubes, cielo nocturno, macaron, jardín'];
C['pt-PT'].t[0] = ['A cobra que pinta 500 anjos', '500 anjos', 'Cada casa revela o desenho por baixo'];
C['pt-PT'].t[5] = ['Um motivo para voltar todos os dias', 'todos os dias', '3 missões por dia · anjo grátis · bónus de sequência'];

// ⚠ hl 必须是 h 的子串（否则渐变高亮不生效，图上看不出重点）
for (const [loc, v] of Object.entries(C)) {
  v.t.forEach(([h, hl], i) => {
    if (!h.includes(hl)) throw new Error(`[shot-caps] ${loc} 第 ${i + 1} 张的 hl「${hl}」不是 h 的子串`);
  });
  if (v.t.length !== 8) throw new Error(`[shot-caps] ${loc} 不是 8 条`);
}

// store locale → 用哪种 UI 语言的 raw 图（app UI 只有 10 语）
const RAWLANG = {
  'en-US': 'en', 'en-GB': 'en', 'en-AU': 'en', 'en-CA': 'en',
  'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-CN',
  'ja': 'ja', 'de-DE': 'de', 'ru': 'ru', 'hi': 'hi',
  'es-ES': 'es', 'es-MX': 'es', 'pt-BR': 'pt-BR', 'pt-PT': 'pt-BR',
};
for (const loc of Object.keys(C)) if (!RAWLANG[loc]) RAWLANG[loc] = 'en';   // 其余走英文 UI

module.exports = { CAPS: C, RAWLANG };

