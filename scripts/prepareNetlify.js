const fs = require("fs/promises");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");

async function main() {
  await fs.rm(path.resolve(ROOT_DIR, "public/assets"), { recursive: true, force: true });
  await fs.cp(path.resolve(ROOT_DIR, "assets"), path.resolve(ROOT_DIR, "public/assets"), {
    recursive: true
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
