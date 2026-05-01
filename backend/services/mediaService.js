//Node path module for safe filesystem path joins.
const path = require('path');
//Busboy — streaming multipart/form-data parser used for uploads.
const Busboy = require('busboy');
//sharp — image resize/encode pipeline used for display copies, thumbnails, and watermark compositing.
const sharp = require('sharp');
//exifr — EXIF/IPTC/XMP/GPS extractor for photos.
const exifr = require('exifr');
//fluent-ffmpeg — wrapper around ffmpeg/ffprobe for video metadata, thumbnails, and transcodes.
const ffmpeg = require('fluent-ffmpeg');

//Maximum upload file size (500 MB) to allow large video uploads.
const MAXIMUM_UPLOAD_SIZE = 500 * 1024 * 1024;

//Maximum display resolution width for photos (matches existing display files).
const DISPLAY_MAX_WIDTH = 1600;

//Watermark opacity (0-1) for the logo overlay on display copies.
const WATERMARK_OPACITY = 0.5;

//Watermark margin from edges in pixels.
const WATERMARK_MARGIN = 20;

//Path to the logo used for watermarking display copies.
const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'logos_and_thumbnails', 'logo-137x139.png');

//Maximum thumbnail width in pixels for admin panel cards and previews.
const THUMBNAIL_MAX_WIDTH = 400;

//Paths to media storage directories.
//Originals (full-resolution) directory for photos.
const PHOTOS_FULL_RES_DIR = path.join(__dirname, '..', '..', 'media', 'photos_full_resolution_logoless');
//Originals directory for videos.
const VIDEOS_FULL_RES_DIR = path.join(__dirname, '..', '..', 'media', 'videos_full_resolution_logoless');
//Watermarked, web-sized display copies for both photos and videos.
const MEDIA_DISPLAY_DIR = path.join(__dirname, '..', '..', 'media', 'media_display');
//Small thumbnails for the admin panel grid.
const THUMBNAILS_DIR = path.join(__dirname, '..', '..', 'media', 'thumbnails');
//Scratch directory for chunked uploads in progress.
const CHUNKS_DIR = path.join(__dirname, '..', '..', 'media', 'tmp_chunks');

//Parse a multipart/form-data upload request. Returns a promise with { fields, files }. Each file is { filename, mimeType, buffer }.
function parseMultipart(request) {
    return new Promise(function (resolve, reject) {
        //Plain field values keyed by form name.
        const fields = {};
        //Per-file descriptors with the buffered body.
        const files = [];
        //Running total across all streamed files for the size cap.
        let totalSize = 0;

        //Busboy parser instance — constructed inside try because malformed headers throw synchronously.
        let busboy;
        try {
            busboy = Busboy({ headers: request.headers, limits: { fileSize: MAXIMUM_UPLOAD_SIZE } });
        } catch (error) {
            //Reject with a clean message rather than leaking the busboy internals.
            reject(new Error('Invalid multipart request'));
            return;
        }

        //Plain text field handler — simple key/value capture.
        busboy.on('field', function (name, value) {
            fields[name] = value;
        });

        //File stream handler — buffer each chunk while enforcing the size cap.
        busboy.on('file', function (name, stream, info) {
            //Per-file chunk array; concatenated on end.
            const chunks = [];
            stream.on('data', function (chunk) {
                //Accumulate the running size first so the cap fires before buffering.
                totalSize += chunk.length;
                if (totalSize > MAXIMUM_UPLOAD_SIZE) {
                    //Tear down the stream and reject the promise outright.
                    stream.destroy();
                    reject(new Error('Upload too large'));
                    return;
                }
                chunks.push(chunk);
            });
            stream.on('end', function () {
                //Materialize the file descriptor for the caller.
                files.push({
                    fieldName: name,
                    filename: info.filename,
                    mimeType: info.mimeType,
                    buffer: Buffer.concat(chunks)
                });
            });
        });

        //All parts consumed — hand the collected fields/files back.
        busboy.on('finish', function () {
            resolve({ fields, files });
        });

        //Surface any low-level parser errors directly.
        busboy.on('error', reject);
        //Wire the request stream into busboy to start parsing.
        request.pipe(busboy);
    });
}

