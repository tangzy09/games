// games/solitaire/tools/shot-caps.cjs — 商店截图的 39 语文案（大字标题 / 高亮词 / 副标 / 胶囊）
//
// ⚠ 不是机翻英文那套：每语言按该语言的自然说法写（aso-i18n-guide 同规）。
// ⚠ `hl`（渐变高亮词）**必须是 h 的子串**，否则替换不生效 —— 文件末尾有断言。
// ⛔ **2.3.7 红线（Fair Deal 2026-07-22 就是栽在这条上被拒的）**：截图属于元数据，
//    标题/副标/胶囊里**绝不许出现价格词**（free / gratis / grátis / gratuit / 免费 / 無料 /
//    무료 / مجاني / חינם / ฟรี / бесплатно …）。文件末尾有 grep 断言，加文案时会当场炸。
// ⚠ app UI 只有 10 语；其余 locale 用**英文 UI 的 raw 图 + 本地化大字标题**（苹果允许）。
//
// 每个 locale 一个数组，8 项，顺序 = SHOTS：
//   0 可解承诺(hero) · 1 证明器 · 2 提示=制胜一步 · 3 三种玩法 · 4 求解器出的课
//   · 5 我的弱点 · 6 500 天使图鉴 · 7 收藏（牌背/桌布/瀑布）
// 形状：[h, hl, s]；另有 pills1（hero 两枚胶囊）与 pills6（图鉴两枚胶囊）。

const C = {};

// ── 英文（主语言；en-GB/AU/CA 克隆）──
C['en-US'] = {
  t: [
    ['Every deal has a solution', 'a solution', 'And the solver can prove it — at any point in the game'],
    ['"Is this deal still winnable?"', 'still winnable', 'One tap. An honest answer, even when it is no'],
    ['The hint is the move that wins', 'the move that wins', 'Not a guess — the solver hands you its next step'],
    ['Klondike · FreeCell · Spider', 'FreeCell', 'Classic deal numbers included, so you can compare'],
    ['Lessons the solver writes', 'the solver writes', 'Start four moves from a win, then eight, then more'],
    ['It shows what you keep missing', 'what you keep missing', 'The solver labels each mistake, then picks your next lesson'],
    ['500 angels to collect', '500', 'Win a deal, add another one to your album'],
    ['Backs, tables and cascades', 'cascades', 'Coins come from winning — never from an advantage'],
  ],
  pills1: ['♠ Solvable deals', '✓ Provable'], pills6: ['👼 500 artworks', '🎴 31 collectibles'],
};

// ── 简体中文 ──
C['zh-Hans'] = {
  t: [
    ['每一局都有解', '都有解', '而且求解器随时能证明给你看'],
    ['「这局还有解吗？」', '还有解吗', '点一下就答；没解的时候，也照实说'],
    ['提示给的是制胜的那一步', '制胜的那一步', '不是启发式瞎猜——是解法的下一步'],
    ['克朗代克 · 空当接龙 · 蜘蛛', '空当接龙', '经典局号一并收录，随时对照'],
    ['求解器现场出的课', '现场出的课', '从「差 4 步赢」开始，然后 8 步，再往前'],
    ['它知道你老是错在哪', '老是错在哪', '每次失误都被归类，下一课照着推给你'],
    ['500 张天使图等你收集', '500 张', '赢一局，图鉴就多一张'],
    ['牌背 · 桌布 · 胜利瀑布', '胜利瀑布', '金币只从赢局来，买不到任何优势'],
  ],
  pills1: ['♠ 只发有解的局', '✓ 可当场验证'], pills6: ['👼 500 张画', '🎴 31 款收藏'],
};

// ── 繁體中文（用台/港惯用的玩法名，不是简繁逐字转）──
C['zh-Hant'] = {
  t: [
    ['每一局都有解', '都有解', '而且解算器隨時能證明給你看'],
    ['「這局還有解嗎？」', '還有解嗎', '點一下就答；沒解的時候，也照實說'],
    ['提示給的是致勝的那一步', '致勝的那一步', '不是啟發式亂猜——是解法的下一步'],
    ['接龍 · 新接龍 · 蜘蛛接龍', '新接龍', '經典局號一併收錄，隨時對照'],
    ['解算器現場出的課', '現場出的課', '從「差 4 步贏」開始，然後 8 步，再往前'],
    ['它知道你老是錯在哪', '老是錯在哪', '每次失誤都被歸類，下一課照著推給你'],
    ['500 張天使圖等你收藏', '500 張', '贏一局，圖鑑就多一張'],
    ['牌背 · 桌布 · 勝利瀑布', '勝利瀑布', '金幣只從贏局來，買不到任何優勢'],
  ],
  pills1: ['♠ 只發有解的局', '✓ 可當場驗證'], pills6: ['👼 500 張畫', '🎴 31 款收藏'],
};

// ── 日本語 ──
C['ja'] = {
  t: [
    ['どの配りにも必ず解がある', '必ず解がある', 'ソルバーがいつでも証明してみせます'],
    ['「この局、まだ勝てる？」', 'まだ勝てる', 'ワンタップで正直な答え。ダメな時もそう言います'],
    ['ヒントは勝ち筋の一手', '勝ち筋の一手', '当てずっぽうではなく、解法の次の一手'],
    ['クロンダイク・フリーセル・スパイダー', 'フリーセル', '有名なディール番号もそのまま収録'],
    ['ソルバーが作るレッスン', 'ソルバーが作る', '勝ちまで4手の局面から。次は8手、その先へ'],
    ['あなたの弱点を言い当てる', '弱点', 'ミスを種類ごとに集計し、次の課題を選びます'],
    ['集める天使は500枚', '500枚', '1局勝つごとにアルバムが増える'],
    ['カード裏・テーブル・勝利演出', '勝利演出', 'コインは勝って貯める。有利は一切買えません'],
  ],
  pills1: ['♠ 解ける配りだけ', '✓ 証明できる'], pills6: ['👼 500枚の絵', '🎴 31種の収集品'],
};

