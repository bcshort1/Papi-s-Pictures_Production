//Justified gallery row engine. Used by both index.js (homepage Recent/Featured) and
//galleries.js (per-gallery view) to lay out a list of pictures into Flickr-style rows
//where each row is roughly TARGET_ROW_HEIGHT pixels tall after width-justification.
//
//Originally lived inside index.js; lifted here so multiple pages can reuse the same
//layout engine without duplicating ~150 lines of math.

(function (window, document) {
    //Default target row height in pixels. Callers can override per-render via options.targetRowHeight.
    var TARGET_ROW_HEIGHT = 250;
    //Default pixel gap between items in a row. Matches the CSS gap on .gallery-row.
    var DEFAULT_GAP = 8;

    //Pack entries into justified rows: keep adding items to the current row until adding more
    //would push the row's natural height below targetHeight, then close the row and start the next.
    function buildJustifiedRows(entries, containerWidth, gap, targetHeight) {
        //Output array of rows, each itself an array of entries.
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
                //Natural height the row would have if I closed it here.
                var h = (containerWidth - gaps) / aspectSum;
                if (h <= targetHeight) {
                    //Row is full enough; advance past this item and break out.
                    rowEnd++;
                    break;
                }
                //Still too tall, keep packing.
                rowEnd++;
            }
            //Slice this row's entries out of the input and push to the output.
            rows.push(entries.slice(rowStart, rowEnd));
            //Move the start cursor to the next unprocessed entry.
            rowStart = rowEnd;
        }
        return rows;
    }

    //Build the (picture, aspectRatio) entries the row packer expects from a list of picture documents.
    //Centralizes the aspect-ratio fallback logic so every caller behaves the same on legacy/missing data.
    function buildEntries(pictures) {
        var entries = [];
        for (var i = 0; i < pictures.length; i++) {
            var pic = pictures[i];
            //Prefer the stored aspect ratio; fall back to width/height; default to 4:3.
            var ar = pic.aspectRatio
                ? parseFloat(pic.aspectRatio)
                : (pic.imageWidth && pic.imageHeight ? pic.imageWidth / pic.imageHeight : 1.3333);
            //Guard against bad data that would break the layout math.
            if (ar <= 0 || isNaN(ar)) ar = 1.3333;
            entries.push({ picture: pic, aspectRatio: ar });
        }
        return entries;
    }

    //Render specific pre-built rows into a grid element. Options:
    //  rowsPerPage      - last-row cap is only applied when this is the very last page (default Infinity).
    //  availableHeight  - if > 0, scale rows uniformly to fit (desktop only; mobile uses a column layout).
    //  onItemClick(pic) - click handler for each item; defaults to a no-op so static layouts still work.
    //  gap              - gap between items in pixels (default 8).
    //  targetRowHeight  - target row height for orphaned-tall-row capping (default 250).
    //  emptyHtml        - HTML to render when rows is empty.
    function renderRows(rows, gridElement, options) {
        //Normalize the options bag and pull defaults.
        options = options || {};
        var gap = typeof options.gap === 'number' ? options.gap : DEFAULT_GAP;
        var targetRowHeight = options.targetRowHeight || TARGET_ROW_HEIGHT;
        var rowsPerPage = options.rowsPerPage || Infinity;
        var onItemClick = options.onItemClick || function () {};
        var availableHeight = options.availableHeight || 0;
        var emptyHtml = options.emptyHtml || '<p class="loading" style="width:100%;text-align:center;">No pictures available right now.</p>';

        //Wipe whatever was previously rendered.
        gridElement.innerHTML = '';
        if (rows.length === 0) {
            gridElement.innerHTML = emptyHtml;
            return;
        }

        //Width available for sizing items, falling back to a sensible default if the grid hasn't laid out yet.
        var containerWidth = gridElement.clientWidth || 1200;
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
            var isVeryLastRow = (r === rows.length - 1) && (r + 1 < rowsPerPage || rows.length < rowsPerPage);
            //Apply the cap when the natural height exceeds the target by more than 30%.
            if (isVeryLastRow && h > targetRowHeight * 1.3) h = targetRowHeight;
            //Save the height for the render pass below.
            rowHeights.push(h);
        }

        //Scale rows to fit the available height if provided (desktop only).
        if (!isMobile && availableHeight > 0) {
            //Total gap pixels stacked between rows.
            var totalGaps = Math.max(0, rows.length - 1) * gap;
            //Sum row heights plus gaps to get the total content height.
            var totalContent = totalGaps;
            for (var hi = 0; hi < rowHeights.length; hi++) totalContent += rowHeights[hi];
            if (totalContent > availableHeight) {
                //Scale every row uniformly so the gaps stay constant and only the content shrinks.
                var scale = (availableHeight - totalGaps) / (totalContent - totalGaps);
                for (var hj = 0; hj < rowHeights.length; hj++) rowHeights[hj] *= scale;
            }
        }

        //Walk each row and emit its DOM.
        for (var ri = 0; ri < rows.length; ri++) {
            //Pull the row's entries.
            var row = rows[ri];
            //Container for this row of items.
            var rowDiv = document.createElement('div');
            //Standard row class so CSS can style it as a flex row.
            rowDiv.className = 'gallery-row';
            //Pre-computed height for this row.
            var rowHeight = rowHeights[ri];

            //Check if this row's items fill the width (full row) or not (partial last row).
            var rowSumAR = 0;
            for (var k1 = 0; k1 < row.length; k1++) rowSumAR += row[k1].aspectRatio;
            //Natural height the row would take if items filled the width.
            var naturalH = (containerWidth - (row.length - 1) * gap) / rowSumAR;
            //Capped means I shrunk the row below natural — items shouldn't flex-grow.
            var isCapped = (rowHeight < naturalH * 0.95);

            for (var k2 = 0; k2 < row.length; k2++) {
                //Pull the entry and the underlying picture document.
                var entry = row[k2];
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
                    video.alt = picture.alt || '';
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
                    //IIFE captures the picture for this iteration so the click handler points at the right item.
                    video.addEventListener('click', (function (pic) {
                        return function () { onItemClick(pic); };
                    })(picture));
                    itemDiv.appendChild(video);
                } else {
                    //Build an image element for photo items.
                    var image = document.createElement('img');
                    //Source URL via the static media route.
                    image.src = '/media/' + encodeURIComponent(picture.fileName);
                    //Alt text for accessibility.
                    image.alt = picture.alt || '';
                    //Pointer cursor so it's obvious the image is clickable.
                    image.style.cursor = 'pointer';
                    //IIFE captures the picture for this iteration so the click handler points at the right item.
                    image.addEventListener('click', (function (pic) {
                        return function () { onItemClick(pic); };
                    })(picture));
                    itemDiv.appendChild(image);
                }

                rowDiv.appendChild(itemDiv);
            }
            gridElement.appendChild(rowDiv);
        }
    }

    //Expose under a single namespace so the global surface stays small.
    window.PapisJustified = {
        TARGET_ROW_HEIGHT: TARGET_ROW_HEIGHT,
        GAP: DEFAULT_GAP,
        buildJustifiedRows: buildJustifiedRows,
        buildEntries: buildEntries,
        renderRows: renderRows
    };
})(window, document);
