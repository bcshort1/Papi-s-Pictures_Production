require('@dotenvx/dotenvx').config({ quiet: true });

const mongoose = require('mongoose');
const Media = require('../backend/models/Media');
const Gallery = require('../backend/models/Gallery');
const { toSlug } = require('../backend/utils/helpers');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/papis_pictures';

async function migrate() {
    console.log('Connecting to MongoDB at ' + MONGO_URI + '...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected.\n');

    const pairs = await Media.aggregate([
        { $match: { galleries: { $exists: true, $ne: [] } } },
        { $unwind: '$galleries' },
        { $group: {
            _id: '$galleries.gallerySlug',
            galleryName: { $first: '$galleries.galleryName' },
            count: { $sum: 1 }
        } },
        { $match: { _id: { $ne: null } } },
        { $sort: { _id: 1 } }
    ]);

    if (pairs.length === 0) {
        console.log('No gallery memberships found inside Media.galleries[]; nothing to migrate.');
        await mongoose.disconnect();
        return;
    }

    console.log('Found ' + pairs.length + ' distinct gallery slug(s) referenced by media documents.\n');

    const lastGallery = await Gallery.find({}).sort({ sortOrder: -1 }).limit(1).lean();
    let nextSort = (lastGallery.length > 0 && typeof lastGallery[0].sortOrder === 'number')
        ? lastGallery[0].sortOrder + 1
        : 1;

    let inserted = 0;
    let unchanged = 0;
    for (const pair of pairs) {
        const slug = String(pair._id);
        if (!slug) continue;
        const normalizedSlug = toSlug(slug) || slug;
        const title = pair.galleryName ? String(pair.galleryName) : normalizedSlug;

        const existing = await Gallery.findOne({ slug: normalizedSlug }).lean();
        if (existing) {
            console.log('  - ' + normalizedSlug + ': already exists (' + pair.count + ' member(s))');
            unchanged++;
            continue;
        }

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

migrate().catch(function (error) {
    console.error('Gallery migration failed:', error);
    process.exit(1);
});
