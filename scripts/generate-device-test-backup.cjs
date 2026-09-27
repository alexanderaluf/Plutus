// Standalone, deterministic fixture generation. Never imported by application code.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const ts = require("typescript");

process.env.TZ = "Asia/Jerusalem";
const root = path.resolve(__dirname, "..");
const sourceRoot = path.join(root, "src");
require.extensions[".ts"] = (module, filename) => {
  const compiled = ts
    .transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replace(
      /require\("@\/([^\"]+)"\)/g,
      (_, relative) =>
        `require(${JSON.stringify(path.join(sourceRoot, relative))})`,
    );
  module._compile(compiled, filename);
};

const model = (name) =>
  require(path.join(sourceRoot, "data/model", name + ".ts"));
const { createDefaultBackup } = model("default-backup");
const { normalizeBackupDocument, parseBackupDocument } =
  model("normalize-backup");
const { saveCategory, categoryFamily, identity, belongsToProfile } =
  model("category-record");
const { addAccountToDocument } = model("account-record");
const { createDefaultSavingsDetails } = model("savings-account");
const { budgetDefaults, saveBudget } = model("budget-record");
const {
  recurringDefaults,
  saveRecurring,
  occurrenceDate,
  occurrenceKey,
  completeOccurrence,
} = model("recurring-record");
const {
  createTransactionDraft,
  saveTransaction,
  saveTransactionTemplate,
  transactionDraftFromRecord,
  deleteTransaction,
} = model("transaction-record");
const { settleDueCardPayments } = model("card-payment");
const { parseExchangeRates, storeExchangeRates, convertCurrency } =
  model("exchange-rate");
const { createJsonBackupDocument } = require(
  path.join(sourceRoot, "data/backup/document-export.ts"),
);
const { transactionsToCsv, transactionsFromCsv } = require(
  path.join(sourceRoot, "data/backup/csv-backup.ts"),
);
const { selectBudgets } = require(
  path.join(sourceRoot, "data/selectors/budget-selectors.ts"),
);
const { selectRecurrings, selectRecurringEvents } = require(
  path.join(sourceRoot, "data/selectors/recurring-selectors.ts"),
);
const { MATERIAL_ROUNDED_FILLED_ICONS } = require(
  path.join(sourceRoot, "shared/icons/material-rounded-filled-icons.ts"),
);

// Selects the fixture's display-text language; identities, amounts, dates and
// currencies stay identical across languages so the three files only differ in text.
const LANG = ["en", "he", "ru"].includes(process.argv[2])
  ? process.argv[2]
  : "en";
