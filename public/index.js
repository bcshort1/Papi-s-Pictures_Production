//Server URL: papispictures.com

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

//Gallery section: fetches recent pictures from the API and renders them into a justified, paginated grid.
const galleryGrid = document.getElementById('galleryGrid');

//Combined picture list used by the lightbox for prev/next navigation across both sections.
var allGalleryPictures = [];

//Pagination state for the Recent Pictures section (row-based, 3 rows per page).
var recentPage = 1;
//Rows per page for Recent Pictures.
var RECENT_ROWS_PER_PAGE = 3;
//All recent picture documents from the API.
var recentAllItems = [];
//Pre-built justified rows for the recent gallery.
var recentAllRows = [];
//Per-item entries (picture + aspect ratio) for the recent gallery.
var recentAllEntries = [];

//Pagination state for the Featured Gallery section (row-based, 3 rows per page).
var featuredPage = 1;
//Rows per page for the featured gallery.
var FEATURED_ROWS_PER_PAGE = 3;
//All featured picture documents from the API.
var featuredAllItems = [];
//Pre-built justified rows for the featured gallery.
var featuredAllRows = [];
//Per-item entries (picture + aspect ratio) for the featured gallery.
var featuredAllEntries = [];

//Target row height in pixels for the justified gallery layout.
var TARGET_ROW_HEIGHT = 250;

//Build justified rows from entries: pack items into a row until adding more would push the row height below targetHeight.
function buildJustifiedRows(entries, containerWidth, gap, targetHeight) {
    //Output rows.
    var rows = [];
    //Index into entries marking the start of the row currently being packed.
    var rowStart = 0;
    //Pack rows one at a time until I've consumed every entry.
    while (rowStart < entries.length) {
        //Running sum of aspect ratios for the current row.
        var aspectSum = 0;
        //Tail index for the current row.
        var rowEnd = rowStart;
        //Add items one at a time until the row's natural height drops to (or below) the target.
        while (rowEnd < entries.length) {
            //Include this item's aspect ratio in the sum.
            aspectSum += entries[rowEnd].aspectRatio;
            //Total horizontal gap pixels for the items already in the row.
            var gaps = (rowEnd - rowStart) * gap;
            //Compute the height the row would have if I closed it here.
            var h = (containerWidth - gaps) / aspectSum;
            if (h <= targetHeight) {
                //Row is full enough; advance past this item and break out.
                rowEnd++;
                break;
            }
            //Still too tall, keep packing.
            rowEnd++;
        }
        //Slice this row's entries out of the input and push.
        rows.push(entries.slice(rowStart, rowEnd));
        //Move the start cursor to the next unprocessed entry.
        rowStart = rowEnd;
    }
    //Hand back the packed rows.
    return rows;
}