// ── 한국어 ──
C['ko'] = {
  t: [
    ['모든 딜에 해답이 있습니다', '해답이 있습니다', '솔버가 언제든 증명해 드립니다'],
    ['"이 판, 아직 이길 수 있나요?"', '아직 이길 수 있나요', '한 번 탭하면 정직한 답. 아닐 때도 그렇게 말합니다'],
    ['힌트는 이기는 수입니다', '이기는 수', '추측이 아니라 해법의 다음 수'],
    ['클론다이크 · 프리셀 · 스파이더', '프리셀', '고전 딜 번호도 그대로 담았습니다'],
    ['솔버가 만드는 레슨', '솔버가 만드는', '승리 네 수 앞에서 시작, 다음은 여덟 수'],
    ['자꾸 놓치는 지점을 알려줍니다', '자꾸 놓치는 지점', '실수를 분류하고 다음 레슨을 골라 줍니다'],
    ['모을 천사 500장', '500장', '한 판 이길 때마다 앨범이 채워집니다'],
    ['카드 뒷면 · 테이블 · 승리 연출', '승리 연출', '코인은 이겨서 모읍니다. 유리함은 살 수 없습니다'],
  ],
  pills1: ['♠ 풀리는 딜만', '✓ 증명 가능'], pills6: ['👼 500장 그림', '🎴 31종 수집품'],
};

// ── Deutsch ──
C['de-DE'] = {
  t: [
    ['Jede Partie ist lösbar', 'lösbar', 'Und der Solver beweist es dir — jederzeit im Spiel'],
    ['„Ist diese Partie noch zu gewinnen?"', 'noch zu gewinnen', 'Einmal tippen. Ehrliche Antwort, auch wenn sie Nein lautet'],
    ['Der Tipp ist der Siegzug', 'der Siegzug', 'Kein Raten — der Solver zeigt den nächsten Zug'],
    ['Klondike · FreeCell · Spider', 'FreeCell', 'Klassische Spielnummern inklusive, zum Vergleichen'],
    ['Lektionen vom Solver', 'vom Solver', 'Start vier Züge vor dem Sieg, dann acht, dann mehr'],
    ['Es zeigt, was du immer übersiehst', 'was du immer übersiehst', 'Jeder Fehler wird sortiert — und die nächste Lektion gewählt'],
    ['500 Engel zum Sammeln', '500', 'Jede gewonnene Partie bringt einen dazu'],
    ['Rückseiten, Tische, Kaskaden', 'Kaskaden', 'Münzen kommen vom Gewinnen — nie ein Vorteil'],
  ],
  pills1: ['♠ Lösbare Partien', '✓ Beweisbar'], pills6: ['👼 500 Bilder', '🎴 31 Sammelstücke'],
};

// ── Français ──
C['fr-FR'] = {
  t: [
    ['Chaque donne a une solution', 'une solution', 'Et le solveur peut le prouver — à tout moment'],
    ['« Cette donne est-elle encore gagnable ? »', 'encore gagnable', 'Un appui. Une réponse honnête, même quand c’est non'],
    ['L’indice, c’est le coup gagnant', 'le coup gagnant', 'Pas une supposition : le prochain coup de la solution'],
    ['Klondike · FreeCell · Spider', 'FreeCell', 'Numéros de donne classiques inclus, pour comparer'],
    ['Des leçons écrites par le solveur', 'par le solveur', 'À quatre coups de la victoire, puis huit, puis plus'],
    ['Il voit ce qui vous échappe', 'ce qui vous échappe', 'Chaque erreur est classée, puis la leçon suivante choisie'],
    ['500 anges à collectionner', '500', 'Chaque victoire en ajoute un à l’album'],
    ['Dos, tapis et cascades', 'cascades', 'Les pièces viennent des victoires, jamais d’un avantage'],
  ],
  pills1: ['♠ Donnes solubles', '✓ Prouvable'], pills6: ['👼 500 illustrations', '🎴 31 objets'],
};

// ── Español ──
C['es-ES'] = {
  t: [
    ['Todo reparto tiene solución', 'solución', 'Y el solucionador puede demostrarlo en cualquier momento'],
    ['«¿Esta partida aún se puede ganar?»', 'aún se puede ganar', 'Un toque. Respuesta honesta, incluso cuando es que no'],
    ['La pista es la jugada que gana', 'la jugada que gana', 'No es una suposición: es el siguiente paso de la solución'],
    ['Klondike · FreeCell · Spider', 'FreeCell', 'Incluye los números de partida clásicos para comparar'],
    ['Lecciones que escribe el solucionador', 'el solucionador', 'Empieza a cuatro jugadas de ganar, luego a ocho'],
    ['Te dice qué se te escapa siempre', 'qué se te escapa', 'Clasifica cada error y elige tu próxima lección'],
    ['500 ángeles por coleccionar', '500', 'Gana una partida y suma otro al álbum'],
    ['Reversos, tapetes y cascadas', 'cascadas', 'Las monedas se ganan jugando, nunca dan ventaja'],
  ],
  pills1: ['♠ Repartos con solución', '✓ Demostrable'], pills6: ['👼 500 ilustraciones', '🎴 31 objetos'],
};

// ── Italiano ──
C['it'] = {
  t: [
    ['Ogni mano ha una soluzione', 'una soluzione', 'E il risolutore può dimostrarlo in qualsiasi momento'],
    ['«Questa mano è ancora vincibile?»', 'ancora vincibile', 'Un tocco. Risposta onesta, anche quando è no'],
    ['Il suggerimento è la mossa che vince', 'la mossa che vince', 'Non è un tentativo: è la prossima mossa della soluzione'],
    ['Klondike · FreeCell · Spider', 'FreeCell', 'Inclusi i numeri di mano classici, per confrontarsi'],
    ['Lezioni scritte dal risolutore', 'dal risolutore', 'Parti a quattro mosse dalla vittoria, poi a otto'],
    ['Ti dice cosa ti sfugge sempre', 'cosa ti sfugge', 'Classifica ogni errore e sceglie la lezione successiva'],
    ['500 angeli da collezionare', '500', 'Ogni vittoria ne aggiunge uno all’album'],
    ['Dorsi, tavoli e cascate', 'cascate', 'Le monete arrivano vincendo, mai un vantaggio'],
  ],
  pills1: ['♠ Mani risolvibili', '✓ Dimostrabile'], pills6: ['👼 500 illustrazioni', '🎴 31 oggetti'],
};

