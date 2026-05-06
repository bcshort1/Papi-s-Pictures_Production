const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'papis_pictures_jwt_secret';

function requireAuth(req, res, next) {
    const token = req.cookies && req.cookies.token;
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        if (req.user.accountType !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    } catch (e) {
        res.status(401).json({ error: 'Authentication required' });
    }
}

module.exports = requireAuth;
