const crypto = require("crypto");
const fs = require("fs/promises");
const http = require("http");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.resolve(ROOT_DIR, "public");
const PRODUCTS_PATH = path.resolve(ROOT_DIR, "products.json");
const COMPONENTS_PATH = path.resolve(ROOT_DIR, "components.json");
const SAVED_QUOTES_PATH = path.resolve(ROOT_DIR, "saved-quotes.json");
const QUOTE_DATA_PATH = path.resolve(ROOT_DIR, "quote-data.json");
const PRODUCT_IMAGES_DIR = path.resolve(ROOT_DIR, "assets/products");
const SAVED_QUOTE_OUTPUT_DIR = path.resolve(ROOT_DIR, "output/quotes");
const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(text);
}

function isInside(parentDir, filePath) {
  const relativePath = path.relative(parentDir, filePath);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

async function readRequestBody(request) {
  const chunks = [];
  let totalSize = 0;
  const maxSize = 30 * 1024 * 1024;

  for await (const chunk of request) {
    totalSize += chunk.length;

    if (totalSize > maxSize) {
      throw new Error("Image is too large. Please upload an image up to 30MB.");
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function readProducts() {
  const content = await fs.readFile(PRODUCTS_PATH, "utf8");
  return JSON.parse(content);
}

async function writeProducts(products) {
  await fs.writeFile(PRODUCTS_PATH, `${JSON.stringify(products, null, 2)}\n`, "utf8");
}

async function readComponents() {
  const content = await fs.readFile(COMPONENTS_PATH, "utf8");
  return JSON.parse(content);
}

async function writeComponents(components) {
  await fs.writeFile(COMPONENTS_PATH, `${JSON.stringify(components, null, 2)}\n`, "utf8");
}

async function readSavedQuotes() {
  try {
    const content = await fs.readFile(SAVED_QUOTES_PATH, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeSavedQuotes(quotes) {
  await fs.writeFile(SAVED_QUOTES_PATH, `${JSON.stringify(quotes, null, 2)}\n`, "utf8");
}

async function runGenerator() {
  const { execFile } = require("child_process");
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm.cmd run generate"] : ["run", "generate"];

  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd: ROOT_DIR,
      timeout: 120000
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
        return;
      }

      resolve();
    });
  });
}

function parseImageDataUri(imageData) {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp|svg\+xml));base64,([A-Za-z0-9+/=]+)$/.exec(imageData || "");

  if (!match) {
    throw new Error("Please upload a PNG, JPG, WEBP or SVG image.");
  }

  const mimeType = match[1];
  const extensionByMimeType = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg"
  };

  return {
    buffer: Buffer.from(match[2], "base64"),
    extension: extensionByMimeType[mimeType]
  };
}

function normalizePackageContents(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-•]\s+|\*\s+)/, "").trim())
    .filter(Boolean);
}

function validatePackageInput(data) {
  const productName = String(data.productName || "").trim();
  const contents = normalizePackageContents(data.shortDescription);
  const category = String(data.category || "מארזים").trim() || "מארזים";
  const unitPrice = Number(data.unitPrice);

  if (!productName) {
    throw new Error("Package name is required.");
  }

  if (!contents.length) {
    throw new Error("Package contents are required.");
  }

  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw new Error("Price must be a positive number.");
  }

  return {
    productName,
    shortDescription: contents.join("\n"),
    category,
    unitPrice: Math.round(unitPrice * 100) / 100
  };
}

function validateComponentInput(data) {
  const componentName = String(data.componentName || "").trim();
  const defaultText = String(data.defaultText || componentName).trim();
  const category = String(data.category || "כללי").trim() || "כללי";

  if (!componentName) {
    throw new Error("Component name is required.");
  }

  return {
    componentName,
    defaultText,
    category
  };
}

async function removeProductImage(imagePath) {
  if (!imagePath || !imagePath.startsWith("assets/products/")) {
    return;
  }

  const absolutePath = path.resolve(ROOT_DIR, imagePath);

  if (!isInside(PRODUCT_IMAGES_DIR, absolutePath)) {
    return;
  }

  await fs.unlink(absolutePath).catch(() => {});
}

