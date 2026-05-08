async function apiCall(url, options) {
    var response = await fetch(url, options);
    if (response.status === 401) {
        window.location.href = '/login';
        throw new Error('Session expired');
    }
    return response;
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

async function saveReorder(gridId, apiPath) {
    var grid = document.getElementById(gridId);
    var cards = grid.querySelectorAll('.item-card');
    var ids = [];

    for (const card of cards) {
        ids.push(card.getAttribute('data-id'));
    }
    try {
        await apiCall('/api/' + apiPath + '/reorder', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: ids })
        });
    } catch (error) {
        alert('Error saving order.');
    }
}

function moveCard(card, direction, gridId, apiPath) {
    var grid = document.getElementById(gridId);
    if (direction === 'up' && card.previousElementSibling) {
        grid.insertBefore(card, card.previousElementSibling);
    } else if (direction === 'down' && card.nextElementSibling) {
        grid.insertBefore(card.nextElementSibling, card);
    }
    updateSortBadges(gridId);
    saveReorder(gridId, apiPath);
}

function updateSortBadges(gridId) {
    var grid = document.getElementById(gridId);
    var cards = grid.querySelectorAll('.item-card');

    for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
        var sortSpan = cards[cardIndex].querySelector('.meta-sort');
        if (sortSpan) sortSpan.textContent = 'Sort: ' + (cardIndex + 1);
    }
}

var sortableInstances = {};
function initSortable(gridId, apiPath) {
    if (sortableInstances[gridId]) {
        sortableInstances[gridId].destroy();
    }
    var grid = document.getElementById(gridId);
    sortableInstances[gridId] = new Sortable(grid, {
        animation: 200,
        handle: '.drag-handle',
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        onEnd: function () {
            updateSortBadges(gridId);
            saveReorder(gridId, apiPath);
        }
    });
}

(async function init() {
    try {
        var response = await fetch('/api/session');
        var data = await response.json();
        if (!data.authenticated) {
            window.location.href = '/login';
            return;
        }
        document.getElementById('adminUsername').textContent = data.username;
        document.getElementById('adminAccountType').textContent = data.accountType;
        loadWhatsNew();
        loadServices();
    } catch (error) {
        window.location.href = '/login';
    }
})();

document.getElementById('logoutBtn').addEventListener('click', async function () {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
});

var tabButtons = document.querySelectorAll('.tab-btn');
var tabContents = document.querySelectorAll('.tab-content');

for (const button of tabButtons) {
    button.addEventListener('click', function () {
        var tab = this.getAttribute('data-tab');
        for (const tabButton of tabButtons) { tabButton.classList.remove('active'); }
        for (const content of tabContents) { content.classList.remove('active'); }
        this.classList.add('active');
        document.getElementById(tab + '-section').classList.add('active');

        if (tab === 'schema') {
            loadSchema();
        }
        if (tab === 'galleries') {
            showGalleryListView();
            loadGalleries();
        }
    });
}

var modal = document.getElementById('modal');
var modalTitle = document.getElementById('modalTitle');
var modalFields = document.getElementById('modalFields');
var modalForm = document.getElementById('modalForm');

var currentEditType = null;
var currentEditId = null;
var batchEntryActive = false;

function openModal(title) {
    modalTitle.textContent = title;
    modal.style.display = 'flex';
}

function closeModal() {
    modal.style.display = 'none';
    modalFields.innerHTML = '';
    currentEditType = null;
    currentEditId = null;
}

document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
document.getElementById('modalCancelBtn').addEventListener('click', closeModal);

modal.addEventListener('click', function (event) {
    if (event.target === modal) closeModal();
});

document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && modal.style.display === 'flex') closeModal();
});

function createField(label, name, type, value, required) {
    var group = document.createElement('div');
    group.className = 'form-group';

    if (type === 'checkbox') {
        group.className = 'form-group checkbox-group';
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.id = 'field-' + name;
        input.name = name;
        input.checked = Boolean(value);
        group.appendChild(input);

        var labelEl = document.createElement('label');
        labelEl.setAttribute('for', 'field-' + name);
        labelEl.textContent = label;
        group.appendChild(labelEl);
        return group;
    }

    var labelEl = document.createElement('label');
    labelEl.setAttribute('for', 'field-' + name);
    labelEl.textContent = label;
    group.appendChild(labelEl);

    var input;
    if (type === 'textarea') {
        input = document.createElement('textarea');
    } else {
        input = document.createElement('input');
        input.type = type;
        if (type === 'number') {
            input.step = 'any';
        }
        if (type === 'datetime-local') {
            input.step = '1';
        }
    }
    input.id = 'field-' + name;
    input.name = name;
    if (value !== undefined && value !== null) {
        input.value = value;
    }
    if (required) input.required = true;
    group.appendChild(input);

    if (type === 'datetime-local') {
        var hint = document.createElement('small');
        hint.className = 'field-hint';
        hint.textContent = value ? 'Auto-detected from file metadata. Edit if needed.' : 'Enter the date and time the media was captured.';
        group.appendChild(hint);
    }

    return group;
}

