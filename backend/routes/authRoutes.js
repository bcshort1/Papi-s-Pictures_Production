const express = require('express');
const router = express.Router();
const { loginUser, loginAdmin, registerUser, logoutUser, getSession } = require('../controllers/authController');

//POST /api/login — Authenticate a user (any account type) and create a session.
router.post('/login', loginUser);

//POST /api/admin/login — Authenticate an admin only. Non-admin credentials get a generic 401
//so the response cannot be used to discover whether a username belongs to a customer account.
router.post('/admin/login', loginAdmin);

//POST /api/register — Create a new customer-tier account and log them in.
router.post('/register', registerUser);

//POST /api/logout — Destroy the session and clear the cookie.
router.post('/logout', logoutUser);

//GET /api/session — Check if the current request is authenticated.
router.get('/session', getSession);

module.exports = router;
