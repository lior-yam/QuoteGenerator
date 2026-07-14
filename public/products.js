const form = document.querySelector("#packageForm");
const imageFile = document.querySelector("#imageFile");
const imagePreview = document.querySelector("#imagePreview");
const packageList = document.querySelector("#packageList");
const packageTableBody = document.querySelector("#packageTableBody");
const packageCount = document.querySelector("#packageCount");
const statusMessage = document.querySelector("#status");
const formTitle = document.querySelector("#formTitle");
const submitButton = document.querySelector("#submitButton");
const cancelEdit = document.querySelector("#cancelEdit");
const boldDescription = document.querySelector("#boldDescription");
const componentSearch = document.querySelector("#componentSearch");
const componentSelect = document.querySelector("#componentSelect");
const addComponentToPackage = document.querySelector("#addComponentToPackage");
const cardViewButton = document.querySelector("#cardViewButton");
const tableViewButton = document.querySelector("#tableViewButton");
const packageCardsView = document.querySelector("#packageCardsView");
const packageTableView = document.querySelector("#packageTableView");
const hebrewCollator = new Intl.Collator("he", { sensitivity: "base", numeric: true });

let imageData = "";
let currentProducts = [];
let currentComponents = [];
let editingId = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatIls(amount) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.style.color = isError ? "#a43b3b" : "#2f6f4e";
}

function imageSource(imagePath) {
  return `/${String(imagePath || "").replace(/\\/g, "/")}`;
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

function componentDisplayText(component) {
  return component.defaultText || component.componentName;
}

function sortedComponents(components) {
  return [...components].sort((a, b) => hebrewCollator.compare(a.componentName || "", b.componentName || ""));
}

function renderComponentOptions() {
  const query = componentSearch.value.trim().toLowerCase();
  const filteredComponents = sortedComponents(currentComponents).filter((component) => {
    const text = `${component.componentName} ${component.defaultText || ""} ${component.category || ""}`.toLowerCase();
    return text.includes(query);
  });

  componentSelect.innerHTML = filteredComponents
    .map((component) => `<option value="${component.id}">${escapeHtml(component.componentName)}</option>`)
    .join("");

  if (!filteredComponents.length) {
    componentSelect.innerHTML = '<option value="">לא נמצאו מוצרים</option>';
  }
}

function wrapTextareaSelectionWithBold(textarea) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = textarea.value.slice(start, end) || "טקסט מודגש";
  const replacement = `**${selectedText}**`;

  textarea.setRangeText(replacement, start, end, "select");
  textarea.focus();
}

function addSelectedComponentToPackage() {
  const componentId = componentSelect.value;
  const component = currentComponents.find((candidate) => candidate.id === componentId);

  if (!component) {
    setStatus("צריך לבחור מוצר מתוך הבנק.", true);
    return;
  }

  const textarea = form.shortDescription;
  const textToAdd = componentDisplayText(component);
  const prefix = textarea.value.trim() ? "\n" : "";

  textarea.value = `${textarea.value}${prefix}${textToAdd}`;
  textarea.focus();
  setStatus("המוצר נוסף לרשימת המרכיבים.");
}

function setPackageView(viewName) {
  const isTable = viewName === "table";

  packageCardsView.classList.toggle("is-active", !isTable);
  packageTableView.classList.toggle("is-active", isTable);
  cardViewButton.classList.toggle("is-active", !isTable);
  tableViewButton.classList.toggle("is-active", isTable);
  cardViewButton.setAttribute("aria-selected", String(!isTable));
  tableViewButton.setAttribute("aria-selected", String(isTable));
  localStorage.setItem("asufaPackageView", isTable ? "table" : "cards");
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("לא הצלחתי לקרוא את התמונה."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("לא הצלחתי לפתוח את התמונה."));
    image.src = src;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("לא הצלחתי להכין את התמונה לשמירה."));
    reader.readAsDataURL(blob);
  });
}

async function prepareImage(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("צריך להעלות קובץ תמונה.");
  }

  if (file.type === "image/svg+xml") {
    return readImage(file);
  }

  const originalData = await readImage(file);
  const image = await loadImage(originalData);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");

  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);

  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));

  if (!blob) {
    throw new Error("לא הצלחתי לכווץ את התמונה.");
  }

  return blobToDataUrl(blob);
}

