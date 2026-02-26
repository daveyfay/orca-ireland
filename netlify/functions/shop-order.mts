import type { Context } from "@netlify/functions";
import nodemailer from "nodemailer";

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
    const { name, email, pickup, items } = await req.json();

    if (!name || !email || !pickup || !items) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
    }

    const adminEmail = Netlify.env.get("GMAIL_USER")!;

    // Email to admin
    await transporter.sendMail({
      from: adminEmail,
      to: adminEmail,
      subject: `🛒 New Shop Order — ${name}`,
      html: `
        <h2>New Shop Order</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Collection:</strong> ${pickup}</p>
        <h3>Items:</h3>
        <pre style="background:#f5f5f5;padding:12px;border-radius:4px;">${items}</pre>
      `,
    });

    // Confirmation to customer
    await transporter.sendMail({
      from: adminEmail,
      to: email,
      subject: `ORCA Ireland — Order Confirmed`,
      html: `
        <h2>Order Received!</h2>
        <p>Hi ${name},</p>
        <p>Thanks for your order! We'll have your items ready for collection at <strong>${pickup}</strong>.</p>
        <h3>Your order:</h3>
        <pre style="background:#f5f5f5;padding:12px;border-radius:4px;">${items}</pre>
        <p>Any questions? Reply to this email or find us at the track.</p>
        <p>— ORCA Ireland</p>
      `,
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e: any) {
    console.error("shop-order error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
