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

function closeMenuOnEscape(event) {
    if (event.key === 'Escape') {
        hamburger.classList.remove('active');
        navLinks.classList.remove('active');
    }
}

document.addEventListener('keydown', closeMenuOnEscape);

function setText(element, tag, text) {
    var child = document.createElement(tag);
    child.textContent = text;
    element.appendChild(child);
    return child;
}

const galleryGrid = document.getElementById('galleryGrid');
var featuredGrid = document.getElementById('featuredGrid');

var recentPage = 1;
var RECENT_ROWS_PER_PAGE = 3;
var recentAllItems = [];
var recentAllRows = [];
var recentAllEntries = [];

var featuredPage = 1;
var FEATURED_ROWS_PER_PAGE = 3;
var featuredAllItems = [];
var featuredAllRows = [];
var featuredAllEntries = [];

function buildCombinedList() {
    var combined = recentAllItems.slice();
    for (var i = 0; i < featuredAllItems.length; i++) {
        var found = false;
        for (var j = 0; j < combined.length; j++) {
            if (combined[j]._id === featuredAllItems[i]._id) { found = true; break; }
        }
        if (!found) combined.push(featuredAllItems[i]);
    }
    return combined;
}

function handleItemClick(picture) {
    window.openLightbox(picture, buildCombinedList());
}

function buildRecentRows() {
    var containerWidth = galleryGrid.clientWidth || 1200;
    recentAllEntries = window.PapisJustified.buildEntries(recentAllItems);
    recentAllRows = window.PapisJustified.buildJustifiedRows(
        recentAllEntries,
        containerWidth,
        window.PapisJustified.GAP,
        window.PapisJustified.TARGET_ROW_HEIGHT
    );
}

function renderRecentPage() {
    var start = (recentPage - 1) * RECENT_ROWS_PER_PAGE;
    var end = Math.min(start + RECENT_ROWS_PER_PAGE, recentAllRows.length);
    var pageRows = recentAllRows.slice(start, end);

    var availableHeight = 0;
    if (window.innerWidth > 992) {
        var savedMinHeight = galleryGrid.style.minHeight;
        galleryGrid.style.minHeight = '0';
        availableHeight = galleryGrid.clientHeight;
        galleryGrid.style.minHeight = savedMinHeight;
    }

    window.PapisJustified.renderRows(pageRows, galleryGrid, {
        rowsPerPage: RECENT_ROWS_PER_PAGE,
        availableHeight: availableHeight,
        onItemClick: handleItemClick
    });

    var totalPages = Math.max(1, Math.ceil(recentAllRows.length / RECENT_ROWS_PER_PAGE));
    var prevBtn = document.getElementById('recentPrev');
    var nextBtn = document.getElementById('recentNext');
    var infoSpan = document.getElementById('recentPageInfo');
    prevBtn.disabled = recentPage <= 1;
    nextBtn.disabled = recentPage >= totalPages;
    infoSpan.textContent = 'Page ' + recentPage + ' of ' + totalPages;
}

function buildFeaturedRows() {
    var containerWidth = featuredGrid.clientWidth || 1200;
    featuredAllEntries = window.PapisJustified.buildEntries(featuredAllItems);
    featuredAllRows = window.PapisJustified.buildJustifiedRows(
        featuredAllEntries,
        containerWidth,
        window.PapisJustified.GAP,
        window.PapisJustified.TARGET_ROW_HEIGHT
    );
}

function renderFeaturedPage() {
    var start = (featuredPage - 1) * FEATURED_ROWS_PER_PAGE;
    var end = Math.min(start + FEATURED_ROWS_PER_PAGE, featuredAllRows.length);
    var pageRows = featuredAllRows.slice(start, end);

    window.PapisJustified.renderRows(pageRows, featuredGrid, {
        rowsPerPage: FEATURED_ROWS_PER_PAGE,
        availableHeight: 0,
        onItemClick: handleItemClick
    });

    var totalPages = Math.max(1, Math.ceil(featuredAllRows.length / FEATURED_ROWS_PER_PAGE));
    var prevBtn = document.getElementById('featuredPrev');
    var nextBtn = document.getElementById('featuredNext');
    var infoSpan = document.getElementById('featuredPageInfo');
    prevBtn.disabled = featuredPage <= 1;
    nextBtn.disabled = featuredPage >= totalPages;
    infoSpan.textContent = 'Page ' + featuredPage + ' of ' + totalPages;
}

async function fetchGallery() {
    try {
        var response = await fetch('/api/recentPictures');
        if (!response.ok) throw new Error('Fetch failed');
        var pictures = await response.json();

        if (!pictures || pictures.length === 0) {
            galleryGrid.innerHTML = '<p class="loading" style="grid-column:1/-1;">No pictures available right now.</p>';
            document.getElementById('recentPagination').style.display = 'none';
            return;
        }

        recentAllItems = pictures;
        recentPage = 1;
        buildRecentRows();
        renderRecentPage();

        if (recentAllRows.length <= RECENT_ROWS_PER_PAGE) {
            document.getElementById('recentPagination').style.display = 'none';
        }
    } catch (error) {
        console.error(error);
        galleryGrid.innerHTML = '<p class="loading" style="grid-column:1/-1;">Unable to load gallery.</p>';
        document.getElementById('recentPagination').style.display = 'none';
    }
}

