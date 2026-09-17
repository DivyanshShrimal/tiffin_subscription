# AI-Assisted Development Log (AI_LOGS.md)

This log documents the step-by-step development process of building the Tiffin Subscription Management System using an AI coding assistant. The project was built iteratively in verified milestones.

---

### Milestone 1 — Backend Foundation

**Prompt given to AI:**
> Set up the backend using Node.js, Express, and SQLite (`better-sqlite3`). Create the database schema for users, customers, subscriptions, and pauses with proper foreign keys and WAL mode enabled. Add an environment config file, a basic health check endpoint, a `.gitignore`, and tests to verify DB initialization and server startup.

**What was implemented:**
- Initialized Node.js backend (`backend/package.json`).
- Configured SQLite connection in `src/config/db.js` using `better-sqlite3` with `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`.
- Designed database schema in `src/models/schema.js`:
  - `users` table for owner authentication.
  - `customers` table for customer records.
  - `subscriptions` table tracking plans, pricing, start/end dates, and status.
  - `pauses` table storing pause start/end dates and reasons.
- Created environment configuration in `.env`.
- Added server entry point in `src/server.js` and health endpoint `GET /api/health`.
- Added initial test files `test/db-test.js` and `test/health-test.js`.

**Verification:**
- Ran `node test/db-test.js` to confirm schema creation, tables, and indexes.
- Ran `node test/health-test.js` to verify HTTP server startup and health check response (`{ status: "ok", database: "connected" }`).

**Issues & Corrections:**
- Ensured SQLite operates in WAL mode to avoid database locking issues during concurrent reads and writes.

**Status:** Completed & Verified.

---

### Milestone 2 — Authentication

**Prompt given to AI:**
> Implement owner authentication using JWT and bcrypt. Add user registration and login endpoints under `/api/auth`, store passwords securely hashed with bcrypt, create JWT authentication middleware to protect API routes, add a `/api/auth/me` profile endpoint, and write automated tests for all auth scenarios.

**What was implemented:**
- Added password hashing utility with `bcryptjs` (10 salt rounds).
- Implemented JWT token generation and verification using `jsonwebtoken` in `src/middleware/auth.js`.
- Built `authController.js` handling:
  - `POST /api/auth/register` (email validation, password length check, duplicate email rejection with HTTP 409).
  - `POST /api/auth/login` (credential verification, password comparison, JWT token return).
  - `GET /api/auth/me` (profile retrieval for authenticated user).
- Added `test/auth.test.js` covering 7 test cases.

**Verification:**
- Ran `node test/auth.test.js`. Tested successful registration, duplicate registration blocking, valid login, wrong password rejection, unknown user rejection, missing/invalid JWT token rejection, and valid token access. All 7 tests passed.

**Issues & Corrections:**
- Verified that `password_hash` is stripped out of all controller JSON responses so plain passwords or hashes are never exposed.

**Status:** Completed & Verified.

---

### Milestone 3 — Subscription & Billing Engine

**Prompt given to AI:**
> Implement customer CRUD operations, subscription management, pause/resume functionality, and the core deterministic monthly billing engine. The billing engine must calculate prorated monthly bills strictly based on Monday–Friday weekdays served, taking into account pauses, mid-month starts/ends, and overlapping intervals. Add a day-by-day audit breakdown to the bill response and write automated tests for all billing edge cases.

**What was implemented:**
- Customer CRUD APIs in `customerController.js`:
  - `POST /api/customers` (customer creation, phone uniqueness check).
  - `GET /api/customers` (paginated list, status filter, search by phone or name).
  - `GET /api/customers/:id` (customer profile with active subscription status).
  - `PUT /api/customers/:id` & `DELETE /api/customers/:id`.
- Subscription management (`POST /api/customers/:id/subscribe`).
- Pause & Resume engine (`POST /api/customers/:id/pause` & `POST /api/customers/:id/resume`):
  - Inclusive date range pause creation with optional reason.
  - Permanent storage in `pauses` table.
