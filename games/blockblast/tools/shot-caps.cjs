// games/blockblast/tools/shot-caps.cjs — 商店截图的 39 语文案（大字标题 / 高亮词 / 副标 / 胶囊）
//
// ⚠ 不是机翻英文那套：每语言按该语言的自然说法写（aso-i18n-guide 同规）。
// ⚠ `hl`（渐变高亮词）**必须是 h 的子串**，否则替换不生效 —— 文件末尾有断言。
// ⚠ app UI 只有 10 语；其余 locale 用**英文 UI 的 raw 图 + 本地化大字标题**（苹果允许）。
//
// 八张叙事线（顺序 = make-shots 的 SHOTS）：
//   0 公平（4.3 防御 + 最强差异化，**必须是第 1 张**）· 1 玩法/消行预览 · 2 300 关 · 3 教练
//   4 天使图鉴 500 · 5 每日谜题 · 6 皮肤 · 7 主界面/等级
// 形状：[h, hl, s]；另有 pills1（第 1 张两枚胶囊）与 pills4（第 4 张两枚胶囊）。
//
// ⛔ 措辞红线：公平承诺只能说「块流由种子定死、不看你的棋盘」，
//   **绝不能写成「保证你能赢」「永远给你需要的块」** —— 那正是我们在骂的东西。

const C = {};

