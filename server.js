require('@dotenvx/dotenvx').config();

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const connectDB = require('./backend/config/connectDB');
const errorHandler = require('./backend/middleware/errorHandler');

const publicRoutes = require('./backend/routes/publicRoutes');
const authRoutes = require('./backend/routes/authRoutes');
const mediaRoutes = require('./backend/routes/mediaRoutes');
const servicesRoutes = require('./backend/routes/servicesRoutes');
const whatsNewRoutes = require('./backend/routes/whatsNewRoutes');
const galleriesRoutes = require('./backend/routes/galleriesRoutes');
const archiveRoutes = require('./backend/routes/archiveRoutes');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'papis_pictures_jwt_secret';

const app = express();

connectDB();

app.use(express.json({ limit: '1mb' }));

app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));

app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.use('/thumbnails', express.static(path.join(__dirname, 'media', 'thumbnails')));

app.use('/media', express.static(path.join(__dirname, 'media', 'media_display')));

app.get('/vendor/Sortable.min.js', function (req, res) {
    res.sendFile(path.join(__dirname, 'node_modules', 'sortablejs', 'Sortable.min.js'));
});

app.get('/galleries', function (req, res) {
    res.sendFile(path.join(__dirname, 'public', 'galleries.html'));
});

app.get('/archive', function (req, res) {
    res.sendFile(path.join(__dirname, 'public', 'archive.html'));
});

