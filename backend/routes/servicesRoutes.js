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

//All services routes require authentication.
router.use(requireAuth);

//GET /api/services — Retrieve all licensing and service items.
router.get('/', getAllServices);

//POST /api/services — Create a new service.
router.post('/', createService);

//PUT /api/services/reorder — Bulk reorder services. MUST be before /:id to prevent param collision.
router.put('/reorder', reorderServices);

//PUT /api/services/:id — Update a service.
router.put('/:id', updateService);

//DELETE /api/services/:id — Delete a service.
router.delete('/:id', deleteService);

module.exports = router;
