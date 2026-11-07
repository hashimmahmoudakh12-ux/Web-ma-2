"use client";
/**
 * The customer's app. Feels native on iPhone:
 *  - frosted nav bar + bottom tab bar, swipe left/right between tabs
 *  - bottom sheets, spring animations, light & dark mode
 *  - celebrations (confetti + sound + haptics) for anything new since last visit
 */
import { Award, BookOpen, Home, Settings, Users, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CafeLogo } from "@/components/CafeLogo";
import { isMuted, setMuted, sounds, haptics } from "@/components/game/feedback";
import type { Celebration } from "@/lib/streak/engine";
import type { SquadView } from "@/lib/checkin/service";
import { Celebrations } from "./parts/Celebrations";
import { BadgesTab, FriendsTab, HomeTab, PassportTab } from "./parts/Tabs";
import { SettingsSheet } from "./parts/SettingsSheet";
import { useServiceWorker } from "./parts/pwa";
import { CheckInFilm } from "./parts/CheckInFilm";

export type AppData = {
  siteKey: string;
  token: string;
  base: string;
  cafe: { name: string; slug: string; logoUrl: string | null; primary: string; isDemo: boolean };
  me: { firstName: string; referralCode: string };
  level: { name: string; icon: string; perk: string | null };
  next: { name: string; icon: string; xpToNext: number; reward: string | null } | null;
  xp: number;
  fraction: number;
  progressLine: string;
  streakWeeks: number;
  lastVisit: { at: string; xp: number } | null;
  goalMet: boolean;
  deadlineLabel: string;
  deadlineAt: string;
  risk: string | null;
  awayLines: string[];
  saversLeft: number;
  whatsNext: {
    reward: { name: string; visitsAway: number; value: string } | null;
    badge: { key: string; name: string; icon: string; description: string; current: number; target: number } | null;
  };
  totalSaved: string;
  rewards: { id: string; name: string; value: string }[];
  mystery: string[];
  mysteryHistory: { name: string; icon: string }[];
  events: { name: string; icon: string; description: string; multiplier: number; hours: string | null; ends: string }[];
  challenges: { id: string; title: string; icon: string; current: number; target: number; done: boolean; xp: number; reward: string | null; period: string }[];
  badges: { key: string; name: string; icon: string; description: string; xp: number; earnedOn: string | null; progress: { current: number; target: number } | null }[];
  passport: { id: string; name: string; icon: string; reward: string | null; done: boolean; items: { id: string; name: string; icon: string; stampedOn: string | null }[] }[];
  squad: SquadView | null;
  squads: { enabled: boolean; maxMembers: number; xpPerWeek: number };
  referral: { enabled: boolean; xp: number; count: number };
  leaderboard: { entries: { rank: number; firstName: string; visits: number; isMe: boolean }[]; prize: string | null; month: string };
  prefs: { leaderboardOptIn: boolean; smsOptIn: boolean; smsConsent: string; privacyNotice: string };
  celebrations: Celebration[];
  wallet: { apple: string | null; google: string | null };
  push: { enabled: boolean; vapidKey: string | null };
};

const TABS = [
  { id: "home", label: "Home", Icon: Home },
  { id: "badges", label: "Badges", Icon: Award },
  { id: "passport", label: "Passport", Icon: BookOpen },
  { id: "friends", label: "Friends", Icon: Users },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function CustomerApp({ data }: { data: AppData }) {
  const [tab, setTab] = useState<TabId>("home");
  const [muted, setMutedState] = useState(false);
  const [settings, setSettings] = useState(false);
  const [filmDone, setFilmDone] = useState(false);
  useServiceWorker();

  useEffect(() => {
    const t = setTimeout(() => setMutedState(isMuted()), 0);
    return () => clearTimeout(t);
  }, []);

  const go = useCallback((id: TabId) => {
    setTab(id);
    haptics.tap();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Swipe left/right to change tabs (like a native pager).
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY });
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if ((e.target as HTMLElement).closest("[data-no-swipe]")) return;
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[Math.max(0, Math.min(TABS.length - 1, i + (dx < 0 ? 1 : -1)))];
    if (next.id !== tab) go(next.id);
  };

  return (
    <div className="flex flex-1 flex-col" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="glass sticky top-0 z-20 flex items-center justify-between border-b border-brand-text/5 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <CafeLogo name={data.cafe.name} logoUrl={data.cafe.logoUrl} size="sm" />
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="pressable rounded-full p-2.5"
            aria-label={muted ? "Turn sounds on" : "Mute sounds"}
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
              if (muted) sounds.tap();
            }}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <button type="button" className="pressable rounded-full p-2.5" aria-label="Settings" onClick={() => setSettings(true)}>
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main key={tab} className="animate-fade mx-auto w-full max-w-lg flex-1 space-y-4 px-4 pb-28 pt-4">
        {tab === "home" && <HomeTab data={data} />}
        {tab === "badges" && <BadgesTab data={data} />}
        {tab === "passport" && <PassportTab data={data} />}
        {tab === "friends" && <FriendsTab data={data} />}
      </main>

      <nav className="glass fixed inset-x-0 bottom-0 z-20 border-t border-brand-text/5 pb-[env(safe-area-inset-bottom)]" aria-label="Sections">
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => go(id)}
              aria-current={tab === id ? "page" : undefined}
              className={`pressable flex flex-col items-center gap-0.5 py-2 text-[11px] ${tab === id ? "text-brand-primary" : "text-brand-muted"}`}
            >
              <Icon className="h-6 w-6" strokeWidth={tab === id ? 2.4 : 1.8} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <SettingsSheet open={settings} onClose={() => setSettings(false)} data={data} />
      <CheckInFilm data={data} onDone={() => setFilmDone(true)} />
      {filmDone && <Celebrations data={data} />}
    </div>
  );
}
