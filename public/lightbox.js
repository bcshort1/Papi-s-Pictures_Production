(function (window, document) {
    var overlay = null;
    var lightboxImg = null;
    var lightboxVideo = null;
    var flipInner = null;
    var detailsDiv = null;
    var flipped = false;
    var currentIndex = 0;
    var navList = [];

    function ensureOverlay() {
        if (overlay) return;
        overlay = document.createElement('div');
        overlay.className = 'lightbox-overlay';
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
        document.body.appendChild(overlay);

        flipInner = overlay.querySelector('.lightbox-flip-inner');
        lightboxImg = overlay.querySelector('.lightbox-img');
        lightboxVideo = overlay.querySelector('.lightbox-video');
        detailsDiv = overlay.querySelector('.lightbox-details');

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeOverlay();
        });
        overlay.querySelectorAll('.lightbox-close').forEach(function (btn) {
            btn.addEventListener('click', closeOverlay);
        });
        overlay.querySelectorAll('.lightbox-info-btn').forEach(function (btn) {
            btn.addEventListener('click', toggleFlip);
        });
        overlay.querySelector('.lightbox-prev').addEventListener('click', showPrev);
        overlay.querySelector('.lightbox-next').addEventListener('click', showNext);

        document.addEventListener('keydown', function (e) {
            if (!overlay.classList.contains('active')) return;
            if (e.key === 'Escape') closeOverlay();
            if (e.key === 'ArrowLeft') showPrev();
            if (e.key === 'ArrowRight') showNext();
        });
    }

    function detailRow(label, value) {
        if (!value && value !== 0) return '';
        return '<tr><td class="detail-label">' + label + '</td><td>' + value + '</td></tr>';
    }

    function showPicture(picture) {
        lightboxVideo.pause();
        lightboxVideo.removeAttribute('src');

        if (picture.mediaType === 'video') {
            lightboxImg.style.display = 'none';
            lightboxVideo.style.display = 'block';
            lightboxVideo.src = '/media/' + encodeURIComponent(picture.fileName);
            lightboxVideo.alt = picture.alt || '';
            lightboxVideo.play();
        } else {
            lightboxVideo.style.display = 'none';
            lightboxImg.style.display = 'block';
            lightboxImg.src = '/media/' + encodeURIComponent(picture.fileName);
            lightboxImg.alt = picture.alt || '';
        }
        flipped = false;
        flipInner.classList.remove('flipped');

        var locationParts = [picture.city, picture.state, picture.country].filter(Boolean);
        var locationStr = locationParts.join(', ');
        var tagsStr = (picture.tags || []).join(', ');

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

        overlay.querySelector('.lightbox-prev').style.display = currentIndex > 0 ? '' : 'none';
        overlay.querySelector('.lightbox-next').style.display = currentIndex < navList.length - 1 ? '' : 'none';
    }

    function closeOverlay() {
        overlay.classList.remove('active');
        flipInner.classList.remove('flipped');
        flipped = false;
        document.body.style.overflow = '';
        lightboxVideo.pause();
        lightboxVideo.removeAttribute('src');
        lightboxVideo.load();
    }

    function toggleFlip() {
        flipped = !flipped;
        if (flipped) flipInner.classList.add('flipped');
        else flipInner.classList.remove('flipped');
    }

    function showPrev() {
        if (currentIndex > 0) {
            currentIndex--;
            showPicture(navList[currentIndex]);
        }
    }

    function showNext() {
        if (currentIndex < navList.length - 1) {
            currentIndex++;
            showPicture(navList[currentIndex]);
        }
    }

    function openLightbox(picture, list) {
        ensureOverlay();
        navList = (list && list.length > 0) ? list.slice() : [picture];
        var idx = -1;
        for (var k = 0; k < navList.length; k++) {
            if (navList[k]._id === picture._id) { idx = k; break; }
        }
        if (idx === -1) idx = 0;
        currentIndex = idx;
        showPicture(picture);
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    window.openLightbox = openLightbox;
})(window, document);
