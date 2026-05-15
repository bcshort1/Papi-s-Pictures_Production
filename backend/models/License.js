const crypto = require('crypto');
const mongoose = require('mongoose');

const licenseSchema = new mongoose.Schema({
  orderLineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OrderLine',
    required: true
  },
  buyerCustomerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BuyerCustomer'
  },
  mediaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Media',
    required: true
  },
  licenseScope: String,
  licenseKey: {
    type: String,
    unique: true,
    default: function () {
      return crypto.randomBytes(48).toString('hex');
    }
  },
  expiresAt: Date,
  downloadCount: { type: Number, default: 0 },
  downloadLimit: { type: Number, default: null },
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('License', licenseSchema, 'licenses');
