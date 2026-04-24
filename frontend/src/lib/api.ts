const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3003/api";

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export { API_BASE_URL };
