//Load environment variables from the encrypted .env file via dotenvx so MONGO_URI is available
//for the database export step. This is a no-op if dotenvx already populated process.env.
require('@dotenvx/dotenvx').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const BACKUP_ROOT = path.join(PROJECT_ROOT, 'backup');

//Directories and files to include in the source-code portion of the backup.
const INCLUDE = ['server.js', 'package.json', 'package-lock.json', 'backend', 'public', 'scripts'];

//Directories to exclude (even if nested inside included directories).
const EXCLUDE = ['node_modules', 'media', '.env.keys', 'backup'];

//MongoDB collections to export. The "users" collection is intentionally omitted so bcrypt
//password hashes are not committed to the backup; admin user creation lives in seed.js.
const COLLECTIONS_TO_EXPORT = ['media', 'licensing_and_services', 'whats_new'];

//Build a timestamp string for the backup folder name (YYYY-MM-DD_HHmmss).
function buildTimestamp() {
    const now = new Date();
    const pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
           '_' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
}

//Recursively copy a directory, skipping excluded folder names.
function copyDirSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        if (EXCLUDE.includes(entry.name)) continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

//Copy the source-code portion of the backup.
function backupSourceFiles(backupDir) {
    for (const item of INCLUDE) {
        const srcPath = path.join(PROJECT_ROOT, item);
        if (!fs.existsSync(srcPath)) {
            console.log('  Skipping (not found): ' + item);
            continue;
        }
        const destPath = path.join(backupDir, item);
        const stat = fs.statSync(srcPath);
        if (stat.isDirectory()) {
            copyDirSync(srcPath, destPath);
            console.log('  Copied directory: ' + item);
        } else {
            fs.copyFileSync(srcPath, destPath);
            console.log('  Copied file: ' + item);
        }
    }
}

//Export each whitelisted MongoDB collection to JSON via mongoexport. Each collection becomes
//its own file in <backupDir>/db/<collection>.json using MongoDB Extended JSON, which the seed
//script knows how to convert back to native types.
function backupDatabase(backupDir) {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.log('  Skipping DB export: MONGO_URI is not set in the environment.');
        return;
    }

    //Confirm mongoexport is on the PATH before attempting any exports.
    try {
        execFileSync('mongoexport', ['--version'], { stdio: 'ignore' });
    } catch (e) {
        console.log('  Skipping DB export: mongoexport binary not found. Install MongoDB Database Tools to enable.');
        return;
    }

    const dbDir = path.join(backupDir, 'db');
    fs.mkdirSync(dbDir, { recursive: true });

    for (const collection of COLLECTIONS_TO_EXPORT) {
        const outFile = path.join(dbDir, collection + '.json');
        try {
            execFileSync('mongoexport', [
                '--uri=' + mongoUri,
                '--collection=' + collection,
                '--out=' + outFile,
                '--jsonArray',
                '--pretty'
            ], { stdio: ['ignore', 'ignore', 'inherit'] });
            console.log('  Exported collection: ' + collection);
        } catch (e) {
            console.error('  Failed to export collection ' + collection + ': ' + e.message);
        }
    }
}

function runBackup() {
    const timestamp = buildTimestamp();
    const backupDir = path.join(BACKUP_ROOT, timestamp);

    console.log('Creating backup at ' + backupDir + '...');
    fs.mkdirSync(backupDir, { recursive: true });

    console.log('Backing up source files...');
    backupSourceFiles(backupDir);

    console.log('Exporting MongoDB collections...');
    backupDatabase(backupDir);

    console.log('Backup complete: ' + backupDir);
}

runBackup();