const LOCALES = {
  en: {
    profiles: {
      main: "Personal",
      business: "Freelance business",
      travel: "Travel fund",
    },
    currencyName: "Israeli Shekel",
    savingsProviderName: "Migdal Savings",
    accounts: {
      bankA: "Bank Hapoalim — Checking",
      bankB: "Bank Leumi — Household",
      cardA1: "Visa — Everyday spending",
      cardA2: "Mastercard — Online shopping",
      cardB1: "Amex — Travel & dining",
      cardB2: "Isracard — Subscriptions",
      savings: "Emergency savings",
      cash: "Cash wallet",
      businessCash: "Freelance cash box",
      travelCash: "Travel cash",
    },
    topCategories: {
      digital: "Digital life & subscriptions",
      pets: "Pets & animal care",
      giving: "Gifts, charity & community",
      freelance: "Freelance & side income",
      refunds: "Refunds & reimbursements",
      transfers: "Transfers between my accounts",
    },
    bizTravelCategories: {
      businessSales: "Client invoice payments",
      businessCosts: "Freelance operating costs",
      travelExpense: "European trip spending",
      travelIncome: "Travel fund top-up",
    },
    transferCategories: {
      "bank-transfer": "Bank-to-bank transfer",
      "save-transfer": "Savings contribution",
      "cash-transfer": "Cash withdrawal",
    },
    transferNames: [
      "Transfer to household account",
      "Emergency savings contribution",
      "Cash withdrawal",
    ],
    leaf: {
      "fresh-food": ["Fruits and vegetables", "Farmers market produce"],
      supermarket: ["Weekly supermarket run", "Household supplies"],
      bakery: ["Fresh bread", "Bakery treats"],
      "specialty-food": ["Imported groceries", "Deli shop"],
      coffee: ["Coffee", "Latte on the way to work"],
      restaurants: ["Dinner out", "Restaurant with friends"],
      takeaway: ["Takeout order", "Delivery dinner"],
      "work-lunch": ["Lunch at work", "Office cafeteria"],
      fuel: ["Gas station fill-up", "Fuel"],
      parking: ["Parking", "Mall parking"],
      "car-service": ["Car service", "Oil change"],
      "car-insurance": ["Car insurance payment", "Car insurance renewal"],
      bus: ["Bus fare", "Bus pass top-up"],
      trains: ["Train ticket", "Train pass"],
      taxi: ["Taxi ride", "Ride share"],
      flights: ["Flight tickets", "Airline baggage fee"],
      hotels: ["Hotel booking", "Weekend hotel stay"],
      clothing: ["New clothes", "Shoes"],
      electronics: ["Electronics purchase", "New headphones"],
      furniture: ["New furniture", "Home decor"],
      books: ["Books", "New novel"],
      courses: ["Online course", "Certification course"],
      "school-supplies": ["School supplies", "Notebooks and stationery"],
      movies: ["Movie night", "Cinema tickets"],
      concerts: ["Concert tickets", "Live show"],
      games: ["New video game", "Board game night"],
      pharmacy: ["Pharmacy", "Medicine"],
      dentist: ["Dentist appointment", "Dental cleaning"],
      doctor: ["Doctor visit", "Clinic appointment"],
      fitness: ["Gym class", "Fitness gear"],
      electricity: ["Electricity bill", "Power bill"],
      water: ["Water bill", "Municipal water"],
      gas: ["Cooking gas refill", "Gas bill"],
      maintenance: ["Home repair", "Handyman visit"],
      "home-insurance": ["Home insurance payment", "Home insurance renewal"],
      "property-tax": ["Municipal tax", "Property tax payment"],
      "monthly-rent": ["Monthly rent", "Rent payment"],
      "bank-fees": ["Bank fee", "Account maintenance fee"],
      "pet-food": ["Pet food", "Dog food"],
      vet: ["Vet visit", "Vet checkup"],
      "pet-supplies": ["Pet toys", "Pet supplies"],
      gifts: ["Birthday gift", "Gift for a friend"],
      charity: ["Donation", "Charity contribution"],
      community: ["Community event", "Local fundraiser"],
      misc: ["Small purchase", "Miscellaneous expense"],
      "salary-base": ["Monthly salary", "Salary payment"],
      "salary-bonus": ["Year-end bonus", "Performance bonus"],
      "salary-overtime": ["Overtime pay", "Extra shift pay"],
      consulting: ["Consulting invoice", "Client payment"],
      "design-work": ["Design project payment", "Freelance design invoice"],
      royalties: ["Royalty payment", "Licensing payment"],
      dividends: ["Dividend payout", "Investment dividend"],
      interest: ["Interest earned", "Savings interest"],
      "expense-refund": ["Expense reimbursement", "Refund from work"],
      "purchase-refund": ["Store refund", "Returned item refund"],
      cashback: ["Credit card cashback", "Cashback reward"],
    },
    genericServices: {
      "Gym membership": "Gym membership",
      "Mobile data plan": "Mobile data plan",
      "Home internet": "Home internet",
    },
    subscriptionSuffix: " subscription",
    otherRecurring: {
      weekly: "Weekly fitness class",
      fortnightly: "Fortnightly consulting retainer",
      quarterly: "Quarterly home insurance",
      "half-year": "Six-month learning pass",
      yearly: "Annual domain registration",
      daily: "Daily transit pass",
    },
    archivedRecurringName: "Magazine subscription",
    pendingRecurringName: "Monthly charity donation",
    fxTransactionName: "Design software license",
    tinyTransactionName: "Rounding change",
    exchangeRateSource: "Exchange rate at time of purchase",
    labels: [
      "Essential",
      "Optional",
      "Work",
      "Family",
      "Holiday",
      "Tax deductible",
      "Subscription",
      "Refund",
      "Cash",
      "Large purchase",
      "Weekend",
      "Impulse buy",
    ],
    places: [
      "Tel Aviv supermarket",
      "Jerusalem cafe",
      "Haifa station",
      "Home office",
      "Neighborhood pharmacy",
      "Online checkout",
      "Eilat hotel",
      "City gym",
      "Community center",
      "Berlin bookshop",
    ],
    peoples: [
      "Dana Cohen",
      "Noam Levi",
      "Maya Rosen",
      "Sam Taylor",
      "Employer",
      "Freelance client",
      "Landlord",
      "Vet clinic",
    ],
    budgets: {
      groceries: "Groceries",
      dining: "Dining & coffee",
      digital: "Digital subscriptions",
      transport: "Transport & car",
      health: "Health & pet care",
      learning: "Learning & courses",
      overall: "Yearly expenses",
      income: "Salary & freelance income",
      weekly: "Entertainment",
      daily: "Coffee",
      "past-trip": "Summer trip",
      "future-trip": "Autumn trip",
      "saving-transfers": "Savings",
      "cycle-31": "Utilities",
    },
    assets: ["Laptop", "Bicycle", "Home equipment"],
    goals: ["Emergency fund", "Winter holiday", "New laptop", "Education fund"],
    loans: ["Car loan", "Family loan"],
    achievements: [
      "First transaction",
      "Five months tracked",
      "Budget review completed",
    ],
    billSplitterName: "Dinner with friends",
  },
  he: {
    profiles: { main: "אישי", business: "עסק פרילנס", travel: "קרן טיולים" },
    currencyName: "שקל חדש",
    savingsProviderName: "מגדל חיסכון",
    accounts: {
      bankA: "בנק הפועלים — עו״ש",
      bankB: "בנק לאומי — משק בית",
      cardA1: "ויזה — הוצאות יומיומיות",
      cardA2: "מאסטרקארד — קניות אונליין",
      cardB1: "אמריקן אקספרס — טיולים ומסעדות",
      cardB2: "ישראכרט — מנויים",
      savings: "חיסכון לשעת חירום",
      cash: "ארנק מזומן",
      businessCash: "קופת מזומן לפרילנס",
      travelCash: "מזומן לטיולים",
    },
    topCategories: {
      digital: "דיגיטלי ומנויים",
      pets: "טיפול בחיות מחמד",
      giving: "מתנות, צדקה וקהילה",
      freelance: "פרילנס והכנסה נוספת",
      refunds: "החזרים",
      transfers: "העברות בין החשבונות שלי",
    },
    bizTravelCategories: {
      businessSales: "תשלומי לקוחות",
      businessCosts: "הוצאות תפעול לעסק",
      travelExpense: "הוצאות בטיול באירופה",
      travelIncome: "הפקדה לקרן הטיולים",
    },
    transferCategories: {
      "bank-transfer": "העברה בין בנקים",
      "save-transfer": "הפקדה לחיסכון",
      "cash-transfer": "משיכת מזומן",
    },
    transferNames: [
      "העברה לחשבון משק הבית",
      "הפקדה חודשית לחיסכון חירום",
      "משיכת מזומן",
    ],
    leaf: {
      "fresh-food": ["פירות וירקות", "ירקות מהשוק"],
      supermarket: ["קניות שבועיות בסופר", "מוצרי ניקיון לבית"],
      bakery: ["לחם טרי", "מאפים מהמאפייה"],
      "specialty-food": ["מכולת איכותית", "חנות מעדנים"],
      coffee: ["קפה", "לאטה בדרך לעבודה"],
      restaurants: ["ארוחת ערב במסעדה", "מסעדה עם חברים"],
      takeaway: ["הזמנת טייק אווי", "משלוח לארוחת ערב"],
      "work-lunch": ["ארוחת צהריים בעבודה", "קפיטריה במשרד"],
      fuel: ["תדלוק בתחנת דלק", "דלק"],
      parking: ["חניה", "חניון בקניון"],
      "car-service": ["טיפול לרכב", "החלפת שמן"],
      "car-insurance": ["תשלום ביטוח רכב", "חידוש ביטוח רכב"],
      bus: ["נסיעה באוטובוס", "טעינת כרטיס רב-קו"],
      trains: ["כרטיס רכבת", "מנוי רכבת"],
      taxi: ["נסיעה במונית", "נסיעה בשירות שיתוף"],
      flights: ["כרטיסי טיסה", "עמלת מזוודות"],
      hotels: ["הזמנת מלון", "לינה בסוף שבוע"],
      clothing: ["בגדים חדשים", "נעליים"],
      electronics: ["רכישת מוצר אלקטרוני", "אוזניות חדשות"],
      furniture: ["רהיטים חדשים", "עיצוב הבית"],
      books: ["ספרים", "רומן חדש"],
      courses: ["קורס אונליין", "קורס הסמכה"],
      "school-supplies": ["ציוד לבית ספר", "מחברות וכלי כתיבה"],
      movies: ["ערב קולנוע", "כרטיסים לסרט"],
      concerts: ["כרטיסים להופעה", "מופע חי"],
      games: ["משחק וידאו חדש", "ערב משחקי קופסה"],
      pharmacy: ["בית מרקחת", "תרופות"],
      dentist: ["תור לרופא שיניים", "ניקוי שיניים"],
      doctor: ["ביקור אצל הרופא", "תור במרפאה"],
      fitness: ["שיעור בחדר כושר", "ציוד כושר"],
      electricity: ["חשבון חשמל", "חשבון חשמל חודשי"],
      water: ["חשבון מים", "מים עירוניים"],
      gas: ["מילוי בלון גז", "חשבון גז"],
      maintenance: ["תיקון בבית", "ביקור איש תחזוקה"],
      "home-insurance": ["תשלום ביטוח דירה", "חידוש ביטוח דירה"],
      "property-tax": ["ארנונה", "תשלום ארנונה"],
      "monthly-rent": ["שכר דירה חודשי", "תשלום שכירות"],
      "bank-fees": ["עמלת בנק", "דמי ניהול חשבון"],
      "pet-food": ["אוכל לחיית מחמד", "אוכל לכלב"],
      vet: ["ביקור אצל וטרינר", "בדיקה וטרינרית"],
      "pet-supplies": ["צעצועים לחיית מחמד", "ציוד לחיית מחמד"],
      gifts: ["מתנת יום הולדת", "מתנה לחבר"],
      charity: ["תרומה", "תרומה לצדקה"],
      community: ["אירוע קהילתי", "גיוס כספים מקומי"],
      misc: ["קנייה קטנה", "הוצאה שונות"],
      "salary-base": ["משכורת חודשית", "תשלום משכורת"],
      "salary-bonus": ["בונוס סוף שנה", "בונוס ביצועים"],
      "salary-overtime": ["תשלום שעות נוספות", "תשלום למשמרת נוספת"],
      consulting: ["חשבונית ייעוץ", "תשלום מלקוח"],
      "design-work": ["תשלום עבור פרויקט עיצוב", "חשבונית עיצוב פרילנס"],
      royalties: ["תשלום תמלוגים", "תשלום רישוי"],
      dividends: ["חלוקת דיבידנד", "דיבידנד השקעה"],
      interest: ["ריבית שהתקבלה", "ריבית על חיסכון"],
      "expense-refund": ["החזר הוצאות", "החזר מהעבודה"],
      "purchase-refund": ["החזר כספי מחנות", "החזר עבור מוצר שהוחזר"],
      cashback: ["קאשבק מכרטיס אשראי", "תגמול קאשבק"],
    },
    genericServices: {
      "Gym membership": "מנוי לחדר כושר",
      "Mobile data plan": "חבילת גלישה סלולרית",
      "Home internet": "אינטרנט ביתי",
    },
    subscriptionSuffix: " — מנוי",
    otherRecurring: {
      weekly: "שיעור כושר שבועי",
      fortnightly: "ריטיינר ייעוץ דו-שבועי",
      quarterly: "ביטוח דירה רבעוני",
      "half-year": "כרטיס לימוד לחצי שנה",
      yearly: "חידוש דומיין שנתי",
      daily: "כרטיס תחבורה יומי",
    },
    archivedRecurringName: "מנוי למגזין",
    pendingRecurringName: "תרומה חודשית לצדקה",
    fxTransactionName: "רישיון לתוכנת עיצוב",
    tinyTransactionName: "עודף קטן",
    exchangeRateSource: "שער החליפין בעת הרכישה",
    labels: [
      "חיוני",
      "אופציונלי",
      "עבודה",
      "משפחה",
      "חופשה",
      "ניכוי מס",
      "מנוי",
      "החזר",
      "מזומן",
      "רכישה גדולה",
      "סוף שבוע",
      "קנייה אימפולסיבית",
    ],
    places: [
      "סופרמרקט בתל אביב",
      "בית קפה בירושלים",
      "תחנת רכבת בחיפה",
      "משרד ביתי",
      "בית מרקחת שכונתי",
      "קופה אונליין",
      "מלון באילת",
      "חדר כושר בעיר",
      "מרכז קהילתי",
      "חנות ספרים בברלין",
    ],
    peoples: [
      "דנה כהן",
      "נועם לוי",
      "מאיה רוזן",
      "סם טיילור",
      "מעסיק",
      "לקוח פרילנס",
      "בעל הדירה",
      "מרפאה וטרינרית",
    ],
    budgets: {
      groceries: "מכולת",
      dining: "מסעדות וקפה",
      digital: "מנויים דיגיטליים",
      transport: "תחבורה ורכב",
      health: "בריאות וחיות מחמד",
      learning: "לימודים וקורסים",
      overall: "הוצאות שנתיות",
      income: "משכורת והכנסה מפרילנס",
      weekly: "בילויים",
      daily: "קפה",
      "past-trip": "טיול קיץ",
      "future-trip": "טיול סתיו",
      "saving-transfers": "חיסכון",
      "cycle-31": "חשבונות שירותים",
    },
    assets: ["מחשב נייד", "אופניים", "ציוד לבית"],
    goals: ["קרן חירום", "חופשת חורף", "מחשב נייד חדש", "קרן לימודים"],
    loans: ["הלוואת רכב", "הלוואה משפחתית"],
    achievements: ["העסקה הראשונה", "חמישה חודשים במעקב", "בדיקת תקציב הושלמה"],
    billSplitterName: "ארוחת ערב משותפת",
  },
  ru: {
    profiles: {
      main: "Личный",
      business: "Фриланс-бизнес",
      travel: "Дорожный фонд",
    },
    currencyName: "Новый израильский шекель",
    savingsProviderName: "Мигдаль Сбережения",
    accounts: {
      bankA: "Банк Апоалим — текущий счёт",
      bankB: "Банк Леуми — семейный счёт",
      cardA1: "Visa — повседневные траты",
      cardA2: "Mastercard — покупки онлайн",
      cardB1: "Amex — путешествия и рестораны",
      cardB2: "Isracard — подписки",
      savings: "Резервный фонд",
      cash: "Наличные",
      businessCash: "Наличные для фриланса",
      travelCash: "Наличные в поездках",
    },
    topCategories: {
      digital: "Цифровые сервисы и подписки",
      pets: "Питомцы и уход за животными",
      giving: "Подарки, благотворительность и мероприятия",
      freelance: "Фриланс и дополнительный доход",
      refunds: "Возвраты",
      transfers: "Переводы между моими счетами",
    },
    bizTravelCategories: {
      businessSales: "Оплаты от клиентов",
      businessCosts: "Операционные расходы фриланса",
      travelExpense: "Расходы в поездке по Европе",
      travelIncome: "Пополнение дорожного фонда",
    },
    transferCategories: {
      "bank-transfer": "Перевод между банками",
      "save-transfer": "Пополнение сбережений",
      "cash-transfer": "Снятие наличных",
    },
    transferNames: [
      "Перевод на семейный счёт",
      "Ежемесячный взнос в резервный фонд",
      "Снятие наличных",
    ],
    leaf: {
      "fresh-food": ["Фрукты и овощи", "Овощи с рынка"],
      supermarket: [
        "Еженедельные покупки в супермаркете",
        "Хозтовары для дома",
      ],
      bakery: ["Свежий хлеб", "Выпечка из пекарни"],
      "specialty-food": ["Импортные продукты", "Магазин деликатесов"],
      coffee: ["Кофе", "Латте по дороге на работу"],
      restaurants: ["Ужин в ресторане", "Ресторан с друзьями"],
      takeaway: ["Заказ на вынос", "Доставка ужина"],
      "work-lunch": ["Обед на работе", "Столовая в офисе"],
      fuel: ["Заправка", "Бензин"],
      parking: ["Парковка", "Парковка у торгового центра"],
      "car-service": ["Техобслуживание машины", "Замена масла"],
      "car-insurance": ["Оплата страховки авто", "Продление страховки авто"],
      bus: ["Проезд на автобусе", "Пополнение проездного"],
      trains: ["Билет на поезд", "Проездной на электричку"],
      taxi: ["Поездка на такси", "Поездка каршеринг"],
      flights: ["Авиабилеты", "Оплата багажа"],
      hotels: ["Бронь отеля", "Отель на выходные"],
      clothing: ["Новая одежда", "Обувь"],
      electronics: ["Покупка электроники", "Новые наушники"],
      furniture: ["Новая мебель", "Товары для дома"],
      books: ["Книги", "Новый роман"],
      courses: ["Онлайн-курс", "Курс сертификации"],
      "school-supplies": ["Школьные принадлежности", "Тетради и канцтовары"],
      movies: ["Вечер в кино", "Билеты в кино"],
      concerts: ["Билеты на концерт", "Живое выступление"],
      games: ["Новая видеоигра", "Вечер настольных игр"],
      pharmacy: ["Аптека", "Лекарства"],
      dentist: ["Прием у стоматолога", "Чистка зубов"],
      doctor: ["Визит к врачу", "Прием в клинике"],
      fitness: ["Занятие в зале", "Спортивный инвентарь"],
      electricity: ["Счет за электричество", "Оплата электроэнергии"],
      water: ["Счет за воду", "Оплата водоснабжения"],
      gas: ["Заправка газового баллона", "Счет за газ"],
      maintenance: ["Ремонт по дому", "Вызов мастера"],
      "home-insurance": [
        "Оплата страховки квартиры",
        "Продление страховки жилья",
      ],
      "property-tax": ["Муниципальный налог", "Оплата налога на имущество"],
      "monthly-rent": ["Аренда за месяц", "Оплата аренды"],
      "bank-fees": ["Банковская комиссия", "Плата за обслуживание счета"],
      "pet-food": ["Корм для питомца", "Корм для собаки"],
      vet: ["Визит к ветеринару", "Осмотр у ветеринара"],
      "pet-supplies": ["Игрушки для питомца", "Товары для питомца"],
      gifts: ["Подарок на день рождения", "Подарок другу"],
      charity: ["Пожертвование", "Благотворительный взнос"],
      community: ["Общественное мероприятие", "Местный сбор средств"],
      misc: ["Мелкая покупка", "Прочие расходы"],
      "salary-base": ["Ежемесячная зарплата", "Выплата зарплаты"],
      "salary-bonus": ["Годовая премия", "Премия за результаты"],
      "salary-overtime": ["Оплата сверхурочных", "Оплата дополнительной смены"],
      consulting: ["Счет за консультацию", "Оплата от клиента"],
      "design-work": ["Оплата за дизайн-проект", "Счет за фриланс-дизайн"],
      royalties: ["Роялти", "Оплата за лицензию"],
      dividends: ["Выплата дивидендов", "Дивиденды по инвестициям"],
      interest: ["Начисленные проценты", "Проценты по вкладу"],
      "expense-refund": ["Возмещение расходов", "Возврат от работы"],
      "purchase-refund": ["Возврат средств из магазина", "Возврат за товар"],
      cashback: ["Кэшбэк по карте", "Бонус кэшбэк"],
    },
    genericServices: {
      "Gym membership": "Абонемент в спортзал",
      "Mobile data plan": "Мобильный интернет",
      "Home internet": "Домашний интернет",
    },
    subscriptionSuffix: " — подписка",
    otherRecurring: {
      weekly: "Еженедельное занятие фитнесом",
      fortnightly: "Гонорар за консультации раз в две недели",
      quarterly: "Квартальная страховка жилья",
      "half-year": "Полугодовой абонемент на обучение",
      yearly: "Ежегодная регистрация домена",
      daily: "Ежедневный проездной",
    },
    archivedRecurringName: "Подписка на журнал",
    pendingRecurringName: "Ежемесячное пожертвование на благотворительность",
    fxTransactionName: "Лицензия на программу для дизайна",
    tinyTransactionName: "Мелкая сдача",
    exchangeRateSource: "Курс обмена на момент покупки",
    labels: [
      "Необходимое",
      "Опционально",
      "Работа",
      "Семья",
      "Отпуск",
      "Налоговый вычет",
      "Подписка",
      "Возврат",
      "Наличные",
      "Крупная покупка",
      "Выходные",
      "Спонтанная покупка",
    ],
    places: [
      "Супермаркет в Тель-Авиве",
      "Кафе в Иерусалиме",
      "Вокзал в Хайфе",
      "Домашний офис",
      "Соседняя аптека",
      "Онлайн-оплата",
      "Отель в Эйлате",
      "Городской спортзал",
      "Общественный центр",
      "Книжный магазин в Берлине",
    ],
    peoples: [
      "Дана Коэн",
      "Ноам Леви",
      "Майя Розен",
      "Сэм Тейлор",
      "Работодатель",
      "Клиент-фрилансер",
      "Арендодатель",
      "Ветклиника",
    ],
    budgets: {
      groceries: "Продукты",
      dining: "Рестораны и кофе",
      digital: "Цифровые подписки",
      transport: "Транспорт и авто",
      health: "Здоровье и питомцы",
      learning: "Обучение и курсы",
      overall: "Годовые расходы",
      income: "Зарплата и доход фрилансера",
      weekly: "Развлечения",
      daily: "Кофе",
      "past-trip": "Летняя поездка",
      "future-trip": "Осенняя поездка",
      "saving-transfers": "Сбережения",
      "cycle-31": "Коммунальные услуги",
    },
    assets: ["Ноутбук", "Велосипед", "Техника для дома"],
    goals: [
      "Резервный фонд",
      "Зимний отпуск",
      "Новый ноутбук",
      "Фонд на образование",
    ],
    loans: ["Автокредит", "Семейный займ"],
    achievements: [
      "Первая транзакция",
      "Пять месяцев учёта",
      "Проверка бюджета завершена",
    ],
    billSplitterName: "Совместный ужин",
  },
};
const T = LOCALES[LANG];
// Fixed synthetic reference rates for offline history; independent of the live exchange-rate cache.
const FX = { USD: 3.7, EUR: 4.02 };
function recCurrencyFor(index) {
  const mod = index % 4;
  return mod === 1 ? "USD" : mod === 3 ? "EUR" : "ILS";
}
function fxMix(index, when) {
  const mod = index % 4;
  if (mod !== 1 && mod !== 3) return {};
  const code = mod === 1 ? "USD" : "EUR";
  return {
    currencyCode: code,
    accountCurrencyCode: "ILS",
    exchangeRate: FX[code],
    exchangeRateDate: when.slice(0, 10),
    exchangeRateFetchedAt: when,
    exchangeRateSource: T.exchangeRateSource,
  };
}
function subscriptionName(name) {
  return T.genericServices[name] ?? name;
}
function subscriptionCategoryLabel(name) {
  return subscriptionName(name) + T.subscriptionSuffix;
}