// ── Português (BR) ──
C['pt-BR'] = {
  t: [
    ['Toda partida tem solução', 'solução', 'E o solucionador pode provar isso a qualquer momento'],
    ['"Ainda dá para vencer esta partida?"', 'Ainda dá para vencer', 'Um toque. Resposta honesta, mesmo quando é não'],
    ['A dica é a jogada que vence', 'a jogada que vence', 'Não é palpite: é o próximo passo da solução'],
    ['Klondike · FreeCell · Spider', 'FreeCell', 'Com os números de partida clássicos para comparar'],
    ['Lições escritas pelo solucionador', 'pelo solucionador', 'Comece a quatro jogadas da vitória, depois a oito'],
    ['Ele mostra o que você sempre erra', 'o que você sempre erra', 'Cada erro é classificado e vira a sua próxima lição'],
    ['500 anjos para colecionar', '500', 'Cada vitória adiciona mais um ao álbum'],
    ['Versos, mesas e cascatas', 'cascatas', 'As moedas vêm de vencer — nunca de vantagem'],
  ],
  pills1: ['♠ Partidas com solução', '✓ Comprovável'], pills6: ['👼 500 ilustrações', '🎴 31 itens'],
};

// ── Русский ──
C['ru'] = {
  t: [
    ['У каждой раздачи есть решение', 'есть решение', 'И солвер докажет это в любой момент партии'],
    ['«Эту партию ещё можно выиграть?»', 'ещё можно выиграть', 'Одно касание. Честный ответ, даже если он «нет»'],
    ['Подсказка — это выигрышный ход', 'выигрышный ход', 'Не догадка: это следующий ход из решения'],
    ['Косынка · Солитер · Паук', 'Солитер', 'Классические номера раздач — есть с чем сравнить'],
    ['Уроки, которые пишет солвер', 'пишет солвер', 'Начните за четыре хода до победы, потом за восемь'],
    ['Он видит, что вы упускаете', 'что вы упускаете', 'Каждая ошибка разобрана — и выбран следующий урок'],
    ['500 ангелов в коллекцию', '500', 'Каждая победа добавляет ещё одного в альбом'],
    ['Рубашки, столы и каскады', 'каскады', 'Монеты — за победы, преимущество не купить'],
  ],
  pills1: ['♠ Только решаемые', '✓ С доказательством'], pills6: ['👼 500 иллюстраций', '🎴 31 предмет'],
};

// ── Українська ──
C['uk'] = {
  t: [
    ['У кожної роздачі є розв’язок', 'є розв’язок', 'І солвер доведе це будь-якої миті'],
    ['«Цю партію ще можна виграти?»', 'ще можна виграти', 'Один дотик. Чесна відповідь, навіть якщо це «ні»'],
    ['Підказка — це виграшний хід', 'виграшний хід', 'Не здогадка: це наступний хід із розв’язку'],
    ['Косинка · Солітер · Павук', 'Солітер', 'Класичні номери роздач — є з чим порівняти'],
    ['Уроки, які пише солвер', 'пише солвер', 'Почніть за чотири ходи до перемоги, потім за вісім'],
    ['Він бачить, що ви пропускаєте', 'що ви пропускаєте', 'Кожну помилку розкладено — і обрано наступний урок'],
    ['500 янголів у колекцію', '500', 'Кожна перемога додає ще одного до альбому'],
    ['Сорочки, столи та каскади', 'каскади', 'Монети — за перемоги, перевагу не купити'],
  ],
  pills1: ['♠ Лише розв’язні', '✓ З доказом'], pills6: ['👼 500 ілюстрацій', '🎴 31 предмет'],
};

// ── Nederlands ──
C['nl-NL'] = {
  t: [
    ['Elk spel heeft een oplossing', 'een oplossing', 'En de solver bewijst het — op elk moment'],
    ['"Is dit spel nog te winnen?"', 'nog te winnen', 'Eén tik. Een eerlijk antwoord, ook als het nee is'],
    ['De hint is de winnende zet', 'de winnende zet', 'Geen gok: de volgende zet uit de oplossing'],
    ['Klondike · FreeCell · Spider', 'FreeCell', 'Inclusief klassieke spelnummers om te vergelijken'],
    ['Lessen van de solver', 'van de solver', 'Begin vier zetten voor de winst, daarna acht'],
    ['Het laat zien wat je steeds mist', 'wat je steeds mist', 'Elke fout wordt benoemd en de volgende les gekozen'],
    ['500 engelen om te verzamelen', '500', 'Elke gewonnen partij voegt er één toe'],
    ['Achterkanten, tafels en cascades', 'cascades', 'Munten komen van winnen — nooit van voordeel'],
  ],
  pills1: ['♠ Oplosbare spellen', '✓ Bewijsbaar'], pills6: ['👼 500 illustraties', '🎴 31 items'],
};

// ── Polski ──
C['pl'] = {
  t: [
    ['Każde rozdanie ma rozwiązanie', 'ma rozwiązanie', 'A solver udowodni to w każdej chwili'],
    ['„Czy tę partię da się jeszcze wygrać?"', 'jeszcze wygrać', 'Jedno dotknięcie. Szczera odpowiedź, nawet gdy brzmi „nie"'],
    ['Podpowiedź to zwycięski ruch', 'zwycięski ruch', 'To nie zgadywanie — to kolejny ruch z rozwiązania'],
    ['Klondike · FreeCell · Pająk', 'FreeCell', 'Klasyczne numery rozdań w komplecie'],
    ['Lekcje pisane przez solver', 'przez solver', 'Zacznij cztery ruchy przed wygraną, potem osiem'],
    ['Pokazuje, co ciągle pomijasz', 'co ciągle pomijasz', 'Każdy błąd nazwany, a następna lekcja dobrana'],
    ['500 aniołów do zebrania', '500', 'Każda wygrana dokłada kolejnego do albumu'],
    ['Rewersy, stoły i kaskady', 'kaskady', 'Monety pochodzą z wygranych, nigdy z przewagi'],
  ],
  pills1: ['♠ Rozwiązywalne', '✓ Z dowodem'], pills6: ['👼 500 ilustracji', '🎴 31 przedmiotów'],
};

