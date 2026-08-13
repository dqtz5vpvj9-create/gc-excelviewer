const fs = require("fs");
const path = require("path");

const source = require.resolve("xlsx/dist/xlsx.full.min.js");
const destination = path.resolve(__dirname, "..", "out", "xlsx.full.min.js");

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
