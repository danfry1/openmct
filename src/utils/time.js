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

/**
 * Shared time utilities backed by the platform `Intl` API and the
 * zero-dependency `astrotime` library, replacing Moment.js,
 * Moment-Timezone and moment-duration-format.
 *
 * All functions accept and return milliseconds since the Unix epoch and
 * understand the Moment-style format tokens already used across Open MCT:
 * `YYYY MM DD DDD HH hh h mm ss S…S A a ddd dddd MMM MMMM` plus `[literal]`.
 */

import {
  dayOfYear,
  durationFromMillis,
  durationToMillis,
  formatDuration,
  formatInstant,
  formatPatternError,
  instantFromUnixMillis,
  instantToUnixMillis,
  instantToUtc,
  parseDuration,
  parseInstant
} from 'astrotime';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The format strings Open MCT uses, named so call sites do not repeat string
 * literals. A mistyped pattern cannot be caught by the type system in a
 * JavaScript codebase, and a wrong one fails silently — the NotificationAPI
 * timestamp spent years rendering a 12-hour clock and a literal 'ms' for
 * exactly that reason.
 * @readonly
 */
export const TIME_FORMATS = Object.freeze({
  DATE: 'YYYY-MM-DD',
  DATE_TIME_MINUTES: 'YYYY-MM-DD HH:mm',
  DATE_TIME_SECONDS: 'YYYY-MM-DD HH:mm:ss',
  DATE_TIME_MILLIS: 'YYYY-MM-DD HH:mm:ss.SSS',
  DATE_TIME_MILLIS_ZULU: 'YYYY-MM-DD HH:mm:ss.SSS[Z]',
  DATE_TIME_MICROS: 'YYYY-MM-DD HH:mm:ss.SSSSSS',
  TIME_MINUTES: 'HH:mm',
  TIME_SECONDS: 'HH:mm:ss',
  DAY_OF_YEAR_SECONDS: 'YYYY/DDD HH:mm:ss',
  DATE_TIME_SECONDS_MULTILINE: 'YYYY-MM-DD[\n]HH:mm:ss',
  MERIDIEM: 'A'
});

/**
 * Duration patterns for `formatDurationClock`. Kept separate from
 * `TIME_FORMATS` because the token sets differ: a duration may use `d` for
 * elapsed days, which is not a date token and would be rendered literally by
 * the date formatters.
 * @readonly
 */
export const DURATION_FORMATS = Object.freeze({
  CLOCK: 'HH:mm:ss',
  DAYS_CLOCK: 'd[D] HH:mm:ss'
});

const TOKEN_REGEX = /YYYY|MMMM|MMM|MM|DDDD|DDD|DD|dddd|ddd|HH|hh|h|mm|ss|S+|A|a|\[[^\]]*\]/g;
// Tokens this facade renders itself, for Moment compatibility, and which
// astrotime has no equivalent for. Longest-first so MMMM is not read as MMM.
const FACADE_ONLY_TOKEN = /MMMM|MMM|DDDD|DDD|dddd|ddd|hh|h|A|a/g;

/**
 * Whether astrotime can render `pattern` natively. Asking astrotime itself
 * is exact, where a hand-maintained token list drifts: `formatInstant` and
 * `parseInstant` throw on precisely the patterns this rejects, so the fast
 * path below can never be the thing that throws.
 * @param {string} pattern
 * @returns {boolean}
 */
function isNativePattern(pattern) {
  // astrotime's DDD is zero-padded, where Moment's is not, so day-of-year
  // patterns take the general path to keep the existing output.
  return !pattern.includes('DDD') && formatPatternError(pattern) === null;
}

/**
 * @typedef {Object} TimeParts
 * @property {number} year
 * @property {number} month 1-12
 * @property {number} day 1-31
 * @property {number} dayOfYear 1-366
 * @property {number} hour 0-23
 * @property {number} minute
 * @property {number} second
 * @property {number} millisecond
 * @property {number} weekday 0 (Sunday) - 6 (Saturday)
 */

