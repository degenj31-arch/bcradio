BCradio 2.0 — 20 feature ideas to add next

Current state: BCradio has file-based and YouTube-based stations, world-synchronized playback, 2-second tuning static, 10 PM–7 AM silent hours, a secret studio for station/song management, and a responsive vintage-radio UI.

1. Global listener counter & tuning map
   Show how many people are tuned to each station and a world map of listeners. Use Supabase Realtime presence or a lightweight heartbeat table, rendered on the station page and the dial page.

2. Crossfade & gapless playback
   Fade out the outgoing song while fading in the next one so there is no dead air between tracks. Use WebAudio gain nodes and two overlapping audio elements / YouTube players.

3. Per-station live chat
   A real-time chat panel on each station page where listeners can react to the current song. Use Supabase Realtime channels scoped to the station ID.

4. Live DJ mode
   A “Go Live” button in the studio that interrupts the scheduled playlist and broadcasts the studio microphone or line-in audio to all listeners. Use WebRTC or WebSocket audio streaming with an override flag on the station.

5. Scheduled shows & station calendar
   Create scheduled blocks (e.g., “Morning Show 7:00–10:00 AM”) that can insert a pre-recorded mix, a live DJ, or jingles at specific times. Store in a `schedule` table and evaluate it before choosing the next song.

6. Custom visual themes & backgrounds
   Let each station have a custom background image, logo, and color palette, applied to its player page. Upload images to storage and extend the `stations` table.

7. Audio waveform / spectrum visualizer
   A canvas-based frequency analyzer driven by the playing audio or YouTube audio. Use WebAudio `AnalyserNode` behind the existing audio element.

8. Favorites, listening history & recommendations
   Let listeners heart songs, store history in a `song_plays` or `likes` table, and surface “You may also like” suggestions based on station or artist similarity.

9. Song request & voting queue
   A public “request” button that lets listeners vote on the next song; the top-voted track gets inserted at the next playlist boundary. Persist votes in a `requests` table with realtime updates.

10. Sleep timer & alarm clock
    A “stop after 30/60 minutes” sleep timer and a “wake up to station X at 7:00 AM” alarm. Use client-side timers and optional notification API.

11. Auto-scan / frequency seeker
    A “Scan” button that sweeps through stations, playing a short snippet of each until the user taps “Lock.” Simulates a real car radio scan experience.

12. Recorded station IDs & voiceovers
    Record short voice clips directly in the browser from the studio and insert them as jingles between songs. Use `MediaRecorder` API and store the clips in storage.

13. Audio normalization & loudness limiting
    Analyze and/or dynamically adjust playback gain so all songs feel equally loud. Use WebAudio gain automation or an offline loudness scan on upload.

14. Podcast / time-shift archive
    Continuously record each station’s 24-hour broadcast so listeners can rewind or replay the last day. Requires segmented audio capture and a player timeline scrubber.

15. Ad / jingle injection system
    Upload short ads or station IDs and configure them to play every N songs or at specific clock times. Keeps the playlist continuous while adding branding.

16. Collaborative studio with roles
    Allow multiple DJs to manage the same station simultaneously with live cursor indicators, optimistic locking, and role-based permissions (e.g., owner vs. contributor).

17. Mobile PWA + offline static mode
    Add a web app manifest, service worker, and an offline fallback page that still plays the static noise. Enables background audio, lock-screen controls, and app install.

18. Social sharing cards for “Now Playing”
    Generate shareable links (e.g., `/station/98.7?t=…`) that open the station at the exact same song and offset. Include OpenGraph metadata for the current track.

19. Timezone-aware / multi-timezone off-air schedule
    Let each station define its own silent hours, or support region-based off-air windows so listeners everywhere get the same local silent hours.

20. Public API & webhooks
    Expose `/api/public/now-playing` endpoints and webhooks so external apps, Discord bots, or IoT devices can read the current track, submit requests, or trigger station events.

Suggested priority order:
1–3: Listener presence, crossfade, chat (core social & audio polish)
4–7: Live DJ, schedule, themes, visualizer (broadcast depth)
8–12: Favorites, requests, sleep timer, scan, voiceovers (engagement)
13–17: Loudness, archive, ads, collaboration, PWA (production readiness)
18–20: Sharing, timezones, API (distribution & integrations)

Implementation stack: keep using TanStack Start + Lovable Cloud; most features are table extensions + Supabase Realtime + WebAudio. No new backend platform is needed.
