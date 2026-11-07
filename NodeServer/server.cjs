// 1. 서버에서 사용할 모듈과 설정을 불러온다.
const express = require("express");
const path = require("node:path");
const fs = require("node:fs");
const config = require("./config.json");

// 2. 이 파일의 위치를 기준으로 WebGL 폴더를 찾고,
//    서버를 시작하기 전에 기본 페이지가 있는지 확인한다.
const webGlRoot = path.resolve(__dirname, config.webGlPath);

if (!fs.existsSync(path.join(webGlRoot, "index.html"))) {
  throw new Error("WebGL 폴더에서 index.html을 찾지 못했습니다.");
}

// 3. WebGL 폴더의 파일을 제공한다.
//    기본 주소에서는 index.html을 보내고, .br 파일에는
//    압축 방식과 압축을 풀었을 때의 파일 형식을 알려준다.
const app = express();

app.use(express.static(webGlRoot, {
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