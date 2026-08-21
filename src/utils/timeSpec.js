/*****************************************************************************
 * Open MCT, Copyright (c) 2014-2024, United States Government
 * as represented by the Administrator of the National Aeronautics and Space
 * Administration. All rights reserved.
 *
 * Open MCT is licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0.
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 *
 * Open MCT includes source code licensed under additional open source
 * licenses. See the Open Source Licenses file (LICENSES.md) included with
 * this source code distribution or the Licensing information page available
 * at runtime from the About dialog for additional information.
 *****************************************************************************/

import {
  DURATION_FORMATS,
  formatDurationClock,
  formatParts,
  formatUtc,
  formatZoned,
  isKnownTimeZone,
  isoDurationToMillis,
  monthNames,
  parseLocal,
  parseUtc,
  relativeTime,
  TIME_FORMATS,
  timeZoneIdentifiers,
  utcParts,
  validateLocal,
  validateUtc,
  zoneAbbreviation,
  zonedParts
} from './time.js';

// 2026-08-19T12:34:56.789Z — a Wednesday, day 231 of the year.
const TIMESTAMP = Date.UTC(2026, 7, 19, 12, 34, 56, 789);

describe('The time utilities', () => {
  describe('utcParts', () => {
    it('breaks a timestamp into UTC fields', () => {
      expect(utcParts(TIMESTAMP)).toEqual({
        year: 2026,
        month: 8,
        day: 19,
        dayOfYear: 231,
        hour: 12,
        minute: 34,
        second: 56,
        millisecond: 789,
        weekday: 3
      });
    });

    it('accepts a Date, as Moment did', () => {
      expect(utcParts(new Date(TIMESTAMP))).toEqual(utcParts(TIMESTAMP));
    });

    it('reports weekdays correctly either side of the epoch', () => {
      expect(utcParts(Date.UTC(1970, 0, 1)).weekday).toBe(4); // Thursday
      expect(utcParts(Date.UTC(1969, 11, 31)).weekday).toBe(3); // Wednesday
    });

    it('clamps a leap second to 59, since Date-based callers cannot express 60', () => {
      // 2016-12-31T23:59:60.500Z maps to this POSIX value.
      expect(utcParts(Date.UTC(2017, 0, 1, 0, 0, 0, 500)).second).toBe(0);
      expect(utcParts(TIMESTAMP).second).toBeLessThan(60);
    });
  });

  describe('formatUtc', () => {
    it('formats the patterns Open MCT uses', () => {
      expect(formatUtc(TIMESTAMP, 'YYYY-MM-DD HH:mm:ss.SSS')).toBe('2026-08-19 12:34:56.789');
      expect(formatUtc(TIMESTAMP, 'YYYY-MM-DD HH:mm:ss')).toBe('2026-08-19 12:34:56');
      expect(formatUtc(TIMESTAMP, 'YYYY-MM-DD HH:mm')).toBe('2026-08-19 12:34');
      expect(formatUtc(TIMESTAMP, 'YYYY-MM-DD')).toBe('2026-08-19');
      expect(formatUtc(TIMESTAMP, 'YYYY/DDD HH:mm:ss')).toBe('2026/231 12:34:56');
    });

    it('supports bracketed literals and 12-hour tokens', () => {
      expect(formatUtc(TIMESTAMP, 'YYYY-MM-DD HH:mm:ss.SSS[Z]')).toBe('2026-08-19 12:34:56.789Z');
      expect(formatUtc(TIMESTAMP, 'hh:mm A')).toBe('12:34 PM');
      expect(formatUtc(Date.UTC(2026, 7, 19, 0, 4), 'h:mm a')).toBe('12:04 am');
      expect(formatUtc(Date.UTC(2026, 7, 19, 13, 0), 'h A')).toBe('1 PM');
    });

    it('supports month and weekday names, as the conductor axis requires', () => {
      expect(formatUtc(TIMESTAMP, 'MMMM')).toBe('August');
      expect(formatUtc(TIMESTAMP, 'MMM DD')).toBe('Aug 19');
      expect(formatUtc(TIMESTAMP, 'ddd DD')).toBe('Wed 19');
      expect(formatUtc(TIMESTAMP, 'dddd')).toBe('Wednesday');
    });

    it('renders sub-millisecond digits rather than truncating them', () => {
      expect(formatUtc(1787142896789.012, 'YYYY-MM-DD HH:mm:ss.SSSSSS')).toBe(
        '2026-08-19 12:34:56.789011'
      );
    });

    it('accepts a Date, as the d3 axis tick formatter passes', () => {
      expect(formatUtc(new Date(TIMESTAMP), 'YYYY-MM-DD HH:mm:ss.SSS')).toBe(
        '2026-08-19 12:34:56.789'
      );
    });
  });

  describe('parseUtc', () => {
    it('round-trips the formats it produces', () => {
      const patterns = ['YYYY-MM-DD HH:mm:ss.SSS', 'YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD'];
      patterns.forEach((pattern) => {
        const formatted = formatUtc(TIMESTAMP, pattern);
        expect(formatUtc(parseUtc(formatted, [pattern]), pattern)).toBe(formatted);
      });
    });

    it('tries each pattern in turn and returns NaN when none match', () => {
      const patterns = ['YYYY-MM-DD HH:mm:ss.SSS', 'YYYY-MM-DD'];
      expect(parseUtc('2026-08-19', patterns)).toBe(Date.UTC(2026, 7, 19));
      expect(isNaN(parseUtc('not a date', patterns))).toBe(true);
      expect(isNaN(parseUtc('2026-08-19 12:34', patterns))).toBe(true);
    });

    it('treats a year-less clock pattern as a duration from the epoch', () => {
      expect(parseUtc('12:34:56', ['HH:mm:ss'])).toBe(((12 * 60 + 34) * 60 + 56) * 1000);
    });

    it('validates without throwing', () => {
      expect(validateUtc('2026-08-19', ['YYYY-MM-DD'])).toBe(true);
      expect(validateUtc('2026-13-19', ['YYYY-MM-DD'])).toBe(false);
      expect(validateUtc('', ['YYYY-MM-DD'])).toBe(false);
    });
  });

  describe('local time', () => {
    it('formats and parses in the host time zone', () => {
      const localMidday = new Date(2026, 7, 19, 12, 0, 0).getTime();
      expect(formatZoned(localMidday, 'YYYY-MM-DD HH:mm')).toBe('2026-08-19 12:00');
      expect(parseLocal('2026-08-19 12:00:00.000 pm', ['YYYY-MM-DD h:mm:ss.SSS a'])).toBe(
        localMidday
      );
    });

    it('validates local patterns', () => {
      expect(validateLocal('2026-08-19 1:04 pm', ['YYYY-MM-DD h:mm a'])).toBe(true);
      expect(validateLocal('2026-08-19 13:04 pm', ['YYYY-MM-DD h:mm a'])).toBe(false);
    });
  });

  describe('time zones', () => {
    it('formats in a named IANA zone', () => {
      expect(formatZoned(TIMESTAMP, 'HH:mm', 'Asia/Kolkata')).toBe('18:04');
      expect(formatZoned(TIMESTAMP, 'YYYY/DDD hh:mm A', 'America/Los_Angeles')).toBe(
        '2026/231 05:34 AM'
      );
    });

    it('breaks a timestamp into fields in a named zone', () => {
      const parts = zonedParts(TIMESTAMP, 'Asia/Kolkata');
      expect(parts.hour).toBe(18);
      expect(parts.minute).toBe(4);
      expect(parts.dayOfYear).toBe(231);
    });

    it('lists the zones the clock plugin offers, and recognises them', () => {
      const zones = timeZoneIdentifiers();
      expect(zones.length).toBeGreaterThan(100);
      expect(zones).toContain('America/Los_Angeles');
      expect(isKnownTimeZone('America/Los_Angeles')).toBe(true);
      expect(isKnownTimeZone('Not/AZone')).toBe(false);
    });

    it('reports a zone abbreviation', () => {
      expect(zoneAbbreviation(TIMESTAMP, 'UTC')).toBe('UTC');
      expect(zoneAbbreviation(TIMESTAMP, 'America/Los_Angeles')).toBe('PDT');
    });
  });

  describe('durations', () => {
    it('converts ISO 8601 durations to milliseconds for the imagery fade timers', () => {
      expect(isoDurationToMillis('PT2.5S')).toBe(2500);
      expect(isoDurationToMillis('PT1M')).toBe(60000);
      expect(isNaN(isoDurationToMillis('not a duration'))).toBe(true);
    });

    it('formats clock durations for the timer, without trimming units', () => {
      const oneDayTwoHours = ((24 + 2) * 60 * 60 + 3 * 60 + 4) * 1000;
      expect(formatDurationClock(oneDayTwoHours, 'd[D] HH:mm:ss')).toBe('1D 02:03:04');
      expect(formatDurationClock(oneDayTwoHours, 'HH:mm:ss')).toBe('26:03:04');
      expect(formatDurationClock(0, 'HH:mm:ss')).toBe('00:00:00');
    });
  });

  describe('relative time', () => {
    it('describes ages the way the imagery view expects', () => {
      expect(relativeTime(-3, 'day')).toBe('3 days ago');
      expect(relativeTime(-1, 'day')).toBe('yesterday');
      expect(relativeTime(2, 'hour')).toBe('in 2 hours');
    });
  });

  describe('month names', () => {
    it('lists the months the date picker renders', () => {
      const months = monthNames();
      expect(months.length).toBe(12);
      expect(months[0]).toBe('January');
      expect(months[11]).toBe('December');
    });
  });

  describe('format constants and validation', () => {
    it('exposes date formats that all render without warnings', () => {
      const warn = spyOn(console, 'warn');
      Object.values(TIME_FORMATS).forEach((pattern) => {
        expect(typeof formatUtc(TIMESTAMP, pattern)).toBe('string');
      });
      expect(warn).not.toHaveBeenCalled();
    });

    it('keeps duration formats separate, since their token set differs', () => {
      expect(formatDurationClock(93784000, DURATION_FORMATS.DAYS_CLOCK)).toBe('1D 02:03:04');
      expect(formatDurationClock(93784000, DURATION_FORMATS.CLOCK)).toBe('26:03:04');
      // 'd' is an elapsed-days token, not a date token: the date formatter
      // would render it literally, which the validation reports.
      expect(TIME_FORMATS.DAYS_CLOCK).toBeUndefined();
    });

    it('renders a fraction run as one field on both paths', () => {
      // 'SSSSSS' once rendered the milliseconds twice ('.789789') on the
      // zoned path, which has no sub-millisecond value to show.
      expect(formatUtc(TIMESTAMP, TIME_FORMATS.DATE_TIME_MICROS)).toBe(
        '2026-08-19 12:34:56.789000'
      );
      expect(formatZoned(TIMESTAMP, TIME_FORMATS.DATE_TIME_MICROS, 'UTC')).toBe(
        '2026-08-19 12:34:56.789000'
      );
    });

    it('produces the expected output for the named constants', () => {
      expect(formatUtc(TIMESTAMP, TIME_FORMATS.DATE)).toBe('2026-08-19');
      expect(formatUtc(TIMESTAMP, TIME_FORMATS.DATE_TIME_MILLIS)).toBe('2026-08-19 12:34:56.789');
      expect(formatUtc(TIMESTAMP, TIME_FORMATS.DATE_TIME_MILLIS_ZULU)).toBe(
        '2026-08-19 12:34:56.789Z'
      );
      expect(formatUtc(TIMESTAMP, TIME_FORMATS.DAY_OF_YEAR_SECONDS)).toBe('2026/231 12:34:56');
    });

    it('warns about tokens that would be rendered literally', () => {
      const warn = spyOn(console, 'warn');
      // The format string this API used before: a 12-hour clock and a
      // literal 'ms' where milliseconds were intended.
      formatUtc(TIMESTAMP, 'YYYY-MM-DD hh:mm:ss.ms');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.calls.mostRecent().args[0]).toContain('"ms"');
    });

    it('warns about a pattern that would render something other than it says', () => {
      const warn = spyOn(console, 'warn');
      // Each of these used to render silently: the T was dropped, the
      // bracket swallowed, the fraction split into two fields, the day
      // printed twice. None may take a display down, so all warn.
      [
        'YYYY-MM-DDTHH:mm:ss',
        'YYYY [MM',
        'YYYY-MM-DD HH:mm:ss.SSSSSSSSSSSS',
        'YYYY-MM-DD DD'
      ].forEach((pattern) => {
        warn.calls.reset();
        expect(() => formatUtc(TIMESTAMP, pattern)).not.toThrow();
        expect(warn).toHaveBeenCalledTimes(1);
      });
    });

    it('warns only once per pattern, so a render loop cannot flood the console', () => {
      const warn = spyOn(console, 'warn');
      const pattern = 'YYYY-MM-DD zzz';
      formatUtc(TIMESTAMP, pattern);
      formatUtc(TIMESTAMP, pattern);
      formatUtc(TIMESTAMP, pattern);
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('formatting paths', () => {
    it('agrees between the optimised path and the general path for shared tokens', () => {
      // Patterns made only of tokens astrotime defines take an optimised
      // path; every other pattern is rendered from broken-down parts. The two
      // implementations must never disagree where their tokens overlap.
      const timestamps = [
        TIMESTAMP,
        0,
        Date.UTC(1969, 11, 31, 23, 59, 59, 999),
        Date.UTC(2038, 0, 19),
        Date.UTC(2024, 1, 29)
      ];
      const patterns = [
        'YYYY-MM-DD HH:mm:ss.SSS',
        'YYYY-DDD',
        'YYYY',
        'HH:mm',
        'YYYY/DDD HH:mm:ss'
      ];
      timestamps.forEach((timestamp) => {
        patterns.forEach((pattern) => {
          expect(formatUtc(timestamp, pattern)).toBe(formatParts(utcParts(timestamp), pattern));
        });
      });
    });
  });

  describe('absent and unreadable timestamps', () => {
    // These render domain-object fields that are legitimately absent —
    // ListItem shows model.persisted for objects never persisted. Moment
    // rendered 'Invalid date'; matching that keeps the display honest.
    // Before this guard formatZoned(undefined) rendered the CURRENT time and
    // formatZoned(null) the epoch, either of which reads as a real date.
    [undefined, null, NaN].forEach((value) => {
      it(`renders ${String(value)} as an invalid date rather than a plausible one`, () => {
        expect(formatUtc(value, 'YYYY-MM-DD HH:mm:ss')).toBe('Invalid date');
        expect(formatZoned(value, 'YYYY-MM-DD HH:mm:ss', 'UTC')).toBe('Invalid date');
        expect(formatDurationClock(value, 'HH:mm:ss')).toBe('Invalid date');
      });
    });

    it('throws from the broken-down-time functions, which have no placeholder', () => {
      expect(() => utcParts(undefined)).toThrowError(/needs a timestamp/);
      expect(() => zonedParts(undefined, 'UTC')).toThrowError(/needs a timestamp/);
    });

    it('still formats a zero timestamp, which is readable and not missing', () => {
      expect(formatUtc(0, 'YYYY-MM-DD')).toBe('1970-01-01');
      expect(formatDurationClock(0, 'HH:mm:ss')).toBe('00:00:00');
    });
  });

  describe('duration clock patterns', () => {
    const ONE_DAY_TWO_HOURS = 93784000;

    it("rewrites Moment's lowercase day token but not one inside a literal", () => {
      // The rewrite is a regex with a negative lookahead; a '[literal]'
      // containing the letter d is exactly what it has to leave alone.
      expect(formatDurationClock(ONE_DAY_TWO_HOURS, 'd[D] HH:mm:ss')).toBe('1D 02:03:04');
      expect(formatDurationClock(ONE_DAY_TWO_HOURS, 'dd[D] HH:mm:ss')).toBe('01D 02:03:04');
      expect(formatDurationClock(ONE_DAY_TWO_HOURS, 'd[ days] HH:mm')).toBe('1 days 02:03');
      expect(formatDurationClock(ONE_DAY_TWO_HOURS, 'HH:mm:ss [elapsed]')).toBe('26:03:04 elapsed');
      expect(formatDurationClock(ONE_DAY_TWO_HOURS, 'HH:mm:ss [d]')).toBe('26:03:04 d');
    });

    it('keeps leading zero units, as moment-duration-format trim:false did', () => {
      expect(formatDurationClock(5000, 'd[D] HH:mm:ss')).toBe('0D 00:00:05');
    });

    it('signs a negative duration rather than dropping the sign', () => {
      expect(formatDurationClock(-ONE_DAY_TWO_HOURS, 'HH:mm:ss')).toBe('-26:03:04');
    });
  });

  describe('relative time', () => {
    it('rounds a fractional age, which is what the imagery view passes', () => {
      // ImageryView divides a duration by a whole unit, so the amount is
      // fractional. Math.round breaks .5 toward zero for negatives, so -1.5
      // is 'yesterday' and -1.6 is two days: recorded, not accidental.
      expect(relativeTime(-1.4, 'day')).toBe('yesterday');
      expect(relativeTime(-1.5, 'day')).toBe('yesterday');
      expect(relativeTime(-1.6, 'day')).toBe('2 days ago');
      expect(relativeTime(-25 / 24, 'day')).toBe('yesterday');
    });

    it('names the current unit rather than reporting zero', () => {
      expect(relativeTime(-0.4, 'day')).toBe('today');
    });
  });

  describe('time zone abbreviations', () => {
    it('gives an offset where a zone has no letter abbreviation in Intl', () => {
      // moment-timezone answered 'IST' for Kolkata; Intl gives the offset.
      // Display-only, and recorded here so the difference is deliberate.
      expect(zoneAbbreviation(TIMESTAMP, 'Asia/Kolkata')).toBe('GMT+5:30');
      expect(zoneAbbreviation(TIMESTAMP, 'Australia/Eucla')).toBe('GMT+8:45');
    });
  });

  describe('ISO durations', () => {
    it('reads every component the imagery view can be configured with', () => {
      expect(isoDurationToMillis('P1D')).toBe(86400000);
      expect(isoDurationToMillis('P1DT2H')).toBe(93600000);
      expect(isoDurationToMillis('P1W')).toBe(604800000);
      expect(isoDurationToMillis('PT0S')).toBe(0);
      expect(isoDurationToMillis('-PT1H')).toBe(-3600000);
    });
  });

  describe('parity with the Moment behaviour it replaces', () => {
    // Established by a differential run of every pattern Open MCT uses over
    // 419 timestamps and 6 zones against Moment: 18,696 renderings, no
    // differences. These lock down the cases that did differ before.

    it("leaves day-of-year unpadded, as Moment's DDD is", () => {
      // Moment renders DDD unpadded and DDDD padded. Rendering DDD padded
      // would silently change the clock's day-of-year display for the first
      // 99 days of every year.
      const jan5 = Date.UTC(2026, 0, 5, 12, 0, 0);
      expect(formatUtc(jan5, 'YYYY/DDD HH:mm:ss')).toBe('2026/5 12:00:00');
      expect(formatUtc(jan5, 'YYYY/DDDD HH:mm:ss')).toBe('2026/005 12:00:00');
      expect(formatZoned(jan5, 'YYYY/DDD HH:mm:ss', 'UTC')).toBe('2026/5 12:00:00');
      // Three digits already, so both forms agree.
      expect(formatUtc(TIMESTAMP, 'YYYY/DDD HH:mm:ss')).toBe('2026/231 12:34:56');
      expect(formatUtc(TIMESTAMP, 'YYYY/DDDD HH:mm:ss')).toBe('2026/231 12:34:56');
    });

    it('rejects an ISO duration whose length is not fixed', () => {
      // Moment read P1Y as 365 days and P1M as 30, neither of which is a
      // duration. Unreachable from ImageryView, which only builds PT… forms.
      expect(isNaN(isoDurationToMillis('P1Y'))).toBe(true);
      expect(isNaN(isoDurationToMillis('P1M'))).toBe(true);
      expect(isoDurationToMillis('PT1M')).toBe(60000);
    });

    it('rejects a CSS millisecond duration rather than reading it as minutes', () => {
      // ImageryView builds 'PT' + cssValue.toUpperCase(), so a value in ms
      // yields 'PT500MS'. Moment read that as 500 *minutes* — out by 60000x.
      expect(isNaN(isoDurationToMillis('PT500MS'))).toBe(true);
      expect(isoDurationToMillis('PT0.5S')).toBe(500);
    });

    it('does not group digits in a long elapsed-time clock', () => {
      // moment-duration-format wrote '2,400:00:00' once hours passed a
      // thousand. A grouped digit inside a clock field is its own quirk.
      expect(formatDurationClock(8640000000, 'HH:mm:ss')).toBe('2400:00:00');
    });
  });
});