/**
 * What Moment rendered for a timestamp it could not read. Displays here are
 * fed straight from domain-object fields that are legitimately absent —
 * `model.persisted` on an object that has never been persisted, for one — so
 * a missing value has to render as visibly missing. Throwing breaks the
 * component, and substituting a plausible date is worse than either: an
 * operator cannot tell it apart from a real reading.
 */
const INVALID_DATE = 'Invalid date';

/** Accepts what Moment accepted: a millisecond number or a Date. */
function toMillis(value) {
  return value instanceof Date ? value.getTime() : value;
}

/** True for a value the formatters can actually render. */
function isReadableTime(value) {
  return Number.isFinite(toMillis(value));
}

/**
 * Guards the broken-down-time functions, which return objects and so have no
 * placeholder to fall back on. The formatters guard themselves and render
 * INVALID_DATE instead of reaching here.
 * @param {unknown} value
 * @param {string} name
 */
function assertReadable(value, name) {
  if (!isReadableTime(value)) {
    throw new RangeError(`${name}() needs a timestamp in milliseconds, got ${String(value)}`);
  }
}

/**
 * Broken-down UTC time for a millisecond timestamp.
 * @param {number | Date} value milliseconds since the Unix epoch, or a Date
 * @returns {TimeParts}
 */
export function utcParts(value) {
  assertReadable(value, 'utcParts');
  const civil = instantToUtc(instantFromUnixMillis(toMillis(value)));

  return {
    year: civil.year,
    month: civil.month,
    day: civil.day,
    dayOfYear: civil.dayOfYear,
    hour: civil.hour,
    minute: civil.minute,
    second: Math.min(civil.second, 59),
    millisecond: Math.floor(civil.nanosecond / 1e6),
    weekday: weekdayOf(value)
  };
}

function weekdayOf(value) {
  // 1970-01-01 was a Thursday (4).
  const days = Math.floor(toMillis(value) / 86_400_000);

  return (((days + 4) % 7) + 7) % 7;
}

const zonedFormatters = new Map();

