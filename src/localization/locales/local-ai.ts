export const localAIEn = {
  title: "Plutus AI",
  open: "Open local AI chat",
  privacyTitle: "Private AI on your device",
  privacyDescription:
    "Plutus AI is designed to run on this device. Your financial data and chat stay here; no third-party AI service receives them. The model requires a one-time download before offline use.",
  modelRequirements: "Model download: about {{size}} GB · Minimum memory: 8 GB",
  checking: "Checking this device…",
  deviceSupported: "Your device meets the model's hardware requirements.",
  deviceUnsupported: "Your device does not support this model.",
  modelNotInstalled:
    "The local AI model is not installed. Chat is unavailable until a verified local runtime and model are installed.",
  expoGoUnavailable:
    "Expo Go cannot run the required native AI engine. A development or production build with LiteRT-LM is required before the model can be downloaded and used.",
  runtimeUnavailable:
    "The LiteRT-LM engine and a verified model download are not included in this build yet. Model installation is unavailable.",
  download: "Download model",
  downloading: "Downloading model",
  downloadPaused: "Waiting for network",
  verifying: "Verifying model…",
  retryDownload: "Retry download",
  backgroundDownload:
    "You can leave this page or close the app. The download continues in the background.",
  loadingModel: "Loading the local model…",
  memoryUnavailable:
    "There isn't enough free memory to load this model right now. Close other apps or restart your phone, then try again. Your downloaded model is still installed.",
  retry: "Try again",
  chatWelcome: "Ask about your finances, or send a voice message.",
  messagePlaceholder: "Message Plutus AI",
  listening: "Listening…",
  thinking: "Thinking…",
  readingRecords: "Reading your records…",
  suggestions: {
    advice: "How can I improve my finances?",
    spending: "How much did I spend this month?",
    netWorth: "What is my net worth?",
    upcoming: "Which bills are coming up?",
    compare: "Compare my spending with last month",
  },
  recordVoice: "Record voice message",
  stopRecording: "Stop and send voice message",
  voiceMessage: "Voice message",
  microphoneDenied: "Microphone access is needed to record a voice message.",
  voiceUnavailable: "On-device speech recognition is unavailable or could not understand the recording. Try typing your message.",
  generationFailed: "The local model could not answer. Please try again or restart the chat.",
  send: "Send message",
  emptyAnswer: "I couldn't form an answer. Please try again.",
  exitTitle: "Leave this chat?",
  exitDescription:
    "This conversation isn't saved. Leaving deletes it and frees the AI model's memory. Your financial records aren't affected.",
  doNotShowAgain: "Don't ask me again",
  doNotShowAgainHint: "Leave the chat right away next time.",
  stay: "Keep chatting",
  leave: "Leave and delete chat",
  reasons: {
    platform: "Only Android and iOS devices are supported.",
    simulator: "A physical device is required for this large local model.",
    architecture: "A supported 64-bit processor could not be verified.",
    "memory-unknown": "Available device memory could not be verified.",
    "memory-low": "This model requires at least 8 GB of device memory.",
    "storage-unknown": "Free device storage could not be verified.",
    "storage-low":
      "More free storage is needed for the download and verification. Keep at least 6.2 GB free.",
  },
} as const;

