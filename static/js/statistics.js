(() => {
  "use strict";

  const els = {
    tabButtons: document.querySelectorAll("#section-statistiche .tab-btn"),
    panelPanoramica: document.getElementById("stats-panoramica"),
    panelPrevisioni: document.getElementById("stats-previsioni"),
    period: document.getElementById("stats-period"),
    statCards: document.getElementById("stat-cards"),
    paidComparisonList: document.getElementById("paid-comparison-list"),
    predictionsList: document.getElementById("predictions-list"),
  };

  const CHART_COLORS = ["#5865F2", "#23a55a", "#f23f42", "#faa61a", "#eb459e", "#3ba55c", "#949cf7"];

  let categoryChart = null;
  let monthlyChart = null;
  const sparklineCharts = [];

  function textColor() {
    return getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#f2f3f5";
  }

  function switchStatsTab(tab) {
    els.tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
    if (tab === "panoramica") {
      Splitto.show(els.panelPanoramica);
      Splitto.hide(els.panelPrevisioni);
      loadStatistics();
    } else {
      Splitto.hide(els.panelPanoramica);
      Splitto.show(els.panelPrevisioni);
      loadPredictions();
    }
  }

  els.tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => switchStatsTab(btn.dataset.tab));
  });

  els.period.addEventListener("change", loadStatistics);

  async function loadStatistics() {
    if (!els.statCards.children.length) {
      els.statCards.innerHTML = Splitto.skeletonHtml(4);
    }
    const data = await Splitto.fetchJSON(`/api/statistics?period=${els.period.value}`);

    const perRoommateCards = data.total_outstanding_by_roommate
      .map(
        (r) => `
        <div class="stat-card">
          <div class="stat-label">${Splitto.escapeHtml(r.name)}</div>
          <div class="stat-value" data-value="${r.amount}">0,00 EUR</div>
        </div>
      `
      )
      .join("");

    els.statCards.innerHTML = `
      <div class="stat-card highlight">
        <div class="stat-label">Totale ancora da pagare</div>
        <div class="stat-value" data-value="${data.total_outstanding}">0,00 EUR</div>
      </div>
      ${perRoommateCards}
    `;

    els.statCards.querySelectorAll(".stat-value").forEach((el) => {
      Splitto.animateValue(el, parseFloat(el.dataset.value), { suffix: " EUR" });
    });

    els.paidComparisonList.innerHTML = "";
    data.paid_by_roommate.forEach((r) => {
      const card = document.createElement("div");
      card.className = "balance-card neutral";
      card.innerHTML = `<span class="name">${Splitto.escapeHtml(r.name)}</span><span class="amount">${Splitto.formatMoney(r.total)} EUR</span>`;
      els.paidComparisonList.appendChild(card);
    });

    renderCategoryChart(data.by_category);
    renderMonthlyChart(data.monthly_trend);
  }

  function renderCategoryChart(byCategory) {
    const ctx = document.getElementById("chart-category");
    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: byCategory.map((c) => c.category),
        datasets: [
          {
            data: byCategory.map((c) => c.total),
            backgroundColor: byCategory.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
          },
        ],
      },
      options: { plugins: { legend: { labels: { color: textColor() } } } },
    });
  }

  function renderMonthlyChart(monthlyTrend) {
    const ctx = document.getElementById("chart-monthly");
    if (monthlyChart) monthlyChart.destroy();
    monthlyChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: monthlyTrend.map((m) => m.month),
        datasets: [
          {
            label: "Spesa totale",
            data: monthlyTrend.map((m) => m.total),
            backgroundColor: "#5865F2",
          },
        ],
      },
      options: {
        scales: {
          x: { ticks: { color: textColor() }, grid: { color: "rgba(255,255,255,0.06)" } },
          y: { ticks: { color: textColor() }, grid: { color: "rgba(255,255,255,0.06)" } },
        },
        plugins: { legend: { labels: { color: textColor() } } },
      },
    });
  }

  async function loadPredictions() {
    if (!els.predictionsList.children.length) {
      els.predictionsList.innerHTML = Splitto.skeletonHtml(2, "skeleton-card");
    }
    const predictions = await Splitto.fetchJSON("/api/predictions");
    els.predictionsList.innerHTML = "";
    sparklineCharts.forEach((c) => c.destroy());
    sparklineCharts.length = 0;

    if (predictions.length === 0) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = "Nessuna bolletta inserita ancora: aggiungi qualche bolletta per vedere le previsioni.";
      els.predictionsList.appendChild(p);
      return;
    }

    predictions.forEach((pred, index) => {
      const card = document.createElement("div");
      card.className = "card prediction-card";

      if (pred.insufficient_data) {
        card.innerHTML = `
          <h3>${Splitto.escapeHtml(pred.category)}</h3>
          <p class="hint">Serve piu' storico per una previsione affidabile (${pred.count}/3 bollette registrate).</p>
        `;
      } else {
        const trendIcon = pred.trend === "in aumento" ? "&#8599;" : pred.trend === "in calo" ? "&#8600;" : "&#8594;";
        card.innerHTML = `
          <h3>${Splitto.escapeHtml(pred.category)}</h3>
          <div class="prediction-amount">${Splitto.formatMoney(pred.predicted_amount)} EUR <span class="trend-icon">${trendIcon}</span></div>
          <div class="bill-meta">Prossima stima &middot; trend ${pred.trend}</div>
          <canvas class="prediction-sparkline" id="sparkline-${index}"></canvas>
        `;
      }
      els.predictionsList.appendChild(card);

      if (!pred.insufficient_data) {
        const ctx = document.getElementById(`sparkline-${index}`);
        const labels = pred.history.map((h) => Splitto.formatDate(h.date)).concat(["previsto"]);
        const values = pred.history.map((h) => h.amount).concat([pred.predicted_amount]);

        sparklineCharts.push(
          new Chart(ctx, {
            type: "line",
            data: {
              labels,
              datasets: [
                {
                  data: values,
                  borderColor: "#5865F2",
                  backgroundColor: "rgba(88, 101, 242, 0.15)",
                  pointBackgroundColor: values.map((_, i) => (i === values.length - 1 ? "#faa61a" : "#5865F2")),
                  fill: true,
                  tension: 0.3,
                },
              ],
            },
            options: {
              plugins: { legend: { display: false } },
              scales: { x: { display: false }, y: { display: false } },
            },
          })
        );
      }
    });
  }

  Splitto.onSectionShown("statistiche", () => switchStatsTab("panoramica"));
})();
