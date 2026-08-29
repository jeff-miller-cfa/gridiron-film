const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "../node_modules/@ffmpeg/core/dist/umd");
const destDir = path.join(__dirname, "../public/ffmpeg");

const files = ["ffmpeg-core.js", "ffmpeg-core.wasm"];

if (!fs.existsSync(srcDir)) {
  console.warn("copy-ffmpeg-core: @ffmpeg/core not installed, skipping");
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
}

console.log(`copy-ffmpeg-core: copied ${files.length} files to public/ffmpeg`);