export const localAIHe = {
  title: "Plutus AI",
  open: "פתיחת צ׳אט AI מקומי",
  privacyTitle: "בינה מלאכותית פרטית במכשיר שלך",
  privacyDescription:
    "Plutus AI מיועד לפעול במכשיר הזה. הנתונים הכספיים והשיחות נשארים כאן; הם לא נשלחים לשירות AI של צד שלישי. נדרשת הורדה חד־פעמית של המודל לפני שימוש ללא חיבור.",
  modelRequirements: "הורדת המודל: כ־{{size}} GB · זיכרון מינימלי: 8 GB",
  checking: "בודקים את המכשיר…",
  deviceSupported: "המכשיר שלך עומד בדרישות החומרה של המודל.",
  deviceUnsupported: "המכשיר שלך אינו תומך במודל הזה.",
  modelNotInstalled:
    "מודל ה־AI המקומי אינו מותקן. הצ׳אט אינו זמין עד להתקנת מנוע ומודל מקומיים מאומתים.",
  expoGoUnavailable:
    "Expo Go אינו יכול להריץ את מנוע ה־AI המקורי הנדרש. נדרשת גרסת פיתוח או גרסת הפצה עם LiteRT-LM כדי להוריד ולהפעיל את המודל.",
  runtimeUnavailable:
    "מנוע LiteRT-LM והורדת מודל מאומת אינם כלולים עדיין בגרסה זו. לא ניתן להתקין את המודל.",
  download: "הורדת המודל",
  downloading: "המודל יורד",
  downloadPaused: "ממתין לרשת",
  verifying: "מאמתים את המודל…",
  retryDownload: "לנסות להוריד שוב",
  backgroundDownload:
    "אפשר לצאת מהעמוד או לסגור את האפליקציה. ההורדה תמשיך ברקע.",
  loadingModel: "טוען את המודל המקומי…",
  memoryUnavailable:
    "אין כרגע מספיק זיכרון פנוי לטעינת המודל. סגרו אפליקציות אחרות או הפעילו מחדש את המכשיר ונסו שוב. המודל שהורדתם עדיין מותקן.",
  retry: "לנסות שוב",
  chatWelcome: "אפשר לשאול על הכספים שלך או לשלוח הודעה קולית.",
  messagePlaceholder: "הודעה ל־Plutus AI",
  listening: "מקשיב…",
  thinking: "חושב…",
  readingRecords: "קורא את הרשומות שלך…",
  suggestions: {
    advice: "איך אני יכול לשפר את המצב הכלכלי שלי?",
    spending: "כמה הוצאתי החודש?",
    netWorth: "מה השווי הנקי שלי?",
    upcoming: "אילו חיובים צפויים בקרוב?",
    compare: "השווה את ההוצאות שלי לחודש שעבר",
  },
  recordVoice: "הקלטת הודעה קולית",
  stopRecording: "סיום ושליחת ההקלטה",
  voiceMessage: "הודעה קולית",
  microphoneDenied: "נדרשת גישה למיקרופון כדי להקליט הודעה קולית.",
  voiceUnavailable: "זיהוי דיבור במכשיר אינו זמין או שלא ניתן להבין את ההקלטה. אפשר להקליד את ההודעה.",
  generationFailed: "המודל המקומי לא הצליח לענות. נסו שוב או פתחו את הצ׳אט מחדש.",
  send: "שליחת הודעה",
  emptyAnswer: "לא הצלחתי להכין תשובה. כדאי לנסות שוב.",
  exitTitle: "לצאת מהשיחה?",
  exitDescription:
    "השיחה הזו לא נשמרת. היציאה תמחק אותה ותפנה את הזיכרון של מודל ה־AI. הרשומות הכספיות שלך לא יושפעו.",
  doNotShowAgain: "אל תשאל אותי שוב",
  doNotShowAgainHint: "בפעם הבאה לצאת מהצ׳אט מיד.",
  stay: "להמשיך בשיחה",
  leave: "לצאת ולמחוק את השיחה",
  reasons: {
    platform: "רק מכשירי Android ו־iOS נתמכים.",
    simulator: "נדרש מכשיר פיזי עבור המודל המקומי הגדול הזה.",
    architecture: "לא ניתן לאמת מעבד 64 סיביות נתמך.",
    "memory-unknown": "לא ניתן לאמת את זיכרון המכשיר.",
    "memory-low": "המודל דורש לפחות 8 GB זיכרון במכשיר.",
    "storage-unknown": "לא ניתן לאמת את נפח האחסון הפנוי.",
    "storage-low":
      "נדרש עוד מקום פנוי להורדה ולאימות. יש להשאיר לפחות 6.2 GB פנויים.",
  },
} as const;

