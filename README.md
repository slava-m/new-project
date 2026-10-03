# Market / Research
Локальный дашборд отбора новых американских акций. Торговля и шорты не реализованы. IBKR отключён. Основной режим — завершённые дневные свечи; все настройки доступны на одной странице.

## Запуск
Node.js 24+, pnpm, Ollama с установленной локальной qwen2.5:14b.
Установите зависимости: `pnpm install --frozen-lockfile`.
Запустите `Start.cmd`, откройте http://127.0.0.1:8787.
Проверки: `node --test`, `node verify-strategy.mjs` (последняя требует Playwright и Edge в окружении).
Ollama должен работать с OLLAMA_NO_CLOUD=1. Сервер принимает только локальные endpoints модели, без облачного fallback.

## Данные и ключ
Yahoo Finance — первый источник двухлетних дневных OHLCV без ключа. Его публичный chart endpoint не является документированным API с гарантированной доступностью. Twelve Data Basic — бесплатный резерв с ключом. Кнопка «Подключить дневные данные» раскрывает необязательную настройку Twelve Data внутри дашборда. Ключ вводится в локальную форму, сохраняется в data/provider-key.json и передаётся только поставщику для авторизации. Форма очищается после отправки. Ключ не отправляется модели и не доступен через файловые HTTP-маршруты.
data/, журналы, .env и ключи исключены из Git. Это исключение из Git, а не шифрование файла на диске.
Резервные свечи Twelve Data загружаются из официального time_series API с adjust=splits. Метод корпоративных корректировок Yahoo отдельно не подтверждён, что явно указано в источнике и ограничениях симуляции. История одной акции берётся целиком из одного источника, без склейки разных поставщиков. День, совпадающий с текущей датой Нью-Йорка, исключается консервативно даже после закрытия. Обновление каждого тикера при появлении новой завершённой сессии Нью-Йорка; дневные данные не являются текущей котировкой.
График TradingView находится в отдельном внешнем iframe и не передаёт приложению числовую историю. На основной странице нет внешних скриптов.

## Отбор
universe.json содержит 503 биржевых тикера из официального CSV holdings iShares IVV (прокси состава S&P 500, снимок на 30 сентября 2026). Несколько классов одной компании учитываются отдельно. Наличные, деривативы и неторгуемый остаток HOLX исключены. Скрипт node update-universe.mjs обновляет перечень из источника; автоматического обновления состава пока нет. NNE и SPY исключены как уже имеющиеся позиции.
Закрытие ниже SMA150 исключает акцию. Подход сверху к SMA20/50/150 — зона наблюдения. Подтверждённые локальные минимумы требуют двух последующих свечей; стоп привязан к действующей опоре с буфером ATR. Каталог содержит 34 экспериментальные модели: разворотные структуры, треугольники, клинья, диапазоны, каналы, флаги, вымпелы и свечные модели. Это расширяемый каталог, а не все существующие фигуры. Медвежьи модели выводятся как предупреждения и не создают шорты. Свечное подтверждение учитывается только в зоне средней.
Уровни входа условные. Цель — ближайшая подтверждённая вершина выше входа либо измеренная цель пробитой структуры. RR рассчитан до издержек. Минимальный RR=2, ликвидность и ATR-буферы — параметры эксперимента, не подтверждённые прибыльностью.
План действует 3 торговые сессии, максимальное удержание 10 торговых сессий.

## Проверяемые отчёты
Числа, дата, причины и статус формируются программой из расчётов. Локальная модель возвращает только структурированное подтверждение статуса. Некорректное подтверждение отклоняется; тогда отображается отчёт без подтверждения модели. Свободный текст модели не выводится.
Условия отмены отделены от фактов текущего состояния. Для исключённых акций нет вымышленного срока активного плана.

## Что ещё не завершено
Новости/календарь отчётности и проверка устойчивости стратегии на более длинной истории. Базовая симуляция сделок теперь реализована в backtest.mjs.
scanHistory проверяет исторические сигналы без будущих свечей, но не вычисляет прибыльность. Полная проверка стратегии не завершена.

