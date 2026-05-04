/**
 * Gallery Model
 *
 * Defines the Mongoose schema for curated galleries — admin-defined collections
 * of media organized around a theme (e.g. "Lighthouses", "Sunsets at Point Betsie").
 * Gallery membership is stored on each Media document via the existing
 * Media.galleries[] subdoc array; this model holds the canonical gallery-level
 * metadata (title, description, cover, sort order, visibility) and is used as the
 * source of truth for the public /galleries page and the admin Galleries tab.
 * This schema is used with the 'galleries' collection in MongoDB.
 */
const mongoose = require('mongoose');

/**
 * Schema definition for the galleries collection.
 * Tracks gallery-level metadata. Membership stays on Media.galleries[] so a
 * single denormalized read of a Media document still tells the lightbox which
 * galleries that item belongs to.
 */
const gallerySchema = new mongoose.Schema({
    slug: { type: String, unique: true, required: true },   // URL-friendly unique identifier; matches Media.galleries[].gallerySlug.
    title: { type: String, required: true },                 // Human-readable display name; matches Media.galleries[].galleryName.
    description: String,                                     // Long-form description shown on the gallery detail page.
    coverMediaId: {                                          // Optional explicit cover media; falls back to first member when null.
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Media',
        default: null
    },
    display: { type: Boolean, default: true },               // Whether the gallery is visible on the public /galleries page.
    sortOrder: { type: Number, default: 0 }                  // Display order on the public gallery list.
}, { timestamps: true });   // Automatically adds createdAt and updatedAt fields.

//Export the Gallery model, bound to the 'galleries' collection in MongoDB.
module.exports = mongoose.model('Gallery', gallerySchema, 'galleries');
