# Wild War

Unity로 개발하는 브라우저 전략 게임 프로젝트.

## 첫 배포 확인

Unity WebGL 빌드를 Node.js와 Express로 제공하고, Caddy를 통해
https://summerbug.shop 에서 원형 맵이 표시되는 것을 확인했다.

## 로컬 실행

1. Unity 2022.3.62f1과 WebGL Build Support를 준비한다.
2. `WildWar` 프로젝트를 열고 `WildWar/Builds/WebGL`에 빌드한다.
3. `NodeServer` 폴더에서 `npm.cmd ci`와 `node server.cjs`를 실행한다.
4. 브라우저에서 http://127.0.0.1:5000 을 연다.

## 배포 환경과 방화벽

- Windows 방화벽에서 Caddy 프로그램의 인바운드 TCP 80·443을 허용했다.
- TCP 80은 HTTP에서 HTTPS로의 리다이렉트와 HTTP 방식의 인증서 검증에 사용한다.
- TCP 443은 브라우저의 HTTPS 접속을 받는다.
- Node.js는 127.0.0.1:5000에서 대기하고, 같은 PC의 Caddy가 요청을 전달한다.