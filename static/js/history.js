(() => {
  "use strict";

  const els = {
    filterCategory: document.getElementById("history-filter-category"),
    filterRoommate: document.getElementById("history-filter-roommate"),
    filterYear: document.getElementById("history-filter-year"),
    filterMonth: document.getElementById("history-filter-month"),
    sort: document.getElementById("history-sort"),
    order: document.getElementById("history-order"),
    tableBody: document.getElementById("history-table-body"),
    cardsList: document.getElementById("history-cards-list"),
  };

  let populated = false;

  function populateFilters() {
    const categories = Splitto.getCategories();
    const roommates = Splitto.getRoommates();
    if (populated || categories.length === 0 || roommates.length === 0) return;
    populated = true;

    categories.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      els.filterCategory.appendChild(opt);
    });

    roommates.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name;
      els.filterRoommate.appendChild(opt);
    });

    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= currentYear - 5; y--) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      els.filterYear.appendChild(opt);
    }
  }

  function buildQuery() {
    const params = new URLSearchParams({ only_history: "true" });
    if (els.filterCategory.value) params.set("category", els.filterCategory.value);
    if (els.filterRoommate.value) params.set("roommate_id", els.filterRoommate.value);
    if (els.filterYear.value) params.set("year", els.filterYear.value);
    if (els.filterMonth.value) params.set("month", els.filterMonth.value);
    params.set("sort", els.sort.value);
    params.set("order", els.order.value);
    return params.toString();
  }

  function renderTable(bills) {
    els.tableBody.innerHTML = "";
    if (bills.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="5" class="hint">Nessuna bolletta nello storico con questi filtri.</td>`;
      els.tableBody.appendChild(tr);
      return;
    }
    bills.forEach((bill) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${Splitto.formatDate(bill.due_date) || "-"}</td>
        <td>${Splitto.escapeHtml(bill.description)}</td>
        <td>${Splitto.categoryBadgeHtml(bill.category)}</td>
        <td>${Splitto.formatMoney(bill.amount_total)} EUR</td>
        <td>${Splitto.escapeHtml(bill.paid_by_name)}</td>
      `;
      els.tableBody.appendChild(tr);
    });
  }

  function renderCards(bills) {
    els.cardsList.innerHTML = "";
    if (bills.length === 0) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = "Nessuna bolletta nello storico con questi filtri.";
      els.cardsList.appendChild(p);
      return;
    }
    bills.forEach((bill) => {
      const card = document.createElement("div");
      card.className = "bill-card";
      card.innerHTML = `
        <div class="bill-card-header">
          <div>
            <div class="bill-title">${Splitto.escapeHtml(bill.description)}</div>
            <div class="bill-meta">
              ${Splitto.categoryBadgeHtml(bill.category)}
              pagato da ${Splitto.escapeHtml(bill.paid_by_name)}${
        bill.due_date ? " &middot; " + Splitto.formatDate(bill.due_date) : ""
      }
            </div>
          </div>
          <div class="bill-amount">${Splitto.formatMoney(bill.amount_total)} EUR</div>
        </div>
      `;
      els.cardsList.appendChild(card);
    });
  }

  async function loadHistory() {
    populateFilters();
    if (!els.tableBody.children.length) {
      els.cardsList.innerHTML = Splitto.skeletonHtml(4);
    }
    const bills = await Splitto.fetchJSON(`/api/bills?${buildQuery()}`);
    renderTable(bills);
    renderCards(bills);
  }

  [els.filterCategory, els.filterRoommate, els.filterYear, els.filterMonth, els.sort, els.order].forEach((el) => {
    el.addEventListener("change", loadHistory);
  });

  Splitto.onSectionShown("storico", loadHistory);
})();
