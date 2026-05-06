const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const {
    getPublicGalleries,
    getGalleryMediaPublic,
    getAllGalleries,
    createGallery,
    updateGallery,
    deleteGallery,
    reorderGalleries,
    addMediaToGallery,
    removeMediaFromGallery,
    reorderGalleryMedia
} = require('../controllers/galleriesController');

router.get('/', getPublicGalleries);

router.get('/:slug/media', getGalleryMediaPublic);

router.use(requireAuth);

router.get('/admin', getAllGalleries);

router.post('/', createGallery);

router.put('/reorder', reorderGalleries);

router.put('/:id/media/reorder', reorderGalleryMedia);

router.post('/:id/media', addMediaToGallery);

router.delete('/:id/media/:mediaId', removeMediaFromGallery);

router.put('/:id', updateGallery);

router.delete('/:id', deleteGallery);

module.exports = router;
