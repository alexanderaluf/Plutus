import { inferPeriod, type ChatToolCall } from "./chat-tool-protocol";
import type { ChangeOperation, MutableEntityType } from "./mutations/change-types";
import type { ToolPack } from "./tools/tool-catalog";

export type UserIntent =
  | "financial_overview"
  | "financial_advice"
  | "spending_question"
  | "income_question"
  | "transaction_search"
  | "merchant_question"
  | "account_question"
  | "card_question"
  | "budget_question"
  | "recurring_question"
  | "subscription_question"
  | "savings_question"
  | "goal_question"
  | "loan_question"
  | "asset_question"
  | "net_worth_question"
  | "currency_question"
  | "person_question"
  | "place_question"
  | "label_question"
  | "bill_split_question"
  | "scenario"
  | "affordability"
  | "forecast"
  | "data_quality"
  | "mutation"
  | "general_finance_education"
  | "unknown";

export type ChatLanguage = "en" | "he" | "ru" | "other";

export interface IntentResolution {
  intent: UserIntent;
  /** Other intents that also matched, most specific first. */
  secondary: UserIntent[];
  packs: ToolPack[];
  needsUserData: boolean;
  needsClarification: boolean;
  clarificationReason?: string;
  entityHints: { type: string; text: string }[];
  requestedPeriod?: string;
  language: ChatLanguage;
  mutationIntent: ChangeOperation | null;
  /** Entity the change is about, when the words make it clear. */
  mutationEntity?: MutableEntityType;
  /** Tool calls that must run regardless of the model's plan. */
  mandatoryCalls: ChatToolCall[];
}

export function detectChatLanguage(text: string): ChatLanguage {
  const hebrew = (text.match(/[֐-׿]/g) ?? []).length;
  const cyrillic = (text.match(/[Ѐ-ӿ]/g) ?? []).length;
  const latin = (text.match(/[a-zA-Z]/g) ?? []).length;
  if (hebrew && hebrew >= cyrillic) return "he";
  if (cyrillic) return "ru";
  return latin ? "en" : "other";
}

type IntentRule = { intent: UserIntent; packs: ToolPack[]; pattern: RegExp };

/**
 * One table instead of scattered regular expressions. Order matters: the
 * first matching rule is the primary intent. Hebrew and Russian stems are
 * matched without word boundaries because of prefixes and inflection.
 */
