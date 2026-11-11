import { request } from "./api.js";
import { initialPresence } from "./presence.js";

const matchForm = document.getElementById("match-form");
const inviteForm = document.getElementById("invite-form");
const createButton = document.getElementById("create-room");
const cancelButton = document.getElementById("cancel-match");
const status = document.getElementById("entry-status");
const progress = document.getElementById("match-progress");
const entryControls = [...matchForm.querySelectorAll("input, #start-match"), createButton, ...inviteForm.elements];
let search;
let entering = false;

function showStatus(message) {
  status.textContent = message;
  status.hidden = !message;
}

function lockEntry(locked) {
  for (const control of entryControls) control.disabled = locked;
}

function finishSearch(message) {
  search = null;
  lockEntry(false);
  cancelButton.hidden = true;
  progress.hidden = true;
  showStatus(message);
}

async function findMatch(current, newSearch = false) {
  if (current !== search || current.cancelling) return;
  current.pending = request("/match", { size: current.size, searchId: current.id, newSearch });
  try {
    const result = await current.pending;
    if (current !== search || current.cancelling) return;
    if (result.joined) {
      location.assign("/lobby/");
    } else if (result.cancelled) {
      finishSearch("매칭이 취소됐어요.");
    } else {
      const label = result.roomAvailable ? "매칭 인원" : "공개방 대기 중";
      const message = `${label} ${result.count}/${current.size}`;
      if (progress.textContent !== message) progress.textContent = message;
      progress.hidden = false;
      current.timer = window.setTimeout(() => findMatch(current), 2_000);
    }
  } catch (error) {
    if (current !== search || current.cancelling) return;
    showStatus("연결을 확인해 주세요. 매칭을 취소할 수 있어요.");
  }
}

matchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (search || entering) return;
  const size = Number(new FormData(matchForm).get("size"));
  const current = { size, id: crypto.randomUUID(), cancelling: false };
  search = current;
  lockEntry(true);
  cancelButton.hidden = false;
  progress.textContent = `매칭 신청 1/${size}`;
  progress.hidden = false;
  showStatus(`${size}인 매칭 대기 중 · 빈자리를 모두 채우면 함께 입장해요.`);
  await initialPresence;
  await findMatch(current, true);
});

cancelButton.addEventListener("click", async () => {
  if (!search || search.cancelling) return;
  const current = search;
  current.cancelling = true;
  cancelButton.disabled = true;
  window.clearTimeout(current.timer);
  try {
    await initialPresence;
    await current.pending?.catch(() => {});
    const result = await request("/match/cancel", { searchId: current.id });
    if (result.joined) location.assign("/lobby/");
    else finishSearch("매칭을 취소했어요.");
  } catch (error) {
    current.cancelling = false;
    showStatus(error.message);
  } finally {
    cancelButton.disabled = false;
  }
});

async function enterRoom(path, body) {
  if (search || entering) return;
  entering = true;
  lockEntry(true);
  showStatus("");
  try {
    await initialPresence;
    await request(path, body);
    location.assign("/lobby/");
  } catch (error) {
    showStatus(error.message);
    entering = false;
    lockEntry(false);
  }
}

createButton.addEventListener("click", () => enterRoom("/room", {}));
inviteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = new FormData(inviteForm).get("code").trim();
  if (code) enterRoom("/room/join", { code });
  else showStatus("초대 코드를 입력해 주세요.");
});
