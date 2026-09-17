const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { transferSubscription } = require('../controllers/subscriptionController');

const router = express.Router();

router.post('/:id/transfer', requireAuth, transferSubscription);

module.exports = router;