## Симуляция исторических сделок
backtest.mjs моделирует условные входы по дневным OHLC, активацию в течение трёх следующих сессий, стоп/цель, гэпы и выход через десять сессий. Закрытие ниже SMA150 вызывает выход на следующем открытии. Одновременно моделируется одна позиция на акцию; общий портфель не моделируется.
Комиссия по указанию пользователя: 2.50 USD при покупке и 2.50 при продаже. Экспериментальные параметры отдельно: капитал 10000 USD на каждую независимую симуляцию, риск 1%, проскальзывание 0.05% на каждую сторону. Размер позиции ограничен капиталом и включает комиссию в оценку риска. Ухудшение RR после гэпа и издержек отменяет вход.
Если дневная свеча касается стопа и цели, выбирается стоп первым и отмечается неопределённость. Открытые позиции не считаются завершёнными сделками. Просадка рассчитывается по дневной оценке капитала; это не внутридневная максимальная просадка.
Примерно двухлетняя история и текущий состав индекса недостаточны для подтверждения прибыльности. Следующий этап: более длинная история, более широкий набор и проверка устойчивости без подбора правил под результат.

## Двухлетний локальный архив
Запрашиваются 520 дневных свечей на акцию (примерно два календарных года), текущая дата Нью-Йорка исключается. История сохраняется в SQLite и доступна после перезапуска. Запросы выполняются последовательно; для каждого источника отдельно — не чаще одного каждые 9 секунд, чтобы соблюдать лимит бесплатного источника. Очередь загружает по одному тикеру, сохраняет fetchedAt и дневной расход в SQLite и возобновляется после перезапуска. Для Twelve Data локальный бюджет 750 запросов за сутки UTC оставляет резерв от бесплатного лимита 800; Yahoo имеет отдельный консервативный локальный бюджет 750 и интервал 9 секунд, это ограничение нашего приложения, а не обещание лимитов Yahoo. расход других приложений неизвестен, поэтому ответ об ограничении источника приостанавливает очередь. История каждого тикера обновляется один раз для новой завершённой сессии Нью-Йорка; повторный анализ по локальному архиву не расходует запросы источника. Инкрементальная загрузка только новых свечей ещё не реализована.

Минимальный RR ограничен снизу значением 2. Поле минимальной цели показывает порог цены для 2:1, но не заменяет структурную цель. Отчёты и дашборд используют одинаковую полную доступную историю.

## Полный сканер S&P 500
Состав источника: https://www.ishares.com/us/products/239726/ishares-core-s-p-500-etf/latest-holdings.csv
503 тикера загружаются постепенно; отсутствие истории явно показано и не означает отсутствие сигналов. Двухлетняя глубина запрашивается, но новые компании могут иметь меньше доступных свечей. SMA150 не рассчитывается без достаточной истории. Ошибки отдельного тикера не останавливают остальные; повторная попытка через сутки. Пока приложение закрыто, очередь не работает; после запуска продолжает.
Исторические симуляции выполняются последовательно в worker thread, чтобы не блокировать интерфейс. Сервер передаёт подробные свечи и сделки только выбранной акции; остальные строки получают краткую сводку. Нейросеть подтверждает вычисленный статус, а не заменяет технические расчёты.
Проверки браузера: node verify-universe.mjs, node verify-history.mjs, node verify-strategy.mjs.

## Локальная модель
По просьбе пользователя установлена Qwen2.5 14B Q4_K_M вместо 7B. Контекст 4096, batch 256, локальное удержание модели 10 минут. На RTX 4070 12GB проверена полная загрузка модели в VRAM (около 9.4 GB по Ollama), GPU активно использовался при генерации. Неиспользуемый остаточный runner прежней модели освобождён после проверки отсутствия родителя и активных соединений.
Роль модели пока прежняя: подтверждение рассчитанного статуса. Фигуры, цены и симуляция считаются кодом; увеличение модели само по себе не расширяет правила или не подтверждает доходность. Загрузка истории использует сеть, а историческая симуляция CPU, поэтому постоянная высокая загрузка GPU не требуется.

## Язык и фильтры дашборда
Выбор Русский / English расположен в шапке. Переводятся интерфейс, расчётные объяснения и настройки источника; TradingView получает выбранную locale, локальный график — соответствующий формат чисел и дат. Перевод выполняется локально по словарю, без отправки текста или ключа внешней модели.
Фильтры: все акции, сигналы и наблюдение, только сигналы, только наблюдать, исключённые, без данных, ниже SMA150. Отдельный флажок скрывает акции ниже SMA150. Фильтрация совместима с поиском тикера и применяется к сканеру, боковому списку и общей таблице истории. Кандидат означает условный расчётный сигнал, а не исполненную сделку.
belowSma150 формируется сервером из числового сравнения close < sma150. Неизвестная средняя не считается ни подтверждённым нахождением ниже, ни выше неё. Причины других исключений остаются отдельными. Язык и фильтры сохраняются в localStorage, ключ там не хранится. Если выбранная акция вне фильтра, её детали остаются видны с пояснением.
Проверка интерфейса: node verify-preferences.mjs.

