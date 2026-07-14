const path = require("path");
const { generateQuotePdfFromFiles, ROOT_DIR } = require("./quoteCore");

const inputArg = process.argv[2] || "quote-data.json";
const outputArg = process.argv[3] || "output/quote.pdf";

const quoteDataPath = path.resolve(ROOT_DIR, inputArg);
const productsPath = path.resolve(ROOT_DIR, "products.json");
const outputPath = path.resolve(ROOT_DIR, outputArg);

async function main() {
  await generateQuotePdfFromFiles({
    inputPath: quoteDataPath,
    productsPath,
    outputPath
  });

  console.log(`Generated ${path.relative(ROOT_DIR, outputPath)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
