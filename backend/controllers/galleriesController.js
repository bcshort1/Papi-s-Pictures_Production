const asyncHandler = require('express-async-handler');
const Gallery = require('../models/Gallery');
const Media = require('../models/Media');
const { toSlug } = require('../utils/helpers');
const { toRecentPicture } = require('../utils/transforms');
const path = require('path');

const getPublicGalleries = asyncHandler(async function (req, res) {
    const galleries = await Gallery.find({ display: true }).sort({ sortOrder: 1 }).lean();
    if (galleries.length === 0) {
        return res.json([]);
    }

    const coverIds = galleries.map(function (g) { return g.coverMediaId; }).filter(Boolean);
    const coverDocs = coverIds.length > 0
        ? await Media.find({ _id: { $in: coverIds } }).select('_id thumbnailPath displayResolutionPath mediaType').lean()
        : [];
    const coverMap = {};
    for (const doc of coverDocs) {
        coverMap[String(doc._id)] = doc;
    }

    const slugs = galleries.map(function (g) { return g.slug; });
    const memberAgg = await Media.aggregate([
        { $match: { display: true, 'galleries.gallerySlug': { $in: slugs } } },
        { $sort: { 'galleries.galleryPosition': 1, capturedAt: -1 } },
        { $unwind: '$galleries' },
        { $match: { 'galleries.gallerySlug': { $in: slugs } } },
        { $group: {
            _id: '$galleries.gallerySlug',
            count: { $sum: 1 },
            firstThumbnail: { $first: '$thumbnailPath' },
            firstDisplay: { $first: '$displayResolutionPath' },
            firstMediaType: { $first: '$mediaType' }
        } }
    ]);
    const memberMap = {};
    for (const row of memberAgg) {
        memberMap[row._id] = row;
    }

    const decorated = galleries.map(function (g) {
        const explicitCover = g.coverMediaId ? coverMap[String(g.coverMediaId)] : null;
        const fallback = memberMap[g.slug];
        const coverThumb = explicitCover && explicitCover.thumbnailPath
            ? path.basename(explicitCover.thumbnailPath)
            : (fallback && fallback.firstThumbnail ? path.basename(fallback.firstThumbnail) : '');
        const coverDisplay = explicitCover && explicitCover.displayResolutionPath
            ? path.basename(explicitCover.displayResolutionPath)
            : (fallback && fallback.firstDisplay ? path.basename(fallback.firstDisplay) : '');
        const coverMediaType = explicitCover ? explicitCover.mediaType : (fallback ? fallback.firstMediaType : '');
        return {
            _id: g._id,
            slug: g.slug,
            title: g.title,
            description: g.description || '',
            sortOrder: g.sortOrder,
            mediaCount: fallback ? fallback.count : 0,
            coverThumbnailFileName: coverThumb,
            coverDisplayFileName: coverDisplay,
            coverMediaType: coverMediaType || ''
        };
    });

    res.json(decorated);
});

const getGalleryMediaPublic = asyncHandler(async function (req, res) {
    const slug = req.params.slug;
    const documents = await Media.find({ display: true, 'galleries.gallerySlug': slug }).lean();
    documents.sort(function (a, b) {
        const aPos = (a.galleries || []).find(function (g) { return g.gallerySlug === slug; });
        const bPos = (b.galleries || []).find(function (g) { return g.gallerySlug === slug; });
        const aOrder = aPos && typeof aPos.galleryPosition === 'number' ? aPos.galleryPosition : 999999;
        const bOrder = bPos && typeof bPos.galleryPosition === 'number' ? bPos.galleryPosition : 999999;
        return aOrder - bOrder;
    });
    res.json(documents.map(toRecentPicture));
});

