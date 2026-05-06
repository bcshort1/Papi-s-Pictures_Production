const mongoose = require('mongoose');

const gallerySchema = new mongoose.Schema({
    slug: { type: String, unique: true, required: true },
    title: { type: String, required: true },
    description: String,
    coverMediaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Media',
        default: null
    },
    display: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Gallery', gallerySchema, 'galleries');
