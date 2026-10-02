import * as fs from "fs";
import * as path from "path";

export const SinthUIManifest = {
  css: fs.readFileSync(path.join(__dirname, "SinthUI.css"), "utf-8"),
};