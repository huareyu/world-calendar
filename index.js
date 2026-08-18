import { getContext, extension_settings, saveMetadataDebounced } from '/scripts/extensions.js';
import {
    chat_metadata,
    doNavbarIconClick,
    eventSource,
    event_types,
    extension_prompt_roles,
    extension_prompt_types,
    saveSettings as saveAppSettings,
    saveSettingsDebounced,
    setExtensionPrompt,
} from '/script.js';
import { ConnectionManagerRequestService } from '/scripts/extensions/shared.js';
import { power_user } from '/scripts/power-user.js';
import { user_avatar } from '/scripts/personas.js';
import {
    addDays,
    aggregateGeneratedEvents,
    aggregateWorldEvents,
    compareDateTime,
    daysInMonth,
    eventKey,
    formatDate,
    formatMarker,
    holidaysForRange,
    normalizeDate,
    parseMarkers,
    timePhase,
    toSerial,
    validateProfile,
    weatherKind,
    weekdayIndex,
} from './core.mjs';

const EXTENSION_KEY = 'world-calendar';
const META_KEY = 'world_calendar';
const PROMPT_KEY = 'world_calendar_context';

const GREGORIAN = {
    id: 'gregorian',
    name: 'Григорианский календарь',
    weekdays: ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'],
    months: [
        ['Январь', 31], ['Февраль', 28], ['Март', 31], ['Апрель', 30],
        ['Май', 31], ['Июнь', 30], ['Июль', 31], ['Август', 31],
        ['Сентябрь', 30], ['Октябрь', 31], ['Ноябрь', 30], ['Декабрь', 31],
    ].map(([name, days]) => ({ name, days })),
    epochWeekday: 0,
    leap: { enabled: true, every: 4, exceptEvery: 100, includeEvery: 400, month: 2, extraDays: 1 },
    holidays: [
        { month: 1, day: 1, title: 'Новый год', description: '' },
    ],
};

const TAMRIEL = {
    id: 'tamriel',
    name: 'Тамриэль',
    weekdays: ['Морндас', 'Тирдас', 'Миддас', 'Турдас', 'Фредас', 'Лордас', 'Сандас'],
    months: [
        ['Утренняя звезда', 31], ['Восход солнца', 28], ['Первое зерно', 31], ['Рука дождя', 30],
        ['Второе зерно', 31], ['Середина года', 30], ['Высокое солнце', 31], ['Последнее зерно', 31],
        ['Домашний огонь', 30], ['Морозопад', 31], ['Закат солнца', 30], ['Вечерняя звезда', 31],
    ].map(([name, days]) => ({ name, days })),
    epochWeekday: 0,
    leap: { enabled: true, every: 4, exceptEvery: 0, includeEvery: 0, month: 2, extraDays: 1 },
    holidays: [],
};

const GREGORIAN_EN = {
    ...cloneProfileData(GREGORIAN),
    id: 'gregorian-en',
    name: 'Gregorian Calendar',
    weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    months: [
        ['January', 31], ['February', 28], ['March', 31], ['April', 30],
        ['May', 31], ['June', 30], ['July', 31], ['August', 31],
        ['September', 30], ['October', 31], ['November', 30], ['December', 31],
    ].map(([name, days]) => ({ name, days })),
    holidays: [{ month: 1, day: 1, title: "New Year's Day", description: '' }],
};

const TAMRIEL_EN = {
    id: 'tamriel-en',
    name: 'Tamriel Calendar',
    weekdays: ['Morndas', 'Tirdas', 'Middas', 'Turdas', 'Fredas', 'Loredas', 'Sundas'],
    months: [
        ['Morning Star', 31], ["Sun's Dawn", 28], ['First Seed', 31], ["Rain's Hand", 30],
        ['Second Seed', 31], ['Mid Year', 30], ["Sun's Height", 31], ['Last Seed', 31],
        ['Hearthfire', 30], ['Frostfall', 31], ["Sun's Dusk", 30], ['Evening Star', 31],
    ].map(([name, days]) => ({ name, days })),
    epochWeekday: 0,
    leap: { enabled: true, every: 4, exceptEvery: 0, includeEvery: 0, month: 2, extraDays: 1 },
    holidays: [],
};

function cloneProfileData(value) {
    return JSON.parse(JSON.stringify(value));
}

const DEFAULT_SETTINGS = {
    enabled: true,
    injectPrompt: true,
    weatherTracking: true,
    animateWeather: true,
    upcomingDays: 30,
    injectionDepth: 4,
    aiMaxTokens: 8192,
    uiLanguage: 'ru',
    promptLanguage: 'ru',
    profiles: [GREGORIAN, TAMRIEL, GREGORIAN_EN, TAMRIEL_EN],
};

const TEXT = {
    ru: {
        title: 'Календарь мира', today: 'Сегодня', events: 'События', calendar: 'Календарь', worlds: 'Миры',
        close: 'Закрыть', weather: 'Погода', notSet: 'Не установлена', editWeather: 'Изменить погоду',
        upcoming: 'Ближайшее', event: 'Событие', noUpcoming: 'Впереди пока ничего не запланировано',
        currentTime: 'Текущее время мира', set: 'Установить', holiday: 'Праздник', fromStory: 'Из истории', personal: 'Личное',
        restore: 'Вернуть', completed: 'Выполнено', remove: 'Удалить', worldEvents: 'События мира', add: 'Добавить', noEvents: 'Событий пока нет',
        calendarSystem: 'Календарная система', copy: 'Копия', chatCalendar: 'Календарь этого чата', editProfile: 'Редактировать профиль',
        name: 'Название', weekdaysHelp: 'Дни недели, через запятую', monthsHelp: 'Месяцы, по одному на строку: название | дней',
        holidaysHelp: 'Праздники: день.месяц | название | описание', firstWeekday: 'Первый день недели', leapCycle: 'Високосный цикл',
        leapMonth: 'Месяц прибавки', extraDays: 'Доп. дней', leapExcept: 'Исключать каждый N-й год', leapInclude: 'Но включать каждый N-й',
        saveProfile: 'Сохранить профиль', profileSaved: 'Профиль календаря сохранён', profileSaveError: 'Не удалось сохранить профиль', delete: 'Удалить', enabled: 'Расширение включено', inject: 'Добавлять календарь в промпт',
        trackWeather: 'Отслеживать погоду', animateWeather: 'Анимировать погоду', uiLanguage: 'Язык интерфейса', promptLanguage: 'Язык инжекта', injectionDepth: 'Глубина инжекта',
        generateAI: 'Создать профиль с ИИ', newEvent: 'Новое событие', editEvent: 'Изменить событие', description: 'Описание', day: 'День', month: 'Месяц', year: 'Год', time: 'Время', save: 'Сохранить',
        weatherPrompt: 'Погода в текущей сцене. Оставьте пустым, чтобы снова брать её из сообщений:',
        onlyProfile: 'Нельзя удалить единственный профиль.', deleteProfile: 'Удалить профиль',
        aiTitle: 'Генератор мира', aiSetting: 'Какой сеттинг нужен?', aiSettingPlaceholder: 'Например: мрачное фэнтези с двумя лунами, 10 месяцами и неделей из 8 дней…',
        connectionProfile: 'Профиль подключения', noProfiles: 'Нет профилей подключения', outputLanguage: 'Язык нового профиля',
        analyzeChat: 'Анализировать последние сообщения', messageCount: 'Количество сообщений', includeCharacter: 'Добавить описание персонажа',
        includePersona: 'Добавить описание персоны', aiMaxTokens: 'Максимум токенов ответа', generate: 'Сгенерировать', generating: 'Генерация…', generated: 'Профиль мира создан', aiError: 'Не удалось создать профиль',
        worldChronicle: 'Хроника мира', noDayEvents: 'На этот день нет праздников или событий', addForDay: 'Добавить событие', majorEvent: 'Мировое событие',
        entryType: 'Тип записи', recurringHoliday: 'Праздник', oneTimeEvent: 'Событие', repeatsYearly: 'Повторяется каждый год', calendarLegend: 'Обозначения',
    },
    en: {
        title: 'World Calendar', today: 'Today', events: 'Events', calendar: 'Calendar', worlds: 'Worlds',
        close: 'Close', weather: 'Weather', notSet: 'Not set', editWeather: 'Edit weather',
        upcoming: 'Upcoming', event: 'Event', noUpcoming: 'Nothing is scheduled yet',
        currentTime: 'Current world time', set: 'Set', holiday: 'Holiday', fromStory: 'From story', personal: 'Personal',
        restore: 'Restore', completed: 'Complete', remove: 'Remove', worldEvents: 'World events', add: 'Add', noEvents: 'No events yet',
        calendarSystem: 'Calendar system', copy: 'Copy', chatCalendar: 'Calendar for this chat', editProfile: 'Edit profile',
        name: 'Name', weekdaysHelp: 'Weekdays, comma-separated', monthsHelp: 'Months, one per line: name | days',
        holidaysHelp: 'Holidays: day.month | name | description', firstWeekday: 'First weekday index', leapCycle: 'Leap cycle',
        leapMonth: 'Leap month', extraDays: 'Extra days', leapExcept: 'Skip every Nth year', leapInclude: 'But include every Nth',
        saveProfile: 'Save profile', profileSaved: 'Calendar profile saved', profileSaveError: 'Could not save profile', delete: 'Delete', enabled: 'Extension enabled', inject: 'Inject calendar into prompt',
        trackWeather: 'Track weather', animateWeather: 'Animate weather', uiLanguage: 'Interface language', promptLanguage: 'Injection language', injectionDepth: 'Injection depth',
        generateAI: 'Create profile with AI', newEvent: 'New event', editEvent: 'Edit event', description: 'Description', day: 'Day', month: 'Month', year: 'Year', time: 'Time', save: 'Save',
        weatherPrompt: 'Weather in the current scene. Leave empty to read it from messages again:',
        onlyProfile: 'The only profile cannot be deleted.', deleteProfile: 'Delete profile',
        aiTitle: 'World generator', aiSetting: 'What setting do you want?', aiSettingPlaceholder: 'For example: dark fantasy with two moons, 10 months, and an eight-day week…',
        connectionProfile: 'Connection profile', noProfiles: 'No connection profiles', outputLanguage: 'New profile language',
        analyzeChat: 'Analyze recent messages', messageCount: 'Message count', includeCharacter: 'Include character definition',
        includePersona: 'Include persona definition', aiMaxTokens: 'Maximum response tokens', generate: 'Generate', generating: 'Generating…', generated: 'World profile created', aiError: 'Could not create profile',
        worldChronicle: 'World chronicle', noDayEvents: 'No holidays or events on this day', addForDay: 'Add event', majorEvent: 'World event',
        entryType: 'Entry type', recurringHoliday: 'Holiday', oneTimeEvent: 'Event', repeatsYearly: 'Repeats every year', calendarLegend: 'Legend',
    },
};