async function loadWhatsNew() {
    var grid = document.getElementById('whatsNewGrid');
    try {
        var response = await apiCall('/api/whats-new');
        var items = await response.json();
        grid.innerHTML = '';

        if (items.length === 0) {
            grid.innerHTML = '<p class="loading-text">No items found. Click "+ Add New Item" to create one.</p>';
            return;
        }

        for (let index = 0; index < items.length; index++) {
            let item = items[index];
            let card = document.createElement('div');
            card.className = 'item-card';
            card.setAttribute('data-id', item._id);

            var dateStr = 'No date';
            if (item.date) {
                var d = new Date(item.date);
                var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                dateStr = monthNames[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
            }

            card.innerHTML =
                '<div class="card-reorder-bar">' +
                '<span class="drag-handle" title="Drag to reorder">&#9776;</span>' +
                '<div class="move-buttons">' +
                '<button class="move-btn move-up-btn" title="Move up">&#9650;</button>' +
                '<button class="move-btn move-down-btn" title="Move down">&#9660;</button>' +
                '</div>' +
                '</div>' +
                '<div class="card-ids">' +
                '<span class="id-badge"><strong>_id:</strong> ' + escapeHtml(item._id) + '</span>' +
                (item.legacyId !== undefined ? '<span class="id-badge"><strong>Product ID:</strong> ' + escapeHtml(String(item.legacyId)) + '</span>' : '') +
                '</div>' +
                '<h3>' + escapeHtml(item.title || 'Untitled') + '</h3>' +
                '<p class="card-description">' + escapeHtml(item.description || '') + '</p>' +
                '<div class="card-meta">' +
                '<span class="meta-date">' + escapeHtml(dateStr) + '</span>' +
                (item.tag ? '<span class="meta-tag">' + escapeHtml(item.tag) + '</span>' : '') +
                '<span class="meta-status ' + (item.display ? 'active' : 'inactive') + '">' +
                (item.display ? 'Visible' : 'Hidden') + '</span>' +
                '<span class="meta-sort">Sort: ' + (index + 1) + '</span>' +
                '</div>' +
                '<div class="card-actions">' +
                '<button class="edit-btn">Edit</button>' +
                '<button class="delete-btn">Delete</button>' +
                '</div>';

            card.querySelector('.move-up-btn').addEventListener('click', function () {
                moveCard(card, 'up', 'whatsNewGrid', 'whats-new');
            });
            card.querySelector('.move-down-btn').addEventListener('click', function () {
                moveCard(card, 'down', 'whatsNewGrid', 'whats-new');
            });
            card.querySelector('.edit-btn').addEventListener('click', function () {
                editWhatsNew(item);
            });
            card.querySelector('.delete-btn').addEventListener('click', function () {
                deleteWhatsNew(item._id, item.title);
            });

            grid.appendChild(card);
        }

        initSortable('whatsNewGrid', 'whats-new');
    } catch (error) {
        grid.innerHTML = '<p class="loading-text">Failed to load items.</p>';
    }
}

document.getElementById('addWhatsNewBtn').addEventListener('click', function () {
    currentEditType = 'whats-new';
    currentEditId = null;

    modalFields.innerHTML = '';
    modalFields.appendChild(createField('Title', 'title', 'text', '', true));
    modalFields.appendChild(createField('Description', 'description', 'textarea', '', true));
    modalFields.appendChild(createField('Date', 'date', 'date', new Date().toISOString().split('T')[0], true));
    modalFields.appendChild(createField('Tag', 'tag', 'text', '', false));
    modalFields.appendChild(createField('Sort Order', 'sortOrder', 'number', 0, false));
    modalFields.appendChild(createField('Visible', 'display', 'checkbox', true, false));

    openModal("Add What's New Item");
});

function editWhatsNew(item) {
    currentEditType = 'whats-new';
    currentEditId = item._id;

    var dateStr = item.date ? new Date(item.date).toISOString().split('T')[0] : '';

    modalFields.innerHTML = '';
    modalFields.appendChild(createField('Title', 'title', 'text', item.title || '', true));
    modalFields.appendChild(createField('Description', 'description', 'textarea', item.description || '', true));
    modalFields.appendChild(createField('Date', 'date', 'date', dateStr, true));
    modalFields.appendChild(createField('Tag', 'tag', 'text', item.tag || '', false));
    modalFields.appendChild(createField('Sort Order', 'sortOrder', 'number', item.sortOrder || 0, false));
    modalFields.appendChild(createField('Visible', 'display', 'checkbox', item.display, false));

    openModal("Edit What's New Item");
}

async function deleteWhatsNew(id, title) {
    if (!confirm('Are you sure you want to delete "' + (title || 'this item') + '"?\n\n_id: ' + id)) return;

    try {
        var response = await apiCall('/api/whats-new/' + id, { method: 'DELETE' });
        if (response.ok) {
            loadWhatsNew();
        } else {
            var data = await response.json();
            alert(data.error || 'Failed to delete item.');
        }
    } catch (error) {
        alert('Error deleting item.');
    }
}

async function loadServices() {
    var grid = document.getElementById('servicesGrid');
    try {
        var response = await apiCall('/api/services');
        var items = await response.json();
        grid.innerHTML = '';

        if (items.length === 0) {
            grid.innerHTML = '<p class="loading-text">No services found. Click "+ Add New Service" to create one.</p>';
            return;
        }

        for (let index = 0; index < items.length; index++) {
            let item = items[index];
            let card = document.createElement('div');
            card.className = 'item-card';
            card.setAttribute('data-id', item._id);

            card.innerHTML =
                '<div class="card-reorder-bar">' +
                '<span class="drag-handle" title="Drag to reorder">&#9776;</span>' +
                '<div class="move-buttons">' +
                '<button class="move-btn move-up-btn" title="Move up">&#9650;</button>' +
                '<button class="move-btn move-down-btn" title="Move down">&#9660;</button>' +
                '</div>' +
                '</div>' +
                '<div class="card-ids">' +
                '<span class="id-badge"><strong>_id:</strong> ' + escapeHtml(item._id) + '</span>' +
                (item.legacyId !== undefined ? '<span class="id-badge"><strong>Product ID:</strong> ' + escapeHtml(String(item.legacyId)) + '</span>' : '') +
                '</div>' +
                '<h3>' + escapeHtml(item.serviceName || 'Untitled') + '</h3>' +
                '<p class="card-description">' + escapeHtml(item.serviceDescription || '') + '</p>' +
                '<div class="card-meta">' +
                '<span class="meta-price">$' + (item.price || 0).toLocaleString() + '</span>' +
                '<span class="meta-status ' + (item.active ? 'active' : 'inactive') + '">' +
                (item.active ? 'Active' : 'Inactive') + '</span>' +
                '<span class="meta-status ' + (item.display ? 'active' : 'inactive') + '">' +
                (item.display ? 'Visible' : 'Hidden') + '</span>' +
                '<span class="meta-sort">Sort: ' + (index + 1) + '</span>' +
                '</div>' +
                '<div class="card-actions">' +
                '<button class="edit-btn">Edit</button>' +
                '<button class="delete-btn">Delete</button>' +
                '</div>';

            card.querySelector('.move-up-btn').addEventListener('click', function () {
                moveCard(card, 'up', 'servicesGrid', 'services');
            });
            card.querySelector('.move-down-btn').addEventListener('click', function () {
                moveCard(card, 'down', 'servicesGrid', 'services');
            });
            card.querySelector('.edit-btn').addEventListener('click', function () {
                editService(item);
            });
            card.querySelector('.delete-btn').addEventListener('click', function () {
                deleteService(item._id, item.serviceName);
            });

            grid.appendChild(card);
        }

        initSortable('servicesGrid', 'services');
    } catch (error) {
        grid.innerHTML = '<p class="loading-text">Failed to load services.</p>';
    }
}

document.getElementById('addServiceBtn').addEventListener('click', function () {
    currentEditType = 'services';
    currentEditId = null;

    modalFields.innerHTML = '';
    modalFields.appendChild(createField('Service Name', 'serviceName', 'text', '', true));
    modalFields.appendChild(createField('Description', 'serviceDescription', 'textarea', '', true));
    modalFields.appendChild(createField('Price ($)', 'price', 'number', 0, true));
    modalFields.appendChild(createField('Sort Order', 'sortOrder', 'number', 0, false));
    modalFields.appendChild(createField('Visible', 'display', 'checkbox', true, false));
    modalFields.appendChild(createField('Active', 'active', 'checkbox', true, false));

    openModal('Add Service');
});

function editService(item) {
    currentEditType = 'services';
    currentEditId = item._id;

    modalFields.innerHTML = '';
    modalFields.appendChild(createField('Service Name', 'serviceName', 'text', item.serviceName || '', true));
    modalFields.appendChild(createField('Description', 'serviceDescription', 'textarea', item.serviceDescription || '', true));
    modalFields.appendChild(createField('Price ($)', 'price', 'number', item.price || 0, true));
    modalFields.appendChild(createField('Sort Order', 'sortOrder', 'number', item.sortOrder || 0, false));
    modalFields.appendChild(createField('Visible', 'display', 'checkbox', item.display, false));
    modalFields.appendChild(createField('Active', 'active', 'checkbox', item.active, false));

    openModal('Edit Service');
}

async function deleteService(id, name) {
    if (!confirm('Are you sure you want to delete "' + (name || 'this service') + '"?\n\n_id: ' + id)) return;

    try {
        var response = await apiCall('/api/services/' + id, { method: 'DELETE' });
        if (response.ok) {
            loadServices();
        } else {
            var data = await response.json();
            alert(data.error || 'Failed to delete service.');
        }
    } catch (error) {
        alert('Error deleting service.');
    }
}

var allGalleriesCache = [];
var allGalleriesFetchPromise = null;
async function fetchAllGalleries(refresh) {
    if (!refresh && allGalleriesCache.length > 0) return allGalleriesCache;
    if (allGalleriesFetchPromise && !refresh) return allGalleriesFetchPromise;
    allGalleriesFetchPromise = (async function () {
        try {
            var response = await apiCall('/api/galleries/admin');
            allGalleriesCache = await response.json();
        } catch (error) {
            allGalleriesCache = [];
        } finally {
            allGalleriesFetchPromise = null;
        }
        return allGalleriesCache;
    })();
    return allGalleriesFetchPromise;
}

function showGalleryListView() {
    var listView = document.getElementById('galleryViewList');
    var manageView = document.getElementById('galleryViewManage');
    if (!listView || !manageView) return;
    listView.classList.add('active');
    manageView.classList.remove('active');
}

function showGalleryManageView() {
    var listView = document.getElementById('galleryViewList');
    var manageView = document.getElementById('galleryViewManage');
    if (!listView || !manageView) return;
    listView.classList.remove('active');
    manageView.classList.add('active');
}

async function loadGalleries() {
    var grid = document.getElementById('galleriesGrid');
    if (!grid) return;
    try {
        var response = await apiCall('/api/galleries/admin');
        var galleries = await response.json();
        allGalleriesCache = galleries;
        grid.innerHTML = '';

        if (galleries.length === 0) {
            grid.innerHTML = '<p class="loading-text">No galleries yet. Click "+ Add Gallery" to create one.</p>';
            return;
        }

        for (let index = 0; index < galleries.length; index++) {
            let gallery = galleries[index];
            let card = document.createElement('div');
            card.className = 'item-card';
            card.setAttribute('data-id', gallery._id);

            card.innerHTML =
                '<div class="card-reorder-bar">' +
                '<span class="drag-handle" title="Drag to reorder">&#9776;</span>' +
                '<div class="move-buttons">' +
                '<button class="move-btn move-up-btn" title="Move up">&#9650;</button>' +
                '<button class="move-btn move-down-btn" title="Move down">&#9660;</button>' +
                '</div>' +
                '</div>' +
                '<div class="card-ids">' +
                '<span class="id-badge"><strong>_id:</strong> ' + escapeHtml(gallery._id) + '</span>' +
                '<span class="id-badge"><strong>slug:</strong> ' + escapeHtml(gallery.slug) + '</span>' +
                '</div>' +
                '<h3>' + escapeHtml(gallery.title || 'Untitled') + '</h3>' +
                '<p class="card-description">' + escapeHtml(gallery.description || '') + '</p>' +
                '<div class="card-meta">' +
                '<span class="meta-tag">' + (gallery.mediaCount || 0) + (gallery.mediaCount === 1 ? ' item' : ' items') + '</span>' +
                '<span class="meta-status ' + (gallery.display ? 'active' : 'inactive') + '">' +
                (gallery.display ? 'Visible' : 'Hidden') + '</span>' +
                '<span class="meta-sort">Sort: ' + (index + 1) + '</span>' +
                '</div>' +
                '<div class="card-actions">' +
                '<button class="manage-btn">Manage Media</button>' +
                '<button class="edit-btn">Edit</button>' +
                '<button class="delete-btn">Delete</button>' +
                '</div>';

            card.querySelector('.move-up-btn').addEventListener('click', function () {
                moveCard(card, 'up', 'galleriesGrid', 'galleries');
            });
            card.querySelector('.move-down-btn').addEventListener('click', function () {
                moveCard(card, 'down', 'galleriesGrid', 'galleries');
            });
            card.querySelector('.edit-btn').addEventListener('click', function () {
                editGallery(gallery);
            });
            card.querySelector('.delete-btn').addEventListener('click', function () {
                deleteGallery(gallery._id, gallery.title);
            });
            card.querySelector('.manage-btn').addEventListener('click', function () {
                manageGalleryMedia(gallery);
            });

            grid.appendChild(card);
        }

        initSortable('galleriesGrid', 'galleries');
    } catch (error) {
        grid.innerHTML = '<p class="loading-text">Failed to load galleries.</p>';
    }
}

document.getElementById('addGalleryBtn').addEventListener('click', function () {
    currentEditType = 'gallery';
    currentEditId = null;
    modalFields.innerHTML = '';
    modalFields.appendChild(createField('Title', 'title', 'text', '', true));
    modalFields.appendChild(createField('Description', 'description', 'textarea', '', false));
    modalFields.appendChild(createField('Sort Order', 'sortOrder', 'number', allGalleriesCache.length + 1, false));
    modalFields.appendChild(createField('Visible', 'display', 'checkbox', true, false));
    openModal('Add Gallery');
});

function editGallery(gallery) {
    currentEditType = 'gallery';
    currentEditId = gallery._id;
    modalFields.innerHTML = '';
    modalFields.appendChild(createField('Title', 'title', 'text', gallery.title || '', true));
    modalFields.appendChild(createField('Slug', 'slug', 'text', gallery.slug || '', true));
    modalFields.appendChild(createField('Description', 'description', 'textarea', gallery.description || '', false));
    modalFields.appendChild(createField('Sort Order', 'sortOrder', 'number', gallery.sortOrder || 0, false));
    modalFields.appendChild(createField('Visible', 'display', 'checkbox', gallery.display, false));
    openModal('Edit Gallery');
}

async function deleteGallery(id, name) {
    if (!confirm('Are you sure you want to delete "' + (name || 'this gallery') + '"?\n\nThis will also remove the gallery membership from every photo and video that belonged to it.\n\n_id: ' + id)) return;
    try {
        var response = await apiCall('/api/galleries/' + id, { method: 'DELETE' });
        if (response.ok) {
            loadGalleries();
            fetchAllGalleries(true);
        } else {
            var data = await response.json();
            alert(data.error || 'Failed to delete gallery.');
        }
    } catch (error) {
        alert('Error deleting gallery.');
    }
}

var currentManageGallery = null;
var manageAllMedia = [];
var manageMemberIds = new Set();

async function manageGalleryMedia(gallery) {
    currentManageGallery = gallery;
    showGalleryManageView();
    document.getElementById('galleryManageTitle').textContent = 'Manage media — ' + (gallery.title || 'Untitled');
    document.getElementById('galleryManageMeta').textContent = 'slug: ' + gallery.slug;
    document.getElementById('galleryManageAvailableList').innerHTML = '<p class="loading-text">Loading media...</p>';
    document.getElementById('galleryMembersList').innerHTML = '<p class="loading-text">Loading members...</p>';
    document.getElementById('galleryManageSearch').value = '';
    try {
        var mediaResp = await apiCall('/api/media');
        manageAllMedia = await mediaResp.json();
        var galleriesResp = await apiCall('/api/galleries/admin');
        var galleries = await galleriesResp.json();
        allGalleriesCache = galleries;
        var fresh = galleries.find(function (g) { return g._id === gallery._id; });
        var memberIds = (fresh && fresh.memberIds) ? fresh.memberIds : (gallery.memberIds || []);
        manageMemberIds = new Set(memberIds.map(String));
        renderManageAvailable();
        renderManageMembers(memberIds);
    } catch (error) {
        document.getElementById('galleryManageAvailableList').innerHTML = '<p class="loading-text">Failed to load media.</p>';
        document.getElementById('galleryMembersList').innerHTML = '<p class="loading-text">Failed to load members.</p>';
    }
}

function renderManageAvailable() {
    var list = document.getElementById('galleryManageAvailableList');
    var query = (document.getElementById('galleryManageSearch').value || '').trim().toLowerCase();
    list.innerHTML = '';
    var filtered = manageAllMedia.filter(function (m) {
        if (manageMemberIds.has(String(m._id))) return false;
        if (!query) return true;
        var title = (m.title || '').toLowerCase();
        var fileName = (m.fileName || '').toLowerCase();
        var tags = (m.tags || []).join(' ').toLowerCase();
        return title.indexOf(query) !== -1 || fileName.indexOf(query) !== -1 || tags.indexOf(query) !== -1;
    });
    if (filtered.length === 0) {
        list.innerHTML = '<p class="loading-text">' + (query ? 'No media matches your filter.' : 'All media is in this gallery.') + '</p>';
        return;
    }
    var capped = filtered.slice(0, 200);
    for (let i = 0; i < capped.length; i++) {
        let media = capped[i];
        let row = buildManageRow(media, 'available');
        list.appendChild(row);
    }
}

function renderManageMembers(memberIds) {
    var list = document.getElementById('galleryMembersList');
    list.innerHTML = '';
    var byId = {};
    for (let i = 0; i < manageAllMedia.length; i++) byId[String(manageAllMedia[i]._id)] = manageAllMedia[i];
    var rendered = 0;
    for (let i = 0; i < memberIds.length; i++) {
        var media = byId[String(memberIds[i])];
        if (!media) continue;
        let row = buildManageRow(media, 'member');
        list.appendChild(row);
        rendered++;
    }
    if (rendered === 0) {
        list.innerHTML = '<p class="loading-text">No media yet. Add some from the left pane.</p>';
        return;
    }
    if (sortableInstances['galleryMembersList']) {
        sortableInstances['galleryMembersList'].destroy();
    }
    sortableInstances['galleryMembersList'] = new Sortable(list, {
        animation: 200,
        handle: '.gallery-member-handle',
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        onEnd: function () {
            saveGalleryMemberOrder();
        }
    });
}

function buildManageRow(media, mode) {
    var row = document.createElement('div');
    row.className = 'gallery-member-row gallery-member-row-' + mode;
    row.setAttribute('data-id', media._id);

    if (mode === 'member') {
        var handle = document.createElement('span');
        handle.className = 'gallery-member-handle';
        handle.title = 'Drag to reorder';
        handle.innerHTML = '&#9776;';
        row.appendChild(handle);
    }

    var thumbWrap = document.createElement('div');
    thumbWrap.className = 'gallery-member-thumb';
    if (media.thumbnailPath) {
        var img = document.createElement('img');
        var fname = media.thumbnailPath.split('/').pop();
        img.src = '/thumbnails/' + encodeURIComponent(fname);
        img.alt = media.title || '';
        img.loading = 'lazy';
        thumbWrap.appendChild(img);
    } else {
        thumbWrap.textContent = (media.mediaType === 'video' ? '\u25B6' : '');
    }
    row.appendChild(thumbWrap);

    var meta = document.createElement('div');
    meta.className = 'gallery-member-meta';
    meta.innerHTML = '<strong>' + escapeHtml(media.title || media.fileName || 'Untitled') + '</strong>' +
        '<small>' + escapeHtml(media.fileName || '') + '</small>';
    row.appendChild(meta);

    var actions = document.createElement('div');
    actions.className = 'gallery-member-actions';
    if (mode === 'available') {
        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'add-btn-inline';
        addBtn.textContent = '+ Add';
        addBtn.addEventListener('click', function () {
            addMediaToCurrentGallery(media._id);
        });
        actions.appendChild(addBtn);
    } else {
        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-btn-inline';
        removeBtn.title = 'Remove from gallery';
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', function () {
            removeMediaFromCurrentGallery(media._id);
        });
        actions.appendChild(removeBtn);
    }
    row.appendChild(actions);

    return row;
}

