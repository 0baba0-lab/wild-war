import { request } from "./api.js";
import { initialPresence } from "./presence.js";

const players = document.getElementById("game-players");
const status = document.getElementById("game-status");
const leave = document.getElementById("leave-game");
let signature;

function showStatus(message) {
  status.textContent = message;
  status.hidden = !message;
}

async function refreshPlayers() {
  if (leave.disabled) {
    window.setTimeout(refreshPlayers, 2_000);
    return;
  }
  try {
    const data = await request("/game");
    const next = JSON.stringify(data.players);
    if (next !== signature) {
      signature = next;
      players.replaceChildren(...data.players.map((player) => {
        const item = document.createElement("li");
        item.textContent = `${player.name} · ${player.status}`;
        return item;
      }));
    }
    showStatus("");
  } catch {
    showStatus("상대 접속 상태를 확인하는 중이에요.");
  }
  window.setTimeout(refreshPlayers, 2_000);
}

leave.addEventListener("click", async () => {
  leave.disabled = true;
  try {
    await initialPresence;
    await request("/room/leave", {});
    location.replace("/");
  } catch (error) {
    showStatus(error.message);
    leave.disabled = false;
  }
});

await initialPresence;
await refreshPlayers();