function tr(key) {
    return TEXT[settings?.uiLanguage === 'en' ? 'en' : 'ru'][key] || key;
}

let settings;
let activeTab = 'today';
let viewDate = null;
let draftProfileId = '';

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function loadSettings() {
    const stored = extension_settings[EXTENSION_KEY] || {};
    settings = { ...clone(DEFAULT_SETTINGS), ...stored };
    settings.profiles = Array.isArray(stored.profiles) && stored.profiles.length ? stored.profiles : clone(DEFAULT_SETTINGS.profiles);
    for (const defaultProfile of DEFAULT_SETTINGS.profiles) {
        if (!settings.profiles.some(profile => profile.id === defaultProfile.id)) settings.profiles.push(clone(defaultProfile));
    }
    settings.uiLanguage = settings.uiLanguage === 'en' ? 'en' : 'ru';
    settings.promptLanguage = settings.promptLanguage === 'en' ? 'en' : 'ru';
    settings.injectionDepth = Math.max(0, Math.min(100, Number(settings.injectionDepth ?? 4)));
    settings.aiMaxTokens = Math.max(1024, Math.min(32768, Number(settings.aiMaxTokens ?? 8192)));
    extension_settings[EXTENSION_KEY] = settings;
}

function saveSettings() {
    extension_settings[EXTENSION_KEY] = settings;
    saveSettingsDebounced();
}

function getProfile(id) {
    return settings.profiles.find(profile => profile.id === id) || settings.profiles[0];
}

function getChatState() {
    if (!chat_metadata[META_KEY] || typeof chat_metadata[META_KEY] !== 'object') {
        chat_metadata[META_KEY] = {
            profileId: settings.profiles[0].id,
            fallbackDate: { year: 2025, month: 1, day: 1, hour: 8, minute: 0 },
            markerFloor: 0,
            weatherOverride: '',
            weatherOverrideAt: -1,
            manualEvents: [],
            eventOverrides: {},
            dismissedEvents: [],
            seenEventKeys: [],
        };
    }
    const state = chat_metadata[META_KEY];
    state.profileId = getProfile(state.profileId).id;
    state.manualEvents = Array.isArray(state.manualEvents) ? state.manualEvents : [];
    state.eventOverrides = state.eventOverrides || {};
    state.dismissedEvents = Array.isArray(state.dismissedEvents) ? state.dismissedEvents : [];
    state.seenEventKeys = Array.isArray(state.seenEventKeys) ? state.seenEventKeys : [];
    state.markerFloor = Math.max(0, Number(state.markerFloor || 0));
    if (!Number.isFinite(Number(state.weatherOverrideAt))) {
        state.weatherOverrideAt = Math.max(-1, (getContext()?.chat?.length || 0) - 1);
    }
    return state;
}

function saveChatState() {
    saveMetadataDebounced();
}

function assistantMessages() {
    return (getContext()?.chat || []).filter((message, index) => !message.is_user && index >= getChatState().markerFloor);
}

function deriveWorld() {
    const state = getChatState();
    const profile = getProfile(state.profileId);
    let date = normalizeDate(profile, state.fallbackDate || {});
    let weather = '';
    let weatherMarkerAt = -1;
    for (const [index, message] of (getContext()?.chat || []).entries()) {
        if (message.is_user || index < state.markerFloor) continue;
        const parsed = parseMarkers(message.mes);
        if (parsed.datetime) date = normalizeDate(profile, parsed.datetime);
        if (parsed.weather) {
            weather = parsed.weather;
            weatherMarkerAt = index;
        }
    }
    if (state.weatherOverride && weatherMarkerAt <= Number(state.weatherOverrideAt)) weather = state.weatherOverride;
    return { state, profile, date, weather };
}

function mergedEvents(world, includeHolidays = true) {
    const { state, profile, date } = world;
    const dismissed = new Set(state.dismissedEvents);
    const generated = aggregateGeneratedEvents(assistantMessages())
        .filter(event => !dismissed.has(event.key))
        .map(event => ({
            ...event,
            date: event.date ? normalizeDate(profile, event.date) : null,
            done: state.eventOverrides[event.key] ?? event.done,
        }));
    const manual = state.manualEvents.map(event => ({ ...event, source: 'manual', key: event.id }));
    const holidays = includeHolidays ? holidaysForRange(profile, date, Math.max(370, Number(settings.upcomingDays || 30))) : [];
    return [...manual, ...generated, ...holidays];
}

function worldChronicle(world) {
    return aggregateWorldEvents(assistantMessages()).map(event => ({
        ...event,
        date: normalizeDate(world.profile, event.date),
    }));
}

function sameDay(left, right) {
    return left && right && left.year === right.year && left.month === right.month && left.day === right.day;
}

function holidayKey(holiday) {
    return `holiday-${holiday.month}-${holiday.day}-${eventKey(holiday.title)}`;
}

function eventsForDate(world, date) {
    const regular = mergedEvents(world, false).filter(event => sameDay(event.date, date));
    const chronicle = worldChronicle(world).filter(event => sameDay(event.date, date));
    const holidays = (world.profile.holidays || [])
        .filter(holiday => Number(holiday.month) === date.month && Number(holiday.day) === date.day)
        .map(holiday => ({ ...holiday, date: { ...date, hour: 0, minute: 0 }, source: 'holiday', key: holidayKey(holiday) }));
    return [...holidays, ...regular, ...chronicle].sort((left, right) => compareDateTime(world.profile, left.date, right.date));
}

