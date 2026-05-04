//Load environment variables from the encrypted .env file via dotenvx.
require('@dotenvx/dotenvx').config();

//Express HTTP framework.
const express = require('express');
//Node path module for safe filesystem path joins.
const path = require('path');
//Cookie parser so JWT cookies are accessible via req.cookies.
const cookieParser = require('cookie-parser');
//JWT library for verifying admin session tokens on the page-serving routes.
const jwt = require('jsonwebtoken');
//Mongoose connection helper.
const connectDB = require('./backend/config/connectDB');
//Centralized error-handling middleware.
const errorHandler = require('./backend/middleware/errorHandler');

//Import the route modules I'll mount below.
const publicRoutes = require('./backend/routes/publicRoutes');
//Auth routes (login/logout/session).
const authRoutes = require('./backend/routes/authRoutes');
//Media CRUD + upload routes.
const mediaRoutes = require('./backend/routes/mediaRoutes');
//Services CRUD routes.
const servicesRoutes = require('./backend/routes/servicesRoutes');
//What's New CRUD routes.
const whatsNewRoutes = require('./backend/routes/whatsNewRoutes');
//Galleries CRUD + membership routes.
const galleriesRoutes = require('./backend/routes/galleriesRoutes');

//Listen port, defaulting to 3000 when not set in the environment.
const PORT = process.env.PORT || 3000;
//JWT signing secret with a fallback so dev still works without the env file.
const JWT_SECRET = process.env.JWT_SECRET || 'papis_pictures_jwt_secret';

//Build the Express application.
const app = express();

//Open the MongoDB connection through Mongoose.
connectDB();

//Parse JSON request bodies with a 1 MB limit to prevent oversized payloads.
app.use(express.json({ limit: '1mb' }));

//Parse cookies so JWT tokens in httpOnly cookies are available via req.cookies.
app.use(cookieParser());

//Serve static files from the public directory (portfolio, admin panel, login page).
app.use(express.static(path.join(__dirname, 'public')));

//Serve static assets from the assets directory (logos, thumbnails, videos).
app.use('/assets', express.static(path.join(__dirname, 'assets')));

//Serve thumbnail files from the media/thumbnails directory.
app.use('/thumbnails', express.static(path.join(__dirname, 'media', 'thumbnails')));

//Serve display media files from the media/media_display directory.
app.use('/media', express.static(path.join(__dirname, 'media', 'media_display')));

//Serve the SortableJS library from node_modules so the admin panel can use it without a bundler.
app.get('/vendor/Sortable.min.js', function (req, res) {
    //Stream the library straight off disk.
    res.sendFile(path.join(__dirname, 'node_modules', 'sortablejs', 'Sortable.min.js'));
});

//Galleries page. Plain static serve — the cleaner /galleries URL is preferred over
///galleries.html, which would also work via the public static mount but exposes the extension.
app.get('/galleries', function (req, res) {
    res.sendFile(path.join(__dirname, 'public', 'galleries.html'));
});

