const { getDb } = require('../db');
const { isValidDateString } = require('../utils/billing');

/**
 * Returns the calendar date immediately preceding the given YYYY-MM-DD date.
 */
function getPreviousDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const prevY = dt.getUTCFullYear();
  const prevM = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const prevD = String(dt.getUTCDate()).padStart(2, '0');
  return `${prevY}-${prevM}-${prevD}`;
}

/**
 * Transfers a subscription from one customer to a new customer mid-cycle.
 * POST /api/subscriptions/:id/transfer
 */
function transferSubscription(req, res) {
  const subscriptionId = parseInt(req.params.id, 10);
  if (isNaN(subscriptionId)) {
    return res.status(400).json({ error: 'Validation Error', message: 'Invalid subscription ID' });
  }

  const { newCustomerId, transferDate } = req.body || {};

  const targetCustomerId = parseInt(newCustomerId, 10);
  if (isNaN(targetCustomerId)) {
    return res.status(400).json({ error: 'Validation Error', message: 'Valid newCustomerId is required' });
  }

  if (!transferDate || !isValidDateString(transferDate)) {
    return res.status(400).json({ error: 'Validation Error', message: 'Valid transferDate (YYYY-MM-DD) is required' });
  }

  const cleanTransferDate = transferDate.trim();
  const db = getDb();

  try {
    // 1. Verify existing subscription
    const originalSub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subscriptionId);
    if (!originalSub) {
      return res.status(404).json({ error: 'Not Found', message: 'Original subscription not found' });
    }

    if (originalSub.status === 'cancelled') {
      return res.status(400).json({ error: 'Bad Request', message: 'Cannot transfer a cancelled subscription' });
    }

    if (originalSub.customer_id === targetCustomerId) {
      return res.status(400).json({ error: 'Bad Request', message: 'Cannot transfer subscription to the same customer' });
    }

    // 2. Verify new customer exists
    const newCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(targetCustomerId);
    if (!newCustomer) {
      return res.status(404).json({ error: 'Not Found', message: 'New customer does not exist' });
    }

    // 3. Date bounds checks
    if (cleanTransferDate < originalSub.start_date) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `transferDate (${cleanTransferDate}) cannot be before subscription start date (${originalSub.start_date})`
      });
    }

    if (originalSub.end_date && cleanTransferDate > originalSub.end_date) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `transferDate (${cleanTransferDate}) cannot be after subscription end date (${originalSub.end_date})`
      });
    }

    const previousDay = getPreviousDay(cleanTransferDate);
    const now = new Date().toISOString();

    // 4. Perform atomic transfer in a transaction
    const executeTransfer = db.transaction(() => {
      // a. Update original subscription end_date to the day before transferDate
      db.prepare(`
        UPDATE subscriptions
        SET end_date = ?, updated_at = ?
        WHERE id = ?
      `).run(previousDay, now, originalSub.id);

      // b. Cancel any other active subscription of the new customer to prevent duplicate active plans
      db.prepare(`
        UPDATE subscriptions
        SET status = 'cancelled', updated_at = ?
        WHERE customer_id = ? AND status IN ('active', 'paused')
      `).run(now, targetCustomerId);

      // c. Create the new carried-over subscription for the new customer
      const insertSub = db.prepare(`
        INSERT INTO subscriptions (customer_id, plan_name, monthly_price, start_date, end_date, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
      `).run(
        targetCustomerId,
        originalSub.plan_name,
        originalSub.monthly_price,
        cleanTransferDate,
        originalSub.end_date,
        now,
        now
      );
      const newSubId = insertSub.lastInsertRowid;

      // d. Handle pause periods cleanly without double-counting or losing history
      const relatedPauses = db.prepare(`
        SELECT * FROM pauses
        WHERE customer_id = ? AND end_date >= ?
      `).all(originalSub.customer_id, cleanTransferDate);

      for (const p of relatedPauses) {
        if (p.start_date >= cleanTransferDate) {
          // Pause is fully in the new customer's cycle -> transfer to new customer
          db.prepare(`
            UPDATE pauses
            SET customer_id = ?, subscription_id = ?, updated_at = ?
            WHERE id = ?
          `).run(targetCustomerId, newSubId, now, p.id);
        } else if (p.start_date < cleanTransferDate && p.end_date >= cleanTransferDate) {
          // Pause spans the transfer date -> split pause
          // Old customer keeps pause up to previousDay
          db.prepare(`
            UPDATE pauses
            SET end_date = ?, updated_at = ?
            WHERE id = ?
          `).run(previousDay, now, p.id);

          // New customer gets pause from transferDate to original end_date
          db.prepare(`
            INSERT INTO pauses (customer_id, subscription_id, start_date, end_date, reason, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            targetCustomerId,
            newSubId,
            cleanTransferDate,
            p.end_date,
            p.reason ? `(Transferred) ${p.reason}` : 'Transferred pause',
            now,
            now
          );
        }
      }

      // e. Log transfer record
      const insertTransfer = db.prepare(`
        INSERT INTO subscription_transfers (original_subscription_id, new_subscription_id, from_customer_id, to_customer_id, transfer_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(originalSub.id, newSubId, originalSub.customer_id, targetCustomerId, cleanTransferDate, now);

      return {
        transferId: insertTransfer.lastInsertRowid,
        newSubId
      };
    });

    const { transferId, newSubId } = executeTransfer();

    const updatedOriginal = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(originalSub.id);
    const createdNew = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(newSubId);

    return res.status(200).json({
      message: 'Subscription transferred successfully',
      transfer: {
        id: transferId,
        originalSubscriptionId: originalSub.id,
        newSubscriptionId: newSubId,
        fromCustomerId: originalSub.customer_id,
        toCustomerId: targetCustomerId,
        transferDate: cleanTransferDate,
        createdAt: now
      },
      originalSubscription: updatedOriginal,
      newSubscription: createdNew
    });
  } catch (error) {
    console.error('Error transferring subscription:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

module.exports = {
  transferSubscription
};
