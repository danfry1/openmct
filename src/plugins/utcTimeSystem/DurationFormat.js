import { formatUtc, isoDurationToMillis, parseUtc, validateUtc } from '../../utils/time.js';

const DATE_FORMAT = 'HH:mm:ss';
const DATE_FORMATS = [DATE_FORMAT, `${DATE_FORMAT}.SSS`];

/**
 * Formatter for duration. Treats the value as a millisecond offset from
 * the epoch and displays only the time component. Can be used for
 * specifying a time duration. For specifying duration, it's best to
 * specify a date of January 1, 1970, as the ms offset will equal the
 * duration represented by the time.
 *
 * @implements {Format}
 * @constructor
 */
class DurationFormat {
  constructor() {
    this.key = 'duration';
  }
  format(value, formatString) {
    return formatUtc(value, formatString || DATE_FORMAT);
  }

  parse(text) {
    if (typeof text === 'number') {
      return text;
    }

    const clockMillis = parseUtc(text, DATE_FORMATS);

    return isNaN(clockMillis) ? isoDurationToMillis(text) : clockMillis;
  }

  validate(text) {
    return validateUtc(text, DATE_FORMATS);
  }
}

export default DurationFormat;