function upcomingEvents(world) {
    const maxDays = Math.max(1, Number(settings.upcomingDays || 30));
    const endSerial = toSerial(world.profile, addDays(world.profile, world.date, maxDays));
    return mergedEvents(world)
        .filter(event => event.date && !event.done)
        .filter(event => {
            const serial = toSerial(world.profile, event.date);
            return serial >= toSerial(world.profile, world.date) && serial <= endSerial;
        })
        .sort((left, right) => compareDateTime(world.profile, left.date, right.date));
}

function buildPrompt(world) {
    const { profile, date, weather } = world;
    const today = formatDate(profile, date, true);
    const month = profile.months[date.month - 1];
    const nextDate = addDays(profile, { ...date, day: daysInMonth(profile, date.year, date.month) }, 1);
    const upcoming = upcomingEvents(world).slice(0, 12);
    const recentWorldEvents = worldChronicle(world).slice(-10);
    const eventLines = upcoming.length
        ? upcoming.map(event => `- ${formatDate(profile, event.date, true)}: ${event.title}${event.description ? ` — ${event.description}` : ''}`).join('\n')
        : '- нет';
    const months = profile.months.map((item, index) => `${index + 1}) ${item.name}, ${daysInMonth(profile, date.year, index + 1)} ${settings.promptLanguage === 'en' ? 'days' : 'дн.'}`).join('; ');
    const chronicleLines = recentWorldEvents.length
        ? recentWorldEvents.map(event => `- ${formatDate(profile, event.date, true)}: ${event.title}${event.description ? ` — ${event.description}` : ''}`).join('\n')
        : (settings.promptLanguage === 'en' ? '- none' : '- нет');

    if (settings.promptLanguage === 'en') {
        return `[World Calendar — internal context]
Calendar system: ${profile.name}.
Weekdays in order: ${profile.weekdays.join(', ')}.
Months: ${months}
Current date and time: ${today}. The current month is ${month.name}; its last day is followed by ${profile.months[nextDate.month - 1].name}.
Weather: ${weather || 'not set'}.
Upcoming holidays and events:
${upcoming.length ? eventLines : '- none'}
Recent major events in the world chronicle:
${chronicleLines}

At the very end of every response, append a hidden metadata footer. Its first line must be exactly one current time marker:
${formatMarker(date)}
Advance time only as far as the scene implies. Use the numeric month index of this calendar system.
${settings.weatherTracking ? 'Its second line is REQUIRED, even when the weather has not changed: <!--weather:short current weather description-->. Always emit exactly one weather marker. Preserve weather continuity and change it only when the scene plausibly implies a change.' : ''}
When the scene explicitly schedules a new one-time event, append <!--event:add|Title|HH:MM DD.MM.YYYY|Short description-->.
When an event is completed or cancelled, use <!--event:done|Title--> or <!--event:remove|Title-->.
ONLY when the current scene contains a rare, major event with lasting consequences for a city, faction, nation, or the wider world, append <!--worldevent:add|Title|HH:MM DD.MM.YYYY|Concise historical summary-->.
Suitable world events include wars beginning or ending, coronations, coups, major disasters, city-wide festivals or tournaments, discoveries, regime changes, and the fall or founding of important institutions.
Do NOT create worldevent markers for conversations, dates, ordinary meetings, personal promises, routine travel, minor fights, purchases, moods, or everyday plans. When uncertain, do not add one. Never duplicate an event already listed in the chronicle.
Never display or explain these internal comments in the roleplay text.`;
    }

    return `[World Calendar — служебный контекст]
Календарная система: ${profile.name}.
Дни недели по порядку: ${profile.weekdays.join(', ')}.
Месяцы: ${months}
Сейчас: ${today}. Текущий месяц: ${month.name}; после его последнего дня наступает ${profile.months[nextDate.month - 1].name}.
Погода: ${weather || 'не установлена'}.
Ближайшие праздники и события:
${eventLines}
Недавние крупные события в хронике мира:
${chronicleLines}

В самом конце каждого ответа добавляй скрытый служебный футер. Его первая строка — ровно одна актуальная метка времени:
${formatMarker(date)}
Продвигай время только настолько, насколько это следует из сцены. Используй числовой номер месяца этой системы.
${settings.weatherTracking ? 'Вторая строка ОБЯЗАТЕЛЬНА, даже если погода не изменилась: <!--weather:краткое описание текущей погоды-->. Всегда выводи ровно одну метку погоды. Сохраняй погодную непрерывность и меняй погоду только тогда, когда это правдоподобно следует из сцены.' : ''}
Если в сцене явно назначили новое разовое событие, добавь <!--event:add|Название|HH:MM DD.MM.YYYY|Краткое описание-->.
Если событие завершилось или было отменено, используй <!--event:done|Название--> или <!--event:remove|Название-->.
ТОЛЬКО если в текущей сцене произошло редкое масштабное событие с длительными последствиями для города, фракции, государства или всего мира, добавь <!--worldevent:add|Название|HH:MM DD.MM.YYYY|Краткая историческая сводка-->.
Подходящие мировые события: начало или конец войны, коронация, переворот, крупная катастрофа, общегородской фестиваль или турнир, важное открытие, смена режима, падение или основание значимой организации.
НЕ используй worldevent для разговоров, свиданий, обычных встреч, личных обещаний, рутинных поездок, мелких драк, покупок, настроений и бытовых планов. Если сомневаешься — не добавляй. Не дублируй события, уже перечисленные в хронике.
Не показывай и не объясняй эти служебные комментарии в тексте RP.`;
}

function syncPrompt() {
    const value = settings?.enabled && settings.injectPrompt ? buildPrompt(deriveWorld()) : '';
    setExtensionPrompt(
        PROMPT_KEY,
        value,
        extension_prompt_types.IN_CHAT,
        settings?.injectionDepth || 0,
        false,
        extension_prompt_roles.SYSTEM,
    );
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function icon(name) {
    return `<i class="fa-solid fa-${name}"></i>`;
}

function syncViewportHeight() {
    const height = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--worldcal-viewport-height', `${Math.max(240, Math.round(height))}px`);
}

function focusModalField(modal, selector) {
    if (window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 768) return;
    requestAnimationFrame(() => modal.querySelector(selector)?.focus({ preventScroll: true }));
}

function createUI() {
    if (document.getElementById('worldcal-root')) return;
    const anchor = document.getElementById('extensions-settings-button');
    if (!anchor) {
        setTimeout(createUI, 500);
        return;
    }
    const root = document.createElement('div');
    root.id = 'worldcal-root';
    root.className = 'drawer';
    root.innerHTML = `
        <div id="worldcal-toggle" class="drawer-toggle" title="${tr('title')}">
            <div class="drawer-icon fa-solid fa-calendar-days fa-fw closedIcon interactable" tabindex="0"></div>
            <span id="worldcal-notification" class="worldcal-notification" hidden></span>
        </div>
        <section id="worldcal-panel" class="drawer-content closedDrawer worldcal-panel">
            <header class="worldcal-header">
                <div>
                    <div id="worldcal-time" class="worldcal-time">08:00</div>
                    <div id="worldcal-date" class="worldcal-date"></div>
                </div>
                <button class="worldcal-icon-btn" data-action="close" type="button" title="${tr('close')}">${icon('xmark')}</button>
            </header>
            <nav class="worldcal-tabs">
                <button data-tab="today" class="active" type="button">${icon('cloud-sun')} ${tr('today')}</button>
                <button data-tab="events" type="button">${icon('list-check')} ${tr('events')}</button>
                <button data-tab="calendar" type="button">${icon('calendar')} ${tr('calendar')}</button>
                <button data-tab="worlds" type="button">${icon('globe')} ${tr('worlds')}</button>
            </nav>
            <div id="worldcal-content" class="worldcal-content"></div>
        </section>`;
    anchor.after(root);
    bindRootEvents(root);
    render();
}

function bindRootEvents(root) {
    root.querySelector('#worldcal-toggle').addEventListener('click', async event => {
        event.stopPropagation();
        viewDate = { ...deriveWorld().date };
        render();
        await doNavbarIconClick.call(event.currentTarget);
    });
    root.addEventListener('click', handleClick);
    root.addEventListener('change', handleChange);
    root.addEventListener('submit', handleSubmit);
}

function setDrawerOpen(root, open) {
    const panel = root.querySelector('#worldcal-panel');
    const drawerIcon = root.querySelector('.drawer-icon');
    panel.classList.toggle('openDrawer', open);
    panel.classList.toggle('closedDrawer', !open);
    panel.style.removeProperty('display');
    drawerIcon.classList.toggle('openIcon', open);
    drawerIcon.classList.toggle('closedIcon', !open);
}

function render() {
    syncPrompt();
    const root = document.getElementById('worldcal-root');
    if (!root) return;
    const world = deriveWorld();
    const notification = root.querySelector('#worldcal-notification');
    const time = root.querySelector('#worldcal-time');
    const date = root.querySelector('#worldcal-date');
    const generatedKeys = aggregateGeneratedEvents(assistantMessages()).map(event => event.key);
    const chronicleKeys = worldChronicle(world).map(event => event.key);
    const seen = new Set(world.state.seenEventKeys);
    const hasUnseen = [...generatedKeys, ...chronicleKeys].some(key => !seen.has(key));
    const hasActive = mergedEvents(world, false).some(event => !event.done)
        || upcomingEvents(world).some(event => event.source === 'holiday');
    notification.hidden = !hasUnseen && !hasActive;
    notification.classList.toggle('unseen', hasUnseen);
    time.textContent = `${String(world.date.hour).padStart(2, '0')}:${String(world.date.minute).padStart(2, '0')}`;
    date.textContent = formatDate(world.profile, world.date);
    root.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === activeTab));
    const content = root.querySelector('#worldcal-content');
    if (activeTab === 'today') content.innerHTML = renderToday(world);
    if (activeTab === 'events') content.innerHTML = renderEvents(world);
    if (activeTab === 'calendar') content.innerHTML = renderCalendar(world);
    if (activeTab === 'worlds') content.innerHTML = renderWorlds(world);
}

