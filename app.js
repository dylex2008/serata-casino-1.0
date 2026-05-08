import {
  adjustPlayerBalance,
  CHIP_GAMES,
  createRoom,
  DEFAULT_CHIPS_PER_EURO,
  endRoom,
  endSubGame,
  GAME_KEYS,
  getChipBreakdown,
  getRoom,
  hasPlaceholderConfig,
  joinRoom,
  listenRoom,
  normalizePlayersList,
  normalizeRoomCode,
  resolveCurrentRoom,
  resetRoom,
  startGame,
  subscribeToCurrentRoom,
  updateGameChips,
} from "./firebase.js";

const GAME_LABELS = {
  poker: "Poker",
  blackjack: "Blackjack",
  roulette: "Roulette",
  horse_racing: "Corsa Cavalli",
};

const PASTEL_CLASSES = [
  "pastel-1",
  "pastel-2",
  "pastel-3",
  "pastel-4",
  "pastel-5",
  "pastel-6",
  "pastel-7",
  "pastel-8",
];

const currencyFormatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("it-IT", {
  maximumFractionDigits: 0,
});

const crownAssetUrl = new URL("./crown2.0.svg", import.meta.url).href;

const pageState = {
  currentRoomCode: null,
  currentRoom: null,
  roomUnsubscribe: null,
  currentGamePage: document.body.dataset.gamePage || null,
};

document.addEventListener("DOMContentLoaded", () => {
  if (document.querySelector("#create-room-form")) {
    initHomePage();
  }

  if (document.querySelector(".games-selection-grid")) {
    initGameSelectionPage();
  }

  if (document.querySelector("#leaderboard-list")) {
    initRankingPage();
  }

  if (document.querySelector("#game-form")) {
    initGamePage();
  }

  if (document.querySelector("#player-select")) {
    initPlayerStatsPage();
  }

  if (document.querySelector("#horse-player-select")) {
    initHorseRacingPage();
  }

  if (document.querySelector("#roulette-player-select")) {
    initRoulettePage();
  }

  if (document.querySelector("#poker-player-select")) {
    initPokerPage();
  }

  if (document.querySelector("#blackjack-player-select")) {
    initBlackjackPage();
  }
});

function initHomePage() {
  const createForm = document.querySelector("#create-room-form");
  const joinForm = document.querySelector("#join-room-form");
  const createStatus = document.querySelector("#create-room-status");
  const joinStatus = document.querySelector("#join-room-status");
  const createdRoomNode = document.querySelector("#created-room-code");
  const heroButtons = [...document.querySelectorAll("[data-home-panel]")];
  const heroPanels = [...document.querySelectorAll("[data-panel]")];

  if (hasPlaceholderConfig) {
    setStatus(createStatus, "Firebase config missing.", true);
    setStatus(joinStatus, "Firebase config missing.", true);
    return;
  }

  const activatePanel = (panelId) => {
    heroButtons.forEach((button) => {
      button.dataset.active = String(button.dataset.homePanel === panelId);
    });

    heroPanels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== panelId;
    });
  };

  heroButtons.forEach((button) => {
    button.addEventListener("click", () => activatePanel(button.dataset.homePanel));
  });

  activatePanel("create");

  createForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = createForm.querySelector('button[type="submit"]');
    const players = normalizePlayersList(
      String(createForm.querySelector("#players-list")?.value || "").split(",")
    );

    button.disabled = true;
    try {
      const roomCode = await createRoom(players);
      createdRoomNode.textContent = roomCode;
      setStatus(createStatus, `Room ${roomCode} created.`, false);
      window.location.href = "input.html";
    } catch (error) {
      setStatus(createStatus, error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  joinForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = joinForm.querySelector('button[type="submit"]');
    const roomCode = normalizeRoomCode(
      joinForm.querySelector("#room-code-input")?.value || ""
    );

    button.disabled = true;
    try {
      await joinRoom(roomCode);
      setStatus(joinStatus, `Room ${roomCode} joined.`, false);
      window.location.href = "input.html";
    } catch (error) {
      setStatus(joinStatus, error.message, true);
    } finally {
      button.disabled = false;
    }
  });
}

async function initGameSelectionPage() {
  const statusNode = document.querySelector("#dashboard-status");
  const roomCodeNode = document.querySelector("#current-room-code");
  const roomStateNode = document.querySelector("#room-state");

  if (hasPlaceholderConfig) {
    setStatus(statusNode, "Firebase config missing.", true);
    return;
  }

  const roomCode = await resolveCurrentRoom();
  if (!roomCode) {
    window.location.href = "index.html";
    return;
  }

  attachRoomWatcher(roomCode, (room) => {
    roomCodeNode.textContent = roomCode;
    setRoomBadge(
      roomStateNode,
      room.status === "ended" ? "Closed" : "Active",
      room.status
    );
    updateGameLinks(room);
  }, statusNode);
}

