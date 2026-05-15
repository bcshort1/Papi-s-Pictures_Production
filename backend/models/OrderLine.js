const mongoose = require('mongoose');

const orderLineSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CommerceOrder',
    required: true
  },
  catalogItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CatalogItem',
    required: true
  },
  mediaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Media'
  },
  kind: {
    type: String,
    enum: ['prodigi_product', 'license_tier', 'service'],
    required: true
  },
  prodigiSku: String,
  assetUrl: String,
  priceCents: Number,
  captureState: {
    type: String,
    enum: ['pending', 'captured', 'voided'],
    default: 'pending'
  },
  licenseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'License'
  }
}, { timestamps: true });

orderLineSchema.index({ orderId: 1 });

module.exports = mongoose.model('OrderLine', orderLineSchema, 'order_lines');
