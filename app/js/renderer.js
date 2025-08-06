document.addEventListener('DOMContentLoaded', async () => {

    /* ========================================================================== */
    /* --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И КОНСТАНТЫ --- */
    /* ========================================================================== */
    // Определяем текущий язык из атрибута data-default-lang в теге <html>. Если атрибут не установлен или пуст, по умолчанию используется русский ('ru').
    let currentLang = document.documentElement.dataset.defaultLang || 'ru';
    // ID для новых фильтров скорости
    const SPEED_FILTER_IDS = ['speed-slow', 'speed-norm', 'speed-fast'];
    // Переменная для отслеживания текущего воспроизводимого аудио.
    let currentAudio = null;
    // Множители скорости для ползунка.
    const SPEED_MULTIPLIERS = [0.5, 0.75, 1.0, 1.25, 1.5];
    // Текущий общий множитель скорости (по умолчанию 1.0).
    let currentOverallPlaybackRate = 1.0;
    // Текущий уровень рассудка, при котором началась охота.
	const huntSanityInput = document.getElementById('huntSanityInput');
	let currentHuntSanityThreshold = null; // Будет хранить числовое значение или null, если поле пустое
	    if (huntSanityInput) {
        huntSanityInput.value = ''; // Очищаем поле ввода hunt-sanity при загрузке страницы
        currentHuntSanityThreshold = null; // Также сбрасываем связанную переменную в JS
    }
    // ---------------------------------
    // Глобальные переменные для таймеров
    const timerIntervals = {}; // Хранит ID интервалов setInterval
    const timerDurations = {
        smudge: 3 * 60 * 1000, // 3 минуты в мс
        cooldown: 25 * 1000,   // 25 секунд в мс
        paranormalSound: 80 * 1000 // 1 минута 20 секунд (80 секунд) в мс
    };
    const timerCurrentTimes = {}; // Хранит текущее оставшееся время в мс
    const timerDisplayElements = {}; // Хранит ссылки на элементы DOM таймера (полоса, кнопка, метки)

    // Получаем ссылки на основные контейнеры DOM.
    const ghostGrid = document.getElementById('ghostGrid');
    const featureCheckboxesContainer = document.getElementById('featureCheckboxes');

    // Переменные для управления данными призраков и фильтрацией.
    let allGhosts = []; // Массив для хранения всех данных о призраках.
    let originalGhostsOrder = []; // Массив для сохранения оригинального порядка призраков (для сброса сортировки).
    let activeFilters = {}; // Объект для хранения текущего состояния фильтров (включен/исключен/нет).

    // Карта для отслеживания текущего визуального состояния оверлея для каждого призрака.
    // Также хранит информацию об источниках активации (какие чекбосы активировали оверлей).
    let ghostOverlayStates = new Map();

    // Набор для отслеживания чекбосов в сайдбаре, которые были вручную активированы пользователем.
    let activeSidebarCheckboxes = new Set();

    // Массивы с именами файлов и ключами для иконок особенностей (глобально доступны из HTML).
    const featureIconNames = [
        'emp.png', 'dots.png', 'uf.png', 'lights.png',
        'book.png', 'radio.png', 'zero.png'
    ];
    const featureKeys = [
        'emp', 'dots', 'uf', 'lights',
        'book', 'radio', 'zero'
    ];

    // Элементы модального окна для карт.
    const mapModal = document.getElementById('mapModal');
    const openMapModalBtn = document.getElementById('openMapModalBtn');
    const closeButton = document.querySelector('#mapModal .close-button');
    const mapListElement = document.getElementById('mapList');
    const currentMapImage = document.getElementById('currentMapImage');
    const languageToggle = document.getElementById('languageToggle');

    // Если кнопка переключения языка существует, устанавливаем её начальный текст.
    if (languageToggle) {
        languageToggle.textContent = 'LNG';
    }

    /* ========================================================================== */
    /* --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ --- */
    /* ========================================================================== */

    // Функция для парсинга входной строки текста и извлечения локализованной версии.
    // Ожидает формат "{русский текст} [английский текст]".
    // Возвращает текст на запрошенном языке, или другую доступную версию, или исходную строку.
    function getLocalizedText(textString, lang) {
        const russianMatch = textString.match(/\{([^}]*)\}/); // Ищем текст в фигурных скобках для русского языка.
        const englishMatch = textString.match(/\[([^\]]*)\]/); // Ищем текст в квадратных скобках для английского языка.

        // Проверяем, есть ли текст для запрошенного языка и не пуст ли он.
        if (lang === 'ru' && russianMatch && russianMatch[1].trim() !== '') {
            return russianMatch[1].trim();
        }
        if (lang === 'en' && englishMatch && englishMatch[1].trim() !== '') {
            return englishMatch[1].trim();
        }

        // Если текст для запрошенного языка не найден, но есть другая версия, возвращаем её.
        if (russianMatch && russianMatch[1].trim() !== '') {
            return russianMatch[1].trim();
        }
        if (englishMatch && englishMatch[1].trim() !== '') {
            return englishMatch[1].trim();
        }

        return textString.trim(); // Если скобок нет или текст пустой, возвращаем исходную строку без изменений.
    }

    // Функция для парсинга полного имени призрака и извлечения русского и английского имен.
    function parseGhostNames(fullName) {
        let russianName = '';
        let englishName = '';

        // Ищем русское имя в фигурных скобках.
        const russianMatch = fullName.match(/\{([^}]*)\}/);
        if (russianMatch && russianMatch[1].trim() !== '') {
            russianName = russianMatch[1].trim();
        }

        // Ищем английское имя в квадратных скобках.
        const englishMatch = fullName.match(/\[([^\]]*)\]/);
        if (englishMatch && englishMatch[1].trim() !== '') {
            englishName = englishMatch[1].trim();
        }

        // Если ни русское, ни английское имя не были найдены в скобках, считаем всю строку русским именем по умолчанию.
        if (russianName === '' && englishName === '') {
            russianName = fullName.trim();
        }

        return { russian: russianName, english: englishName };
    }

    // Функция для воспроизведения аудиофайла.
    function playAudio(filePath, ghostSpeedValue) {
        // Вычисляем итоговую скорость воспроизведения, умножая скорость призрака на общий множитель из ползунка.
        let finalPlaybackRate;
        if (ghostSpeedValue === undefined) { // Если ghostSpeedValue не передан (для шипения/крика).
            finalPlaybackRate = 1.0; // Воспроизводим со 100% скоростью.
        } else { // Если ghostSpeedValue передан (для скорости призрака в карточках).
            finalPlaybackRate = parseFloat(ghostSpeedValue) * currentOverallPlaybackRate;
        }

        // Убеждаемся, что finalPlaybackRate не слишком низкая, чтобы избежать проблем с HTMLAudioElement.
        finalPlaybackRate = Math.max(0.5, finalPlaybackRate);

        console.log(`Attempting to play audio: ${filePath} (ghost speed: ${ghostSpeedValue}, overall multiplier: ${currentOverallPlaybackRate}) with final playback rate: ${finalPlaybackRate}`);
        if (currentAudio) { // Если аудио уже играет, останавливаем его.
            console.log('Stopping current audio playback.');
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio = null;
        }
        if (filePath) { // Если передан новый путь к файлу, начинаем воспроизведение.
            currentAudio = new Audio(filePath);
            currentAudio.playbackRate = finalPlaybackRate; // Устанавливаем итоговую скорость воспроизведения.
            currentAudio.play().catch(e => console.error("Ошибка воспроизведения аудио:", e)); // Обработка ошибок воспроизведения.
            currentAudio.onended = () => { // Сбрасываем текущее аудио после завершения воспроизведения.
                console.log('Audio playback ended.');
                currentAudio = null;
            };
        }
    }

    /**
     * Вспомогательная функция для создания кнопок воспроизведения аудио.
     * @param {HTMLElement} parentElement - Родительский элемент, куда будет добавлена кнопка.
     * @param {string} audioFilePath - Путь к аудиофайлу.
     * @param {string} titleRu - Локализованный заголовок кнопки на русском.
     * @param {string} titleEn - Локализованный заголовок кнопки на английском.
     */
    function createAudioPlayButton(parentElement, audioFilePath, titleRu, titleEn) {
        const audioButton = document.createElement('button');
        audioButton.innerHTML = '&#9658;'; // Символ "Play".
        audioButton.classList.add('audio-play-button'); // Класс для стилизации.
        audioButton.title = getLocalizedText(`{${titleRu}} [${titleEn}]`, currentLang); // Локализуем заголовок кнопки.
        audioButton.addEventListener('click', (e) => {
            e.stopPropagation(); // Предотвращаем срабатывание обработчика родительского элемента.
            if (currentAudio && currentAudio.src.endsWith(audioFilePath)) { // Если текущий аудиофайл уже играет, останавливаем его; иначе, начинаем воспроизведение.
                playAudio(null);
            } else {
                playAudio(audioFilePath);
            }
        });
        parentElement.appendChild(audioButton); // Добавляем кнопку в DOM.
    }

    /* ========================================================================== */
    /* --- ФУНКЦИОНАЛ МОДАЛЬНОГО ОКНА КАРТ --- */
    /* ========================================================================== */

    // Функция для заполнения списка карт в модальном окне.
    function populateMapList() {
        mapListElement.innerHTML = ''; // Очищаем список перед заполнением.
        const sortedMaps = [...MAP_DATA].sort((a, b) => a.displayOrder - b.displayOrder); // Сортируем карты по свойству 'displayOrder'.

        // Для каждой карты или разделителя создаем элемент списка.
        sortedMaps.forEach(map => {
            const listItem = document.createElement('li');
            if (map.isDivider) { // Если это разделитель карт.
                listItem.classList.add('map-divider'); // Добавляем класс для стилизации разделителя.
                listItem.textContent = getLocalizedText(map.name, currentLang); // Локализуем текст разделителя.
                listItem.dataset.isDivider = "true"; // Добавляем data-атрибут для идентификации разделителя при локализации.
                listItem.addEventListener('click', () => { // Добавляем слушатель события клика для разделителей, чтобы закрывать модальное окно.
                    if (mapModal) {
                        mapModal.style.display = 'none';
                    }
                });
            } else { // Если это обычный элемент карты.
                listItem.classList.add('map-item'); // Добавляем класс для стилизации элемента карты.

                // Специальная обработка для элемента закрытия модального окна
                if (map.id === "map-size-modal-close") {
                    listItem.textContent = getLocalizedText(map.name, currentLang); // Локализуем его имя
                    listItem.addEventListener('click', () => {
                        if (mapModal) {
                            mapModal.style.display = 'none'; // Закрываем модальное окно
                        }
                    });
                } else {
                    listItem.textContent = map.name; // Текст для обычных карт не содержит скобок, поэтому используем его как есть.
                    listItem.dataset.mapId = map.id; // Устанавливаем ID карты в data-атрибут для идентификации.

                    // Добавляем слушатель события клика для обычных карт.
                    listItem.addEventListener('click', () => {
                        mapListElement.querySelectorAll('li').forEach(li => li.classList.remove('active')); // Удаляем активный класс со всех элементов списка карт.
                        listItem.classList.add('active'); // Добавляем активный класс к текущему элементу списка карт.

                        // Устанавливаем обработчик события 'onload' для изображения карты ПЕРЕД установкой 'src'.
                        currentMapImage.onload = () => {
                            if (mapModal) { // Показываем модальное окно после загрузки изображения.
                                mapModal.style.display = 'block';
                            }
                            // Удаляем обработчик 'onload' после его срабатывания, чтобы избежать повторных вызовов.
                            currentMapImage.onload = null;
                        };

                        currentMapImage.src = map.imagePath; // Устанавливаем источник изображения и alt-текст. Это запускает загрузку изображения.
                        currentMapImage.alt = map.name;

                        // Если изображение уже в кеше браузера (загружено), 'onload' может не сработать автоматически. Вручную вызываем обработчик в этом случае.
                        if (currentMapImage.complete) {
                            currentMapImage.onload();
                        }
                    });
                }
            }
            mapListElement.appendChild(listItem); // Добавляем элемент списка в DOM.
        });
        // При первой загрузке или обновлении списка, показываем изображение первой карты.
        if (sortedMaps.length > 0) {
            // Ищем первую не-разделительную карту и не элемент закрытия модального окна.
            const firstActualMap = sortedMaps.find(map => !map.isDivider && map.id !== "map-size-modal-close");
            if (firstActualMap) {
                currentMapImage.src = firstActualMap.imagePath;
                currentMapImage.alt = firstActualMap.name;
                const firstMapElement = mapListElement.querySelector(`[data-map-id="${firstActualMap.id}"]`); // Активируем первый элемент списка карт.
                if (firstMapElement) {
                    firstMapElement.classList.add('active');
                }
            } else {
                currentMapImage.src = ''; // Если карт нет, сбрасываем изображение и alt-текст.
                currentMapImage.alt = 'Карта не выбрана';
            }
        } else {
            currentMapImage.src = ''; // Если карт нет, сбрасываем изображение и alt-текст.
            currentMapImage.alt = 'Карта не выбрана';
        }
    }

    /* ========================================================================== */
    /* --- УПРАВЛЕНИЕ ДАННЫМИ И ОТОБРАЖЕНИЕМ ПРИЗРАКОВ --- */
    /* ========================================================================== */

    /**
     * Главная асинхронная функция для загрузки и отрисовки данных призраков.
     * Использует встроенные данные GHOSTS_DATA_EMBEDDED, которые теперь глобально доступны из HTML.
     */
    async function fetchAndRenderGhosts() {
        // GHOSTS_DATA_EMBEDDED гарантированно определен в phasmbase.html
        let ghostsData = GHOSTS_DATA_EMBEDDED;

        allGhosts = ghostsData;
        originalGhostsOrder = [...allGhosts]; // Сохраняем оригинальный порядок для возможности сброса сортировки.

        ghostOverlayStates.clear(); // При полной перезагрузке сбрасываем все состояния оверлеев призраков.
        allGhosts.forEach(ghost => {
            ghostOverlayStates.set(ghost.name, { state: 'none', activatedByGreenCheckboxes: new Set(), activatedByGrayCheckboxes: new Set() }); // Инициализируем состояние оверлея для каждого призрака по умолчанию как 'none' (без оверлея).
        });
        activeSidebarCheckboxes.clear(); // Сбрасываем состояние активных чекбосов в сайдбаре.
        document.querySelectorAll('#featureCheckboxes input[type="checkbox"]').forEach(checkbox => { // Сбрасываем все чекбосы в пользовательском интерфейсе.
            checkbox.checked = false;
        });
        document.querySelectorAll('#featureCheckboxes input[type="checkbox"]').forEach(checkbox => { // Добавляем слушатели событий 'change' для всех чекбосов особенностей в сайдбаре.
            checkbox.addEventListener('change', handleSidebarCheckboxChange);
        });

        // Добавляем слушатели событий 'change' для новых чекбосов скорости
        document.querySelectorAll('.speed-filter-checkboxes input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', handleSidebarCheckboxChange);
        });

        featureKeys.forEach(key => { // Инициализируем все фильтры как 'none' (неактивные).
            activeFilters[key] = 'none';
        });
        // Инициализация новых фильтров скорости
        SPEED_FILTER_IDS.forEach(key => {
            activeFilters[key] = 'none';
        });

        renderAllGhostsInitially(allGhosts); // Вызываем новую функцию для начальной отрисовки всех призраков.
        applyFiltersAndSort(); // Применяем фильтры и сортировку после первоначального рендеринга.
        updateSidebarTextColors(); // Обновляем цвета текста в сайдбаре после первоначального рендеринга.
        updateSidebarCheckboxes(); // Обновляем состояние чекбосов в сайдбаре.
    }

    /**
     * Функция для отрисовки значений скорости и кнопок.
     * Вынесена как отдельная функция для предотвращения дублирования кода.
     * @param {HTMLElement} container - Родительский элемент, куда будет отрисована скорость.
     * @param {string} speedData - Строка со значениями скорости (например, "1.7", "1.7/2.25").
     * @param {object} ghost - Объект призрака, содержащий данные.
     */
    function renderSpeed(container, speedData, ghost) {
        container.innerHTML = ''; // Очищаем содержимое сначала.

        const speedIcon = document.createElement('img');
        speedIcon.src = './app/img/features/steps.png'; // Путь к иконке шагов.
        speedIcon.alt = getLocalizedText('{Скорость} [Speed]', currentLang); // Alt-текст для доступности.
        speedIcon.classList.add('speed-icon'); // Добавляем класс для стилизации, если необходимо.
        container.appendChild(speedIcon);

        if (speedData) {
            const speeds = speedData.split(/[\/-]/).map(s => s.trim());

            speeds.forEach((speedValue, index) => {
                const speedSpan = document.createElement('span');
                speedSpan.textContent = speedValue;
                container.appendChild(speedSpan);

                const playButton = document.createElement('button');
                playButton.innerHTML = '&#9658;'; // Символ "Play".
                playButton.classList.add('audio-play-button', 'speed-play-button');
                // Обновляем title, чтобы он отображал фактическую скорость воспроизведения.
                playButton.title = getLocalizedText(`{Проиграть со скоростью ${(parseFloat(speedValue)).toFixed(2)}} [Play at speed ${(parseFloat(speedValue)).toFixed(2)}]`, currentLang);
                playButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Логика остановки/запуска аудио при повторном клике
                    const speedSoundPath = AUDIO_FILES["speed-sound"];
                    const currentSpeedValue = parseFloat(speedValue);
                    const calculatedPlaybackRate = currentSpeedValue * currentOverallPlaybackRate;

                    if (currentAudio && currentAudio.src.endsWith(speedSoundPath) && currentAudio.playbackRate === calculatedPlaybackRate) {
                        playAudio(null); // Останавливаем воспроизведение
                    } else {
                        playAudio(speedSoundPath, currentSpeedValue); // Запускаем воспроизведение
                    }
                });
                container.appendChild(playButton);

                if (index < speeds.length - 1) {
                    const separator = document.createElement('span');
                    // Определяем разделитель на основе исходной строки speedData.
                    const originalDelimiter = ghost.speed.includes('/') ? ' / ' : ' - ';
                    separator.textContent = originalDelimiter;
                    container.appendChild(separator);
                }
            });
        }
    }

    /**
     * Новая функция для начальной отрисовки всех призраков.
     * Создает все карточки призраков в DOM.
     */
    function renderAllGhostsInitially(ghosts) {
        ghostGrid.innerHTML = ''; // Очищаем сетку перед добавлением всех карточек.
        ghosts.forEach(ghost => {
            const card = document.createElement('div');
            card.classList.add('ghost-card');
            card.dataset.ghostName = ghost.name; // Сохраняем полное имя призрака в data-атрибуте карточки.

            const ghostState = ghostOverlayStates.get(ghost.name);
            card.dataset.overlayState = ghostState ? ghostState.state : 'none';

            card.addEventListener('click', () => {
                const currentGhostName = card.dataset.ghostName;
                const currentGhostState = ghostOverlayStates.get(currentGhostName);
                let newState = 'none';

                currentGhostState.activatedByGreenCheckboxes.clear();
                currentGhostState.activatedByGrayCheckboxes.clear();

                if (currentGhostState.state === 'none') {
                    newState = 'gray';
                } else if (currentGhostState.state === 'gray') {
                    newState = 'green';
                } else {
                    newState = 'none';
                }

                currentGhostState.state = newState;
                card.dataset.overlayState = newState;

                updateSidebarTextColors();
                updateSidebarCheckboxes();
            });

            const names = parseGhostNames(ghost.name);
            const englishNameForFile = names.english.replace(/ /g, '_');

            const ghostInfoLeft = document.createElement('div');
            ghostInfoLeft.classList.add('ghost-info-left');

            const avatarNameContainer = document.createElement('div');
            avatarNameContainer.classList.add('avatar-name-container');

            const ghostNameDiv = document.createElement('div');
            ghostNameDiv.classList.add('ghost-name');
            ghostNameDiv.textContent = getLocalizedText(ghost.name, currentLang);
            avatarNameContainer.appendChild(ghostNameDiv);

            ghostInfoLeft.appendChild(avatarNameContainer);

            const evidencePercentageContainer = document.createElement('div');
            evidencePercentageContainer.classList.add('evidence-percentage-container');

            const evidenceIconsDiv = document.createElement('div');
            evidenceIconsDiv.classList.add('evidence-icons');
            // Проверяем каждую улику и добавляем иконку, если она присутствует.
            featureKeys.forEach((key, index) => {
                // Убедимся, что свойство существует и его значение равно 'x' (строка).
                if (ghost[key] && String(ghost[key]).toLowerCase() === 'x') {
                    const img = document.createElement('img');
                    img.src = `./app/img/features/${featureIconNames[index]}`;
                    img.alt = key;
                    evidenceIconsDiv.appendChild(img);
                }
            });
            evidencePercentageContainer.appendChild(evidenceIconsDiv);

            // Контейнер для иконки рассудка и процента.
            const sanityDisplayContainer = document.createElement('div');
            sanityDisplayContainer.classList.add('sanity-display-container');

            // Добавляем иконку sanity.png перед процентом рассудка.
            const sanityIcon = document.createElement('img');
            sanityIcon.src = './app/img/features/sanity.png';
            sanityIcon.alt = getLocalizedText('{Рассудок} [Sanity]', currentLang);
            sanityIcon.classList.add('sanity-icon'); // Используем новый класс для иконки рассудка.
            sanityDisplayContainer.appendChild(sanityIcon);

            const percentageDiv = document.createElement('div');
            percentageDiv.classList.add('sanity-percentage');
            percentageDiv.textContent = ghost.percentage;
            sanityDisplayContainer.appendChild(percentageDiv);

            evidencePercentageContainer.appendChild(sanityDisplayContainer); // Добавляем новый контейнер в evidencePercentageContainer.

            ghostInfoLeft.appendChild(evidencePercentageContainer);

            // Отображение скорости.
            const speedDiv = document.createElement('div');
            speedDiv.classList.add('ghost-speed');

            // Вызываем внешнюю функцию renderSpeed
            renderSpeed(speedDiv, ghost.speed, ghost); // Передаем ghost
            ghostInfoLeft.appendChild(speedDiv); // Добавляем speedDiv в ghostInfoLeft.

            const ghostInfoRight = document.createElement('div');
            ghostInfoRight.classList.add('ghost-info-right');

            // Добавляем блок для 0evidence.
            const zeroEvidenceListDiv = document.createElement('div');
            zeroEvidenceListDiv.classList.add('zero-evidence-list');
            if (ghost['0evidence'] && Array.isArray(ghost['0evidence'])) {
                const zeroEvidenceTitle = document.createElement('p');
                zeroEvidenceTitle.innerHTML = `<strong>${getLocalizedText('{0 улик тест} [0 Evidence test]', currentLang)}:</strong>`;
                zeroEvidenceListDiv.appendChild(zeroEvidenceTitle);

                // Создаем один текстовый узел или div для всех улик, разделенных <br>
                const evidenceContent = document.createElement('div');
                ghost['0evidence'].forEach((evidenceItem, index) => {
                    const localizedText = getLocalizedText(evidenceItem, currentLang);
                    evidenceContent.innerHTML += `- ${localizedText}` + (index < ghost['0evidence'].length - 1 ? '<br>' : '');
                });
                zeroEvidenceListDiv.appendChild(evidenceContent);
            }
            ghostInfoRight.appendChild(zeroEvidenceListDiv);

            // Сильные стороны.
            const strongSideDiv = document.createElement('div');
            strongSideDiv.classList.add('strong-side');
            if (ghost.strongSide && Array.isArray(ghost.strongSide)) { // Проверяем, что strongSide существует и является массивом
                const strongSideTitle = `<strong>${getLocalizedText('{Сильные стороны} [Strong Side]', currentLang)}:</strong> `;
                let strongSideContent = '';
                if (ghost.strongSide.length > 0) {
                    // Проходим по каждому элементу массива, локализуем его, добавляем дефис и объединяем через <br>
                    strongSideContent = ghost.strongSide.map(item => `- ${getLocalizedText(item, currentLang).trim()}`).join('<br>');
                }
                strongSideDiv.innerHTML = strongSideTitle + strongSideContent;
            }
            ghostInfoRight.appendChild(strongSideDiv);

            // Слабые стороны.
            const weakSideDiv = document.createElement('div');
            weakSideDiv.classList.add('weak-side');
            if (ghost.weakSide && Array.isArray(ghost.weakSide)) { // Проверяем, что weakSide существует и является массивом
                const weakSideTitle = `<strong>${getLocalizedText('{Слабые стороны} [Weak Side]', currentLang)}:</strong> `;
                let weakSideContent = ''; // ИЗМЕНЕНО: Исправлена опечатка, теперь это weakSideContent
                if (ghost.weakSide.length > 0) {
                    // Проходим по каждому элементу массива, локализуем его, добавляем дефис и объединяем через <br>
                    weakSideContent = ghost.weakSide.map(item => `- ${getLocalizedText(item, currentLang).trim()}`).join('<br>'); // ИЗМЕНЕНО: Исправлена опечатка
                }
                weakSideDiv.innerHTML = weakSideTitle + weakSideContent;
            }
            ghostInfoRight.appendChild(weakSideDiv);


            card.appendChild(ghostInfoLeft);
            card.appendChild(ghostInfoRight);

            ghostGrid.appendChild(card);
        });
    }

    // НОВАЯ ФУНКЦИЯ: Обновляет текстовое содержимое карточек призраков при смене языка.
    function updateGhostCardTexts() {
        document.querySelectorAll('.ghost-card').forEach(card => {
            const ghostName = card.dataset.ghostName;
            const ghost = GHOSTS_DATA_EMBEDDED.find(g => g.name === ghostName);

            if (ghost) {
                // Обновляем имя призрака.
                const nameDiv = card.querySelector('.ghost-name');
                if (nameDiv) {
                    nameDiv.textContent = getLocalizedText(ghost.name, currentLang);
                }

                // Обновляем 0evidence.
                const zeroEvidenceListDiv = card.querySelector('.zero-evidence-list');
                if (zeroEvidenceListDiv && ghost['0evidence'] && Array.isArray(ghost['0evidence'])) {
                    zeroEvidenceListDiv.innerHTML = ''; // Очищаем существующее содержимое.
                    const zeroEvidenceTitle = document.createElement('p');
                    zeroEvidenceTitle.innerHTML = `<strong>${getLocalizedText('{0 улик тест} [0 Evidence test]', currentLang)}:</strong>`;
                    zeroEvidenceListDiv.appendChild(zeroEvidenceTitle);

                    // Создаем один текстовый узел или div для всех улик, разделенных <br>
                    const evidenceContent = document.createElement('div');
                    ghost['0evidence'].forEach((evidenceItem, index) => {
                        const localizedText = getLocalizedText(evidenceItem, currentLang);
                        evidenceContent.innerHTML += `- ${localizedText}` + (index < ghost['0evidence'].length - 1 ? '<br>' : '');
                    });
                    zeroEvidenceListDiv.appendChild(evidenceContent);
                }

                // Обновляем сильные стороны.
                const strongSideDiv = card.querySelector('.strong-side');
                if (strongSideDiv && ghost.strongSide && Array.isArray(ghost.strongSide)) { // Проверяем, что strongSide существует и является массивом
                    const strongSideTitle = `<strong>${getLocalizedText('{Сильные стороны} [Strong Side]', currentLang)}:</strong> `;
                    let strongSideContent = '';
                    if (ghost.strongSide.length > 0) {
                        // Проходим по каждому элементу массива, локализуем его, добавляем дефис и объединяем через <br>
                        strongSideContent = ghost.strongSide.map(item => `- ${getLocalizedText(item, currentLang).trim()}`).join('<br>');
                    }
                    strongSideDiv.innerHTML = strongSideTitle + strongSideContent;
                }

                // Обновляем слабые стороны.
                const weakSideDiv = card.querySelector('.weak-side');
                if (weakSideDiv && ghost.weakSide && Array.isArray(ghost.weakSide)) { // Проверяем, что weakSide существует и является массивом
                    const weakSideTitle = `<strong>${getLocalizedText('{Слабые стороны} [Weak Side]', currentLang)}:</strong> `;
                    let weakSideContent = ''; // ИЗМЕНЕНО: Исправлена опечатка, теперь это weakSideContent
                    if (ghost.weakSide.length > 0) {
                        // Проходим по каждому элементу массива, локализуем его, добавляем дефис и объединяем через <br>
                        weakSideContent = ghost.weakSide.map(item => `- ${getLocalizedText(item, currentLang).trim()}`).join('<br>'); // ИЗМЕНЕНО: Исправлена опечатка
                    }
                    weakSideDiv.innerHTML = weakSideTitle + weakSideContent;
                }

                // Обновляем скорость.
                const speedDiv = card.querySelector('.ghost-speed');
                if (speedDiv) {
                    // Вызываем внешнюю функцию renderSpeed
                    renderSpeed(speedDiv, ghost.speed, ghost); // Передаем ghost
                }

                // Обновляем иконку рассудка и процент.
                const sanityDisplayContainer = card.querySelector('.sanity-display-container');
                if (sanityDisplayContainer) {
                    const sanityIcon = sanityDisplayContainer.querySelector('.sanity-icon');
                    const percentageDiv = sanityDisplayContainer.querySelector('.sanity-percentage');
                    if (sanityIcon) {
                        sanityIcon.alt = getLocalizedText('{Рассудок} [Sanity]', currentLang);
                    }
                    if (percentageDiv) {
                        percentageDiv.textContent = ghost.percentage;
                    }
                }
            }
        });
    }



    /* ========================================================================== */
    /* --- ЛОГИКА ФИЛЬТРАЦИИ И ОВЕРЛЕЕВ --- */
    /* ========================================================================== */

    // Вспомогательная функция для определения, соответствует ли значение скорости категории фильтра.
    // Возвращает true, если speedValue *соответствует* категории фильтра (т.е., призрак *попадает* в эту категорию).
    function isSpeedCategoryMatch(speedValue, featureId) {
        if (featureId === 'speed-slow') { // "медлен" (не серый) = скорость <= 1.5
            return speedValue <= 1.5;
        } else if (featureId === 'speed-norm') { // "норм" (не серый) = скорость > 1.5 И <= 1.9
            return speedValue > 1.5 && speedValue <= 1.9;
        } else if (featureId === 'speed-fast') { // "быстр" (не серый) = скорость > 1.9
            return speedValue >= 1.9;
        }
        return false; // Не должно произойти
    }

    /**
     * Вспомогательная функция для определения, все ли значения рассудка призрака ниже заданного порога.
     * Поддерживает одиночные значения ("50"), значения через слэш ("15/75") и диапазоны через дефис ("15-75").
     * @param {string} ghostPercentageString - Строка рассудка призрака (например, "50", "15/75", "15-75").
     * @param {number} threshold - Числовой порог рассудка для сравнения.
     * @returns {boolean} - True, если все значения рассудка призрака строго меньше порога.
     */
    function isGhostBelowHuntSanityThreshold(ghostPercentageString, threshold) {
        // Если порог не установлен или не является числом, этот фильтр не применяется.
        if (threshold === null || isNaN(threshold)) {
            return false;
        }

        // Разделяем строку на части по слэшу или дефису.
        const parts = ghostPercentageString.split(/[\/-]/).map(p => p.trim());

        // Проверяем каждую часть. Если хотя бы одно значение >= порогу, то призрак не отсеивается.
        for (const part of parts) {
            if (part.includes('-')) {
                // Обработка диапазона (например, "15-75")
                const [minStr, maxStr] = part.split('-').map(Number);
                // Если верхняя граница диапазона >= порогу, то не все значения ниже порога.
                if (maxStr >= threshold) {
                    return false;
                }
            } else {
                // Обработка одиночного значения (например, "50", "15")
                const value = parseFloat(part);
                // Если значение >= порогу, то не все значения ниже порога.
                if (value >= threshold) {
                    return false;
                }
            }
        }
        // Если мы дошли до сюда, значит, все значения (или весь диапазон) строго меньше порога.
        return true;
    }

    function applyFiltersAndSort() {
        const allGhostCards = ghostGrid.querySelectorAll('.ghost-card');
        let visibleCount = 0; // Для отслеживания, есть ли видимые карточки.

        allGhostCards.forEach(card => {
            const ghostName = card.dataset.ghostName;
            const ghost = allGhosts.find(g => g.name === ghostName); // Находим данные призрака по имени.

            if (!ghost) return; // Если призрак не найден (что не должно произойти), пропускаем.

            let shouldBeDisplayed = true; // Предполагаем, что призрак должен быть отображен по умолчанию.

            // Проверяем обычные фильтры особенностей (EMP, D.O.T.S. и т.д.)
            featureKeys.forEach(key => {
                const filterState = activeFilters[key]; // 'include', 'exclude', 'none'
                const hasFeature = ghost[key] && String(ghost[key]).toLowerCase() === 'x'; // Есть ли у призрака эта особенность.

                if (filterState === 'include' && !hasFeature) { // Если фильтр "включить" и у призрака нет особенности.
                    shouldBeDisplayed = false;
                }
                if (filterState === 'exclude' && hasFeature) { // Если фильтр "исключить" и у призрака есть особенность.
                    shouldBeDisplayed = false;
                }
            });

            // --- Логика фильтров скорости: здесь НЕТ скрытия призраков ---
            // Фильтры скорости НЕ скрывают призраков, они только управляют серым оверлеем.
            // Эта функция только скрывает/показывает призраков на основе других фильтров.

            // Применяем финальное решение по отображению.
            if (shouldBeDisplayed) { // Призрак отображается, если он не отфильтрован обычными фильтрами
                card.classList.remove('filtered-out'); // Показываем карточку.
                visibleCount++;
            } else {
                card.classList.add('filtered-out'); // Скрываем карточку (добавляем класс filtered-out).
            }
        });

        // Показываем сообщение "Призраки не найдены", если нет видимых карточек.
        const noResultsMessage = ghostGrid.querySelector('.no-results-message');
        if (visibleCount === 0) {
            if (!noResultsMessage) {
                const message = document.createElement('div');
                message.classList.add('no-results-message');
                message.textContent = getLocalizedText('{Призраки, соответствующие выбранным фильтрам, не найдены.} [No ghosts found matching the selected filters.]', currentLang);
                ghostGrid.appendChild(message);
            }
        } else {
            if (noResultsMessage) {
                noResultsMessage.remove();
            }
        }
    }

    /**
     * Эта функция обновляет состояния оверлеев (наложений) на карточках призраков, основываясь
     * на ВСЕХ активных чекбоксах в сайдбаре.
     * Она также учитывает ручные оверлеи, установленные кликом по карточке.
     */
    function updateTableOverlaysFromCheckboxes() {
        if (!allGhosts || allGhosts.length === 0) {
            console.warn('GHOSTS_DATA_EMBEDDED не загружен в updateTableOverlaysFromCheckboxes.');
            return;
        }

        const mimicGhost = allGhosts.find(g => {
            const names = parseGhostNames(g.name);
            return names.russian === "Мимик" || names.english === "Mimic";
        });

        // Определяем константу для ID фильтра рассудка охоты
        const HUNT_SANITY_FILTER_ID = 'hunt-sanity-filter';

        allGhosts.forEach(ghost => {
            const { russian: currentGhostRussianName, english: currentGhostEnglishName } = parseGhostNames(ghost.name);
            const card = document.querySelector(`div.ghost-card[data-ghost-name="${ghost.name}"]`);
            if (!card) return;

            const currentGhostState = ghostOverlayStates.get(ghost.name);
            if (!currentGhostState) {
                ghostOverlayStates.set(ghost.name, { state: 'none', activatedByGreenCheckboxes: new Set(), activatedByGrayCheckboxes: new Set() });
                return;
            }

            // Сохраняем состояние ручных оверлеев до очистки
            const wasManualGreen = currentGhostState.state === 'green' && currentGhostState.activatedByGreenCheckboxes.size === 0;
            const wasManualGray = currentGhostState.state === 'gray' && currentGhostState.activatedByGrayCheckboxes.size === 0;

            currentGhostState.activatedByGreenCheckboxes.clear();
            currentGhostState.activatedByGrayCheckboxes.clear();

            let hasGreenOverlayByCheckbox = false;
            let hasGrayOverlayByReverseMapping = false;
            let hasGrayOverlayBySpeedFilter = false;
            let hasGrayOverlayByHuntSanity = false; // Новый флаг для рассудка охоты

            // --- НОВАЯ ЛОГИКА: Самый высокий приоритет для Hunt Sanity ---
            if (currentHuntSanityThreshold !== null && !isNaN(currentHuntSanityThreshold)) {
                if (isGhostBelowHuntSanityThreshold(ghost.percentage, currentHuntSanityThreshold)) {
                    hasGrayOverlayByHuntSanity = true;
                    currentGhostState.activatedByGrayCheckboxes.add(HUNT_SANITY_FILTER_ID); // Добавляем ID фильтра в активаторы
                }
            }
            // --- КОНЕЦ НОВОЙ ЛОГИКИ ---

            // Обработка других чекбоксов (только если Hunt Sanity не активировал серый оверлей)
            if (!hasGrayOverlayByHuntSanity) {
                activeSidebarCheckboxes.forEach(featureId => {
                    if (SIDEBAR_FEATURE_GHOST_MAPPING[featureId]) {
                        const mappedNames = SIDEBAR_FEATURE_GHOST_MAPPING[featureId];
                        if (mappedNames.includes(currentGhostRussianName) || mappedNames.includes(currentGhostEnglishName)) {
                            hasGreenOverlayByCheckbox = true;
                            currentGhostState.activatedByGreenCheckboxes.add(featureId);
                        }
                    }

                    if (mimicGhost && ghost.name === mimicGhost.name && !MIMIC_UNIMITATABLE_FEATURES.has(featureId) && !SPEED_FILTER_IDS.includes(featureId)) {
                        hasGreenOverlayByCheckbox = true;
                        currentGhostState.activatedByGreenCheckboxes.add(featureId);
                    }

                    if (SIDEBAR_REVERSE_INTERACTION_MAPPING[featureId]) {
                        const mappedNames = SIDEBAR_REVERSE_INTERACTION_MAPPING[featureId];
                        if (mappedNames.includes(currentGhostRussianName) || mappedNames.includes(currentGhostEnglishName)) {
                            hasGrayOverlayByReverseMapping = true;
                            currentGhostState.activatedByGrayCheckboxes.add(featureId);
                        }
                    }
                });

                if (!(mimicGhost && ghost.name === mimicGhost.name)) {
                    const activeSpeedFilters = Array.from(activeSidebarCheckboxes).filter(id => SPEED_FILTER_IDS.includes(id));

                    let speedTriggersGray = false;
                    if (activeSpeedFilters.length > 0) {
                        const speeds = ghost.speed.split(/[\/-]/).map(s => parseFloat(s.trim()));

                        speedTriggersGray = true;
                        let anyMatch = false;
                        for (const speedValue of speeds) {
                            for (const filterId of activeSpeedFilters) {
                                if (isSpeedCategoryMatch(speedValue, filterId)) {
                                    anyMatch = true;
                                    break;
                                }
                            }
                            if (anyMatch) break;
                        }
                        speedTriggersGray = !anyMatch;

                        if (speedTriggersGray) {
                            activeSpeedFilters.forEach(id => currentGhostState.activatedByGrayCheckboxes.add(id));
                        }

                        if (activeSpeedFilters.length > 1) {
                            const isSlowActive = activeSpeedFilters.includes('speed-slow');
                            const isNormActive = activeSpeedFilters.includes('speed-norm');
                            const isFastActive = activeSpeedFilters.includes('speed-fast');

                            if (isSlowActive && isNormActive && isFastActive) {
                                speedTriggersGray = false;
                                currentGhostState.activatedByGrayCheckboxes.clear();
                            } else if (isSlowActive && isNormActive && !isFastActive) {
                                let allOver = speeds.every(s => s > 1.9);
                                speedTriggersGray = allOver;
                                if (allOver) {
                                    currentGhostState.activatedByGrayCheckboxes.clear();
                                    currentGhostState.activatedByGrayCheckboxes.add('speed-slow');
                                    currentGhostState.activatedByGrayCheckboxes.add('speed-norm');
                                }
                            } else if (isSlowActive && isFastActive && !isNormActive) {
                                let isExactly1_7 = speeds.length === 1 && speeds[0] === 1.7;
                                speedTriggersGray = isExactly1_7;
                                if (isExactly1_7) {
                                    currentGhostState.activatedByGrayCheckboxes.clear();
                                    currentGhostState.activatedByGrayCheckboxes.add('speed-slow');
                                    currentGhostState.activatedByGrayCheckboxes.add('speed-fast');
                                }
                            } else if (isNormActive && isFastActive && !isSlowActive) {
                                let allUnder = speeds.every(s => s <= 1.5);
                                speedTriggersGray = allUnder;
                                if (allUnder) {
                                    currentGhostState.activatedByGrayCheckboxes.clear();
                                    currentGhostState.activatedByGrayCheckboxes.add('speed-norm');
                                    currentGhostState.activatedByGrayCheckboxes.add('speed-fast');
                                }
                            }
                        }
                    }

                    hasGrayOverlayBySpeedFilter = speedTriggersGray;
                }
            }

            let newOverlayState = 'none';

            // --- ОБНОВЛЕННАЯ ЛОГИКА ПРИОРИТЕТОВ ---
            // Приоритет 1 (Высший): Серый оверлей от Hunt Sanity
            if (hasGrayOverlayByHuntSanity) {
                newOverlayState = 'gray';
            }
            // Приоритет 2: Серый оверлей от фильтров скорости
            else if (hasGrayOverlayBySpeedFilter) {
                newOverlayState = 'gray';
            }
            // Приоритет 3: Серый оверлей от обратного маппинга
            else if (hasGrayOverlayByReverseMapping) {
                newOverlayState = 'gray';
            }
            // Приоритет 4 (Низший): Зеленый оверлей от чекбоксов
            else if (hasGreenOverlayByCheckbox) {
                newOverlayState = 'green';
            }
            // Последнее: Приоритет ручных кликов (если ни один из чекбоксов не активен).
            else if (wasManualGreen) {
                newOverlayState = 'green';
            } else if (wasManualGray) {
                newOverlayState = 'gray';
            }

            if (newOverlayState !== currentGhostState.state) {
                currentGhostState.state = newOverlayState;
                card.dataset.overlayState = newOverlayState;
            } else {
                card.dataset.overlayState = newOverlayState;
            }
        });

        updateSidebarTextColors();
        updateSidebarCheckboxes();
    }

    /**
     * Обработчик для изменения состояния чекбокса в сайдбаре.
     * Добавляет или удаляет featureId из набора активных чекбосов.
     */
    function handleSidebarCheckboxChange(event) {
        const checkbox = event.target;
        // Используем data-feature-id, если он есть, иначе используем id чекбокса
        const featureId = checkbox.dataset.featureId || checkbox.id;
        const isChecked = checkbox.checked; // Текущее состояние чекбокса.

        if (isChecked) {
            activeSidebarCheckboxes.add(featureId); // Добавляем ID в набор активных.
        } else {
            activeSidebarCheckboxes.delete(featureId); // Удаляем ID из набора активных.
        }

        applyFiltersAndSort(); // Применяем фильтры и сортировку, чтобы обновить видимость.
        updateTableOverlaysFromCheckboxes(); // Обновляем оверлеи таблицы.
    }

    /**
     * Обновляет цвет текста в сайдбаре в зависимости от состояния оверлеев призраков.
     * Подсвечивает текст особенности, если соответствующий призрак активен (зеленый оверлей).
     */
    function updateSidebarTextColors() {
        document.querySelectorAll('#featureCheckboxes li').forEach(li => {
            const checkbox = li.querySelector('input[type="checkbox"]');
            if (!checkbox) return; // Если чекбокс не найден, пропускаем.

            const featureId = checkbox.dataset.featureId; // ID особенности.
            let shouldBeActiveText = false; // Флаг, указывающий, должен ли текст быть активным.

            // Пропускаем фильтры скорости, так как они не подсвечивают текст в сайдбаре.
            if (SPEED_FILTER_IDS.includes(featureId)) {
                li.classList.remove('active-text');
                return;
            }

            if (!allGhosts || allGhosts.length === 0) { // Убедимся, что данные призраков загружены.
                console.warn('GHOSTS_DATA_EMBEDDED не загружен в updateSidebarTextColors.');
                return;
            }

            const mimicGhost = allGhosts.find(g => { // Находим призрака "Мимик" для специальной логики.
                const names = parseGhostNames(g.name);
                return names.russian === "Мимик" || names.english === "Mimic";
            });

            // --- ЛОГИКА ПОДСВЕТКИ ДЛЯ МИМИКА ---
            // Если это Мимик и активный чекбокс не является "неподражаемой" особенностью.
            if (mimicGhost && !MIMIC_UNIMITATABLE_FEATURES.has(featureId)) {
                const mimicState = ghostOverlayStates.get(mimicGhost.name);
                if (mimicState && mimicState.state === 'green') {
                    // Проверяем, стал ли Мимик зеленым из-за этого конкретного чекбоса И если это не "неподражаемая" особенность.
                    if (mimicState.activatedByGreenCheckboxes.has(featureId)) {
                        shouldBeActiveText = true;
                    }
                    // Проверяем, стал ли Мимик зеленым вручную (без участия чекбосов) И если это не "неподражаемая" особенность.
                    else if (mimicState.activatedByGreenCheckboxes.size === 0 && (mimicState.wasManualGreen || mimicState.state === 'green')) {
                        shouldBeActiveText = true;
                    }
                }
            }
            // --- КОНЕЦ ЛОГИКИ ПОДСВЕТКИ ДЛЯ МИМИКА ---

            // Логика для обычных призраков (не Мимика, но те, что соответствуют чекбосу).
            const ghostNamesForFeature = SIDEBAR_FEATURE_GHOST_MAPPING[featureId];
            if (ghostNamesForFeature) {
                for (const ghostName of ghostNamesForFeature) {
                    const actualGhost = allGhosts.find(g => { // Ищем призраков по русскому или английскому имени.
                        const names = parseGhostNames(g.name);
                        return names.russian === ghostName || names.english === ghostName;
                    });
                    if (actualGhost) {
                        const actualGhostState = ghostOverlayStates.get(actualGhost.name);
                        if (actualGhostState && actualGhostState.state === 'green') { // Если обычный призрак зеленый (неважно, вручную или чекбосом), его функция в сайдбаре подсвечивается.
                            shouldBeActiveText = true;
                            break; // Если нашли хотя бы одного подходящего призрака, выходим из цикла.
                        }
                    }
                }
            }

            if (shouldBeActiveText) { // Применяем или удаляем класс 'active-text' для стилизации текста в сайдбаре.
                li.classList.add('active-text');
            } else {
                li.classList.remove('active-text');
            }
        });
    }

    /**
     * Обновляет состояние чекбосов в сайдбаре (отмечен/не отмечен)
     * на основе набора activeSidebarCheckboxes.
     */
    function updateSidebarCheckboxes() {
        document.querySelectorAll('#featureCheckboxes input[type="checkbox"]').forEach(checkbox => {
            const featureId = checkbox.dataset.featureId;
            checkbox.checked = activeSidebarCheckboxes.has(featureId); // Устанавливаем состояние 'checked'.
        });
        document.querySelectorAll('.speed-filter-checkboxes input[type="checkbox"]').forEach(checkbox => {
            const featureId = checkbox.dataset.featureId;
            checkbox.checked = activeSidebarCheckboxes.has(featureId);
        });
    }

    function setupFilterListeners() {
        // Выбираем новые элементы-контейнеры иконок улик в сайдбаре.
        const filterIconContainers = document.querySelectorAll('.filter-icon-container');
        filterIconContainers.forEach(container => {
            const featureKey = container.dataset.featureKey; // Используем data-feature-key.
            activeFilters[featureKey] = 'none'; // Инициализируем состояние фильтра как "нет".
            container.addEventListener('click', () => {
                const currentState = activeFilters[featureKey]; // Текущее состояние фильтра.
                if (currentState === 'none') { // Если фильтр неактивен, делаем его "включить".
                    activeFilters[featureKey] = 'include';
                    container.classList.add('filter-active'); // Добавляем класс для активного состояния.
                    container.classList.remove('filter-exclude'); // Удаляем класс для исключенного состояния.
                } else if (currentState === 'include') { // Если фильтр "включить", делаем его "исключить".
                    activeFilters[featureKey] = 'exclude';
                    container.classList.remove('filter-active');
                    container.classList.add('filter-exclude'); // Добавляем класс для исключенного состояния.
                } else { // Если фильтр "исключить", сбрасываем его в "нет".
                    activeFilters[featureKey] = 'none';
                    container.classList.remove('filter-active', 'filter-exclude'); // Удаляем все классы фильтра.
                }
                applyFiltersAndSort(); // Применяем фильтры и сортировку после изменения состояния.
            });
        });
    }






    /* ========================================================================== */
    /* --- ФУНКЦИОНАЛ ТАЙМЕРОВ --- */
    /* ========================================================================== */

    // Инициализация таймеров
    function initializeTimers() {
        for (const timerId in timerDurations) {
            timerCurrentTimes[timerId] = timerDurations[timerId];
            timerIntervals[timerId] = null; // Нет активного интервала изначально

            // Получаем ссылки на элементы DOM
            timerDisplayElements[timerId] = {
                bar: document.getElementById(`${timerId}TimerBar`),
                button: document.querySelector(`.timer-button[data-timer-id="${timerId}"]`),
                marks: document.querySelector(`#${timerId}TimerSection .timer-marks`),
                currentTimeDisplay: document.getElementById(`${timerId}CurrentTime`) // ДОБАВЛЕНО: получаем ссылку на элемент отображения текущего времени
            };

            // ДОБАВЛЕНО: Устанавливаем начальное значение времени таймера (максимальное)
            if (timerDisplayElements[timerId].currentTimeDisplay) {
                const initialMinutes = Math.floor(timerDurations[timerId] / (60 * 1000));
                const initialSeconds = Math.floor((timerDurations[timerId] % (60 * 1000)) / 1000);
                timerDisplayElements[timerId].currentTimeDisplay.textContent = `${initialMinutes.toString().padStart(2, '0')}:${initialSeconds.toString().padStart(2, '0')}`;
            }

            updateTimerDisplay(timerId); // Первоначальное обновление отображения
        }
    }

    // Обновление отображения таймера (ширина полосы и текст)
    function updateTimerDisplay(timerId) {
        const bar = timerDisplayElements[timerId].bar;
        const button = timerDisplayElements[timerId].button;
        const marksContainer = timerDisplayElements[timerId].marks;
        const currentTimeDisplay = timerDisplayElements[timerId].currentTimeDisplay; // ДОБАВЛЕНО: получаем элемент для текущего времени

        const remainingTime = timerCurrentTimes[timerId];
        const totalDuration = timerDurations[timerId];

        // Вычисляем ширину полосы (слева направо)
        const percentage = (remainingTime / totalDuration) * 100;
        if (bar) {
            bar.style.width = `${100 - percentage}%`; // ИЗМЕНЕНО: Теперь полоса будет расти слева направо
        }

        // Обновляем текст кнопки
        if (button) {
            if (timerIntervals[timerId]) {
                button.innerHTML = '&#9209;'; // Символ паузы
            } else {
                button.innerHTML = '&#9658;'; // Символ воспроизведения
            }
        }

        // ДОБАВЛЕНО/ИЗМЕНЕНО: Обновляем текущее время в формате мм:сс
        if (currentTimeDisplay) {
            let displayTime;
            if (timerIntervals[timerId]) { // Если таймер запущен, показываем оставшееся время
                displayTime = remainingTime;
            } else { // Если таймер остановлен, показываем общую длительность
                displayTime = totalDuration;
            }
            const minutes = Math.floor(displayTime / (60 * 1000));
            const seconds = Math.floor((displayTime % (60 * 1000)) / 1000);
            currentTimeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }

        // Обновляем метки времени (локализация)
        if (marksContainer) {
            marksContainer.querySelectorAll('.timer-mark .mark-label').forEach(label => {
                const originalLabel = label.dataset.originalString;
                label.textContent = getLocalizedText(originalLabel, currentLang);
            });
        }
    }

    function startTimer(timerId) {
        if (timerIntervals[timerId]) {
            stopTimer(timerId); // Останавливаем, если уже запущен
            return;
        }

        timerIntervals[timerId] = setInterval(() => {
            timerCurrentTimes[timerId] -= 100; // Уменьшаем на 100 мс
            if (timerCurrentTimes[timerId] <= 0) {
                timerCurrentTimes[timerId] = 0;
                resetTimer(timerId); // Таймер закончился, сбрасываем его полностью, чтобы можно было запустить снова
                // Опционально: воспроизвести звук или показать уведомление по окончании таймера
            }
            updateTimerDisplay(timerId);
        }, 100); // Обновляем каждые 100 мс для более плавной анимации

        updateTimerDisplay(timerId); // Обновляем немедленно при запуске
    }

    // Остановка таймера
    function stopTimer(timerId) {
        clearInterval(timerIntervals[timerId]);
        timerIntervals[timerId] = null;
        updateTimerDisplay(timerId);
    }

    // Сброс таймера
    function resetTimer(timerId) {
        stopTimer(timerId);
        timerCurrentTimes[timerId] = timerDurations[timerId];
        updateTimerDisplay(timerId);
    }

    // Переключение таймера (запуск/остановка/сброс)
    function toggleTimer(timerId) {
        if (timerIntervals[timerId]) {
            // Если таймер запущен, останавливаем его и сбрасываем до начального значения
            resetTimer(timerId);
        } else {
            // Если таймер остановлен или на паузе (или уже сброшен), запускаем его
            startTimer(timerId);
        }
    }

    // Добавление слушателей событий для кнопок таймера
    function setupTimerListeners() {
        document.querySelectorAll('.timer-button').forEach(button => {
            const timerId = button.dataset.timerId;
            button.addEventListener('click', () => toggleTimer(timerId));
            // Добавляем правый клик для сброса (опционально, но полезно)
            button.addEventListener('contextmenu', (e) => {
                e.preventDefault(); // Предотвращаем стандартное контекстное меню
                resetTimer(timerId);
            });
        });
    }

    /* ========================================================================== */
    /* --- ЛОКАЛИЗАЦИЯ СТАТИЧЕСКИХ ЭЛЕМЕНТОВ --- */
    /* ========================================================================== */

    // Функция для динамического обновления текстового содержимого элементов на странице.
    // Обновляет только те элементы, которые имеют атрибут 'data-lang-key' (например, в сайдбаре и заголовках таблицы).
    function updateLocalizedElements() {
        document.querySelectorAll('#featureCheckboxes [data-lang-key]').forEach(element => { // Обновляем текстовое содержимое элементов в сайдбаре.
            const originalText = element.dataset.originalString; // Читаем из нового data-атрибута.
            if (originalText) { // Проверяем, что атрибут существует.
                element.textContent = getLocalizedText(originalText, currentLang);
            }
        });
        // Заголовки таблицы больше не локализуются, так как они перемещены.
    }

    // Функция для локализации статических элементов в сайдбаре.
    function localizeStaticElements() {
        // Локализуем заголовок секции скорости
        const speedTitleElement = document.querySelector('.speed-control-section h4');
        if (speedTitleElement) {
            const originalString = speedTitleElement.dataset.originalString || speedTitleElement.textContent;
            speedTitleElement.textContent = getLocalizedText(originalString, currentLang);
        }
        // Локализуем метки для новых чекбосов скорости
        document.querySelectorAll('.speed-filter-checkboxes label span[data-lang-key]').forEach(span => {
            const originalString = span.dataset.originalString;
            if (originalString) {
                span.textContent = getLocalizedText(originalString, currentLang);
            }
        });

        // Локализуем текст для поля рассудка охоты (находится внутри span в label)
        document.querySelectorAll('.hunt-sanity-control label span[data-lang-key="hunt-sanity-text"]').forEach(span => {
            const originalString = span.dataset.originalString;
            if (originalString) {
                span.textContent = getLocalizedText(originalString, currentLang);
            }
        });

        // Локализуем заголовки таймеров
        document.querySelectorAll('.timer-section h4').forEach(h4 => {
            const originalString = h4.dataset.originalString || h4.textContent;
            if (originalString) {
                h4.textContent = getLocalizedText(originalString, currentLang);
            }
        });

        // Локализуем метки таймеров (имена призраков)
        document.querySelectorAll('.timer-marks .mark-label').forEach(label => {
            const originalString = label.dataset.originalString; // Используем data-original-string
            if (originalString) {
                label.textContent = getLocalizedText(originalString, currentLang);
            }
        });

        // Локализуем разделители карт.
        document.querySelectorAll('#mapList li.map-divider').forEach(li => {
            const originalString = li.dataset.originalString || li.textContent;
            if (originalString) {
                li.textContent = getLocalizedText(originalString, currentLang);
            }
        });
    }


    /* ========================================================================== */
    /* --- ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ (DOMContentLoaded) --- */
    /* ========================================================================== */

    // Этот код будет выполнен только после того, как весь HTML-документ будет полностью загружен.
    // Запускаем загрузку и отрисовку данных призраков.
    await fetchAndRenderGhosts();

    // Настраиваем слушатели событий для заголовков фильтров (теперь иконок в сайдбаре).
    setupFilterListeners();

    // Добавляем слушатели событий 'change' для всех чекбосов особенностей в сайдбаре.
    document.querySelectorAll('#featureCheckboxes input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', handleSidebarCheckboxChange);
    });

    // Добавляем слушатели событий 'change' для новых чекбосов скорости
    document.querySelectorAll('.speed-filter-checkboxes input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', handleSidebarCheckboxChange);
    });
