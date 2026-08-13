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

        values.forEach(function (value) {
            if (!isNonEmpty(value)) {
                return;
            }
            count++;
            if (typeof value !== "number" || !Number.isFinite(value)) {
                return;
            }

            numericCount++;
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

    var numberFormatter = typeof Intl !== "undefined"
        ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 10 })
        : null;

    function formatNumber(value) {
        if (value === null || value === undefined || !Number.isFinite(value)) {
            return "—";
        }
        return numberFormatter ? numberFormatter.format(value) : String(value);
    }

    function render(stats, element) {
        if (!element) {
            return;
        }
        var fields = {
            average: formatNumber(stats.average),
            count: String(stats.count),
            numericCount: String(stats.numericCount),
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
            '<span class="numeric-stat">最小值: <span class="stat-value" data-stat-value="min">—</span></span>' +
            '<span class="numeric-stat">最大值: <span class="stat-value" data-stat-value="max">—</span></span>' +
            '<span class="numeric-stat">求和: <span class="stat-value" data-stat-value="sum">—</span></span>';
        statusBar.appendChild(statistics);
        return statistics;
    }

    function bind(grid, elementId) {
        ensureStatusBar(elementId);
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
        formatNumber: formatNumber,
        ensureStatusBar: ensureStatusBar,
        bind: bind
    };
});
