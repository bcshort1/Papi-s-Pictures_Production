const express = require('express');
const router = express.Router();
const { loginUser, loginAdmin, registerUser, logoutUser, getSession } = require('../controllers/authController');

router.post('/login', loginUser);

router.post('/admin/login', loginAdmin);

router.post('/register', registerUser);

router.post('/logout', logoutUser);

router.get('/session', getSession);

module.exports = router;