async function initRankingPage() {
  const listNode = document.querySelector("#leaderboard-list");
  const miniBoardsRoot = document.querySelector("#mini-leaderboards");
  const liveIndicatorNode = document.querySelector("#live-indicator");
  const movementCountNode = document.querySelector("#movement-count");
  const roomNode = document.querySelector("#leaderboard-game-id");
  const roomStateNode = document.querySelector("#leaderboard-game-state");
  const activeGameNode = document.querySelector("#leaderboard-active-games");
  const qrImage = document.querySelector("#qr-image");
  const qrLink = document.querySelector("#qr-link");
  const manualPlayerSelect = document.querySelector("#manual-balance-player");
  const manualAmountInput = document.querySelector("#manual-balance-amount");
  const manualStatusNode = document.querySelector("#manual-balance-status");
  const manualAddButton = document.querySelector("#manual-balance-add");
  const manualRemoveButton = document.querySelector("#manual-balance-remove");

  if (hasPlaceholderConfig) {
    liveIndicatorNode.textContent = "Firebase config missing";
    return;
  }

  const roomCode = await resolveCurrentRoom();
  if (!roomCode) {
    window.location.href = "index.html";
    return;
  }

  liveIndicatorNode.textContent = "Realtime attivo";

  const baseUrl = window.location.origin + window.location.pathname.replace("leaderboard.html", "");
  const statsUrl = `${baseUrl}player-stats.html?room=${roomCode}`;
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(statsUrl)}`;

  if (qrImage) {
    qrImage.src = qrApiUrl;
  }

  if (qrLink) {
    qrLink.href = statsUrl;
  }

  const runManualBalanceUpdate = async (direction) => {
    const playerName = manualPlayerSelect?.value || "";
    const amount = parseNumber(manualAmountInput?.value);

    if (!playerName) {
      setStatus(manualStatusNode, "Seleziona un giocatore", true);
      return;
    }

    if (!amount || amount <= 0) {
      setStatus(manualStatusNode, "Inserisci un importo valido", true);
      return;
    }

    const signedAmount = direction === "remove" ? -amount : amount;
    manualAddButton.disabled = true;
    manualRemoveButton.disabled = true;

    try {
      await adjustPlayerBalance(roomCode, playerName, signedAmount);
      if (manualAmountInput) {
        manualAmountInput.value = "";
      }
      setStatus(
        manualStatusNode,
        `${direction === "remove" ? "Tolti" : "Aggiunti"} ${currencyFormatter.format(amount)} a ${playerName}`,
        false
      );
    } catch (error) {
      setStatus(manualStatusNode, error.message, true);
    } finally {
      manualAddButton.disabled = false;
      manualRemoveButton.disabled = false;
    }
  };

  manualAddButton?.addEventListener("click", () => runManualBalanceUpdate("add"));
  manualRemoveButton?.addEventListener("click", () => runManualBalanceUpdate("remove"));

  attachRoomWatcher(roomCode, (room) => {
    roomNode.textContent = roomCode;
    activeGameNode.textContent = room.activeGame ? GAME_LABELS[room.activeGame] : "Nessun gioco attivo";
    movementCountNode.textContent = `${Object.keys(room.players || {}).length} Giocatori`;
    setRoomBadge(
      roomStateNode,
      room.status === "ended" ? "Chiusa" : "Attiva",
      room.status
    );
    renderMainRanking(listNode, buildMainRanking(room.players || {}));
    renderMiniBoards(miniBoardsRoot, room);
    if (manualPlayerSelect) {
      populatePlayerSelectForStats(manualPlayerSelect, room.playersList || []);
    }
  });
}

async function initGamePage() {
  const gameKey = pageState.currentGamePage;
  const formNode = document.querySelector("#game-form");
  const statusNode = document.querySelector("#game-status-text");
  const roomCodeNode = document.querySelector("#game-room-code");
  const roomStateNode = document.querySelector("#game-room-state");
  const summaryPlayersNode = document.querySelector("#game-selected-players");
  const summaryLockedNode = document.querySelector("#game-selected-locked");
  const summaryRateNode = document.querySelector("#game-selected-rate");
  const summaryStatusNode = document.querySelector("#game-selected-status");
  const chipsRateInput = document.querySelector("#chips-rate");
  const startButton = document.querySelector("#start-subgame");
  const updateChipsButton = document.querySelector("#update-chips");
  const calculateButton = document.querySelector("#calculate-results");
  const finishButton = document.querySelector("#finish-subgame");
  const useChips = CHIP_GAMES.has(gameKey);

  buildPlayerCards(formNode, useChips);

  if (hasPlaceholderConfig) {
    setStatus(statusNode, "Firebase config missing.", true);
    return;
  }

  const roomCode = await resolveCurrentRoom();
  if (!roomCode) {
    window.location.href = "index.html";
    return;
  }

  attachRoomWatcher(roomCode, (room) => {
    roomCodeNode.textContent = roomCode;
    setRoomBadge(
      roomStateNode,
      room.status === "ended" ? "Closed" : "Active",
      room.status
    );

    populateGameCards(formNode, room, gameKey);
    updateGameSummary({
      room,
      gameKey,
      summaryPlayersNode,
      summaryLockedNode,
      summaryRateNode,
      summaryStatusNode,
      chipsRateInput,
    });
    syncGameControls({
      room,
      gameKey,
      formNode,
      startButton,
      updateChipsButton,
      calculateButton,
      finishButton,
      chipsRateInput,
    });
  }, statusNode);

  formNode.addEventListener("input", () => {
    if (useChips) {
      updateChipVisuals(formNode);
    }
  });

  calculateButton?.addEventListener("click", () => {
    calculateResults(formNode, gameKey, Number(chipsRateInput?.value || DEFAULT_CHIPS_PER_EURO));
    setStatus(statusNode, "Results calculated.", false);
  });

  startButton?.addEventListener("click", async () => {
    startButton.disabled = true;
    try {
      const entries = collectStartEntries(formNode);
      const rate = Number(chipsRateInput?.value || DEFAULT_CHIPS_PER_EURO);
      await startGame(roomCode, gameKey, entries, rate);
      setStatus(statusNode, `${GAME_LABELS[gameKey]} avviato.`, false);
    } catch (error) {
      setStatus(statusNode, error.message, true);
    } finally {
      startButton.disabled = false;
    }
  });

  updateChipsButton?.addEventListener("click", async () => {
    updateChipsButton.disabled = true;
    try {
      const updates = collectChipUpdates(formNode);
      await updateGameChips(roomCode, gameKey, updates);
      setStatus(statusNode, "Chips updated.", false);
    } catch (error) {
      setStatus(statusNode, error.message, true);
    } finally {
      updateChipsButton.disabled = false;
    }
  });

  finishButton?.addEventListener("click", async () => {
    finishButton.disabled = true;
    try {
      calculateResults(formNode, gameKey, Number(chipsRateInput?.value || DEFAULT_CHIPS_PER_EURO));
      const results = collectEndResults(formNode);
      await endSubGame(roomCode, gameKey, results);
      updatePlayerGameHistory(roomCode, gameKey, results);
      setStatus(statusNode, `${GAME_LABELS[gameKey]} terminato.`, false);
    } catch (error) {
      setStatus(statusNode, error.message, true);
    } finally {
      finishButton.disabled = false;
    }
  });
}

function updatePlayerGameHistory(roomCode, gameKey, results) {
  const storageKey = `serata-casino-games-${roomCode}`;
  const history = JSON.parse(localStorage.getItem(storageKey) || "{}");

  Object.entries(results).forEach(([playerName, result]) => {
    if (!history[playerName]) {
      history[playerName] = {};
    }
    if (!history[playerName][gameKey]) {
      history[playerName][gameKey] = { played: 0, won: 0, lost: 0 };
    }
    history[playerName][gameKey].played += 1;
    if (result > 0) {
      history[playerName][gameKey].won += 1;
    } else if (result < 0) {
      history[playerName][gameKey].lost += 1;
    }
  });

  localStorage.setItem(storageKey, JSON.stringify(history));
}

function getPlayerGameHistory(roomCode, playerName) {
  const storageKey = `serata-casino-games-${roomCode}`;
  const history = JSON.parse(localStorage.getItem(storageKey) || "{}");
  return history[playerName] || {};
}

let currentRoomCode = null;

async function initPlayerStatsPage() {
  const selectNode = document.querySelector("#player-select");
  const contentNode = document.querySelector("#player-stats-content");
  const emptyNode = document.querySelector("#player-stats-empty");
  const statusNode = document.querySelector("#player-stats-status");
  const roomCodeNode = document.querySelector("#player-stats-room-code");
  const roomStateNode = document.querySelector("#player-stats-room-state");

  if (hasPlaceholderConfig) {
    setStatus(statusNode, "Firebase config missing.", true);
    return;
  }

  currentRoomCode = await resolveCurrentRoom();
  if (!currentRoomCode) {
    window.location.href = "index.html";
    return;
  }

  let currentRoomData = null;

  attachRoomWatcher(currentRoomCode, (room) => {
    currentRoomData = room;
    roomCodeNode.textContent = currentRoomCode;
    setRoomBadge(
      roomStateNode,
      room.status === "ended" ? "Chiusa" : "Attiva",
      room.status
    );

    populatePlayerSelectForStats(selectNode, room.playersList);

    const selectedPlayer = selectNode.value;
    if (selectedPlayer && room.players[selectedPlayer]) {
      contentNode.hidden = false;
      emptyNode.hidden = true;
      renderPlayerStats(selectedPlayer, room, currentRoomCode);
    } else {
      contentNode.hidden = true;
      emptyNode.hidden = false;
    }
  }, statusNode);

  selectNode.addEventListener("change", () => {
    const selectedPlayer = selectNode.value;
    if (selectedPlayer && currentRoomData && currentRoomData.players[selectedPlayer]) {
      contentNode.hidden = false;
      emptyNode.hidden = true;
      renderPlayerStats(selectedPlayer, currentRoomData, currentRoomCode);
    } else {
      contentNode.hidden = true;
      emptyNode.hidden = false;
    }
  });
}

function populatePlayerSelectForStats(select, players) {
  const currentValue = select.value;
  select.innerHTML = `
    <option value="">-- Seleziona un giocatore --</option>
    ${players.map((player) => `<option value="${escapeHtml(player)}">${escapeHtml(player)}</option>`).join("")}
  `;

  if (players.includes(currentValue)) {
    select.value = currentValue;
  }
}

function renderPlayerStats(playerName, room, roomCode) {
  const generalRanking = buildMainRanking(room.players || {});
  const playerIndex = generalRanking.findIndex((p) => p.name === playerName);
  const generalPosition = playerIndex >= 0 ? playerIndex + 1 : null;

  document.getElementById("general-position").textContent = generalPosition ? `#${generalPosition}` : "-";

  const playerLedger = room.players[playerName];
  document.getElementById("player-total").textContent = currencyFormatter.format(playerLedger.total);
  document.getElementById("player-locked").textContent = currencyFormatter.format(playerLedger.locked);
  document.getElementById("player-available").textContent = currencyFormatter.format(playerLedger.available);

  const gameHistory = getPlayerGameHistory(roomCode || "", playerName);

  const microRankings = {};
  GAME_KEYS.forEach((gameKey) => {
    const ranking = buildMiniRanking(room.players || {}, gameKey);
    const pos = ranking.findIndex((p) => p.name === playerName);
    microRankings[gameKey] = pos >= 0 ? pos + 1 : null;
  });

  document.getElementById("position-poker").textContent = microRankings.poker ? `#${microRankings.poker}` : "-";
  document.getElementById("position-blackjack").textContent = microRankings.blackjack ? `#${microRankings.blackjack}` : "-";
  document.getElementById("position-horse_racing").textContent = microRankings.horse_racing ? `#${microRankings.horse_racing}` : "-";
  document.getElementById("position-roulette").textContent = microRankings.roulette ? `#${microRankings.roulette}` : "-";

  renderGamesHistory(room, playerName, gameHistory);
}