C['en-US'] = {
  t: [
    ['Nothing is rigged. Here is the proof.', 'the proof', 'The piece order is fixed by a seed you can copy'],
    ['See the clear before you drop', 'before you drop', 'Chase the streak — that is where the points are'],
    ['300 levels, 30 chapters', '300 levels', 'Free the crystals, work around the stones'],
    ['A coach that shows the best move', 'best move', 'And tells you which move cost you the run'],
    ['500 angels to collect', '500 angels', 'Every game you finish adds one to your album'],
    ['A new puzzle every day', 'every day', 'Same pieces worldwide — your score is comparable'],
    ['20 themes to unlock', '20 themes', 'All of it earned by playing. No paywall.'],
    ['Levels, titles, a ladder to climb', 'a ladder', 'Every block you place counts'],
  ],
  pills1: ['🔍 Seed you can check', '🚫 No difficulty tricks'], pills4: ['💡 Best move', '🔍 Death replay'],
};
C['zh-Hans'] = {
  t: [
    ['没有暗箱。证据在这里。', '证据在这里', '出块顺序由种子定死，种子你随时可以复制'],
    ['落子前就看得见能消哪条', '落子前', '连击才是分数的来源'],
    ['300 关，30 个章节', '300 关', '解放水晶，绕开石块'],
    ['会告诉你最优一手的教练', '最优一手', '还会告诉你，是哪一手把这局输掉的'],
    ['500 张天使图等你收集', '500 张', '每打完一局，图鉴就多一张'],
    ['每天一道新谜题', '每天', '全球同一条块流 —— 分数真的可比'],
    ['20 款皮肤等着解锁', '20 款皮肤', '全部靠玩获得，没有付费墙'],
    ['等级、称号，还有一条榜可以爬', '一条榜', '你放下的每一块都算数'],
  ],
  pills1: ['🔍 种子可查', '🚫 不改难度'], pills4: ['💡 最优一手', '🔍 死亡复盘'],
};
C['zh-Hant'] = {
  t: [
    ['沒有暗箱。證據在這裡。', '證據在這裡', '出塊順序由種子定死，種子你隨時可以複製'],
    ['落子前就看得見能消哪條', '落子前', '連擊才是分數的來源'],
    ['300 關，30 個章節', '300 關', '解放水晶，繞開石塊'],
    ['會告訴你最佳一手的教練', '最佳一手', '還會告訴你，是哪一手把這局輸掉的'],
    ['500 張天使圖等你收集', '500 張', '每打完一局，圖鑑就多一張'],
    ['每天一道新謎題', '每天', '全球同一條塊流 —— 分數真的可比'],
    ['20 款皮膚等著解鎖', '20 款皮膚', '全部靠玩獲得，沒有付費牆'],
    ['等級、稱號，還有一條榜可以爬', '一條榜', '你放下的每一塊都算數'],
  ],
  pills1: ['🔍 種子可查', '🚫 不改難度'], pills4: ['💡 最佳一手', '🔍 死亡重播'],
};
C['ja'] = {
  t: [
    ['細工なし。これがその証拠。', 'その証拠', 'ピースの並びはシードで固定。コピーして確かめられます'],
    ['置く前に、消える列が見える', '置く前に', '連鎖こそがスコアの源'],
    ['300 ステージ、30 章', '300 ステージ', 'クリスタルを解放し、石をよける'],
    ['最善手を教えてくれるコーチ', '最善手', 'どの一手で負けたのかも教えます'],
    ['集められる天使は 500 枚', '500 枚', '1 ゲーム終えるごとに図鑑が 1 枚増える'],
    ['毎日、新しいパズル', '毎日', '世界中で同じピース列 —— スコアが本当に比べられる'],
    ['20 種のテーマ', '20 種', 'すべて遊んで手に入る。課金の壁なし。'],
    ['レベル、称号、そして登る梯子', '梯子', '置いた一手はすべて記録に残る'],
  ],
  pills1: ['🔍 シード確認可', '🚫 難易度の細工なし'], pills4: ['💡 最善手', '🔍 敗北のリプレイ'],
};
C['ko'] = {
  t: [
    ['조작 없음. 증거가 여기 있습니다.', '증거가 여기', '블록 순서는 시드로 고정 — 복사해서 확인하세요'],
    ['놓기 전에 지워질 줄이 보입니다', '놓기 전에', '연속 제거가 점수의 원천'],
    ['300 레벨, 30 챕터', '300 레벨', '크리스털을 풀어주고 돌은 피하세요'],
    ['최선의 수를 알려주는 코치', '최선의 수', '어느 수에서 판이 무너졌는지도 알려줍니다'],
    ['모을 수 있는 천사 500장', '500장', '한 판 끝낼 때마다 도감이 한 장씩'],
    ['매일 새로운 퍼즐', '매일', '전 세계 같은 블록 순서 — 점수 비교가 진짜로 됩니다'],
    ['테마 20종', '20종', '전부 플레이로 획득. 유료 장벽 없음.'],
    ['레벨, 칭호, 그리고 오를 사다리', '사다리', '놓은 블록 하나하나가 기록됩니다'],
  ],
  pills1: ['🔍 시드 확인 가능', '🚫 난이도 조작 없음'], pills4: ['💡 최선의 수', '🔍 패배 리플레이'],
};
C['de-DE'] = {
  t: [
    ['Nichts ist manipuliert. Hier der Beweis.', 'der Beweis', 'Die Teilefolge steht per Seed fest — kopierbar'],
    ['Sieh die Reihe, bevor du ablegst', 'bevor du ablegst', 'Die Serie bringt die Punkte'],
    ['300 Level, 30 Kapitel', '300 Level', 'Kristalle befreien, Steine umgehen'],
    ['Ein Coach, der den besten Zug zeigt', 'besten Zug', 'Und sagt dir, welcher Zug die Runde gekostet hat'],
    ['500 Engel zum Sammeln', '500 Engel', 'Jede beendete Runde bringt einen ins Album'],
    ['Jeden Tag ein neues Rätsel', 'Jeden Tag', 'Weltweit dieselben Teile — Punkte wirklich vergleichbar'],
    ['20 Designs freispielen', '20 Designs', 'Alles erspielbar. Keine Paywall.'],
    ['Level, Titel und eine Leiter', 'eine Leiter', 'Jeder gesetzte Block zählt'],
  ],
  pills1: ['🔍 Seed prüfbar', '🚫 Keine Tricks'], pills4: ['💡 Bester Zug', '🔍 Niederlagen-Replay'],
};
C['fr-FR'] = {
  t: [
    ['Rien n’est truqué. La preuve.', 'La preuve', 'L’ordre des pièces est fixé par une graine copiable'],
    ['Voyez la ligne avant de poser', 'avant de poser', 'La série, c’est là que sont les points'],
    ['300 niveaux, 30 chapitres', '300 niveaux', 'Libérez les cristaux, contournez les pierres'],
    ['Un coach qui montre le meilleur coup', 'meilleur coup', 'Et vous dit quel coup a coûté la partie'],
    ['500 anges à collectionner', '500 anges', 'Chaque partie terminée en ajoute un à l’album'],
    ['Une nouvelle grille chaque jour', 'chaque jour', 'Mêmes pièces partout — scores vraiment comparables'],
    ['20 thèmes à débloquer', '20 thèmes', 'Tout se gagne en jouant. Sans paywall.'],
    ['Niveaux, titres et une échelle à gravir', 'une échelle', 'Chaque bloc posé compte'],
  ],
  pills1: ['🔍 Graine vérifiable', '🚫 Aucune triche'], pills4: ['💡 Meilleur coup', '🔍 Replay de défaite'],
};
C['es-ES'] = {
  t: [
    ['Nada está amañado. Aquí está la prueba.', 'la prueba', 'El orden de las piezas lo fija una semilla que puedes copiar'],
    ['Mira la línea antes de soltar', 'antes de soltar', 'La racha es donde están los puntos'],
    ['300 niveles, 30 capítulos', '300 niveles', 'Libera los cristales, esquiva las piedras'],
    ['Un entrenador que enseña la mejor jugada', 'la mejor jugada', 'Y te dice qué jugada te costó la partida'],
    ['500 ángeles por coleccionar', '500 ángeles', 'Cada partida terminada añade uno al álbum'],
    ['Un puzle nuevo cada día', 'cada día', 'Las mismas piezas en todo el mundo — puntuaciones comparables'],
    ['20 temas por desbloquear', '20 temas', 'Todo se gana jugando. Sin muro de pago.'],
    ['Niveles, títulos y una escalera que subir', 'una escalera', 'Cada bloque que colocas cuenta'],
  ],
  pills1: ['🔍 Semilla verificable', '🚫 Sin trampas'], pills4: ['💡 Mejor jugada', '🔍 Repetición de la derrota'],
};
C['it'] = {
  t: [
    ['Niente è truccato. Ecco la prova.', 'la prova', 'L’ordine dei pezzi è fissato da un seed copiabile'],
    ['Vedi la riga prima di posare', 'prima di posare', 'La serie è dove stanno i punti'],
    ['300 livelli, 30 capitoli', '300 livelli', 'Libera i cristalli, aggira le pietre'],
    ['Un coach che mostra la mossa migliore', 'la mossa migliore', 'E ti dice quale mossa ti è costata la partita'],
    ['500 angeli da collezionare', '500 angeli', 'Ogni partita finita ne aggiunge uno all’album'],
    ['Un puzzle nuovo ogni giorno', 'ogni giorno', 'Stessi pezzi in tutto il mondo — punteggi confrontabili'],
    ['20 temi da sbloccare', '20 temi', 'Tutto si guadagna giocando. Nessun paywall.'],
    ['Livelli, titoli e una scala da salire', 'una scala', 'Ogni blocco che posi conta'],
  ],
  pills1: ['🔍 Seed verificabile', '🚫 Nessun trucco'], pills4: ['💡 Mossa migliore', '🔍 Replay della sconfitta'],
};
C['pt-BR'] = {
  t: [
    ['Nada é manipulado. Aqui está a prova.', 'a prova', 'A ordem das peças é fixada por uma seed que você copia'],
    ['Veja a linha antes de soltar', 'antes de soltar', 'A sequência é onde estão os pontos'],
    ['300 fases, 30 capítulos', '300 fases', 'Liberte os cristais, contorne as pedras'],
    ['Um treinador que mostra a melhor jogada', 'a melhor jogada', 'E diz qual jogada custou a partida'],
    ['500 anjos para colecionar', '500 anjos', 'Cada partida concluída adiciona um ao álbum'],
    ['Um quebra-cabeça novo todo dia', 'todo dia', 'As mesmas peças no mundo todo — placar comparável'],
    ['20 temas para desbloquear', '20 temas', 'Tudo conquistado jogando. Sem paywall.'],
    ['Níveis, títulos e uma escada para subir', 'uma escada', 'Cada bloco que você posiciona conta'],
  ],
  pills1: ['🔍 Seed verificável', '🚫 Sem truques'], pills4: ['💡 Melhor jogada', '🔍 Replay da derrota'],
};
C['ru'] = {
  t: [
    ['Ничего не подстроено. Вот доказательство.', 'доказательство', 'Порядок фигур задаёт сид — его можно скопировать'],
    ['Видно, какая линия уйдёт, ещё до хода', 'до хода', 'Очки берутся из серии'],
    ['300 уровней, 30 глав', '300 уровней', 'Освобождайте кристаллы, обходите камни'],
    ['Тренер, который показывает лучший ход', 'лучший ход', 'И говорит, какой ход стоил вам партии'],
    ['500 ангелов для коллекции', '500 ангелов', 'Каждая сыгранная партия добавляет одного в альбом'],
    ['Каждый день новая головоломка', 'Каждый день', 'Одни и те же фигуры по всему миру — счёт сравним'],
    ['20 оформлений', '20 оформлений', 'Всё добывается игрой. Без платного барьера.'],
    ['Уровни, титулы и лестница наверх', 'лестница', 'Каждый поставленный блок идёт в счёт'],
  ],
  pills1: ['🔍 Сид проверяем', '🚫 Без подкруток'], pills4: ['💡 Лучший ход', '🔍 Повтор поражения'],
};
C['uk'] = {
  t: [
    ['Нічого не підлаштовано. Ось доказ.', 'Ось доказ', 'Порядок фігур задає сид — його можна скопіювати'],
    ['Видно, який рядок зникне, ще до ходу', 'до ходу', 'Очки беруться із серії'],
    ['300 рівнів, 30 розділів', '300 рівнів', 'Вивільняйте кристали, обходьте камені'],
    ['Тренер, що показує найкращий хід', 'найкращий хід', 'І каже, який хід коштував вам партії'],
    ['500 янголів для колекції', '500 янголів', 'Кожна завершена гра додає одного до альбому'],
    ['Щодня нова головоломка', 'Щодня', 'Однакові фігури по всьому світу — рахунок можна порівняти'],
    ['20 оформлень', '20 оформлень', 'Усе здобувається грою. Без платного бар’єра.'],
    ['Рівні, титули і драбина вгору', 'драбина', 'Кожен поставлений блок має значення'],
  ],
  pills1: ['🔍 Сид перевіряється', '🚫 Без підкруток'], pills4: ['💡 Найкращий хід', '🔍 Повтор поразки'],
};
C['nl-NL'] = {
  t: [
    ['Niets is gemanipuleerd. Hier is het bewijs.', 'het bewijs', 'De stukjesvolgorde ligt vast via een seed die je kunt kopiëren'],
    ['Zie de rij voordat je loslaat', 'voordat je loslaat', 'De reeks levert de punten op'],
    ['300 levels, 30 hoofdstukken', '300 levels', 'Bevrijd de kristallen, ontwijk de stenen'],
    ['Een coach die de beste zet laat zien', 'de beste zet', 'En vertelt welke zet je het potje kostte'],
    ['500 engelen om te verzamelen', '500 engelen', 'Elk gespeeld potje voegt er één toe'],
    ['Elke dag een nieuwe puzzel', 'Elke dag', 'Wereldwijd dezelfde stukjes — scores echt vergelijkbaar'],
    ['20 thema’s vrijspelen', '20 thema’s', 'Alles verdien je door te spelen. Geen paywall.'],
    ['Levels, titels en een ladder', 'een ladder', 'Elk blok dat je plaatst telt'],
  ],
  pills1: ['🔍 Seed te checken', '🚫 Geen trucjes'], pills4: ['💡 Beste zet', '🔍 Replay van verlies'],
};
C['pl'] = {
  t: [
    ['Nic nie jest ustawione. Oto dowód.', 'Oto dowód', 'Kolejność klocków ustala ziarno — możesz je skopiować'],
    ['Zobacz linię, zanim upuścisz', 'zanim upuścisz', 'Punkty biorą się z serii'],
    ['300 poziomów, 30 rozdziałów', '300 poziomów', 'Uwolnij kryształy, omijaj kamienie'],
    ['Trener, który pokazuje najlepszy ruch', 'najlepszy ruch', 'I mówi, który ruch kosztował cię grę'],
    ['500 aniołów do zebrania', '500 aniołów', 'Każda skończona gra dokłada jednego do albumu'],
    ['Codziennie nowa łamigłówka', 'Codziennie', 'Te same klocki na całym świecie — wyniki porównywalne'],
    ['20 motywów do odblokowania', '20 motywów', 'Wszystko zdobywasz grą. Bez paywalla.'],
    ['Poziomy, tytuły i drabina', 'drabina', 'Każdy postawiony klocek się liczy'],
  ],
  pills1: ['🔍 Ziarno do sprawdzenia', '🚫 Bez sztuczek'], pills4: ['💡 Najlepszy ruch', '🔍 Powtórka porażki'],
};
C['tr'] = {
  t: [
    ['Hiçbir şey hileli değil. İşte kanıtı.', 'İşte kanıtı', 'Parça sırası kopyalayabileceğin bir tohumla sabit'],
    ['Bırakmadan önce silinecek sırayı gör', 'Bırakmadan önce', 'Puan seride'],
    ['300 bölüm, 30 kısım', '300 bölüm', 'Kristalleri kurtar, taşları dolan'],
    ['En iyi hamleyi gösteren bir koç', 'En iyi hamleyi', 'Hangi hamlenin oyunu kaybettirdiğini de söyler'],
    ['Toplanacak 500 melek', '500 melek', 'Bitirdiğin her oyun albüme bir tane ekler'],
    ['Her gün yeni bir bulmaca', 'Her gün', 'Dünyada aynı parçalar — skorlar gerçekten kıyaslanabilir'],
    ['Açılacak 20 tema', '20 tema', 'Hepsi oynayarak kazanılır. Ödeme duvarı yok.'],
    ['Seviyeler, unvanlar ve tırmanılacak bir merdiven', 'bir merdiven', 'Koyduğun her blok sayılır'],
  ],
  pills1: ['🔍 Tohum kontrol edilebilir', '🚫 Hile yok'], pills4: ['💡 En iyi hamle', '🔍 Yenilgi tekrarı'],
};
C['ar-SA'] = {
  t: [
    ['لا شيء مُتلاعب به. هذا هو الدليل.', 'هذا هو الدليل', 'ترتيب القطع تحدده بذرة يمكنك نسخها'],
    ['شاهد الصف قبل أن تُسقط القطعة', 'قبل أن تُسقط', 'النقاط تأتي من السلسلة'],
    ['300 مرحلة، 30 فصلاً', '300 مرحلة', 'حرّر البلورات وتفادَ الأحجار'],
    ['مدرّب يُريك أفضل حركة', 'أفضل حركة', 'ويخبرك أي حركة كلفتك الجولة'],
    ['500 ملاك للجمع', '500 ملاك', 'كل جولة تُنهيها تضيف واحدًا إلى ألبومك'],
    ['أحجية جديدة كل يوم', 'كل يوم', 'نفس القطع حول العالم — النتائج قابلة للمقارنة'],
    ['20 مظهرًا لفتحها', '20 مظهرًا', 'كلها تُكتسب باللعب. بلا جدار دفع.'],
    ['مستويات وألقاب وسلّم للصعود', 'سلّم', 'كل مكعّب تضعه له حساب'],
  ],
  pills1: ['🔍 بذرة قابلة للفحص', '🚫 بلا تلاعب'], pills4: ['💡 أفضل حركة', '🔍 إعادة الخسارة'],
};
C['he'] = {
  t: [
    ['שום דבר לא מסודר מראש. הנה ההוכחה.', 'הנה ההוכחה', 'סדר החלקים נקבע על ידי זרע שאפשר להעתיק'],
    ['רואים את השורה עוד לפני ההנחה', 'לפני ההנחה', 'הנקודות מגיעות מהרצף'],
    ['300 שלבים, 30 פרקים', '300 שלבים', 'שחררו את הגבישים, עקפו את האבנים'],
    ['מאמן שמראה את המהלך הטוב ביותר', 'המהלך הטוב ביותר', 'וגם אומר איזה מהלך עלה לכם במשחק'],
    ['500 מלאכים לאסוף', '500 מלאכים', 'כל משחק שמסיימים מוסיף אחד לאלבום'],
    ['חידה חדשה בכל יום', 'בכל יום', 'אותם חלקים בכל העולם — הניקוד באמת בר-השוואה'],
    ['20 ערכות לפתוח', '20 ערכות', 'הכול מרוויחים במשחק. בלי חומת תשלום.'],
    ['רמות, תארים וסולם לטפס בו', 'סולם', 'כל קובייה שמניחים נספרת'],
  ],
  pills1: ['🔍 זרע ניתן לבדיקה', '🚫 בלי טריקים'], pills4: ['💡 המהלך הטוב ביותר', '🔍 שחזור ההפסד'],
};
C['th'] = {
  t: [
    ['ไม่มีการจัดฉาก นี่คือหลักฐาน', 'นี่คือหลักฐาน', 'ลำดับบล็อกถูกกำหนดด้วยซีดที่คุณคัดลอกไปตรวจได้'],
    ['เห็นแถวที่จะหายก่อนวาง', 'ก่อนวาง', 'คะแนนมาจากคอมโบต่อเนื่อง'],
    ['300 ด่าน 30 บท', '300 ด่าน', 'ปลดปล่อยคริสตัล เลี่ยงก้อนหิน'],
    ['โค้ชที่ชี้ตาเดินที่ดีที่สุด', 'ตาเดินที่ดีที่สุด', 'และบอกว่าตาไหนทำให้คุณแพ้'],
    ['เทวดา 500 ภาพให้สะสม', '500 ภาพ', 'จบเกมหนึ่งครั้ง อัลบั้มเพิ่มหนึ่งภาพ'],
    ['ปริศนาใหม่ทุกวัน', 'ทุกวัน', 'บล็อกชุดเดียวกันทั้งโลก — เทียบคะแนนได้จริง'],
    ['20 ธีมให้ปลดล็อก', '20 ธีม', 'ได้มาจากการเล่นล้วน ๆ ไม่มีกำแพงจ่ายเงิน'],
    ['เลเวล ฉายา และบันไดให้ไต่', 'บันได', 'ทุกบล็อกที่คุณวางมีความหมาย'],
  ],
  pills1: ['🔍 ตรวจซีดได้', '🚫 ไม่มีการปรับความยาก'], pills4: ['💡 ตาเดินที่ดีที่สุด', '🔍 รีเพลย์ตอนแพ้'],
};
C['vi'] = {
  t: [
    ['Không có gì bị dàn xếp. Đây là bằng chứng.', 'Đây là bằng chứng', 'Thứ tự khối do một seed quy định — bạn sao chép được'],
    ['Thấy hàng sẽ nổ trước khi thả', 'trước khi thả', 'Điểm nằm ở chuỗi liên tiếp'],
    ['300 màn, 30 chương', '300 màn', 'Giải phóng pha lê, né đá'],
    ['Huấn luyện viên chỉ nước đi tốt nhất', 'nước đi tốt nhất', 'Và nói cho bạn nước nào đã làm hỏng ván'],
    ['500 thiên thần để sưu tầm', '500 thiên thần', 'Mỗi ván chơi xong thêm một tấm vào album'],
    ['Mỗi ngày một câu đố mới', 'Mỗi ngày', 'Cùng một chuỗi khối trên toàn thế giới — điểm so được'],
    ['20 giao diện để mở khóa', '20 giao diện', 'Tất cả đều kiếm bằng cách chơi. Không tường phí.'],
    ['Cấp độ, danh hiệu và một bậc thang để leo', 'bậc thang', 'Mỗi khối bạn đặt đều được tính'],
  ],
  pills1: ['🔍 Seed kiểm tra được', '🚫 Không chỉnh độ khó'], pills4: ['💡 Nước đi tốt nhất', '🔍 Xem lại ván thua'],
};
C['id'] = {
  t: [
    ['Tidak ada yang diatur. Ini buktinya.', 'Ini buktinya', 'Urutan balok ditentukan seed yang bisa kamu salin'],
    ['Lihat barisnya sebelum menjatuhkan', 'sebelum menjatuhkan', 'Poin datang dari rentetan'],
    ['300 level, 30 bab', '300 level', 'Bebaskan kristal, hindari batu'],
    ['Pelatih yang menunjukkan langkah terbaik', 'langkah terbaik', 'Dan memberi tahu langkah mana yang membuatmu kalah'],
    ['500 malaikat untuk dikoleksi', '500 malaikat', 'Setiap permainan selesai menambah satu ke album'],
    ['Teka-teki baru setiap hari', 'setiap hari', 'Balok yang sama di seluruh dunia — skor benar-benar sebanding'],
    ['20 tema untuk dibuka', '20 tema', 'Semua didapat dengan bermain. Tanpa paywall.'],
    ['Level, gelar, dan tangga untuk didaki', 'tangga', 'Setiap balok yang kamu letakkan dihitung'],
  ],
  pills1: ['🔍 Seed bisa dicek', '🚫 Tanpa trik'], pills4: ['💡 Langkah terbaik', '🔍 Tayang ulang kekalahan'],
};
C['ms'] = {
  t: [
    ['Tiada apa yang diatur. Ini buktinya.', 'Ini buktinya', 'Urutan blok ditetapkan oleh benih yang boleh anda salin'],
    ['Lihat barisnya sebelum melepaskan', 'sebelum melepaskan', 'Mata datang daripada rentetan'],
    ['300 tahap, 30 bab', '300 tahap', 'Bebaskan kristal, elak batu'],
    ['Jurulatih yang menunjukkan langkah terbaik', 'langkah terbaik', 'Dan memberitahu langkah mana yang merugikan anda'],
    ['500 malaikat untuk dikumpul', '500 malaikat', 'Setiap permainan tamat menambah satu ke album'],
    ['Teka-teki baharu setiap hari', 'setiap hari', 'Blok yang sama di seluruh dunia — skor benar-benar setanding'],
    ['20 tema untuk dibuka', '20 tema', 'Semua diperoleh dengan bermain. Tiada paywall.'],
    ['Tahap, gelaran dan tangga untuk didaki', 'tangga', 'Setiap blok yang anda letak dikira'],
  ],
  pills1: ['🔍 Benih boleh disemak', '🚫 Tiada helah'], pills4: ['💡 Langkah terbaik', '🔍 Ulang tayang kekalahan'],
};
C['hi'] = {
  t: [
    ['कुछ भी सेट नहीं है। यह रहा सबूत।', 'यह रहा सबूत', 'टुकड़ों का क्रम एक सीड से तय होता है — आप उसे कॉपी कर सकते हैं'],
    ['रखने से पहले ही दिख जाती है कटने वाली लाइन', 'रखने से पहले', 'अंक लगातार कटती लाइनों से आते हैं'],
    ['300 स्तर, 30 अध्याय', '300 स्तर', 'क्रिस्टल आज़ाद करें, पत्थरों से बचें'],
    ['सबसे अच्छी चाल दिखाने वाला कोच', 'सबसे अच्छी चाल', 'और बताता है कि किस चाल ने खेल बिगाड़ा'],
    ['इकट्ठा करने के लिए 500 फ़रिश्ते', '500 फ़रिश्ते', 'हर पूरी की गई बाज़ी एल्बम में एक जोड़ती है'],
    ['हर दिन एक नई पहेली', 'हर दिन', 'दुनिया भर में वही टुकड़े — स्कोर सच में तुलनीय'],
    ['खोलने के लिए 20 थीम', '20 थीम', 'सब कुछ खेलकर मिलता है। कोई पेवॉल नहीं।'],
    ['स्तर, उपाधियाँ और चढ़ने को एक सीढ़ी', 'एक सीढ़ी', 'आपका रखा हर ब्लॉक गिना जाता है'],
  ],
  pills1: ['🔍 सीड जाँची जा सकती है', '🚫 कोई चालाकी नहीं'], pills4: ['💡 सबसे अच्छी चाल', '🔍 हार का रीप्ले'],
};
C['sv'] = {
  t: [
    ['Inget är riggat. Här är beviset.', 'Här är beviset', 'Bitordningen bestäms av ett frö du kan kopiera'],
    ['Se raden innan du släpper', 'innan du släpper', 'Poängen finns i sviten'],
    ['300 nivåer, 30 kapitel', '300 nivåer', 'Befria kristallerna, undvik stenarna'],
    ['En coach som visar bästa draget', 'bästa draget', 'Och berättar vilket drag som kostade omgången'],
    ['500 änglar att samla', '500 änglar', 'Varje avslutad omgång lägger till en i albumet'],
    ['Ett nytt pussel varje dag', 'varje dag', 'Samma bitar i hela världen — poängen går att jämföra'],
    ['20 teman att låsa upp', '20 teman', 'Allt förtjänas genom spel. Ingen betalvägg.'],
    ['Nivåer, titlar och en stege att klättra', 'en stege', 'Varje block du lägger räknas'],
  ],
  pills1: ['🔍 Frö går att kolla', '🚫 Inga trick'], pills4: ['💡 Bästa draget', '🔍 Repris av förlusten'],
};
C['no'] = {
  t: [
    ['Ingenting er rigget. Her er beviset.', 'Her er beviset', 'Brikkerekkefølgen er låst av et frø du kan kopiere'],
    ['Se raden før du slipper', 'før du slipper', 'Poengene ligger i rekken'],
    ['300 nivåer, 30 kapitler', '300 nivåer', 'Frigjør krystallene, styr unna steinene'],
    ['En coach som viser beste trekk', 'beste trekk', 'Og sier hvilket trekk som kostet deg runden'],
    ['500 engler å samle', '500 engler', 'Hver fullførte runde legger til én i albumet'],
    ['Et nytt puslespill hver dag', 'hver dag', 'Samme brikker over hele verden — poeng kan sammenlignes'],
    ['20 temaer å låse opp', '20 temaer', 'Alt tjenes ved å spille. Ingen betalingsmur.'],
    ['Nivåer, titler og en stige å klatre', 'en stige', 'Hver blokk du legger teller'],
  ],
  pills1: ['🔍 Frø kan sjekkes', '🚫 Ingen triks'], pills4: ['💡 Beste trekk', '🔍 Reprise av tapet'],
};
C['da'] = {
  t: [
    ['Intet er rigget. Her er beviset.', 'Her er beviset', 'Brikkernes rækkefølge er låst af et frø, du kan kopiere'],
    ['Se rækken, før du slipper', 'før du slipper', 'Pointene ligger i serien'],
    ['300 baner, 30 kapitler', '300 baner', 'Befri krystallerne, undgå stenene'],
    ['En coach, der viser bedste træk', 'bedste træk', 'Og fortæller, hvilket træk der kostede dig omgangen'],
    ['500 engle at samle', '500 engle', 'Hver færdig omgang lægger én til albummet'],
    ['Et nyt puslespil hver dag', 'hver dag', 'Samme brikker i hele verden — point kan sammenlignes'],
    ['20 temaer at låse op', '20 temaer', 'Alt optjenes ved at spille. Ingen betalingsmur.'],
    ['Niveauer, titler og en stige at bestige', 'en stige', 'Hver blok, du lægger, tæller'],
  ],
  pills1: ['🔍 Frø kan tjekkes', '🚫 Ingen tricks'], pills4: ['💡 Bedste træk', '🔍 Genafspilning af nederlaget'],
};
C['fi'] = {
  t: [
    ['Mitään ei ole viritetty. Tässä todiste.', 'Tässä todiste', 'Palojen järjestys on kiinni siemenluvusta, jonka voit kopioida'],
    ['Näet rivin ennen kuin pudotat', 'ennen kuin pudotat', 'Pisteet tulevat putkesta'],
    ['300 tasoa, 30 lukua', '300 tasoa', 'Vapauta kristallit, kierrä kivet'],
    ['Valmentaja, joka näyttää parhaan siirron', 'parhaan siirron', 'Ja kertoo, mikä siirto vei pelin'],
    ['500 enkeliä kerättäväksi', '500 enkeliä', 'Jokainen päätetty peli lisää yhden albumiin'],
    ['Uusi pulma joka päivä', 'joka päivä', 'Samat palat kaikkialla — pisteet ovat aidosti vertailukelpoisia'],
    ['20 teemaa avattavaksi', '20 teemaa', 'Kaikki ansaitaan pelaamalla. Ei maksumuuria.'],
    ['Tasot, arvonimet ja kiivettävä tikas', 'tikas', 'Jokainen asettamasi palikka lasketaan'],
  ],
  pills1: ['🔍 Siemenluku tarkistettavissa', '🚫 Ei kikkailua'], pills4: ['💡 Paras siirto', '🔍 Tappion uusinta'],
};
C['cs'] = {
  t: [
    ['Nic není zmanipulované. Tady je důkaz.', 'Tady je důkaz', 'Pořadí dílků určuje seed, který si můžeš zkopírovat'],
    ['Uvidíš řadu dřív, než položíš', 'dřív, než položíš', 'Body jsou v sérii'],
    ['300 úrovní, 30 kapitol', '300 úrovní', 'Osvoboď krystaly, obejdi kameny'],
    ['Kouč, který ukáže nejlepší tah', 'nejlepší tah', 'A řekne, který tah tě stál hru'],
    ['500 andělů ke sbírání', '500 andělů', 'Každá dohraná partie přidá jednoho do alba'],
    ['Každý den nová hádanka', 'Každý den', 'Stejné dílky po celém světě — skóre je opravdu srovnatelné'],
    ['20 motivů k odemčení', '20 motivů', 'Vše se získává hraním. Žádná placená zeď.'],
    ['Úrovně, tituly a žebřík k výstupu', 'žebřík', 'Každý položený blok se počítá'],
  ],
  pills1: ['🔍 Seed ke kontrole', '🚫 Žádné triky'], pills4: ['💡 Nejlepší tah', '🔍 Záznam prohry'],
};
C['sk'] = {
  t: [
    ['Nič nie je zmanipulované. Tu je dôkaz.', 'Tu je dôkaz', 'Poradie dielikov určuje seed, ktorý si môžeš skopírovať'],
    ['Uvidíš rad skôr, než položíš', 'skôr, než položíš', 'Body sú v sérii'],
    ['300 úrovní, 30 kapitol', '300 úrovní', 'Osloboď kryštály, obíď kamene'],
    ['Tréner, ktorý ukáže najlepší ťah', 'najlepší ťah', 'A povie, ktorý ťah ťa stál hru'],
    ['500 anjelov na zbieranie', '500 anjelov', 'Každá dohraná partia pridá jedného do albumu'],
    ['Každý deň nová hádanka', 'Každý deň', 'Rovnaké dieliky na celom svete — skóre je naozaj porovnateľné'],
    ['20 motívov na odomknutie', '20 motívov', 'Všetko sa získava hraním. Žiadna platená stena.'],
    ['Úrovne, tituly a rebrík na výstup', 'rebrík', 'Každý položený blok sa počíta'],
  ],
  pills1: ['🔍 Seed na overenie', '🚫 Žiadne triky'], pills4: ['💡 Najlepší ťah', '🔍 Záznam prehry'],
};
C['hu'] = {
  t: [
    ['Semmi sincs elrendezve. Itt a bizonyíték.', 'Itt a bizonyíték', 'Az elemek sorrendjét egy másolható mag rögzíti'],
    ['Látod a sort, mielőtt leteszed', 'mielőtt leteszed', 'A pontok a sorozatból jönnek'],
    ['300 pálya, 30 fejezet', '300 pálya', 'Szabadítsd ki a kristályokat, kerüld a köveket'],
    ['Edző, aki megmutatja a legjobb lépést', 'a legjobb lépést', 'És megmondja, melyik lépés vitte el a játszmát'],
    ['500 angyal gyűjthető', '500 angyal', 'Minden befejezett játszma eggyel bővíti az albumot'],
    ['Minden nap új fejtörő', 'Minden nap', 'Ugyanazok az elemek világszerte — a pontszám tényleg összevethető'],
    ['20 kinézet oldható fel', '20 kinézet', 'Mindent játékkal szerzel meg. Nincs fizetős fal.'],
    ['Szintek, címek és egy létra', 'egy létra', 'Minden lerakott kocka számít'],
  ],
  pills1: ['🔍 A mag ellenőrizhető', '🚫 Semmi trükk'], pills4: ['💡 Legjobb lépés', '🔍 A vereség visszajátszása'],
};
C['ro'] = {
  t: [
    ['Nimic nu e aranjat. Iată dovada.', 'Iată dovada', 'Ordinea pieselor e fixată de o sămânță pe care o poți copia'],
    ['Vezi rândul înainte să plasezi', 'înainte să plasezi', 'Punctele vin din serie'],
    ['300 de niveluri, 30 de capitole', '300 de niveluri', 'Eliberează cristalele, ocolește pietrele'],
    ['Un antrenor care arată cea mai bună mutare', 'cea mai bună mutare', 'Și îți spune ce mutare te-a costat partida'],
    ['500 de îngeri de colecționat', '500 de îngeri', 'Fiecare partidă terminată adaugă unul în album'],
    ['Un puzzle nou în fiecare zi', 'în fiecare zi', 'Aceleași piese în toată lumea — scorul chiar se compară'],
    ['20 de teme de deblocat', '20 de teme', 'Totul se câștigă jucând. Fără paywall.'],
    ['Niveluri, titluri și o scară de urcat', 'o scară', 'Fiecare bloc pe care îl pui contează'],
  ],
  pills1: ['🔍 Sămânță verificabilă', '🚫 Fără trucuri'], pills4: ['💡 Cea mai bună mutare', '🔍 Reluarea înfrângerii'],
};
C['hr'] = {
  t: [
    ['Ništa nije namješteno. Evo dokaza.', 'Evo dokaza', 'Redoslijed dijelova određuje sjeme koje možeš kopirati'],
    ['Vidiš red prije nego što spustiš', 'prije nego što spustiš', 'Bodovi su u nizu'],
    ['300 razina, 30 poglavlja', '300 razina', 'Oslobodi kristale, zaobiđi kamenje'],
    ['Trener koji pokazuje najbolji potez', 'najbolji potez', 'I kaže koji te potez stajao partije'],
    ['500 anđela za skupljanje', '500 anđela', 'Svaka odigrana partija dodaje jednog u album'],
    ['Svaki dan nova zagonetka', 'Svaki dan', 'Isti dijelovi diljem svijeta — rezultat je stvarno usporediv'],
    ['20 tema za otključati', '20 tema', 'Sve se zarađuje igranjem. Bez plaćenog zida.'],
    ['Razine, titule i ljestve za penjanje', 'ljestve', 'Svaka spuštena kocka se broji'],
  ],
  pills1: ['🔍 Sjeme je provjerivo', '🚫 Bez trikova'], pills4: ['💡 Najbolji potez', '🔍 Snimka poraza'],
};
C['el'] = {
  t: [
    ['Τίποτα δεν είναι στημένο. Να η απόδειξη.', 'Να η απόδειξη', 'Η σειρά των κομματιών ορίζεται από έναν σπόρο που μπορείς να αντιγράψεις'],
    ['Βλέπεις τη σειρά πριν την αφήσεις', 'πριν την αφήσεις', 'Οι πόντοι βγαίνουν από το σερί'],
    ['300 πίστες, 30 κεφάλαια', '300 πίστες', 'Ελευθέρωσε τους κρυστάλλους, απόφυγε τις πέτρες'],
    ['Ένας προπονητής που δείχνει την καλύτερη κίνηση', 'την καλύτερη κίνηση', 'Και σου λέει ποια κίνηση σου στοίχισε την παρτίδα'],
    ['500 άγγελοι για συλλογή', '500 άγγελοι', 'Κάθε παρτίδα που τελειώνεις προσθέτει έναν στο άλμπουμ'],
    ['Ένα νέο παζλ κάθε μέρα', 'κάθε μέρα', 'Ίδια κομμάτια σε όλο τον κόσμο — το σκορ συγκρίνεται πραγματικά'],
    ['20 θέματα για ξεκλείδωμα', '20 θέματα', 'Όλα κερδίζονται με το παιχνίδι. Χωρίς paywall.'],
    ['Επίπεδα, τίτλοι και μια σκάλα να ανέβεις', 'μια σκάλα', 'Κάθε τουβλάκι που τοποθετείς μετράει'],
  ],
  pills1: ['🔍 Ελέγξιμος σπόρος', '🚫 Χωρίς κόλπα'], pills4: ['💡 Καλύτερη κίνηση', '🔍 Επανάληψη της ήττας'],
};
C['ca'] = {
  t: [
    ['Res no està trucat. Aquí tens la prova.', 'Aquí tens la prova', 'L’ordre de les peces el fixa una llavor que pots copiar'],
    ['Veus la línia abans de deixar anar', 'abans de deixar anar', 'Els punts són a la ratxa'],
    ['300 nivells, 30 capítols', '300 nivells', 'Allibera els cristalls, esquiva les pedres'],
    ['Un entrenador que mostra la millor jugada', 'la millor jugada', 'I et diu quina jugada t’ha costat la partida'],
    ['500 àngels per col·leccionar', '500 àngels', 'Cada partida acabada n’afegeix un a l’àlbum'],
    ['Un trencaclosques nou cada dia', 'cada dia', 'Les mateixes peces arreu del món — la puntuació és comparable'],
    ['20 temes per desbloquejar', '20 temes', 'Tot es guanya jugant. Sense mur de pagament.'],
    ['Nivells, títols i una escala per pujar', 'una escala', 'Cada bloc que col·loques compta'],
  ],
  pills1: ['🔍 Llavor verificable', '🚫 Sense trucs'], pills4: ['💡 Millor jugada', '🔍 Repetició de la derrota'],
};

// ── 英语变体：与 en-US 同文案（苹果按 locale 分发，不填就回落，但填了更稳）──
C['en-GB'] = C['en-US']; C['en-AU'] = C['en-US']; C['en-CA'] = C['en-US'];
// ── 法语/西语/葡语变体 ──
C['fr-CA'] = C['fr-FR']; C['es-MX'] = C['es-ES']; C['pt-PT'] = C['pt-BR'];

// ⚠ hl 必须是 h 的子串（否则渐变高亮不生效，图上看不出重点）
for (const [loc, v] of Object.entries(C)) {
  if (v.t.length !== 8) throw new Error(`[shot-caps] ${loc} 不是 8 条`);
  v.t.forEach(([h, hl], i) => {
    if (!h.includes(hl)) throw new Error(`[shot-caps] ${loc} 第 ${i + 1} 张的 hl「${hl}」不是 h 的子串`);
  });
  if (!v.pills1 || !v.pills4) throw new Error(`[shot-caps] ${loc} 缺 pills`);
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
