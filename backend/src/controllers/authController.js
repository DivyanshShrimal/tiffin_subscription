const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { getDb } = require('../db');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function register(req, res) {
  const { name, email, password } = req.body || {};

  // Validation
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Name is required and cannot be empty'
    });
  }

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'A valid email address is required'
    });
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Password must be at least 6 characters long'
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const db = getDb();

  try {
    // Check for existing user
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A user with this email address already exists'
      });
    }

    // Hash password with bcrypt
    const saltRounds = 10;
    const passwordHash = bcrypt.hashSync(password, saltRounds);

    const now = new Date().toISOString();
    const insertStmt = db.prepare(`
      INSERT INTO users (name, email, password_hash, created_at)
      VALUES (?, ?, ?, ?)
    `);

    const result = insertStmt.run(name.trim(), normalizedEmail, passwordHash, now);
    const userId = result.lastInsertRowid;

    // Generate JWT token
    const token = jwt.sign(
      { id: userId, email: normalizedEmail },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    return res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: userId,
        name: name.trim(),
        email: normalizedEmail,
        created_at: now
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to register user'
    });
  }
}

function login(req, res) {
  const { email, password } = req.body || {};

  // Validation
  if (!email || !password) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Email and password are required'
    });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const db = getDb();

  try {
    const user = db.prepare('SELECT id, name, email, password_hash, created_at FROM users WHERE email = ?').get(normalizedEmail);

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password'
      });
    }

    const isMatch = bcrypt.compareSync(String(password), user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password'
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to log in'
    });
  }
}

function getProfile(req, res) {
  // req.user is set by requireAuth middleware
  return res.status(200).json({
    user: req.user
  });
}

module.exports = {
  register,
  login,
  getProfile
};