function normalizeNotes(notes) {
  if (Array.isArray(notes)) {
    return notes.map((note) => String(note).trim()).filter(Boolean);
  }

  return String(notes || "")
    .split(/\r?\n/)
    .map((note) => note.trim())
    .filter(Boolean);
}

function validateQuoteInput(data) {
  const recipientCompany = String(data.recipientCompany || "").trim();
  const contactPerson = String(data.contactPerson || "").trim();
  const customerPhone = String(data.customerPhone || "").trim();
  const customerEmail = String(data.customerEmail || "").trim();
  const quoteDate = String(data.quoteDate || "").trim();
  const selectedProducts = Array.isArray(data.selectedProducts) ? data.selectedProducts : [];

  if (!recipientCompany) {
    throw new Error("Client/company name is required.");
  }

  if (!quoteDate) {
    throw new Error("Quote date is required.");
  }

  if (!selectedProducts.length) {
    throw new Error("Please add at least one package to the quote.");
  }

  return {
    quoteNumber: String(data.quoteNumber || `AS-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`).trim(),
    recipientCompany,
    contactPerson,
    customerPhone,
    customerEmail,
    quoteDate,
    showTotals: data.showTotals !== false,
    notes: normalizeNotes(data.notes),
    selectedProducts: selectedProducts.map((item) => ({
      id: String(item.id || "").trim(),
      quantity: Number(item.quantity)
    })),
    contactDetails: {
      name: "אסופה - עיצוב ישראלי",
      address: "נחמן 2, תל אביב",
      phone: "0526622671",
      email: "nitzan@asufadesign.com",
      website: "asufadesign.co.il"
    }
  };
}

function savedQuoteRecord(id, quoteData, existingQuote, pdfUrl) {
  const now = new Date().toISOString();

  return {
    id,
    createdAt: existingQuote?.createdAt || now,
    updatedAt: now,
    quoteNumber: quoteData.quoteNumber,
    recipientCompany: quoteData.recipientCompany,
    contactPerson: quoteData.contactPerson,
    customerPhone: quoteData.customerPhone,
    customerEmail: quoteData.customerEmail,
    quoteDate: quoteData.quoteDate,
    showTotals: quoteData.showTotals,
    notes: quoteData.notes,
    selectedProducts: quoteData.selectedProducts,
    pdfUrl
  };
}

async function upsertSavedQuote(quoteId, quoteData, pdfUrl) {
  const savedQuotes = await readSavedQuotes();
  const existingQuote = savedQuotes.find((quote) => quote.id === quoteId);
  const nextRecord = savedQuoteRecord(quoteId, quoteData, existingQuote, pdfUrl);
  const nextQuotes = existingQuote
    ? savedQuotes.map((quote) => (quote.id === quoteId ? nextRecord : quote))
    : [nextRecord, ...savedQuotes];

  await writeSavedQuotes(nextQuotes);

  return nextRecord;
}