//Render specific pre-built rows into a grid element, sized to fill available height.
function renderRows(rows, totalRowCount, gridElement, availableHeight) {
    //Wipe whatever was previously rendered.
    gridElement.innerHTML = '';
    if (rows.length === 0) {
        //Empty state placeholder.
        gridElement.innerHTML = '<p class="loading" style="width:100%;text-align:center;">No pictures available right now.</p>';
        return;
    }

    //Width available for sizing items, falling back to a sensible default if the grid hasn't laid out yet.
    var containerWidth = gridElement.clientWidth || 1200;
    //Pixel gap between items.
    var gap = 8;
    //On narrow viewports (mobile), CSS switches to a column layout.
    //Skip justified sizing so CSS overrides handle dimensions instead.
    var isMobile = window.innerWidth <= 576;

    //Compute natural height for each row.
    var rowHeights = [];
    for (var r = 0; r < rows.length; r++) {
        //Sum aspect ratios for this row.
        var sumAR = 0;
        for (var j = 0; j < rows[r].length; j++) sumAR += rows[r][j].aspectRatio;
        //Total gap width inside this row.
        var rg = (rows[r].length - 1) * gap;
        //Natural row height when the items fill the available width.
        var h = (containerWidth - rg) / sumAR;
        //Cap the very last row of ALL data if it would stretch too tall (otherwise an orphan tall image takes over).
        var isVeryLastRow = (r === rows.length - 1) && (r + 1 < RECENT_ROWS_PER_PAGE || rows.length < RECENT_ROWS_PER_PAGE);
        //Apply the cap when the natural height exceeds the target by more than 30%.
        if (isVeryLastRow && h > TARGET_ROW_HEIGHT * 1.3) h = TARGET_ROW_HEIGHT;
        //Save the height for the render pass below.
        rowHeights.push(h);
    }

    //Scale rows to fit the available height if provided (desktop only).
    if (!isMobile && availableHeight > 0) {
        //Total gap pixels stacked between rows.
        var totalGaps = Math.max(0, rows.length - 1) * gap;
        //Sum row heights plus gaps to get the total content height.
        var totalContent = totalGaps;
        for (var r = 0; r < rowHeights.length; r++) totalContent += rowHeights[r];
        if (totalContent > availableHeight) {
            //Scale every row uniformly so the gaps stay constant and only the content shrinks.
            var scale = (availableHeight - totalGaps) / (totalContent - totalGaps);
            for (var r = 0; r < rowHeights.length; r++) rowHeights[r] *= scale;
        }
    }

    //Walk each row and emit its DOM.
    for (var r = 0; r < rows.length; r++) {
        //Pull the row's entries.
        var row = rows[r];
        //Container for this row of items.
        var rowDiv = document.createElement('div');
        //Standard row class so CSS can style it as a flex row.
        rowDiv.className = 'gallery-row';
        //Pre-computed height for this row.
        var rowHeight = rowHeights[r];

        //Check if this row's items fill the width (full row) or not (partial last row).
        var sumAR = 0;
        for (var j = 0; j < row.length; j++) sumAR += row[j].aspectRatio;
        //Natural height the row would take if I let items fill the width.
        var naturalH = (containerWidth - (row.length - 1) * gap) / sumAR;
        //Capped means I shrunk the row below natural — items shouldn't flex-grow, since the width constraint already filled the space.
        var isCapped = (rowHeight < naturalH * 0.95);

        //Walk each item in the row.
        for (var k = 0; k < row.length; k++) {
            //Pull the entry and the underlying picture document.
            var entry = row[k];
            //Underlying picture metadata.
            var picture = entry.picture;
            //Item width derived from its aspect ratio and the row's height.
            var itemWidth = entry.aspectRatio * rowHeight;

            //Container element for this individual item.
            var itemDiv = document.createElement('div');
            //Standard gallery item class.
            itemDiv.className = 'gallery-item';
            //On mobile, let CSS control dimensions via !important overrides.
            if (!isMobile) {
                //Lock the desktop width and height to what I just computed.
                itemDiv.style.width = itemWidth + 'px';
                itemDiv.style.height = rowHeight + 'px';
                //Allow flex-grow only on uncapped rows so items can fill any leftover width.
                if (!isCapped) itemDiv.style.flexGrow = entry.aspectRatio;
                //Set the flex-basis to the natural width so the row distributes leftover space proportionally.
                itemDiv.style.flexBasis = itemWidth + 'px';
            }

            if (picture.mediaType === 'video') {
                //Build an autoplay-loop video element for video items.
                var video = document.createElement('video');
                //Source URL via the static media route.
                video.src = '/media/' + encodeURIComponent(picture.fileName);
                //Alt text for accessibility.
                video.alt = picture.alt;
                //Mute so autoplay is allowed by browsers.
                video.muted = true;
                //Autoplay so the gallery is alive.
                video.autoplay = true;
                //Loop so videos keep playing.
                video.loop = true;
                //Inline playback so iOS doesn't go fullscreen.
                video.playsInline = true;
                //Preload eagerly for snappy playback.
                video.preload = 'auto';
                //Pointer cursor so it's obvious the video is clickable.
                video.style.cursor = 'pointer';
                //Clicking the video opens the lightbox; IIFE captures the picture for this iteration.
                video.addEventListener('click', (function (pic) {
                    return function () { openOverlay(pic); };
                })(picture));
                //Drop the video into the item container.
                itemDiv.appendChild(video);
            } else {
                //Build an image element for photo items.
                var image = document.createElement('img');
                //Source URL via the static media route.
                image.src = '/media/' + encodeURIComponent(picture.fileName);
                //Alt text for accessibility.
                image.alt = picture.alt;
                //Pointer cursor so it's obvious the image is clickable.
                image.style.cursor = 'pointer';
                //Clicking the image opens the lightbox; IIFE captures the picture for this iteration.
                image.addEventListener('click', (function (pic) {
                    return function () { openOverlay(pic); };
                })(picture));
                //Drop the image into the item container.
                itemDiv.appendChild(image);
            }

            //Append the item to its row.
            rowDiv.appendChild(itemDiv);
        }

        //Append the row to the grid.
        gridElement.appendChild(rowDiv);
    }
}