async function addMediaToCurrentGallery(mediaId) {
    if (!currentManageGallery) return;
    try {
        var response = await apiCall('/api/galleries/' + currentManageGallery._id + '/media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mediaId: mediaId })
        });
        if (!response.ok) {
            var data = await response.json();
            alert(data.error || 'Failed to add media to gallery.');
            return;
        }
        manageMemberIds.add(String(mediaId));
        renderManageAvailable();
        var memberIds = readMemberOrder();
        if (memberIds.indexOf(String(mediaId)) === -1) memberIds.push(String(mediaId));
        renderManageMembers(memberIds);
        fetchAllGalleries(true);
    } catch (error) {
        alert('Error adding media to gallery.');
    }
}

async function removeMediaFromCurrentGallery(mediaId) {
    if (!currentManageGallery) return;
    try {
        var response = await apiCall('/api/galleries/' + currentManageGallery._id + '/media/' + mediaId, {
            method: 'DELETE'
        });
        if (!response.ok) {
            var data = await response.json();
            alert(data.error || 'Failed to remove media from gallery.');
            return;
        }
        manageMemberIds.delete(String(mediaId));
        var memberIds = readMemberOrder().filter(function (id) { return id !== String(mediaId); });
        renderManageAvailable();
        renderManageMembers(memberIds);
        fetchAllGalleries(true);
    } catch (error) {
        alert('Error removing media from gallery.');
    }
}

