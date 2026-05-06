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

router.use(requireAuth);

router.get('/', getAllWhatsNew);

router.post('/', createWhatsNew);

router.put('/reorder', reorderWhatsNew);

router.put('/:id', updateWhatsNew);

router.delete('/:id', deleteWhatsNew);

module.exports = router;
