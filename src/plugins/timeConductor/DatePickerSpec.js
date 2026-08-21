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

import { createApp } from 'vue';

import DatePicker from './DatePicker.vue';

/**
 * The picker keeps months 0-based, because it indexes a month-name array,
 * feeds Date.UTC and wraps at 0/11. Its source of broken-down time reports
 * months as 1-12, so every crossing between the two is a place an off-by-one
 * would show the wrong month without failing anything.
 */
describe('DatePicker', () => {
  let app;
  let element;
  let picker;

  function mountPicker(defaultDateTime) {
    element = document.createElement('div');
    document.body.appendChild(element);
    app = createApp(DatePicker, { defaultDateTime });
    // Injected but unused by this component; provided so Vue does not warn.
    app.provide('openmct', {});
    picker = app.mount(element);
  }

  afterEach(() => {
    app?.unmount();
    element?.remove();
    app = undefined;
    element = undefined;
    picker = undefined;
  });

  it('reads a date into a 0-based month', () => {
    // 2026-08-19 is month 8 of 12 to the parser, index 7 to the picker.
    mountPicker('2026-08-19 12:34:56');
    expect(picker.date).toEqual({ year: 2026, month: 7, day: 19 });
    expect(picker.time).toEqual({ hours: 12, minutes: 34, seconds: 56 });
  });

  it('names the month it read', () => {
    // Catches the conversion in both directions at once: an off-by-one here
    // renders 'July' or 'September' over August's grid.
    mountPicker('2026-08-19');
    expect(picker.model.month).toBe('August');
    expect(picker.model.year).toBe(2026);
  });

  it('round-trips a date through the view unchanged', () => {
    mountPicker('2026-08-19 00:00:00');
    let emitted;
    picker.$.vnode.props = { onDateSelected: (value) => (emitted = value) };
    picker.updateFromView();
    expect(emitted).toBe(Date.UTC(2026, 7, 19, 0, 0, 0));
  });

  it('builds a grid whose in-month cells are the month that was read', () => {
    mountPicker('2026-08-19');
    const cells = picker.table.flat();
    const inMonth = cells.filter((cell) => picker.isInCurrentMonth(cell));
    // August has 31 days, and every one of them carries the picker's month.
    expect(inMonth.length).toBe(31);
    expect(inMonth.every((cell) => cell.month === 7)).toBe(true);
    expect(inMonth[0].day).toBe(1);
    expect(inMonth[30].day).toBe(31);
  });

  it('marks the day that was read as selected, and only that day', () => {
    mountPicker('2026-08-19');
    const selected = picker.table.flat().filter((cell) => picker.isSelected(cell));
    expect(selected.length).toBe(1);
    expect(selected[0]).toEqual(jasmine.objectContaining({ year: 2026, month: 7, day: 19 }));
  });

  it('keeps the month in range when the pager wraps a year boundary', () => {
    mountPicker('2026-01-15');
    expect(picker.picker.month).toBe(0);
    picker.changeMonth(-1);
    expect(picker.picker).toEqual(jasmine.objectContaining({ year: 2025, month: 11 }));
    expect(picker.model.month).toBe('December');
    picker.changeMonth(1);
    expect(picker.picker).toEqual(jasmine.objectContaining({ year: 2026, month: 0 }));
    expect(picker.model.month).toBe('January');
  });

  it('reads a leap day, where an off-by-one month would fall out of the month', () => {
    mountPicker('2024-02-29');
    expect(picker.date).toEqual({ year: 2024, month: 1, day: 29 });
    expect(picker.model.month).toBe('February');
    const inMonth = picker.table.flat().filter((cell) => picker.isInCurrentMonth(cell));
    expect(inMonth.length).toBe(29);
  });
});
