import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  // Extract path from URL: /api/video/articles/media-xxx.mp4 -> articles/media-xxx.mp4
  const url = new URL(req.url);
  const videoPath = url.pathname.replace(/^\/api\/video\//, "");

  if (!videoPath || !videoPath.startsWith("articles/")) {
    return new Response("Invalid path", { status: 400 });
  }

  const supabaseUrl = Netlify.env.get("SUPABASE_URL") || "https://haqzphzgejxnxtxmuvpt.supabase.co";
  const upstreamUrl = `${supabaseUrl}/storage/v1/object/public/gallery/${videoPath}`;

  const fetchHeaders: HeadersInit = {};
  const range = req.headers.get("range");
  if (range) fetchHeaders["Range"] = range;

  const upstream = await fetch(upstreamUrl, { headers: fetchHeaders });

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Type", "video/mp4");
  responseHeaders.set("Accept-Ranges", "bytes");
  responseHeaders.set("Cache-Control", "public, max-age=86400");
  responseHeaders.set("Access-Control-Allow-Origin", "*");

  const contentLength = upstream.headers.get("content-length");
  const contentRange  = upstream.headers.get("content-range");
  if (contentLength) responseHeaders.set("Content-Length", contentLength);
  if (contentRange)  responseHeaders.set("Content-Range", contentRange);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
};

export const config = { path: "/api/video/:splat" };
