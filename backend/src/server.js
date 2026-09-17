const app = require('./app');
const config = require('./config');
const { initDb } = require('./db');

try {
  // Initialize Database on startup
  initDb();
  console.log('SQLite database initialized successfully at:', config.dbPath);

  app.listen(config.port, () => {
    console.log(`Tiffin Subscription Server running on http://localhost:${config.port}`);
    console.log(`Health check: http://localhost:${config.port}/api/health`);
  });
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}
