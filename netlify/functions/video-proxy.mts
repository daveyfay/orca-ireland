import type { Context, Config } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  // Extract path from pathname: /api/video/articles/media-xxx.mp4 -> articles/media-xxx.mp4
  const videoPath = url.pathname.replace(/^\/api\/video\//, "");

  if (!videoPath || !videoPath.startsWith("articles/")) {
    return new Response("Invalid path", { status: 400 });
  }

  const supabaseUrl = Netlify.env.get("SUPABASE_URL") || "https://haqzphzgejxnxtxmuvpt.supabase.co";
  const upstreamUrl = `${supabaseUrl}/storage/v1/object/public/gallery/${videoPath}`;

  const fetchHeaders: Record<string, string> = {};
  const range = req.headers.get("range");
  if (range) fetchHeaders["Range"] = range;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, { headers: fetchHeaders });
  } catch (e) {
    return new Response("Upstream fetch failed", { status: 502 });
  }

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Type", "video/mp4");
  responseHeaders.set("Accept-Ranges", "bytes");
  responseHeaders.set("Cache-Control", "public, max-age=86400");

  const contentLength = upstream.headers.get("content-length");
  const contentRange  = upstream.headers.get("content-range");
  if (contentLength) responseHeaders.set("Content-Length", contentLength);
  if (contentRange)  responseHeaders.set("Content-Range", contentRange);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
};

export const config: Config = {
  // `:splat` only matches a single path segment, so the route never fired for
  // nested keys like `/api/video/articles/media-xxx.mp4` (returned 404 because
  // no route matched). `*` is the catch-all that matches the rest of the path.
  path: "/api/video/*",
};
