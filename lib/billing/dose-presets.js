/**
 * Common Vietnamese dosage shorthand for the shared <datalist> on each
 * prescription line's dosage input, so a doctor types almost nothing for a
 * routine dose. These are literal clinical shorthand — data, not UI copy —
 * so they are NOT translated via next-intl/messages.
 */
/** @type {readonly string[]} */
export const dosePresets = [
  "1 viên x 2 lần/ngày",
  "1 viên x 3 lần/ngày",
  "2 viên x 2 lần/ngày",
  "2 viên x 3 lần/ngày",
  "1/2 viên x 2 lần/ngày",
  "1 gói x 2 lần/ngày",
  "1 ống x 1 lần/ngày",
  "sáng 1 - chiều 1",
  "sáng 1 - trưa 1 - chiều 1",
  "khi cần",
  "sau ăn",
  "trước ăn",
];