function resetForm() {
  form.reset();
  editingId = "";
  imageData = "";
  imageFile.required = true;
  formTitle.textContent = "הקמת מארז חדש";
  submitButton.textContent = "שמור מארז";
  cancelEdit.hidden = true;
  imagePreview.innerHTML = "<span>תצוגה מקדימה</span>";
}

function renderProductCards() {
  if (!currentProducts.length) {
    packageList.innerHTML = '<div class="empty-state">עדיין אין מארזים בבנק.</div>';
    return;
  }

  packageList.innerHTML = currentProducts
    .map((product) => `
      <article class="package-card">
        <img src="${imageSource(product.imagePath)}" alt="${escapeHtml(product.productName)}">
        <div class="package-card-content">
          <h3>${escapeHtml(product.productName)}</h3>
          ${descriptionList(product.shortDescription)}
          <div class="package-meta">
            <span>${escapeHtml(product.category || "מארזים")}</span>
            <strong>${formatIls(product.unitPrice)}</strong>
          </div>
          <div class="package-actions">
            <button class="edit-button" type="button" data-edit-id="${escapeHtml(product.id)}">ערוך</button>
            <button class="delete-button" type="button" data-delete-id="${escapeHtml(product.id)}">מחק</button>
          </div>
        </div>
      </article>
    `)
    .join("");
}

function renderProductTable() {
  if (!currentProducts.length) {
    packageTableBody.innerHTML = '<tr><td colspan="6" class="empty-table-cell">עדיין אין מארזים בבנק.</td></tr>';
    return;
  }

  packageTableBody.innerHTML = currentProducts
    .map((product, index) => `
      <tr>
        <td>
          <div class="order-controls">
            <button type="button" title="העבר למעלה" data-move-id="${escapeHtml(product.id)}" data-direction="-1" ${index === 0 ? "disabled" : ""}>↑</button>
            <button type="button" title="העבר למטה" data-move-id="${escapeHtml(product.id)}" data-direction="1" ${index === currentProducts.length - 1 ? "disabled" : ""}>↓</button>
          </div>
        </td>
        <td>
          <img class="table-thumb" src="${imageSource(product.imagePath)}" alt="${escapeHtml(product.productName)}">
        </td>
        <td class="strong-cell">
          ${escapeHtml(product.productName)}
          <div class="table-description">${descriptionList(product.shortDescription)}</div>
        </td>
        <td>${escapeHtml(product.category || "מארזים")}</td>
        <td>${formatIls(product.unitPrice)}</td>
        <td>
          <div class="table-actions">
            <button class="edit-button" type="button" data-edit-id="${escapeHtml(product.id)}">ערוך</button>
            <button class="delete-button" type="button" data-delete-id="${escapeHtml(product.id)}">מחק</button>
          </div>
        </td>
      </tr>
    `)
    .join("");
}

function renderProducts(products) {
  currentProducts = products;
  packageCount.textContent = `${products.length} מארזים`;
  renderProductCards();
  renderProductTable();
}

async function loadProducts() {
  const response = await fetch("/api/products");

  if (!response.ok) {
    throw new Error("לא הצלחתי לטעון את בנק המארזים.");
  }

  renderProducts(await response.json());
}

async function loadComponents() {
  const response = await fetch("/api/components");

  if (!response.ok) {
    throw new Error("לא הצלחתי לטעון את בנק המוצרים.");
  }

  currentComponents = await response.json();
  renderComponentOptions();
}

function startEdit(productId) {
  const product = currentProducts.find((candidate) => candidate.id === productId);

  if (!product) {
    setStatus("לא מצאתי את המארז לעריכה.", true);
    return;
  }

  editingId = product.id;
  imageData = "";
  imageFile.required = false;
  formTitle.textContent = "עריכת מארז";
  submitButton.textContent = "שמור שינויים";
  cancelEdit.hidden = false;
  form.productName.value = product.productName;
  form.shortDescription.value = product.shortDescription;
  form.unitPrice.value = product.unitPrice;
  form.category.value = product.category || "";
  imagePreview.innerHTML = `<img src="${imageSource(product.imagePath)}" alt="תמונה קיימת">`;
  setStatus("אפשר לערוך פרטים. העלאת תמונה חדשה תחליף את הקיימת.");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteProduct(productId) {
  const product = currentProducts.find((candidate) => candidate.id === productId);

  if (!product) {
    setStatus("לא מצאתי את המארז למחיקה.", true);
    return;
  }

  const approved = window.confirm(`למחוק את "${product.productName}" מבנק המארזים?`);

  if (!approved) {
    return;
  }

  setStatus("מוחק מארז...");

  const response = await fetch(`/api/products/${encodeURIComponent(productId)}`, {
    method: "DELETE"
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "מחיקת המארז נכשלה.");
  }

  if (editingId === productId) {
    resetForm();
  }

  setStatus("המארז נמחק.");
  await loadProducts();
}

async function saveProductOrder(orderedProducts) {
  const response = await fetch("/api/products/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderedIds: orderedProducts.map((product) => product.id) })
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "שמירת הסדר נכשלה.");
  }

  renderProducts(result);
}