function renderGamesHistory(room, playerName, gameHistory) {
  const container = document.getElementById("games-history-list");
  const gamesData = gameHistory[playerName] || {};

  const hasGames = Object.values(gamesData).some((data) => data.played > 0);

  if (!hasGames) {
    container.innerHTML = '<p class="no-games-message">Nessun gioco disputato</p>';
    return;
  }

  container.innerHTML = GAME_KEYS
    .filter((gameKey) => gamesData[gameKey] && gamesData[gameKey].played > 0)
    .map((gameKey) => {
      const data = gamesData[gameKey];
      const netResult = room.players[playerName]?.games?.[gameKey] || 0;
      return `
        <article class="game-history-card">
          <div class="game-history-header">
            <h3>${GAME_LABELS[gameKey]}</h3>
            <span class="game-net-result ${netResult >= 0 ? "positive" : "negative"}">
              ${netResult >= 0 ? "+" : ""}${currencyFormatter.format(netResult)}
            </span>
          </div>
          <div class="game-history-stats">
            <div class="stat-item">
              <span class="stat-value">${data.played}</span>
              <span class="stat-label">Giocati</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">${data.won}</span>
              <span class="stat-label">Vinti</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">${data.lost}</span>
              <span class="stat-label">Persi</span>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function attachRoomWatcher(roomCode, onRoomUpdate, statusNode) {
  pageState.currentRoomCode = normalizeRoomCode(roomCode);

  if (pageState.roomUnsubscribe) {
    pageState.roomUnsubscribe();
  }

  pageState.roomUnsubscribe = listenRoom(
    pageState.currentRoomCode,
    (room) => {
      if (!room) {
        window.location.href = "index.html";
        return;
      }

      pageState.currentRoom = room;
      onRoomUpdate(room);
    },
    (error) => setStatus(statusNode, error.message, true)
  );

  subscribeToCurrentRoom(async (firebaseCurrentRoom) => {
    const normalizedCode = normalizeRoomCode(firebaseCurrentRoom);
    if (normalizedCode && normalizedCode !== pageState.currentRoomCode) {
      const currentRoom = await getRoom(pageState.currentRoomCode);
      if (!currentRoom) {
        window.location.href = "index.html";
      }
    }
  });
}

function updateGameLinks(room) {
  GAME_KEYS.forEach((gameKey) => {
    const node = document.querySelector(`#game-status-${gameKey}`);
    const link = document.querySelector(`[data-game-link="${gameKey}"]`);
    const active = room.games?.[gameKey]?.status === "active";

    if (node) {
      node.textContent = GAME_LABELS[gameKey];
    }

    if (link) {
      link.dataset.state = active ? "active" : "idle";
    }
  });
}

