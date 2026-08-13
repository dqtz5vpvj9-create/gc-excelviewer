(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.SelectionStatistics = api;
    }
})(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    function collectionItems(collection) {
        if (!collection) {
            return [];
        }
        if (Array.isArray(collection)) {
            return collection;
        }
        if (Array.isArray(collection.items)) {
            return collection.items;
        }
        var items = [];
        for (var i = 0; i < collection.length; i++) {
            items.push(collection[i]);
        }
        return items;
    }

    function selectedRanges(grid) {
        var ranges = collectionItems(grid.selectionRanges);
        if (!ranges.length) {
            ranges = collectionItems(grid.selectedRanges);
        }
        if (!ranges.length && grid.selection) {
            ranges = [grid.selection];
        }
        return ranges.filter(function (range) {
            return range && range.row != null && range.col != null;
        });
    }

    function selectionContains(grid, row, col) {
        return selectedRanges(grid).some(function (range) {
            if (typeof range.contains === "function") {
                return range.contains(row, col);
            }
            var top = Math.min(range.row, range.row2 == null ? range.row : range.row2);
            var bottom = Math.max(range.row, range.row2 == null ? range.row : range.row2);
            var left = Math.min(range.col, range.col2 == null ? range.col : range.col2);
            var right = Math.max(range.col, range.col2 == null ? range.col : range.col2);
            return row >= top && row <= bottom && col >= left && col <= right;
        });
    }

    function installMultiRangeColumnSelection(grid) {
        if (grid.hostElement.__selectionStatisticsMultiColumn) {
            return;
        }
        grid.hostElement.__selectionStatisticsMultiColumn = true;
        grid.hostElement.addEventListener("mousedown", function (event) {
            if (event.button !== 0) {
                return;
            }
            var hit = grid.hitTest(event);
            if (
                !hit ||
                hit.col < 0 ||
                typeof wijmo === "undefined" ||
                !wijmo.grid ||
                hit.cellType !== wijmo.grid.CellType.ColumnHeader
            ) {
                return;
            }
            if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
                grid.hostElement.__selectionStatisticsColumnAnchor = hit.col;
                return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();

            var clickedColumn = hit.col;
            var lastRow = grid.rows.length - 1;
            if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
                var anchor = grid.hostElement.__selectionStatisticsColumnAnchor;
                if (typeof anchor !== "number") {
                    anchor = grid.selection && grid.selection.col >= 0
                        ? grid.selection.col
                        : clickedColumn;
                }
                grid.selectedRanges = [new wijmo.grid.CellRange(
                    0,
                    Math.min(anchor, clickedColumn),
                    lastRow,
                    Math.max(anchor, clickedColumn)
                )];
                grid.focus();
                return;
            }
            var clickedWasSelected = false;
            var next = [];
            grid.selectedRanges.forEach(function (range) {
                var isWholeColumnRange = range.topRow === 0 && range.bottomRow === lastRow;
                if (!isWholeColumnRange || !range.containsColumn(clickedColumn)) {
                    next.push(range.clone());
                    return;
                }
                clickedWasSelected = true;
                if (range.leftCol < clickedColumn) {
                    next.push(new wijmo.grid.CellRange(
                        0,
                        range.leftCol,
                        lastRow,
                        clickedColumn - 1
                    ));
                }
                if (range.rightCol > clickedColumn) {
                    next.push(new wijmo.grid.CellRange(
                        0,
                        clickedColumn + 1,
                        lastRow,
                        range.rightCol
                    ));
                }
            });
            if (!clickedWasSelected || !next.length) {
                next.push(new wijmo.grid.CellRange(0, clickedColumn, lastRow, clickedColumn));
            }
            grid.selectedRanges = next;
            grid.focus();
        }, true);
    }

    function isNonEmpty(value) {
        return value !== null && value !== undefined && value !== "";
    }

    function calculate(values) {
        var count = 0;
        var numericCount = 0;
        var sum = 0;
        var compensation = 0;
        var min = null;
        var max = null;
        var runningMean = 0;
        var squaredDeviationSum = 0;

        values.forEach(function (value) {
            if (!isNonEmpty(value)) {
                return;
            }
            count++;
            if (typeof value !== "number" || !Number.isFinite(value)) {
                return;
            }

            numericCount++;
            var delta = value - runningMean;
            runningMean += delta / numericCount;
            squaredDeviationSum += delta * (value - runningMean);
            var adjusted = value - compensation;
            var next = sum + adjusted;
            compensation = (next - sum) - adjusted;
            sum = next;
            min = min === null ? value : Math.min(min, value);
            max = max === null ? value : Math.max(max, value);
        });

        if (Object.is(sum, -0)) {
            sum = 0;
        }
        return {
            count: count,
            numericCount: numericCount,
            sum: numericCount ? sum : null,
            average: numericCount ? sum / numericCount : null,
            standardDeviation: numericCount > 1
                ? Math.sqrt(Math.max(0, squaredDeviationSum) / (numericCount - 1))
                : null,
            min: min,
            max: max
        };
    }

    function calculateGridSelection(grid) {
        var values = [];
        var visited = Object.create(null);
        selectedRanges(grid).forEach(function (range) {
            var top = Math.min(range.row, range.row2 == null ? range.row : range.row2);
            var bottom = Math.max(range.row, range.row2 == null ? range.row : range.row2);
            var left = Math.min(range.col, range.col2 == null ? range.col : range.col2);
            var right = Math.max(range.col, range.col2 == null ? range.col : range.col2);

            top = Math.max(0, top);
            left = Math.max(0, left);
            bottom = Math.min(grid.rows.length - 1, bottom);
            right = Math.min(grid.columns.length - 1, right);

            for (var row = top; row <= bottom; row++) {
                for (var col = left; col <= right; col++) {
                    var key = row + ":" + col;
                    if (!visited[key]) {
                        visited[key] = true;
                        values.push(grid.getCellData(row, col, false));
                    }
                }
            }
        });
        return calculate(values);
    }

    function quantile(sortedValues, probability) {
        if (!sortedValues.length) {
            return null;
        }
        if (sortedValues.length === 1) {
            return sortedValues[0];
        }
        var position = (sortedValues.length - 1) * probability;
        var lower = Math.floor(position);
        var fraction = position - lower;
        var upper = Math.min(lower + 1, sortedValues.length - 1);
        return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * fraction;
    }

    function boxPlotSummary(values) {
        var sorted = values.filter(function (value) {
            return typeof value === "number" && Number.isFinite(value);
        }).sort(function (left, right) {
            return left - right;
        });
        if (!sorted.length) {
            return null;
        }
        var q1 = quantile(sorted, 0.25);
        var median = quantile(sorted, 0.5);
        var q3 = quantile(sorted, 0.75);
        var iqr = q3 - q1;
        var lowerFence = q1 - 1.5 * iqr;
        var upperFence = q3 + 1.5 * iqr;
        var inside = sorted.filter(function (value) {
            return value >= lowerFence && value <= upperFence;
        });
        return {
            count: sorted.length,
            min: sorted[0],
            q1: q1,
            median: median,
            q3: q3,
            max: sorted[sorted.length - 1],
            lowerWhisker: inside.length ? inside[0] : sorted[0],
            upperWhisker: inside.length ? inside[inside.length - 1] : sorted[sorted.length - 1],
            outliers: sorted.filter(function (value) {
                return value < lowerFence || value > upperFence;
            })
        };
    }

    function selectionSeries(grid) {
        var byColumn = Object.create(null);
        var visited = Object.create(null);
        selectedRanges(grid).forEach(function (range) {
            var top = Math.max(0, Math.min(range.row, range.row2 == null ? range.row : range.row2));
            var bottom = Math.min(grid.rows.length - 1, Math.max(range.row, range.row2 == null ? range.row : range.row2));
            var left = Math.max(0, Math.min(range.col, range.col2 == null ? range.col : range.col2));
            var right = Math.min(grid.columns.length - 1, Math.max(range.col, range.col2 == null ? range.col : range.col2));
            for (var col = left; col <= right; col++) {
                var series = byColumn[col] || (byColumn[col] = { values: [], label: "" });
                for (var row = top; row <= bottom; row++) {
                    var key = row + ":" + col;
                    if (visited[key]) {
                        continue;
                    }
                    visited[key] = true;
                    var value = grid.getCellData(row, col, false);
                    if (!series.label && typeof value === "string" && value.trim()) {
                        series.label = value.trim();
                    }
                    if (typeof value === "number" && Number.isFinite(value)) {
                        series.values.push(value);
                    }
                }
            }
        });
        return Object.keys(byColumn).map(function (columnIndex) {
            var series = byColumn[columnIndex];
            var column = grid.columns[Number(columnIndex)];
            return {
                label: series.label || (column && column.header) || ("列 " + (Number(columnIndex) + 1)),
                summary: boxPlotSummary(series.values)
            };
        }).filter(function (series) {
            return series.summary;
        });
    }

    var numberFormatter = typeof Intl !== "undefined"
        ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 10 })
        : null;

    function formatNumber(value) {
        if (value === null || value === undefined || !Number.isFinite(value)) {
            return "—";
        }
        return numberFormatter ? numberFormatter.format(value) : String(value);
    }

    function svgElement(name, attributes, textValue) {
        var element = document.createElementNS("http://www.w3.org/2000/svg", name);
        Object.keys(attributes || {}).forEach(function (key) {
            element.setAttribute(key, String(attributes[key]));
        });
        if (textValue !== undefined) {
            element.textContent = textValue;
        }
        return element;
    }

    function closeBoxPlot() {
        var existing = document.querySelector(".selection-boxplot-overlay");
        if (existing) {
            existing.remove();
        }
    }

    function showBoxPlot(grid) {
        var series = selectionSeries(grid);
        if (!series.length) {
            return false;
        }
        closeBoxPlot();

        var overlay = document.createElement("div");
        overlay.className = "selection-boxplot-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-label", "选区箱线图");
        var panel = document.createElement("div");
        panel.className = "selection-boxplot-panel";
        overlay.appendChild(panel);

        var header = document.createElement("div");
        header.className = "selection-boxplot-header";
        var title = document.createElement("h2");
        title.textContent = "选区箱线图";
        var close = document.createElement("button");
        close.type = "button";
        close.textContent = "关闭";
        close.addEventListener("click", closeBoxPlot);
        header.appendChild(title);
        header.appendChild(close);
        panel.appendChild(header);

        var width = Math.max(640, Math.min(1000, 180 + series.length * 130));
        var height = 430;
        var margin = { top: 25, right: 35, bottom: 80, left: 85 };
        var plotHeight = height - margin.top - margin.bottom;
        var plotWidth = width - margin.left - margin.right;
        var allValues = [];
        series.forEach(function (item) {
            var summary = item.summary;
            allValues.push(summary.min, summary.max);
        });
        var valueMin = Math.min.apply(Math, allValues);
        var valueMax = Math.max.apply(Math, allValues);
        if (valueMin === valueMax) {
            var padding = Math.abs(valueMin) * 0.1 || 1;
            valueMin -= padding;
            valueMax += padding;
        } else {
            var rangePadding = (valueMax - valueMin) * 0.08;
            valueMin -= rangePadding;
            valueMax += rangePadding;
        }
        var y = function (value) {
            return margin.top + (valueMax - value) / (valueMax - valueMin) * plotHeight;
        };

        var svg = svgElement("svg", {
            class: "selection-boxplot-svg",
            viewBox: "0 0 " + width + " " + height,
            role: "img",
            "aria-label": "所选数值的箱线图"
        });
        for (var tick = 0; tick <= 5; tick++) {
            var value = valueMin + (valueMax - valueMin) * tick / 5;
            var tickY = y(value);
            svg.appendChild(svgElement("line", {
                class: "boxplot-grid-line",
                x1: margin.left,
                y1: tickY,
                x2: width - margin.right,
                y2: tickY
            }));
            svg.appendChild(svgElement("text", {
                class: "boxplot-axis-label",
                x: margin.left - 10,
                y: tickY + 4,
                "text-anchor": "end"
            }, formatNumber(value)));
        }

        var slotWidth = plotWidth / series.length;
        var boxWidth = Math.min(70, slotWidth * 0.48);
        series.forEach(function (item, index) {
            var summary = item.summary;
            var center = margin.left + slotWidth * (index + 0.5);
            svg.appendChild(svgElement("line", {
                class: "boxplot-whisker",
                x1: center,
                y1: y(summary.lowerWhisker),
                x2: center,
                y2: y(summary.upperWhisker)
            }));
            [summary.lowerWhisker, summary.upperWhisker].forEach(function (whisker) {
                svg.appendChild(svgElement("line", {
                    class: "boxplot-whisker",
                    x1: center - boxWidth * 0.35,
                    y1: y(whisker),
                    x2: center + boxWidth * 0.35,
                    y2: y(whisker)
                }));
            });
            svg.appendChild(svgElement("rect", {
                class: "boxplot-box",
                x: center - boxWidth / 2,
                y: y(summary.q3),
                width: boxWidth,
                height: Math.max(1, y(summary.q1) - y(summary.q3))
            }));
            svg.appendChild(svgElement("line", {
                class: "boxplot-median",
                x1: center - boxWidth / 2,
                y1: y(summary.median),
                x2: center + boxWidth / 2,
                y2: y(summary.median)
            }));
            summary.outliers.forEach(function (outlier, outlierIndex) {
                var jitter = ((outlierIndex % 5) - 2) * 3;
                svg.appendChild(svgElement("circle", {
                    class: "boxplot-outlier",
                    cx: center + jitter,
                    cy: y(outlier),
                    r: 3.5
                }));
            });
            svg.appendChild(svgElement("text", {
                class: "boxplot-series-label",
                x: center,
                y: height - margin.bottom + 28,
                "text-anchor": "middle"
            }, item.label.length > 20 ? item.label.slice(0, 19) + "…" : item.label));
        });
        panel.appendChild(svg);

        var details = document.createElement("div");
        details.className = "selection-boxplot-details";
        series.forEach(function (item) {
            var summary = item.summary;
            var line = document.createElement("div");
            line.textContent = item.label + " — n=" + summary.count +
                ", Q1=" + formatNumber(summary.q1) +
                ", 中位数=" + formatNumber(summary.median) +
                ", Q3=" + formatNumber(summary.q3) +
                ", 须线=" + formatNumber(summary.lowerWhisker) + "–" + formatNumber(summary.upperWhisker) +
                ", 离群点=" + summary.outliers.length;
            details.appendChild(line);
        });
        panel.appendChild(details);
        document.body.appendChild(overlay);

        overlay.addEventListener("mousedown", function (event) {
            if (event.target === overlay) {
                closeBoxPlot();
            }
        });
        var escapeHandler = function (event) {
            if (event.key === "Escape") {
                closeBoxPlot();
                document.removeEventListener("keydown", escapeHandler);
            }
        };
        document.addEventListener("keydown", escapeHandler);
        close.focus();
        return true;
    }

    function fallbackClipboardCopy(text) {
        if (typeof wijmo !== "undefined" && wijmo.Clipboard && wijmo.Clipboard.copy) {
            wijmo.Clipboard.copy(text);
            return true;
        }
        return false;
    }

    function selectionMatrix(grid) {
        var ranges = selectedRanges(grid).slice().sort(function (left, right) {
            return left.leftCol - right.leftCol || left.topRow - right.topRow;
        });
        if (!ranges.length) {
            return [];
        }
        var rows = [];
        var sameRows = ranges.every(function (range) {
            return range.topRow === ranges[0].topRow && range.bottomRow === ranges[0].bottomRow;
        });
        if (sameRows) {
            for (var row = ranges[0].topRow; row <= ranges[0].bottomRow; row++) {
                var values = [];
                ranges.forEach(function (range) {
                    for (var col = range.leftCol; col <= range.rightCol; col++) {
                        values.push(grid.getCellData(row, col, false));
                    }
                });
                rows.push(values);
            }
            return rows;
        }
        ranges.forEach(function (range) {
            for (var row = range.topRow; row <= range.bottomRow; row++) {
                var values = [];
                for (var col = range.leftCol; col <= range.rightCol; col++) {
                    values.push(grid.getCellData(row, col, false));
                }
                rows.push(values);
            }
        });
        return rows;
    }

    function richClipboardPayload(grid) {
        var text = grid.getClipString();
        var html = "";
        if (typeof XLSX !== "undefined" && XLSX.utils && XLSX.write) {
            var sheet = XLSX.utils.aoa_to_sheet(selectionMatrix(grid));
            var workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, sheet, "Selection");
            html = XLSX.write(workbook, { type: "string", bookType: "html" });
        }
        return { text: text, html: html };
    }

    function copySelection(grid) {
        var payload = richClipboardPayload(grid);
        if (
            payload.html &&
            navigator.clipboard &&
            typeof navigator.clipboard.write === "function" &&
            typeof ClipboardItem !== "undefined"
        ) {
            return navigator.clipboard.write([new ClipboardItem({
                "text/plain": new Blob([payload.text], { type: "text/plain" }),
                "text/html": new Blob([payload.html], { type: "text/html" })
            })]).catch(function () {
                fallbackClipboardCopy(payload.text);
            });
        }
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            return navigator.clipboard.writeText(payload.text).catch(function () {
                fallbackClipboardCopy(payload.text);
            });
        }
        fallbackClipboardCopy(payload.text);
        return Promise.resolve();
    }

    function clearSelection(grid) {
        if (grid.isReadOnly) {
            return;
        }
        var visited = Object.create(null);
        var clear = function () {
            selectedRanges(grid).forEach(function (range) {
                for (var row = Math.max(0, range.topRow); row <= Math.min(grid.rows.length - 1, range.bottomRow); row++) {
                    for (var col = Math.max(0, range.leftCol); col <= Math.min(grid.columns.length - 1, range.rightCol); col++) {
                        var key = row + ":" + col;
                        if (!visited[key]) {
                            visited[key] = true;
                            grid.setCellData(row, col, null);
                        }
                    }
                }
            });
        };
        if (typeof grid.deferUpdate === "function") {
            grid.deferUpdate(clear);
        } else {
            clear();
        }
    }

    function cutSelection(grid) {
        if (grid.isReadOnly) {
            return Promise.resolve();
        }
        return copySelection(grid).then(function () {
            clearSelection(grid);
        });
    }

    function pasteSelection(grid) {
        if (grid.isReadOnly) {
            return Promise.resolve();
        }
        if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
            return navigator.clipboard.readText().then(function (text) {
                grid.setClipString(text);
            }).catch(function () {
                if (typeof wijmo !== "undefined" && wijmo.Clipboard && wijmo.Clipboard.paste) {
                    wijmo.Clipboard.paste(function (text) {
                        grid.setClipString(text);
                    });
                }
            });
        }
        if (typeof wijmo !== "undefined" && wijmo.Clipboard && wijmo.Clipboard.paste) {
            wijmo.Clipboard.paste(function (text) {
                grid.setClipString(text);
            });
        }
        return Promise.resolve();
    }

    function nativeMenuItem(label, action, disabled) {
        var item = document.createElement("div");
        item.className = "wj-context-menu-item" + (disabled ? " wj-state-disabled" : "");
        item.textContent = label;
        if (!disabled) {
            item.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                action();
            });
        }
        return item;
    }

    function installContextMenu(grid) {
        if (grid.hostElement.__selectionStatisticsContextMenu) {
            return;
        }
        grid.hostElement.__selectionStatisticsContextMenu = true;
        var isFlexSheet = grid.hostElement.classList.contains("wj-flexsheet");

        function installFlexSheetItem() {
            var menus = Array.prototype.slice.call(
                document.querySelectorAll(".wj-flexsheet-context-menu")
            );
            var menu = menus.find(function (candidate) {
                return candidate.querySelector("[wj-part='insert-rows']");
            });
            if (!menu || menu.querySelector("[data-selection-boxplot]")) {
                return;
            }
            var clipboardSeparator = document.createElement("div");
            clipboardSeparator.className = "wj-state-disabled selection-boxplot-menu-separator";
            clipboardSeparator.style.width = "100%";
            clipboardSeparator.style.height = "1px";
            menu.appendChild(clipboardSeparator);
            menu.appendChild(nativeMenuItem("剪切", function () {
                cutSelection(grid);
            }, grid.isReadOnly));
            menu.appendChild(nativeMenuItem("复制", function () {
                copySelection(grid);
            }, false));
            menu.appendChild(nativeMenuItem("粘贴", function () {
                pasteSelection(grid);
            }, grid.isReadOnly));
            var separator = document.createElement("div");
            separator.className = "wj-state-disabled selection-boxplot-menu-separator";
            separator.style.width = "100%";
            separator.style.height = "1px";
            var item = document.createElement("div");
            item.className = "wj-context-menu-item";
            item.setAttribute("data-selection-boxplot", "true");
            item.textContent = "箱线图";
            item.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                showBoxPlot(grid);
            });
            menu.appendChild(separator);
            menu.appendChild(item);
        }

        if (isFlexSheet) {
            installFlexSheetItem();
            grid.hostElement.addEventListener("contextmenu", function () {
                setTimeout(installFlexSheetItem, 0);
            });
            return;
        }

        var closeMenu = function () {
            var menu = document.querySelector(".selection-statistics-context-menu");
            if (menu) {
                menu.remove();
            }
        };
        grid.hostElement.addEventListener("contextmenu", function (event) {
            var hit = grid.hitTest(event);
            if (!hit || hit.col < 0) {
                return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            closeMenu();

            if (hit.row >= 0 && !selectionContains(grid, hit.row, hit.col)) {
                grid.select(hit.row, hit.col);
            }
            var menu = document.createElement("div");
            menu.className = "selection-statistics-context-menu";
            menu.setAttribute("role", "menu");
            [
                { label: "剪切", action: function () { cutSelection(grid); }, disabled: grid.isReadOnly },
                { label: "复制", action: function () { copySelection(grid); }, disabled: false },
                { label: "粘贴", action: function () { pasteSelection(grid); }, disabled: grid.isReadOnly }
            ].forEach(function (command) {
                var commandButton = document.createElement("button");
                commandButton.type = "button";
                commandButton.textContent = command.label;
                commandButton.setAttribute("role", "menuitem");
                commandButton.disabled = command.disabled;
                commandButton.addEventListener("click", function () {
                    closeMenu();
                    command.action();
                });
                menu.appendChild(commandButton);
            });
            var separator = document.createElement("div");
            separator.className = "selection-statistics-context-menu-separator";
            menu.appendChild(separator);
            var button = document.createElement("button");
            button.type = "button";
            button.textContent = "箱线图";
            button.setAttribute("role", "menuitem");
            button.disabled = selectionSeries(grid).length === 0;
            button.addEventListener("click", function () {
                closeMenu();
                showBoxPlot(grid);
            });
            menu.appendChild(button);
            document.body.appendChild(menu);
            var left = Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 8);
            var top = Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 8);
            menu.style.left = Math.max(4, left) + "px";
            menu.style.top = Math.max(4, top) + "px";
            button.focus();
        }, true);
        document.addEventListener("mousedown", function (event) {
            if (!event.target.closest || !event.target.closest(".selection-statistics-context-menu")) {
                closeMenu();
            }
        });
    }

    function render(stats, element) {
        if (!element) {
            return;
        }
        var fields = {
            average: formatNumber(stats.average),
            count: String(stats.count),
            numericCount: String(stats.numericCount),
            standardDeviation: formatNumber(stats.standardDeviation),
            min: formatNumber(stats.min),
            max: formatNumber(stats.max),
            sum: formatNumber(stats.sum)
        };
        Object.keys(fields).forEach(function (name) {
            var target = element.querySelector('[data-stat-value="' + name + '"]');
            if (target) {
                target.textContent = fields[name];
            }
        });
        element.classList.toggle("has-numeric-selection", stats.numericCount > 0);
    }

    function ensureStatusBar(elementId) {
        var existing = document.getElementById(elementId);
        if (existing) {
            return existing;
        }

        var statusBar = document.getElementById("viewerStatusBar");
        if (!statusBar) {
            statusBar = document.createElement("div");
            statusBar.id = "viewerStatusBar";
            statusBar.className = "viewer-statusbar";

            var about = document.getElementById("aboutWjmo");
            if (about) {
                about.removeAttribute("style");
                about.parentNode.insertBefore(statusBar, about);
                statusBar.appendChild(about);
            } else {
                document.body.appendChild(statusBar);
            }
        }

        var statistics = document.createElement("div");
        statistics.id = elementId;
        statistics.className = "selection-statistics";
        statistics.setAttribute("role", "status");
        statistics.setAttribute("aria-live", "polite");
        statistics.title = "计数包含所有非空单元格；其他指标只统计数值单元格";
        statistics.innerHTML =
            '<span class="numeric-stat">平均值: <span class="stat-value" data-stat-value="average">—</span></span>' +
            '<span>计数: <span class="stat-value" data-stat-value="count">0</span></span>' +
            '<span class="numeric-stat">数值计数: <span class="stat-value" data-stat-value="numericCount">0</span></span>' +
            '<span class="numeric-stat">标准差: <span class="stat-value" data-stat-value="standardDeviation">—</span></span>' +
            '<span class="numeric-stat">最小值: <span class="stat-value" data-stat-value="min">—</span></span>' +
            '<span class="numeric-stat">最大值: <span class="stat-value" data-stat-value="max">—</span></span>' +
            '<span class="numeric-stat">求和: <span class="stat-value" data-stat-value="sum">—</span></span>';
        statusBar.appendChild(statistics);
        return statistics;
    }

    function bind(grid, elementId) {
        if (
            typeof wijmo !== "undefined" &&
            wijmo.grid &&
            wijmo.grid.SelectionMode &&
            wijmo.grid.SelectionMode.MultiRange !== undefined
        ) {
            grid.selectionMode = wijmo.grid.SelectionMode.MultiRange;
        }
        installMultiRangeColumnSelection(grid);
        ensureStatusBar(elementId);
        installContextMenu(grid);
        var frame = null;
        var update = function () {
            if (frame !== null && typeof cancelAnimationFrame === "function") {
                cancelAnimationFrame(frame);
            }
            var run = function () {
                frame = null;
                render(calculateGridSelection(grid), document.getElementById(elementId));
            };
            frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(run) : null;
            if (frame === null) {
                run();
            }
        };
        var events = [
            grid.selectionChanged,
            grid.itemsSourceChanged,
            grid.cellEditEnded,
            grid.selectedSheetChanged
        ];
        events.forEach(function (event) {
            if (event && typeof event.addHandler === "function") {
                event.addHandler(update);
            }
        });
        [grid.selectionRanges, grid.selectedRanges].forEach(function (ranges) {
            if (ranges && ranges.collectionChanged && typeof ranges.collectionChanged.addHandler === "function") {
                ranges.collectionChanged.addHandler(update);
            }
        });
        update();
        return update;
    }

    return {
        calculate: calculate,
        calculateGridSelection: calculateGridSelection,
        selectionContains: selectionContains,
        selectionMatrix: selectionMatrix,
        richClipboardPayload: richClipboardPayload,
        copySelection: copySelection,
        cutSelection: cutSelection,
        pasteSelection: pasteSelection,
        boxPlotSummary: boxPlotSummary,
        selectionSeries: selectionSeries,
        showBoxPlot: showBoxPlot,
        formatNumber: formatNumber,
        ensureStatusBar: ensureStatusBar,
        bind: bind
    };
});
