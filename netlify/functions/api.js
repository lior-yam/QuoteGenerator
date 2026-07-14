const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { getStore } = require("@netlify/blobs");
const {
  ROOT_DIR,
  bufferToDataUri,
  createQuoteHtml,
  generatePdfBuffer,
  localFileToDataUri,
  mimeTypeForPath
} = require("../../src/quoteCore");

const PRODUCTS_PATH = path.resolve(ROOT_DIR, "products.json");
const COMPONENTS_PATH = path.resolve(ROOT_DIR, "components.json");
const SAVED_QUOTES_PATH = path.resolve(ROOT_DIR, "saved-quotes.json");
const PRODUCT_IMAGES_DIR = path.resolve(ROOT_DIR, "assets/products");
const OUTPUT_DIR = path.resolve(ROOT_DIR, "output");
const PRODUCTS_KEY = "products.json";
const COMPONENTS_KEY = "components.json";
const SAVED_QUOTES_KEY = "saved-quotes.json";
const DATA_STORE = "asufa-data";
const IMAGE_STORE = "asufa-product-images";
const QUOTE_STORE = "asufa-quotes";
const MAX_SYNC_PDF_BYTES = 4.5 * 1024 * 1024;

const CONTACT_DETAILS = {
  name: "אסופה - עיצוב ישראלי",
  address: "נחמן 2, תל אביב",
  phone: "0526622671",
  email: "nitzan@asufadesign.com",
  website: "asufadesign.co.il"
};

function isNetlifyRuntime() {
  return Boolean(process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT || process.env.NETLIFY_SITE_ID);
}

function store(name) {
  return getStore(name);
}

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(data)
  };
}

function html(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body
  };
}

function binary(statusCode, body, contentType) {
  return {
    statusCode,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    },
    body: Buffer.from(body).toString("base64"),
    isBase64Encoded: true
  };
}

function toArrayBuffer(value) {
  const buffer = Buffer.from(value);

  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function apiPath(event) {
  const pathname = new URL(event.rawUrl || event.path, "https://asufa.local").pathname;

  if (pathname.startsWith("/api/")) {
    return pathname.slice(4);
  }

  if (pathname === "/api") {
    return "/";
  }

  return pathname.replace(/^\/\.netlify\/functions\/api/, "") || "/";
}

function readBodyJson(event) {
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";

  return JSON.parse(rawBody || "{}");
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
    extension: extensionByMimeType[mimeType],
    mimeType
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
    contactDetails: CONTACT_DETAILS
  };
}

