const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const {
    getAllWhatsNew,
    createWhatsNew,
    reorderWhatsNew,
    updateWhatsNew,
    deleteWhatsNew
} = require('../controllers/whatsNewController');

//All What's New routes require authentication.
router.use(requireAuth);

//GET /api/whats-new — Retrieve all What's New items.
router.get('/', getAllWhatsNew);

//POST /api/whats-new — Create a new What's New item.
router.post('/', createWhatsNew);

//PUT /api/whats-new/reorder — Bulk reorder items. MUST be before /:id to prevent param collision.
router.put('/reorder', reorderWhatsNew);

//PUT /api/whats-new/:id — Update a What's New item.
router.put('/:id', updateWhatsNew);

//DELETE /api/whats-new/:id — Delete a What's New item.
router.delete('/:id', deleteWhatsNew);

module.exports = router;