const INTENT_RULES: IntentRule[] = [
  { intent: "affordability", packs: ["scenario", "accounts"], pattern: /(can i afford|afford|enough money (for|to)|safe(ly)? (to )?spend|how much can i (safely )?spend|לעמוד ב|יכול להרשות|אוכל להרשות|כמה אפשר להוציא|позволить себе|могу (ли )?(я )?(себе )?позволить|хватит ли|сколько (я )?могу потратить)/i },
  { intent: "scenario", packs: ["scenario", "transactions"], pattern: /(what if|what happens if|if i (reduce|cut|stop|cancel|increase|lose|drop|add|pay)|scenario|simulate|מה יקרה אם|מה אם|אם אקצץ|אם אפסיק|что (будет|если)|если я (сокращу|урежу|отменю|увелич))/i },
  { intent: "forecast", packs: ["scenario", "recurring"], pattern: /(forecast|projection|project(ed)?|will be left|left after|end of (the )?month|next (few )?months|תחזית|כמה יישאר|יישאר לי|прогноз|сколько останется|останется после)/i },
  { intent: "data_quality", packs: ["core", "transactions"], pattern: /(duplicate|double[- ]?charged|twice|uncategori[sz]ed|unusual|suspicious|strange|anomal|data quality|missing data|כפול|כפולות|חריג|חשוד|לא מסווג|дубл|дважды|необычн|подозрит|без категори)/i },
  { intent: "subscription_question", packs: ["recurring"], pattern: /(subscription|streaming|netflix|spotify|מנוי|מנויים|подписк)/i },
  { intent: "recurring_question", packs: ["recurring", "accounts"], pattern: /(recurring|repeat|upcoming|due (soon|in|next)|bills?\b|payments? due|next \d+ days|fixed costs?|חוזר|קבוע|חיובים צפויים|תשלומים קרובים|регулярн|предстоящ|ближайш\S* платеж|постоянн\S* расход)/i },
  { intent: "card_question", packs: ["accounts"], pattern: /(credit card|card payment|card debt|credit (limit|utili[sz]ation)|visa|mastercard|amex|isracard|כרטיס|אשראי|חיוב כרטיס|кредитн|карт)/i },
  { intent: "savings_question", packs: ["savings"], pattern: /(savings? (account|product|fund)|pension|provident|keren|hishtalmut|401k|ira\b|withdraw|fees? on (my )?savings|management fee|interest (rate )?on (my )?savings|deposit|קופת גמל|קרן השתלמות|פנסיה|חיסכון|פיקדון|דמי ניהול|пенси|накоплен|вклад|депозит|комисси)/i },
  { intent: "goal_question", packs: ["wealth"], pattern: /(goal|target|saving for|save for|יעד|מטרה|לחסוך ל|цел[ьи]|коплю на|накопить на)/i },
  { intent: "loan_question", packs: ["wealth"], pattern: /(loan|debt|mortgage|borrow|lent|owe|repay|הלוואה|הלוואות|חוב|משכנתא|חייב|кредит|долг|ипотек|займ)/i },
  { intent: "asset_question", packs: ["wealth"], pattern: /(assets?\b|property|real estate|car value|gold|crypto|נכס|נדל"?ן|קריפטו|имуществ|актив|недвижим|крипт)/i },
  { intent: "net_worth_question", packs: ["wealth", "accounts"], pattern: /(net worth|worth|wealth|how much (money )?do i have|total (money|balance)|שווי ה?נקי|ההון|כמה כסף יש|чист\S* стоимост|капитал|сколько у меня (всего )?денег)/i },
  { intent: "bill_split_question", packs: ["wealth"], pattern: /(split|shared bill|who owes|חלוקת חשבון|מי חייב|раздел\S* счет|кто должен)/i },
  { intent: "budget_question", packs: ["budgets"], pattern: /(budget|on track|over (the )?limit|overspen|תקציב|бюджет)/i },
  { intent: "currency_question", packs: ["currency"], pattern: /(exchange rate|currency|convert|in (usd|eur|ils|dollars?|euros?|shekels?)|foreign|fx\b|שער|מטבע|להמיר|валют|курс|конверт)/i },
  { intent: "income_question", packs: ["transactions"], pattern: /(income|salary|earn|paycheck|revenue|הכנסה|הכנסות|משכורת|הרווחתי|доход|зарплат|заработ)/i },
  { intent: "person_question", packs: ["metadata", "transactions"], pattern: /(with (my )?[A-Z][a-z]+|to (my )?[A-Z][a-z]+|from (my )?[A-Z][a-z]+|person|people|friend|family|עם [א-ת]+|אנשים|חבר|людьми|человек|друг)/ },
  { intent: "place_question", packs: ["metadata", "transactions"], pattern: /(while in|when in|trip to|in (tel aviv|london|paris|georgia|new york|[A-Z][a-z]+)\b|places?\b|location|בחו"?ל|בטיול|במקום|מקומות|в поездке|в (тель-авиве|грузии|лондоне)|мест)/ },
  { intent: "label_question", packs: ["metadata", "transactions"], pattern: /(label|tag|#\w+|תווית|תגית|метк|тег)/i },
  { intent: "account_question", packs: ["accounts"], pattern: /(account|balance|bank\b|cash\b(?! ?flow)|liquid|runway|how (long|many months)|חשבון|יתרה|בנק|מזומן|сч[её]т|баланс|банк|наличн)/i },
  { intent: "merchant_question", packs: ["transactions"], pattern: /(merchant|store|shop\b|at [A-Z][\w']+|בית עסק|בחנות|в магазине)/ },
  { intent: "transaction_search", packs: ["transactions"], pattern: /(show|list|find|search|which transactions|transactions? (with|from|on|at)|הצג|תראה|חפש|אילו עסקאות|покажи|найди|какие (транзакции|операции))/i },
  { intent: "spending_question", packs: ["transactions", "metadata"], pattern: /(cash ?flow|savings? rate|net (income|savings)|spend|spent|expense|cost|paid|pay|category|categories|how much|most|increase|rise|went up|more than last|compare|הוצא|הוצאות|שילמ|קטגורי|כמה|השווא|עלה|עלו|трат|расход|потратил|заплатил|категор|сколько|сравн|выросл)/i },
];

const ADVICE_RULE =
  /(improve|advice|advise|tips?\b|recommend|suggest|should i|how am i doing|how are my finances|financial (health|situation|status|problems?)|healthy|analy[sz]e (my )?(finances|money|spending)|review my|save more|saving more|where can i save|cut (back|down)|reduce (my )?(spending|expenses)|get out of debt|what('s| is) wrong|biggest (financial )?problems?|fix first|what should i do with|overview|summary of my|לשפר|שיפור|עצה|עצות|טיפ|המלצ|מה כדאי|איך אני עומד|מצב(י)? הכלכלי|מצב כלכלי|בריאות פיננסית|לנתח|ניתוח|לחסוך יותר|לקצץ|להפחית|מה לא בסדר|סיכום|улучш|совет|рекоменд|как у меня дела|финансов\S* (здоров|положен|состоян)|проанализ|сэконом|сократить|что не так|обзор)/i;

const EDUCATION_RULE =
  /^(what (is|are|does)|explain|define|how does|why do people|מה זה|מהו|מהי|תסביר|что такое|объясни)\b(?!.*\b(my|i|me)\b)(?!.*(שלי|לי|мой|моя|мои|мне|у меня))/i;

const GREETING = /^(hi|hello|hey|thanks|thank you|good (morning|evening)|שלום|היי|תודה|привет|спасибо|здравствуй)[\s!.,]*$/i;

const MUTATION_RULES: { operation: ChangeOperation; pattern: RegExp }[] = [
  {
    operation: "delete",
    pattern: /^(?:please |can you |could you |i want to |i'd like to |i need to )?(delete|remove|erase)\b|(^|\s)(תמחק|מחק|תמחקי|להסיר|תסיר|הסר|למחוק)(\s|$)|(удали|удалить|сотри|убери)/i,
  },
  {
    operation: "archive",
    pattern: /^(?:please |can you |could you |i want to )?(archive|pause|deactivate)\b|(תעביר לארכיון|העבר לארכיון|ארכב|להשהות)|(архивируй|в архив|приостанови)/i,
  },
  {
    operation: "update",
    pattern: /^(?:please |can you |could you |i want to |i'd like to |i need to )?(change|edit|update|modify|rename|fix|correct|set(?! up)|recategori[sz]e|increase|decrease|raise|lower)\b|(^|\s)(תשנה|שנה|שני|לשנות|תעדכן|עדכן|לעדכן|תתקן|תקן|להעלות את|להוריד את|תעלה את|תוריד את)(\s|$)|(измени|изменить|поменяй|поменять|исправь|обнови|переименуй|увеличь|уменьши)/i,
  },
  {
    operation: "create",
    pattern: /^(?:please |can you |could you |i want to |i'd like to |i need to |let's |lets )?(add|create|record|log|make|set up|open|start|track|new|move|transfer)\b|^(i )?(spent|paid|bought|got paid|received)\b|(^|\s)(תוסיף|הוסף|הוסיפי|להוסיף|תיצור|צור|ליצור|תרשום|רשום|לרשום|תפתח|פתח|תגדיר|הגדר)(\s|$)|^(הוצאתי|שילמתי|קניתי|קיבלתי)|(добавь|добавить|создай|создать|запиши|записать|заведи|открой)|^(я )?(потратил|заплатил|купил|получил)/i,
  },
];

const ENTITY_RULES: { entity: MutableEntityType; pattern: RegExp }[] = [
  { entity: "budget", pattern: /(budget|תקציב|бюджет)/i },
  { entity: "recurring", pattern: /(recurring|subscription|monthly (bill|payment|charge)|repeating|standing order|מנוי|הוראת קבע|חיוב חודשי|תשלום חוזר|подписк|регулярн\S* платеж|ежемесячн\S* платеж)/i },
  { entity: "category", pattern: /(categor|קטגורי|категори)/i },
  { entity: "account", pattern: /(\baccount\b|bank account|wallet|credit card account|חשבון|ארנק|сч[её]т|кошел)/i },
  { entity: "goal", pattern: /(goal|יעד|מטרה|цел[ьи])/i },
  { entity: "loan", pattern: /(loan|debt|הלוואה|חוב|кредит|долг|займ)/i },
  { entity: "asset", pattern: /(asset|נכס|актив|имуществ)/i },
  { entity: "template", pattern: /(template|תבנית|шаблон)/i },
  { entity: "label", pattern: /(label|tag|תווית|תגית|метк|тег)/i },
  { entity: "place", pattern: /(\bplace\b|location|מקום|место)/i },
  { entity: "person", pattern: /(contact|person|payee|איש קשר|контакт)/i },
  { entity: "bill_splitter", pattern: /(split (the )?bill|shared bill|חלוקת חשבון|раздел\S* счет)/i },
];

function detectMutation(text: string) {
  for (const rule of MUTATION_RULES) if (rule.pattern.test(text)) return rule.operation;
  return null;
}

function detectEntity(text: string): MutableEntityType {
  for (const rule of ENTITY_RULES) if (rule.pattern.test(text)) return rule.entity;
  return "transaction";
}

function hints(question: string) {
  const result: { type: string; text: string }[] = [];
  for (const match of question.matchAll(/["“”'«»]([^"“”'«»]{2,60})["“”'«»]/g))
    result.push({ type: "quoted", text: match[1] });
  for (const match of question.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k\b|thousand|אלף|тыс)?/gi)) {
    const base = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    result.push({ type: "amount", text: String(match[2] ? base * 1000 : base) });
  }
  const currency = question.match(/\b(ILS|NIS|USD|EUR|GBP|RUB|JPY|CHF)\b|₪|\$|€|£|шекел|שקל|доллар|דולר|евро|יורו/i);
  if (currency) {
    const code = currency[0].toUpperCase();
    const map: Record<string, string> = { NIS: "ILS", "₪": "ILS", $: "USD", "€": "EUR", "£": "GBP", ШЕКЕЛ: "ILS", "שקל": "ILS", ДОЛЛАР: "USD", "דולר": "USD", ЕВРО: "EUR", "יורו": "EUR" };
    result.push({ type: "currency", text: map[code] ?? code });
  }
  return result;
}

function firstAmount(entityHints: { type: string; text: string }[]) {
  const amounts = entityHints
    .filter((hint) => hint.type === "amount")
    .map((hint) => Number(hint.text))
    // Years and day numbers are not prices.
    .filter((value) => value > 31 && !(value >= 1990 && value <= 2100 && Number.isInteger(value)));
  return amounts[0];
}

/**
 * Deterministic calls that must accompany an intent. Broad advice always
 * reads the full evidence bundle; the model cannot skip it.
 */
function mandatory(intent: UserIntent, question: string, entityHints: IntentResolution["entityHints"], period?: string): ChatToolCall[] {
  const amount = firstAmount(entityHints);
  const currency = entityHints.find((hint) => hint.type === "currency")?.text;
  const withPeriod = period ? { period } : {};
  switch (intent) {
    case "financial_advice":
    case "financial_overview":
      return [{ name: "financial_advice_context", args: {} }];
    case "affordability":
      return amount
        ? [{ name: "affordability_check", args: { amount, ...(currency ? { currency } : {}), recurring: /(per month|monthly|a month|לחודש|в месяц)/i.test(question) } }]
        : [{ name: "liquidity_analysis", args: { days: 30 } }, { name: "upcoming_obligations", args: { days: 30 } }];
    case "forecast":
      return /(bill|after|left|יישאר|останется)/i.test(question)
        ? [{ name: "upcoming_obligations", args: { days: 30 } }, { name: "liquidity_analysis", args: { days: 30 } }]
        : [{ name: "cash_flow_forecast", args: {} }];
    case "data_quality":
      return /(duplicate|double|twice|כפול|дубл|дважды)/i.test(question)
        ? [{ name: "duplicate_transaction_candidates", args: withPeriod }]
        : /(unusual|suspicious|strange|anomal|חריג|חשוד|необычн|подозрит)/i.test(question)
          ? [{ name: "unusual_transactions", args: withPeriod }]
          : [{ name: "data_quality_audit", args: {} }];
    case "subscription_question":
      return [{ name: "subscription_analysis", args: {} }];
    case "card_question":
      return [{ name: "credit_position", args: {} }];
    case "savings_question":
      return [{ name: "savings_accounts", args: {} }];
    case "goal_question":
      return [{ name: "goals", args: {} }];
    case "loan_question":
      return [{ name: "loans", args: {} }];
    case "asset_question":
      return [{ name: "assets", args: {} }];
    case "bill_split_question":
      return [{ name: "bill_split_status", args: {} }];
    default:
      return [];
  }
}

export function resolveIntent(question: string): IntentResolution {
  const text = question.trim();
  const language = detectChatLanguage(text);
  const requestedPeriod = inferPeriod(text);
  const entityHints = hints(text);
  const mutationIntent = detectMutation(text);
  const matched = INTENT_RULES.filter((rule) => rule.pattern.test(text));
  const base = {
    language,
    requestedPeriod,
    entityHints,
    needsClarification: false,
    mutationIntent,
  };
  if (mutationIntent) {
    const mutationEntity = detectEntity(text);
    const packs: ToolPack[] = ["mutation"];
    return {
      ...base,
      intent: "mutation",
      secondary: matched.map((rule) => rule.intent),
      packs,
      needsUserData: true,
      mutationEntity,
      mandatoryCalls: [],
    };
  }
  if (GREETING.test(text) || (EDUCATION_RULE.test(text) && !ADVICE_RULE.test(text)))
    return {
      ...base,
      intent: "general_finance_education",
      secondary: [],
      packs: [],
      needsUserData: false,
      mandatoryCalls: [],
    };
  // "How am I doing with my budget?" is a budget question, not a full review.
  const genericStatus = /(how am i doing|איך אני עומד|как у меня дела)/i;
  const adviceOnlyByStatus =
    genericStatus.test(text) && !ADVICE_RULE.test(text.replace(genericStatus, " "));
  if (ADVICE_RULE.test(text) && !(adviceOnlyByStatus && matched.length)) {
    const intent: UserIntent = /(how am i doing|overview|summary|status|איך אני עומד|סיכום|как у меня дела|обзор)/i.test(text)
      ? "financial_overview"
      : "financial_advice";
    return {
      ...base,
      intent,
      secondary: matched.map((rule) => rule.intent),
      packs: ["core"],
      needsUserData: true,
      mandatoryCalls: mandatory(intent, text, entityHints, requestedPeriod),
    };
  }
  if (!matched.length)
    return {
      ...base,
      intent: "unknown",
      secondary: [],
      packs: ["core", "transactions"],
      needsUserData: true,
      mandatoryCalls: [],
    };
  const [primary, ...rest] = matched;
  const packs: ToolPack[] = [];
  for (const rule of matched) for (const pack of rule.packs) if (!packs.includes(pack) && packs.length < 3) packs.push(pack);
  const needsClarification = primary.intent === "affordability" && firstAmount(entityHints) === undefined && !/(safe(ly)?|how much can i)/i.test(text);
  return {
    ...base,
    intent: primary.intent,
    secondary: rest.map((rule) => rule.intent),
    packs,
    needsUserData: true,
    needsClarification,
    ...(needsClarification ? { clarificationReason: "purchase amount" } : {}),
    mandatoryCalls: mandatory(primary.intent, text, entityHints, requestedPeriod),
  };
}