// Находим новую кнопку для воспроизведения speed-sound
    const playSpeedSoundButton = document.getElementById('playSpeedSoundButton');
    if (playSpeedSoundButton) {
        playSpeedSoundButton.addEventListener('click', () => {
            // Заданный фиксированный множитель скорости
            const fixedMultiplier = 1.7;
            // Вычисляем финальную скорость воспроизведения
            const finalPlaybackRate = fixedMultiplier * currentOverallPlaybackRate;
            // Воспроизводим аудиофайл speed-sound с рассчитанной скоростью
            playAudio(AUDIO_FILES["speed-sound"], finalPlaybackRate);
            console.log(`Playing speed-sound at a rate of: ${finalPlaybackRate}`);
        });
    }
	
    // Получаем элементы списка для аудио кнопок по их data-feature-id.
    const radioLi = document.querySelector('li label input[data-feature-id="radio-hiss"]')?.closest('li');
    const microphoneLi = document.querySelector('li label input[data-feature-id="microphone-scream"]')?.closest('li');

    if (radioLi) {
        createAudioPlayButton(radioLi, AUDIO_FILES["radio-hiss"], 'Проиграть уникальное шипение', 'Play unique hiss');
    }

    if (microphoneLi) {
        createAudioPlayButton(microphoneLi, AUDIO_FILES["microphone-scream"], 'Проиграть уникальный крик', 'Play unique scream');
    }


    // Обновляем локализованные элементы после загрузки DOM.
    updateLocalizedElements();

    // Обработчик события клика для кнопки переключения языка.
    if (languageToggle) {
        languageToggle.addEventListener('click', () => {
            let newLang = (document.documentElement.dataset.defaultLang === 'ru') ? 'en' : 'ru'; // Определяем новый язык.
            document.documentElement.dataset.defaultLang = newLang; // Обновляем атрибут 'data-default-lang'.
            currentLang = newLang; // Обновляем значение переменной currentLang.

            languageToggle.textContent = 'LNG'; // Обновляем текст на самой кнопке.

            updateLocalizedElements(); // Обновляет сайдбар.
            updateGhostCardTexts(); // Обновляет текст в карточках призраков.
            populateMapList(); // Перерисовывает список карт с новым языком.
            localizeStaticElements(); // Обновляем статические элементы, такие как заголовки секций.
        });
    }

    // Обработчик события для ползунка скорости.
    const speedSlider = document.getElementById('speedSlider');
    if (speedSlider) {
        speedSlider.addEventListener('input', (event) => {
            const sliderIndex = parseInt(event.target.value);
            currentOverallPlaybackRate = SPEED_MULTIPLIERS[sliderIndex];
            console.log(`Overall playback rate set to: ${currentOverallPlaybackRate}`);
            // Обновляем тексты карточек призраков, чтобы обновить заголовки кнопок воспроизведения.
            updateGhostCardTexts();
        });
    }

    // Инициализация и настройка таймеров
    initializeTimers();
    setupTimerListeners();

    // --- СЮДА ДОБАВЛЕН ОБРАБОТЧИК ДЛЯ HUNT SANITY INPUT ---
    if (huntSanityInput) {
        huntSanityInput.addEventListener('input', () => {
            const value = huntSanityInput.value.trim();
            if (value === '') {
                currentHuntSanityThreshold = null;
            } else {
                const numValue = parseFloat(value);
                // Базовая валидация для чисел 0-100
                if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
                    currentHuntSanityThreshold = numValue;
                } else {
                    currentHuntSanityThreshold = null; // Недопустимый ввод
                }
            }
            updateTableOverlaysFromCheckboxes(); // Пересчитываем оверлеи
        });
    }
    // --- КОНЕЦ ОБРАБОТЧИКА ДЛЯ HUNT SANITY INPUT ---

    // Вызываем функцию для заполнения списка карт при загрузке страницы.
    populateMapList();

    // Обработчик для кнопки открытия модального окна (если она есть).
    if (openMapModalBtn) {
        openMapModalBtn.addEventListener('click', () => {
            if (mapModal) {
                mapModal.style.display = 'block';
            }
        });
    }

    // Обработчик для кнопки закрытия модального окна.
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            if (mapModal) {
                mapModal.style.display = 'none';
            }
        });
    }

    // Обработчик для закрытия модального окна при клике вне его содержимого.
    window.addEventListener('click', (event) => {
        if (event.target === mapModal) {
            mapModal.style.display = 'none';
        }
    });

    localizeStaticElements(); // Начальная локализация статических элементов.

});
