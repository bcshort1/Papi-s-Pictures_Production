const path = require('path');
const { formatDate } = require('./helpers');

function toRecentPicture(document) {
    const fileName = document.displayResolutionPath
        ? path.basename(document.displayResolutionPath)
        : document.fileName;
    return {
        _id: document._id,
        id: document.legacyId,
        title: document.title,
        description: document.description,
        fileName: fileName,
        alt: document.alt,
        creator: document.creator,
        mediaType: document.mediaType || '',
        tags: document.tags || [],
        capturedAt: document.capturedAt ? formatDate(document.capturedAt) : '',
        city: document.location ? document.location.city || '' : '',
        state: document.location ? document.location.state || '' : '',
        country: document.location ? document.location.country || '' : '',
        imageWidth: document.metadata ? document.metadata.imageWidthPixels || 0 : 0,
        imageHeight: document.metadata ? document.metadata.imageHeightPixels || 0 : 0,
        aspectRatio: document.metadata && document.metadata.aspectRatio ? document.metadata.aspectRatio.toString() : '',
        cameraMake: document.metadata ? document.metadata.cameraMake || '' : '',
        cameraModel: document.metadata ? document.metadata.cameraModel || '' : '',
        aperture: document.metadata ? document.metadata.aperture || '' : '',
        exposureTime: document.metadata ? document.metadata.exposureTime || '' : '',
        iso: document.metadata ? document.metadata.iso || '' : '',
        focalLength: document.metadata ? document.metadata.focalLength || '' : '',
        lensModel: document.metadata ? document.metadata.lensModel || '' : '',
        showInRecent: document.showInRecent || false
    };
}

function toService(document) {
    return {
        _id: document._id,
        id: document.legacyId,
        serviceName: document.serviceName,
        serviceDescription: document.serviceDescription,
        price: document.price
    };
}

function toWhatsNewItem(document) {
    return {
        _id: document._id,
        id: document.legacyId,
        date: formatDate(document.date),
        title: document.title,
        description: document.description,
        tag: document.tag
    };
}

module.exports = { toRecentPicture, toService, toWhatsNewItem };
