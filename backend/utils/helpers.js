//fs is needed for the rename/exists checks below.
const fs = require('fs');
//path is needed for absolute-path detection and joining.
const path = require('path');

//Format a Date (or date-like value) to a human-readable string like "March 21, 2026".
function formatDate(date) {
    //Empty input → empty string, so callers can drop the result straight into JSON.
    if (!date) return '';
    //Force UTC so the displayed date matches the stored capture date regardless of server timezone.
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
    });
}

//Turn a title into a URL-friendly slug (lowercase, hyphen-separated, trimmed).
function toSlug(title) {
    //Lowercase, collapse non-alphanumerics into single hyphens, then strip leading/trailing hyphens.
    return (title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

//Sanitize a title for safe use as part of a file name on disk.
function toFileNameBase(title) {
    //Default missing titles to 'Untitled', drop everything except letters/digits/spaces, then collapse spaces to underscores.
    return (title || 'Untitled').replace(/[^a-zA-Z0-9 ]/g, '').replace(/ +/g, '_');
}

//Build a YYYYMMDDHHmmss UTC timestamp suitable for embedding in file names.
function toFileTimestamp(capturedAt) {
    //Missing input → 'nodate' sentinel so callers still get a valid file name.
    if (!capturedAt) return 'nodate';
    //Parse once for component access.
    const d = new Date(capturedAt);
    //Unparseable values are treated the same as missing values to avoid 'NaN' in file names.
    if (isNaN(d.getTime())) return 'nodate';
    //Tiny zero-pad helper for two-digit components.
    const pad = function (n) { return n < 10 ? '0' + n : String(n); };
    //Concatenate UTC parts in fixed-width order so the result sorts naturally.
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
           pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds());
}

//Build the three coordinated file names (OG, Display, Thumb) for a media item.
//Extensions are picked per mediaType so callers stay format-agnostic.
function buildMediaFileNames(title, capturedAt, mediaType) {
    //File-safe base derived from the title.
    const base = toFileNameBase(title);
    //Timestamp suffix derived from the capture date (or 'nodate').
    const ts = toFileTimestamp(capturedAt);
    //Shared prefix used by all three variants.
    const prefix = base + '_' + ts;
    //Cache the type check so the extension picks below stay terse.
    const isVideo = mediaType === 'video';
    //Videos use .mp4 for OG/Display, photos use .png; thumbnails are always .jpg.
    return {
        ogName: prefix + '_OG' + (isVideo ? '.mp4' : '.png'),
        displayName: prefix + '_Display' + (isVideo ? '.mp4' : '.png'),
        thumbName: prefix + '_Thumb.jpg'
    };
}

//Rename a file on disk only when the source actually exists.
//Returns null when the source is missing so callers do NOT overwrite the DB path with a phantom value.
//Returns oldPath if the rename throws so the DB still points at the last known-good location.
function renameFileIfExists(oldPath, newPath) {
    //Nothing to rename.
    if (!oldPath) return null;
    //No-op rename short-circuit.
    if (oldPath === newPath) return newPath;
    try {
        //Refuse to rename what isn't there; warn so the operator can investigate.
        if (!fs.existsSync(oldPath)) {
            console.warn('renameFileIfExists: source missing, leaving DB path unchanged:', oldPath);
            return null;
        }
        //Synchronous rename so the caller's DB write strictly follows the disk move.
        fs.renameSync(oldPath, newPath);
        //Hand back the new path for persistence.
        return newPath;
    } catch (e) {
        //Log and keep the old path so we never lose track of the file.
        console.error('File rename error:', e.message);
        return oldPath;
    }
}

//Resolve a stored media path value to an absolute disk path.
//Accepts either a bare basename (preferred current format) or an absolute path (legacy format).
function resolveMediaPath(storedValue, directory) {
    //Empty values → null so callers can branch cleanly.
    if (!storedValue) return null;
    //Already-absolute legacy paths are passed through untouched.
    if (path.isAbsolute(storedValue)) return storedValue;
    //Basenames are joined against the canonical directory for that media variant.
    return path.join(directory, storedValue);
}

//Derive a seasonal tag from a capture date so photos auto-tag by Northern-Hemisphere season.
function getSeasonTag(capturedAt) {
    //No capture date → no tag.
    if (!capturedAt) return null;
    //Read the month in UTC to match the timestamp formatting elsewhere.
    const month = new Date(capturedAt).getUTCMonth();
    //March-May → spring.
    if (month >= 2 && month <= 4) return 'spring';
    //June-August → summer.
    if (month >= 5 && month <= 7) return 'summer';
    //September-November → fall.
    if (month >= 8 && month <= 10) return 'fall';
    //Dec-Feb → winter (default).
    return 'winter';
}

//Derive a 'drone' or 'handheld' tag from the camera make string.
function getDroneTag(cameraMake) {
    //Unknown make → no tag.
    if (!cameraMake) return null;
    //Any DJI body counts as a drone capture.
    if (cameraMake.toLowerCase().includes('dji')) return 'drone';
    //Everything else is treated as handheld.
    return 'handheld';
}

module.exports = {
    formatDate,
    toSlug,
    toFileNameBase,
    toFileTimestamp,
    buildMediaFileNames,
    renameFileIfExists,
    resolveMediaPath,
    getSeasonTag,
    getDroneTag
};