//Build rows for the recent gallery and store them on module state.
function buildRecentRows() {
    //Width to lay out against, falling back if the grid hasn't measured yet.
    var containerWidth = galleryGrid.clientWidth || 1200;
    //Pixel gap between items, matching the CSS.
    var gap = 8;
    //Reset the entries array before re-deriving aspect ratios.
    recentAllEntries = [];
    for (var i = 0; i < recentAllItems.length; i++) {
        //Pull the picture document.
        var pic = recentAllItems[i];
        //Prefer the stored aspect ratio; fall back to width/height; default to 4:3 if both are missing.
        var ar = pic.aspectRatio ? parseFloat(pic.aspectRatio) : (pic.imageWidth && pic.imageHeight ? pic.imageWidth / pic.imageHeight : 1.3333);
        //Guard against bad data that would break the layout math.
        if (ar <= 0 || isNaN(ar)) ar = 1.3333;
        //Push the picture + ratio entry.
        recentAllEntries.push({ picture: pic, aspectRatio: ar });
    }
    //Pack the entries into justified rows.
    recentAllRows = buildJustifiedRows(recentAllEntries, containerWidth, gap, TARGET_ROW_HEIGHT);
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

    //Hand off the rendering to the shared row renderer.
    renderRows(pageRows, recentAllRows.length, galleryGrid, availableHeight);

    //Update pagination controls.
    var totalPages = Math.max(1, Math.ceil(recentAllRows.length / RECENT_ROWS_PER_PAGE));
    //Cache the prev/next button + info span for this section.
    var prevBtn = document.getElementById('recentPrev');
    var nextBtn = document.getElementById('recentNext');
    var infoSpan = document.getElementById('recentPageInfo');
    //Disable prev/next at the boundaries.
    prevBtn.disabled = recentPage <= 1;
    nextBtn.disabled = recentPage >= totalPages;
    //Update the page-of-N label.
    infoSpan.textContent = 'Page ' + recentPage + ' of ' + totalPages;
}

//Build rows for the featured gallery and store them on module state.
function buildFeaturedRows() {
    //Width to lay out against, falling back if the grid hasn't measured yet.
    var containerWidth = featuredGrid.clientWidth || 1200;
    //Pixel gap between items, matching the CSS.
    var gap = 8;
    //Reset the entries array before re-deriving aspect ratios.
    featuredAllEntries = [];
    for (var i = 0; i < featuredAllItems.length; i++) {
        //Pull the picture document.
        var pic = featuredAllItems[i];
        //Prefer stored aspect ratio; fall back to width/height; default to 4:3.
        var ar = pic.aspectRatio ? parseFloat(pic.aspectRatio) : (pic.imageWidth && pic.imageHeight ? pic.imageWidth / pic.imageHeight : 1.3333);
        //Guard against bad data.
        if (ar <= 0 || isNaN(ar)) ar = 1.3333;
        //Push the picture + ratio entry.
        featuredAllEntries.push({ picture: pic, aspectRatio: ar });
    }
    //Pack the entries into justified rows.
    featuredAllRows = buildJustifiedRows(featuredAllEntries, containerWidth, gap, TARGET_ROW_HEIGHT);
}

//Render the current page of the featured gallery.
function renderFeaturedPage() {
    //Index of the first row on this page.
    var start = (featuredPage - 1) * FEATURED_ROWS_PER_PAGE;
    //Index just past the last row on this page.
    var end = Math.min(start + FEATURED_ROWS_PER_PAGE, featuredAllRows.length);
    //Slice out just this page's rows.
    var pageRows = featuredAllRows.slice(start, end);

    //Featured gallery uses natural height — no available-height constraint.
    renderRows(pageRows, featuredAllRows.length, featuredGrid, 0);

    //Update pagination controls.
    var totalPages = Math.max(1, Math.ceil(featuredAllRows.length / FEATURED_ROWS_PER_PAGE));
    //Cache the prev/next button + info span for this section.
    var prevBtn = document.getElementById('featuredPrev');
    var nextBtn = document.getElementById('featuredNext');
    var infoSpan = document.getElementById('featuredPageInfo');
    //Disable prev/next at the boundaries.
    prevBtn.disabled = featuredPage <= 1;
    nextBtn.disabled = featuredPage >= totalPages;
    //Update the page-of-N label.
    infoSpan.textContent = 'Page ' + featuredPage + ' of ' + totalPages;
}

