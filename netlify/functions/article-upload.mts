import type { Context } from "@netlify/functions";
import { getSupabase, verifyAdmin, jsonResponse } from "./auth-utils.mts";

const json = jsonResponse;

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let formData: FormData;
  try { formData = await req.formData(); } catch (e: any) { return json({ error: "Invalid form data" }, 400); }

  const sessionToken = (formData.get("sessionToken") as string) || "";
  const username = (formData.get("username") as string) || "";
  const file = formData.get("file") as File | null;

  if (!file) return json({ error: "No file provided" }, 400);
  // 10 MB for images, 50 MB for video
  const isVideo = ["mp4", "mov", "webm"].includes(
    (file.name.split(".").pop() || "").toLowerCase()
  );
  const maxBytes = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxBytes) return json({ error: `File too large (max ${isVideo ? 50 : 10} MB)` }, 413);

  const admin = await verifyAdmin(username, null, sessionToken);
  if (!admin) return json({ error: "Unauthorised" }, 403);

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  const allowed = ["jpg", "jpeg", "png", "webp", "mp4", "mov", "webm"];
  if (!allowed.includes(ext)) return json({ error: "File type not allowed" }, 400);

  const safeName = `articles/media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const fileBuffer = await file.arrayBuffer();
  const supabase = getSupabase();

  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    mp4: "video/mp4", mov: "video/mp4", webm: "video/webm",
  };

  const { error } = await supabase.storage.from("gallery").upload(safeName, fileBuffer, {
    contentType: mimeMap[ext] || file.type,
    upsert: false,
  });

  if (error) return json({ error: error.message }, 500);

  const publicUrl = `${Netlify.env.get("SUPABASE_URL")}/storage/v1/object/public/gallery/${safeName}`;
  return json({ url: publicUrl });
};

export const config = { path: "/api/article-upload" };
