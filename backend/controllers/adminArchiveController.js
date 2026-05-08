const asyncHandler = require('express-async-handler');
const Media = require('../models/Media');
const Gallery = require('../models/Gallery');

function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFilter(query) {
    const filter = {};

    if (query.q) {
        const trimmed = String(query.q).trim();
        if (trimmed) {
            const rx = new RegExp(escapeRegex(trimmed), 'i');
            filter.$or = [
                { title: rx },
                { description: rx },
                { alt: rx },
                { tags: rx },
                { 'location.city': rx },
                { 'location.state': rx },
                { 'location.country': rx },
                { fileName: rx }
            ];
        }
    }

    if (query.mediaType === 'photo' || query.mediaType === 'video') {
        filter.mediaType = query.mediaType;
    }

    if (query.visibility === 'visible') {
        filter.display = true;
    } else if (query.visibility === 'hidden') {
        filter.display = { $ne: true };
    }

    if (query.tags) {
        const tagList = String(query.tags)
            .split(',')
            .map(function (t) { return t.trim(); })
            .filter(Boolean);
        if (tagList.length > 0) {
            filter.tags = { $in: tagList };
        }
    }

    if (query.from || query.to) {
        const range = {};
        if (query.from) {
            const fromDate = new Date(query.from);
            if (!isNaN(fromDate.getTime())) {
                range.$gte = fromDate;
            }
        }
        if (query.to) {
            const toDate = new Date(query.to);
            if (!isNaN(toDate.getTime())) {
                toDate.setUTCHours(23, 59, 59, 999);
                range.$lte = toDate;
            }
        }
        if (Object.keys(range).length > 0) {
            filter.capturedAt = range;
        }
    }

    if (query.city) filter['location.city'] = String(query.city);
    if (query.state) filter['location.state'] = String(query.state);
    if (query.country) filter['location.country'] = String(query.country);
    if (query.cameraModel) filter['metadata.cameraModel'] = String(query.cameraModel);
    if (query.gallery) filter['galleries.gallerySlug'] = String(query.gallery);

    return filter;
}

function getSortSpec(sort) {
    switch (sort) {
        case 'oldest': return { capturedAt: 1 };
        case 'recent': return { ingestedAt: -1, createdAt: -1 };
        case 'title-az': return { title: 1 };
        case 'title-za': return { title: -1 };
        case 'newest':
        default: return { capturedAt: -1 };
    }
}

const searchAdminArchive = asyncHandler(async function (req, res) {
    const filter = buildFilter(req.query);
    const sort = req.query.sort || 'newest';
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 24, 1), 200);
    const page = Math.max(parseInt(req.query.page) || 1, 1);

    let items = [];
    let total = 0;
    let totalPages = 1;
    let effectivePage = page;

    if (sort === 'random') {
        const [sampled, overallTotal] = await Promise.all([
            Media.aggregate([
                { $match: filter },
                { $sample: { size: limit } }
            ]),
            Media.countDocuments(filter)
        ]);
        items = sampled;
        total = overallTotal;
        totalPages = 1;
        effectivePage = 1;
    } else {
        const sortSpec = getSortSpec(sort);
        const skip = (page - 1) * limit;

        let query = Media.find(filter).sort(sortSpec);
        if (sort === 'title-az' || sort === 'title-za') {
            query = query.collation({ locale: 'en', strength: 2 });
        }

        const [docs, count] = await Promise.all([
            query.skip(skip).limit(limit).lean(),
            Media.countDocuments(filter)
        ]);
        items = docs;
        total = count;
        totalPages = Math.max(1, Math.ceil(total / limit));
    }

    res.json({
        items: items,
        total: total,
        page: effectivePage,
        limit: limit,
        totalPages: totalPages,
        sort: sort
    });
});

function cleanList(values) {
    const seen = {};
    const out = [];
    for (let i = 0; i < values.length; i++) {
        const raw = values[i];
        if (raw === null || raw === undefined) continue;
        const value = String(raw).trim();
        if (!value) continue;
        if (seen[value]) continue;
        seen[value] = true;
        out.push(value);
    }
    return out.sort(function (a, b) { return a.localeCompare(b); });
}

const getAdminFacets = asyncHandler(async function (req, res) {
    const [tags, cameraModels, cities, states, countries, galleries] = await Promise.all([
        Media.distinct('tags', {}),
        Media.distinct('metadata.cameraModel', {}),
        Media.distinct('location.city', {}),
        Media.distinct('location.state', {}),
        Media.distinct('location.country', {}),
        Gallery.find({}).select('slug title display').sort({ sortOrder: 1 }).lean()
    ]);

    res.json({
        tags: cleanList(tags),
        cameraModels: cleanList(cameraModels),
        cities: cleanList(cities),
        states: cleanList(states),
        countries: cleanList(countries),
        galleries: galleries.map(function (g) {
            return { slug: g.slug, title: g.title, display: g.display };
        })
    });
});

module.exports = { searchAdminArchive, getAdminFacets };