function zonedFormatter(timeZone) {
  const key = timeZone ?? 'local';
  let formatter = zonedFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      ...(timeZone === undefined ? {} : { timeZone }),
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      fractionalSecondDigits: 3,
      weekday: 'short',
      hourCycle: 'h23'
    });
    zonedFormatters.set(key, formatter);
  }

  return formatter;
}

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Broken-down time for a millisecond timestamp as read in an IANA time zone
 * (or the system's local zone when `timeZone` is undefined).
 * @param {number} value milliseconds since the Unix epoch
 * @param {string} [timeZone] IANA zone identifier, e.g. 'America/Los_Angeles'
 * @returns {TimeParts}
 */
export function zonedParts(value, timeZone) {
  // Intl reads undefined as "now" and null as the epoch, so an absent
  // timestamp would otherwise format as a real-looking date.
  assertReadable(value, 'zonedParts');
  const parts = {};
  for (const part of zonedFormatter(timeZone).formatToParts(toMillis(value))) {
    parts[part.type] = part.value;
  }

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);

  return {
    year,
    month,
    day,
    dayOfYear: dayOfYear(year, month, day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    millisecond: Number(parts.fractionalSecond ?? 0),
    weekday: SHORT_WEEKDAYS.indexOf(parts.weekday)
  };
}

function pad(number, width) {
  return String(number).padStart(width, '0');
}

const reportedPatterns = new Set();

/**
 * Warns once per pattern about anything that would make it render something
 * other than what it appears to say — an unknown letter, an unterminated
 * bracket, a letter run longer than its token, or a repeated field. The
 * facade's own tokens are removed first and the rest is put to astrotime,
 * so the two grammars cannot drift apart.
 *
 * Warning rather than throwing is deliberate: astrotime throws, which is
 * right for a library, but a mistyped format string in a display should not
 * take the display down with it.
 * @param {string} pattern
 */
function warnAboutUnknownTokens(pattern) {
  if (reportedPatterns.has(pattern)) {
    return;
  }

  reportedPatterns.add(pattern);
  const problem = formatPatternError(pattern.replace(FACADE_ONLY_TOKEN, ''));
  if (problem) {
    console.warn(
      `[time] Format '${pattern}' is not valid: ${problem}. It will be rendered as best it ` +
        `can be, which may not be what it looks like. Valid tokens: YYYY MM DD DDD HH hh h ` +
        `mm ss SSS(+) A a ddd dddd MMM MMMM, or [text] for a literal.`
    );
  }
}

/**
 * Renders Moment-style tokens from broken-down time parts.
 * @param {TimeParts} parts
 * @param {string} pattern Moment-style format string
 * @returns {string}
 */
export function formatParts(parts, pattern) {
  warnAboutUnknownTokens(pattern);

  return pattern.replace(TOKEN_REGEX, (token) => {
    switch (token) {
      case 'YYYY':
        return pad(parts.year, 4);
      case 'MMMM':
        return MONTHS[parts.month - 1];
      case 'MMM':
        return MONTHS[parts.month - 1].slice(0, 3);
      case 'MM':
        return pad(parts.month, 2);
      case 'DDDD':
        return pad(parts.dayOfYear, 3);
      case 'DDD':
        // Moment's day-of-year is unpadded; DDDD is the padded form. Day-of-
        // year is conventionally three digits in spacecraft operations, but
        // changing that is a decision about the display, not the migration.
        return String(parts.dayOfYear);
      case 'DD':
        return pad(parts.day, 2);
      case 'dddd':
        return WEEKDAYS[parts.weekday];
      case 'ddd':
        return WEEKDAYS[parts.weekday].slice(0, 3);
      case 'HH':
        return pad(parts.hour, 2);
      case 'hh':
        return pad(twelveHour(parts.hour), 2);
      case 'h':
        return String(twelveHour(parts.hour));
      case 'mm':
        return pad(parts.minute, 2);
      case 'ss':
        return pad(parts.second, 2);
      case 'A':
        return parts.hour < 12 ? 'AM' : 'PM';
      case 'a':
        return parts.hour < 12 ? 'am' : 'pm';
      default:
        if (token[0] === 'S') {
          // A run of any length, so 'SSSSSS' is six digits rather than the
          // milliseconds rendered twice. Parts carry only milliseconds, so
          // digits past the third are zeros; astrotime's path has the real
          // sub-millisecond value and formatUtc prefers it.
          return pad(parts.millisecond, 3).padEnd(token.length, '0').slice(0, token.length);
        }

        return token.slice(1, -1); // [literal]
    }
  });
}

function twelveHour(hour) {
  const twelve = hour % 12;

  return twelve === 0 ? 12 : twelve;
}

/**
 * Formats a UTC timestamp with a Moment-style pattern.
 * @param {number} value milliseconds since the Unix epoch
 * @param {string} pattern
 * @returns {string}
 */
export function formatUtc(value, pattern) {
  if (!isReadableTime(value)) {
    return INVALID_DATE;
  }

  const millis = toMillis(value);
  if (isNativePattern(pattern)) {
    // Fast path: astrotime renders these tokens natively.
    return formatInstant(instantFromUnixMillis(millis), pattern);
  }

  return formatParts(utcParts(millis), pattern);
}

/**
 * Formats a timestamp as read in an IANA zone (or the local zone).
 * @param {number} value milliseconds since the Unix epoch
 * @param {string} pattern Moment-style format string
 * @param {string} [timeZone] IANA zone identifier; local time when omitted
 * @returns {string}
 */
export function formatZoned(value, pattern, timeZone) {
  if (!isReadableTime(value)) {
    return INVALID_DATE;
  }

  return formatParts(zonedParts(value, timeZone), pattern);
}

/**
 * Strictly parses UTC text against one or more Moment-style patterns.
 * @param {string} text
 * @param {string | string[]} patterns
 * @returns {number} milliseconds since the Unix epoch, or NaN
 */
export function parseUtc(text, patterns) {
  for (const pattern of [].concat(patterns)) {
    if (pattern.includes('YYYY') && isNativePattern(pattern)) {
      const result = parseInstant(text, { format: pattern });
      if (result.ok) {
        return instantToUnixMillis(result.value);
      }
      continue;
    }

    const fields = parseFields(text, pattern);
    if (fields !== null) {
      return Date.UTC(
        fields.year,
        fields.month - 1,
        fields.day,
        fields.hour,
        fields.minute,
        fields.second,
        fields.millisecond
      );
    }
  }

  return NaN;
}

/**
 * `true` when the text matches any of the given patterns.
 * @param {string} text
 * @param {string | string[]} patterns
 * @returns {boolean}
 */
export function validateUtc(text, patterns) {
  return !isNaN(parseUtc(text, patterns));
}

/**
 * Parses local wall-clock text against Moment-style patterns (12-hour tokens
 * supported). Daylight-saving resolution follows the JavaScript engine.
 * @param {string} text
 * @param {string | string[]} patterns
 * @returns {number} milliseconds since the Unix epoch, or NaN
 */
export function parseLocal(text, patterns) {
  for (const pattern of [].concat(patterns)) {
    const fields = parseFields(text, pattern);
    if (fields !== null) {
      return new Date(
        fields.year,
        fields.month - 1,
        fields.day,
        fields.hour,
        fields.minute,
        fields.second,
        fields.millisecond
      ).getTime();
    }
  }

  return NaN;
}

/**
 * `true` when the text matches any of the given patterns as local time.
 * @param {string} text
 * @param {string | string[]} patterns
 * @returns {boolean}
 */
export function validateLocal(text, patterns) {
  return !isNaN(parseLocal(text, patterns));
}

const compiledPatterns = new Map();

const PARSE_TOKENS = {
  YYYY: String.raw`(?<year>\d{4})`,
  MM: String.raw`(?<month>\d{2})`,
  DD: String.raw`(?<day>\d{2})`,
  DDD: String.raw`(?<dayOfYear>\d{3})`,
  HH: String.raw`(?<hour24>\d{2})`,
  hh: String.raw`(?<hour12>\d{2})`,
  h: String.raw`(?<hour12>\d{1,2})`,
  mm: String.raw`(?<minute>\d{2})`,
  ss: String.raw`(?<second>\d{2})`,
  SSS: String.raw`(?<millisecond>\d{3})`,
  A: String.raw`(?<meridiemUpper>AM|PM)`,
  a: String.raw`(?<meridiem>am|pm)`
};

function compilePattern(pattern) {
  let compiled = compiledPatterns.get(pattern);
  if (!compiled) {
    const source = pattern.replace(
      /YYYY|MM|DDD|DD|HH|hh|h|mm|ss|SSS|A|a|\[[^\]]*\]|[.*+?^${}()|\\]/g,
      (token) => {
        if (PARSE_TOKENS[token]) {
          return PARSE_TOKENS[token];
        }

        if (token.startsWith('[')) {
          return token.slice(1, -1).replace(/[.*+?^${}()|\\]/g, String.raw`\$&`);
        }

        return `\\${token}`;
      }
    );
    compiled = new RegExp(`^${source}$`);
    compiledPatterns.set(pattern, compiled);
  }

  return compiled;
}