async function savePackage(request, response) {
  const body = await readRequestBody(request);
  const data = JSON.parse(body);
  const packageData = validatePackageInput(data);
  const image = parseImageDataUri(data.imageData);
  const id = `package-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const imagePath = `assets/products/${id}.${image.extension}`;

  await fs.mkdir(PRODUCT_IMAGES_DIR, { recursive: true });
  await fs.writeFile(path.resolve(ROOT_DIR, imagePath), image.buffer);

  const products = await readProducts();
  const newPackage = {
    id,
    ...packageData,
    imagePath
  };

  products.push(newPackage);
  await writeProducts(products);

  sendJson(response, 201, newPackage);
}

async function updatePackage(request, response, productId) {
  const body = await readRequestBody(request);
  const data = JSON.parse(body);
  const packageData = validatePackageInput(data);
  const products = await readProducts();
  const productIndex = products.findIndex((product) => product.id === productId);

  if (productIndex === -1) {
    throw new Error("Package was not found.");
  }

  const previousProduct = products[productIndex];
  let imagePath = previousProduct.imagePath;

  if (data.imageData) {
    const image = parseImageDataUri(data.imageData);
    imagePath = `assets/products/${productId}.${image.extension}`;

    await fs.mkdir(PRODUCT_IMAGES_DIR, { recursive: true });
    await fs.writeFile(path.resolve(ROOT_DIR, imagePath), image.buffer);

    if (previousProduct.imagePath !== imagePath) {
      await removeProductImage(previousProduct.imagePath);
    }
  }

  const updatedPackage = {
    id: productId,
    ...packageData,
    imagePath
  };

  products[productIndex] = updatedPackage;
  await writeProducts(products);

  sendJson(response, 200, updatedPackage);
}

async function deletePackage(response, productId) {
  const products = await readProducts();
  const product = products.find((candidate) => candidate.id === productId);

  if (!product) {
    throw new Error("Package was not found.");
  }

  await writeProducts(products.filter((candidate) => candidate.id !== productId));
  await removeProductImage(product.imagePath);

  sendJson(response, 200, { message: "Package deleted." });
}

async function reorderPackages(request, response) {
  const body = await readRequestBody(request);
  const data = JSON.parse(body);
  const orderedIds = Array.isArray(data.orderedIds) ? data.orderedIds.map((id) => String(id).trim()) : [];

  if (!orderedIds.length) {
    throw new Error("Package order is required.");
  }

  const products = await readProducts();
  const productsById = new Map(products.map((product) => [product.id, product]));
  const seenIds = new Set();
  const reorderedProducts = [];

  for (const id of orderedIds) {
    if (!productsById.has(id)) {
      throw new Error(`Unknown package: ${id}`);
    }

    if (!seenIds.has(id)) {
      reorderedProducts.push(productsById.get(id));
      seenIds.add(id);
    }
  }

  // Keep any packages that were added by another tab while this page was open.
  for (const product of products) {
    if (!seenIds.has(product.id)) {
      reorderedProducts.push(product);
    }
  }

  await writeProducts(reorderedProducts);
  sendJson(response, 200, reorderedProducts);
}

async function saveComponent(request, response) {
  const body = await readRequestBody(request);
  const data = JSON.parse(body);
  const componentData = validateComponentInput(data);
  const components = await readComponents();
  const newComponent = {
    id: `component-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    ...componentData
  };

  components.push(newComponent);
  await writeComponents(components);

  sendJson(response, 201, newComponent);
}

async function updateComponent(request, response, componentId) {
  const body = await readRequestBody(request);
  const data = JSON.parse(body);
  const componentData = validateComponentInput(data);
  const components = await readComponents();
  const componentIndex = components.findIndex((component) => component.id === componentId);

  if (componentIndex === -1) {
    throw new Error("Component was not found.");
  }

  const updatedComponent = {
    id: componentId,
    ...componentData
  };

  components[componentIndex] = updatedComponent;
  await writeComponents(components);

  sendJson(response, 200, updatedComponent);
}

async function deleteComponent(response, componentId) {
  const components = await readComponents();
  const component = components.find((candidate) => candidate.id === componentId);

  if (!component) {
    throw new Error("Component was not found.");
  }

  await writeComponents(components.filter((candidate) => candidate.id !== componentId));

  sendJson(response, 200, { message: "Component deleted." });
}

