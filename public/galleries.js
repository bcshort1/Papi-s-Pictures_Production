//Server URL: papispictures.com
//
//Page-level script for /galleries. Depends on:
//  - /justified.js (window.PapisJustified) for row layout.
//  - /lightbox.js  (window.openLightbox) for the click-through detail view.
//Both must be loaded before this file (see galleries.html).

//-----------------------------------------------------------------------------
//Mobile nav (mirrors the homepage logic so behavior is identical across pages).
//-----------------------------------------------------------------------------
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
//Close on link click so the menu disappears once the user lands on a target page.
var navigationLinks = navLinks.getElementsByTagName('a');
for (var i = 0; i < navigationLinks.length; i++) {
    navigationLinks[i].addEventListener('click', closeMenu);
}

//Close the menu on Escape so keyboard users have an easy out.
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeMenu();
});

//-----------------------------------------------------------------------------
//Escape helper used when injecting user-supplied strings via innerHTML.
//-----------------------------------------------------------------------------
function escapeHtml(text) {
    if (!text && text !== 0) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

//-----------------------------------------------------------------------------
//Gallery picker — fetches /api/galleries and renders one card per gallery.
//-----------------------------------------------------------------------------
const galleryListGrid = document.getElementById('galleryListGrid');
const galleryListSection = document.getElementById('galleryListSection');
const galleryDetailSection = document.getElementById('galleryDetailSection');
const galleryBackBtn = document.getElementById('galleryBackBtn');
//Cached list of galleries so I can resolve a clicked card back to its full record.
var galleriesCache = [];

async function fetchGalleryList() {
    try {
        var response = await fetch('/api/galleries');
        if (!response.ok) throw new Error('Fetch failed');
        var galleries = await response.json();

        galleryListGrid.innerHTML = '';
        if (!galleries || galleries.length === 0) {
            //Friendly empty-state placeholder.
            galleryListGrid.innerHTML =
                '<p class="loading" style="grid-column:1/-1;">No galleries yet. Check back soon.</p>';
            return;
        }

        galleriesCache = galleries;
        //Render a card per gallery.
        for (var k = 0; k < galleries.length; k++) {
            galleryListGrid.appendChild(buildGalleryCard(galleries[k]));
        }

        //Auto-select via #g=<slug> hash so direct links land on the right gallery.
        var hashSlug = parseHashSlug();
        if (hashSlug) {
            var match = galleries.find(function (g) { return g.slug === hashSlug; });
            if (match) selectGallery(match);
        }
    } catch (error) {
        console.error(error);
        galleryListGrid.innerHTML =
            '<p class="loading" style="grid-column:1/-1;">Unable to load galleries.</p>';
    }
}

//Build a single gallery picker card. Returns the DOM element so the caller can append it.
function buildGalleryCard(gallery) {
    //Outer card. Use a button-like role so keyboard navigation works.
    var card = document.createElement('div');
    card.className = 'gallery-list-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', 'Open gallery: ' + (gallery.title || 'Untitled'));

    //Cover area — prefer the explicit/derived thumbnail, fall back to the display copy,
    //and finally drop in a placeholder tile when neither exists.
    var coverWrap = document.createElement('div');
    coverWrap.className = 'gallery-list-cover-wrap';
    if (gallery.coverThumbnailFileName) {
        var img = document.createElement('img');
        img.className = 'gallery-list-cover';
        img.src = '/thumbnails/' + encodeURIComponent(gallery.coverThumbnailFileName);
        img.alt = (gallery.title || 'Gallery') + ' cover';
        img.loading = 'lazy';
        coverWrap.appendChild(img);
    } else if (gallery.coverDisplayFileName && gallery.coverMediaType !== 'video') {
        //Fall back to the watermarked display copy when the thumb is missing.
        var displayImg = document.createElement('img');
        displayImg.className = 'gallery-list-cover';
        displayImg.src = '/media/' + encodeURIComponent(gallery.coverDisplayFileName);
        displayImg.alt = (gallery.title || 'Gallery') + ' cover';
        displayImg.loading = 'lazy';
        coverWrap.appendChild(displayImg);
    } else {
        //Placeholder when no cover is resolvable.
        var placeholder = document.createElement('div');
        placeholder.className = 'gallery-list-cover-placeholder';
        placeholder.textContent = gallery.title || 'Gallery';
        coverWrap.appendChild(placeholder);
    }
    card.appendChild(coverWrap);

    //Meta block — title, optional description, and item-count badge.
    var meta = document.createElement('div');
    meta.className = 'gallery-list-meta';

    var heading = document.createElement('h3');
    heading.textContent = gallery.title || 'Untitled gallery';
    meta.appendChild(heading);

    if (gallery.description) {
        var desc = document.createElement('p');
        desc.textContent = gallery.description;
        meta.appendChild(desc);
    }

    var count = document.createElement('span');
    count.className = 'gallery-list-count';
    //Use plural-aware copy so a one-item gallery doesn't say "1 items".
    var n = gallery.mediaCount || 0;
    count.textContent = n + (n === 1 ? ' item' : ' items');
    meta.appendChild(count);

    card.appendChild(meta);

    //Click + keyboard activation both enter the gallery detail view.
    card.addEventListener('click', function () { selectGallery(gallery); });
    card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectGallery(gallery);
        }
    });

    return card;
}

