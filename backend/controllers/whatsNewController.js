const asyncHandler = require('express-async-handler');
const WhatsNew = require('../models/WhatsNew');
const { toSlug } = require('../utils/helpers');

const getAllWhatsNew = asyncHandler(async function (req, res) {
    const items = await WhatsNew.find({}).sort({ sortOrder: 1 }).lean();
    res.json(items);
});

const createWhatsNew = asyncHandler(async function (req, res) {
    const body = req.body;
    const targetSort = Number(body.sortOrder) || 0;

    await WhatsNew.updateMany(
        { sortOrder: { $gte: targetSort } },
        { $inc: { sortOrder: 1 } }
    );

    const newDocument = await WhatsNew.create({
        title: String(body.title || ''),
        description: String(body.description || ''),
        tag: String(body.tag || ''),
        date: body.date ? new Date(body.date) : new Date(),
        display: body.display !== undefined ? Boolean(body.display) : true,
        sortOrder: targetSort,
        slug: String(body.slug || toSlug(body.title || ''))
    });

    res.status(201).json(newDocument.toObject());
});

const updateWhatsNew = asyncHandler(async function (req, res) {
    const id = req.params.id;
    const body = req.body;
    const update = {};

    if (body.title !== undefined) update.title = String(body.title);
    if (body.description !== undefined) update.description = String(body.description);
    if (body.tag !== undefined) update.tag = String(body.tag);
    if (body.date !== undefined) update.date = new Date(body.date);
    if (body.display !== undefined) update.display = Boolean(body.display);
    if (body.slug !== undefined) update.slug = String(body.slug);

    if (body.sortOrder !== undefined) {
        const newSort = Number(body.sortOrder);
        const existing = await WhatsNew.findById(id).lean();
        if (existing && existing.sortOrder !== newSort) {
            const oldSort = existing.sortOrder;
            if (newSort < oldSort) {
                await WhatsNew.updateMany(
                    { sortOrder: { $gte: newSort, $lt: oldSort }, _id: { $ne: id } },
                    { $inc: { sortOrder: 1 } }
                );
            } else {
                await WhatsNew.updateMany(
                    { sortOrder: { $gt: oldSort, $lte: newSort }, _id: { $ne: id } },
                    { $inc: { sortOrder: -1 } }
                );
            }
        }
        update.sortOrder = newSort;
    }

    const result = await WhatsNew.findByIdAndUpdate(id, update, { returnDocument: 'after' }).lean();
    if (!result) {
        res.status(404).json({ error: 'Item not found' });
        return;
    }
    res.json(result);
});

const deleteWhatsNew = asyncHandler(async function (req, res) {
    const result = await WhatsNew.findByIdAndDelete(req.params.id);
    if (!result) {
        res.status(404).json({ error: 'Item not found' });
        return;
    }
    res.json({ success: true });
});

const reorderWhatsNew = asyncHandler(async function (req, res) {
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
    await WhatsNew.bulkWrite(bulkOperations);
    const items = await WhatsNew.find({}).sort({ sortOrder: 1 }).lean();
    res.json(items);
});

module.exports = { getAllWhatsNew, createWhatsNew, updateWhatsNew, deleteWhatsNew, reorderWhatsNew };
