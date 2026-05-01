/**
 * What's New Model
 *
 * Defines the Mongoose schema for news and update entries displayed in the
 * "What's New" section of the Papi's Pictures portfolio. Each document represents
 * a single announcement or update with a date, title, description, and tag.
 * This schema is used with the 'whats_new' collection in MongoDB.
 */
const mongoose = require('mongoose');

/**
 * Schema definition for the whats_new collection.
 * Tracks update announcements with date, content, tagging, and display ordering.
 */
const whatsNewSchema = new mongoose.Schema({
  legacyId: Number,                        // Original numeric ID from the legacy system.
  slug: { type: String, unique: true, required: true },  // URL-friendly unique identifier.
  date: Date,                              // Date of the announcement or update.
  title: String,                           // Headline title for the update.
  description: String,                     // Full description text of the update.
  tag: String,                             // Category tag (e.g., "New Location", "Equipment").
  display: Boolean,                        // Whether this item is visible on the public site.
  sortOrder: Number                        // Display order position in the What's New section.
}, { timestamps: true });  // Automatically adds createdAt and updatedAt fields.

//Export the WhatsNew model, bound to the 'whats_new' collection in MongoDB.
module.exports = mongoose.model('WhatsNew', whatsNewSchema, 'whats_new');
