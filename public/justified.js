(function (window, document) {
    var TARGET_ROW_HEIGHT = 250;
    var DEFAULT_GAP = 8;

    function buildJustifiedRows(entries, containerWidth, gap, targetHeight) {
        var rows = [];
        var rowStart = 0;
        while (rowStart < entries.length) {
            var aspectSum = 0;
            var rowEnd = rowStart;
            while (rowEnd < entries.length) {
                aspectSum += entries[rowEnd].aspectRatio;
                var gaps = (rowEnd - rowStart) * gap;
                var h = (containerWidth - gaps) / aspectSum;
                if (h <= targetHeight) {
                    rowEnd++;
                    break;
                }
                rowEnd++;
            }
            rows.push(entries.slice(rowStart, rowEnd));
            rowStart = rowEnd;
        }
        return rows;
    }

    function buildEntries(pictures) {
        var entries = [];
        for (var i = 0; i < pictures.length; i++) {
            var pic = pictures[i];
            var ar = pic.aspectRatio
                ? parseFloat(pic.aspectRatio)
                : (pic.imageWidth && pic.imageHeight ? pic.imageWidth / pic.imageHeight : 1.3333);
            if (ar <= 0 || isNaN(ar)) ar = 1.3333;
            entries.push({ picture: pic, aspectRatio: ar });
        }
        return entries;
    }

    function renderRows(rows, gridElement, options) {
        options = options || {};
        var gap = typeof options.gap === 'number' ? options.gap : DEFAULT_GAP;
        var targetRowHeight = options.targetRowHeight || TARGET_ROW_HEIGHT;
        var rowsPerPage = options.rowsPerPage || Infinity;
        var onItemClick = options.onItemClick || function () {};
        var availableHeight = options.availableHeight || 0;
        var emptyHtml = options.emptyHtml || '<p class="loading" style="width:100%;text-align:center;">No pictures available right now.</p>';

        gridElement.innerHTML = '';
        if (rows.length === 0) {
            gridElement.innerHTML = emptyHtml;
            return;
        }

        var containerWidth = gridElement.clientWidth || 1200;
        var isMobile = window.innerWidth <= 576;

        var rowHeights = [];
        for (var r = 0; r < rows.length; r++) {
            var sumAR = 0;
            for (var j = 0; j < rows[r].length; j++) sumAR += rows[r][j].aspectRatio;
            var rg = (rows[r].length - 1) * gap;
            var h = (containerWidth - rg) / sumAR;
            var isVeryLastRow = (r === rows.length - 1) && (r + 1 < rowsPerPage || rows.length < rowsPerPage);
            if (isVeryLastRow && h > targetRowHeight * 1.3) h = targetRowHeight;
            rowHeights.push(h);
        }

        if (!isMobile && availableHeight > 0) {
            var totalGaps = Math.max(0, rows.length - 1) * gap;
            var totalContent = totalGaps;
            for (var hi = 0; hi < rowHeights.length; hi++) totalContent += rowHeights[hi];
            if (totalContent > availableHeight) {
                var scale = (availableHeight - totalGaps) / (totalContent - totalGaps);
                for (var hj = 0; hj < rowHeights.length; hj++) rowHeights[hj] *= scale;
            }
        }

        for (var ri = 0; ri < rows.length; ri++) {
            var row = rows[ri];
            var rowDiv = document.createElement('div');
            rowDiv.className = 'gallery-row';
            var rowHeight = rowHeights[ri];

            var rowSumAR = 0;
            for (var k1 = 0; k1 < row.length; k1++) rowSumAR += row[k1].aspectRatio;
            var naturalH = (containerWidth - (row.length - 1) * gap) / rowSumAR;
            var isCapped = (rowHeight < naturalH * 0.95);

            for (var k2 = 0; k2 < row.length; k2++) {
                var entry = row[k2];
                var picture = entry.picture;
                var itemWidth = entry.aspectRatio * rowHeight;

                var itemDiv = document.createElement('div');
                itemDiv.className = 'gallery-item';
                if (!isMobile) {
                    itemDiv.style.width = itemWidth + 'px';
                    itemDiv.style.height = rowHeight + 'px';
                    if (!isCapped) itemDiv.style.flexGrow = entry.aspectRatio;
                    itemDiv.style.flexBasis = itemWidth + 'px';
                }

                if (picture.mediaType === 'video') {
                    var video = document.createElement('video');
                    video.src = '/media/' + encodeURIComponent(picture.fileName);
                    video.alt = picture.alt || '';
                    video.muted = true;
                    video.autoplay = true;
                    video.loop = true;
                    video.playsInline = true;
                    video.preload = 'auto';
                    video.style.cursor = 'pointer';
                    video.addEventListener('click', (function (pic) {
                        return function () { onItemClick(pic); };
                    })(picture));
                    itemDiv.appendChild(video);
                } else {
                    var image = document.createElement('img');
                    image.src = '/media/' + encodeURIComponent(picture.fileName);
                    image.alt = picture.alt || '';
                    image.style.cursor = 'pointer';
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

    window.PapisJustified = {
        TARGET_ROW_HEIGHT: TARGET_ROW_HEIGHT,
        GAP: DEFAULT_GAP,
        buildJustifiedRows: buildJustifiedRows,
        buildEntries: buildEntries,
        renderRows: renderRows
    };
})(window, document);