function readMemberOrder() {
    var rows = document.querySelectorAll('#galleryMembersList .gallery-member-row');
    var ids = [];
    for (var i = 0; i < rows.length; i++) ids.push(rows[i].getAttribute('data-id'));
    return ids;
}

async function saveGalleryMemberOrder() {
    if (!currentManageGallery) return;
    var ids = readMemberOrder();
    if (ids.length === 0) return;
    try {
        await apiCall('/api/galleries/' + currentManageGallery._id + '/media/reorder', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: ids })
        });
    } catch (error) {
        alert('Error saving member order.');
    }
}

document.getElementById('galleryManageSearch').addEventListener('input', function () {
    renderManageAvailable();
});
document.getElementById('galleryManageBackBtn').addEventListener('click', function () {
    showGalleryListView();
    loadGalleries();
});

modalForm.addEventListener('submit', async function (event) {
    event.preventDefault();

    if (batchEntryActive) return;

    var editType = currentEditType;
    var editId = currentEditId;

    var formData = new FormData(modalForm);
    var body = {};

    for (const [key, value] of formData.entries()) {
        if (key === 'price' || key === 'sortOrder') {
            body[key] = Number(value);
        } else {
            body[key] = value;
        }
    }

    var checkboxes = modalFields.querySelectorAll('input[type="checkbox"]');
    for (const checkbox of checkboxes) {
        body[checkbox.name] = checkbox.checked;
    }

    if (editType === 'media') {
        var capturedInput = document.getElementById('field-capturedAt');
        if (capturedInput) {
            body.capturedAt = capturedInput.value
                ? new Date(capturedInput.value + 'Z').toISOString()
                : null;
        }

        var tagPills = modalFields.querySelectorAll('.tag-pill');
        var tags = [];
        for (const pill of tagPills) {
            tags.push(pill.getAttribute('data-tag'));
        }
        body.tags = tags;

        var galleryPills = modalFields.querySelectorAll('.gallery-pill');
        var galleries = [];
        for (const pill of galleryPills) {
            var gSlug = pill.getAttribute('data-slug');
            var gName = pill.getAttribute('data-name');
            if (gSlug && gName) {
                galleries.push({
                    gallerySlug: gSlug,
                    galleryName: gName,
                    galleryPosition: 1
                });
            }
        }
        body.galleries = galleries;

        body.location = {
            city: (document.getElementById('field-location-city') || {}).value || '',
            state: (document.getElementById('field-location-state') || {}).value || '',
            country: (document.getElementById('field-location-country') || {}).value || ''
        };

        delete body['location-city'];
        delete body['location-state'];
        delete body['location-country'];
        delete body['gallery-name'];
    }

    var url, method;
    if (editType === 'whats-new') {
        url = editId ? '/api/whats-new/' + editId : '/api/whats-new';
        method = editId ? 'PUT' : 'POST';
    } else if (editType === 'media') {
        url = '/api/media/' + editId;
        method = 'PUT';
    } else if (editType === 'gallery') {
        url = editId ? '/api/galleries/' + editId : '/api/galleries';
        method = editId ? 'PUT' : 'POST';
    } else {
        url = editId ? '/api/services/' + editId : '/api/services';
        method = editId ? 'PUT' : 'POST';
    }

    try {
        var response = await apiCall(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (response.ok) {
            closeModal();
            if (editType === 'whats-new') {
                loadWhatsNew();
            } else if (editType === 'media') {
                loadMedia();
            } else if (editType === 'gallery') {
                loadGalleries();
                fetchAllGalleries(true);
            } else {
                loadServices();
            }
        } else {
            var data = await response.json();
            alert(data.error || 'Failed to save.');
        }
    } catch (error) {
        alert('Error saving item.');
    }
});

var allExistingTags = [];

async function fetchAllTags() {
    try {
        var response = await apiCall('/api/media/tags');
        allExistingTags = await response.json();
    } catch (error) {
        allExistingTags = [];
    }
}

function createTagPicker(initialTags) {
    var container = document.createElement('div');
    container.className = 'form-group';

    var label = document.createElement('label');
    label.textContent = 'Tags';
    container.appendChild(label);

    var picker = document.createElement('div');
    picker.className = 'tag-picker';

    var pillsArea = document.createElement('div');
    pillsArea.className = 'tag-pills-area';
    picker.appendChild(pillsArea);

    var inputWrap = document.createElement('div');
    inputWrap.className = 'tag-input-wrap';

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'tag-input';
    input.placeholder = 'Type to add tags...';
    inputWrap.appendChild(input);

    var dropdown = document.createElement('div');
    dropdown.className = 'tag-dropdown';
    dropdown.style.display = 'none';
    inputWrap.appendChild(dropdown);

    picker.appendChild(inputWrap);
    container.appendChild(picker);

    function getCurrentTags() {
        var tags = [];
        var pills = pillsArea.querySelectorAll('.tag-pill');
        for (const pill of pills) {
            tags.push(pill.getAttribute('data-tag'));
        }
        return tags;
    }

    function addTagPill(tag) {
        tag = tag.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-|-$/g, '');
        if (!tag) return;
        if (getCurrentTags().indexOf(tag) !== -1) return;

        var pill = document.createElement('span');
        pill.className = 'tag-pill';
        pill.setAttribute('data-tag', tag);
        pill.innerHTML = escapeHtml(tag) + ' <button type="button" class="tag-pill-remove">&times;</button>';
        pill.querySelector('.tag-pill-remove').addEventListener('click', function () {
            pill.remove();
        });
        pillsArea.appendChild(pill);
    }

    if (initialTags && initialTags.length) {
        for (const t of initialTags) {
            addTagPill(t);
        }
    }

    function showDropdown() {
        var query = input.value.trim().toLowerCase();
        var current = getCurrentTags();
        var filtered = allExistingTags.filter(function (t) {
            return t.toLowerCase().indexOf(query) !== -1 && current.indexOf(t) === -1;
        });

        if (filtered.length === 0 && !query) {
            dropdown.style.display = 'none';
            return;
        }

        dropdown.innerHTML = '';
        if (query && allExistingTags.indexOf(query) === -1 && current.indexOf(query) === -1) {
            var createItem = document.createElement('div');
            createItem.className = 'tag-dropdown-item tag-dropdown-create';
            createItem.textContent = 'Create "' + query + '"';
            createItem.addEventListener('mousedown', function (e) {
                e.preventDefault();
                addTagPill(query);
                input.value = '';
                dropdown.style.display = 'none';
            });
            dropdown.appendChild(createItem);
        }

        for (const tag of filtered.slice(0, 15)) {
            var item = document.createElement('div');
            item.className = 'tag-dropdown-item';
            item.textContent = tag;
            item.addEventListener('mousedown', function (e) {
                e.preventDefault();
                addTagPill(tag);
                input.value = '';
                dropdown.style.display = 'none';
            });
            dropdown.appendChild(item);
        }

        if (dropdown.children.length > 0) {
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    }

    input.addEventListener('input', showDropdown);
    input.addEventListener('focus', showDropdown);
    input.addEventListener('blur', function () {
        setTimeout(function () { dropdown.style.display = 'none'; }, 200);
    });

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            var val = input.value.trim();
            if (val) {
                addTagPill(val);
                input.value = '';
                dropdown.style.display = 'none';
            }
        }
    });

    return container;
}

