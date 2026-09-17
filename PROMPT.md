# Project Building Prompt

Hey! I need to build a full-stack tiffin subscription management system for home-style lunch delivery services. 

The story is simple: customers subscribe to a monthly tiffin lunch plan where food is delivered every weekday (Monday to Friday). Since people travel or have festivals, they should be able to pause their subscription for a specific date range. Paused weekdays must NOT be billed. At the end of the month, the owner needs an accurate bill calculated based strictly on the actual weekdays served.

Here is everything we need to build and how it should work:

---

### Tech Stack
- **Backend**: Node.js with Express and REST APIs.
- **Database**: SQLite using `better-sqlite3` (must use a real database with SQLite WAL mode and foreign keys enabled, NOT mock or in-memory array data!).
- **Auth**: JWT for session tokens and `bcrypt` / `bcryptjs` for password hashing.
- **Frontend**: React + Vite for a clean, responsive single-page web app.

---

### Core Functionality & Features

1. **Owner Auth & Management**
   - User registration and login for the tiffin business owner.
   - Passwords must be hashed using bcrypt (never store plaintext passwords or return hashes in responses).
   - Secure endpoints using JWT middleware.

2. **Customer Management**
   - Create, view, update, and delete customers (name, phone, email, address).
   - Ability to search customers by phone number or name.
   - Paginated customer lists with sorting options.

3. **Subscription Lifecycle**
   - Subscribe a customer to a monthly weekday plan (storing plan name, monthly price, start date, optional end date).
   - Track active vs paused vs unsubscribed status.

4. **Pause & Resume Engine**
   - Customers can pause subscriptions for an inclusive date range (e.g., traveling for a week).
   - Pause history must be stored permanently (never delete past pause history when resuming).
   - Support optional pause reason.
   - Resuming should set the customer back to active without breaking historical pause records.

5. **Deterministic Weekday Billing Engine (Crucial Part!)**
   - For any given month (`YYYY-MM`), calculate the bill strictly on Monday–Friday weekdays.
   - Daily rate = `monthly_price / total_weekdays_in_month`.
   - Only count weekdays where food was actually delivered:
     - Must be a weekday (Mon-Fri).
     - Must fall within the subscription active range (handle mid-month starts or mid-month ends).
     - Must NOT fall within a pause date range.
   - Pause handling rules:
     - Weekend pauses have zero effect on billing.
     - Pauses crossing month boundaries should only affect the target month's weekdays.
     - Overlapping pause ranges must be merged so no day is subtracted twice.
     - A full-month pause results in ₹0 bill.
   - Provide a transparent day-by-day audit breakdown in the bill API showing served, paused, and non-weekday status for every calendar day.
   - Round final monthly bills to 2 decimal places.

---

### The Assignment Twists

We also need to handle three specific assignment twists:

1. **T1: Daily Delivery Notifications (`/clock` & `/outbox`)**
   - Create an endpoint `POST /clock` (or `POST /api/clock`) that accepts a date string (or defaults to today) to trigger daily delivery checks.
   - Check which customers have active subscriptions on that date, ensure it's a weekday, and make sure they aren't paused.
   - Queue a notification message into an outbox store (`outbox` table in SQLite).
   - Prevent duplicate notifications if `/clock` is called multiple times for the same date (idempotency).
   - Expose `GET /outbox` (or `GET /api/outbox`) to inspect the queued delivery notifications.

2. **T6: Mid-Cycle Subscription Transfer**
   - Create `POST /api/subscriptions/:id/transfer` to transfer an active subscription from one customer to another mid-cycle.
   - Split billing cleanly on the transfer date: the original customer is billed for eligible weekdays up to `transferDate - 1`, and the new customer is billed from `transferDate` onwards.
   - Split any active pauses spanning across the transfer date so both old and new customers get their exact pause portion.
   - Ensure zero double-billing across the cycle (`Customer A bill + Customer B bill = Total Cycle Bill`).

3. **T4: Messy Customer Import**
   - Create `POST /api/customers/import` to accept CSV data (either file upload or raw CSV text/json payload).
   - The CSV input will have messy data: mixed date formats (`YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`, `15-Sep-2026`), unformatted phone numbers, duplicate phone numbers, or invalid rows.
   - Parse and normalize all valid dates to `YYYY-MM-DD`.
   - Clean up phone numbers and perform two-tier deduplication (against existing DB records and within the CSV itself).
   - Return a clear summary response: `{ imported: [...], deduped: [...], rejected: [...] }` listing successful additions, deduplicated rows, and rejected rows with reasons.
   - Perform database insertions atomically using an SQLite transaction.

---

### Frontend Requirements (React + Vite)

- A clean, modern, owner-facing UI.
- **Landing Page**: Explains what the Tiffin Subscription Management system is, problem solved, key features, and target audience with a clear CTA to enter the app.
- **Dashboard**: High-level metrics (Active vs Paused vs Unsubscribed counts, monthly revenue projection), recent activity, and quick navigation.
- **Customer List & Search**: Search by phone or name, filter by status, pagination, create customer modal.
- **Customer Detail**: Full profile, pause/resume modal, transfer subscription modal, subscribe modal, pause history timeline, and an interactive month-by-month bill calculator with daily audit view.
- **Billing Page**: Overview of monthly billing across all customers.
- **Import CSV Page (T4)**: Drag-and-drop or file upload UI for messy customer CSVs, showing visual tabs for imported, deduped, and rejected rows.
- **Daily Notifications (T1)**: Interface to trigger the morning `/clock` check for any date and view the outbox notification log.

---

### Testing & Verification

- Include automated backend unit and integration tests using Node's test runner (`node test/*.test.js`).
- Test suite must cover:
  1. SQLite schema and tables initialization (`db-test.js`).
  2. Health & root endpoints (`health-test.js`).
  3. Authentication flows (registration, duplicate rejection, login, password checks, token validation) (`auth.test.js`).
  4. Deterministic billing engine math & edge cases (`billing.test.js`).
  5. Customer CRUD, subscription lifecycle, pause/resume, and monthly bill calculation (`customers.test.js`).
  6. Daily delivery notifications, weekend checks, and idempotency (`t1_notifications.test.js`).
  7. Mid-cycle subscription transfer, split billing, and overlapping pause splits (`t6_transfer.test.js`).
  8. Messy CSV date parsing, phone deduplication, and rejection reporting (`t4_import.test.js`).

Let's make sure everything runs cleanly with `npm test` and the frontend builds cleanly with `npm run build`!
