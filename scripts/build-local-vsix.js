"use strict";

const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const repoManifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const outputPath = path.resolve(process.argv[2] || path.join(
    repoRoot,
    `gc-excelviewer-${repoManifest.version}-selection-statistics.vsix`
));
const installedRoot = path.join(os.homedir(), ".vscode-server", "extensions");

function findPublishedBase() {
    const candidates = fs.readdirSync(installedRoot)
        .filter(name => /^grapecity\.gc-excelviewer-\d/.test(name))
        .map(name => path.join(installedRoot, name))
        .filter(dir => fs.existsSync(path.join(dir, "dist", "extension.js")))
        .filter(dir => {
            const bundle = fs.readFileSync(path.join(dir, "dist", "extension.js"), "utf8");
            return !bundle.includes("Wijmo-license-key") &&
                !fs.existsSync(path.join(dir, "out", "selection-statistics.js"));
        })
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    if (!candidates.length) {
        throw new Error(
            "No original Marketplace installation was found. Install GrapeCity.gc-excelviewer first."
        );
    }
    return candidates[0];
}

function copyFile(relativePath, stage) {
    const source = path.join(repoRoot, relativePath);
    const target = path.join(stage, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
}

function removeCaseVariants(stage, fileName) {
    const lower = fileName.toLowerCase();
    fs.readdirSync(stage).forEach(name => {
        if (name.toLowerCase() === lower) {
            fs.rmSync(path.join(stage, name), { force: true });
        }
    });
}

const base = findPublishedBase();
const stage = fs.mkdtempSync(path.join(os.tmpdir(), "gc-excelviewer-selection-stats-"));

try {
    fs.cpSync(base, stage, { recursive: true });

    const manifest = JSON.parse(JSON.stringify(repoManifest));
    delete manifest.scripts["vscode:prepublish"];
    fs.writeFileSync(path.join(stage, "package.json"), JSON.stringify(manifest, null, 4) + "\n");

    ["README.md", "CHANGELOG.md", "LICENSE.txt"].forEach(file => removeCaseVariants(stage, file));
    ["README.md", "CHANGELOG.md", "LICENSE.txt", ".vscodeignore", "out/styles/vscode.css"].forEach(file => {
        copyFile(file, stage);
    });
    fs.copyFileSync(
        path.join(repoRoot, "node_modules", "xlsx", "dist", "xlsx.full.min.js"),
        path.join(stage, "out", "xlsx.full.min.js")
    );

    const sheetJs = fs.readFileSync(
        path.join(repoRoot, "node_modules", "xlsx", "dist", "xlsx.full.min.js"),
        "utf8"
    );
    const statistics = fs.readFileSync(path.join(repoRoot, "out", "selection-statistics.js"), "utf8");
    ["out/csv.js", "out/excel.js"].forEach(file => {
        const viewer = fs.readFileSync(path.join(repoRoot, file), "utf8");
        fs.writeFileSync(path.join(stage, file), sheetJs + "\n" + statistics + "\n" + viewer);
    });
    copyFile("out/selection-statistics.js", stage);

    childProcess.execFileSync(
        "npx",
        ["--yes", "@vscode/vsce", "package", "--no-dependencies", "--out", outputPath],
        { cwd: stage, stdio: "inherit" }
    );

    const digest = crypto.createHash("sha256").update(fs.readFileSync(outputPath)).digest("hex");
    process.stdout.write(`Built ${outputPath}\nSHA256 ${digest}\n`);
} finally {
    fs.rmSync(stage, { recursive: true, force: true });
}
