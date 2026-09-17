# Tiffin Subscription Management System

A production-quality full-stack tiffin lunch delivery subscription management system built with **Node.js, Express, and SQLite**. Designed for home-style meal service providers to automate monthly weekday billing, manage vacation/festival pause cycles without loss of historical audit trails, support mid-cycle subscription transfers, notify daily delivery recipients, and cleanly import messy customer spreadsheets.

---

## 🌟 Features

### Core Capabilities
- **Authentication & Security**: Owner registration and login with bcrypt password hashing (10 salt rounds) and stateless JWT token authentication.
- **Customer Lifecycle**: Create, search by phone, view profile, update, and delete customers.
- **Subscription Management**: Support for monthly weekday plans, plan prices, start dates, and optional end dates.
- **Pause & Resume Engine**: Inclusive date range pauses for vacations and festivals, permanent pause history retention, and instant restoration of active status on resume without mutating past billing records.
- **Deterministic Weekday Billing Engine**: Pure calendar arithmetic calculating Monday–Friday lunch service, daily rates derived from the total weekdays in the billing month, with comprehensive handling of mid-month starts, mid-month ends, weekend-only pauses, month boundary crossings, and overlapping pause intervals.
- **Transparent Audit Breakdown**: Day-by-day inspection array for owners to verify served vs paused status for every calendar day in any billing month.

### Assignment Twists Implemented
- **T1: Daily Delivery Notifications**:
  - `POST /clock` & `POST /api/clock`: Simulates morning delivery scheduler for any given date.
  - Automatically filters for Monday–Friday, active subscriptions within date bounds, and non-paused status.
  - Generates exactly one notification per eligible customer; idempotent duplicate prevention.
  - `GET /outbox` & `GET /api/outbox`: Inspects queued notifications.
- **T6: Mid-Cycle Subscription Transfer**:
  - `POST /api/subscriptions/:id/transfer`: Transfers a subscription plan and billing cycle mid-cycle to a new customer without destroying billing history.
  - Original customer is billed strictly for eligible days before transfer date; new customer is billed from transfer date onward.
  - Active and overlapping pause periods split cleanly between old and new customer.
  - Guarantees zero double-billing across the cycle.
- **T4: Messy Customer Import**:
  - `POST /api/customers/import`: Imports customer records with messy date formats (`YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`, `15-Sep-2026`, etc.), dirty phones, and missing fields.
  - Returns a clean `{ imported, deduped, rejected }` report with explicit reasons.
  - Prevents duplicate customers via in-batch and database phone deduplication.
  - Executes safely within an atomic SQLite transaction.

---

## 🛠 Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite3 via `better-sqlite3` (WAL mode, foreign key enforcement)
- **Authentication**: JSON Web Tokens (`jsonwebtoken`) & `bcryptjs`
- **File Uploads**: `multer`
- **Testing**: Native Node.js test runner (`node test/*.test.js`)

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js (v18 or higher recommended; developed and tested on Node v24.5.0)
- npm

### 1. Clone & Install Dependencies
```bash
cd backend
npm install
```

### 2. Environment Configuration
Create a `.env` file in the `backend/` directory:
```env
PORT=5000
NODE_ENV=development
DB_PATH=./data/tiffin.db
JWT_SECRET=super-secret-tiffin-jwt-key-change-in-production
JWT_EXPIRES_IN=7d
```

### 3. Database Initialization
The SQLite database schema and indexes initialize automatically when the server boots. To verify initialization manually:
```bash
node test/db-test.js
```

### 4. Running the Backend Server
```bash
npm start
# Server starts on http://localhost:5000
```
Development mode with auto-reload:
```bash
npm run dev
```

### 5. Running the Frontend App
```bash
cd ../frontend
npm install
npm run dev
# React + Vite app starts on http://localhost:5173
```

To build for production:
```bash
npm run build
```

---

## 🧪 Running Automated Tests

Run the complete 8-suite automated test matrix:
```bash
npm test
```

