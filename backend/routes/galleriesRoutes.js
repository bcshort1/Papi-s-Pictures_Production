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

//Public routes — no auth required, mounted before requireAuth so visitors can read the gallery list.
//GET /api/galleries — Public list of visible galleries with cover thumbnail and media count.
router.get('/', getPublicGalleries);

//GET /api/galleries/:slug/media — Public list of media inside a single gallery.
router.get('/:slug/media', getGalleryMediaPublic);

//Everything below requires authentication.
router.use(requireAuth);

//GET /api/galleries/admin — Admin list of every gallery (visible + hidden) with member ids.
router.get('/admin', getAllGalleries);

//POST /api/galleries — Create a new gallery.
router.post('/', createGallery);

//PUT /api/galleries/reorder — Bulk reorder galleries. MUST be before /:id to prevent param collision.
router.put('/reorder', reorderGalleries);

//PUT /api/galleries/:id/media/reorder — Bulk reorder media within a gallery. MUST be before /:id.
router.put('/:id/media/reorder', reorderGalleryMedia);

//POST /api/galleries/:id/media — Add a media item to a gallery.
router.post('/:id/media', addMediaToGallery);

//DELETE /api/galleries/:id/media/:mediaId — Remove a media item from a gallery.
router.delete('/:id/media/:mediaId', removeMediaFromGallery);

//PUT /api/galleries/:id — Update a gallery.
router.put('/:id', updateGallery);

//DELETE /api/galleries/:id — Delete a gallery (and strip its slug from member docs).
router.delete('/:id', deleteGallery);

module.exports = router;
