//Wraps async route handlers so thrown errors propagate to my error middleware.
const asyncHandler = require('express-async-handler');
//JWT library for signing/verifying admin session tokens.
const jwt = require('jsonwebtoken');
//User model with bcrypt-hashed passwords.
const User = require('../models/User');

//Signing secret with a fallback so dev still works without an env file.
const JWT_SECRET = process.env.JWT_SECRET || 'papis_pictures_jwt_secret';
//Token lifetime — 24 hours matches the cookie maxAge below.
const JWT_EXPIRES_IN = '24h';
//Cookie lifetime in milliseconds (24 hours).
const COOKIE_MAX_AGE = 1000 * 60 * 60 * 24;

//POST /api/login — Authenticate a user and return a JWT in an httpOnly cookie.
const loginUser = asyncHandler(async function (req, res) {
    //Pull credentials off the JSON body.
    const { username, password } = req.body;

    //Reject the request early if either field is missing.
    if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
    }

    //Look up the user in the database by username.
    const user = await User.findOne({ username: username });

    //Verify the password with bcrypt. I use the same error message for both invalid
    //username and invalid password to prevent user enumeration.
    if (!user || !(await user.comparePassword(password))) {
        //Generic 401 — don't leak which side failed.
        res.status(401).json({ error: 'Invalid username or password' });
        return;
    }

    //Generate a signed JWT containing user identity.
    const token = jwt.sign(
        { username: user.username, accountType: user.accountType },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

    //Set the JWT in an httpOnly cookie so it is sent automatically with requests
    //and cannot be accessed by client-side JavaScript (XSS protection).
    res.cookie('token', token, {
        //Block JS access to the cookie value.
        httpOnly: true,
        //Restrict cross-site sending to mitigate CSRF.
        sameSite: 'strict',
        //Match the JWT lifetime.
        maxAge: COOKIE_MAX_AGE
    });

    //Return the public-safe user info so the client can render the admin UI.
    res.json({
        success: true,
        username: user.username,
        accountType: user.accountType
    });
});

//POST /api/admin/login — Authenticate an admin and return a JWT in an httpOnly cookie.
//Behaves like loginUser but rejects non-admin credentials with the same generic 401 used
//for unknown user / wrong password. Returning a distinct 403 for "valid creds but not admin"
//would leak that the username belongs to a real customer account.
const loginAdmin = asyncHandler(async function (req, res) {
    //Pull credentials off the JSON body.
    const { username, password } = req.body;

    //Reject the request early if either field is missing.
    if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
    }

    //Look up the user in the database by username.
    const user = await User.findOne({ username: username });

    //Three failure modes collapsed into a single generic 401: user doesn't exist,
    //wrong password, or account is not admin. Same response in all cases.
    if (!user || !(await user.comparePassword(password)) || user.accountType !== 'admin') {
        res.status(401).json({ error: 'Invalid username or password' });
        return;
    }

    //Generate a signed JWT containing user identity.
    const token = jwt.sign(
        { username: user.username, accountType: user.accountType },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

    //Set the JWT in an httpOnly cookie. Same flags as loginUser so requireAuth treats
    //the resulting session identically.
    res.cookie('token', token, {
        //Block JS access to the cookie value.
        httpOnly: true,
        //Restrict cross-site sending to mitigate CSRF.
        sameSite: 'strict',
        //Match the JWT lifetime.
        maxAge: COOKIE_MAX_AGE
    });

    //Return the public-safe user info so the client can render the admin UI.
    res.json({
        success: true,
        username: user.username,
        accountType: user.accountType
    });
});

//POST /api/register — Create a new non-admin user and log them in.
//Public registration only ever creates customer-tier accounts. Admin accounts are
//created out-of-band through the seed script or the /api/query admin shell so a
//random visitor can never grant themselves admin access through this endpoint.
const registerUser = asyncHandler(async function (req, res) {
    //Pull credentials off the JSON body.
    const { username, password } = req.body;

    //Reject the request early if either field is missing.
    if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
    }

    //Enforce a minimum password length. bcrypt has no inherent floor, so this is purely policy.
    if (password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters' });
        return;
    }

    //Check for an existing username before attempting to save. This produces a clean 409
    //instead of relying on the duplicate-key path to bubble through errorHandler.
    const existing = await User.findOne({ username: username });
    if (existing) {
        res.status(409).json({ error: 'Username already taken' });
        return;
    }

    //Build the user with the customer-tier role. The pre('save') hook hashes the password.
    const user = new User({ username: username, password: password, accountType: 'user' });
    await user.save();

    //Sign a JWT carrying the same shape as login so the client gets an immediate session.
    const token = jwt.sign(
        { username: user.username, accountType: user.accountType },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

    //Set the JWT in an httpOnly cookie so the new user is logged in on the next request.
    res.cookie('token', token, {
        //Block JS access to the cookie value.
        httpOnly: true,
        //Restrict cross-site sending to mitigate CSRF.
        sameSite: 'strict',
        //Match the JWT lifetime.
        maxAge: COOKIE_MAX_AGE
    });

    //Mirror the loginUser response shape so register.html can branch on accountType.
    res.status(201).json({
        success: true,
        username: user.username,
        accountType: user.accountType
    });
});

//POST /api/logout — Clear the JWT cookie.
const logoutUser = asyncHandler(async function (req, res) {
    //Drop the cookie on the client side; the token itself remains valid until expiry but is unreachable.
    res.clearCookie('token');
    res.json({ success: true });
});

//GET /api/session — Verify the JWT and return session info.
const getSession = asyncHandler(async function (req, res) {
    //Pull the token off the cookie jar.
    const token = req.cookies && req.cookies.token;
    if (token) {
        try {
            //Throws if the token is bad or expired.
            const decoded = jwt.verify(token, JWT_SECRET);
            //Echo the decoded identity back to the client.
            res.json({
                authenticated: true,
                username: decoded.username,
                accountType: decoded.accountType
            });
            return;
        } catch (e) {
            //Token invalid or expired — fall through to the unauthenticated response.
        }
    }
    //No token (or invalid token) — report unauthenticated.
    res.json({ authenticated: false });
});

//Export the five handlers so the auth router can wire them up.
module.exports = { loginUser, loginAdmin, registerUser, logoutUser, getSession };
