(function (window, document) {

    var els = {};
    var currentItem = null;
    var savedScrollY = 0;

    function getEl(id) { return document.getElementById(id); }

    function lockBodyScroll() {
        savedScrollY = window.scrollY || window.pageYOffset || 0;
        document.body.style.top = '-' + savedScrollY + 'px';
        document.body.classList.add('drawer-open');
    }

    function unlockBodyScroll() {
        document.body.classList.remove('drawer-open');
        document.body.style.top = '';
        window.scrollTo(0, savedScrollY);
    }

    function gatherEls() {
        els.overlay = getEl('mediaDrawer');
        if (!els.overlay) return false;
        els.previewBody = getEl('mediaDrawerPreviewBody');
        els.previewMeta = getEl('mediaDrawerPreviewMeta');
        els.detailsTab = getEl('mediaDrawerDetails');
        els.metadataTab = getEl('mediaDrawerMetadata');
        els.filesTab = getEl('mediaDrawerFiles');
        els.form = getEl('mediaDrawerForm');
        els.closeBtn = getEl('mediaDrawerCloseBtn');
        els.cancelBtn = getEl('mediaDrawerCancelBtn');
        return true;
    }

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        var div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function formatBytes(bytes) {
        if (bytes === null || bytes === undefined || isNaN(bytes)) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }

    function thumbUrl(item) {
        if (item.thumbnailPath) {
            var fname = String(item.thumbnailPath).split('/').pop();
            return '/thumbnails/' + encodeURIComponent(fname);
        }
        return '';
    }

    function displayUrl(item) {
        if (item.displayResolutionPath) {
            var fname = String(item.displayResolutionPath).split('/').pop();
            return '/media/' + encodeURIComponent(fname);
        }
        return '';
    }

    function buildPreview(item) {
        els.previewBody.innerHTML = '';
        els.previewMeta.innerHTML = '';
        var src = displayUrl(item);
        if (!src) {
            els.previewBody.innerHTML = '<p style="opacity:0.6;">No preview available.</p>';
            return;
        }
        if (item.mediaType === 'video') {
            var video = document.createElement('video');
            video.controls = true;
            video.preload = 'metadata';
            video.src = src;
            els.previewBody.appendChild(video);
        } else {
            var img = document.createElement('img');
            img.src = src;
            img.alt = item.alt || item.title || '';
            els.previewBody.appendChild(img);
        }

        var width = item.metadata && item.metadata.imageWidthPixels;
        var height = item.metadata && item.metadata.imageHeightPixels;
        var dimText = (width && height) ? width + ' x ' + height : '';
        var fileText = item.fullResolutionLogolessPath || item.fileName || '';
        els.previewMeta.innerHTML =
            (dimText ? '<div>' + escapeHtml(dimText) + '</div>' : '') +
            '<div>' + escapeHtml(fileText) + '</div>';
    }

    function buildDetailsTab(item) {
        els.detailsTab.innerHTML = '';

        var titleGroup = window.createField('Title', 'd_title', 'text', item.title || '', true);
        els.detailsTab.appendChild(titleGroup);
        els.detailsTab.appendChild(window.createField('Description', 'd_description', 'textarea', item.description || '', true));

        var altGroup = window.createField('Alt Text', 'd_alt', 'text', item.alt || '', true);
        els.detailsTab.appendChild(altGroup);

        var titleInput = titleGroup.querySelector('input');
        var altInput = altGroup.querySelector('input');
        var altManual = Boolean(item.alt);
        altInput.addEventListener('input', function () { altManual = true; });
        titleInput.addEventListener('input', function () {
            if (!altManual) altInput.value = titleInput.value;
        });

        els.detailsTab.appendChild(window.createField('Creator', 'd_creator', 'text', item.creator || 'Scott Short', false));

        var capturedVal = '';
        if (item.capturedAt) {
            var cd = new Date(item.capturedAt);
            if (!isNaN(cd.getTime())) {
                capturedVal = cd.getUTCFullYear() + '-' +
                    String(cd.getUTCMonth() + 1).padStart(2, '0') + '-' +
                    String(cd.getUTCDate()).padStart(2, '0') + 'T' +
                    String(cd.getUTCHours()).padStart(2, '0') + ':' +
                    String(cd.getUTCMinutes()).padStart(2, '0') + ':' +
                    String(cd.getUTCSeconds()).padStart(2, '0');
            }
        }
        els.detailsTab.appendChild(window.createField('Captured Date/Time', 'd_capturedAt', 'datetime-local', capturedVal, false));

        var tagPicker = window.createTagPicker(item.tags || []);
        renameInputIds(tagPicker, 'd_');
        els.detailsTab.appendChild(tagPicker);

        var galleryPicker = window.createGalleryInput(item.galleries || []);
        renameInputIds(galleryPicker, 'd_');
        els.detailsTab.appendChild(galleryPicker);

        var locLabel = document.createElement('label');
        locLabel.textContent = 'Location';
        locLabel.className = 'section-label';
        els.detailsTab.appendChild(locLabel);
        els.detailsTab.appendChild(window.createField('City', 'd_location-city', 'text', item.location ? item.location.city : '', false));
        els.detailsTab.appendChild(window.createField('State', 'd_location-state', 'text', item.location ? item.location.state : '', false));
        els.detailsTab.appendChild(window.createField('Country', 'd_location-country', 'text', item.location ? item.location.country : '', false));

        els.detailsTab.appendChild(window.createField('Visible', 'd_display', 'checkbox', item.display, false));
        els.detailsTab.appendChild(window.createField('Show in Recent', 'd_showInRecent', 'checkbox', item.showInRecent, false));

        var commerceLabel = document.createElement('label');
        commerceLabel.textContent = 'Commerce';
        commerceLabel.className = 'section-label';
        els.detailsTab.appendChild(commerceLabel);
        els.detailsTab.appendChild(window.createField('Available for physical print purchase', 'd_availableForSale', 'checkbox', !!item.availableForSale, false));
        els.detailsTab.appendChild(window.createField('Available for digital license (download)', 'd_availableForLicense', 'checkbox', !!item.availableForLicense, false));
    }

    function renameInputIds(container, prefix) {
        var inputs = container.querySelectorAll('input, select, textarea, label');
        for (var i = 0; i < inputs.length; i++) {
            var node = inputs[i];
            if (node.id && node.id.indexOf('field-') === 0 && node.id.indexOf('field-' + prefix) !== 0) {
                node.id = 'field-' + prefix + node.id.slice('field-'.length);
            }
            var forAttr = node.getAttribute && node.getAttribute('for');
            if (forAttr && forAttr.indexOf('field-') === 0 && forAttr.indexOf('field-' + prefix) !== 0) {
                node.setAttribute('for', 'field-' + prefix + forAttr.slice('field-'.length));
            }
        }
    }

    function buildMetadataTab(item) {
        els.metadataTab.innerHTML = '';

        var rows = [];
        rows.push(['Slug', item.slug]);
        rows.push(['Media Type', item.mediaType]);
        rows.push(['Original upload filename', item.ogFileName || 'Not recorded for this item']);
        rows.push(['Full-resolution file (on disk)', item.fullResolutionLogolessPath || item.fileName]);
        rows.push(['Display path', item.displayResolutionPath]);
        rows.push(['Thumbnail path', item.thumbnailPath]);
        rows.push(['Captured At', item.capturedAt]);
        rows.push(['Ingested At', item.ingestedAt]);
        rows.push(['Created At', item.createdAt]);
        rows.push(['Updated At', item.updatedAt]);

        if (item.metadata) {
            var m = item.metadata;
            rows.push(['Image Width', m.imageWidthPixels ? m.imageWidthPixels + ' px' : '']);
            rows.push(['Image Height', m.imageHeightPixels ? m.imageHeightPixels + ' px' : '']);
            rows.push(['Aspect Ratio', m.aspectRatio]);
            rows.push(['Bit Depth', m.bitDepth]);
            rows.push(['DPI (H x V)', (m.horizontalDpi && m.verticalDpi) ? (m.horizontalDpi + ' x ' + m.verticalDpi) : '']);
            rows.push(['Camera Make', m.cameraMake]);
            rows.push(['Camera Model', m.cameraModel]);
            rows.push(['Aperture', m.aperture]);
            rows.push(['Exposure Time', m.exposureTime]);
            rows.push(['ISO', m.iso]);
            rows.push(['Exposure Bias', m.exposureBias]);
            rows.push(['Focal Length', m.focalLength]);
            rows.push(['Focal Length (35mm)', m.focalLength35mm]);
            rows.push(['Lens Make', m.lensMake]);
            rows.push(['Lens Model', m.lensModel]);
            rows.push(['Flash Make', m.flashMake]);
            rows.push(['Flash Model', m.flashModel]);
            rows.push(['Flash Mode', m.flashMode]);
            rows.push(['Metering Mode', m.meteringMode]);
            rows.push(['Subject Distance', m.subjectDistance]);
            rows.push(['Light Source', m.lightSource]);
            rows.push(['Exposure Program', m.exposureProgram]);
            rows.push(['Contrast', m.contrast]);
            rows.push(['Brightness', m.brightness]);
            rows.push(['Saturation', m.saturation]);
            rows.push(['Sharpness', m.sharpness]);
            rows.push(['White Balance', m.whiteBalance]);
            rows.push(['Digital Zoom', m.digitalZoom]);
            rows.push(['EXIF Version', m.exifVersion]);
            rows.push(['GPS Latitude', m.gpsLatitude]);
            rows.push(['GPS Longitude', m.gpsLongitude]);
            rows.push(['GPS Altitude', m.gpsAltitude]);
        }

        var table = document.createElement('table');
        table.className = 'metadata-table';
        var tbody = document.createElement('tbody');
        for (var i = 0; i < rows.length; i++) {
            var label = rows[i][0];
            var value = rows[i][1];
            if (value === null || value === undefined || value === '') continue;
            var tr = document.createElement('tr');
            var th = document.createElement('th');
            th.textContent = label;
            var td = document.createElement('td');
            td.textContent = value;
            tr.appendChild(th);
            tr.appendChild(td);
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        els.metadataTab.appendChild(table);
    }

    function buildFilesTab(item) {
        els.filesTab.innerHTML = '';

        var dlSection = document.createElement('div');
        dlSection.className = 'drawer-files-section';
        dlSection.innerHTML = '<h4>Download</h4>';
        var btnRow = document.createElement('div');
        btnRow.className = 'drawer-files-buttons';

        var allBtn = document.createElement('a');
        allBtn.className = 'drawer-file-btn secondary';
        allBtn.textContent = 'All as zip';
        allBtn.href = '/api/media/' + encodeURIComponent(String(item._id)) + '/download-zip?versions=thumbnail,display,fullres';
        allBtn.setAttribute('download', '');
        btnRow.appendChild(allBtn);

        var versions = [
            { value: 'thumbnail', label: 'Thumbnail (.jpg)' },
            { value: 'display', label: 'Display' + (item.mediaType === 'video' ? ' (.mp4)' : ' (.png)') },
            { value: 'fullres', label: 'Full-resolution' + (item.mediaType === 'video' ? ' (.mp4)' : ' (.png)') }
        ];
        for (var v = 0; v < versions.length; v++) {
            var a = document.createElement('a');
            a.className = 'drawer-file-btn';
            a.textContent = versions[v].label;
            a.href = '/api/media/' + encodeURIComponent(String(item._id)) + '/download/' + versions[v].value;
            a.setAttribute('download', '');
            btnRow.appendChild(a);
        }
        dlSection.appendChild(btnRow);
        els.filesTab.appendChild(dlSection);

        var replaceSection = document.createElement('div');
        replaceSection.className = 'drawer-files-section';
        replaceSection.innerHTML =
            '<h4>Replace Full-Resolution File</h4>' +
            '<div class="drawer-replace-block">' +
            '<p>Upload a new ' + (item.mediaType === 'video' ? 'video' : 'image') +
            ' to replace the current full-resolution file. The display version (with watermark) and thumbnail will be regenerated automatically.</p>' +
            '<input type="file" id="drawerReplaceInput" accept="' + (item.mediaType === 'video' ? 'video/*' : 'image/*') + '">' +
            '<button type="button" class="drawer-file-btn secondary" id="drawerReplaceBtn" style="margin-top:0.5rem;">Replace file</button>' +
            '<div class="drawer-replace-status" id="drawerReplaceStatus"></div>' +
            '</div>';
        els.filesTab.appendChild(replaceSection);

        var fileInput = els.filesTab.querySelector('#drawerReplaceInput');
        var replaceBtn = els.filesTab.querySelector('#drawerReplaceBtn');
        var statusEl = els.filesTab.querySelector('#drawerReplaceStatus');

        replaceBtn.addEventListener('click', function () {
            if (!fileInput.files || fileInput.files.length === 0) {
                statusEl.textContent = 'Please choose a file first.';
                statusEl.className = 'drawer-replace-status error';
                return;
            }
            var file = fileInput.files[0];
            statusEl.textContent = 'Uploading and re-processing... This can take a moment for videos.';
            statusEl.className = 'drawer-replace-status';
            replaceBtn.disabled = true;

            var fd = new FormData();
            fd.append('media', file);

            var xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/media/' + encodeURIComponent(String(item._id)) + '/replace-fullres');
            xhr.upload.addEventListener('progress', function (e) {
                if (e.lengthComputable) {
                    var pct = Math.round((e.loaded / e.total) * 100);
                    statusEl.textContent = 'Uploading: ' + pct + '%';
                }
            });
            xhr.addEventListener('load', function () {
                replaceBtn.disabled = false;
                if (xhr.status === 200) {
                    statusEl.textContent = 'Replacement complete. Reloading...';
                    statusEl.className = 'drawer-replace-status success';
                    try {
                        var updated = JSON.parse(xhr.responseText);
                        currentItem = updated;
                        buildPreview(updated);
                        buildMetadataTab(updated);
                        buildFilesTab(updated);
                    } catch (e) {  }
                    if (window.AdminArchive && typeof window.AdminArchive.refresh === 'function') {
                        window.AdminArchive.refresh();
                    }
                } else if (xhr.status === 401) {
                    window.location.href = '/login';
                } else {
                    statusEl.className = 'drawer-replace-status error';
                    var msg = 'Replacement failed (HTTP ' + xhr.status + ')';
                    try {
                        var err = JSON.parse(xhr.responseText);
                        if (err && err.error) msg = err.error;
                    } catch (e) {  }
                    statusEl.textContent = msg;
                }
            });
            xhr.addEventListener('error', function () {
                replaceBtn.disabled = false;
                statusEl.className = 'drawer-replace-status error';
                statusEl.textContent = 'Network error during replace.';
            });
            xhr.addEventListener('timeout', function () {
                replaceBtn.disabled = false;
                statusEl.className = 'drawer-replace-status error';
                statusEl.textContent = 'Replace timed out.';
            });
            xhr.timeout = 600000;
            xhr.send(fd);
        });
    }

    function setupTabs() {
        var tabBtns = els.overlay.querySelectorAll('.drawer-tab-btn');
        var tabContents = els.overlay.querySelectorAll('.media-drawer-tab-content');
        for (var i = 0; i < tabBtns.length; i++) {
            tabBtns[i].addEventListener('click', (function (btn) {
                return function (e) {
                    e.preventDefault();
                    var name = btn.getAttribute('data-drawer-tab');
                    for (var j = 0; j < tabBtns.length; j++) tabBtns[j].classList.remove('active');
                    for (var k = 0; k < tabContents.length; k++) tabContents[k].classList.remove('active');
                    btn.classList.add('active');
                    var target = els.overlay.querySelector('.media-drawer-tab-content[data-drawer-tab-content="' + name + '"]');
                    if (target) target.classList.add('active');
                };
            })(tabBtns[i]));
        }
    }

    function showFirstTab() {
        var tabBtns = els.overlay.querySelectorAll('.drawer-tab-btn');
        var tabContents = els.overlay.querySelectorAll('.media-drawer-tab-content');
        for (var i = 0; i < tabBtns.length; i++) tabBtns[i].classList.remove('active');
        for (var j = 0; j < tabContents.length; j++) tabContents[j].classList.remove('active');
        if (tabBtns[0]) tabBtns[0].classList.add('active');
        if (tabContents[0]) tabContents[0].classList.add('active');
    }

    async function open(item) {
        if (!gatherEls()) return;
        currentItem = item;

        if (typeof window.fetchAllTags === 'function') await window.fetchAllTags();
        if (typeof window.fetchAllGalleries === 'function') await window.fetchAllGalleries();

        showFirstTab();
        buildPreview(item);
        buildDetailsTab(item);
        buildMetadataTab(item);
        buildFilesTab(item);

        els.overlay.style.display = 'flex';
        lockBodyScroll();
    }

    function close() {
        if (!els.overlay) return;
        var video = els.previewBody && els.previewBody.querySelector('video');
        if (video) {
            try { video.pause(); } catch (e) {  }
            video.removeAttribute('src');
        }
        els.overlay.style.display = 'none';
        unlockBodyScroll();
        currentItem = null;
    }

    function readDrawerFormBody() {
        if (!currentItem) return null;
        var body = {};
        body.title = (getEl('field-d_title') || {}).value || '';
        body.description = (getEl('field-d_description') || {}).value || '';
        body.alt = (getEl('field-d_alt') || {}).value || '';
        body.creator = (getEl('field-d_creator') || {}).value || '';

        var captured = (getEl('field-d_capturedAt') || {}).value || '';
        body.capturedAt = captured ? new Date(captured + 'Z').toISOString() : null;

        var tagPills = els.detailsTab.querySelectorAll('.tag-pill:not(.gallery-pill)');
        var tags = [];
        for (var i = 0; i < tagPills.length; i++) {
            tags.push(tagPills[i].getAttribute('data-tag'));
        }
        body.tags = tags;

        var galleryPills = els.detailsTab.querySelectorAll('.gallery-pill');
        var galleries = [];
        for (var j = 0; j < galleryPills.length; j++) {
            var gSlug = galleryPills[j].getAttribute('data-slug');
            var gName = galleryPills[j].getAttribute('data-name');
            if (gSlug && gName) {
                galleries.push({ gallerySlug: gSlug, galleryName: gName, galleryPosition: 1 });
            }
        }
        body.galleries = galleries;

        body.location = {
            city: (getEl('field-d_location-city') || {}).value || '',
            state: (getEl('field-d_location-state') || {}).value || '',
            country: (getEl('field-d_location-country') || {}).value || ''
        };

        body.display = !!(getEl('field-d_display') && getEl('field-d_display').checked);
        body.showInRecent = !!(getEl('field-d_showInRecent') && getEl('field-d_showInRecent').checked);
        body.availableForSale = !!(getEl('field-d_availableForSale') && getEl('field-d_availableForSale').checked);
        body.availableForLicense = !!(getEl('field-d_availableForLicense') && getEl('field-d_availableForLicense').checked);

        return body;
    }

    async function saveDrawer(event) {
        event.preventDefault();
        if (!currentItem) return;
        var body = readDrawerFormBody();
        try {
            var response = await fetch('/api/media/' + encodeURIComponent(String(currentItem._id)), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (response.status === 401) {
                window.location.href = '/login';
                return;
            }
            if (response.ok) {
                close();
                if (window.AdminArchive && typeof window.AdminArchive.refresh === 'function') {
                    window.AdminArchive.refresh();
                }
            } else {
                var data = await response.json();
                alert(data.error || 'Failed to save.');
            }
        } catch (err) {
            alert('Error saving media.');
        }
    }

    function bindOnce() {
        if (els.overlay.dataset.bound === '1') return;
        els.overlay.dataset.bound = '1';

        setupTabs();

        els.closeBtn.addEventListener('click', close);
        els.cancelBtn.addEventListener('click', close);
        els.overlay.addEventListener('click', function (e) {
            if (e.target === els.overlay) close();
        });
        els.form.addEventListener('submit', saveDrawer);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && els.overlay.style.display === 'flex') close();
        });
    }

    function init() {
        if (!gatherEls()) return;
        bindOnce();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.MediaDrawer = { open: open, close: close };

})(window, document);