function createGalleryInput(initialGalleries) {
    var container = document.createElement('div');
    container.className = 'form-group';

    var label = document.createElement('label');
    label.textContent = 'Galleries';
    container.appendChild(label);

    var picker = document.createElement('div');
    picker.className = 'tag-picker gallery-picker';

    var pillsArea = document.createElement('div');
    pillsArea.className = 'tag-pills-area gallery-pills-area';
    picker.appendChild(pillsArea);

    var inputWrap = document.createElement('div');
    inputWrap.className = 'tag-input-wrap';

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'tag-input';
    input.placeholder = 'Type to search or create a gallery...';
    inputWrap.appendChild(input);

    var dropdown = document.createElement('div');
    dropdown.className = 'tag-dropdown gallery-dropdown';
    dropdown.style.display = 'none';
    inputWrap.appendChild(dropdown);

    picker.appendChild(inputWrap);
    container.appendChild(picker);

    function getCurrentSlugs() {
        var slugs = [];
        var pills = pillsArea.querySelectorAll('.gallery-pill');
        for (const pill of pills) {
            slugs.push(pill.getAttribute('data-slug'));
        }
        return slugs;
    }

    function addGalleryPill(slug, name) {
        if (!slug || !name) return;
        if (getCurrentSlugs().indexOf(slug) !== -1) return;
        var pill = document.createElement('span');
        pill.className = 'tag-pill gallery-pill';
        pill.setAttribute('data-slug', slug);
        pill.setAttribute('data-name', name);
        pill.innerHTML = escapeHtml(name) + ' <button type="button" class="tag-pill-remove">&times;</button>';
        pill.querySelector('.tag-pill-remove').addEventListener('click', function () {
            pill.remove();
        });
        pillsArea.appendChild(pill);
    }

    if (initialGalleries && initialGalleries.length) {
        for (const g of initialGalleries) {
            addGalleryPill(g.gallerySlug || '', g.galleryName || '');
        }
    }

    function showDropdown() {
        var query = input.value.trim().toLowerCase();
        var current = getCurrentSlugs();
        var filtered = allGalleriesCache.filter(function (g) {
            if (current.indexOf(g.slug) !== -1) return false;
            if (!query) return true;
            return (g.title || '').toLowerCase().indexOf(query) !== -1
                || (g.slug || '').toLowerCase().indexOf(query) !== -1;
        });

        if (filtered.length === 0 && !query) {
            dropdown.style.display = 'none';
            return;
        }

        dropdown.innerHTML = '';

        var queryMatchesExisting = allGalleriesCache.some(function (g) {
            return (g.title || '').toLowerCase() === query || (g.slug || '').toLowerCase() === query;
        });
        if (query && !queryMatchesExisting) {
            var createItem = document.createElement('div');
            createItem.className = 'tag-dropdown-item tag-dropdown-create';
            createItem.textContent = 'Create gallery "' + query + '"';
            createItem.addEventListener('mousedown', async function (e) {
                e.preventDefault();
                var newName = input.value.trim();
                if (!newName) return;
                try {
                    var response = await apiCall('/api/galleries', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title: newName, sortOrder: allGalleriesCache.length + 1 })
                    });
                    if (!response.ok) {
                        var data = await response.json();
                        alert(data.error || 'Failed to create gallery.');
                        return;
                    }
                    var created = await response.json();
                    allGalleriesCache.push(created);
                    addGalleryPill(created.slug, created.title);
                    input.value = '';
                    dropdown.style.display = 'none';
                } catch (error) {
                    alert('Error creating gallery.');
                }
            });
            dropdown.appendChild(createItem);
        }

        for (const gallery of filtered.slice(0, 15)) {
            var item = document.createElement('div');
            item.className = 'tag-dropdown-item';
            item.textContent = gallery.title + (gallery.slug && gallery.slug !== gallery.title ? ' (' + gallery.slug + ')' : '');
            item.addEventListener('mousedown', (function (g) {
                return function (e) {
                    e.preventDefault();
                    addGalleryPill(g.slug, g.title);
                    input.value = '';
                    dropdown.style.display = 'none';
                };
            })(gallery));
            dropdown.appendChild(item);
        }

        dropdown.style.display = dropdown.children.length > 0 ? 'block' : 'none';
    }

    input.addEventListener('input', showDropdown);
    input.addEventListener('focus', showDropdown);
    input.addEventListener('blur', function () {
        setTimeout(function () { dropdown.style.display = 'none'; }, 200);
    });

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            var val = input.value.trim();
            if (!val) return;
            var match = allGalleriesCache.find(function (g) {
                return (g.title || '').toLowerCase() === val.toLowerCase() || (g.slug || '').toLowerCase() === val.toLowerCase();
            });
            if (match) {
                addGalleryPill(match.slug, match.title);
                input.value = '';
                dropdown.style.display = 'none';
            }
        }
    });

    return container;
}

function loadMedia() {
    if (window.AdminArchive && typeof window.AdminArchive.refresh === 'function') {
        window.AdminArchive.refresh();
    }
}

async function editMedia(item) {
    currentEditType = 'media';
    currentEditId = item._id;

    await fetchAllTags();
    await fetchAllGalleries();

    modalFields.innerHTML = '';
    var editTitleGroup = createField('Title', 'title', 'text', item.title || '', true);
    modalFields.appendChild(editTitleGroup);
    modalFields.appendChild(createField('Description', 'description', 'textarea', item.description || '', true));
    var editAltGroup = createField('Alt Text', 'alt', 'text', item.alt || '', true);
    modalFields.appendChild(editAltGroup);

    var editTitleInput = editTitleGroup.querySelector('input');
    var editAltInput = editAltGroup.querySelector('input');
    var editAltManual = Boolean(item.alt);
    editAltInput.addEventListener('input', function () {
        editAltManual = true;
    });
    editTitleInput.addEventListener('input', function () {
        if (!editAltManual) {
            editAltInput.value = editTitleInput.value;
        }
    });

    modalFields.appendChild(createField('Creator', 'creator', 'text', item.creator || 'Scott Short', false));

    var capturedVal = '';
    if (item.capturedAt) {
        var cd = new Date(item.capturedAt);
        capturedVal = cd.getUTCFullYear() + '-' +
            String(cd.getUTCMonth() + 1).padStart(2, '0') + '-' +
            String(cd.getUTCDate()).padStart(2, '0') + 'T' +
            String(cd.getUTCHours()).padStart(2, '0') + ':' +
            String(cd.getUTCMinutes()).padStart(2, '0') + ':' +
            String(cd.getUTCSeconds()).padStart(2, '0');
    }
    modalFields.appendChild(createField('Captured Date/Time', 'capturedAt', 'datetime-local', capturedVal, false));

    modalFields.appendChild(createTagPicker(item.tags || []));

    modalFields.appendChild(createGalleryInput(item.galleries || []));

    var locLabel = document.createElement('label');
    locLabel.textContent = 'Location';
    locLabel.className = 'section-label';
    modalFields.appendChild(locLabel);
    modalFields.appendChild(createField('City', 'location-city', 'text', item.location ? item.location.city : '', false));
    modalFields.appendChild(createField('State', 'location-state', 'text', item.location ? item.location.state : '', false));
    modalFields.appendChild(createField('Country', 'location-country', 'text', item.location ? item.location.country : '', false));

    modalFields.appendChild(createField('Visible', 'display', 'checkbox', item.display, false));
    modalFields.appendChild(createField('Show in Recent', 'showInRecent', 'checkbox', item.showInRecent, false));

    openModal('Edit Media — ' + escapeHtml(item.title || 'Untitled'));
}

async function deleteMedia(id, title) {
    if (!confirm('Are you sure you want to delete "' + (title || 'this item') + '"?\n\nThis will also delete the files from disk.\n\n_id: ' + id)) return;

    try {
        var response = await apiCall('/api/media/' + id, { method: 'DELETE' });
        if (response.ok) {
            loadMedia();
        } else {
            var data = await response.json();
            alert(data.error || 'Failed to delete media.');
        }
    } catch (error) {
        alert('Error deleting media.');
    }
}

document.getElementById('uploadMediaBtn').addEventListener('click', function () {
    document.getElementById('mediaFileInput').click();
});

document.getElementById('mediaFileInput').addEventListener('change', async function () {
    var files = this.files;
    if (!files || files.length === 0) return;

    var progressArea = document.getElementById('uploadProgressArea');
    progressArea.style.display = 'block';
    progressArea.innerHTML =
        '<div class="upload-progress-entry">' +
        '<div class="upload-progress-bar-wrap"><div class="upload-progress-bar"></div></div>' +
        '<div class="upload-status">Uploading... 0/' + files.length + '</div>' +
        '</div>';

    var bar = progressArea.querySelector('.upload-progress-bar');
    var statusEl = progressArea.querySelector('.upload-status');
    var totalFiles = files.length;
    var completedFiles = 0;
    var hasError = false;

    await fetchAllTags();
    await fetchAllGalleries();

    var uploadResults = [];
    var errorDetails = [];

    for (let i = 0; i < files.length; i++) {
        var file = files[i];

        try {
            var result = await uploadFile(file, bar, statusEl, i, totalFiles);
            completedFiles++;
            if (result && result.length > 0) {
                for (const r of result) {
                    if (r.document) {
                        uploadResults.push(r);
                    } else if (r.error) {
                        hasError = true;
                        errorDetails.push(file.name + ': ' + r.error);
                        console.error('Upload error for', file.name, ':', r.error);
                    }
                }
            }
        } catch (error) {
            completedFiles++;
            hasError = true;
            errorDetails.push(file.name + ': ' + error.message);
            console.error('Upload failed for', file.name, ':', error.message);
        }
    }

    bar.style.width = '100%';
    if (hasError) {
        var errorMsg = 'Completed with errors (' + completedFiles + '/' + totalFiles + ')';
        if (errorDetails.length > 0) {
            errorMsg += ' — ' + errorDetails.join('; ');
        }
        statusEl.textContent = errorMsg;
        statusEl.classList.add('upload-error');
    } else {
        statusEl.textContent = 'All ' + totalFiles + ' file(s) uploaded';
        statusEl.classList.add('upload-success');
    }

    this.value = '';

    if (uploadResults.length > 0) {
        await runBatchEntry(uploadResults);
    }

    setTimeout(function () {
        progressArea.style.display = 'none';
        progressArea.innerHTML = '';
    }, 2000);
    loadMedia();
});

