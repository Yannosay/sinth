const fs = require("fs");
const path = require("path");

const srcRoot = path.join(__dirname, "..", "src", "builtins");
const destRoot = path.join(__dirname, "..", "dist", "builtins");

function copyStaticAssets(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyStaticAssets(srcPath, destPath);
    } else if (entry.isFile() && !entry.name.endsWith(".ts")) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyStaticAssets(srcRoot, destRoot);