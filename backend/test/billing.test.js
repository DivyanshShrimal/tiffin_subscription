const assert = require('assert');
const {
  isValidMonthString,
  isValidDateString,
  isWeekday,
  getDaysInMonth,
  calculateMonthlyBill
} = require('../src/utils/billing');

console.log('--- Starting Deterministic Billing Engine Unit Tests ---');

// 1. Mandatory Test Case 1: Full Normal Month
console.log('\n1. Test: Full Normal Month');
{
  const result = calculateMonthlyBill({
    monthStr: '2026-09',
    monthlyPlanPrice: 3000,
    subscription: { start_date: '2026-01-01', end_date: null },
    pauses: []
  });
  assert.strictEqual(result.totalWeekdaysInMonth, 22, 'Sept 2026 has 22 weekdays');
  assert.strictEqual(result.eligibleWeekdays, 22, 'All 22 weekdays eligible');
  assert.strictEqual(result.pausedWeekdays, 0, 'No pauses');
  assert.strictEqual(result.servedWeekdays, 22, 'All 22 days served');
  assert.strictEqual(result.totalBill, 3000, 'Full month bill should be 3000');
  console.log('   ✓ Full normal month passed: ₹3000 for 22/22 days');
}

// 2. Mandatory Test Case 2: One Pause Period
console.log('\n2. Test: One Pause Period');
{
  // 5 weekdays paused: Sept 7 (Mon) to Sept 11 (Fri)
  const result = calculateMonthlyBill({
    monthStr: '2026-09',
    monthlyPlanPrice: 3000,
    subscription: { start_date: '2026-01-01', end_date: null },
    pauses: [
      { start_date: '2026-09-07', end_date: '2026-09-11', reason: 'Vacation' }
    ]
  });
  assert.strictEqual(result.totalWeekdaysInMonth, 22);
  assert.strictEqual(result.eligibleWeekdays, 22);
  assert.strictEqual(result.pausedWeekdays, 5, 'Should pause exactly 5 weekdays');
  assert.strictEqual(result.servedWeekdays, 17, 'Should serve 17 weekdays');
  // (3000 / 22) * 17 = 2318.1818... -> 2318.18
  assert.strictEqual(result.totalBill, 2318.18, 'Bill must equal 2318.18');
  console.log('   ✓ One pause period passed: ₹2318.18 for 17 served days');
}

// 3. Mandatory Test Case 3: Multiple Pause Periods
console.log('\n3. Test: Multiple Pause Periods');
{
  // Pause 1: Sept 1 (Tue) to Sept 2 (Wed) = 2 weekdays
  // Pause 2: Sept 14 (Mon) to Sept 15 (Tue) = 2 weekdays
  const result = calculateMonthlyBill({
    monthStr: '2026-09',
    monthlyPlanPrice: 3000,
    subscription: { start_date: '2026-01-01', end_date: null },
    pauses: [
      { start_date: '2026-09-01', end_date: '2026-09-02', reason: 'Festival' },
      { start_date: '2026-09-14', end_date: '2026-09-15', reason: 'Sick leave' }
    ]
  });
  assert.strictEqual(result.totalWeekdaysInMonth, 22);
  assert.strictEqual(result.pausedWeekdays, 4, 'Should pause 4 weekdays');
  assert.strictEqual(result.servedWeekdays, 18, 'Should serve 18 weekdays');
  // (3000 / 22) * 18 = 2454.5454... -> 2454.55
  assert.strictEqual(result.totalBill, 2454.55);
  console.log('   ✓ Multiple pause periods passed: ₹2454.55 for 18 served days');
}

// 4. Mandatory Test Case 4: Weekend-only Pause
console.log('\n4. Test: Weekend-only Pause');
{
  // Sept 5 (Sat) to Sept 6 (Sun)
  const result = calculateMonthlyBill({
    monthStr: '2026-09',
    monthlyPlanPrice: 3000,
    subscription: { start_date: '2026-01-01', end_date: null },
    pauses: [
      { start_date: '2026-09-05', end_date: '2026-09-06', reason: 'Weekend trip' }
    ]
  });
  assert.strictEqual(result.pausedWeekdays, 0, 'Weekend pause should have 0 paused weekdays');
  assert.strictEqual(result.servedWeekdays, 22, 'All 22 weekdays served');
  assert.strictEqual(result.totalBill, 3000);
  console.log('   ✓ Weekend-only pause passed: no impact on billing (₹3000)');
}

