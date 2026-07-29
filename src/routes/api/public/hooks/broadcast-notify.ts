import { createFileRoute } from "@tanstack/react-router";
import { buildPushPayload } from "@block65/webcrypto-web-push";

// Massachusetts (ET) seconds-of-day + date key.
const TZ = "America/New_York";

function etParts(d: Date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "0";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + Number(get("minute")),
  };
}

const MORNING = [
  { title: "BCradio is on the air", body: "7:30 AM in Massachusetts — the transmitter is warm and the dial is glowing. Tune in." },
  { title: "Good morning from BCradio", body: "Broadcasting has begun. Same song, same second, everywhere on earth." },
  { title: "Sign-on complete", body: "BCradio just started its day. Grab your coffee and turn the dial." },
  { title: "The dial is lit", body: "Morning broadcast is live across every frequency. Come listen." },
  { title: "We're back on air", body: "Silent hours are over — BCradio is broadcasting worldwide again." },
  { title: "Rise and tune", body: "BCradio's morning transmission has started. HD-2 is spinning too." },
  { title: "Static's gone", body: "BCradio is officially broadcasting for the day. See you on the dial." },
];

const EVENING = [
  { title: "Last call on BCradio", body: "9:00 PM ET — one more hour of broadcasting before the silent hours." },
  { title: "Winding down", body: "BCradio signs off at 10 PM. Catch the final hour while it lasts." },
  { title: "Final hour of the day", body: "The night static rolls in at 10:00 PM ET. Listen while the dial's still warm." },
  { title: "Almost sign-off", body: "BCradio has one hour left on air tonight. Don't miss the last set." },
  { title: "Evening transmission", body: "60 minutes until BCradio goes quiet for the night." },
  { title: "Closing the dial soon", body: "BCradio broadcasts until 10 PM ET. Squeeze in a few more songs." },
  { title: "Nightfall on BCradio", body: "One hour to go before the silent hours take over." },
];

function pick<T>(arr: T[], dateKey: string): T {
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) h = (h * 31 + dateKey.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

export const Route = createFileRoute("/api/public/hooks/broadcast-notify")({
  server: {
    handlers: {
      POST: async () => {
        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const vapid = {
          subject: process.env.VAPID_SUBJECT || "mailto:notifications@bcradio.app",
          publicKey: process.env.VAPID_PUBLIC_KEY!,
          privateKey: process.env.VAPID_PRIVATE_KEY!,
        };
        if (!vapid.publicKey || !vapid.privateKey) {
          return Response.json({ ok: false, error: "VAPID keys missing" }, { status: 500 });
        }

        const { date, minutes } = etParts(new Date());
        // Fire within a 15-minute window after each slot; the log table dedupes.
        let slot: "morning" | "evening" | null = null;
        if (minutes >= 7 * 60 + 30 && minutes < 7 * 60 + 45) slot = "morning";
        else if (minutes >= 21 * 60 && minutes < 21 * 60 + 15) slot = "evening";
        if (!slot) return Response.json({ ok: true, skipped: "outside slot window" });

        const slotKey = `${date}:${slot}`;
        const rest = async (path: string, init?: RequestInit) =>
          fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
            ...init,
            headers: {
              apikey: SERVICE_KEY,
              Authorization: `Bearer ${SERVICE_KEY}`,
              "Content-Type": "application/json",
              ...(init?.headers as Record<string, string> | undefined),
            },
          });

        // Claim the slot — unique constraint prevents duplicates.
        const claim = await rest("notification_log", {
          method: "POST",
          body: JSON.stringify({ slot_key: slotKey }),
        });
        if (!claim.ok) {
          const body = await claim.text();
          if (claim.status === 409) return Response.json({ ok: true, skipped: "already sent" });
          return Response.json({ ok: false, error: body }, { status: 500 });
        }

        const subsRes = await rest("push_subscriptions?select=endpoint,p256dh,auth");
        if (!subsRes.ok) {
          return Response.json({ ok: false, error: await subsRes.text() }, { status: 500 });
        }
        const subs = (await subsRes.json()) as { endpoint: string; p256dh: string; auth: string }[];

        const msg = pick(slot === "morning" ? MORNING : EVENING, slotKey);
        let sent = 0;
        const stale: string[] = [];

        await Promise.all(
          subs.map(async (s) => {
            try {
              const payload = await buildPushPayload(
                {
                  data: JSON.stringify({ title: msg.title, body: msg.body, url: "/", tag: `bcradio-${slot}` }),
                  options: { ttl: 3600 },
                },
                { endpoint: s.endpoint, expirationTime: null, keys: { p256dh: s.p256dh, auth: s.auth } },
                vapid,
              );
              const res = await fetch(s.endpoint, payload as unknown as RequestInit);
              if (res.status === 404 || res.status === 410) stale.push(s.endpoint);
              else if (res.ok) sent++;
            } catch (e) {
              console.error("[push]", e);
            }
          }),
        );

        for (const endpoint of stale) {
          await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: "DELETE" });
        }
        await rest(`notification_log?slot_key=eq.${encodeURIComponent(slotKey)}`, {
          method: "PATCH",
          body: JSON.stringify({ sent_count: sent }),
        });

        return Response.json({ ok: true, slot, sent, removed: stale.length });
      },
    },
  },
});