function renderToday(world) {
    const upcoming = upcomingEvents(world).slice(0, 4);
    const phase = timePhase(world.date.hour);
    const weatherType = weatherKind(world.weather);
    const displayTime = `${String(world.date.hour).padStart(2, '0')}:${String(world.date.minute).padStart(2, '0')}`;
    const weatherText = world.weather || tr('notSet');
    const stars = Array.from({ length: 14 }, (_, index) => `<i style="--i:${index}"></i>`).join('');
    const precipitation = Array.from({ length: 18 }, (_, index) => `<i style="--i:${index}"></i>`).join('');
    return `
        <div class="worldcal-scene phase-${phase} weather-${weatherType} ${settings.animateWeather ? '' : 'weather-motion-off'}" aria-label="${escapeHtml(`${displayTime}, ${weatherText}`)}">
            <div class="worldcal-scene-sky" aria-hidden="true">
                <span class="worldcal-scene-orb"></span>
                <span class="worldcal-scene-stars">${stars}</span>
                <span class="worldcal-scene-cloud cloud-one"></span>
                <span class="worldcal-scene-cloud cloud-two"></span>
                <span class="worldcal-scene-cloud cloud-three"></span>
                <span class="worldcal-scene-precipitation">${precipitation}</span>
                <span class="worldcal-scene-fog"><i></i><i></i><i></i></span>
                <span class="worldcal-scene-lightning"></span>
                <span class="worldcal-scene-wind"><i></i><i></i><i></i></span>
            </div>
            <div class="worldcal-scene-content">
                <div class="worldcal-scene-time">${displayTime}</div>
                <div class="worldcal-scene-rule"></div>
                <div class="worldcal-scene-meta">
                    <strong title="${escapeHtml(weatherText)}">${escapeHtml(weatherText)}</strong>
                    <span>${escapeHtml(formatDate(world.profile, world.date))}</span>
                </div>
                <button class="worldcal-scene-edit" data-action="edit-weather" type="button" title="${tr('editWeather')}">${icon('pen')}</button>
            </div>
        </div>
        <section class="worldcal-section">
            <div class="worldcal-section-title"><h3>${tr('upcoming')}</h3><button data-action="new-event" type="button">${icon('plus')} ${tr('event')}</button></div>
            ${upcoming.length ? upcoming.map(eventRow).join('') : `<div class="worldcal-empty">${tr('noUpcoming')}</div>`}
        </section>
        <section class="worldcal-section worldcal-now-editor">
            <h3>${tr('currentTime')}</h3>
            <form data-form="date">
                <input name="time" type="time" value="${String(world.date.hour).padStart(2, '0')}:${String(world.date.minute).padStart(2, '0')}" required>
                <input name="day" type="number" min="1" value="${world.date.day}" aria-label="${tr('day')}" required>
                <select name="month" aria-label="${tr('month')}">${world.profile.months.map((month, index) => `<option value="${index + 1}" ${world.date.month === index + 1 ? 'selected' : ''}>${escapeHtml(month.name)}</option>`).join('')}</select>
                <input name="year" type="number" min="1" value="${world.date.year}" aria-label="${tr('year')}" required>
                <button type="submit" title="${tr('set')}">${icon('check')}</button>
            </form>
        </section>`;
}

function eventRow(event) {
    const sourceLabel = event.source === 'holiday'
        ? tr('recurringHoliday')
        : event.source === 'world' ? tr('majorEvent') : tr('oneTimeEvent');
    const sourceIcon = event.source === 'holiday' ? 'star' : event.source === 'world' ? 'landmark' : 'calendar-check';
    return `<article class="worldcal-event type-${event.source} ${event.done ? 'done' : ''}">
        <div class="worldcal-event-date"><strong>${event.date?.day ?? '—'}</strong><span>${event.date ? escapeHtml(String(event.date.month).padStart(2, '0')) : ''}</span></div>
        <div class="worldcal-event-copy">
            <div><span class="worldcal-source">${icon(sourceIcon)} ${sourceLabel}</span>${event.date && (event.date.hour || event.date.minute) ? `<time>${String(event.date.hour).padStart(2, '0')}:${String(event.date.minute).padStart(2, '0')}</time>` : ''}</div>
            <strong>${escapeHtml(event.title)}</strong>
            ${event.description ? `<p>${escapeHtml(event.description)}</p>` : ''}
        </div>
        ${event.source === 'manual' || event.source === 'story' ? `<div class="worldcal-event-actions">
            <button class="worldcal-icon-btn" data-action="toggle-event" data-key="${escapeHtml(event.key)}" data-source="${event.source}" type="button" title="${event.done ? tr('restore') : tr('completed')}">${icon(event.done ? 'rotate-left' : 'check')}</button>
            <button class="worldcal-icon-btn danger" data-action="delete-event" data-key="${escapeHtml(event.key)}" data-source="${event.source}" type="button" title="${tr('remove')}">${icon('trash')}</button>
        </div>` : event.source === 'holiday' ? `<div class="worldcal-event-actions"><button class="worldcal-icon-btn danger" data-action="delete-event" data-key="${escapeHtml(event.key)}" data-source="holiday" type="button" title="${tr('remove')}">${icon('trash')}</button></div>` : ''}
    </article>`;
}

function renderEvents(world) {
    const events = mergedEvents(world).sort((left, right) => {
        if (!left.date) return 1;
        if (!right.date) return -1;
        return compareDateTime(world.profile, left.date, right.date);
    });
    const chronicle = worldChronicle(world).sort((left, right) => compareDateTime(world.profile, right.date, left.date));
    return `<div class="worldcal-section-title"><h3>${tr('worldEvents')}</h3><button data-action="new-event" type="button">${icon('plus')} ${tr('add')}</button></div>
        <div class="worldcal-event-list">${events.length ? events.map(eventRow).join('') : `<div class="worldcal-empty">${tr('noEvents')}</div>`}</div>
        ${chronicle.length ? `<section class="worldcal-chronicle"><div class="worldcal-section-title"><h3>${icon('landmark')} ${tr('worldChronicle')}</h3></div>${chronicle.map(eventRow).join('')}</section>` : ''}`;
}

