'use strict';
import { window, workspace, WebviewPanel, ExtensionContext, ViewColumn } from 'vscode';
import { URI } from 'vscode-uri';
import BaseDocumentView from './baseDocumentView';
import { ExcelDocument } from './excelEditor';
import { getLicenseKey } from './license';

export default class ExcelDocumentView extends BaseDocumentView {

    static create(context: ExtensionContext, uri: URI, viewColumn: ViewColumn): ExcelDocumentView {
        let preview = new ExcelDocumentView(context, uri);
        preview.scheme = "excel-preview";
        preview.initWebviewPanel(viewColumn);
        preview.initialize();
        return preview;
    }

    static revive(context: ExtensionContext, uri: URI, webviewPanel: WebviewPanel): ExcelDocumentView {
        let preview = new ExcelDocumentView(context, uri);
        preview.scheme = "excel-preview";
        preview.attachWebviewPanel(webviewPanel);
        preview.initialize();
        return preview;
    }

    public getOptions(): any {    
        let viewerConfig = workspace.getConfiguration('excel-viewer');

        return {
            customEditor: this.hasCustomEditor,
            uri: this.uri.toString(),
            previewUri: this.previewUri.toString(),
            state: this.state,
            showInfo: <boolean>viewerConfig.get("showInfo")
        };
    }

    private _document: ExcelDocument;

    public enableEditing(document: ExcelDocument) {
        this._document = document;
        this.webview.onDidReceiveMessage((e) => {
            if (e.changed) {
                this._document.change(e.reason);
            }
        }, this, this._disposables);
    }

    refresh(): void {
        let self = this;
        workspace.fs.readFile(this.uri).then(buffer => {
            self.webview.postMessage({
                refresh: true,
                content: buffer
            })
        }, reason => {
            window.showInformationMessage(reason);
        });
    }

    undo(): void {
        this.webview.postMessage({
            undo: true
        });
    }

    redo(): void {
        this.webview.postMessage({
            redo: true
        });
    }
    
	getHtml(ignoreState: boolean = false): string {
		return `
        <!DOCTYPE html>
        <html>
        <head>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.webview.cspSource} 'unsafe-inline'; script-src ${this.webview.cspSource} 'unsafe-inline';">
            <link href="${this.scriptUri}/styles/wijmo.min.css" rel="stylesheet" type="text/css" />
            <link href="${this.scriptUri}/styles/vscode.css" rel="stylesheet" type="text/css" />
        </head>
        <script src="${this.scriptUri}/controls/wijmo.min.js" type="text/javascript"></script>
        <script src="${this.scriptUri}/controls/wijmo.input.min.js" type="text/javascript"></script>
        <script src="${this.scriptUri}/controls/wijmo.grid.min.js" type="text/javascript"></script>
        <script src="${this.scriptUri}/controls/wijmo.grid.filter.min.js" type="text/javascript"></script>
        <script src="${this.scriptUri}/controls/wijmo.grid.sheet.min.js" type="text/javascript"></script>
        <script src="${this.scriptUri}/controls/wijmo.grid.xlsx.min.js" type="text/javascript"></script>
        <script src="${this.scriptUri}/controls/wijmo.xlsx.min.js" type="text/javascript"></script>
        <script src="${this.scriptUri}/jszip.min.js"></script>
        <script src="${this.scriptUri}/xlsx.full.min.js"></script>
        <script src="${this.scriptUri}/selection-statistics.js"></script>
        <script src="${this.scriptUri}/excel.js"></script>
        <body style="padding:0px; overflow:hidden" onload="resizeSheet()" onresize="resizeSheet()">
            <div id="sheet"></div>
            <div id="viewerStatusBar" class="viewer-statusbar">
                <div id="aboutWjmo">powered by: <a href="https://developer.mescius.com/wijmo/flexgrid-javascript-data-grid?utm_source=VSCode&utm_medium=Wijmo-Extension" target="_blank">Wijmo FlexGrid</a></div>
                <div id="selectionStatistics" class="selection-statistics" role="status" aria-live="polite" title="计数包含所有非空单元格；其他指标只统计数值单元格">
                    <span class="numeric-stat">平均值: <span class="stat-value" data-stat-value="average">—</span></span>
                    <span>计数: <span class="stat-value" data-stat-value="count">0</span></span>
                    <span class="numeric-stat">数值计数: <span class="stat-value" data-stat-value="numericCount">0</span></span>
                    <span class="numeric-stat">标准差: <span class="stat-value" data-stat-value="standardDeviation">—</span></span>
                    <span class="numeric-stat">最小值: <span class="stat-value" data-stat-value="min">—</span></span>
                    <span class="numeric-stat">最大值: <span class="stat-value" data-stat-value="max">—</span></span>
                    <span class="numeric-stat">求和: <span class="stat-value" data-stat-value="sum">—</span></span>
                </div>
            </div>
        </body>
        <script type="text/javascript">
            wijmo.setLicenseKey("${getLicenseKey()}");
            function ignoreState() {
                return ${ignoreState};
            }
            function getOptions() {
                return ${JSON.stringify(this.getOptions())};
            }
            handleEvents();
            initPage();
        </script>
        </html>`;
	}

    get viewType(): string {
        return "gc-excelviewer-excel-preview";
    }

    get configurable(): boolean {
        return false;
    }
}
