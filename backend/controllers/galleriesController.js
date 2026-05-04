//Wraps async route handlers so thrown errors propagate to my error middleware.
const asyncHandler = require('express-async-handler');
//Gallery model — canonical gallery metadata.
const Gallery = require('../models/Gallery');
//Media model — used to read gallery membership from Media.galleries[] and to resolve cover thumbnails.
const Media = require('../models/Media');
//Slug helper for URL-safe identifiers built from titles.
const { toSlug } = require('../utils/helpers');
//Transform that flattens a Media doc into the public-facing shape the lightbox already consumes.
const { toRecentPicture } = require('../utils/transforms');
//path module to strip basenames from any legacy absolute thumbnail paths.
const path = require('path');

//GET /api/galleries — Public list of galleries. Returns visible galleries decorated with
//cover thumbnail filenames and the count of visible media items in each gallery.
const getPublicGalleries = asyncHandler(async function (req, res) {
    //Visible galleries first, in admin-defined order.
    const galleries = await Gallery.find({ display: true }).sort({ sortOrder: 1 }).lean();
    //Bail early on an empty list so I don't hit Media at all.
    if (galleries.length === 0) {
        return res.json([]);
    }

    //Resolve every explicit coverMediaId in one go so I can attach a thumbnail filename to each gallery.
    const coverIds = galleries.map(function (g) { return g.coverMediaId; }).filter(Boolean);
    //Look up the cover docs only when the gallery actually has a coverMediaId set.
    const coverDocs = coverIds.length > 0
        ? await Media.find({ _id: { $in: coverIds } }).select('_id thumbnailPath displayResolutionPath mediaType').lean()
        : [];
    //Build a lookup from id to cover doc so the decoration loop is O(N).
    const coverMap = {};
    for (const doc of coverDocs) {
        coverMap[String(doc._id)] = doc;
    }

    //Aggregate { slug -> count } across visible Media so the picker can show item counts and pick a fallback cover.
    const slugs = galleries.map(function (g) { return g.slug; });
    //Aggregate counts and the first member's thumbnail per slug. unwind + match keeps the slug column flat.
    const memberAgg = await Media.aggregate([
        //Only consider visible media so hidden items don't inflate the count.
        { $match: { display: true, 'galleries.gallerySlug': { $in: slugs } } },
        //Sort by gallery position so the first match per slug becomes the fallback cover.
        { $sort: { 'galleries.galleryPosition': 1, capturedAt: -1 } },
        //Flatten the galleries array so each (media, gallery) pair becomes its own row.
        { $unwind: '$galleries' },
        //Drop pairs whose slug isn't one of ours (other gallery memberships on the same doc).
        { $match: { 'galleries.gallerySlug': { $in: slugs } } },
        //Group by slug, capturing the count and the first member's thumbnail for the fallback cover.
        { $group: {
            _id: '$galleries.gallerySlug',
            count: { $sum: 1 },
            firstThumbnail: { $first: '$thumbnailPath' },
            firstDisplay: { $first: '$displayResolutionPath' },
            firstMediaType: { $first: '$mediaType' }
        } }
    ]);
    //Build a lookup from slug to aggregated bucket.
    const memberMap = {};
    for (const row of memberAgg) {
        memberMap[row._id] = row;
    }

    //Decorate each gallery with cover + count and return the list.
    const decorated = galleries.map(function (g) {
        //Pick the explicit cover if present; otherwise fall back to the first member's thumbnail.
        const explicitCover = g.coverMediaId ? coverMap[String(g.coverMediaId)] : null;
        const fallback = memberMap[g.slug];
        //Prefer the explicit cover's thumbnail; fall back to the first member's; thumbnail then display path.
        const coverThumb = explicitCover && explicitCover.thumbnailPath
            ? path.basename(explicitCover.thumbnailPath)
            : (fallback && fallback.firstThumbnail ? path.basename(fallback.firstThumbnail) : '');
        //Same fallback logic for the display-resolution copy (used when thumb is missing or the gallery is video-only).
        const coverDisplay = explicitCover && explicitCover.displayResolutionPath
            ? path.basename(explicitCover.displayResolutionPath)
            : (fallback && fallback.firstDisplay ? path.basename(fallback.firstDisplay) : '');
        //Capture mediaType so the picker can render a video tag if the cover happens to be a video.
        const coverMediaType = explicitCover ? explicitCover.mediaType : (fallback ? fallback.firstMediaType : '');
        //Hand back a flat shape the public list can render directly.
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

//GET /api/galleries/:slug/media — Public list of media items inside a single gallery. Returns the
//transformed shape the homepage lightbox already understands so the same engine can render it.
const getGalleryMediaPublic = asyncHandler(async function (req, res) {
    //Slug from the URL.
    const slug = req.params.slug;
    //Visible items whose galleries[] subdoc contains this slug.
    const documents = await Media.find({ display: true, 'galleries.gallerySlug': slug }).lean();
    //Sort by the matching subdoc's galleryPosition. Mongo can't sort by a path inside a subdoc filter,
    //so do it in JS — the lists are small (admin-curated) and this avoids an aggregation pipeline.
    documents.sort(function (a, b) {
        //Find this slug's position inside each doc's galleries[] array.
        const aPos = (a.galleries || []).find(function (g) { return g.gallerySlug === slug; });
        const bPos = (b.galleries || []).find(function (g) { return g.gallerySlug === slug; });
        //Default missing positions to a very large number so they sort to the end.
        const aOrder = aPos && typeof aPos.galleryPosition === 'number' ? aPos.galleryPosition : 999999;
        const bOrder = bPos && typeof bPos.galleryPosition === 'number' ? bPos.galleryPosition : 999999;
        return aOrder - bOrder;
    });
    //Reuse the homepage transform so client code (justified rows + lightbox) stays unchanged.
    res.json(documents.map(toRecentPicture));
});

//GET /api/galleries/admin — Admin list of every gallery (including hidden ones). Decorated with
//memberIds so the manage-media view can pre-flag which media items already belong.
const getAllGalleries = asyncHandler(async function (req, res) {
    //Plain objects — admin UI doesn't need full Mongoose documents.
    const galleries = await Gallery.find({}).sort({ sortOrder: 1 }).lean();
    //Bail early on an empty list.
    if (galleries.length === 0) {
        return res.json([]);
    }
    //Slug list for the membership lookup.
    const slugs = galleries.map(function (g) { return g.slug; });
    //Aggregate { slug -> [memberIds] } in one pass so I don't fan out N queries.
    const memberAgg = await Media.aggregate([
        //Match any media that belongs to any of our slugs (visible or not — admin needs the whole picture).
        { $match: { 'galleries.gallerySlug': { $in: slugs } } },
        //Flatten so each (media, gallery) pair becomes its own row.
        { $unwind: '$galleries' },
        //Drop pairs that don't match our slugs (other galleries on the same doc).
        { $match: { 'galleries.gallerySlug': { $in: slugs } } },
        //Group by slug and capture the list of media ids in position order.
        { $sort: { 'galleries.galleryPosition': 1 } },
        { $group: { _id: '$galleries.gallerySlug', memberIds: { $push: '$_id' }, count: { $sum: 1 } } }
    ]);
    //Build the slug-to-bucket lookup so the decoration loop is O(N).
    const memberMap = {};
    for (const row of memberAgg) {
        memberMap[row._id] = row;
    }
    //Decorate each gallery with its member ids and count.
    const decorated = galleries.map(function (g) {
        const bucket = memberMap[g.slug];
        return Object.assign({}, g, {
            memberIds: bucket ? bucket.memberIds.map(String) : [],
            mediaCount: bucket ? bucket.count : 0
        });
    });
    res.json(decorated);
});

//POST /api/galleries — Create a new gallery. Auto-shifts other galleries at or above the target sortOrder.
const createGallery = asyncHandler(async function (req, res) {
    //Pull the request body and normalize the requested position.
    const body = req.body;
    //Coerce sortOrder; default to 0 (first slot) when missing or non-numeric.
    const targetSort = Number(body.sortOrder) || 0;
    //Resolve the slug from the body or auto-generate from the title.
    const slug = String(body.slug || toSlug(body.title || ''));
    //Reject blank slugs (likely indicates an empty title).
    if (!slug) {
        return res.status(400).json({ error: 'Title is required to create a gallery.' });
    }

    //Shift existing galleries at or above the target sortOrder up by 1 to make room.
    await Gallery.updateMany(
        { sortOrder: { $gte: targetSort } },
        { $inc: { sortOrder: 1 } }
    );

    //Build and insert the new document, coercing each field to its expected type.
    const newDocument = await Gallery.create({
        slug: slug,
        title: String(body.title || ''),
        description: String(body.description || ''),
        coverMediaId: body.coverMediaId || null,
        //Visible by default unless explicitly set false.
        display: body.display !== undefined ? Boolean(body.display) : true,
        sortOrder: targetSort
    });

    //201 Created with the inserted document as a plain object.
    res.status(201).json(newDocument.toObject());
});

//PUT /api/galleries/:id — Update a specific gallery by its MongoDB ObjectId.
//Propagates slug/title changes into every Media.galleries[] member subdoc so the
//denormalized membership entries stay in sync with the canonical record.
const updateGallery = asyncHandler(async function (req, res) {
    //Pull the route param and request body.
    const id = req.params.id;
    const body = req.body;

    //Look up the existing doc up front so I can detect slug/title changes for the propagation pass below.
    const existing = await Gallery.findById(id).lean();
    if (!existing) {
        res.status(404).json({ error: 'Gallery not found' });
        return;
    }

    //Build the $set payload only with fields the client actually sent.
    const update = {};
    //Each block guards against unintended overwrites by checking for explicit presence.
    if (body.title !== undefined) update.title = String(body.title);
    if (body.description !== undefined) update.description = String(body.description);
    if (body.display !== undefined) update.display = Boolean(body.display);
    if (body.coverMediaId !== undefined) update.coverMediaId = body.coverMediaId || null;
    //Slug change — accept an explicit slug or recompute from title when one was supplied.
    if (body.slug !== undefined) {
        update.slug = String(body.slug);
    } else if (body.title !== undefined) {
        //Auto-regenerate the slug when the title changes and no explicit slug was sent.
        update.slug = toSlug(body.title);
    }

    //Auto-reorder: if sortOrder is changing, shift other galleries to make room.
    if (body.sortOrder !== undefined) {
        //Coerce the requested position.
        const newSort = Number(body.sortOrder);
        //Guard against the no-op case so I don't shift a range I don't need to.
        if (existing.sortOrder !== newSort) {
            //Cache the old position for the range expressions below.
            const oldSort = existing.sortOrder;
            if (newSort < oldSort) {
                //Moving up: shift items in [newSort, oldSort) down by +1.
                await Gallery.updateMany(
                    { sortOrder: { $gte: newSort, $lt: oldSort }, _id: { $ne: id } },
                    { $inc: { sortOrder: 1 } }
                );
            } else {
                //Moving down: shift items in (oldSort, newSort] up by -1.
                await Gallery.updateMany(
                    { sortOrder: { $gt: oldSort, $lte: newSort }, _id: { $ne: id } },
                    { $inc: { sortOrder: -1 } }
                );
            }
        }
        //Apply the new position to the target document itself.
        update.sortOrder = newSort;
    }

    //Run the update and return the post-update document.
    const result = await Gallery.findByIdAndUpdate(id, update, { returnDocument: 'after' }).lean();
    if (!result) {
        //404 when the id didn't match any document (race with a concurrent delete).
        res.status(404).json({ error: 'Gallery not found' });
        return;
    }

    //Propagate slug/title changes into every Media.galleries[] entry that points at this gallery.
    //Without this, member docs would still carry the old slug+name and the public surfaces and
    //admin lookups would fall out of sync.
    const slugChanged = update.slug !== undefined && update.slug !== existing.slug;
    const titleChanged = update.title !== undefined && update.title !== existing.title;
    if (slugChanged || titleChanged) {
        //arrayFilters lets me update only the matching subdoc inside each member's galleries[].
        const subdocSet = {};
        if (slugChanged) subdocSet['galleries.$[g].gallerySlug'] = update.slug;
        if (titleChanged) subdocSet['galleries.$[g].galleryName'] = update.title;
        //Match every member that currently carries the OLD slug.
        await Media.updateMany(
            { 'galleries.gallerySlug': existing.slug },
            { $set: subdocSet },
            { arrayFilters: [{ 'g.gallerySlug': existing.slug }] }
        );
    }

    res.json(result);
});

//DELETE /api/galleries/:id — Delete a gallery and strip its slug from every member's Media.galleries[].
const deleteGallery = asyncHandler(async function (req, res) {
    //Look up the doc first so I can grab the slug for the membership cleanup pass.
    const existing = await Gallery.findById(req.params.id).lean();
    if (!existing) {
        res.status(404).json({ error: 'Gallery not found' });
        return;
    }
    //Drop the gallery doc.
    await Gallery.findByIdAndDelete(req.params.id);
    //Strip the slug from every member's galleries[] so the membership data stays consistent.
    await Media.updateMany(
        { 'galleries.gallerySlug': existing.slug },
        { $pull: { galleries: { gallerySlug: existing.slug } } }
    );
    res.json({ success: true });
});

//PUT /api/galleries/reorder — Bulk reorder galleries. Accepts { ids: ["id1", "id2", ...] }
//and assigns sortOrder based on array position.
const reorderGalleries = asyncHandler(async function (req, res) {
    //Pull the array of ids in their new order.
    const ids = req.body.ids;
    //Reject empty or malformed payloads up front.
    if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: 'ids array is required' });
        return;
    }
    //Build one updateOne per id; sortOrder = index + 1 so positions are 1-based.
    const bulkOperations = ids.map(function (id, index) {
        return {
            updateOne: {
                filter: { _id: id },
                update: { $set: { sortOrder: index + 1, updatedAt: new Date() } }
            }
        };
    });
    //Single round-trip to apply all reorder operations.
    await Gallery.bulkWrite(bulkOperations);
    //Return the freshly sorted list so the admin UI can re-render.
    const galleries = await Gallery.find({}).sort({ sortOrder: 1 }).lean();
    res.json(galleries);
});

//POST /api/galleries/:id/media — Add a media item to a gallery. Idempotent: a second add for the same
//(gallery, media) pair is a no-op so double-clicks don't create duplicate subdoc entries.
const addMediaToGallery = asyncHandler(async function (req, res) {
    //Pull the gallery id from the URL and the media id from the JSON body.
    const galleryId = req.params.id;
    const mediaId = req.body.mediaId;
    if (!mediaId) {
        res.status(400).json({ error: 'mediaId is required' });
        return;
    }

    //Resolve the gallery so I have its current slug and title to write onto the Media doc.
    const gallery = await Gallery.findById(galleryId).lean();
    if (!gallery) {
        res.status(404).json({ error: 'Gallery not found' });
        return;
    }
    //Resolve the media doc so I can verify it exists and read its current galleries[] for the duplicate check.
    const media = await Media.findById(mediaId).lean();
    if (!media) {
        res.status(404).json({ error: 'Media not found' });
        return;
    }

    //Skip the write if this media is already a member (prevents duplicate subdocs).
    const isMember = (media.galleries || []).some(function (g) { return g.gallerySlug === gallery.slug; });
    if (isMember) {
        return res.json({ success: true, alreadyMember: true });
    }

    //Compute the next galleryPosition for this gallery so the new entry appends to the end of the
    //existing order. Walk every member that already belongs to the gallery and pick max(position)+1.
    const existingMembers = await Media.find({ 'galleries.gallerySlug': gallery.slug }).select('galleries').lean();
    let maxPos = 0;
    for (const m of existingMembers) {
        for (const g of (m.galleries || [])) {
            if (g.gallerySlug === gallery.slug && typeof g.galleryPosition === 'number' && g.galleryPosition > maxPos) {
                maxPos = g.galleryPosition;
            }
        }
    }

    //Append the membership subdoc with the next available position.
    await Media.updateOne(
        { _id: mediaId },
        { $push: { galleries: { gallerySlug: gallery.slug, galleryName: gallery.title, galleryPosition: maxPos + 1 } } }
    );

    res.json({ success: true, galleryPosition: maxPos + 1 });
});

//DELETE /api/galleries/:id/media/:mediaId — Remove a media item from a gallery.
const removeMediaFromGallery = asyncHandler(async function (req, res) {
    //Pull both ids out of the URL.
    const galleryId = req.params.id;
    const mediaId = req.params.mediaId;
    //Resolve the gallery to get its slug for the $pull match.
    const gallery = await Gallery.findById(galleryId).lean();
    if (!gallery) {
        res.status(404).json({ error: 'Gallery not found' });
        return;
    }
    //$pull removes every matching subdoc from the array; with the slug filter this only ever
    //affects the one membership entry I want to drop.
    await Media.updateOne(
        { _id: mediaId },
        { $pull: { galleries: { gallerySlug: gallery.slug } } }
    );
    res.json({ success: true });
});

//PUT /api/galleries/:id/media/reorder — Bulk reorder the media items within a single gallery.
//Accepts { ids: ["mediaId1", "mediaId2", ...] } and assigns galleryPosition based on array position.
const reorderGalleryMedia = asyncHandler(async function (req, res) {
    //Resolve the gallery first so I can target the right slug across every member.
    const gallery = await Gallery.findById(req.params.id).lean();
    if (!gallery) {
        res.status(404).json({ error: 'Gallery not found' });
        return;
    }
    //Pull the ids array from the request body.
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: 'ids array is required' });
        return;
    }
    //Build one updateOne per id; galleryPosition = index + 1 so positions are 1-based.
    //arrayFilters scopes the position update to the specific subdoc that points at this gallery's slug.
    const bulkOperations = ids.map(function (id, index) {
        return {
            updateOne: {
                filter: { _id: id },
                update: { $set: { 'galleries.$[g].galleryPosition': index + 1 } },
                arrayFilters: [{ 'g.gallerySlug': gallery.slug }]
            }
        };
    });
    //Single round-trip to apply every reorder.
    await Media.bulkWrite(bulkOperations);
    res.json({ success: true });
});

//Export every handler the router needs.
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
