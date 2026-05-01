//path is used to strip absolute legacy paths down to bare basenames for the API response.
const path = require('path');
//formatDate is reused so date fields land in the JSON as readable strings, not raw ISO timestamps.
const { formatDate } = require('./helpers');

//Transform a Mongo media document into the recentPictures shape the portfolio frontend expects.
function toRecentPicture(document) {
    //Prefer the basename of displayResolutionPath so legacy absolute paths still serve over the basename-based static route.
    const fileName = document.displayResolutionPath
        ? path.basename(document.displayResolutionPath)
        : document.fileName;
    //Flat shape — the frontend expects city/state/country and metadata fields at the top level, not nested.
    return {
        //Both _id (Mongo) and legacyId (pre-migration numeric id) are exposed so old client links keep working.
        _id: document._id,
        id: document.legacyId,
        title: document.title,
        description: document.description,
        fileName: fileName,
        alt: document.alt,
        creator: document.creator,
        //Default missing mediaType to '' so the frontend's string compares stay safe.
        mediaType: document.mediaType || '',
        //Default missing tags to [] so the frontend can iterate without a null check.
        tags: document.tags || [],
        //Run capturedAt through formatDate when present so the UI gets a pretty string, not raw JSON.
        capturedAt: document.capturedAt ? formatDate(document.capturedAt) : '',
        //Flatten the nested location subdoc to top-level fields with safe defaults.
        city: document.location ? document.location.city || '' : '',
        state: document.location ? document.location.state || '' : '',
        country: document.location ? document.location.country || '' : '',
        //Flatten metadata pixel dimensions to numbers (defaulting to 0) for layout calculations.
        imageWidth: document.metadata ? document.metadata.imageWidthPixels || 0 : 0,
        imageHeight: document.metadata ? document.metadata.imageHeightPixels || 0 : 0,
        //Coerce aspectRatio to a string because Mongoose Decimal128 serializes oddly otherwise.
        aspectRatio: document.metadata && document.metadata.aspectRatio ? document.metadata.aspectRatio.toString() : '',
        //Camera/EXIF fields are exposed individually so the lightbox can render an info panel.
        cameraMake: document.metadata ? document.metadata.cameraMake || '' : '',
        cameraModel: document.metadata ? document.metadata.cameraModel || '' : '',
        aperture: document.metadata ? document.metadata.aperture || '' : '',
        exposureTime: document.metadata ? document.metadata.exposureTime || '' : '',
        iso: document.metadata ? document.metadata.iso || '' : '',
        focalLength: document.metadata ? document.metadata.focalLength || '' : '',
        lensModel: document.metadata ? document.metadata.lensModel || '' : '',
        //Boolean flags default to false so the frontend never sees undefined.
        featured: document.featured || false,
        showInRecent: document.showInRecent || false
    };
}

//Transform a licensing/service document into the photoVideoServices API shape.
function toService(document) {
    //Minimal shape — services only need id, name, description, price on the public site.
    return {
        //Mongo ObjectId for new clients.
        _id: document._id,
        //legacyId aliased as 'id' so legacy frontends keep working.
        id: document.legacyId,
        //Human-facing service name, passed through verbatim.
        serviceName: document.serviceName,
        //Description, passed through verbatim — formatting is the frontend's job.
        serviceDescription: document.serviceDescription,
        //Price as stored (string with currency symbol or number, depending on entry).
        price: document.price
    };
}

//Transform a what's-new document into the whatsNewItems API shape.
function toWhatsNewItem(document) {
    //Shape tuned for the timeline cards on the home page.
    return {
        //Mongo ObjectId for admin actions.
        _id: document._id,
        //legacyId aliased as 'id' so legacy frontends keep working.
        id: document.legacyId,
        //Run date through formatDate so the timeline renders a friendly string instead of an ISO timestamp.
        date: formatDate(document.date),
        //Headline title, passed through verbatim.
        title: document.title,
        //Body description, passed through verbatim.
        description: document.description,
        //Category tag (e.g. 'event', 'release') used for badge colors.
        tag: document.tag
    };
}

//Exported as a group since the public controller always imports them together.
module.exports = { toRecentPicture, toService, toWhatsNewItem };
