const mongoose = require('mongoose');

const refundProposalSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CommerceOrder',
    required: true
  },
  reason: String,
  prodigiOrderId: String,
  amountCents: Number,
  status: {
    type: String,
    enum: ['pending_approval', 'approved', 'rejected', 'executed'],
    default: 'pending_approval'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  stripeRefundId: String,
  notes: String
}, { timestamps: true });

module.exports = mongoose.model('RefundProposal', refundProposalSchema, 'refund_proposals');
