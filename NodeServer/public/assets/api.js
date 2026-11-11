export async function request(path, body) {
  const options = { signal: AbortSignal.timeout(8_000) };
  if (body !== undefined) {
    options.method = "POST";
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`/api${path}`, options);
  if (response.status === 204) return;
  const data = response.headers.get("Content-Type")?.includes("application/json")
    ? await response.json()
    : null;
  if (response.ok) return data;

  const error = new Error(data?.message ?? "서버 요청을 처리하지 못했어요.");
  error.status = response.status;
  throw error;
}