function renderCalendar(world) {
    if (!viewDate) viewDate = { ...world.date };
    const monthDays = daysInMonth(world.profile, viewDate.year, viewDate.month);
    const firstWeekday = weekdayIndex(world.profile, { ...viewDate, day: 1 });
    const dayEvents = new Map();
    const calendarHolidays = (world.profile.holidays || []).map(holiday => ({
        ...holiday,
        date: normalizeDate(world.profile, { year: viewDate.year, month: holiday.month, day: holiday.day }),
        source: 'holiday',
    }));
    for (const event of [...mergedEvents(world, false), ...calendarHolidays, ...worldChronicle(world)]) {
        if (!event.date || event.date.year !== viewDate.year || event.date.month !== viewDate.month) continue;
        const info = dayEvents.get(event.date.day) || { count: 0, types: new Set() };
        info.count++;
        info.types.add(event.source === 'holiday' ? 'holiday' : event.source === 'world' ? 'world' : 'event');
        dayEvents.set(event.date.day, info);
    }
    const cells = [];
    for (let index = 0; index < firstWeekday; index++) cells.push('<span class="worldcal-day empty"></span>');
    for (let day = 1; day <= monthDays; day++) {
        const isToday = world.date.year === viewDate.year && world.date.month === viewDate.month && world.date.day === day;
        const info = dayEvents.get(day);
        const markers = info ? `<span class="worldcal-day-markers">${[...info.types].map(type => `<i class="marker-${type}"></i>`).join('')}</span>` : '';
        cells.push(`<button class="worldcal-day ${isToday ? 'today' : ''} ${info ? 'has-event' : ''}" data-action="calendar-day" data-day="${day}" type="button"><span>${day}</span>${info?.count > 1 ? `<small>${info.count}</small>` : ''}${markers}</button>`);
    }
    return `<div class="worldcal-calendar-nav">
            <button class="worldcal-icon-btn" data-action="prev-month" type="button">${icon('chevron-left')}</button>
            <strong>${escapeHtml(world.profile.months[viewDate.month - 1].name)} ${viewDate.year}</strong>
            <button class="worldcal-icon-btn" data-action="next-month" type="button">${icon('chevron-right')}</button>
        </div>
        <div class="worldcal-weekdays" style="--weekdays:${world.profile.weekdays.length}">${world.profile.weekdays.map(day => `<span title="${escapeHtml(day)}">${escapeHtml(day.slice(0, 2))}</span>`).join('')}</div>
        <div class="worldcal-grid" style="--weekdays:${world.profile.weekdays.length}">${cells.join('')}</div>
        <div class="worldcal-calendar-legend"><span>${tr('calendarLegend')}:</span><span><i class="marker-holiday"></i>${tr('recurringHoliday')}</span><span><i class="marker-event"></i>${tr('oneTimeEvent')}</span><span><i class="marker-world"></i>${tr('majorEvent')}</span></div>`;
}

function renderWorlds(world) {
    const selected = draftProfileId ? getProfile(draftProfileId) : world.profile;
    draftProfileId = selected.id;
    return `<section class="worldcal-section">
        <div class="worldcal-section-title"><h3>${tr('calendarSystem')}</h3><div class="worldcal-title-actions"><button data-action="ai-profile" type="button">${icon('wand-magic-sparkles')} ${tr('generateAI')}</button><button data-action="clone-profile" type="button">${icon('copy')} ${tr('copy')}</button></div></div>
        <label>${tr('chatCalendar')}
            <select data-setting="chat-profile">${settings.profiles.map(profile => `<option value="${escapeHtml(profile.id)}" ${profile.id === world.profile.id ? 'selected' : ''}>${escapeHtml(profile.name)}</option>`).join('')}</select>
        </label>
        <div class="worldcal-divider"></div>
        <label>${tr('editProfile')}
            <select data-setting="draft-profile">${settings.profiles.map(profile => `<option value="${escapeHtml(profile.id)}" ${profile.id === selected.id ? 'selected' : ''}>${escapeHtml(profile.name)}</option>`).join('')}</select>
        </label>
        <form data-form="profile" class="worldcal-profile-form">
            <input type="hidden" name="id" value="${escapeHtml(selected.id)}">
            <label>${tr('name')}<input name="name" value="${escapeHtml(selected.name)}" required></label>
            <label>${tr('weekdaysHelp')}<textarea name="weekdays" rows="2">${escapeHtml(selected.weekdays.join(', '))}</textarea></label>
            <label>${tr('monthsHelp')}<textarea name="months" rows="7">${escapeHtml(selected.months.map(month => `${month.name} | ${month.days}`).join('\n'))}</textarea></label>
            <label>${tr('holidaysHelp')}<textarea name="holidays" rows="5">${escapeHtml((selected.holidays || []).map(item => `${item.day}.${item.month} | ${item.title} | ${item.description || ''}`).join('\n'))}</textarea></label>
            <div class="worldcal-profile-grid">
                <label>${tr('firstWeekday')}<select name="epochWeekday">${selected.weekdays.map((weekday, index) => `<option value="${index}" ${Number(selected.epochWeekday || 0) === index ? 'selected' : ''}>${escapeHtml(weekday)}</option>`).join('')}</select></label>
                <label>${tr('leapCycle')}<input name="leapEvery" type="number" min="0" value="${selected.leap?.every || 0}"></label>
                <label>${tr('leapMonth')}<select name="leapMonth">${selected.months.map((month, index) => `<option value="${index + 1}" ${Number(selected.leap?.month || 1) === index + 1 ? 'selected' : ''}>${escapeHtml(month.name)}</option>`).join('')}</select></label>
                <label>${tr('extraDays')}<input name="leapExtra" type="number" min="1" value="${selected.leap?.extraDays || 1}"></label>
                <label>${tr('leapExcept')}<input name="leapExcept" type="number" min="0" value="${selected.leap?.exceptEvery || 0}"></label>
                <label>${tr('leapInclude')}<input name="leapInclude" type="number" min="0" value="${selected.leap?.includeEvery || 0}"></label>
            </div>
            <div class="worldcal-form-actions"><button class="worldcal-profile-save" type="submit">${icon('floppy-disk')} <span>${tr('saveProfile')}</span></button><button class="danger" data-action="delete-profile" type="button">${icon('trash')} ${tr('delete')}</button></div>
        </form>
        <div class="worldcal-divider"></div>
        <div class="worldcal-profile-grid worldcal-language-grid">
            <label>${tr('uiLanguage')}<select data-setting="uiLanguage"><option value="ru" ${settings.uiLanguage === 'ru' ? 'selected' : ''}>Русский</option><option value="en" ${settings.uiLanguage === 'en' ? 'selected' : ''}>English</option></select></label>
            <label>${tr('promptLanguage')}<select data-setting="promptLanguage"><option value="ru" ${settings.promptLanguage === 'ru' ? 'selected' : ''}>Русский</option><option value="en" ${settings.promptLanguage === 'en' ? 'selected' : ''}>English</option></select></label>
            <label>${tr('injectionDepth')}<input data-setting="injectionDepth" type="number" min="0" max="100" value="${settings.injectionDepth}"></label>
        </div>
        <label class="worldcal-switch"><input data-setting="enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}><span>${tr('enabled')}</span></label>
        <label class="worldcal-switch"><input data-setting="injectPrompt" type="checkbox" ${settings.injectPrompt ? 'checked' : ''}><span>${tr('inject')}</span></label>
        <label class="worldcal-switch"><input data-setting="weatherTracking" type="checkbox" ${settings.weatherTracking ? 'checked' : ''}><span>${tr('trackWeather')}</span></label>
        <label class="worldcal-switch"><input data-setting="animateWeather" type="checkbox" ${settings.animateWeather ? 'checked' : ''}><span>${tr('animateWeather')}</span></label>
    </section>`;
}