// ── Türkçe ──
C['tr'] = {
  t: [
    ['Her dağıtımın bir çözümü var', 'bir çözümü var', 've çözücü bunu her an kanıtlayabilir'],
    ['"Bu el hâlâ kazanılabilir mi?"', 'hâlâ kazanılabilir', 'Tek dokunuş. Cevap hayırsa da dürüstçe söyler'],
    ['İpucu, kazandıran hamledir', 'kazandıran hamledir', 'Tahmin değil: çözümün bir sonraki hamlesi'],
    ['Klondike · FreeCell · Örümcek', 'FreeCell', 'Klasik el numaraları da dahil, karşılaştırın'],
    ['Çözücünün yazdığı dersler', 'Çözücünün yazdığı', 'Zafere dört hamle kala başla, sonra sekiz'],
    ['Sürekli neyi kaçırdığını gösterir', 'neyi kaçırdığını', 'Her hatayı sınıflar, sıradaki dersi seçer'],
    ['Toplanacak 500 melek', '500', 'Kazandığın her el albüme bir tane ekler'],
    ['Desenler, masalar ve kutlamalar', 'kutlamalar', 'Altınlar kazanmaktan gelir, avantajdan değil'],
  ],
  pills1: ['♠ Çözülebilir eller', '✓ Kanıtlanabilir'], pills6: ['👼 500 çizim', '🎴 31 koleksiyon'],
};

// ── العربية ──
C['ar-SA'] = {
  t: [
    ['لكل توزيعة حل', 'حل', 'ويستطيع المُحلِّل إثبات ذلك في أي لحظة'],
    ['«هل ما زال بالإمكان الفوز؟»', 'ما زال بالإمكان الفوز', 'لمسة واحدة، وإجابة صادقة حتى لو كانت لا'],
    ['التلميح هو النقلة الفائزة', 'النقلة الفائزة', 'ليس تخمينًا: إنها الخطوة التالية من الحل'],
    ['كلوندايك · فري سيل · سبايدر', 'فري سيل', 'مع أرقام التوزيعات الكلاسيكية للمقارنة'],
    ['دروس يكتبها المُحلِّل', 'يكتبها المُحلِّل', 'ابدأ على بُعد أربع نقلات من الفوز، ثم ثماني'],
    ['يكشف ما تفوّته دائمًا', 'ما تفوّته دائمًا', 'يصنّف كل خطأ ثم يختار درسك التالي'],
    ['500 ملاك للجمع', '500', 'كل فوز يضيف واحدًا إلى ألبومك'],
    ['ظهور وطاولات وشلالات', 'شلالات', 'العملات تأتي من الفوز، لا من أي أفضلية'],
  ],
  pills1: ['♠ توزيعات قابلة للحل', '✓ قابل للإثبات'], pills6: ['👼 500 رسمة', '🎴 31 مقتنى'],
};

// ── עברית ──
C['he'] = {
  t: [
    ['לכל חלוקה יש פתרון', 'יש פתרון', 'והפותר יוכיח זאת בכל רגע במשחק'],
    ['"האם עוד אפשר לנצח?"', 'עוד אפשר לנצח', 'הקשה אחת. תשובה כנה, גם כשהיא לא'],
    ['הרמז הוא המהלך המנצח', 'המהלך המנצח', 'לא ניחוש: זה המהלך הבא מתוך הפתרון'],
    ['קלונדייק · פריסל · ספיידר', 'פריסל', 'כולל מספרי חלוקה קלאסיים להשוואה'],
    ['שיעורים שהפותר כותב', 'שהפותר כותב', 'מתחילים ארבעה מהלכים לפני הניצחון, אחר כך שמונה'],
    ['הוא מראה מה נשמט לך שוב ושוב', 'מה נשמט לך', 'כל טעות מסווגת, והשיעור הבא נבחר'],
    ['500 מלאכים לאסוף', '500', 'כל ניצחון מוסיף עוד אחד לאלבום'],
    ['גבים, שולחנות ומפלים', 'מפלים', 'מטבעות מגיעים מניצחון — לא מיתרון'],
  ],
  pills1: ['♠ חלוקות פתירות', '✓ ניתן להוכחה'], pills6: ['👼 500 איורים', '🎴 31 פריטים'],
};

// ── ไทย ──
C['th'] = {
  t: [
    ['ทุกกองไพ่มีทางชนะ', 'มีทางชนะ', 'และตัวแก้เกมพิสูจน์ให้ดูได้ทุกเมื่อ'],
    ['"ตานี้ยังชนะได้ไหม?"', 'ยังชนะได้ไหม', 'แตะครั้งเดียว ตอบตรงไปตรงมา แม้คำตอบคือไม่'],
    ['คำใบ้คือหมากที่พาไปชนะ', 'หมากที่พาไปชนะ', 'ไม่ใช่การเดา แต่คือหมากถัดไปของคำตอบ'],
    ['คลอนไดค์ · ฟรีเซลล์ · สไปเดอร์', 'ฟรีเซลล์', 'มีหมายเลขกองไพ่คลาสสิกให้เทียบกัน'],
    ['บทเรียนที่ตัวแก้เกมเขียนให้', 'ตัวแก้เกมเขียนให้', 'เริ่มจากอีกสี่ตาก็ชนะ แล้วแปดตา แล้วไกลกว่านั้น'],
    ['บอกได้ว่าคุณพลาดตรงไหนบ่อย', 'พลาดตรงไหนบ่อย', 'จัดกลุ่มความผิดพลาด แล้วเลือกบทเรียนถัดไป'],
    ['เทวดา 500 ภาพให้สะสม', '500', 'ชนะหนึ่งตา ได้เพิ่มอีกหนึ่งภาพ'],
    ['หลังไพ่ โต๊ะ และเอฟเฟกต์ชัยชนะ', 'เอฟเฟกต์ชัยชนะ', 'เหรียญได้จากการชนะ ไม่ใช่ความได้เปรียบ'],
  ],
  pills1: ['♠ แจกเฉพาะตาที่มีทางชนะ', '✓ พิสูจน์ได้'], pills6: ['👼 ภาพ 500 ใบ', '🎴 31 ของสะสม'],
};

