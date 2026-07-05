(() => {
  "use strict";

  const STORAGE_KEY = "splitto_user";
  const THEME_KEY = "splitto_theme";
  const SECTIONS = ["dashboard", "bollette", "storico", "statistiche", "gioco"];

  let roommates = [];
  let categories = [];
  let currentUser = loadCurrentUser();

  // ---------- utilities ----------

  function loadCurrentUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveCurrentUser(user) {
    currentUser = user;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }

  function clearCurrentUser() {
    currentUser = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  async function fetchJSON(url, options) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Errore ${res.status}`);
    }
    return data;
  }

  function formatMoney(value) {
    return Number(value).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(isoDate) {
    if (!isoDate) return "";
    const [y, m, d] = isoDate.split("-");
    return `${d}/${m}/${y}`;
  }

  function show(el) {
    if (el) el.classList.remove("hidden");
  }

  function hide(el) {
    if (el) el.classList.add("hidden");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  // ---------- avatar & category colors (deterministi, riusati ovunque) ----------

  const AVATAR_COLORS = ["#5865F2", "#23a55a", "#f23f42", "#faa61a", "#eb459e", "#3ba55c", "#949cf7"];
  const CATEGORY_COLORS = ["#5865F2", "#23a55a", "#f23f42", "#faa61a", "#eb459e", "#00b0f4", "#9c84ef", "#3ba55c"];

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function colorFor(str, palette) {
    return palette[hashString(str) % palette.length];
  }

  function initials(name) {
    return (name || "").trim().slice(0, 2).toUpperCase();
  }

  function avatarHtml(name) {
    const color = colorFor(name, AVATAR_COLORS);
    return `<span class="avatar-circle" style="background:${color}">${escapeHtml(initials(name))}</span>`;
  }

  function paintAvatarEl(el, name) {
    if (!el) return;
    el.textContent = initials(name);
    el.style.background = colorFor(name, AVATAR_COLORS);
    el.classList.add("avatar-circle");
  }

  const CATEGORY_ICONS = {
    luce: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none"><path d="M13 2 4 14h6l-1 8 11-14h-6l1-6z"/></svg>',
    gas: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none"><path d="M12.5 2c1.2 3.2-2.8 4.4-2.8 7.6a2.8 2.8 0 005.6 0c0-1-.6-1.8-.9-2.8 2.1 1.4 3.9 4.3 3.9 7.2a6.3 6.3 0 11-12.6 0C5.7 9.2 9 6.4 12.5 2z"/></svg>',
    internet: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 11.5a11.5 11.5 0 0116 0"/><path d="M7.8 15.3a6.5 6.5 0 018.4 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/></svg>',
    affitto: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    altro: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/></svg>',
  };

  function categoryIconHtml(category) {
    const key = (category || "").trim().toLowerCase();
    return CATEGORY_ICONS[key] || CATEGORY_ICONS.altro;
  }

  function categoryBadgeHtml(category) {
    const color = colorFor(category, CATEGORY_COLORS);
    return `<span class="badge category" style="background:${color}26; color:${color}">${categoryIconHtml(category)}${escapeHtml(category)}</span>`;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // ---------- skeleton loading & animated counters ----------

  function skeletonHtml(count, className = "skeleton-card") {
    return Array.from({ length: count }, () => `<div class="skeleton ${className}"></div>`).join("");
  }

  function animateValue(el, endValue, { duration = 600, suffix = "" } = {}) {
    const startTime = performance.now();
    function tick(now) {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = endValue * eased;
      el.textContent = `${formatMoney(current)}${suffix}`;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ---------- theme ----------

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(current === "dark" ? "light" : "dark");
  }

  applyTheme(localStorage.getItem(THEME_KEY) || "dark");

  // ---------- elements ----------

  const els = {
    sidebar: document.getElementById("sidebar"),
    bottomTabbar: document.getElementById("bottom-tabbar"),

    setupScreen: document.getElementById("setup-screen"),
    setupForm: document.getElementById("setup-form"),
    setupNameInputs: document.getElementById("setup-name-inputs"),
    addNameBtn: document.getElementById("add-name-btn"),
    setupError: document.getElementById("setup-error"),

    userSelectScreen: document.getElementById("user-select-screen"),
    userSelectList: document.getElementById("user-select-list"),

    balancesList: document.getElementById("balances-list"),
    settlementsBox: document.getElementById("settlements-box"),
    settlementsList: document.getElementById("settlements-list"),
    billsList: document.getElementById("bills-list"),
    upcomingBillsBox: document.getElementById("upcoming-bills-box"),
    upcomingBillsList: document.getElementById("upcoming-bills-list"),
    unclaimedBillsBox: document.getElementById("unclaimed-bills-box"),
    unclaimedBillsList: document.getElementById("unclaimed-bills-list"),
    bolletteList: document.getElementById("bollette-list"),

    userBadge: document.getElementById("current-user-badge"),
    currentUserName: document.getElementById("current-user-name"),
    currentUserAvatar: document.getElementById("current-user-avatar"),
    currentUserNameDesktop: document.getElementById("current-user-name-desktop"),
    currentUserAvatarDesktop: document.getElementById("current-user-avatar-desktop"),
    switchUserBtn: document.getElementById("switch-user-btn"),
    switchUserBtnDesktop: document.getElementById("switch-user-btn-desktop"),
    themeToggle: document.getElementById("theme-toggle"),
    themeToggleDesktop: document.getElementById("theme-toggle-desktop"),

    addBillBtn: document.getElementById("add-bill-btn"),
    addBillModal: document.getElementById("add-bill-modal"),
    closeModalBtn: document.getElementById("close-modal-btn"),
    addBillForm: document.getElementById("add-bill-form"),
    billDescription: document.getElementById("bill-description"),
    billAmount: document.getElementById("bill-amount"),
    categoryPicker: document.getElementById("category-picker"),
    customCategoryWrap: document.getElementById("custom-category-wrap"),
    billCategoryCustom: document.getElementById("bill-category-custom"),
    billDueDate: document.getElementById("bill-due-date"),
    billHistorical: document.getElementById("bill-historical"),
    billPaidBy: document.getElementById("bill-paid-by"),
    recurringWrap: document.getElementById("recurring-wrap"),
    billRecurring: document.getElementById("bill-recurring"),
    recurringFrequencyWrap: document.getElementById("recurring-frequency-wrap"),
    billRecurrenceFrequency: document.getElementById("bill-recurrence-frequency"),
    billNotes: document.getElementById("bill-notes"),
    participantsFieldset: document.getElementById("participants-fieldset"),
    participantsList: document.getElementById("participants-list"),
    splitEquallyBtn: document.getElementById("split-equally-btn"),
    splitSummary: document.getElementById("split-summary"),
    billError: document.getElementById("bill-error"),
    errorDescription: document.getElementById("error-description"),
    errorAmount: document.getElementById("error-amount"),
    errorParticipants: document.getElementById("error-participants"),

    claimBillModal: document.getElementById("claim-bill-modal"),
    closeClaimModalBtn: document.getElementById("close-claim-modal-btn"),
    claimBillForm: document.getElementById("claim-bill-form"),
    claimBillSummary: document.getElementById("claim-bill-summary"),
    claimPaidBy: document.getElementById("claim-paid-by"),
    claimParticipantsList: document.getElementById("claim-participants-list"),
    claimSplitEquallyBtn: document.getElementById("claim-split-equally-btn"),
    claimSplitSummary: document.getElementById("claim-split-summary"),
    claimBillError: document.getElementById("claim-bill-error"),
  };

  let selectedCategory = null;
  let claimingBill = null;

  // ---------- pre-login screens ----------

  function hideAllScreens() {
    [els.setupScreen, els.userSelectScreen].forEach(hide);
    SECTIONS.forEach((s) => hide(document.getElementById(`section-${s}`)));
    hide(els.addBillBtn);
    hide(els.userBadge);
    hide(els.sidebar);
    hide(els.bottomTabbar);
  }

  function showSetupScreen() {
    hideAllScreens();
    show(els.setupScreen);
  }

  function showUserSelectScreen() {
    hideAllScreens();
    els.userSelectList.innerHTML = "";
    roommates.forEach((r) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = `${avatarHtml(r.name)}<span>${escapeHtml(r.name)}</span>`;
      btn.addEventListener("click", () => selectUser(r));
      els.userSelectList.appendChild(btn);
    });
    show(els.userSelectScreen);
  }

  async function selectUser(roommate) {
    saveCurrentUser(roommate);
    await setupPushNotifications(roommate.id);
    await enterApp();
  }

  // ---------- navigation shell ----------

  function showSection(name) {
    SECTIONS.forEach((s) => {
      const el = document.getElementById(`section-${s}`);
      if (!el) return;
      if (s === name) {
        el.classList.remove("hidden");
        el.classList.remove("active");
        requestAnimationFrame(() => el.classList.add("active"));
      } else {
        el.classList.remove("active");
        el.classList.add("hidden");
      }
    });

    document.querySelectorAll("[data-section]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.section === name);
    });

    if (name === "dashboard" || name === "bollette") {
      show(els.addBillBtn);
    } else {
      hide(els.addBillBtn);
    }

    document.dispatchEvent(new CustomEvent("splitto:section-shown", { detail: { section: name } }));
  }

  document.querySelectorAll("[data-section]").forEach((btn) => {
    btn.addEventListener("click", () => showSection(btn.dataset.section));
  });

  async function enterApp() {
    hideAllScreens();
    els.currentUserName.textContent = currentUser.name;
    els.currentUserNameDesktop.textContent = currentUser.name;
    paintAvatarEl(els.currentUserAvatar, currentUser.name);
    paintAvatarEl(els.currentUserAvatarDesktop, currentUser.name);
    show(els.userBadge);
    show(els.sidebar);
    show(els.bottomTabbar);
    showSection("dashboard");
    await loadCategories();
    await refreshDashboard();
  }

  // ---------- init ----------

  async function init() {
    try {
      roommates = await fetchJSON("/api/roommates");
    } catch (e) {
      roommates = [];
    }

    if (roommates.length === 0) {
      showSetupScreen();
      return;
    }

    if (!currentUser || !roommates.some((r) => r.id === currentUser.id)) {
      showUserSelectScreen();
      return;
    }

    await enterApp();
    setupPushNotifications(currentUser.id);
  }

  // ---------- setup form ----------

  els.addNameBtn.addEventListener("click", () => {
    const count = els.setupNameInputs.querySelectorAll(".setup-name").length;
    if (count >= 3) return;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "setup-name";
    input.placeholder = `Nome ${count + 1}`;
    input.required = true;
    els.setupNameInputs.appendChild(input);
    if (count + 1 >= 3) {
      els.addNameBtn.classList.add("hidden");
    }
  });

  els.setupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hide(els.setupError);
    const names = Array.from(els.setupNameInputs.querySelectorAll(".setup-name")).map((i) => i.value.trim());

    try {
      await fetchJSON("/api/roommates/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      roommates = await fetchJSON("/api/roommates");
      showUserSelectScreen();
    } catch (err) {
      els.setupError.textContent = err.message;
      show(els.setupError);
    }
  });

  // ---------- switch user / theme ----------

  function switchUser() {
    clearCurrentUser();
    showUserSelectScreen();
  }

  els.switchUserBtn.addEventListener("click", switchUser);
  els.switchUserBtnDesktop.addEventListener("click", switchUser);
  els.themeToggle.addEventListener("click", toggleTheme);
  els.themeToggleDesktop.addEventListener("click", toggleTheme);

  // ---------- dashboard: balances + scadenzario ----------

  async function loadBalances() {
    if (!els.balancesList.children.length) {
      els.balancesList.innerHTML = skeletonHtml(roommates.length || 3);
    }
    const data = await fetchJSON("/api/balances");

    els.balancesList.innerHTML = "";
    data.balances.forEach((b) => {
      const card = document.createElement("div");
      let cls = "neutral";
      if (b.balance > 0.01) cls = "positive";
      else if (b.balance < -0.01) cls = "negative";
      card.className = `balance-card ${cls}`;

      const sign = b.balance > 0 ? "+" : "";
      card.innerHTML = `
        <span class="name">${avatarHtml(b.name)}${escapeHtml(b.name)}</span>
        <span class="amount">${sign}${formatMoney(b.balance)} EUR</span>
      `;
      els.balancesList.appendChild(card);
    });

    els.settlementsList.innerHTML = "";
    if (data.settlements.length === 0) {
      hide(els.settlementsBox);
    } else {
      show(els.settlementsBox);
      data.settlements.forEach((s) => {
        const li = document.createElement("li");
        li.textContent = `${s.from_name} deve dare ${formatMoney(s.amount)} EUR a ${s.to_name}`;
        els.settlementsList.appendChild(li);
      });
    }
  }

  const STATUS_LABELS = {
    scaduta: "Scaduta",
    in_scadenza: "In scadenza",
    da_pagare: "Da pagare",
    saldata: "Saldata",
    non_pagata: "Nessuno ha ancora pagato",
  };

  function renderUpcomingBills(bills) {
    const urgent = bills
      .filter((b) => b.lifecycle_status === "scaduta" || b.lifecycle_status === "in_scadenza")
      .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));

    els.upcomingBillsList.innerHTML = "";
    if (urgent.length === 0) {
      hide(els.upcomingBillsBox);
      return;
    }
    show(els.upcomingBillsBox);

    urgent.forEach((bill) => {
      const row = document.createElement("div");
      row.className = "upcoming-bill-row";
      row.innerHTML = `
        <div>
          <div class="bill-title">${escapeHtml(bill.description)}</div>
          <div class="bill-meta">scadenza ${formatDate(bill.due_date)}</div>
        </div>
        <span class="badge status-${bill.lifecycle_status}">${STATUS_LABELS[bill.lifecycle_status]}</span>
      `;
      els.upcomingBillsList.appendChild(row);
    });
  }

  // ---------- bollette in attesa di un pagante ----------

  function renderUnclaimedBills(bills) {
    const unclaimed = bills.filter((b) => b.lifecycle_status === "non_pagata");

    els.unclaimedBillsList.innerHTML = "";
    if (unclaimed.length === 0) {
      hide(els.unclaimedBillsBox);
      return;
    }
    show(els.unclaimedBillsBox);

    unclaimed.forEach((bill) => {
      const row = document.createElement("div");
      row.className = "upcoming-bill-row";
      row.innerHTML = `
        <div>
          <div class="bill-title">${escapeHtml(bill.description)}</div>
          <div class="bill-meta">${categoryBadgeHtml(bill.category)}${formatMoney(bill.amount_total)} EUR${
        bill.due_date ? " &middot; scad. " + formatDate(bill.due_date) : ""
      }</div>
        </div>
        <button type="button" class="secondary-btn claim-btn">Salda ora</button>
      `;
      row.querySelector(".claim-btn").addEventListener("click", () => openClaimModal(bill));
      els.unclaimedBillsList.appendChild(row);
    });
  }

  // ---------- bill card renderer (shared: dashboard + bollette section) ----------

  function renderBillCard(bill) {
    const allPaid = bill.splits.length > 0 && bill.splits.every((s) => s.paid);
    const status = bill.lifecycle_status || (allPaid ? "saldata" : "da_pagare");
    const card = document.createElement("div");
    card.className = "bill-card";

    card.innerHTML = `
      <div class="bill-card-header">
        <div>
          <div class="bill-title">${escapeHtml(bill.description)}${bill.is_recurring ? " &#8635;" : ""}</div>
          <div class="bill-meta">
            ${categoryBadgeHtml(bill.category)}
            ${bill.paid_by_name ? "pagato da " + escapeHtml(bill.paid_by_name) : "nessuno ha ancora pagato"}${bill.due_date ? " &middot; scad. " + formatDate(bill.due_date) : ""}
          </div>
          <span class="badge status-${status}">${STATUS_LABELS[status] || status}</span>
        </div>
        <div class="bill-amount">${formatMoney(bill.amount_total)} EUR</div>
      </div>
      ${bill.notes ? `<div class="bill-notes">${escapeHtml(bill.notes)}</div>` : ""}
      ${status === "non_pagata" ? '<button type="button" class="secondary-btn claim-btn">Segna che hai pagato tu</button>' : ""}
      <div class="bill-splits"></div>
    `;

    if (status === "non_pagata") {
      card.querySelector(".claim-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        openClaimModal(bill);
      });
    }

    const splitsContainer = card.querySelector(".bill-splits");
    bill.splits.forEach((split) => {
      const row = document.createElement("div");
      row.className = "split-row";
      row.innerHTML = `
        <span>${escapeHtml(split.roommate_name)}</span>
        <span>
          <span class="split-amount">${formatMoney(split.amount_due)} EUR</span>
          <button type="button" class="split-toggle ${split.paid ? "paid" : "unpaid"}">
            ${split.paid ? "Saldata" : "Da saldare"}
          </button>
        </span>
      `;
      const toggleBtn = row.querySelector(".split-toggle");
      toggleBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const willBePaid = !split.paid;
        if (willBePaid) {
          toggleBtn.classList.add("just-paid");
        }
        await fetchJSON(`/api/splits/${split.id}/toggle`, { method: "POST" });
        setTimeout(() => {
          refreshDashboard();
          if (!document.getElementById("section-bollette").classList.contains("hidden")) {
            loadBolletteSection();
          }
        }, 350);
      });
      splitsContainer.appendChild(row);
    });

    card.addEventListener("click", () => card.classList.toggle("expanded"));

    return card;
  }

  async function loadBills() {
    if (!els.billsList.children.length) {
      els.billsList.innerHTML = skeletonHtml(3);
    }
    const bills = await fetchJSON("/api/bills");
    els.billsList.innerHTML = "";

    if (bills.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Nessuna bolletta ancora. Tocca + per aggiungerne una.";
      els.billsList.appendChild(empty);
    } else {
      bills.forEach((bill) => els.billsList.appendChild(renderBillCard(bill)));
    }

    renderUnclaimedBills(bills);
    renderUpcomingBills(bills);
    return bills;
  }

  async function refreshDashboard() {
    await Promise.all([loadBalances(), loadBills()]);
  }

  // ---------- sezione Bollette ----------

  async function loadBolletteSection() {
    if (!els.bolletteList.children.length) {
      els.bolletteList.innerHTML = skeletonHtml(4);
    }
    const bills = await fetchJSON("/api/bills");
    const open = bills.filter((b) => b.lifecycle_status !== "saldata");

    els.bolletteList.innerHTML = "";
    if (open.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Nessuna bolletta aperta al momento.";
      els.bolletteList.appendChild(empty);
      return;
    }
    open.forEach((bill) => els.bolletteList.appendChild(renderBillCard(bill)));
  }

  document.addEventListener("splitto:section-shown", (e) => {
    if (e.detail.section === "bollette") loadBolletteSection();
  });

  // ---------- categories ----------

  async function loadCategories() {
    categories = await fetchJSON("/api/categories");
  }

  // ---------- helper condivisi: partecipanti / quote (add-bill + claim) ----------

  function buildParticipantsRows(containerEl, { onChange } = {}) {
    containerEl.innerHTML = "";
    roommates.forEach((r) => {
      const row = document.createElement("div");
      row.className = "participant-row";
      row.innerHTML = `
        <label>
          <input type="checkbox" class="participant-checkbox" value="${r.id}">
          ${avatarHtml(r.name)}${escapeHtml(r.name)}
        </label>
        <input type="number" class="participant-amount" step="0.01" min="0" placeholder="0.00" disabled>
      `;
      const checkbox = row.querySelector(".participant-checkbox");
      const amountInput = row.querySelector(".participant-amount");
      checkbox.addEventListener("change", () => {
        amountInput.disabled = !checkbox.checked;
        if (!checkbox.checked) amountInput.value = "";
        if (onChange) onChange();
      });
      amountInput.addEventListener("input", () => {
        if (onChange) onChange();
      });
      containerEl.appendChild(row);
    });
  }

  function readSplits(containerEl) {
    const splits = [];
    containerEl.querySelectorAll(".participant-row").forEach((row) => {
      const checkbox = row.querySelector(".participant-checkbox");
      const amountInput = row.querySelector(".participant-amount");
      if (checkbox.checked) {
        const amount = parseFloat(amountInput.value);
        if (!isNaN(amount)) {
          splits.push({ roommate_id: parseInt(checkbox.value, 10), amount });
        }
      }
    });
    return splits;
  }

  function splitEquallyInto(containerEl, totalAmount) {
    const checked = Array.from(containerEl.querySelectorAll(".participant-checkbox:checked"));
    if (checked.length === 0 || isNaN(totalAmount) || totalAmount <= 0) return;

    const base = Math.floor((totalAmount / checked.length) * 100) / 100;
    let remainder = Math.round((totalAmount - base * checked.length) * 100);

    checked.forEach((checkbox) => {
      const row = checkbox.closest(".participant-row");
      const amountInput = row.querySelector(".participant-amount");
      let amount = base;
      if (remainder > 0) {
        amount += 0.01;
        remainder -= 1;
      }
      amountInput.value = amount.toFixed(2);
    });
  }

  function updateSplitSummary(summaryEl, containerEl, targetAmount) {
    const splits = readSplits(containerEl);
    const assigned = splits.reduce((sum, s) => sum + s.amount, 0);
    summaryEl.classList.remove("match", "mismatch");

    if (isNaN(targetAmount) || targetAmount <= 0) {
      summaryEl.textContent = `Totale assegnato: ${assigned.toFixed(2)} EUR`;
      return;
    }
    const matches = Math.abs(assigned - targetAmount) < 0.01;
    summaryEl.textContent = `Totale assegnato: ${assigned.toFixed(2)} EUR / ${targetAmount.toFixed(2)} EUR`;
    summaryEl.classList.add(matches ? "match" : "mismatch");
  }

  // ---------- selettore categoria con icone ----------

  function renderCategoryPicker() {
    els.categoryPicker.innerHTML = "";
    categories.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "category-pill";
      btn.dataset.category = c;
      btn.innerHTML = `${categoryIconHtml(c)}<span>${escapeHtml(c)}</span>`;
      btn.addEventListener("click", () => selectCategory(c));
      els.categoryPicker.appendChild(btn);
    });

    const customBtn = document.createElement("button");
    customBtn.type = "button";
    customBtn.className = "category-pill";
    customBtn.dataset.category = "__custom__";
    customBtn.innerHTML = `${categoryIconHtml("altro")}<span>+ Nuova</span>`;
    customBtn.addEventListener("click", () => selectCategory("__custom__"));
    els.categoryPicker.appendChild(customBtn);
  }

  function selectCategory(category) {
    selectedCategory = category;
    els.categoryPicker.querySelectorAll(".category-pill").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.category === category);
    });
    if (category === "__custom__") {
      show(els.customCategoryWrap);
      els.billCategoryCustom.focus();
    } else {
      hide(els.customCategoryWrap);
    }
  }

  // ---------- add bill modal ----------

  function updateParticipantsVisibility() {
    const hasPayer = !!els.billPaidBy.value;
    if (hasPayer) {
      show(els.participantsFieldset);
      show(els.recurringWrap);
    } else {
      hide(els.participantsFieldset);
      hide(els.recurringWrap);
      els.billRecurring.checked = false;
      hide(els.recurringFrequencyWrap);
    }
  }

  function openAddBillModal() {
    els.addBillForm.reset();
    [els.billError, els.errorDescription, els.errorAmount, els.errorParticipants, els.customCategoryWrap, els.recurringFrequencyWrap].forEach(
      hide
    );

    renderCategoryPicker();
    selectCategory(categories[0] || "altro");

    els.billPaidBy.innerHTML = '<option value="">Nessuno ancora (da pagare)</option>';
    roommates.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name;
      if (currentUser && r.id === currentUser.id) opt.selected = true;
      els.billPaidBy.appendChild(opt);
    });

    buildParticipantsRows(els.participantsList, {
      onChange: () => updateSplitSummary(els.splitSummary, els.participantsList, parseFloat(els.billAmount.value)),
    });
    updateSplitSummary(els.splitSummary, els.participantsList, NaN);
    updateParticipantsVisibility();

    show(els.addBillModal);
  }

  function closeAddBillModal() {
    hide(els.addBillModal);
  }

  els.addBillBtn.addEventListener("click", openAddBillModal);
  els.closeModalBtn.addEventListener("click", closeAddBillModal);

  els.billPaidBy.addEventListener("change", updateParticipantsVisibility);

  els.billHistorical.addEventListener("change", () => {
    if (els.billHistorical.checked) {
      els.billRecurring.checked = false;
      hide(els.recurringFrequencyWrap);
      hide(els.recurringWrap);
    } else {
      updateParticipantsVisibility();
    }
  });

  els.billRecurring.addEventListener("change", () => {
    if (els.billRecurring.checked) {
      show(els.recurringFrequencyWrap);
    } else {
      hide(els.recurringFrequencyWrap);
    }
  });

  els.billAmount.addEventListener("input", () => {
    updateSplitSummary(els.splitSummary, els.participantsList, parseFloat(els.billAmount.value));
  });

  els.splitEquallyBtn.addEventListener("click", () => {
    const total = parseFloat(els.billAmount.value);
    splitEquallyInto(els.participantsList, total);
    updateSplitSummary(els.splitSummary, els.participantsList, total);
  });

  els.addBillForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    [els.billError, els.errorDescription, els.errorAmount, els.errorParticipants].forEach(hide);

    const description = els.billDescription.value.trim();
    const amountTotal = parseFloat(els.billAmount.value);
    let category = selectedCategory;
    if (category === "__custom__") {
      category = els.billCategoryCustom.value.trim() || "altro";
    }
    const dueDate = els.billDueDate.value || null;
    const paidBy = els.billPaidBy.value ? parseInt(els.billPaidBy.value, 10) : null;
    const notes = els.billNotes.value.trim();
    const isHistorical = els.billHistorical.checked;
    const isRecurring = !!paidBy && !isHistorical && els.billRecurring.checked;
    const recurrenceFrequency = isRecurring ? els.billRecurrenceFrequency.value : null;
    const splits = paidBy || isHistorical ? readSplits(els.participantsList) : [];

    let hasError = false;
    if (!description) {
      show(els.errorDescription);
      hasError = true;
    }
    if (isNaN(amountTotal) || amountTotal <= 0) {
      show(els.errorAmount);
      hasError = true;
    }
    if (isHistorical && !paidBy) {
      els.billError.textContent = "Una bolletta storica deve indicare chi l'ha pagata.";
      show(els.billError);
      hasError = true;
    }
    if ((paidBy || isHistorical) && splits.length === 0) {
      show(els.errorParticipants);
      hasError = true;
    }
    if (hasError) return;

    try {
      await fetchJSON("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          amount_total: amountTotal,
          category,
          due_date: dueDate,
          paid_by: paidBy,
          notes,
          is_recurring: isRecurring,
          recurrence_frequency: recurrenceFrequency,
          is_historical: isHistorical,
          inserted_by: currentUser.id,
          splits,
        }),
      });
      closeAddBillModal();
      await Promise.all([refreshDashboard(), loadCategories()]);
      if (!document.getElementById("section-bollette").classList.contains("hidden")) {
        loadBolletteSection();
      }
    } catch (err) {
      els.billError.textContent = err.message;
      show(els.billError);
    }
  });

  // ---------- claim modal: qualcuno si assegna il pagamento ----------

  function openClaimModal(bill) {
    claimingBill = bill;
    hide(els.claimBillError);
    els.claimBillSummary.textContent = `${bill.description} — ${formatMoney(bill.amount_total)} EUR`;

    els.claimPaidBy.innerHTML = "";
    roommates.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name;
      if (currentUser && r.id === currentUser.id) opt.selected = true;
      els.claimPaidBy.appendChild(opt);
    });

    buildParticipantsRows(els.claimParticipantsList, {
      onChange: () => updateSplitSummary(els.claimSplitSummary, els.claimParticipantsList, bill.amount_total),
    });
    updateSplitSummary(els.claimSplitSummary, els.claimParticipantsList, bill.amount_total);

    show(els.claimBillModal);
  }

  function closeClaimModal() {
    hide(els.claimBillModal);
    claimingBill = null;
  }

  els.closeClaimModalBtn.addEventListener("click", closeClaimModal);

  els.claimSplitEquallyBtn.addEventListener("click", () => {
    if (!claimingBill) return;
    splitEquallyInto(els.claimParticipantsList, claimingBill.amount_total);
    updateSplitSummary(els.claimSplitSummary, els.claimParticipantsList, claimingBill.amount_total);
  });

  els.claimBillForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hide(els.claimBillError);
    if (!claimingBill) return;

    const paidBy = parseInt(els.claimPaidBy.value, 10);
    const splits = readSplits(els.claimParticipantsList);

    if (!splits.length) {
      els.claimBillError.textContent = "Seleziona almeno un partecipante e indica un importo.";
      show(els.claimBillError);
      return;
    }

    try {
      await fetchJSON(`/api/bills/${claimingBill.id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid_by: paidBy, splits, inserted_by: currentUser.id }),
      });
      closeClaimModal();
      await refreshDashboard();
      if (!document.getElementById("section-bollette").classList.contains("hidden")) {
        loadBolletteSection();
      }
    } catch (err) {
      els.claimBillError.textContent = err.message;
      show(els.claimBillError);
    }
  });

  // ---------- push notifications ----------

  async function setupPushNotifications(roommateId) {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      const { publicKey } = await fetchJSON("/api/vapid-public-key");
      if (!publicKey) return;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      await fetchJSON("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roommate_id: roommateId, subscription: subscription.toJSON() }),
      });
    } catch (err) {
      console.warn("Impossibile attivare le notifiche push:", err);
    }
  }

  // ---------- shared namespace for history.js / statistics.js / game.js ----------

  window.Splitto = {
    fetchJSON,
    formatMoney,
    formatDate,
    escapeHtml,
    show,
    hide,
    avatarHtml,
    categoryBadgeHtml,
    categoryIconHtml,
    skeletonHtml,
    animateValue,
    getCurrentUser: () => currentUser,
    getRoommates: () => roommates,
    getCategories: () => categories,
    onSectionShown(section, handler) {
      document.addEventListener("splitto:section-shown", (e) => {
        if (e.detail.section === section) handler();
      });
    },
  };

  init();
})();
