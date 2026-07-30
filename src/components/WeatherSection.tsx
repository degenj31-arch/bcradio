import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_PLACE, describeCode, fetchWeather, formatClock, formatDay, formatHour,
  hourlyStartIndex, nextPrecip, placeLabel, searchPlaces, uvLabel, windDirection,
  type GeoPlace, type WeatherData,
} from "@/lib/weather";
import {
  CloudSun, Search, MapPin, Wind, Droplets, Gauge, Eye, Sunrise, Sunset,
  ThermometerSun, RefreshCw, AlertTriangle,
} from "lucide-react";

const STORAGE_KEY = "bcradio.weather.place";

export function WeatherSection() {
  const [place, setPlace] = useState<GeoPlace>(DEFAULT_PLACE);
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPlace(JSON.parse(raw) as GeoPlace);
    } catch { /* noop */ }
  }, []);

  const load = useCallback(async (p: GeoPlace) => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchWeather(p);
      setData(d);
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Weather unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(place); }, [place, load]);

  // Auto-refresh every 10 seconds (silently — no loading flash).
  useEffect(() => {
    const id = setInterval(() => {
      fetchWeather(place)
        .then((d) => { setData(d); setUpdatedAt(new Date()); setError(null); })
        .catch(() => { /* keep last good reading */ });
    }, 10_000);
    return () => clearInterval(id);
  }, [place]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (query.trim().length < 2) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try { setResults(await searchPlaces(query)); }
      catch { setResults([]); }
      finally { setSearching(false); }
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query]);

  const choose = (p: GeoPlace) => {
    setPlace(p);
    setQuery("");
    setResults([]);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* noop */ }
  };

  const startIdx = useMemo(() => (data ? hourlyStartIndex(data) : 0), [data]);
  const upcoming = useMemo(() => {
    if (!data) return [];
    return data.hourly.time.slice(startIdx, startIdx + 12).map((t, i) => {
      const k = startIdx + i;
      return {
        time: t,
        temp: data.hourly.temperature_2m[k],
        feels: data.hourly.apparent_temperature[k],
        prob: data.hourly.precipitation_probability?.[k] ?? 0,
        code: data.hourly.weather_code[k],
        wind: data.hourly.wind_speed_10m[k],
      };
    });
  }, [data, startIdx]);

  const precip = useMemo(() => (data ? nextPrecip(data, startIdx) : null), [data, startIdx]);
  const cur = data?.current;
  const today = data?.daily;
  const desc = cur ? describeCode(cur.weather_code) : null;

  return (
    <section id="weather" className="mt-10 md:mt-14">
      <div className="panel p-5 sm:p-6 md:p-10">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">BCradio Weather Desk</div>
            <h2 className="font-display text-2xl md:text-3xl flex items-center gap-2">
              <CloudSun className="w-6 h-6 text-amber" /> Local forecast
            </h2>
          </div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            {loading && !data ? "Loading…" : "Live · auto-updates every 10s"}
          </div>

        {/* Location search */}
        <div className="relative mb-6">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Town / city, state, country or ZIP — e.g. Shrewsbury Massachusetts"
              className="w-full bg-transparent outline-none text-sm"
              aria-label="Search for a location"
            />
          </div>
          {(results.length > 0 || searching) && (
            <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-card shadow-xl max-h-72 overflow-auto">
              {searching && <div className="px-3 py-2 text-xs text-muted-foreground font-mono">Searching…</div>}
              {results.map((r) => (
                <button
                  key={`${r.id}-${r.latitude}`}
                  onClick={() => choose(r)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/60 text-sm flex items-start gap-2"
                >
                  <MapPin className="w-3.5 h-3.5 mt-0.5 text-amber shrink-0" />
                  <span>
                    <span className="font-medium">{r.name}</span>
                    <span className="text-muted-foreground">
                      {" "}· {[r.admin2, r.admin1, r.country].filter(Boolean).join(", ")}
                    </span>
                    {r.postcodes?.[0] && (
                      <span className="text-muted-foreground font-mono text-xs"> · {r.postcodes[0]}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 text-[11px] font-mono text-muted-foreground flex items-center gap-1.5">
            <MapPin className="w-3 h-3" /> {placeLabel(place)}
            {place.postcodes?.[0] ? ` · ${place.postcodes[0]}` : ""}
            {" · "}{place.latitude.toFixed(3)}, {place.longitude.toFixed(3)}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive-foreground bg-destructive/20 border border-destructive/40 rounded-md px-3 py-2">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        )}

        {!data && loading && (
          <div className="py-10 text-center font-mono text-sm text-muted-foreground animate-pulse">
            ⟨ pulling the wire report… ⟩
          </div>
        )}

        {data && cur && today && desc && (
          <>
            {/* Current conditions */}
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div className="rounded-lg border border-border bg-background/40 p-5">
                <div className="flex items-center gap-4">
                  <div className="text-5xl leading-none">{desc.icon}</div>
                  <div>
                    <div className="font-display text-5xl sm:text-6xl dial-glow text-amber leading-none">
                      {Math.round(cur.temperature_2m)}°
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">{desc.label}</div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <span className="text-muted-foreground">
                    Feels like <span className="text-foreground">{Math.round(cur.apparent_temperature)}°</span>
                  </span>
                  <span className="text-muted-foreground">
                    High <span className="text-foreground">{Math.round(today.temperature_2m_max[0])}°</span>
                  </span>
                  <span className="text-muted-foreground">
                    Low <span className="text-foreground">{Math.round(today.temperature_2m_min[0])}°</span>
                  </span>
                </div>
                <div className="mt-3 text-[11px] font-mono text-muted-foreground">
                  Updated {updatedAt ? formatClock(updatedAt.toISOString()) : "—"} · Open-Meteo best-match model
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Stat icon={<Wind className="w-4 h-4" />} label="Wind"
                  value={`${Math.round(cur.wind_speed_10m)} mph ${windDirection(cur.wind_direction_10m)}`}
                  sub={`Gusts ${Math.round(cur.wind_gusts_10m)} mph`} />
                <Stat icon={<Droplets className="w-4 h-4" />} label="Humidity"
                  value={`${Math.round(cur.relative_humidity_2m)}%`}
                  sub={`Dew pt ${Math.round(cur.dew_point_2m)}°`} />
                <Stat icon={<Gauge className="w-4 h-4" />} label="Pressure"
                  value={`${Math.round(cur.pressure_msl)} hPa`}
                  sub={`${(cur.pressure_msl * 0.02953).toFixed(2)} inHg`} />
                <Stat icon={<Eye className="w-4 h-4" />} label="Visibility"
                  value={`${(cur.visibility / 1609).toFixed(1)} mi`}
                  sub={`Cloud ${Math.round(cur.cloud_cover)}%`} />
                <Stat icon={<ThermometerSun className="w-4 h-4" />} label="UV index"
                  value={`${Math.round(today.uv_index_max[0])}`}
                  sub={uvLabel(today.uv_index_max[0])} />
                <Stat icon={<Sunrise className="w-4 h-4" />} label="Sun"
                  value={formatClock(today.sunrise[0])}
                  sub={<span className="inline-flex items-center gap-1"><Sunset className="w-3 h-3" />{formatClock(today.sunset[0])}</span>} />
              </div>
            </div>

            {/* Precipitation outlook */}
            <div className="mt-5 rounded-lg border border-amber/30 bg-amber/5 px-4 py-3 text-sm">
              {precip ? (
                <>
                  <span className="font-medium text-amber capitalize">{precip.kind === "storm" ? "Thunderstorms" : precip.kind}</span>
                  {" expected around "}
                  <span className="font-mono">{formatHour(precip.time)}</span>
                  {" ("}{formatDay(precip.time.slice(0, 10), precip.time.slice(0, 10) === data.daily.time[0] ? 0 : 1)}{")"}
                  {precip.probability > 0 && <> · {precip.probability}% chance</>}
                  {". Today's total: "}
                  {today.precipitation_sum[0].toFixed(2)}&quot;
                  {today.snowfall_sum[0] > 0 && <> · {today.snowfall_sum[0].toFixed(1)}&quot; snow</>}
                </>
              ) : (
                <>No rain, snow, or storms expected in the next {data.hourly.time.length - startIdx} hours. Dry skies over {place.name}.</>
              )}
            </div>

            {/* Hourly */}
            <div className="mt-6">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Next 12 hours</div>
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                {upcoming.map((h) => {
                  const d = describeCode(h.code);
                  return (
                    <div key={h.time} className="min-w-[84px] shrink-0 rounded-lg border border-border bg-background/40 p-3 text-center">
                      <div className="font-mono text-[10px] text-muted-foreground">{formatHour(h.time)}</div>
                      <div className="text-2xl my-1" title={d.label}>{d.icon}</div>
                      <div className="font-display text-xl">{Math.round(h.temp)}°</div>
                      <div className="text-[10px] font-mono text-muted-foreground mt-1">{h.prob}% · {Math.round(h.wind)}mph</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 7-day */}
            <div className="mt-6">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">7-day outlook</div>
              <div className="grid gap-2">
                {data.daily.time.map((t, i) => {
                  const d = describeCode(data.daily.weather_code[i]);
                  const max = data.daily.temperature_2m_max[i];
                  const min = data.daily.temperature_2m_min[i];
                  return (
                    <div key={t} className="flex items-center gap-3 rounded-md border border-border bg-background/30 px-3 py-2 text-sm">
                      <div className="w-14 font-mono text-xs text-muted-foreground shrink-0">{formatDay(t, i)}</div>
                      <div className="text-xl w-7 shrink-0 text-center">{d.icon}</div>
                      <div className="flex-1 min-w-0 truncate text-muted-foreground">{d.label}</div>
                      <div className="hidden sm:block font-mono text-[11px] text-muted-foreground shrink-0">
                        {data.daily.precipitation_probability_max[i] ?? 0}% · {Math.round(data.daily.wind_speed_10m_max[i])}mph
                      </div>
                      <div className="font-mono text-xs shrink-0 w-[70px] text-right">
                        <span className="text-foreground">{Math.round(max)}°</span>
                        <span className="text-muted-foreground"> / {Math.round(min)}°</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Stat({ icon, label, value, sub }: {
  icon: React.ReactNode; label: string; value: string; sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        <span className="text-amber">{icon}</span> {label}
      </div>
      <div className="mt-1 font-medium text-sm">{value}</div>
      {sub && <div className="text-[11px] font-mono text-muted-foreground">{sub}</div>}
    </div>
  );
}