// ── Tiếng Việt ──
C['vi'] = {
  t: [
    ['Ván nào cũng có lời giải', 'có lời giải', 'Và bộ giải sẽ chứng minh bất cứ lúc nào'],
    ['"Ván này còn thắng được không?"', 'còn thắng được', 'Một chạm. Trả lời thẳng thắn, kể cả khi là không'],
    ['Gợi ý chính là nước thắng', 'nước thắng', 'Không phải đoán: đó là nước tiếp theo của lời giải'],
    ['Klondike · FreeCell · Spider', 'FreeCell', 'Có sẵn số ván kinh điển để đối chiếu'],
    ['Bài học do bộ giải soạn', 'do bộ giải soạn', 'Bắt đầu khi còn bốn nước là thắng, rồi tám nước'],
    ['Nó chỉ ra chỗ bạn hay bỏ lỡ', 'chỗ bạn hay bỏ lỡ', 'Mỗi lỗi được phân loại, rồi chọn bài học kế tiếp'],
    ['500 thiên thần để sưu tầm', '500', 'Thắng một ván, thêm một tấm vào album'],
    ['Mặt lưng, mặt bàn và hiệu ứng', 'hiệu ứng', 'Xu đến từ chiến thắng, không mua được lợi thế'],
  ],
  pills1: ['♠ Ván luôn có lời giải', '✓ Chứng minh được'], pills6: ['👼 500 tranh', '🎴 31 vật phẩm'],
};

// ── Bahasa Indonesia ──
C['id'] = {
  t: [
    ['Setiap pembagian ada solusinya', 'ada solusinya', 'Dan pemecah bisa membuktikannya kapan saja'],
    ['"Permainan ini masih bisa menang?"', 'masih bisa menang', 'Sekali ketuk. Jawaban jujur, meski jawabannya tidak'],
    ['Petunjuknya adalah langkah pemenang', 'langkah pemenang', 'Bukan tebakan: itu langkah berikutnya dari solusi'],
    ['Klondike · FreeCell · Spider', 'FreeCell', 'Nomor permainan klasik ikut disertakan'],
    ['Pelajaran susunan si pemecah', 'susunan si pemecah', 'Mulai empat langkah sebelum menang, lalu delapan'],
    ['Ia menunjukkan yang selalu terlewat', 'yang selalu terlewat', 'Tiap kesalahan dikelompokkan, lalu pelajaran dipilih'],
    ['500 malaikat untuk dikoleksi', '500', 'Menang satu permainan, album bertambah satu'],
    ['Punggung kartu, meja, dan kaskade', 'kaskade', 'Koin datang dari menang — bukan dari keunggulan'],
  ],
  pills1: ['♠ Selalu ada solusi', '✓ Bisa dibuktikan'], pills6: ['👼 500 ilustrasi', '🎴 31 koleksi'],
};

// ── Bahasa Melayu ──
C['ms'] = {
  t: [
    ['Setiap agihan ada penyelesaian', 'ada penyelesaian', 'Dan penyelesai boleh membuktikannya bila-bila masa'],
    ['"Permainan ini masih boleh menang?"', 'masih boleh menang', 'Satu ketikan. Jawapan jujur, walaupun jawapannya tidak'],
    ['Petunjuk ialah langkah yang menang', 'langkah yang menang', 'Bukan tekaan: itu langkah seterusnya daripada penyelesaian'],
    ['Klondike · FreeCell · Spider', 'FreeCell', 'Nombor agihan klasik turut disertakan'],
    ['Pelajaran yang ditulis penyelesai', 'ditulis penyelesai', 'Mula empat langkah sebelum menang, kemudian lapan'],
    ['Ia tunjuk apa yang selalu anda terlepas', 'yang selalu anda terlepas', 'Setiap kesilapan dikelaskan, pelajaran seterusnya dipilih'],
    ['500 malaikat untuk dikumpul', '500', 'Menang satu permainan, album bertambah satu'],
    ['Belakang kad, meja dan kaskad', 'kaskad', 'Syiling datang daripada kemenangan, bukan kelebihan'],
  ],
  pills1: ['♠ Ada penyelesaian', '✓ Boleh dibuktikan'], pills6: ['👼 500 ilustrasi', '🎴 31 koleksi'],
};

// ── हिन्दी ──
C['hi'] = {
  t: [
    ['हर डील का हल होता है', 'हल होता है', 'और सॉल्वर उसे कभी भी साबित कर सकता है'],
    ['"क्या यह बाज़ी अब भी जीती जा सकती है?"', 'अब भी जीती जा सकती है', 'एक टैप। ईमानदार जवाब, चाहे वह ना ही क्यों न हो'],
    ['हिंट वही चाल है जो जिताती है', 'जो जिताती है', 'अंदाज़ा नहीं — हल की अगली चाल'],
    ['क्लोंडाइक · फ्रीसेल · स्पाइडर', 'फ्रीसेल', 'क्लासिक डील नंबर भी शामिल, मिलान कीजिए'],
    ['सॉल्वर के बनाए सबक', 'सॉल्वर के बनाए', 'जीत से चार चाल पहले शुरू, फिर आठ, फिर और'],
    ['यह बताता है आप कहाँ चूकते हैं', 'कहाँ चूकते हैं', 'हर गलती छँटती है, फिर अगला सबक चुना जाता है'],
    ['500 फ़रिश्ते जमा कीजिए', '500', 'हर जीत एल्बम में एक और जोड़ती है'],
    ['कार्ड बैक, टेबल और कैस्केड', 'कैस्केड', 'सिक्के जीत से मिलते हैं, बढ़त से नहीं'],
  ],
  pills1: ['♠ हल वाली डील', '✓ साबित होने वाला'], pills6: ['👼 500 चित्र', '🎴 31 संग्रह'],
};

