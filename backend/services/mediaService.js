const path = require('path');
const Busboy = require('busboy');
const sharp = require('sharp');
const exifr = require('exifr');
const ffmpeg = require('fluent-ffmpeg');

const MAXIMUM_UPLOAD_SIZE = 500 * 1024 * 1024;

const DISPLAY_MAX_WIDTH = 1600;

const WATERMARK_OPACITY = 0.5;

const WATERMARK_MARGIN = 20;

const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'logos_and_thumbnails', 'logo-137x139.png');

const THUMBNAIL_MAX_WIDTH = 400;

const PHOTOS_FULL_RES_DIR = path.join(__dirname, '..', '..', 'media', 'photos_full_resolution_logoless');
const VIDEOS_FULL_RES_DIR = path.join(__dirname, '..', '..', 'media', 'videos_full_resolution_logoless');
const MEDIA_DISPLAY_DIR = path.join(__dirname, '..', '..', 'media', 'media_display');
const THUMBNAILS_DIR = path.join(__dirname, '..', '..', 'media', 'thumbnails');
const CHUNKS_DIR = path.join(__dirname, '..', '..', 'media', 'tmp_chunks');

function parseMultipart(request) {
    return new Promise(function (resolve, reject) {
        const fields = {};
        const files = [];
        let totalSize = 0;

        let busboy;
        try {
            busboy = Busboy({ headers: request.headers, limits: { fileSize: MAXIMUM_UPLOAD_SIZE } });
        } catch (error) {
            reject(new Error('Invalid multipart request'));
            return;
        }

        busboy.on('field', function (name, value) {
            fields[name] = value;
        });

        busboy.on('file', function (name, stream, info) {
            const chunks = [];
            stream.on('data', function (chunk) {
                totalSize += chunk.length;
                if (totalSize > MAXIMUM_UPLOAD_SIZE) {
                    stream.destroy();
                    reject(new Error('Upload too large'));
                    return;
                }
                chunks.push(chunk);
            });
            stream.on('end', function () {
                files.push({
                    fieldName: name,
                    filename: info.filename,
                    mimeType: info.mimeType,
                    buffer: Buffer.concat(chunks)
                });
            });
        });

        busboy.on('finish', function () {
            resolve({ fields, files });
        });

        busboy.on('error', reject);
        request.pipe(busboy);
    });
}

