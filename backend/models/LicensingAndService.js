/**
 * Licensing and Service Model
 *
 * Defines the Mongoose schema for photography and videography service and licensing
 * offerings in the Papi's Pictures portfolio. Each document represents a purchasable
 * service or license type with pricing, display settings, and ordering information.
 * This schema is used with the 'licensing_and_services' collection in MongoDB.
 */
const mongoose = require('mongoose');

/**
 * Schema definition for the licensing_and_services collection.
 * Tracks service details, pricing, visibility, and sort ordering for the storefront.
 */
const licensingAndServiceSchema = new mongoose.Schema({
  legacyId: Number,                        // Original numeric ID from the legacy system.
  slug: { type: String, unique: true, required: true },  // URL-friendly unique identifier.
  serviceName: String,                     // Display name for the service or license.
  serviceDescription: String,              // Description text explaining the service.
  price: Number,                           // Price in the specified currency.
  currency: String,                        // Currency code (e.g., "USD").
  type: String,                            // Category type of the service.
  mediaUse: String,                        // Allowed usage type for the licensed media.
  purchaseMode: String,                    // How the service is purchased (e.g., "one-time", "subscription").
  display: Boolean,                        // Whether this item is visible on the public site.
  active: Boolean,                         // Whether this service is currently available for purchase.
  sortOrder: Number                        // Display order position on the storefront.
}, { timestamps: true });  // Automatically adds createdAt and updatedAt fields.

//Export the LicensingAndService model, bound to the 'licensing_and_services' collection in MongoDB.
module.exports = mongoose.model('LicensingAndService', licensingAndServiceSchema, 'licensing_and_services');