document.getElementById('recentPrev').addEventListener('click', function () {
    if (recentPage > 1) {
        recentPage--;
        var section = document.getElementById('gallery');
        var headerHeight = document.querySelector('.site-header').offsetHeight;
        var sectionTop = section.getBoundingClientRect().top + window.scrollY - headerHeight;
        renderRecentPage();
        window.scrollTo({ top: sectionTop, behavior: 'smooth' });
    }
});

document.getElementById('recentNext').addEventListener('click', function () {
    var totalPages = Math.ceil(recentAllRows.length / RECENT_ROWS_PER_PAGE);
    if (recentPage < totalPages) {
        recentPage++;
        var section = document.getElementById('gallery');
        var headerHeight = document.querySelector('.site-header').offsetHeight;
        var sectionTop = section.getBoundingClientRect().top + window.scrollY - headerHeight;
        renderRecentPage();
        window.scrollTo({ top: sectionTop, behavior: 'smooth' });
    }
});

fetchGallery();

async function fetchFeaturedGallery() {
    try {
        var response = await fetch('/api/featuredGallery');
        if (!response.ok) throw new Error('Fetch failed');
        var pictures = await response.json();

        if (!pictures || pictures.length === 0) {
            featuredGrid.innerHTML = '<p class="loading" style="grid-column:1/-1;">No featured pictures available right now.</p>';
            document.getElementById('featuredPagination').style.display = 'none';
            return;
        }

        featuredAllItems = pictures;
        featuredPage = 1;
        buildFeaturedRows();
        renderFeaturedPage();

        if (featuredAllRows.length <= FEATURED_ROWS_PER_PAGE) {
            document.getElementById('featuredPagination').style.display = 'none';
        }
    } catch (error) {
        console.error(error);
        featuredGrid.innerHTML = '<p class="loading" style="grid-column:1/-1;">Unable to load featured gallery.</p>';
        document.getElementById('featuredPagination').style.display = 'none';
    }
}

document.getElementById('featuredPrev').addEventListener('click', function () {
    if (featuredPage > 1) {
        featuredPage--;
        var section = document.getElementById('featuredGallery');
        var headerHeight = document.querySelector('.site-header').offsetHeight;
        var sectionTop = section.getBoundingClientRect().top + window.scrollY - headerHeight;
        renderFeaturedPage();
        window.scrollTo({ top: sectionTop, behavior: 'smooth' });
    }
});

document.getElementById('featuredNext').addEventListener('click', function () {
    var totalPages = Math.ceil(featuredAllRows.length / FEATURED_ROWS_PER_PAGE);
    if (featuredPage < totalPages) {
        featuredPage++;
        var section = document.getElementById('featuredGallery');
        var headerHeight = document.querySelector('.site-header').offsetHeight;
        var sectionTop = section.getBoundingClientRect().top + window.scrollY - headerHeight;
        renderFeaturedPage();
        window.scrollTo({ top: sectionTop, behavior: 'smooth' });
    }
});

fetchFeaturedGallery();

var resizeTimer;
window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
        if (recentAllItems.length > 0) {
            buildRecentRows();
            renderRecentPage();
        }
        if (featuredAllItems.length > 0) {
            buildFeaturedRows();
            renderFeaturedPage();
        }
    }, 150);
});

const servicesGrid = document.getElementById('servicesGrid');
const whatsNewGrid = document.getElementById('whatsNewGrid');

async function fetchServices() {
    try {
        const response = await fetch('/api');
        if (!response.ok) throw new Error('Fetch failed');
        const data = await response.json();

        const serviceItems = data.photoVideoServices || [];
        const whatsNewItems = data.whatsNewItems || [];

        servicesGrid.innerHTML = '';
        whatsNewGrid.innerHTML = '';

        if (serviceItems.length === 0) {
            servicesGrid.innerHTML = '<p style="grid-column:1/-1;text-align:center;opacity:0.5;">No services available right now.</p>';
        }

        if (whatsNewItems.length === 0) {
            whatsNewGrid.innerHTML = '<p style="grid-column:1/-1;text-align:center;opacity:0.5;">No updates posted yet.</p>';
        }

        for (const service of serviceItems) {
            var card = document.createElement('div');
            card.className = 'service-card';

            setText(card, 'h3', service.serviceName);
            setText(card, 'p', service.serviceDescription);

            var priceDiv = document.createElement('div');
            priceDiv.className = 'service-price';
            priceDiv.textContent = '$' + service.price.toLocaleString() + ' ';
            var span = document.createElement('span');
            span.textContent = '/ each';
            priceDiv.appendChild(span);
            card.appendChild(priceDiv);

            servicesGrid.appendChild(card);
        }

        for (const item of whatsNewItems) {
            var card = document.createElement('div');
            card.className = 'whatsnew-card';

            var dateDiv = setText(card, 'div', item.date);
            dateDiv.className = 'whatsnew-date';

            setText(card, 'h3', item.title);
            setText(card, 'p', item.description);

            var tag = setText(card, 'span', item.tag);
            tag.className = 'whatsnew-tag';

            whatsNewGrid.appendChild(card);
        }
    } catch (error) {
        console.error(error);
        servicesGrid.innerHTML = '<p style="grid-column:1/-1;text-align:center;opacity:0.5;">Unable to load services.</p>';
        whatsNewGrid.innerHTML = '<p style="grid-column:1/-1;text-align:center;opacity:0.5;">Unable to load updates.</p>';
    }
}

fetchServices();
