//Server URL: papispictures.com
//
//Page-level script for the homepage. Depends on:
//  - /justified.js  (window.PapisJustified)
//  - /lightbox.js   (window.openLightbox)
//Both must be loaded before this file (see index.html).

//Cache the hamburger button and the nav links container so I don't keep re-querying the DOM.
const hamburger = document.getElementById('hamburger');
//Nav links container that gets shown/hidden on mobile.
const navLinks = document.getElementById('navLinks');

//Toggle the mobile menu open/closed.
function toggleMenu() {
    //Flip the active class on the hamburger so the icon animates.
    hamburger.classList.toggle('active');
    //Flip the active class on the nav so it slides in or out.
    navLinks.classList.toggle('active');
}

//Wire the hamburger button to the toggle.
hamburger.addEventListener('click', toggleMenu);

//Force the menu closed (used after a link click and on Escape).
function closeMenu() {
    //Reset the hamburger icon.
    hamburger.classList.remove('active');
    //Hide the nav.
    navLinks.classList.remove('active');
}

//Close the menu whenever a nav link is clicked so the user lands on the target section without the menu still open.
var navigationLinks = navLinks.getElementsByTagName('a');
//Walk every link and attach the close handler.
for (var i = 0; i < navigationLinks.length; i++) {
    navigationLinks[i].addEventListener('click', closeMenu);
}

//Close the menu on Escape so keyboard users have an easy out.
function closeMenuOnEscape(event) {
    if (event.key === 'Escape') {
        //Reset the hamburger icon.
        hamburger.classList.remove('active');
        //Hide the nav.
        navLinks.classList.remove('active');
    }
}

//Wire the Escape handler at the document level so it fires regardless of focus.
document.addEventListener('keydown', closeMenuOnEscape);

//Helper that creates a child element of the given tag, sets its text, appends it, and returns it.
function setText(element, tag, text) {
    //Create the child element.
    var child = document.createElement(tag);
    //Set its text content.
    child.textContent = text;
    //Drop it into the parent.
    element.appendChild(child);
    //Hand the child back so the caller can style it further.
    return child;
}

//Recent + Featured galleries: shared module state plus per-section pagination.
const galleryGrid = document.getElementById('galleryGrid');
//Featured grid will resolve below once the section exists.
var featuredGrid = document.getElementById('featuredGrid');

//Pagination state for Recent.
var recentPage = 1;
var RECENT_ROWS_PER_PAGE = 3;
var recentAllItems = [];
var recentAllRows = [];
var recentAllEntries = [];

//Pagination state for Featured.
var featuredPage = 1;
var FEATURED_ROWS_PER_PAGE = 3;
var featuredAllItems = [];
var featuredAllRows = [];
var featuredAllEntries = [];

//Build a deduped union of recent + featured for the lightbox so prev/next traverses both sections.
function buildCombinedList() {
    var combined = recentAllItems.slice();
    for (var i = 0; i < featuredAllItems.length; i++) {
        //Skip duplicates so a picture that lives in both sections only appears once.
        var found = false;
        for (var j = 0; j < combined.length; j++) {
            if (combined[j]._id === featuredAllItems[i]._id) { found = true; break; }
        }
        if (!found) combined.push(featuredAllItems[i]);
    }
    return combined;
}

//Click handler shared by every grid item — opens the lightbox over the combined list.
function handleItemClick(picture) {
    //openLightbox is provided by /lightbox.js.
    window.openLightbox(picture, buildCombinedList());
}

//Build justified rows for the recent gallery and store them on module state.
function buildRecentRows() {
    //Width to lay out against, falling back if the grid hasn't measured yet.
    var containerWidth = galleryGrid.clientWidth || 1200;
    //Use the shared engine for entry building and row packing.
    recentAllEntries = window.PapisJustified.buildEntries(recentAllItems);
    recentAllRows = window.PapisJustified.buildJustifiedRows(
        recentAllEntries,
        containerWidth,
        window.PapisJustified.GAP,
        window.PapisJustified.TARGET_ROW_HEIGHT
    );
}

