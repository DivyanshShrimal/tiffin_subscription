/**
 * Pure, deterministic billing engine and date utilities for Tiffin Subscription System.
 * All calendar operations use UTC Date arithmetic to avoid local time/DST skew.
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Validates YYYY-MM month format.
 */
function isValidMonthString(monthStr) {
  if (typeof monthStr !== 'string') return false;
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(monthStr.trim());
}

/**
 * Validates YYYY-MM-DD date format.
 */
function isValidDateString(dateStr) {
  if (typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return false;
  const [y, m, d] = dateStr.trim().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Checks if a YYYY-MM-DD date falls on a weekday (Monday-Friday).
 */
function isWeekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  return day >= 1 && day <= 5;
}

/**
 * Returns all calendar dates in a given YYYY-MM month.
 */
function getDaysInMonth(monthStr) {
  if (!isValidMonthString(monthStr)) {
    throw new Error(`Invalid month format "${monthStr}". Expected format YYYY-MM (e.g. 2026-09).`);
  }

  const [year, monthNum] = monthStr.split('-').map(Number);
  // Date.UTC(year, monthNum, 0) gives the last day of monthNum (1-indexed)
  const totalDays = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();

  const days = [];
  for (let d = 1; d <= totalDays; d++) {
    const dayStr = String(d).padStart(2, '0');
    const monthStrPadded = String(monthNum).padStart(2, '0');
    const date = `${year}-${monthStrPadded}-${dayStr}`;
    const dt = new Date(Date.UTC(year, monthNum - 1, d));
    const dayOfWeek = dt.getUTCDay();
    days.push({
      date,
      dayOfMonth: d,
      dayOfWeek: DAY_NAMES[dayOfWeek],
      dayOfWeekNumber: dayOfWeek,
      isWeekday: dayOfWeek >= 1 && dayOfWeek <= 5
    });
  }
  return days;
}

/**
 * Merges and normalizes an array of pause periods.
 * Each pause has { start_date, end_date, reason }.
 */
function normalizePauses(pauses = []) {
  if (!Array.isArray(pauses)) return [];

  const validPauses = [];
  for (const p of pauses) {
    if (!p || !p.start_date || !p.end_date) continue;
    if (!isValidDateString(p.start_date) || !isValidDateString(p.end_date)) continue;
    if (p.start_date > p.end_date) continue;
    validPauses.push({
      start_date: p.start_date,
      end_date: p.end_date,
      reason: p.reason || null
    });
  }

  return validPauses;
}

/**
 * Calculates monthly bill according to the deterministic business rules.
 * 
 * @param {Object} params
 * @param {string} params.monthStr - Billing month in YYYY-MM format
 * @param {number} params.monthlyPlanPrice - Monthly plan price (applies to weekdays)
 * @param {Object} params.subscription - { start_date, end_date }
 * @param {Array}  params.pauses - Array of { start_date, end_date, reason }
 * @returns {Object} Full breakdown of billing calculation
 */
function calculateMonthlyBill({ monthStr, monthlyPlanPrice, subscription, pauses = [] }) {
  if (!isValidMonthString(monthStr)) {
    throw new Error(`Invalid month format "${monthStr}". Expected format YYYY-MM.`);
  }

  if (typeof monthlyPlanPrice !== 'number' || isNaN(monthlyPlanPrice) || monthlyPlanPrice < 0) {
    throw new Error('monthlyPlanPrice must be a non-negative number.');
  }

  if (!subscription || !subscription.start_date) {
    throw new Error('Subscription with a valid start_date is required.');
  }

  if (!isValidDateString(subscription.start_date)) {
    throw new Error(`Invalid subscription start_date "${subscription.start_date}".`);
  }

  if (subscription.end_date && !isValidDateString(subscription.end_date)) {
    throw new Error(`Invalid subscription end_date "${subscription.end_date}".`);
  }

  if (subscription.end_date && subscription.start_date > subscription.end_date) {
    throw new Error('Subscription start_date cannot be after end_date.');
  }

  const subStart = subscription.start_date;
  const subEnd = subscription.end_date || null;

  const validPauses = normalizePauses(pauses);
  const calendarDays = getDaysInMonth(monthStr);

  let totalWeekdaysInMonth = 0;
  let eligibleWeekdays = 0;
  let pausedWeekdays = 0;
  let servedWeekdays = 0;

  const dailyBreakdown = [];

  for (const day of calendarDays) {
    const { date, isWeekday: weekday, dayOfWeek } = day;

    if (weekday) {
      totalWeekdaysInMonth++;
    }

    // Subscription eligibility: date within [subStart, subEnd]
    const isEligible =
      weekday &&
      date >= subStart &&
      (subEnd === null || date <= subEnd);

    // Pause check: does any pause period cover this date?
    const matchingPause = validPauses.find(
      p => date >= p.start_date && date <= p.end_date
    );
    const isPaused = Boolean(matchingPause);

    let isServed = false;
    if (isEligible) {
      eligibleWeekdays++;
      if (isPaused) {
        pausedWeekdays++;
      } else {
        isServed = true;
        servedWeekdays++;
      }
    }

    dailyBreakdown.push({
      date,
      dayOfWeek,
      isWeekday: weekday,
      isEligible,
      isPaused,
      isServed,
      pauseReason: matchingPause ? matchingPause.reason : null
    });
  }

  // Daily rate: monthly plan price divided by total weekdays in the billing month
  const rawDailyRate = totalWeekdaysInMonth > 0 ? monthlyPlanPrice / totalWeekdaysInMonth : 0;
  const roundedDailyRate = Math.round((rawDailyRate + Number.EPSILON) * 100) / 100;

  // Total bill: rawDailyRate * servedWeekdays, rounded to 2 decimals
  const rawTotalBill = rawDailyRate * servedWeekdays;
  const totalBill = servedWeekdays === 0 ? 0 : Math.round((rawTotalBill + Number.EPSILON) * 100) / 100;

  return {
    month: monthStr,
    monthlyPlanPrice,
    totalWeekdaysInMonth,
    eligibleWeekdays,
    pausedWeekdays,
    servedWeekdays,
    dailyRate: roundedDailyRate,
    rawDailyRate,
    totalBill,
    dailyBreakdown
  };
}

module.exports = {
  isValidMonthString,
  isValidDateString,
  isWeekday,
  getDaysInMonth,
  normalizePauses,
  calculateMonthlyBill
};