function openEventEditor(existing = null, seedDate = null) {
    const world = deriveWorld();
    const event = existing || { title: '', description: '', date: seedDate || world.date };
    const modal = document.createElement('div');
    modal.className = 'worldcal-modal';
    modal.innerHTML = `<form data-form="event" class="worldcal-dialog">
        <div class="worldcal-section-title"><h3>${existing?.id ? tr('editEvent') : tr('newEvent')}</h3><button class="worldcal-icon-btn" data-action="dismiss-modal" type="button">${icon('xmark')}</button></div>
        <input type="hidden" name="id" value="${escapeHtml(event.id || '')}">
        <label>${tr('entryType')}<select name="entryType"><option value="event">${tr('oneTimeEvent')}</option><option value="holiday">${tr('recurringHoliday')}</option></select></label>
        <label>${tr('name')}<input name="title" maxlength="100" value="${escapeHtml(event.title)}" required></label>
        <label>${tr('description')}<textarea name="description" rows="3" maxlength="400">${escapeHtml(event.description || '')}</textarea></label>
        <div class="worldcal-profile-grid">
            <label>${tr('day')}<input name="day" type="number" min="1" value="${event.date.day}" required></label>
            <label>${tr('month')}<select name="month">${world.profile.months.map((month, index) => `<option value="${index + 1}" ${event.date.month === index + 1 ? 'selected' : ''}>${escapeHtml(month.name)}</option>`).join('')}</select></label>
            <label class="worldcal-event-once">${tr('year')}<input name="year" type="number" min="1" value="${event.date.year}" required></label>
            <label class="worldcal-event-once">${tr('time')}<input name="time" type="time" value="${String(event.date.hour || 0).padStart(2, '0')}:${String(event.date.minute || 0).padStart(2, '0')}"></label>
        </div>
        <div class="worldcal-holiday-note" hidden>${icon('rotate')} ${tr('repeatsYearly')}</div>
        <button type="submit">${icon('check')} ${tr('save')}</button>
    </form>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', handleClick);
    modal.addEventListener('submit', handleSubmit);
    modal.addEventListener('change', handleModalChange);
    syncViewportHeight();
    focusModalField(modal, 'input[name="title"]');
}

function handleModalChange(event) {
    if (event.target.name !== 'entryType') return;
    const form = event.target.closest('form');
    const isHoliday = event.target.value === 'holiday';
    form.querySelectorAll('.worldcal-event-once').forEach(element => element.hidden = isHoliday);
    form.querySelector('.worldcal-holiday-note').hidden = !isHoliday;
    form.querySelector('input[name="year"]').required = !isHoliday;
}

function openDayDetails(date) {
    const world = deriveWorld();
    const normalized = normalizeDate(world.profile, date);
    const items = eventsForDate(world, normalized);
    markCurrentEventsSeen(items);
    render();
    const modal = document.createElement('div');
    modal.className = 'worldcal-modal';
    modal.innerHTML = `<div class="worldcal-dialog worldcal-day-dialog">
        <div class="worldcal-section-title">
            <div><span class="worldcal-dialog-kicker">${escapeHtml(world.profile.name)}</span><h3>${escapeHtml(formatDate(world.profile, normalized))}</h3></div>
            <button class="worldcal-icon-btn" data-action="dismiss-modal" type="button">${icon('xmark')}</button>
        </div>
        <div class="worldcal-day-summary">${items.length ? items.map(eventRow).join('') : `<div class="worldcal-empty">${tr('noDayEvents')}</div>`}</div>
        <button class="worldcal-day-add" data-action="new-event-for-day" data-year="${normalized.year}" data-month="${normalized.month}" data-day="${normalized.day}" type="button">${icon('plus')} ${tr('addForDay')}</button>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', handleClick);
}

function openWeatherEditor() {
    const world = deriveWorld();
    const modal = document.createElement('div');
    modal.className = 'worldcal-modal';
    modal.innerHTML = `<form data-form="weather" class="worldcal-dialog">
        <div class="worldcal-section-title"><h3>${icon('cloud-sun')} ${tr('weather')}</h3><button class="worldcal-icon-btn" data-action="dismiss-modal" type="button">${icon('xmark')}</button></div>
        <textarea name="weather" rows="8" maxlength="1000">${escapeHtml(world.state.weatherOverride || world.weather)}</textarea>
        <div class="worldcal-form-actions"><button type="button" data-action="clear-weather">${icon('rotate-left')} ${tr('restore')}</button><button type="submit">${icon('check')} ${tr('save')}</button></div>
    </form>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', handleClick);
    modal.addEventListener('submit', handleSubmit);
    syncViewportHeight();
    focusModalField(modal, 'textarea');
}

function openAIProfileGenerator() {
    const profiles = extension_settings.connectionManager?.profiles || [];
    const selectedId = extension_settings.connectionManager?.selectedProfile || profiles[0]?.id || '';
    const modal = document.createElement('div');
    modal.className = 'worldcal-modal';
    modal.innerHTML = `<form data-form="ai-profile" class="worldcal-dialog worldcal-ai-dialog">
        <div class="worldcal-section-title"><h3>${icon('wand-magic-sparkles')} ${tr('aiTitle')}</h3><button class="worldcal-icon-btn" data-action="dismiss-modal" type="button">${icon('xmark')}</button></div>
        <label>${tr('aiSetting')}<textarea name="setting" rows="5" maxlength="3000" placeholder="${escapeHtml(tr('aiSettingPlaceholder'))}" required></textarea></label>
        <label>${tr('connectionProfile')}<select name="connectionProfile" ${profiles.length ? '' : 'disabled'}>
            ${profiles.length ? profiles.map(profile => `<option value="${escapeHtml(profile.id)}" ${profile.id === selectedId ? 'selected' : ''}>${escapeHtml(profile.name || profile.model || profile.id)}</option>`).join('') : `<option>${tr('noProfiles')}</option>`}
        </select></label>
        <label>${tr('outputLanguage')}<select name="outputLanguage"><option value="ru" ${settings.uiLanguage === 'ru' ? 'selected' : ''}>Русский</option><option value="en" ${settings.uiLanguage === 'en' ? 'selected' : ''}>English</option></select></label>
        <div class="worldcal-ai-sources">
            <label class="worldcal-switch"><input name="includeChat" type="checkbox" checked><span>${tr('analyzeChat')}</span></label>
            <label>${tr('messageCount')}<input name="messageCount" type="number" min="1" max="200" value="20"></label>
            <label class="worldcal-switch"><input name="includeCharacter" type="checkbox" checked><span>${tr('includeCharacter')}</span></label>
            <label class="worldcal-switch"><input name="includePersona" type="checkbox" checked><span>${tr('includePersona')}</span></label>
            <label class="worldcal-ai-max">${tr('aiMaxTokens')}<input name="maxTokens" type="number" min="1024" max="32768" step="512" value="${settings.aiMaxTokens}"></label>
        </div>
        <button class="worldcal-ai-generate" type="submit" ${profiles.length ? '' : 'disabled'}>${icon('wand-magic-sparkles')} <span>${tr('generate')}</span></button>
    </form>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', handleClick);
    modal.addEventListener('submit', handleSubmit);
    syncViewportHeight();
    focusModalField(modal, 'textarea[name="setting"]');
}

function cleanContextText(value, limit = 12000) {
    return String(value || '')
        .replace(/<!--\s*(?:datetime|weather|event|worldevent)\s*:[\s\S]*?-->/gi, '')
        .trim()
        .slice(0, limit);
}