var CHUNK_SIZE = 50 * 1024 * 1024;

function uploadFile(file, progressBar, statusEl, fileIndex, totalFiles) {
    if (file.size > CHUNK_SIZE) {
        return uploadFileChunked(file, progressBar, statusEl, fileIndex, totalFiles);
    }
    return uploadFileDirect(file, progressBar, statusEl, fileIndex, totalFiles);
}

function uploadFileDirect(file, progressBar, statusEl, fileIndex, totalFiles) {
    return new Promise(function (resolve, reject) {
        var formData = new FormData();
        formData.append('media', file);

        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/media/upload');

        xhr.upload.addEventListener('progress', function (e) {
            if (e.lengthComputable) {
                var fileProgress = e.loaded / e.total;
                var overallPct = Math.round(((fileIndex + fileProgress) / totalFiles) * 100);
                progressBar.style.width = overallPct + '%';
                statusEl.textContent = 'Uploading file ' + (fileIndex + 1) + '/' + totalFiles + ' (' + overallPct + '%)';
            }
        });

        xhr.addEventListener('load', function () {
            if (xhr.status === 201) {
                var overallPct = Math.round(((fileIndex + 1) / totalFiles) * 100);
                progressBar.style.width = overallPct + '%';
                statusEl.textContent = 'Uploaded ' + (fileIndex + 1) + '/' + totalFiles;
                try {
                    resolve(JSON.parse(xhr.responseText));
                } catch (e) {
                    resolve([]);
                }
            } else if (xhr.status === 401) {
                window.location.href = '/login';
                reject(new Error('Session expired'));
            } else {
                var errMsg = 'Upload failed (HTTP ' + xhr.status + ')';
                try {
                    var errData = JSON.parse(xhr.responseText);
                    if (errData.error) errMsg = errData.error;
                } catch (e) {  }
                reject(new Error(errMsg));
            }
        });

        xhr.addEventListener('error', function () { reject(new Error('Network error')); });
        xhr.addEventListener('timeout', function () { reject(new Error('Upload timed out')); });
        xhr.timeout = 600000;
        xhr.send(formData);
    });
}

async function uploadFileChunked(file, progressBar, statusEl, fileIndex, totalFiles) {
    var uploadId = crypto.randomUUID();
    var totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    var totalUploaded = 0;

    for (var c = 0; c < totalChunks; c++) {
        var start = c * CHUNK_SIZE;
        var end = Math.min(start + CHUNK_SIZE, file.size);
        var chunk = file.slice(start, end);

        await new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/media/upload-chunk');
            xhr.setRequestHeader('X-Upload-Id', uploadId);
            xhr.setRequestHeader('X-Chunk-Index', String(c));
            xhr.setRequestHeader('X-Total-Chunks', String(totalChunks));
            xhr.setRequestHeader('X-File-Name', file.name);
            xhr.setRequestHeader('X-Mime-Type', file.type);

            xhr.upload.addEventListener('progress', function (e) {
                if (e.lengthComputable) {
                    var chunkUploaded = totalUploaded + e.loaded;
                    var fileProgress = chunkUploaded / file.size;
                    var overallPct = Math.round(((fileIndex + fileProgress) / totalFiles) * 100);
                    progressBar.style.width = overallPct + '%';
                    statusEl.textContent = 'Uploading file ' + (fileIndex + 1) + '/' + totalFiles + ' \u2014 chunk ' + (c + 1) + '/' + totalChunks + ' (' + overallPct + '%)';
                }
            });

            xhr.addEventListener('load', function () {
                if (xhr.status === 200) {
                    totalUploaded += (end - start);
                    resolve();
                } else if (xhr.status === 401) {
                    window.location.href = '/login';
                    reject(new Error('Session expired'));
                } else {
                    var errMsg = 'Chunk upload failed (HTTP ' + xhr.status + ')';
                    try {
                        var errData = JSON.parse(xhr.responseText);
                        if (errData.error) errMsg = errData.error;
                    } catch (e) {  }
                    reject(new Error(errMsg));
                }
            });

            xhr.addEventListener('error', function () { reject(new Error('Network error during chunk upload')); });
            xhr.addEventListener('timeout', function () { reject(new Error('Chunk upload timed out')); });
            xhr.timeout = 600000;
            xhr.send(chunk);
        });
    }

    statusEl.textContent = 'Processing file ' + (fileIndex + 1) + '/' + totalFiles + '...';

    return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/media/upload-finalize');
        xhr.setRequestHeader('Content-Type', 'application/json');

        xhr.addEventListener('load', function () {
            if (xhr.status === 201) {
                var overallPct = Math.round(((fileIndex + 1) / totalFiles) * 100);
                progressBar.style.width = overallPct + '%';
                statusEl.textContent = 'Uploaded ' + (fileIndex + 1) + '/' + totalFiles;
                try {
                    resolve(JSON.parse(xhr.responseText.trim()));
                } catch (e) {
                    resolve([]);
                }
            } else if (xhr.status === 401) {
                window.location.href = '/login';
                reject(new Error('Session expired'));
            } else {
                var errMsg = 'Finalize failed (HTTP ' + xhr.status + ')';
                try {
                    var errData = JSON.parse(xhr.responseText.trim());
                    if (errData.error) errMsg = errData.error;
                } catch (e) {  }
                reject(new Error(errMsg));
            }
        });

        xhr.addEventListener('error', function () { reject(new Error('Network error during finalize')); });
        xhr.addEventListener('timeout', function () { reject(new Error('Finalize timed out')); });
        xhr.timeout = 600000;
        xhr.send(JSON.stringify({ uploadId: uploadId, fileName: file.name, mimeType: file.type }));
    });
}

function collectModalFormData(doc) {
    var body = {};
    var formData = new FormData(modalForm);
    for (const [key, value] of formData.entries()) {
        body[key] = value;
    }

    var checkboxes = modalFields.querySelectorAll('input[type="checkbox"]');
    for (const checkbox of checkboxes) {
        body[checkbox.name] = checkbox.checked;
    }

    var tagPills = modalFields.querySelectorAll('.tag-pill');
    var tags = [];
    for (const pill of tagPills) {
        tags.push(pill.getAttribute('data-tag'));
    }
    body.tags = tags;

    var galleryPills = modalFields.querySelectorAll('.gallery-pill');
    var galleries = [];
    for (const pill of galleryPills) {
        var gSlug = pill.getAttribute('data-slug');
        var gName = pill.getAttribute('data-name');
        if (gSlug && gName) {
            galleries.push({
                gallerySlug: gSlug,
                galleryName: gName,
                galleryPosition: 1
            });
        }
    }
    body.galleries = galleries;

    body.location = {
        city: (document.getElementById('field-location-city') || {}).value || '',
        state: (document.getElementById('field-location-state') || {}).value || '',
        country: (document.getElementById('field-location-country') || {}).value || ''
    };
    delete body['location-city'];
    delete body['location-state'];
    delete body['location-country'];
    delete body['gallery-name'];

    var capturedInput = document.getElementById('field-capturedAt');
    if (capturedInput) {
        body.capturedAt = capturedInput.value
            ? new Date(capturedInput.value + 'Z').toISOString()
            : null;
    }

    return body;
}