- Deterministic Weekday Billing Utility in `src/utils/billing.js`:
  - **Billing logic in simple terms**: The monthly price is divided by the total count of weekdays (Monday through Friday) in that specific calendar month to derive a daily rate. The customer is charged only for eligible weekdays where delivery actually took place (i.e. falling within active subscription dates and not covered by any pause).
  - Generates a `dailyBreakdown` array detailing `date`, `isWeekday`, `isEligible`, `isPaused`, and `isServed` for full audit transparency.
  - Bill endpoint: `GET /api/customers/:id/bill?month=YYYY-MM`.

**Verification & Edge Cases Tested:**
- Built `test/billing.test.js` (12 unit test cases) and `test/customers.test.js` (integration tests). Tested:
  1. Full normal month (all weekdays served).
  2. Single pause interval.
  3. Multiple pause intervals.
  4. Weekend-only pauses (ignored, zero billing impact).
  5. Pauses crossing month boundaries (only target month weekdays counted).
  6. Mid-month subscription start.
  7. Mid-month subscription end.
  8. Overlapping pause intervals (merged seamlessly, zero double-subtraction).
  9. Full-month pause (₹0.00 bill).
  10. Subscription starting after billing month (0 eligible, ₹0.00 bill).
  11. Input validation & month format parsing.
  12. Day-by-day audit breakdown precision.

**Issues & Corrections:**
- During testing, we noticed an issue when a customer paused starting today and resumed on the same day: the pause status remained `paused` because the pause `end_date` was still set in the future/today. We corrected the resume logic so that when resuming an active pause started today, the pause `end_date` is dynamically adjusted to yesterday (`adjustedEnd = yesterday`). This restored the customer status to `active` immediately while preserving the historical pause record in the database.

**Status:** Completed & Verified.

---

### Milestone 4 — Assignment Twists (T1, T6, T4)

**Prompt given to AI:**
> Implement all three assignment twists together as a single backend enhancement:
> 1. T1: Daily Delivery Notifications via `POST /clock` and `GET /outbox`.
> 2. T6: Mid-Cycle Subscription Transfer via `POST /api/subscriptions/:id/transfer`.
> 3. T4: Messy Customer CSV Import via `POST /api/customers/import`.
> Add dedicated test suites for each twist.

**What was implemented:**
- **T1: Daily Delivery Notifications**:
  - Endpoint `POST /clock` (and `/api/clock`) accepts a target `date` (defaults to today).
  - Evaluates active subscriptions, checks if the date is a weekday (Mon-Fri), and verifies the customer is not paused on that day.
  - Queues delivery notifications into the SQLite `outbox` table using `INSERT OR IGNORE` to guarantee idempotency (repeated clock calls generate 0 duplicate notifications).
  - Endpoint `GET /outbox` (and `/api/outbox`) allows inspecting queued delivery alerts.
  - Test file: `test/t1_notifications.test.js`.
- **T6: Mid-Cycle Subscription Transfer**:
  - Endpoint `POST /api/subscriptions/:id/transfer` transfers an active subscription from Customer A to Customer B on a given `transferDate`.
  - Customer A's subscription end date is set to `transferDate - 1 day`; Customer B receives a new subscription starting on `transferDate` carrying forward the same plan and price.
  - Active pauses spanning across `transferDate` are cleanly split between both customers.
  - Guarantees **zero double-billing** across the cycle (`Bill A + Bill B = Total Cycle Bill`).
  - Recorded in `subscription_transfers` table.
  - Test file: `test/t6_transfer.test.js`.
- **T4: Messy Customer Import**:
  - Endpoint `POST /api/customers/import` handles file uploads (`multipart/form-data`), raw CSV text (`text/csv`), or JSON payloads.
  - Date normalization engine (`src/utils/csvImport.js`) converts messy dates (`YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`, `15-Sep-2026`) to standard `YYYY-MM-DD`.
  - Two-tier phone deduplication (checks against existing database records and within the current CSV batch).
  - Returns a detailed execution report: `{ imported: [...], deduped: [...], rejected: [...] }`.
  - Wrapped in an SQLite atomic transaction (`db.transaction`).
  - Test file: `test/t4_import.test.js`.

**Verification:**
- Ran all twist test suites: `node test/t1_notifications.test.js`, `node test/t6_transfer.test.js`, `node test/t4_import.test.js`. All twist tests passed cleanly.

