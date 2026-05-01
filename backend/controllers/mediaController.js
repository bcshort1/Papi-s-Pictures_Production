//Wraps async route handlers so thrown errors propagate to my error middleware.
const asyncHandler = require('express-async-handler');
//Node filesystem module for read/write/unlink operations.
const fs = require('fs');
//Node path module for safe filesystem path joins.
const path = require('path');
//sharp — image resize/encode pipeline used for display copies and thumbnails.
const sharp = require('sharp');
//crypto — currently used for chunk-id sanity (kept for future hashing needs).
const crypto = require('crypto');
//Media model.
const Media = require('../models/Media');
//Filename and path helpers shared with the upload pipeline.
const { toSlug, toFileNameBase, buildMediaFileNames, renameFileIfExists, resolveMediaPath, getSeasonTag, getDroneTag } = require('../utils/helpers');
//Media service — directory constants plus the heavy I/O and metadata helpers.
const {
    //Originals (full-resolution) directory for photos.
    PHOTOS_FULL_RES_DIR,
    //Originals directory for videos.
    VIDEOS_FULL_RES_DIR,
    //Watermarked, web-sized display copies for both photos and videos.
    MEDIA_DISPLAY_DIR,
    //Small thumbnails for the admin panel grid.
    THUMBNAILS_DIR,
    //Scratch directory for chunked uploads in progress.
    CHUNKS_DIR,
    //Multipart parser used by the standard upload endpoint.
    parseMultipart,
    //EXIF/IPTC/XMP extractor for photos.
    extractPhotoMetadata,
    //ffprobe-based extractor for video dimensions and capture date.
    extractVideoMetadata,
    //Watermarked, resized photo encoder.
    createPhotoDisplayCopy,
    //Photo thumbnail encoder.
    createPhotoThumbnail,
    //Video thumbnail extractor (first-frame).
    createVideoThumbnail,
    //Watermarked, resized video transcode.
    createVideoDisplayCopy,
    //Reverse geocoder used when GPS coords are present but the IPTC location strings are not.
    reverseGeocode
} = require('../services/mediaService');

//GET /api/media — Retrieve all media items for the admin panel, sorted by homepageSortOrder.
const getAllMedia = asyncHandler(async function (req, res) {
    //Plain objects — the admin UI doesn't need full Mongoose documents.
    const items = await Media.find({}).sort({ homepageSortOrder: 1 }).lean();
    res.json(items);
});

//GET /api/media/tags — Retrieve all distinct tags currently in use across the media collection.
const getMediaTags = asyncHandler(async function (req, res) {
    //distinct() walks every document and dedupes the tags field.
    const tags = await Media.distinct('tags');
    //Sort alphabetically before returning so the admin tag picker is stable.
    res.json(tags.sort());
});

