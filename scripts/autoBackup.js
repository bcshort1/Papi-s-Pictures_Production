const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const BACKUP_ROOT = path.join(PROJECT_ROOT, 'backup');

const INCLUDE = ['server.js', 'package.json', 'package-lock.json', 'backend', 'public', 'scripts'];

const EXCLUDE = ['node_modules', 'media', '.env.keys', 'backup'];

const COLLECTIONS_TO_EXPORT = ['media', 'licensing_and_services', 'whats_new'];

function buildTimestamp() {
    const now = new Date();
    const pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
           '_' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
}

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

function backupDatabase(backupDir) {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.log('  Skipping DB export: MONGO_URI is not set in the environment.');
        return;
    }

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
