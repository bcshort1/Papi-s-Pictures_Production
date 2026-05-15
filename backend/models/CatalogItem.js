const mongoose = require('mongoose');

const kindPayloadSchema = new mongoose.Schema({
  prodigiSku: String,
  printAttributes: mongoose.Schema.Types.Mixed,
  sizeLabelCustomer: String,
  allowedMediaIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Media' }],
  licenseScope: String,
  expiryMonths: { type: Number, default: 24 },
  allowedUses: String,
  serviceDescription: String
}, { _id: false });

const catalogItemSchema = new mongoose.Schema({
  kind: {
    type: String,
    enum: ['license_tier', 'prodigi_product', 'service'],
    required: true
  },
  name: String,
  description: String,
  active: { type: Boolean, default: true },
  priceCents: { type: Number, required: true },
  currency: { type: String, default: 'usd' },
  displayOrder: { type: Number, default: 0 },
  kindPayload: kindPayloadSchema
}, { timestamps: true });

module.exports = mongoose.model('CatalogItem', catalogItemSchema, 'catalog_items');
