import type { Context } from "@netlify/functions";
import { getSupabase, verifyAdmin, jsonResponse } from "./auth-utils.mts";

const json = jsonResponse;

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const admin = await verifyAdmin(body.username, body.password);
  if (!admin) return json({ error: "Unauthorised" }, 403);

  const { filename, contentType } = body;
  if (!filename || !contentType) return json({ error: "filename and contentType required" }, 400);

  // Sanitise filename — strip path traversal, keep extension
  const ext = filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const allowed = ['jpg', 'jpeg', 'png', 'webp'];
  if (!allowed.includes(ext)) return json({ error: "Only JPG, PNG and WebP allowed" }, 400);

  const safeName = `gallery-${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;

  const supabase = getSupabase();

  // Create a signed upload URL (60s expiry — plenty for browser upload)
  const { data, error } = await supabase.storage
    .from("gallery")
    .createSignedUploadUrl(safeName);

  if (error || !data) {
    return json({ error: "Could not create upload URL: " + (error?.message || "unknown") }, 500);
  }

  const publicUrl = `${Netlify.env.get("SUPABASE_URL")}/storage/v1/object/public/gallery/${safeName}`;

  return json({ signedUrl: data.signedUrl, token: data.token, path: safeName, publicUrl });
};

export const config = { path: "/api/gallery-upload" };