**Status:** Completed & Verified.

---

### Milestone 5 — Frontend Application

**Prompt given to AI:**
> Build a single-page frontend using React + Vite. Implement an owner landing page, login/registration UI, dashboard with KPI cards, customer list with search/filtering/pagination, customer detail view with modal dialogs for subscribing, pausing, resuming, transferring subscriptions, an interactive monthly bill calculator with daily audit table, a CSV import page with visual result tabs (T4), and a daily delivery notification outbox manager (T1). Ensure modern styling, responsive layouts, and proper toast notifications.

**What was implemented:**
- Set up React + Vite project in `frontend/`.
- Single-page application structure with custom client-side navigation (`src/App.jsx`).
- Pages & Components built:
  - `LandingPage.jsx`: Overview of the system, problem statement, key features, target audience, and call to action.
  - `Navbar.jsx`: Brand logo, navigation links, owner login status, logout trigger.
  - `Login.jsx` & `Register.jsx`: Owner authentication forms with validation and auto-login after signup.
  - `Dashboard.jsx`: KPI summary cards (Active, Paused, Unsubscribed, Revenue Projection), recent customer activity list, quick actions.
  - `Customers.jsx`: Customer search by phone or name, status filtering pills, paginated customer table, Add Customer modal.
  - `CustomerDetail.jsx`: Customer profile header, action buttons (Subscribe, Pause, Resume, Transfer), pause timeline, and interactive monthly bill calculator with daily breakdown audit grid.
  - `Billing.jsx`: Customer-wide monthly billing summary.
  - `ImportCustomers.jsx`: Drag-and-drop CSV upload and raw text paste UI for messy customer imports (T4) with visual tabs for Imported, Deduped, and Rejected rows.
  - `Notifications.jsx`: Interface for triggering the morning delivery clock check (T1) and viewing the outbox log.
- Toast feedback notification system for user actions.

**Verification:**
- Executed production build check `npm run build` in `frontend/`. Build completed successfully with 0 errors.

**Status:** Completed & Verified.

---

### Milestone 6 — Final Verification & Testing Matrix

**Prompt given to AI:**
> Run the full automated test suite across all backend test files, verify the frontend build, verify server integration, and review the codebase before final delivery.

**What was verified:**
1. **Automated Backend Tests**:
   - Command: `npm test` inside `backend/`.
   - Results: All **8 test suites** (containing **50+ individual test cases**) passed:
     - `test/db-test.js` — Schema, tables, indexes, foreign keys PASSED.
     - `test/health-test.js` — Server startup & health endpoint PASSED.
     - `test/auth.test.js` — All 7 auth scenarios PASSED.
     - `test/billing.test.js` — All 12 billing engine test cases PASSED.
     - `test/customers.test.js` — Customer CRUD, subscription, pause/resume, and bill integration PASSED.
     - `test/t1_notifications.test.js` — Daily notification clock, outbox, weekend check, idempotency PASSED.
     - `test/t6_transfer.test.js` — Mid-cycle transfer, split billing, zero double-billing PASSED.
     - `test/t4_import.test.js` — Messy CSV date normalization, deduplication, rejection tracking PASSED.
2. **Frontend Production Build**:
   - Command: `npm run build` inside `frontend/`. Output verified clean.
3. **End-to-End API Integration**:
   - Tested registration, login, customer creation, pause creation, subscription transfer, and billing calculation via live HTTP requests against running dev servers (`http://localhost:5000` & `http://localhost:5173`).

---

### Documentation & Version Control

- **Documentation Files**:
  - `README.md`: Comprehensive project overview, feature breakdown, setup instructions, REST API reference, and testing guide.
  - `REASONING.md`: Engineering decisions, billing mathematical invariants, UTC date immunity, and twist architecture.
  - `AI_LOGS.md`: Chronological log of AI-assisted development workflow, prompts, verification steps, and issue resolutions.
- **Git Version Control & Environment Hygiene**:
  - `.gitignore` configured to keep local SQLite database files (`*.db`, `*.db-wal`, `*.db-shm`), environment files (`.env`), and `node_modules` out of Git.
  - Clean milestone-by-milestone commit history pushed to the main repository branch.