//Fetch recent pictures from the API and populate the gallery section with pagination.
async function fetchGallery() {
    try {
        //GET the recent pictures from the public API.
        var response = await fetch('/api/recentPictures');
        //Bail on a non-OK response.
        if (!response.ok) throw new Error('Fetch failed');
        //Parse the JSON body into an array of picture documents.
        var pictures = await response.json();

        if (!pictures || pictures.length === 0) {
            //Empty state: show a placeholder and hide pagination.
            galleryGrid.innerHTML = '<p class="loading" style="grid-column:1/-1;">No pictures available right now.</p>';
            document.getElementById('recentPagination').style.display = 'none';
            return;
        }

        //Stash the pictures in module state for the layout and lightbox.
        recentAllItems = pictures;
        //Seed the lightbox's combined list with the recent pictures.
        allGalleryPictures = pictures;
        //Reset to the first page so a refresh always starts at the top.
        recentPage = 1;
        //Pack into justified rows.
        buildRecentRows();
        //Render the first page.
        renderRecentPage();

        //If everything fits on one page, hide the pagination controls entirely.
        if (recentAllRows.length <= RECENT_ROWS_PER_PAGE) {
            document.getElementById('recentPagination').style.display = 'none';
        }
    } catch (error) {
        //Log and surface a friendly error in place of the gallery.
        console.error(error);
        galleryGrid.innerHTML = '<p class="loading" style="grid-column:1/-1;">Unable to load gallery.</p>';
        //Hide pagination since there's nothing to page through.
        document.getElementById('recentPagination').style.display = 'none';
    }
}

//Recent Pictures pagination button listeners.
document.getElementById('recentPrev').addEventListener('click', function () {
    if (recentPage > 1) {
        //Step back one page.
        recentPage--;
        //Find the gallery section so I can scroll it into view after re-rendering.
        var section = document.getElementById('gallery');
        //Account for the sticky header height when computing the scroll target.
        var headerHeight = document.querySelector('.site-header').offsetHeight;
        //Compute the absolute Y to scroll to so the section's top sits just below the header.
        var sectionTop = section.getBoundingClientRect().top + window.scrollY - headerHeight;
        //Re-render the new page.
        renderRecentPage();
        //Smooth-scroll back to the section header.
        window.scrollTo({ top: sectionTop, behavior: 'smooth' });
    }
});

//Recent Pictures next-page handler.
document.getElementById('recentNext').addEventListener('click', function () {
    //Compute total pages so I can clamp the increment.
    var totalPages = Math.ceil(recentAllRows.length / RECENT_ROWS_PER_PAGE);
    if (recentPage < totalPages) {
        //Step forward one page.
        recentPage++;
        //Find the gallery section so I can scroll it into view after re-rendering.
        var section = document.getElementById('gallery');
        //Account for the sticky header height when computing the scroll target.
        var headerHeight = document.querySelector('.site-header').offsetHeight;
        //Compute the absolute Y to scroll to so the section's top sits just below the header.
        var sectionTop = section.getBoundingClientRect().top + window.scrollY - headerHeight;
        //Re-render the new page.
        renderRecentPage();
        //Smooth-scroll back to the section header.
        window.scrollTo({ top: sectionTop, behavior: 'smooth' });
    }
});

//Kick off the recent gallery fetch on page load.
fetchGallery();

//Featured Gallery section: fetch featured media and render with independent pagination.
var featuredGrid = document.getElementById('featuredGrid');

