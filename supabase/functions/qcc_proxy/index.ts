import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async () => {
  return new Response(
    JSON.stringify({
      ok: false,
      message: "qcc_proxy stub",
    }),
    {
      headers: { "Content-Type": "application/json" },
      status: 501,
    }
  );
});
