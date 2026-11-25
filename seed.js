'use strict';

// Seeds a demo account (demo@receiptscan.app / demo123) if it doesn't exist.
const { createUser, findUserByEmail } = require('./db');

const EMAIL = 'demo@receiptscan.app';
if (!findUserByEmail(EMAIL)) {
  createUser({ email: EMAIL, password: 'demo123', name: 'Demo User' });
  console.log('Seeded demo user:', EMAIL);
} else {
  console.log('Demo user already exists');
}