function blobImageKeyFromPath(imagePath) {
  return String(imagePath || "").replace(/^\/?api\/images\//, "");
}

function isBlobImagePath(imagePath) {
  return /^\/?api\/images\//.test(String(imagePath || ""));
}

function quoteKeyFromPath(requestPath) {
  const match = /^\/quotes\/([^/]+)\/(pdf|html)$/.exec(requestPath);
  return match ? { key: decodeURIComponent(match[1]), type: match[2] } : null;
}

async function readProducts() {
  if (isNetlifyRuntime()) {
    const savedProducts = await store(DATA_STORE).get(PRODUCTS_KEY, { type: "json" });

    if (savedProducts) {
      return savedProducts;
    }
  }

  const fallbackProducts = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf8"));

  if (isNetlifyRuntime()) {
    await store(DATA_STORE).setJSON(PRODUCTS_KEY, fallbackProducts);
  }

  return fallbackProducts;
}

async function writeProducts(products) {
  if (isNetlifyRuntime()) {
    await store(DATA_STORE).setJSON(PRODUCTS_KEY, products);
    return;
  }

  await fs.writeFile(PRODUCTS_PATH, `${JSON.stringify(products, null, 2)}\n`, "utf8");
}

async function readComponents() {
  if (isNetlifyRuntime()) {
    const savedComponents = await store(DATA_STORE).get(COMPONENTS_KEY, { type: "json" });

    if (savedComponents) {
      return savedComponents;
    }
  }

  const fallbackComponents = JSON.parse(await fs.readFile(COMPONENTS_PATH, "utf8"));

  if (isNetlifyRuntime()) {
    await store(DATA_STORE).setJSON(COMPONENTS_KEY, fallbackComponents);
  }

  return fallbackComponents;
}

async function writeComponents(components) {
  if (isNetlifyRuntime()) {
    await store(DATA_STORE).setJSON(COMPONENTS_KEY, components);
    return;
  }

  await fs.writeFile(COMPONENTS_PATH, `${JSON.stringify(components, null, 2)}\n`, "utf8");
}

async function readSavedQuotes() {
  if (isNetlifyRuntime()) {
    const savedQuotes = await store(DATA_STORE).get(SAVED_QUOTES_KEY, { type: "json" });

    if (savedQuotes) {
      return savedQuotes;
    }
  }

  try {
    const fallbackQuotes = JSON.parse(await fs.readFile(SAVED_QUOTES_PATH, "utf8"));

    if (isNetlifyRuntime()) {
      await store(DATA_STORE).setJSON(SAVED_QUOTES_KEY, fallbackQuotes);
    }

    return fallbackQuotes;
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeSavedQuotes(quotes) {
  if (isNetlifyRuntime()) {
    await store(DATA_STORE).setJSON(SAVED_QUOTES_KEY, quotes);
    return;
  }

  await fs.writeFile(SAVED_QUOTES_PATH, `${JSON.stringify(quotes, null, 2)}\n`, "utf8");
}

function savedQuoteRecord(id, quoteData, existingQuote, pdfUrl, isPrintableHtml) {
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
    pdfUrl,
    isPrintableHtml: Boolean(isPrintableHtml)
  };
}

async function upsertSavedQuote(quoteId, quoteData, pdfUrl, isPrintableHtml = false) {
  const savedQuotes = await readSavedQuotes();
  const existingQuote = savedQuotes.find((quote) => quote.id === quoteId);
  const nextRecord = savedQuoteRecord(quoteId, quoteData, existingQuote, pdfUrl, isPrintableHtml);
  const nextQuotes = existingQuote
    ? savedQuotes.map((quote) => (quote.id === quoteId ? nextRecord : quote))
    : [nextRecord, ...savedQuotes];

  await writeSavedQuotes(nextQuotes);

  return nextRecord;
}

async function saveProductImage(productId, imageData, previousImagePath = "") {
  const image = parseImageDataUri(imageData);
  const key = `${productId}.${image.extension}`;

  if (isNetlifyRuntime()) {
    await store(IMAGE_STORE).set(key, toArrayBuffer(image.buffer), {
      metadata: { contentType: image.mimeType }
    });

    if (previousImagePath && isBlobImagePath(previousImagePath) && blobImageKeyFromPath(previousImagePath) !== key) {
      await store(IMAGE_STORE).delete(blobImageKeyFromPath(previousImagePath));
    }

    return `api/images/${key}`;
  }

  const imagePath = `assets/products/${key}`;

  await fs.mkdir(PRODUCT_IMAGES_DIR, { recursive: true });
  await fs.writeFile(path.resolve(ROOT_DIR, imagePath), image.buffer);

  if (previousImagePath && previousImagePath !== imagePath && previousImagePath.startsWith("assets/products/")) {
    await fs.unlink(path.resolve(ROOT_DIR, previousImagePath)).catch(() => {});
  }

  return imagePath;
}

async function deleteProductImage(imagePath) {
  if (!imagePath) {
    return;
  }

  if (isNetlifyRuntime() && isBlobImagePath(imagePath)) {
    await store(IMAGE_STORE).delete(blobImageKeyFromPath(imagePath));
    return;
  }

  if (!isNetlifyRuntime() && imagePath.startsWith("assets/products/")) {
    await fs.unlink(path.resolve(ROOT_DIR, imagePath)).catch(() => {});
  }
}

async function readBlobImage(key) {
  if (!isNetlifyRuntime()) {
    const filePath = path.resolve(ROOT_DIR, "assets/products", key);
    return {
      data: await fs.readFile(filePath),
      contentType: mimeTypeForPath(filePath)
    };
  }

  const entry = await store(IMAGE_STORE).getWithMetadata(key, { type: "arrayBuffer" });

  if (!entry || !entry.data) {
    return null;
  }

  return {
    data: Buffer.from(entry.data),
    contentType: entry.metadata?.contentType || mimeTypeForPath(key)
  };
}

async function assetToDataUri(imagePath) {
  if (isBlobImagePath(imagePath)) {
    const image = await readBlobImage(blobImageKeyFromPath(imagePath));

    if (!image) {
      throw new Error(`Missing image: ${imagePath}`);
    }

    return bufferToDataUri(image.data, image.contentType);
  }

  return localFileToDataUri(imagePath);
}

async function createProduct(event) {
  const data = readBodyJson(event);
  const packageData = validatePackageInput(data);
  const id = `package-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const imagePath = await saveProductImage(id, data.imageData);
  const products = await readProducts();
  const newPackage = { id, ...packageData, imagePath };

  products.push(newPackage);
  await writeProducts(products);

  return json(201, newPackage);
}

async function updateProduct(event, productId) {
  const data = readBodyJson(event);
  const packageData = validatePackageInput(data);
  const products = await readProducts();
  const productIndex = products.findIndex((product) => product.id === productId);

  if (productIndex === -1) {
    throw new Error("Package was not found.");
  }

  const previousProduct = products[productIndex];
  const imagePath = data.imageData
    ? await saveProductImage(productId, data.imageData, previousProduct.imagePath)
    : previousProduct.imagePath;
  const updatedPackage = { id: productId, ...packageData, imagePath };

  products[productIndex] = updatedPackage;
  await writeProducts(products);

  return json(200, updatedPackage);
}

async function deleteProduct(productId) {
  const products = await readProducts();
  const product = products.find((candidate) => candidate.id === productId);

  if (!product) {
    throw new Error("Package was not found.");
  }

  await writeProducts(products.filter((candidate) => candidate.id !== productId));
  await deleteProductImage(product.imagePath);

  return json(200, { message: "Package deleted." });
}

async function reorderProducts(event) {
  const data = readBodyJson(event);
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

  for (const product of products) {
    if (!seenIds.has(product.id)) {
      reorderedProducts.push(product);
    }
  }

  await writeProducts(reorderedProducts);
  return json(200, reorderedProducts);
}

async function createComponent(event) {
  const componentData = validateComponentInput(readBodyJson(event));
  const components = await readComponents();
  const newComponent = {
    id: `component-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    ...componentData
  };

  components.push(newComponent);
  await writeComponents(components);

  return json(201, newComponent);
}

async function updateComponent(event, componentId) {
  const componentData = validateComponentInput(readBodyJson(event));
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

  return json(200, updatedComponent);
}

async function deleteComponent(componentId) {
  const components = await readComponents();
  const component = components.find((candidate) => candidate.id === componentId);

  if (!component) {
    throw new Error("Component was not found.");
  }

  await writeComponents(components.filter((candidate) => candidate.id !== componentId));

  return json(200, { message: "Component deleted." });
}

async function serveProductImage(key) {
  const image = await readBlobImage(key);

  if (!image) {
    return json(404, { error: "Image was not found." });
  }

  return binary(200, image.data, image.contentType);
}

async function saveQuote(event) {
  const data = readBodyJson(event);
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
  const quoteRecordId = savedQuoteId || `quote-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

  for (const item of quoteData.selectedProducts) {
    if (!productIds.has(item.id)) {
      throw new Error(`Unknown package: ${item.id}`);
    }

    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new Error("Quantity must be a positive number.");
    }
  }

  const { html: quoteHtml } = await createQuoteHtml({
    quoteData,
    products,
    assetToDataUri
  });
  const quoteKey = `${quoteData.quoteNumber}-${Date.now()}`;
  let responseBody;

  if (isNetlifyRuntime()) {
    await store(QUOTE_STORE).set(`${quoteKey}.html`, quoteHtml, {
      metadata: { contentType: "text/html; charset=utf-8" }
    });

    const responseBody = {
      message: "Quote generated as printable HTML for Netlify.",
      pdfUrl: `/api/quotes/${encodeURIComponent(`${quoteKey}.html`)}/html`,
      isPrintableHtml: true
    };
    const savedQuote = await upsertSavedQuote(
      quoteRecordId,
      quoteData,
      responseBody.pdfUrl,
      true
    );

    return json(201, {
      ...responseBody,
      quoteRecordId: savedQuote.id,
      quoteNumber: savedQuote.quoteNumber
    });
  } else {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.writeFile(path.resolve(OUTPUT_DIR, `${quoteKey}.html`), quoteHtml, "utf8");
  }

  try {
    const pdf = await generatePdfBuffer(quoteHtml);

    if (pdf.length > MAX_SYNC_PDF_BYTES) {
      responseBody = {
        message: "Quote generated as printable HTML because the PDF is too large for a synchronous Netlify response.",
        pdfUrl: `/api/quotes/${encodeURIComponent(`${quoteKey}.html`)}/html`,
        isPrintableHtml: true
      };
    } else {
      if (isNetlifyRuntime()) {
        await store(QUOTE_STORE).set(`${quoteKey}.pdf`, toArrayBuffer(pdf), {
          metadata: { contentType: "application/pdf" }
        });
      } else {
        await fs.writeFile(path.resolve(OUTPUT_DIR, `${quoteKey}.pdf`), pdf);
      }

      responseBody = {
        message: "Quote generated.",
        pdfUrl: `/api/quotes/${encodeURIComponent(`${quoteKey}.pdf`)}/pdf`
      };
    }
  } catch (error) {
    responseBody = {
      message: `Quote generated as printable HTML. PDF generation failed: ${error.message}`,
      pdfUrl: `/api/quotes/${encodeURIComponent(`${quoteKey}.html`)}/html`,
      isPrintableHtml: true
    };
  }

  const savedQuote = await upsertSavedQuote(
    quoteRecordId,
    quoteData,
    responseBody.pdfUrl,
    Boolean(responseBody.isPrintableHtml)
  );

  return json(201, {
    ...responseBody,
    quoteRecordId: savedQuote.id,
    quoteNumber: savedQuote.quoteNumber
  });
}

async function serveQuoteFile(fileKey, type) {
  const contentType = type === "pdf" ? "application/pdf" : "text/html; charset=utf-8";

  if (isNetlifyRuntime()) {
    const blobType = type === "pdf" ? "arrayBuffer" : "text";
    const body = await store(QUOTE_STORE).get(fileKey, { type: blobType });

    if (!body) {
      return json(404, { error: "Quote was not found." });
    }

    return type === "pdf" ? binary(200, Buffer.from(body), contentType) : html(200, body);
  }

  const filePath = path.resolve(OUTPUT_DIR, fileKey);
  const body = await fs.readFile(filePath);

  return type === "pdf" ? binary(200, body, contentType) : html(200, body.toString("utf8"));
}

exports.handler = async (event) => {
  try {
    const requestPath = apiPath(event);
    const productMatch = /^\/products\/([^/]+)$/.exec(requestPath);
    const componentMatch = /^\/components\/([^/]+)$/.exec(requestPath);
    const savedQuoteMatch = /^\/saved-quotes\/([^/]+)$/.exec(requestPath);
    const imageMatch = /^\/images\/([^/]+)$/.exec(requestPath);
    const quoteFile = quoteKeyFromPath(requestPath);

    if (event.httpMethod === "GET" && requestPath === "/products") {
      return json(200, await readProducts());
    }

    if (event.httpMethod === "POST" && requestPath === "/products/reorder") {
      return reorderProducts(event);
    }

    if (event.httpMethod === "POST" && requestPath === "/products") {
      return createProduct(event);
    }

    if (event.httpMethod === "PUT" && productMatch) {
      return updateProduct(event, decodeURIComponent(productMatch[1]));
    }

    if (event.httpMethod === "DELETE" && productMatch) {
      return deleteProduct(decodeURIComponent(productMatch[1]));
    }

    if (event.httpMethod === "GET" && requestPath === "/components") {
      return json(200, await readComponents());
    }

    if (event.httpMethod === "POST" && requestPath === "/components") {
      return createComponent(event);
    }

    if (event.httpMethod === "PUT" && componentMatch) {
      return updateComponent(event, decodeURIComponent(componentMatch[1]));
    }

    if (event.httpMethod === "DELETE" && componentMatch) {
      return deleteComponent(decodeURIComponent(componentMatch[1]));
    }

    if (event.httpMethod === "GET" && requestPath === "/saved-quotes") {
      return json(200, await readSavedQuotes());
    }

    if (event.httpMethod === "GET" && savedQuoteMatch) {
      const quoteId = decodeURIComponent(savedQuoteMatch[1]);
      const quote = (await readSavedQuotes()).find((candidate) => candidate.id === quoteId);

      if (!quote) {
        return json(404, { error: "Saved quote was not found." });
      }

      return json(200, quote);
    }

    if (event.httpMethod === "GET" && imageMatch) {
      return serveProductImage(decodeURIComponent(imageMatch[1]));
    }

    if (event.httpMethod === "POST" && requestPath === "/quotes") {
      return saveQuote(event);
    }

    if (event.httpMethod === "GET" && quoteFile) {
      return serveQuoteFile(quoteFile.key, quoteFile.type);
    }

    return json(404, { error: "Not found." });
  } catch (error) {
    return json(400, { error: error.message || "Something went wrong." });
  }
};