async function moveProduct(productId, direction) {
  const fromIndex = currentProducts.findIndex((candidate) => candidate.id === productId);
  const toIndex = fromIndex + direction;

  if (fromIndex === -1 || toIndex < 0 || toIndex >= currentProducts.length) {
    return;
  }

  const reorderedProducts = [...currentProducts];
  const [product] = reorderedProducts.splice(fromIndex, 1);
  reorderedProducts.splice(toIndex, 0, product);

  renderProducts(reorderedProducts);
  setStatus("שומר סדר מארזים...");
  await saveProductOrder(reorderedProducts);
  setStatus("סדר המארזים נשמר.");
}

imageFile.addEventListener("change", async () => {
  const file = imageFile.files[0];

  if (!file) {
    imageData = "";
    if (!editingId) {
      imagePreview.innerHTML = "<span>תצוגה מקדימה</span>";
    }
    return;
  }

  try {
    setStatus("מכין תמונה...");
    imageData = await prepareImage(file);
    imagePreview.innerHTML = `<img src="${imageData}" alt="תצוגה מקדימה">`;
    setStatus("");
  } catch (error) {
    imageData = "";
    imageFile.value = "";
    imagePreview.innerHTML = "<span>תצוגה מקדימה</span>";
    setStatus(error.message, true);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!editingId && !imageData) {
    setStatus("צריך להעלות תמונה למארז.", true);
    return;
  }

  const formData = new FormData(form);

  submitButton.disabled = true;
  setStatus(editingId ? "שומר שינויים..." : "שומר מארז...");

  try {
    const endpoint = editingId ? `/api/products/${encodeURIComponent(editingId)}` : "/api/products";
    const response = await fetch(endpoint, {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productName: formData.get("productName"),
        shortDescription: formData.get("shortDescription"),
        unitPrice: formData.get("unitPrice"),
        category: formData.get("category"),
        imageData
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "שמירת המארז נכשלה.");
    }

    const wasEditing = Boolean(editingId);
    resetForm();
    setStatus(wasEditing ? "השינויים נשמרו." : "המארז נשמר בבנק.");
    await loadProducts();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

cancelEdit.addEventListener("click", () => {
  resetForm();
  setStatus("");
});

boldDescription.addEventListener("click", () => wrapTextareaSelectionWithBold(form.shortDescription));
componentSearch.addEventListener("input", renderComponentOptions);
addComponentToPackage.addEventListener("click", addSelectedComponentToPackage);
cardViewButton.addEventListener("click", () => setPackageView("cards"));
tableViewButton.addEventListener("click", () => setPackageView("table"));

async function handlePackageAction(event) {
  const editId = event.target.dataset.editId;
  const deleteId = event.target.dataset.deleteId;
  const moveId = event.target.dataset.moveId;
  const direction = Number(event.target.dataset.direction);

  try {
    if (editId) {
      startEdit(editId);
    }

    if (deleteId) {
      await deleteProduct(deleteId);
    }

    if (moveId && Number.isFinite(direction)) {
      await moveProduct(moveId, direction);
    }
  } catch (error) {
    setStatus(error.message, true);
    await loadProducts().catch(() => {});
  }
}

packageList.addEventListener("click", handlePackageAction);
packageTableBody.addEventListener("click", handlePackageAction);

setPackageView(localStorage.getItem("asufaPackageView") === "table" ? "table" : "cards");
Promise.all([loadProducts(), loadComponents()]).catch((error) => setStatus(error.message, true));
