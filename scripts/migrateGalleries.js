//Load environment variables from encrypted .env file via dotenvx.
require('@dotenvx/dotenvx').config({ quiet: true });

const mongoose = require('mongoose');
const Media = require('../backend/models/Media');
const Gallery = require('../backend/models/Gallery');
const { toSlug } = require('../backend/utils/helpers');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/papis_pictures';

//Pull every distinct (gallerySlug, galleryName) pair already living inside Media.galleries[] and
//upsert a canonical Gallery doc for each. Idempotent — re-running this script never duplicates a
//gallery and never regresses an existing one's title/description/sortOrder.
async function migrate() {
    console.log('Connecting to MongoDB at ' + MONGO_URI + '...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected.\n');

    //Aggregate distinct (slug, name) pairs across the Media.galleries[] subdoc array. Each pair
    //becomes a candidate Gallery doc.
    const pairs = await Media.aggregate([
        //Drop any media that has no galleries[] entries before the unwind to keep the pipeline tight.
        { $match: { galleries: { $exists: true, $ne: [] } } },
        //Flatten so each (media, gallery-membership) pair becomes its own row.
        { $unwind: '$galleries' },
        //Group by slug, capturing the first encountered name as the canonical title.
        { $group: {
            _id: '$galleries.gallerySlug',
            galleryName: { $first: '$galleries.galleryName' },
            count: { $sum: 1 }
        } },
        //Drop any rows where the slug is null/empty (old data may have malformed entries).
        { $match: { _id: { $ne: null } } },
        //Stable order so reruns log in a predictable sequence.
        { $sort: { _id: 1 } }
    ]);

    if (pairs.length === 0) {
        console.log('No gallery memberships found inside Media.galleries[]; nothing to migrate.');
        await mongoose.disconnect();
        return;
    }

    console.log('Found ' + pairs.length + ' distinct gallery slug(s) referenced by media documents.\n');

    //Resolve the next free sortOrder so newly migrated galleries land at the bottom of the list
    //rather than colliding with anything an admin has already laid out.
    const lastGallery = await Gallery.find({}).sort({ sortOrder: -1 }).limit(1).lean();
    let nextSort = (lastGallery.length > 0 && typeof lastGallery[0].sortOrder === 'number')
        ? lastGallery[0].sortOrder + 1
        : 1;

    let inserted = 0;
    let unchanged = 0;
    for (const pair of pairs) {
        //Skip pairs whose slug doesn't normalize to anything useful.
        const slug = String(pair._id);
        if (!slug) continue;
        //Re-derive a clean slug just in case the legacy data carries non-standard formatting.
        const normalizedSlug = toSlug(slug) || slug;
        //Pick a title — prefer the encountered galleryName; fall back to the slug itself if missing.
        const title = pair.galleryName ? String(pair.galleryName) : normalizedSlug;

        //Look up first so I can preserve any admin-set fields on a re-run rather than blindly upserting.
        const existing = await Gallery.findOne({ slug: normalizedSlug }).lean();
        if (existing) {
            console.log('  - ' + normalizedSlug + ': already exists (' + pair.count + ' member(s))');
            unchanged++;
            continue;
        }

        //Create a new gallery with sensible defaults — visible, append-to-end sortOrder, blank description.
        await Gallery.create({
            slug: normalizedSlug,
            title: title,
            description: '',
            display: true,
            sortOrder: nextSort
        });
        console.log('  + ' + normalizedSlug + ' ("' + title + '"): created at sortOrder=' + nextSort + ' (' + pair.count + ' member(s))');
        nextSort++;
        inserted++;
    }

    console.log('\nMigration complete. ' + inserted + ' inserted, ' + unchanged + ' unchanged.');
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
}

//Surface any error with a non-zero exit so CI/scripted runs don't pretend to succeed silently.
migrate().catch(function (error) {
    console.error('Gallery migration failed:', error);
    process.exit(1);
});
