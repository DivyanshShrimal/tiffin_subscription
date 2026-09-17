const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  createCustomer,
  listCustomers,
  searchCustomersByPhone,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  subscribeCustomer,
  pauseCustomer,
  resumeCustomer,
  getCustomerStatus,
  getCustomerBill
} = require('../controllers/customerController');

const router = express.Router();

// All customer, subscription, and billing endpoints require authentication
router.use(requireAuth);

// Collection routes
router.get('/', listCustomers);
router.post('/', createCustomer);

// Phone search (must be before /:id)
router.get('/search', searchCustomersByPhone);

// Customer member routes
router.get('/:id', getCustomerById);
router.put('/:id', updateCustomer);
router.delete('/:id', deleteCustomer);

// Subscription lifecycle
router.post('/:id/subscribe', subscribeCustomer);
router.post('/:id/pause', pauseCustomer);
router.post('/:id/resume', resumeCustomer);
router.get('/:id/status', getCustomerStatus);

// Billing calculation
router.get('/:id/bill', getCustomerBill);

module.exports = router;
