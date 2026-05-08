const asyncHandler = require('express-async-handler');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const crypto = require('crypto');
const Media = require('../models/Media');
const { toSlug, toFileNameBase, buildMediaFileNames, renameFileIfExists, resolveMediaPath, getSeasonTag, getDroneTag } = require('../utils/helpers');
const {
    PHOTOS_FULL_RES_DIR,
    VIDEOS_FULL_RES_DIR,
    MEDIA_DISPLAY_DIR,
    THUMBNAILS_DIR,
    CHUNKS_DIR,
    parseMultipart,
    extractPhotoMetadata,
    extractVideoMetadata,
    createPhotoDisplayCopy,
    createPhotoThumbnail,
    createVideoThumbnail,
    createVideoDisplayCopy,
    reverseGeocode
} = require('../services/mediaService');

const getAllMedia = asyncHandler(async function (req, res) {
    const items = await Media.find({}).sort({ capturedAt: -1 }).lean();
    res.json(items);
});

const getMediaTags = asyncHandler(async function (req, res) {
    const tags = await Media.distinct('tags');
    res.json(tags.sort());
});

const uploadMedia = asyncHandler(async function (req, res) {
    const uploaded = await parseMultipart(req);
    const results = [];

    res.status(201);
    res.setHeader('Content-Type', 'application/json');
    const heartbeat = setInterval(function () {
        if (!res.writableEnded) res.write(' ');
    }, 15000);

    for (const file of uploaded.files) {
        const isPhoto = file.mimeType.startsWith('image/');
        const isVideo = file.mimeType.startsWith('video/');
        if (!isPhoto && !isVideo) {
            results.push({ filename: file.filename, error: 'Unsupported file type: ' + file.mimeType });
            continue;
        }

        const originalName = file.filename;
        const ext = path.extname(originalName);
        const nameWithoutExt = path.basename(originalName, ext);
        const title = nameWithoutExt.replace(/_/g, ' ');

        let metadata = {
            imageWidthPixels: null,
            imageHeightPixels: null,
            aspectRatio: null,
            horizontalDpi: null,
            verticalDpi: null,
            bitDepth: null,
            resolutionUnit: null,
            cameraMake: null,
            cameraModel: null,
            aperture: null,
            exposureTime: null,
            iso: null,
            exposureBias: null,
            focalLength: null,
            maxAperture: null,
            meteringMode: null,
            subjectDistance: null,
            flashMode: null,
            focalLength35mm: null,
            lensMake: null,
            lensModel: null,
            flashMake: null,
            flashModel: null,
            contrast: null,
            brightness: null,
            lightSource: null,
            exposureProgram: null,
            saturation: null,
            sharpness: null,
            whiteBalance: null,
            digitalZoom: null,
            exifVersion: null,
            gpsLatitude: null,
            gpsLongitude: null,
            gpsAltitude: null
        };
        let capturedAt = null;
        let locationFromExif = { city: '', state: '', country: '' };

        if (isPhoto) {
            const exifData = await extractPhotoMetadata(file.buffer);
            capturedAt = exifData.capturedAt || null;
            metadata.cameraMake = exifData.cameraMake || null;
            metadata.cameraModel = exifData.cameraModel || null;
            metadata.aperture = exifData.aperture || null;
            metadata.exposureTime = exifData.exposureTime || null;
            metadata.iso = exifData.iso || null;
            metadata.focalLength = exifData.focalLength || null;
            metadata.lensModel = exifData.lensModel || null;
            metadata.lensMake = exifData.lensMake || null;
            metadata.gpsLatitude = exifData.gpsLatitude || null;
            metadata.gpsLongitude = exifData.gpsLongitude || null;
            metadata.gpsAltitude = exifData.gpsAltitude ?? null;
            metadata.horizontalDpi = exifData.horizontalDpi || null;
            metadata.verticalDpi = exifData.verticalDpi || null;
            metadata.bitDepth = exifData.bitDepth || null;
            metadata.resolutionUnit = exifData.resolutionUnit || null;
            metadata.exposureBias = exifData.exposureBias ?? null;
            metadata.maxAperture = exifData.maxAperture || null;
            metadata.meteringMode = exifData.meteringMode || null;
            metadata.subjectDistance = exifData.subjectDistance || null;
            metadata.flashMode = exifData.flashMode || null;
            metadata.focalLength35mm = exifData.focalLength35mm || null;
            metadata.contrast = exifData.contrast || null;
            metadata.brightness = exifData.brightness ?? null;
            metadata.lightSource = exifData.lightSource || null;
            metadata.exposureProgram = exifData.exposureProgram || null;
            metadata.saturation = exifData.saturation || null;
            metadata.sharpness = exifData.sharpness || null;
            metadata.whiteBalance = exifData.whiteBalance || null;
            metadata.digitalZoom = exifData.digitalZoom ?? null;
            metadata.exifVersion = exifData.exifVersion || null;

            locationFromExif = {
                city: exifData.city || '',
                state: exifData.state || '',
                country: exifData.country || ''
            };
            if (!locationFromExif.city && !locationFromExif.state && !locationFromExif.country
                && metadata.gpsLatitude && metadata.gpsLongitude) {
                var geo = await reverseGeocode(metadata.gpsLatitude, metadata.gpsLongitude);
                locationFromExif.city = geo.city || '';
                locationFromExif.state = geo.state || '';
                locationFromExif.country = geo.country || '';
            }

            const sharpMeta = await sharp(file.buffer).metadata();
            metadata.imageWidthPixels = sharpMeta.width || null;
            metadata.imageHeightPixels = sharpMeta.height || null;
            if (sharpMeta.width && sharpMeta.height) {
                metadata.aspectRatio = Math.round((sharpMeta.width / sharpMeta.height) * 10000) / 10000;
            }
            if (!metadata.bitDepth && sharpMeta.depth) {
                var depthMap = { uchar: 8, ushort: 16, float: 32, double: 64, char: 8, short: 16, int: 32 };
                metadata.bitDepth = depthMap[sharpMeta.depth] || null;
            }

            const fileNames = buildMediaFileNames(title, capturedAt, 'photo');
            const fullResPath = path.join(PHOTOS_FULL_RES_DIR, fileNames.ogName);
            const displayPath = path.join(MEDIA_DISPLAY_DIR, fileNames.displayName);
            const thumbPath = path.join(THUMBNAILS_DIR, fileNames.thumbName);

            fs.writeFileSync(fullResPath, file.buffer);

            const displayBuffer = await createPhotoDisplayCopy(file.buffer);
            fs.writeFileSync(displayPath, displayBuffer);

            const thumbBuffer = await createPhotoThumbnail(file.buffer);
            fs.writeFileSync(thumbPath, thumbBuffer);

            const autoTags = [];
            const seasonTag = getSeasonTag(capturedAt);
            if (seasonTag) autoTags.push(seasonTag);
            const droneTag = getDroneTag(metadata.cameraMake);
            if (droneTag) autoTags.push(droneTag);

            const mediaDoc = await Media.create({
                slug: toSlug(nameWithoutExt),
                mediaType: 'photo',
                title: title,
                description: '',
                alt: '',
                fileName: originalName,
                fullResolutionLogolessPath: fileNames.ogName,
                displayResolutionPath: fileNames.displayName,
                thumbnailPath: fileNames.thumbName,
                creator: 'Scott Short',
                galleries: [],
                tags: autoTags,
                display: true,
                showInRecent: true,
                capturedAt: capturedAt ? new Date(capturedAt) : null,
                ingestedAt: new Date(),
                location: locationFromExif,
                metadata: metadata
            });

            const missingRequired = [];
            if (!mediaDoc.description) missingRequired.push('description');
            if (!mediaDoc.alt) missingRequired.push('alt');
            if (!mediaDoc.galleries || mediaDoc.galleries.length === 0) missingRequired.push('galleries');

            results.push({ document: mediaDoc.toObject(), autoTags: autoTags, missingRequired: missingRequired });

        } else if (isVideo) {
            const fileNames = buildMediaFileNames(title, capturedAt, 'video');
            const fullResPath = path.join(VIDEOS_FULL_RES_DIR, fileNames.ogName);
            const displayPath = path.join(MEDIA_DISPLAY_DIR, fileNames.displayName);
            const thumbPath = path.join(THUMBNAILS_DIR, fileNames.thumbName);

            fs.writeFileSync(fullResPath, file.buffer);

            const videoMeta = await extractVideoMetadata(fullResPath);
            metadata.imageWidthPixels = videoMeta.imageWidthPixels || null;
            metadata.imageHeightPixels = videoMeta.imageHeightPixels || null;
            metadata.aspectRatio = videoMeta.aspectRatio || null;
            capturedAt = videoMeta.capturedAt || null;

            try {
                await createVideoDisplayCopy(fullResPath, displayPath);
            } catch (videoError) {
                console.error('Video processing error:', videoError.message);
                fs.copyFileSync(fullResPath, displayPath);
            }

            try {
                await createVideoThumbnail(fullResPath, thumbPath);
            } catch (thumbError) {
                console.error('Video thumbnail error:', thumbError.message);
            }

            const autoTags = [];
            const seasonTag = getSeasonTag(capturedAt);
            if (seasonTag) autoTags.push(seasonTag);
            if (originalName.toLowerCase().includes('dji')) {
                autoTags.push('drone');
                metadata.cameraMake = 'DJI';
            }

            const mediaDoc = await Media.create({
                slug: toSlug(nameWithoutExt),
                mediaType: 'video',
                title: title,
                description: '',
                alt: '',
                fileName: originalName,
                fullResolutionLogolessPath: fileNames.ogName,
                displayResolutionPath: fileNames.displayName,
                thumbnailPath: fileNames.thumbName,
                creator: 'Scott Short',
                galleries: [],
                tags: autoTags,
                display: true,
                showInRecent: true,
                capturedAt: capturedAt ? new Date(capturedAt) : null,
                ingestedAt: new Date(),
                location: { city: '', state: '', country: '' },
                metadata: metadata
            });

            const missingRequired = [];
            if (!mediaDoc.description) missingRequired.push('description');
            if (!mediaDoc.alt) missingRequired.push('alt');
            if (!mediaDoc.galleries || mediaDoc.galleries.length === 0) missingRequired.push('galleries');

            results.push({ document: mediaDoc.toObject(), autoTags: autoTags, missingRequired: missingRequired });
        }
    }

    clearInterval(heartbeat);
    res.end(JSON.stringify(results));
});

