const configuredApiBase =
  import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_BASE_URL ?? "";

export const API_BASE = configuredApiBase || (import.meta.env.DEV ? "http://localhost:3003" : "");

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const normalizedPath = path.startsWith("/api/")
    ? path
    : `/api${path.startsWith("/") ? path : `/${path}`}`;

  const response = await fetch(`${API_BASE}${normalizedPath}`, {
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
