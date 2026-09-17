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
  getCustomerBill,
  importCustomers
} = require('../controllers/customerController');

const router = express.Router();

// All customer, subscription, and billing endpoints require authentication
router.use(requireAuth);

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// Collection routes
router.get('/', listCustomers);
router.post('/', createCustomer);

// Phone search and CSV import (must be before /:id)
router.get('/search', searchCustomersByPhone);
router.post('/import', upload.single('file'), importCustomers);

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