//Login page. If the request already has a valid JWT, bounce admins to /admin and
//customer-tier accounts to / so neither sees the login form again.
app.get('/login', function (req, res) {
    try {
        //Pull the token off the cookie jar.
        var token = req.cookies && req.cookies.token;
        if (token) {
            //Throws if the token is bad/expired; on success the user is already logged in.
            var decoded = jwt.verify(token, JWT_SECRET);
            //Admins go to the admin panel; everyone else goes to the homepage.
            return res.redirect(decoded.accountType === 'admin' ? '/admin' : '/');
        }
    } catch (e) {
        //Token invalid or expired — fall through and show the login page.
    }
    //Default path: serve the login HTML.
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

//Admin login page. Same redirect logic as /login (already-logged-in users skip the form),
//but serves a separate HTML file with no register link because admin accounts are only
//ever created by other admins through the query shell or future user-management UI.
app.get('/admin/login', function (req, res) {
    try {
        //Pull the token off the cookie jar.
        var token = req.cookies && req.cookies.token;
        if (token) {
            //Throws if bad/expired; otherwise the user already has a session.
            var decoded = jwt.verify(token, JWT_SECRET);
            //Admins go to the admin panel; non-admin sessions go to / since this form is irrelevant to them.
            return res.redirect(decoded.accountType === 'admin' ? '/admin' : '/');
        }
    } catch (e) {
        //Token invalid or expired — fall through and show the admin login page.
    }
    //Default path: serve the admin login HTML.
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

//Registration page. If a valid JWT is already present, redirect away from the form.
//Admins go to /admin, non-admin sessions go to / — the form is only useful when logged out.
app.get('/register', function (req, res) {
    try {
        //Pull the token off the cookie jar.
        var token = req.cookies && req.cookies.token;
        if (token) {
            //Throws if bad/expired; otherwise we know the user already has a session.
            var decoded = jwt.verify(token, JWT_SECRET);
            //Send them to the right place based on role.
            return res.redirect(decoded.accountType === 'admin' ? '/admin' : '/');
        }
    } catch (e) {
        //Token invalid or expired — fall through and show the register page.
    }
    //Default path: serve the register HTML.
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

//Admin panel. Requires a valid JWT AND accountType === 'admin'; otherwise sends to login.
app.get('/admin', function (req, res) {
    try {
        //Pull the token off the cookie jar.
        var token = req.cookies && req.cookies.token;
        if (token) {
            //Throws if the token is bad/expired.
            var decoded = jwt.verify(token, JWT_SECRET);
            //Token is good and the user is an admin — serve the admin HTML.
            if (decoded.accountType === 'admin') {
                return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
            }
        }
    } catch (e) {
        //Token invalid or expired — fall through and redirect.
    }
    //Default path: send the user to the admin login page (not the customer login).
    res.redirect('/admin/login');
});

//Mount API routes. publicRoutes and authRoutes both mount at /api but have no overlapping
//paths. publicRoutes is mounted first so unauthenticated portfolio requests are matched first.
app.use('/api', publicRoutes);
//Auth routes (login/logout/session).
app.use('/api', authRoutes);
//Media CRUD + upload endpoints.
app.use('/api/media', mediaRoutes);
//Services CRUD endpoints.
app.use('/api/services', servicesRoutes);
//What's New CRUD endpoints.
app.use('/api/whats-new', whatsNewRoutes);
//Galleries endpoints (public list + per-gallery media; admin CRUD/membership all gated by auth inside the router).
app.use('/api/galleries', galleriesRoutes);

//GET /api/schema — Return database schema definitions and document counts. Requires authentication.
const requireAuth = require('./backend/middleware/requireAuth');
//Media model.
const Media = require('./backend/models/Media');
//What's New model.
const WhatsNew = require('./backend/models/WhatsNew');
//Services / licensing model.
const LicensingAndService = require('./backend/models/LicensingAndService');
//Gallery model.
const Gallery = require('./backend/models/Gallery');
//User model.
const User = require('./backend/models/User');

//Schema introspection endpoint used by the admin panel's schema viewer.
app.get('/api/schema', requireAuth, async function (req, res) {
    try {
        //Extract schema fields from a Mongoose model's paths object.
        //Mongoose flattens inline objects into dotted paths (e.g., "metadata.cameraMake").
        //This function groups them back into nested structures to match the model definition.
        function extractFields(schemaPaths) {
            //Top-level fields collected so far.
            var topLevel = [];
            //Map of parent name -> nested children, populated as I encounter dotted paths.
            var groups = {};

            for (var key in schemaPaths) {
                //Skip Mongoose internals.
                if (key === '__v' || key === '_id') continue;
                //Pull the SchemaType instance for this path.
                var schemaType = schemaPaths[key];

                //Check if this is a dotted path (e.g., "metadata.cameraMake").
                var dotIndex = key.indexOf('.');
                if (dotIndex !== -1) {
                    //Split the path into parent group and child field name.
                    var parent = key.substring(0, dotIndex);
                    var child = key.substring(dotIndex + 1);
                    //Lazy-create the group bucket.
                    if (!groups[parent]) groups[parent] = [];
                    //Build the child field descriptor.
                    var childInfo = { name: child };
                    //Prefer the SchemaType's instance string (e.g., 'String'); fall back to Mixed.
                    if (schemaType.instance) childInfo.type = schemaType.instance;
                    else childInfo.type = 'Mixed';
                    if (schemaType.options) {
                        //Surface the standard schema flags so the admin UI can label them.
                        if (schemaType.options.required) childInfo.required = true;
                        //Unique constraint flag.
                        if (schemaType.options.unique) childInfo.unique = true;
                        //Default value, stringified for display.
                        if (schemaType.options.default !== undefined) childInfo.defaultValue = String(schemaType.options.default);
                    }
                    //Push into the parent group and skip the top-level branch below.
                    groups[parent].push(childInfo);
                    continue;
                }

                //Build the top-level field descriptor.
                var fieldInfo = { name: key };

                if (schemaType.schema) {
                    //Subdocument array — recurse to extract nested fields.
                    fieldInfo.type = '[Object]';
                    //Recursively descend into the nested schema.
                    fieldInfo.nested = extractFields(schemaType.schema.paths);
                } else if (schemaType.options && schemaType.options.type && Array.isArray(schemaType.options.type)) {
                    //Plain typed array (e.g., [String]).
                    fieldInfo.type = '[' + (schemaType.options.type[0].name || 'Mixed') + ']';
                } else if (schemaType.instance) {
                    //Standard scalar type.
                    fieldInfo.type = schemaType.instance;
                } else {
                    //Fallback when Mongoose can't classify it.
                    fieldInfo.type = 'Mixed';
                }

                if (schemaType.options) {
                    //Surface the standard schema flags.
                    if (schemaType.options.required) fieldInfo.required = true;
                    //Unique constraint flag.
                    if (schemaType.options.unique) fieldInfo.unique = true;
                    //Default value, stringified for display.
                    if (schemaType.options.default !== undefined) fieldInfo.defaultValue = String(schemaType.options.default);
                }

                //Push into the top-level list.
                topLevel.push(fieldInfo);
            }

            //Attach grouped nested fields to their parent.
            for (var group in groups) {
                //Find the parent in topLevel, or create one if it didn't have its own scalar entry.
                var existing = topLevel.find(function (f) { return f.name === group; });
                if (existing) {
                    //Hang the children off the existing parent.
                    existing.nested = groups[group];
                    //Promote the type from Mixed to Object now that I know it has structure.
                    if (!existing.type || existing.type === 'Mixed') existing.type = 'Object';
                } else {
                    //No top-level entry yet — synthesize one.
                    topLevel.push({ name: group, type: 'Object', nested: groups[group] });
                }
            }

            //Hand the assembled descriptor list back.
            return topLevel;
        }

        //Get document counts in parallel for the five tracked collections.
        var counts = await Promise.all([
            //Media count.
            Media.countDocuments(),
            //What's New count.
            WhatsNew.countDocuments(),
            //Services / licensing count.
            LicensingAndService.countDocuments(),
            //Galleries count.
            Gallery.countDocuments(),
            //User count.
            User.countDocuments()
        ]);

        //Build the response payload: one descriptor per collection with name, doc count, and fields.
        var collections = [
            { name: 'Media', collection: 'media', docCount: counts[0], fields: extractFields(Media.schema.paths) },
            { name: 'WhatsNew', collection: 'whats_new', docCount: counts[1], fields: extractFields(WhatsNew.schema.paths) },
            { name: 'LicensingAndService', collection: 'licensing_and_services', docCount: counts[2], fields: extractFields(LicensingAndService.schema.paths) },
            { name: 'Gallery', collection: 'galleries', docCount: counts[3], fields: extractFields(Gallery.schema.paths) },
            { name: 'User', collection: 'users', docCount: counts[4], fields: extractFields(User.schema.paths) }
        ];

        //Return the descriptor list as JSON.
        res.json(collections);
    } catch (error) {
        //Generic 500 on any introspection failure.
        res.status(500).json({ error: 'Failed to retrieve schema' });
    }
});

//POST /api/query — Execute a MongoDB query against a collection. Requires authentication.
//Supported operations: find, findOne, countDocuments, aggregate, insertOne, updateOne, updateMany, deleteOne, deleteMany.
app.post('/api/query', requireAuth, async function (req, res) {
    try {
        //Pull the request body and the two key dispatch fields.
        var body = req.body;
        //Target collection name from the client.
        var collectionName = body.collection;
        //Operation name from the client.
        var operation = body.operation;

        //Whitelist allowed collections so the client can't poke at arbitrary models.
        var modelMap = {
            media: Media,
            whats_new: WhatsNew,
            licensing_and_services: LicensingAndService,
            galleries: Gallery,
            users: User
        };

        //Resolve the collection name to a Mongoose model.
        var Model = modelMap[collectionName];
        if (!Model) {
            //Reject anything that doesn't map to a known model.
            return res.status(400).json({ error: 'Invalid collection: ' + collectionName });
        }

        //Whitelist allowed operations to keep the surface area small.
        var allowedOps = ['find', 'findOne', 'countDocuments', 'aggregate', 'insertOne', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany'];
        if (allowedOps.indexOf(operation) === -1) {
            //Reject anything not in the whitelist.
            return res.status(400).json({ error: 'Invalid operation: ' + operation });
        }

        //Filter doc / pipeline / insert document depending on operation.
        var filter = body.filter || {};
        //Update doc for update operations.
        var update = body.update || {};
        //Optional projection for find/findOne.
        var projection = body.projection || null;
        //Optional sort for find.
        var sort = body.sort || null;
        //Clamp the limit to a sane range so a runaway query can't dump the whole collection.
        var limit = Math.min(Math.max(parseInt(body.limit) || 20, 1), 1000);
        //Holds the final result regardless of which branch ran.
        var result;

        switch (operation) {
            case 'find': {
                //Build the query and apply the optional modifiers.
                var query = Model.find(filter);
                //Apply projection if supplied.
                if (projection) query = query.select(projection);
                //Apply sort if supplied.
                if (sort) query = query.sort(sort);
                //Always cap with the clamped limit and return plain objects via lean().
                query = query.limit(limit).lean();
                //Execute.
                result = await query;
                break;
            }
            case 'findOne': {
                //Build the single-doc query and apply optional projection.
                var query = Model.findOne(filter);
                //Apply projection if supplied.
                if (projection) query = query.select(projection);
                //Plain object response.
                query = query.lean();
                //Execute.
                result = await query;
                break;
            }
            case 'countDocuments': {
                //Simple count against the filter.
                result = await Model.countDocuments(filter);
                break;
            }
            case 'aggregate': {
                //filter is used as the pipeline array for aggregate.
                var pipeline = Array.isArray(filter) ? filter : [filter];
                //Execute the pipeline.
                result = await Model.aggregate(pipeline);
                break;
            }
            case 'insertOne': {
                //Create the document; filter is reused as the doc body.
                result = await Model.create(filter);
                //Convert from a Mongoose document into a plain object for the response.
                result = result.toObject();
                break;
            }
            case 'updateOne': {
                //Update a single matching document.
                result = await Model.updateOne(filter, update);
                break;
            }
            case 'updateMany': {
                //Update every matching document.
                result = await Model.updateMany(filter, update);
                break;
            }
            case 'deleteOne': {
                //Delete a single matching document.
                result = await Model.deleteOne(filter);
                break;
            }
            case 'deleteMany': {
                //Delete every matching document.
                result = await Model.deleteMany(filter);
                break;
            }
        }

        //Wrap the operation result in a stable envelope for the client.
        res.json({ result: result });
    } catch (error) {
        //Surface validation/syntax errors with a 400.
        res.status(400).json({ error: error.message });
    }
});

//Error-handling middleware — must be the last app.use().
app.use(errorHandler);

//Start the HTTP listener.
app.listen(PORT, function () {
    //Log the URL so I can click straight into it from the terminal.
    console.log('Server is running on http://localhost:' + PORT);
});
