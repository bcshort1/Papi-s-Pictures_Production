//Authentication middleware. Verifies a valid JWT from the httpOnly cookie.
//Apply to route files that require authentication via router.use(requireAuth).
const jwt = require('jsonwebtoken');

//Signing secret with a fallback so dev still works without an env file.
const JWT_SECRET = process.env.JWT_SECRET || 'papis_pictures_jwt_secret';

function requireAuth(req, res, next) {
    //Pull the token off the cookie jar.
    const token = req.cookies && req.cookies.token;
    if (!token) {
        //No cookie at all — reject before touching jwt.verify.
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        //Throws if the token is bad or expired; on success, attach the decoded payload to req.
        req.user = jwt.verify(token, JWT_SECRET);
        //Every endpoint that mounts this middleware is admin-only (media, services,
        //whats-new, schema, query). Reject non-admin users with a 403 so a logged-in
        //customer account can never reach an admin route.
        if (req.user.accountType !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        //Hand off to the next middleware/route handler.
        next();
    } catch (e) {
        //Token invalid or expired — same generic 401 to avoid leaking which case hit.
        res.status(401).json({ error: 'Authentication required' });
    }
}

//Export the single middleware so route files can mount it via router.use().
module.exports = requireAuth;