const updateMedia = asyncHandler(async function (req, res) {
    const id = req.params.id;
    const body = req.body;
    const update = {};

    if (body.title !== undefined) {
        update.title = String(body.title);
        update.slug = toSlug(body.title);
    }
    if (body.description !== undefined) update.description = String(body.description);
    if (body.alt !== undefined) update.alt = String(body.alt);
    if (body.creator !== undefined) update.creator = String(body.creator);
    if (body.capturedAt !== undefined) {
        update.capturedAt = body.capturedAt ? new Date(body.capturedAt) : null;
    }
    if (body.tags !== undefined) update.tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
    if (body.galleries !== undefined) update.galleries = Array.isArray(body.galleries) ? body.galleries : [];
    if (body.display !== undefined) update.display = Boolean(body.display);
    if (body.showInRecent !== undefined) update.showInRecent = Boolean(body.showInRecent);
    if (body.location !== undefined) {
        update.location = {
            city: String(body.location.city || ''),
            state: String(body.location.state || ''),
            country: String(body.location.country || '')
        };
    }
    if (body.metadata !== undefined) {
        const m = body.metadata;
        if (m.flashMake !== undefined) update['metadata.flashMake'] = m.flashMake ? String(m.flashMake) : null;
        if (m.flashModel !== undefined) update['metadata.flashModel'] = m.flashModel ? String(m.flashModel) : null;
    }

    const existing = await Media.findById(id).lean();
    if (existing) {
        const newTitle = update.title !== undefined ? update.title : existing.title;
        const newCapturedAt = update.capturedAt !== undefined ? update.capturedAt : existing.capturedAt;
        const titleChanged = update.title !== undefined && update.title !== existing.title;
        const dateChanged = update.capturedAt !== undefined && String(update.capturedAt) !== String(existing.capturedAt);

        if (titleChanged || dateChanged) {
            const newNames = buildMediaFileNames(newTitle, newCapturedAt, existing.mediaType);
            const isVideo = existing.mediaType === 'video';
            const fullResDir = isVideo ? VIDEOS_FULL_RES_DIR : PHOTOS_FULL_RES_DIR;

            const curFullResAbs = resolveMediaPath(existing.fullResolutionLogolessPath, fullResDir);
            const curDisplayAbs = resolveMediaPath(existing.displayResolutionPath, MEDIA_DISPLAY_DIR);
            const curThumbAbs = resolveMediaPath(existing.thumbnailPath, THUMBNAILS_DIR);

            const newFullResAbs = path.join(fullResDir, newNames.ogName);
            const newDisplayAbs = path.join(MEDIA_DISPLAY_DIR, newNames.displayName);
            const newThumbAbs = path.join(THUMBNAILS_DIR, newNames.thumbName);

            const fullResResult = renameFileIfExists(curFullResAbs, newFullResAbs);
            if (fullResResult) update.fullResolutionLogolessPath = path.basename(fullResResult);

            const displayResult = renameFileIfExists(curDisplayAbs, newDisplayAbs);
            if (displayResult) update.displayResolutionPath = path.basename(displayResult);

            const thumbResult = renameFileIfExists(curThumbAbs, newThumbAbs);
            if (thumbResult) update.thumbnailPath = path.basename(thumbResult);

            update.fileName = newNames.ogName;
        }
    }

    const result = await Media.findByIdAndUpdate(id, update, { returnDocument: 'after' }).lean();
    if (!result) {
        res.status(404).json({ error: 'Media not found' });
        return;
    }
    res.json(result);
});

