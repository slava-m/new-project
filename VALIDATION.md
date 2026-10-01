## Проверено 01.10.2026

Node 24.19.0; @stoqey/ib 1.6.10; Lightweight Charts 5.2.1.
Пять тестов: SMA/RSI/объём, плоский рынок, закрытые свечи, неправильный OHLC, пропуски и нехватка истории.
Проверка Edge: desktop 1440px и mobile 390px без горизонтального переполнения; переключение SPY; canvas графика; отсутствие JS ошибок; POST отклонён 405; config.json недоступен через HTTP 404.
Сервер запущен на 127.0.0.1:8787, SQLite создана.
Реальный IBKR ещё не проверен: 127.0.0.1:7497 возвращает ECONNREFUSED.
Нет синтетических котировок в рабочем хранилище.
GPU: RTX 4070, 12282 MiB VRAM.
Ollama установлена. Qwen2.5:7b загружена; проверка синтетических данных дала 1% изменения и отношение объёма 2.0. ollama ps: 100% GPU, 4.7 GB. Первый запрос вместе с загрузкой модели: 47.2 секунды; 26 токенов за 2.79 секунды. Облачные функции отключены через server.json и OLLAMA_NO_CLOUD.
После финальных правок браузерная проверка повторно прошла. Лог Ollama подтвердил: Ollama cloud disabled: true. На момент проверки API TWS/IB Gateway не слушает стандартные порты.
Обновление: официальный TradingView widget проверен в Edge для NASDAQ:NNE и AMEX:SPY. На снимках видны реальные свечи и объём; задержка определяется TradingView. Высота контейнера исправлена. IBKR-пустое состояние и мобильная ширина проверены. Всего 9 тестов, включая экспериментальные условия, устаревшие данные и отсутствие lookahead. Подключение брокера не восстановлено: нет процесса TWS/IB Gateway и стандартных слушающих портов. Виджет не используется как API данных агенту.
Дневной режим: 12 тестов прошли, включая исключение текущей торговой даты и выходные. Проверка Edge подтвердила дневной интервал, отсутствие JS ошибок и отсутствие IBKR retries. Для реального числового потока остаётся пользовательский ключ Twelve Data; Set-Daily-Key.cmd подготовлен.

## Проверяемые отчёты
24 теста прошли. Свободный ответ модели заменён структурированным подтверждением рассчитанного статуса. Отдельно проверены отклонение противоречивого/многоязычного вывода, торговая дата, отсутствие плана у исключённой акции и соответствие уровней отчёта расчётам. Это не проверка прибыльности.

## Проверка сохранённой версии
Синтаксис всех JavaScript-файлов проверен; 24 теста прошли. pnpm audit --prod: известных уязвимостей не найдено на дату проверки. Edge: восемь акций, исключение портфеля, TradingView, встроенный ввод ключа, очистка поля, запрет POST без корректного Origin, закрытый маршрут файла ключа, мобильная ширина и отсутствие ошибок JavaScript проверены. Все восемь реальных отчётов сформированы со структурированным подтверждением модели. Проверка кода не гарантирует отсутствие всех ошибок; симуляция прибыльности и полный состав индексов остаются незавершёнными.

## Историческая симуляция
32 теста прошли, включая комиссию 2.50 USD за каждую сторону, гэп ниже стопа, неопределённый порядок стоп/цель, истечение плана, отсутствие заглядывания в будущее и исполнение кандидата производственной стратегии на искусственных барах. verify-history.mjs подтвердил отображение на том же дашборде, комиссию, смену акции, отсутствие вымышленной прибыльности и мобильную ширину без ошибок JavaScript. На текущих восьми акциях с 249 свечами сигналов не найдено: статистических выводов о прибыльности нет.

## Размер локальной истории
33 теста прошли. Проверены увеличенный размер запроса 520, split-adjusted данные и запрет размера более 5000. Часовые свечи не подключались: интервал 1day.

## S&P500 archive queue
503 listed equity holdings from official iShares IVV CSV, dated Sep 30 2026. Persistent SQLite quota and fetch metadata, 9-second spacing, 750 local requests per UTC day, provider-limit pause, daily refresh and retry. 51 unit tests passed. Browser check passed for complete list, progress, search, selected-symbol detail, NYSE chart, clearing unavailable history and mobile layout. Initial archive is progressively populated; full completion is not claimed.

## Free multi-source data and larger local model
Yahoo chart endpoint returned 500 completed daily OHLCV bars for AAPL, BRK.B and JPM with no API key. Stooq returned HTTP403 and was not connected. Yahoo is primary; Twelve Data Basic is reserved fallback, with independent persisted pacing/budgets. Tests cover symbol/currency identity, current-session exclusion, invalid arrays/OHLC, keyless requests, one-shot fallback, source isolation, budget denial and key redaction. All 57 unit tests passed; full-universe browser verification passed.
Qwen2.5 14B Q4_K_M downloaded, SHA verification succeeded. Ollama /api/ps reported model fully resident in GPU memory (size_vram equals size, 9.4 GB), context4096. NVIDIA observation during generation: 67% utilization. Model-confirmed real report was produced; model role remains deterministic-status verification, not independent numerical trading decisions.
