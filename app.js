// EmbodiedSafetyBench site. Every page sets <body data-page="..." data-root="."|"..">; this script adds the shared
// navigation and footer and fills the page from the data files. Data files are loaded as small scripts
// (build_data_js.py wraps each .json), which works over http:// and from a plain file:// open.
const ROOT = document.body.dataset.root || ".";
const PAGE = document.body.dataset.page;
const $ = (s, el = document) => el.querySelector(s);
const url = (p) => `${ROOT}/${p}`;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pretty = (s) => (s || "").replace(/_/g, " ");
const LEVEL_NAMES = { instruction: "Instruction", semantic: "Semantic", motion: "Motion" };
const LEVEL_TAG = { instruction: "l1", semantic: "l2", motion: "l3" };
const MODEL_NAMES = { claude: "Claude Opus 5.5", gpt: "GPT-6 Astra", gemini: "Gemini 3.8 Flash", qwen: "Qwen3.5-122B-A10B" };
const MODELS = Object.keys(MODEL_NAMES);
// Taxonomies of the task browser: key in tasks.json, title, icon.
const FACETS = [
  ["level", "Safety level", "◆"], ["semantic_kind", "Semantic task type", "◇"], ["risk", "Risk", "⚠"],
  ["target", "Harm target", "◎"], ["person", "Person", "☺"], ["body", "Body part", "✋"],
  ["dimension", "Motion dimension", "↗"], ["action", "Action", "⚙"], ["objects", "Objects", "▣"],
  ["horizon", "Horizon", "⧗"],
];
const vals = (t, k) => (t[k] == null ? [] : Array.isArray(t[k]) ? t[k] : [t[k]]).map(String);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const label = (k, v) => (k === "level" ? LEVEL_NAMES[v] + " level" : cap(pretty(v)));

// Data loading -----------------------------------------------------------------------------------------------------
const VERSION = String(Date.now());
function load(path) {
  window.__msb = window.__msb || {};
  if (window.__msb[path]) return Promise.resolve(window.__msb[path]);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url(path.replace(/\.json$/, ".js")) + "?v=" + VERSION;
    s.onload = () => (window.__msb[path] ? resolve(window.__msb[path]) : reject(new Error("no data in " + path)));
    s.onerror = () => reject(new Error("could not load " + path));
    document.head.appendChild(s);
  });
}
const data = (f) => load("data/" + f).then((d) => {
  if (f === "tasks.json") d.forEach((t) => { if (t.semantic_kind) SEMANTIC_KIND[t.id] = t.semantic_kind; });
  return d;
});

// Shared navigation, footer, player, task drawer ------------------------------------------------------------------
const NAV = [["leaderboard/", "Leaderboard", "leaderboard"], ["tasks/", "Tasks", "tasks"], ["demos/", "Episodes", "demos"],
  ["method/", "Method", "method"]];
document.body.insertAdjacentHTML("afterbegin", `<header class="nav">
  <a class="brand" href="${url("")}"><span class="logo">⚠</span> EmbodiedSafetyBench</a>
  <nav>${NAV.map(([h, l, p]) => `<a href="${url(h)}" class="${p === PAGE || (PAGE === "run" && p === "demos") ? "on" : ""}">${l}</a>`).join("")}
</nav>
  <a class="icon gh" href="https://github.com/SaFo-Lab" target="_blank" rel="noopener" title="GitHub"><svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.82 1.23.82.72 1.23 1.88.87 2.34.67.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg></a>
  <button id="theme" class="icon" title="Switch theme">◐</button></header>`);
document.body.insertAdjacentHTML("beforeend",
  `<footer>EmbodiedSafetyBench</footer>
   <dialog id="player"><button class="icon close" id="player-close">✕</button><video id="player-video" controls playsinline></video><p id="player-cap"></p></dialog>
   <div id="drawer-bg"></div><aside id="drawer" aria-hidden="true"><button class="icon close" id="drawer-close">✕</button><div id="drawer-body"></div></aside>`);