const getAllGalleries = asyncHandler(async function (req, res) {
    const galleries = await Gallery.find({}).sort({ sortOrder: 1 }).lean();
    if (galleries.length === 0) {
        return res.json([]);
    }
    const slugs = galleries.map(function (g) { return g.slug; });
    const memberAgg = await Media.aggregate([
        { $match: { 'galleries.gallerySlug': { $in: slugs } } },
        { $unwind: '$galleries' },
        { $match: { 'galleries.gallerySlug': { $in: slugs } } },
        { $sort: { 'galleries.galleryPosition': 1 } },
        { $group: { _id: '$galleries.gallerySlug', memberIds: { $push: '$_id' }, count: { $sum: 1 } } }
    ]);
    const memberMap = {};
    for (const row of memberAgg) {
        memberMap[row._id] = row;
    }
    const decorated = galleries.map(function (g) {
        const bucket = memberMap[g.slug];
        return Object.assign({}, g, {
            memberIds: bucket ? bucket.memberIds.map(String) : [],
            mediaCount: bucket ? bucket.count : 0
        });
    });
    res.json(decorated);
});

const createGallery = asyncHandler(async function (req, res) {
    const body = req.body;
    const targetSort = Number(body.sortOrder) || 0;
    const slug = String(body.slug || toSlug(body.title || ''));
    if (!slug) {
        return res.status(400).json({ error: 'Title is required to create a gallery.' });
    }

    await Gallery.updateMany(
        { sortOrder: { $gte: targetSort } },
        { $inc: { sortOrder: 1 } }
    );

    const newDocument = await Gallery.create({
        slug: slug,
        title: String(body.title || ''),
        description: String(body.description || ''),
        coverMediaId: body.coverMediaId || null,
        display: body.display !== undefined ? Boolean(body.display) : true,
        sortOrder: targetSort
    });

    res.status(201).json(newDocument.toObject());
});

const updateGallery = asyncHandler(async function (req, res) {
    const id = req.params.id;
    const body = req.body;

    const existing = await Gallery.findById(id).lean();
    if (!existing) {
        res.status(404).json({ error: 'Gallery not found' });
        return;
    }

    const update = {};
    if (body.title !== undefined) update.title = String(body.title);
    if (body.description !== undefined) update.description = String(body.description);
    if (body.display !== undefined) update.display = Boolean(body.display);
    if (body.coverMediaId !== undefined) update.coverMediaId = body.coverMediaId || null;
    if (body.slug !== undefined) {
        update.slug = String(body.slug);
    } else if (body.title !== undefined) {
        update.slug = toSlug(body.title);
    }

    if (body.sortOrder !== undefined) {
        const newSort = Number(body.sortOrder);
        if (existing.sortOrder !== newSort) {
            const oldSort = existing.sortOrder;
            if (newSort < oldSort) {
                await Gallery.updateMany(
                    { sortOrder: { $gte: newSort, $lt: oldSort }, _id: { $ne: id } },
                    { $inc: { sortOrder: 1 } }
                );
            } else {
                await Gallery.updateMany(
                    { sortOrder: { $gt: oldSort, $lte: newSort }, _id: { $ne: id } },
                    { $inc: { sortOrder: -1 } }
                );
            }
        }
        update.sortOrder = newSort;
    }

    const result = await Gallery.findByIdAndUpdate(id, update, { returnDocument: 'after' }).lean();
    if (!result) {
        res.status(404).json({ error: 'Gallery not found' });
        return;
    }

    const slugChanged = update.slug !== undefined && update.slug !== existing.slug;
    const titleChanged = update.title !== undefined && update.title !== existing.title;
    if (slugChanged || titleChanged) {
        const subdocSet = {};
        if (slugChanged) subdocSet['galleries.$[g].gallerySlug'] = update.slug;
        if (titleChanged) subdocSet['galleries.$[g].galleryName'] = update.title;
        await Media.updateMany(
            { 'galleries.gallerySlug': existing.slug },
            { $set: subdocSet },
            { arrayFilters: [{ 'g.gallerySlug': existing.slug }] }
        );
    }

    res.json(result);
});