app.get('/login', function (req, res) {
    try {
        var token = req.cookies && req.cookies.token;
        if (token) {
            var decoded = jwt.verify(token, JWT_SECRET);
            return res.redirect(decoded.accountType === 'admin' ? '/admin' : '/');
        }
    } catch (e) {
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/admin/login', function (req, res) {
    try {
        var token = req.cookies && req.cookies.token;
        if (token) {
            var decoded = jwt.verify(token, JWT_SECRET);
            return res.redirect(decoded.accountType === 'admin' ? '/admin' : '/');
        }
    } catch (e) {
    }
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get('/register', function (req, res) {
    try {
        var token = req.cookies && req.cookies.token;
        if (token) {
            var decoded = jwt.verify(token, JWT_SECRET);
            return res.redirect(decoded.accountType === 'admin' ? '/admin' : '/');
        }
    } catch (e) {
    }
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/admin', function (req, res) {
    try {
        var token = req.cookies && req.cookies.token;
        if (token) {
            var decoded = jwt.verify(token, JWT_SECRET);
            if (decoded.accountType === 'admin') {
                return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
            }
        }
    } catch (e) {
    }
    res.redirect('/admin/login');
});

app.use('/api', publicRoutes);
app.use('/api', authRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/whats-new', whatsNewRoutes);
app.use('/api/galleries', galleriesRoutes);
app.use('/api/archive', archiveRoutes);

const requireAuth = require('./backend/middleware/requireAuth');
const Media = require('./backend/models/Media');
const WhatsNew = require('./backend/models/WhatsNew');
const LicensingAndService = require('./backend/models/LicensingAndService');
const Gallery = require('./backend/models/Gallery');
const User = require('./backend/models/User');

app.get('/api/schema', requireAuth, async function (req, res) {
    try {
        function extractFields(schemaPaths) {
            var topLevel = [];
            var groups = {};

            for (var key in schemaPaths) {
                if (key === '__v' || key === '_id') continue;
                var schemaType = schemaPaths[key];

                var dotIndex = key.indexOf('.');
                if (dotIndex !== -1) {
                    var parent = key.substring(0, dotIndex);
                    var child = key.substring(dotIndex + 1);
                    if (!groups[parent]) groups[parent] = [];
                    var childInfo = { name: child };
                    if (schemaType.instance) childInfo.type = schemaType.instance;
                    else childInfo.type = 'Mixed';
                    if (schemaType.options) {
                        if (schemaType.options.required) childInfo.required = true;
                        if (schemaType.options.unique) childInfo.unique = true;
                        if (schemaType.options.default !== undefined) childInfo.defaultValue = String(schemaType.options.default);
                    }
                    groups[parent].push(childInfo);
                    continue;
                }

                var fieldInfo = { name: key };

                if (schemaType.schema) {
                    fieldInfo.type = '[Object]';
                    fieldInfo.nested = extractFields(schemaType.schema.paths);
                } else if (schemaType.options && schemaType.options.type && Array.isArray(schemaType.options.type)) {
                    fieldInfo.type = '[' + (schemaType.options.type[0].name || 'Mixed') + ']';
                } else if (schemaType.instance) {
                    fieldInfo.type = schemaType.instance;
                } else {
                    fieldInfo.type = 'Mixed';
                }

                if (schemaType.options) {
                    if (schemaType.options.required) fieldInfo.required = true;
                    if (schemaType.options.unique) fieldInfo.unique = true;
                    if (schemaType.options.default !== undefined) fieldInfo.defaultValue = String(schemaType.options.default);
                }

                topLevel.push(fieldInfo);
            }

            for (var group in groups) {
                var existing = topLevel.find(function (f) { return f.name === group; });
                if (existing) {
                    existing.nested = groups[group];
                    if (!existing.type || existing.type === 'Mixed') existing.type = 'Object';
                } else {
                    topLevel.push({ name: group, type: 'Object', nested: groups[group] });
                }
            }

            return topLevel;
        }

        var counts = await Promise.all([
            Media.countDocuments(),
            WhatsNew.countDocuments(),
            LicensingAndService.countDocuments(),
            Gallery.countDocuments(),
            User.countDocuments()
        ]);

        var collections = [
            { name: 'Media', collection: 'media', docCount: counts[0], fields: extractFields(Media.schema.paths) },
            { name: 'WhatsNew', collection: 'whats_new', docCount: counts[1], fields: extractFields(WhatsNew.schema.paths) },
            { name: 'LicensingAndService', collection: 'licensing_and_services', docCount: counts[2], fields: extractFields(LicensingAndService.schema.paths) },
            { name: 'Gallery', collection: 'galleries', docCount: counts[3], fields: extractFields(Gallery.schema.paths) },
            { name: 'User', collection: 'users', docCount: counts[4], fields: extractFields(User.schema.paths) }
        ];

        res.json(collections);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve schema' });
    }
});

app.post('/api/query', requireAuth, async function (req, res) {
    try {
        var body = req.body;
        var collectionName = body.collection;
        var operation = body.operation;

        var modelMap = {
            media: Media,
            whats_new: WhatsNew,
            licensing_and_services: LicensingAndService,
            galleries: Gallery,
            users: User
        };

        var Model = modelMap[collectionName];
        if (!Model) {
            return res.status(400).json({ error: 'Invalid collection: ' + collectionName });
        }

        var allowedOps = ['find', 'findOne', 'countDocuments', 'aggregate', 'insertOne', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany'];
        if (allowedOps.indexOf(operation) === -1) {
            return res.status(400).json({ error: 'Invalid operation: ' + operation });
        }

        var filter = body.filter || {};
        var update = body.update || {};
        var projection = body.projection || null;
        var sort = body.sort || null;
        var limit = Math.min(Math.max(parseInt(body.limit) || 20, 1), 1000);
        var result;

        switch (operation) {
            case 'find': {
                var query = Model.find(filter);
                if (projection) query = query.select(projection);
                if (sort) query = query.sort(sort);
                query = query.limit(limit).lean();
                result = await query;
                break;
            }
            case 'findOne': {
                var query = Model.findOne(filter);
                if (projection) query = query.select(projection);
                query = query.lean();
                result = await query;
                break;
            }
            case 'countDocuments': {
                result = await Model.countDocuments(filter);
                break;
            }
            case 'aggregate': {
                var pipeline = Array.isArray(filter) ? filter : [filter];
                result = await Model.aggregate(pipeline);
                break;
            }
            case 'insertOne': {
                result = await Model.create(filter);
                result = result.toObject();
                break;
            }
            case 'updateOne': {
                result = await Model.updateOne(filter, update);
                break;
            }
            case 'updateMany': {
                result = await Model.updateMany(filter, update);
                break;
            }
            case 'deleteOne': {
                result = await Model.deleteOne(filter);
                break;
            }
            case 'deleteMany': {
                result = await Model.deleteMany(filter);
                break;
            }
        }

        res.json({ result: result });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.use(errorHandler);

app.listen(PORT, function () {
    console.log('Server is running on http://localhost:' + PORT);
});