//Extract EXIF metadata from a photo buffer using exifr. Returns an object with normalized metadata fields.
async function extractPhotoMetadata(buffer) {
    //Output bag — every field stays undefined unless EXIF actually had a value.
    const meta = {};
    try {
        //Parse EXIF, GPS, XMP, and IPTC data. Skip thumbnail IFD to improve performance on large files.
        const exif = await exifr.parse(buffer, {
            //Enable each segment I care about explicitly.
            tiff: true,
            exif: true,
            gps: true,
            iptc: true,
            xmp: true,
            ifd0: true,
            //Skip the thumbnail IFD — we don't need it and it's slow on big files.
            ifd1: false,
            //Flatten everything into a single object so I can read by tag name directly.
            mergeOutput: true,
            //Keep raw tag names and raw values — I want to do my own normalization below.
            translateKeys: false,
            translateValues: false,
            reviveValues: false,
            sanitize: false,
            //Read just the chunks needed to find EXIF, not the whole buffer.
            chunked: true
        });
        if (exif) {
            //Helper to parse rational strings like "18/10" into numbers.
            function parseRational(val) {
                //Null/undefined passthrough.
                if (val == null) return null;
                //Already numeric — nothing to do.
                if (typeof val === 'number') return val;
                //Coerce to string for the split below.
                var str = String(val);
                //Split on '/' to detect rational form.
                var parts = str.split('/');
                if (parts.length === 2) {
                    //Numerator / denominator branch.
                    var num = parseFloat(parts[0]);
                    var den = parseFloat(parts[1]);
                    //Guard against divide-by-zero and NaN.
                    if (den !== 0 && !isNaN(num) && !isNaN(den)) return num / den;
                }
                //Plain decimal fallback.
                var parsed = parseFloat(str);
                return isNaN(parsed) ? null : parsed;
            }

            //Camera info.
            meta.cameraMake = exif.Make || null;
            meta.cameraModel = exif.Model || null;

            //Aperture — handle rational string like "18/10" or numeric.
            var fnum = parseRational(exif.FNumber);
            //Format as f/X.X for display.
            meta.aperture = fnum ? 'f/' + Math.round(fnum * 10) / 10 : null;

            //Exposure time — handle rational string like "1/80" or numeric.
            var expRaw = exif.ExposureTime;
            if (expRaw != null) {
                //Try to parse as a number first.
                var expVal = parseRational(expRaw);
                if (expVal != null) {
                    //Sub-second exposures display as 1/N for readability.
                    meta.exposureTime = expVal < 1 ? '1/' + Math.round(1 / expVal) : String(expVal);
                } else {
                    //Couldn't parse — keep the raw string.
                    meta.exposureTime = String(expRaw);
                }
            } else {
                meta.exposureTime = null;
            }

            //ISO — check multiple tag names.
            meta.iso = exif.ISO || exif.ISOSpeedRatings || exif.RecommendedExposureIndex || null;

            //Focal length — handle rational.
            var fl = parseRational(exif.FocalLength);
            //Format as Xmm with two decimals.
            meta.focalLength = fl ? Math.round(fl * 100) / 100 + 'mm' : null;

            //Lens info.
            meta.lensModel = exif.LensModel || exif.Lens || null;
            meta.lensMake = exif.LensMake || null;

            //Capture date.
            meta.capturedAt = exif.DateTimeOriginal || exif.CreateDate || exif.DateCreated || null;

            //GPS — prefer DJI XMP decimal values, fall back to standard EXIF.
            var lat = exif.GpsLatitude || exif.latitude || null;
            var lon = exif.GpsLongitude || exif.longitude || null;
            //Fall back to numeric GPSLatitude only if the previous lookups didn't hit.
            if (lat == null && exif.GPSLatitude != null) {
                lat = typeof exif.GPSLatitude === 'number' ? exif.GPSLatitude : null;
            }
            //Mirror logic for longitude.
            if (lon == null && exif.GPSLongitude != null) {
                lon = typeof exif.GPSLongitude === 'number' ? exif.GPSLongitude : null;
            }
            meta.gpsLatitude = lat;
            meta.gpsLongitude = lon;

            //Altitude — handle rational string like "251806/1000".
            var alt = exif.AbsoluteAltitude || exif.GPSAltitude || null;
            meta.gpsAltitude = parseRational(alt);

            //Resolution.
            meta.horizontalDpi = parseRational(exif.XResolution);
            meta.verticalDpi = parseRational(exif.YResolution);
            //Bit depth comes from one of two tag names.
            meta.bitDepth = exif.BitDepth || exif.BitsPerSample || null;
            meta.resolutionUnit = exif.ResolutionUnit != null ? String(exif.ResolutionUnit) : null;

            //Exposure details.
            var expBias = parseRational(exif.ExposureBiasValue);
            meta.exposureBias = expBias;

            //Max aperture — stored as APEX value, convert to f-stop via 2^(APEX/2).
            var maxAp = parseRational(exif.MaxApertureValue);
            meta.maxAperture = maxAp != null ? 'f/' + Math.round(Math.pow(2, maxAp / 2) * 10) / 10 : null;

            //Metering mode lookup code stored as a string.
            meta.meteringMode = exif.MeteringMode != null ? String(exif.MeteringMode) : null;

            //Subject distance in meters.
            var subjDist = parseRational(exif.SubjectDistance);
            meta.subjectDistance = subjDist != null ? subjDist + 'm' : null;

            //Flash — may be an object with Fired/Mode/etc. or a simple value.
            if (exif.Flash != null) {
                if (typeof exif.Flash === 'object') {
                    //Object form — build a human-readable summary.
                    meta.flashMode = exif.Flash.Fired ? 'Fired' : 'Not fired';
                    if (exif.Flash.Mode != null) meta.flashMode += ', Mode: ' + exif.Flash.Mode;
                } else {
                    //Scalar form — stringify.
                    meta.flashMode = String(exif.Flash);
                }
            } else {
                meta.flashMode = null;
            }

            //35mm focal length.
            var fl35 = exif.FocalLengthIn35mmFilm || exif.FocalLengthIn35mmFormat || null;
            meta.focalLength35mm = fl35 ? fl35 + 'mm' : null;

            //Image processing settings.
            meta.contrast = exif.Contrast != null ? String(exif.Contrast) : null;
            meta.brightness = parseRational(exif.BrightnessValue);
            meta.lightSource = exif.LightSource != null ? String(exif.LightSource) : null;
            meta.exposureProgram = exif.ExposureProgram != null ? String(exif.ExposureProgram) : null;
            meta.saturation = exif.Saturation != null ? String(exif.Saturation) : null;
            meta.sharpness = exif.Sharpness != null ? String(exif.Sharpness) : null;
            meta.whiteBalance = exif.WhiteBalance != null ? String(exif.WhiteBalance) : null;

            //Digital zoom — handle rational string like "100/100".
            var dz = parseRational(exif.DigitalZoomRatio);
            meta.digitalZoom = dz;

            //EXIF spec version string.
            meta.exifVersion = exif.ExifVersion != null ? String(exif.ExifVersion) : null;

            //IPTC/XMP location fields.
            meta.city = exif.City || null;
            //State has two common tag names.
            meta.state = exif.State || exif['Province-State'] || null;
            //Country also has two common tag names.
            meta.country = exif.Country || exif['Country-PrimaryLocationName'] || null;
        }
    } catch (error) {
        //EXIF parsing failed — return empty metadata, fields will be null.
    }
    //Return whatever survived the parse.
    return meta;
}