function buildPlayerCards(container, useChips) {
  container.innerHTML = Array.from({ length: 8 }, (_, index) => {
    const pastelClass = PASTEL_CLASSES[index % PASTEL_CLASSES.length];
    return `
      <article class="player-entry-card ${pastelClass}">
        <span class="player-card-index">${index + 1}</span>
        <label>
          <span>Name</span>
          <select name="player">
            <option value="">Select player</option>
          </select>
        </label>
        <label>
          <span>Buy-in €</span>
          <input type="number" name="investment" step="0.01" placeholder="0" />
        </label>
        <label>
          <span>${useChips ? "Final chips" : "Final amount €"}</span>
          <input type="number" name="value" step="${useChips ? "1" : "0.01"}" placeholder="0" />
        </label>
        <label>
          <span>Result €</span>
          <input type="number" name="result" step="0.01" placeholder="0" readonly />
        </label>
        ${useChips ? '<div class="chips-visual" data-chip-stack></div>' : ""}
      </article>
    `;
  }).join("");
}

function populateGameCards(container, room, gameKey) {
  const selects = container.querySelectorAll('select[name="player"]');
  const cards = [...container.querySelectorAll(".player-entry-card")];
  const sessionEntries = Object.entries(room.games?.[gameKey]?.session?.participants || {});

  selects.forEach((select) => populatePlayerSelect(select, room.playersList));

  cards.forEach((card, index) => {
    const select = card.querySelector('select[name="player"]');
    const investment = card.querySelector('input[name="investment"]');
    const value = card.querySelector('input[name="value"]');
    const result = card.querySelector('input[name="result"]');
    const chipStack = card.querySelector("[data-chip-stack]");
    const sessionEntry = sessionEntries[index];

    if (sessionEntry) {
      const [playerName, participant] = sessionEntry;
      select.value = playerName;
      investment.value = participant.investedEuro;
      value.value = CHIP_GAMES.has(gameKey)
        ? participant.currentChips
        : participant.currentChips;

      if (chipStack) {
        renderChipStack(chipStack, participant.chipBreakdown || getChipBreakdown(participant.currentChips));
      }
    } else {
      select.value = "";
      investment.value = "";
      value.value = "";
      if (!result.matches(":focus")) {
        result.value = "";
      }
      if (chipStack) {
        chipStack.innerHTML = "";
      }
    }
  });
}

function populatePlayerSelect(select, players) {
  const currentValue = select.value;
  select.innerHTML = `
    <option value="">Select player</option>
    ${players.map((player) => `<option value="${escapeHtml(player)}">${escapeHtml(player)}</option>`).join("")}
  `;

  if (players.includes(currentValue)) {
    select.value = currentValue;
  }
}

function updateGameSummary({
  room,
  gameKey,
  summaryPlayersNode,
  summaryLockedNode,
  summaryRateNode,
  summaryStatusNode,
  chipsRateInput,
}) {
  const game = room.games?.[gameKey];
  const participants = Object.values(game?.session?.participants || {});
  const locked = participants.reduce((sum, player) => sum + Number(player.investedEuro || 0), 0);

  summaryPlayersNode.textContent = String(participants.length);
  summaryLockedNode.textContent = currencyFormatter.format(locked);
  summaryRateNode.textContent = CHIP_GAMES.has(gameKey)
    ? `${integerFormatter.format(game?.chipsPerEuro || DEFAULT_CHIPS_PER_EURO)} chips / €1`
    : "Direct";
  summaryStatusNode.textContent = game?.status === "active" ? "Live" : "Ready";

  if (chipsRateInput) {
    chipsRateInput.value = String(game?.chipsPerEuro || DEFAULT_CHIPS_PER_EURO);
  }
}

function syncGameControls({
  room,
  gameKey,
  formNode,
  startButton,
  updateChipsButton,
  calculateButton,
  finishButton,
  chipsRateInput,
}) {
  const game = room.games?.[gameKey];
  const active = game?.status === "active";
  const roomEnded = room.status === "ended";
  const useChips = CHIP_GAMES.has(gameKey);

  formNode.querySelectorAll(".player-entry-card").forEach((card) => {
    const select = card.querySelector('select[name="player"]');
    const investment = card.querySelector('input[name="investment"]');
    const value = card.querySelector('input[name="value"]');

    select.disabled = roomEnded || active;
    investment.disabled = roomEnded || active;
    value.disabled = roomEnded || !active;
  });

  if (chipsRateInput) {
    chipsRateInput.disabled = roomEnded || active || !useChips;
    chipsRateInput.closest(".compact-field").style.display = useChips ? "" : "none";
  }

  if (startButton) {
    startButton.disabled = roomEnded || active;
  }

  if (updateChipsButton) {
    updateChipsButton.disabled = roomEnded || !active || !useChips;
    updateChipsButton.style.display = useChips ? "" : "none";
  }

  if (calculateButton) {
    calculateButton.disabled = roomEnded;
  }

  if (finishButton) {
    finishButton.disabled = roomEnded || !active;
  }
}

function calculateResults(container, gameKey, chipsRate) {
  const useChips = CHIP_GAMES.has(gameKey);

  [...container.querySelectorAll(".player-entry-card")].forEach((card) => {
    const investment = parseNumber(card.querySelector('input[name="investment"]')?.value) || 0;
    const value = parseNumber(card.querySelector('input[name="value"]')?.value) || 0;
    const resultNode = card.querySelector('input[name="result"]');
    const chipStack = card.querySelector("[data-chip-stack]");

    const result = useChips ? value / (chipsRate || DEFAULT_CHIPS_PER_EURO) - investment : value - investment;
    resultNode.value = Number.isFinite(result) ? result.toFixed(2) : "";

    if (chipStack && useChips) {
      renderChipStack(chipStack, getChipBreakdown(value));
    }
  });
}

function updateChipVisuals(container) {
  [...container.querySelectorAll(".player-entry-card")].forEach((card) => {
    const chipStack = card.querySelector("[data-chip-stack]");
    const value = parseNumber(card.querySelector('input[name="value"]')?.value) || 0;
    if (chipStack) {
      renderChipStack(chipStack, getChipBreakdown(value));
    }
  });
}

