# Quality Assurance Testing Suite — Papi's Pictures

Set up and implement a comprehensive QA testing suite for this Node.js/Express 5 portfolio application that uses MongoDB/Mongoose, session-based authentication (express-session + connect-mongo), and media processing (sharp, fluent-ffmpeg, busboy, exifr).

## Technology Setup

Install the following dev dependencies:
- **jest** as the test runner
- **supertest** for HTTP/integration testing
- **mongodb-memory-server** for an in-memory MongoDB instance (no real DB needed)

Configure `package.json` with a `"test"` script using Jest. Create a `jest.config.js` at the project root. Create a shared test helper file at `tests/setup.js` that:
- Starts `mongodb-memory-server` before all tests
- Connects Mongoose to the in-memory URI
- Clears all collections between tests
- Disconnects and stops the server after all tests

All tests must use CommonJS (`require`/`module.exports`) to match the existing codebase.

---

## Phase 1 — Unit Testing

Create unit tests under `tests/unit/` for each isolated module. Mock all external dependencies (Mongoose models, fs, sharp, ffmpeg). Test pure logic only — no database, no HTTP.

### Files to test:

1. **`tests/unit/helpers.test.js`** — Test `backend/utils/helpers.js`:
   - `formatDate()` — valid dates, null/undefined, invalid input
   - `toSlug()` — normal titles, special characters, empty string
   - `toFileNameBase()` — spaces, special chars, empty/null
   - `toFileTimestamp()` — valid dates, null, invalid date strings
   - `buildMediaFileNames()` — photo vs video extensions, correct format
   - `hashPassword()` — consistent hashing, different inputs produce different hashes
   - `renameFileIfExists()` — mock fs: file exists, file missing, rename error

2. **`tests/unit/transforms.test.js`** — Test `backend/utils/transforms.js`:
   - `toRecentPicture()` — full document, missing optional fields, null metadata/location
   - All other transform functions — verify correct field mapping and default values

3. **`tests/unit/errorHandler.test.js`** — Test `backend/middleware/errorHandler.js`:
   - Duplicate key error (code 11000) returns 409
   - Mongoose ValidationError returns 400 with joined messages
   - Generic error returns 500 with appropriate message
   - Respects existing `res.statusCode` when >= 400

4. **`tests/unit/requireAuth.test.js`** — Test `backend/middleware/requireAuth.js`:
   - Calls `next()` when `req.session.user` exists
   - Returns 401 JSON when session is missing or has no user

5. **`tests/unit/mediaService.test.js`** — Test `backend/services/mediaService.js`:
   - `parseMultipart()` — mock busboy: valid upload, oversized upload rejection, invalid request
   - Image processing functions — mock sharp: verify resize, watermark overlay, thumbnail generation
   - Video processing functions — mock ffmpeg: verify transcoding pipeline calls
   - File size limit enforcement (500 MB max)

---

## Phase 2 — Integration Testing

Create integration tests under `tests/integration/` that use `mongodb-memory-server` and `supertest` against the real Express app. Test actual database reads/writes through the API layer. Seed test data in `beforeEach` blocks.

### Files to test:

1. **`tests/integration/auth.test.js`** — Test auth flow end-to-end:
   - `POST /api/login` — valid credentials set session, invalid credentials return 401, missing fields return 400
   - `POST /api/logout` — destroys session, clears cookie
   - `GET /api/session` — returns session info when authenticated, returns appropriate response when not
   - Verify session cookie is set with httpOnly and sameSite attributes

