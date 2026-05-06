const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const {
    getAllServices,
    createService,
    reorderServices,
    updateService,
    deleteService
} = require('../controllers/servicesController');

router.use(requireAuth);

router.get('/', getAllServices);

router.post('/', createService);

router.put('/reorder', reorderServices);

router.put('/:id', updateService);

router.delete('/:id', deleteService);

module.exports = router;