//-----------------------------------------------------------------------------
//Gallery detail view — fetches /api/galleries/:slug/media and renders the
//justified-row grid + pagination + lightbox click handler.
//-----------------------------------------------------------------------------
const galleryDetailGrid = document.getElementById('galleryDetailGrid');
const galleryDetailTitle = document.getElementById('galleryDetailTitle');
const galleryDetailDescription = document.getElementById('galleryDetailDescription');
const galleryDetailMeta = document.getElementById('galleryDetailMeta');
const galleryDetailPagination = document.getElementById('galleryDetailPagination');
const galleryDetailPageInfo = document.getElementById('galleryDetailPageInfo');
const galleryDetailPrev = document.getElementById('galleryDetailPrev');
const galleryDetailNext = document.getElementById('galleryDetailNext');

//Pagination state for the detail view.
var detailPage = 1;
var DETAIL_ROWS_PER_PAGE = 3;
var detailItems = [];
var detailRows = [];
var detailEntries = [];
var currentGallery = null;

//Switch to the detail view for the given gallery and load its media.
async function selectGallery(gallery) {
    currentGallery = gallery;
    //Hide the picker, reveal the detail section.
    galleryListSection.style.display = 'none';
    galleryDetailSection.style.display = 'block';
    //Update the URL hash so the view is bookmarkable / shareable.
    var nextHash = '#g=' + encodeURIComponent(gallery.slug);
    if (window.location.hash !== nextHash) {
        history.replaceState(null, '', nextHash);
    }
    //Reset header content with the gallery's metadata.
    galleryDetailTitle.textContent = gallery.title || 'Untitled gallery';
    galleryDetailDescription.textContent = gallery.description || '';
    galleryDetailMeta.textContent = (gallery.mediaCount || 0) + ' items';
    //Reset paging to the first page on every selection.
    detailPage = 1;
    galleryDetailGrid.innerHTML = '<p class="loading" style="grid-column:1/-1;">Loading gallery...</p>';
    galleryDetailPagination.style.display = 'none';
    //Scroll the detail view into the user's eyeline.
    var headerHeight = document.querySelector('.site-header').offsetHeight;
    var sectionTop = galleryDetailSection.getBoundingClientRect().top + window.scrollY - headerHeight;
    window.scrollTo({ top: sectionTop, behavior: 'smooth' });

    try {
        var response = await fetch('/api/galleries/' + encodeURIComponent(gallery.slug) + '/media');
        if (!response.ok) throw new Error('Fetch failed');
        var pictures = await response.json();
        detailItems = pictures || [];
        if (detailItems.length === 0) {
            //Friendly empty-state placeholder.
            galleryDetailGrid.innerHTML =
                '<p class="empty-state">This gallery is empty.</p>';
            return;
        }
        //Build entries + rows then render the first page.
        buildDetailRows();
        renderDetailPage();
        if (detailRows.length > DETAIL_ROWS_PER_PAGE) {
            galleryDetailPagination.style.display = 'flex';
        }
    } catch (error) {
        console.error(error);
        galleryDetailGrid.innerHTML =
            '<p class="empty-state">Unable to load this gallery.</p>';
    }
}