const deleteGallery = asyncHandler(async function (req, res) {
    const existing = await Gallery.findById(req.params.id).lean();
    if (!existing) {
        res.status(404).json({ error: 'Gallery not found' });
        return;
    }
    await Gallery.findByIdAndDelete(req.params.id);
    await Media.updateMany(
        { 'galleries.gallerySlug': existing.slug },
        { $pull: { galleries: { gallerySlug: existing.slug } } }
    );
    res.json({ success: true });
});

const reorderGalleries = asyncHandler(async function (req, res) {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: 'ids array is required' });
        return;
    }
    const bulkOperations = ids.map(function (id, index) {
        return {
            updateOne: {
                filter: { _id: id },
                update: { $set: { sortOrder: index + 1, updatedAt: new Date() } }
            }
        };
    });
    await Gallery.bulkWrite(bulkOperations);
    const galleries = await Gallery.find({}).sort({ sortOrder: 1 }).lean();
    res.json(galleries);
});

const addMediaToGallery = asyncHandler(async function (req, res) {
    const galleryId = req.params.id;
    const mediaId = req.body.mediaId;
    if (!mediaId) {
        res.status(400).json({ error: 'mediaId is required' });
        return;
    }

    const gallery = await Gallery.findById(galleryId).lean();
    if (!gallery) {
        res.status(404).json({ error: 'Gallery not found' });
        return;
    }
    const media = await Media.findById(mediaId).lean();
    if (!media) {
        res.status(404).json({ error: 'Media not found' });
        return;
    }

    const isMember = (media.galleries || []).some(function (g) { return g.gallerySlug === gallery.slug; });
    if (isMember) {
        return res.json({ success: true, alreadyMember: true });
    }

    const existingMembers = await Media.find({ 'galleries.gallerySlug': gallery.slug }).select('galleries').lean();
    let maxPos = 0;
    for (const m of existingMembers) {
        for (const g of (m.galleries || [])) {
            if (g.gallerySlug === gallery.slug && typeof g.galleryPosition === 'number' && g.galleryPosition > maxPos) {
                maxPos = g.galleryPosition;
            }
        }
    }

    await Media.updateOne(
        { _id: mediaId },
        { $push: { galleries: { gallerySlug: gallery.slug, galleryName: gallery.title, galleryPosition: maxPos + 1 } } }
    );

    res.json({ success: true, galleryPosition: maxPos + 1 });
});

const removeMediaFromGallery = asyncHandler(async function (req, res) {
    const galleryId = req.params.id;
    const mediaId = req.params.mediaId;
    const gallery = await Gallery.findById(galleryId).lean();
    if (!gallery) {
        res.status(404).json({ error: 'Gallery not found' });
        return;
    }
    await Media.updateOne(
        { _id: mediaId },
        { $pull: { galleries: { gallerySlug: gallery.slug } } }
    );
    res.json({ success: true });
});

const reorderGalleryMedia = asyncHandler(async function (req, res) {
    const gallery = await Gallery.findById(req.params.id).lean();
    if (!gallery) {
        res.status(404).json({ error: 'Gallery not found' });
        return;
    }
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: 'ids array is required' });
        return;
    }
    const bulkOperations = ids.map(function (id, index) {
        return {
            updateOne: {
                filter: { _id: id },
                update: { $set: { 'galleries.$[g].galleryPosition': index + 1 } },
                arrayFilters: [{ 'g.gallerySlug': gallery.slug }]
            }
        };
    });
    await Media.bulkWrite(bulkOperations);
    res.json({ success: true });
});

module.exports = {
    getPublicGalleries,
    getGalleryMediaPublic,
    getAllGalleries,
    createGallery,
    updateGallery,
    deleteGallery,
    reorderGalleries,
    addMediaToGallery,
    removeMediaFromGallery,
    reorderGalleryMedia
};