function parseFields(text, pattern) {
  const match = compilePattern(pattern).exec(text);
  if (match === null) {
    return null;
  }

  const groups = match.groups ?? {};
  let hour = Number(groups.hour24 ?? 0);
  const meridiem = (groups.meridiem ?? groups.meridiemUpper ?? '').toLowerCase();
  if (groups.hour12 !== undefined) {
    const hour12 = Number(groups.hour12);
    if (hour12 < 1 || hour12 > 12) {
      return null;
    }

    hour = meridiem === 'pm' ? (hour12 % 12) + 12 : hour12 % 12;
  }

  const fields = {
    // Year-less patterns (e.g. the duration format 'HH:mm:ss') anchor to the
    // epoch so the parsed value doubles as a millisecond duration.
    year: groups.year !== undefined ? Number(groups.year) : 1970,
    month: Number(groups.month ?? 1),
    day: Number(groups.day ?? 1),
    hour,
    minute: Number(groups.minute ?? 0),
    second: Number(groups.second ?? 0),
    millisecond: Number(groups.millisecond ?? 0)
  };

  if (groups.dayOfYear !== undefined) {
    const utcFromOrdinal = Date.UTC(fields.year, 0, Number(groups.dayOfYear));
    const ordinalDate = new Date(utcFromOrdinal);
    fields.month = ordinalDate.getUTCMonth() + 1;
    fields.day = ordinalDate.getUTCDate();
  }

  if (
    fields.month < 1 ||
    fields.month > 12 ||
    fields.day < 1 ||
    fields.day > 31 ||
    fields.hour > 23 ||
    fields.minute > 59 ||
    fields.second > 59
  ) {
    return null;
  }

  return fields;
}

