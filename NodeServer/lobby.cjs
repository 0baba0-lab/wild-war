const express = require("express");
const { randomBytes } = require("node:crypto");
const boards = require("./boards.cjs");
const createPresenceRouter = require("./presence.cjs");

const router = express.Router();
const sessions = new Map();
const rooms = new Map();
const maxPlayers = 4;
const onlineFor = 10_000;
const lobbyReconnectGrace = 5_000;
const lobbyTimeout = 30_000;
const keepSeatFor = 120_000;
const sessionLifetime = 3_600_000;
let nextMatchOrder = 1;
let nextPublicOrder = 1;

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (req.method === "POST" && !req.is("application/json")) return res.sendStatus(415);
  next();
});
router.use(express.json({ limit: "12kb" }));
router.use("/board", boards);
router.use("/presence", createPresenceRouter(getSession));

function getSession(req, res) {
  const cookie = req.headers.cookie || "";
  const id = /(?:^|;\s*)wildwar_session=([A-Za-z0-9_-]{32})(?:;|$)/.exec(cookie)?.[1];
  let session = sessions.get(id);

  if (!session) {
    session = { lastSeen: 0, room: null, match: null, matchedBy: null };
    const token = randomBytes(24).toString("base64url");
    sessions.set(token, session);
    res.cookie("wildwar_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.secure,
      path: "/"
    });
  }

  session.lastSeen = Date.now();
  return session;
}

function leaveRoom(session, explicit = true) {
  const room = session.room;
  if (!room) return;

  if (room.host === session && room.startedWith === null) {
    rooms.delete(room.code);
    for (const player of room.players) {
      player.session.room = null;
      player.session.matchedBy = null;
      closeLobbyStreams(player);
    }
    return;
  }

  const player = room.players.find((member) => member.session === session);
  if (explicit && player) player.leftGame = true;
  room.players = room.players.filter((member) => member.session !== session);
  session.room = null;
  session.matchedBy = null;
  if (player) closeLobbyStreams(player);
  notifyLobby(room);
  if (room.players.length === 0) rooms.delete(room.code);
}

function sendLobbyEvent(player, event) {
  for (const stream of player.lobbyStreams) {
    if (stream.destroyed || stream.writableEnded) continue;
    if (stream.writableNeedDrain) stream.destroy();
    else stream.write(`event: ${event}\ndata: {}\n\n`);
  }
}

function closeLobbyStreams(player) {
  sendLobbyEvent(player, "room-change");
  for (const stream of player.lobbyStreams) stream.end();
}

function notifyLobby(room) {
  for (const player of room.players) sendLobbyEvent(player, "room-change");
}

let lobbyTicks = 0;
const lobbyMaintenance = setInterval(() => {
  const now = Date.now();
  const heartbeat = ++lobbyTicks % 5 === 0;
  for (const room of rooms.values()) {
    if (room.startedWith !== null) continue;
    for (const player of room.players) {
      if (player.session.room !== room) continue;
      const idle = now - player.lastLobbySeen;
      const disconnected = player.lobbyStreams.size === 0 && player.lobbyClosedAt !== null &&
        now - Math.max(player.lastLobbySeen, player.lobbyClosedAt) >= lobbyReconnectGrace;
      if (disconnected || idle >= lobbyTimeout) leaveRoom(player.session, false);
      else if (heartbeat) sendLobbyEvent(player, "room-heartbeat");
    }
  }
}, 1_000);
lobbyMaintenance.unref();

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    const idle = now - session.lastSeen;
    if (idle >= keepSeatFor) leaveRoom(session, false);
    if (idle >= sessionLifetime) sessions.delete(token);
  }
}, 15_000);
cleanup.unref();

function addPlayer(room, session, matchedBy = null) {
  room.players.push({
    id: room.nextPlayerId++, session, lobbyStreams: new Set(), lobbyClosedAt: null,
    lastLobbySeen: Date.now(), ping: null
  });
  session.room = room;
  session.match = null;
  session.matchedBy = matchedBy;
  notifyLobby(room);
}

function roomCapacity(room) {
  return room.publicSize ?? maxPlayers;
}

function canStart(room) {
  return room.players.length >= (room.publicSize ?? 2);
}

function openPublicRooms(size) {
  // 먼저 공개된 방의 빈자리부터 채운다. 다시 공개하면 새 순서를 받는다.
  return [...rooms.values()].filter((room) =>
    room.publicSize === size && room.startedWith === null && room.players.length < size
  ).sort((a, b) => a.publicOrder - b.publicOrder);
}