//Fetch the featured pictures from the API and populate the featured grid with pagination.
async function fetchFeaturedGallery() {
    try {
        //GET the featured pictures from the public API.
        var response = await fetch('/api/featuredGallery');
        //Bail on a non-OK response.
        if (!response.ok) throw new Error('Fetch failed');
        //Parse the JSON body into an array of picture documents.
        var pictures = await response.json();

        if (!pictures || pictures.length === 0) {
            //Empty state: show a placeholder and hide pagination.
            featuredGrid.innerHTML = '<p class="loading" style="grid-column:1/-1;">No featured pictures available right now.</p>';
            document.getElementById('featuredPagination').style.display = 'none';
            return;
        }

        //Stash the featured items in module state.
        featuredAllItems = pictures;
        //Reset to the first page.
        featuredPage = 1;
        //Pack into justified rows.
        buildFeaturedRows();
        //Render the first page.
        renderFeaturedPage();

        //If everything fits on one page, hide the pagination controls entirely.
        if (featuredAllRows.length <= FEATURED_ROWS_PER_PAGE) {
            document.getElementById('featuredPagination').style.display = 'none';
        }
    } catch (error) {
        //Log and surface a friendly error in place of the gallery.
        console.error(error);
        featuredGrid.innerHTML = '<p class="loading" style="grid-column:1/-1;">Unable to load featured gallery.</p>';
        //Hide pagination since there's nothing to page through.
        document.getElementById('featuredPagination').style.display = 'none';
    }
}

//Featured Gallery pagination button listeners.
document.getElementById('featuredPrev').addEventListener('click', function () {
    if (featuredPage > 1) {
        //Step back one page.
        featuredPage--;
        //Find the featured section so I can scroll it into view after re-rendering.
        var section = document.getElementById('featuredGallery');
        //Account for the sticky header height when computing the scroll target.
        var headerHeight = document.querySelector('.site-header').offsetHeight;
        //Compute the absolute Y to scroll to so the section's top sits just below the header.
        var sectionTop = section.getBoundingClientRect().top + window.scrollY - headerHeight;
        //Re-render the new page.
        renderFeaturedPage();
        //Smooth-scroll back to the section header.
        window.scrollTo({ top: sectionTop, behavior: 'smooth' });
    }
});

//Featured Gallery next-page handler.
document.getElementById('featuredNext').addEventListener('click', function () {
    //Compute total pages so I can clamp the increment.
    var totalPages = Math.ceil(featuredAllRows.length / FEATURED_ROWS_PER_PAGE);
    if (featuredPage < totalPages) {
        //Step forward one page.
        featuredPage++;
        //Find the featured section so I can scroll it into view after re-rendering.
        var section = document.getElementById('featuredGallery');
        //Account for the sticky header height when computing the scroll target.
        var headerHeight = document.querySelector('.site-header').offsetHeight;
        //Compute the absolute Y to scroll to so the section's top sits just below the header.
        var sectionTop = section.getBoundingClientRect().top + window.scrollY - headerHeight;
        //Re-render the new page.
        renderFeaturedPage();
        //Smooth-scroll back to the section header.
        window.scrollTo({ top: sectionTop, behavior: 'smooth' });
    }
});

//Kick off the featured gallery fetch on page load.
fetchFeaturedGallery();

//Re-render both galleries on window resize so the justified layout recalculates for the new width.
var resizeTimer;
window.addEventListener('resize', function () {
    //Debounce so I don't thrash the layout on every pixel of drag.
    clearTimeout(resizeTimer);
    //Schedule a re-pack-and-render after the user stops resizing for ~150ms.
    resizeTimer = setTimeout(function () {
        if (recentAllItems.length > 0) {
            //Re-pack and re-render the recent gallery against the new width.
            buildRecentRows();
            renderRecentPage();
        }
        if (featuredAllItems.length > 0) {
            //Re-pack and re-render the featured gallery against the new width.
            buildFeaturedRows();
            renderFeaturedPage();
        }
    }, 150);
});

//Lightbox overlay with flip-card info and prev/next navigation.

//Create the lightbox overlay DOM once and append it to the body. The same overlay is reused for every picture.
var overlay = document.createElement('div');
//Standard lightbox class for styling.
overlay.className = 'lightbox-overlay';
//Inline the markup so I don't have to template it elsewhere. Front face holds the media; back face holds the details.
overlay.innerHTML =
    '<button class="lightbox-prev" aria-label="Previous picture">&#10094;</button>' +
    '<div class="lightbox-flip-container">' +
        '<div class="lightbox-flip-inner">' +
            '<div class="lightbox-front">' +
                '<button class="lightbox-close" aria-label="Close">&times;</button>' +
                '<button class="lightbox-info-btn" aria-label="Show info">&#9432;</button>' +
                '<img class="lightbox-img" src="" alt="">' +
                '<video class="lightbox-video" controls playsinline style="display:none;"></video>' +
            '</div>' +
            '<div class="lightbox-back">' +
                '<button class="lightbox-close lightbox-close-back" aria-label="Close">&times;</button>' +
                '<button class="lightbox-info-btn lightbox-info-btn-back" aria-label="Back to image">&#8634;</button>' +
                '<div class="lightbox-details"></div>' +
            '</div>' +
        '</div>' +
    '</div>' +
    '<button class="lightbox-next" aria-label="Next picture">&#10095;</button>';
