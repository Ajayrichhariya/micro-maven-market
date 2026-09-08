export const NICHES = [
  "Fitness",
  "Tech",
  "Education",
  "Food",
  "Lifestyle",
  "Fashion",
  "Travel",
  "Gaming",
  "Finance",
  "Beauty",
] as const;

export const CITIES = [
  "Mumbai",
  "Delhi",
  "Bengaluru",
  "Hyderabad",
  "Chennai",
  "Pune",
  "Kolkata",
  "Ahmedabad",
  "Jaipur",
  "Remote / Pan India",
] as const;

export const FOLLOWER_BRACKETS = [
  { label: "1K – 5K", value: 3000, avgViews: 900 },
  { label: "5K – 10K", value: 7500, avgViews: 2200 },
  { label: "10K – 25K", value: 17500, avgViews: 5200 },
  { label: "25K – 50K", value: 37500, avgViews: 11000 },
  { label: "50K – 100K", value: 75000, avgViews: 21000 },
  { label: "100K+", value: 150000, avgViews: 40000 },
] as const;

export const formatINR = (value: number | string | null | undefined): string => {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
};

export const formatCompact = (value: number | null | undefined): string =>
  new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(
    value ?? 0,
  );

export const INSTAGRAM_URL_REGEX =
  /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?(\?.*)?$/;
