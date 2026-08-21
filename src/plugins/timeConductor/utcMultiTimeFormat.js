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

import { formatUtc, utcParts } from '../../utils/time.js';

export default function multiFormat(date) {
  const parts = utcParts(date);
  /**
   * Uses logic from d3 Time-Scales, v3 of the API. See
   * https://github.com/d3/d3-3.x-api-reference/blob/master/Time-Scales.md
   *
   * Licensed
   */
  const format = [
    ['.SSS', parts.millisecond],
    [':ss', parts.second],
    ['HH:mm', parts.minute],
    ['HH:mm', parts.hour],
    ['ddd DD', parts.weekday && parts.day !== 1],
    ['MMM DD', parts.day !== 1],
    ['MMMM', parts.month - 1],
    ['YYYY', true]
  ].filter(function (row) {
    return row[1];
  })[0][0];

  if (format !== undefined) {
    return formatUtc(date, format);
  }
}