const deleteMedia = asyncHandler(async function (req, res) {
    const existing = await Media.findById(req.params.id).lean();
    if (!existing) {
        res.status(404).json({ error: 'Media not found' });
        return;
    }

    const isVideo = existing.mediaType === 'video';
    const fullResDir = isVideo ? VIDEOS_FULL_RES_DIR : PHOTOS_FULL_RES_DIR;
    const fullResAbs = resolveMediaPath(existing.fullResolutionLogolessPath, fullResDir);
    const displayAbs = resolveMediaPath(existing.displayResolutionPath, MEDIA_DISPLAY_DIR);
    const thumbAbs = resolveMediaPath(existing.thumbnailPath, THUMBNAILS_DIR);

    if (fullResAbs) {
        try { fs.unlinkSync(fullResAbs); } catch (e) {  }
    }
    if (displayAbs) {
        try { fs.unlinkSync(displayAbs); } catch (e) {  }
    }
    if (thumbAbs) {
        try { fs.unlinkSync(thumbAbs); } catch (e) {  }
    }

    await Media.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

const uploadChunk = asyncHandler(async function (req, res) {
    const uploadId = req.headers['x-upload-id'];
    const chunkIndex = parseInt(req.headers['x-chunk-index'], 10);
    const totalChunks = parseInt(req.headers['x-total-chunks'], 10);
    const fileName = req.headers['x-file-name'];

    if (!uploadId || isNaN(chunkIndex) || isNaN(totalChunks) || !fileName) {
        res.status(400).json({ error: 'Missing chunk upload headers' });
        return;
    }

    if (!/^[a-f0-9-]+$/.test(uploadId)) {
        res.status(400).json({ error: 'Invalid upload ID' });
        return;
    }

    const chunkDir = path.join(CHUNKS_DIR, uploadId);
    if (!fs.existsSync(chunkDir)) fs.mkdirSync(chunkDir, { recursive: true });

    const chunks = [];
    req.on('data', function (chunk) { chunks.push(chunk); });
    await new Promise(function (resolve, reject) {
        req.on('end', resolve);
        req.on('error', reject);
    });

    const chunkPath = path.join(chunkDir, 'chunk_' + String(chunkIndex).padStart(5, '0'));
    fs.writeFileSync(chunkPath, Buffer.concat(chunks));

    res.json({ received: chunkIndex, of: totalChunks });
});

const finalizeUpload = asyncHandler(async function (req, res) {
    const { uploadId, fileName, mimeType } = req.body;

    if (!uploadId || !fileName || !mimeType) {
        res.status(400).json({ error: 'Missing finalize parameters' });
        return;
    }
    if (!/^[a-f0-9-]+$/.test(uploadId)) {
        res.status(400).json({ error: 'Invalid upload ID' });
        return;
    }

    const chunkDir = path.join(CHUNKS_DIR, uploadId);
    if (!fs.existsSync(chunkDir)) {
        res.status(400).json({ error: 'No chunks found for this upload' });
        return;
    }

    const chunkFiles = fs.readdirSync(chunkDir).sort();
    const buffers = chunkFiles.map(function (f) {
        return fs.readFileSync(path.join(chunkDir, f));
    });
    const fileBuffer = Buffer.concat(buffers);

    chunkFiles.forEach(function (f) {
        try { fs.unlinkSync(path.join(chunkDir, f)); } catch (e) {  }
    });
    try { fs.rmdirSync(chunkDir); } catch (e) {  }

    res.status(201);
    res.setHeader('Content-Type', 'application/json');
    const heartbeat = setInterval(function () {
        if (!res.writableEnded) res.write(' ');
    }, 15000);

    const file = { filename: fileName, mimeType: mimeType, buffer: fileBuffer };
    const results = [];
    const isPhoto = mimeType.startsWith('image/');
    const isVideo = mimeType.startsWith('video/');

    if (!isPhoto && !isVideo) {
        clearInterval(heartbeat);
        res.end(JSON.stringify([{ filename: fileName, error: 'Unsupported file type: ' + mimeType }]));
        return;
    }

    const originalName = fileName;
    const ext = path.extname(originalName);
    const nameWithoutExt = path.basename(originalName, ext);
    const title = nameWithoutExt.replace(/_/g, ' ');

    let metadata = {
        imageWidthPixels: null, imageHeightPixels: null, aspectRatio: null,
        horizontalDpi: null, verticalDpi: null, bitDepth: null, resolutionUnit: null,
        cameraMake: null, cameraModel: null, aperture: null, exposureTime: null,
        iso: null, exposureBias: null, focalLength: null, maxAperture: null,
        meteringMode: null, subjectDistance: null, flashMode: null, focalLength35mm: null,
        lensMake: null, lensModel: null, flashMake: null, flashModel: null,
        contrast: null, brightness: null, lightSource: null, exposureProgram: null,
        saturation: null, sharpness: null, whiteBalance: null, digitalZoom: null,
        exifVersion: null, gpsLatitude: null, gpsLongitude: null, gpsAltitude: null
    };
    let capturedAt = null;
    let locationFromExif = { city: '', state: '', country: '' };

    if (isPhoto) {
        const exifData = await extractPhotoMetadata(file.buffer);
        capturedAt = exifData.capturedAt || null;
        metadata.cameraMake = exifData.cameraMake || null;
        metadata.cameraModel = exifData.cameraModel || null;
        metadata.aperture = exifData.aperture || null;
        metadata.exposureTime = exifData.exposureTime || null;
        metadata.iso = exifData.iso || null;
        metadata.focalLength = exifData.focalLength || null;
        metadata.lensModel = exifData.lensModel || null;
        metadata.lensMake = exifData.lensMake || null;
        metadata.gpsLatitude = exifData.gpsLatitude || null;
        metadata.gpsLongitude = exifData.gpsLongitude || null;
        metadata.gpsAltitude = exifData.gpsAltitude ?? null;
        metadata.horizontalDpi = exifData.horizontalDpi || null;
        metadata.verticalDpi = exifData.verticalDpi || null;
        metadata.bitDepth = exifData.bitDepth || null;
        metadata.resolutionUnit = exifData.resolutionUnit || null;
        metadata.exposureBias = exifData.exposureBias ?? null;
        metadata.maxAperture = exifData.maxAperture || null;
        metadata.meteringMode = exifData.meteringMode || null;
        metadata.subjectDistance = exifData.subjectDistance || null;
        metadata.flashMode = exifData.flashMode || null;
        metadata.focalLength35mm = exifData.focalLength35mm || null;
        metadata.contrast = exifData.contrast || null;
        metadata.brightness = exifData.brightness ?? null;
        metadata.lightSource = exifData.lightSource || null;
        metadata.exposureProgram = exifData.exposureProgram || null;
        metadata.saturation = exifData.saturation || null;
        metadata.sharpness = exifData.sharpness || null;
        metadata.whiteBalance = exifData.whiteBalance || null;
        metadata.digitalZoom = exifData.digitalZoom ?? null;
        metadata.exifVersion = exifData.exifVersion || null;

        locationFromExif = {
            city: exifData.city || '',
            state: exifData.state || '',
            country: exifData.country || ''
        };
        if (!locationFromExif.city && !locationFromExif.state && !locationFromExif.country
            && metadata.gpsLatitude && metadata.gpsLongitude) {
            var geo = await reverseGeocode(metadata.gpsLatitude, metadata.gpsLongitude);
            locationFromExif.city = geo.city || '';
            locationFromExif.state = geo.state || '';
            locationFromExif.country = geo.country || '';
        }

        const sharpMeta = await sharp(file.buffer).metadata();
        metadata.imageWidthPixels = sharpMeta.width || null;
        metadata.imageHeightPixels = sharpMeta.height || null;
        if (sharpMeta.width && sharpMeta.height) {
            metadata.aspectRatio = Math.round((sharpMeta.width / sharpMeta.height) * 10000) / 10000;
        }
        if (!metadata.bitDepth && sharpMeta.depth) {
            var depthMap = { uchar: 8, ushort: 16, float: 32, double: 64, char: 8, short: 16, int: 32 };
            metadata.bitDepth = depthMap[sharpMeta.depth] || null;
        }

        const fileNames = buildMediaFileNames(title, capturedAt, 'photo');
        const fullResPath = path.join(PHOTOS_FULL_RES_DIR, fileNames.ogName);
        const displayPath = path.join(MEDIA_DISPLAY_DIR, fileNames.displayName);
        const thumbPath = path.join(THUMBNAILS_DIR, fileNames.thumbName);

        fs.writeFileSync(fullResPath, file.buffer);
        const displayBuffer = await createPhotoDisplayCopy(file.buffer);
        fs.writeFileSync(displayPath, displayBuffer);
        const thumbBuffer = await createPhotoThumbnail(file.buffer);
        fs.writeFileSync(thumbPath, thumbBuffer);

        const autoTags = [];
        const seasonTag = getSeasonTag(capturedAt);
        if (seasonTag) autoTags.push(seasonTag);
        const droneTag = getDroneTag(metadata.cameraMake);
        if (droneTag) autoTags.push(droneTag);

        const mediaDoc = await Media.create({
            slug: toSlug(nameWithoutExt),
            mediaType: 'photo', title: title, description: '', alt: '',
            fileName: originalName,
            fullResolutionLogolessPath: fileNames.ogName,
            displayResolutionPath: fileNames.displayName,
            thumbnailPath: fileNames.thumbName,
            creator: 'Scott Short', galleries: [], tags: autoTags,
            display: true, showInRecent: true,
            capturedAt: capturedAt ? new Date(capturedAt) : null,
            ingestedAt: new Date(),
            location: locationFromExif,
            metadata: metadata
        });

        const missingRequired = [];
        if (!mediaDoc.description) missingRequired.push('description');
        if (!mediaDoc.alt) missingRequired.push('alt');
        if (!mediaDoc.galleries || mediaDoc.galleries.length === 0) missingRequired.push('galleries');

        results.push({ document: mediaDoc.toObject(), autoTags: autoTags, missingRequired: missingRequired });

    } else if (isVideo) {
        const fileNames = buildMediaFileNames(title, capturedAt, 'video');
        const fullResPath = path.join(VIDEOS_FULL_RES_DIR, fileNames.ogName);
        const displayPath = path.join(MEDIA_DISPLAY_DIR, fileNames.displayName);
        const thumbPath = path.join(THUMBNAILS_DIR, fileNames.thumbName);

        fs.writeFileSync(fullResPath, file.buffer);

        const videoMeta = await extractVideoMetadata(fullResPath);
        metadata.imageWidthPixels = videoMeta.imageWidthPixels || null;
        metadata.imageHeightPixels = videoMeta.imageHeightPixels || null;
        metadata.aspectRatio = videoMeta.aspectRatio || null;
        capturedAt = videoMeta.capturedAt || null;

        try {
            await createVideoDisplayCopy(fullResPath, displayPath);
        } catch (videoError) {
            console.error('Video processing error:', videoError.message);
            fs.copyFileSync(fullResPath, displayPath);
        }

        try {
            await createVideoThumbnail(fullResPath, thumbPath);
        } catch (thumbError) {
            console.error('Video thumbnail error:', thumbError.message);
        }

        const autoTags = [];
        const seasonTag = getSeasonTag(capturedAt);
        if (seasonTag) autoTags.push(seasonTag);
        if (originalName.toLowerCase().includes('dji')) {
            autoTags.push('drone');
            metadata.cameraMake = 'DJI';
        }

        const mediaDoc = await Media.create({
            slug: toSlug(nameWithoutExt),
            mediaType: 'video', title: title, description: '', alt: '',
            fileName: originalName,
            fullResolutionLogolessPath: fileNames.ogName,
            displayResolutionPath: fileNames.displayName,
            thumbnailPath: fileNames.thumbName,
            creator: 'Scott Short', galleries: [], tags: autoTags,
            display: true, showInRecent: true,
            capturedAt: capturedAt ? new Date(capturedAt) : null,
            ingestedAt: new Date(),
            location: { city: '', state: '', country: '' },
            metadata: metadata
        });

        const missingRequired = [];
        if (!mediaDoc.description) missingRequired.push('description');
        if (!mediaDoc.alt) missingRequired.push('alt');
        if (!mediaDoc.galleries || mediaDoc.galleries.length === 0) missingRequired.push('galleries');

        results.push({ document: mediaDoc.toObject(), autoTags: autoTags, missingRequired: missingRequired });
    }

    clearInterval(heartbeat);
    res.end(JSON.stringify(results));
});

const replaceFullRes = asyncHandler(async function (req, res) {
    const id = req.params.id;
    const existing = await Media.findById(id).lean();
    if (!existing) {
        return res.status(404).json({ error: 'Media not found' });
    }

    const uploaded = await parseMultipart(req);
    const file = uploaded.files[0];
    if (!file) {
        return res.status(400).json({ error: 'No file uploaded. Submit a file under field name "media".' });
    }

    const isPhotoFile = file.mimeType.startsWith('image/');
    const isVideoFile = file.mimeType.startsWith('video/');
    if (!isPhotoFile && !isVideoFile) {
        return res.status(400).json({ error: 'Unsupported file type: ' + file.mimeType });
    }

    const expectVideo = existing.mediaType === 'video';
    if (expectVideo && !isVideoFile) {
        return res.status(400).json({ error: 'Existing media is a video; the replacement must also be a video.' });
    }
    if (!expectVideo && !isPhotoFile) {
        return res.status(400).json({ error: 'Existing media is a photo; the replacement must also be a photo.' });
    }

    const isVideo = expectVideo;
    const fullResDir = isVideo ? VIDEOS_FULL_RES_DIR : PHOTOS_FULL_RES_DIR;

    const oldFullResAbs = resolveMediaPath(existing.fullResolutionLogolessPath, fullResDir);
    const oldDisplayAbs = resolveMediaPath(existing.displayResolutionPath, MEDIA_DISPLAY_DIR);
    const oldThumbAbs = resolveMediaPath(existing.thumbnailPath, THUMBNAILS_DIR);

    const fileNames = buildMediaFileNames(existing.title, existing.capturedAt, existing.mediaType);
    const newFullResAbs = path.join(fullResDir, fileNames.ogName);
    const newDisplayAbs = path.join(MEDIA_DISPLAY_DIR, fileNames.displayName);
    const newThumbAbs = path.join(THUMBNAILS_DIR, fileNames.thumbName);

    if (oldFullResAbs && oldFullResAbs !== newFullResAbs) {
        try { fs.unlinkSync(oldFullResAbs); } catch (e) {  }
    }
    if (oldDisplayAbs && oldDisplayAbs !== newDisplayAbs) {
        try { fs.unlinkSync(oldDisplayAbs); } catch (e) {  }
    }
    if (oldThumbAbs && oldThumbAbs !== newThumbAbs) {
        try { fs.unlinkSync(oldThumbAbs); } catch (e) {  }
    }

    fs.writeFileSync(newFullResAbs, file.buffer);

    const update = {
        fullResolutionLogolessPath: fileNames.ogName,
        displayResolutionPath: fileNames.displayName,
        thumbnailPath: fileNames.thumbName,
        fileName: fileNames.ogName
    };

    if (isVideo) {
        try {
            await createVideoDisplayCopy(newFullResAbs, newDisplayAbs);
        } catch (videoError) {
            console.error('Video replace display copy error:', videoError.message);
            try { fs.copyFileSync(newFullResAbs, newDisplayAbs); } catch (e) {  }
        }
        try {
            await createVideoThumbnail(newFullResAbs, newThumbAbs);
        } catch (thumbError) {
            console.error('Video replace thumbnail error:', thumbError.message);
        }

        const videoMeta = await extractVideoMetadata(newFullResAbs);
        if (videoMeta.imageWidthPixels) update['metadata.imageWidthPixels'] = videoMeta.imageWidthPixels;
        if (videoMeta.imageHeightPixels) update['metadata.imageHeightPixels'] = videoMeta.imageHeightPixels;
        if (videoMeta.aspectRatio) update['metadata.aspectRatio'] = videoMeta.aspectRatio;
    } else {
        const displayBuffer = await createPhotoDisplayCopy(file.buffer);
        fs.writeFileSync(newDisplayAbs, displayBuffer);
        const thumbBuffer = await createPhotoThumbnail(file.buffer);
        fs.writeFileSync(newThumbAbs, thumbBuffer);

        const sharpMeta = await sharp(file.buffer).metadata();
        if (sharpMeta.width) update['metadata.imageWidthPixels'] = sharpMeta.width;
        if (sharpMeta.height) update['metadata.imageHeightPixels'] = sharpMeta.height;
        if (sharpMeta.width && sharpMeta.height) {
            update['metadata.aspectRatio'] = Math.round((sharpMeta.width / sharpMeta.height) * 10000) / 10000;
        }
    }

    const result = await Media.findByIdAndUpdate(id, update, { returnDocument: 'after' }).lean();
    res.json(result);
});

module.exports = { getAllMedia, getMediaTags, uploadMedia, uploadChunk, finalizeUpload, updateMedia, deleteMedia, replaceFullRes };
