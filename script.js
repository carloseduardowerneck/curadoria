/* =========================================================
 * Curadoria BSB — script
 * Lê o CSV, monta destaques, filtros e cards.
 * Desenha os ladrilhos (azulejos) do topo e do rodapé.
 * ========================================================= */

const CSV_PATH = "curadoria_bsb.csv";

/* ---------- DOM ---------- */
const elGrid    = document.getElementById("grid");
const elStatus  = document.getElementById("status");
const elCount   = document.getElementById("count");
const elEmpty   = document.getElementById("empty");
const elSearch  = document.getElementById("search");
const elCatPills= document.getElementById("filter-categories");
const elReg     = document.getElementById("filter-region");
const elPrice   = document.getElementById("filter-price");
const elRating  = document.getElementById("filter-rating");
const elSort    = document.getElementById("sort");
const elClear   = document.getElementById("clear");
const elHeroCount = document.getElementById("hero-count");
const elFeatured  = document.getElementById("featured-grid");

/* Estado dos filtros (categoria via pills) */
let activeCategory = "";

/* ---------- utils ---------- */
function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/* ---------- detect regions (multi-tag) ---------- */
function detectRegions(text) {
  const t = norm(text);
  const regions = [];
  const checks = [
    ["lago norte", "Lago Norte"],
    ["lago sul", "Lago Sul"],
    ["asa norte", "Asa Norte"],
    ["asa sul", "Asa Sul"],
    ["sudoeste", "Sudoeste"],
    ["noroeste", "Noroeste"],
    ["octogonal", "Octogonal"],
    ["vicente pires", "Vicente Pires"],
    ["aguas claras", "Águas Claras"],
    ["guara", "Guará"],
    ["taguatinga", "Taguatinga"],
    ["ceilandia", "Ceilândia"],
    ["samambaia", "Samambaia"],
    ["sobradinho", "Sobradinho"],
    ["planaltina", "Planaltina"],
    ["gama", "Gama"],
    ["plano piloto", "Plano Piloto"],
    ["vila planalto", "Vila Planalto"]
  ];
  checks.forEach(([needle, label]) => {
    if (t.includes(needle)) regions.push(label);
  });
  return Array.from(new Set(regions));
}

/* ---------- price ---------- */
function getPriceInfo(priceStr) {
  if (!priceStr || !priceStr.trim()) {
    return { filterValue: "", cssClass: "", label: "", symbol: "" };
  }
  const c = norm(priceStr);

  if (c.includes("muito caro") || c.includes("muito-caro")) {
    return { filterValue: "muito-caro", cssClass: "pr-muito", label: "Muito Caro", symbol: "$$$$" };
  }
  if (c.includes("barato")) {
    return { filterValue: "barato", cssClass: "pr-barato", label: "Barato", symbol: "$" };
  }
  if (c.includes("preço ok") || c.includes("preco ok") || c === "ok") {
    return { filterValue: "ok", cssClass: "pr-ok", label: "Preço OK", symbol: "$$" };
  }
  if (c.includes("caro")) {
    return { filterValue: "caro", cssClass: "pr-caro", label: "Caro", symbol: "$$$" };
  }
  // numeric fallback
  const m = c.replace(/[r$\s,]/g, "").match(/(\d+(?:\.\d+)?)/);
  if (m) {
    const v = parseFloat(m[1]);
    if (v <= 40)  return { filterValue: "barato", cssClass: "pr-barato", label: `R$ ${v}`, symbol: "$" };
    if (v <= 80)  return { filterValue: "ok", cssClass: "pr-ok", label: `R$ ${v}`, symbol: "$$" };
    if (v <= 120) return { filterValue: "caro", cssClass: "pr-caro", label: `R$ ${v}`, symbol: "$$$" };
    return { filterValue: "muito-caro", cssClass: "pr-muito", label: `R$ ${v}`, symbol: "$$$$" };
  }
  return { filterValue: "", cssClass: "", label: priceStr, symbol: "" };
}

