import { useI18n, type TKey } from "@/lib/i18n";
import { ArrowUpRight, Crown, Mail, Spade, Flag, Bot, Gamepad2, Candy, Layers } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Site = {
  name: string;
  url: string;
  descKey: TKey;
  icon: LucideIcon;
  color: string;
  tag: string;
};

const SITES: Site[] = [
  { name: "BCchess", url: "https://bcchess.lovable.app", descKey: "siteChess", icon: Crown, color: "#f59e0b", tag: "Chess academy" },
  { name: "BCmail", url: "https://bcmail.lovable.app", descKey: "siteMail", icon: Mail, color: "#38bdf8", tag: "Alias inboxes" },
  { name: "BCjack", url: "https://bcjack.lovable.app", descKey: "siteJack", icon: Spade, color: "#ef4444", tag: "Blackjack" },
  { name: "BCgolf", url: "https://bcgolf.lovable.app", descKey: "siteGolf", icon: Flag, color: "#22c55e", tag: "Mini golf" },
  { name: "JamesAI", url: "https://james-ai.lovable.app", descKey: "siteAI", icon: Bot, color: "#a78bfa", tag: "AI assistant" },
  { name: "TicTacToe Arcade", url: "https://tictactoe-5u4.pages.dev", descKey: "siteArcade", icon: Gamepad2, color: "#f472b6", tag: "Game vault" },
  { name: "BCmonopoly", url: "https://bc-monopoly.lovable.app", descKey: "siteMonopoly", icon: Candy, color: "#fb923c", tag: "Candy Monopoly" },
  { name: "BCuno", url: "https://bcuno.lovable.app", descKey: "siteUno", icon: Layers, color: "#eab308", tag: "Online UNO" },
];

export function NetworkSection() {
  const { t } = useI18n();

  return (
    <section className="mt-14 md:mt-20 relative overflow-hidden rounded-2xl border border-amber/20 bg-gradient-to-b from-amber/[0.07] to-transparent p-6 md:p-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-56 w-[130%] -translate-x-1/2 rounded-full blur-3xl opacity-30"
        style={{ background: "radial-gradient(ellipse at center, var(--amber, #f59e0b), transparent 65%)" }}
      />

      <header className="relative text-center mb-8">
        <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber/80 animate-fade-in">
          BCradio × 8
        </div>
        <h2 className="mt-2 font-display text-3xl md:text-5xl dial-glow text-amber animate-fade-in">
          {t("universeTitle")}
        </h2>
        <p className="mt-3 max-w-2xl mx-auto text-sm md:text-base text-muted-foreground animate-fade-in">
          {t("universeSubtitle")}
        </p>
      </header>

      <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {SITES.map((s, i) => {
          const Icon = s.icon;
          return (
            <a
              key={s.name}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative panel p-5 overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber animate-fade-in"
              style={{
                animationDelay: `${i * 70}ms`,
                background: `linear-gradient(150deg, ${s.color}18, transparent 70%)`,
                borderColor: `${s.color}33`,
              }}
            >
              <span
                aria-hidden
                className="absolute inset-x-0 -bottom-24 h-32 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-60"
                style={{ background: s.color }}
              />
              <div className="relative flex items-start justify-between">
                <span
                  className="inline-flex items-center justify-center w-11 h-11 rounded-xl transition-transform duration-500 group-hover:rotate-[10deg] group-hover:scale-110"
                  style={{ background: `${s.color}22`, color: s.color }}
                >
                  <Icon className="w-5 h-5" />
                </span>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-amber" />
              </div>

              <div className="relative mt-4">
                <div className="font-display text-xl" style={{ color: s.color }}>{s.name}</div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">
                  {s.tag}
                </div>
                <p className="mt-2 text-sm text-muted-foreground leading-snug">{t(s.descKey)}</p>
              </div>

              <div className="relative mt-4 inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground group-hover:text-amber transition-colors">
                {t("visitSite")}
                <span className="block h-px w-6 bg-current transition-all duration-300 group-hover:w-12" />
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