//Extract video metadata using ffprobe. Returns a promise with normalized metadata fields.
function extractVideoMetadata(filePath) {
    return new Promise(function (resolve) {
        //Shell out to ffprobe via fluent-ffmpeg.
        ffmpeg.ffprobe(filePath, function (error, data) {
            //Output bag — every field stays undefined unless ffprobe found something.
            const meta = {};
            if (error || !data) {
                //Probe failed — resolve with empty meta so the caller can continue.
                resolve(meta);
                return;
            }
            //Pick the first video track — ignore audio/subtitle streams.
            const videoStream = data.streams.find(function (s) { return s.codec_type === 'video'; });
            if (videoStream) {
                //Pixel dimensions.
                meta.imageWidthPixels = videoStream.width || null;
                meta.imageHeightPixels = videoStream.height || null;
                if (videoStream.width && videoStream.height) {
                    //Aspect ratio rounded to four decimals for stable comparisons.
                    meta.aspectRatio = Math.round((videoStream.width / videoStream.height) * 10000) / 10000;
                }
            }
            //Container-level tags carry the capture timestamp.
            if (data.format && data.format.tags) {
                const tags = data.format.tags;
                //creation_time is ISO-8601; coerce to a Date.
                meta.capturedAt = tags.creation_time ? new Date(tags.creation_time) : null;
            }
            resolve(meta);
        });
    });
}

