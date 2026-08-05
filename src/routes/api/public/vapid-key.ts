import { createFileRoute } from "@tanstack/react-router";

// Publishes the VAPID application-server public key so the browser always
// subscribes with the exact key the notification sender signs with.
export const Route = createFileRoute("/api/public/vapid-key")({
  server: {
    handlers: {
      GET: async () => {
        const key = process.env["VAPID_PUBLIC_KEY"] ?? "";
        return Response.json(
          { publicKey: key },
          { headers: { "Cache-Control": "public, max-age=300" } },
        );
      },
    },
  },
});