//POST /api/media/upload — Upload one or more media files. Extracts metadata, stores originals,
//creates watermarked display copies, and inserts database records.
const uploadMedia = asyncHandler(async function (req, res) {
    //Parse the multipart body into an array of in-memory file descriptors.
    const uploaded = await parseMultipart(req);
    //Per-file result objects (DB doc + auto-tags + missing required fields).
    const results = [];

    //Send response headers early and start a heartbeat to keep the connection alive
    //through Cloudflare Tunnel's proxy timeout (~100s) during long processing.
    res.status(201);
    res.setHeader('Content-Type', 'application/json');
    //Write a single space every 15s; harmless because the body is JSON parsed only at the end.
    const heartbeat = setInterval(function () {
        if (!res.writableEnded) res.write(' ');
    }, 15000);

    for (const file of uploaded.files) {
        //Branch on declared MIME type.
        const isPhoto = file.mimeType.startsWith('image/');
        const isVideo = file.mimeType.startsWith('video/');
        if (!isPhoto && !isVideo) {
            //Record an error for unsupported types and move on.
            results.push({ filename: file.filename, error: 'Unsupported file type: ' + file.mimeType });
            continue;
        }

        //Derive title from original filename by stripping extension.
        const originalName = file.filename;
        //File extension including the leading dot.
        const ext = path.extname(originalName);
        //Bare basename minus extension.
        const nameWithoutExt = path.basename(originalName, ext);
        //Replace underscores with spaces for a human-readable title.
        const title = nameWithoutExt.replace(/_/g, ' ');

        //Determine the next homepageSortOrder value.
        const maxSortDoc = await Media.find({}).sort({ homepageSortOrder: -1 }).limit(1).lean();
        //Fall back to 0 when the collection is empty so the first item gets 1.
        const nextSortOrder = (maxSortDoc.length > 0 && maxSortDoc[0].homepageSortOrder ? maxSortDoc[0].homepageSortOrder : 0) + 1;

        //Pre-populate the metadata bag with nulls so every field round-trips through the DB.
        let metadata = {
            //Pixel dimensions and derived ratio.
            imageWidthPixels: null,
            imageHeightPixels: null,
            aspectRatio: null,
            //Resolution / encoding details.
            horizontalDpi: null,
            verticalDpi: null,
            bitDepth: null,
            resolutionUnit: null,
            //Camera identification.
            cameraMake: null,
            cameraModel: null,
            //Exposure triangle.
            aperture: null,
            exposureTime: null,
            iso: null,
            //Extended exposure.
            exposureBias: null,
            focalLength: null,
            maxAperture: null,
            meteringMode: null,
            subjectDistance: null,
            flashMode: null,
            focalLength35mm: null,
            //Lens / flash hardware.
            lensMake: null,
            lensModel: null,
            flashMake: null,
            flashModel: null,
            //Tone/color metadata.
            contrast: null,
            brightness: null,
            lightSource: null,
            exposureProgram: null,
            saturation: null,
            sharpness: null,
            whiteBalance: null,
            digitalZoom: null,
            //EXIF spec version string.
            exifVersion: null,
            //GPS triple.
            gpsLatitude: null,
            gpsLongitude: null,
            gpsAltitude: null
        };
        //Capture timestamp — populated from EXIF below for photos, ffprobe for videos.
        let capturedAt = null;
        //Location triple — populated from EXIF/IPTC or reverse geocoded from GPS.
        let locationFromExif = { city: '', state: '', country: '' };

        if (isPhoto) {
            //Extract EXIF metadata from the photo.
            const exifData = await extractPhotoMetadata(file.buffer);
            //Capture timestamp — may be null when the camera didn't record one.
            capturedAt = exifData.capturedAt || null;
            //Camera identification.
            metadata.cameraMake = exifData.cameraMake || null;
            metadata.cameraModel = exifData.cameraModel || null;
            //Exposure triangle.
            metadata.aperture = exifData.aperture || null;
            metadata.exposureTime = exifData.exposureTime || null;
            metadata.iso = exifData.iso || null;
            //Optical settings.
            metadata.focalLength = exifData.focalLength || null;
            metadata.lensModel = exifData.lensModel || null;
            metadata.lensMake = exifData.lensMake || null;
            //GPS — ?? preserves a literal 0 altitude.
            metadata.gpsLatitude = exifData.gpsLatitude || null;
            metadata.gpsLongitude = exifData.gpsLongitude || null;
            metadata.gpsAltitude = exifData.gpsAltitude ?? null;
            //Resolution metadata.
            metadata.horizontalDpi = exifData.horizontalDpi || null;
            metadata.verticalDpi = exifData.verticalDpi || null;
            metadata.bitDepth = exifData.bitDepth || null;
            metadata.resolutionUnit = exifData.resolutionUnit || null;
            //Extended exposure metadata.
            metadata.exposureBias = exifData.exposureBias ?? null;
            metadata.maxAperture = exifData.maxAperture || null;
            metadata.meteringMode = exifData.meteringMode || null;
            metadata.subjectDistance = exifData.subjectDistance || null;
            metadata.flashMode = exifData.flashMode || null;
            metadata.focalLength35mm = exifData.focalLength35mm || null;
            //Tone/color metadata.
            metadata.contrast = exifData.contrast || null;
            metadata.brightness = exifData.brightness ?? null;
            metadata.lightSource = exifData.lightSource || null;
            metadata.exposureProgram = exifData.exposureProgram || null;
            metadata.saturation = exifData.saturation || null;
            metadata.sharpness = exifData.sharpness || null;
            metadata.whiteBalance = exifData.whiteBalance || null;
            metadata.digitalZoom = exifData.digitalZoom ?? null;
            //EXIF version string.
            metadata.exifVersion = exifData.exifVersion || null;
            //flashMake and flashModel are not auto-extracted — admin-editable only.

            //Populate location from IPTC/XMP if available, fall back to reverse geocoding from GPS.
            locationFromExif = {
                city: exifData.city || '',
                state: exifData.state || '',
                country: exifData.country || ''
            };
            //Reverse geocode only when IPTC was empty AND we actually have coords to look up.
            if (!locationFromExif.city && !locationFromExif.state && !locationFromExif.country
                && metadata.gpsLatitude && metadata.gpsLongitude) {
                //Network call — may return empty strings when the geocoder fails.
                var geo = await reverseGeocode(metadata.gpsLatitude, metadata.gpsLongitude);
                locationFromExif.city = geo.city || '';
                locationFromExif.state = geo.state || '';
                locationFromExif.country = geo.country || '';
            }

            //Get image dimensions from sharp.
            const sharpMeta = await sharp(file.buffer).metadata();
            //Pixel dimensions.
            metadata.imageWidthPixels = sharpMeta.width || null;
            metadata.imageHeightPixels = sharpMeta.height || null;
            if (sharpMeta.width && sharpMeta.height) {
                //Aspect ratio rounded to four decimals for stable comparisons.
                metadata.aspectRatio = Math.round((sharpMeta.width / sharpMeta.height) * 10000) / 10000;
            }
            //Bit depth from sharp if not found in EXIF (common for PNG files).
            if (!metadata.bitDepth && sharpMeta.depth) {
                //Map sharp's depth strings to numeric bit counts.
                var depthMap = { uchar: 8, ushort: 16, float: 32, double: 64, char: 8, short: 16, int: 32 };
                metadata.bitDepth = depthMap[sharpMeta.depth] || null;
            }

            //Build file names from title and capture timestamp.
            const fileNames = buildMediaFileNames(title, capturedAt, 'photo');
            //Absolute paths for each output.
            const fullResPath = path.join(PHOTOS_FULL_RES_DIR, fileNames.ogName);
            const displayPath = path.join(MEDIA_DISPLAY_DIR, fileNames.displayName);
            const thumbPath = path.join(THUMBNAILS_DIR, fileNames.thumbName);

            //Save the original full-resolution file.
            fs.writeFileSync(fullResPath, file.buffer);

            //Create watermarked, resized display copy.
            const displayBuffer = await createPhotoDisplayCopy(file.buffer);
            //Persist to disk.
            fs.writeFileSync(displayPath, displayBuffer);

            //Create thumbnail for admin panel cards.
            const thumbBuffer = await createPhotoThumbnail(file.buffer);
            //Persist to disk.
            fs.writeFileSync(thumbPath, thumbBuffer);

            //Generate auto-tags.
            const autoTags = [];
            //Season tag from capture timestamp.
            const seasonTag = getSeasonTag(capturedAt);
            if (seasonTag) autoTags.push(seasonTag);
            //Drone tag inferred from camera make.
            const droneTag = getDroneTag(metadata.cameraMake);
            if (droneTag) autoTags.push(droneTag);

            //Build and save the database document. Store basenames (not absolute
            //paths) so the DB is portable and store the derived title so subsequent
            //edits have a real reference for filename fallback logic.
            const mediaDoc = await Media.create({
                slug: toSlug(nameWithoutExt),
                mediaType: 'photo',
                title: title,
                description: '',
                alt: '',
                fileName: originalName,
                //Just basenames — the resolver reattaches the directory at read time.
                fullResolutionLogolessPath: fileNames.ogName,
                displayResolutionPath: fileNames.displayName,
                thumbnailPath: fileNames.thumbName,
                creator: 'Scott Short',
                galleries: [],
                tags: autoTags,
                //Visibility flags default to true so the photo shows up immediately.
                display: true,
                showOnHomepage: true,
                homepageSortOrder: nextSortOrder,
                showInRecent: true,
                featured: false,
                capturedAt: capturedAt ? new Date(capturedAt) : null,
                //Server-side ingest timestamp.
                ingestedAt: new Date(),
                location: locationFromExif,
                metadata: metadata
            });

            //Determine which required fields are still missing.
            const missingRequired = [];
            if (!mediaDoc.description) missingRequired.push('description');
            if (!mediaDoc.alt) missingRequired.push('alt');
            if (!mediaDoc.galleries || mediaDoc.galleries.length === 0) missingRequired.push('galleries');

            //Hand the result back to the per-file results array.
            results.push({ document: mediaDoc.toObject(), autoTags: autoTags, missingRequired: missingRequired });

        } else if (isVideo) {
            //Build file names from title and capture timestamp for video.
            const fileNames = buildMediaFileNames(title, capturedAt, 'video');
            //Absolute paths for each output.
            const fullResPath = path.join(VIDEOS_FULL_RES_DIR, fileNames.ogName);
            const displayPath = path.join(MEDIA_DISPLAY_DIR, fileNames.displayName);
            const thumbPath = path.join(THUMBNAILS_DIR, fileNames.thumbName);

            //Save the original full-resolution video file.
            fs.writeFileSync(fullResPath, file.buffer);

            //Extract video metadata from the saved file using ffprobe.
            const videoMeta = await extractVideoMetadata(fullResPath);
            //Pixel dimensions and aspect ratio.
            metadata.imageWidthPixels = videoMeta.imageWidthPixels || null;
            metadata.imageHeightPixels = videoMeta.imageHeightPixels || null;
            metadata.aspectRatio = videoMeta.aspectRatio || null;
            //Capture timestamp from container metadata.
            capturedAt = videoMeta.capturedAt || null;

            //Create watermarked, resized display copy of the video.
            try {
                await createVideoDisplayCopy(fullResPath, displayPath);
            } catch (videoError) {
                //Log and continue — we still want a record even if transcoding fails.
                console.error('Video processing error:', videoError.message);
                //If video processing fails, copy the original as the display copy.
                fs.copyFileSync(fullResPath, displayPath);
            }

            //Create a thumbnail image from the first frame of the video.
            try {
                await createVideoThumbnail(fullResPath, thumbPath);
            } catch (thumbError) {
                //Log and continue — missing thumbnail is recoverable.
                console.error('Video thumbnail error:', thumbError.message);
            }

            //Generate auto-tags. For videos, use 'drone' for DJI filenames since video EXIF is limited.
            const autoTags = [];
            //Season tag from capture timestamp.
            const seasonTag = getSeasonTag(capturedAt);
            if (seasonTag) autoTags.push(seasonTag);
            //DJI filename heuristic for drone footage.
            if (originalName.toLowerCase().includes('dji')) {
                autoTags.push('drone');
                //Stamp camera make so downstream consumers see it.
                metadata.cameraMake = 'DJI';
            }

            //Build and save the database document. Store basenames (not absolute
            //paths) so the DB is portable and store the derived title so subsequent
            //edits have a real reference for filename fallback logic.
            const mediaDoc = await Media.create({
                slug: toSlug(nameWithoutExt),
                mediaType: 'video',
                title: title,
                description: '',
                alt: '',
                fileName: originalName,
                //Just basenames — the resolver reattaches the directory at read time.
                fullResolutionLogolessPath: fileNames.ogName,
                displayResolutionPath: fileNames.displayName,
                thumbnailPath: fileNames.thumbName,
                creator: 'Scott Short',
                galleries: [],
                tags: autoTags,
                //Visibility flags default to true.
                display: true,
                showOnHomepage: true,
                homepageSortOrder: nextSortOrder,
                showInRecent: true,
                featured: false,
                capturedAt: capturedAt ? new Date(capturedAt) : null,
                //Server-side ingest timestamp.
                ingestedAt: new Date(),
                //Videos don't carry IPTC location — admin fills these in.
                location: { city: '', state: '', country: '' },
                metadata: metadata
            });

            //Determine which required fields are still missing.
            const missingRequired = [];
            if (!mediaDoc.description) missingRequired.push('description');
            if (!mediaDoc.alt) missingRequired.push('alt');
            if (!mediaDoc.galleries || mediaDoc.galleries.length === 0) missingRequired.push('galleries');

            //Hand the result back to the per-file results array.
            results.push({ document: mediaDoc.toObject(), autoTags: autoTags, missingRequired: missingRequired });
        }
    }

    //Stop the heartbeat and emit the JSON body.
    clearInterval(heartbeat);
    res.end(JSON.stringify(results));
});

