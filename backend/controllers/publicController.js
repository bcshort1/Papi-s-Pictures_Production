const asyncHandler = require('express-async-handler');
const Media = require('../models/Media');
const LicensingAndService = require('../models/LicensingAndService');
const WhatsNew = require('../models/WhatsNew');
const { toRecentPicture, toService, toWhatsNewItem } = require('../utils/transforms');

const getPublicData = asyncHandler(async function (req, res) {
    const [services, media, whatsNew] = await Promise.all([
        LicensingAndService.find({ display: true, active: true }).sort({ sortOrder: 1 }).lean(),
        Media.find({ display: true, showOnHomepage: true }).sort({ homepageSortOrder: 1 }).lean(),
        WhatsNew.find({ display: true }).sort({ sortOrder: 1 }).lean()
    ]);
    res.json({
        photoVideoServices: services.map(toService),
        recentPictures: media.map(toRecentPicture),
        whatsNewItems: whatsNew.map(toWhatsNewItem)
    });
});

const getRecentPictures = asyncHandler(async function (req, res) {
    const documents = await Media.find({ display: true, showInRecent: true }).sort({ capturedAt: -1 }).limit(30).lean();
    res.json(documents.map(toRecentPicture));
});

const getFeaturedGallery = asyncHandler(async function (req, res) {
    const documents = await Media.find({ display: true, featured: true }).sort({ capturedAt: -1 }).lean();
    res.json(documents.map(toRecentPicture));
});

module.exports = { getPublicData, getRecentPictures, getFeaturedGallery };