//Drop the overlay into the body so it's available everywhere.
document.body.appendChild(overlay);

//Cache references to the lightbox sub-elements I'll touch repeatedly.
var flipInner = overlay.querySelector('.lightbox-flip-inner');
//Front-face image element.
var lightboxImg = overlay.querySelector('.lightbox-img');
//Front-face video element.
var lightboxVideo = overlay.querySelector('.lightbox-video');
//Back-face details container.
var detailsDiv = overlay.querySelector('.lightbox-details');
//Tracks whether the card is showing details or media.
var flipped = false;
//Index of the current picture inside allGalleryPictures (used by prev/next).
var currentOverlayIndex = 0;

//Format a single detail row, skipping anything empty/null so the table stays tidy.
function detailRow(label, value) {
    //Bail when the value is falsy and not literally zero.
    if (!value && value !== 0) return '';
    //Render the row as a label/value pair.
    return '<tr><td class="detail-label">' + label + '</td><td>' + value + '</td></tr>';
}

//Open the lightbox to a specific picture and prime the prev/next index.
function openOverlay(picture) {
    //Build a combined list from both gallery sections so the lightbox can navigate across them seamlessly.
    var combined = recentAllItems.slice();
    for (var i = 0; i < featuredAllItems.length; i++) {
        //Skip duplicates: a picture that lives in both sections should only appear once.
        var found = false;
        for (var j = 0; j < combined.length; j++) {
            if (combined[j]._id === featuredAllItems[i]._id) { found = true; break; }
        }
        //Push only when not already present.
        if (!found) combined.push(featuredAllItems[i]);
    }
    //Store the combined list for prev/next.
    allGalleryPictures = combined;

    //Locate the chosen picture's index in the combined list.
    var idx = -1;
    for (var k = 0; k < allGalleryPictures.length; k++) {
        if (allGalleryPictures[k]._id === picture._id) { idx = k; break; }
    }
    //Defensive fallback to the first picture if I somehow couldn't find a match.
    if (idx === -1) idx = 0;
    //Save the index so prev/next have a starting point.
    currentOverlayIndex = idx;
    //Render the picture into the overlay.
    showPicture(picture);
    //Activate the overlay (CSS handles the fade-in).
    overlay.classList.add('active');
    //Lock body scrolling so the page behind doesn't move.
    document.body.style.overflow = 'hidden';
}

