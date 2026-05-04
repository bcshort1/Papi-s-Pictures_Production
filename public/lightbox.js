//Reusable lightbox overlay used by both the homepage galleries and the /galleries page.
//Exposes a single global function:
//
//  window.openLightbox(picture, navList)
//
//where `picture` is the media doc to display and `navList` is the array of pictures
//that prev/next will cycle through (defaults to [picture] when omitted). The overlay
//DOM is created lazily on the first call so pages that never use the lightbox don't
//pay the markup cost.
//
//Originally lived inside index.js; lifted out so the /galleries page can reuse it.

(function (window, document) {
    //Module-scoped overlay state. Initialised once on the first openLightbox call.
    var overlay = null;
    //Front-face image element.
    var lightboxImg = null;
    //Front-face video element.
    var lightboxVideo = null;
    //Inner flip container that toggles between front (media) and back (details).
    var flipInner = null;
    //Back-face details container.
    var detailsDiv = null;
    //Tracks whether the card is showing details or media.
    var flipped = false;
    //Index of the currently displayed picture inside navList.
    var currentIndex = 0;
    //The picture list prev/next can navigate through.
    var navList = [];

    //Lazily build the lightbox DOM on first use, then wire up close/info/prev/next/keyboard handlers.
    function ensureOverlay() {
        if (overlay) return;
        //Build the overlay container.
        overlay = document.createElement('div');
        //Standard lightbox class for styling.
        overlay.className = 'lightbox-overlay';
        //Inline the markup so callers don't need a separate template. Front face holds the media; back face holds the details.
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
        flipInner = overlay.querySelector('.lightbox-flip-inner');
        lightboxImg = overlay.querySelector('.lightbox-img');
        lightboxVideo = overlay.querySelector('.lightbox-video');
        detailsDiv = overlay.querySelector('.lightbox-details');

        //Close the overlay when clicking on the dark backdrop (but not on the card or its buttons).
        overlay.addEventListener('click', function (e) {
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
        //Wire the prev/next buttons.
        overlay.querySelector('.lightbox-prev').addEventListener('click', showPrev);
        overlay.querySelector('.lightbox-next').addEventListener('click', showNext);

        //Keyboard navigation: Escape to close, ArrowLeft for prev, ArrowRight for next.
        //Active only when the overlay is open so I don't intercept keys for the rest of the page.
        document.addEventListener('keydown', function (e) {
            if (!overlay.classList.contains('active')) return;
            if (e.key === 'Escape') closeOverlay();
            if (e.key === 'ArrowLeft') showPrev();
            if (e.key === 'ArrowRight') showNext();
        });
    }

    //Format a single detail row, skipping anything empty/null so the table stays tidy.
    function detailRow(label, value) {
        //Bail when the value is falsy and not literally zero.
        if (!value && value !== 0) return '';
        return '<tr><td class="detail-label">' + label + '</td><td>' + value + '</td></tr>';
    }

    //Render a specific picture into the lightbox (shared by openLightbox, showPrev, showNext).
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
            lightboxVideo.alt = picture.alt || '';
            //Auto-play the new video.
            lightboxVideo.play();
        } else {
            //Hide the video and reveal the image element.
            lightboxVideo.style.display = 'none';
            lightboxImg.style.display = 'block';
            //Point the image at the new source.
            lightboxImg.src = '/media/' + encodeURIComponent(picture.fileName);
            //Set the alt for accessibility.
            lightboxImg.alt = picture.alt || '';
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
        var html = '<h3>' + (picture.title || '') + '</h3><table class="detail-table">';
        html += detailRow('ID', picture._id);
        html += detailRow('Title', picture.title);
        html += detailRow('Description', picture.description);
        html += detailRow('Media Type', picture.mediaType);
        html += detailRow('Tags', tagsStr);
        html += detailRow('Captured At', picture.capturedAt);
        html += detailRow('Location', locationStr);
        html += detailRow('Image Width', picture.imageWidth ? picture.imageWidth + ' px' : '');
        html += detailRow('Image Height', picture.imageHeight ? picture.imageHeight + ' px' : '');
        html += detailRow('Aspect Ratio', picture.aspectRatio);
        html += detailRow('Camera Make', picture.cameraMake);
        html += detailRow('Camera Model', picture.cameraModel);
        html += detailRow('Aperture', picture.aperture);
        html += detailRow('Exposure Time', picture.exposureTime);
        html += detailRow('ISO', picture.iso);
        html += detailRow('Focal Length', picture.focalLength);
        html += detailRow('Lens Model', picture.lensModel);
        html += '</table>';
        detailsDiv.innerHTML = html;

        //Hide prev/next at the boundaries so the user can't navigate off either end.
        overlay.querySelector('.lightbox-prev').style.display = currentIndex > 0 ? '' : 'none';
        overlay.querySelector('.lightbox-next').style.display = currentIndex < navList.length - 1 ? '' : 'none';
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
        flipped = !flipped;
        if (flipped) flipInner.classList.add('flipped');
        else flipInner.classList.remove('flipped');
    }

    //Navigate to the previous picture in navList.
    function showPrev() {
        if (currentIndex > 0) {
            currentIndex--;
            showPicture(navList[currentIndex]);
        }
    }

    //Navigate to the next picture in navList.
    function showNext() {
        if (currentIndex < navList.length - 1) {
            currentIndex++;
            showPicture(navList[currentIndex]);
        }
    }

    //Public entry point. Opens the lightbox to a specific picture inside the supplied
    //navigation list (so prev/next can cycle through the same gallery the user clicked from).
    function openLightbox(picture, list) {
        //Lazy DOM setup on first use.
        ensureOverlay();
        //Default the navigation list to a singleton when the caller doesn't pass one.
        navList = (list && list.length > 0) ? list.slice() : [picture];
        //Locate the chosen picture's index in the navigation list.
        var idx = -1;
        for (var k = 0; k < navList.length; k++) {
            if (navList[k]._id === picture._id) { idx = k; break; }
        }
        //Defensive fallback to the first picture if I somehow couldn't find a match.
        if (idx === -1) idx = 0;
        //Save the index so prev/next have a starting point.
        currentIndex = idx;
        //Render the picture into the overlay.
        showPicture(picture);
        //Activate the overlay (CSS handles the fade-in).
        overlay.classList.add('active');
        //Lock body scrolling so the page behind doesn't move.
        document.body.style.overflow = 'hidden';
    }

    //Expose the entry point. Everything else stays module-private.
    window.openLightbox = openLightbox;
})(window, document);
