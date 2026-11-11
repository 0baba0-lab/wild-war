import { request } from "./api.js";
import "./presence.js";

const name = decodeURIComponent(location.pathname.split("/")[2]);
const label = name === "free" ? "자유게시판" : "버그게시판";
const endpoint = `/board/${name}`;
const list = document.getElementById("board-posts");
const status = document.getElementById("board-status");
const openWrite = document.getElementById("open-write");
const writeDialog = document.getElementById("write-dialog");
const writeForm = document.getElementById("board-form");
const writeSubmit = writeForm.querySelector("button[type=submit]");
const writeStatus = document.getElementById("write-status");
const postDialog = document.getElementById("post-dialog");
const title = document.getElementById("post-title");
const author = document.getElementById("post-author");
const body = document.getElementById("post-body");
const editButton = document.getElementById("edit-post");
const deleteButton = document.getElementById("delete-post");
const manageForm = document.getElementById("manage-post");
const editFields = document.getElementById("edit-fields");
const manageSubmit = document.getElementById("manage-submit");
const postStatus = document.getElementById("post-status");
let currentPost;
let mode;

document.title = `Wild War · ${label}`;
document.getElementById("board-heading").textContent = label;

function showStatus(target, message) {
  target.textContent = message;
  target.hidden = !message;
}

function renderDetail(post) {
  currentPost = post;
  title.textContent = post.title;
  author.textContent = post.nickname;
  author.hidden = !post.nickname;
  body.textContent = post.body;
  editButton.disabled = !post.editable;
  deleteButton.disabled = !post.editable;
  manageForm.reset();
  manageForm.hidden = true;
  showStatus(postStatus, post.editable ? "" : "작성 비밀번호가 없는 기존 글이에요.");
}

function renderPosts(posts) {
  if (!posts.length) {
    const item = document.createElement("li");
    item.textContent = "아직 등록된 글이 없어요.";
    list.replaceChildren(item);
    return;
  }

  list.replaceChildren(...posts.map((post) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "post-link";
    button.textContent = post.title;
    button.addEventListener("click", () => {
      renderDetail(post);
      postDialog.showModal();
    });
    item.append(button);
    if (post.nickname) {
      const nickname = document.createElement("span");
      nickname.className = "post-list-author";
      nickname.textContent = post.nickname;
      item.append(nickname);
    }
    return item;
  }));
}

openWrite.addEventListener("click", () => {
  showStatus(writeStatus, "");
  writeDialog.showModal();
});
document.getElementById("close-write").addEventListener("click", () => writeDialog.close());
writeDialog.addEventListener("close", () => { writeForm.elements.password.value = ""; });
document.getElementById("close-post").addEventListener("click", () => postDialog.close());
postDialog.addEventListener("close", () => { manageForm.elements.password.value = ""; });

writeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (writeSubmit.disabled) return;
  const values = Object.fromEntries(new FormData(writeForm));
  writeSubmit.disabled = true;
  openWrite.disabled = true;
  try {
    const data = await request(endpoint, values);
    renderPosts(data.posts);
    writeForm.reset();
    writeDialog.close();
    showStatus(status, "글을 등록했어요.");
  } catch (error) {
    showStatus(writeStatus, error.message);
  } finally {
    writeSubmit.disabled = false;
    openWrite.disabled = false;
  }
});

function beginManagement(action) {
  if (manageSubmit.disabled) return;
  mode = action;
  const editing = mode === "edit";
  manageForm.reset();
  editFields.disabled = !editing;
  editFields.hidden = !editing;
  manageSubmit.textContent = editing ? "수정 저장" : "삭제하기";
  if (editing) {
    manageForm.elements.title.value = currentPost.title;
    manageForm.elements.body.value = currentPost.body;
  }
  manageForm.hidden = false;
  showStatus(postStatus, "");
  const field = editing ? manageForm.elements.title : manageForm.elements.password;
  field.focus();
}

editButton.addEventListener("click", () => beginManagement("edit"));
deleteButton.addEventListener("click", () => beginManagement("delete"));

manageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (manageSubmit.disabled) return;
  const post = currentPost;
  const action = mode;
  const values = Object.fromEntries(new FormData(manageForm));
  manageSubmit.disabled = true;
  try {
    const data = await request(`${endpoint}/${post.id}/${action}`, values);
    renderPosts(data.posts);
    if (currentPost.id !== post.id) return;
    if (action === "delete") {
      postDialog.close();
      showStatus(status, "글을 삭제했어요.");
      openWrite.focus();
    } else {
      renderDetail(data.posts.find(({ id }) => id === post.id));
      showStatus(postStatus, "글을 수정했어요.");
    }
  } catch (error) {
    if (currentPost.id === post.id) showStatus(postStatus, error.message);
  } finally {
    manageSubmit.disabled = false;
  }
});

try {
  renderPosts((await request(endpoint)).posts);
  openWrite.disabled = false;
} catch (error) {
  showStatus(status, error.status === 404 ? "게시판 주소를 서버에서 찾지 못했어요." : error.message);
}