//Render a specific picture into the lightbox (shared by openOverlay, showPrev, showNext).
function showPicture(picture) {
    //Pause any previously-playing video before swapping sources.
    lightboxVideo.pause();
    //Clear the previous src so the browser stops buffering it.
    lightboxVideo.removeAttribute('src');

    if (picture.mediaType === 'video') {
        //Hide the image and reveal the video element.
        lightboxImg.style.display = 'none';
        lightboxVideo.style.display = 'block';
        //Point the video at the new source.
        lightboxVideo.src = '/media/' + encodeURIComponent(picture.fileName);
        //Set the alt for accessibility.
        lightboxVideo.alt = picture.alt;
        //Auto-play the new video.
        lightboxVideo.play();
    } else {
        //Hide the video and reveal the image element.
        lightboxVideo.style.display = 'none';
        lightboxImg.style.display = 'block';
        //Point the image at the new source.
        lightboxImg.src = '/media/' + encodeURIComponent(picture.fileName);
        //Set the alt for accessibility.
        lightboxImg.alt = picture.alt;
    }
    //Always start on the front face so a navigation step doesn't strand the user looking at details for the previous picture.
    flipped = false;
    flipInner.classList.remove('flipped');

    //Build the details table from the picture metadata.
    var locationParts = [picture.city, picture.state, picture.country].filter(Boolean);
    //Comma-join the populated location parts.
    var locationStr = locationParts.join(', ');
    //Comma-join the tags (default to empty array if missing).
    var tagsStr = (picture.tags || []).join(', ');

    //Compose the details table HTML, skipping empty rows.
    var html = '<h3>' + picture.title + '</h3><table class="detail-table">';
    //Mongo document ID.
    html += detailRow('ID', picture._id);
    //Title.
    html += detailRow('Title', picture.title);
    //Description.
    html += detailRow('Description', picture.description);
    //Media type (photo/video).
    html += detailRow('Media Type', picture.mediaType);
    //Tags.
    html += detailRow('Tags', tagsStr);
    //Capture timestamp.
    html += detailRow('Captured At', picture.capturedAt);
    //Combined location string.
    html += detailRow('Location', locationStr);
    //Pixel width if known.
    html += detailRow('Image Width', picture.imageWidth ? picture.imageWidth + ' px' : '');
    //Pixel height if known.
    html += detailRow('Image Height', picture.imageHeight ? picture.imageHeight + ' px' : '');
    //Aspect ratio.
    html += detailRow('Aspect Ratio', picture.aspectRatio);
    //EXIF camera make.
    html += detailRow('Camera Make', picture.cameraMake);
    //EXIF camera model.
    html += detailRow('Camera Model', picture.cameraModel);
    //EXIF aperture.
    html += detailRow('Aperture', picture.aperture);
    //EXIF exposure time.
    html += detailRow('Exposure Time', picture.exposureTime);
    //EXIF ISO.
    html += detailRow('ISO', picture.iso);
    //EXIF focal length.
    html += detailRow('Focal Length', picture.focalLength);
    //EXIF lens model.
    html += detailRow('Lens Model', picture.lensModel);
    //Close the table.
    html += '</table>';
    //Push the composed HTML into the back face.
    detailsDiv.innerHTML = html;

    //Hide prev/next at the boundaries so the user can't navigate off either end.
    overlay.querySelector('.lightbox-prev').style.display = currentOverlayIndex > 0 ? '' : 'none';
    overlay.querySelector('.lightbox-next').style.display = currentOverlayIndex < allGalleryPictures.length - 1 ? '' : 'none';
}

//Close the lightbox and restore page scrolling.
function closeOverlay() {
    //Hide the overlay (CSS handles the fade-out).
    overlay.classList.remove('active');
    //Reset the flip state so the next open starts on the front face.
    flipInner.classList.remove('flipped');
    flipped = false;
    //Restore body scrolling.
    document.body.style.overflow = '';
    //Stop video playback when closing the lightbox so audio doesn't keep playing in the background.
    lightboxVideo.pause();
    //Clear the video src and reload to fully detach the stream.
    lightboxVideo.removeAttribute('src');
    lightboxVideo.load();
}

//Toggle the card flip between the front (media) and back (details).
function toggleFlip() {
    //Flip the state.
    flipped = !flipped;
    if (flipped) {
        //Add the flipped class so the CSS rotation kicks in.
        flipInner.classList.add('flipped');
    } else {
        //Remove the flipped class to rotate back.
        flipInner.classList.remove('flipped');
    }
}

//Navigate to the previous picture in the gallery.
function showPrev() {
    if (currentOverlayIndex > 0) {
        //Step back one and re-render.
        currentOverlayIndex--;
        showPicture(allGalleryPictures[currentOverlayIndex]);
    }
}

//Navigate to the next picture in the gallery.
function showNext() {
    if (currentOverlayIndex < allGalleryPictures.length - 1) {
        //Step forward one and re-render.
        currentOverlayIndex++;
        showPicture(allGalleryPictures[currentOverlayIndex]);
    }
}

//Close the overlay when clicking on the dark backdrop (but not on the card or its buttons).
overlay.addEventListener('click', function (e) {
    //Only react when the click hit the overlay itself, not a child.
    if (e.target === overlay) closeOverlay();
});

//Wire all close buttons (front and back faces) to closeOverlay.
overlay.querySelectorAll('.lightbox-close').forEach(function (btn) {
    btn.addEventListener('click', closeOverlay);
});

//Wire all info buttons (front and back faces) to toggleFlip.
overlay.querySelectorAll('.lightbox-info-btn').forEach(function (btn) {
    btn.addEventListener('click', toggleFlip);
});

//Wire the previous-picture button.
overlay.querySelector('.lightbox-prev').addEventListener('click', showPrev);

//Wire the next-picture button.
overlay.querySelector('.lightbox-next').addEventListener('click', showNext);

