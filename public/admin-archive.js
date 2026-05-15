(function (window, document) {

    var ALL_VERSIONS = ['thumbnail', 'display', 'fullres'];

    var state = {
        q: '',
        sort: 'newest',
        mediaType: 'all',
        visibility: 'all',
        tags: [],
        from: '',
        to: '',
        city: '',
        state: '',
        country: '',
        cameraModel: '',
        gallery: '',
        page: 1,
        limit: 24
    };

    var pendingTagSelection = [];
    var currentItems = [];
    var currentTotalPages = 1;
    var initialized = false;

    var selected = new Set();
    var versionOverrides = {};
    var customizePanelOpen = false;

    var els = {};

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        var div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function getEl(id) {
        return document.getElementById(id);
    }

    function gatherEls() {
        els.grid = getEl('mediaGrid');
        els.meta = getEl('adminArchiveMeta');
        els.pagination = getEl('adminArchivePagination');
        els.pageInfo = getEl('adminArchivePageInfo');
        els.prev = getEl('adminArchivePrev');
        els.next = getEl('adminArchiveNext');
        els.shuffle = getEl('adminArchiveShuffle');
        els.reshuffle = getEl('adminArchiveReshuffle');

        els.search = getEl('adminArchiveSearch');
        els.sort = getEl('adminArchiveSort');
        els.dateFrom = getEl('adminDateFrom');
        els.dateTo = getEl('adminDateTo');
        els.cityFilter = getEl('adminCityFilter');
        els.stateFilter = getEl('adminStateFilter');
        els.countryFilter = getEl('adminCountryFilter');
        els.cameraFilter = getEl('adminCameraFilter');
        els.galleryFilter = getEl('adminGalleryFilter');
        els.tagList = getEl('adminTagList');
        els.resetBtn = getEl('adminResetFilters');

        els.selectAllBtn = getEl('adminSelectAllBtn');
        els.clearSelectionBtn = getEl('adminClearSelectionBtn');

        els.bulkBar = getEl('adminBulkBar');
        els.bulkSummary = getEl('adminBulkBarSummary');
        els.bulkCustomizeBtn = getEl('adminCustomizeBtn');
        els.bulkDownloadBtn = getEl('adminBulkDownloadBtn');

        els.customizePanel = getEl('adminCustomizePanel');
        els.customizeList = getEl('adminCustomizeList');
        els.customizeCloseBtn = getEl('adminCustomizeCloseBtn');
    }

    async function apiCall(url, options) {
        var response = await fetch(url, options);
        if (response.status === 401) {
            window.location.href = '/login';
            throw new Error('Session expired');
        }
        return response;
    }

    function fillSelect(select, values, currentValue) {
        var preserved = currentValue || select.value || '';
        select.innerHTML = '';
        var any = document.createElement('option');
        any.value = '';
        any.textContent = 'Any';
        select.appendChild(any);
        for (var i = 0; i < values.length; i++) {
            var opt = document.createElement('option');
            if (typeof values[i] === 'object') {
                opt.value = values[i].value;
                opt.textContent = values[i].label;
            } else {
                opt.value = values[i];
                opt.textContent = values[i];
            }
            select.appendChild(opt);
        }
        if (preserved) select.value = preserved;
    }

    function fillTagList(tags) {
        els.tagList.innerHTML = '';
        if (!tags || tags.length === 0) {
            var empty = document.createElement('p');
            empty.className = 'filter-empty';
            empty.textContent = 'No tags yet.';
            els.tagList.appendChild(empty);
            return;
        }
        for (var i = 0; i < tags.length; i++) {
            var label = document.createElement('label');
            label.className = 'filter-checkbox';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = tags[i];
            cb.checked = pendingTagSelection.indexOf(tags[i]) !== -1;
            cb.addEventListener('change', onFilterChange);
            var span = document.createElement('span');
            span.textContent = tags[i];
            label.appendChild(cb);
            label.appendChild(span);
            els.tagList.appendChild(label);
        }
    }

    async function fetchFacets() {
        try {
            var response = await apiCall('/api/admin/archive/facets');
            if (!response.ok) throw new Error('Facets fetch failed');
            var data = await response.json();
            fillSelect(els.cityFilter, data.cities || [], state.city);
            fillSelect(els.stateFilter, data.states || [], state.state);
            fillSelect(els.countryFilter, data.countries || [], state.country);
            fillSelect(els.cameraFilter, data.cameraModels || [], state.cameraModel);
            var galleryOptions = (data.galleries || []).map(function (g) {
                return { value: g.slug, label: g.title + (g.display === false ? ' (hidden)' : '') };
            });
            fillSelect(els.galleryFilter, galleryOptions, state.gallery);
            fillTagList(data.tags || []);
            syncControlsFromState();
        } catch (err) {
            console.error('Failed to load admin facets:', err);
            var msg = document.createElement('p');
            msg.className = 'filter-empty';
            msg.textContent = 'Filter options failed to load.';
            els.tagList.innerHTML = '';
            els.tagList.appendChild(msg);
        }
    }

    function syncControlsFromState() {
        els.search.value = state.q || '';
        els.sort.value = state.sort || 'newest';
        els.dateFrom.value = state.from || '';
        els.dateTo.value = state.to || '';
        els.cityFilter.value = state.city || '';
        els.stateFilter.value = state.state || '';
        els.countryFilter.value = state.country || '';
        els.cameraFilter.value = state.cameraModel || '';
        els.galleryFilter.value = state.gallery || '';

        var typeRadios = document.querySelectorAll('input[name="adminMediaType"]');
        for (var i = 0; i < typeRadios.length; i++) {
            typeRadios[i].checked = (typeRadios[i].value === (state.mediaType || 'all'));
        }
        var visibilityRadios = document.querySelectorAll('input[name="adminVisibility"]');
        for (var j = 0; j < visibilityRadios.length; j++) {
            visibilityRadios[j].checked = (visibilityRadios[j].value === (state.visibility || 'all'));
        }
        var tagBoxes = els.tagList.querySelectorAll('input[type="checkbox"]');
        for (var k = 0; k < tagBoxes.length; k++) {
            tagBoxes[k].checked = state.tags.indexOf(tagBoxes[k].value) !== -1;
        }
    }

    function buildQueryString() {
        var params = [];
        if (state.q) params.push('q=' + encodeURIComponent(state.q));
        if (state.sort) params.push('sort=' + encodeURIComponent(state.sort));
        if (state.mediaType && state.mediaType !== 'all') {
            params.push('mediaType=' + encodeURIComponent(state.mediaType));
        }
        if (state.visibility && state.visibility !== 'all') {
            params.push('visibility=' + encodeURIComponent(state.visibility));
        }
        if (state.tags && state.tags.length > 0) {
            params.push('tags=' + encodeURIComponent(state.tags.join(',')));
        }
        if (state.from) params.push('from=' + encodeURIComponent(state.from));
        if (state.to) params.push('to=' + encodeURIComponent(state.to));
        if (state.city) params.push('city=' + encodeURIComponent(state.city));
        if (state.state) params.push('state=' + encodeURIComponent(state.state));
        if (state.country) params.push('country=' + encodeURIComponent(state.country));
        if (state.cameraModel) params.push('cameraModel=' + encodeURIComponent(state.cameraModel));
        if (state.gallery) params.push('gallery=' + encodeURIComponent(state.gallery));
        params.push('page=' + state.page);
        params.push('limit=' + state.limit);
        return params.join('&');
    }

    function readControlsIntoState(opts) {
        opts = opts || {};
        state.q = els.search.value.trim();
        state.sort = els.sort.value;
        state.from = els.dateFrom.value;
        state.to = els.dateTo.value;
        state.city = els.cityFilter.value;
        state.state = els.stateFilter.value;
        state.country = els.countryFilter.value;
        state.cameraModel = els.cameraFilter.value;
        state.gallery = els.galleryFilter.value;

        var typeRadio = document.querySelector('input[name="adminMediaType"]:checked');
        state.mediaType = typeRadio ? typeRadio.value : 'all';
        var visibilityRadio = document.querySelector('input[name="adminVisibility"]:checked');
        state.visibility = visibilityRadio ? visibilityRadio.value : 'all';

        var tagBoxes = els.tagList.querySelectorAll('input[type="checkbox"]:checked');
        state.tags = [];
        for (var i = 0; i < tagBoxes.length; i++) {
            state.tags.push(tagBoxes[i].value);
        }
        pendingTagSelection = state.tags.slice();

        if (!opts.preservePage) {
            state.page = 1;
        }
    }

    var debounceTimer = null;
    function debouncedFetch() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(fetchAndRender, 300);
    }

    function onFilterChange() {
        readControlsIntoState();
        debouncedFetch();
    }

    function thumbnailUrl(item) {
        if (item.thumbnailPath) {
            var fname = String(item.thumbnailPath).split('/').pop();
            return '/thumbnails/' + encodeURIComponent(fname);
        }
        if (item.displayResolutionPath) {
            var dname = String(item.displayResolutionPath).split('/').pop();
            return '/media/' + encodeURIComponent(dname);
        }
        return '';
    }

    function renderCard(item) {
        var card = document.createElement('div');
        card.className = 'item-card media-card';
        card.setAttribute('data-id', item._id);
        if (selected.has(String(item._id))) card.classList.add('selected');

        var thumbHtml = '';
        var thumbSrc = thumbnailUrl(item);
        if (thumbSrc) {
            thumbHtml = '<img class="media-card-thumb" src="' + thumbSrc + '" alt="' + escapeHtml(item.alt || item.title || '') + '" loading="lazy">';
        }

        var galleryBadges = '';
        if (item.galleries && item.galleries.length) {
            for (var gi = 0; gi < item.galleries.length; gi++) {
                galleryBadges += '<span class="gallery-badge">' + escapeHtml(item.galleries[gi].galleryName || item.galleries[gi].gallerySlug) + '</span>';
            }
        }
        var tagBadges = '';
        if (item.tags && item.tags.length) {
            for (var ti = 0; ti < item.tags.length; ti++) {
                tagBadges += '<span class="tag-badge">' + escapeHtml(item.tags[ti]) + '</span>';
            }
        }

        var warnings = [];
        if (!item.description) warnings.push('description');
        if (!item.alt) warnings.push('alt');
        if (!item.galleries || item.galleries.length === 0) warnings.push('galleries');
        var warningHtml = warnings.length > 0
            ? '<div class="media-card-warning">Missing: ' + escapeHtml(warnings.join(', ')) + '</div>'
            : '';

        var isVideo = item.mediaType === 'video';
        var hiddenBadge = item.display ? '' : '<span class="media-card-hidden-badge">Hidden</span>';

        card.innerHTML =
            '<div class="media-card-select" title="Toggle selection">' +
            '<input type="checkbox" ' + (selected.has(String(item._id)) ? 'checked' : '') + '>' +
            '</div>' +
            hiddenBadge +
            (thumbHtml ? '<div class="media-card-thumb-wrap">' + thumbHtml + '</div>' : '') +
            '<div class="card-ids">' +
            '<span class="id-badge"><strong>_id:</strong> ' + escapeHtml(item._id) + '</span>' +
            '<span class="id-badge media-type-badge ' + (isVideo ? 'video-badge' : 'photo-badge') + '">' + escapeHtml(item.mediaType || 'photo') + '</span>' +
            '</div>' +
            warningHtml +
            '<h3>' + escapeHtml(item.title || 'Untitled') + '</h3>' +
            '<p class="card-description">' + escapeHtml(item.description || '') + '</p>' +
            '<div class="card-meta">' +
            '<span class="meta-status ' + (item.display ? 'active' : 'inactive') + '">' + (item.display ? 'Visible' : 'Hidden') + '</span>' +
            (item.showInRecent ? '<span class="meta-status active">Recent</span>' : '') +
            (item.availableForSale ? '<span class="meta-status active" title="Physical print purchase">Print</span>' : '') +
            (item.availableForLicense ? '<span class="meta-status active" title="Digital license">License</span>' : '') +
            '</div>' +
            (galleryBadges ? '<div class="media-card-galleries">' + galleryBadges + '</div>' : '') +
            (tagBadges ? '<div class="media-card-tags">' + tagBadges + '</div>' : '') +
            '<div class="card-actions">' +
            '<button type="button" class="edit-btn">Edit</button>' +
            '<div class="download-menu-wrap">' +
            '<button type="button" class="download-menu-toggle">Download &#9662;</button>' +
            '<div class="download-menu">' +
            '<button type="button" data-version="all">All as zip</button>' +
            '<button type="button" data-version="thumbnail">Thumbnail</button>' +
            '<button type="button" data-version="display">Display</button>' +
            '<button type="button" data-version="fullres">Full-resolution</button>' +
            '</div>' +
            '</div>' +
            '<button type="button" class="delete-btn">Delete</button>' +
            '</div>';

        var checkbox = card.querySelector('.media-card-select input[type="checkbox"]');
        var selectBox = card.querySelector('.media-card-select');
        function toggleSelection(e) {
            e.stopPropagation();
            var id = String(item._id);
            if (selected.has(id)) {
                selected.delete(id);
                delete versionOverrides[id];
                card.classList.remove('selected');
                checkbox.checked = false;
            } else {
                selected.add(id);
                card.classList.add('selected');
                checkbox.checked = true;
            }
            updateBulkBar();
            if (customizePanelOpen) renderCustomizePanel();
        }
        selectBox.addEventListener('click', toggleSelection);
        checkbox.addEventListener('change', function (e) { e.stopPropagation(); });

        card.querySelector('.edit-btn').addEventListener('click', function (e) {
            e.stopPropagation();
            openDrawer(item);
        });
        card.querySelector('.delete-btn').addEventListener('click', function (e) {
            e.stopPropagation();
            deleteItem(item);
        });

        var menuToggle = card.querySelector('.download-menu-toggle');
        var menu = card.querySelector('.download-menu');
        menuToggle.addEventListener('click', function (e) {
            e.stopPropagation();
            closeAllDownloadMenus(menu);
            menu.classList.toggle('open');
        });
        var menuButtons = menu.querySelectorAll('button[data-version]');
        for (var bi = 0; bi < menuButtons.length; bi++) {
            menuButtons[bi].addEventListener('click', (function (btn) {
                return function (e) {
                    e.stopPropagation();
                    menu.classList.remove('open');
                    var v = btn.getAttribute('data-version');
                    if (v === 'all') {
                        downloadItemZip(item, ALL_VERSIONS);
                    } else {
                        downloadSingleVersion(item, v);
                    }
                };
            })(menuButtons[bi]));
        }

        var thumb = card.querySelector('.media-card-thumb');
        if (thumb) {
            thumb.addEventListener('click', function (e) {
                e.stopPropagation();
                openDrawer(item);
            });
        }

        return card;
    }

    function closeAllDownloadMenus(except) {
        var menus = document.querySelectorAll('.download-menu.open');
        for (var i = 0; i < menus.length; i++) {
            if (menus[i] !== except) menus[i].classList.remove('open');
        }
    }

    function renderResults(items) {
        els.grid.innerHTML = '';
        if (!items || items.length === 0) {
            els.grid.innerHTML = '<p class="loading-text">No results match your filters.</p>';
            return;
        }
        for (var i = 0; i < items.length; i++) {
            els.grid.appendChild(renderCard(items[i]));
        }
    }

    function updatePagination(payload) {
        if (state.sort === 'random') {
            els.pagination.style.display = 'none';
            els.shuffle.style.display = 'flex';
            var sample = (payload.items && payload.items.length) || 0;
            var total = payload.total || 0;
            els.meta.textContent = sample + ' of ' + total + ' shown (random sample)';
            return;
        }
        els.shuffle.style.display = 'none';
        var totalPages = payload.totalPages || 1;
        if (totalPages > 1) {
            els.pagination.style.display = 'flex';
            els.prev.disabled = state.page <= 1;
            els.next.disabled = state.page >= totalPages;
            els.pageInfo.textContent = 'Page ' + state.page + ' of ' + totalPages;
        } else {
            els.pagination.style.display = 'none';
        }
        var totalCount = payload.total || 0;
        els.meta.textContent = totalCount === 1 ? '1 result' : totalCount + ' results';
    }

    async function fetchAndRender() {
        els.grid.innerHTML = '<p class="loading-text">Loading media...</p>';
        els.pagination.style.display = 'none';
        els.shuffle.style.display = 'none';
        try {
            var response = await apiCall('/api/admin/archive?' + buildQueryString());
            if (!response.ok) throw new Error('Search failed');
            var payload = await response.json();
            currentItems = payload.items || [];
            currentTotalPages = payload.totalPages || 1;

            if (state.sort !== 'random' && payload.totalPages && state.page > payload.totalPages) {
                state.page = Math.max(1, payload.totalPages);
                return fetchAndRender();
            }

            renderResults(currentItems);
            updatePagination(payload);
            updateBulkBar();
        } catch (err) {
            console.error(err);
            els.grid.innerHTML = '<p class="loading-text">Unable to load media.</p>';
            els.pagination.style.display = 'none';
            els.shuffle.style.display = 'none';
            els.meta.textContent = '';
        }
    }

    function updateBulkBar() {
        var count = selected.size;
        if (count === 0) {
            els.bulkBar.style.display = 'none';
            els.customizePanel.style.display = 'none';
            customizePanelOpen = false;
            els.bulkCustomizeBtn.classList.remove('active');
            return;
        }
        els.bulkBar.style.display = 'flex';
        els.bulkSummary.textContent = count + ' selected';
    }

    function getBulkVersions() {
        var versions = [];
        var checkboxes = document.querySelectorAll('input[name="bulkVersion"]:checked');
        for (var i = 0; i < checkboxes.length; i++) {
            versions.push(checkboxes[i].value);
        }
        return versions;
    }

    function getEffectiveVersions(id) {
        if (versionOverrides[id]) return versionOverrides[id].slice();
        return getBulkVersions();
    }

    function renderCustomizePanel() {
        if (selected.size === 0) {
            els.customizePanel.style.display = 'none';
            customizePanelOpen = false;
            return;
        }
        var bulkDefault = getBulkVersions();
        els.customizeList.innerHTML = '';

        var byId = {};
        for (var ci = 0; ci < currentItems.length; ci++) {
            byId[String(currentItems[ci]._id)] = currentItems[ci];
        }

        var idsArr = Array.from(selected);
        for (var i = 0; i < idsArr.length; i++) {
            var id = idsArr[i];
            var item = byId[id];
            if (!item) continue;
            var row = document.createElement('div');
            row.className = 'customize-row';
            row.setAttribute('data-id', id);

            var thumb = document.createElement('div');
            thumb.className = 'customize-thumb';
            var src = thumbnailUrl(item);
            if (src) {
                var img = document.createElement('img');
                img.src = src;
                img.alt = item.title || '';
                img.loading = 'lazy';
                thumb.appendChild(img);
            }
            row.appendChild(thumb);

            var title = document.createElement('div');
            title.className = 'customize-title';
            title.textContent = item.title || 'Untitled';
            title.title = item.title || '';
            row.appendChild(title);

            var versions = document.createElement('div');
            versions.className = 'customize-versions';
            var current = versionOverrides[id] || bulkDefault.slice();
            var versionList = [
                { value: 'thumbnail', label: 'Thumb' },
                { value: 'display', label: 'Display' },
                { value: 'fullres', label: 'Full' }
            ];
            for (var v = 0; v < versionList.length; v++) {
                var label = document.createElement('label');
                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = versionList[v].value;
                cb.checked = current.indexOf(versionList[v].value) !== -1;
                cb.addEventListener('change', (function (rowId) {
                    return function () {
                        var row = els.customizeList.querySelector('.customize-row[data-id="' + rowId + '"]');
                        if (!row) return;
                        var checked = row.querySelectorAll('input[type="checkbox"]:checked');
                        var arr = [];
                        for (var k = 0; k < checked.length; k++) arr.push(checked[k].value);
                        versionOverrides[rowId] = arr;
                    };
                })(id));
                label.appendChild(cb);
                var span = document.createElement('span');
                span.textContent = versionList[v].label;
                label.appendChild(span);
                versions.appendChild(label);
            }
            row.appendChild(versions);
            els.customizeList.appendChild(row);
        }
        els.customizePanel.style.display = 'block';
        customizePanelOpen = true;
        els.bulkCustomizeBtn.classList.add('active');
    }

    function downloadSingleVersion(item, version) {
        var url = '/api/media/' + encodeURIComponent(String(item._id)) + '/download/' + encodeURIComponent(version);
        triggerHiddenDownload(url);
    }

    function downloadItemZip(item, versions) {
        if (!versions || versions.length === 0) {
            alert('Pick at least one version to include in the zip.');
            return;
        }
        var qs = 'versions=' + encodeURIComponent(versions.join(','));
        var url = '/api/media/' + encodeURIComponent(String(item._id)) + '/download-zip?' + qs;
        triggerHiddenDownload(url);
    }

    function triggerHiddenDownload(url) {
        var a = document.createElement('a');
        a.href = url;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { a.remove(); }, 1500);
    }

    async function downloadBatch() {
        if (selected.size === 0) return;
        var bulkDefault = getBulkVersions();
        if (bulkDefault.length === 0 && Object.keys(versionOverrides).length === 0) {
            alert('Pick at least one version to include in each item.');
            return;
        }
        var items = [];
        var idsArr = Array.from(selected);
        for (var i = 0; i < idsArr.length; i++) {
            var id = idsArr[i];
            var versions = getEffectiveVersions(id);
            if (!versions || versions.length === 0) continue;
            items.push({ id: id, versions: versions });
        }
        if (items.length === 0) {
            alert('Every selected item ended up with no versions chosen. Pick at least one version per item.');
            return;
        }

        els.bulkDownloadBtn.disabled = true;
        var prevText = els.bulkDownloadBtn.textContent;
        els.bulkDownloadBtn.textContent = 'Preparing zip...';
        try {
            var response = await fetch('/api/media/download-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: items })
            });
            if (response.status === 401) {
                window.location.href = '/login';
                return;
            }
            if (!response.ok) {
                var errMsg = 'Batch download failed (HTTP ' + response.status + ')';
                try {
                    var err = await response.json();
                    if (err && err.error) errMsg = err.error;
                } catch (e) {  }
                alert(errMsg);
                return;
            }
            var blob = await response.blob();
            var ts = new Date().toISOString().replace(/[:.]/g, '-');
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'papis_pictures_batch_' + ts + '.zip';
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
                a.remove();
                URL.revokeObjectURL(url);
            }, 2000);
        } catch (err) {
            console.error(err);
            alert('Batch download failed: ' + err.message);
        } finally {
            els.bulkDownloadBtn.disabled = false;
            els.bulkDownloadBtn.textContent = prevText;
        }
    }

    async function deleteItem(item) {
        if (!confirm('Delete "' + (item.title || 'this item') + '"?\n\nThis removes files from disk and cannot be undone.\n\n_id: ' + item._id)) return;
        try {
            var response = await apiCall('/api/media/' + encodeURIComponent(String(item._id)), { method: 'DELETE' });
            if (response.ok) {
                selected.delete(String(item._id));
                delete versionOverrides[String(item._id)];
                updateBulkBar();
                fetchAndRender();
            } else {
                var data = await response.json();
                alert(data.error || 'Failed to delete media.');
            }
        } catch (err) {
            alert('Error deleting media.');
        }
    }

    function openDrawer(item) {
        if (window.MediaDrawer && typeof window.MediaDrawer.open === 'function') {
            window.MediaDrawer.open(item);
            return;
        }
        if (typeof window.editMedia === 'function') {
            window.editMedia(item);
            return;
        }
        console.error('No drawer or modal handler available.');
    }

    function selectAllOnPage() {
        for (var i = 0; i < currentItems.length; i++) {
            selected.add(String(currentItems[i]._id));
        }
        renderResults(currentItems);
        updateBulkBar();
        if (customizePanelOpen) renderCustomizePanel();
    }

    function clearSelection() {
        selected.clear();
        versionOverrides = {};
        renderResults(currentItems);
        updateBulkBar();
        els.customizePanel.style.display = 'none';
        customizePanelOpen = false;
        els.bulkCustomizeBtn.classList.remove('active');
    }

    function bindEvents() {
        els.search.addEventListener('input', onFilterChange);
        els.sort.addEventListener('change', onFilterChange);
        els.dateFrom.addEventListener('change', onFilterChange);
        els.dateTo.addEventListener('change', onFilterChange);
        els.cityFilter.addEventListener('change', onFilterChange);
        els.stateFilter.addEventListener('change', onFilterChange);
        els.countryFilter.addEventListener('change', onFilterChange);
        els.cameraFilter.addEventListener('change', onFilterChange);
        els.galleryFilter.addEventListener('change', onFilterChange);

        var typeRadios = document.querySelectorAll('input[name="adminMediaType"]');
        for (var t = 0; t < typeRadios.length; t++) typeRadios[t].addEventListener('change', onFilterChange);
        var visRadios = document.querySelectorAll('input[name="adminVisibility"]');
        for (var v = 0; v < visRadios.length; v++) visRadios[v].addEventListener('change', onFilterChange);

        els.prev.addEventListener('click', function () {
            if (state.page > 1) { state.page--; fetchAndRender(); }
        });
        els.next.addEventListener('click', function () {
            if (state.sort !== 'random' && state.page < currentTotalPages) { state.page++; fetchAndRender(); }
        });
        els.reshuffle.addEventListener('click', function () { fetchAndRender(); });

        els.resetBtn.addEventListener('click', function () {
            els.search.value = '';
            els.sort.value = 'newest';
            els.dateFrom.value = '';
            els.dateTo.value = '';
            els.cityFilter.value = '';
            els.stateFilter.value = '';
            els.countryFilter.value = '';
            els.cameraFilter.value = '';
            els.galleryFilter.value = '';
            var radios = document.querySelectorAll('input[name="adminMediaType"]');
            for (var i = 0; i < radios.length; i++) radios[i].checked = (radios[i].value === 'all');
            var vradios = document.querySelectorAll('input[name="adminVisibility"]');
            for (var j = 0; j < vradios.length; j++) vradios[j].checked = (vradios[j].value === 'all');
            var tagBoxes = els.tagList.querySelectorAll('input[type="checkbox"]');
            for (var k = 0; k < tagBoxes.length; k++) tagBoxes[k].checked = false;

            state.q = '';
            state.sort = 'newest';
            state.mediaType = 'all';
            state.visibility = 'all';
            state.tags = [];
            state.from = '';
            state.to = '';
            state.city = '';
            state.state = '';
            state.country = '';
            state.cameraModel = '';
            state.gallery = '';
            state.page = 1;
            pendingTagSelection = [];
            fetchAndRender();
        });

        els.selectAllBtn.addEventListener('click', selectAllOnPage);
        els.clearSelectionBtn.addEventListener('click', clearSelection);

        var bulkVersionBoxes = document.querySelectorAll('input[name="bulkVersion"]');
        for (var bi = 0; bi < bulkVersionBoxes.length; bi++) {
            bulkVersionBoxes[bi].addEventListener('change', function () {
                if (customizePanelOpen) renderCustomizePanel();
            });
        }

        els.bulkCustomizeBtn.addEventListener('click', function () {
            if (customizePanelOpen) {
                els.customizePanel.style.display = 'none';
                customizePanelOpen = false;
                els.bulkCustomizeBtn.classList.remove('active');
            } else {
                renderCustomizePanel();
            }
        });
        els.customizeCloseBtn.addEventListener('click', function () {
            els.customizePanel.style.display = 'none';
            customizePanelOpen = false;
            els.bulkCustomizeBtn.classList.remove('active');
        });

        els.bulkDownloadBtn.addEventListener('click', downloadBatch);

        document.addEventListener('click', function () {
            closeAllDownloadMenus(null);
        });
    }

    async function init() {
        if (initialized) return;
        gatherEls();
        if (!els.grid || !els.search) return;
        initialized = true;
        bindEvents();
        await fetchFacets();
        await fetchAndRender();
    }

    function refresh() {
        if (!initialized) {
            init();
            return;
        }
        fetchAndRender();
    }

    window.AdminArchive = {
        init: init,
        refresh: refresh,
        getItems: function () { return currentItems.slice(); },
        getSelectedIds: function () { return Array.from(selected); }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(window, document);