2. **`tests/integration/publicRoutes.test.js`** — Test public (unauthenticated) endpoints:
   - `GET /api` — returns combined public data (services, recent pictures, what's new)
   - `GET /api/recentPictures` — returns up to 30 items where `showInRecent` is true, sorted by `capturedAt`
   - `GET /api/featuredGallery` — returns only items that are members of the `featured` gallery, sorted by `galleryPosition`
   - Verify responses do NOT include admin-only fields

3. **`tests/integration/media.test.js`** — Test media CRUD behind auth:
   - All routes require authentication — return 401 without session
   - `GET /api/media` — returns all media for admin
   - `GET /api/media/tags` — returns distinct tag list
   - `PUT /api/media/:id` — updates fields, verify slug uniqueness constraint (409 on duplicate)
   - `DELETE /api/media/:id` — removes document and associated files (mock fs for file cleanup)
   - `POST /api/media/:id/replace-fullres` — accepts a multipart upload, regenerates display + thumbnail, refuses mismatched media types (e.g. uploading a video to replace a photo)

4. **`tests/integration/adminArchive.test.js`** — Test admin archive endpoints behind auth:
   - All routes require authentication — return 401 without session
   - `GET /api/admin/archive` — returns matching media including hidden (`display:false`) items
   - Filtering by `q`, `mediaType`, `visibility=hidden`, `tags`, `from`/`to`, `gallery`, `cameraModel`, `city`, `state`, `country` returns expected subsets
   - Sorting by `newest`, `oldest`, `recent`, `title-az`, `title-za`, and `random` works
   - Pagination (`page`, `limit`) and `totalPages` are accurate
   - `GET /api/admin/archive/facets` — returns sorted, deduplicated lists for `tags`, `cities`, `states`, `countries`, `cameraModels`, and `galleries` (including hidden galleries)

5. **`tests/integration/downloads.test.js`** — Test download endpoints behind auth:
   - All routes require authentication — return 401 without session
   - `GET /api/media/:id/download/:version` — streams the correct file (mock fs to avoid touching real disk)
   - `GET /api/media/:id/download/invalid` — returns 400 (bad version)
   - `GET /api/media/:id/download-zip?versions=thumbnail,display,fullres` — sets `Content-Type: application/zip`, attachment Content-Disposition, includes only requested versions
   - `POST /api/media/download-batch` — body `{ items: [{ id, versions }] }` produces a multi-folder zip; rejects empty/invalid bodies; tolerates missing files by appending a `MANIFEST.txt`

6. **`tests/integration/services.test.js`** — Test services CRUD behind auth:
   - Full CRUD lifecycle: create, read, update, delete
   - Authentication enforcement on all endpoints

7. **`tests/integration/whatsNew.test.js`** — Test what's new CRUD behind auth:
   - Full CRUD lifecycle
   - Authentication enforcement on all endpoints

8. **`tests/integration/schema.test.js`** — Test `GET /api/schema`:
   - Returns schema definitions and document counts when authenticated
   - Returns 401 when not authenticated

---

## Phase 3 — System Testing

Create system tests under `tests/system/` that test complete user workflows from start to finish using `supertest` with cookie persistence (agent sessions). These simulate real user scenarios.

1. **`tests/system/adminWorkflow.test.js`**:
   - Login → upload media → verify it appears in admin archive → edit metadata via drawer → replace full-res file → delete → logout
   - Login → search/filter the admin archive (text search, gallery, hidden-only) → multi-select 2 items → batch download with mixed per-item versions → confirm zip is returned
   - Login → create service → update service → verify it appears in public API → delete → logout
   - Login → create what's new entry → verify it appears in public API → delete → logout

2. **`tests/system/portfolioWorkflow.test.js`**:
   - Unauthenticated user fetches public data → recent pictures → featured gallery
   - Verify recent media is sorted by `capturedAt` desc (most recent first)
   - Verify featured media is sorted by `galleryPosition` within the `featured` gallery
   - Verify media with `display: false` does NOT appear in public endpoints (including hidden items shown in admin archive)

3. **`tests/system/authGuard.test.js`**:
   - Attempt all admin endpoints without login → all return 401
   - Login with invalid credentials → attempt admin endpoints → still 401
   - Login → perform admin action → logout → retry same action → 401

---

## Phase 4 — Functional Testing

Verify each feature works according to its requirements. Add these as additional test cases within the integration and system test files or in `tests/functional/`:

1. **Media Upload & Processing**:
   - Photo upload creates full-res, display (1600px max width), and thumbnail (400px max width) files
   - Video upload creates full-res, transcoded display, and thumbnail frame capture
   - Watermark logo is applied to display copies with correct opacity and margin
   - EXIF metadata is extracted and stored in the document
   - Duplicate slug is rejected with 409

2. **Gallery Management**:
   - Media can belong to multiple galleries
   - Reordering updates `galleryPosition` correctly within each gallery
   - The homepage Featured section reads from the `featured` gallery (slug) and respects `galleryPosition`
   - Reordering members of the Featured gallery via the Galleries tab changes the homepage Featured order

3. **Admin Archive Page**:
   - Sidebar search/sort/filter controls fetch results from `/api/admin/archive`
   - Hidden items appear with a "Hidden" badge
   - Per-card download menu: Single-version downloads issue a GET to `/api/media/:id/download/:version`; "All as zip" issues a GET to `/api/media/:id/download-zip`
   - Multi-select bulk-action bar: choosing per-item versions via the Customize panel produces a batch zip with per-item subfolders
   - Edit drawer: Saving metadata triggers `PUT /api/media/:id`; Replace full-res posts a multipart upload to `/api/media/:id/replace-fullres` and re-renders display/thumbnail

4. **File Replacement Pipeline**:
   - Replacing a photo regenerates the watermarked display PNG and JPG thumbnail
   - Replacing a video regenerates the transcoded display MP4 and JPG thumbnail
   - Mismatched media type (e.g. uploading a video into a photo's slot) returns 400

3. **Session Management**:
   - Session persists across multiple requests (cookie-based)
   - Session expires correctly (24-hour maxAge)
   - Concurrent sessions work independently

---

## Phase 5 — Non-Functional Testing

Create tests under `tests/non-functional/`:

1. **`tests/non-functional/security.test.js`**:
   - JSON body size limit is enforced (1 MB)
   - Upload size limit is enforced (500 MB)
   - Session cookie has `httpOnly: true` and `sameSite: 'strict'`
   - No sensitive data (passwords, session secrets) in API responses
   - User enumeration prevention: same error message for invalid username and invalid password
   - Protected routes reject unauthenticated requests consistently
   - MongoDB injection prevention: pass `{ "$gt": "" }` as username/password, verify rejection

2. **`tests/non-functional/validation.test.js`**:
   - Required fields are enforced on create/update (slug required on Media)
   - Invalid MongoDB ObjectIds return appropriate errors
   - Empty strings, null values, and missing fields handled gracefully

3. **`tests/non-functional/performance.test.js`** (basic):
   - Public API endpoints respond within 200ms (with in-memory DB)
   - Bulk operations (reorder 50+ items) complete without timeout

---

## Phase 6 — Regression Testing

Create `tests/regression/` with tests that specifically guard against re-introducing past bugs or breaking changes:

1. **`tests/regression/routeOrder.test.js`**:
   - `POST /api/media/download-batch` is matched before any `/:id` route (the download router is mounted before the media router)
   - `GET /api/media/:id/download/:version` is matched correctly (multi-segment GET)
   - `POST /api/media/:id/replace-fullres` is matched before `PUT /:id` would attempt to interpret `replace-fullres` as a body field
   - `GET /api/session` is not intercepted by `publicRoutes` since both mount at `/api`

2. **`tests/regression/errorHandling.test.js`**:
   - Mongoose duplicate key error returns 409, not 500
   - Mongoose validation error returns 400 with descriptive messages
   - Unhandled async errors are caught by `express-async-handler` and passed to `errorHandler`

3. **`tests/regression/fileCleanup.test.js`**:
   - Deleting a media item removes all 3 associated files (OG, display, thumbnail)
   - Failed upload does not leave orphaned files in storage directories
   - File rename during media update moves all 3 files correctly

4. **`tests/regression/dataIntegrity.test.js`**:
   - Updating a media title regenerates the slug correctly
   - Reordering does not change any field other than sort-order fields
   - Public API transforms do not leak internal fields (`_id` format, `__v`, file paths to full-res)

---

## Output Structure

tests/
setup.js
unit/
helpers.test.js
transforms.test.js
errorHandler.test.js
requireAuth.test.js
mediaService.test.js
integration/
auth.test.js
publicRoutes.test.js
media.test.js
adminArchive.test.js
downloads.test.js
services.test.js
whatsNew.test.js
schema.test.js
system/
adminWorkflow.test.js
portfolioWorkflow.test.js
authGuard.test.js
functional/
mediaUpload.test.js
galleryManagement.test.js
sessionManagement.test.js
non-functional/
security.test.js
validation.test.js
performance.test.js
regression/
routeOrder.test.js
errorHandling.test.js
fileCleanup.test.js
dataIntegrity.test.js


## Rules

- Use CommonJS (`require`/`module.exports`) everywhere — no ES module syntax
- Each test file must be runnable independently
- Use descriptive `describe`/`it` blocks that read as specifications
- Mock filesystem operations and image/video processing in unit tests — never touch real files
- Use `mongodb-memory-server` for all tests that need a database — never connect to the real database
- Do not modify any existing source code files
- Start with Phase 1 and proceed sequentially through all phases