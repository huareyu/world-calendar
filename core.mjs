export const DATETIME_RE = /<!--\s*datetime\s*:\s*(\d{1,2}):(\d{2})\s+(\d{1,2})\.(\d{1,2})\.(-?\d+)\s*-->/gi;
export const WEATHER_RE = /<!--\s*weather\s*:\s*([\s\S]*?)\s*-->/gi;
export const EVENT_RE = /<!--\s*event\s*:\s*(add|done|remove)\s*\|([\s\S]*?)\s*-->/gi;
export const WORLD_EVENT_RE = /<!--\s*worldevent\s*:\s*([\s\S]*?)\s*-->/gi;

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

export function isLeapYear(year, leap = {}) {
    if (!leap.enabled || !leap.every) return false;
    if (year % leap.every !== 0) return false;
    if (leap.exceptEvery && year % leap.exceptEvery === 0) {
        return Boolean(leap.includeEvery && year % leap.includeEvery === 0);
    }
    return true;
}

export function daysInMonth(profile, year, month) {
    const item = profile.months[month - 1];
    if (!item) return 0;
    const extra = isLeapYear(year, profile.leap) && Number(profile.leap.month) === month
        ? Number(profile.leap.extraDays || 1)
        : 0;
    return Number(item.days) + extra;
}

export function daysInYear(profile, year) {
    return profile.months.reduce((sum, _month, index) => sum + daysInMonth(profile, year, index + 1), 0);
}

function leapYearsThrough(year, leap = {}) {
    if (!leap.enabled || !leap.every || year <= 0) return 0;
    let count = Math.floor(year / leap.every);
    if (leap.exceptEvery) count -= Math.floor(year / leap.exceptEvery);
    if (leap.includeEvery) count += Math.floor(year / leap.includeEvery);
    return count;
}

export function toSerial(profile, date) {
    const year = Math.trunc(Number(date.year));
    const month = Math.trunc(Number(date.month));
    const day = Math.trunc(Number(date.day));
    const baseYearDays = profile.months.reduce((sum, item) => sum + Number(item.days), 0);
    let serial = (year - 1) * baseYearDays;
    if (year > 1) serial += leapYearsThrough(year - 1, profile.leap) * Number(profile.leap?.extraDays || 1);
    for (let current = 1; current < month; current++) serial += daysInMonth(profile, year, current);
    return serial + day - 1;
}

export function fromSerial(profile, inputSerial) {
    let serial = Math.max(0, Math.trunc(Number(inputSerial) || 0));
    const baseYearDays = profile.months.reduce((sum, item) => sum + Number(item.days), 0);
    let year = Math.max(1, Math.floor(serial / Math.max(1, baseYearDays)) + 1);

    while (toSerial(profile, { year, month: 1, day: 1 }) > serial) year--;
    while (toSerial(profile, { year: year + 1, month: 1, day: 1 }) <= serial) year++;

    let dayOfYear = serial - toSerial(profile, { year, month: 1, day: 1 });
    let month = 1;
    while (month < profile.months.length && dayOfYear >= daysInMonth(profile, year, month)) {
        dayOfYear -= daysInMonth(profile, year, month);
        month++;
    }
    return { year, month, day: dayOfYear + 1 };
}

export function normalizeDate(profile, date) {
    const year = Math.max(1, Math.trunc(Number(date.year) || 1));
    const month = clamp(Math.trunc(Number(date.month) || 1), 1, profile.months.length);
    const day = clamp(Math.trunc(Number(date.day) || 1), 1, daysInMonth(profile, year, month));
    const hour = clamp(Math.trunc(Number(date.hour) || 0), 0, 23);
    const minute = clamp(Math.trunc(Number(date.minute) || 0), 0, 59);
    return { year, month, day, hour, minute };
}

export function weekdayIndex(profile, date) {
    const count = Math.max(1, profile.weekdays.length);
    return ((Number(profile.epochWeekday || 0) + toSerial(profile, date)) % count + count) % count;
}

