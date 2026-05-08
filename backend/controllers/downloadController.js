const asyncHandler = require('express-async-handler');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const Media = require('../models/Media');
const {
    PHOTOS_FULL_RES_DIR,
    VIDEOS_FULL_RES_DIR,
    MEDIA_DISPLAY_DIR,
    THUMBNAILS_DIR
} = require('../services/mediaService');
const {
    resolveVersionPath,
    versionFileNameOnDisk,
    safeFolderName
} = require('../utils/helpers');

const DIRS = { PHOTOS_FULL_RES_DIR, VIDEOS_FULL_RES_DIR, MEDIA_DISPLAY_DIR, THUMBNAILS_DIR };

const VALID_VERSIONS = ['thumbnail', 'display', 'fullres'];

function normalizeVersionList(input) {
    if (!input) return [];
    let raw;
    if (Array.isArray(input)) {
        raw = input;
    } else {
        raw = String(input).split(',');
    }
    const seen = {};
    const out = [];
    for (let i = 0; i < raw.length; i++) {
        const v = String(raw[i]).trim().toLowerCase();
        if (!v) continue;
        if (VALID_VERSIONS.indexOf(v) === -1) continue;
        if (seen[v]) continue;
        seen[v] = true;
        out.push(v);
    }
    return out;
}

const downloadSingleVersion = asyncHandler(async function (req, res) {
    const id = req.params.id;
    const version = String(req.params.version || '').toLowerCase();
    if (VALID_VERSIONS.indexOf(version) === -1) {
        return res.status(400).json({ error: 'Invalid version. Must be one of: ' + VALID_VERSIONS.join(', ') });
    }

    const media = await Media.findById(id).lean();
    if (!media) {
        return res.status(404).json({ error: 'Media not found' });
    }

    const filePath = resolveVersionPath(media, version, DIRS);
    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found on disk for version ' + version });
    }

    const downloadName = versionFileNameOnDisk(media, version) || path.basename(filePath);
    res.download(filePath, downloadName);
});

const downloadItemZip = asyncHandler(async function (req, res) {
    const id = req.params.id;
    const versions = normalizeVersionList(req.query.versions);
    if (versions.length === 0) {
        return res.status(400).json({ error: 'Specify at least one version via ?versions= (thumbnail, display, fullres)' });
    }

    const media = await Media.findById(id).lean();
    if (!media) {
        return res.status(404).json({ error: 'Media not found' });
    }

    const folderName = safeFolderName(media.title, media.capturedAt);
    const zipName = folderName + '.zip';

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="' + zipName + '"');

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', function (err) {
        console.warn('Archive warning (item zip):', err.message);
    });
    archive.on('error', function (err) {
        console.error('Archive error (item zip):', err);
        try { res.status(500).end(); } catch (e) {  }
    });
    archive.pipe(res);

    let appended = 0;
    for (let i = 0; i < versions.length; i++) {
        const v = versions[i];
        const filePath = resolveVersionPath(media, v, DIRS);
        const fileName = versionFileNameOnDisk(media, v);
        if (filePath && fileName && fs.existsSync(filePath)) {
            archive.file(filePath, { name: fileName });
            appended++;
        }
    }

    if (appended === 0) {
        archive.append('No files were available for the requested versions.\n', { name: 'README.txt' });
    }

    await archive.finalize();
});

const downloadBatchZip = asyncHandler(async function (req, res) {
    const body = req.body || {};
    let items = body.items;

    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch (e) {
            return res.status(400).json({ error: 'items must be valid JSON.' });
        }
    }
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items array is required.' });
    }

    const cleaned = [];
    const idsToFetch = [];
    for (let i = 0; i < items.length; i++) {
        const entry = items[i];
        if (!entry || !entry.id) continue;
        const versions = normalizeVersionList(entry.versions);
        if (versions.length === 0) continue;
        cleaned.push({ id: String(entry.id), versions: versions });
        idsToFetch.push(String(entry.id));
    }

    if (cleaned.length === 0) {
        return res.status(400).json({ error: 'No valid items / versions to include in the batch.' });
    }

    const docs = await Media.find({ _id: { $in: idsToFetch } }).lean();
    const docMap = {};
    for (let d = 0; d < docs.length; d++) {
        docMap[String(docs[d]._id)] = docs[d];
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const zipName = 'papis_pictures_batch_' + ts + '.zip';

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="' + zipName + '"');

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', function (err) {
        console.warn('Archive warning (batch zip):', err.message);
    });
    archive.on('error', function (err) {
        console.error('Archive error (batch zip):', err);
        try { res.status(500).end(); } catch (e) {  }
    });
    archive.pipe(res);

    const usedFolders = {};
    const missingItems = [];
    let appendedAny = false;

    for (let c = 0; c < cleaned.length; c++) {
        const entry = cleaned[c];
        const media = docMap[entry.id];
        if (!media) {
            missingItems.push({ id: entry.id, reason: 'document not found' });
            continue;
        }

        let folder = safeFolderName(media.title, media.capturedAt);
        if (usedFolders[folder]) {
            folder = folder + '_' + String(media._id).slice(-6);
        }
        usedFolders[folder] = true;

        const itemMissing = [];
        for (let v = 0; v < entry.versions.length; v++) {
            const version = entry.versions[v];
            const filePath = resolveVersionPath(media, version, DIRS);
            const fileName = versionFileNameOnDisk(media, version);
            if (filePath && fileName && fs.existsSync(filePath)) {
                archive.file(filePath, { name: folder + '/' + fileName });
                appendedAny = true;
            } else {
                itemMissing.push(version);
            }
        }
        if (itemMissing.length > 0) {
            missingItems.push({ id: entry.id, title: media.title, missing: itemMissing });
        }
    }

    if (missingItems.length > 0 || !appendedAny) {
        const lines = [
            'Papi\'s Pictures - batch download manifest',
            'Generated: ' + new Date().toISOString(),
            'Items requested: ' + cleaned.length,
            ''
        ];
        if (missingItems.length > 0) {
            lines.push('Items with missing files:');
            for (let m = 0; m < missingItems.length; m++) {
                lines.push('  - ' + JSON.stringify(missingItems[m]));
            }
        }
        if (!appendedAny) {
            lines.push('');
            lines.push('No files were available on disk; the zip is empty aside from this manifest.');
        }
        archive.append(lines.join('\n') + '\n', { name: 'MANIFEST.txt' });
    }

    await archive.finalize();
});

module.exports = {
    downloadSingleVersion,
    downloadItemZip,
    downloadBatchZip
};
