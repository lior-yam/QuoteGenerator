const savedQuotesBody = document.querySelector("#savedQuotesBody");
const quoteSearch = document.querySelector("#quoteSearch");
const statusMessage = document.querySelector("#status");

let savedQuotes = [];

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

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function quoteSearchText(quote) {
  return [
    quote.recipientCompany,
    quote.contactPerson,
    quote.customerPhone,
    quote.customerEmail,
    quote.quoteNumber
  ].join(" ").toLowerCase();
}

function packageSummary(quote) {
  const rows = Array.isArray(quote.selectedProducts) ? quote.selectedProducts : [];
  const quantity = rows[0]?.quantity;
  const hasMixedQuantities = rows.some((row) => row.quantity !== quantity);

  if (!rows.length) {
    return "אין מארזים";
  }

  if (!quantity) {
    return `${rows.length} סוגים`;
  }

  return hasMixedQuantities ? `${rows.length} סוגים, כמויות שונות` : `${rows.length} סוגים, כמות ${quantity}`;
}

function actionLink(href, label, className = "") {
  return `<a class="${className}" href="${href}">${label}</a>`;
}

function renderSavedQuotes() {
  const query = quoteSearch.value.trim().toLowerCase();
  const filteredQuotes = savedQuotes
    .filter((quote) => !query || quoteSearchText(quote).includes(query))
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

  if (!filteredQuotes.length) {
    savedQuotesBody.innerHTML = '<tr><td colspan="5" class="empty-table-cell">עדיין אין הצעות שמורות.</td></tr>';
    return;
  }

  savedQuotesBody.innerHTML = filteredQuotes
    .map((quote) => {
      const editUrl = `/quote?savedQuoteId=${encodeURIComponent(quote.id)}`;
      const duplicateUrl = `/quote?duplicateQuoteId=${encodeURIComponent(quote.id)}`;
      const pdfUrl = quote.pdfUrl || "";

      return `
        <tr>
          <td class="strong-cell">
            ${escapeHtml(quote.recipientCompany)}
            <div class="muted-cell">${escapeHtml(quote.quoteNumber || "")}</div>
            <div class="muted-cell">${escapeHtml(quote.contactPerson || "")}</div>
          </td>
          <td>${escapeHtml(formatDate(quote.quoteDate))}</td>
          <td>${escapeHtml(formatDate(quote.updatedAt))}</td>
          <td>${escapeHtml(packageSummary(quote))}</td>
          <td>
            <div class="table-actions saved-quote-actions">
              ${actionLink(editUrl, "ערוך", "edit-button")}
              ${actionLink(duplicateUrl, "שכפל", "secondary-action")}
              ${pdfUrl ? actionLink(`${pdfUrl}?t=${Date.now()}`, quote.isPrintableHtml ? "הדפסה" : "PDF", "ghost-action") : ""}
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function loadSavedQuotes() {
  const response = await fetch("/api/saved-quotes");

  if (!response.ok) {
    throw new Error("לא הצלחתי לטעון את ההצעות השמורות.");
  }

  savedQuotes = await response.json();
  renderSavedQuotes();
}

quoteSearch.addEventListener("input", renderSavedQuotes);

loadSavedQuotes().catch((error) => setStatus(error.message, true));