// ── Svenska ──
C['sv'] = {
  t: [
    ['Varje giv har en lösning', 'en lösning', 'Och lösaren kan bevisa det — när som helst'],
    ['"Går den här given att vinna?"', 'att vinna', 'En tryckning. Ärligt svar, även när det är nej'],
    ['Tipset är draget som vinner', 'draget som vinner', 'Ingen gissning: nästa drag ur lösningen'],
    ['Klondike · FreeCell · Spider', 'FreeCell', 'Klassiska givnummer ingår, så du kan jämföra'],
    ['Lektioner som lösaren skriver', 'som lösaren skriver', 'Börja fyra drag från vinst, sedan åtta, sedan mer'],
    ['Den visar vad du ständigt missar', 'vad du ständigt missar', 'Varje misstag sorteras och nästa lektion väljs'],
    ['500 änglar att samla', '500', 'Varje vunnen giv lägger till en till i albumet'],
    ['Baksidor, bord och kaskader', 'kaskader', 'Mynt kommer av att vinna — aldrig av fördel'],
  ],
  pills1: ['♠ Lösbara givar', '✓ Bevisbart'], pills6: ['👼 500 bilder', '🎴 31 samlarobjekt'],
};

// ── Norsk ──
C['no'] = {
  t: [
    ['Hver kabal har en løsning', 'en løsning', 'Og løseren kan bevise det — når som helst'],
    ['"Kan denne kabalen fortsatt vinnes?"', 'fortsatt vinnes', 'Ett trykk. Ærlig svar, også når det er nei'],
    ['Hintet er trekket som vinner', 'trekket som vinner', 'Ingen gjetning: neste trekk fra løsningen'],
    ['Klondike · FreeCell · Spider', 'FreeCell', 'Klassiske kabalnumre er med, så du kan sammenligne'],
    ['Leksjoner løseren skriver', 'løseren skriver', 'Start fire trekk fra seier, så åtte, så mer'],
    ['Den viser hva du stadig overser', 'hva du stadig overser', 'Hver feil sorteres, og neste leksjon velges'],
    ['500 engler å samle', '500', 'Hver vunnet kabal gir én til i albumet'],
    ['Kortrygger, bord og kaskader', 'kaskader', 'Mynter kommer av å vinne — aldri av fordel'],
  ],
  pills1: ['♠ Løsbare kabaler', '✓ Beviselig'], pills6: ['👼 500 bilder', '🎴 31 samleobjekter'],
};

// ── Dansk ──
C['da'] = {
  t: [
    ['Hvert spil har en løsning', 'en løsning', 'Og løseren kan bevise det — når som helst'],
    ['"Kan det her spil stadig vindes?"', 'stadig vindes', 'Ét tryk. Et ærligt svar, også når det er nej'],
    ['Fiffet er trækket, der vinder', 'trækket, der vinder', 'Ikke et gæt: næste træk fra løsningen'],
    ['Klondike · FreeCell · Spider', 'FreeCell', 'Klassiske spilnumre er med, så du kan sammenligne'],
    ['Lektioner, løseren skriver', 'løseren skriver', 'Start fire træk fra sejr, så otte, så mere'],
    ['Den viser, hvad du overser', 'hvad du overser', 'Hver fejl sorteres, og næste lektion vælges'],
    ['500 engle at samle', '500', 'Hvert vundet spil giver én mere til albummet'],
    ['Bagsider, borde og kaskader', 'kaskader', 'Mønter kommer af at vinde — aldrig af fordel'],
  ],
  pills1: ['♠ Spil med løsning', '✓ Bevisbart'], pills6: ['👼 500 billeder', '🎴 31 samleobjekter'],
};

// ── Suomi ──
C['fi'] = {
  t: [
    ['Jokaisella jaolla on ratkaisu', 'on ratkaisu', 'Ja ratkaisija voi todistaa sen milloin tahansa'],
    ['"Voiko tämän jaon vielä voittaa?"', 'vielä voittaa', 'Yksi napautus. Rehellinen vastaus, myös kun se on ei'],
    ['Vihje on voittava siirto', 'voittava siirto', 'Ei arvaus: se on ratkaisun seuraava siirto'],
    ['Klondike · FreeCell · Spider', 'FreeCell', 'Mukana klassiset jakonumerot vertailua varten'],
    ['Ratkaisijan kirjoittamat oppitunnit', 'Ratkaisijan kirjoittamat', 'Aloita neljä siirtoa ennen voittoa, sitten kahdeksan'],
    ['Se näyttää, mitä jatkuvasti ohitat', 'mitä jatkuvasti ohitat', 'Jokainen virhe luokitellaan ja seuraava oppitunti valitaan'],
    ['500 enkeliä kerättäväksi', '500', 'Jokainen voitto lisää albumiin yhden'],
    ['Selät, pöydät ja kaskadit', 'kaskadit', 'Kolikot tulevat voitoista — ei etulyöntiasemasta'],
  ],
  pills1: ['♠ Ratkeavat jaot', '✓ Todistettavissa'], pills6: ['👼 500 kuvaa', '🎴 31 keräilyesinettä'],
};

// ── Čeština ──
C['cs'] = {
  t: [
    ['Každé rozdání má řešení', 'má řešení', 'A řešitel to kdykoli dokáže'],
    ['„Dá se tahle hra ještě vyhrát?"', 'ještě vyhrát', 'Jedno klepnutí. Poctivá odpověď, i když zní ne'],
    ['Nápověda je vítězný tah', 'vítězný tah', 'Není to odhad: je to další tah z řešení'],
    ['Klondike · FreeCell · Spider', 'FreeCell', 'Včetně klasických čísel rozdání pro porovnání'],
    ['Lekce, které píše řešitel', 'píše řešitel', 'Začni čtyři tahy před výhrou, pak osm, pak dál'],
    ['Ukáže, co vám pořád uniká', 'co vám pořád uniká', 'Každou chybu zařadí a vybere další lekci'],
    ['500 andělů do sbírky', '500', 'Každá výhra přidá dalšího do alba'],
    ['Rubové strany, stoly a kaskády', 'kaskády', 'Mince jsou za výhry — nikdy za výhodu'],
  ],
  pills1: ['♠ Řešitelná rozdání', '✓ Dokazatelné'], pills6: ['👼 500 ilustrací', '🎴 31 předmětů'],
};

