const express = require('express');
const router = express.Router();
const { getPublicData, getRecentPictures, getFeaturedGallery } = require('../controllers/publicController');

//GET /api — Retrieve all public data (services, recent pictures, what's new) for the portfolio.
router.get('/', getPublicData);

//GET /api/recentPictures — Retrieve the 30 most recently captured media items where showInRecent is true.
router.get('/recentPictures', getRecentPictures);

//GET /api/featuredGallery — Retrieve all media items where the featured flag is true.
router.get('/featuredGallery', getFeaturedGallery);

module.exports = router;
