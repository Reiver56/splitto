(() => {
  "use strict";

  const GRID_SIZE = 5;
  const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
  const CHECKPOINT_COUNT = 6;

  const els = {
    statusBox: document.getElementById("game-status-box"),
    container: document.getElementById("game-container"),
    leaderboardList: document.getElementById("leaderboard-list"),
    leaderboardTabs: document.querySelectorAll("#section-gioco [data-leaderboard]"),
  };

  let path = [];
  let checkpointNumberByCell = {};
  let nextCheckpointExpected = 1;
  let moves = 0;
  let startTime = null;
  let solved = false;
  let isDragging = false;
  let currentLeaderboardPeriod = "today";

  // ---------- seeded RNG (stesso puzzle per tutti, stesso giorno) ----------

  function todaySeedString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createRng(seedStr) {
    return mulberry32(xmur3(seedStr)());
  }

  // ---------- generazione percorso Hamiltoniano ----------

  function idx(r, c) {
    return r * GRID_SIZE + c;
  }

  function generateHamiltonianPath(rng) {
    const visited = new Array(TOTAL_CELLS).fill(false);
    const result = [];

    function neighbors(r, c) {
      const deltas = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];
      for (let i = deltas.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [deltas[i], deltas[j]] = [deltas[j], deltas[i]];
      }
      const out = [];
      for (const [dr, dc] of deltas) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE && !visited[idx(nr, nc)]) {
          out.push([nr, nc]);
        }
      }
      return out;
    }

    function dfs(r, c) {
      visited[idx(r, c)] = true;
      result.push(idx(r, c));
      if (result.length === TOTAL_CELLS) return true;

      for (const [nr, nc] of neighbors(r, c)) {
        if (dfs(nr, nc)) return true;
      }

      result.pop();
      visited[idx(r, c)] = false;
      return false;
    }

    // Un percorso che tocca tutte le celle alterna i due colori della scacchiera:
    // deve quindi partire (e finire) sul colore di maggioranza, altrimenti la
    // ricerca esaurisce tutto lo spazio e fallisce sempre (griglia vuota).
    const startCandidates = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if ((r + c) % 2 === 0) startCandidates.push([r, c]);
      }
    }

    for (let attempt = 0; attempt < startCandidates.length; attempt++) {
      const [startR, startC] = startCandidates[Math.floor(rng() * startCandidates.length)];
      visited.fill(false);
      result.length = 0;
      if (dfs(startR, startC)) return result;
    }

    return generateSnakePath();
  }

  function generateSnakePath() {
    const path = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      if (r % 2 === 0) {
        for (let c = 0; c < GRID_SIZE; c++) path.push(idx(r, c));
      } else {
        for (let c = GRID_SIZE - 1; c >= 0; c--) path.push(idx(r, c));
      }
    }
    return path;
  }

  function chooseCheckpoints(refPath, count) {
    const checkpoints = {};
    for (let i = 0; i < count; i++) {
      const pos = Math.round((i * (refPath.length - 1)) / (count - 1));
      checkpoints[refPath[pos]] = i + 1;
    }
    return checkpoints;
  }

  function isAdjacent(a, b) {
    const ra = Math.floor(a / GRID_SIZE);
    const ca = a % GRID_SIZE;
    const rb = Math.floor(b / GRID_SIZE);
    const cb = b % GRID_SIZE;
    return Math.abs(ra - rb) + Math.abs(ca - cb) === 1;
  }

  function directionOf(from, to) {
    const rf = Math.floor(from / GRID_SIZE);
    const cf = from % GRID_SIZE;
    const rt = Math.floor(to / GRID_SIZE);
    const ct = to % GRID_SIZE;
    if (rt < rf) return "up";
    if (rt > rf) return "down";
    if (ct < cf) return "left";
    return "right";
  }

  // ---------- rendering ----------

  function buildGrid() {
    els.container.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "zip-grid";
    grid.style.setProperty("--grid-size", GRID_SIZE);

    for (let i = 0; i < TOTAL_CELLS; i++) {
      const cell = document.createElement("div");
      cell.className = "zip-cell";
      cell.dataset.index = i;
      if (checkpointNumberByCell[i]) {
        cell.classList.add("checkpoint");
        cell.textContent = checkpointNumberByCell[i];
      }
      grid.appendChild(cell);
    }

    grid.addEventListener("pointerdown", (e) => {
      const cellEl = e.target.closest(".zip-cell");
      if (!cellEl) return;
      isDragging = true;
      onCellInteract(parseInt(cellEl.dataset.index, 10));
    });
    grid.addEventListener("pointermove", (e) => {
      if (!isDragging) return;
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const cellEl = target && target.closest && target.closest(".zip-cell");
      if (cellEl) onCellInteract(parseInt(cellEl.dataset.index, 10));
    });

    els.container.appendChild(grid);
  }

  document.addEventListener("pointerup", () => {
    isDragging = false;
  });

  function refreshCellClasses() {
    const grid = els.container.querySelector(".zip-grid");
    if (!grid) return;
    grid.querySelectorAll(".zip-cell").forEach((cellEl) => {
      const i = parseInt(cellEl.dataset.index, 10);
      cellEl.classList.toggle("filled", path.includes(i));
      cellEl.classList.toggle("current", path[path.length - 1] === i);
      delete cellEl.dataset.dir;
    });
    for (let i = 1; i < path.length; i++) {
      const cellEl = grid.querySelector(`.zip-cell[data-index="${path[i]}"]`);
      if (cellEl) cellEl.dataset.dir = directionOf(path[i - 1], path[i]);
    }
  }

  // ---------- interazione ----------

  function canAppend(cellIndex) {
    if (path.includes(cellIndex)) return false;
    const last = path[path.length - 1];
    if (!isAdjacent(last, cellIndex)) return false;
    const checkpointNumber = checkpointNumberByCell[cellIndex];
    if (checkpointNumber && checkpointNumber !== nextCheckpointExpected) return false;
    return true;
  }

  function onCellInteract(cellIndex) {
    if (solved) return;

    if (path.length === 0) {
      if (checkpointNumberByCell[cellIndex] === 1) {
        startTime = Date.now();
        path.push(cellIndex);
        moves = 1;
        nextCheckpointExpected = 2;
        refreshCellClasses();
      }
      return;
    }

    if (path.length >= 2 && path[path.length - 2] === cellIndex) {
      const removed = path.pop();
      if (checkpointNumberByCell[removed] === nextCheckpointExpected - 1) {
        nextCheckpointExpected -= 1;
      }
      refreshCellClasses();
      return;
    }

    if (canAppend(cellIndex)) {
      path.push(cellIndex);
      moves += 1;
      if (checkpointNumberByCell[cellIndex] === nextCheckpointExpected) {
        nextCheckpointExpected += 1;
      }
      refreshCellClasses();

      if (path.length === TOTAL_CELLS) {
        completePuzzle();
      }
    }
  }

  async function completePuzzle() {
    solved = true;
    const elapsedMs = Date.now() - startTime;
    const grid = els.container.querySelector(".zip-grid");
    if (grid) grid.classList.add("solved");

    try {
      const result = await Splitto.fetchJSON("/api/game/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roommate_id: Splitto.getCurrentUser().id,
          elapsed_ms: elapsedMs,
          moves,
          grid_cells: TOTAL_CELLS,
        }),
      });
      renderStatus({ played_today: true, today_score: result });
    } catch (err) {
      // gia' giocato oggi (o errore di rete): mostriamo comunque il risultato locale
      renderStatus({ played_today: true, today_score: { elapsed_ms: elapsedMs, moves, score: null } });
    }
    loadLeaderboard(currentLeaderboardPeriod);
  }

  // ---------- stato + avvio partita ----------

  function renderStatus(status) {
    if (status.played_today && status.today_score) {
      const s = status.today_score;
      els.statusBox.innerHTML = `
        <h3>Hai gia' giocato oggi</h3>
        <p class="hint">Tempo: ${(s.elapsed_ms / 1000).toFixed(1)}s &middot; mosse: ${s.moves}${
        s.score != null ? ` &middot; punteggio: ${s.score}` : ""
      }</p>
        <p class="hint">Torna domani per un nuovo puzzle.</p>
      `;
      els.container.innerHTML = "";
    } else {
      els.statusBox.innerHTML = `<p class="hint">Tocca la casella numero 1 per iniziare.</p>`;
    }
  }

  async function startGame() {
    const currentUser = Splitto.getCurrentUser();
    if (!currentUser) return;

    const status = await Splitto.fetchJSON(`/api/game/status?roommate_id=${currentUser.id}`);
    renderStatus(status);

    if (status.played_today) return;

    path = [];
    moves = 0;
    solved = false;
    nextCheckpointExpected = 1;

    const rng = createRng(todaySeedString());
    const refPath = generateHamiltonianPath(rng);
    checkpointNumberByCell = chooseCheckpoints(refPath, CHECKPOINT_COUNT);

    buildGrid();
  }

  // ---------- classifica ----------

  function renderLeaderboard(data) {
    els.leaderboardList.innerHTML = "";
    if (!data.entries || data.entries.length === 0) {
      els.leaderboardList.innerHTML = `<p class="hint">Nessun punteggio ancora.</p>`;
      return;
    }

    data.entries.forEach((entry, i) => {
      const row = document.createElement("div");
      row.className = "leaderboard-row";
      if (data.period === "today") {
        row.innerHTML = `
          <span class="leaderboard-rank">${i + 1}</span>
          ${Splitto.avatarHtml(entry.name)}
          <span class="name">${Splitto.escapeHtml(entry.name)}</span>
          <span class="amount">${entry.played ? entry.score : "-"}</span>
        `;
      } else {
        row.innerHTML = `
          <span class="leaderboard-rank">${i + 1}</span>
          ${Splitto.avatarHtml(entry.name)}
          <span class="name">${Splitto.escapeHtml(entry.name)}</span>
          <span class="amount">${entry.total_score} pt (${entry.games_played})</span>
        `;
      }
      els.leaderboardList.appendChild(row);
    });
  }

  async function loadLeaderboard(period) {
    currentLeaderboardPeriod = period;
    const data = await Splitto.fetchJSON(`/api/game/leaderboard?period=${period}`);
    renderLeaderboard(data);
  }

  els.leaderboardTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      els.leaderboardTabs.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      loadLeaderboard(btn.dataset.leaderboard);
    });
  });

  Splitto.onSectionShown("gioco", () => {
    startGame();
    loadLeaderboard(currentLeaderboardPeriod);
  });
})();
