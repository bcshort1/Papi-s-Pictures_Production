//Wraps async route handlers so thrown errors propagate to my error middleware.
const asyncHandler = require('express-async-handler');
//Media model — photo and video records.
const Media = require('../models/Media');
//Licensing and services model — powers the services section on the portfolio.
const LicensingAndService = require('../models/LicensingAndService');
//What's New model — powers the news ticker / cards.
const WhatsNew = require('../models/WhatsNew');
//Transform helpers shape DB documents into the public-facing JSON the front end expects.
const { toRecentPicture, toService, toWhatsNewItem } = require('../utils/transforms');

//GET /api — Retrieve all public data (services, recent pictures, what's new) for the portfolio.
const getPublicData = asyncHandler(async function (req, res) {
    //Fan out three independent queries in parallel and await them together.
    const [services, media, whatsNew] = await Promise.all([
        //Visible, active services in display order.
        LicensingAndService.find({ display: true, active: true }).sort({ sortOrder: 1 }).lean(),
        //Visible media flagged for the homepage in admin-defined order.
        Media.find({ display: true, showOnHomepage: true }).sort({ homepageSortOrder: 1 }).lean(),
        //Visible What's New items in display order.
        WhatsNew.find({ display: true }).sort({ sortOrder: 1 }).lean()
    ]);
    //Shape each list with its transform and return as a single envelope.
    res.json({
        photoVideoServices: services.map(toService),
        recentPictures: media.map(toRecentPicture),
        whatsNewItems: whatsNew.map(toWhatsNewItem)
    });
});

//GET /api/recentPictures — Retrieve the 30 most recently captured media items where showInRecent is true.
const getRecentPictures = asyncHandler(async function (req, res) {
    //Newest first, hard-capped at 30.
    const documents = await Media.find({ display: true, showInRecent: true }).sort({ capturedAt: -1 }).limit(30).lean();
    //Transform each document into the public shape.
    res.json(documents.map(toRecentPicture));
});

//GET /api/featuredGallery — Retrieve all media items where the featured flag is true.
const getFeaturedGallery = asyncHandler(async function (req, res) {
    //Featured items, newest first.
    const documents = await Media.find({ display: true, featured: true }).sort({ capturedAt: -1 }).lean();
    //Reuse the recent-picture transform for consistency.
    res.json(documents.map(toRecentPicture));
});

//Export the three public handlers for the public router.
module.exports = { getPublicData, getRecentPictures, getFeaturedGallery };