function waitingForSize(size) {
  const cutoff = Date.now() - onlineFor;
  return [...sessions.values()].filter((session) =>
    !session.room && session.match?.size === size && session.match.seen >= cutoff
  );
}

function assignMatches(size) {
  const available = openPublicRooms(size);
  const waiting = waitingForSize(size).sort((a, b) => a.match.order - b.match.order);
  let next = 0;
  for (const room of available) {
    const needed = size - room.players.length;
    if (waiting.length - next < needed) break;
    const group = waiting.slice(next, next + needed);
    for (const session of group) addPlayer(room, session, session.match.id);
    next += needed;
  }

  const nextRoom = available.find((room) => room.players.length < size);
  return {
    count: Math.min(size, (nextRoom?.players.length ?? 0) + waiting.length - next),
    roomAvailable: Boolean(nextRoom)
  };
}

function roomMatchCount(room) {
  const size = room.publicSize;
  if (size === null || room.startedWith !== null) return null;
  if (room.players.length === size) return size;

  let waiting = waitingForSize(size).length;
  for (const candidate of openPublicRooms(size)) {
    const available = Math.min(waiting, size - candidate.players.length);
    if (candidate === room) return room.players.length + available;
    waiting -= available;
    if (waiting === 0) break;
  }
  return room.players.length;
}

function roomData(session) {
  const room = session.room;
  return {
    code: room.code,
    publicSize: room.publicSize,
    matchCount: roomMatchCount(room),
    isHost: room.host === session,
    startedWith: room.startedWith,
    maxPlayers: roomCapacity(room),
    canStart: canStart(room),
    chat: room.chat,
    players: room.players.map((player) => ({
      id: player.id,
      name: `플레이어 ${player.id}`,
      isHost: room.host === player.session,
      ping: player.ping
    }))
  };
}

router.get("/room", (req, res) => {
  const session = getSession(req, res);
  const room = session.room;
  if (!room) return res.sendStatus(404);
  const player = room.players.find((member) => member.session === session);
  player.lastLobbySeen = Date.now();
  if (typeof req.query.ping === "string" && /^\d{1,4}$/.test(req.query.ping)) {
    const ping = Number(req.query.ping);
    if (ping <= 8_000) player.ping = ping;
  }
  res.json(roomData(session));
});

router.get("/room/stream", (req, res) => {
  const session = getSession(req, res);
  const room = session.room;
  if (!room || room.startedWith !== null) return res.sendStatus(204);
  const player = room.players.find((member) => member.session === session);
  player.lastLobbySeen = Date.now();
  player.lobbyClosedAt = null;
  player.lobbyStreams.add(res);
  res.once("close", () => {
    player.lobbyStreams.delete(res);
    if (player.lobbyStreams.size === 0) player.lobbyClosedAt = Date.now();
  });
  res.set("Content-Type", "text/event-stream");
  res.set("Cache-Control", "no-store, no-transform");
  res.flushHeaders();
  res.write("retry: 1000\n\n");
});

router.post("/room", (req, res) => {
  const session = getSession(req, res);
  if (session.room?.startedWith) leaveRoom(session);
  if (session.room) return res.json(roomData(session));

  let code;
  do {
    code = randomBytes(8).toString("hex").toUpperCase();
  } while (rooms.has(code));

  const room = {
    code, host: session, players: [], nextPlayerId: 1,
    publicSize: null, startedWith: null, chat: []
  };
  addPlayer(room, session);
  rooms.set(code, room);
  res.status(201).json(roomData(session));
});

router.post("/room/join", (req, res) => {
  const session = getSession(req, res);
  session.match = null;
  const input = req.body?.code;
  const code = typeof input === "string" ? input.trim().toUpperCase() : "";
  if (!/^[0-9A-F]{16}$/.test(code)) {
    return res.status(400).json({ message: "초대 코드를 확인해 주세요." });
  }
  if (session.room?.code === code) return res.json(roomData(session));
  if (session.room && session.room.startedWith === null) {
    return res.status(409).json({ message: "현재 방에서 먼저 나가 주세요." });
  }

  const room = rooms.get(code);
  if (!room) return res.status(404).json({ message: "방을 찾을 수 없어요." });
  if (room.startedWith !== null || room.players.length >= roomCapacity(room)) {
    return res.status(409).json({ message: "입장할 수 없는 방이에요." });
  }
  leaveRoom(session);
  addPlayer(room, session);
  if (room.publicSize !== null) assignMatches(room.publicSize);
  res.json(roomData(session));
});

