export const onboardingEn = {
  welcome: "Set up Plutus",
  welcomeDescription:
    "Start fresh, restore a local backup, or explore with sample data. Base categories are included with every option.",
  restore: "Restore local backup",
  demo: "Try demo mode",
  fresh: "Start fresh",
  demoDescription:
    "Explore three accounts, three months of transactions and two budgets. Sample data is saved only when you finish setup.",
  language: "Choose your language",
  languageDescription: "Select the language you prefer to use in Plutus.",
  control: "Your data, your control",
  controlDescription:
    "Your records stay on this device. Create regular local backups so you can restore them if your device is lost or replaced.",
  backupConsent:
    "I am responsible for making regular backups of my financial data.",
  responsibilityConsent:
    "I understand that backup and recovery are my responsibility, and the developers cannot recover data lost from my device.",
  agree: "I agree",
  name: "What should we call you?",
  nameDescription:
    "Give your local profile a name. You can add more profiles later.",
  namePlaceholder: "Enter your name",
  currency: "Choose your main currency",
  currencyDescription:
    "This is the default currency for your profile and new financial records.",
  selectCurrency: "Select currency",
  date: "Choose your date format",
  dateDescription:
    "Choose how numeric dates appear. For example, September 14, 2026:",
  month: "When does your month start?",
  monthDescription:
    "Match your financial month to payday. If you choose the 10th, a period runs from the 10th through the 9th of the next month. Days 29–31 use the last day in shorter months. New monthly budgets will use this start day.",
  week: "When does your week start?",
  weekDescription:
    "Choose the first day for calendar features. Sunday is common in Israel. Your recurring-payment calendar will follow this choice.",
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  continue: "Continue",
  finish: "Get started",
  saving: "Setting up your profile",
  progress: "Step {{current}} of {{total}}",
  back: "Back",
  failed: "Setup could not be completed",
  retry: "Please try again. Your existing data has been kept.",
  fullBackupOnly:
    "Choose a ZIP or JSON backup to restore your profile. CSV contains transactions only and can be imported from Settings after setup.",
  missingProfile:
    "This backup has no usable user profile. The current data has been kept. Restore a complete backup containing a user.",
  demoBadge: "Demo data",
  demoExit: "Start fresh",
  demoExitTitle: "Leave demo mode?",
  demoExitDescription:
    "This removes all demo data, including any edits made in demo mode, and returns to setup. Export a backup from Settings first if you want to keep it.",
};

export const onboardingHe: Record<keyof typeof onboardingEn, string> = {
  welcome: "בואו נגדיר את Plutus",
  welcomeDescription:
    "אפשר להתחיל מאפס, לשחזר גיבוי ששמור במכשיר או פשוט להתנסות עם נתוני דוגמה. בכל אפשרות תקבלו את קטגוריות הבסיס.",
  restore: "שחזור מגיבוי מקומי",
  demo: "לנסות מצב הדגמה",
  fresh: "להתחיל מאפס",
  demoDescription:
    "תוכלו להתנסות באפליקציה עם 3 חשבונות, עסקאות של 3 חודשים ו־2 תקציבים. נתוני הדוגמה יישמרו רק אחרי שתסיימו את ההגדרה.",
  language: "באיזו שפה נוח לכם?",
  languageDescription: "בחרו את השפה שבה תרצו להשתמש ב־Plutus.",
  control: "המידע שלכם נשאר אצלכם",
  controlDescription:
    "כל הנתונים נשמרים במכשיר הזה. כדאי ליצור גיבוי מקומי באופן קבוע, כדי שתוכלו לשחזר אותם אם המכשיר הולך לאיבוד או מוחלף.",
  backupConsent:
    "ברור לי שאני אחראי/ת ליצור גיבויים קבועים של המידע הפיננסי שלי.",
  responsibilityConsent:
    "ברור לי שהאחריות על הגיבוי והשחזור היא שלי, ושהמפתחים לא יכולים לשחזר מידע שאבד מהמכשיר שלי.",
  agree: "אני מסכים/ה",
  name: "איך תרצו שנקרא לכם?",
  nameDescription:
    "בחרו שם לפרופיל שלכם במכשיר. תמיד אפשר להוסיף עוד פרופילים בהמשך.",
  namePlaceholder: "הקלידו את השם שלכם",
  currency: "מה המטבע הראשי שלכם?",
  currencyDescription:
    "זה יהיה מטבע ברירת המחדל של הפרופיל ושל כל רשומה פיננסית חדשה.",
  selectCurrency: "בחירת מטבע",
  date: "איך להציג תאריכים?",
  dateDescription: "בחרו איך תאריכים מספריים יוצגו. לדוגמה, 14 בספטמבר 2026:",
  month: "באיזה יום החודש הפיננסי מתחיל?",
  monthDescription:
    "מומלץ להתאים את תחילת החודש ליום שבו נכנסת המשכורת. אם תבחרו ב־10, החודש הפיננסי יהיה מה־10 ועד ה־9 בחודש הבא. אם בחרתם ביום 29–31 ובחודש מסוים אין את היום הזה, נשתמש ביום האחרון של אותו חודש. תקציבים חודשיים חדשים יתחילו לפי היום שבחרתם.",
  week: "באיזה יום מתחיל אצלכם השבוע?",
  weekDescription:
    "בחרו את היום הראשון של השבוע ביומן. בישראל בדרך כלל מתחילים ביום ראשון. גם יומן התשלומים החוזרים יפעל לפי הבחירה הזו.",
  sunday: "יום ראשון",
  monday: "יום שני",
  tuesday: "יום שלישי",
  wednesday: "יום רביעי",
  thursday: "יום חמישי",
  friday: "יום שישי",
  saturday: "שבת",
  continue: "המשך",
  finish: "יאללה, מתחילים",
  saving: "רק רגע, מגדירים את הפרופיל...",
  progress: "שלב {{current}} מתוך {{total}}",
  back: "חזרה",
  failed: "לא הצלחנו לסיים את ההגדרה",
  retry: "נסו שוב. אל דאגה, הנתונים שכבר קיימים נשמרו.",
  fullBackupOnly:
    "כדי לשחזר את הפרופיל, בחרו קובץ גיבוי ZIP או JSON. קובץ CSV כולל רק עסקאות, ואפשר לייבא אותו דרך ההגדרות אחרי שמסיימים את ההגדרה הראשונית.",
  missingProfile:
    "לא מצאנו בגיבוי הזה פרופיל משתמש שאפשר לשחזר. הנתונים הקיימים נשארו כמו שהם. נסו לשחזר גיבוי מלא שכולל פרופיל משתמש.",
  demoBadge: "נתוני דוגמה",
  demoExit: "להתחיל מאפס",
  demoExitTitle: "לצאת ממצב ההדגמה?",
  demoExitDescription:
    "הפעולה הזו תמחק את כל נתוני הדוגמה, כולל שינויים שעשיתם במצב ההדגמה, ותחזיר אתכם להגדרה הראשונית. אם אתם רוצים לשמור את הנתונים, ייצאו קודם גיבוי דרך ההגדרות.",
};