async function extractPhotoMetadata(buffer) {
    const meta = {};
    try {
        const exif = await exifr.parse(buffer, {
            tiff: true,
            exif: true,
            gps: true,
            iptc: true,
            xmp: true,
            ifd0: true,
            ifd1: false,
            mergeOutput: true,
            translateKeys: false,
            translateValues: false,
            reviveValues: false,
            sanitize: false,
            chunked: true
        });
        if (exif) {
            function parseRational(val) {
                if (val == null) return null;
                if (typeof val === 'number') return val;
                var str = String(val);
                var parts = str.split('/');
                if (parts.length === 2) {
                    var num = parseFloat(parts[0]);
                    var den = parseFloat(parts[1]);
                    if (den !== 0 && !isNaN(num) && !isNaN(den)) return num / den;
                }
                var parsed = parseFloat(str);
                return isNaN(parsed) ? null : parsed;
            }

            meta.cameraMake = exif.Make || null;
            meta.cameraModel = exif.Model || null;

            var fnum = parseRational(exif.FNumber);
            meta.aperture = fnum ? 'f/' + Math.round(fnum * 10) / 10 : null;

            var expRaw = exif.ExposureTime;
            if (expRaw != null) {
                var expVal = parseRational(expRaw);
                if (expVal != null) {
                    meta.exposureTime = expVal < 1 ? '1/' + Math.round(1 / expVal) : String(expVal);
                } else {
                    meta.exposureTime = String(expRaw);
                }
            } else {
                meta.exposureTime = null;
            }

            meta.iso = exif.ISO || exif.ISOSpeedRatings || exif.RecommendedExposureIndex || null;

            var fl = parseRational(exif.FocalLength);
            meta.focalLength = fl ? Math.round(fl * 100) / 100 + 'mm' : null;

            meta.lensModel = exif.LensModel || exif.Lens || null;
            meta.lensMake = exif.LensMake || null;

            meta.capturedAt = exif.DateTimeOriginal || exif.CreateDate || exif.DateCreated || null;

            var lat = exif.GpsLatitude || exif.latitude || null;
            var lon = exif.GpsLongitude || exif.longitude || null;
            if (lat == null && exif.GPSLatitude != null) {
                lat = typeof exif.GPSLatitude === 'number' ? exif.GPSLatitude : null;
            }
            if (lon == null && exif.GPSLongitude != null) {
                lon = typeof exif.GPSLongitude === 'number' ? exif.GPSLongitude : null;
            }
            meta.gpsLatitude = lat;
            meta.gpsLongitude = lon;

            var alt = exif.AbsoluteAltitude || exif.GPSAltitude || null;
            meta.gpsAltitude = parseRational(alt);

            meta.horizontalDpi = parseRational(exif.XResolution);
            meta.verticalDpi = parseRational(exif.YResolution);
            meta.bitDepth = exif.BitDepth || exif.BitsPerSample || null;
            meta.resolutionUnit = exif.ResolutionUnit != null ? String(exif.ResolutionUnit) : null;

            var expBias = parseRational(exif.ExposureBiasValue);
            meta.exposureBias = expBias;

            var maxAp = parseRational(exif.MaxApertureValue);
            meta.maxAperture = maxAp != null ? 'f/' + Math.round(Math.pow(2, maxAp / 2) * 10) / 10 : null;

            meta.meteringMode = exif.MeteringMode != null ? String(exif.MeteringMode) : null;

            var subjDist = parseRational(exif.SubjectDistance);
            meta.subjectDistance = subjDist != null ? subjDist + 'm' : null;

            if (exif.Flash != null) {
                if (typeof exif.Flash === 'object') {
                    meta.flashMode = exif.Flash.Fired ? 'Fired' : 'Not fired';
                    if (exif.Flash.Mode != null) meta.flashMode += ', Mode: ' + exif.Flash.Mode;
                } else {
                    meta.flashMode = String(exif.Flash);
                }
            } else {
                meta.flashMode = null;
            }

            var fl35 = exif.FocalLengthIn35mmFilm || exif.FocalLengthIn35mmFormat || null;
            meta.focalLength35mm = fl35 ? fl35 + 'mm' : null;

            meta.contrast = exif.Contrast != null ? String(exif.Contrast) : null;
            meta.brightness = parseRational(exif.BrightnessValue);
            meta.lightSource = exif.LightSource != null ? String(exif.LightSource) : null;
            meta.exposureProgram = exif.ExposureProgram != null ? String(exif.ExposureProgram) : null;
            meta.saturation = exif.Saturation != null ? String(exif.Saturation) : null;
            meta.sharpness = exif.Sharpness != null ? String(exif.Sharpness) : null;
            meta.whiteBalance = exif.WhiteBalance != null ? String(exif.WhiteBalance) : null;

            var dz = parseRational(exif.DigitalZoomRatio);
            meta.digitalZoom = dz;

            meta.exifVersion = exif.ExifVersion != null ? String(exif.ExifVersion) : null;

            meta.city = exif.City || null;
            meta.state = exif.State || exif['Province-State'] || null;
            meta.country = exif.Country || exif['Country-PrimaryLocationName'] || null;
        }
    } catch (error) {
    }
    return meta;
}