//Pack detailItems into justified rows.
function buildDetailRows() {
    var containerWidth = galleryDetailGrid.clientWidth || 1200;
    detailEntries = window.PapisJustified.buildEntries(detailItems);
    detailRows = window.PapisJustified.buildJustifiedRows(
        detailEntries,
        containerWidth,
        window.PapisJustified.GAP,
        window.PapisJustified.TARGET_ROW_HEIGHT
    );
}

//Render the current page of the detail view.
function renderDetailPage() {
    var start = (detailPage - 1) * DETAIL_ROWS_PER_PAGE;
    var end = Math.min(start + DETAIL_ROWS_PER_PAGE, detailRows.length);
    var pageRows = detailRows.slice(start, end);

    //Click handler routes to the lightbox over the full gallery list so prev/next stays in-context.
    window.PapisJustified.renderRows(pageRows, galleryDetailGrid, {
        rowsPerPage: DETAIL_ROWS_PER_PAGE,
        availableHeight: 0,
        onItemClick: function (pic) { window.openLightbox(pic, detailItems); },
        emptyHtml: '<p class="empty-state">This gallery is empty.</p>'
    });

    //Pagination control state.
    var totalPages = Math.max(1, Math.ceil(detailRows.length / DETAIL_ROWS_PER_PAGE));
    galleryDetailPrev.disabled = detailPage <= 1;
    galleryDetailNext.disabled = detailPage >= totalPages;
    galleryDetailPageInfo.textContent = 'Page ' + detailPage + ' of ' + totalPages;
}

//Pagination button handlers.
galleryDetailPrev.addEventListener('click', function () {
    if (detailPage > 1) {
        detailPage--;
        var headerHeight = document.querySelector('.site-header').offsetHeight;
        var sectionTop = galleryDetailSection.getBoundingClientRect().top + window.scrollY - headerHeight;
        renderDetailPage();
        window.scrollTo({ top: sectionTop, behavior: 'smooth' });
    }
});
galleryDetailNext.addEventListener('click', function () {
    var totalPages = Math.ceil(detailRows.length / DETAIL_ROWS_PER_PAGE);
    if (detailPage < totalPages) {
        detailPage++;
        var headerHeight = document.querySelector('.site-header').offsetHeight;
        var sectionTop = galleryDetailSection.getBoundingClientRect().top + window.scrollY - headerHeight;
        renderDetailPage();
        window.scrollTo({ top: sectionTop, behavior: 'smooth' });
    }
});

//Back button — returns to the picker view.
galleryBackBtn.addEventListener('click', function () {
    galleryDetailSection.style.display = 'none';
    galleryListSection.style.display = 'block';
    currentGallery = null;
    //Strip the hash so the URL no longer points at a specific gallery.
    if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname);
    }
    //Scroll back to the top of the picker.
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

//Re-pack and re-render the detail grid on resize so the justified layout matches the new width.
var resizeTimer;
window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
        if (currentGallery && detailItems.length > 0) {
            buildDetailRows();
            renderDetailPage();
        }
    }, 150);
});

//React to hash changes (e.g. user pasting a deep link or pressing back/forward).
window.addEventListener('hashchange', function () {
    var slug = parseHashSlug();
    if (!slug) {
        //No slug — return to the picker.
        galleryDetailSection.style.display = 'none';
        galleryListSection.style.display = 'block';
        currentGallery = null;
        return;
    }
    //Find the matching gallery in the cache and select it.
    if (currentGallery && currentGallery.slug === slug) return;
    var match = galleriesCache.find(function (g) { return g.slug === slug; });
    if (match) selectGallery(match);
});

//Parse the current location hash and pull the slug component (#g=<slug>).
function parseHashSlug() {
    if (!window.location.hash) return null;
    var raw = window.location.hash.replace(/^#/, '');
    if (raw.indexOf('g=') !== 0) return null;
    return decodeURIComponent(raw.substring(2));
}

//Kick everything off.
fetchGalleryList();
