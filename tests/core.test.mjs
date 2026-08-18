import assert from 'node:assert/strict';
import test from 'node:test';
import {
    addDays,
    aggregateGeneratedEvents,
    aggregateWorldEvents,
    daysInMonth,
    formatMarker,
    holidaysForRange,
    parseMarkers,
    promptInsertionIndex,
    timePhase,
    weatherKind,
    weekdayIndex,
} from '../core.mjs';

const profile = {
    name: 'Тестовый мир',
    weekdays: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    months: [
        { name: 'Искра', days: 10 },
        { name: 'Пламя', days: 12 },
        { name: 'Пепел', days: 8 },
    ],
    epochWeekday: 2,
    leap: { enabled: true, every: 3, month: 3, extraDays: 1 },
    holidays: [{ month: 2, day: 1, title: 'Первое пламя', description: 'Костры' }],
};

test('parses the requested datetime marker', () => {
    const parsed = parseMarkers('Текст\n<!--datetime:10:54 14.05.9024-->');
    assert.deepEqual(parsed.datetime, { hour: 10, minute: 54, day: 14, month: 5, year: 9024 });
    assert.equal(formatMarker(parsed.datetime), '<!--datetime:10:54 14.05.9024-->');
});

test('parses weather and event operations', () => {
    const parsed = parseMarkers(`
        <!--weather:Дождь и северный ветер-->
        <!--event:add|Конкурс красоты|18:30 10.02.9024|Круг магов-->
        <!--event:done|Старое дело-->
    `);
    assert.equal(parsed.weather, 'Дождь и северный ветер');
    assert.equal(parsed.events[0].title, 'Конкурс красоты');
    assert.deepEqual(parsed.events[0].date, { hour: 18, minute: 30, day: 10, month: 2, year: 9024 });
    assert.equal(parsed.events[1].op, 'done');
});

test('keeps long weather descriptions and parses major world events', () => {
    const weather = `Cold rain, low clouds, and a strong northern wind. ${'x'.repeat(300)}`;
    const parsed = parseMarkers(`<!--weather:${weather}--><!--worldevent:add|The White Tower fell|21:10 12.03.44|The capital lost its magical defenses.-->
        <!--worldevent:The Silver Queen was crowned|09:00 13.03.44|The succession crisis ended.-->`);
    assert.equal(parsed.weather, weather);
    assert.equal(parsed.worldEvents.length, 2);
    assert.equal(parsed.worldEvents[0].title, 'The White Tower fell');
    assert.equal(parsed.worldEvents[1].date.day, 13);
});

test('supports custom month and weekday counts', () => {
    assert.deepEqual(addDays(profile, { year: 1, month: 1, day: 10, hour: 5, minute: 2 }, 1), {
        year: 1, month: 2, day: 1, hour: 5, minute: 2,
    });
    assert.equal(weekdayIndex(profile, { year: 1, month: 1, day: 1 }), 2);
    assert.equal(weekdayIndex(profile, { year: 1, month: 1, day: 9 }), 2);
});

test('applies custom leap rules', () => {
    assert.equal(daysInMonth(profile, 2, 3), 8);
    assert.equal(daysInMonth(profile, 3, 3), 9);
    assert.deepEqual(addDays(profile, { year: 3, month: 3, day: 8, hour: 0, minute: 0 }, 1), {
        year: 3, month: 3, day: 9, hour: 0, minute: 0,
    });
});

test('finds recurring holidays across a month boundary', () => {
    const holidays = holidaysForRange(profile, { year: 5, month: 1, day: 9, hour: 0, minute: 0 }, 3);
    assert.equal(holidays.length, 1);
    assert.equal(holidays[0].title, 'Первое пламя');
    assert.deepEqual(holidays[0].date, { year: 5, month: 2, day: 1, hour: 0, minute: 0 });
});

test('rebuilds generated events from message history', () => {
    const events = aggregateGeneratedEvents([
        { mes: '<!--event:add|Конкурс красоты|18:00 07.02.9|Круг магов-->' },
        { mes: '<!--event:add|Бал алхимиков|20:00 08.02.9|Ратуша-->' },
        { mes: '<!--event:done|Конкурс красоты-->' },
        { mes: '<!--event:remove|Бал алхимиков-->' },
    ]);
    assert.equal(events.length, 1);
    assert.equal(events[0].title, 'Конкурс красоты');
    assert.equal(events[0].done, true);
});

test('places prompt at the requested chat depth', () => {
    const messages = [
        { role: 'system' },
        { role: 'user' },
        { role: 'assistant' },
        { role: 'system' },
        { role: 'user' },
    ];
    assert.equal(promptInsertionIndex(messages, 0), 5);
    assert.equal(promptInsertionIndex(messages, 2), 2);
    assert.equal(promptInsertionIndex(messages, 10), 1);
});

test('rebuilds the major event chronicle and supports removals', () => {
    const events = aggregateWorldEvents([
        { mes: '<!--worldevent:add|The Red War began|08:00 01.01.40|Three kingdoms entered the war.-->' },
        { mes: '<!--worldevent:add|The Glass Bridge collapsed|12:00 02.01.40|The northern route was cut off.-->' },
        { mes: '<!--worldevent:remove|The Red War began-->' },
    ]);
    assert.equal(events.length, 1);
    assert.equal(events[0].title, 'The Glass Bridge collapsed');
    assert.equal(events[0].source, 'world');
});

test('classifies time and bilingual weather for CSS art layers', () => {
    assert.equal(timePhase(3), 'night');
    assert.equal(timePhase(6), 'dawn');
    assert.equal(timePhase(12), 'day');
    assert.equal(timePhase(18), 'sunset');
    assert.equal(weatherKind('Сильный дождь и ветер'), 'rain');
    assert.equal(weatherKind('Dense fog'), 'fog');
    assert.equal(weatherKind('Гроза с молниями'), 'storm');
    assert.equal(weatherKind('Sunny, warm'), 'clear');
});