function saveMediaItem(docId, body) {
    return apiCall('/api/media/' + docId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

function runBatchEntry(uploadResults) {
    return new Promise(function (batchResolve) {
        var batchItems = uploadResults;
        var batchTotal = batchItems.length;
        var batchEdits = new Array(batchTotal).fill(null);
        var batchIndex = 0;

        function showItem(index) {
            batchIndex = index;
            var result = batchItems[index];
            var doc = result.document;
            var autoTags = result.autoTags;
            var saved = batchEdits[index];

            currentEditType = 'media';
            currentEditId = doc._id;
            modalFields.innerHTML = '';

            var progressDiv = document.createElement('div');
            progressDiv.className = 'batch-progress';
            progressDiv.innerHTML =
                '<span class="batch-progress-text">Item ' + (index + 1) + ' of ' + batchTotal + '</span>' +
                '<div class="batch-progress-bar-wrap"><div class="batch-progress-bar" style="width:' + Math.round(((index + 1) / batchTotal) * 100) + '%"></div></div>';
            modalFields.appendChild(progressDiv);

            if (doc.displayResolutionPath) {
                var displayFile = doc.displayResolutionPath.split('/').pop();
                var previewDiv = document.createElement('div');
                previewDiv.className = 'upload-preview';
                if (doc.mediaType === 'video') {
                    previewDiv.innerHTML = '<video class="upload-preview-media" src="/media/' + encodeURIComponent(displayFile) + '" controls muted preload="metadata"></video>';
                } else {
                    previewDiv.innerHTML = '<img class="upload-preview-media" src="/media/' + encodeURIComponent(displayFile) + '" alt="Preview">';
                }
                modalFields.appendChild(previewDiv);
            }

            if (autoTags && autoTags.length) {
                var infoDiv = document.createElement('div');
                infoDiv.className = 'auto-tags-info';
                infoDiv.textContent = 'Auto-detected tags: ' + autoTags.join(', ');
                modalFields.appendChild(infoDiv);
            }

            var titleGroup = createField('Title *', 'title', 'text', saved ? saved.title || '' : '', true);
            modalFields.appendChild(titleGroup);
            modalFields.appendChild(createField('Description *', 'description', 'textarea', saved ? saved.description || '' : '', true));
            var altGroup = createField('Alt Text *', 'alt', 'text', saved ? saved.alt || '' : '', true);
            modalFields.appendChild(altGroup);

            var titleInput = titleGroup.querySelector('input');
            var altInput = altGroup.querySelector('input');
            var altManuallyEdited = false;
            if (saved && saved.alt && saved.title && saved.alt !== saved.title) {
                altManuallyEdited = true;
            }
            altInput.addEventListener('input', function () {
                altManuallyEdited = true;
            });
            titleInput.addEventListener('input', function () {
                if (!altManuallyEdited) {
                    altInput.value = titleInput.value;
                }
            });

            modalFields.appendChild(createField('Creator', 'creator', 'text', saved ? saved.creator || 'Scott Short' : doc.creator || 'Scott Short', false));

            var capturedVal = '';
            if (saved && saved.capturedAt) {
                var cd = new Date(saved.capturedAt);
                if (!isNaN(cd.getTime())) {
                    capturedVal = cd.getUTCFullYear() + '-' +
                        String(cd.getUTCMonth() + 1).padStart(2, '0') + '-' +
                        String(cd.getUTCDate()).padStart(2, '0') + 'T' +
                        String(cd.getUTCHours()).padStart(2, '0') + ':' +
                        String(cd.getUTCMinutes()).padStart(2, '0') + ':' +
                        String(cd.getUTCSeconds()).padStart(2, '0');
                }
            } else if (doc.capturedAt) {
                var cd = new Date(doc.capturedAt);
                capturedVal = cd.getUTCFullYear() + '-' +
                    String(cd.getUTCMonth() + 1).padStart(2, '0') + '-' +
                    String(cd.getUTCDate()).padStart(2, '0') + 'T' +
                    String(cd.getUTCHours()).padStart(2, '0') + ':' +
                    String(cd.getUTCMinutes()).padStart(2, '0') + ':' +
                    String(cd.getUTCSeconds()).padStart(2, '0');
            }
            modalFields.appendChild(createField('Captured Date/Time', 'capturedAt', 'datetime-local', capturedVal, false));

            modalFields.appendChild(createTagPicker(saved ? saved.tags || [] : doc.tags || autoTags || []));

            modalFields.appendChild(createGalleryInput(saved ? saved.galleries || [] : []));

            var locLabel = document.createElement('label');
            locLabel.textContent = 'Location';
            locLabel.className = 'section-label';
            modalFields.appendChild(locLabel);
            modalFields.appendChild(createField('City', 'location-city', 'text', saved && saved.location ? saved.location.city : '', false));
            modalFields.appendChild(createField('State', 'location-state', 'text', saved && saved.location ? saved.location.state : '', false));
            modalFields.appendChild(createField('Country', 'location-country', 'text', saved && saved.location ? saved.location.country : '', false));

            modalFields.appendChild(createField('Visible', 'display', 'checkbox', saved ? saved.display : true, false));
            modalFields.appendChild(createField('Show in Recent', 'showInRecent', 'checkbox', saved ? saved.showInRecent : true, false));

            var backBtn = document.getElementById('modalBackBtn');
            if (backBtn) {
                backBtn.style.display = index > 0 ? 'inline-block' : 'none';
            }

            openModal('Complete Media Details \u2014 Item ' + (index + 1) + ' of ' + batchTotal);
        }

        function cleanupListeners() {
            modalForm.removeEventListener('submit', handleSave);
            batchEntryActive = false;
            var backBtn = document.getElementById('modalBackBtn');
            if (backBtn) {
                backBtn.removeEventListener('click', handleBack);
                backBtn.style.display = 'none';
            }
            document.getElementById('modalCloseBtn').removeEventListener('click', handleCancel);
            document.getElementById('modalCancelBtn').removeEventListener('click', handleCancel);
        }

        function handleSave(event) {
            event.preventDefault();
            var body = collectModalFormData(batchItems[batchIndex].document);
            batchEdits[batchIndex] = body;

            saveMediaItem(batchItems[batchIndex].document._id, body).then(function (resp) {
                if (resp.ok) {
                    fetchAllTags();
                    fetchAllGalleries(true);
                    if (batchIndex < batchTotal - 1) {
                        showItem(batchIndex + 1);
                    } else {
                        cleanupListeners();
                        closeModal();
                        batchResolve();
                    }
                } else {
                    resp.json().then(function (data) {
                        alert(data.error || 'Failed to save.');
                    });
                }
            }).catch(function () {
                alert('Error saving media details.');
            });
        }

        function handleBack() {
            batchEdits[batchIndex] = collectModalFormData(batchItems[batchIndex].document);
            showItem(batchIndex - 1);
        }

        function handleCancel() {
            var remaining = batchTotal - batchIndex;
            if (remaining > 1) {
                if (!confirm('You have ' + remaining + ' items remaining in this batch. Skip remaining items?\n\nItems already saved will keep their data. Unsaved items can be edited later from the admin grid.')) {
                    return;
                }
            }
            cleanupListeners();
            closeModal();
            batchResolve();
        }

        modalForm.addEventListener('submit', handleSave);
        batchEntryActive = true;
        var backBtn = document.getElementById('modalBackBtn');
        if (backBtn) {
            backBtn.addEventListener('click', handleBack);
        }
        document.getElementById('modalCloseBtn').addEventListener('click', handleCancel);
        document.getElementById('modalCancelBtn').addEventListener('click', handleCancel);

        showItem(0);
    });
}

var schemaLoaded = false;

async function loadSchema() {
    if (schemaLoaded) return;

    var container = document.getElementById('schemaContainer');
    container.innerHTML = '<p class="loading-text">Loading schema...</p>';

    try {
        var response = await fetch('/api/schema');
        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }
        var collections = await response.json();
        schemaLoaded = true;
        renderSchema(collections);
    } catch (error) {
        container.innerHTML = '<p class="loading-text">Failed to load schema.</p>';
    }
}

function renderSchema(collections) {
    var container = document.getElementById('schemaContainer');
    container.innerHTML = '';

    for (var i = 0; i < collections.length; i++) {
        var col = collections[i];
        var card = document.createElement('div');
        card.className = 'schema-card';

        var header = document.createElement('div');
        header.className = 'schema-card-header';
        header.innerHTML =
            '<h3>' + escapeHtml(col.name) + ' <span class="schema-doc-count">(' + col.docCount + ' docs)</span></h3>' +
            '<span class="schema-collection-name">' + escapeHtml(col.collection) + '</span>';
        card.appendChild(header);

        var body = document.createElement('div');
        body.className = 'schema-card-body';

        var table = document.createElement('table');
        table.className = 'schema-table';

        var thead = document.createElement('thead');
        thead.innerHTML = '<tr><th>Field</th><th>Type</th><th>Notes</th></tr>';
        table.appendChild(thead);

        var tbody = document.createElement('tbody');
        buildFieldRows(tbody, col.fields, 0);
        table.appendChild(tbody);

        body.appendChild(table);
        card.appendChild(body);
        container.appendChild(card);
    }
}

function buildFieldRows(tbody, fields, depth) {
    for (var j = 0; j < fields.length; j++) {
        var field = fields[j];
        var tr = document.createElement('tr');

        var tdName = document.createElement('td');
        var nameSpan = document.createElement('span');
        nameSpan.className = 'schema-field-name';
        nameSpan.textContent = field.name;

        if (depth > 0) {
            tdName.style.paddingLeft = (depth * 1.2 + 0.8) + 'rem';
            tdName.style.background = '#f9f9f5';
        }

        if (field.nested && field.nested.length > 0) {
            nameSpan.className += ' schema-nested-toggle';
            var icon = document.createElement('i');
            icon.className = 'toggle-icon';
            icon.textContent = '\u25B6';
            nameSpan.insertBefore(icon, nameSpan.firstChild);
            nameSpan.insertBefore(document.createTextNode(' '), nameSpan.childNodes[1]);
        }

        tdName.appendChild(nameSpan);
        tr.appendChild(tdName);

        var tdType = document.createElement('td');
        var typeSpan = document.createElement('span');
        typeSpan.className = 'schema-field-type';
        typeSpan.textContent = field.type;
        if (depth > 0) { tdType.style.background = '#f9f9f5'; }
        tdType.appendChild(typeSpan);
        tr.appendChild(tdType);

        var tdNote = document.createElement('td');
        if (depth > 0) { tdNote.style.background = '#f9f9f5'; }
        var notes = [];
        if (field.required) notes.push('required');
        if (field.unique) notes.push('unique');
        if (field.defaultValue !== undefined) notes.push('default: ' + field.defaultValue);
        if (notes.length > 0) {
            var noteSpan = document.createElement('span');
            noteSpan.className = 'schema-field-note';
            noteSpan.textContent = notes.join(', ');
            tdNote.appendChild(noteSpan);
        }
        tr.appendChild(tdNote);

        tbody.appendChild(tr);

        if (field.nested && field.nested.length > 0) {
            var nestedRows = [];
            buildNestedRows(tbody, field.nested, depth + 1, nestedRows);

            (function (toggleSpan, rows) {
                toggleSpan.addEventListener('click', function () {
                    var isOpen = toggleSpan.classList.contains('open');
                    toggleSpan.classList.toggle('open');
                    for (var r = 0; r < rows.length; r++) {
                        rows[r].style.display = isOpen ? 'none' : '';
                    }
                });
            })(nameSpan, nestedRows);
        }
    }
}

function buildNestedRows(tbody, fields, depth, rowTracker) {
    for (var j = 0; j < fields.length; j++) {
        var field = fields[j];
        var tr = document.createElement('tr');
        tr.style.display = 'none';
        rowTracker.push(tr);

        var tdName = document.createElement('td');
        tdName.style.paddingLeft = (depth * 1.2 + 0.8) + 'rem';
        tdName.style.background = '#f9f9f5';
        var nameSpan = document.createElement('span');
        nameSpan.className = 'schema-field-name';
        nameSpan.textContent = field.name;
        tdName.appendChild(nameSpan);
        tr.appendChild(tdName);

        var tdType = document.createElement('td');
        tdType.style.background = '#f9f9f5';
        var typeSpan = document.createElement('span');
        typeSpan.className = 'schema-field-type';
        typeSpan.textContent = field.type;
        tdType.appendChild(typeSpan);
        tr.appendChild(tdType);

        var tdNote = document.createElement('td');
        tdNote.style.background = '#f9f9f5';
        var notes = [];
        if (field.required) notes.push('required');
        if (field.unique) notes.push('unique');
        if (field.defaultValue !== undefined) notes.push('default: ' + field.defaultValue);
        if (notes.length > 0) {
            var noteSpan = document.createElement('span');
            noteSpan.className = 'schema-field-note';
            noteSpan.textContent = notes.join(', ');
            tdNote.appendChild(noteSpan);
        }
        tr.appendChild(tdNote);

        tbody.appendChild(tr);
    }
}

(function () {
    var operationSelect = document.getElementById('queryOperation');
    var updateGroup = document.getElementById('queryUpdateGroup');
    var projectionGroup = document.getElementById('queryProjectionGroup');
    var sortGroup = document.getElementById('querySortGroup');
    var limitInput = document.getElementById('queryLimit');
    var filterTextarea = document.getElementById('queryFilter');
    var updateTextarea = document.getElementById('queryUpdate');
    var projectionTextarea = document.getElementById('queryProjection');
    var sortTextarea = document.getElementById('querySort');
    var runBtn = document.getElementById('queryRunBtn');
    var clearBtn = document.getElementById('queryClearBtn');
    var statusEl = document.getElementById('queryStatus');
    var resultsEl = document.getElementById('queryResults');
    var resultCountEl = document.getElementById('queryResultCount');
    var collectionSelect = document.getElementById('queryCollection');

    function updateVisibleFields() {
        var op = operationSelect.value;
        var needsUpdate = (op === 'updateOne' || op === 'updateMany');
        var needsProjection = (op === 'find' || op === 'findOne');
        var needsSort = (op === 'find');
        var needsLimit = (op === 'find');

        updateGroup.style.display = needsUpdate ? '' : 'none';
        projectionGroup.style.display = needsProjection ? '' : 'none';
        sortGroup.style.display = needsSort ? '' : 'none';
        limitInput.closest('.query-field').style.display = needsLimit ? '' : 'none';

        var filterLabel = filterTextarea.previousElementSibling || filterTextarea.parentElement.querySelector('label');
        if (op === 'aggregate') {
            filterLabel.innerHTML = 'Pipeline <span class="query-hint">JSON array</span>';
            filterTextarea.placeholder = '[{"$match": {"type": "photo"}}, {"$group": {"_id": "$type", "count": {"$sum": 1}}}]';
        } else if (op === 'insertOne') {
            filterLabel.innerHTML = 'Document <span class="query-hint">JSON</span>';
            filterTextarea.placeholder = '{"field": "value"}';
        } else {
            filterLabel.innerHTML = 'Filter <span class="query-hint">JSON</span>';
            filterTextarea.placeholder = '{"type": "photo"}';
        }
    }

    operationSelect.addEventListener('change', updateVisibleFields);
    updateVisibleFields();

    function parseJson(textarea, label) {
        var text = textarea.value.trim();
        if (!text) return null;
        try {
            return JSON.parse(text);
        } catch (e) {
            throw new Error('Invalid JSON in ' + label + ': ' + e.message);
        }
    }

    runBtn.addEventListener('click', async function () {
        statusEl.textContent = 'Running...';
        statusEl.className = 'query-status';
        resultsEl.textContent = '';
        resultCountEl.textContent = '';
        runBtn.disabled = true;

        try {
            var op = operationSelect.value;
            var filter = parseJson(filterTextarea, 'Filter') || (op === 'aggregate' ? [] : {});
            var payload = {
                collection: collectionSelect.value,
                operation: op,
                filter: filter,
                limit: parseInt(limitInput.value) || 20
            };

            if (op === 'updateOne' || op === 'updateMany') {
                var update = parseJson(updateTextarea, 'Update');
                if (!update) {
                    throw new Error('Update field is required for ' + op);
                }
                payload.update = update;
            }

            if (op === 'find' || op === 'findOne') {
                var proj = parseJson(projectionTextarea, 'Projection');
                if (proj) payload.projection = proj;
            }

            if (op === 'find') {
                var sort = parseJson(sortTextarea, 'Sort');
                if (sort) payload.sort = sort;
            }

            var response = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            var data = await response.json();

            if (!response.ok) {
                statusEl.textContent = 'Error';
                statusEl.className = 'query-status error';
                resultsEl.textContent = data.error || 'Query failed';
                return;
            }

            var result = data.result;
            var formatted = JSON.stringify(result, null, 2);
            resultsEl.textContent = formatted;

            if (Array.isArray(result)) {
                resultCountEl.textContent = result.length + ' document' + (result.length !== 1 ? 's' : '');
            } else if (typeof result === 'number') {
                resultCountEl.textContent = 'Count: ' + result;
            } else if (result && typeof result === 'object' && result.matchedCount !== undefined) {
                resultCountEl.textContent = 'Matched: ' + result.matchedCount + ', Modified: ' + result.modifiedCount;
            } else if (result && typeof result === 'object' && result.deletedCount !== undefined) {
                resultCountEl.textContent = 'Deleted: ' + result.deletedCount;
            } else if (result && result._id) {
                resultCountEl.textContent = '1 document';
            } else {
                resultCountEl.textContent = '';
            }

            statusEl.textContent = 'Done';
            statusEl.className = 'query-status';

        } catch (error) {
            statusEl.textContent = 'Error';
            statusEl.className = 'query-status error';
            resultsEl.textContent = error.message;
        } finally {
            runBtn.disabled = false;
        }
    });

    clearBtn.addEventListener('click', function () {
        filterTextarea.value = '';
        updateTextarea.value = '';
        projectionTextarea.value = '';
        sortTextarea.value = '';
        resultsEl.textContent = 'Run a query to see results here.';
        resultCountEl.textContent = '';
        statusEl.textContent = '';
        statusEl.className = 'query-status';
    });

    var textareas = document.querySelectorAll('.query-textarea');
    for (var i = 0; i < textareas.length; i++) {
        textareas[i].addEventListener('keydown', function (e) {
            if (e.key === 'Tab') {
                e.preventDefault();
                var start = this.selectionStart;
                var end = this.selectionEnd;
                this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
                this.selectionStart = this.selectionEnd = start + 2;
            }
        });
    }
})();