/* ---------- rating ---------- */
function getRatingInfo(ratingStr) {
  if (!ratingStr || !ratingStr.trim()) {
    return { filterValue: "", cssClass: "", label: "", order: 0 };
  }
  const r = norm(ratingStr);
  if (r.includes("perfeito"))               return { filterValue: "perfeito", cssClass: "rt-perfeito", label: "Perfeito", order: 4 };
  if (r.includes("otimo") || r.includes("ótimo")) return { filterValue: "otimo", cssClass: "rt-otimo", label: "Ótimo", order: 3 };
  if (r.includes("bom"))                    return { filterValue: "bom", cssClass: "rt-bom", label: "Bom", order: 2 };
  if (r.includes("ainda não fui") || r.includes("ainda nao fui")) return { filterValue: "pendente", cssClass: "rt-pendente", label: "Quero ir", order: 1 };
  return { filterValue: "", cssClass: "", label: ratingStr, order: 0 };
}

/* ---------- CSV parser ---------- */
function detectDelimiter(text) {
  const first = text.split(/\r?\n/).find(l => l.trim().length > 0) || "";
  const c = (first.match(/,/g) || []).length;
  const s = (first.match(/;/g) || []).length;
  return s > c ? ";" : ",";
}

function splitCSVLine(line, delim) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
      continue;
    }
    if (ch === delim && !inQ) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCSV(text) {
  const delim = detectDelimiter(text);
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (!lines.length) return [];
  const headers = splitCSVLine(lines[0], delim).map(h => h.trim());
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = splitCSVLine(lines[i], delim);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (parts[idx] ?? "").trim(); });
    data.push(obj);
  }
  return data;
}

/* ---------- column aliases ---------- */
const aliases = {
  name:    ["nome do local", "nome", "local", "lugar", "estabelecimento"],
  category:["categoria", "tipo de comida", "tipo", "comida"],
  region:  ["localizacao", "localização", "bairro", "regiao", "região", "area"],
  desc:    ["recomendacoes de pratos", "recomendações de pratos", "descricao", "descrição", "comentario", "dica"],
  maps:    ["maps link", "maps", "google maps", "mapa"],
  coords:  ["coordenadas", "coord", "latlng", "latitude"],
  price:   ["preço", "preco", "faixa de preço", "valor", "custo"],
  rating:  ["avaliação", "avaliacao", "classificação", "nota"]
};

function findColumn(headers, key) {
  const hs = headers.map(h => ({ raw: h, n: norm(h) }));
  for (const a of aliases[key]) {
    const target = norm(a);
    const found = hs.find(h => h.n === target || h.n.includes(target));
    if (found) return found.raw;
  }
  return null;
}

function pick(obj, col) { return col ? (obj[col] ?? "") : ""; }

function safeLink(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  return /^https?:\/\//i.test(u) ? u : "https://" + u;
}

function mapsFromCoords(coords) {
  const c = String(coords || "").trim();
  if (!c) return "";
  const cleaned = c.replace(/;/g, ",").replace(/\s+/g, " ");
  const m = cleaned.match(/(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)/);
  if (!m) return "";
  return `https://www.google.com/maps/search/?api=1&query=${m[1]},${m[3]}`;
}

/* ---------- normalize description (strip "Minha Sugestão:") ---------- */
function cleanDesc(d) {
  if (!d) return "";
  return d.replace(/^minha sugest[ãa]o:\s*/i, "").trim();
}

/* ---------- build model ---------- */
function buildModel(data) {
  const headers = Object.keys(data[0] || {});
  const cols = {
    name:   findColumn(headers, "name"),
    cat:    findColumn(headers, "category"),
    reg:    findColumn(headers, "region"),
    desc:   findColumn(headers, "desc"),
    maps:   findColumn(headers, "maps"),
    coords: findColumn(headers, "coords"),
    price:  findColumn(headers, "price"),
    rating: findColumn(headers, "rating")
  };

  return data.map((r, idx) => {
    const name = pick(r, cols.name) || `Item ${idx + 1}`;
    const category = pick(r, cols.cat).trim();
    const regionRaw = pick(r, cols.reg);
    const detected = detectRegions(regionRaw);
    const regions = detected.length ? detected : (regionRaw ? [regionRaw] : []);
    const desc = cleanDesc(pick(r, cols.desc));
    const coords = pick(r, cols.coords);
    const maps = pick(r, cols.maps);
    const price = pick(r, cols.price);
    const rating = pick(r, cols.rating);

    const priceInfo = getPriceInfo(price);
    const ratingInfo = getRatingInfo(rating);

    const searchable = norm([name, category, regions.join(" "), desc, price, rating].join(" "));

    return {
      name, category, regions, desc, maps, coords,
      priceFilterValue: priceInfo.filterValue,
      priceClass: priceInfo.cssClass,
      priceLabel: priceInfo.label,
      priceSymbol: priceInfo.symbol,
      ratingFilterValue: ratingInfo.filterValue,
      ratingClass: ratingInfo.cssClass,
      ratingLabel: ratingInfo.label,
      ratingOrder: ratingInfo.order,
      searchable
    };
  });
}

