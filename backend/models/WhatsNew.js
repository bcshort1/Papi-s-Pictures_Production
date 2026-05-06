const mongoose = require('mongoose');

const whatsNewSchema = new mongoose.Schema({
  legacyId: Number,
  slug: { type: String, unique: true, required: true },
  date: Date,
  title: String,
  description: String,
  tag: String,
  display: Boolean,
  sortOrder: Number
}, { timestamps: true });

module.exports = mongoose.model('WhatsNew', whatsNewSchema, 'whats_new');