// ── Slovenčina ──
C['sk'] = {
  t: [
    ['Každé rozdanie má riešenie', 'má riešenie', 'A riešiteľ to kedykoľvek dokáže'],
    ['„Dá sa táto hra ešte vyhrať?"', 'ešte vyhrať', 'Jedno klepnutie. Úprimná odpoveď, aj keď znie nie'],
    ['Nápoveda je víťazný ťah', 'víťazný ťah', 'Nie je to odhad: je to ďalší ťah z riešenia'],
    ['Klondike · FreeCell · Spider', 'FreeCell', 'Vrátane klasických čísel rozdaní na porovnanie'],
    ['Lekcie, ktoré píše riešiteľ', 'píše riešiteľ', 'Začni štyri ťahy pred výhrou, potom osem'],
    ['Ukáže, čo vám stále uniká', 'čo vám stále uniká', 'Každú chybu zaradí a vyberie ďalšiu lekciu'],
    ['500 anjelov do zbierky', '500', 'Každá výhra pridá ďalšieho do albumu'],
    ['Rubové strany, stoly a kaskády', 'kaskády', 'Mince sú za výhry — nikdy za výhodu'],
  ],
  pills1: ['♠ Riešiteľné rozdania', '✓ Dokázateľné'], pills6: ['👼 500 ilustrácií', '🎴 31 predmetov'],
};

// ── Magyar ──
C['hu'] = {
  t: [
    ['Minden leosztásnak van megoldása', 'van megoldása', 'És a megoldó bármikor be is bizonyítja'],
    ['„Megnyerhető még ez a játszma?"', 'Megnyerhető még', 'Egy koppintás. Őszinte válasz, akkor is, ha nem'],
    ['A tipp a nyerő lépés', 'a nyerő lépés', 'Nem találgatás: a megoldás következő lépése'],
    ['Klondike · FreeCell · Pók', 'FreeCell', 'Klasszikus leosztásszámokkal az összevetéshez'],
    ['A megoldó írta leckék', 'A megoldó írta', 'Kezdd négy lépésre a győzelemtől, aztán nyolcra'],
    ['Megmutatja, mit nézel el újra', 'mit nézel el', 'Minden hibát besorol, és kiválasztja a következő leckét'],
    ['500 angyal a gyűjteménybe', '500', 'Minden megnyert játszma egyet hozzáad'],
    ['Kártyahátak, asztalok, kaszkádok', 'kaszkádok', 'Az érme a győzelemből jön — sosem előnyből'],
  ],
  pills1: ['♠ Megoldható leosztások', '✓ Bizonyítható'], pills6: ['👼 500 illusztráció', '🎴 31 gyűjthető'],
};

// ── Română ──
C['ro'] = {
  t: [
    ['Orice împărțire are o soluție', 'are o soluție', 'Iar rezolvitorul o poate demonstra oricând'],
    ['„Mai poate fi câștigată partida?"', 'Mai poate fi câștigată', 'O atingere. Un răspuns sincer, chiar și când e nu'],
    ['Indiciul este mutarea câștigătoare', 'mutarea câștigătoare', 'Nu e o presupunere: e următoarea mutare din soluție'],
    ['Klondike · FreeCell · Spider', 'FreeCell', 'Include numerele clasice de partidă, ca să compari'],
    ['Lecții scrise de rezolvitor', 'de rezolvitor', 'Începi la patru mutări de victorie, apoi la opt'],
    ['Îți arată ce ratezi mereu', 'ce ratezi mereu', 'Fiecare greșeală e clasificată, apoi vine lecția potrivită'],
    ['500 de îngeri de colecționat', '500', 'Fiecare partidă câștigată adaugă unul în album'],
    ['Spate de cărți, mese și cascade', 'cascade', 'Monedele vin din victorii — niciodată din avantaj'],
  ],
  pills1: ['♠ Partide rezolvabile', '✓ Demonstrabil'], pills6: ['👼 500 de ilustrații', '🎴 31 de obiecte'],
};

// ── Hrvatski ──
C['hr'] = {
  t: [
    ['Svako dijeljenje ima rješenje', 'ima rješenje', 'A rješavač to može dokazati u svakom trenutku'],
    ['„Može li se ova partija još dobiti?"', 'još dobiti', 'Jedan dodir. Iskren odgovor, čak i kad je ne'],
    ['Savjet je potez koji pobjeđuje', 'potez koji pobjeđuje', 'Nije nagađanje: to je sljedeći potez iz rješenja'],
    ['Klondike · FreeCell · Spider', 'FreeCell', 'Uključeni klasični brojevi dijeljenja za usporedbu'],
    ['Lekcije koje piše rješavač', 'piše rješavač', 'Kreni četiri poteza do pobjede, zatim osam'],
    ['Pokazuje što stalno propuštaš', 'što stalno propuštaš', 'Svaka pogreška je razvrstana, a lekcija odabrana'],
    ['500 anđela za skupljanje', '500', 'Svaka pobjeda dodaje još jednog u album'],
    ['Poleđine, stolovi i kaskade', 'kaskade', 'Novčići dolaze od pobjeda — nikad od prednosti'],
  ],
  pills1: ['♠ Rješiva dijeljenja', '✓ Dokazivo'], pills6: ['👼 500 ilustracija', '🎴 31 predmet'],
};

