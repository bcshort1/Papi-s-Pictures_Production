//Express error-handling middleware. Must be the last app.use() in server.js.
//Catches errors thrown or passed via next(err) from controllers and routes.
function errorHandler(err, req, res, next) {
    //Log the full error so I can diagnose from the server console.
    console.error('Server error:', err);

    //MongoDB duplicate key error (e.g., duplicate slug).
    if (err.code === 11000) {
        //409 Conflict with a user-friendly message about the unique constraint.
        res.status(409).json({ error: 'An item with that slug already exists. Please use a different title.' });
        return;
    }

    //Mongoose validation error.
    if (err.name === 'ValidationError') {
        //Flatten the per-field error map into a single comma-separated message.
        const messages = Object.values(err.errors).map(function (e) { return e.message; });
        //400 Bad Request with the joined messages.
        res.status(400).json({ error: messages.join(', ') });
        return;
    }

    //Default server error.
    //Honor any status the route may have already set; otherwise default to 500.
    const statusCode = res.statusCode && res.statusCode >= 400 ? res.statusCode : 500;
    //In production hide the raw error message; in dev surface it for debugging.
    res.status(statusCode).json({
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    });
}

//Export the single middleware so server.js can mount it.
module.exports = errorHandler;
