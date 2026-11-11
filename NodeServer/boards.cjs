const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, randomUUID, scrypt, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");

const router = express.Router();
const dataDirectory = path.join(__dirname, "data");
const boardFile = path.join(dataDirectory, "boards.json");
const scryptAsync = promisify(scrypt);
const scryptOptions = { N: 32_768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const passwordLimits = new Map();
const passwordWindow = 60_000;
let boards;

function loadBoards() {
  if (boards) return boards;
  try {
    const stored = JSON.parse(fs.readFileSync(boardFile, "utf8"));
    boards = {
      free: stored.free.map(ensurePostId),
      bugs: stored.bugs.map(ensurePostId)
    };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    boards = { free: [], bugs: [] };
  }
  return boards;
}

function ensurePostId(post) {
  return post.id ? post : { ...post, id: randomUUID() };
}

function publicPosts(name) {
  return boards[name].map(({ id, title, body, nickname, passwordHash }) => ({
    id, title, body, nickname: nickname ?? "", editable: Boolean(passwordHash)
  }));
}

function savePosts(name, posts) {
  const next = { ...boards, [name]: posts };
  const temporary = boardFile + ".tmp";
  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.writeFileSync(temporary, JSON.stringify(next), "utf8");
  fs.renameSync(temporary, boardFile);
  boards = next;
}

function validPassword(password) {
  return typeof password === "string" && password.length > 0 && password.length <= 20;
}

function postContent(input) {
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const body = typeof input?.body === "string" ? input.body.trim() : "";
  if (!title || title.length > 80 || !body || body.length > 2_000) return null;
  return { title, body };
}

function allowPasswordAttempt(req, res) {
  const key = req.ip;
  const now = Date.now();
  let limit = passwordLimits.get(key);
  if (!limit || limit.until <= now) {
    limit = { count: 0, until: now + passwordWindow };
    passwordLimits.set(key, limit);
  }
  if (limit.count < 10) {
    limit.count++;
    return true;
  }
  res.set("Retry-After", String(Math.ceil((limit.until - now) / 1_000)));
  res.status(429).json({ message: "요청이 많아요. 잠시 뒤 다시 시도해 주세요." });
  return false;
}

const clearLimits = setInterval(() => {
  const now = Date.now();
  for (const [key, limit] of passwordLimits) {
    if (limit.until <= now) passwordLimits.delete(key);
  }
}, passwordWindow);
clearLimits.unref();

router.use("/:board", (req, res, next) => {
  const name = req.params.board;
  if (name !== "free" && name !== "bugs") return res.sendStatus(404);
  try {
    loadBoards();
    res.locals.boardName = name;
    next();
  } catch (error) {
    console.error("게시판 읽기 실패", error.message);
    res.status(500).json({ message: "게시판을 불러오지 못했어요." });
  }
});

router.get("/:board", (req, res) => res.json({ posts: publicPosts(res.locals.boardName) }));

router.post("/:board", async (req, res) => {
  const content = postContent(req.body);
  const nickname = typeof req.body?.nickname === "string" ? req.body.nickname.trim() : "";
  const password = req.body?.password;
  if (!content) {
    return res.status(400).json({ message: "제목은 1~80자, 내용은 1~2,000자로 입력해 주세요." });
  }
  if (!nickname || nickname.length > 24 || !validPassword(password)) {
    return res.status(400).json({ message: "닉네임은 1~24자로, 글 비밀번호는 최대 20자로 입력해 주세요." });
  }
  if (!allowPasswordAttempt(req, res)) return;

  const name = res.locals.boardName;
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt, 32, scryptOptions);
  const post = { id: randomUUID(), nickname, ...content, salt, passwordHash: hash.toString("hex") };
  savePosts(name, [post, ...boards[name]]);
  res.status(201).json({ posts: publicPosts(name) });
});

async function managePost(req, res, next) {
  const name = res.locals.boardName;
  const post = boards[name].find(({ id }) => id === req.params.id);
  if (!post) return res.sendStatus(404);
  if (!post.passwordHash) {
    return res.status(409).json({ message: "작성 비밀번호가 없는 기존 글이에요." });
  }
  const password = req.body?.password;
  if (!validPassword(password)) {
    return res.status(400).json({ message: "글 비밀번호를 입력해 주세요. 최대 20자예요." });
  }
  if (!allowPasswordAttempt(req, res)) return;

  const expected = Buffer.from(post.passwordHash, "hex");
  const hash = await scryptAsync(password, post.salt, 32, scryptOptions);
  if (expected.length !== hash.length || !timingSafeEqual(expected, hash)) {
    return res.status(403).json({ message: "작성할 때 정한 비밀번호와 일치하지 않아요." });
  }
  const index = boards[name].findIndex(({ id }) => id === post.id);
  if (index === -1) return res.sendStatus(404);
  res.locals.postIndex = index;
  next();
}

router.post("/:board/:id/edit", managePost, (req, res) => {
  const content = postContent(req.body);
  if (!content) {
    return res.status(400).json({ message: "제목은 1~80자, 내용은 1~2,000자로 입력해 주세요." });
  }
  const { boardName, postIndex } = res.locals;
  const posts = boards[boardName].slice();
  posts[postIndex] = { ...posts[postIndex], ...content };
  savePosts(boardName, posts);
  res.json({ posts: publicPosts(boardName) });
});

router.post("/:board/:id/delete", managePost, (req, res) => {
  const { boardName, postIndex } = res.locals;
  const posts = boards[boardName].slice();
  posts.splice(postIndex, 1);
  savePosts(boardName, posts);
  res.json({ posts: publicPosts(boardName) });
});

router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error("게시판 처리 실패", error.message);
  res.status(500).json({ message: "게시판 변경을 저장하지 못했어요." });
});

module.exports = router;
