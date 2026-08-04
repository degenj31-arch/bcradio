import { useEffect, useRef, useState } from "react";
import { Globe, Check } from "lucide-react";
import { LANGUAGES, useI18n } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const active = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  return (
    <div ref={ref} className="fixed top-3 left-3 z-50">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t("language")}
        aria-expanded={open}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-amber/40 bg-background/85 backdrop-blur text-amber text-xs font-mono uppercase tracking-widest shadow-lg hover:border-amber transition"
      >
        <Globe className="w-4 h-4" />
        <span>{active.flag}</span>
        <span className="hidden sm:inline">{active.label}</span>
      </button>

      {open && (
        <div className="mt-2 w-52 rounded-xl border border-border bg-background/95 backdrop-blur shadow-2xl overflow-hidden animate-scale-in origin-top-left">
          <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
            {t("language")}
          </div>
          <ul className="max-h-80 overflow-auto py-1">
            {LANGUAGES.map((l) => (
              <li key={l.code}>
                <button
                  onClick={() => { setLang(l.code); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-amber/10 transition ${
                    l.code === lang ? "text-amber" : "text-foreground"
                  }`}
                >
                  <span className="text-base">{l.flag}</span>
                  <span className="flex-1">{l.label}</span>
                  {l.code === lang && <Check className="w-4 h-4" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
