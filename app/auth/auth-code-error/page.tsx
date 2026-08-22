import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", flexDirection: "column", gap: 12 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>Sign-in didn&apos;t go through</h1>
      <p style={{ color: "#5B6270" }}>That link may have expired, or the request was cancelled. Try again.</p>
      <Link href="/login" style={{ color: "#6320EE", fontWeight: 700 }}>Back to login →</Link>
    </div>
  );
}
