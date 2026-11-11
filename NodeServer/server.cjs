// 1. 서버에서 사용할 모듈과 설정을 불러온다.
const express = require("express");
const path = require("node:path");
const fs = require("node:fs");
const config = require("./config.json");
const lobbyApi = require("./lobby.cjs");

// 2. 이 파일의 위치를 기준으로 WebGL 폴더를 찾고,
//    서버를 시작하기 전에 기본 페이지가 있는지 확인한다.
const webGlRoot = path.resolve(__dirname, config.webGlPath);

if (!fs.existsSync(path.join(webGlRoot, "index.html"))) {
  throw new Error("WebGL 폴더에서 index.html을 찾지 못했습니다.");
}

// 3. 홈페이지, 대기실 API와 기존 Unity Web 빌드를 제공한다.
const app = express();
app.set("trust proxy", "loopback");
app.use("/api", lobbyApi);
app.get("/boards/:board", (req, res) => {
  if (req.params.board !== "free" && req.params.board !== "bugs") return res.sendStatus(404);
  res.sendFile(path.join(__dirname, "views", "board.html"));
});
app.use(express.static(path.join(__dirname, "public")));

// Unity 빌드의 HTML에 웹에서 관리하는 게임 상태와 나가기 버튼을 연결한다.
app.get(/^\/game\/(?:index\.html)?$/, async (req, res) => {
  const index = await fs.promises.readFile(path.join(webGlRoot, "index.html"), "utf8");
  const assets = '<link rel="stylesheet" href="/assets/style.css"><script type="module" src="/assets/game.js"></script>';
  const toolbar = `
    <header class="game-toolbar" aria-label="게임 접속 상태">
      <ul id="game-players" class="game-players" aria-label="다른 플레이어"></ul>
      <button type="button" id="leave-game">나가기</button>
      <p id="game-status" class="status" role="status" hidden></p>
    </header>`;
  res.type("html").send(index
    .replace(/<\/head>/i, assets + "$&")
    .replace(/<body\b[^>]*>/i, "$&" + toolbar));
});

// .br 파일에는 압축 방식과 압축을 풀었을 때의 파일 형식을 알려준다.
app.use("/game", express.static(webGlRoot, {
  index: "index.html",

  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".br")) {
      res.setHeader("Content-Encoding", "br");

      if (filePath.endsWith(".wasm.br")) {
        res.setHeader("Content-Type", "application/wasm");
      } else if (filePath.endsWith(".js.br")) {
        res.setHeader("Content-Type", "application/javascript");
      } else {
        res.setHeader("Content-Type", "application/octet-stream");
      }
    }
  }
}));

// 4. 설정한 주소와 포트에서 접속을 받는다.
//    시작에 실패하면 오류를 표시하고, 성공하면 접속 주소를 출력한다.
app.listen(config.port, config.host, (error) => {
  if (error) {
    throw error;
  }

  console.log(`접속 주소: http://${config.host}:${config.port}`);
});