async function saveQuote(request, response) {
  const body = await readRequestBody(request);
  const data = JSON.parse(body);
  const savedQuoteId = String(data.savedQuoteId || "").trim();
  const savedQuotes = await readSavedQuotes();
  const existingQuote = savedQuoteId ? savedQuotes.find((quote) => quote.id === savedQuoteId) : null;

  if (savedQuoteId && !existingQuote) {
    throw new Error("Saved quote was not found.");
  }

  if (existingQuote && !data.quoteNumber) {
    data.quoteNumber = existingQuote.quoteNumber;
  }

  const quoteData = validateQuoteInput(data);
  const products = await readProducts();
  const productIds = new Set(products.map((product) => product.id));

  for (const item of quoteData.selectedProducts) {
    if (!productIds.has(item.id)) {
      throw new Error(`Unknown package: ${item.id}`);
    }

    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new Error("Quantity must be a positive number.");
    }
  }

  await fs.writeFile(QUOTE_DATA_PATH, `${JSON.stringify(quoteData, null, 2)}\n`, "utf8");
  await runGenerator();

  const quoteId = savedQuoteId || `quote-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const savedPdfPath = path.resolve(SAVED_QUOTE_OUTPUT_DIR, `${quoteId}.pdf`);
  const savedPdfUrl = `/output/quotes/${quoteId}.pdf`;

  await fs.mkdir(SAVED_QUOTE_OUTPUT_DIR, { recursive: true });
  await fs.copyFile(path.resolve(ROOT_DIR, "output/quote.pdf"), savedPdfPath);

  const savedQuote = await upsertSavedQuote(quoteId, quoteData, savedPdfUrl);

  sendJson(response, 201, {
    message: "Quote generated.",
    pdfUrl: savedPdfUrl,
    quoteRecordId: savedQuote.id,
    quoteNumber: savedQuote.quoteNumber
  });
}

async function serveStaticFile(request, response) {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);
  let filePath;

  if (pathname === "/" || pathname === "/products") {
    filePath = path.resolve(PUBLIC_DIR, "products.html");
  } else if (pathname === "/components") {
    filePath = path.resolve(PUBLIC_DIR, "components.html");
  } else if (pathname === "/quotes") {
    filePath = path.resolve(PUBLIC_DIR, "saved-quotes.html");
  } else if (pathname === "/quote") {
    filePath = path.resolve(PUBLIC_DIR, "quote-builder.html");
  } else if (pathname.startsWith("/assets/")) {
    filePath = path.resolve(ROOT_DIR, `.${pathname}`);

    if (!isInside(ROOT_DIR, filePath)) {
      return sendText(response, 403, "Forbidden");
    }
  } else if (pathname.startsWith("/output/")) {
    filePath = path.resolve(ROOT_DIR, `.${pathname}`);

    if (!isInside(path.resolve(ROOT_DIR, "output"), filePath)) {
      return sendText(response, 403, "Forbidden");
    }
  } else {
    filePath = path.resolve(PUBLIC_DIR, `.${pathname}`);

    if (!isInside(PUBLIC_DIR, filePath)) {
      return sendText(response, 403, "Forbidden");
    }
  }

  try {
    const content = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return sendText(response, 404, "Not found");
    }

    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://localhost:${PORT}`);
    const productMatch = /^\/api\/products\/([^/]+)$/.exec(url.pathname);
    const componentMatch = /^\/api\/components\/([^/]+)$/.exec(url.pathname);
    const savedQuoteMatch = /^\/api\/saved-quotes\/([^/]+)$/.exec(url.pathname);

    if (request.method === "GET" && url.pathname === "/api/products") {
      return sendJson(response, 200, await readProducts());
    }

    if (request.method === "POST" && url.pathname === "/api/products/reorder") {
      await reorderPackages(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/products") {
      await savePackage(request, response);
      return;
    }

    if (request.method === "PUT" && productMatch) {
      await updatePackage(request, response, decodeURIComponent(productMatch[1]));
      return;
    }

    if (request.method === "DELETE" && productMatch) {
      await deletePackage(response, decodeURIComponent(productMatch[1]));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/components") {
      return sendJson(response, 200, await readComponents());
    }

    if (request.method === "POST" && url.pathname === "/api/components") {
      await saveComponent(request, response);
      return;
    }

    if (request.method === "PUT" && componentMatch) {
      await updateComponent(request, response, decodeURIComponent(componentMatch[1]));
      return;
    }

    if (request.method === "DELETE" && componentMatch) {
      await deleteComponent(response, decodeURIComponent(componentMatch[1]));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/saved-quotes") {
      return sendJson(response, 200, await readSavedQuotes());
    }

    if (request.method === "GET" && savedQuoteMatch) {
      const quoteId = decodeURIComponent(savedQuoteMatch[1]);
      const quote = (await readSavedQuotes()).find((candidate) => candidate.id === quoteId);

      if (!quote) {
        return sendJson(response, 404, { error: "Saved quote was not found." });
      }

      return sendJson(response, 200, quote);
    }

    if (request.method === "POST" && url.pathname === "/api/quotes") {
      await saveQuote(request, response);
      return;
    }

    if (request.method === "GET") {
      await serveStaticFile(request, response);
      return;
    }

    sendText(response, 405, "Method not allowed");
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Something went wrong." });
  }
});

server.listen(PORT, () => {
  console.log(`Asufa package builder: http://localhost:${PORT}`);
});