function collectStartEntries(container) {
  return [...container.querySelectorAll(".player-entry-card")]
    .map((card) => ({
      playerName: card.querySelector('select[name="player"]')?.value || "",
      investedEuro: parseNumber(card.querySelector('input[name="investment"]')?.value),
    }))
    .filter((entry) => entry.playerName && Number.isFinite(entry.investedEuro) && entry.investedEuro > 0);
}

function collectChipUpdates(container) {
  return [...container.querySelectorAll(".player-entry-card")]
    .map((card) => ({
      playerName: card.querySelector('select[name="player"]')?.value || "",
      currentChips: parseNumber(card.querySelector('input[name="value"]')?.value),
    }))
    .filter((entry) => entry.playerName && Number.isFinite(entry.currentChips));
}

function collectEndResults(container) {
  return [...container.querySelectorAll(".player-entry-card")].reduce((accumulator, card) => {
    const playerName = card.querySelector('select[name="player"]')?.value || "";
    const result = parseNumber(card.querySelector('input[name="result"]')?.value);

    if (playerName && Number.isFinite(result)) {
      accumulator[playerName] = result;
    }

    return accumulator;
  }, {});
}

function buildMainRanking(playersMap) {
  return Object.entries(playersMap)
    .map(([name, ledger]) => ({
      name,
      total: Number(ledger?.total || 0),
      locked: Number(ledger?.locked || 0),
      available: Number(ledger?.available || 0),
    }))
    .sort((first, second) => second.total - first.total);
}

function buildMiniRanking(playersMap, gameKey) {
  return Object.entries(playersMap)
    .map(([name, ledger]) => ({
      name,
      value: Number(ledger?.games?.[gameKey] || 0),
    }))
    .sort((first, second) => second.value - first.value)
    .slice(0, 3);
}

function renderMainRanking(container, ranking) {
  const crownImg = `<img src="${crownAssetUrl}" alt="crown" style="width:70px;height:70px;object-fit:contain;">`;
  const top5 = ranking.slice(0, 5);
  container.innerHTML = top5.length
    ? top5
        .map((player, index) => `
          <article class="ranking-row ${index < 3 ? `top-${index + 1}` : ""}">
            <div class="ranking-bar"></div>
            <div class="ranking-left">
              <span class="ranking-position">${index === 0 ? crownImg : index + 1}</span>
              <div class="ranking-name">
                <h2>${escapeHtml(player.name)}</h2>
              </div>
            </div>
            <div class="ranking-amount">
              <span class="total-amount">${currencyFormatter.format(player.total)}</span>
              <span class="locked-amount">${currencyFormatter.format(player.locked).replace(' ', '')} in gioco</span>
            </div>
          </article>
        `)
        .join("")
    : `
      <div class="empty-state">
        <h2>Nessun dato disponibile</h2>
      </div>
    `;
}

function renderMiniBoards(container, room) {
  if (!container || !room) {
    return;
  }

  const crownImg = `<img src="${crownAssetUrl}" alt="crown" style="width:36px;height:36px;object-fit:contain;">`;
  container.querySelectorAll("[data-mini-board]").forEach((board) => {
    const gameKey = board.dataset.miniBoard;
    const ranking = buildMiniRanking(room.players || {}, gameKey).slice(0, 1);

    board.innerHTML = `
      <h3>${GAME_LABELS[gameKey]}</h3>
      ${
        ranking.length
          ? ranking
              .map(
                (player) => `
                  <div class="mini-row mini-top">
                    <span>${crownImg}</span>
                    <span>${escapeHtml(player.name)}</span>
                    <strong>${currencyFormatter.format(player.value)}</strong>
                  </div>
                `
              )
              .join("")
          : '<p class="mini-empty">Nessun risultato</p>'
      }
    `;
  });
}

