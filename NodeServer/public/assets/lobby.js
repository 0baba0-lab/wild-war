import { request } from "./api.js";
import { initialPresence } from "./presence.js";

const heading = document.getElementById("player-heading");
const matchProgress = document.getElementById("lobby-match-progress");
const list = document.getElementById("player-list");
const rowTemplate = document.getElementById("player-row");
const status = document.getElementById("lobby-status");
const code = document.getElementById("room-code");
const showCode = document.getElementById("show-code");
const copyCode = document.getElementById("copy-code");
const hostActions = document.getElementById("host-actions");
const publicButton = document.getElementById("public-room");
const startButton = document.getElementById("start-game");
const publicDialog = document.getElementById("public-dialog");
const publicForm = document.getElementById("public-form");
const publicStatus = document.getElementById("public-status");
const publicConfirm = document.getElementById("confirm-public");
const chatForm = document.getElementById("chat-form");
const chatMessages = document.getElementById("chat-messages");

let room;
let playerSignature;
let chatSignature;
let codeVisible = false;
let actionPending = false;
let version = 0;
let lobbyStream;
let refreshTimer;
let refreshPending = false;
let refreshQueued = false;
let lastPing = null;

function showStatus(message) {
  const target = publicDialog.open ? publicStatus : status;
  target.textContent = message;
  target.hidden = !message;
}

function renderCode() {
  code.textContent = codeVisible ? room.code : "••••••••••••••••";
  showCode.textContent = codeVisible ? "숨기기" : "보기";
  showCode.setAttribute("aria-pressed", String(codeVisible));
}

function renderPlayers() {
  const signature = JSON.stringify([room.isHost, room.players.map(({ id, isHost }) => [id, isHost])]);
  if (signature !== playerSignature) {
    playerSignature = signature;
    const rows = room.players.map((player) => {
      const row = rowTemplate.content.firstElementChild.cloneNode(true);
      row.querySelector(".player-name").textContent = player.name;
      row.querySelector(".host-mark").hidden = !player.isHost;

      const remove = row.querySelector(".remove-player");
      if (room.isHost && !player.isHost) {
        remove.hidden = false;
        remove.setAttribute("aria-label", `${player.name} 내보내기`);
        remove.addEventListener("click", () => changeRoom("/room/remove", { playerId: player.id }));
      }
      return row;
    });
    list.replaceChildren(...rows);
  }
  room.players.forEach((player, index) => {
    const ping = list.children[index].querySelector(".player-ping");
    const text = player.ping == null ? "— ms" : `${player.ping} ms`;
    if (ping.textContent !== text) ping.textContent = text;
  });
}

function renderChat() {
  const signature = JSON.stringify(room.chat);
  if (signature === chatSignature) return;
  chatSignature = signature;

  const atBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 24;
  const messages = room.chat.map(({ name, text }) => {
    const message = document.createElement("li");
    const author = document.createElement("strong");
    author.textContent = name;
    message.append(author, document.createTextNode(" " + text));
    return message;
  });
  chatMessages.replaceChildren(...messages);
  if (atBottom) chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updatePublicOptions() {
  const options = [...publicForm.querySelectorAll('input[name="size"]')];
  for (const option of options) {
    option.disabled = Number(option.value) <= room.players.length;
    if (option.disabled) option.checked = false;
  }
  publicConfirm.disabled = options.every((option) => option.disabled);
}

function renderRoom(data) {
  if (data.startedWith !== null) {
    location.replace("/game/");
    return;
  }
  room = data;
  heading.textContent = `플레이어 ${room.players.length}/${room.maxPlayers}`;
  const progressText = room.matchCount == null ? "" : `매칭 인원 ${room.matchCount}/${room.publicSize}`;
  matchProgress.hidden = progressText === "";
  if (matchProgress.textContent !== progressText) matchProgress.textContent = progressText;
  hostActions.hidden = !room.isHost;
  startButton.disabled = !room.canStart;
  publicButton.disabled = !room.publicSize && room.players.length >= room.maxPlayers;
  publicButton.textContent = room.publicSize ? `공개 취소 (${room.publicSize}인)` : "방 공개";
  publicButton.setAttribute("aria-pressed", String(Boolean(room.publicSize)));
  showCode.disabled = false;
  copyCode.disabled = false;
  renderCode();
  renderPlayers();
  renderChat();
  if (publicDialog.open) updatePublicOptions();
}

async function changeRoom(path, body = {}, afterSuccess) {
  if (actionPending) return;
  actionPending = true;
  version++;
  showStatus("");
  try {
    const data = await request(path, body);
    afterSuccess?.();
    if (data) renderRoom(data);
  } catch (error) {
    showStatus(error.message);
  } finally {
    actionPending = false;
    if (refreshQueued) refreshRoom();
  }
}

async function refreshRoom() {
  if (actionPending || refreshPending) {
    refreshQueued = true;
    return;
  }
  refreshQueued = false;
  refreshPending = true;
  const requestVersion = version;
  try {
    const started = performance.now();
    const data = await request(lastPing === null ? "/room" : `/room?ping=${lastPing}`);
    lastPing = Math.min(8_000, Math.round(performance.now() - started));
    if (requestVersion === version) renderRoom(data);
  } catch (error) {
    if (requestVersion === version) {
      if (error.status === 404) {
        stopLobbyUpdates();
        location.replace("/");
        return;
      }
      showStatus(error.message);
    }
  } finally {
    refreshPending = false;
    if (refreshQueued && !actionPending) refreshRoom();
  }
}

function startLobbyUpdates() {
  lobbyStream = new EventSource("/api/room/stream");
  lobbyStream.addEventListener("open", refreshRoom);
  lobbyStream.addEventListener("room-change", refreshRoom);
  lobbyStream.addEventListener("room-heartbeat", refreshRoom);
  refreshTimer = window.setInterval(refreshRoom, 2_000);
  refreshRoom();
}

function stopLobbyUpdates() {
  window.clearInterval(refreshTimer);
  lobbyStream?.close();
  refreshQueued = false;
}

showCode.addEventListener("click", () => {
  codeVisible = !codeVisible;
  renderCode();
});

copyCode.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(room.code);
    showStatus("방 코드를 복사했어요.");
  } catch {
    codeVisible = true;
    renderCode();
    showStatus("자동 복사가 차단됐어요. 표시된 코드를 선택해 복사해 주세요.");
  }
});

publicButton.addEventListener("click", () => {
  if (actionPending) return;
  if (room.publicSize) {
    changeRoom("/room/public", { size: null });
    return;
  }
  publicForm.reset();
  publicStatus.hidden = true;
  updatePublicOptions();
  publicDialog.showModal();
});

publicForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const size = Number(new FormData(publicForm).get("size"));
  changeRoom("/room/public", { size }, () => publicDialog.close());
});

document.getElementById("cancel-public").addEventListener("click", () => publicDialog.close());
chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = chatForm.elements.namedItem("text");
  const text = input.value.trim();
  if (!text || !room) return;
  changeRoom("/room/chat", { text }, () => {
    if (input.value.trim() === text) input.value = "";
  });
});
startButton.addEventListener("click", () => changeRoom("/room/start"));
document.getElementById("leave-room").addEventListener("click", async () => {
  await initialPresence;
  changeRoom("/room/leave", {}, () => location.replace("/"));
});

await initialPresence;
startLobbyUpdates();
window.addEventListener("pagehide", stopLobbyUpdates);
window.addEventListener("pageshow", (event) => {
  if (event.persisted) startLobbyUpdates();
});