export const localAIRu = {
  title: "Plutus AI",
  open: "Открыть локальный ИИ-чат",
  privacyTitle: "Личный ИИ на вашем устройстве",
  privacyDescription:
    "Plutus AI предназначен для работы на этом устройстве. Финансовые данные и переписка остаются здесь и не передаются сторонним ИИ-сервисам. Для работы без сети модель нужно один раз скачать.",
  modelRequirements:
    "Загрузка модели: около {{size}} ГБ · Минимум памяти: 8 ГБ",
  checking: "Проверяем устройство…",
  deviceSupported: "Устройство соответствует аппаратным требованиям модели.",
  deviceUnsupported: "Устройство не поддерживает эту модель.",
  modelNotInstalled:
    "Локальная ИИ-модель не установлена. Чат станет доступен после установки проверенного движка и модели.",
  expoGoUnavailable:
    "Expo Go не может запускать необходимый нативный ИИ-движок. Для загрузки и работы модели нужна сборка для разработки или выпуска с LiteRT-LM.",
  runtimeUnavailable:
    "Движок LiteRT-LM и загрузка проверенной модели пока не включены в эту сборку. Установка модели недоступна.",
  download: "Скачать модель",
  downloading: "Загрузка модели",
  downloadPaused: "Ожидание сети",
  verifying: "Проверяем модель…",
  retryDownload: "Повторить загрузку",
  backgroundDownload:
    "Можно покинуть эту страницу или закрыть приложение. Загрузка продолжится в фоне.",
  loadingModel: "Загружаем локальную модель…",
  memoryUnavailable:
    "Сейчас недостаточно свободной памяти для загрузки модели. Закройте другие приложения или перезагрузите телефон и попробуйте снова. Загруженная модель останется установленной.",
  retry: "Повторить",
  chatWelcome: "Спросите о своих финансах или отправьте голосовое сообщение.",
  messagePlaceholder: "Сообщение Plutus AI",
  listening: "Слушаю…",
  thinking: "Думаю…",
  readingRecords: "Читаю ваши записи…",
  suggestions: {
    advice: "Как мне улучшить свои финансы?",
    spending: "Сколько я потратил в этом месяце?",
    netWorth: "Какова моя чистая стоимость?",
    upcoming: "Какие платежи скоро?",
    compare: "Сравни мои расходы с прошлым месяцем",
  },
  recordVoice: "Записать голосовое сообщение",
  stopRecording: "Остановить и отправить запись",
  voiceMessage: "Голосовое сообщение",
  microphoneDenied: "Для записи голосового сообщения нужен доступ к микрофону.",
  voiceUnavailable: "Распознавание речи на устройстве недоступно или не удалось разобрать запись. Попробуйте написать сообщение.",
  generationFailed: "Локальная модель не смогла ответить. Попробуйте снова или откройте чат заново.",
  send: "Отправить сообщение",
  emptyAnswer: "Не удалось подготовить ответ. Попробуйте ещё раз.",
  exitTitle: "Выйти из чата?",
  exitDescription:
    "Этот разговор не сохраняется. При выходе он будет удалён, а память ИИ-модели освободится. Ваши финансовые записи не затрагиваются.",
  doNotShowAgain: "Больше не спрашивать",
  doNotShowAgainHint: "В следующий раз выходить из чата сразу.",
  stay: "Продолжить разговор",
  leave: "Выйти и удалить чат",
  reasons: {
    platform: "Поддерживаются только устройства Android и iOS.",
    simulator: "Для этой большой локальной модели нужно физическое устройство.",
    architecture: "Не удалось подтвердить поддержку 64-разрядного процессора.",
    "memory-unknown": "Не удалось проверить объём памяти устройства.",
    "memory-low": "Для модели требуется не менее 8 ГБ памяти устройства.",
    "storage-unknown": "Не удалось проверить свободное место на устройстве.",
    "storage-low":
      "Для загрузки и проверки нужно больше места. Освободите не менее 6,2 ГБ.",
  },
} as const;
