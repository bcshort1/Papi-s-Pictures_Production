//Wraps async route handlers so thrown errors propagate to my error middleware.
const asyncHandler = require('express-async-handler');
//Licensing and services model.
const LicensingAndService = require('../models/LicensingAndService');
//Helper for generating URL-safe slugs from human-readable names.
const { toSlug } = require('../utils/helpers');

//GET /api/services — Retrieve all licensing and service items, sorted by sortOrder ascending.
const getAllServices = asyncHandler(async function (req, res) {
    //Plain objects — admin UI doesn't need full Mongoose documents.
    const items = await LicensingAndService.find({}).sort({ sortOrder: 1 }).lean();
    res.json(items);
});

//POST /api/services — Create a new licensing/service item.
//Auto-shifts other items at or above the target sortOrder to make room.
const createService = asyncHandler(async function (req, res) {
    //Pull the request body and normalize the requested position.
    const body = req.body;
    //Coerce sortOrder; default to 0 (first slot) when missing or non-numeric.
    const targetSort = Number(body.sortOrder) || 0;

    //Shift existing items at or above the target sortOrder up by 1 to make room for the new item.
    await LicensingAndService.updateMany(
        { sortOrder: { $gte: targetSort } },
        { $inc: { sortOrder: 1 } }
    );

    //Build and insert the new document, coercing each field to its expected type.
    const newDocument = await LicensingAndService.create({
        serviceName: String(body.serviceName || ''),
        serviceDescription: String(body.serviceDescription || ''),
        //Numeric price, default 0.
        price: Number(body.price) || 0,
        currency: String(body.currency || 'USD'),
        type: String(body.type || ''),
        mediaUse: String(body.mediaUse || ''),
        purchaseMode: String(body.purchaseMode || ''),
        //Visible by default unless explicitly set false.
        display: body.display !== undefined ? Boolean(body.display) : true,
        //Active by default unless explicitly set false.
        active: body.active !== undefined ? Boolean(body.active) : true,
        sortOrder: targetSort,
        //Slug from the client or auto-generated from the service name.
        slug: String(body.slug || toSlug(body.serviceName || ''))
    });

    //201 Created with the inserted document as a plain object.
    res.status(201).json(newDocument.toObject());
});

//PUT /api/services/:id — Update a specific service by its MongoDB ObjectId.
const updateService = asyncHandler(async function (req, res) {
    //Pull the route param and request body.
    const id = req.params.id;
    const body = req.body;
    //Build the $set payload only with fields the client actually sent.
    const update = {};

    //Each block guards against unintended overwrites by checking for explicit presence.
    if (body.serviceName !== undefined) update.serviceName = String(body.serviceName);
    if (body.serviceDescription !== undefined) update.serviceDescription = String(body.serviceDescription);
    if (body.price !== undefined) update.price = Number(body.price);
    if (body.currency !== undefined) update.currency = String(body.currency);
    if (body.type !== undefined) update.type = String(body.type);
    if (body.mediaUse !== undefined) update.mediaUse = String(body.mediaUse);
    if (body.purchaseMode !== undefined) update.purchaseMode = String(body.purchaseMode);
    if (body.display !== undefined) update.display = Boolean(body.display);
    if (body.active !== undefined) update.active = Boolean(body.active);
    if (body.slug !== undefined) update.slug = String(body.slug);

    //Auto-reorder: if sortOrder is changing, shift other items to make room.
    if (body.sortOrder !== undefined) {
        //Coerce the requested position.
        const newSort = Number(body.sortOrder);
        //Look up the current position so I know which direction to shift.
        const existing = await LicensingAndService.findById(id).lean();
        if (existing && existing.sortOrder !== newSort) {
            //Cache the old position for the range expressions below.
            const oldSort = existing.sortOrder;
            if (newSort < oldSort) {
                //Moving up: shift items in [newSort, oldSort) down by +1.
                await LicensingAndService.updateMany(
                    { sortOrder: { $gte: newSort, $lt: oldSort }, _id: { $ne: id } },
                    { $inc: { sortOrder: 1 } }
                );
            } else {
                //Moving down: shift items in (oldSort, newSort] up by -1.
                await LicensingAndService.updateMany(
                    { sortOrder: { $gt: oldSort, $lte: newSort }, _id: { $ne: id } },
                    { $inc: { sortOrder: -1 } }
                );
            }
        }
        //Apply the new position to the target document itself.
        update.sortOrder = newSort;
    }

    //Run the update and return the post-update document.
    const result = await LicensingAndService.findByIdAndUpdate(id, update, { returnDocument: 'after' }).lean();
    if (!result) {
        //404 when the id didn't match any document.
        res.status(404).json({ error: 'Service not found' });
        return;
    }
    res.json(result);
});

//DELETE /api/services/:id — Delete a specific service by its MongoDB ObjectId.
const deleteService = asyncHandler(async function (req, res) {
    //Hard delete by id.
    const result = await LicensingAndService.findByIdAndDelete(req.params.id);
    if (!result) {
        //404 when nothing was deleted.
        res.status(404).json({ error: 'Service not found' });
        return;
    }
    res.json({ success: true });
});

//PUT /api/services/reorder — Bulk reorder services. Accepts { ids: ["id1", "id2", ...] }
//and assigns sortOrder based on array position.
const reorderServices = asyncHandler(async function (req, res) {
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
    await LicensingAndService.bulkWrite(bulkOperations);
    //Return the freshly sorted list so the admin UI can re-render.
    const items = await LicensingAndService.find({}).sort({ sortOrder: 1 }).lean();
    res.json(items);
});

//Export the five service handlers for the services router.
module.exports = { getAllServices, createService, updateService, deleteService, reorderServices };