//PUT /api/media/:id — Update a media item (used for filling in missing fields after upload or editing).
const updateMedia = asyncHandler(async function (req, res) {
    //Pull route param and request body.
    const id = req.params.id;
    const body = req.body;
    //Build the $set payload only with fields the client actually sent.
    const update = {};

    //Title implies a slug refresh.
    if (body.title !== undefined) {
        update.title = String(body.title);
        //Regenerate the slug from the new title.
        update.slug = toSlug(body.title);
    }
    //Each block guards against unintended overwrites by checking for explicit presence.
    if (body.description !== undefined) update.description = String(body.description);
    if (body.alt !== undefined) update.alt = String(body.alt);
    if (body.creator !== undefined) update.creator = String(body.creator);
    if (body.capturedAt !== undefined) {
        //Allow clearing the date by sending an empty value.
        update.capturedAt = body.capturedAt ? new Date(body.capturedAt) : null;
    }
    if (body.tags !== undefined) update.tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
    if (body.galleries !== undefined) update.galleries = Array.isArray(body.galleries) ? body.galleries : [];
    if (body.display !== undefined) update.display = Boolean(body.display);
    if (body.showOnHomepage !== undefined) update.showOnHomepage = Boolean(body.showOnHomepage);
    if (body.showInRecent !== undefined) update.showInRecent = Boolean(body.showInRecent);
    if (body.featured !== undefined) update.featured = Boolean(body.featured);
    if (body.homepageSortOrder !== undefined) update.homepageSortOrder = Number(body.homepageSortOrder);
    if (body.location !== undefined) {
        //Replace the whole location triple to avoid stale half-updates.
        update.location = {
            city: String(body.location.city || ''),
            state: String(body.location.state || ''),
            country: String(body.location.country || '')
        };
    }
    if (body.metadata !== undefined) {
        //Only the admin-editable flash fields are accepted; everything else is auto-extracted.
        const m = body.metadata;
        if (m.flashMake !== undefined) update['metadata.flashMake'] = m.flashMake ? String(m.flashMake) : null;
        if (m.flashModel !== undefined) update['metadata.flashModel'] = m.flashModel ? String(m.flashModel) : null;
    }

    //If title or capturedAt changed, rename the files on disk to match the new naming convention.
    const existing = await Media.findById(id).lean();
    if (existing) {
        //Resolve the post-update title and date for filename generation.
        const newTitle = update.title !== undefined ? update.title : existing.title;
        const newCapturedAt = update.capturedAt !== undefined ? update.capturedAt : existing.capturedAt;
        //Detect whether either component of the filename actually changed.
        const titleChanged = update.title !== undefined && update.title !== existing.title;
        const dateChanged = update.capturedAt !== undefined && String(update.capturedAt) !== String(existing.capturedAt);

        if (titleChanged || dateChanged) {
            //Compute the new on-disk basenames.
            const newNames = buildMediaFileNames(newTitle, newCapturedAt, existing.mediaType);
            //Pick the originals directory based on media type.
            const isVideo = existing.mediaType === 'video';
            const fullResDir = isVideo ? VIDEOS_FULL_RES_DIR : PHOTOS_FULL_RES_DIR;

            //Resolve current absolute paths from the stored DB values. The resolver
            //handles both new basename format and legacy absolute paths so existing
            //records keep working until they're re-saved.
            const curFullResAbs = resolveMediaPath(existing.fullResolutionLogolessPath, fullResDir);
            const curDisplayAbs = resolveMediaPath(existing.displayResolutionPath, MEDIA_DISPLAY_DIR);
            const curThumbAbs = resolveMediaPath(existing.thumbnailPath, THUMBNAILS_DIR);

            //Compute the new absolute targets.
            const newFullResAbs = path.join(fullResDir, newNames.ogName);
            const newDisplayAbs = path.join(MEDIA_DISPLAY_DIR, newNames.displayName);
            const newThumbAbs = path.join(THUMBNAILS_DIR, newNames.thumbName);

            //Only update the DB value when the rename actually succeeded. If the
            //source file is missing, renameFileIfExists returns null and we leave
            //the existing DB value alone — never write a path to a file that
            //doesn't exist (the root cause of phantom-path image breakage).
            const fullResResult = renameFileIfExists(curFullResAbs, newFullResAbs);
            if (fullResResult) update.fullResolutionLogolessPath = path.basename(fullResResult);

            //Same pattern for the display copy.
            const displayResult = renameFileIfExists(curDisplayAbs, newDisplayAbs);
            if (displayResult) update.displayResolutionPath = path.basename(displayResult);

            //Same pattern for the thumbnail.
            const thumbResult = renameFileIfExists(curThumbAbs, newThumbAbs);
            if (thumbResult) update.thumbnailPath = path.basename(thumbResult);

            //Always refresh the displayed original filename to match the new convention.
            update.fileName = newNames.ogName;
        }
    }

    //Run the update and return the post-update document.
    const result = await Media.findByIdAndUpdate(id, update, { returnDocument: 'after' }).lean();
    if (!result) {
        //404 when the id didn't match any document.
        res.status(404).json({ error: 'Media not found' });
        return;
    }
    res.json(result);
});

