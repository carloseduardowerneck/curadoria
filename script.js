/***************************************************************
 * Curadoria BSB — site estático lendo CSV
 ***************************************************************/

const CSV_PATH = "curadoria_bsb.csv";

// Elementos do DOM
const elGrid = document.getElementById("grid");
const elStatus = document.getElementById("status");
const elCount = document.getElementById("count");
const elEmpty = document.getElementById("empty");

const elSearch = document.getElementById("search");
const elCat = document.getElementById("filter-category");
const elReg = document.getElementById("filter-region");
const elSort = document.getElementById("sort");
const elClear = document.getElementById("clear");

// Dados carregados
let rows = [];
let view = [];

// ---------- util: normalização ----------
function norm(s){
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

// ---------- detectar REGIÕES como TAGS (multi-label) ----------
function detectRegions(text){
  const t = norm(text);
  const regions = [];

  if (t.includes("lago norte")) regions.push("Lago Norte");
  if (t.includes("lago sul")) regions.push("Lago Sul");
  if (t.includes("asa norte")) regions.push("Asa Norte");
  if (t.includes("asa sul")) regions.push("Asa Sul");
  if (t.includes("sudoeste")) regions.push("Sudoeste");
  if (t.includes("noroeste")) regions.push("Noroeste");
  if (t.includes("octogonal")) regions.push("Octogonal");
  if (t.includes("vicente pires") || t.includes("vicente-pires")) regions.push("Vicente Pires");
  if (t.includes("aguas claras") || t.includes("águas claras")) regions.push("Águas Claras");
  if (t.includes("guara") || t.includes("guará")) regions.push("Guará");
  if (t.includes("taguatinga")) regions.push("Taguatinga");
  if (t.includes("ceilandia") || t.includes("ceilândia")) regions.push("Ceilândia");
  if (t.includes("samambaia")) regions.push("Samambaia");
  if (t.includes("sobradinho")) regions.push("Sobradinho");
  if (t.includes("planaltina")) regions.push("Planaltina");
  if (t.includes("gama")) regions.push("Gama");
  if (t.includes("plano piloto") || t === "plano piloto") regions.push("Plano Piloto");
  if (t.includes("vila planalto")) regions.push("Vila Planalto");

  return Array.from(new Set(regions));
}

// ---------- parser CSV robusto ----------
function detectDelimiter(text){
  const firstLine = text.split(/\r?\n/).find(l => l.trim().length > 0) || "";
  const commas = (firstLine.match(/,/g) || []).length;
  const semis  = (firstLine.match(/;/g) || []).length;
  return semis > commas ? ";" : ",";
}

function splitCSVLine(line, delim){
  const out = [];
  let cur = "";
  let inQuotes = false;
  for(let i=0; i<line.length; i++){
    const ch = line[i];
    if(ch === '"'){
      if(inQuotes && line[i+1] === '"'){ cur += '"'; i++; } 
      else { inQuotes = !inQuotes; }
      continue;
    }
    if(ch === delim && !inQuotes){ out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCSV(text){
  const delim = detectDelimiter(text);
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if(lines.length === 0) return [];
  const headers = splitCSVLine(lines[0], delim).map(h => h.trim());
  const data = [];
  for(let i=1; i<lines.length; i++){
    const parts = splitCSVLine(lines[i], delim);
    const obj = {};
    for(let c=0; c<headers.length; c++){ obj[headers[c]] = (parts[c] ?? "").trim(); }
    data.push(obj);
  }
  return data;
}

// ---------- mapeamento de colunas ----------
const aliases = {
  name: ["nome", "nome do local", "local", "lugar", "estabelecimento", "title"],
  category: ["categoria", "tipo", "tipo de comida", "comida", "category"],
  region: ["bairro", "regiao", "região", "area", "localizacao", "localização"],
  desc: ["descricao", "descrição", "comentario", "dica", "recomendacoes de pratos", "recomendações de pratos"],
  maps: ["maps", "google maps", "mapa"],
  coords: ["coordenadas", "coord", "latlng", "latitude"]
};

function findColumn(headers, key){
  const hs = headers.map(h => ({ raw: h, n: norm(h) }));
  const list = aliases[key];
  if (!list) return null;
  for(const a of list){
    const target = norm(a);
    const found = hs.find(h => h.n === target || h.n.includes(target));
    if(found) return found.raw;
  }
  return null;
}

function pick(obj, col){ return col ? (obj[col] ?? "") : ""; }

function safeLink(url){
  const u = String(url || "").trim();
  if(!u) return "";
  return /^https?:\/\//i.test(u) ? u : "https://" + u;
}

function mapsFromCoords(coords){
  const c = String(coords || "").trim();
  if(!c) return "";
  const cleaned = c.replace(/;/g, ",").replace(/\s+/g, " ");
  const match = cleaned.match(/(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)/);
  if(!match) return "";
  return `https://www.google.com/maps/search/?api=1&query=${match[1]},${match[3]}`;
}

// ---------- montar modelo ----------
function buildModel(data){
  const headers = Object.keys(data[0] || {});
  const cols = {
    name: findColumn(headers, "name"),
    cat: findColumn(headers, "category"),
    reg: findColumn(headers, "region"),
    desc: findColumn(headers, "desc"),
    maps: findColumn(headers, "maps"),
    coords: findColumn(headers, "coords")
  };

  return data.map((r, idx) => {
    const name = pick(r, cols.name) || `Item ${idx+1}`;
    const category = pick(r, cols.cat);
    const regionRaw = pick(r, cols.reg);
    const regionsDetected = detectRegions(regionRaw);
    const regions = (regionsDetected.length > 0) ? regionsDetected : (regionRaw ? [regionRaw] : []);
    const desc = pick(r, cols.desc);
    const coords = pick(r, cols.coords);
    const maps = pick(r, cols.maps);
    const searchable = norm([name, category, regions.join(" "), desc].join(" "));

    return { name, category, regions, desc, maps, coords, searchable };
  });
}

// ---------- UI e Render ----------
function fillSelect(selectEl, values, firstLabel){
  selectEl.innerHTML = `<option value="">${firstLabel}</option>`;
  values.forEach(v => {
    const op = document.createElement("option");
    op.value = v; op.textContent = v;
    selectEl.appendChild(op);
  });
}

function escapeHtml(str){
  return String(str || "").replaceAll("&", "&").replaceAll("<", "<").replaceAll(">", ">");
}

function render(list){
  elGrid.innerHTML = "";
  if(list.length === 0){
    elEmpty.classList.remove("hidden");
    elCount.textContent = "";
    return;
  }
  elEmpty.classList.add("hidden");

  list.forEach(item => {
    const card = document.createElement("article");
    card.className = "card";

    // Link do mapa (prioridade para coordenadas, depois link direto)
    const mapUrl = mapsFromCoords(item.coords) || safeLink(item.maps);

    card.innerHTML = `
      <div class="card-inner">
        <div class="card-title">
          <h3 class="name">${escapeHtml(item.name)}</h3>
          ${item.category ? `<span class="badge" style="background:var(--panel-strong); color:var(--text)">${escapeHtml(item.category)}</span>` : ''}
        </div>

        <p class="desc">${escapeHtml(item.desc)}</p>

        <div class="location-row">
          ${item.regions.map(rg => `<span class="badge">${escapeHtml(rg)}</span>`).join("")}
          
          ${mapUrl ? `
            <a href="${mapUrl}" target="_blank" rel="noopener" class="map-link">
              📍 Ver no mapa
            </a>
          ` : ""}
        </div>
      </div>
    `;
    elGrid.appendChild(card);
  });

  elCount.textContent = `${list.length} lugares exibidos`;
}

// ---------- Filtros e Init ----------
function apply(){
  const q = norm(elSearch.value);
  const cat = elCat.value;
  const reg = elReg.value;

  let filtered = rows.filter(r => {
    if(q && !r.searchable.includes(q)) return false;
    if(cat && r.category !== cat) return false;
    if(reg && !r.regions.includes(reg)) return false;
    return true;
  });

  const s = elSort.value;
  filtered.sort((a,b) => s === "name-desc" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
  render(filtered);
}

async function init(){
  try {
    const res = await fetch(CSV_PATH, { cache: "no-store" });
    const text = await res.text();
    const data = parseCSV(text);
    if(data.length === 0) return;

    rows = buildModel(data);
    fillSelect(elCat, Array.from(new Set(rows.map(r => r.category))).sort(), "Categoria: todas");
    fillSelect(elReg, Array.from(new Set(rows.flatMap(r => r.regions))).sort(), "Região: todas");

    elStatus.textContent = "Base carregada ✅";
    apply();
  } catch(err) {
    elStatus.textContent = "Erro ao carregar dados.";
  }
}

elSearch.addEventListener("input", apply);
elCat.addEventListener("change", apply);
elReg.addEventListener("change", apply);
elSort.addEventListener("change", apply);
elClear.addEventListener("click", () => {
  elSearch.value = ""; elCat.value = ""; elReg.value = ""; elSort.value = "name-asc";
  apply();
});

init();
