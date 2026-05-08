const fs = require('fs');
const path = require('path');

function formatDate(date) {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
    });
}

function toSlug(title) {
    return (title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function toFileNameBase(title) {
    return (title || 'Untitled').replace(/[^a-zA-Z0-9 ]/g, '').replace(/ +/g, '_');
}

function toFileTimestamp(capturedAt) {
    if (!capturedAt) return 'nodate';
    const d = new Date(capturedAt);
    if (isNaN(d.getTime())) return 'nodate';
    const pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
           pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds());
}

function buildMediaFileNames(title, capturedAt, mediaType) {
    const base = toFileNameBase(title);
    const ts = toFileTimestamp(capturedAt);
    const prefix = base + '_' + ts;
    const isVideo = mediaType === 'video';
    return {
        ogName: prefix + '_OG' + (isVideo ? '.mp4' : '.png'),
        displayName: prefix + '_Display' + (isVideo ? '.mp4' : '.png'),
        thumbName: prefix + '_Thumb.jpg'
    };
}

function renameFileIfExists(oldPath, newPath) {
    if (!oldPath) return null;
    if (oldPath === newPath) return newPath;
    try {
        if (!fs.existsSync(oldPath)) {
            console.warn('renameFileIfExists: source missing, leaving DB path unchanged:', oldPath);
            return null;
        }
        fs.renameSync(oldPath, newPath);
        return newPath;
    } catch (e) {
        console.error('File rename error:', e.message);
        return oldPath;
    }
}

function resolveMediaPath(storedValue, directory) {
    if (!storedValue) return null;
    if (path.isAbsolute(storedValue)) return storedValue;
    return path.join(directory, storedValue);
}

function getSeasonTag(capturedAt) {
    if (!capturedAt) return null;
    const month = new Date(capturedAt).getUTCMonth();
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'fall';
    return 'winter';
}

function getDroneTag(cameraMake) {
    if (!cameraMake) return null;
    if (cameraMake.toLowerCase().includes('dji')) return 'drone';
    return 'handheld';
}

function resolveVersionPath(media, version, dirs) {
    if (!media || !dirs) return null;
    const isVideo = media.mediaType === 'video';
    const fullResDir = isVideo ? dirs.VIDEOS_FULL_RES_DIR : dirs.PHOTOS_FULL_RES_DIR;

    if (version === 'thumbnail') {
        return resolveMediaPath(media.thumbnailPath, dirs.THUMBNAILS_DIR);
    }
    if (version === 'display') {
        return resolveMediaPath(media.displayResolutionPath, dirs.MEDIA_DISPLAY_DIR);
    }
    if (version === 'fullres') {
        return resolveMediaPath(media.fullResolutionLogolessPath, fullResDir);
    }
    return null;
}

function versionFileNameOnDisk(media, version) {
    if (!media) return null;
    if (version === 'thumbnail') return media.thumbnailPath ? path.basename(media.thumbnailPath) : null;
    if (version === 'display') return media.displayResolutionPath ? path.basename(media.displayResolutionPath) : null;
    if (version === 'fullres') return media.fullResolutionLogolessPath ? path.basename(media.fullResolutionLogolessPath) : null;
    return null;
}

function safeFolderName(title, capturedAt) {
    const base = toFileNameBase(title);
    const ts = toFileTimestamp(capturedAt);
    return base + '_' + ts;
}

module.exports = {
    formatDate,
    toSlug,
    toFileNameBase,
    toFileTimestamp,
    buildMediaFileNames,
    renameFileIfExists,
    resolveMediaPath,
    resolveVersionPath,
    versionFileNameOnDisk,
    safeFolderName,
    getSeasonTag,
    getDroneTag
};
