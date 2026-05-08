const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');

function toggleMenu() {
    hamburger.classList.toggle('active');
    navLinks.classList.toggle('active');
}
hamburger.addEventListener('click', toggleMenu);

function closeMenu() {
    hamburger.classList.remove('active');
    navLinks.classList.remove('active');
}

var navigationLinks = navLinks.getElementsByTagName('a');
for (var i = 0; i < navigationLinks.length; i++) {
    navigationLinks[i].addEventListener('click', closeMenu);
}

document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeMenu();
});

const archiveGrid = document.getElementById('archiveGrid');
const archiveMeta = document.getElementById('archiveMeta');
const archivePagination = document.getElementById('archivePagination');
const archivePageInfo = document.getElementById('archivePageInfo');
const archivePrev = document.getElementById('archivePrev');
const archiveNext = document.getElementById('archiveNext');
const archiveShuffle = document.getElementById('archiveShuffle');
const archiveReshuffle = document.getElementById('archiveReshuffle');

const searchInput = document.getElementById('archiveSearch');
const sortSelect = document.getElementById('archiveSort');
const dateFromInput = document.getElementById('dateFrom');
const dateToInput = document.getElementById('dateTo');
const cityFilter = document.getElementById('cityFilter');
const stateFilter = document.getElementById('stateFilter');
const countryFilter = document.getElementById('countryFilter');
const cameraFilter = document.getElementById('cameraFilter');
const galleryFilter = document.getElementById('galleryFilter');
const tagList = document.getElementById('tagList');
const resetBtn = document.getElementById('resetFilters');

