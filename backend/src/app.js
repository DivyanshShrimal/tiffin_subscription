const express = require('express');
const cors = require('cors');
const { getDb } = require('./db');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Root & Health check endpoints
app.get('/', (req, res) => {
  res.json({
    name: 'Tiffin Subscription Management API',
    status: 'running',
    version: '1.0.0'
  });
});

app.get('/api/health', (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare('SELECT 1 as connected').get();
    
    res.json({
      status: 'ok',
      database: result.connected === 1 ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      database: 'error',
      message: error.message
    });
  }
});

// Routes
const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');

app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

module.exports = app;
