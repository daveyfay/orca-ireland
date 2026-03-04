import type { Context } from "@netlify/functions";
import nodemailer from "nodemailer";

function esc(s: string): string {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#x27;");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: Netlify.env.get("GMAIL_USER")!,
    pass: Netlify.env.get("GMAIL_APP_PASSWORD")!,
  },
});

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const { name: rawName, email: rawEmail, pickup: rawPickup, items: rawItems } = await req.json();

    if (!rawName || !rawEmail || !rawPickup || !rawItems) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
    }

    const name = esc(String(rawName).slice(0, 200));
    const email = esc(String(rawEmail).slice(0, 200));
    const pickup = esc(String(rawPickup).slice(0, 200));
    const items = esc(String(rawItems).slice(0, 2000));

    const adminEmail = Netlify.env.get("GMAIL_USER")!;

    const emailHeader = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f0f0f;color:#ffffff;border-radius:8px;overflow:hidden;">
      <div style="background:#1a1a1a;padding:24px 32px;border-bottom:3px solid #ff6b00;">
        <div style="font-size:1.4rem;font-weight:700;letter-spacing:3px;color:#ff6b00;">ORCA IRELAND</div>
        <div style="font-size:0.75rem;color:#888;letter-spacing:2px;margin-top:4px;">ON ROAD CIRCUIT ASSOCIATION</div>
      </div>
      <div style="padding:32px;">`;
    const emailFooter = `</div>
      <div style="background:#141414;padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);font-size:0.75rem;color:#666;">
        ORCA Ireland · St Anne's Park, Dublin · orca-ireland.com
      </div>
    </div>`;

    // Email to admin
    await transporter.sendMail({
      from: `"ORCA Ireland" <${adminEmail}>`,
      to: adminEmail,
      subject: `🛒 New Shop Order — ${name}`,
      html: `${emailHeader}
        <h2 style="color:#ff6b00;margin:0 0 20px;">New Shop Order</h2>
        <p style="color:#cccccc;"><strong style="color:#fff;">Name:</strong> ${name}</p>
        <p style="color:#cccccc;"><strong style="color:#fff;">Email:</strong> ${email}</p>
        <p style="color:#cccccc;"><strong style="color:#fff;">Collection:</strong> ${pickup}</p>
        <h3 style="color:#ffffff;margin-top:20px;">Items:</h3>
        <pre style="background:#1a1a1a;border:1px solid rgba(255,107,0,0.2);color:#cccccc;padding:16px;border-radius:6px;font-size:0.85rem;">${items}</pre>
      ${emailFooter}`,
    });

    // Confirmation to customer
    await transporter.sendMail({
      from: `"ORCA Ireland" <${adminEmail}>`,
      to: email,
      subject: `ORCA Ireland — Order Confirmed 🏁`,
      html: `${emailHeader}
        <h2 style="color:#ffffff;margin:0 0 16px;">Order Received! ✅</h2>
        <p style="color:#cccccc;line-height:1.6;">Hi ${name},</p>
        <p style="color:#cccccc;line-height:1.6;">Thanks for your order! We'll have your items ready for collection at <strong style="color:#fff;">${pickup}</strong>.</p>
        <h3 style="color:#ffffff;margin-top:20px;">Your order:</h3>
        <pre style="background:#1a1a1a;border:1px solid rgba(255,107,0,0.2);color:#cccccc;padding:16px;border-radius:6px;font-size:0.85rem;">${items}</pre>
        <p style="color:#cccccc;line-height:1.6;margin-top:20px;">Any questions? Reply to this email or find us at the track. See you on race day! 🏁</p>
      ${emailFooter}`,
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e: any) {
    console.error("shop-order error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
