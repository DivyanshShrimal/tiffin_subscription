const { getDb } = require('../db');
const { isValidDateString, isWeekday } = require('../utils/billing');

/**
 * Formats current UTC date as YYYY-MM-DD
 */
function getTodayString() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Processes daily delivery notifications for a given date.
 * Enforces:
 * - Weekday only (Mon-Fri)
 * - Customer has an active subscription covering the date
 * - Customer is not paused on that date
 * - Deduplication (at most one notification per customer per delivery date)
 */
function processDailyDeliveries(customDate = null) {
  const dateStr = customDate ? String(customDate).trim() : getTodayString();

  if (!isValidDateString(dateStr)) {
    throw new Error(`Invalid date format "${dateStr}". Expected YYYY-MM-DD.`);
  }

  // 1. Weekend check: deliveries only occur Monday-Friday
  if (!isWeekday(dateStr)) {
    return {
      date: dateStr,
      isWeekday: false,
      message: 'Weekend - no deliveries scheduled',
      eligibleCount: 0,
      generatedCount: 0,
      notifications: []
    };
  }

  const db = getDb();
  const now = new Date().toISOString();

  // 2. Query all customers who have a subscription spanning this date
  const candidateSubscriptions = db.prepare(`
    SELECT 
      c.id AS customer_id,
      c.name AS customer_name,
      c.phone AS customer_phone,
      s.id AS subscription_id,
      s.plan_name,
      s.status AS subscription_status
    FROM customers c
    JOIN subscriptions s ON s.customer_id = c.id
    WHERE s.status IN ('active', 'paused')
      AND s.start_date <= ?
      AND (s.end_date IS NULL OR s.end_date >= ?)
    ORDER BY c.id ASC
  `).all(dateStr, dateStr);

  const notificationsGenerated = [];
  let eligibleCount = 0;

  // 3. For each candidate, verify they are not paused on this date
  for (const sub of candidateSubscriptions) {
    const activePause = db.prepare(`
      SELECT id FROM pauses
      WHERE customer_id = ?
        AND start_date <= ?
        AND end_date >= ?
      LIMIT 1
    `).get(sub.customer_id, dateStr, dateStr);

    if (activePause) {
      // Customer is paused on this date -> no delivery and no notification
      continue;
    }

    eligibleCount++;

    const message = `Hello ${sub.customer_name}! Your ${sub.plan_name} lunch will be delivered today (${dateStr}). Enjoy your meal!`;
    const notifType = 'delivery_reminder';

    // 4. Insert into outbox with duplicate prevention via UNIQUE constraint & INSERT OR IGNORE
    const insertResult = db.prepare(`
      INSERT OR IGNORE INTO outbox (customer_id, phone, notification_type, message, delivery_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sub.customer_id, sub.customer_phone, notifType, message, dateStr, now);

    if (insertResult.changes > 0) {
      notificationsGenerated.push({
        id: insertResult.lastInsertRowid,
        customerId: sub.customer_id,
        customerName: sub.customer_name,
        phone: sub.customer_phone,
        notificationType: notifType,
        message,
        deliveryDate: dateStr,
        createdAt: now
      });
    }
  }

  return {
    date: dateStr,
    isWeekday: true,
    message: `Delivery processing completed for ${dateStr}`,
    eligibleCount,
    generatedCount: notificationsGenerated.length,
    notifications: notificationsGenerated
  };
}

/**
 * Retrieves notifications from the outbox with optional filtering.
 */
function getOutbox({ date, customerId, limit = 100 } = {}) {
  const db = getDb();
  let query = `
    SELECT 
      o.id,
      o.customer_id,
      c.name AS customer_name,
      o.phone,
      o.notification_type,
      o.message,
      o.delivery_date,
      o.created_at
    FROM outbox o
    JOIN customers c ON c.id = o.customer_id
  `;

  const conditions = [];
  const params = [];

  if (date) {
    conditions.push('o.delivery_date = ?');
    params.push(String(date).trim());
  }

  if (customerId) {
    conditions.push('o.customer_id = ?');
    params.push(Number(customerId));
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY o.id DESC LIMIT ?';
  params.push(Math.max(1, Math.min(500, parseInt(limit, 10) || 100)));

  const notifications = db.prepare(query).all(...params);

  return {
    total: notifications.length,
    notifications
  };
}

module.exports = {
  processDailyDeliveries,
  getOutbox
};
