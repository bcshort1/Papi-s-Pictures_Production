const express = require('express');
const router = express.Router();
const { searchArchive, getFacets } = require('../controllers/archiveController');

router.get('/facets', getFacets);

router.get('/', searchArchive);

module.exports = router;