//Create the watermarked, resized display copy of a photo. Returns the buffer of the processed image.
async function createPhotoDisplayCopy(sourceBuffer) {
    //Prepare logo with transparency for watermarking.
    //ensureAlpha + dest-in tile multiplies the logo's alpha channel by WATERMARK_OPACITY.
    const logo = await sharp(LOGO_PATH).ensureAlpha().composite([{
        input: Buffer.from([0, 0, 0, Math.round(255 * WATERMARK_OPACITY)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: 'dest-in'
    }]).toBuffer();

    //Logo metadata so I know where to anchor the overlay.
    const logoMeta = await sharp(logo).metadata();

    //Resize the source image to the display max width, then composite the watermark in the bottom-right corner.
    const resized = sharp(sourceBuffer).resize({ width: DISPLAY_MAX_WIDTH, withoutEnlargement: true });
    //Materialize as PNG so I can read post-resize dimensions reliably.
    const resizedBuffer = await resized.png().toBuffer();
    //Post-resize dimensions for the overlay math.
    const finalMeta = await sharp(resizedBuffer).metadata();

    //Anchor the logo to the bottom-right corner with WATERMARK_MARGIN inset.
    const left = finalMeta.width - logoMeta.width - WATERMARK_MARGIN;
    const top = finalMeta.height - logoMeta.height - WATERMARK_MARGIN;

    //Composite and return as PNG so transparency is preserved.
    return sharp(resizedBuffer).composite([{
        input: logo,
        //Math.max guards against tiny source images where the logo would land off-canvas.
        left: Math.max(0, left),
        top: Math.max(0, top)
    }]).png().toBuffer();
}

//Create a small thumbnail image from a photo buffer. Returns the thumbnail buffer as a JPEG.
async function createPhotoThumbnail(sourceBuffer) {
    //Resize and encode — quality 80 keeps file size reasonable while staying visually clean.
    return sharp(sourceBuffer)
        .resize({ width: THUMBNAIL_MAX_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
}

//Extract a single frame from a video file and save it as a JPEG thumbnail.
function createVideoThumbnail(inputPath, outputPath) {
    return new Promise(function (resolve, reject) {
        //fluent-ffmpeg's screenshots() handles the seek + extract in one shot.
        ffmpeg(inputPath)
            .screenshots({
                //One frame, taken at 1 second to skip black intro frames.
                count: 1,
                timemarks: ['00:00:01'],
                //Caller passes the full path; split it for ffmpeg's API.
                filename: path.basename(outputPath),
                folder: path.dirname(outputPath),
                //Match the photo thumbnail width; '?' preserves aspect ratio.
                size: THUMBNAIL_MAX_WIDTH + 'x?'
            })
            .on('end', resolve)
            .on('error', reject);
    });
}

//Create the watermarked, resized display copy of a video. Writes the output file and returns a promise.
function createVideoDisplayCopy(inputPath, outputPath) {
    return new Promise(function (resolve, reject) {
        //Two-input pipeline: source video + logo PNG, joined by a complex filter graph.
        ffmpeg(inputPath)
            .input(LOGO_PATH)
            .complexFilter([
                //Scale the source to 1080p height while preserving the aspect ratio.
                'scale=1920:-2[scaled]',
                //Convert the logo to RGBA and apply WATERMARK_OPACITY to its alpha channel.
                '[1:v]format=rgba,colorchannelmixer=aa=' + WATERMARK_OPACITY + '[logo]',
                //Overlay the logo in the bottom-right corner with WATERMARK_MARGIN inset.
                '[scaled][logo]overlay=W-w-' + WATERMARK_MARGIN + ':H-h-' + WATERMARK_MARGIN
            ])
            //x264 at CRF 23, AAC audio, faststart so the player can begin before the full file is downloaded.
            .outputOptions(['-c:v', 'libx264', '-crf', '23', '-preset', 'medium', '-c:a', 'aac', '-movflags', '+faststart'])
            .on('end', resolve)
            .on('error', reject)
            .save(outputPath);
    });
}

//Reverse geocode GPS coordinates to city, state, country using OpenStreetMap Nominatim.
//Returns { city, state, country } or nulls on failure. Respects Nominatim usage policy.
async function reverseGeocode(latitude, longitude) {
    //Default empty result returned on any failure path.
    var result = { city: null, state: null, country: null };
    try {
        //Build the Nominatim URL with safely encoded coords.
        var url = 'https://nominatim.openstreetmap.org/reverse?lat=' +
            encodeURIComponent(latitude) + '&lon=' + encodeURIComponent(longitude) +
            '&format=json&zoom=10&addressdetails=1';
        //Custom User-Agent is required by Nominatim's usage policy.
        var response = await fetch(url, {
            headers: { 'User-Agent': 'PapisPictures/1.0' }
        });
        //Bail on non-2xx (rate limit, 5xx, etc.) and return the default result.
        if (!response.ok) return result;
        //Parse the JSON body.
        var data = await response.json();
        if (data && data.address) {
            //City name has many possible synonyms in OSM — walk the preferred order.
            result.city = data.address.city || data.address.town || data.address.village || data.address.hamlet || data.address.county || null;
            result.state = data.address.state || null;
            result.country = data.address.country || null;
        }
    } catch (error) {
        //Geocoding failed — return nulls silently.
    }
    return result;
}

//Export every constant and helper consumed by the upload controller.
module.exports = {
    //Size and rendering constants.
    MAXIMUM_UPLOAD_SIZE,
    DISPLAY_MAX_WIDTH,
    WATERMARK_OPACITY,
    WATERMARK_MARGIN,
    LOGO_PATH,
    THUMBNAIL_MAX_WIDTH,
    //Storage directory paths.
    PHOTOS_FULL_RES_DIR,
    VIDEOS_FULL_RES_DIR,
    MEDIA_DISPLAY_DIR,
    THUMBNAILS_DIR,
    CHUNKS_DIR,
    //Heavy I/O and metadata helpers.
    parseMultipart,
    extractPhotoMetadata,
    extractVideoMetadata,
    createPhotoDisplayCopy,
    createPhotoThumbnail,
    createVideoThumbnail,
    createVideoDisplayCopy,
    reverseGeocode
};
