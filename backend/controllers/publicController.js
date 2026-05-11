const asyncHandler = require('express-async-handler');
const Media = require('../models/Media');
const LicensingAndService = require('../models/LicensingAndService');
const WhatsNew = require('../models/WhatsNew');
const { toRecentPicture, toService, toWhatsNewItem } = require('../utils/transforms');

const FEATURED_GALLERY_SLUG = 'featured';

const getPublicData = asyncHandler(async function (req, res) {
    const [services, media, whatsNew] = await Promise.all([
        LicensingAndService.find({ display: true, active: true }).sort({ sortOrder: 1 }).lean(),
        Media.find({ display: true, showInRecent: true }).sort({ capturedAt: -1, ingestedAt: -1, _id: -1 }).limit(30).lean(),
        WhatsNew.find({ display: true }).sort({ sortOrder: 1 }).lean()
    ]);
    res.json({
        photoVideoServices: services.map(toService),
        recentPictures: media.map(toRecentPicture),
        whatsNewItems: whatsNew.map(toWhatsNewItem)
    });
});

const getRecentPictures = asyncHandler(async function (req, res) {
    const documents = await Media.find({ display: true, showInRecent: true }).sort({ capturedAt: -1, ingestedAt: -1, _id: -1 }).limit(30).lean();
    res.json(documents.map(toRecentPicture));
});

const getFeaturedGallery = asyncHandler(async function (req, res) {
    const documents = await Media.find({
        display: true,
        'galleries.gallerySlug': FEATURED_GALLERY_SLUG
    }).lean();

    documents.sort(function (a, b) {
        const aMembership = (a.galleries || []).find(function (g) {
            return g.gallerySlug === FEATURED_GALLERY_SLUG;
        });
        const bMembership = (b.galleries || []).find(function (g) {
            return g.gallerySlug === FEATURED_GALLERY_SLUG;
        });
        const aPos = aMembership && typeof aMembership.galleryPosition === 'number'
            ? aMembership.galleryPosition
            : Number.MAX_SAFE_INTEGER;
        const bPos = bMembership && typeof bMembership.galleryPosition === 'number'
            ? bMembership.galleryPosition
            : Number.MAX_SAFE_INTEGER;
        return aPos - bPos;
    });

    res.json(documents.map(toRecentPicture));
});

module.exports = { getPublicData, getRecentPictures, getFeaturedGallery };