export function addDays(profile, date, amount) {
    const normalized = normalizeDate(profile, date);
    return { ...fromSerial(profile, toSerial(profile, normalized) + Number(amount || 0)), hour: normalized.hour, minute: normalized.minute };
}

export function compareDateTime(profile, left, right) {
    const dayDiff = toSerial(profile, left) - toSerial(profile, right);
    if (dayDiff) return dayDiff;
    return (Number(left.hour || 0) * 60 + Number(left.minute || 0))
        - (Number(right.hour || 0) * 60 + Number(right.minute || 0));
}

export function promptInsertionIndex(messages, requestedDepth) {
    const depth = Math.max(0, Math.min(100, Number(requestedDepth || 0)));
    let insertionIndex = messages.length;
    let seenMessages = 0;
    for (let index = messages.length - 1; index >= 0; index--) {
        if (messages[index].role !== 'user' && messages[index].role !== 'assistant') continue;
        if (seenMessages >= depth) return index + 1;
        insertionIndex = index;
        seenMessages++;
    }
    return insertionIndex;
}

export function timePhase(hourValue) {
    const hour = ((Number(hourValue) || 0) % 24 + 24) % 24;
    if (hour >= 5 && hour < 8) return 'dawn';
    if (hour >= 8 && hour < 17) return 'day';
    if (hour >= 17 && hour < 20) return 'sunset';
    return 'night';
}

export function weatherKind(weatherValue) {
    const weather = String(weatherValue || '').toLocaleLowerCase();
    if (/гроз|молни|шторм|буря|thunder|lightning|storm/.test(weather)) return 'storm';
    if (/снег|метел|вьюг|пурга|snow|blizzard|sleet/.test(weather)) return 'snow';
    if (/дожд|ливень|морос|rain|drizzle|shower/.test(weather)) return 'rain';
    if (/туман|дымк|мгла|fog|mist|haze/.test(weather)) return 'fog';
    if (/облач|пасмур|туч|cloud|overcast/.test(weather)) return 'cloudy';
    if (/ветер|ветрен|wind|gale/.test(weather)) return 'wind';
    return 'clear';
}

export function formatMarker(date) {
    const pad = value => String(value).padStart(2, '0');
    return `<!--datetime:${pad(date.hour)}:${pad(date.minute)} ${pad(date.day)}.${pad(date.month)}.${date.year}-->`;
}

export function formatDate(profile, date, includeTime = false) {
    const month = profile.months[date.month - 1]?.name || String(date.month);
    const weekday = profile.weekdays[weekdayIndex(profile, date)] || '';
    const time = includeTime ? `, ${String(date.hour).padStart(2, '0')}:${String(date.minute).padStart(2, '0')}` : '';
    return `${weekday ? `${weekday}, ` : ''}${date.day} ${month} ${date.year}${time}`;
}

