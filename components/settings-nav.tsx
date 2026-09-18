import Link from "next/link";

const items = [
  ["profile", "Profile"], ["ai", "AI Preferences"], ["scheduling", "Scheduling"], ["notifications", "Notifications"], ["channels", "Channels"],
] as const;

export function SettingsNav({ active }: { active: string }) {
  return <nav className="settings-side-nav">{items.map(([key,label]) => <Link key={key} className={active === key ? "active" : ""} href={`/settings?tab=${key}`}>{label}</Link>)}<Link className={active === "company" ? "active" : ""} href="/settings/company">Company</Link><Link className={active === "billing" ? "active" : ""} href="/settings?tab=billing">Billing</Link></nav>;
}
