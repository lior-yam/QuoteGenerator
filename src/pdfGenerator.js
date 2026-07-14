const fs = require("fs/promises");
const path = require("path");

async function launchBrowser() {
  const puppeteer = require("puppeteer");

  return puppeteer.launch({
    headless: "new",
    executablePath: puppeteer.executablePath(),
    timeout: 60000,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage"
    ]
  });
}

async function generatePdfBuffer(html) {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.emulateMediaType("screen");

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

async function generatePdfFile(html, outputPath) {
  const pdf = await generatePdfBuffer(html);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, pdf);

  return pdf;
}

module.exports = {
  generatePdfBuffer,
  generatePdfFile
};
