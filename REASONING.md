# Technical Architecture & Engineering Decisions (REASONING.md)

This document provides a detailed architectural rationale, design decisions, mathematical invariants, and edge cases handled in the Tiffin Subscription Management System, including the three assignment twists (T1, T6, and T4).

---

## 1. Core Architecture Decisions

### 1.1 Backend & Database Selection
- **Node.js + Express**: Chosen for lightweight, high-throughput asynchronous request handling and clean modular routing.
- **SQLite (`better-sqlite3`)**: Provides synchronous, ACID-compliant relational persistence without external daemon overhead. WAL mode (`PRAGMA journal_mode = WAL`) is enabled for concurrent reads while writes occur, and `PRAGMA foreign_keys = ON` enforces relational integrity.
- **Stateless JWT + Bcrypt Authentication**: Standard 10 salt rounds prevent rainbow-table and timing attacks. Passwords are never stored or returned in plaintext or hash form. JWT enables fast stateless authentication without server-side session memory consumption.

---

## 2. Deterministic Billing Engine Rationale

### 2.1 Formula & Timezone Immunity
The core requirement specifies that the monthly price applies only to weekdays (Monday–Friday) of the requested billing month.

- **Timezone Drift Protection**: JavaScript's native `Date` object operates in local server time by default, which causes off-by-one day bugs across timezones or during Daylight Savings transitions. To prevent this, all calendar date parsing and day-of-week determinations use pure UTC calendar arithmetic (`Date.UTC()`, `getUTCDay()`, `getUTCDate()`).
- **Lexicographical Date Comparison**: Standard `YYYY-MM-DD` strings are strictly lexicographically sortable (`"2026-09-07" < "2026-09-11"`), making date interval logic deterministic and fast.

### 2.2 Day-by-Day Evaluation Invariant
Instead of attempting interval geometry (which is error-prone when multiple overlapping pauses, mid-month starts, and month boundaries interact), the billing engine iterates through each calendar day of the billing month:
1. `isWeekday`: Monday (1) through Friday (5).
2. `isEligible`: Weekday falling within `[subscription.start_date, subscription.end_date || ∞)`.
3. `isPaused`: Eligible weekday covered by **at least one** pause period in `pauses`.
4. `isServed`: Eligible weekday where `isPaused === false`.

**Mathematical Guarantee**:
$$\text{eligibleWeekdays} = \text{servedWeekdays} + \text{pausedWeekdays}$$
$$\text{dailyRate} = \frac{\text{monthlyPlanPrice}}{\text{totalWeekdaysInMonth}}$$
$$\text{totalBill} = \operatorname{round}(\text{dailyRate} \times \text{servedWeekdays}, 2)$$

- **Floating-point rounding**: Handled with `Math.round((amount + Number.EPSILON) * 100) / 100` to prevent IEEE 754 precision artifacts.

---

## 3. Twist 1 (T1): Daily Delivery Notifications Design

### 3.1 Requirements & Approach
Evaluator calls `POST /clock` (with optional `{ "date": "YYYY-MM-DD" }`) followed by `GET /outbox`.
- **Weekday Guard**: If the target date falls on Saturday or Sunday, no notifications are generated (`eligibleCount: 0`).
- **Eligibility Check**: A customer must have an active subscription spanning the target date and **must not** be paused on that date.
- **Idempotency & Deduplication**: To prevent duplicate notifications if `POST /clock` is called repeatedly for the same date:
  - SQLite table `outbox` defines `UNIQUE(customer_id, delivery_date, notification_type)`.
  - The notification service uses `INSERT OR IGNORE`. Repeated calls generate 0 duplicates.
- **Compatibility**: Routes are mounted at both root (`/clock`, `/outbox`) and API namespace (`/api/clock`, `/api/outbox`) for evaluator compatibility.

---

## 4. Twist 6 (T6): Mid-Cycle Subscription Transfer Design

