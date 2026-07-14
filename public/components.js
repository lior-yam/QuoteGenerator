const componentForm = document.querySelector("#componentForm");
const componentTableBody = document.querySelector("#componentTableBody");
const componentCount = document.querySelector("#componentCount");
const componentSubmit = document.querySelector("#componentSubmit");
const cancelComponentEdit = document.querySelector("#cancelComponentEdit");
const boldComponentText = document.querySelector("#boldComponentText");
const statusMessage = document.querySelector("#status");
const hebrewCollator = new Intl.Collator("he", { sensitivity: "base", numeric: true });

let currentComponents = [];
let editingComponentId = "";

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

function componentDisplayText(component) {
  return component.defaultText || component.componentName;
}

function sortedComponents(components) {
  return [...components].sort((a, b) => hebrewCollator.compare(a.componentName || "", b.componentName || ""));
}

function renderComponents(components) {
  currentComponents = sortedComponents(components);
  componentCount.textContent = `${currentComponents.length} מוצרים`;

  if (!currentComponents.length) {
    componentTableBody.innerHTML = '<tr><td colspan="4" class="empty-table-cell">עדיין אין מוצרים בבנק.</td></tr>';
    return;
  }

  componentTableBody.innerHTML = currentComponents
    .map((component) => `
      <tr>
        <td class="strong-cell">${escapeHtml(component.componentName)}</td>
        <td class="details-cell">${formatInlineText(componentDisplayText(component))}</td>
        <td>${escapeHtml(component.category || "כללי")}</td>
        <td>
          <div class="table-actions">
            <button class="edit-button" type="button" data-component-edit-id="${escapeHtml(component.id)}">ערוך</button>
            <button class="delete-button" type="button" data-component-delete-id="${escapeHtml(component.id)}">מחק</button>
          </div>
        </td>
      </tr>
    `)
    .join("");
}

function wrapTextareaSelectionWithBold(textarea) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = textarea.value.slice(start, end) || "טקסט מודגש";
  const replacement = `**${selectedText}**`;

  textarea.setRangeText(replacement, start, end, "select");
  textarea.focus();
}

function resetComponentForm() {
  componentForm.reset();
  editingComponentId = "";
  componentSubmit.textContent = "שמור מוצר";
  cancelComponentEdit.hidden = true;
}

async function loadComponents() {
  const response = await fetch("/api/components");

  if (!response.ok) {
    throw new Error("לא הצלחתי לטעון את בנק המוצרים.");
  }

  renderComponents(await response.json());
}

function startComponentEdit(componentId) {
  const component = currentComponents.find((candidate) => candidate.id === componentId);

  if (!component) {
    setStatus("לא מצאתי את המוצר לעריכה.", true);
    return;
  }

  editingComponentId = component.id;
  componentForm.componentName.value = component.componentName;
  componentForm.defaultText.value = component.defaultText || component.componentName;
  componentForm.category.value = component.category || "";
  componentSubmit.textContent = "שמור שינויים";
  cancelComponentEdit.hidden = false;
  setStatus("אפשר לערוך מוצר חוזר. מארזים קיימים לא משתנים אוטומטית.");
  componentForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function deleteComponent(componentId) {
  const component = currentComponents.find((candidate) => candidate.id === componentId);

  if (!component) {
    setStatus("לא מצאתי את המוצר למחיקה.", true);
    return;
  }

  const approved = window.confirm(`למחוק את "${component.componentName}" מבנק המוצרים?`);

  if (!approved) {
    return;
  }

  setStatus("מוחק מוצר...");

  const response = await fetch(`/api/components/${encodeURIComponent(componentId)}`, {
    method: "DELETE"
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "מחיקת המוצר נכשלה.");
  }

  if (editingComponentId === componentId) {
    resetComponentForm();
  }

  setStatus("המוצר נמחק.");
  await loadComponents();
}

boldComponentText.addEventListener("click", () => wrapTextareaSelectionWithBold(componentForm.defaultText));

componentForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(componentForm);

  componentSubmit.disabled = true;
  setStatus(editingComponentId ? "שומר שינויים במוצר..." : "שומר מוצר...");

  try {
    const endpoint = editingComponentId ? `/api/components/${encodeURIComponent(editingComponentId)}` : "/api/components";
    const response = await fetch(endpoint, {
      method: editingComponentId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        componentName: formData.get("componentName"),
        defaultText: formData.get("defaultText"),
        category: formData.get("category")
      })
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "שמירת המוצר נכשלה.");
    }

    const wasEditing = Boolean(editingComponentId);
    resetComponentForm();
    setStatus(wasEditing ? "השינויים במוצר נשמרו." : "המוצר נשמר בבנק.");
    await loadComponents();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    componentSubmit.disabled = false;
  }
});

cancelComponentEdit.addEventListener("click", () => {
  resetComponentForm();
  setStatus("");
});

componentTableBody.addEventListener("click", async (event) => {
  const editId = event.target.dataset.componentEditId;
  const deleteId = event.target.dataset.componentDeleteId;

  try {
    if (editId) {
      startComponentEdit(editId);
    }

    if (deleteId) {
      await deleteComponent(deleteId);
    }
  } catch (error) {
    setStatus(error.message, true);
  }
});

loadComponents().catch((error) => setStatus(error.message, true));
