const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  legacyId: Number,
  slug: { type: String, unique: true, required: true },
  mediaType: String,
  title: String,
  description: String,
  alt: String,
  fileName: String,
  fullResolutionLogolessPath: String,
  displayResolutionPath: String,
  thumbnailPath: String,
  creator: String,
  galleries: [{
    gallerySlug: String,
    galleryName: String,
    galleryPosition: Number
  }],
  tags: [String],
  display: Boolean,
  showInRecent: Boolean,
  capturedAt: Date,
  ingestedAt: Date,
  location: {
    city: String,
    state: String,
    country: String
  },
  metadata: {
    imageWidthPixels: Number,
    imageHeightPixels: Number,
    aspectRatio: Number,
    horizontalDpi: Number,
    verticalDpi: Number,
    bitDepth: Number,
    resolutionUnit: String,
    cameraMake: String,
    cameraModel: String,
    aperture: String,
    exposureTime: String,
    iso: Number,
    exposureBias: Number,
    focalLength: String,
    maxAperture: String,
    meteringMode: String,
    subjectDistance: String,
    flashMode: String,
    focalLength35mm: String,
    lensMake: String,
    lensModel: String,
    flashMake: String,
    flashModel: String,
    contrast: String,
    brightness: Number,
    lightSource: String,
    exposureProgram: String,
    saturation: String,
    sharpness: String,
    whiteBalance: String,
    digitalZoom: Number,
    exifVersion: String,
    gpsLatitude: Number,
    gpsLongitude: Number,
    gpsAltitude: Number
  }
}, { timestamps: true });

module.exports = mongoose.model('Media', mediaSchema, 'media');