## Почасовой анализ
analysisIntervalMs=3600000. На старте и на границе каждого часа модель повторно проверяет рассчитанные статусы всех акций с локальной историей. Исторические симуляции пересчитываются при обновлении свечей; неизменный архив повторно не скачивается каждый час. Дашборд показывает время текущего и следующего прохода, число обновлённых отчётов и очередь. Часовой проход начинается по расписанию и обрабатывает акции последовательно, а не одновременно. Приложение должно работать.
После перезапуска уже обработанные в текущем часовом интервале акции восстанавливаются из сохранённых analyses. Ответ для устаревшей версии истории не перезаписывает отчёт по новым свечам. У кешированных свечей сохранено настоящее время получения и доступность для вычислений; кеш не объявляется недоступным только из-за перезапуска.
Обновление источников ориентируется на последний завершённый будний день по дате Нью-Йорка, текущая сессия по-прежнему исключается. Выходные не вызывают повторную загрузку одной и той же пятничной истории. Биржевой календарь праздников пока не подключён: проверка наличия новой сессии может сделать один лишний запрос на тикер в праздничный день, но не каждый час.


### Dashboard conversation agent
The same-page chat uses the resident local Ollama model with a separate conversation history stored in the ignored SQLite database. Scanner and conversation requests share one serialized model queue; chat is prioritized after the active generation finishes. Background history downloading and CPU calculations continue independently.

The chat receives allowlisted calculated facts, the selected ticker's history metrics, universe counts, all current candidates (up to 30), and a labelled sample of 15 watched stocks. Mention an uppercase known ticker to change the question's context. Replies are model explanations, not validated trading signals; the calculated strategy panel remains authoritative. Chat cannot execute trades or access provider credentials.

Microphone recording is explicit and limited to 60 seconds. Local faster-whisper small (CPU/int8) transcribes uploaded audio; the recognized text is shown for review before sending. Local Windows System.Speech voices synthesize Russian/English replies when “Speak replies” is checked. Temporary audio/text files are deleted after processing. No browser cloud speech recognition is used.
On a new Windows machine with Python 3.12, run:
powershell -File setup-voice.ps1 -PythonPath C:\path\to\python.exe
Setup downloads dependencies and the pinned multilingual model once into ignored data/. Later speech inference is offline. Windows must have a local voice for the selected language. This is a turn-based voice interaction, not continuous duplex conversation.

Verification: node --test; node verify-chat.mjs; node verify-preferences.mjs.
The live speech test uses data/voice-test.wav, a locally generated synthetic English voice sample; it does not record the user's microphone.


### Separate minute archive
The optional config.intraday.enabled queue uses Yahoo Finance without a key. It initially requests five days of 1-minute regular-session candles, then updates the current session. This is an experimental public endpoint, not a guaranteed streaming data service. Unfinished candles, irregular quote timestamps, invalid OHLCV, and pre/post-market rows are excluded. SQLite minute_bars and minute_meta are separate from daily_history; progress survives restart, while the chart loads at most 2,000 minute bars.

The minute and daily Yahoo loaders share the existing 750 requests/day application budget and 9-second minimum request spacing; these are conservative app limits, not claimed published Yahoo allowances. Daily refresh has priority. Selected minute charts may be checked at most every five minutes during regular hours; other tickers are considered for hourly updates in a fair queue, subject to budget. Initial backfill continues gradually, including while markets are closed. Existing histories are not repeatedly polled before opening or over weekends; holidays are not modelled by the weekday clock. The application does not promise minute-by-minute updates across the entire universe. Data gaps that fall outside the source's available recent window cannot be recovered automatically.

Choosing “Minute candles” switches the local chart and shows source, completed-bar time, fetch time, candle age and queue state. The local chart time axis uses UTC; status timestamps use Jerusalem time. TradingView remains an independent visual source. Strategy signals, SMA150, agent status verification, and historical trading simulation remain daily; the chat can inspect separately labelled minute context. No intraday trading strategy or execution has been enabled.
Verification: node --test; node verify-minute.mjs; node verify-preferences.mjs; node verify-compact.mjs.


