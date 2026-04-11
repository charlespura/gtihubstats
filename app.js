const $ = (id) => document.getElementById(id);

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

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

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function hashColor(input) {
  // Deterministic accent-ish color for chips.
  const s = String(input ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 85% 60%)`;
}

function setTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") {
    root.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  } else {
    delete root.dataset.theme;
    localStorage.removeItem("theme");
  }
}

function initTheme() {
  const fromQuery = getParam("theme");
  if (fromQuery === "light" || fromQuery === "dark") {
    setTheme(fromQuery);
    return;
  }
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") {
    setTheme(saved);
    return;
  }
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
    setTheme("light");
  }
}

function updateThemeToggleLabel(btn) {
  if (!btn) return;
  const cur = document.documentElement.dataset.theme || "dark";
  btn.textContent = cur === "dark" ? "Light" : "Dark";
}

function renderHeatmap(container, heatmap) {
  if (!container) return;
  container.innerHTML = "";

  const days = heatmap?.days ?? [];
  const max = Number(heatmap?.max) || 0;

  for (const d of days) {
    const cell = document.createElement("div");
    cell.className = "cell";
    const count = Number(d.count) || 0;
    const level = max <= 0 ? 0 : clamp(Math.ceil((count / max) * 4), 0, 4);
    const colors = [
      "color-mix(in srgb, var(--pill) 78%, transparent)",
      "rgba(46, 160, 67, 0.25)",
      "rgba(46, 160, 67, 0.45)",
      "rgba(46, 160, 67, 0.70)",
      "rgba(46, 160, 67, 0.95)"
    ];
    cell.style.background = colors[level] ?? colors[0];
    cell.title = `${d.date}: ${count}`;
    container.appendChild(cell);
  }
}

function renderLanguages(container, langs) {
  if (!container) return;
  container.innerHTML = "";
  for (const l of langs ?? []) {
    const chip = document.createElement("div");
    chip.className = "chip";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = hashColor(l.name);
    const text = document.createElement("span");
    text.textContent = `${l.name} · ${l.repos}`;
    chip.appendChild(dot);
    chip.appendChild(text);
    container.appendChild(chip);
  }
}

function renderRepoList(container, repos, { showStars }) {
  if (!container) return;
  container.innerHTML = "";
  for (const r of repos ?? []) {
    const a = document.createElement("a");
    a.className = "item";
    a.href = r.url;
    a.target = "_blank";
    a.rel = "noreferrer noopener";

    const left = document.createElement("div");
    left.className = "itemTitle";
    const name = document.createElement("div");
    name.className = "itemName";
    name.textContent = r.name;
    const desc = document.createElement("div");
    desc.className = "itemDesc";
    desc.textContent = r.description || "";
    left.appendChild(name);
    if (r.description) left.appendChild(desc);

    const meta = document.createElement("div");
    meta.className = "itemMeta";
    if (showStars) {
      const stars = document.createElement("div");
      stars.textContent = `★ ${r.stars ?? 0}`;
      meta.appendChild(stars);
    }
    const pushed = document.createElement("div");
    pushed.textContent = r.pushed_at ? `Updated ${fmtDate(r.pushed_at)}` : "";
    meta.appendChild(pushed);

    a.appendChild(left);
    a.appendChild(meta);
    container.appendChild(a);
  }
}

async function load() {
  initTheme();
  const toggle = $("themeToggle");
  if (toggle) {
    updateThemeToggleLabel(toggle);
    toggle.addEventListener("click", () => {
      const cur = document.documentElement.dataset.theme || "dark";
      setTheme(cur === "dark" ? "light" : "dark");
      updateThemeToggleLabel(toggle);
    });
  }

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
  const next = data?.milestones?.next ?? null;
  const progress = typeof data?.milestones?.progress === "number" ? data.milestones.progress : 0;
  $("milestoneText").textContent = next
    ? `🔥 Next milestone: ${next} days`
    : "🔥 Next milestone: —";
  const fill = $("streakBarFill");
  if (fill) fill.style.width = `${Math.round(clamp(progress, 0, 1) * 100)}%`;

  const updated = data?.generated_at ?? null;
  $("updatedAt").textContent = updated ? `Last updated: ${fmtDate(updated)}` : "—";

  // Heatmap + highlights
  renderHeatmap($("heatmap"), data?.heatmap);
  const max = data?.heatmap?.max ?? 0;
  $("heatmapLegend").textContent = `Max/day: ${max}`;
  $("heatmapNote").textContent = data?.heatmap?.days?.length
    ? `Showing last ${data.heatmap.days.length} days`
    : "—";

  const bestDay = data?.highlights?.best_day;
  $("bestDay").textContent =
    bestDay?.date && typeof bestDay?.count === "number" ? `${bestDay.count} on ${fmtDate(bestDay.date)}` : "—";
  const bestWeek = data?.highlights?.best_week;
  $("bestWeek").textContent =
    bestWeek?.from && bestWeek?.to ? `${bestWeek.total ?? 0} (${fmtRange(bestWeek.from, bestWeek.to)})` : "—";

  $("langCount").textContent = Array.isArray(data?.languages) ? `${data.languages.length} shown` : "—";
  renderLanguages($("languages"), data?.languages ?? []);

  // Repos lists
  renderRepoList($("topRepos"), data?.repos?.top ?? [], { showStars: true });
  renderRepoList($("recentRepos"), data?.repos?.recent ?? [], { showStars: false });

  const recentFirst = data?.repos?.recent?.[0];
  $("recentRepo").textContent = recentFirst?.name ? recentFirst.name : "—";

  // Replace these with your actual GitHub Pages URL after you publish it:
  // https://<username>.github.io/<repo>/stats.svg
  const overrideBase = getParam("base");
  const configuredBase = overrideBase || data?.pages?.base_url || "https://<username>.github.io/<repo>";
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
