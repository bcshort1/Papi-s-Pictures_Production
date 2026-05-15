const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema({
  source: {
    type: String,
    enum: ['stripe', 'prodigi'],
    required: true
  },
  eventId: { type: String, required: true },
  eventType: String,
  processedAt: Date,
  payload: mongoose.Schema.Types.Mixed
}, { timestamps: { createdAt: true, updatedAt: false } });

webhookEventSchema.index({ source: 1, eventId: 1 }, { unique: true });

module.exports = mongoose.model('WebhookEvent', webhookEventSchema, 'webhook_events');