This runs:
1. `test/db-test.js`: Database schema, tables, foreign keys, and indexes.
2. `test/health-test.js`: Server startup, root, and health endpoints.
3. `test/auth.test.js`: Registration, duplicate rejection, login, wrong password, token validation.
4. `test/billing.test.js`: Pure deterministic billing engine (all 8 mandatory edge cases + extra cases).
5. `test/customers.test.js`: Customer CRUD, subscription lifecycle, pause/resume, and monthly bill calculation.
6. `test/t1_notifications.test.js`: Daily delivery notifications (T1), outbox inspection, weekend check, and deduplication.
7. `test/t6_transfer.test.js`: Mid-cycle subscription transfer (T6), split billing, overlapping pause split, and zero double billing.
8. `test/t4_import.test.js`: Messy customer import (T4), date normalization, deduplication, and rejection reporting.

---

## 📐 Billing Formula & Business Logic

For any requested billing month `YYYY-MM`:

1. **Total Weekdays (`totalWeekdaysInMonth`)**: Count of all Mondays through Fridays in the calendar month.
2. **Eligible Weekdays (`eligibleWeekdays`)**: Count of weekdays within the subscription period:
   $$\text{date} \ge \text{subscription.start\_date} \quad \text{and} \quad (\text{subscription.end\_date IS NULL} \lor \text{date} \le \text{subscription.end\_date})$$
3. **Paused Weekdays (`pausedWeekdays`)**: Count of eligible weekdays covered by any recorded pause period:
   $$\text{date} \ge \text{pause.start\_date} \quad \text{and} \quad \text{date} \le \text{pause.end\_date}$$
   *(Overlapping pause periods are merged day-by-day to prevent double counting. Weekend pause days are ignored).*
4. **Served Weekdays (`servedWeekdays`)**:
   $$\text{servedWeekdays} = \max(0, \text{eligibleWeekdays} - \text{pausedWeekdays})$$
5. **Daily Rate (`dailyRate`)**:
   $$\text{dailyRate} = \frac{\text{monthlyPlanPrice}}{\text{totalWeekdaysInMonth}}$$
6. **Total Bill (`totalBill`)**:
   $$\text{totalBill} = \operatorname{round}(\text{dailyRate} \times \text{servedWeekdays}, 2)$$
   *(If $\text{servedWeekdays} = 0$, $\text{totalBill} = 0.00$)*

---

## 📡 API Catalog

### Authentication Endpoints

#### `POST /api/auth/register`
- **Purpose**: Register a new owner account.
- **Request**:
  ```json
  {
    "name": "Owner Name",
    "email": "owner@tiffin.com",
    "password": "password123"
  }
  ```
- **Response (201)**:
  ```json
  {
    "message": "User registered successfully",
    "token": "eyJhbGciOiJIUzI1Ni...",
    "user": { "id": 1, "name": "Owner Name", "email": "owner@tiffin.com" }
  }
  ```

#### `POST /api/auth/login`
- **Purpose**: Log in with credentials and receive JWT.
- **Request**:
  ```json
  { "email": "owner@tiffin.com", "password": "password123" }
  ```

#### `GET /api/auth/me`
- **Purpose**: Returns current authenticated user profile. Requires Bearer JWT.

---

### Customer & Subscription Endpoints (Protected by JWT)

All customer endpoints require `Authorization: Bearer <token>` header.

#### `GET /api/customers`
- **Purpose**: Paginated, sortable, and searchable list of customers with dynamic status.
- **Query Params**: `page` (default 1), `limit` (default 10), `search` (phone or name), `status` ('all' | 'active' | 'paused'), `sortBy` ('created_at' | 'name' | 'phone'), `sortOrder` ('ASC' | 'DESC').

#### `POST /api/customers`
- **Purpose**: Create a new customer profile.
- **Request**:
  ```json
  {
    "name": "Rajesh Kumar",
    "phone": "9876543210",
    "email": "rajesh@example.com",
    "address": "Flat 402, Sunshine Apts",
    "notes": "Low spice"
  }
  ```

#### `GET /api/customers/search?phone=98765`
- **Purpose**: Direct lookup of customer(s) matching phone substring.

#### `GET /api/customers/:id`
- **Purpose**: Full details, active subscription, and pause history.

#### `PUT /api/customers/:id`
- **Purpose**: Update customer name, phone, email, address, or notes.