//Keyboard navigation: Escape to close, ArrowLeft for prev, ArrowRight for next. Active only when the overlay is open.
document.addEventListener('keydown', function (e) {
    //Bail when the overlay isn't open so I don't intercept keys for the rest of the page.
    if (!overlay.classList.contains('active')) return;
    //Escape closes the overlay.
    if (e.key === 'Escape') closeOverlay();
    //Left arrow navigates back.
    if (e.key === 'ArrowLeft') showPrev();
    //Right arrow navigates forward.
    if (e.key === 'ArrowRight') showNext();
});

//Services and What's New sections: fetched together from the public API root.
//Services grid container.
const servicesGrid = document.getElementById('servicesGrid');
//What's New grid container.
const whatsNewGrid = document.getElementById('whatsNewGrid');

//Fetch services + What's New items from the API and render them into their respective grids.
async function fetchServices() {
    try {
        //GET the full public payload.
        const response = await fetch('/api');
        //Bail on a non-OK response.
        if (!response.ok) throw new Error('Fetch failed');
        //Parse the JSON body.
        const data = await response.json();

        //Pull the services array, defaulting to empty so the loops below don't choke.
        const serviceItems = data.photoVideoServices || [];
        //Pull the What's New array, same defaulting.
        const whatsNewItems = data.whatsNewItems || [];

        //Wipe both grids before re-rendering.
        servicesGrid.innerHTML = '';
        whatsNewGrid.innerHTML = '';

        //Empty-state placeholder for services.
        if (serviceItems.length === 0) {
            //Show a friendly placeholder.
            servicesGrid.innerHTML = '<p style="grid-column:1/-1;text-align:center;opacity:0.5;">No services available right now.</p>';
        }

        //Empty-state placeholder for What's New.
        if (whatsNewItems.length === 0) {
            //Show a friendly placeholder.
            whatsNewGrid.innerHTML = '<p style="grid-column:1/-1;text-align:center;opacity:0.5;">No updates posted yet.</p>';
        }

        //Render each service as a card.
        for (const service of serviceItems) {
            //Outer card container.
            var card = document.createElement('div');
            //Standard service card class.
            card.className = 'service-card';

            //Service name as the card heading.
            setText(card, 'h3', service.serviceName);
            //Service description as a paragraph.
            setText(card, 'p', service.serviceDescription);

            //Price block lives in its own div so it can be styled distinctly from the description.
            var priceDiv = document.createElement('div');
            //Standard price class.
            priceDiv.className = 'service-price';
            //Format the price with a dollar sign and locale-aware thousand separators.
            priceDiv.textContent = '$' + service.price.toLocaleString() + ' ';
            //Span for the per-unit qualifier so it can be styled smaller than the price.
            var span = document.createElement('span');
            //Per-unit label.
            span.textContent = '/ each';
            //Drop the span into the price div.
            priceDiv.appendChild(span);
            //Drop the price div into the card.
            card.appendChild(priceDiv);

            //Append the card to the services grid.
            servicesGrid.appendChild(card);
        }

        //Render each What's New item as a card.
        for (const item of whatsNewItems) {
            //Outer card container.
            var card = document.createElement('div');
            //Standard What's New card class.
            card.className = 'whatsnew-card';

            //Date sits at the top of the card with its own styling.
            var dateDiv = setText(card, 'div', item.date);
            //Apply the date class so it renders distinct from the rest of the card.
            dateDiv.className = 'whatsnew-date';

            //Title as the card heading.
            setText(card, 'h3', item.title);
            //Description as a paragraph.
            setText(card, 'p', item.description);

            //Tag pill at the bottom of the card.
            var tag = setText(card, 'span', item.tag);
            //Apply the tag class so it renders as a pill.
            tag.className = 'whatsnew-tag';

            //Append the card to the What's New grid.
            whatsNewGrid.appendChild(card);
        }
    } catch (error) {
        //Log and surface friendly error placeholders in both grids.
        console.error(error);
        //Services error placeholder.
        servicesGrid.innerHTML = '<p style="grid-column:1/-1;text-align:center;opacity:0.5;">Unable to load services.</p>';
        //What's New error placeholder.
        whatsNewGrid.innerHTML = '<p style="grid-column:1/-1;text-align:center;opacity:0.5;">Unable to load updates.</p>';
    }
}

//Kick off the services + What's New fetch on page load.
fetchServices();
