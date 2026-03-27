export const API_URL = "http://85.198.102.121";

export async function apiRequest(path: string, method: string, body?: any) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new Error("API error");
  }

  const text = await res.text();
  return text ? JSON.parse(text) : {};
}
