/***************************************************************
 * Curadoria BSB — site estático lendo CSV
 * Versão com:
 *  - multi-região
 *  - filtro e badge de preço
 *  - filtro de preço ORDENADO (Barato → Muito Caro)
 ***************************************************************/

const CSV_PATH = "curadoria_bsb.csv";

/* ============================
   ELEMENTOS DO DOM
============================ */
const elGrid = document.getElementById("grid");
const elStatus = document.getElementById("status");
const elCount = document.getElementById("count");
const elEmpty = document.getElementById("empty");

const elSearch = document.getElementById("search");
const elCat = document.getElementById("filter-category");
const elReg = document.getElementById("filter-region");
const elPrice = document.getElementById("filter-price");
const elSort = document.getElementById("sort");
const elClear = document.getElementById("clear");

/* ============================
   DADOS
============================ */
let rows = [];
let view = [];

/* ============================
   UTILIDADES
============================ */
function norm(s){
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/* ============================
   ORDEM DE PREÇO
============================ */
const PRICE_ORDER = {
  "Barato": 1,
  "Preço Ok": 2,
  "Caro": 3,
  "Muito Caro": 4
};

function priceRank(p){
  return PRICE_ORDER[p] ?? 999;
}

/* ============================
   REGIÕES (MULTI-TAG)
============================ */
function detectRegions(text){
  const t = norm(text);
  const regions = [];

  if (t.includes("lago norte")) regions.push("Lago Norte");
  if (t.includes("lago sul")) regions.push("Lago Sul");

  if (t.includes("asa norte")) regions.push("Asa Norte");
  if (t.includes("asa sul")) regions.push("Asa Sul");

  if (t.includes("sudoeste")) regions.push("Sudoeste");
  if (t.includes("noroeste")) regions.push("Noroeste");
  if (t.includes("vila planalto")) regions.push("Vila Planalto");

  if (t.includes("aguas claras") || t.includes("águas claras")) regions.push("Águas Claras");
  if (t.includes("guara") || t.includes("guará")) regions.push("Guará");
  if (t.includes("taguatinga")) regions.push("Taguatinga");
  if (t.includes("ceilandia") || t.includes("ceilândia")) regions.push("Ceilândia");

  return Array.from(new Set(regions));
}

/* ============================
   CSV PARSER
============================ */
function detectDelimiter(text){
  const first = text.split(/\r?\n/).find(l => l.trim());
  const c = (first.match(/,/g) || []).length;
  const s = (first.match(/;/g) || []).length;
  return s > c ? ";" : ",";
}

function splitCSVLine(line, d){
  const out = [];
  let cur = "", q = false;

  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(ch === '"'){
      if(q && line[i+1] === '"'){ cur += '"'; i++; }
      else q = !q;
      continue;
    }
    if(ch === d && !q){ out.push(cur); cur=""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCSV(text){
  const d = detectDelimiter(text);
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const headers = splitCSVLine(lines[0], d);
  return lines.slice(1).map(l => {
    const parts = splitCSVLine(l, d);
    const o = {};
    headers.forEach((h,i)=>o[h]=parts[i]||"");
    return o;
  });
}

/* ============================
   ALIASES
============================ */
const aliases = {
  name: ["nome","nome do local","local"],
  category: ["categoria","tipo"],
  price: ["preco","preço"],
  region: ["bairro","localização","localizacao"],
  desc: ["recomendacoes de pratos","descrição","descricao"],
  coords: ["coordenadas"]
};

function findColumn(headers,key){
  const hs = headers.map(h=>({raw:h,n:norm(h)}));
  const list = aliases[key] || [];
  for(const a of list){
    const f = hs.find(h=>h.n===norm(a));
    if(f) return f.raw;
  }
  for(const a of list){
    const f = hs.find(h=>h.n.includes(norm(a)));
    if(f) return f.raw;
  }
  return null;
}

function pick(o,c){ return c ? o[c] ?? "" : ""; }

/* ============================
   MODEL
============================ */
function buildModel(data){
  const h = Object.keys(data[0]||{});
  const cName = findColumn(h,"name");
  const cCat  = findColumn(h,"category");
  const cPri  = findColumn(h,"price");
  const cReg  = findColumn(h,"region");
  const cDes  = findColumn(h,"desc");
  const cCoo  = findColumn(h,"coords");

  return data.map((r,i)=>{
    const price = pick(r,cPri);
    const regions = detectRegions(pick(r,cReg));
    return {
      name: pick(r,cName)||`Item ${i+1}`,
      category: pick(r,cCat),
      price,
      regions,
      desc: pick(r,cDes),
      coords: pick(r,cCoo),
      searchable: norm([
        pick(r,cName),
        pick(r,cCat),
        price,
        regions.join(" "),
        pick(r,cDes)
      ].join(" "))
    };
  });
}

/* ============================
   UI
============================ */
function uniqueSorted(arr){
  return Array.from(new Set(arr.filter(Boolean)));
}

function fillSelect(select, values, label){
  select.innerHTML="";
  select.append(new Option(label,""));
  values.forEach(v=>select.append(new Option(v,v)));
}

/* ============================
   RENDER
============================ */
function render(list){
  elGrid.innerHTML="";
  if(!list.length){
    elEmpty.classList.remove("hidden");
    elCount.textContent="";
    return;
  }
  elEmpty.classList.add("hidden");

  list.forEach(it=>{
    const card = document.createElement("article");
    card.className="card";
    const badges = [
      it.category && `<span class="badge">${it.category}</span>`,
      it.price && `<span class="badge">${it.price}</span>`,
      ...it.regions.map(r=>`<span class="badge">${r}</span>`)
    ].filter(Boolean).join("");

  const cardHTML = `
  <div class="card">
    <div class="card-inner">
      <div class="card-title">
        <span class="name">${item.name}</span>
        <span class="badge" style="background: var(--panel-strong)">${item.category}</span>
      </div>
      
      <p class="desc">${item.desc || ""}</p>

      <div class="location-row">
        ${item.regions.map(r => `<span class="badge">${r}</span>`).join('')}
        
        <a href="https://www.google.com/maps/search/?api=1&query=${item.coords}" 
           target="_blank" 
           class="map-link">
           📍 Ver no mapa
        </a>
      </div>
    </div>
  </div>
`;

  elCount.textContent = `${list.length} lugares exibidos`;
}

/* ============================
   FILTRO
============================ */
function apply(){
  const q = norm(elSearch.value);
  const c = elCat.value;
  const r = elReg.value;
  const p = elPrice.value;

  view = rows.filter(x=>{
    if(q && !x.searchable.includes(q)) return false;
    if(c && x.category!==c) return false;
    if(p && x.price!==p) return false;
    if(r && !x.regions.includes(r)) return false;
    return true;
  });

  render(view);
}

/* ============================
   INIT
============================ */
async function init(){
  const res = await fetch(CSV_PATH,{cache:"no-store"});
  const text = await res.text();
  rows = buildModel(parseCSV(text));

  fillSelect(elCat, uniqueSorted(rows.map(r=>r.category)), "Categoria: todas");

  fillSelect(
    elReg,
    uniqueSorted(rows.flatMap(r=>r.regions)),
    "Região: todas"
  );

  // 🔥 AQUI está a mágica: preço ORDENADO
  const prices = uniqueSorted(rows.map(r=>r.price))
    .sort((a,b)=>priceRank(a)-priceRank(b));

  fillSelect(elPrice, prices, "Preço: todos");

  apply();
}

/* ============================
   EVENTOS
============================ */
elSearch.addEventListener("input", apply);
elCat.addEventListener("change", apply);
elReg.addEventListener("change", apply);
elPrice.addEventListener("change", apply);
elClear.addEventListener("click", ()=>{
  elSearch.value="";
  elCat.value="";
  elReg.value="";
  elPrice.value="";
  apply();
});

init();