function buildAIProfileMessages(data) {
    const language = data.get('outputLanguage') === 'en' ? 'English' : 'Russian';
    const context = getContext();
    const sections = [`DESIRED SETTING:\n${cleanContextText(data.get('setting'), 3000)}`];

    if (data.get('includeCharacter')) {
        const character = context.characters?.[context.characterId];
        if (character) {
            sections.push(`CHARACTER DEFINITION:\nName: ${character.name || context.name2 || ''}\nDescription: ${cleanContextText(character.description)}\nPersonality: ${cleanContextText(character.personality)}\nScenario: ${cleanContextText(character.scenario)}\nFirst message: ${cleanContextText(character.first_mes, 4000)}\nExamples: ${cleanContextText(character.mes_example, 5000)}`);
        }
    }

    if (data.get('includePersona')) {
        const persona = power_user.persona_descriptions?.[user_avatar];
        const description = persona?.description || power_user.persona_description || '';
        sections.push(`USER PERSONA:\nName: ${power_user.personas?.[user_avatar] || context.name1 || ''}\nDescription: ${cleanContextText(description)}`);
    }

    if (data.get('includeChat')) {
        const count = Math.max(1, Math.min(200, Number(data.get('messageCount') || 20)));
        const messages = (context.chat || []).slice(-count).map(message => {
            const speaker = message.is_user ? context.name1 || 'User' : message.name || context.name2 || 'Character';
            return `${speaker}: ${cleanContextText(message.mes, 5000)}`;
        });
        sections.push(`RECENT CHAT (${messages.length} messages):\n${messages.join('\n\n')}`);
    }

    const system = `You design internally consistent fictional calendar profiles for a roleplay calendar application. Return only one valid JSON object, without Markdown or commentary. All names, holidays, and descriptions must be written in ${language}. Use the supplied setting evidence; do not copy an existing franchise calendar unless the evidence clearly calls for it.`;
    const prompt = `${sections.join('\n\n=====\n\n')}

Create a useful calendar profile with this exact JSON shape:
{
  "name": "calendar name",
  "weekdays": ["weekday names in order"],
  "months": [{"name":"month name","days":30}],
  "epochWeekday": 0,
  "leap": {"enabled":false,"every":0,"exceptEvery":0,"includeEvery":0,"month":1,"extraDays":1},
  "holidays": [{"month":1,"day":1,"title":"holiday","description":"short description"}],
  "initialDate": {"year":1,"month":1,"day":1,"hour":8,"minute":0},
  "initialWeather": "short weather description"
}
Constraints: 4-20 weekdays, 4-24 months, 1-100 days per month, 0-40 holidays. Pick an initial date suitable for the setting or infer it from chat. epochWeekday is a zero-based weekday index.`;
    return [{ role: 'system', content: system }, { role: 'user', content: prompt.slice(0, 60000) }];
}

function parseAIProfileResponse(content) {
    const text = String(content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('AI response does not contain JSON');
    const raw = JSON.parse(text.slice(start, end + 1));
    const profile = validateProfile({
        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: raw.name,
        weekdays: raw.weekdays,
        months: raw.months,
        epochWeekday: raw.epochWeekday,
        leap: raw.leap || { enabled: false },
        holidays: Array.isArray(raw.holidays) ? raw.holidays.slice(0, 40) : [],
    });
    if (profile.weekdays.length < 4 || profile.weekdays.length > 20 || profile.months.length < 4 || profile.months.length > 24) {
        throw new Error('Generated calendar has an unsupported number of weekdays or months');
    }
    if (profile.months.some(month => month.days > 100)) throw new Error('Generated month is too long');
    profile.holidays = profile.holidays.filter(item => item?.title && Number(item.month) >= 1 && Number(item.month) <= profile.months.length && Number(item.day) >= 1 && Number(item.day) <= daysInMonth(profile, 1, Number(item.month)));
    return { profile, initialDate: raw.initialDate, initialWeather: String(raw.initialWeather || '').slice(0, 160) };
}

async function generateAIProfile(data, form) {
    const profileId = String(data.get('connectionProfile') || '');
    if (!profileId) throw new Error(tr('noProfiles'));
    const button = form.querySelector('.worldcal-ai-generate');
    const label = button.querySelector('span');
    button.disabled = true;
    label.textContent = tr('generating');
    try {
        const maxTokens = Math.max(1024, Math.min(32768, Number(data.get('maxTokens') || settings.aiMaxTokens || 8192)));
        settings.aiMaxTokens = maxTokens;
        saveSettings();
        const response = await ConnectionManagerRequestService.sendRequest(
            profileId,
            buildAIProfileMessages(data),
            maxTokens,
            { extractData: true, includePreset: true, includeInstruct: true, stream: false },
        );
        const generated = parseAIProfileResponse(response?.content || '');
        settings.profiles.push(generated.profile);
        draftProfileId = generated.profile.id;
        const state = getChatState();
        state.profileId = generated.profile.id;
        state.markerFloor = getContext()?.chat?.length || 0;
        state.fallbackDate = normalizeDate(generated.profile, generated.initialDate || state.fallbackDate);
        state.weatherOverride = generated.initialWeather;
        state.weatherOverrideAt = state.markerFloor - 1;
        saveSettings();
        saveChatState();
        form.closest('.worldcal-modal')?.remove();
        render();
        toastr.success(tr('generated'));
    } catch (error) {
        console.error('[World Calendar] AI profile generation failed:', error);
        toastr.error(`${tr('aiError')}: ${error?.cause?.message || error.message}`);
        button.disabled = false;
        label.textContent = tr('generate');
    }
}

function handleClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.dataset.action;
    if (button.dataset.tab) {
        activeTab = button.dataset.tab;
        if (activeTab === 'events') markCurrentEventsSeen();
        render();
        return;
    }
    if (action === 'close') setDrawerOpen(document.getElementById('worldcal-root'), false);
    if (action === 'new-event') openEventEditor();
    if (action === 'ai-profile') openAIProfileGenerator();
    if (action === 'calendar-day') openDayDetails({ ...viewDate, day: Number(button.dataset.day) });
    if (action === 'new-event-for-day') {
        const date = { year: Number(button.dataset.year), month: Number(button.dataset.month), day: Number(button.dataset.day), hour: 0, minute: 0 };
        button.closest('.worldcal-modal')?.remove();
        openEventEditor(null, date);
    }
    if (action === 'dismiss-modal') button.closest('.worldcal-modal')?.remove();
    if (action === 'edit-weather') openWeatherEditor();
    if (action === 'clear-weather') {
        const world = deriveWorld();
        world.state.weatherOverride = '';
        world.state.weatherOverrideAt = -1;
        saveChatState();
        button.closest('.worldcal-modal')?.remove();
        render();
    }
    if (action === 'prev-month' || action === 'next-month') moveViewMonth(action === 'next-month' ? 1 : -1);
    if (action === 'toggle-event') {
        toggleEvent(button.dataset.source, button.dataset.key);
        button.closest('.worldcal-modal')?.remove();
    }
    if (action === 'delete-event') {
        deleteEvent(button.dataset.source, button.dataset.key);
        button.closest('.worldcal-modal')?.remove();
    }
    if (action === 'clone-profile') cloneProfile();
    if (action === 'delete-profile') deleteProfile();
}

function markCurrentEventsSeen(items = null) {
    const world = deriveWorld();
    const keys = items
        ? items.map(item => item.key).filter(Boolean)
        : [...aggregateGeneratedEvents(assistantMessages()).map(item => item.key), ...worldChronicle(world).map(item => item.key)];
    const seen = new Set(world.state.seenEventKeys);
    let changed = false;
    for (const key of keys) {
        if (!seen.has(key)) {
            seen.add(key);
            changed = true;
        }
    }
    if (changed) {
        world.state.seenEventKeys = [...seen].slice(-500);
        saveChatState();
    }
}

function handleChange(event) {
    const key = event.target.dataset.setting;
    if (!key) return;
    if (key === 'chat-profile') {
        const previousWorld = deriveWorld();
        const state = getChatState();
        state.profileId = event.target.value;
        state.markerFloor = getContext()?.chat?.length || 0;
        state.fallbackDate = normalizeDate(getProfile(state.profileId), previousWorld.date);
        viewDate = { ...state.fallbackDate };
        saveChatState();
    } else if (key === 'draft-profile') {
        draftProfileId = event.target.value;
    } else {
        settings[key] = event.target.type === 'checkbox'
            ? event.target.checked
            : key === 'injectionDepth' ? Math.max(0, Math.min(100, Number(event.target.value || 0))) : event.target.value;
        saveSettings();
    }
    if (key === 'uiLanguage') {
        document.getElementById('worldcal-root')?.remove();
        createUI();
        setDrawerOpen(document.getElementById('worldcal-root'), true);
        return;
    }
    render();
}

