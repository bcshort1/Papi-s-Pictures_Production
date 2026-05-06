const express = require('express');
const router = express.Router();
const { getPublicData, getRecentPictures, getFeaturedGallery } = require('../controllers/publicController');

router.get('/', getPublicData);

router.get('/recentPictures', getRecentPictures);

router.get('/featuredGallery', getFeaturedGallery);

module.exports = router;
