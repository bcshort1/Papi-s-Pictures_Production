const crypto = require('crypto');
const mongoose = require('mongoose');

const shippingAddressSchema = new mongoose.Schema({
  name: String,
  line1: String,
  line2: String,
  city: String,
  state: String,
  postalCode: String,
  country: String
}, { _id: false });

const commerceOrderSchema = new mongoose.Schema({
  buyerCustomerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BuyerCustomer',
    required: true
  },
  stripeSessionId: { type: String, unique: true, required: true },
  stripePaymentIntentId: String,
  captureState: {
    type: String,
    enum: ['pending', 'license_captured', 'fully_captured', 'voided', 'refunded'],
    default: 'pending'
  },
  licenseCapturedAmountCents: Number,
  physicalCapturedAmountCents: Number,
  prodigiOrderId: String,
  prodigiStatus: String,
  trackingNumber: String,
  trackingUrl: String,
  shippingSnapshot: mongoose.Schema.Types.Mixed,
  receiptToken: {
    type: String,
    unique: true,
    default: function () {
      return crypto.randomBytes(32).toString('hex');
    }
  },
  guestEmail: String,
  shippingAddress: shippingAddressSchema,
  totalCents: Number,
  taxCents: Number,
  shippingCents: Number,
  status: {
    type: String,
    enum: ['open', 'complete', 'cancelled'],
    default: 'open'
  }
}, { timestamps: true });

module.exports = mongoose.model('CommerceOrder', commerceOrderSchema, 'commerce_orders');
