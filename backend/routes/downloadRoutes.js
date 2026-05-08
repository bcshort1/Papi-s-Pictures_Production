const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const {
    downloadSingleVersion,
    downloadItemZip,
    downloadBatchZip
} = require('../controllers/downloadController');

router.use(requireAuth);

router.post('/download-batch', function (req, res, next) {
    req.setTimeout(0);
    res.setTimeout(0);
    next();
}, downloadBatchZip);

router.get('/:id/download-zip', function (req, res, next) {
    req.setTimeout(0);
    res.setTimeout(0);
    next();
}, downloadItemZip);

router.get('/:id/download/:version', downloadSingleVersion);

module.exports = router;