//DELETE /api/media/:id — Delete a media item and remove its files from disk.
const deleteMedia = asyncHandler(async function (req, res) {
    //Look up the doc so I can resolve its on-disk paths before deleting.
    const existing = await Media.findById(req.params.id).lean();
    if (!existing) {
        //404 when the id didn't match any document.
        res.status(404).json({ error: 'Media not found' });
        return;
    }

    //Resolve stored values to absolute paths (handles both new basename format
    //and legacy absolute paths) and remove each file if it exists.
    const isVideo = existing.mediaType === 'video';
    //Pick the originals directory based on media type.
    const fullResDir = isVideo ? VIDEOS_FULL_RES_DIR : PHOTOS_FULL_RES_DIR;
    //Absolute paths for each artifact.
    const fullResAbs = resolveMediaPath(existing.fullResolutionLogolessPath, fullResDir);
    const displayAbs = resolveMediaPath(existing.displayResolutionPath, MEDIA_DISPLAY_DIR);
    const thumbAbs = resolveMediaPath(existing.thumbnailPath, THUMBNAILS_DIR);

    //Best-effort unlinks — swallow ENOENT so DB cleanup still proceeds.
    if (fullResAbs) {
        try { fs.unlinkSync(fullResAbs); } catch (e) { /* file may not exist */ }
    }
    if (displayAbs) {
        try { fs.unlinkSync(displayAbs); } catch (e) { /* file may not exist */ }
    }
    if (thumbAbs) {
        try { fs.unlinkSync(thumbAbs); } catch (e) { /* file may not exist */ }
    }

    //Finally drop the DB record.
    await Media.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

//PUT /api/media/reorder — Bulk reorder media items. Accepts { ids: ["id1", "id2", ...] }
//and assigns homepageSortOrder based on array position.
const reorderMedia = asyncHandler(async function (req, res) {
    //Pull the array of ids in their new order.
    const ids = req.body.ids;
    //Reject empty or malformed payloads up front.
    if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: 'ids array is required' });
        return;
    }
    //Build one updateOne per id; sortOrder = index + 1 so positions are 1-based.
    const bulkOperations = ids.map(function (id, index) {
        return {
            updateOne: {
                filter: { _id: id },
                update: { $set: { homepageSortOrder: index + 1, updatedAt: new Date() } }
            }
        };
    });
    //Single round-trip to apply all reorder operations.
    await Media.bulkWrite(bulkOperations);
    //Return the freshly sorted list so the admin UI can re-render.
    const items = await Media.find({}).sort({ homepageSortOrder: 1 }).lean();
    res.json(items);
});

