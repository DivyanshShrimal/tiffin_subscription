const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  port: process.env.PORT || 5000,
  dbPath: process.env.DB_PATH || path.join(__dirname, '../../data/tiffin.db'),
  env: process.env.NODE_ENV || 'development'
};
