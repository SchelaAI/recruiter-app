const CANDIDATE_COLOR_MAP: Record<string, string> = {
  PK: "av-purple",
  AS: "av-mint",
  NR: "av-blue",
  VM: "av-coral",
  RI: "av-amber",
  SS: "av-indigo",
  KJ: "av-blue",
  TJ: "av-purple",
  RK: "av-mint",
  MV: "av-amber",
  PD: "av-coral",
};

const PALETTE = ["av-purple", "av-mint", "av-blue", "av-coral", "av-amber", "av-indigo"];

/**
 * Returns the mini-avatar color class for a candidate id. Uses the fixed
 * mapping for the seed candidates; for anything created later (e.g. via Add
 * Candidate), derives a stable color from the id so avatars stay
 * distinguishable instead of defaulting to purple for everyone.
 */
export function getAvatarColorClass(candId: string): string {
  if (CANDIDATE_COLOR_MAP[candId]) return CANDIDATE_COLOR_MAP[candId];
  let hash = 0;
  for (let i = 0; i < candId.length; i++) {
    hash = (hash * 31 + candId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