//POST /api/media/upload-chunk — Receive a single chunk of a large file upload.
//Headers: x-upload-id, x-chunk-index, x-total-chunks, x-file-name, x-mime-type
const uploadChunk = asyncHandler(async function (req, res) {
    //Pull the chunk-tracking headers off the request.
    const uploadId = req.headers['x-upload-id'];
    const chunkIndex = parseInt(req.headers['x-chunk-index'], 10);
    const totalChunks = parseInt(req.headers['x-total-chunks'], 10);
    const fileName = req.headers['x-file-name'];

    //Reject the request if any required header is missing or non-numeric.
    if (!uploadId || isNaN(chunkIndex) || isNaN(totalChunks) || !fileName) {
        res.status(400).json({ error: 'Missing chunk upload headers' });
        return;
    }

    //Sanitize uploadId to prevent directory traversal.
    if (!/^[a-f0-9-]+$/.test(uploadId)) {
        //Reject anything that isn't a UUID-shaped string.
        res.status(400).json({ error: 'Invalid upload ID' });
        return;
    }

    //Per-upload scratch directory.
    const chunkDir = path.join(CHUNKS_DIR, uploadId);
    //Lazy-create on the first chunk.
    if (!fs.existsSync(chunkDir)) fs.mkdirSync(chunkDir, { recursive: true });

    //Collect the raw body into a buffer and write to disk.
    const chunks = [];
    //Append every incoming buffer to the array.
    req.on('data', function (chunk) { chunks.push(chunk); });
    //Promisify the end/error events so I can await them cleanly.
    await new Promise(function (resolve, reject) {
        req.on('end', resolve);
        req.on('error', reject);
    });

    //Zero-padded chunk filename so a directory listing sorts in upload order.
    const chunkPath = path.join(chunkDir, 'chunk_' + String(chunkIndex).padStart(5, '0'));
    //Persist this chunk to disk.
    fs.writeFileSync(chunkPath, Buffer.concat(chunks));

    //Acknowledge with the index/total so the client can update its progress.
    res.json({ received: chunkIndex, of: totalChunks });
});

