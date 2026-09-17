-- Database Schema for Tiffin Subscription Management

PRAGMA foreign_keys = ON;

-- Users table (owner / admins)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    email TEXT,
    address TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    plan_name TEXT NOT NULL,
    monthly_price REAL NOT NULL CHECK (monthly_price >= 0),
    start_date TEXT NOT NULL, -- YYYY-MM-DD
    end_date TEXT,            -- YYYY-MM-DD (nullable if ongoing)
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- Pauses table (dates inclusive)
CREATE TABLE IF NOT EXISTS pauses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    subscription_id INTEGER,
    start_date TEXT NOT NULL, -- YYYY-MM-DD
    end_date TEXT NOT NULL,   -- YYYY-MM-DD
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

-- Outbox table for notifications (T1)
CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    notification_type TEXT NOT NULL DEFAULT 'delivery_reminder',
    message TEXT NOT NULL,
    delivery_date TEXT NOT NULL, -- YYYY-MM-DD
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    UNIQUE(customer_id, delivery_date, notification_type)
);

-- Subscription transfers table (T6)
CREATE TABLE IF NOT EXISTS subscription_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_subscription_id INTEGER NOT NULL,
    new_subscription_id INTEGER NOT NULL,
    from_customer_id INTEGER NOT NULL,
    to_customer_id INTEGER NOT NULL,
    transfer_date TEXT NOT NULL, -- YYYY-MM-DD
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (original_subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    FOREIGN KEY (new_subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    FOREIGN KEY (from_customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (to_customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- Indexes for performance & integrity
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_pauses_customer ON pauses(customer_id);
CREATE INDEX IF NOT EXISTS idx_pauses_dates ON pauses(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_outbox_date ON outbox(delivery_date);
CREATE INDEX IF NOT EXISTS idx_outbox_customer ON outbox(customer_id);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON subscription_transfers(from_customer_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON subscription_transfers(to_customer_id);
