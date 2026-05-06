const mongoose = require('mongoose');

const licensingAndServiceSchema = new mongoose.Schema({
  legacyId: Number,
  slug: { type: String, unique: true, required: true },
  serviceName: String,
  serviceDescription: String,
  price: Number,
  currency: String,
  type: String,
  mediaUse: String,
  purchaseMode: String,
  display: Boolean,
  active: Boolean,
  sortOrder: Number
}, { timestamps: true });

module.exports = mongoose.model('LicensingAndService', licensingAndServiceSchema, 'licensing_and_services');