router.post("/match", (req, res) => {
  const session = getSession(req, res);
  const size = req.body?.size;
  const searchId = req.body?.searchId;
  if (![2, 3, 4].includes(size) || typeof searchId !== "string" || !/^[a-f0-9-]{36}$/.test(searchId)) {
    return res.sendStatus(400);
  }
  if (req.body.newSearch === true && session.room?.startedWith) leaveRoom(session);
  if (session.room) return res.json({ joined: true });
  if (req.body.newSearch === true && session.match?.id !== searchId) {
    session.match = { id: searchId, size, order: nextMatchOrder++, seen: 0 };
  }
  if (session.match?.id !== searchId || session.match.size !== size) {
    return res.json({ joined: false, cancelled: true });
  }

  session.match.seen = Date.now();
  const progress = assignMatches(size);
  res.json({ joined: Boolean(session.room), ...progress });
});

router.post("/match/cancel", (req, res) => {
  const session = getSession(req, res);
  const searchId = req.body?.searchId;
  if (typeof searchId !== "string") return res.sendStatus(400);
  if (session.match?.id === searchId) session.match = null;
  if (session.room && session.matchedBy === searchId) {
    if (session.room.startedWith !== null) return res.json({ joined: true });
    leaveRoom(session);
  }
  res.json({ joined: false });
});

function hostRoom(req, res, next) {
  const session = getSession(req, res);
  if (!session.room || session.room.host !== session) {
    return res.status(403).json({ message: "방장만 할 수 있어요." });
  }
  if (session.room.startedWith !== null) {
    return res.status(409).json({ message: "이미 시작된 방이에요." });
  }
  res.locals.session = session;
  next();
}

router.post("/room/public", hostRoom, (req, res) => {
  const session = res.locals.session;
  const room = session.room;
  const size = req.body?.size;
  if (size === null) {
    room.publicSize = null;
    for (const player of room.players) {
      if (player.session.matchedBy !== null) leaveRoom(player.session);
    }
    notifyLobby(room);
    return res.json(roomData(session));
  }
  if (room.publicSize !== null) {
    return res.status(409).json({ message: "공개를 취소한 뒤 매칭 인원을 바꿔 주세요." });
  }
  if (![2, 3, 4].includes(size) || size <= room.players.length) {
    return res.status(400).json({ message: "현재 인원보다 큰 매칭 인원을 선택해 주세요." });
  }
  room.publicSize = size;
  room.publicOrder = nextPublicOrder++;
  assignMatches(size);
  notifyLobby(room);
  res.json(roomData(session));
});

router.post("/room/start", hostRoom, (req, res) => {
  const session = res.locals.session;
  const room = session.room;
  if (!canStart(room)) {
    const message = room.publicSize ? `${room.publicSize}명이 모이면 시작할 수 있어요.` : "두 명 이상 있어야 시작할 수 있어요.";
    return res.status(409).json({ message });
  }
  room.startedWith = room.players.length;
  room.startedAt = Date.now();
  room.gamePlayers = [...room.players];
  for (const player of room.players) closeLobbyStreams(player);
  res.json(roomData(session));
});

router.post("/room/chat", (req, res) => {
  const session = getSession(req, res);
  const room = session.room;
  if (!room || room.startedWith !== null) return res.sendStatus(404);
  const input = req.body?.text;
  const text = typeof input === "string" ? input.trim() : "";
  if (!text || text.length > 300) return res.status(400).json({ message: "메시지는 1~300자로 입력해 주세요." });
  const player = room.players.find((member) => member.session === session);
  room.chat.push({ name: `플레이어 ${player.id}`, text });
  if (room.chat.length > 50) room.chat.shift();
  notifyLobby(room);
  res.json(roomData(session));
});

router.get("/game", (req, res) => {
  const session = getSession(req, res);
  const room = session.room;
  if (!room?.gamePlayers) return res.json({ players: [] });

  const now = Date.now();
  const self = room.players.find((player) => player.session === session);
  self.lastGameSeen = now;
  const players = room.gamePlayers.filter((player) => player !== self).map((player) => {
    let status = "접속 중";
    if (player.leftGame) status = "나감";
    else if (!player.lastGameSeen) status = now - room.startedAt < 15_000 ? "입장 중" : "연결 끊김";
    else if (now - player.lastGameSeen >= onlineFor) status = "연결 끊김";
    return { name: `플레이어 ${player.id}`, status };
  });
  res.json({ players });
});

router.post("/room/remove", hostRoom, (req, res) => {
  const session = res.locals.session;
  const player = session.room.players.find(({ id }) => id === req.body?.playerId);
  if (!player || player.session === session) return res.sendStatus(404);
  leaveRoom(player.session);
  res.json(roomData(session));
});

router.post("/room/leave", (req, res) => {
  leaveRoom(getSession(req, res));
  res.sendStatus(204);
});

module.exports = router;
