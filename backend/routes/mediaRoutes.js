const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const {
    getAllMedia,
    getMediaTags,
    uploadMedia,
    uploadChunk,
    finalizeUpload,
    reorderMedia,
    updateMedia,
    deleteMedia
} = require('../controllers/mediaController');

router.use(requireAuth);

router.get('/', getAllMedia);

router.get('/tags', getMediaTags);

router.post('/upload', function (req, res, next) {
    req.setTimeout(600000);
    res.setTimeout(600000);
    next();
}, uploadMedia);

router.post('/upload-chunk', function (req, res, next) {
    req.setTimeout(600000);
    res.setTimeout(600000);
    next();
}, uploadChunk);

router.post('/upload-finalize', function (req, res, next) {
    req.setTimeout(600000);
    res.setTimeout(600000);
    next();
}, finalizeUpload);

router.put('/reorder', reorderMedia);

router.put('/:id', updateMedia);

router.delete('/:id', deleteMedia);

module.exports = router;