function extractVideoMetadata(filePath) {
    return new Promise(function (resolve) {
        ffmpeg.ffprobe(filePath, function (error, data) {
            const meta = {};
            if (error || !data) {
                resolve(meta);
                return;
            }
            const videoStream = data.streams.find(function (s) { return s.codec_type === 'video'; });
            if (videoStream) {
                meta.imageWidthPixels = videoStream.width || null;
                meta.imageHeightPixels = videoStream.height || null;
                if (videoStream.width && videoStream.height) {
                    meta.aspectRatio = Math.round((videoStream.width / videoStream.height) * 10000) / 10000;
                }
            }
            if (data.format && data.format.tags) {
                const tags = data.format.tags;
                meta.capturedAt = tags.creation_time ? new Date(tags.creation_time) : null;
            }
            resolve(meta);
        });
    });
}

async function createPhotoDisplayCopy(sourceBuffer) {
    const logo = await sharp(LOGO_PATH).ensureAlpha().composite([{
        input: Buffer.from([0, 0, 0, Math.round(255 * WATERMARK_OPACITY)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: 'dest-in'
    }]).toBuffer();

    const logoMeta = await sharp(logo).metadata();

    const resized = sharp(sourceBuffer).resize({ width: DISPLAY_MAX_WIDTH, withoutEnlargement: true });
    const resizedBuffer = await resized.png().toBuffer();
    const finalMeta = await sharp(resizedBuffer).metadata();

    const left = finalMeta.width - logoMeta.width - WATERMARK_MARGIN;
    const top = finalMeta.height - logoMeta.height - WATERMARK_MARGIN;

    return sharp(resizedBuffer).composite([{
        input: logo,
        left: Math.max(0, left),
        top: Math.max(0, top)
    }]).png().toBuffer();
}

async function createPhotoThumbnail(sourceBuffer) {
    return sharp(sourceBuffer)
        .resize({ width: THUMBNAIL_MAX_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
}

function createVideoThumbnail(inputPath, outputPath) {
    return new Promise(function (resolve, reject) {
        ffmpeg(inputPath)
            .screenshots({
                count: 1,
                timemarks: ['00:00:01'],
                filename: path.basename(outputPath),
                folder: path.dirname(outputPath),
                size: THUMBNAIL_MAX_WIDTH + 'x?'
            })
            .on('end', resolve)
            .on('error', reject);
    });
}

function createVideoDisplayCopy(inputPath, outputPath) {
    return new Promise(function (resolve, reject) {
        ffmpeg(inputPath)
            .input(LOGO_PATH)
            .complexFilter([
                'scale=1920:-2[scaled]',
                '[1:v]format=rgba,colorchannelmixer=aa=' + WATERMARK_OPACITY + '[logo]',
                '[scaled][logo]overlay=W-w-' + WATERMARK_MARGIN + ':H-h-' + WATERMARK_MARGIN
            ])
            .outputOptions(['-c:v', 'libx264', '-crf', '23', '-preset', 'medium', '-c:a', 'aac', '-movflags', '+faststart'])
            .on('end', resolve)
            .on('error', reject)
            .save(outputPath);
    });
}

async function reverseGeocode(latitude, longitude) {
    var result = { city: null, state: null, country: null };
    try {
        var url = 'https://nominatim.openstreetmap.org/reverse?lat=' +
            encodeURIComponent(latitude) + '&lon=' + encodeURIComponent(longitude) +
            '&format=json&zoom=10&addressdetails=1';
        var response = await fetch(url, {
            headers: { 'User-Agent': 'PapisPictures/1.0' }
        });
        if (!response.ok) return result;
        var data = await response.json();
        if (data && data.address) {
            result.city = data.address.city || data.address.town || data.address.village || data.address.hamlet || data.address.county || null;
            result.state = data.address.state || null;
            result.country = data.address.country || null;
        }
    } catch (error) {
    }
    return result;
}

module.exports = {
    MAXIMUM_UPLOAD_SIZE,
    DISPLAY_MAX_WIDTH,
    WATERMARK_OPACITY,
    WATERMARK_MARGIN,
    LOGO_PATH,
    THUMBNAIL_MAX_WIDTH,
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
};
