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

function escapeHtml(text) {
    if (!text && text !== 0) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function getPreferredScrollBehavior() {
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var touchLike = window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches;
    if (reducedMotion || touchLike || window.innerWidth <= 992) {
        return 'auto';
    }
    return 'smooth';
}

function scrollToSectionTop(section) {
    if (!section) return;
    var header = document.querySelector('.site-header');
    var headerHeight = header ? header.offsetHeight : 0;
    var sectionTop = section.getBoundingClientRect().top + window.scrollY - headerHeight;
    window.scrollTo({ top: Math.max(0, sectionTop), behavior: getPreferredScrollBehavior() });
}

function scrollToPageTop() {
    window.scrollTo({ top: 0, behavior: getPreferredScrollBehavior() });
}

const galleryListGrid = document.getElementById('galleryListGrid');
const galleryListSection = document.getElementById('galleryListSection');
const galleryDetailSection = document.getElementById('galleryDetailSection');
const galleryBackBtn = document.getElementById('galleryBackBtn');
var galleriesCache = [];

async function fetchGalleryList() {
    try {
        var response = await fetch('/api/galleries');
        if (!response.ok) throw new Error('Fetch failed');
        var galleries = await response.json();

        galleryListGrid.innerHTML = '';
        if (!galleries || galleries.length === 0) {
            galleryListGrid.innerHTML =
                '<p class="loading" style="grid-column:1/-1;">No galleries yet. Check back soon.</p>';
            return;
        }

        galleriesCache = galleries;
        for (var k = 0; k < galleries.length; k++) {
            galleryListGrid.appendChild(buildGalleryCard(galleries[k]));
        }

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

function buildGalleryCard(gallery) {
    var card = document.createElement('div');
    card.className = 'gallery-list-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', 'Open gallery: ' + (gallery.title || 'Untitled'));

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
        var displayImg = document.createElement('img');
        displayImg.className = 'gallery-list-cover';
        displayImg.src = '/media/' + encodeURIComponent(gallery.coverDisplayFileName);
        displayImg.alt = (gallery.title || 'Gallery') + ' cover';
        displayImg.loading = 'lazy';
        coverWrap.appendChild(displayImg);
    } else {
        var placeholder = document.createElement('div');
        placeholder.className = 'gallery-list-cover-placeholder';
        placeholder.textContent = gallery.title || 'Gallery';
        coverWrap.appendChild(placeholder);
    }
    card.appendChild(coverWrap);

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
    var n = gallery.mediaCount || 0;
    count.textContent = n + (n === 1 ? ' item' : ' items');
    meta.appendChild(count);

    card.appendChild(meta);

    card.addEventListener('click', function () { selectGallery(gallery); });
    card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectGallery(gallery);
        }
    });

    return card;
}

const galleryDetailGrid = document.getElementById('galleryDetailGrid');
const galleryDetailTitle = document.getElementById('galleryDetailTitle');
const galleryDetailDescription = document.getElementById('galleryDetailDescription');
const galleryDetailMeta = document.getElementById('galleryDetailMeta');
const galleryDetailPagination = document.getElementById('galleryDetailPagination');
const galleryDetailPageInfo = document.getElementById('galleryDetailPageInfo');
const galleryDetailPrev = document.getElementById('galleryDetailPrev');
const galleryDetailNext = document.getElementById('galleryDetailNext');

var detailPage = 1;
var DETAIL_ROWS_PER_PAGE = 3;
var detailItems = [];
var detailRows = [];
var detailEntries = [];
var currentGallery = null;

async function selectGallery(gallery) {
    currentGallery = gallery;
    galleryListSection.style.display = 'none';
    galleryDetailSection.style.display = 'block';
    var nextHash = '#g=' + encodeURIComponent(gallery.slug);
    if (window.location.hash !== nextHash) {
        history.replaceState(null, '', nextHash);
    }
    galleryDetailTitle.textContent = gallery.title || 'Untitled gallery';
    galleryDetailDescription.textContent = gallery.description || '';
    galleryDetailMeta.textContent = (gallery.mediaCount || 0) + ' items';
    detailPage = 1;
    galleryDetailGrid.innerHTML = '<p class="loading" style="grid-column:1/-1;">Loading gallery...</p>';
    galleryDetailPagination.style.display = 'none';
    scrollToSectionTop(galleryDetailSection);

    try {
        var response = await fetch('/api/galleries/' + encodeURIComponent(gallery.slug) + '/media');
        if (!response.ok) throw new Error('Fetch failed');
        var pictures = await response.json();
        detailItems = pictures || [];
        if (detailItems.length === 0) {
            galleryDetailGrid.innerHTML =
                '<p class="empty-state">This gallery is empty.</p>';
            return;
        }
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

function renderDetailPage() {
    var start = (detailPage - 1) * DETAIL_ROWS_PER_PAGE;
    var end = Math.min(start + DETAIL_ROWS_PER_PAGE, detailRows.length);
    var pageRows = detailRows.slice(start, end);

    window.PapisJustified.renderRows(pageRows, galleryDetailGrid, {
        rowsPerPage: DETAIL_ROWS_PER_PAGE,
        availableHeight: 0,
        onItemClick: function (pic) { window.openLightbox(pic, detailItems); },
        emptyHtml: '<p class="empty-state">This gallery is empty.</p>'
    });

    var totalPages = Math.max(1, Math.ceil(detailRows.length / DETAIL_ROWS_PER_PAGE));
    galleryDetailPrev.disabled = detailPage <= 1;
    galleryDetailNext.disabled = detailPage >= totalPages;
    galleryDetailPageInfo.textContent = 'Page ' + detailPage + ' of ' + totalPages;
}

galleryDetailPrev.addEventListener('click', function () {
    if (detailPage > 1) {
        detailPage--;
        renderDetailPage();
        scrollToSectionTop(galleryDetailSection);
    }
});
galleryDetailNext.addEventListener('click', function () {
    var totalPages = Math.ceil(detailRows.length / DETAIL_ROWS_PER_PAGE);
    if (detailPage < totalPages) {
        detailPage++;
        renderDetailPage();
        scrollToSectionTop(galleryDetailSection);
    }
});

galleryBackBtn.addEventListener('click', function () {
    galleryDetailSection.style.display = 'none';
    galleryListSection.style.display = 'block';
    currentGallery = null;
    if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname);
    }
    scrollToPageTop();
});

var resizeTimer;
var lastResizeWidth = window.innerWidth;
window.addEventListener('resize', function () {
    if (window.innerWidth === lastResizeWidth) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
        if (window.innerWidth === lastResizeWidth) return;
        lastResizeWidth = window.innerWidth;
        if (currentGallery && detailItems.length > 0) {
            buildDetailRows();
            renderDetailPage();
        }
    }, 200);
});

window.addEventListener('hashchange', function () {
    var slug = parseHashSlug();
    if (!slug) {
        galleryDetailSection.style.display = 'none';
        galleryListSection.style.display = 'block';
        currentGallery = null;
        return;
    }
    if (currentGallery && currentGallery.slug === slug) return;
    var match = galleriesCache.find(function (g) { return g.slug === slug; });
    if (match) selectGallery(match);
});

function parseHashSlug() {
    if (!window.location.hash) return null;
    var raw = window.location.hash.replace(/^#/, '');
    if (raw.indexOf('g=') !== 0) return null;
    return decodeURIComponent(raw.substring(2));
}

fetchGalleryList();
