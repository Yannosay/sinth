import * as fs from "fs";
import * as path from "path";
import { runTests } from "@vscode/test-electron";

function localVSCode(): string | undefined {
  const candidates = process.platform === "win32"
    ? [path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Microsoft VS Code", "Code.exe")]
    : process.platform === "darwin"
      ? ["/Applications/Visual Studio Code.app/Contents/MacOS/Electron"]
      : ["/usr/share/code/code"];
  return candidates.find(c => fs.existsSync(c));
}

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, "..", "..");
  const extensionTestsPath = path.resolve(__dirname, "suite", "index");
  const workspace = path.resolve(extensionDevelopmentPath, "test-fixture");
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    vscodeExecutablePath: process.env.VSCODE_PATH ?? localVSCode(),
    launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust"],
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