const state = {
    q: '',
    sort: 'newest',
    mediaType: 'all',
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

var currentItems = [];
var pendingTagSelection = [];
var currentTotalPages = 1;

function getPreferredScrollBehavior() {
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var touchLike = window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches;
    if (reducedMotion || touchLike || window.innerWidth <= 992) {
        return 'auto';
    }
    return 'smooth';
}

function parseHashState() {
    if (!window.location.hash) return;
    var raw = window.location.hash.replace(/^#/, '');
    var parts = raw.split('&');
    for (var i = 0; i < parts.length; i++) {
        if (!parts[i]) continue;
        var equalIndex = parts[i].indexOf('=');
        if (equalIndex === -1) continue;
        var key = decodeURIComponent(parts[i].substring(0, equalIndex));
        var value = decodeURIComponent(parts[i].substring(equalIndex + 1));
        if (key === 'tags') {
            state.tags = value ? value.split(',').filter(Boolean) : [];
        } else if (key === 'page') {
            var n = parseInt(value, 10);
            state.page = isNaN(n) || n < 1 ? 1 : n;
        } else if (Object.prototype.hasOwnProperty.call(state, key)) {
            state[key] = value;
        }
    }
    pendingTagSelection = state.tags.slice();
}

function buildHashFromState() {
    var pieces = [];
    if (state.q) pieces.push('q=' + encodeURIComponent(state.q));
    if (state.sort && state.sort !== 'newest') pieces.push('sort=' + encodeURIComponent(state.sort));
    if (state.mediaType && state.mediaType !== 'all') {
        pieces.push('mediaType=' + encodeURIComponent(state.mediaType));
    }
    if (state.tags && state.tags.length > 0) {
        pieces.push('tags=' + encodeURIComponent(state.tags.join(',')));
    }
    if (state.from) pieces.push('from=' + encodeURIComponent(state.from));
    if (state.to) pieces.push('to=' + encodeURIComponent(state.to));
    if (state.city) pieces.push('city=' + encodeURIComponent(state.city));
    if (state.state) pieces.push('state=' + encodeURIComponent(state.state));
    if (state.country) pieces.push('country=' + encodeURIComponent(state.country));
    if (state.cameraModel) pieces.push('cameraModel=' + encodeURIComponent(state.cameraModel));
    if (state.gallery) pieces.push('gallery=' + encodeURIComponent(state.gallery));
    if (state.page > 1) pieces.push('page=' + state.page);
    return pieces.join('&');
}

function syncControlsFromState() {
    searchInput.value = state.q || '';
    sortSelect.value = state.sort || 'newest';
    dateFromInput.value = state.from || '';
    dateToInput.value = state.to || '';
    cityFilter.value = state.city || '';
    stateFilter.value = state.state || '';
    countryFilter.value = state.country || '';
    cameraFilter.value = state.cameraModel || '';
    galleryFilter.value = state.gallery || '';

    var radios = document.querySelectorAll('input[name="mediaType"]');
    var hasMatch = false;
    for (var i = 0; i < radios.length; i++) {
        radios[i].checked = (radios[i].value === (state.mediaType || 'all'));
        if (radios[i].checked) hasMatch = true;
    }
    if (!hasMatch && radios.length > 0) {
        radios[0].checked = true;
        state.mediaType = radios[0].value;
    }

    var tagBoxes = tagList.querySelectorAll('input[type="checkbox"]');
    for (var j = 0; j < tagBoxes.length; j++) {
        tagBoxes[j].checked = state.tags.indexOf(tagBoxes[j].value) !== -1;
    }
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
    if (preserved) {
        select.value = preserved;
    }
}

function fillTagList(tags) {
    tagList.innerHTML = '';
    if (!tags || tags.length === 0) {
        var empty = document.createElement('p');
        empty.className = 'filter-empty';
        empty.textContent = 'No tags yet.';
        tagList.appendChild(empty);
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
        tagList.appendChild(label);
    }
}

async function fetchFacets() {
    try {
        var response = await fetch('/api/archive/facets');
        if (!response.ok) throw new Error('Facets fetch failed');
        var data = await response.json();

        fillSelect(cityFilter, data.cities || [], state.city);
        fillSelect(stateFilter, data.states || [], state.state);
        fillSelect(countryFilter, data.countries || [], state.country);
        fillSelect(cameraFilter, data.cameraModels || [], state.cameraModel);
        var galleryOptions = (data.galleries || []).map(function (g) {
            return { value: g.slug, label: g.title };
        });
        fillSelect(galleryFilter, galleryOptions, state.gallery);
        fillTagList(data.tags || []);

        syncControlsFromState();
    } catch (err) {
        console.error('Failed to load filter options:', err);
        var msg = document.createElement('p');
        msg.className = 'filter-empty';
        msg.textContent = 'Filter options failed to load.';
        tagList.innerHTML = '';
        tagList.appendChild(msg);
    }
}

function buildQueryString() {
    var params = [];
    if (state.q) params.push('q=' + encodeURIComponent(state.q));
    if (state.sort) params.push('sort=' + encodeURIComponent(state.sort));
    if (state.mediaType && state.mediaType !== 'all') {
        params.push('mediaType=' + encodeURIComponent(state.mediaType));
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

function renderResults(items) {
    if (!items || items.length === 0) {
        archiveGrid.innerHTML = '<p class="archive-empty-state">No results match your filters. Try broadening your search or resetting the filters.</p>';
        return;
    }
    var entries = window.PapisJustified.buildEntries(items);
    var rows = window.PapisJustified.buildJustifiedRows(
        entries,
        archiveGrid.clientWidth || 1200,
        window.PapisJustified.GAP,
        window.PapisJustified.TARGET_ROW_HEIGHT
    );
    window.PapisJustified.renderRows(rows, archiveGrid, {
        showCaptions: true,
        availableHeight: 0,
        onItemClick: function (pic) {
            window.openLightbox(pic, currentItems);
        }
    });
}

function updatePagination(payload) {
    if (state.sort === 'random') {
        archivePagination.style.display = 'none';
        archiveShuffle.style.display = 'flex';
        var sampleCount = (payload.items && payload.items.length) || 0;
        var totalForRandom = payload.total || 0;
        archiveMeta.textContent = sampleCount + ' of ' + totalForRandom + ' shown (random sample)';
        return;
    }

    archiveShuffle.style.display = 'none';
    var totalPages = payload.totalPages || 1;
    if (totalPages > 1) {
        archivePagination.style.display = 'flex';
        archivePrev.disabled = state.page <= 1;
        archiveNext.disabled = state.page >= totalPages;
        archivePageInfo.textContent = 'Page ' + state.page + ' of ' + totalPages;
    } else {
        archivePagination.style.display = 'none';
    }

    var total = payload.total || 0;
    archiveMeta.textContent = total === 1 ? '1 result' : total + ' results';
}

async function fetchAndRender() {
    archiveGrid.innerHTML = '<p class="loading" style="grid-column:1/-1;">Loading archive...</p>';
    archivePagination.style.display = 'none';
    archiveShuffle.style.display = 'none';
    try {
        var response = await fetch('/api/archive?' + buildQueryString());
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

        var hash = buildHashFromState();
        if (hash) {
            history.replaceState(null, '', '#' + hash);
        } else if (window.location.hash) {
            history.replaceState(null, '', window.location.pathname);
        }
    } catch (err) {
        console.error(err);
        archiveGrid.innerHTML = '<p class="archive-empty-state">Unable to load the archive right now. Please try again.</p>';
        archivePagination.style.display = 'none';
        archiveShuffle.style.display = 'none';
        archiveMeta.textContent = '';
    }
}

var debounceTimer = null;
function debouncedFetch() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fetchAndRender, 300);
}

function readControlsIntoState(opts) {
    opts = opts || {};
    state.q = searchInput.value.trim();
    state.sort = sortSelect.value;
    state.from = dateFromInput.value;
    state.to = dateToInput.value;
    state.city = cityFilter.value;
    state.state = stateFilter.value;
    state.country = countryFilter.value;
    state.cameraModel = cameraFilter.value;
    state.gallery = galleryFilter.value;

    var checkedRadio = document.querySelector('input[name="mediaType"]:checked');
    state.mediaType = checkedRadio ? checkedRadio.value : 'all';

    var tagBoxes = tagList.querySelectorAll('input[type="checkbox"]:checked');
    state.tags = [];
    for (var i = 0; i < tagBoxes.length; i++) {
        state.tags.push(tagBoxes[i].value);
    }
    pendingTagSelection = state.tags.slice();

    if (!opts.preservePage) {
        state.page = 1;
    }
}

function onFilterChange() {
    readControlsIntoState();
    debouncedFetch();
}

searchInput.addEventListener('input', onFilterChange);
sortSelect.addEventListener('change', onFilterChange);
dateFromInput.addEventListener('change', onFilterChange);
dateToInput.addEventListener('change', onFilterChange);
cityFilter.addEventListener('change', onFilterChange);
stateFilter.addEventListener('change', onFilterChange);
countryFilter.addEventListener('change', onFilterChange);
cameraFilter.addEventListener('change', onFilterChange);
galleryFilter.addEventListener('change', onFilterChange);

var typeRadios = document.querySelectorAll('input[name="mediaType"]');
for (var r = 0; r < typeRadios.length; r++) {
    typeRadios[r].addEventListener('change', onFilterChange);
}

function scrollToResults() {
    var section = document.querySelector('.archive-section');
    if (!section) return;
    var header = document.querySelector('.site-header');
    var headerHeight = header ? header.offsetHeight : 0;
    var top = section.getBoundingClientRect().top + window.scrollY - headerHeight;
    window.scrollTo({ top: Math.max(0, top), behavior: getPreferredScrollBehavior() });
}

archivePrev.addEventListener('click', function () {
    if (state.page > 1) {
        state.page--;
        fetchAndRender();
        scrollToResults();
    }
});

archiveNext.addEventListener('click', function () {
    if (state.sort !== 'random' && state.page < currentTotalPages) {
        state.page++;
        fetchAndRender();
        scrollToResults();
    }
});

archiveReshuffle.addEventListener('click', function () {
    fetchAndRender();
});

resetBtn.addEventListener('click', function () {
    searchInput.value = '';
    sortSelect.value = 'newest';
    dateFromInput.value = '';
    dateToInput.value = '';
    cityFilter.value = '';
    stateFilter.value = '';
    countryFilter.value = '';
    cameraFilter.value = '';
    galleryFilter.value = '';

    var radios = document.querySelectorAll('input[name="mediaType"]');
    for (var i = 0; i < radios.length; i++) {
        radios[i].checked = (radios[i].value === 'all');
    }
    var tagBoxes = tagList.querySelectorAll('input[type="checkbox"]');
    for (var j = 0; j < tagBoxes.length; j++) {
        tagBoxes[j].checked = false;
    }

    state.q = '';
    state.sort = 'newest';
    state.mediaType = 'all';
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

var resizeTimer;
var lastResizeWidth = window.innerWidth;
window.addEventListener('resize', function () {
    if (window.innerWidth === lastResizeWidth) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
        if (window.innerWidth === lastResizeWidth) return;
        lastResizeWidth = window.innerWidth;
        if (currentItems.length > 0) {
            renderResults(currentItems);
        }
    }, 200);
});

window.addEventListener('hashchange', function () {
    parseHashState();
    syncControlsFromState();
    fetchAndRender();
});

(async function init() {
    parseHashState();
    syncControlsFromState();
    await fetchFacets();
    fetchAndRender();
})();