export function parseMarkers(message) {
    const text = String(message || '');
    let datetime = null;
    let weather = '';
    const events = [];
    const worldEvents = [];
    let match;

    DATETIME_RE.lastIndex = 0;
    while ((match = DATETIME_RE.exec(text))) {
        datetime = {
            hour: Number(match[1]), minute: Number(match[2]),
            day: Number(match[3]), month: Number(match[4]), year: Number(match[5]),
        };
    }
    WEATHER_RE.lastIndex = 0;
    while ((match = WEATHER_RE.exec(text))) weather = match[1].trim().slice(0, 1000);

    EVENT_RE.lastIndex = 0;
    while ((match = EVENT_RE.exec(text))) {
        const op = match[1].toLowerCase();
        const parts = match[2].split('|').map(part => part.trim());
        if (!parts[0]) continue;
        if (op === 'add') {
            const dateMatch = (parts[1] || '').match(/(?:(\d{1,2}):(\d{2})\s+)?(\d{1,2})\.(\d{1,2})\.(-?\d+)/);
            events.push({
                op, title: parts[0],
                date: dateMatch ? {
                    hour: Number(dateMatch[1] || 0), minute: Number(dateMatch[2] || 0),
                    day: Number(dateMatch[3]), month: Number(dateMatch[4]), year: Number(dateMatch[5]),
                } : null,
                description: parts.slice(2).join(' | ').slice(0, 400),
            });
        } else {
            events.push({ op, title: parts[0] });
        }
    }

    WORLD_EVENT_RE.lastIndex = 0;
    while ((match = WORLD_EVENT_RE.exec(text))) {
        const parts = match[1].split('|').map(part => part.trim());
        const explicitOperation = ['add', 'remove'].includes((parts[0] || '').toLowerCase());
        const op = explicitOperation ? parts.shift().toLowerCase() : 'add';
        const title = parts.shift() || '';
        if (!title) continue;
        if (op === 'remove') {
            worldEvents.push({ op, title });
            continue;
        }
        const dateText = parts.shift() || '';
        const dateMatch = dateText.match(/(?:(\d{1,2}):(\d{2})\s+)?(\d{1,2})\.(\d{1,2})\.(-?\d+)/);
        if (!dateMatch) continue;
        worldEvents.push({
            op: 'add',
            title,
            date: {
                hour: Number(dateMatch[1] || 0), minute: Number(dateMatch[2] || 0),
                day: Number(dateMatch[3]), month: Number(dateMatch[4]), year: Number(dateMatch[5]),
            },
            description: parts.join(' | ').slice(0, 1200),
        });
    }
    return { datetime, weather, events, worldEvents };
}

export function eventKey(title) {
    return String(title || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function aggregateGeneratedEvents(messages) {
    const events = new Map();
    for (const message of messages || []) {
        for (const operation of parseMarkers(message?.mes).events) {
            const key = eventKey(operation.title);
            if (!key) continue;
            if (operation.op === 'add') events.set(key, { ...operation, key, source: 'story', done: false });
            if (operation.op === 'done' && events.has(key)) events.get(key).done = true;
            if (operation.op === 'remove') events.delete(key);
        }
    }
    return [...events.values()];
}

export function aggregateWorldEvents(messages) {
    const events = new Map();
    for (const message of messages || []) {
        for (const operation of parseMarkers(message?.mes).worldEvents) {
            const key = eventKey(operation.title);
            if (!key) continue;
            if (operation.op === 'add') events.set(key, { ...operation, key: `world-${key}`, source: 'world' });
            if (operation.op === 'remove') events.delete(key);
        }
    }
    return [...events.values()];
}

export function holidaysForRange(profile, start, days) {
    const result = [];
    for (let offset = 0; offset <= days; offset++) {
        const date = addDays(profile, start, offset);
        for (const holiday of profile.holidays || []) {
            if (Number(holiday.month) === date.month && Number(holiday.day) === date.day) {
                result.push({ ...holiday, date, source: 'holiday', key: `holiday-${holiday.month}-${holiday.day}-${eventKey(holiday.title)}` });
            }
        }
    }
    return result;
}

export function validateProfile(input) {
    const profile = typeof structuredClone === 'function'
        ? structuredClone(input)
        : JSON.parse(JSON.stringify(input));
    if (!profile.name?.trim()) throw new Error('У календаря должно быть название.');
    if (!Array.isArray(profile.weekdays) || profile.weekdays.length < 1) throw new Error('Добавьте хотя бы один день недели.');
    if (!Array.isArray(profile.months) || profile.months.length < 1) throw new Error('Добавьте хотя бы один месяц.');
    profile.weekdays = profile.weekdays.map(item => String(item).trim()).filter(Boolean);
    profile.months = profile.months.map(item => ({ name: String(item.name).trim(), days: Math.max(1, Math.trunc(Number(item.days) || 1)) }));
    if (profile.months.some(item => !item.name)) throw new Error('У каждого месяца должно быть название.');
    profile.epochWeekday = clamp(profile.epochWeekday, 0, profile.weekdays.length - 1);
    profile.holidays = Array.isArray(profile.holidays) ? profile.holidays : [];
    return profile;
}
