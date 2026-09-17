const express = require('express');
const { processDailyDeliveries, getOutbox } = require('../services/notificationService');

const router = express.Router();

// POST /clock or /api/clock
router.post('/clock', (req, res) => {
  try {
    const { date } = req.body || {};
    const result = processDailyDeliveries(date);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({
      error: 'Bad Request',
      message: error.message
    });
  }
});

// GET /outbox or /api/outbox
router.get('/outbox', (req, res) => {
  try {
    const { date, customerId, limit } = req.query || {};
    const result = getOutbox({ date, customerId, limit });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

module.exports = router;