### 4.1 Requirements & Approach
When a customer transfers their subscription mid-cycle to a new customer on `transferDate`:
1. **Plan & Cycle Preservation**: The new customer carries over the same plan name, monthly price, and remaining cycle dates.
2. **Billing Responsibility Split**:
   - Customer A is billed for eligible days strictly **before** `transferDate` (`date <= previousDay`).
   - Customer B is billed for eligible days **from** `transferDate` onward (`date >= transferDate`).
3. **Pause Handling**:
   - Any pause for Customer A starting before `transferDate` and ending on/after `transferDate` is split cleanly: Customer A's pause ends on `previousDay`, and a new pause is created for Customer B from `transferDate` to `originalPause.end_date`.
   - Pauses starting on/after `transferDate` are reassigned to Customer B.
4. **Zero Double-Billing Invariant**:
   $$\text{servedDays}_A + \text{servedDays}_B = \text{totalServedDays}_{\text{cycle}}$$
   $$\text{bill}_A + \text{bill}_B = \text{totalBill}_{\text{cycle}}$$
   Executed atomically in an SQLite transaction (`db.transaction`).

---

## 5. Twist 3 (T4): Messy Customer Import Strategy

### 5.1 Requirements & Approach
`POST /api/customers/import` accepts messy CSV data and produces `{ imported, deduped, rejected }`.
- **Date Normalization Engine (`utils/csvImport.js`)**:
  Messy inputs such as `15/09/2026`, `09/15/2026`, `15-Sep-2026`, `2026/09/15`, and ISO strings are normalized into uniform `YYYY-MM-DD`.
- **Two-Tier Deduplication**:
  - Tier 1: In-batch deduplication via a `Set` tracking phones already processed in the current file.
  - Tier 2: Database deduplication via querying `SELECT id FROM customers WHERE phone = ?`.
  - Duplicate rows are not inserted and are reported under `deduped` with the reason.
- **Validation & Rejection**:
  - Missing name, invalid/short phone, unparseable dates, negative monthly prices, or inverted dates (`start_date > end_date`) are rejected with clear reasons.
- **Atomic Execution**: All valid insertions are wrapped in an SQLite transaction to avoid partial database corruption.

---

## 6. Edge Cases Handled

1. **Weekend-only Pauses**: Pausing on Saturday & Sunday does not decrement served days or change the weekday bill.
2. **Month Boundary Crossing**: A pause from Aug 28 to Sept 4 only decrements September weekdays (Sept 1–4 = 4 days) in September's bill.
3. **Overlapping Pause Intervals**: Pauses from Sept 7–11 and Sept 9–15 are merged into 7 distinct weekdays; no day is counted twice.
4. **Same-Day Pause & Resume**: When an active pause starting today is resumed today, the pause `end_date` is adjusted to yesterday (`adjustedEnd = yesterday`), immediately returning the customer to `active` status without deleting the historical row.
5. **Weekend Subscription Transfer**: Transferring on a Sunday sets the previous subscription end date to Saturday, cleanly beginning the new subscription on Sunday without weekday overlap.

---

## 7. Testing Summary

Automated testing covers all layers:
1. `db-test.js`: Schema, foreign keys, index verification.
2. `health-test.js`: Server lifecycle and health endpoint.
3. `auth.test.js`: 7 auth scenarios (registration, duplicates, login, passwords, tokens).
4. `billing.test.js`: 12 deterministic billing test cases.
5. `customers.test.js`: Customer CRUD, subscription lifecycle, pause/resume, and monthly bill calculation.
6. `t1_notifications.test.js`: Weekday delivery alerts, weekend suppression, and idempotent deduplication.
7. `t6_transfer.test.js`: Mid-cycle transfer, split billing, overlapping pause split, zero double-billing.
8. `t4_import.test.js`: Messy CSV date normalizations, deduplication, rejection tracking, and raw text upload.

All 8 test suites execute and pass via `npm test`.