const icons = new Map(
  MATERIAL_ROUNDED_FILLED_ICONS.map((item) => [item.name, item.pathData]),
);
const AS_OF = "2026-09-16T09:00:00.000Z";
const START = "2026-03-31T09:00:00.000Z";
const MONTHS = [
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
];
const main = uuid("profile-personal"),
  business = uuid("profile-business"),
  travel = uuid("profile-travel");
function uuid(name) {
  const bytes = crypto
    .createHash("sha1")
    .update("plutus-device-test-v1:" + name)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
let colorIndex = 0;
const colors = new Set();
function color() {
  for (;;) {
    const hue = ((colorIndex++ * 137.508) % 360) / 60;
    const saturation = 0.57 + (colorIndex % 3) * 0.08;
    const lightness = 0.47 + (colorIndex % 4) * 0.055;
    const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = c * (1 - Math.abs((hue % 2) - 1)),
      m = lightness - c / 2;
    const rgb = [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ][Math.floor(hue)];
    const value =
      "#" +
      rgb
        .map((v) =>
          Math.round((v + m) * 255)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("");
    if (!colors.has(value)) {
      colors.add(value);
      return value;
    }
  }
}
function visual(name) {
  assert(icons.has(name), `Unknown installed Material icon: ${name}`);
  return {
    icon: `material:${name}`,
    iconPath: icons.get(name),
    color: color(),
  };
}
function stamp(month, day, hour = 8, minute = 0) {
  return new Date(
    `${month}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+03:00`,
  ).toISOString();
}
let document = createDefaultBackup();
document.users = [
  [main, T.profiles.main, "ILS", T.currencyName, "₪", "person"],
  [
    business,
    T.profiles.business,
    "ILS",
    T.currencyName,
    "₪",
    "business_center",
  ],
  [travel, T.profiles.travel, "ILS", T.currencyName, "₪", "luggage"],
].map(([id, name, currency, currencyName, currencySymbol, icon], index) => ({
  uuid: id,
  name,
  currency,
  currencyName,
  currencySymbol,
  isSelected: index === 0,
  ...visual(icon),
  createdAt: START,
  updatedAt: AS_OF,
}));
document._local = {
  ...document._local,
  selectedProfileId: main,
  mainCurrency: "ILS",
  dataMode: "restored",
  appLanguage: LANG,
  themeMode: "system",
  dateFormat: "DD/MM/YYYY",
  weekStartDay: 0,
  monthStartDay: 1,
  exportedAt: AS_OF,
  onboardingCompletedAt: START,
  backupResponsibilityAcceptedAt: START,
  localStorageAcceptedAt: START,
};
for (const c of document.categories) {
  colors.add(c.color);
  Object.assign(c, { createdAt: START, updatedAt: START, transactions: [] });
}
const categories = new Map(
  document.categories.map((c) => [
    String(c.uuid).replace("category-", ""),
    c.uuid,
  ]),
);
const categoryIcons = new Set(document.categories.map((c) => c.icon));
function category(key, name, icon, parent = null, type = 0, owner = main) {
  assert(
    !categoryIcons.has(`material:${icon}`),
    `Duplicate category icon: ${icon}`,
  );
  const id = uuid("category-" + key);
  document = saveCategory(
    document,
    {
      name,
      description: "",
      type,
      parentId: parent ? categories.get(parent) : null,
      ...visual(icon),
      isDefault: false,
    },
    id,
    owner,
    START,
  );
  document.categories.at(-1).transactions = [];
  categories.set(key, id);
  categoryIcons.add(`material:${icon}`);
  return id;
}
category("digital", T.topCategories.digital, "devices");
category("pets", T.topCategories.pets, "pets");
category("giving", T.topCategories.giving, "volunteer_activism");
category("freelance", T.topCategories.freelance, "work", null, 1);
category("refunds", T.topCategories.refunds, "assignment_return", null, 1);
category("transfers", T.topCategories.transfers, "sync_alt", null, 2);
const specs = [
  ["fresh-food", T.leaf["fresh-food"][0], "nutrition", "groceries"],
  ["supermarket", T.leaf.supermarket[0], "shopping_basket", "groceries"],
  ["bakery", T.leaf.bakery[0], "bakery_dining", "groceries"],
  ["specialty-food", T.leaf["specialty-food"][0], "storefront", "groceries"],
  ["coffee", T.leaf.coffee[0], "local_cafe", "food"],
  ["restaurants", T.leaf.restaurants[0], "table_restaurant", "food"],
  ["takeaway", T.leaf.takeaway[0], "takeout_dining", "food"],
  ["work-lunch", T.leaf["work-lunch"][0], "lunch_dining", "food"],
  ["fuel", T.leaf.fuel[0], "local_gas_station", "car"],
  ["parking", T.leaf.parking[0], "local_parking", "car"],
  ["car-service", T.leaf["car-service"][0], "car_repair", "car"],
  ["car-insurance", T.leaf["car-insurance"][0], "car_crash", "car"],
  ["bus", T.leaf.bus[0], "directions_bus", "travel"],
  ["trains", T.leaf.trains[0], "train", "travel"],
  ["taxi", T.leaf.taxi[0], "local_taxi", "travel"],
  ["flights", T.leaf.flights[0], "flight_takeoff", "travel"],
  ["hotels", T.leaf.hotels[0], "hotel", "travel"],
  ["clothing", T.leaf.clothing[0], "checkroom", "shopping"],
  ["electronics", T.leaf.electronics[0], "computer", "shopping"],
  ["furniture", T.leaf.furniture[0], "chair", "shopping"],
  ["books", T.leaf.books[0], "menu_book", "education"],
  ["courses", T.leaf.courses[0], "cast_for_education", "education"],
  ["school-supplies", T.leaf["school-supplies"][0], "draw", "education"],
  ["movies", T.leaf.movies[0], "movie", "entertainment"],
  ["concerts", T.leaf.concerts[0], "theater_comedy", "entertainment"],
  ["games", T.leaf.games[0], "casino", "entertainment"],
  ["pharmacy", T.leaf.pharmacy[0], "medication", "health"],
  ["dentist", T.leaf.dentist[0], "dentistry", "health"],
  ["doctor", T.leaf.doctor[0], "medical_services", "health"],
  ["fitness", T.leaf.fitness[0], "fitness_center", "health"],
  ["electricity", T.leaf.electricity[0], "bolt", "utilities"],
  ["water", T.leaf.water[0], "water_drop", "utilities"],
  ["gas", T.leaf.gas[0], "propane_tank", "utilities"],
  ["maintenance", T.leaf.maintenance[0], "handyman", "housing"],
  ["home-insurance", T.leaf["home-insurance"][0], "shield", "housing"],
  ["property-tax", T.leaf["property-tax"][0], "location_city", "housing"],
  ["monthly-rent", T.leaf["monthly-rent"][0], "home_work", "rent"],
  ["bank-fees", T.leaf["bank-fees"][0], "account_balance", "bills"],
  ["pet-food", T.leaf["pet-food"][0], "cruelty_free", "pets"],
  ["vet", T.leaf.vet[0], "healing", "pets"],
  [
    "pet-supplies",
    T.leaf["pet-supplies"][0],
    "sound_detection_dog_barking",
    "pets",
  ],
  ["gifts", T.leaf.gifts[0], "featured_seasonal_and_gifts", "giving"],
  ["charity", T.leaf.charity[0], "favorite", "giving"],
  ["community", T.leaf.community[0], "diversity_3", "giving"],
  ["misc", T.leaf.misc[0], "category", "others"],
  ["salary-base", T.leaf["salary-base"][0], "badge", "salary", 1],
  ["salary-bonus", T.leaf["salary-bonus"][0], "workspace_premium", "salary", 1],
  ["salary-overtime", T.leaf["salary-overtime"][0], "more_time", "salary", 1],
  ["consulting", T.leaf.consulting[0], "psychology", "freelance", 1],
  ["design-work", T.leaf["design-work"][0], "design_services", "freelance", 1],
  ["royalties", T.leaf.royalties[0], "copyright", "freelance", 1],
  ["dividends", T.leaf.dividends[0], "monitoring", "investments", 1],
  ["interest", T.leaf.interest[0], "percent", "savings", 1],
  [
    "expense-refund",
    T.leaf["expense-refund"][0],
    "currency_exchange",
    "refunds",
    1,
  ],
  [
    "purchase-refund",
    T.leaf["purchase-refund"][0],
    "keyboard_return",
    "refunds",
    1,
  ],
  ["cashback", T.leaf.cashback[0], "credit_card_heart", "refunds", 1],
  [
    "bank-transfer",
    T.transferCategories["bank-transfer"],
    "swap_horiz",
    "transfers",
    2,
  ],
  [
    "save-transfer",
    T.transferCategories["save-transfer"],
    "move_down",
    "transfers",
    2,
  ],
  [
    "cash-transfer",
    T.transferCategories["cash-transfer"],
    "atm",
    "transfers",
    2,
  ],
];
for (const [key, name, icon, parent, type = 0] of specs) {
  assert(categories.has(parent), `Missing reference-format parent: ${parent}`);
  category(key, name, icon, parent, type);
}
const services = [
  ["Spotify Premium", 39.9, "headphones", 2],
  ["Netflix Standard", 54.9, "live_tv", 4],
  ["YouTube Premium", 31.9, "smart_display", 6],
  ["Disney+", 44.9, "castle", 8],
  ["Apple Music", 21.9, "music_note", 10],
  ["iCloud+", 11.9, "cloud", 12],
  ["Google One", 19.9, "cloud_done", 14],
  ["Dropbox Plus", 45, "folder", 16],
  ["Notion Plus", 38, "note_alt", 18],
  ["Todoist Pro", 18, "checklist", 20],
  ["Adobe Photography", 74, "photo_camera", 22],
  ["Canva Pro", 49, "palette", 24],
  ["GitHub Pro", 15, "code", 26],
  ["ChatGPT Plus", 76, "smart_toy", 28],
  ["Duolingo Super", 34, "translate", 3],
  ["Headspace", 29, "self_improvement", 5],
  ["Strava", 32, "directions_run", 7],
  ["Gym membership", 199, "exercise", 9],
  ["Mobile data plan", 59, "signal_cellular_alt", 11],
  ["Home internet", 119, "wifi", 13],
];
services.forEach(([name, , icon], i) =>
  category(
    `subscription-${i}`,
    subscriptionCategoryLabel(name),
    icon,
    "digital",
  ),
);
category(
  "business-sales",
  T.bizTravelCategories.businessSales,
  "request_quote",
  null,
  1,
  business,
);
category(
  "business-costs",
  T.bizTravelCategories.businessCosts,
  "point_of_sale",
  null,
  0,
  business,
);
category(
  "travel-expense",
  T.bizTravelCategories.travelExpense,
  "explore",
  null,
  0,
  travel,
);
category(
  "travel-income",
  T.bizTravelCategories.travelIncome,
  "payments",
  null,
  1,
  travel,
);

const accounts = new Map();
const opening = {};
function account(key, name, kind, balance, icon, owner = main, changes = {}) {
  const id = uuid("account-" + key),
    currency = "ILS";
  const savings = {
    ...createDefaultSavingsDetails(),
    isDetailed: true,
    providerName: T.savingsProviderName,
    contributedPrincipal: "15000",
    expectedAnnualReturnRate: "4.25",
    startDate: "2026-04-01",
    annualManagementFeeRate: "0.3",
    estimatedTaxRate: "25",
    taxJurisdiction: "IL",
    notes: "",
  };
  document = addAccountToDocument(
    document,
    {
      name,
      accountType: kind,
      amount: String(balance),
      accountNumber: kind === "bank" ? "TEST-" + key.toUpperCase() : "",
      currencyCode: currency,
      ...visual(icon),
      isDefault: key === "bank-a" || owner !== main,
      isExcluded: false,
      cardLastFour: "",
      cardCompany: "Visa",
      paymentDay: 10,
      bankName: kind === "bank" ? name : "",
      linkedBankAccountId: null,
      savingsDetails:
        kind === "savings" ? savings : createDefaultSavingsDetails(),
      ...changes,
    },
    owner,
    id,
    START,
  );
  accounts.set(key, id);
  opening[id] = balance;
}
account("bank-a", T.accounts.bankA, "bank", 45000, "account_balance_wallet");
account("bank-b", T.accounts.bankB, "bank", 16000, "assured_workload");
account("card-a1", T.accounts.cardA1, "card", 0, "credit_card", main, {
  linkedBankAccountId: accounts.get("bank-a"),
  cardLastFour: "1111",
  cardCompany: "Visa",
  paymentDay: 5,
});
account("card-a2", T.accounts.cardA2, "card", 0, "credit_score", main, {
  linkedBankAccountId: accounts.get("bank-a"),
  cardLastFour: "2222",
  cardCompany: "Mastercard",
  paymentDay: 10,
});
account("card-b1", T.accounts.cardB1, "card", 0, "add_card", main, {
  linkedBankAccountId: accounts.get("bank-b"),
  cardLastFour: "3333",
  cardCompany: "American Express",
  paymentDay: 20,
});
account("card-b2", T.accounts.cardB2, "card", 0, "contactless", main, {
  linkedBankAccountId: accounts.get("bank-b"),
  cardLastFour: "4444",
  cardCompany: "Isracard",
  paymentDay: 31,
});
account("savings", T.accounts.savings, "savings", 18000, "lock");
account("cash", T.accounts.cash, "cash", 700, "money");
account(
  "business-cash",
  T.accounts.businessCash,
  "cash",
  1000,
  "attach_money",
  business,
);
account("travel-cash", T.accounts.travelCash, "cash", 1200, "euro", travel, {
  isExcluded: true,
});

for (const [collection, names, icon] of [
  ["labels", T.labels, "label"],
  ["places", T.places, "location_on"],
  ["peoples", T.peoples, "group"],
])
  document[collection] = names.map((name, i) => ({
    uuid: uuid(`${collection}-${i}`),
    name,
    user: main,
    description: "",
    ...visual(icon),
    createdAt: START,
    updatedAt: START,
    transactions: [],
  }));

const budgets = new Map();
function budget(key, name, amount, icon, keys, changes = {}) {
  const id = uuid("budget-" + key);
  document = saveBudget(
    document,
    {
      ...budgetDefaults(),
      name,
      amount: String(amount),
      currencyCode: "ILS",
      categories: keys.map((k) => categories.get(k)),
      includeSubcategories: true,
      cycleDay: "1",
      showOnHome: true,
      notes: "",
      ...visual(icon),
      ...changes,
    },
    id,
    START,
  );
  budgets.set(key, id);
}
budget("groceries", T.budgets.groceries, 2600, "grocery", ["groceries"]);
budget("dining", T.budgets.dining, 180, "ramen_dining", ["food"]);
budget("digital", T.budgets.digital, 1500, "subscriptions", ["digital"]);
budget("transport", T.budgets.transport, 1800, "commute", ["travel", "car"], {
  accounts: [accounts.get("card-a1"), accounts.get("card-b1")],
  rolling: true,
});
budget("health", T.budgets.health, 1600, "health_metrics", ["health", "pets"], {
  showOnHome: false,
});
budget("learning", T.budgets.learning, 850, "auto_stories", ["education"], {
  budgetMode: "Manual",
});
budget("overall", T.budgets.overall, 180000, "donut_large", [], {
  budgetType: "Overall",
  period: "Yearly",
  accounts: [...accounts]
    .filter(([k]) => !k.endsWith("-cash"))
    .map(([, v]) => v),
});
budget(
  "income",
  T.budgets.income,
  22000,
  "trending_up",
  ["salary", "freelance", "refunds"],
  { transactionType: 1 },
);
budget("weekly", T.budgets.weekly, 420, "event", ["entertainment"], {
  period: "Weekly",
  showOnHome: false,
});
budget("daily", T.budgets.daily, 25, "coffee_maker", ["coffee"], {
  period: "Daily",
  showOnHome: false,
});
budget("past-trip", T.budgets["past-trip"], 4200, "beach_access", ["travel"], {
  period: "Custom",
  startDate: "2026-07-01",
  endDate: "2026-07-31",
  showOnHome: false,
});
budget("future-trip", T.budgets["future-trip"], 8000, "forest", ["travel"], {
  period: "Custom",
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  showOnHome: false,
});
budget(
  "saving-transfers",
  T.budgets["saving-transfers"],
  1800,
  "account_tree",
  ["save-transfer"],
  { transactionType: 2, accounts: [accounts.get("bank-a")], showOnHome: false },
);
budget(
  "cycle-31",
  T.budgets["cycle-31"],
  950,
  "calendar_month",
  ["utilities"],
  { cycleDay: "31", rolling: true, showOnHome: false },
);

// Imported supplementary collections are preserved for backup/relationship tests.
for (const [collection, names, icon] of [
  ["assets", T.assets, "inventory_2"],
  ["goals", T.goals, "flag"],
  ["loans", T.loans, "real_estate_agent"],
  ["achievements", T.achievements, "trophy"],
])
  document[collection] = names.map((name, i) => ({
    uuid: uuid(`${collection}-${i}`),
    name,
    user: main,
    amount: (i + 1) * 1500,
    targetAmount: (i + 1) * 6000,
    currencyCode: "ILS",
    account: accounts.get("bank-a"),
    description: "",
    ...visual(icon),
    createdAt: START,
    updatedAt: AS_OF,
    transactions: [],
  }));
document.billSplitters = [
  {
    uuid: uuid("split-dinner"),
    name: T.billSplitterName,
    amount: 240,
    currencyCode: "ILS",
    user: main,
    participants: [
      uuid("split-person-0"),
      uuid("split-person-1"),
      uuid("split-person-2"),
    ],
    transactions: [],
    createdAt: START,
    updatedAt: AS_OF,
  },
];
document.billParticipants = document.peoples.slice(0, 3).map((p, i) => ({
  uuid: uuid(`split-person-${i}`),
  name: p.name,
  person: p.uuid,
  billSplitter: uuid("split-dinner"),
  amount: 80,
  paid: i === 0,
  user: main,
  createdAt: START,
  updatedAt: AS_OF,
}));

const events = [];
const expenseLeaves = specs.filter((s) => (s[4] ?? 0) === 0).map((s) => s[0]);
const incomeLeaves = specs.filter((s) => s[4] === 1).map((s) => s[0]);
const mainSpendingAccounts = [
  "card-a1",
  "card-a2",
  "card-b1",
  "card-b2",
  "bank-a",
  "bank-b",
  "cash",
];
function draftEvent(key, month, day, changes, owner = main) {
  const when = stamp(month, day, changes.hour ?? 8, changes.minute ?? 0);
  events.push({
    key,
    when,
    owner,
    draft: {
      ...createTransactionDraft(changes.type ?? 0),
      currencyCode: "ILS",
      accountCurrencyCode: "ILS",
      occurredAt: when,
      ...changes,
    },
  });
}
function budgetFor(categoryKey) {
  const parent = specs.find((s) => s[0] === categoryKey)?.[3];
  return (
    budgets.get(
      {
        groceries: "groceries",
        food: "dining",
        education: "learning",
        health: "health",
        pets: "health",
        travel: "transport",
        car: "transport",
      }[parent] ?? "",
    ) ?? ""
  );
}
MONTHS.forEach((month, m) => {
  const maxDay = m === 5 ? 16 : new Date(2026, m + 4, 0).getDate();
  for (let i = 0; i < 200; i++) {
    const income = i % 10 === 0,
      key = (income ? incomeLeaves : expenseLeaves)[
        Math.floor(i / (income ? 10 : 1)) %
          (income ? incomeLeaves : expenseLeaves).length
      ];
    const cat = document.categories.find((c) => c.uuid === categories.get(key));
    const day = 1 + ((i * 7 + m * 3) % maxDay);
    const accountKey = income
      ? i % 20 === 0
        ? "bank-a"
        : "bank-b"
      : mainSpendingAccounts[(i + m) % mainSpendingAccounts.length];
    const amount =
      key === "salary-base"
        ? 15500 + m * 125
        : key === "monthly-rent"
          ? 4300
          : income
            ? Number((250 + ((i * 29 + m * 101) % 2300) + 0.5).toFixed(2))
            : Number(
                (8 + ((i * 17 + m * 13) % 240) + (i % 100) / 100).toFixed(2),
              );
    const hour = 7 + (i % 3),
      minute = i % 60;
    const when = stamp(month, day, hour, minute);
    const variants = T.leaf[key] ?? [cat.name];
    draftEvent(`regular-${month}-${i}`, month, day, {
      type: income ? 1 : 0,
      name: variants[i % variants.length],
      amount: String(amount),
      accountId: accounts.get(accountKey),
      categoryId: cat.uuid,
      budgetId: income ? budgets.get("income") : budgetFor(key),
      labelId: document.labels[i % document.labels.length].uuid,
      placeId: document.places[(i + m) % document.places.length].uuid,
      personId: document.peoples[i % document.peoples.length].uuid,
      loanId: i % 91 === 0 ? document.loans[0].uuid : "",
      hour,
      minute,
      description: "",
      ...fxMix(i, when),
    });
  }
  for (const [index, name, source, target, value, key] of [
    [0, T.transferNames[0], "bank-a", "bank-b", 3500, "bank-transfer"],
    [1, T.transferNames[1], "bank-a", "savings", 1500, "save-transfer"],
    [2, T.transferNames[2], "bank-b", "cash", 6000, "cash-transfer"],
  ])
    draftEvent(
      `transfer-${month}-${index}`,
      month,
      Math.min(3 + index * 5, maxDay),
      {
        type: 2,
        name,
        amount: String(value),
        accountId: accounts.get(source),
        destinationAccountId: accounts.get(target),
        categoryId: categories.get(key),
        budgetId:
          key === "save-transfer" ? budgets.get("saving-transfers") : "",
        description: "",
      },
    );
  for (let i = 0; i < 12; i++) {
    const owner = i < 6 ? business : travel,
      income = i % 3 === 0;
    const categoryKey =
      owner === business
        ? income
          ? "business-sales"
          : "business-costs"
        : income
          ? "travel-income"
          : "travel-expense";
    const cat = document.categories.find(
      (c) => c.uuid === categories.get(categoryKey),
    );
    const day = 1 + ((i * 2) % maxDay);
    const when = stamp(month, day, 8, 0);
    draftEvent(
      `aux-${month}-${i}`,
      month,
      day,
      {
        type: income ? 1 : 0,
        name: cat.name,
        amount: String(income ? 850 + i * 10 : 15 + i * 7.45),
        accountId: accounts.get(
          owner === business ? "business-cash" : "travel-cash",
        ),
        categoryId: cat.uuid,
        description: "",
        ...fxMix(i, when),
      },
      owner,
    );
  }
  draftEvent(`fx-${month}`, month, Math.min(15, maxDay), {
    name: T.fxTransactionName,
    amount: "49.99",
    currencyCode: "USD",
    accountCurrencyCode: "ILS",
    exchangeRate: FX.USD,
    exchangeRateDate: `${month}-01`,
    exchangeRateFetchedAt: stamp(month, 1),
    exchangeRateSource: T.exchangeRateSource,
    accountId: accounts.get("bank-a"),
    categoryId: categories.get("electronics"),
    description: "",
  });
  draftEvent(`tiny-${month}`, month, Math.min(16, maxDay), {
    name: T.tinyTransactionName,
    amount: "0.01",
    accountId: accounts.get("cash"),
    categoryId: categories.get("misc"),
    labelId: document.labels.at(-1).uuid,
    description: "",
  });
});

services.forEach(([name, amount, icon, day], i) => {
  const id = uuid("recurring-subscription-" + i),
    startAt = stamp("2026-04", day);
  document = saveRecurring(
    document,
    {
      ...recurringDefaults(new Date(startAt)),
      name: subscriptionName(name),
      amount: String(amount),
      currencyCode: recCurrencyFor(i),
      startAt,
      account: accounts.get(mainSpendingAccounts[i % 4]),
      category: categories.get(`subscription-${i}`),
      budget: budgets.get("digital"),
      label: document.labels[6].uuid,
      description: "",
      ...visual(icon),
      automatic: i % 2 === 0,
      reminderDays: [null, 0, 1, 2, 7][i % 5],
    },
    id,
    main,
    START,
  );
  const record = document.recurrings.at(-1);
  for (let index = 0; index < 6; index++) {
    const due = occurrenceDate(record, index);
    if (due <= new Date(AS_OF))
      events.push({
        when: due.toISOString(),
        recurringId: id,
        key: `subscription-${i}-${index}`,
      });
  }
});
// Additional frequencies, skipped history, archived history, and a pending manual payment.
for (const [idx, [key, period, icon, type, categoryKey, amount]] of [
  ["weekly", "Weekly", "sports_gymnastics", 0, "fitness", 45],
  ["fortnightly", "Fortnightly", "edit_document", 1, "consulting", 1250],
  ["quarterly", "Quarterly", "verified_user", 0, "home-insurance", 420],
  ["half-year", "Biannually", "school", 0, "courses", 600],
  ["yearly", "Yearly", "language", 0, "subscription-12", 85],
  ["daily", "Daily", "tram", 0, "bus", 8],
].entries()) {
  const id = uuid("recurring-" + key),
    startAt = stamp("2026-04", 1);
  document = saveRecurring(
    document,
    {
      ...recurringDefaults(new Date(startAt)),
      name: T.otherRecurring[key],
      period,
      type,
      amount: String(amount),
      currencyCode: recCurrencyFor(idx + 20),
      startAt,
      account: accounts.get("bank-a"),
      category: categories.get(categoryKey),
      ...visual(icon),
      automatic: false,
      description: "",
    },
    id,
    main,
    START,
  );
  const record = document.recurrings.at(-1);
  for (let index = 0; index < 200; index++) {
    const due = occurrenceDate(record, index);
    if (due > new Date(AS_OF)) break;
    events.push({
      key: `frequency-${key}-${index}`,
      when: due.toISOString(),
      recurringId: id,
      skip:
        (key === "weekly" && index % 7 === 3) ||
        (key === "daily" && index % 11 === 7),
    });
  }
}
const archivedId = uuid("recurring-archived"),
  archivedStart = stamp("2026-04", 7);
document = saveRecurring(
  document,
  {
    ...recurringDefaults(new Date(archivedStart)),
    name: T.archivedRecurringName,
    amount: "29",
    currencyCode: recCurrencyFor(26),
    startAt: archivedStart,
    endAt: stamp("2026-08", 7),
    account: accounts.get("card-a2"),
    category: categories.get("books"),
    ...visual("newspaper"),
    description: "",
  },
  archivedId,
  main,
  START,
);
for (let i = 0; i < 5; i++)
  events.push({
    key: `archived-${i}`,
    when: occurrenceDate(document.recurrings.at(-1), i).toISOString(),
    recurringId: archivedId,
  });
const pendingId = uuid("recurring-pending");
document = saveRecurring(
  document,
  {
    ...recurringDefaults(new Date(stamp("2026-09", 12))),
    name: T.pendingRecurringName,
    amount: "75",
    currencyCode: recCurrencyFor(27),
    startAt: stamp("2026-09", 12),
    account: accounts.get("bank-a"),
    category: categories.get("charity"),
    ...visual("heart_plus"),
    description: "",
  },
  pendingId,
  main,
  START,
);

events.sort(
  (a, b) => a.when.localeCompare(b.when) || a.key.localeCompare(b.key),
);
let cursor = 0;
for (
  let day = new Date(2026, 3, 1, 12);
  day <= new Date(AS_OF);
  day.setDate(day.getDate() + 1)
) {
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  while (cursor < events.length && new Date(events[cursor].when) <= end) {
    const event = events[cursor++];
    if (event.recurringId) {
      const record = document.recurrings.find(
          (r) => r.uuid === event.recurringId,
        ),
        key = occurrenceKey(record);
      if (event.skip)
        document = completeOccurrence(
          document,
          record,
          "skipped",
          event.when,
          null,
        );
      else {
        const recCurrency = String(record.currencyCode ?? "ILS");
        const needsFx = recCurrency !== "ILS";
        const rate = needsFx ? FX[recCurrency] : null;
        document = saveTransaction(
          document,
          {
            ...createTransactionDraft(record.type),
            name: record.name,
            amount: String(record.amount),
            currencyCode: recCurrency,
            accountCurrencyCode: "ILS",
            ...(needsFx
              ? {
                  exchangeRate: rate,
                  exchangeRateDate: event.when.slice(0, 10),
                  exchangeRateFetchedAt: event.when,
                  exchangeRateSource: T.exchangeRateSource,
                }
              : {}),
            accountId: record.account,
            categoryId: record.category,
            budgetId: record.budget,
            labelId: record.label,
            description: record.description,
            occurredAt: event.when,
          },
          key,
          main,
          event.when,
        );
        Object.assign(document.transactions.at(-1), {
          recurring: record.uuid,
          recurringOccurrenceKey: key,
          scheduledAt: event.when,
          processedAt: event.when,
          originalAmount: record.amount,
          originalCurrencyCode: recCurrency,
          originalExchangeRate: needsFx ? rate : 1,
          originalExchangeRateDate: needsFx ? event.when.slice(0, 10) : null,
          originalExchangeRateFetchedAt: needsFx ? event.when : null,
          originalExchangeRateSource: needsFx ? T.exchangeRateSource : null,
        });
        document = completeOccurrence(
          document,
          record,
          "processed",
          event.when,
          key,
        );
      }
    } else
      document = saveTransaction(
        document,
        event.draft,
        uuid("transaction-" + event.key),
        event.owner,
        event.when,
      );
  }
  document = settleDueCardPayments(document, day);
}
assert.equal(cursor, events.length, "All historical events must be simulated");
document.recurrings.find((r) => r.uuid === archivedId).archived = true;
// Export includes searchable metadata and linked references without fictitious media URIs.
for (const tx of document.transactions) {
  const c = document.categories.find((c) => c.uuid === tx.category);
  if (c)
    Object.assign(tx, { icon: c.icon, iconPath: c.iconPath, color: c.color });
}
for (const collection of ["labels", "places", "peoples", "loans", "budgets"]) {
  const key = {
    labels: "label",
    places: "place",
    peoples: "person",
    loans: "loan",
    budgets: "budget",
  }[collection];
  for (const record of document[collection])
    record.transactions = document.transactions
      .filter((t) => t[key] === record.uuid)
      .map((t) => t.uuid);
}
for (let i = 0; i < 12; i++) {
  const sample = document.transactions.find(
    (t) => t.type === i % 3 && t.user === main && !t.cardPaymentPeriod,
  );
  const draft = transactionDraftFromRecord(document, sample.uuid);
  document = saveTransactionTemplate(
    document,
    draft,
    uuid("template-" + i),
    main,
    AS_OF,
  );
  Object.assign(document.templates.at(-1), {
    ...visual(
      [
        "receipt",
        "description",
        "swap_vert",
        "star",
        "bookmark",
        "content_copy",
        "post_add",
        "edit_note",
        "note_add",
        "assignment",
        "history",
        "schedule",
      ][i],
    ),
  });
}
const usdValues = {
  ILS: 3.7,
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 147,
  CAD: 1.36,
  AUD: 1.5,
  CHF: 0.88,
};
for (const base of Object.keys(usdValues)) {
  const payload = Object.fromEntries(
    Object.entries(usdValues).map(([code, value]) => [
      code.toLowerCase(),
      value / usdValues[base],
    ]),
  );
  document = storeExchangeRates(
    document,
    parseExchangeRates(
      { date: AS_OF.slice(0, 10), [base.toLowerCase()]: payload },
      base,
      new Date(AS_OF),
    ),
  );
}

document = normalizeBackupDocument(document);
const monthlyCounts = Object.fromEntries(
  MONTHS.map((m) => [
    m,
    document.transactions.filter(
      (t) => String(t.date ?? t.createdAt).startsWith(m) && t.user === main,
    ).length,
  ]),
);
const baselineBudgets = selectBudgets(document, new Date(AS_OF)).map((b) => ({
  id: b.id,
  name: b.name,
  period: b.period,
  status: b.periodStatus,
  tracked: b.tracked,
  limit: b.limit,
  remaining: b.remaining,
  transactionCount: b.transactions.length,
}));
document._testDataset = {
  name: "Plutus comprehensive on-device test standard",
  version: 1,
  seed: "plutus-device-test-v1",
  language: LANG,
  asOf: AS_OF,
  historyStart: "2026-04-01",
  historyEnd: "2026-09-16",
  completeMonths: MONTHS.slice(0, 5),
  currentMonth: "2026-09",
  referenceFormat: "plutus-2026-09-15T07-07-22-246Z.json",
  synthetic: true,
  description:
    "Five complete months plus current-month activity. All entities are fictional. JSON has no binary attachments. Extra collections test backup preservation; they do not imply implemented UI features. Roughly half of the non-transfer transactions and recurring payments are originally recorded in USD or EUR and converted to the ILS account currency to exercise currency-conversion handling.",
  monthlyTransactionCounts: monthlyCounts,
  collectionCounts: Object.fromEntries(
    Object.entries(document)
      .filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => [k, v.length]),
  ),
  profiles: { main, business, travel },
  openingBalances: opening,
  expectedAccountBalances: Object.fromEntries(
    document.accounts.map((a) => [a.uuid, a.amount]),
  ),
  budgets: baselineBudgets,
  pendingManualRecurringId: pendingId,
  exchangeRates:
    "Synthetic fixed rates for offline test history, not actual financial rates.",
  knownLimitations: [
    "Receipt/photo/file round trips require adding actual media on device and exporting ZIP; JSON intentionally strips media.",
    "Dates and current-period baselines are fixed at the as-of timestamp; automatic schedules can create new payments after that date.",
    "Supplementary assets/goals/loans/bill-split/achievement collections exercise relationship and backup preservation where their screens are not implemented.",
  ],
};
document = createJsonBackupDocument(document);
document._local.exportedAt = AS_OF;

// Validate the same JSON parser used by import, references, balances, and domain projections.
const serialized = JSON.stringify(document, null, 2) + "\n";
const imported = parseBackupDocument(serialized);
assert.deepEqual(
  imported,
  document,
  "Import normalization must preserve this fixture exactly",
);
for (const [collection, records] of Object.entries(document).filter(([, v]) =>
  Array.isArray(v),
)) {
  assert.equal(
    new Set(records.map(identity)).size,
    records.length,
    `Unique ${collection} identities`,
  );
}
for (const [key, target] of Object.entries({
  user: "users",
  account: "accounts",
  fromAccount: "accounts",
  toAccount: "accounts",
  category: "categories",
  budget: "budgets",
  label: "labels",
  loan: "loans",
  place: "places",
  person: "peoples",
  recurring: "recurrings",
})) {
  const ids = new Set(document[target].map(identity));
  for (const t of document.transactions)
    if (t[key])
      assert(ids.has(String(t[key])), `${key} reference on ${t.uuid}`);
}
for (const c of document.categories)
  if (c.parentId) {
    const parent = document.categories.find((p) => p.uuid === c.parentId);
    assert(parent && parent.type === c.type, "Category parent type");
    assert(
      !categoryFamily(document.categories, c.uuid).has(c.parentId),
      "No category cycles",
    );
  }
for (const t of document.transactions) {
  assert(
    Number.isFinite(t.amount) && t.amount > 0,
    "Positive finite transaction amount",
  );
  assert(
    new Date(t.date) <= new Date(AS_OF),
    "No future historical transactions",
  );
  if (t.category)
    assert.equal(
      document.categories.find((c) => c.uuid === t.category).type,
      t.type,
      "Transaction/category type",
    );
}
for (const a of document.accounts) {
  assert(Number.isFinite(a.amount), "Finite account balance");
  assert.equal(
    new Set(a.transactions).size,
    a.transactions.length,
    "Unique account references",
  );
  assert(
    a.transactions.every((id) =>
      document.transactions.some((t) => t.uuid === id),
    ),
    "Account transaction references",
  );
}
const reconstructed = { ...opening };
for (const t of document.transactions) {
  const amount = t.accountAmount ?? t.amount;
  if (t.cardPaymentPeriod) {
    reconstructed[t.account] += t.uuid.endsWith(":bank") ? -t.amount : t.amount;
  } else if (t.type === 2) {
    reconstructed[t.fromAccount] -= amount;
    reconstructed[t.toAccount] += amount;
  } else reconstructed[t.account] += (t.type === 1 ? 1 : -1) * amount;
  if (t.account)
    assert(
      belongsToProfile(
        document,
        document.accounts.find((a) => a.uuid === t.account),
        t.user,
      ),
      "Account and transaction have the same owner",
    );
}
for (const a of document.accounts)
  assert(
    Math.abs(reconstructed[a.uuid] - a.amount) < 0.000001,
    "Opening balance plus independently reconstructed history matches final balance",
  );
const banks = document.accounts.filter((a) => a.accountType === "bank"),
  cards = document.accounts.filter((a) => a.accountType === "card");
assert.equal(banks.length, 2);
assert.equal(cards.length, 4);
for (const b of banks)
  assert.equal(cards.filter((c) => c.linkedBankAccountId === b.uuid).length, 2);
for (const group of [
  cards.concat(banks),
  document.budgets,
  document.categories,
  document.recurrings,
]) {
  assert.equal(
    new Set(group.map((r) => r.color)).size,
    group.length,
    "Distinct colors per entity group",
  );
  assert.equal(
    new Set(group.map((r) => r.icon)).size,
    group.length,
    "Distinct icons per entity group",
  );
}
for (const count of Object.values(monthlyCounts))
  assert(count >= 200, "At least 200 transactions each month");
for (const r of document.recurrings) {
  const entries = r.occurrences;
  assert.equal(r.nextIndex, entries.length, "Schedule cursor matches history");
  for (const h of entries)
    if (h.status === "processed") {
      const t = document.transactions.find((t) => t.uuid === h.transactionId);
      assert(
        t && t.recurring === r.uuid && t.recurringOccurrenceKey === h.key,
        "Recurring history links to payment",
      );
    }
  if (services.some(([name]) => subscriptionName(name) === r.name))
    for (const month of MONTHS.slice(0, 5)) {
      assert(
        entries.some(
          (h) => h.status === "processed" && h.scheduledAt.startsWith(month),
        ),
        "Every subscription has five full months of payments",
      );
    }
}
assert(
  selectRecurrings(document, new Date(AS_OF)).every(
    (r) => r.archived || r.valid,
  ),
  "All active recurring schedules valid",
);
assert(
  selectRecurringEvents(
    selectRecurrings(document, new Date(AS_OF)),
    new Date(2026, 7, 1),
    new Date(2026, 8, 1),
  ).length > 20,
  "Recurring calendar exposes history",
);
assert(
  baselineBudgets.some((b) => b.remaining < 0) &&
    baselineBudgets.some((b) => b.remaining > 0),
  "Over and under limit budget cases",
);
assert(
  baselineBudgets.some((b) => b.status === "ended") &&
    baselineBudgets.some((b) => b.status === "upcoming"),
  "Past and upcoming budgets",
);
const regular = document.transactions.find(
  (t) =>
    !t.recurring &&
    !t.cardPaymentPeriod &&
    t.type === 0 &&
    t.currencyCode === t.accountCurrencyCode,
);
const edited = saveTransaction(
  document,
  {
    ...transactionDraftFromRecord(document, regular.uuid),
    amount: String(regular.amount + 1),
  },
  regular.uuid,
  main,
  AS_OF,
  true,
);
assert.equal(
  edited.accounts.find((a) => a.uuid === regular.account).amount,
  Math.round(
    (document.accounts.find((a) => a.uuid === regular.account).amount - 1) *
      1e8,
  ) / 1e8,
  "Editing updates account balance",
);
const deleted = deleteTransaction(document, regular.uuid, main, AS_OF);
assert.equal(
  deleted.transactions.length,
  document.transactions.length - 1,
  "Deleting test transaction",
);
assert.deepEqual(
  createJsonBackupDocument(imported)._testDataset,
  document._testDataset,
  "Unknown test metadata survives export",
);
const csv = transactionsToCsv(document.transactions),
  csvResult = transactionsFromCsv(csv);
assert.equal(
  csvResult.length,
  document.transactions.length,
  "Large CSV round trip retains rows",
);
assert.deepEqual(
  csvResult.map((t) => t.uuid),
  document.transactions.map((t) => t.uuid),
  "CSV preserves all transaction identities in order",
);
for (let i = 0; i < csvResult.length; i++) {
  assert.equal(csvResult[i].amount, document.transactions[i].amount);
  assert.equal(
    csvResult[i].description ?? "",
    document.transactions[i].description ?? "",
  );
  assert.equal(
    csvResult[i].recurringOccurrenceKey,
    document.transactions[i].recurringOccurrenceKey,
  );
}
assert(
  !document._local.attachments.length && !document.images.length,
  "JSON is safely media-free",
);
assert.equal(
  settleDueCardPayments(document, new Date(AS_OF)),
  document,
  "Import at the baseline must not settle a card twice",
);
assert(
  document.recurrings
    .filter((r) => r.automatic && !r.archived)
    .every((r) => occurrenceDate(r, r.nextIndex) > new Date(AS_OF)),
  "No accidental automatic catch-up at the baseline",
);

const suffix = LANG === "en" ? "" : `-${LANG}`;
const out = path.join(
  root,
  `test-data/plutus-device-test-2026-09${suffix}.json`,
);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, serialized);
const summary = {
  file: path.relative(root, out),
  bytes: Buffer.byteLength(serialized),
  sha256: crypto.createHash("sha256").update(serialized).digest("hex"),
  ...document._testDataset.collectionCounts,
  monthlyCounts,
  budgetBaselines: baselineBudgets,
};
fs.writeFileSync(
  path.join(root, `test-data/plutus-device-test-2026-09${suffix}-summary.json`),
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(
  JSON.stringify({ ...summary, budgetBaselines: undefined }, null, 2),
);