/**
 * All IANA time zone identifiers known to this runtime.
 * @returns {string[]}
 */
export function timeZoneIdentifiers() {
  return Intl.supportedValuesOf('timeZone');
}

/**
 * `true` when the runtime recognizes the IANA zone identifier.
 * @param {string} timeZone
 * @returns {boolean}
 */
export function isKnownTimeZone(timeZone) {
  try {
    return Boolean(new Intl.DateTimeFormat('en-US', { timeZone }));
  } catch {
    return false;
  }
}

/**
 * Short zone name for a timestamp in a zone, e.g. 'PST' or 'GMT+5:30'.
 * @param {number} value milliseconds since the Unix epoch
 * @param {string} [timeZone]
 * @returns {string}
 */
export function zoneAbbreviation(value, timeZone) {
  value = toMillis(value);
  const formatter = new Intl.DateTimeFormat('en-US', {
    ...(timeZone === undefined ? {} : { timeZone }),
    timeZoneName: 'short'
  });
  const part = formatter.formatToParts(value).find((p) => p.type === 'timeZoneName');

  return part ? part.value : '';
}

/**
 * English month names, January first.
 * @returns {string[]}
 */
export function monthNames() {
  return MONTHS.slice();
}

/**
 * Milliseconds represented by an ISO 8601 duration string, e.g. 'PT2.5S'.
 * @param {string} text
 * @returns {number} milliseconds, or NaN when unparseable
 */
export function isoDurationToMillis(text) {
  const result = parseDuration(text);

  return result.ok ? durationToMillis(result.value) : NaN;
}

/**
 * Formats a millisecond count as clock time using Moment-Duration-Format
 * style patterns, e.g. 'd[D] HH:mm:ss' or 'HH:mm:ss'. Units are never
 * trimmed (equivalent to `{ trim: false }`).
 * @param {number} millis
 * @param {string} pattern
 * @returns {string}
 */
export function formatDurationClock(millis, pattern) {
  if (!Number.isFinite(millis)) {
    return INVALID_DATE;
  }

  const astroPattern = pattern.replace(/d+(?![^[]*\])/g, (days) => 'D'.repeat(days.length));

  return formatDuration(durationFromMillis(millis), astroPattern);
}

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/**
 * Human-readable relative time, e.g. '3 days ago' or 'in 2 hours'.
 * @param {number} amount signed quantity of `unit` (negative = past)
 * @param {'day' | 'hour' | 'minute' | 'second'} unit
 * @returns {string}
 */
export function relativeTime(amount, unit) {
  return RELATIVE_FORMATTER.format(Math.round(amount), unit);
}
