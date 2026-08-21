<!--
 Open MCT, Copyright (c) 2014-2024, United States Government
 as represented by the Administrator of the National Aeronautics and Space
 Administration. All rights reserved.

 Open MCT is licensed under the Apache License, Version 2.0 (the
 "License"); you may not use this file except in compliance with the License.
 You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0.

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 License for the specific language governing permissions and limitations
 under the License.

 Open MCT includes source code licensed under additional open source
 licenses. See the Open Source Licenses file (LICENSES.md) included with
 this source code distribution or the Licensing information page available
 at runtime from the About dialog for additional information.
-->
<template>
  <div
    ref="calendarHolder"
    class="c-ctrl-wrapper c-datetime-picker__wrapper"
    :class="{
      'c-ctrl-wrapper--menus-up': bottom !== true,
      'c-ctrl-wrapper--menus-down': bottom === true
    }"
  >
    <a class="c-icon-button icon-calendar" @click="toggle"></a>
    <div v-if="open" role="dialog" class="c-menu c-menu--mobile-modal c-datetime-picker">
      <div class="c-datetime-picker__close-button">
        <button class="c-click-icon icon-x-in-circle" @click="toggle"></button>
      </div>
      <div class="c-datetime-picker__pager c-pager l-month-year-pager">
        <div
          class="c-pager__prev c-icon-button icon-arrow-left"
          @click.stop="changeMonth(-1)"
        ></div>
        <div class="c-pager__month-year">{{ model.month }} {{ model.year }}</div>
        <div
          class="c-pager__next c-icon-button icon-arrow-right"
          @click.stop="changeMonth(1)"
        ></div>
      </div>
      <div class="c-datetime-picker__calendar c-calendar">
        <div class="c-calendar__row--header l-cal-row">
          <div
            v-for="day in ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']"
            :key="day"
            class="c-calendar-cell"
          >
            {{ day }}
          </div>
        </div>
        <div v-for="(row, tableIndex) in table" :key="tableIndex" class="c-calendar__row--body">
          <div
            v-for="(cell, rowIndex) in row"
            :key="rowIndex"
            :class="{ 'is-in-month': isInCurrentMonth(cell), selected: isSelected(cell) }"
            class="c-calendar-cell"
            @click="select(cell)"
          >
            <div class="c-calendar__day--prime">
              {{ cell.day }}
            </div>
            <div class="c-calendar__day--sub">
              {{ cell.dayOfYear }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import toggleMixin from '../../ui/mixins/toggle-mixin.js';
import { monthNames, parseUtc, utcParts } from '../../utils/time.js';

const TIME_NAMES = {
  hours: 'Hour',
  minutes: 'Minute',
  seconds: 'Second'
};
const MONTHS = monthNames();
const DAY_MS = 24 * 60 * 60 * 1000;
// Formats the conductor's inputs hand to the picker (moment.utc() parsed these loosely).
const INPUT_FORMATS = [
  'YYYY-MM-DD HH:mm:ss.SSS[Z]',
  'YYYY-MM-DD HH:mm:ss.SSS',
  'YYYY-MM-DD HH:mm:ss',
  'YYYY-MM-DD HH:mm',
  'YYYY-MM-DD h:mm:ss.SSS a',
  'YYYY-MM-DD h:mm:ss a',
  'YYYY-MM-DD h:mm a',
  'YYYY-MM-DD'
];
const TIME_OPTIONS = (function makeRanges() {
  let arr = [];
  while (arr.length < 60) {
    arr.push(arr.length);
  }

  return {
    hours: arr.slice(0, 24),
    minutes: arr,
    seconds: arr
  };
})();

export default {
  mixins: [toggleMixin],
  inject: ['openmct'],
  props: {
    defaultDateTime: {
      type: String,
      default: undefined
    },
    bottom: {
      type: Boolean,
      default() {
        return false;
      }
    }
  },
  emits: ['date-selected'],
  data: function () {
    return {
      picker: {
        year: undefined,
        month: undefined,
        interacted: false
      },
      model: {
        year: undefined,
        month: undefined
      },
      table: undefined,
      date: undefined,
      time: undefined
    };
  },
  watch: {
    defaultDateTime() {
      this.updateFromModel(this.defaultDateTime);
    }
  },
  mounted: function () {
    this.updateFromModel(this.defaultDateTime);
    this.updateViewForMonth();
  },
  methods: {
    generateTable() {
      const firstOfMonth = Date.UTC(this.picker.year, this.picker.month, 1);
      // Back up to the Sunday on or before the 1st (what moment's .day(0) did).
      let current = firstOfMonth - utcParts(firstOfMonth).weekday * DAY_MS;
      let table = [];
      let row;
      let col;

      for (row = 0; row < 6; row += 1) {
        table.push([]);
        for (col = 0; col < 7; col += 1) {
          const parts = utcParts(current);
          table[row].push({
            year: parts.year,
            // 0-based, as everything in this component is: it indexes MONTHS,
            // feeds Date.UTC, and wraps at 0/11. utcParts reports 1-12.
            month: parts.month - 1,
            day: parts.day,
            dayOfYear: parts.dayOfYear
          });
          current += DAY_MS; // Next day!
        }
      }

      return table;
    },

    updateViewForMonth() {
      this.model.month = MONTHS[this.picker.month];
      this.model.year = this.picker.year;
      this.table = this.generateTable();
    },

    updateFromModel(defaultDateTime) {
      // The prop is a formatted string (or absent); moment.utc() accepted
      // both and treated undefined/unparseable input as "now".
      let millis =
        typeof defaultDateTime === 'string'
          ? parseUtc(defaultDateTime, INPUT_FORMATS)
          : defaultDateTime;
      if (millis === undefined || isNaN(millis)) {
        millis = Date.now();
      }
      const parts = utcParts(millis);

      this.date = {
        year: parts.year,
        month: parts.month - 1, // 1-12 from utcParts to this component's 0-11
        day: parts.day
      };
      this.time = {
        hours: parts.hour,
        minutes: parts.minute,
        seconds: parts.second
      };

      // Zoom to that date in the picker, but
      // only if the user hasn't interacted with it yet.
      if (!this.picker.interacted) {
        this.picker.year = parts.year;
        this.picker.month = parts.month - 1; // 1-12 to 0-11, as above
        this.updateViewForMonth();
      }
    },

    updateFromView() {
      this.$emit(
        'date-selected',
        Date.UTC(
          this.date.year,
          this.date.month,
          this.date.day,
          this.time.hours,
          this.time.minutes,
          this.time.seconds
        )
      );
    },

    isInCurrentMonth(cell) {
      return cell.month === this.picker.month;
    },

    isSelected(cell) {
      let date = this.date || {};

      return cell.day === date.day && cell.month === date.month && cell.year === date.year;
    },

    select(cell) {
      this.date = this.date || {};
      this.date.month = cell.month;
      this.date.year = cell.year;
      this.date.day = cell.day;
      this.updateFromView();
    },

    dateEquals(d1, d2) {
      return d1.year === d2.year && d1.month === d2.month && d1.day === d2.day;
    },

    changeMonth(delta) {
      this.picker.month += delta;
      if (this.picker.month > 11) {
        this.picker.month = 0;
        this.picker.year += 1;
      }

      if (this.picker.month < 0) {
        this.picker.month = 11;
        this.picker.year -= 1;
      }

      this.picker.interacted = true;
      this.updateViewForMonth();
    },

    nameFor(key) {
      return TIME_NAMES[key];
    },

    optionsFor(key) {
      return TIME_OPTIONS[key];
    }
  }
};
</script>
