import { corsHeaders } from "./cors.ts";

// corsHeaders default covers every existing caller unchanged; extraHeaders lets a function that
// needs per-request CORS (see corsHeadersForRequest in cors.ts) override Access-Control-Allow-
// Origin without every other function's calls having to pass anything.
export function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extraHeaders, "Content-Type": "application/json" },
  });
}
