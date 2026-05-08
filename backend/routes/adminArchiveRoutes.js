const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const { searchAdminArchive, getAdminFacets } = require('../controllers/adminArchiveController');

router.use(requireAuth);

router.get('/facets', getAdminFacets);

router.get('/', searchAdminArchive);

module.exports = router;
