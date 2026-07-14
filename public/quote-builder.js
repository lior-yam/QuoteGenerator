const quoteForm = document.querySelector("#quoteForm");
const quoteEditContext = document.querySelector("#quoteEditContext");
const recipientCompany = document.querySelector("#recipientCompany");
const contactPerson = document.querySelector("#contactPerson");
const customerPhone = document.querySelector("#customerPhone");
const customerEmail = document.querySelector("#customerEmail");
const quoteDate = document.querySelector("#quoteDate");
const notes = document.querySelector("#notes");
const defaultNoteInputs = Array.from(document.querySelectorAll("[data-default-note]"));
const showTotals = document.querySelector("#showTotals");
const packageSearch = document.querySelector("#packageSearch");
const packageSelect = document.querySelector("#packageSelect");
const sharedQuantity = document.querySelector("#sharedQuantity");
const addPackage = document.querySelector("#addPackage");
const selectedList = document.querySelector("#selectedList");
const selectedCount = document.querySelector("#selectedCount");
const statusMessage = document.querySelector("#status");
const pdfLink = document.querySelector("#pdfLink");

let products = [];
let selectedProducts = [];
let currentSavedQuoteId = "";
let currentQuoteNumber = "";

const defaultNoteValues = new Set(defaultNoteInputs.map((input) => input.value.trim()));

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.style.color = isError ? "#a43b3b" : "#2f6f4e";
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

function descriptionList(description) {
  const items = descriptionItems(description);

  if (!items.length) {
    return "";
  }

  return `<ul class="contents-list">${items.map((item) => `<li>${formatInlineText(item)}</li>`).join("")}</ul>`;
}

function formatIls(amount) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function productImagePath(product) {
  return `/${product.imagePath.replace(/\\/g, "/")}`;
}

function sharedQuantityValue() {
  const quantity = Number(sharedQuantity.value || 1);

  return Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
}

function syncSelectedQuantities() {
  const quantity = sharedQuantityValue();

  selectedProducts = selectedProducts.map((item) => ({
    ...item,
    quantity
  }));
}

function selectedNotes() {
  const presetNotes = defaultNoteInputs
    .filter((input) => input.checked)
    .map((input) => input.value.trim())
    .filter(Boolean);
  const customNotes = notes.value
    .split(/\r?\n/)
    .map((note) => note.trim())
    .filter(Boolean);

  return [...presetNotes, ...customNotes];
}

function applyNotesToForm(quoteNotes) {
  const normalizedNotes = Array.isArray(quoteNotes)
    ? quoteNotes.map((note) => String(note).trim()).filter(Boolean)
    : String(quoteNotes || "")
      .split(/\r?\n/)
      .map((note) => note.trim())
      .filter(Boolean);
  const noteSet = new Set(normalizedNotes);

  defaultNoteInputs.forEach((input) => {
    input.checked = noteSet.has(input.value.trim());
  });

  notes.value = normalizedNotes
    .filter((note) => !defaultNoteValues.has(note))
    .join("\n");
}

function renderPackageOptions() {
  const query = packageSearch.value.trim().toLowerCase();
  const filteredProducts = products.filter((product) => {
    const text = `${product.productName} ${product.category || ""}`.toLowerCase();
    return text.includes(query);
  });

  packageSelect.innerHTML = filteredProducts
    .map((product) => `<option value="${product.id}">${product.productName} - ${formatIls(product.unitPrice)}</option>`)
    .join("");

  if (!filteredProducts.length) {
    packageSelect.innerHTML = '<option value="">לא נמצאו מארזים</option>';
  }
}

function renderSelectedProducts() {
  syncSelectedQuantities();
  selectedCount.textContent = `${selectedProducts.length} נבחרו`;

  if (!selectedProducts.length) {
    selectedList.innerHTML = '<div class="empty-state">עדיין לא נבחרו מארזים להצעה.</div>';
    return;
  }

  selectedList.innerHTML = selectedProducts
    .map((item, index) => {
      const product = products.find((candidate) => candidate.id === item.id);

      if (!product) {
        return `
          <article class="selected-row">
            <div class="missing-package-thumb">?</div>
            <div>
              <h3>מארז שלא נמצא בבנק</h3>
              <p>המארז המקורי כבר לא קיים בבנק. אפשר להסיר אותו מההצעה.</p>
            </div>
            <div class="quantity-badge">
              <span>כמות</span>
              <strong>${item.quantity}</strong>
            </div>
            <button class="remove-button" type="button" data-remove-index="${index}">הסר</button>
          </article>
        `;
      }

      return `
        <article class="selected-row">
          <img src="${productImagePath(product)}" alt="${product.productName}">
          <div>
            <h3>${escapeHtml(product.productName)}</h3>
            ${descriptionList(product.shortDescription)}
            <strong>${formatIls(product.unitPrice)}</strong>
          </div>
          <div class="quantity-badge">
            <span>כמות</span>
            <strong>${item.quantity}</strong>
          </div>
          <button class="remove-button" type="button" data-remove-index="${index}">הסר</button>
        </article>
      `;
    })
    .join("");
}

async function loadProducts() {
  const response = await fetch("/api/products");

  if (!response.ok) {
    throw new Error("לא הצלחתי לטעון את בנק המארזים.");
  }

  products = await response.json();
  renderPackageOptions();
}