//POST /api/media/upload-finalize — Reassemble chunks and process the file (same as regular upload).
//Body JSON: { uploadId, fileName, mimeType }
const finalizeUpload = asyncHandler(async function (req, res) {
    //Pull the three coordinates the client sends to identify the upload.
    const { uploadId, fileName, mimeType } = req.body;

    //Reject the request if any required field is missing.
    if (!uploadId || !fileName || !mimeType) {
        res.status(400).json({ error: 'Missing finalize parameters' });
        return;
    }
    //Sanitize uploadId to prevent directory traversal.
    if (!/^[a-f0-9-]+$/.test(uploadId)) {
        res.status(400).json({ error: 'Invalid upload ID' });
        return;
    }

    //Per-upload scratch directory created during the chunk phase.
    const chunkDir = path.join(CHUNKS_DIR, uploadId);
    //Bail out if no chunks were ever received.
    if (!fs.existsSync(chunkDir)) {
        res.status(400).json({ error: 'No chunks found for this upload' });
        return;
    }

    //Reassemble chunks in order.
    const chunkFiles = fs.readdirSync(chunkDir).sort();
    //Read each chunk into a Buffer.
    const buffers = chunkFiles.map(function (f) {
        return fs.readFileSync(path.join(chunkDir, f));
    });
    //Single contiguous buffer for the rest of the pipeline.
    const fileBuffer = Buffer.concat(buffers);

    //Clean up chunk files.
    chunkFiles.forEach(function (f) {
        //Best-effort unlink; ignore failures.
        try { fs.unlinkSync(path.join(chunkDir, f)); } catch (e) { /* ignore */ }
    });
    //And drop the now-empty scratch dir.
    try { fs.rmdirSync(chunkDir); } catch (e) { /* ignore */ }

    //Start heartbeat to keep Cloudflare Tunnel alive during processing.
    res.status(201);
    res.setHeader('Content-Type', 'application/json');
    //Write a single space every 15s; harmless because the body is JSON parsed only at the end.
    const heartbeat = setInterval(function () {
        if (!res.writableEnded) res.write(' ');
    }, 15000);

    //Process the reassembled file using the same logic as the regular upload handler.
    const file = { filename: fileName, mimeType: mimeType, buffer: fileBuffer };
    //Single-element results array to mirror the multi-file handler's response shape.
    const results = [];
    //Branch on declared MIME type.
    const isPhoto = mimeType.startsWith('image/');
    const isVideo = mimeType.startsWith('video/');

    //Bail out for unsupported types after stopping the heartbeat.
    if (!isPhoto && !isVideo) {
        clearInterval(heartbeat);
        res.end(JSON.stringify([{ filename: fileName, error: 'Unsupported file type: ' + mimeType }]));
        return;
    }

    //Derive the same naming inputs as the regular upload path.
    const originalName = fileName;
    //File extension including the leading dot.
    const ext = path.extname(originalName);
    //Bare basename minus extension.
    const nameWithoutExt = path.basename(originalName, ext);
    //Replace underscores with spaces for a human-readable title.
    const title = nameWithoutExt.replace(/_/g, ' ');

    //Determine the next homepageSortOrder value.
    const maxSortDoc = await Media.find({}).sort({ homepageSortOrder: -1 }).limit(1).lean();
    //Fall back to 0 when the collection is empty so the first item gets 1.
    const nextSortOrder = (maxSortDoc.length > 0 && maxSortDoc[0].homepageSortOrder ? maxSortDoc[0].homepageSortOrder : 0) + 1;

    //Pre-populate the metadata bag with nulls so every field round-trips through the DB.
    //Pre-populate the metadata bag with nulls so every field round-trips through the DB.
    let metadata = {
        //Dimensions and resolution.
        imageWidthPixels: null, imageHeightPixels: null, aspectRatio: null,
        horizontalDpi: null, verticalDpi: null, bitDepth: null, resolutionUnit: null,
        //Camera + exposure triangle.
        cameraMake: null, cameraModel: null, aperture: null, exposureTime: null,
        //Extended exposure metadata.
        iso: null, exposureBias: null, focalLength: null, maxAperture: null,
        meteringMode: null, subjectDistance: null, flashMode: null, focalLength35mm: null,
        //Lens + flash hardware.
        lensMake: null, lensModel: null, flashMake: null, flashModel: null,
        //Tone/color metadata.
        contrast: null, brightness: null, lightSource: null, exposureProgram: null,
        saturation: null, sharpness: null, whiteBalance: null, digitalZoom: null,
        //EXIF version + GPS triple.
        exifVersion: null, gpsLatitude: null, gpsLongitude: null, gpsAltitude: null
    };
    //Capture timestamp — populated below.
    let capturedAt = null;
    //Location triple — populated from EXIF or reverse geocoded from GPS.
    let locationFromExif = { city: '', state: '', country: '' };

    if (isPhoto) {
        //Extract EXIF metadata from the photo.
        const exifData = await extractPhotoMetadata(file.buffer);
        //Capture timestamp.
        capturedAt = exifData.capturedAt || null;
        //Camera identification.
        metadata.cameraMake = exifData.cameraMake || null;
        metadata.cameraModel = exifData.cameraModel || null;
        //Exposure triangle.
        metadata.aperture = exifData.aperture || null;
        metadata.exposureTime = exifData.exposureTime || null;
        metadata.iso = exifData.iso || null;
        //Optical settings.
        metadata.focalLength = exifData.focalLength || null;
        metadata.lensModel = exifData.lensModel || null;
        metadata.lensMake = exifData.lensMake || null;
        //GPS — ?? preserves a literal 0 altitude.
        metadata.gpsLatitude = exifData.gpsLatitude || null;
        metadata.gpsLongitude = exifData.gpsLongitude || null;
        metadata.gpsAltitude = exifData.gpsAltitude ?? null;
        //Resolution metadata.
        metadata.horizontalDpi = exifData.horizontalDpi || null;
        metadata.verticalDpi = exifData.verticalDpi || null;
        metadata.bitDepth = exifData.bitDepth || null;
        metadata.resolutionUnit = exifData.resolutionUnit || null;
        //Extended exposure metadata.
        metadata.exposureBias = exifData.exposureBias ?? null;
        metadata.maxAperture = exifData.maxAperture || null;
        metadata.meteringMode = exifData.meteringMode || null;
        metadata.subjectDistance = exifData.subjectDistance || null;
        metadata.flashMode = exifData.flashMode || null;
        metadata.focalLength35mm = exifData.focalLength35mm || null;
        //Tone/color metadata.
        metadata.contrast = exifData.contrast || null;
        metadata.brightness = exifData.brightness ?? null;
        metadata.lightSource = exifData.lightSource || null;
        metadata.exposureProgram = exifData.exposureProgram || null;
        metadata.saturation = exifData.saturation || null;
        metadata.sharpness = exifData.sharpness || null;
        metadata.whiteBalance = exifData.whiteBalance || null;
        metadata.digitalZoom = exifData.digitalZoom ?? null;
        //EXIF version string.
        metadata.exifVersion = exifData.exifVersion || null;

        //Populate location from IPTC/XMP if available, fall back to reverse geocoding from GPS.
        locationFromExif = {
            city: exifData.city || '',
            state: exifData.state || '',
            country: exifData.country || ''
        };
        //Reverse geocode only when IPTC was empty AND coords are present.
        if (!locationFromExif.city && !locationFromExif.state && !locationFromExif.country
            && metadata.gpsLatitude && metadata.gpsLongitude) {
            //Network call — may return empty strings when the geocoder fails.
            var geo = await reverseGeocode(metadata.gpsLatitude, metadata.gpsLongitude);
            locationFromExif.city = geo.city || '';
            locationFromExif.state = geo.state || '';
            locationFromExif.country = geo.country || '';
        }

        //Get image dimensions from sharp.
        const sharpMeta = await sharp(file.buffer).metadata();
        //Pixel dimensions.
        metadata.imageWidthPixels = sharpMeta.width || null;
        metadata.imageHeightPixels = sharpMeta.height || null;
        if (sharpMeta.width && sharpMeta.height) {
            //Aspect ratio rounded to four decimals for stable comparisons.
            metadata.aspectRatio = Math.round((sharpMeta.width / sharpMeta.height) * 10000) / 10000;
        }
        //Bit depth from sharp if not found in EXIF (common for PNG files).
        if (!metadata.bitDepth && sharpMeta.depth) {
            //Map sharp's depth strings to numeric bit counts.
            var depthMap = { uchar: 8, ushort: 16, float: 32, double: 64, char: 8, short: 16, int: 32 };
            metadata.bitDepth = depthMap[sharpMeta.depth] || null;
        }

        //Build file names from title and capture timestamp.
        const fileNames = buildMediaFileNames(title, capturedAt, 'photo');
        //Absolute paths for each output.
        const fullResPath = path.join(PHOTOS_FULL_RES_DIR, fileNames.ogName);
        const displayPath = path.join(MEDIA_DISPLAY_DIR, fileNames.displayName);
        const thumbPath = path.join(THUMBNAILS_DIR, fileNames.thumbName);

        //Persist the original.
        fs.writeFileSync(fullResPath, file.buffer);
        //Watermarked, resized display copy.
        const displayBuffer = await createPhotoDisplayCopy(file.buffer);
        fs.writeFileSync(displayPath, displayBuffer);
        //Admin-grid thumbnail.
        const thumbBuffer = await createPhotoThumbnail(file.buffer);
        fs.writeFileSync(thumbPath, thumbBuffer);

        //Generate auto-tags from capture timestamp and camera make.
        const autoTags = [];
        const seasonTag = getSeasonTag(capturedAt);
        if (seasonTag) autoTags.push(seasonTag);
        const droneTag = getDroneTag(metadata.cameraMake);
        if (droneTag) autoTags.push(droneTag);

        //Insert the DB record — same shape as the regular upload path.
        const mediaDoc = await Media.create({
            slug: toSlug(nameWithoutExt),
            mediaType: 'photo', title: title, description: '', alt: '',
            fileName: originalName,
            //Just basenames — the resolver reattaches the directory at read time.
            fullResolutionLogolessPath: fileNames.ogName,
            displayResolutionPath: fileNames.displayName,
            thumbnailPath: fileNames.thumbName,
            creator: 'Scott Short', galleries: [], tags: autoTags,
            //Visibility flags default to true so the photo shows up immediately.
            display: true, showOnHomepage: true, homepageSortOrder: nextSortOrder,
            showInRecent: true, featured: false,
            capturedAt: capturedAt ? new Date(capturedAt) : null,
            //Server-side ingest timestamp.
            ingestedAt: new Date(),
            location: locationFromExif,
            metadata: metadata
        });

        //Determine which required fields are still missing.
        const missingRequired = [];
        if (!mediaDoc.description) missingRequired.push('description');
        if (!mediaDoc.alt) missingRequired.push('alt');
        if (!mediaDoc.galleries || mediaDoc.galleries.length === 0) missingRequired.push('galleries');
        //Push the per-file result.
        results.push({ document: mediaDoc.toObject(), autoTags: autoTags, missingRequired: missingRequired });

    } else if (isVideo) {
        //Build file names from title and (initially null) capture timestamp.
        const fileNames = buildMediaFileNames(title, capturedAt, 'video');
        //Absolute paths for each output.
        const fullResPath = path.join(VIDEOS_FULL_RES_DIR, fileNames.ogName);
        const displayPath = path.join(MEDIA_DISPLAY_DIR, fileNames.displayName);
        const thumbPath = path.join(THUMBNAILS_DIR, fileNames.thumbName);

        //Persist the original.
        fs.writeFileSync(fullResPath, file.buffer);

        //Probe the saved file with ffprobe.
        const videoMeta = await extractVideoMetadata(fullResPath);
        //Pixel dimensions and aspect ratio.
        metadata.imageWidthPixels = videoMeta.imageWidthPixels || null;
        metadata.imageHeightPixels = videoMeta.imageHeightPixels || null;
        metadata.aspectRatio = videoMeta.aspectRatio || null;
        //Capture timestamp from container metadata.
        capturedAt = videoMeta.capturedAt || null;

        //Watermarked, resized display transcode.
        try {
            await createVideoDisplayCopy(fullResPath, displayPath);
        } catch (videoError) {
            //Log and continue — we still want a record even if transcoding fails.
            console.error('Video processing error:', videoError.message);
            //Fall back to a copy of the original.
            fs.copyFileSync(fullResPath, displayPath);
        }

        //First-frame thumbnail.
        try {
            await createVideoThumbnail(fullResPath, thumbPath);
        } catch (thumbError) {
            //Log and continue — missing thumbnail is recoverable.
            console.error('Video thumbnail error:', thumbError.message);
        }

        //Auto-tags: season + DJI heuristic for drone footage.
        const autoTags = [];
        const seasonTag = getSeasonTag(capturedAt);
        if (seasonTag) autoTags.push(seasonTag);
        if (originalName.toLowerCase().includes('dji')) {
            autoTags.push('drone');
            //Stamp camera make so downstream consumers see it.
            metadata.cameraMake = 'DJI';
        }

        //Insert the DB record — same shape as the regular upload path.
        const mediaDoc = await Media.create({
            slug: toSlug(nameWithoutExt),
            mediaType: 'video', title: title, description: '', alt: '',
            fileName: originalName,
            //Just basenames — the resolver reattaches the directory at read time.
            fullResolutionLogolessPath: fileNames.ogName,
            displayResolutionPath: fileNames.displayName,
            thumbnailPath: fileNames.thumbName,
            creator: 'Scott Short', galleries: [], tags: autoTags,
            //Visibility flags default to true.
            display: true, showOnHomepage: true, homepageSortOrder: nextSortOrder,
            showInRecent: true, featured: false,
            capturedAt: capturedAt ? new Date(capturedAt) : null,
            //Server-side ingest timestamp.
            ingestedAt: new Date(),
            //Videos don't carry IPTC location — admin fills these in.
            location: { city: '', state: '', country: '' },
            metadata: metadata
        });

        //Determine which required fields are still missing.
        const missingRequired = [];
        if (!mediaDoc.description) missingRequired.push('description');
        if (!mediaDoc.alt) missingRequired.push('alt');
        if (!mediaDoc.galleries || mediaDoc.galleries.length === 0) missingRequired.push('galleries');
        //Push the per-file result.
        results.push({ document: mediaDoc.toObject(), autoTags: autoTags, missingRequired: missingRequired });
    }

    //Stop the heartbeat and emit the JSON body.
    clearInterval(heartbeat);
    res.end(JSON.stringify(results));
});

//Export every handler for the media router.
module.exports = { getAllMedia, getMediaTags, uploadMedia, uploadChunk, finalizeUpload, updateMedia, deleteMedia, reorderMedia };
