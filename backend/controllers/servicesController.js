const asyncHandler = require('express-async-handler');
const LicensingAndService = require('../models/LicensingAndService');
const { toSlug } = require('../utils/helpers');

const getAllServices = asyncHandler(async function (req, res) {
    const items = await LicensingAndService.find({}).sort({ sortOrder: 1 }).lean();
    res.json(items);
});

const createService = asyncHandler(async function (req, res) {
    const body = req.body;
    const targetSort = Number(body.sortOrder) || 0;

    await LicensingAndService.updateMany(
        { sortOrder: { $gte: targetSort } },
        { $inc: { sortOrder: 1 } }
    );

    const newDocument = await LicensingAndService.create({
        serviceName: String(body.serviceName || ''),
        serviceDescription: String(body.serviceDescription || ''),
        price: Number(body.price) || 0,
        currency: String(body.currency || 'USD'),
        type: String(body.type || ''),
        mediaUse: String(body.mediaUse || ''),
        purchaseMode: String(body.purchaseMode || ''),
        display: body.display !== undefined ? Boolean(body.display) : true,
        active: body.active !== undefined ? Boolean(body.active) : true,
        sortOrder: targetSort,
        slug: String(body.slug || toSlug(body.serviceName || ''))
    });

    res.status(201).json(newDocument.toObject());
});

const updateService = asyncHandler(async function (req, res) {
    const id = req.params.id;
    const body = req.body;
    const update = {};

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

    if (body.sortOrder !== undefined) {
        const newSort = Number(body.sortOrder);
        const existing = await LicensingAndService.findById(id).lean();
        if (existing && existing.sortOrder !== newSort) {
            const oldSort = existing.sortOrder;
            if (newSort < oldSort) {
                await LicensingAndService.updateMany(
                    { sortOrder: { $gte: newSort, $lt: oldSort }, _id: { $ne: id } },
                    { $inc: { sortOrder: 1 } }
                );
            } else {
                await LicensingAndService.updateMany(
                    { sortOrder: { $gt: oldSort, $lte: newSort }, _id: { $ne: id } },
                    { $inc: { sortOrder: -1 } }
                );
            }
        }
        update.sortOrder = newSort;
    }

    const result = await LicensingAndService.findByIdAndUpdate(id, update, { returnDocument: 'after' }).lean();
    if (!result) {
        res.status(404).json({ error: 'Service not found' });
        return;
    }
    res.json(result);
});

const deleteService = asyncHandler(async function (req, res) {
    const result = await LicensingAndService.findByIdAndDelete(req.params.id);
    if (!result) {
        res.status(404).json({ error: 'Service not found' });
        return;
    }
    res.json({ success: true });
});

const reorderServices = asyncHandler(async function (req, res) {
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
    await LicensingAndService.bulkWrite(bulkOperations);
    const items = await LicensingAndService.find({}).sort({ sortOrder: 1 }).lean();
    res.json(items);
});

module.exports = { getAllServices, createService, updateService, deleteService, reorderServices };