// 5. Mandatory Test Case 5: Pause Crossing Month Boundary
console.log('\n5. Test: Pause Crossing Month Boundary');
{
  // Pause from Aug 28, 2026 (Fri) to Sept 4, 2026 (Fri)
  // In Sept: Sept 1 (Tue), Sept 2 (Wed), Sept 3 (Thu), Sept 4 (Fri) = 4 weekdays in Sept
  const result = calculateMonthlyBill({
    monthStr: '2026-09',
    monthlyPlanPrice: 3000,
    subscription: { start_date: '2026-01-01', end_date: null },
    pauses: [
      { start_date: '2026-08-28', end_date: '2026-09-04', reason: 'Extended travel' }
    ]
  });
  assert.strictEqual(result.totalWeekdaysInMonth, 22);
  assert.strictEqual(result.pausedWeekdays, 4, 'Only Sept weekdays (4) should be counted as paused in Sept');
  assert.strictEqual(result.servedWeekdays, 18);
  assert.strictEqual(result.totalBill, 2454.55);
  console.log('   ✓ Month boundary crossing pause passed: only 4 weekdays counted in September');
}

// 6. Mandatory Test Case 6: Mid-month Subscription Start
console.log('\n6. Test: Mid-month Subscription Start');
{
  // Sub starts Sept 15, 2026 (Tuesday).
  // Weekdays in Sept on/after Sept 15:
  // Sept 15..18 (Tue-Fri): 4 days
  // Sept 21..25 (Mon-Fri): 5 days
  // Sept 28..30 (Mon-Wed): 3 days
  // Total eligible weekdays = 4 + 5 + 3 = 12 weekdays.
  const result = calculateMonthlyBill({
    monthStr: '2026-09',
    monthlyPlanPrice: 3000,
    subscription: { start_date: '2026-09-15', end_date: null },
    pauses: []
  });
  assert.strictEqual(result.totalWeekdaysInMonth, 22, 'Total month weekdays remain 22');
  assert.strictEqual(result.eligibleWeekdays, 12, 'Only 12 weekdays eligible after start date');
  assert.strictEqual(result.pausedWeekdays, 0);
  assert.strictEqual(result.servedWeekdays, 12);
  // (3000 / 22) * 12 = 1636.3636... -> 1636.36
  assert.strictEqual(result.totalBill, 1636.36);
  console.log('   ✓ Mid-month subscription start passed: ₹1636.36 for 12 eligible weekdays');
}

// 7. Mandatory Test Case 7: Overlapping Pause Periods
console.log('\n7. Test: Overlapping Pause Periods');
{
  // Pause 1: Sept 7 (Mon) to Sept 11 (Fri) = 5 weekdays
  // Pause 2: Sept 9 (Wed) to Sept 15 (Tue) = 5 weekdays (Sept 9, 10, 11, 14, 15)
  // Union: Sept 7..15 = Sept 7, 8, 9, 10, 11, 14, 15 = 7 distinct weekdays
  const result = calculateMonthlyBill({
    monthStr: '2026-09',
    monthlyPlanPrice: 3000,
    subscription: { start_date: '2026-01-01', end_date: null },
    pauses: [
      { start_date: '2026-09-07', end_date: '2026-09-11', reason: 'Trip 1' },
      { start_date: '2026-09-09', end_date: '2026-09-15', reason: 'Trip 2' }
    ]
  });
  assert.strictEqual(result.totalWeekdaysInMonth, 22);
  assert.strictEqual(result.pausedWeekdays, 7, 'Overlapping days must not be double counted (7 total paused)');
  assert.strictEqual(result.servedWeekdays, 15, '22 - 7 = 15 served days');
  // (3000 / 22) * 15 = 2045.4545... -> 2045.45
  assert.strictEqual(result.totalBill, 2045.45);
  console.log('   ✓ Overlapping pauses passed: exactly 7 days paused, no double-counting');
}

