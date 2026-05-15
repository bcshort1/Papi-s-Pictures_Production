const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Media = require('../backend/models/Media');
const LicensingAndService = require('../backend/models/LicensingAndService');
const WhatsNew = require('../backend/models/WhatsNew');
const User = require('../backend/models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/papis_pictures';
const BACKUP_ROOT = path.join(__dirname, '..', 'backup');

const COLLECTION_MAP = {
    media: { model: Media, label: 'Media' },
    licensing_and_services: { model: LicensingAndService, label: 'Licensing & Services' },
    whats_new: { model: WhatsNew, label: "What's New" }
};

function resolveBackupDir() {
    const explicit = process.argv[2];
    if (explicit) {
        const explicitPath = path.isAbsolute(explicit) ? explicit : path.join(BACKUP_ROOT, explicit);
        if (!fs.existsSync(path.join(explicitPath, 'db'))) {
            throw new Error('Specified backup has no db/ subdirectory: ' + explicitPath);
        }
        return explicitPath;
    }

    if (!fs.existsSync(BACKUP_ROOT)) {
        throw new Error('No backup/ directory found. Run `npm run backup` first.');
    }

    const candidates = fs.readdirSync(BACKUP_ROOT, { withFileTypes: true })
        .filter(function (entry) { return entry.isDirectory(); })
        .map(function (entry) { return entry.name; })
        .filter(function (name) { return fs.existsSync(path.join(BACKUP_ROOT, name, 'db')); })
        .sort();

    if (candidates.length === 0) {
        throw new Error('No backup folders with a db/ export were found under ' + BACKUP_ROOT);
    }

    return path.join(BACKUP_ROOT, candidates[candidates.length - 1]);
}

function convertExtendedJSON(object) {
    if (object === null || object === undefined) return object;
    if (Array.isArray(object)) return object.map(convertExtendedJSON);
    if (typeof object !== 'object') return object;

    if (object.$oid) return new mongoose.Types.ObjectId(object.$oid);
    if (object.$date) return new Date(object.$date);
    if (object.$numberDecimal !== undefined) return parseFloat(object.$numberDecimal);
    if (object.$numberLong !== undefined) return Number(object.$numberLong);
    if (object.$numberInt !== undefined) return Number(object.$numberInt);

    const result = {};
    for (const [key, value] of Object.entries(object)) {
        result[key] = convertExtendedJSON(value);
    }
    return result;
}

function loadCollectionFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(convertExtendedJSON) : [convertExtendedJSON(parsed)];
}

async function upsertDocuments(Model, documents, label) {
    console.log(`Seeding ${documents.length} ${label} document(s)...`);
    let inserted = 0;
    let updated = 0;

    for (const document of documents) {
        const { _id, ...remainingFields } = document;
        if (!remainingFields.slug) {
            console.warn(`  Skipping ${label} document without a slug (cannot key upsert).`);
            continue;
        }
        const result = await Model.updateOne(
            { slug: remainingFields.slug },
            { $set: remainingFields },
            { upsert: true }
        );
        if (result.upsertedCount > 0) inserted++;
        else if (result.modifiedCount > 0) updated++;
    }

    console.log(`  ${label}: ${inserted} inserted, ${updated} updated, ${documents.length - inserted - updated} unchanged.`);
}

async function seed() {
    const backupDir = resolveBackupDir();
    const dbDir = path.join(backupDir, 'db');
    console.log(`Seeding from backup: ${backupDir}\n`);

    console.log(`Connecting to MongoDB at ${MONGO_URI}...`);
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB.\n');

    const filesInBackup = new Set(fs.readdirSync(dbDir).filter(function (f) { return f.endsWith('.json'); }));

    for (const [collectionName, entry] of Object.entries(COLLECTION_MAP)) {
        const fileName = collectionName + '.json';
        if (!filesInBackup.has(fileName)) {
            console.log(`Skipping ${entry.label}: ${fileName} not found in backup.`);
            continue;
        }
        const documents = loadCollectionFile(path.join(dbDir, fileName));
        await upsertDocuments(entry.model, documents, entry.label);
        filesInBackup.delete(fileName);
    }

    for (const leftover of filesInBackup) {
        console.warn(`Ignoring unmapped backup file: ${leftover}`);
    }

    console.log('\nSeeding admin users...');

    let adminUser = await User.findOne({ username: 'Admin' });
    if (!adminUser) {
        adminUser = new User({ username: 'Admin', password: 'Admin', accountType: 'admin' });
        await adminUser.save();
        console.log('  Admin user created. (Username: Admin, Password: Admin)');
    } else {
        adminUser.password = 'Admin';
        adminUser.accountType = 'admin';
        await adminUser.save();
        console.log('  Admin user already exists (updated).');
    }

    let svsuUser = await User.findOne({ username: 'svsu' });
    if (!svsuUser) {
        svsuUser = new User({ username: 'svsu', password: 'cardinal', accountType: 'admin' });
        await svsuUser.save();
        console.log('  svsu user created. (Username: svsu, Password: cardinal)');
    } else {
        svsuUser.password = 'cardinal';
        svsuUser.accountType = 'admin';
        await svsuUser.save();
        console.log('  svsu user already exists (updated).');
    }

    console.log('\nAll collections seeded successfully.');
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
}

seed().catch(function (error) {
    console.error('Seed failed:', error);
    process.exit(1);
});