async function handleSubmit(event) {
    const form = event.target;
    if (!form.dataset.form) return;
    event.preventDefault();
    const data = new FormData(form);
    if (form.dataset.form === 'date') saveDate(data);
    if (form.dataset.form === 'event') saveEvent(data, form);
    if (form.dataset.form === 'profile') await saveProfile(data, form);
    if (form.dataset.form === 'weather') saveWeather(data, form);
    if (form.dataset.form === 'ai-profile') await generateAIProfile(data, form);
}

function saveWeather(data, form) {
    const world = deriveWorld();
    world.state.weatherOverride = String(data.get('weather') || '').trim().slice(0, 1000);
    world.state.weatherOverrideAt = world.state.weatherOverride
        ? Math.max(-1, (getContext()?.chat?.length || 0) - 1)
        : -1;
    saveChatState();
    form.closest('.worldcal-modal')?.remove();
    render();
}

function saveDate(data) {
    const world = deriveWorld();
    const [hour, minute] = String(data.get('time')).split(':').map(Number);
    world.state.fallbackDate = normalizeDate(world.profile, {
        year: data.get('year'), month: data.get('month'), day: data.get('day'), hour, minute,
    });
    world.state.markerFloor = getContext()?.chat?.length || 0;
    viewDate = { ...world.state.fallbackDate };
    saveChatState();
    render();
}

function saveEvent(data, form) {
    const world = deriveWorld();
    const entryType = String(data.get('entryType') || 'event');
    if (entryType === 'holiday') {
        const holiday = {
            id: `holiday-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            title: String(data.get('title')).trim(),
            description: String(data.get('description')).trim(),
            day: Math.max(1, Number(data.get('day') || 1)),
            month: Math.max(1, Math.min(world.profile.months.length, Number(data.get('month') || 1))),
        };
        holiday.day = Math.min(holiday.day, daysInMonth(world.profile, world.date.year, holiday.month));
        world.profile.holidays = Array.isArray(world.profile.holidays) ? world.profile.holidays : [];
        const duplicate = world.profile.holidays.some(item => holidayKey(item) === holidayKey(holiday));
        if (!duplicate) world.profile.holidays.push(holiday);
        saveSettings();
        form.closest('.worldcal-modal')?.remove();
        render();
        return;
    }
    const [hour, minute] = String(data.get('time') || '00:00').split(':').map(Number);
    const item = {
        id: String(data.get('id') || `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
        title: String(data.get('title')).trim(),
        description: String(data.get('description')).trim(),
        date: normalizeDate(world.profile, { year: data.get('year'), month: data.get('month'), day: data.get('day'), hour, minute }),
        done: false,
    };
    const index = world.state.manualEvents.findIndex(event => event.id === item.id);
    if (index >= 0) item.done = world.state.manualEvents[index].done;
    if (index >= 0) world.state.manualEvents[index] = item;
    else world.state.manualEvents.push(item);
    saveChatState();
    form.closest('.worldcal-modal')?.remove();
    render();
}

async function saveProfile(data, form) {
    const button = form.querySelector('.worldcal-profile-save');
    if (button) button.disabled = true;
    try {
        const months = String(data.get('months')).split('\n').filter(Boolean).map(line => {
            const [name, days] = line.split('|').map(value => value.trim());
            return { name, days: Number(days) };
        });
        const holidays = String(data.get('holidays')).split('\n').filter(Boolean).map(line => {
            const [date, title, description = ''] = line.split('|').map(value => value.trim());
            const [day, month] = date.split('.').map(Number);
            return { day, month, title, description };
        });
        const leapEvery = Number(data.get('leapEvery') || 0);
        const profile = validateProfile({
            id: String(data.get('id')),
            name: String(data.get('name')),
            weekdays: String(data.get('weekdays')).split(',').map(value => value.trim()),
            months,
            epochWeekday: Number(data.get('epochWeekday')),
            leap: {
                enabled: leapEvery > 0,
                every: leapEvery,
                month: Number(data.get('leapMonth')),
                extraDays: Number(data.get('leapExtra')),
                exceptEvery: Number(data.get('leapExcept') || 0),
                includeEvery: Number(data.get('leapInclude') || 0),
            },
            holidays,
        });
        const index = settings.profiles.findIndex(item => item.id === profile.id);
        if (index < 0) throw new Error(`Profile not found: ${profile.id}`);
        settings.profiles[index] = profile;
        extension_settings[EXTENSION_KEY] = settings;
        await saveAppSettings();
        draftProfileId = profile.id;
        const state = getChatState();
        if (state.profileId === profile.id) {
            state.fallbackDate = normalizeDate(profile, state.fallbackDate || {});
            saveChatState();
        }
        render();
        toastr.success(tr('profileSaved'));
    } catch (error) {
        console.error('[World Calendar] Profile save failed:', error);
        toastr.error(`${tr('profileSaveError')}: ${error.message}`);
        if (button?.isConnected) button.disabled = false;
    }
}

function toggleEvent(source, key) {
    const state = getChatState();
    if (source === 'manual') {
        const item = state.manualEvents.find(event => event.id === key);
        if (item) item.done = !item.done;
    } else {
        const item = mergedEvents(deriveWorld(), false).find(event => event.key === key);
        if (item) state.eventOverrides[key] = !item.done;
    }
    saveChatState();
    render();
}

function deleteEvent(source, key) {
    const state = getChatState();
    if (source === 'manual') state.manualEvents = state.manualEvents.filter(event => event.id !== key);
    else if (source === 'holiday') {
        const profile = getProfile(state.profileId);
        profile.holidays = (profile.holidays || []).filter(holiday => holidayKey(holiday) !== key);
        saveSettings();
    }
    else if (!state.dismissedEvents.includes(key)) state.dismissedEvents.push(key);
    saveChatState();
    render();
}

function moveViewMonth(direction) {
    const profile = deriveWorld().profile;
    viewDate.month += direction;
    if (viewDate.month < 1) { viewDate.month = profile.months.length; viewDate.year--; }
    if (viewDate.month > profile.months.length) { viewDate.month = 1; viewDate.year++; }
    viewDate.year = Math.max(1, viewDate.year);
    viewDate.day = 1;
    render();
}

function cloneProfile() {
    const source = getProfile(draftProfileId);
    const copy = clone(source);
    copy.id = `custom-${Date.now()}`;
    copy.name = `${source.name} — ${tr('copy')}`;
    settings.profiles.push(copy);
    draftProfileId = copy.id;
    saveSettings();
    render();
}

function deleteProfile() {
    if (settings.profiles.length <= 1) return alert(tr('onlyProfile'));
    const profile = getProfile(draftProfileId);
    if (!confirm(`${tr('deleteProfile')} “${profile.name}”?`)) return;
    settings.profiles = settings.profiles.filter(item => item.id !== profile.id);
    const state = getChatState();
    if (state.profileId === profile.id) state.profileId = settings.profiles[0].id;
    draftProfileId = settings.profiles[0].id;
    saveSettings();
    saveChatState();
    render();
}

function refreshFromChat() {
    render();
}

jQuery(() => {
    loadSettings();
    syncViewportHeight();
    window.visualViewport?.addEventListener('resize', syncViewportHeight);
    window.addEventListener('orientationchange', syncViewportHeight);
    createUI();
    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, syncPrompt);
    eventSource.on(event_types.MESSAGE_RECEIVED, refreshFromChat);
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, refreshFromChat);
    eventSource.on(event_types.MESSAGE_EDITED, refreshFromChat);
    eventSource.on(event_types.MESSAGE_SWIPED, refreshFromChat);
    eventSource.on(event_types.MESSAGE_DELETED, refreshFromChat);
    eventSource.on(event_types.CHAT_CHANGED, () => {
        viewDate = null;
        render();
    });
    console.log('[World Calendar] loaded');
});
