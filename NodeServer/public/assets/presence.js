import { request } from "./api.js";

const count = document.getElementById("online-count");
let timer;
let pending = false;
let stream;
let active = true;
let streamFailed = false;

function showCount(value) {
  if (count) count.textContent = value === undefined ? "현재 접속 —" : `현재 접속 ${value}명`;
}

function connect() {
  if (!active || (stream && stream.readyState !== EventSource.CLOSED)) return;
  stream = new EventSource("/api/presence/stream");
  stream.addEventListener("message", (event) => {
    streamFailed = false;
    showCount(JSON.parse(event.data).count);
  });
  stream.addEventListener("error", () => {
    streamFailed = true;
    heartbeat();
  });
}

async function heartbeat() {
  if (!active || pending) return;
  pending = true;
  window.clearTimeout(timer);
  try {
    const data = await request("/presence");
    if (streamFailed && stream?.readyState !== EventSource.OPEN) showCount(data.count);
  } catch {
    if (stream?.readyState !== EventSource.OPEN) showCount();
  } finally {
    pending = false;
    if (active) timer = window.setTimeout(() => {
      connect();
      heartbeat();
    }, 3_000);
  }
}

// 같은 브라우저에서 두 탭이 처음 열려도 세션 쿠키 발급을 한 번씩 처리한다.
const bootstrap = navigator.locks
  ? navigator.locks.request("wild-war-presence-session", heartbeat).catch(heartbeat)
  : heartbeat();
export const initialPresence = bootstrap.then(connect);

window.addEventListener("pagehide", () => {
  active = false;
  window.clearTimeout(timer);
  stream?.close();
  stream = null;
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    active = true;
    initialPresence.then(() => {
      connect();
      heartbeat();
    });
  }
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) heartbeat();
});
