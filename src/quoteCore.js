const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");

function resolveRootDir() {
  const candidates = [
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "../.."),
    process.cwd()
  ];

  for (const candidate of candidates) {
    if (
      fsSync.existsSync(path.resolve(candidate, "products.json"))
      || fsSync.existsSync(path.resolve(candidate, "templates/quote.html"))
    ) {
      return candidate;
    }
  }

  return path.resolve(__dirname, "..");
}

const ROOT_DIR = resolveRootDir();
// Update this value if the Israeli VAT rate changes.
const VAT_RATE = 0.18;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatIls(amount) {
  const formatted = new Intl.NumberFormat("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);

  return `₪ ${formatted}`;
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function replaceTokens(template, tokens) {
  return Object.entries(tokens).reduce(
    (html, [token, value]) => html.split(`{{${token}}}`).join(value),
    template
  );
}

async function readJson(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

function mimeTypeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".pdf": "application/pdf"
  };

  return mimeTypes[ext] || "application/octet-stream";
}

async function localFileToDataUri(relativePath) {
  // Embedding local assets keeps generated PDFs self-contained and offline-friendly.
  const filePath = path.resolve(ROOT_DIR, relativePath);
  const buffer = await fs.readFile(filePath);

  return `data:${mimeTypeForPath(filePath)};base64,${buffer.toString("base64")}`;
}

function bufferToDataUri(buffer, mimeType) {
  return `data:${mimeType || "application/octet-stream"};base64,${Buffer.from(buffer).toString("base64")}`;
}

function validateQuoteData(quoteData) {
  if (!quoteData.recipientCompany) {
    throw new Error("quote-data.json must include recipientCompany.");
  }

  if (!quoteData.quoteDate) {
    throw new Error("quote-data.json must include quoteDate.");
  }

  if (!Array.isArray(quoteData.selectedProducts) || quoteData.selectedProducts.length === 0) {
    throw new Error("quote-data.json must include at least one selected product.");
  }
}

function buildQuoteItems(quoteData, products) {
  const productsById = new Map(products.map((product) => [product.id, product]));

  return quoteData.selectedProducts.map((selectedProduct) => {
    const product = productsById.get(selectedProduct.id);
    const quantity = Number(selectedProduct.quantity);

    if (!product) {
      throw new Error(`Unknown product id in quote-data.json: ${selectedProduct.id}`);
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Invalid quantity for product ${selectedProduct.id}.`);
    }

    return {
      ...product,
      quantity,
      rowTotal: product.unitPrice * quantity
    };
  });
}

function descriptionItems(description) {
  return String(description || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-•]\s+|\*\s+)/, "").trim())
    .filter(Boolean);
}

function formatInlineText(value) {
  const text = String(value || "");
  const pattern = /(\*\*|__)(.+?)\1/g;
  let position = 0;
  let html = "";
  let match;

  while ((match = pattern.exec(text)) !== null) {
    html += escapeHtml(text.slice(position, match.index));
    html += `<strong>${escapeHtml(match[2])}</strong>`;
    position = match.index + match[0].length;
  }

  return html + escapeHtml(text.slice(position));
}

function buildContentsList(description) {
  const items = descriptionItems(description);

  if (!items.length) {
    return "";
  }

  return `<ul class="contents-list">${items.map((item) => `<li>${formatInlineText(item)}</li>`).join("")}</ul>`;
}

async function buildProductRows(items, assetToDataUri) {
  const rows = await Promise.all(
    items.map(async (item) => {
      const imageSrc = await assetToDataUri(item.imagePath);

      return `
        <tr>
          <td>
            <span class="product-image">
              <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(item.productName)}">
            </span>
          </td>
          <td class="product-name">${escapeHtml(item.productName)}</td>
          <td class="short-description">${buildContentsList(item.shortDescription)}</td>
          <td class="numeric">${item.quantity}</td>
          <td class="numeric">${formatIls(item.unitPrice)}</td>
          <td class="numeric">${formatIls(item.rowTotal)}</td>
        </tr>
      `;
    })
  );

  return rows.join("");
}

function buildNotesBlock(notes) {
  const noteItems = Array.isArray(notes)
    ? notes.map((note) => String(note).trim()).filter(Boolean)
    : String(notes || "")
      .split(/\r?\n/)
      .map((note) => note.trim())
      .filter(Boolean);

  const items = noteItems
    .map((note) => `<li>${formatInlineText(note)}</li>`)
    .join("");

  return items ? `<ul class="notes-list">${items}</ul>` : `<p class="empty-notes">אין הערות.</p>`;
}

function buildTotalsBlock(totals, showTotals) {
  if (!showTotals) {
    return "";
  }

  return `
    <aside class="totals" aria-label="סיכום הצעה">
      <div class="subtotal-total">
        <span>סיכום לפני מע״מ</span>
        <strong>${formatIls(totals.subtotal)}</strong>
      </div>
      <div class="secondary-total">
        <span>מע״מ 18%</span>
        <strong>${formatIls(totals.vat)}</strong>
      </div>
      <div class="secondary-total">
        <span>סה״כ לתשלום כולל מע״מ</span>
        <strong>${formatIls(totals.total)}</strong>
      </div>
    </aside>
  `;
}

function buildOptionalContactPerson(contactPerson) {
  if (!contactPerson) {
    return "";
  }

  return `
    <div>
      <span>איש קשר</span>
      <strong>${escapeHtml(contactPerson)}</strong>
    </div>
  `;
}

function buildOptionalCustomerEmail(customerEmail) {
  if (!customerEmail) {
    return "";
  }

  return `
    <div>
      <span>אימייל</span>
      <strong>${escapeHtml(customerEmail)}</strong>
    </div>
  `;
}

function buildOptionalCustomerPhone(customerPhone) {
  if (!customerPhone) {
    return "";
  }

  return `
    <div>
      <span>טלפון</span>
      <strong>${escapeHtml(customerPhone)}</strong>
    </div>
  `;
}

function calculateTotals(items) {
  const subtotal = items.reduce((sum, item) => sum + item.rowTotal, 0);
  const vat = subtotal * VAT_RATE;

  return {
    subtotal,
    vat,
    total: subtotal + vat
  };
}

function buildPrintTools() {
  return `
    <div class="print-toolbar">
      <button type="button" onclick="window.print()">הדפס / שמור PDF</button>
    </div>
  `;
}

async function createQuoteHtml({ quoteData, products, assetToDataUri = localFileToDataUri, showPrintTools = false }) {
  validateQuoteData(quoteData);

  const items = buildQuoteItems(quoteData, products);
  const totals = calculateTotals(items);

  const [template, css, logoSrc, productRows] = await Promise.all([
    fs.readFile(path.resolve(ROOT_DIR, "templates/quote.html"), "utf8"),
    fs.readFile(path.resolve(ROOT_DIR, "templates/quote.css"), "utf8"),
    assetToDataUri("assets/asufa-logo.png"),
    buildProductRows(items, assetToDataUri)
  ]);

  const contactDetails = quoteData.contactDetails || {};

  return {
    html: replaceTokens(template, {
      CSS: css,
      PRINT_TOOLS: showPrintTools ? buildPrintTools() : "",
      LOGO_SRC: logoSrc,
      QUOTE_NUMBER: escapeHtml(quoteData.quoteNumber || "AS-0001"),
      RECIPIENT_COMPANY: escapeHtml(quoteData.recipientCompany),
      CONTACT_PERSON_BLOCK: buildOptionalContactPerson(quoteData.contactPerson),
      RECIPIENT_PHONE_BLOCK: buildOptionalCustomerPhone(quoteData.customerPhone),
      RECIPIENT_EMAIL_BLOCK: buildOptionalCustomerEmail(quoteData.customerEmail),
      QUOTE_DATE: escapeHtml(formatDate(quoteData.quoteDate)),
      PRODUCT_ROWS: productRows,
      NOTES_BLOCK: buildNotesBlock(quoteData.notes),
      SUMMARY_CLASS: quoteData.showTotals === false ? "no-totals" : "",
      TOTALS_BLOCK: buildTotalsBlock(totals, quoteData.showTotals !== false),
      CONTACT_NAME: escapeHtml(contactDetails.name || "אסופה"),
      CONTACT_ADDRESS: escapeHtml(contactDetails.address || ""),
      CONTACT_PHONE: escapeHtml(contactDetails.phone || ""),
      CONTACT_EMAIL: escapeHtml(contactDetails.email || ""),
      CONTACT_WEBSITE: escapeHtml(contactDetails.website || "")
    }),
    items,
    totals
  };
}

module.exports = {
  VAT_RATE,
  ROOT_DIR,
  bufferToDataUri,
  createQuoteHtml,
  escapeHtml,
  localFileToDataUri,
  mimeTypeForPath,
  readJson,
  validateQuoteData
};
