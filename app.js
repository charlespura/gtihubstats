const $ = (id) => document.getElementById(id);

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function fmtRange(startIso, endIso) {
  const start = fmtDate(startIso);
  const end = fmtDate(endIso);
  if (start === "—" || end === "—") return "—";
  return `${start} - ${end}`;
}

function plural(n, word) {
  if (typeof n !== "number") return "—";
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

async function load() {
  const res = await fetch("./stats.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load stats.json (${res.status})`);
  const data = await res.json();

  $("name").textContent = data?.user?.name ?? "—";
  $("username").textContent = data?.user?.login ?? "—";
  $("repos").textContent = data?.user?.repos ?? "—";
  $("followers").textContent = data?.user?.followers ?? "—";
  $("following").textContent = data?.user?.following ?? "—";

  const login = data?.user?.login;
  const profileUrl = login ? `https://github.com/${login}` : "#";
  $("profileLink").href = profileUrl;

  $("totalContrib").textContent = typeof data?.contributions?.total === "number" ? data.contributions.total : "—";
  $("rangeText").textContent = fmtRange(data?.range?.from, data?.range?.to);

  $("longestStreakDays").textContent = plural(data?.streaks?.longest?.days, "day");
  $("longestStreakRange").textContent = fmtRange(data?.streaks?.longest?.from, data?.streaks?.longest?.to);

  $("currentStreakDays").textContent = plural(data?.streaks?.current?.days, "day");
  $("currentStreakRange").textContent = fmtRange(data?.streaks?.current?.from, data?.streaks?.current?.to);

  const updated = data?.generated_at ?? null;
  $("updatedAt").textContent = updated ? `Last updated: ${fmtDate(updated)}` : "—";

  // Replace these with your actual GitHub Pages URL after you publish it:
  // https://<username>.github.io/<repo>/stats.svg
  const configuredBase = data?.pages?.base_url ?? "https://<username>.github.io/<repo>";
  const looksPlaceholder = String(configuredBase).includes("<username>") || String(configuredBase).includes("<repo>");
  const autoBase = new URL(".", window.location.href).toString().replace(/\/$/, "");
  const repoPagesBase = looksPlaceholder ? autoBase : String(configuredBase).replace(/\/$/, "");
  const snippet = `![GitHub Stats](${repoPagesBase}/stats.svg)\n\n[Live dashboard](${repoPagesBase}/)`;
  $("readmeSnippet").textContent = snippet;
}

load().catch((err) => {
  console.error(err);
  $("subtitle").textContent = "Could not load stats. Make sure stats.json exists in this repo.";
});
