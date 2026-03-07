import type { SupabaseClient } from "@supabase/supabase-js";

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPushToMembers(
  supabase: SupabaseClient,
  memberIds: string[],
  payload: PushPayload
): Promise<number> {
  if (!memberIds.length) return 0;

  const { data: tokenRows } = await supabase
    .from("push_tokens")
    .select("token")
    .in("member_id", memberIds);

  if (!tokenRows || tokenRows.length === 0) return 0;

  const messages = tokenRows.map(row => ({
    to: row.token,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
  }));

  // Expo push API — free, no account needed for basic sends
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(messages),
  });

  if (!res.ok) {
    console.error("Push notification send failed:", await res.text());
    return 0;
  }

  return messages.length;
}

export async function sendPushToAllMembers(
  supabase: SupabaseClient,
  payload: PushPayload
): Promise<number> {
  const today = new Date().toISOString().split("T")[0];
  const { data: members } = await supabase
    .from("members")
    .select("id")
    .gte("expiry_date", today)
    .eq("suspended", false);

  if (!members?.length) return 0;
  return sendPushToMembers(supabase, members.map(m => m.id), payload);
}
