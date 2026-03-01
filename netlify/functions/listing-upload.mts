import type { Context } from "@netlify/functions";
import { getSupabase, verifyAdmin, jsonResponse } from "./auth-utils.mts";

const json = jsonResponse;

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) return json({ error: "Use multipart/form-data" }, 400);

  let formData: FormData;
  try { formData = await req.formData(); } catch (e: any) { return json({ error: "Invalid form data: " + e.message }, 400); }

  const username = (formData.get("username") as string) || "";
  const password = (formData.get("password") as string) || "";
  const file = formData.get("file") as File | null;

  if (!file) return json({ error: "No file provided" }, 400);

  const admin = await verifyAdmin(username, password);
  if (!admin) return json({ error: "Unauthorised" }, 403);

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const allowed = ["jpg", "jpeg", "png", "webp"];
  if (!allowed.includes(ext)) return json({ error: "Only JPG, PNG and WebP allowed" }, 400);
  if (!file.type.startsWith("image/")) return json({ error: "File must be an image" }, 400);

  const safeName = `listing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const fileBuffer = await file.arrayBuffer();

  const supabase = getSupabase();

  const { data, error } = await supabase.storage
    .from("marketplace")
    .upload(safeName, fileBuffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (error || !data) {
    return json({ error: "Storage error: " + (error?.message || "unknown") }, 500);
  }

  const publicUrl = `${Netlify.env.get("SUPABASE_URL")}/storage/v1/object/public/marketplace/${safeName}`;
  return json({ success: true, publicUrl });
};

export const config = { path: "/api/listing-upload" };
