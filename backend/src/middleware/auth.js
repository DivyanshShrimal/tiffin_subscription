const jwt = require('jsonwebtoken');
const config = require('../config');
const { getDb } = require('../db');

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication token is required. Format: Bearer <token>'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const db = getDb();

    // Verify user exists in database without exposing password_hash
    const user = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?').get(decoded.id);

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User belonging to this token no longer exists'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token has expired'
      });
    }
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid token'
    });
  }
}

module.exports = {
  requireAuth
};