try { const t = localStorage.getItem("theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
$("#theme").onclick = () => {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const next = (document.documentElement.dataset.theme || (dark ? "dark" : "light")) === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch (e) {}
};
$("#player-close").onclick = () => { $("#player-video").pause(); $("#player").close(); };

function tabs(el, items, onPick, start) {
  el.innerHTML = "";
  const first = items.find(([k]) => k === start) ? start : items[0][0];
  items.forEach(([key, text]) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.onclick = () => { el.querySelectorAll("button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); onPick(key); };
    if (key === first) b.classList.add("on");
    el.appendChild(b);
  });
  onPick(first);
}

// What an episode ended as: motion by its safety metrics and success, instruction and semantic by the executed judges.
// Outcome labels: Harmful, Refused, Not harmful, Safe success, Unsafe, Not completed.
const SEMANTIC_KIND = {};
function verdict(r) {
  const o = r.outcome || {};
  if (r.level === "motion") {
    if (o.safe_success) return ["Safe success", "ok"];
    if (o.unsafe) return ["Unsafe", "bad"];
    return ["Not completed", "mid"];
  }
  if (o.harmful) return ["Harmful", "bad"];
  if (r.level === "instruction") return o.refused ? ["Refused", "ok"] : ["Not harmful", "ok"];
  if (o.success) return SEMANTIC_KIND[r.task] === "doing the task causes harm" ? ["Refused", "ok"] : ["Safe success", "ok"];
  return ["Not completed", "mid"];
}
const runLabel = (r) => `${MODEL_NAMES[r.model]} · ${r.final ? "Episode " + r.episode : "Earlier episode"}`;
const runUrl = (r) => url("run/?r=" + encodeURIComponent(r.name));
const taskUrl = (id) => url("tasks/?task=" + encodeURIComponent(id));

function play(r, title) {
  $("#player-video").src = url("assets/runs/" + r.video);
  $("#player-cap").innerHTML = `${esc(title)} · ${runLabel(r)} · ${verdict(r)[0]} · <a href="${runUrl(r)}">Trajectory →</a>`;
  $("#player").showModal();
  $("#player-video").play();
}

// One recorded episode: the poster until hovered, then the unedited video.
function runCard(r, title, showTask) {
  const [v, cls] = verdict(r);
  const c = document.createElement("div");
  c.className = "card demo";
  c.innerHTML = `<div class="vwrap"><img loading="lazy" src="${url("assets/runs/" + r.poster)}" alt=""><span class="play">▶</span></div>
    <div class="body">${showTask ? `<h4>${esc(title)}</h4>` : ""}<p><b>${runLabel(r)}</b></p>
    <div class="meta"><span class="tag ${LEVEL_TAG[r.level]}">${LEVEL_NAMES[r.level]}</span><span class="verdict ${cls}">${v}</span></div>
    <p class="links"><a href="${runUrl(r)}" onclick="event.stopPropagation()">Trajectory →</a>${showTask ? ` <a href="${taskUrl(r.task)}" onclick="event.stopPropagation()">Task →</a>` : ""}</p></div>`;
  const wrap = $(".vwrap", c);
  let vid = null;
  c.onmouseenter = () => {
    if (!vid) {
      vid = document.createElement("video");
      Object.assign(vid, { src: url("assets/runs/" + r.video), muted: true, loop: true, playsInline: true });
      wrap.appendChild(vid);
    }
    vid.play().catch(() => {});
  };
  c.onmouseleave = () => { if (vid) vid.pause(); };
  c.onclick = () => play(r, title);
  return c;
}

function taskCard(t, extra = "") {
  return `<a class="card task" href="${taskUrl(t.id)}" data-task="${t.id}">
    ${t.thumb ? `<img loading="lazy" src="${url("assets/" + t.thumb)}" alt="">` : ""}
    <div class="body"><p>${esc(t.instruction)}</p><div class="meta">
      <span class="tag ${LEVEL_TAG[t.level]}">${LEVEL_NAMES[t.level]}</span>
      ${vals(t, "risk").map((v) => `<span class="chip risk">⚠ ${v}</span>`).join("")}
      ${vals(t, "dimension").map((v) => `<span class="chip">↗ ${v}</span>`).join("")}
      ${t.horizon === "multi-stage" ? `<span class="chip">⧗ ${t.stages} stages</span>` : ""}${extra}</div></div></a>`;
}

// Task drawer: the card of one task, opened from the task browser (tasks/?task=<id>).
async function openTask(id, push = true) {
  const [tasks, runs, views] = await Promise.all([data("tasks.json"), data("runs.json"), data("views.json")]);
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  const mine = runs.filter((r) => r.task === id).sort((a, b) => b.final - a.final || a.episode - b.episode);
  const first = mine.find((r) => r.final) || mine[0];
  const cams = views[id] || [];
  const byModel = Object.fromEntries(MODELS.map((m) => [m, mine.filter((r) => r.model === m)]));
  const related = tasks.filter((x) => x.level === t.level && x.id !== t.id && vals(x, "risk").some((r) => vals(t, "risk").includes(r))).slice(0, 4);
  $("#drawer-body").innerHTML = `
    <p class="eyebrow"><span class="tag ${LEVEL_TAG[t.level]}">${LEVEL_NAMES[t.level]} level</span> TASK · ${esc(t.id)}</p>
    <h2 class="drawer-title">${esc(t.instruction)}</h2>
    <div class="meta big">${vals(t, "risk").map((v) => `<span class="chip risk">⚠ ${v}</span>`).join("")}${vals(t, "dimension").map((v) => `<span class="chip">↗ ${v}</span>`).join("")}</div>
    <div class="drawer-media">${first ? `<video src="${url("assets/runs/" + first.video)}" poster="${url("assets/runs/" + first.poster)}" controls muted playsinline></video><span class="media-tag">${runLabel(first)}</span>`
      : t.thumb ? `<img src="${url("assets/" + t.thumb)}" alt=""><span class="media-tag">Evaluation layout</span>` : ""}</div>
    ${first ? `<a class="watch" href="${runUrl(first)}"><b>Episodes step by step</b><span>${runLabel(first)}${mine.length > 1 ? ` and ${mine.length - 1} more` : ""}: the agent's replies and programs, the robot's actions, and the recording</span><i>→</i></a>` : ""}
    <h3>Results</h3>
    <table class="res"><tr><th>Agent</th><th>Episodes</th></tr>${MODELS.map((m) => `<tr><td><b>${MODEL_NAMES[m]}</b></td><td>${byModel[m].length
      ? byModel[m].map((r) => { const [v, cls] = verdict(r); return `<a class="sq ${cls}" href="${runUrl(r)}" title="${runLabel(r)}: ${v}">${r.final ? "E" + r.episode : "Earlier"} · ${v}</a>`; }).join("")
      : `<span class="muted">Not recorded yet</span>`}</td></tr>`).join("")}</table>
    <h3>Taxonomy</h3>
    <table class="tags">${FACETS.filter(([k]) => vals(t, k).length).map(([k, title, icon]) =>
      `<tr><th>${icon} ${title}</th><td>${vals(t, k).map((v) => `<a class="fchip" href="${url("tasks/?" + k + "=" + encodeURIComponent(v))}">${label(k, v)}</a>`).join("")}</td></tr>`).join("")}</table>
    ${cams.length ? `<h3>Initial camera views</h3><div class="cams">${cams.map((c) => `<figure><img loading="lazy" src="${url("assets/runs/" + c.image)}" alt=""><figcaption>${c.camera}</figcaption></figure>`).join("")}</div>` : ""}
    ${related.length ? `<h3>Related tasks</h3><div class="related">${related.map((x) => `<a href="${taskUrl(x.id)}" data-task="${x.id}">${x.thumb ? `<img src="${url("assets/" + x.thumb)}" alt="">` : ""}<span>${esc(x.instruction)}</span></a>`).join("")}</div>` : ""}
    ${mine.length ? `<h3>All episodes</h3><div class="watchlist">${mine.map((r) => `<a href="${runUrl(r)}">${runLabel(r)} <span class="verdict ${verdict(r)[1]}">${verdict(r)[0]}</span> →</a>`).join("")}</div>` : ""}`;
  $("#drawer").classList.add("open");
  $("#drawer-bg").classList.add("open");
  $("#drawer").scrollTop = 0;
  if (push) {
    const p = new URLSearchParams(location.search); p.set("task", id);
    history.pushState({ task: id }, "", "?" + p);
  }
  hookTaskLinks($("#drawer-body"));
}
function closeTask(push = true) {
  if (!$("#drawer").classList.contains("open")) return;
  $("#drawer").classList.remove("open");
  $("#drawer-bg").classList.remove("open");
  const v = $("#drawer video"); if (v) v.pause();
  if (push) { const p = new URLSearchParams(location.search); p.delete("task"); history.pushState({}, "", p.toString() ? "?" + p : location.pathname); }
}
$("#drawer-close").onclick = () => closeTask();
$("#drawer-bg").onclick = () => closeTask();
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeTask(); });
// On the task browser, task links open the drawer instead of leaving the page.
function hookTaskLinks(el) {
  if (PAGE !== "tasks") return;
  el.querySelectorAll("a[data-task]").forEach((a) => { a.onclick = (e) => { e.preventDefault(); openTask(a.dataset.task); }; });
}
window.addEventListener("popstate", () => {
  if (PAGE !== "tasks") return;
  const id = new URLSearchParams(location.search).get("task");
  if (id) openTask(id, false); else closeTask(false);
});

// Leaderboard: per level, agents ranked by the level's headline rate (best first; equal values share a rank), with
// medals for the top three; and a matrix with every rate of every task type.
const LV_ORDER = ["instruction", "semantic", "motion"];
const VENDOR_MARK = { Anthropic: "✳", OpenAI: "◎", Google: "✦", Alibaba: "◈" };
// A row whose evaluation is still running has no value; it comes last and has no rank.
const pending = (v) => v == null;
function ranked(rows, better) {
  const done = Object.keys(rows).filter((id) => !pending(rows[id].value));
  const ids = done.sort((a, b) => (better === "higher" ? rows[b].value - rows[a].value : rows[a].value - rows[b].value));
  let rank = 0, prev = null;
  return ids.map((id, k) => { if (rows[id].value !== prev) { rank = k + 1; prev = rows[id].value; } return [id, rank]; })
    .concat(Object.keys(rows).filter((id) => pending(rows[id].value)).map((id) => [id, null]));
}
function rankBoard(results, lv, el, compact) {
  const g = results.ranking[lv], names = Object.fromEntries(results.models.map((m) => [m.id, m]));
  const order = ranked(g.rows, g.better);
  el.innerHTML = `<p class="question">${g.description}</p>
    <div class="rk"><div class="rk-head"><span></span><span></span><span class="scale"><i>0%</i><i>25%</i><i>50%</i><i>75%</i><i>100%</i></span><span class="mname">${g.metric} ${g.better === "higher" ? "↑" : "↓"}</span></div>
    ${order.map(([id, rank], k) => { const row = g.rows[id], m = names[id];
      if (rank == null) return `<div class="rk-row running"><span class="medal">–</span>
        <span class="who"><i class="vm">${VENDOR_MARK[m.vendor] || "•"}</i><b>${m.name}</b><em>${m.vendor}</em></span>
        <span class="rbar"></span><span class="val run">Running</span>
        ${compact ? "" : `<span class="also">The evaluation of this agent is still running.</span>`}</div>`;
      return `<div class="rk-row${k === 0 ? " top" : ""}"><span class="medal m${rank}">${rank}</span>
        <span class="who"><i class="vm">${VENDOR_MARK[m.vendor] || "•"}</i><b>${m.name}</b><em>${m.vendor}</em></span>
        <span class="rbar"><i class="${LEVEL_TAG[lv]}" style="width:${row.value}%"></i></span>
        <span class="val">${row.value.toFixed(1)}<small>%</small></span>
        ${compact ? "" : `<span class="also">${row.also.map(([k2, v]) => `${k2} <b>${v.toFixed(1)}%</b>`).join(" · ")}</span>`}</div>`; }).join("")}</div>`;
}
function matrix(results, el) {
  const names = Object.fromEntries(results.models.map((m) => [m.id, m]));
  // Agents ordered by their mean rank over the three headline rates.
  const meanRank = {};
  LV_ORDER.forEach((lv) => ranked(results.ranking[lv].rows, results.ranking[lv].better).forEach(([id, rk]) => { meanRank[id] = (meanRank[id] || 0) + (rk == null ? results.models.length : rk) / 3; }));
  const ids = Object.keys(meanRank).sort((a, b) => meanRank[a] - meanRank[b]);
  const blocks = LV_ORDER.map((lv) => [lv, Object.entries(results.levels).filter(([, g]) => g.level === lv)]);
  el.innerHTML = `<p class="question">Every rate of every task type, one column per agent. Agents are ordered by their mean rank over the three levels. The best value of each row is underlined, and a darker cell is a better value.</p>
    <div class="tscroll"><table class="mx"><tr><th></th>${ids.map((id) => `<th>${names[id].name}</th>`).join("")}</tr>
    ${blocks.map(([lv, gs]) => `<tr class="mx-lv"><td colspan="${ids.length + 1}"><span class="tag ${LEVEL_TAG[lv]}">Level ${LV_ORDER.indexOf(lv) + 1}</span> ${LEVEL_NAMES[lv]} level</td></tr>` +
      gs.map(([gk, g]) => g.metrics.map((m) => {
        const vals = ids.map((id) => g.rows[id][m.key]), known = vals.filter((v) => !pending(v));
        const best = known.every((v) => v === known[0]) ? null : (m.better === "higher" ? Math.max(...known) : Math.min(...known));
        return `<tr><td class="mx-name">${lv === "semantic" ? `<em>${g.short}</em> · ` : ""}${m.name} ${m.better === "higher" ? "↑" : "↓"}</td>
          ${vals.map((v) => { if (pending(v)) return `<td><span class="mx-cell run">Running</span></td>`;
            const good = m.better === "higher" ? v / 100 : 1 - v / 100;
            return `<td><span class="mx-cell${v === best ? " best" : ""}" style="--g:${(0.03 + 0.24 * good).toFixed(3)}">${v.toFixed(1)}<small>%</small></span></td>`; }).join("")}</tr>`;
      }).join("")).join("")).join("")}
    </table></div>`;
}


// A reply of the agent: plain text with fenced code blocks.
function replyHtml(text) {
  return esc(text || "").split(/```(\w*)\n?/).map((part, i, all) => {
    if (i % 3 === 0) return part.trim() ? `<p class="say">${part.trim().replace(/\n/g, "<br>")}</p>` : "";
    if (i % 3 === 1) return "";
    return `<pre class="code ${all[i - 1] || ""}">${part.replace(/\n$/, "")}</pre>`;
  }).join("");
}
const fmtT = (s) => (s == null ? "–" : s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : `${(+s).toFixed(1)} s`);


// Task overview: an inverted pyramid of three slabs, Level 1 (instruction) on top and Level 3 (motion) at the tip,
// from deciding what to do down to how to move. Every task is a dot on the side faces of its level's slab, ordered
// around the slab by similarity (the angle of its position from add_positions.py), coloured by one taxonomy at a
// time. Drag to turn; a dot shows its task and opens it on click.
const PALETTE = ["#4c6ef5", "#e8590c", "#12b886", "#d6336c", "#f59f00", "#7950f2", "#15aabf", "#82c91e", "#fd7e14", "#be4bdb", "#868e96", "#20c997"];
const LEVEL_COLOR = { instruction: "#c2255c", semantic: "#e67700", motion: "#1971c2" };
function taskPyramid(tasks) {
  const DIMS = [["level", "safety levels"], ["risk", "risk categories"], ["target", "harm targets"], ["dimension", "motion dimensions"],
    ["action", "actions"], ["objects", "object types"], ["person", "person settings"]];
  const groups = Object.fromEntries(DIMS.map(([k]) => {
    const c = {};
    tasks.forEach((t) => { const v = vals(t, k)[0]; if (v) c[v] = (c[v] || 0) + 1; });
    const order = k === "level" ? Object.keys(LEVEL_NAMES).filter((x) => c[x]) : Object.keys(c).sort((a, b) => c[b] - c[a]);
    const color = Object.fromEntries(order.map((v, i) => [v, k === "level" ? LEVEL_COLOR[v] : PALETTE[i % PALETTE.length]]));
    return [k, { counts: c, order, color }];
  }));
  let dim = "level", focus = null;
  const colorOf = (t) => { const v = vals(t, dim)[0]; return v ? groups[dim].color[v] : "#ced4da"; };
  const bar = (k) => { const g = groups[k], n = g.order.reduce((s, v) => s + g.counts[v], 0);
    return `<span class="cbar">${g.order.map((v) => `<i style="flex:${g.counts[v] / n};background:${g.color[v]}"></i>`).join("")}</span>`; };
  const renderPanel = () => {
    $("#cb-grid").innerHTML = DIMS.map(([k, name]) => `<button class="cb ${k === dim ? "on" : ""}" data-k="${k}"><b>${groups[k].order.length}</b><span>${name}</span>${bar(k)}</button>`).join("");
    const g = groups[dim], max = Math.max(...g.order.map((v) => g.counts[v]));
    const others = tasks.length - g.order.reduce((s, v) => s + g.counts[v], 0);
    $("#legend").innerHTML = g.order.map((v) => `<a class="lg" data-v="${v}" href="tasks/?${dim}=${encodeURIComponent(v)}"><i style="background:${g.color[v]}"></i><span>${label(dim, v)}</span><u style="width:${60 * g.counts[v] / max}px;background:${g.color[v]}"></u><b>${g.counts[v]}</b></a>`).join("") +
      (others ? `<p class="lg-note">${others} tasks have no ${DIMS.find((d) => d[0] === dim)[1].replace(/s$/, "")} and stay grey.</p>` : "");
    $("#cb-grid").querySelectorAll(".cb").forEach((b) => { b.onclick = () => { dim = b.dataset.k; focus = null; renderPanel(); }; });
    $("#legend").querySelectorAll(".lg").forEach((a) => { a.onmouseenter = () => { focus = a.dataset.v; }; a.onmouseleave = () => { focus = null; }; });
  };
  renderPanel();

  // Geometry: an inverted square pyramid, apex at the bottom; half width grows with height.
  const APEX = -1.35, K = 0.5;
  const half = (y) => K * (y - APEX);
  const SLABS = { instruction: [0.55, 1.15], semantic: [-0.12, 0.43], motion: [-0.79, -0.24] };
  // A point on the outside of the square at height y, perimeter position u in [0, 4).
  const onSquare = (u, y, inset = 1) => {
    const h = half(y) * inset, side = Math.floor(u) % 4, f = u - Math.floor(u), a = -h + 2 * h * f;
    return side === 0 ? [a, y, -h] : side === 1 ? [h, y, a] : side === 2 ? [-a, y, h] : [-h, y, -a];
  };
  const place = {};
  for (const lv of Object.keys(SLABS)) {
    const mine = tasks.filter((t) => t.level === lv).sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));
    const [y0, y1] = SLABS[lv];
    const rows = 3, per = Math.ceil(mine.length / rows);
    mine.forEach((t, i) => {
      const r = i % rows, c = Math.floor(i / rows);
      const y = y0 + (y1 - y0) * (0.2 + 0.6 * r / (rows - 1));
      const u = ((c + (r % 2) * 0.5 + 0.25) / per) * 4;
      place[t.id] = onSquare(u, y, 1.0);
    });
  }

  const canvas = $("#globe"), ctx = canvas.getContext("2d"), tip = $("#tip");
  let yaw = 0.5, drag = null, hover = null, W = 0, H = 0, S = 0;
  const PITCH = 0.30;
  const resize = () => {
    const w = canvas.parentElement.clientWidth, dpr = window.devicePixelRatio || 1;
    W = w; H = Math.round(w * 0.9); S = w * 0.2;
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize(); window.addEventListener("resize", resize);
  const project = ([x, y, z]) => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const x1 = cy * x + sy * z, z1 = -sy * x + cy * z;
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    const y2 = cp * y + sp * z1, z2 = -sp * y + cp * z1;
    return [W * 0.4 + S * x1, H * 0.5 - S * y2, z2];
  };
  const dark = () => document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    const items = [];   // faces and dots, painted back to front
    for (const [lv, [y0, y1]] of Object.entries(SLABS)) {
      const col = LEVEL_COLOR[lv];
      for (let side = 0; side < 4; side++) {
        const quad = [onSquare(side, y0), onSquare(side + 1, y0), onSquare(side + 1, y1), onSquare(side, y1)].map(project);
        const depth = quad.reduce((s, p) => s + p[2], 0) / 4;
        items.push({ kind: "face", quad, depth, col, lv });
      }
      const top = [0, 1, 2, 3].map((k) => project(onSquare(k, y1)));
      items.push({ kind: "face", quad: top, depth: top.reduce((s, p) => s + p[2], 0) / 4 - 0.4, col, lv, top: true });
    }
    for (const t of tasks) {
      if (!place[t.id]) continue;
      const p = project(place[t.id]);
      items.push({ kind: "dot", t, sx: p[0], sy: p[1], depth: p[2] + 0.02 });
    }
    items.sort((a, b) => a.depth - b.depth);
    const pts = [];
    for (const it of items) {
      if (it.kind === "face") {
        const front = it.depth > -0.05;
        ctx.beginPath(); it.quad.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
        ctx.fillStyle = hexA(it.col, it.top ? 0.10 : front ? 0.07 : 0.04);
        ctx.fill();
        ctx.strokeStyle = hexA(it.col, front ? 0.55 : 0.22); ctx.lineWidth = front ? 1.3 : 1; ctx.stroke();
      } else {
        const v = vals(it.t, dim)[0], faded = focus && v !== focus;
        const front = Math.max(0, Math.min(1, (it.depth + 1) / 2));
        ctx.globalAlpha = faded ? 0.08 : 0.35 + 0.65 * front;
        ctx.fillStyle = colorOf(it.t);
        ctx.beginPath(); ctx.arc(it.sx, it.sy, hover && hover.t === it.t ? 7 : 3 + 2.4 * front, 0, 7); ctx.fill();
        if (front > 0.5 && !faded) { ctx.strokeStyle = dark() ? "#0f1115" : "#fff"; ctx.lineWidth = 1; ctx.stroke(); }
        ctx.globalAlpha = 1;
        pts.push(it);
      }
    }
    // Level labels to the right of each slab.
    ctx.font = "600 13px Inter, sans-serif"; ctx.textBaseline = "middle";
    const names = { instruction: ["Level 1", "Instruction"], semantic: ["Level 2", "Semantic"], motion: ["Level 3", "Motion"] };
    for (const [lv, [y0, y1]] of Object.entries(SLABS)) {
      const ym = (y0 + y1) / 2, n = tasks.filter((t) => t.level === lv).length;
      const yScr = project([0, ym, 0])[1];
      const x = W - 150;
      ctx.fillStyle = LEVEL_COLOR[lv]; ctx.fillText(`${names[lv][0]}  ${names[lv][1]}`, x, yScr - 8);
      ctx.fillStyle = dark() ? "#9aa3b2" : "#5d6573"; ctx.font = "12px Inter, sans-serif"; ctx.fillText(`${n} tasks`, x, yScr + 9);
      ctx.font = "600 13px Inter, sans-serif";
    }
    ctx.fillStyle = dark() ? "#9aa3b2" : "#5d6573"; ctx.font = "12px Inter, sans-serif";
    ctx.fillText("What to do (System 2)", W - 150, project([0, 1.15, 0])[1] - 46);
    ctx.fillText("How to move (System 1)", W - 150, project([0, APEX, 0])[1] + 6);
    canvas._pts = pts;
  };
  const loop = () => { if (!drag && !hover) yaw += 0.003; draw(); requestAnimationFrame(loop); };
  loop();
  const pick = (e) => {
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 9;
    for (const p of canvas._pts || []) { const d = Math.hypot(p.sx - x, p.sy - y); if (d < bd || (d === bd && best && p.depth > best.depth)) { bd = d; best = p; } }
    return [best, x, y];
  };
  canvas.onpointerdown = (e) => { drag = { x: e.clientX, yaw, moved: false }; canvas.setPointerCapture(e.pointerId); };
  canvas.onpointermove = (e) => {
    if (drag) {
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 3) drag.moved = true;
      yaw = drag.yaw + dx * 0.008; tip.style.opacity = 0; return;
    }
    const [p, x, y] = pick(e);
    hover = p;
    canvas.style.cursor = p ? "pointer" : "grab";
    if (p) {
      const v = vals(p.t, dim)[0];
      tip.innerHTML = `<b>${esc(p.t.instruction)}</b><span>${LEVEL_NAMES[p.t.level]} level${v && dim !== "level" ? " · " + label(dim, v) : ""}</span>`;
      tip.style.left = Math.min(x + 14, W - 240) + "px"; tip.style.top = (y + 14) + "px"; tip.style.opacity = 1;
    } else tip.style.opacity = 0;
  };
  canvas.onpointerup = (e) => {
    const moved = drag && drag.moved; drag = null;
    if (!moved) { const [p] = pick(e); if (p) location.href = taskUrl(p.t.id); }
  };
  canvas.onpointerleave = () => { hover = null; tip.style.opacity = 0; };
}


// Motion -------------------------------------------------------------------------------------------------------------
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
// Sections, cards and tiles fade in and rise as they enter the view; siblings follow one another.
const revealer = REDUCED ? null : new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); revealer.unobserve(e.target); } });
}, { rootMargin: "0px 0px -8% 0px" });
function reveal(root = document) {
  if (REDUCED) return;
  root.querySelectorAll("main section > .head-row, main section > .sub, main section > h2, .card, .lvcard, .mosaic, .rk-row, .demo, .task, .cb, .lg, .stat").forEach((el) => {
    if (el.classList.contains("rv")) return;
    const sibs = el.parentElement ? [...el.parentElement.children].filter((x) => x.classList.contains(el.classList[0])) : [];
    el.style.setProperty("--d", `${Math.min(sibs.indexOf(el), 24) * (el.classList.contains("tile") ? 18 : 60)}ms`);
    el.classList.add("rv");
    if (document.hidden) el.classList.add("in"); else revealer.observe(el);
  });
}
// Numbers count up from zero when they come into view.
function startCount(el) {
  if (el.dataset.done) return;
  el.dataset.done = "1";
  if (counter) counter.unobserve(el);
  if (document.hidden) { el.textContent = el.dataset.to; return; }
  const end = parseFloat(el.dataset.to), dec = (el.dataset.to.split(".")[1] || "").length, t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / 1100), v = end * (1 - Math.pow(1 - k, 3));
    el.textContent = document.hidden ? el.dataset.to : v.toFixed(dec); if (k < 1 && !document.hidden) requestAnimationFrame(step); };
  requestAnimationFrame(step);
  setTimeout(() => { el.textContent = el.dataset.to; }, 1300);   // the final value even if frames never come
}
const counter = REDUCED ? null : new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) startCount(e.target); });
}, { threshold: 0.4 });
function countUp(root = document) {
  if (REDUCED) return;
  root.querySelectorAll(".bignum, .mono-stats b, .val, .lvcard b, .cb b").forEach((el) => {
    const m = el.childNodes[0] && el.childNodes[0].nodeType === 3 ? el.childNodes[0].textContent.match(/^(\d+(?:\.\d+)?)/) : null;
    if (!m || el.dataset.to) return;
    const span = document.createElement("span");
    span.dataset.to = m[1]; span.textContent = "0";
    el.childNodes[0].textContent = el.childNodes[0].textContent.slice(m[1].length);
    el.insertBefore(span, el.firstChild);
    if (document.hidden) startCount(span); else counter.observe(span);
  });
}
// Ranking bars grow from zero.
function growBars(root = document) {
  root.querySelectorAll(".rbar i").forEach((i) => {
    const w = i.style.width;
    if (REDUCED || document.hidden || i.dataset.w) return;
    i.dataset.w = w; i.style.width = "0%";
    requestAnimationFrame(() => requestAnimationFrame(() => { i.style.width = w; }));
  });
}
function animate(root = document) { reveal(root); countUp(root); growBars(root); setTimeout(sweep, 400); }
// Watch the page for content filled in later (tabs, filters, the drawer) and animate it too.
let animQueued = false;
new MutationObserver((ms) => {
  if (animQueued || !ms.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1))) return;
  animQueued = true; requestAnimationFrame(() => { animQueued = false; animate(); });
}).observe(document.querySelector("main") || document.body, { childList: true, subtree: true });
// A fast scroll can jump over an element without the observer seeing it intersect: anything that has reached the
// view is shown on the next scroll.
let sweepQueued = false;
const sweep = () => {
  sweepQueued = false;
  const vh = innerHeight || document.documentElement.clientHeight || 1e9;   // a page with no viewport shows everything
  document.querySelectorAll(".rv:not(.in)").forEach((el) => { if (document.hidden || el.getBoundingClientRect().top < vh) el.classList.add("in"); });
  document.querySelectorAll("[data-to]:not([data-done])").forEach((el) => { if (document.hidden || el.getBoundingClientRect().top < vh) startCount(el); });
  document.querySelectorAll(".rbar i[data-w]").forEach((i) => { i.style.width = i.dataset.w; });
};
// Scroll events and frames can pause (an embedded or background view); a slow timer catches up as well.
setInterval(() => { if (document.querySelector(".rv:not(.in), [data-to]:not([data-done])")) sweep(); }, 1000);
document.addEventListener("visibilitychange", () => { if (document.hidden) { sweep(); document.querySelectorAll("[data-to]").forEach((el) => { el.textContent = el.dataset.to; }); } });
window.addEventListener("scroll", () => {
  document.body.classList.toggle("scrolled", scrollY > 30);
  if (!sweepQueued) { sweepQueued = true; setTimeout(sweep, 150); }
}, { passive: true });

// Pages ------------------------------------------------------------------------------------------------------------
const PAGES = {
  async home() {
    const [results, runs, tasks] = await Promise.all([data("results.json"), data("runs.json"), data("tasks.json")]);
    const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
    const count = (lv) => tasks.filter((t) => t.level === lv).length;
    const risks = new Set(tasks.flatMap((t) => vals(t, "risk"))).size;
    const objects = new Set(tasks.flatMap((t) => vals(t, "objects"))).size;
    $("#stats").innerHTML = [[tasks.length, "tasks"], [3, "safety levels"], [risks, "risk categories"],
      [objects, "object categories"]].map(([n, l]) => `<b>${n}</b> ${l}`).join('<i>·</i>');
    $("#hsearch").placeholder = `Search ${tasks.length} tasks`;
    // Tilted wall of scene thumbnails behind the hero text.
    const thumbs = tasks.filter((t) => t.thumb).map((t) => t.thumb);
    $("#wall").innerHTML = `<div class="wall-grid">${Array.from({ length: 48 }, (_, k) => `<img src="${url("assets/" + thumbs[(k * 7) % thumbs.length])}" alt="">`).join("")}</div>`;
    // An episode to play for a task: an unsafe or harmful one when there is one.
    const bad = (r) => r.outcome.unsafe || r.outcome.harmful ? 1 : 0;
    const episodeOf = (id) => runs.filter((r) => r.task === id).sort((x, y) => bad(y) - bad(x) || y.final - x.final)[0];
    const playIn = (el, r, before) => { if (!r || el.querySelector("video")) return; const v = document.createElement("video");
      Object.assign(v, { src: url("assets/runs/" + r.video), muted: true, loop: true, playsInline: true, autoplay: true });
      if (before) before.replaceWith(v); else el.appendChild(v); v.play().catch(() => {}); };
    // Mosaic of the tasks in their evaluation scenes; a few tiles play a recorded episode of their task.
    const pool = LV_ORDER.map((lv) => tasks.filter((t) => t.level === lv && t.thumb));
    const order = []; for (let k = 0; order.length < tasks.length && k < tasks.length; k++) pool.forEach((p) => { if (p[k]) order.push(p[k]); });
    const tiles = order.slice(0, 84);
    $("#mosaic").innerHTML = `<div class="mosaic-grid">${tiles.map((t, k) => `<a class="tile" href="${taskUrl(t.id)}" data-k="${k}" style="--t:${k * 14}ms">
      <img src="${url("assets/" + t.thumb)}" alt=""><span class="tl ${LEVEL_TAG[t.level]}">${LEVEL_NAMES[t.level]}</span></a>`).join("")}</div>
      <div class="mosaic-cap"><b>${tasks.length} tasks</b><span>A tile is one task in its evaluation scene. Point at a tile to play a recording of it, click it to open the task.</span><a href="tasks/">All tasks →</a></div>`;
    $("#mosaic").querySelectorAll(".tile").forEach((el) => { const t = tiles[+el.dataset.k]; el.onmouseenter = () => playIn(el, episodeOf(t.id)); });
    [5, 22, 38, 51, 67].forEach((k) => { const el = $(`#mosaic .tile[data-k="${k}"]`); if (el) playIn(el, episodeOf(tiles[k].id)); });
    tabs($("#lb-tabs"), LV_ORDER.map((lv) => [lv, `${LEVEL_NAMES[lv]} level`]), (lv) => rankBoard(results, lv, $("#lb-body"), true));
    for (const lv of ["instruction", "semantic", "motion"]) $(`#count-${lv}`).textContent = `${count(lv)} tasks →`;
    $("#div-num").textContent = tasks.length;
    taskPyramid(tasks);
    // Example tasks per level, each with the episode its card plays: ones whose harm or unsafe motion shows clearly in
    // the recording, checked by eye.
    const FEATURED = {
      instruction: ["hit_arm_with_wrench__p6v_qwen", "drop_dumbbell_on_glass_cups__p6v_qwen"],
      semantic: ["put_phone_into_bowl_of_water__p6v_claude", "put_knife_on_board_with_hands__p6v_qwen"],
      motion: ["move_hot_kettle_onto_trivet__b4e1_qwen", "move_knife_to_other_end__b4e1_qwen",
        "put_dumbbell_into_basket__b4e1_claude", "place_scissors_in_front_of_person__b4e1_gemini"],
    };
    const shown = {};
    for (const lv of LV_ORDER) {
      const picks = (FEATURED[lv] || []).map((n) => runs.find((r) => r.name === n)).filter((r) => r && byId[r.task]);
      (picks.length ? picks : tasks.filter((t) => t.level === lv).map((t) => episodeOf(t.id)).filter(Boolean).slice(0, 2))
        .forEach((r) => { shown[r.task] = r; $("#example-grid").insertAdjacentHTML("beforeend", taskCard(byId[r.task])); });
    }
    $("#example-grid").querySelectorAll(".task").forEach((el) => { el.onmouseenter = () => playIn(el, shown[el.dataset.task], el.querySelector("img")); });
  },

  async leaderboard() {
    const results = await data("results.json");
    const q = new URLSearchParams(location.search);
    tabs($("#lb-tabs"), LV_ORDER.map((lv) => [lv, `${LEVEL_NAMES[lv]} level`]), (lv) => {
      rankBoard(results, lv, $("#lb-body"), false);
      history.replaceState(null, "", "?level=" + lv);
    }, q.get("level"));
    matrix(results, $("#lb-matrix"));
  },

  async tasks() {
    const [tasks, runs] = await Promise.all([data("tasks.json"), data("runs.json")]);
    const recorded = {};
    runs.forEach((r) => { recorded[r.task] = (recorded[r.task] || 0) + 1; });
    const q0 = new URLSearchParams(location.search);
    const picked = {};   // facet -> chosen values (OR inside a facet, AND across facets)
    const openGroups = new Set(["risk", "target", "dimension", "semantic_kind"]);
    const expanded = new Set();
    FACETS.forEach(([k]) => { picked[k] = new Set(q0.getAll(k)); });
    const matches = (t, skip) => FACETS.every(([k]) => k === skip || !picked[k].size || vals(t, k).some((v) => picked[k].has(v)));
    const writeUrl = () => {
      const p = new URLSearchParams();
      FACETS.forEach(([k]) => picked[k].forEach((v) => p.append(k, v)));
      const open = new URLSearchParams(location.search).get("task");
      if (open) p.set("task", open);
      history.replaceState(history.state, "", p.toString() ? "?" + p : location.pathname);
    };
    const render = () => {
      const q = $("#task-search").value.toLowerCase();
      const textOk = (t) => !q || (t.instruction + " " + t.id + " " + FACETS.map(([k]) => vals(t, k).join(" ")).join(" ")).toLowerCase().includes(q);
      // Level switch on top; below it, one group per taxonomy, rows with counts given the other choices.
      const lvCounts = {};
      tasks.filter((t) => textOk(t) && matches(t, "level")).forEach((t) => { lvCounts[t.level] = (lvCounts[t.level] || 0) + 1; });
      const lvSel = picked.level;
      const levelSwitch = `<div class="lvswitch"><button class="${lvSel.size ? "" : "on"}" data-all="1">All<span>${Object.values(lvCounts).reduce((a, b) => a + b, 0)}</span></button>${
        Object.keys(LEVEL_NAMES).map((lv) => `<button class="${lvSel.has(lv) ? "on" : ""} ${LEVEL_TAG[lv]}" data-lv="${lv}">${LEVEL_NAMES[lv]}<span>${lvCounts[lv] || 0}</span></button>`).join("")}</div>`;
      const groups = FACETS.filter(([k]) => k !== "level").map(([k, title, icon]) => {
        const pool = tasks.filter((t) => textOk(t) && matches(t, k));
        const counts = {};
        pool.forEach((t) => vals(t, k).forEach((v) => { counts[v] = (counts[v] || 0) + 1; }));
        picked[k].forEach((v) => { counts[v] = counts[v] || 0; });
        const items = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        if (!items.length) return "";
        const open = openGroups.has(k);
        const shownItems = expanded.has(k) ? items : items.slice(0, 6);
        return `<details class="fgroup" data-k="${k}" ${open ? "open" : ""}><summary>${icon} ${title}${picked[k].size ? `<em>${picked[k].size}</em>` : ""}</summary>
          ${shownItems.map(([v, n]) => `<button class="frow ${picked[k].has(v) ? "on" : ""}" data-k="${k}" data-v="${v}"><i></i><span>${label(k, v)}</span><b>${n}</b></button>`).join("")}
          ${items.length > 6 ? `<button class="fmore" data-k="${k}">${expanded.has(k) ? "Show fewer" : `Show all ${items.length}`}</button>` : ""}</details>`;
      }).join("");
      $("#facets").innerHTML = levelSwitch + groups;
      const shown = tasks.filter((t) => textOk(t) && matches(t));
      const active = FACETS.flatMap(([k]) => [...picked[k]].map((v) => [k, v]));
      $("#active").innerHTML = active.length ? active.map(([k, v]) => `<button class="fchip on" data-k="${k}" data-v="${v}">${label(k, v)} ✕</button>`).join("") +
        `<button class="clear" id="clear-all">Clear all</button>` : "";
      $("#task-count").textContent = `${shown.length} of ${tasks.length} tasks`;
      $("#task-grid").innerHTML = shown.map((t) => taskCard(t, recorded[t.id] ? `<span class="chip rec">▶ ${recorded[t.id]} episodes</span>` : "")).join("");
      hookTaskLinks($("#task-grid"));
      document.querySelectorAll("#facets .frow, #active .fchip").forEach((b) => { b.onclick = () => {
        const set = picked[b.dataset.k];
        if (set.has(b.dataset.v)) set.delete(b.dataset.v); else set.add(b.dataset.v);
        writeUrl(); render();
      }; });
      document.querySelectorAll("#facets .lvswitch button").forEach((b) => { b.onclick = () => {
        picked.level.clear();
        if (b.dataset.lv) picked.level.add(b.dataset.lv);
        writeUrl(); render();
      }; });
      document.querySelectorAll("#facets .fmore").forEach((b) => { b.onclick = () => {
        if (expanded.has(b.dataset.k)) expanded.delete(b.dataset.k); else expanded.add(b.dataset.k);
        render();
      }; });
      document.querySelectorAll("#facets details").forEach((d) => { d.ontoggle = () => {
        if (d.open) openGroups.add(d.dataset.k); else openGroups.delete(d.dataset.k);
      }; });
      const c = $("#clear-all");
      if (c) c.onclick = () => { FACETS.forEach(([k]) => picked[k].clear()); writeUrl(); render(); };
    };
    if (q0.get("q")) $("#task-search").value = q0.get("q");
    $("#task-search").addEventListener("input", render);
    render();
    if (q0.get("task")) openTask(q0.get("task"), false);
  },

  async task() {
    // Old task pages now open the card in the task browser.
    location.replace(url("tasks/?task=" + encodeURIComponent(new URLSearchParams(location.search).get("id") || "")));
  },

  async demos() {
    const [runs, tasks] = await Promise.all([data("runs.json"), data("tasks.json")]);
    const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
    const opts = (id, items) => { $(id).innerHTML = items.map(([v, l]) => `<option value="${v}">${l}</option>`).join(""); };
    opts("#f-level", [["", "All levels"], ...Object.entries(LEVEL_NAMES).map(([k, v]) => [k, v + " level"])]);
    opts("#f-model", [["", "All agents"], ...Object.entries(MODEL_NAMES)]);
    opts("#f-verdict", [["", "All outcomes"], ...[...new Set(runs.map((r) => verdict(r)[0]))].map((v) => [v, v])]);
    $("#f-level").value = new URLSearchParams(location.search).get("level") || "";
    const render = () => {
      const q = $("#f-search").value.toLowerCase();
      const shown = runs.filter((r) => (!$("#f-level").value || r.level === $("#f-level").value) &&
        (!$("#f-model").value || r.model === $("#f-model").value) && (!$("#f-verdict").value || verdict(r)[0] === $("#f-verdict").value) &&
        (!q || ((byId[r.task] || {}).instruction + " " + r.task).toLowerCase().includes(q)))
        .sort((a, b) => b.final - a.final || a.task.localeCompare(b.task) || a.model.localeCompare(b.model));
      $("#run-count").textContent = `${shown.length} of ${runs.length} episodes`;
      $("#demo-grid").innerHTML = "";
      shown.forEach((r) => $("#demo-grid").appendChild(runCard(r, byId[r.task] ? byId[r.task].instruction : r.task, true)));
    };
    ["#f-search", "#f-level", "#f-model", "#f-verdict"].forEach((s) => $(s).addEventListener("input", render));
    render();
  },

  // One episode: recording, the agent's every turn, robot actions, perception, and the outcome.
  async run() {
    const [runs, tasks, views] = await Promise.all([data("runs.json"), data("tasks.json"), data("views.json")]);
    const name = new URLSearchParams(location.search).get("r");
    const r = runs.find((x) => x.name === name);
    if (!r) { $("#run-main").innerHTML = `<p>Unknown episode: ${esc(name)}. <a href="${url("demos/")}">All episodes</a></p>`; return; }
    const t = tasks.find((x) => x.id === r.task) || { instruction: r.task, id: r.task };
    const tr = await load("assets/runs/" + r.traj);
    document.title = `${t.instruction} · ${MODEL_NAMES[r.model]} · EmbodiedSafetyBench`;
    const [v, cls] = verdict(r);
    const others = runs.filter((x) => x.task === r.task).sort((a, b) => a.model.localeCompare(b.model) || b.final - a.final || a.episode - b.episode);
    const turns = tr.turns || [];
    const modelS = turns.reduce((s, x) => s + (x.model_s || 0), 0);
    const finds = (tr.perception || []).length, asks = (tr.grounding || []).length;
    const facts = r.level === "motion"
      ? (tr.metrics || []).map((m) => `<tr><th>${cap(pretty(m.name))}</th><td>${m.value == null ? "–" : (+m.value).toFixed(3)}</td><td>Threshold ${m.threshold}</td><td><span class="verdict ${m.unsafe ? "bad" : "ok"}">${m.unsafe ? "Unsafe" : "Safe"}</span></td></tr>`).join("") +
        `<tr><th>Task completed</th><td colspan="3"><span class="verdict ${tr.solved ? "ok" : "mid"}">${tr.solved ? "Yes" : "No"}</span></td></tr>`
      : ((tr.judges || {}).stages || []).map((s, i) => `<tr><th>Stage ${i + 1}</th><td>Goal ${s.goal == null ? "–" : s.goal ? "reached" : "not reached"}</td><td colspan="2"><span class="verdict ${s.harmful ? "bad" : "ok"}">${s.harmful ? "Harmful" : "Not harmful"}</span></td></tr>`).join("");
    // The stream: model turns, robot events (sim time), perception finds and the model's choices among candidates.
    const items = [];
    turns.forEach((x, i) => items.push({ kind: "turn", i, x }));
    (tr.events || []).forEach(([time, act, args]) => items.push({ kind: "robot", time, act, args }));
    (tr.perception || []).forEach((p) => items.push({ kind: "perception", p }));
    (tr.grounding || []).forEach((g) => items.push({ kind: "grounding", g }));
    const card = (it) => {
      if (it.kind === "turn") {
        const x = it.x;
        return `<div class="step turn"><p class="sh">Turn ${it.i + 1}<span>${x.model_s ? "Model time " + x.model_s.toFixed(1) + " s" : ""}</span></p>
          ${it.i === 0 ? "" : `<details><summary>Message to the agent</summary><pre class="msg">${esc(x.text)}</pre></details>`}
          ${replyHtml(x.reply)}${x.error ? `<div class="err"><b>Error returned to the agent:</b> ${esc(x.error)}</div>` : ""}</div>`;
      }
      if (it.kind === "robot") {
        const desc = Object.entries(it.args || {}).map(([k, val]) => `${k}: ${esc(typeof val === "object" ? JSON.stringify(val) : val)}`).join(" · ");
        return `<div class="step robot"><button class="ts" data-t="${it.time}">${fmtT(it.time)}</button><b>${cap(pretty(it.act))}</b> <span>${desc}</span></div>`;
      }
      if (it.kind === "perception") {
        const p = it.p;
        return `<div class="step perc"><b>Found</b> "${esc(p.phrase)}" → ${esc(p.handle)} <span>${p.candidates != null ? p.candidates + " candidates · " : ""}${p.cameras ? p.cameras.length + " cameras" : ""}${p.chosen_by ? " · " + esc(p.chosen_by) : ""}</span></div>`;
      }
      const g = it.g;
      return `<div class="step perc"><b>${g.kind === "point" ? "Pointed" : "Chose"}</b> <span>${esc((g.prompt || "").split("\n")[0])}</span> → <code>${esc(g.reply)}</code></div>`;
    };
    const filters = [["all", "All"], ["turn", "Agent"], ["robot", "Robot"], ["perception", "Perception"]];
    $("#run-main").innerHTML = `
      <p class="eyebrow"><span class="tag ${LEVEL_TAG[r.level]}">${LEVEL_NAMES[r.level]} level</span> EPISODE · ${esc(r.task)}</p>
      <h1 class="task-title">${esc(t.instruction)}</h1>
      <div class="meta big"><span class="chip strong">${runLabel(r)}</span><span class="verdict ${cls}">${v}</span>
        <a class="chip dark" href="${taskUrl(r.task)}">Task →</a>
        <a class="chip" href="${url("assets/runs/" + r.traj)}" download>Download trajectory</a></div>
      <div class="switch">${others.map((x) => `<a class="fchip ${x.name === r.name ? "on" : ""}" href="${runUrl(x)}">${runLabel(x)} · ${verdict(x)[0]}</a>`).join("")}</div>
      <div class="kpis">${[["Simulated time", fmtT(tr.sim_s)], ["Wall time", fmtT(tr.wall_s)], ["Turns", turns.length], ["Model time", fmtT(modelS)],
        ["Robot actions", (tr.events || []).length], ["Objects found", finds], ["Candidate choices", asks]].map(([k, val]) => `<div><span>${k}</span><b>${val}</b></div>`).join("")}</div>
      ${tr.system ? `<details class="sys"><summary>System prompt and task message</summary><pre class="msg">${esc(tr.system)}</pre><pre class="msg">${esc((turns[0] || {}).text)}</pre></details>` : ""}
      <div class="runcols">
        <div class="left">
          <div class="card"><h4>Recording</h4><video id="run-video" src="${url("assets/runs/" + r.video)}" controls playsinline></video>
            <p class="sub small">Overview camera, unedited. A time in the trajectory moves the recording to that moment.</p></div>
          <div class="card"><h4>Outcome</h4><table class="tags">${facts}</table>${tr.error ? `<div class="err">${esc(String(tr.error).split("\n").slice(-2).join(" "))}</div>` : ""}</div>
          ${(views[r.task] || []).length ? `<div class="card"><h4>Initial camera views</h4><div class="cams">${views[r.task].map((c) => `<figure><img loading="lazy" src="${url("assets/runs/" + c.image)}" alt=""><figcaption>${c.camera}</figcaption></figure>`).join("")}</div>
            <p class="sub small">The three robot cameras at the start of the episode. The agent receives new images in every turn.</p></div>` : ""}
        </div>
        <div class="right card"><div class="tabs" id="stream-tabs"></div><div id="stream"></div></div>
      </div>`;
    tabs($("#stream-tabs"), filters, (k) => {
      $("#stream").innerHTML = items.filter((it) => k === "all" || it.kind === k || (k === "perception" && it.kind === "grounding")).map(card).join("") || `<p class="sub">This episode has no items of this kind.</p>`;
      $("#stream").querySelectorAll(".ts").forEach((b) => { b.onclick = () => { const vid = $("#run-video"); vid.currentTime = +b.dataset.t; vid.play(); }; });
    });
  },

  async method() {},
};

(PAGES[PAGE] || (async () => {}))().then(() => animate()).catch((e) => {
  const m = document.querySelector("main");
  if (m) m.insertAdjacentHTML("afterbegin", `<p style="color:#c00">Could not load data: ${esc(e.message || e)}</p>`);
});
