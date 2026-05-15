const mongoose = require('mongoose');
const Gallery = require('../backend/models/Gallery');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/papis_pictures';
const FEATURED_SLUG = 'featured';
const FEATURED_TITLE = 'Featured';

async function migrate() {
    console.log('Connecting to MongoDB at ' + MONGO_URI + '...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected.\n');

    const db = mongoose.connection.db;
    const mediaCollection = db.collection('media');

    let gallery = await Gallery.findOne({ slug: FEATURED_SLUG }).lean();
    if (!gallery) {
        const lastGallery = await Gallery.find({}).sort({ sortOrder: -1 }).limit(1).lean();
        const nextSort = (lastGallery.length > 0 && typeof lastGallery[0].sortOrder === 'number')
            ? lastGallery[0].sortOrder + 1
            : 1;
        const created = await Gallery.create({
            slug: FEATURED_SLUG,
            title: FEATURED_TITLE,
            description: 'Items shown on the homepage Featured section.',
            display: false,
            sortOrder: nextSort
        });
        gallery = created.toObject();
        console.log('Created hidden "Featured" gallery (slug=' + FEATURED_SLUG + ').');
    } else {
        console.log('Featured gallery already exists (slug=' + FEATURED_SLUG + ').');
    }

    const featuredDocs = await mediaCollection
        .find({ featured: true })
        .sort({ capturedAt: -1 })
        .toArray();

    console.log('\nFound ' + featuredDocs.length + ' media document(s) with featured=true.');

    let added = 0;
    let alreadyMember = 0;
    for (let i = 0; i < featuredDocs.length; i++) {
        const doc = featuredDocs[i];
        const galleries = Array.isArray(doc.galleries) ? doc.galleries : [];
        const isMember = galleries.some(function (g) { return g && g.gallerySlug === FEATURED_SLUG; });
        if (isMember) {
            alreadyMember++;
            continue;
        }
        await mediaCollection.updateOne(
            { _id: doc._id },
            {
                $push: {
                    galleries: {
                        gallerySlug: FEATURED_SLUG,
                        galleryName: FEATURED_TITLE,
                        galleryPosition: i + 1
                    }
                }
            }
        );
        added++;
    }

    console.log('  Added to "featured" gallery: ' + added);
    console.log('  Already members:           ' + alreadyMember);

    const cleanup = await mediaCollection.updateMany(
        {
            $or: [
                { featured: { $exists: true } },
                { showOnHomepage: { $exists: true } },
                { homepageSortOrder: { $exists: true } }
            ]
        },
        {
            $unset: {
                featured: '',
                showOnHomepage: '',
                homepageSortOrder: ''
            }
        }
    );
    console.log('\nUnset legacy fields on ' + cleanup.modifiedCount + ' document(s).');

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
    console.log('Migration complete.');
}

migrate().catch(function (error) {
    console.error('Featured-to-gallery migration failed:', error);
    process.exit(1);
});