// ── Ελληνικά ──
C['el'] = {
  t: [
    ['Κάθε μοίρασμα έχει λύση', 'έχει λύση', 'Και ο λύτης μπορεί να το αποδείξει ανά πάσα στιγμή'],
    ['«Κερδίζεται ακόμη αυτή η παρτίδα;»', 'Κερδίζεται ακόμη', 'Ένα άγγιγμα. Ειλικρινής απάντηση, ακόμη κι όταν είναι όχι'],
    ['Η υπόδειξη είναι η νικηφόρα κίνηση', 'η νικηφόρα κίνηση', 'Δεν είναι μαντεψιά: είναι η επόμενη κίνηση της λύσης'],
    ['Klondike · FreeCell · Spider', 'FreeCell', 'Με τους κλασικούς αριθμούς μοιρασιάς για σύγκριση'],
    ['Μαθήματα που γράφει ο λύτης', 'γράφει ο λύτης', 'Ξεκίνα τέσσερις κινήσεις πριν τη νίκη, μετά οκτώ'],
    ['Δείχνει τι σου ξεφεύγει συνέχεια', 'τι σου ξεφεύγει', 'Κάθε λάθος ταξινομείται και επιλέγεται το επόμενο μάθημα'],
    ['500 άγγελοι για συλλογή', '500', 'Κάθε νίκη προσθέτει άλλον έναν στο άλμπουμ'],
    ['Πλάτες, τραπέζια και καταρράκτες', 'καταρράκτες', 'Τα νομίσματα έρχονται από νίκες — ποτέ από πλεονέκτημα'],
  ],
  pills1: ['♠ Επιλύσιμα μοιράσματα', '✓ Αποδείξιμο'], pills6: ['👼 500 εικόνες', '🎴 31 συλλεκτικά'],
};

// ── Català ──
C['ca'] = {
  t: [
    ['Cada repartiment té solució', 'té solució', 'I el resolutor pot demostrar-ho en qualsevol moment'],
    ['«Encara es pot guanyar aquesta partida?»', 'Encara es pot guanyar', 'Un toc. Resposta honesta, fins i tot quan és que no'],
    ['La pista és la jugada que guanya', 'la jugada que guanya', 'No és una suposició: és el següent pas de la solució'],
    ['Klondike · FreeCell · Spider', 'FreeCell', 'Amb els números de partida clàssics per comparar'],
    ['Lliçons escrites pel resolutor', 'pel resolutor', 'Comença a quatre jugades de guanyar, després a vuit'],
    ['Et mostra què se t’escapa sempre', 'què se t’escapa', 'Classifica cada error i tria la lliçó següent'],
    ['500 àngels per col·leccionar', '500', 'Cada victòria n’afegeix un a l’àlbum'],
    ['Revers, tapets i cascades', 'cascades', 'Les monedes vénen de guanyar — mai d’un avantatge'],
  ],
  pills1: ['♠ Repartiments resolubles', '✓ Demostrable'], pills6: ['👼 500 il·lustracions', '🎴 31 objectes'],
};

// ── 克隆：英语三变体 / 法加 / 墨西哥西语 / 葡欧（少数说法按当地调）──
for (const l of ['en-GB', 'en-AU', 'en-CA']) {
  C[l] = { t: C['en-US'].t.map(x => x.slice()), pills1: [...C['en-US'].pills1], pills6: [...C['en-US'].pills6] };
}
C['fr-CA'] = { t: C['fr-FR'].t.map(x => x.slice()), pills1: [...C['fr-FR'].pills1], pills6: [...C['fr-FR'].pills6] };
C['es-MX'] = { t: C['es-ES'].t.map(x => x.slice()), pills1: [...C['es-ES'].pills1], pills6: [...C['es-ES'].pills6] };
C['pt-PT'] = { t: C['pt-BR'].t.map(x => x.slice()), pills1: [...C['pt-BR'].pills1], pills6: [...C['pt-BR'].pills6] };

C['es-MX'].t[0] = ['Cada juego tiene solución', 'solución', 'Y el solucionador puede demostrarlo cuando quieras'];
C['es-MX'].t[5] = ['Te dice en qué fallas siempre', 'en qué fallas', 'Clasifica cada error y elige tu próxima lección'];
C['pt-PT'].t[1] = ['"Ainda é possível ganhar este jogo?"', 'Ainda é possível ganhar', 'Um toque. Resposta honesta, mesmo quando é não'];
C['pt-PT'].t[5] = ['Mostra o que lhe escapa sempre', 'o que lhe escapa', 'Cada erro é classificado e escolhe a lição seguinte'];
C['fr-CA'].t[3] = ['Klondike · FreeCell · Spider', 'FreeCell', 'Numéros de donne classiques inclus, pour vous comparer'];

// ══ 断言（加文案时当场炸，别等出了 624 张图才发现）══
// ① hl 必须是 h 的子串（否则金色高亮不生效，图上看不出重点）
for (const [loc, v] of Object.entries(C)) {
  if (v.t.length !== 8) throw new Error(`[shot-caps] ${loc} 不是 8 条`);
  v.t.forEach(([h, hl], i) => {
    if (!h.includes(hl)) throw new Error(`[shot-caps] ${loc} 第 ${i + 1} 张的 hl「${hl}」不是 h 的子串`);
  });
}
// ② ⛔ 2.3.7：截图属于元数据，任何价格词都算「价格引用」——本作 2026-07-22 正是因为
//    素材里出现 "free" 被拒过一次。写成断言比写成注释可靠。
const PRICE_RE = /(free|gratis|grátis|gratuit|gratuito|besplatn|ilmais|darmow|zdarma|ingyen|bezplatn|kostenlos|ücretsiz|percuma|miễn phí|бесплатн|безкоштовн|무료|無料|免费|免費|مجان|חינם|ฟรี|मुफ़्त|मुफ्त)/iu;
// ⚠ 玩法名 **FreeCell** 里带 "Free"（泰语 ฟรีเซลล์、印地语 फ्रीसेल 同理）——它是微软三十年的
//   玩法专名，不是价格宣称。先把各语言的玩法名剔掉再查，否则这条门禁自己先炸（实炸过一次）。
const MODE_NAMES = /FreeCell|Free Cell|フリーセル|프리셀|فري سيل|ฟรีเซลล์|फ्रीसेल|פריסל/g;
for (const [loc, v] of Object.entries(C)) {
  const all = v.t.flat().concat(v.pills1, v.pills6).join(' | ').replace(MODE_NAMES, '');
  const m = all.match(PRICE_RE);
  if (m) throw new Error(`[shot-caps] ⛔ ${loc} 的文案里有价格词「${m[0]}」——2.3.7 拒审红线`);
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
