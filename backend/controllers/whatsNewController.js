//Wraps async route handlers so thrown errors propagate to my error middleware.
const asyncHandler = require('express-async-handler');
//What's New model.
const WhatsNew = require('../models/WhatsNew');
//Slug helper for URL-safe identifiers built from titles.
const { toSlug } = require('../utils/helpers');

//GET /api/whats-new — Retrieve all What's New items, sorted by sortOrder ascending.
const getAllWhatsNew = asyncHandler(async function (req, res) {
    //Plain objects — the admin UI doesn't need full Mongoose documents.
    const items = await WhatsNew.find({}).sort({ sortOrder: 1 }).lean();
    res.json(items);
});

//POST /api/whats-new — Create a new What's New item.
//Auto-shifts other items at or above the target sortOrder to make room.
const createWhatsNew = asyncHandler(async function (req, res) {
    //Pull the request body and normalize the requested position.
    const body = req.body;
    //Coerce sortOrder; default to 0 when missing or non-numeric.
    const targetSort = Number(body.sortOrder) || 0;

    //Shift existing items at or above the target sortOrder up by 1 to make room for the new item.
    await WhatsNew.updateMany(
        { sortOrder: { $gte: targetSort } },
        { $inc: { sortOrder: 1 } }
    );

    //Build and insert the new document, coercing each field to its expected type.
    const newDocument = await WhatsNew.create({
        title: String(body.title || ''),
        description: String(body.description || ''),
        tag: String(body.tag || ''),
        //Date supplied by the client or now() as a sensible default.
        date: body.date ? new Date(body.date) : new Date(),
        //Visible by default unless explicitly set false.
        display: body.display !== undefined ? Boolean(body.display) : true,
        sortOrder: targetSort,
        //Slug from the client or auto-generated from the title.
        slug: String(body.slug || toSlug(body.title || ''))
    });

    //201 Created with the inserted document as a plain object.
    res.status(201).json(newDocument.toObject());
});

//PUT /api/whats-new/:id — Update a specific What's New item by its MongoDB ObjectId.
const updateWhatsNew = asyncHandler(async function (req, res) {
    //Pull the route param and request body.
    const id = req.params.id;
    const body = req.body;
    //Build the $set payload only with fields the client actually sent.
    const update = {};

    //Each block guards against unintended overwrites by checking for explicit presence.
    if (body.title !== undefined) update.title = String(body.title);
    if (body.description !== undefined) update.description = String(body.description);
    if (body.tag !== undefined) update.tag = String(body.tag);
    if (body.date !== undefined) update.date = new Date(body.date);
    if (body.display !== undefined) update.display = Boolean(body.display);
    if (body.slug !== undefined) update.slug = String(body.slug);

    //Auto-reorder: if sortOrder is changing, shift other items to make room.
    if (body.sortOrder !== undefined) {
        //Coerce the requested position.
        const newSort = Number(body.sortOrder);
        //Look up the current position so I know which direction to shift.
        const existing = await WhatsNew.findById(id).lean();
        if (existing && existing.sortOrder !== newSort) {
            //Cache the old position for the range expressions below.
            const oldSort = existing.sortOrder;
            if (newSort < oldSort) {
                //Moving up: shift items in [newSort, oldSort) down by +1.
                await WhatsNew.updateMany(
                    { sortOrder: { $gte: newSort, $lt: oldSort }, _id: { $ne: id } },
                    { $inc: { sortOrder: 1 } }
                );
            } else {
                //Moving down: shift items in (oldSort, newSort] up by -1.
                await WhatsNew.updateMany(
                    { sortOrder: { $gt: oldSort, $lte: newSort }, _id: { $ne: id } },
                    { $inc: { sortOrder: -1 } }
                );
            }
        }
        //Apply the new position to the target document itself.
        update.sortOrder = newSort;
    }

    //Run the update and return the post-update document.
    const result = await WhatsNew.findByIdAndUpdate(id, update, { returnDocument: 'after' }).lean();
    if (!result) {
        //404 when the id didn't match any document.
        res.status(404).json({ error: 'Item not found' });
        return;
    }
    res.json(result);
});

//DELETE /api/whats-new/:id — Delete a specific What's New item by its MongoDB ObjectId.
const deleteWhatsNew = asyncHandler(async function (req, res) {
    //Hard delete by id.
    const result = await WhatsNew.findByIdAndDelete(req.params.id);
    if (!result) {
        //404 when nothing was deleted.
        res.status(404).json({ error: 'Item not found' });
        return;
    }
    res.json({ success: true });
});

//PUT /api/whats-new/reorder — Bulk reorder What's New items. Accepts { ids: ["id1", "id2", ...] }
//and assigns sortOrder based on array position.
const reorderWhatsNew = asyncHandler(async function (req, res) {
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
    await WhatsNew.bulkWrite(bulkOperations);
    //Return the freshly sorted list so the admin UI can re-render.
    const items = await WhatsNew.find({}).sort({ sortOrder: 1 }).lean();
    res.json(items);
});

//Export the five What's New handlers for the router.
module.exports = { getAllWhatsNew, createWhatsNew, updateWhatsNew, deleteWhatsNew, reorderWhatsNew };
