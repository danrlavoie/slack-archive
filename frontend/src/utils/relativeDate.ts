/**
 * Format a Unix timestamp string (seconds since epoch) as a relative date.
 * Returns strings like "2 hours ago", "yesterday", "3 days ago", "Mar 15".
 */
export function formatRelativeDate(ts: string): string {
  const date = new Date(Number(ts) * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;

  // Older than 30 days — show short date
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