/* ---------- featured picks (Carlos's words) ---------- */
const FEATURED_PICKS = [
  {
    nameMatch: "cafezin",
    why: "Atendimento impecável, salgados e doces deliciosos, com preço bacana. Daqueles lugares que você descobre e quer guardar pra si.",
  },
  {
    nameMatch: "nazo",
    why: "Sushi sério e rodízio show de bola. Recomendação principal pros amigos de fora de Brasília. Vai com fome, sai com história pra contar.",
  },
  {
    nameMatch: "italianissimo",
    why: "Comida Italiana espetacular, com pratos muito bem feitos (e bem servidos). Ótimo para levar alguém que você queira impressionar.",
  },
  {
    nameMatch: "bsb grill",
    why: "Carnes excelentes, acompanhamentos no mesmo nível, e atendimento que te faz amigo dos garçons. Cada visita ensina algo sobre churrasco.",
  }
];

/* ---------- ladrilhos (azulejos) ----------
 * Cada ladrilho é um quadrado 100x100 com uma forma simples
 * (quarto de círculo, meio círculo, triângulo...), girada ao acaso.
 * A semente fixa faz o desenho sair igual em toda visita.
 */
const TILE_SHAPES = [
  "M0 0H100A100 100 0 0 1 0 100Z",                                  // quarto de círculo
  "M0 100A50 50 0 0 1 100 100Z",                                    // meio círculo
  "M0 0H100V100Z",                                                  // triângulo
  "M50 28A22 22 0 1 1 50 72A22 22 0 1 1 50 28Z",                    // círculo
  "M0 0H50A50 50 0 0 1 0 50ZM100 100H50A50 50 0 0 1 100 50Z",       // dois quartos
  "M0 0H50V50H0Z",                                                  // quadrado
  ""                                                                 // vazio
];

const COLORS = { azul: "#1846a3", escuro: "#0f2f72", branco: "#f7f7f4", ipe: "#f4b400" };

function seededRandom(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tilesSVG(cols, rows, seed, base) {
  const rnd = seededRandom(seed);
  let tiles = "";
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const shape = TILE_SHAPES[Math.floor(rnd() * TILE_SHAPES.length)];
      const rot = Math.floor(rnd() * 4) * 90;
      const inverted = rnd() < 0.3;
      const bg = inverted ? COLORS.branco : base;
      let fg = inverted ? base : COLORS.branco;
      if (rnd() < 0.08) fg = COLORS.ipe;
      tiles += `<g transform="translate(${x * 100} ${y * 100})">` +
        `<rect width="100" height="100" fill="${bg}"/>` +
        (shape ? `<path d="${shape}" fill="${fg}" transform="rotate(${rot} 50 50)"/>` : "") +
        `</g>`;
    }
  }
  // juntas (rejunte) entre os ladrilhos
  let grout = "";
  for (let x = 1; x < cols; x++) grout += `<line x1="${x * 100}" y1="0" x2="${x * 100}" y2="${rows * 100}"/>`;
  for (let y = 1; y < rows; y++) grout += `<line x1="0" y1="${y * 100}" x2="${cols * 100}" y2="${y * 100}"/>`;

  return `<svg viewBox="0 0 ${cols * 100} ${rows * 100}" xmlns="http://www.w3.org/2000/svg" role="presentation">` +
    tiles + `<g stroke="${COLORS.escuro}" stroke-width="3">${grout}</g></svg>`;
}

const elHeroTiles = document.getElementById("hero-tiles");
const elFooterTiles = document.getElementById("footer-tiles");
const mqNarrow = window.matchMedia("(max-width: 960px)");

function drawTiles() {
  if (elHeroTiles) {
    elHeroTiles.innerHTML = mqNarrow.matches
      ? tilesSVG(8, 3, 61, COLORS.azul)
      : tilesSVG(5, 5, 61, COLORS.azul);
  }
  if (elFooterTiles) {
    const cols = Math.ceil(window.innerWidth / 56) + 1;
    elFooterTiles.innerHTML = tilesSVG(cols, 1, 1960, COLORS.escuro);
  }
}

