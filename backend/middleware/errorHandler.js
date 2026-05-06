function errorHandler(err, req, res, next) {
    console.error('Server error:', err);

    if (err.code === 11000) {
        res.status(409).json({ error: 'An item with that slug already exists. Please use a different title.' });
        return;
    }

    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(function (e) { return e.message; });
        res.status(400).json({ error: messages.join(', ') });
        return;
    }

    const statusCode = res.statusCode && res.statusCode >= 400 ? res.statusCode : 500;
    res.status(statusCode).json({
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    });
}

module.exports = errorHandler;
