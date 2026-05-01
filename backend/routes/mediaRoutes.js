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

//All media routes require authentication.
router.use(requireAuth);

//GET /api/media — Retrieve all media items for the admin panel.
router.get('/', getAllMedia);

//GET /api/media/tags — Retrieve all distinct tags.
router.get('/tags', getMediaTags);

//POST /api/media/upload — Upload one or more media files.
//Set a 10-minute timeout per file to handle large DJI PNGs that require heavy processing.
router.post('/upload', function (req, res, next) {
    req.setTimeout(600000);
    res.setTimeout(600000);
    next();
}, uploadMedia);

//POST /api/media/upload-chunk — Receive a single chunk of a large file.
router.post('/upload-chunk', function (req, res, next) {
    req.setTimeout(600000);
    res.setTimeout(600000);
    next();
}, uploadChunk);

//POST /api/media/upload-finalize — Reassemble chunks and process the file.
router.post('/upload-finalize', function (req, res, next) {
    req.setTimeout(600000);
    res.setTimeout(600000);
    next();
}, finalizeUpload);

//PUT /api/media/reorder — Bulk reorder media items. MUST be before /:id to prevent param collision.
router.put('/reorder', reorderMedia);

//PUT /api/media/:id — Update a media item.
router.put('/:id', updateMedia);

//DELETE /api/media/:id — Delete a media item and its files.
router.delete('/:id', deleteMedia);

module.exports = router;