function renderChipStack(container, breakdown) {
  container.innerHTML = breakdown
    .filter((chip) => chip.count > 0)
    .map(
      (chip) => `
        <div class="chip-stack-item">
          <span class="chip-mark chip-${chip.value}">${chip.value}</span>
          <strong>${chip.count}</strong>
        </div>
      `
    )
    .join("");
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function setStatus(node, message, isError) {
  if (!node) {
    return;
  }

  node.textContent = message;
  node.style.color = isError ? "#000000" : "#444444";
}

function setRoomBadge(node, label, state) {
  if (!node) {
    return;
  }

  node.textContent = label;
  node.dataset.state = state || "idle";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const horseRacingState = {
  participants: [],
  roomCode: null,
  roomData: null,
};

async function initHorseRacingPage() {
  const playerSelect = document.querySelector("#horse-player-select");
  const betInput = document.querySelector("#horse-bet-amount");
  const resultSelect = document.querySelector("#horse-result-select");
  const addBtn = document.querySelector("#add-player-btn");
  const finishBtn = document.querySelector("#finish-subgame");
  const playersList = document.querySelector("#horse-players-list");
  const statusNode = document.querySelector("#game-status-text");
  const summaryPlayers = document.querySelector("#game-selected-players");
  const summaryLocked = document.querySelector("#game-selected-locked");
  const summaryRate = document.querySelector("#game-selected-rate");
  const summaryStatus = document.querySelector("#game-selected-status");
  const roomCodeNode = document.querySelector("#game-room-code");
  const roomStateNode = document.querySelector("#game-room-state");

  if (hasPlaceholderConfig) {
    setStatus(statusNode, "Firebase config missing.", true);
    return;
  }

  const roomCode = await resolveCurrentRoom();
  if (!roomCode) {
    window.location.href = "index.html";
    return;
  }

  horseRacingState.roomCode = roomCode;

  attachRoomWatcher(roomCode, (room) => {
    horseRacingState.roomData = room;
    roomCodeNode.textContent = roomCode;
    setRoomBadge(
      roomStateNode,
      room.status === "ended" ? "Chiusa" : "Attiva",
      room.status
    );

    populatePlayerSelectForStats(playerSelect, room.playersList);
  }, statusNode);

  addBtn.addEventListener("click", () => {
    const playerName = playerSelect.value;
    const betAmount = parseNumber(betInput.value);
    const result = resultSelect.value;

    if (!playerName) {
      setStatus(statusNode, "Seleziona un giocatore", true);
      return;
    }

    if (!betAmount || betAmount <= 0) {
      setStatus(statusNode, "Inserisci un importo valido", true);
      return;
    }

    if (!result) {
      setStatus(statusNode, "Seleziona il risultato", true);
      return;
    }

    if (horseRacingState.participants.find(p => p.name === playerName)) {
      setStatus(statusNode, "Giocatore già aggiunto", true);
      return;
    }

    const winnerCount = horseRacingState.participants.filter(p => p.result === "win").length;
    if (result === "win" && winnerCount >= 1) {
      setStatus(statusNode, "Può esserci un solo vincitore", true);
      return;
    }

    horseRacingState.participants.push({ name: playerName, bet: betAmount, result: result });
    playerSelect.value = "";
    betInput.value = "";
    resultSelect.value = "";
    renderHorsePlayersList();
    updateHorseSummary();
    setStatus(statusNode, "", false);
  });

  finishBtn.addEventListener("click", async () => {
    if (horseRacingState.participants.length === 0) {
      setStatus(statusNode, "Nessun giocatore aggiunto", true);
      return;
    }

    const winner = horseRacingState.participants.find(p => p.result === "win");
    if (!winner) {
      setStatus(statusNode, "Seleziona un vincitore", true);
      return;
    }

    const totalPot = horseRacingState.participants.reduce((sum, p) => sum + p.bet, 0);
    const results = {};

    horseRacingState.participants.forEach(p => {
      if (p.result === "win") {
        results[p.name] = totalPot - p.bet;
      } else {
        results[p.name] = -p.bet;
      }
    });

    try {
      await endSubGame(roomCode, "horse_racing", results);
      setStatus(statusNode, `Partita terminata! ${escapeHtml(winner.name)} vince ${currencyFormatter.format(totalPot)}`, false);

      horseRacingState.participants = [];
      renderHorsePlayersList();
      updateHorseSummary();
    } catch (error) {
      setStatus(statusNode, error.message, true);
    }
  });
    function renderHorsePlayersList() {
    playersList.innerHTML = horseRacingState.participants
      .map((p) => `
        <div class="horse-player-entry ${p.result === "win" ? "winner" : "loser"}">
          <span class="player-name">${escapeHtml(p.name)}</span>
          <span class="bet-amount">${currencyFormatter.format(p.bet)}</span>
          <span class="player-result">${p.result === "win" ? "✓ Vince" : "✗ Perde"}</span>
        </div>
      `)
      .join("");
  }

  function updateHorseSummary() {
    const totalPot = horseRacingState.participants.reduce((sum, p) => sum + p.bet, 0);
    const count = horseRacingState.participants.length;
    const winner = horseRacingState.participants.find(p => p.result === "win");

    summaryPlayers.textContent = count;
    summaryLocked.textContent = currencyFormatter.format(totalPot);
    summaryRate.textContent = winner ? "Vince tutto" : "-";
    summaryStatus.textContent = count > 0 ? (winner ? "Pronto" : "In attesa") : "Pronto";
  }
}

const rouletteState = {
  participants: [],
  roomCode: null,
  roomData: null,
};

async function initRoulettePage() {
  const playerSelect = document.querySelector("#roulette-player-select");
  const betInput = document.querySelector("#roulette-bet-amount");
  const resultSelect = document.querySelector("#roulette-result-select");
  const addBtn = document.querySelector("#add-player-btn");
  const finishBtn = document.querySelector("#finish-subgame");
  const playersList = document.querySelector("#roulette-players-list");
  const statusNode = document.querySelector("#game-status-text");
  const summaryPlayers = document.querySelector("#game-selected-players");
  const summaryLocked = document.querySelector("#game-selected-locked");
  const summaryRate = document.querySelector("#game-selected-rate");
  const summaryStatus = document.querySelector("#game-selected-status");
  const roomCodeNode = document.querySelector("#game-room-code");
  const roomStateNode = document.querySelector("#game-room-state");

  if (hasPlaceholderConfig) {
    setStatus(statusNode, "Firebase config missing.", true);
    return;
  }

  const roomCode = await resolveCurrentRoom();
  if (!roomCode) {
    window.location.href = "index.html";
    return;
  }

  rouletteState.roomCode = roomCode;

  attachRoomWatcher(roomCode, (room) => {
    rouletteState.roomData = room;
    roomCodeNode.textContent = roomCode;
    setRoomBadge(
      roomStateNode,
      room.status === "ended" ? "Chiusa" : "Attiva",
      room.status
    );

    populatePlayerSelectForStats(playerSelect, room.playersList);
  }, statusNode);

  addBtn.addEventListener("click", () => {
    const playerName = playerSelect.value;
    const betAmount = parseNumber(betInput.value);
    const result = resultSelect.value;

    if (!playerName) {
      setStatus(statusNode, "Seleziona un giocatore", true);
      return;
    }

    if (!betAmount || betAmount <= 0) {
      setStatus(statusNode, "Inserisci un importo valido", true);
      return;
    }

    if (!result) {
      setStatus(statusNode, "Seleziona il risultato", true);
      return;
    }

    if (rouletteState.participants.find(p => p.name === playerName)) {
      setStatus(statusNode, "Giocatore già aggiunto", true);
      return;
    }

    const winnerCount = rouletteState.participants.filter(p => p.result === "win").length;
    if (result === "win" && winnerCount >= 1) {
      setStatus(statusNode, "Può esserci un solo vincitore", true);
      return;
    }

    rouletteState.participants.push({ name: playerName, bet: betAmount, result: result });
    playerSelect.value = "";
    betInput.value = "";
    resultSelect.value = "";
    renderRoulettePlayersList();
    updateRouletteSummary();
    setStatus(statusNode, "", false);
  });

  finishBtn.addEventListener("click", async () => {
    if (rouletteState.participants.length === 0) {
      setStatus(statusNode, "Nessun giocatore aggiunto", true);
      return;
    }

    const winner = rouletteState.participants.find(p => p.result === "win");
    if (!winner) {
      setStatus(statusNode, "Seleziona un vincitore", true);
      return;
    }

    const totalPot = rouletteState.participants.reduce((sum, p) => sum + p.bet, 0);
    const results = {};

    rouletteState.participants.forEach(p => {
      if (p.result === "win") {
        results[p.name] = totalPot - p.bet;
      } else {
        results[p.name] = -p.bet;
      }
    });

    try {
      await endSubGame(roomCode, "roulette", results);
      setStatus(statusNode, `Partita terminata! ${escapeHtml(winner.name)} vince ${currencyFormatter.format(totalPot)}`, false);

      rouletteState.participants = [];
      renderRoulettePlayersList();
      updateRouletteSummary();
    } catch (error) {
      setStatus(statusNode, error.message, true);
    }
  });

  function renderRoulettePlayersList() {
    playersList.innerHTML = rouletteState.participants
      .map((p) => `
        <div class="roulette-player-entry ${p.result === "win" ? "winner" : "loser"}">
          <span class="player-name">${escapeHtml(p.name)}</span>
          <span class="bet-amount">${currencyFormatter.format(p.bet)}</span>
          <span class="player-result">${p.result === "win" ? "✓ Vince" : "✗ Perde"}</span>
        </div>
      `)
      .join("");
  }

  function updateRouletteSummary() {
    const totalPot = rouletteState.participants.reduce((sum, p) => sum + p.bet, 0);
    const count = rouletteState.participants.length;
    const winner = rouletteState.participants.find(p => p.result === "win");

    summaryPlayers.textContent = count;
    summaryLocked.textContent = currencyFormatter.format(totalPot);
    summaryRate.textContent = winner ? "Vince tutto" : "-";
    summaryStatus.textContent = count > 0 ? (winner ? "Pronto" : "In attesa") : "Pronto";
  }
}

const pokerState = {
  participants: [],
  gameStarted: false,
  roomCode: null,
  roomData: null,
};

async function initPokerPage() {
  const playerSelect = document.querySelector("#poker-player-select");
  const betInput = document.querySelector("#poker-bet-amount");
  const addBtn = document.querySelector("#add-player-btn");
  const startBtn = document.querySelector("#start-subgame");
  const finishBtn = document.querySelector("#finish-subgame");
  const playersList = document.querySelector("#poker-players-list");
  const resultPhase = document.querySelector("#poker-result-phase");
  const resultList = document.querySelector("#poker-result-list");
  const statusNode = document.querySelector("#game-status-text");
  const summaryPlayers = document.querySelector("#game-selected-players");
  const summaryLocked = document.querySelector("#game-selected-locked");
  const summaryRate = document.querySelector("#game-selected-rate");
  const summaryStatus = document.querySelector("#game-selected-status");
  const roomCodeNode = document.querySelector("#game-room-code");
  const roomStateNode = document.querySelector("#game-room-state");

  if (hasPlaceholderConfig) {
    setStatus(statusNode, "Firebase config missing.", true);
    return;
  }

  const roomCode = await resolveCurrentRoom();
  if (!roomCode) {
    window.location.href = "index.html";
    return;
  }

  pokerState.roomCode = roomCode;

  attachRoomWatcher(roomCode, (room) => {
    pokerState.roomData = room;
    roomCodeNode.textContent = roomCode;
    setRoomBadge(
      roomStateNode,
      room.status === "ended" ? "Chiusa" : "Attiva",
      room.status
    );

    populatePlayerSelectForStats(playerSelect, room.playersList);
  }, statusNode);

  addBtn.addEventListener("click", () => {
    if (pokerState.gameStarted) {
      setStatus(statusNode, "Gioco già iniziato", true);
      return;
    }

    const playerName = playerSelect.value;
    const betAmount = parseNumber(betInput.value);

    if (!playerName) {
      setStatus(statusNode, "Seleziona un giocatore", true);
      return;
    }

    if (!betAmount || betAmount <= 0) {
      setStatus(statusNode, "Inserisci un importo valido", true);
      return;
    }

    if (pokerState.participants.find(p => p.name === playerName)) {
      setStatus(statusNode, "Giocatore già aggiunto", true);
      return;
    }

    pokerState.participants.push({ name: playerName, bet: betAmount, result: null });
    playerSelect.value = "";
    betInput.value = "";
    renderPokerPlayersList();
    updatePokerSummary();
    setStatus(statusNode, "", false);
  });

  startBtn.addEventListener("click", () => {
    if (pokerState.participants.length < 2) {
      setStatus(statusNode, "Servono almeno 2 giocatori", true);
      return;
    }

    pokerState.gameStarted = true;
    startBtn.disabled = true;
    finishBtn.disabled = false;
    summaryStatus.textContent = "In corso";
    resultPhase.hidden = false;
    renderPokerResultList();
    setStatus(statusNode, "Seleziona i vincitori", false);
  });

  finishBtn.addEventListener("click", async () => {
    const winners = pokerState.participants.filter(p => p.result === "win");
    const losers = pokerState.participants.filter(p => p.result === "lose");

    if (winners.length === 0) {
      setStatus(statusNode, "Seleziona almeno un vincitore", true);
      return;
    }

    if (losers.length === 0) {
      setStatus(statusNode, "Seleziona almeno un perdente", true);
      return;
    }

    const totalPot = pokerState.participants.reduce((sum, p) => sum + p.bet, 0);
    const winPerWinner = totalPot / winners.length;
    const results = {};

    pokerState.participants.forEach(p => {
      if (p.result === "win") {
        results[p.name] = winPerWinner - p.bet;
      } else {
        results[p.name] = -p.bet;
      }
    });

    try {
      await endSubGame(roomCode, "poker", results);
      setStatus(statusNode, `Partita terminata! ${winners.length} vincitore/i guadagna/no ${currencyFormatter.format(winPerWinner)}`, false);

      pokerState.participants = [];
      pokerState.gameStarted = false;
      startBtn.disabled = false;
      finishBtn.disabled = true;
      resultPhase.hidden = true;
      renderPokerPlayersList();
      updatePokerSummary();
      summaryStatus.textContent = "Pronto";
    } catch (error) {
      setStatus(statusNode, error.message, true);
    }
  });

  function renderPokerPlayersList() {
    playersList.innerHTML = pokerState.participants
      .map((p) => `
        <div class="poker-player-entry">
          <span class="player-name">${escapeHtml(p.name)}</span>
          <span class="bet-amount">${currencyFormatter.format(p.bet)}</span>
        </div>
      `)
      .join("");
  }

  function renderPokerResultList() {
    resultList.innerHTML = pokerState.participants
      .map((p, index) => `
        <div class="poker-result-entry ${p.result === "win" ? "winner" : p.result === "lose" ? "loser" : ""}" data-index="${index}">
          <span class="player-name">${escapeHtml(p.name)}</span>
          <span class="bet-amount">${currencyFormatter.format(p.bet)}</span>
          <div class="result-buttons">
            <button type="button" class="result-btn win-btn ${p.result === "win" ? "active" : ""}" data-result="win">Vince</button>
            <button type="button" class="result-btn lose-btn ${p.result === "lose" ? "active" : ""}" data-result="lose">Perde</button>
          </div>
        </div>
      `)
      .join("");

    resultList.querySelectorAll(".result-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const index = parseInt(e.target.closest(".poker-result-entry").dataset.index);
        const result = e.target.dataset.result;
        pokerState.participants[index].result = result;
        renderPokerResultList();
      });
    });
  }

  function updatePokerSummary() {
    const totalBet = pokerState.participants.reduce((sum, p) => sum + p.bet, 0);
    const count = pokerState.participants.length;

    summaryPlayers.textContent = count;
    summaryLocked.textContent = currencyFormatter.format(totalBet);
    summaryRate.textContent = pokerState.gameStarted ? "In corso" : "-";
  }
}

