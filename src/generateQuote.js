const path = require("path");
const { createQuoteHtml, readJson, ROOT_DIR } = require("./quoteCore");
const { generatePdfFile } = require("./pdfGenerator");

const inputArg = process.argv[2] || "quote-data.json";
const outputArg = process.argv[3] || "output/quote.pdf";

const quoteDataPath = path.resolve(ROOT_DIR, inputArg);
const productsPath = path.resolve(ROOT_DIR, "products.json");
const outputPath = path.resolve(ROOT_DIR, outputArg);

async function main() {
  const [quoteData, products] = await Promise.all([
    readJson(quoteDataPath),
    readJson(productsPath)
  ]);
  const { html } = await createQuoteHtml({ quoteData, products });

  await generatePdfFile(html, outputPath);

  console.log(`Generated ${path.relative(ROOT_DIR, outputPath)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
