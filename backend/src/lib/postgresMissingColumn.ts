/**
 * PostgREST / Postgres "undefined_column" when a `.select()` lists a column that
 * does not exist on the remote database (e.g. migration not applied yet).
 */
export function isPostgresMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return (
    code === "42703" ||
    (message.includes("does not exist") &&
      (message.includes("column") || message.includes("Column")))
  );
}