async function loadSavedQuote(quoteId) {
  const response = await fetch(`/api/saved-quotes/${encodeURIComponent(quoteId)}`);
  const quote = await response.json();

  if (!response.ok) {
    throw new Error(quote.error || "לא הצלחתי לטעון את ההצעה השמורה.");
  }

  return quote;
}

function applyQuoteToForm(quote, mode) {
  const isDuplicate = mode === "duplicate";
  const savedProducts = Array.isArray(quote.selectedProducts) ? quote.selectedProducts : [];
  const firstQuantity = savedProducts.find((item) => Number(item.quantity) > 0)?.quantity || 1;

  currentSavedQuoteId = isDuplicate ? "" : quote.id;
  currentQuoteNumber = isDuplicate ? "" : quote.quoteNumber || "";
  recipientCompany.value = quote.recipientCompany || "";
  contactPerson.value = quote.contactPerson || "";
  customerPhone.value = quote.customerPhone || "";
  customerEmail.value = quote.customerEmail || "";
  quoteDate.value = quote.quoteDate || quoteDate.value;
  showTotals.checked = quote.showTotals !== false;
  sharedQuantity.value = Math.floor(Number(firstQuantity) || 1);
  selectedProducts = savedProducts.map((item) => ({
    id: String(item.id || "").trim(),
    quantity: sharedQuantityValue()
  })).filter((item) => item.id);

  applyNotesToForm(quote.notes);
  renderSelectedProducts();

  quoteEditContext.textContent = isDuplicate
    ? `שכפול מתוך הצעה ${quote.quoteNumber || ""} - השמירה תיצור הצעה חדשה.`
    : `עריכת הצעה שמורה ${quote.quoteNumber || ""}.`;
}

async function loadQuoteFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const savedQuoteId = params.get("savedQuoteId");
  const duplicateQuoteId = params.get("duplicateQuoteId");

  if (!savedQuoteId && !duplicateQuoteId) {
    return;
  }

  const quote = await loadSavedQuote(savedQuoteId || duplicateQuoteId);
  applyQuoteToForm(quote, duplicateQuoteId ? "duplicate" : "edit");
}

function addSelectedPackage() {
  const productId = packageSelect.value;
  const quantity = sharedQuantityValue();

  if (!productId) {
    setStatus("צריך לבחור מארז.", true);
    return;
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    setStatus("הכמות חייבת להיות גדולה מאפס.", true);
    return;
  }

  const existing = selectedProducts.find((item) => item.id === productId);

  if (existing) {
    existing.quantity = quantity;
    setStatus("המארז כבר בהצעה. הכמות עודכנה לפי הכמות הכללית.");
  } else {
    selectedProducts.push({ id: productId, quantity });
    setStatus("");
  }

  renderSelectedProducts();
}

function quotePayload() {
  return {
    savedQuoteId: currentSavedQuoteId,
    quoteNumber: currentQuoteNumber,
    recipientCompany: recipientCompany.value,
    contactPerson: contactPerson.value,
    customerPhone: customerPhone.value,
    customerEmail: customerEmail.value,
    quoteDate: quoteDate.value,
    notes: selectedNotes(),
    showTotals: showTotals.checked,
    selectedProducts: selectedProducts.map((item) => ({
      id: item.id,
      quantity: sharedQuantityValue()
    }))
  };
}

packageSearch.addEventListener("input", renderPackageOptions);
addPackage.addEventListener("click", addSelectedPackage);

sharedQuantity.addEventListener("input", () => {
  renderSelectedProducts();
});

selectedList.addEventListener("click", (event) => {
  const index = Number(event.target.dataset.removeIndex);

  if (!Number.isInteger(index)) {
    return;
  }

  selectedProducts.splice(index, 1);
  renderSelectedProducts();
});

quoteForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedProducts.length) {
    setStatus("צריך לבחור לפחות מארז אחד להצעה.", true);
    return;
  }

  const button = quoteForm.querySelector(".primary-button");
  button.disabled = true;
  pdfLink.classList.remove("is-visible");
  pdfLink.textContent = "פתח PDF";
  setStatus("יוצר PDF...");

  try {
    const response = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quotePayload())
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "יצירת ההצעה נכשלה.");
    }

    pdfLink.href = `${result.pdfUrl}?t=${Date.now()}`;
    currentSavedQuoteId = result.quoteRecordId || currentSavedQuoteId;
    currentQuoteNumber = result.quoteNumber || currentQuoteNumber;
    quoteEditContext.textContent = `הצעה שמורה ${currentQuoteNumber}. אפשר לחזור אליה דרך הצעות שמורות.`;
    pdfLink.textContent = result.isPrintableHtml ? "פתח הצעה להדפסה" : "פתח PDF";
    pdfLink.classList.add("is-visible");
    setStatus(result.isPrintableHtml ? "ההצעה נוצרה. בחלון שייפתח אפשר לבחור הדפסה ואז שמירה כ-PDF." : "ההצעה נוצרה בהצלחה.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
});

async function initQuoteBuilder() {
  quoteDate.valueAsDate = new Date();
  renderSelectedProducts();
  await loadProducts();
  await loadQuoteFromUrl();
}

initQuoteBuilder().catch((error) => setStatus(error.message, true));