// 8. Mandatory Test Case 8: Full-month Pause
console.log('\n8. Test: Full-month Pause');
{
  const result = calculateMonthlyBill({
    monthStr: '2026-09',
    monthlyPlanPrice: 3000,
    subscription: { start_date: '2026-01-01', end_date: null },
    pauses: [
      { start_date: '2026-09-01', end_date: '2026-09-30', reason: 'Away for full month' }
    ]
  });
  assert.strictEqual(result.totalWeekdaysInMonth, 22);
  assert.strictEqual(result.pausedWeekdays, 22);
  assert.strictEqual(result.servedWeekdays, 0);
  assert.strictEqual(result.totalBill, 0, 'Full month pause bill must be 0');
  console.log('   ✓ Full-month pause passed: 0 served days, ₹0.00 bill');
}

// 9. Additional Edge Case: Mid-month Subscription End
console.log('\n9. Test: Mid-month Subscription End');
{
  // Sub ends Sept 11, 2026 (Fri).
  // Week 1: Sept 1..4 = 4 weekdays
  // Week 2: Sept 7..11 = 5 weekdays
  // Total eligible = 9 weekdays.
  const result = calculateMonthlyBill({
    monthStr: '2026-09',
    monthlyPlanPrice: 3000,
    subscription: { start_date: '2026-01-01', end_date: '2026-09-11' },
    pauses: []
  });
  assert.strictEqual(result.eligibleWeekdays, 9);
  assert.strictEqual(result.servedWeekdays, 9);
  // (3000 / 22) * 9 = 1227.2727... -> 1227.27
  assert.strictEqual(result.totalBill, 1227.27);
  console.log('   ✓ Mid-month subscription end passed: ₹1227.27 for 9 eligible weekdays');
}

// 10. Additional Edge Case: Subscription completely outside billing month
console.log('\n10. Test: Subscription Outside Billing Month');
{
  const result = calculateMonthlyBill({
    monthStr: '2026-09',
    monthlyPlanPrice: 3000,
    subscription: { start_date: '2026-10-01', end_date: null }, // Starts next month
    pauses: []
  });
  assert.strictEqual(result.eligibleWeekdays, 0);
  assert.strictEqual(result.servedWeekdays, 0);
  assert.strictEqual(result.totalBill, 0);
  console.log('   ✓ Subscription starting after billing month yields 0 eligible and 0 bill');
}

// 11. Additional Edge Case: Invalid Month and Date validations
console.log('\n11. Test: Validation Errors');
{
  assert.throws(() => {
    calculateMonthlyBill({
      monthStr: 'invalid-month',
      monthlyPlanPrice: 3000,
      subscription: { start_date: '2026-01-01' }
    });
  }, /Invalid month format/);

  assert.throws(() => {
    calculateMonthlyBill({
      monthStr: '2026-09',
      monthlyPlanPrice: -500,
      subscription: { start_date: '2026-01-01' }
    });
  }, /non-negative/);

  assert.throws(() => {
    calculateMonthlyBill({
      monthStr: '2026-09',
      monthlyPlanPrice: 3000,
      subscription: null
    });
  }, /Subscription with a valid start_date is required/);

  console.log('   ✓ Validation checks passed');
}

// 12. Verification of Daily Breakdown details
console.log('\n12. Test: Daily Breakdown Audit Array');
{
  const result = calculateMonthlyBill({
    monthStr: '2026-09',
    monthlyPlanPrice: 3000,
    subscription: { start_date: '2026-09-01', end_date: null },
    pauses: [{ start_date: '2026-09-07', end_date: '2026-09-07', reason: 'Holiday' }]
  });
  assert.strictEqual(result.dailyBreakdown.length, 30, '30 calendar days in Sept');
  const day7 = result.dailyBreakdown.find(d => d.date === '2026-09-07');
  assert.strictEqual(day7.isWeekday, true);
  assert.strictEqual(day7.isEligible, true);
  assert.strictEqual(day7.isPaused, true);
  assert.strictEqual(day7.isServed, false);
  assert.strictEqual(day7.pauseReason, 'Holiday');

  const day6 = result.dailyBreakdown.find(d => d.date === '2026-09-06'); // Sunday
  assert.strictEqual(day6.isWeekday, false);
  assert.strictEqual(day6.isEligible, false);
  assert.strictEqual(day6.isServed, false);
  console.log('   ✓ Daily breakdown correctly flags weekdays, pauses, and served status');
}

console.log('\nALL 12 DETERMINISTIC BILLING TESTS PASSED SUCCESSFULLY! 🎉\n');
