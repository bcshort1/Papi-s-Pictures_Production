const mongoose = require('mongoose');
const Media = require('../backend/models/Media');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/papis_pictures';

async function migrate() {
    console.log('Connecting to MongoDB at ' + MONGO_URI + '...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected.\n');

    const saleResult = await Media.updateMany(
        { availableForSale: { $exists: false } },
        { $set: { availableForSale: false } }
    );
    console.log('Set availableForSale=false where missing: matched ' + saleResult.matchedCount + ', modified ' + saleResult.modifiedCount);

    const licenseResult = await Media.updateMany(
        { availableForLicense: { $exists: false } },
        { $set: { availableForLicense: false } }
    );
    console.log('Set availableForLicense=false where missing: matched ' + licenseResult.matchedCount + ', modified ' + licenseResult.modifiedCount);

    await mongoose.disconnect();
    console.log('\nDone.');
}

migrate().catch(function (err) {
    console.error(err);
    process.exit(1);
});