#### `DELETE /api/customers/:id`
- **Purpose**: Delete customer and cascade delete subscriptions and pauses.

#### `POST /api/customers/:id/subscribe`
- **Purpose**: Subscribe customer to a monthly plan.
- **Request**:
  ```json
  {
    "planName": "Deluxe Veg Lunch",
    "monthlyPrice": 3000,
    "startDate": "2026-09-01",
    "endDate": null
  }
  ```

#### `POST /api/customers/:id/pause`
- **Purpose**: Pause deliveries for an inclusive date range.
- **Request**:
  ```json
  {
    "startDate": "2026-09-07",
    "endDate": "2026-09-11",
    "reason": "Family vacation"
  }
  ```

#### `POST /api/customers/:id/resume`
- **Purpose**: Closes open pause period and immediately restores `active` status without deleting historical pause logs.

#### `GET /api/customers/:id/status`
- **Purpose**: Dynamic real-time status inspection (`active`, `paused`, `no_subscription`), active pause info, and recent pause history.

#### `GET /api/customers/:id/bill?month=YYYY-MM`
- **Purpose**: Detailed monthly bill with transparent breakdown and day-by-day audit log.
- **Sample Response (200)**:
  ```json
  {
    "customer": { "id": 1, "name": "Rajesh Kumar", "phone": "9876543210" },
    "month": "2026-09",
    "monthlyPlanPrice": 3000,
    "totalWeekdaysInMonth": 22,
    "eligibleWeekdays": 22,
    "pausedWeekdays": 5,
    "servedWeekdays": 17,
    "dailyRate": 136.36,
    "totalBill": 2318.18,
    "dailyBreakdown": [
      {
        "date": "2026-09-01",
        "dayOfWeek": "Tuesday",
        "isWeekday": true,
        "isEligible": true,
        "isPaused": false,
        "isServed": true,
        "pauseReason": null
      }
    ]
  }
  ```

---

### Twist Endpoints

#### T1: Daily Delivery Notifications
- **`POST /clock`** & **`POST /api/clock`**
  - **Purpose**: Triggers daily delivery notifications for a given date.
  - **Request**:
    ```json
    { "date": "2026-09-17" }
    ```
  - **Response (200)**:
    ```json
    {
      "date": "2026-09-17",
      "isWeekday": true,
      "message": "Delivery processing completed for 2026-09-17",
      "eligibleCount": 2,
      "generatedCount": 2,
      "notifications": [...]
    }
    ```
- **`GET /outbox`** & **`GET /api/outbox`**
  - **Purpose**: View queued delivery notifications.
  - **Query Params**: `date`, `customerId`, `limit`.

#### T6: Mid-Cycle Subscription Transfer
- **`POST /api/subscriptions/:id/transfer`**
  - **Purpose**: Transfers a subscription to a new customer mid-cycle.
  - **Request**:
    ```json
    {
      "newCustomerId": 2,
      "transferDate": "2026-09-15"
    }
    ```
  - **Response (200)**:
    ```json
    {
      "message": "Subscription transferred successfully",
      "transfer": {
        "id": 1,
        "originalSubscriptionId": 1,
        "newSubscriptionId": 2,
        "fromCustomerId": 1,
        "toCustomerId": 2,
        "transferDate": "2026-09-15"
      },
      "originalSubscription": { "id": 1, "end_date": "2026-09-14" },
      "newSubscription": { "id": 2, "start_date": "2026-09-15" }
    }
    ```

#### T4: Messy Customer Import
- **`POST /api/customers/import`**
  - **Purpose**: Imports messy CSV data with deduplication and validation.
  - **Content Types Supported**: `multipart/form-data` (file), `text/csv`, `application/json` (`{ "csv": "..." }`).
  - **Sample Response (200)**:
    ```json
    {
      "imported": [
        { "row": 2, "customerId": 5, "name": "Geeta Iyer", "phone": "9876500102", "startDate": "2026-09-15" }
      ],
      "deduped": [
        { "row": 6, "phone": "9876500101", "name": "Duplicate", "reason": "Duplicate phone number" }
      ],
      "rejected": [
        { "row": 8, "reason": "Invalid monthly_price: \"-500\". Must be a non-negative number." }
      ]
    }
    ```