let tilesTimer;
window.addEventListener("resize", () => {
  clearTimeout(tilesTimer);
  tilesTimer = setTimeout(drawTiles, 150);
});
drawTiles();

/* ladrilho de canto dos destaques: forma + giro que encostam no canto superior direito */
const FEATURE_TILES = [
  { shape: 0, rot: 90 },
  { shape: 1, rot: 180 },
  { shape: 3, rot: 0 },
  { shape: 4, rot: 90 }
];

function cornerTile(i, color) {
  const t = FEATURE_TILES[i % FEATURE_TILES.length];
  return `<svg class="feature__tile" viewBox="0 0 100 100" aria-hidden="true">` +
    `<path d="${TILE_SHAPES[t.shape]}" fill="${color}" transform="rotate(${t.rot} 50 50)"/></svg>`;
}

const PIN_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>`;

function mapButton(url) {
  return url
    ? `<a href="${url}" target="_blank" rel="noopener" class="map-btn">${PIN_ICON}Abrir no mapa</a>`
    : "";
}

function renderFeatured(rows) {
  const picks = FEATURED_PICKS.map((p, i) => {
    const m = rows.find(r => norm(r.name).includes(p.nameMatch));
    return m ? { ...m, why: p.why, num: i + 1 } : null;
  }).filter(Boolean);

  elFeatured.innerHTML = picks.map((item, i) => {
    const mapUrl = mapsFromCoords(item.coords) || safeLink(item.maps);
    // xadrez: 1º e 4º azuis (em 2 colunas forma um tabuleiro)
    const azul = (i === 0 || i === 3);
    return `
      <article class="feature ${azul ? "feature--azul" : ""}">
        ${cornerTile(i, azul ? COLORS.ipe : COLORS.azul)}
        <div class="feature__num">0${item.num}</div>
        <h3 class="feature__name">${escapeHtml(item.name)}</h3>
        <p class="feature__why">${escapeHtml(item.why)}</p>
        <div class="feature__foot">
          <span>${escapeHtml(item.category)} · ${escapeHtml(item.regions.join(", "))}</span>
          ${mapButton(mapUrl)}
        </div>
      </article>
    `;
  }).join("");
}

/* ---------- render cards ---------- */
let rows = [];

function render(list) {
  elGrid.innerHTML = "";
  if (!list.length) {
    elEmpty.classList.remove("hidden");
    elCount.textContent = "";
    return;
  }
  elEmpty.classList.add("hidden");

  const frag = document.createDocumentFragment();
  list.forEach(item => {
    const mapUrl = mapsFromCoords(item.coords) || safeLink(item.maps);

    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <div class="card__head">
        <h3 class="card__name">${escapeHtml(item.name)}</h3>
        ${item.ratingLabel ? `<span class="selo ${item.ratingClass}">${escapeHtml(item.ratingLabel)}</span>` : ""}
      </div>
      ${item.category ? `<div class="card__cat">${escapeHtml(item.category)}</div>` : ""}
      <p class="card__desc ${item.desc ? "" : "card__desc--empty"}">${item.desc
        ? `<span class="card__desc-label">Sugestão</span>${escapeHtml(item.desc)}`
        : "Ainda sem nota pessoal."}</p>
      <div class="card__foot">
        <div class="card__meta">
          <div class="card__regions">
            ${item.regions.map(rg => `<span class="card__region">${escapeHtml(rg)}</span>`).join("")}
          </div>
          ${item.priceSymbol ? `<span class="card__price" title="${escapeHtml(item.priceLabel)}">${item.priceSymbol}</span>` : ""}
        </div>
        ${mapButton(mapUrl)}
      </div>
    `;
    frag.appendChild(card);
  });
  elGrid.appendChild(frag);

  elCount.textContent = `${list.length} ${list.length === 1 ? "lugar" : "lugares"}`;
}

