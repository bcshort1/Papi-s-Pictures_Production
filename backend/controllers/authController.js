const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'papis_pictures_jwt_secret';
const JWT_EXPIRES_IN = '24h';
const COOKIE_MAX_AGE = 1000 * 60 * 60 * 24;

const loginUser = asyncHandler(async function (req, res) {
    const { username, password } = req.body;

    if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
    }

    const user = await User.findOne({ username: username });

    if (!user || !(await user.comparePassword(password))) {
        res.status(401).json({ error: 'Invalid username or password' });
        return;
    }

    const token = jwt.sign(
        { username: user.username, accountType: user.accountType },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

    res.cookie('token', token, {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: COOKIE_MAX_AGE
    });

    res.json({
        success: true,
        username: user.username,
        accountType: user.accountType
    });
});

const loginAdmin = asyncHandler(async function (req, res) {
    const { username, password } = req.body;

    if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
    }

    const user = await User.findOne({ username: username });

    if (!user || !(await user.comparePassword(password)) || user.accountType !== 'admin') {
        res.status(401).json({ error: 'Invalid username or password' });
        return;
    }

    const token = jwt.sign(
        { username: user.username, accountType: user.accountType },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

    res.cookie('token', token, {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: COOKIE_MAX_AGE
    });

    res.json({
        success: true,
        username: user.username,
        accountType: user.accountType
    });
});

const registerUser = asyncHandler(async function (req, res) {
    const { username, password } = req.body;

    if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
    }

    if (password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters' });
        return;
    }

    const existing = await User.findOne({ username: username });
    if (existing) {
        res.status(409).json({ error: 'Username already taken' });
        return;
    }

    const user = new User({ username: username, password: password, accountType: 'user' });
    await user.save();

    const token = jwt.sign(
        { username: user.username, accountType: user.accountType },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

    res.cookie('token', token, {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: COOKIE_MAX_AGE
    });

    res.status(201).json({
        success: true,
        username: user.username,
        accountType: user.accountType
    });
});

const logoutUser = asyncHandler(async function (req, res) {
    res.clearCookie('token');
    res.json({ success: true });
});

const getSession = asyncHandler(async function (req, res) {
    const token = req.cookies && req.cookies.token;
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            res.json({
                authenticated: true,
                username: decoded.username,
                accountType: decoded.accountType
            });
            return;
        } catch (e) {
        }
    }
    res.json({ authenticated: false });
});

module.exports = { loginUser, loginAdmin, registerUser, logoutUser, getSession };
