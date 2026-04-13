import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const videoPath = url.searchParams.get("path");

  if (!videoPath || !videoPath.startsWith("articles/")) {
    return new Response("Invalid path", { status: 400 });
  }

  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const upstreamUrl = `${supabaseUrl}/storage/v1/object/public/gallery/${videoPath}`;

  // Forward range requests for iOS video streaming
  const headers: HeadersInit = {};
  const range = req.headers.get("range");
  if (range) headers["Range"] = range;

  const upstream = await fetch(upstreamUrl, { headers });

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Type", "video/mp4");
  responseHeaders.set("Accept-Ranges", "bytes");
  responseHeaders.set("Cache-Control", "public, max-age=86400");
  responseHeaders.set("Access-Control-Allow-Origin", "*");

  // Forward content headers from upstream
  const contentLength = upstream.headers.get("content-length");
  const contentRange = upstream.headers.get("content-range");
  if (contentLength) responseHeaders.set("Content-Length", contentLength);
  if (contentRange) responseHeaders.set("Content-Range", contentRange);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
};

export const config = { path: "/api/video/:splat" };
