import type { Context } from "@netlify/functions";
import { getSupabase, verifyAdmin, jsonResponse } from "./auth-utils.mts";

const json = jsonResponse;

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Check content type — could be JSON (old) or multipart (new)
  const ct = req.headers.get("content-type") || "";

  let username: string, password: string, fileBuffer: ArrayBuffer, filename: string, contentType: string;

  if (ct.includes("multipart/form-data")) {
    // New path: file uploaded directly in form data
    let formData: FormData;
    try { formData = await req.formData(); } catch { return json({ error: "Invalid form data" }, 400); }
    username = (formData.get("username") as string) || "";
    password = (formData.get("password") as string) || "";
    const file = formData.get("file") as File | null;
    if (!file) return json({ error: "No file provided" }, 400);
    filename = file.name;
    contentType = file.type;
    fileBuffer = await file.arrayBuffer();
  } else {
    return json({ error: "Use multipart/form-data" }, 400);
  }

  const admin = await verifyAdmin(username, password);
  if (!admin) return json({ error: "Unauthorised" }, 403);

  // Sanitise filename
  const ext = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const allowed = ["jpg", "jpeg", "png", "webp"];
  if (!allowed.includes(ext)) return json({ error: "Only JPG, PNG and WebP allowed" }, 400);

  const safeName = `gallery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const supabase = getSupabase();

  // Upload via service role — no signed URL needed, no CORS issues
  const { data, error } = await supabase.storage
    .from("gallery")
    .upload(safeName, fileBuffer, {
      contentType: contentType || "image/jpeg",
      upsert: false,
    });

  if (error || !data) {
    return json({ error: "Storage upload failed: " + (error?.message || "unknown") }, 500);
  }

  const publicUrl = `${Netlify.env.get("SUPABASE_URL")}/storage/v1/object/public/gallery/${safeName}`;

  return json({ success: true, publicUrl, path: safeName });
};

export const config = { path: "/api/gallery-upload" };
