/**
 * Media Model
 *
 * Defines the Mongoose schema for media items (photos and videos) in the Papi's Pictures portfolio.
 * Each document represents a single piece of media content with its associated metadata,
 * file paths, gallery assignments, location data, and camera/capture information.
 * This schema is used with the 'media' collection in MongoDB.
 */
const mongoose = require('mongoose');

/**
 * Schema definition for the media collection.
 * Tracks full resolution, display, and thumbnail file paths along with
 * camera metadata, GPS coordinates, gallery memberships, and display settings.
 */
const mediaSchema = new mongoose.Schema({
  legacyId: Number,                       // Original numeric ID from the legacy system.
  slug: { type: String, unique: true, required: true },  // URL-friendly unique identifier.
  mediaType: String,                       // Type of media: "photo" or "video".
  title: String,                           // Display title for the media item.
  description: String,                     // Description text shown on the portfolio.
  alt: String,                             // Alt text for accessibility on image elements.
  fileName: String,                        // Original file name of the media asset.
  fullResolutionLogolessPath: String,       // File path to the full resolution version without a watermark logo.
  displayResolutionPath: String,           // File path to the web-optimized display resolution version.
  thumbnailPath: String,                   // File path to the thumbnail version.
  creator: String,                         // Photographer or creator name.
  galleries: [{                            // Array of gallery assignments for this media item.
    gallerySlug: String,                   // URL-friendly identifier for the gallery.
    galleryName: String,                   // Human-readable gallery name.
    galleryPosition: Number                // Sort position within the gallery.
  }],
  tags: [String],                          // Searchable tags for categorization.
  display: Boolean,                        // Whether this item is visible on the site.
  showOnHomepage: Boolean,                 // Whether this item appears on the homepage gallery.
  homepageSortOrder: Number,               // Sort order position on the homepage.
  showInRecent: Boolean,                   // Whether this item is eligible to appear in the Recent Pictures section.
  featured: Boolean,                       // Whether this item appears in the Featured Gallery section.
  capturedAt: Date,                        // Date and time the media was originally captured.
  ingestedAt: Date,                        // Date and time the media was imported into the system.
  location: {                              // Geographic location where the media was captured.
    city: String,                          // City name.
    state: String,                         // State or province name.
    country: String                        // Country name.
  },
  metadata: {                              // Technical camera and image metadata.
    imageWidthPixels: Number,              // Image width in pixels.
    imageHeightPixels: Number,             // Image height in pixels.
    aspectRatio: Number,                   // Width-to-height aspect ratio.
    horizontalDpi: Number,                 // Horizontal resolution in DPI.
    verticalDpi: Number,                   // Vertical resolution in DPI.
    bitDepth: Number,                      // Bits per sample.
    resolutionUnit: String,                // Resolution unit (e.g., "inches", "centimeters").
    cameraMake: String,                    // Camera manufacturer (e.g., "DJI", "Canon").
    cameraModel: String,                   // Camera model name.
    aperture: String,                      // Aperture f-stop value (e.g., "f/2.8").
    exposureTime: String,                  // Shutter speed (e.g., "1/500").
    iso: Number,                           // ISO sensitivity value.
    exposureBias: Number,                  // Exposure bias / compensation value.
    focalLength: String,                   // Focal length in millimeters.
    maxAperture: String,                   // Maximum aperture value.
    meteringMode: String,                  // Metering mode (e.g., "Multi-segment").
    subjectDistance: String,               // Subject distance in meters.
    flashMode: String,                     // Flash mode description.
    focalLength35mm: String,               // 35mm equivalent focal length.
    lensMake: String,                      // Lens manufacturer.
    lensModel: String,                     // Lens model name.
    flashMake: String,                     // Flash manufacturer (admin-editable, not auto-extracted).
    flashModel: String,                    // Flash model (admin-editable, not auto-extracted).
    contrast: String,                      // Contrast setting.
    brightness: Number,                    // Brightness value.
    lightSource: String,                   // Light source (e.g., "Daylight").
    exposureProgram: String,               // Exposure program (e.g., "Aperture Priority").
    saturation: String,                    // Saturation setting.
    sharpness: String,                     // Sharpness setting.
    whiteBalance: String,                  // White balance mode.
    digitalZoom: Number,                   // Digital zoom ratio.
    exifVersion: String,                   // EXIF version string.
    gpsLatitude: Number,                   // GPS latitude coordinate.
    gpsLongitude: Number,                  // GPS longitude coordinate.
    gpsAltitude: Number                    // GPS altitude in meters.
  }
}, { timestamps: true });  // Automatically adds createdAt and updatedAt fields.

//Export the Media model, bound to the 'media' collection in MongoDB.
module.exports = mongoose.model('Media', mediaSchema, 'media');
