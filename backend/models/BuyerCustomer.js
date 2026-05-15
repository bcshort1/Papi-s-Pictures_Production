const mongoose = require('mongoose');

const buyerCustomerSchema = new mongoose.Schema({
  stripeCustomerId: { type: String, unique: true, required: true },
  email: { type: String, required: true },
  name: String,
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  isGuest: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('BuyerCustomer', buyerCustomerSchema, 'buyer_customers');
