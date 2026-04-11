import { writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";

async function loadDotEnv(path = ".env") {
  try {
    const raw = await readFile(path, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (!key) continue;
      if (process.env[key] !== undefined) continue;

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  } catch {
    // No .env is fine (e.g. GitHub Actions).
  }
}

await loadDotEnv();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const GITHUB_USER = process.env.GITHUB_USER;
const PAGES_BASE_URL = process.env.PAGES_BASE_URL || "https://<username>.github.io/<repo>";

if (!GITHUB_TOKEN) {
  console.error("Missing GITHUB_TOKEN (or GH_TOKEN). Set it as a GitHub Actions secret.");
  process.exit(1);
}
if (!GITHUB_USER) {
  console.error("Missing GITHUB_USER (e.g. charlespura).");
  process.exit(1);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

function diffDays(aIso, bIso) {
  const a = new Date(`${aIso}T00:00:00.000Z`);
  const b = new Date(`${bIso}T00:00:00.000Z`);
  return Math.round((b - a) / 86400000);
}

function computeStreaks(days) {
  // days: [{ date: "YYYY-MM-DD", count: number }]
  if (!Array.isArray(days) || days.length === 0) {
    return {
      current: { days: 0, from: null, to: null },
      longest: { days: 0, from: null, to: null }
    };
  }

  const normalized = days
    .map((d) => ({ date: d.date, count: Number(d.count) || 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Current streak ends on latest contribution day (count > 0).
  let currentEndIdx = -1;
  for (let i = normalized.length - 1; i >= 0; i--) {
    if (normalized[i].count > 0) {
      currentEndIdx = i;
      break;
    }
  }

  let current = { days: 0, from: null, to: null };
  if (currentEndIdx !== -1) {
    let startIdx = currentEndIdx;
    while (startIdx > 0) {
      const prev = normalized[startIdx - 1];
      const cur = normalized[startIdx];
      if (prev.count <= 0) break;
      if (diffDays(prev.date, cur.date) !== 1) break;
      startIdx--;
    }
    const length = currentEndIdx - startIdx + 1;
    current = {
      days: length,
      from: normalized[startIdx].date,
      to: normalized[currentEndIdx].date
    };
  }

  // Longest streak anywhere in range.
  let best = { days: 0, from: null, to: null };
  let runStart = null;
  let runLen = 0;

  for (let i = 0; i < normalized.length; i++) {
    const cur = normalized[i];
    const prev = i > 0 ? normalized[i - 1] : null;
    const isConsecutive = prev ? diffDays(prev.date, cur.date) === 1 : true;

    if (cur.count > 0 && (runLen === 0 || isConsecutive)) {
      if (runLen === 0) runStart = cur.date;
      runLen++;
    } else if (cur.count > 0 && !isConsecutive) {
      // Gap in dates (shouldn't happen often, but handle defensively)
      runStart = cur.date;
      runLen = 1;
    } else {
      runStart = null;
      runLen = 0;
    }

    if (runLen > best.days) {
      best = { days: runLen, from: runStart, to: cur.date };
    }
  }

  return { current, longest: best };
}

function computeBestDays(days) {
  const normalized = Array.isArray(days)
    ? days
        .map((d) => ({ date: d.date, count: Number(d.count) || 0 }))
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  let bestDay = { date: null, count: 0 };
  for (const d of normalized) {
    if (d.count > bestDay.count) bestDay = { date: d.date, count: d.count };
  }

  // Best 7-day window (by total contributions). Uses consecutive days list.
  let bestWeek = { from: null, to: null, total: 0 };
  if (normalized.length >= 7) {
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += normalized[i].count;
    bestWeek = { from: normalized[0].date, to: normalized[6].date, total: sum };

    for (let i = 7; i < normalized.length; i++) {
      sum += normalized[i].count - normalized[i - 7].count;
      if (sum > bestWeek.total) {
        bestWeek = { from: normalized[i - 6].date, to: normalized[i].date, total: sum };
      }
    }
  }

  return { best_day: bestDay, best_week: bestWeek };
}

function computeMilestones(currentStreakDays) {
  const milestones = [7, 14, 30, 60, 90, 100, 180, 365, 500, 730, 1000];
  const current = Number(currentStreakDays) || 0;
  const next = milestones.find((m) => m > current) ?? null;
  const prev = [...milestones].reverse().find((m) => m <= current) ?? 0;
  const span = next ? next - prev : 0;
  const into = current - prev;
  const progress = span > 0 ? Math.max(0, Math.min(1, into / span)) : 1;
  return { current, next, previous: prev, progress, milestones };
}

function computeHeatmap(days, weeks = 16) {
  const normalized = Array.isArray(days)
    ? days
        .map((d) => ({ date: d.date, count: Number(d.count) || 0 }))
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const count = weeks * 7;
  const slice = normalized.slice(-count);
  const max = slice.reduce((m, d) => Math.max(m, d.count), 0);
  return { weeks, max, days: slice };
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSvg(stats) {
  const name = stats.user.name || stats.user.login;
  const login = stats.user.login;
  const total = stats.contributions.total;
  const repos = stats.user.repos;
  const followers = stats.user.followers;
  const following = stats.user.following;
  const current = stats.streaks.current.days;
  const longest = stats.streaks.longest.days;
  const range = `${stats.range.from} - ${stats.range.to}`;
  const updated = new Date(stats.generated_at).toISOString().slice(0, 10);
  const nextMilestone = stats?.milestones?.next ?? null;
  const milestoneText = nextMilestone ? `Next: ${nextMilestone} days` : "Milestone: —";

  // Keep it GitHub-dark friendly, and readable in README.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="210" viewBox="0 0 720 210" role="img" aria-label="GitHub stats for ${esc(
    login
  )}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#0a1224"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#2f81f7"/>
      <stop offset="55%" stop-color="#ff7b72"/>
      <stop offset="100%" stop-color="#ffa657"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="719" height="209" rx="16" fill="url(#bg)" stroke="#30363d"/>
  <rect x="24" y="20" width="3" height="46" rx="2" fill="url(#accent)"/>
  <text x="36" y="44" fill="#e6edf3" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="20" font-weight="750">${esc(
    name
  )}</text>
  <text x="36" y="68" fill="#8b949e" font-family="ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace" font-size="12">@${esc(
    login
  )}</text>

  <text x="24" y="102" fill="#8b949e" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="12">Total Contributions</text>
  <text x="24" y="132" fill="#e6edf3" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="30" font-weight="850">${esc(
    total
  )}</text>
  <text x="24" y="156" fill="#8b949e" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="12">${esc(
    range
  )}</text>

  <g transform="translate(330, 92)">
    <text x="0" y="0" fill="#8b949e" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="12">Public Repos</text>
    <text x="0" y="26" fill="#e6edf3" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="18" font-weight="750">${esc(
      repos
    )}</text>

    <text x="130" y="0" fill="#8b949e" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="12">Followers</text>
    <text x="130" y="26" fill="#e6edf3" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="18" font-weight="750">${esc(
      followers
    )}</text>

    <text x="260" y="0" fill="#8b949e" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="12">Following</text>
    <text x="260" y="26" fill="#e6edf3" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="18" font-weight="750">${esc(
      following
    )}</text>
  </g>

  <g transform="translate(330, 150)">
    <text x="0" y="0" fill="#8b949e" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="12">Current Streak</text>
    <text x="0" y="26" fill="#e6edf3" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="18" font-weight="750">${esc(
      current
    )} days</text>
    <text x="0" y="48" fill="#8b949e" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="11">${esc(
      milestoneText
    )}</text>

    <text x="180" y="0" fill="#8b949e" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="12">Longest Streak</text>
    <text x="180" y="26" fill="#e6edf3" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="18" font-weight="750">${esc(
      longest
    )} days</text>
  </g>

  <text x="24" y="192" fill="#8b949e" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="11">Updated ${esc(
    updated
  )} • Generated by GitHub Actions</text>
</svg>`;
}

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `bearer ${GITHUB_TOKEN}`,
      "user-agent": "github-stats-pages"
    },
    body: JSON.stringify({ query, variables })
  });

  const json = await res.json();
  if (!res.ok || json.errors) {
    const msg = JSON.stringify({ status: res.status, errors: json.errors, json }, null, 2);
    throw new Error(msg);
  }
  return json.data;
}

const query = `
query($login: String!) {
  user(login: $login) {
    login
    name
    repositories(privacy: PUBLIC) { totalCount }
    allRepos: repositories(
      first: 100
      privacy: PUBLIC
      ownerAffiliations: OWNER
      orderBy: { field: PUSHED_AT, direction: DESC }
    ) {
      nodes {
        name
        nameWithOwner
        url
        description
        isFork
        pushedAt
        stargazerCount
        primaryLanguage { name }
      }
    }
    followers { totalCount }
    following { totalCount }
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}
`;

const data = await gql(query, { login: GITHUB_USER });
const user = data.user;
const weeks = user.contributionsCollection.contributionCalendar.weeks;
const flatDays = weeks.flatMap((w) => w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount })));

const from = flatDays[0]?.date ?? null;
const to = flatDays[flatDays.length - 1]?.date ?? null;

const streaks = computeStreaks(flatDays);
const best = computeBestDays(flatDays);
const milestones = computeMilestones(streaks.current.days);
const heatmap = computeHeatmap(flatDays, 16);

const repoNodes = user.allRepos?.nodes ?? [];
const ownedNonForks = repoNodes.filter((r) => r && !r.isFork);

const languageCounts = new Map();
for (const r of ownedNonForks) {
  const lang = r.primaryLanguage?.name ?? null;
  if (!lang) continue;
  languageCounts.set(lang, (languageCounts.get(lang) ?? 0) + 1);
}

const topLanguages = [...languageCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
  .map(([name, repos]) => ({ name, repos }));

const topRepos = [...ownedNonForks]
  .sort((a, b) => (b.stargazerCount ?? 0) - (a.stargazerCount ?? 0))
  .slice(0, 8)
  .map((r) => ({
    name: r.name,
    url: r.url,
    stars: r.stargazerCount ?? 0,
    pushed_at: r.pushedAt,
    description: r.description ?? ""
  }));

const recentRepos = [...ownedNonForks]
  .sort((a, b) => String(b.pushedAt ?? "").localeCompare(String(a.pushedAt ?? "")))
  .slice(0, 6)
  .map((r) => ({
    name: r.name,
    url: r.url,
    pushed_at: r.pushedAt
  }));

const stats = {
  generated_at: new Date().toISOString(),
  pages: { base_url: PAGES_BASE_URL },
  user: {
    login: user.login,
    name: user.name,
    repos: user.repositories.totalCount,
    followers: user.followers.totalCount,
    following: user.following.totalCount
  },
  range: { from, to },
  contributions: {
    total: user.contributionsCollection.contributionCalendar.totalContributions
  },
  streaks,
  milestones,
  highlights: best,
  heatmap,
  languages: topLanguages,
  repos: {
    top: topRepos,
    recent: recentRepos
  }
};

await writeFile("stats.json", JSON.stringify(stats, null, 2) + "\n", "utf8");
await writeFile("stats.svg", renderSvg(stats), "utf8");

console.log(
  JSON.stringify(
    {
      ok: true,
      user: stats.user.login,
      total: stats.contributions.total,
      current_streak_days: stats.streaks.current.days,
      longest_streak_days: stats.streaks.longest.days,
      range: `${stats.range.from}..${stats.range.to}`
    },
    null,
    2
  )
);
