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