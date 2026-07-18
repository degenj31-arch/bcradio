import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Tables } from "@/integrations/supabase/types";

export type ChatMessage = Tables<"station_messages">;

const heartbeatInput = z.object({
  stationId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

export const stationHeartbeat = createServerFn({ method: "POST" })
  .inputValidator((data) => heartbeatInput.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { error } = await supabaseAdmin
      .from("station_sessions")
      .upsert(
        { id: data.sessionId, station_id: data.stationId, last_seen: now },
        { onConflict: "id" }
      );
    if (error) throw error;
    await supabaseAdmin.from("station_sessions").delete().lt("last_seen", cutoff);
    const { count, error: countErr } = await supabaseAdmin
      .from("station_sessions")
      .select("*", { count: "exact", head: true })
      .eq("station_id", data.stationId)
      .gt("last_seen", cutoff);
    if (countErr) throw countErr;
    return { count: count ?? 0 };
  });

const countsInput = z.object({
  stationIds: z.array(z.string().uuid()),
});

export const getListenerCounts = createServerFn({ method: "GET" })
  .inputValidator((data) => countsInput.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from("station_sessions")
      .select("station_id")
      .gt("last_seen", cutoff);
    if (error) throw error;
    const counts: Record<string, number> = {};
    data.stationIds.forEach((id) => {
      counts[id] = 0;
    });
    (rows ?? []).forEach((r) => {
      counts[r.station_id] = (counts[r.station_id] ?? 0) + 1;
    });
    return counts;
  });

const chatInput = z.object({
  stationId: z.string().uuid(),
  nickname: z.string().trim().min(1).max(30),
  body: z.string().trim().min(1).max(500),
});

export const sendChatMessage = createServerFn({ method: "POST" })
  .inputValidator((data) => chatInput.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("station_messages").insert({
      station_id: data.stationId,
      nickname: data.nickname,
      body: data.body,
    });
    if (error) throw error;
    return { ok: true };
  });

const messagesInput = z.object({
  stationId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const getChatMessages = createServerFn({ method: "GET" })
  .inputValidator((data) => messagesInput.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("station_messages")
      .select("*")
      .eq("station_id", data.stationId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return (rows ?? []).reverse();
  });