/* ---------- filtering & sorting ---------- */
function apply() {
  const q = norm(elSearch.value);
  const reg = elReg.value;
  const priceRange = elPrice.value;
  const ratingFilter = elRating.value;
  const sortKey = elSort.value;

  let filtered = rows.filter(r => {
    if (q && !r.searchable.includes(q)) return false;
    if (activeCategory && r.category !== activeCategory) return false;
    if (reg && !r.regions.includes(reg)) return false;
    if (priceRange && r.priceFilterValue !== priceRange) return false;
    if (ratingFilter && r.ratingFilterValue !== ratingFilter) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (sortKey === "name-desc") return b.name.localeCompare(a.name);
    if (sortKey === "rating-desc") {
      if (b.ratingOrder !== a.ratingOrder) return b.ratingOrder - a.ratingOrder;
      return a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name);
  });

  render(filtered);
}

/* ---------- populate category pills ---------- */
function fillCategoryPills(rows) {
  const counts = {};
  rows.forEach(r => {
    if (!r.category) return;
    counts[r.category] = (counts[r.category] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  elCatPills.innerHTML = "";
  const allBtn = document.createElement("button");
  allBtn.className = "pill pill--active";
  allBtn.type = "button";
  allBtn.dataset.value = "";
  allBtn.innerHTML = `Todas <span class="pill__count">${rows.length}</span>`;
  elCatPills.appendChild(allBtn);

  sorted.forEach(([cat, n]) => {
    const btn = document.createElement("button");
    btn.className = "pill";
    btn.type = "button";
    btn.dataset.value = cat;
    btn.innerHTML = `${escapeHtml(cat)} <span class="pill__count">${n}</span>`;
    elCatPills.appendChild(btn);
  });

  elCatPills.addEventListener("click", e => {
    const t = e.target.closest(".pill");
    if (!t) return;
    activeCategory = t.dataset.value;
    elCatPills.querySelectorAll(".pill").forEach(p => p.classList.toggle("pill--active", p === t));
    apply();
  });
}

function fillSelect(selectEl, values, firstLabel) {
  selectEl.innerHTML = `<option value="">${firstLabel}</option>`;
  values.forEach(v => {
    const op = document.createElement("option");
    op.value = v; op.textContent = v;
    selectEl.appendChild(op);
  });
}

/* ---------- init ---------- */
async function init() {
  try {
    const res = await fetch(CSV_PATH, { cache: "no-store" });
    const text = await res.text();
    const data = parseCSV(text);
    if (!data.length) {
      elStatus.textContent = "Sem dados.";
      return;
    }

    rows = buildModel(data);

    elHeroCount.textContent = rows.length;

    fillCategoryPills(rows);

    const regions = Array.from(new Set(rows.flatMap(r => r.regions))).sort();
    fillSelect(elReg, regions, "Todas as regiões");

    const priceOpts = [
      { value: "barato", label: "$ Barato" },
      { value: "ok", label: "$$ Preço OK" },
      { value: "caro", label: "$$$ Caro" },
      { value: "muito-caro", label: "$$$$ Muito Caro" }
    ];
    elPrice.innerHTML = '<option value="">Qualquer preço</option>';
    priceOpts.forEach(o => {
      const op = document.createElement("option");
      op.value = o.value; op.textContent = o.label;
      elPrice.appendChild(op);
    });

    const ratingOpts = [
      { value: "perfeito", label: "Perfeito" },
      { value: "otimo", label: "Ótimo" },
      { value: "bom", label: "Bom" },
      { value: "pendente", label: "Quero ir" }
    ];
    elRating.innerHTML = '<option value="">Qualquer avaliação</option>';
    ratingOpts.forEach(o => {
      const op = document.createElement("option");
      op.value = o.value; op.textContent = o.label;
      elRating.appendChild(op);
    });

    renderFeatured(rows);

    elStatus.textContent = "";
    apply();
  } catch (err) {
    elStatus.textContent = "Erro ao carregar dados.";
    console.error(err);
  }
}

/* ---------- events ---------- */
elSearch.addEventListener("input", apply);
elReg.addEventListener("change", apply);
elPrice.addEventListener("change", apply);
elRating.addEventListener("change", apply);
elSort.addEventListener("change", apply);
elClear.addEventListener("click", () => {
  elSearch.value = "";
  elReg.value = "";
  elPrice.value = "";
  elRating.value = "";
  elSort.value = "rating-desc";
  activeCategory = "";
  elCatPills.querySelectorAll(".pill").forEach(p => p.classList.toggle("pill--active", p.dataset.value === ""));
  apply();
});

init();
