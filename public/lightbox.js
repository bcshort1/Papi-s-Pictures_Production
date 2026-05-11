(function (window, document) {
    var overlay = null;
    var flipContainer = null;
    var lightboxImg = null;
    var lightboxVideo = null;
    var flipInner = null;
    var detailsDiv = null;
    var flipped = false;
    var currentIndex = 0;
    var navList = [];
    var savedScrollY = 0;

    var SLIDE_MS = 350;
    var FLIP_MS = 600;
    var slideTimer = null;
    var slideDirection = null;
    var prevGhost = null;
    var nextGhost = null;

    function lockBodyScroll() {
        savedScrollY = window.scrollY || window.pageYOffset || 0;
        document.body.style.top = '-' + savedScrollY + 'px';
        document.body.classList.add('lightbox-open');
    }

    function unlockBodyScroll() {
        document.body.classList.remove('lightbox-open');
        document.body.style.top = '';
        window.scrollTo(0, savedScrollY);
    }

    function buildGhostCardElement(picture) {
        var card = document.createElement('div');
        card.className = 'lightbox-ghost-card-inner';
        if (picture.mediaType === 'video') {
            var v = document.createElement('video');
            v.src = '/media/' + encodeURIComponent(picture.fileName);
            v.muted = true;
            v.playsInline = true;
            v.preload = 'metadata';
            card.appendChild(v);
        } else {
            var img = document.createElement('img');
            img.src = '/media/' + encodeURIComponent(picture.fileName);
            img.alt = picture.alt || '';
            card.appendChild(img);
        }
        return card;
    }

    function createGhost(side, idx) {
        if (idx < 0 || idx >= navList.length) return null;
        var ghost = document.createElement('div');
        ghost.className = 'lightbox-card-ghost is-' + side;
        ghost.appendChild(buildGhostCardElement(navList[idx]));
        overlay.appendChild(ghost);
        void ghost.offsetWidth;
        return ghost;
    }

    function removeGhost(g) {
        if (g && g.parentNode) g.parentNode.removeChild(g);
    }

    function clearGhosts() {
        removeGhost(prevGhost);
        removeGhost(nextGhost);
        prevGhost = null;
        nextGhost = null;
    }

    function isAnimating() {
        return slideTimer !== null;
    }

    function cancelSlide() {
        if (slideTimer) {
            clearTimeout(slideTimer);
            slideTimer = null;
        }
    }

    function resetTransformsInstant() {
        flipContainer.style.transition = 'none';
        flipContainer.style.transform = '';
        overlay.style.background = '';
    }

    function transformDuringDrag(dx, dy) {
        flipContainer.style.transition = 'none';
        flipContainer.style.transform = 'translate3d(' + dx + 'px, ' + dy + 'px, 0)';
        if (prevGhost) {
            prevGhost.style.transition = 'none';
            prevGhost.style.transform = 'translate(-50%, -50%) translateX(calc(-50vw - 50% + ' + dx + 'px))';
        }
        if (nextGhost) {
            nextGhost.style.transition = 'none';
            nextGhost.style.transform = 'translate(-50%, -50%) translateX(calc(50vw + 50% + ' + dx + 'px))';
        }
        if (dy > 0) {
            overlay.style.background = 'rgba(0, 0, 0, ' + Math.max(0.4, 0.88 - dy / 600) + ')';
        }
    }

    function transformResetAnimated() {
        var ms = 250;
        flipContainer.style.transition = 'transform ' + ms + 'ms ease-out, background ' + ms + 'ms ease-out';
        flipContainer.style.transform = '';
        if (prevGhost) {
            prevGhost.style.transition = 'transform ' + ms + 'ms ease-out';
            prevGhost.style.transform = '';
        }
        if (nextGhost) {
            nextGhost.style.transition = 'transform ' + ms + 'ms ease-out';
            nextGhost.style.transform = '';
        }
        overlay.style.background = '';
        cancelSlide();
        slideTimer = setTimeout(function () {
            slideTimer = null;
            clearGhosts();
            flipContainer.style.transition = 'none';
        }, ms + 50);
    }

    function commitSlide(direction) {
        cancelSlide();
        slideDirection = direction;

        function runSlide() {
            flipContainer.style.transition = 'transform ' + SLIDE_MS + 'ms ease-out';
            if (direction === 'next') {
                flipContainer.style.transform = 'translateX(calc(-50vw - 50%))';
                if (nextGhost) {
                    nextGhost.style.transition = 'transform ' + SLIDE_MS + 'ms ease-out';
                    nextGhost.style.transform = 'translate(-50%, -50%) translateX(0)';
                }
            } else {
                flipContainer.style.transform = 'translateX(calc(50vw + 50%))';
                if (prevGhost) {
                    prevGhost.style.transition = 'transform ' + SLIDE_MS + 'ms ease-out';
                    prevGhost.style.transform = 'translate(-50%, -50%) translateX(0)';
                }
            }
            slideTimer = setTimeout(function () {
                slideTimer = null;
                if (direction === 'next') currentIndex++;
                else currentIndex--;
                showPicture(navList[currentIndex]);
                flipContainer.style.transition = 'none';
                flipContainer.style.transform = '';
                clearGhosts();
                slideDirection = null;
            }, SLIDE_MS);
        }

        if (flipped) {
            flipped = false;
            flipInner.classList.remove('flipped');
            slideTimer = setTimeout(runSlide, FLIP_MS);
        } else {
            runSlide();
        }
    }

    function finishSlideInstant() {
        if (!slideDirection) {
            cancelSlide();
            resetTransformsInstant();
            clearGhosts();
            return;
        }
        cancelSlide();
        if (slideDirection === 'next' && currentIndex < navList.length - 1) currentIndex++;
        else if (slideDirection === 'prev' && currentIndex > 0) currentIndex--;
        showPicture(navList[currentIndex]);
        flipContainer.style.transition = 'none';
        flipContainer.style.transform = '';
        clearGhosts();
        slideDirection = null;
    }

    function rubberBand(direction) {
        cancelSlide();
        var dist = direction === 'next' ? -32 : 32;
        var ms = 180;
        flipContainer.style.transition = 'transform ' + ms + 'ms ease-out';
        flipContainer.style.transform = 'translateX(' + dist + 'px)';
        slideTimer = setTimeout(function () {
            flipContainer.style.transition = 'transform ' + ms + 'ms ease-out';
            flipContainer.style.transform = '';
            slideTimer = setTimeout(function () {
                slideTimer = null;
                flipContainer.style.transition = 'none';
            }, ms);
        }, ms);
    }

    function navigate(direction) {
        if (isAnimating()) {
            finishSlideInstant();
        }
        var canNav = (direction === 'next' && currentIndex < navList.length - 1) ||
            (direction === 'prev' && currentIndex > 0);
        if (!canNav) {
            rubberBand(direction);
            return;
        }
        if (direction === 'next' && !nextGhost) {
            nextGhost = createGhost('next', currentIndex + 1);
        } else if (direction === 'prev' && !prevGhost) {
            prevGhost = createGhost('prev', currentIndex - 1);
        }
        commitSlide(direction);
    }

    function setupSwipe() {
        var state = null;
        var DECIDE_PX = 8;
        var H_THRESHOLD_RATIO = 0.25;
        var V_THRESHOLD_PX = 120;

        flipContainer.addEventListener('touchstart', function (e) {
            if (e.touches.length !== 1) { state = null; return; }
            if (isAnimating()) {
                cancelSlide();
                resetTransformsInstant();
                clearGhosts();
            }
            var t = e.touches[0];
            state = { x0: t.clientX, y0: t.clientY, dx: 0, dy: 0, decided: null, isFlipped: flipped };
        }, { passive: true });

        flipContainer.addEventListener('touchmove', function (e) {
            if (!state) return;
            if (e.touches.length !== 1) { transformResetAnimated(); state = null; return; }
            var t = e.touches[0];
            state.dx = t.clientX - state.x0;
            state.dy = t.clientY - state.y0;

            if (state.decided === null) {
                if (Math.abs(state.dx) < DECIDE_PX && Math.abs(state.dy) < DECIDE_PX) return;
                if (Math.abs(state.dx) > Math.abs(state.dy)) {
                    if (state.isFlipped) {
                        flipped = false;
                        flipInner.classList.remove('flipped');
                        state.decided = 'flip-back-only';
                    } else {
                        state.decided = 'horizontal';
                        if (!prevGhost) prevGhost = createGhost('prev', currentIndex - 1);
                        if (!nextGhost) nextGhost = createGhost('next', currentIndex + 1);
                    }
                } else if (state.dy > 0 && !state.isFlipped) {
                    state.decided = 'vertical';
                } else {
                    state.decided = 'native';
                }
            }

            if (state.decided === 'horizontal') {
                e.preventDefault();
                var effectiveDx = state.dx;
                if ((state.dx > 0 && currentIndex === 0) ||
                    (state.dx < 0 && currentIndex === navList.length - 1)) {
                    effectiveDx = state.dx * 0.3;
                }
                transformDuringDrag(effectiveDx, 0);
            } else if (state.decided === 'vertical') {
                e.preventDefault();
                transformDuringDrag(0, Math.max(0, state.dy));
            } else if (state.decided === 'flip-back-only') {
                e.preventDefault();
            }
        }, { passive: false });

        flipContainer.addEventListener('touchend', function () {
            if (!state) return;
            var s = state;
            state = null;
            if (s.decided === 'flip-back-only') {
                return;
            }
            var hThresh = window.innerWidth * H_THRESHOLD_RATIO;
            if (s.decided === 'horizontal' && Math.abs(s.dx) > hThresh) {
                if (s.dx < 0 && currentIndex < navList.length - 1) {
                    commitSlide('next');
                } else if (s.dx > 0 && currentIndex > 0) {
                    commitSlide('prev');
                } else {
                    transformResetAnimated();
                }
            } else if (s.decided === 'vertical' && s.dy > V_THRESHOLD_PX) {
                closeOverlay();
                clearGhosts();
                resetTransformsInstant();
            } else {
                transformResetAnimated();
            }
        });

        flipContainer.addEventListener('touchcancel', function () {
            if (!state) return;
            var s = state;
            state = null;
            if (s.decided === 'flip-back-only') return;
            transformResetAnimated();
        });
    }

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

        flipContainer = overlay.querySelector('.lightbox-flip-container');
        setupSwipe();
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
        cancelSlide();
        slideDirection = null;
        clearGhosts();
        resetTransformsInstant();
        overlay.classList.remove('active');
        flipInner.classList.remove('flipped');
        flipped = false;
        unlockBodyScroll();
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
        navigate('prev');
    }

    function showNext() {
        navigate('next');
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
        lockBodyScroll();
    }

    window.openLightbox = openLightbox;
})(window, document);