### Current archive targets and daily model schedule
Daily history target is three calendar years (Yahoo uses explicit start/end dates; the Twelve Data fallback requests 800 daily rows). Existing archive metadata is versioned by requested years, so the background app agent automatically queues deeper history. Hourly history target is one calendar year, stored independently in hour_bars/hour_meta. The user removed four-hour candles from this version; no four-hour archive or chart interval is generated.

Daily, hourly and minute Yahoo requests share the application's existing budget and rate spacing. Rotating admission slots prevent one archive from monopolizing available requests; the optional Twelve Data daily fallback uses its own saved quota. All queues are automatic while the server runs.

Automated model review now runs once per UTC day (next run is shown in Jerusalem time). Download arrivals no longer enqueue model analyses. Reports already generated today are reused across restart even if deeper history is being downloaded. Dashboard numerical facts can still reflect new cached bars; the model report's source date remains visible. Interactive chat stays available on demand.

A full year of minute backfill is NOT available from the current Yahoo source. Both a year-long request and a seven-day window a year ago were tested and rejected; the latter response required dates within the last 30 days. The app retains its available recent-minute backfill and accumulates new minute bars locally, and explicitly reports the one-year target as unavailable. Stocks listed less than three years/one year ago can only have history since listing. Coverage is the returned range, never a fabricated full-year claim.

Manual review is available in the dashboard for the selected stock or all loaded stocks. The local-origin JSON endpoint queues the existing daily research report pipeline plus a refreshed historical simulation, without changing the daily automatic schedule. Requests are rejected while an existing model review queue is running. Interactive chat remains separate. Verification: node verify-hourly.mjs.

### Separate manual interval analyses
The manual analysis selector supports daily, hourly and minute candles for the selected stock or all stocks with loaded data in that interval. Hourly and minute reports are persisted independently by symbol and interval, and never overwrite daily reports or simulations. Their SMA/ATR and pattern calculations use the selected interval, while liquidity uses daily history. Reports show candle time and data age and represent cached technical snapshots. Intraday parameters are experimental; intraday holding periods and historical simulations have not been defined. Automatic model review remains once per day. Verification: node verify-interval-analysis.mjs.

### Manual historical simulation by interval
The simulation panel now has daily/hourly interval selection and its own Run simulation button, for the selected stock or all loaded stocks. This is independent of the text-report model queue and can run without Ollama. Completed hourly simulations are persisted in interval_history and appear in the historical table and selected-stock metrics. SMA/ATR use hourly bars; liquidity uses only prior daily candles. Activation and holding count trading session dates (3 and 10), not individual hourly bars. Trades show time as well as date. Missing history is not invented and incomplete positions remain open. Current-universe selection, price adjustment, missing bars and conservative stop-first OHLC execution remain experimental limitations. Minute simulation is not exposed in the UI in this version.

The local chat and voice interface is currently disabled at the user request. Its dashboard initialization and server chat/speech endpoints are removed; existing local history and implementation files are retained for later restoration. Scanner model review remains enabled.

A global stock selector above manual analysis lists all universe tickers with company names and controls charts, reports and simulations independently of list filters. The selected ticker is remembered locally across reload. Selection from legacy table rows also updates the global selector.

### Parallel application agent roles
The loader role has independent daily/hourly/minute timers and persisted source quotas; it does not depend on model readiness or model-queue completion. The analyst role uses a separate Ollama report queue and a worker-thread historical simulation queue over cached bars. Network loading can overlap model generation and worker computation; these are application tasks, not two copies of a language model. Diagnostics exposes both roles with separate queues and next scheduled checks. A source budget pause does not stop analysis of existing data.

### Unified minimum reward/risk after costs
Signals and simulated entries share execution-costs.mjs. Net RR is potential net profit at the structural target divided by potential loss at the slipped stop, including $2.50 commission per side and assumed slippage. The minimum is 2:1 with no upper cap; $10/$20 is an example, not a fixed risk budget. The displayed net dollars and shares use the existing experimental simulation capital/risk settings. Targets are never moved to manufacture RR; minimumTargetAfterCosts is a threshold reference only. Entry is rechecked at the actual hypothetical opening price and updated simulated capital, so gaps or changed share quantity can still invalidate an earlier plan. Gross RR remains separately labelled. Existing interval historical results represent their prior saved run until manually rerun.

Saved interval results can be explicitly refreshed after a strategy-version change with node refresh-saved-results.mjs while the dashboard server runs. The maintenance command reads only saved report/history records, submits work to the application simulation/model endpoints, waits for the existing model queue, and checks the new version and model confirmation. It does not fetch market data itself or send provider keys to the model. Runtime results remain local and ignored by Git.
