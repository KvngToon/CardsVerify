import type { APIContext } from "astro";

export const prerender = false;

export async function POST(context: APIContext) {
  try {
    const ct = context.request.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return new Response(JSON.stringify({ ok: false, error: "Content-Type must be application/json" }), { status: 415, headers: { "Content-Type": "application/json" } });
    }
    const body = await context.request.json();
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim();
    const reason = String(body?.reason || "").trim();
    const message = String(body?.message || "").trim();
    const ts = new Date().toISOString();

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ ok: false, error: "Missing required fields" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const RESEND_API_KEY = (context.locals.runtime?.env?.RESEND_API_KEY || import.meta.env.RESEND_API_KEY) as string | undefined;
    const to = "kvngtoon001@gmail.com";

    const lines = [
      "New contact form submission",
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      reason ? `Reason: ${reason}` : undefined,
      `Time: ${ts}`,
      "",
      message,
    ].filter(Boolean) as string[];
    const text = lines.join("\n");

    if (!RESEND_API_KEY) {
      console.warn("[contact] RESEND_API_KEY not set. Skipping email.", { name, email, reason, message });
      return new Response(JSON.stringify({ ok: true, emailed: false }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev",
        to: [to],
        subject: `Contact form: ${reason || "General"}`,
        text,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.warn("[contact] email send failed", err);
      return new Response(JSON.stringify({ ok: false, error: "Email send failed" }), { status: 502, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, emailed: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "Server error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
