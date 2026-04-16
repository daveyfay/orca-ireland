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
  const sessionToken = (formData.get("sessionToken") as string) || "";
  const file = formData.get("file") as File | null;

  if (!file) return json({ error: "No file provided" }, 400);
  if (file.size > 10 * 1024 * 1024) return json({ error: "File too large (max 10 MB)" }, 413);

  const admin = await verifyAdmin(username, null, sessionToken || null);
  if (!admin) return json({ error: "Unauthorised" }, 403);

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const allowed = ["jpg", "jpeg", "png", "webp"];
  if (!allowed.includes(ext)) return json({ error: "Only JPG, PNG and WebP allowed" }, 400);
  if (!file.type.startsWith("image/")) return json({ error: "File must be an image" }, 400);

  const safeName = `gallery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const fileBuffer = await file.arrayBuffer();

  const supabase = getSupabase();

  // Upload to Supabase Storage
  const { data: storageData, error: storageError } = await supabase.storage
    .from("gallery")
    .upload(safeName, fileBuffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (storageError || !storageData) {
    return json({ error: "Storage error: " + (storageError?.message || "unknown") }, 500);
  }

  const publicUrl = `${Netlify.env.get("SUPABASE_URL")}/storage/v1/object/public/gallery/${safeName}`;

  // Get next sort order (avoid Date.now() — too large for INTEGER column)
  const { data: maxRow } = await supabase
    .from("gallery")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();
  const nextSort = (((maxRow as any)?.sort_order as number) || 0) + 10;

  // Insert gallery record
  const { data: galleryRow, error: dbError } = await supabase
    .from("gallery")
    .insert({ url: publicUrl, caption: null, is_large: false, sort_order: nextSort })
    .select()
    .single();

  if (dbError) {
    await supabase.storage.from("gallery").remove([safeName]);
    return json({ error: "DB error: " + dbError.message }, 500);
  }

  return json({ success: true, publicUrl, image: galleryRow });
};

export const config = { path: "/api/gallery-upload" };