const blackjackState = {
  participants: [],
  gameStarted: false,
  roomCode: null,
  roomData: null,
};

async function initBlackjackPage() {
  const playerSelect = document.querySelector("#blackjack-player-select");
  const betInput = document.querySelector("#blackjack-bet-amount");
  const addBtn = document.querySelector("#add-player-btn");
  const startBtn = document.querySelector("#start-subgame");
  const finishBtn = document.querySelector("#finish-subgame");
  const playersList = document.querySelector("#blackjack-players-list");
  const resultPhase = document.querySelector("#blackjack-result-phase");
  const resultList = document.querySelector("#blackjack-result-list");
  const statusNode = document.querySelector("#game-status-text");
  const summaryPlayers = document.querySelector("#game-selected-players");
  const summaryLocked = document.querySelector("#game-selected-locked");
  const summaryRate = document.querySelector("#game-selected-rate");
  const summaryStatus = document.querySelector("#game-selected-status");
  const roomCodeNode = document.querySelector("#game-room-code");
  const roomStateNode = document.querySelector("#game-room-state");

  if (hasPlaceholderConfig) {
    setStatus(statusNode, "Firebase config missing.", true);
    return;
  }

  const roomCode = await resolveCurrentRoom();
  if (!roomCode) {
    window.location.href = "index.html";
    return;
  }

  blackjackState.roomCode = roomCode;

  attachRoomWatcher(roomCode, (room) => {
    blackjackState.roomData = room;
    roomCodeNode.textContent = roomCode;
    setRoomBadge(
      roomStateNode,
      room.status === "ended" ? "Chiusa" : "Attiva",
      room.status
    );

    populatePlayerSelectForStats(playerSelect, room.playersList);
  }, statusNode);

  addBtn.addEventListener("click", () => {
    if (blackjackState.gameStarted) {
      setStatus(statusNode, "Gioco già iniziato", true);
      return;
    }

    const playerName = playerSelect.value;
    const betAmount = parseNumber(betInput.value);

    if (!playerName) {
      setStatus(statusNode, "Seleziona un giocatore", true);
      return;
    }

    if (!betAmount || betAmount <= 0) {
      setStatus(statusNode, "Inserisci un importo valido", true);
      return;
    }

    if (blackjackState.participants.find(p => p.name === playerName)) {
      setStatus(statusNode, "Giocatore già aggiunto", true);
      return;
    }

    blackjackState.participants.push({ name: playerName, bet: betAmount, result: null });
    playerSelect.value = "";
    betInput.value = "";
    renderBlackjackPlayersList();
    updateBlackjackSummary();
    setStatus(statusNode, "", false);
  });

  startBtn.addEventListener("click", () => {
    if (blackjackState.participants.length < 2) {
      setStatus(statusNode, "Servono almeno 2 giocatori", true);
      return;
    }

    blackjackState.gameStarted = true;
    startBtn.disabled = true;
    finishBtn.disabled = false;
    summaryStatus.textContent = "In corso";
    resultPhase.hidden = false;
    renderBlackjackResultList();
    setStatus(statusNode, "Seleziona i vincitori", false);
  });

  finishBtn.addEventListener("click", async () => {
    const winners = blackjackState.participants.filter(p => p.result === "win");
    const losers = blackjackState.participants.filter(p => p.result === "lose");

    if (winners.length === 0) {
      setStatus(statusNode, "Seleziona almeno un vincitore", true);
      return;
    }

    if (losers.length === 0) {
      setStatus(statusNode, "Seleziona almeno un perdente", true);
      return;
    }

    const totalPot = blackjackState.participants.reduce((sum, p) => sum + p.bet, 0);
    const winPerWinner = totalPot / winners.length;
    const results = {};

    blackjackState.participants.forEach(p => {
      if (p.result === "win") {
        results[p.name] = winPerWinner - p.bet;
      } else {
        results[p.name] = -p.bet;
      }
    });

    try {
      await endSubGame(roomCode, "blackjack", results);
      setStatus(statusNode, `Partita terminata! ${winners.length} vincitore/i guadagna/no ${currencyFormatter.format(winPerWinner)}`, false);

      blackjackState.participants = [];
      blackjackState.gameStarted = false;
      startBtn.disabled = false;
      finishBtn.disabled = true;
      resultPhase.hidden = true;
      renderBlackjackPlayersList();
      updateBlackjackSummary();
      summaryStatus.textContent = "Pronto";
    } catch (error) {
      setStatus(statusNode, error.message, true);
    }
  });

  function renderBlackjackPlayersList() {
    playersList.innerHTML = blackjackState.participants
      .map((p) => `
        <div class="blackjack-player-entry">
          <span class="player-name">${escapeHtml(p.name)}</span>
          <span class="bet-amount">${currencyFormatter.format(p.bet)}</span>
        </div>
      `)
      .join("");
  }

  function renderBlackjackResultList() {
    resultList.innerHTML = blackjackState.participants
      .map((p, index) => `
        <div class="blackjack-result-entry ${p.result === "win" ? "winner" : p.result === "lose" ? "loser" : ""}" data-index="${index}">
          <span class="player-name">${escapeHtml(p.name)}</span>
          <span class="bet-amount">${currencyFormatter.format(p.bet)}</span>
          <div class="result-buttons">
            <button type="button" class="result-btn win-btn ${p.result === "win" ? "active" : ""}" data-result="win">Vince</button>
            <button type="button" class="result-btn lose-btn ${p.result === "lose" ? "active" : ""}" data-result="lose">Perde</button>
          </div>
        </div>
      `)
      .join("");

    resultList.querySelectorAll(".result-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const index = parseInt(e.target.closest(".blackjack-result-entry").dataset.index);
        const result = e.target.dataset.result;
        blackjackState.participants[index].result = result;
        renderBlackjackResultList();
      });
    });
  }

  function updateBlackjackSummary() {
    const totalBet = blackjackState.participants.reduce((sum, p) => sum + p.bet, 0);
    const count = blackjackState.participants.length;

    summaryPlayers.textContent = count;
    summaryLocked.textContent = currencyFormatter.format(totalBet);
    summaryRate.textContent = blackjackState.gameStarted ? "In corso" : "-";
  }
}