//Render the current page of the recent gallery.
function renderRecentPage() {
    //Index of the first row on this page.
    var start = (recentPage - 1) * RECENT_ROWS_PER_PAGE;
    //Index just past the last row on this page.
    var end = Math.min(start + RECENT_ROWS_PER_PAGE, recentAllRows.length);
    //Slice out just this page's rows.
    var pageRows = recentAllRows.slice(start, end);

    //On mobile/tablet, don't constrain to a fixed available height; let content flow.
    var availableHeight = 0;
    if (window.innerWidth > 992) {
        //Temporarily drop the min-height so I can measure the true available height.
        var savedMinHeight = galleryGrid.style.minHeight;
        galleryGrid.style.minHeight = '0';
        //Capture the real client height now that min-height is out of the way.
        availableHeight = galleryGrid.clientHeight;
        //Restore the saved min-height.
        galleryGrid.style.minHeight = savedMinHeight;
    }

    //Hand off rendering to the shared engine with our click handler and last-row cap policy.
    window.PapisJustified.renderRows(pageRows, galleryGrid, {
        rowsPerPage: RECENT_ROWS_PER_PAGE,
        availableHeight: availableHeight,
        onItemClick: handleItemClick
    });

    //Update pagination controls.
    var totalPages = Math.max(1, Math.ceil(recentAllRows.length / RECENT_ROWS_PER_PAGE));
    var prevBtn = document.getElementById('recentPrev');
    var nextBtn = document.getElementById('recentNext');
    var infoSpan = document.getElementById('recentPageInfo');
    prevBtn.disabled = recentPage <= 1;
    nextBtn.disabled = recentPage >= totalPages;
    infoSpan.textContent = 'Page ' + recentPage + ' of ' + totalPages;
}

//Build justified rows for the featured gallery and store them on module state.
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

//Render the current page of the featured gallery.
function renderFeaturedPage() {
    var start = (featuredPage - 1) * FEATURED_ROWS_PER_PAGE;
    var end = Math.min(start + FEATURED_ROWS_PER_PAGE, featuredAllRows.length);
    var pageRows = featuredAllRows.slice(start, end);

    //Featured uses natural height — no available-height constraint.
    window.PapisJustified.renderRows(pageRows, featuredGrid, {
        rowsPerPage: FEATURED_ROWS_PER_PAGE,
        availableHeight: 0,
        onItemClick: handleItemClick
    });

    //Update pagination controls.
    var totalPages = Math.max(1, Math.ceil(featuredAllRows.length / FEATURED_ROWS_PER_PAGE));
    var prevBtn = document.getElementById('featuredPrev');
    var nextBtn = document.getElementById('featuredNext');
    var infoSpan = document.getElementById('featuredPageInfo');
    prevBtn.disabled = featuredPage <= 1;
    nextBtn.disabled = featuredPage >= totalPages;
    infoSpan.textContent = 'Page ' + featuredPage + ' of ' + totalPages;
}

//Fetch recent pictures from the API and populate the gallery section with pagination.
async function fetchGallery() {
    try {
        //GET the recent pictures from the public API.
        var response = await fetch('/api/recentPictures');
        if (!response.ok) throw new Error('Fetch failed');
        var pictures = await response.json();

        if (!pictures || pictures.length === 0) {
            galleryGrid.innerHTML = '<p class="loading" style="grid-column:1/-1;">No pictures available right now.</p>';
            document.getElementById('recentPagination').style.display = 'none';
            return;
        }

        //Stash the pictures in module state for the layout and lightbox.
        recentAllItems = pictures;
        //Reset to the first page so a refresh always starts at the top.
        recentPage = 1;
        //Pack into justified rows and render the first page.
        buildRecentRows();
        renderRecentPage();

        //If everything fits on one page, hide the pagination controls entirely.
        if (recentAllRows.length <= RECENT_ROWS_PER_PAGE) {
            document.getElementById('recentPagination').style.display = 'none';
        }
    } catch (error) {
        console.error(error);
        galleryGrid.innerHTML = '<p class="loading" style="grid-column:1/-1;">Unable to load gallery.</p>';
        document.getElementById('recentPagination').style.display = 'none';
    }
}

//Recent Pictures pagination button listeners.
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

//Kick off the recent gallery fetch on page load.
fetchGallery();

//Fetch the featured pictures and populate the featured grid with pagination.
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

//Featured Gallery pagination button listeners.
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

//Kick off the featured gallery fetch on page load.
fetchFeaturedGallery();

//Re-render both galleries on window resize so the justified layout recalculates for the new width.
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

//Services and What's New sections: fetched together from the public API root.
const servicesGrid = document.getElementById('servicesGrid');
const whatsNewGrid = document.getElementById('whatsNewGrid');

//Fetch services + What's New items from the API and render them into their respective grids.
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

        //Render each service as a card.
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

        //Render each What's New item as a card.
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

//Kick off the services + What's New fetch on page load.
fetchServices();
