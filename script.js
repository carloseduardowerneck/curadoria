/***************************************************************
 * Curadoria BSB — site estático lendo CSV
 *
 * Estrutura esperada (como você está usando):
 *   - index.html, style.css, script.js, curadoria_bsb.csv
 *   - pasta img/ com a foto do topo
 *
 * Melhorias nesta versão:
 *  - Região/Bairro virou MULTI-REGIÃO (tags):
 *    Ex.: "Asa Norte, Asa Sul" => ["Asa Norte","Asa Sul"]
 *    Então o lugar aparece ao filtrar Asa Norte OU Asa Sul.
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

  // Lago(s) primeiro
  if (t.includes("lago norte")) regions.push("Lago Norte");
  if (t.includes("lago sul")) regions.push("Lago Sul");

  // Asas
  if (t.includes("asa norte")) regions.push("Asa Norte");
  if (t.includes("asa sul")) regions.push("Asa Sul");

  // Bairros/áreas comuns
  if (t.includes("sudoeste")) regions.push("Sudoeste");
  if (t.includes("noroeste")) regions.push("Noroeste");
  if (t.includes("octogonal")) regions.push("Octogonal");
  if (t.includes("vicente pires") || t.includes("vicente-pires")) regions.push("Vicente Pires");

  // Cidades satélites (adicione as suas preferidas aqui)
  if (t.includes("aguas claras") || t.includes("águas claras")) regions.push("Águas Claras");
  if (t.includes("guara") || t.includes("guará")) regions.push("Guará");
  if (t.includes("taguatinga")) regions.push("Taguatinga");
  if (t.includes("ceilandia") || t.includes("ceilândia")) regions.push("Ceilândia");
  if (t.includes("samambaia")) regions.push("Samambaia");
  if (t.includes("sobradinho")) regions.push("Sobradinho");
  if (t.includes("planaltina")) regions.push("Planaltina");
  if (t.includes("gama")) regions.push("Gama");

  // Plano Piloto genérico
  if (t.includes("plano piloto") || t === "plano piloto") regions.push("Plano Piloto");

  // remove duplicadas
  return Array.from(new Set(regions));
}

// ---------- parser CSV robusto (suporta vírgula ou ponto-e-vírgula; suporta aspas) ----------
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
      if(inQuotes && line[i+1] === '"'){
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if(ch === delim && !inQuotes){
      out.push(cur);
      cur = "";
      continue;
    }

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
    for(let c=0; c<headers.length; c++){
      obj[headers[c]] = (parts[c] ?? "").trim();
    }
    data.push(obj);
  }
  return data;
}

// ---------- mapeamento de colunas por aliases ----------
const aliases = {
  name: ["nome", "nome do local", "local", "lugar", "estabelecimento", "title", "titulo", "título"],
  category: ["categoria", "tipo", "tipo de comida", "comida", "category"],
  region: ["bairro", "regiao", "região", "area", "área", "neighborhood", "localizacao", "localização", "regiao/bairro", "região/bairro"],
  desc: [
    "descricao", "descrição", "comentario", "comentário", "notas",
    "observacao", "observação", "observacoes", "observações",
    "review", "dica", "comentarios", "recomendacoes de pratos", "recomendações de pratos"
  ],
  maps: ["maps", "google maps", "link maps", "mapa", "endereco", "endereço", "local no maps"],
  insta: ["instagram", "insta", "ig"],
  site: ["site", "url", "link", "website"],
  coords: ["coordenadas", "coord", "latlng", "lat long", "latitude", "longitude"]
};

function findColumn(headers, key){
  const hs = headers.map(h => ({ raw: h, n: norm(h) }));

  // proteção: não quebra se a chave não existir
  const list = aliases[key];
  if (!list || !Array.isArray(list)) return null;

  for(const a of list){
    const target = norm(a);
    const found = hs.find(h => h.n === target);
    if(found) return found.raw;
  }

  for(const a of list){
    const target = norm(a);
    const found = hs.find(h => h.n.includes(target));
    if(found) return found.raw;
  }

  return null;
}

function pick(obj, col){
  if(!col) return "";
  return obj[col] ?? "";
}

// ---------- links ----------
function safeLink(url){
  const u = String(url || "").trim();
  if(!u) return "";
  if(/^https?:\/\//i.test(u)) return u;
  return "https://" + u;
}

function mapsFromCoords(coords){
  const c = String(coords || "").trim();
  if(!c) return "";

  // aceita "-15.78, -47.87" ou "-15.78 -47.87"
  const cleaned = c.replace(/;/g, ",").replace(/\s+/g, " ");
  const match = cleaned.match(/(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)/);
  if(!match) return "";

  const lat = match[1];
  const lon = match[3];
  return `https://www.google.com/maps?q=${lat},${lon}`;
}

// ---------- montar “modelo” interno ----------
function buildModel(data){
  const headers = Object.keys(data[0] || {});
  const colName   = findColumn(headers, "name");
  const colCat    = findColumn(headers, "category");
  const colReg    = findColumn(headers, "region");
  const colDesc   = findColumn(headers, "desc");
  const colMaps   = findColumn(headers, "maps");
  const colInsta  = findColumn(headers, "insta");
  const colSite   = findColumn(headers, "site");
  const colCoords = findColumn(headers, "coords");

  // debug opcional
  elStatus.textContent =
    `Detectado → nome: ${colName || "N/D"} | categoria: ${colCat || "N/D"} | região: ${colReg || "N/D"} | descrição: ${colDesc || "N/D"} | coords: ${colCoords || "N/D"}`;

  return data.map((r, idx) => {
    const name = pick(r, colName) || `Item ${idx+1}`;
    const category = pick(r, colCat);

    const regionRaw = pick(r, colReg);
    const regionsDetected = detectRegions(regionRaw);

    // fallback: se não detectar nada mas houver texto, usa o texto como “tag”
    const regions = (regionsDetected.length > 0)
      ? regionsDetected
      : (regionRaw.trim().length > 0 ? [regionRaw.trim()] : []);

    const desc = pick(r, colDesc);
    const coords = pick(r, colCoords);

    const maps = pick(r, colMaps);
    const insta = pick(r, colInsta);
    let site = pick(r, colSite);

    // fallback para coluna "Link" genérica, se existir
    if(!site){
      const linkCol = headers.find(h => norm(h) === "link");
      if(linkCol) site = r[linkCol] || "";
    }

    // texto de busca (inclui também as tags de região)
    const searchable = norm([name, category, regions.join(" "), desc].join(" "));

    return { name, category, regions, desc, maps, insta, site, coords, searchable };
  });
}

// ---------- UI: filtros ----------
function uniqueSorted(arr){
  return Array.from(new Set(arr.filter(x => String(x).trim().length>0)))
    .sort((a,b) => a.localeCompare(b, "pt-BR"));
}

function fillSelect(selectEl, values, firstLabel){
  selectEl.innerHTML = "";
  const op0 = document.createElement("option");
  op0.value = "";
  op0.textContent = firstLabel;
  selectEl.appendChild(op0);

  values.forEach(v => {
    const op = document.createElement("option");
    op.value = v;
    op.textContent = v;
    selectEl.appendChild(op);
  });
}

// ---------- render ----------
function escapeHtml(str){
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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

    const badges = [];
    if(item.category) badges.push(`<span class="badge">${escapeHtml(item.category)}</span>`);

    // mostra até 2 regiões, e se tiver mais mostra +N
    if (item.regions && item.regions.length) {
      item.regions.slice(0, 2).forEach(rg => badges.push(`<span class="badge">${escapeHtml(rg)}</span>`));
      if (item.regions.length > 2) badges.push(`<span class="badge">+${item.regions.length - 2}</span>`);
    }

    const desc = item.desc ? item.desc : "";

    // links
    const links = [];
    const maps = safeLink(item.maps);
    const insta = safeLink(item.insta);
    const site = safeLink(item.site);

    if(maps) links.push(`<a class="link" href="${maps}" target="_blank" rel="noopener">📍 Maps</a>`);
    if(insta) links.push(`<a class="link" href="${insta}" target="_blank" rel="noopener">📸 Instagram</a>`);
    if(!maps && site) links.push(`<a class="link" href="${site}" target="_blank" rel="noopener">🔗 Site</a>`);

    const mapsByCoords = mapsFromCoords(item.coords);

    card.innerHTML = `
      <div class="card-inner">
        <div class="card-title">
          <h3 class="name">${escapeHtml(item.name)}</h3>
          <div class="badges">${badges.join("")}</div>
        </div>

        <p class="desc">${escapeHtml(desc)}</p>

        ${mapsByCoords ? `
          <div class="links" style="padding: 0 14px 14px;">
            <a class="link" href="${mapsByCoords}" target="_blank" rel="noopener">📍 Ver no mapa</a>
          </div>
        ` : (links.length ? `
          <div class="links" style="padding: 0 14px 14px;">
            ${links.join("")}
          </div>
        ` : ``)}
      </div>
    `;

    elGrid.appendChild(card);
  });

  elCount.textContent = `${list.length} lugares exibidos`;
}

// ---------- aplicar filtros ----------
function apply(){
  const q = norm(elSearch.value);
  const cat = elCat.value;
  const reg = elReg.value;

  let filtered = rows.filter(r => {
    if(q && !r.searchable.includes(q)) return false;
    if(cat && r.category !== cat) return false;

    // MULTI-REGIÃO: aparece se a lista contiver a tag selecionada
    if(reg && !(r.regions || []).includes(reg)) return false;

    return true;
  });

  const s = elSort.value;
  filtered.sort((a,b) => {
    if(s === "name-desc") return b.name.localeCompare(a.name, "pt-BR");
    return a.name.localeCompare(b.name, "pt-BR");
  });

  view = filtered;
  render(view);
}

function clearAll(){
  elSearch.value = "";
  elCat.value = "";
  elReg.value = "";
  elSort.value = "name-asc";
  apply();
}

// ---------- carregar dados ----------
async function init(){
  try{
    const res = await fetch(CSV_PATH, { cache: "no-store" });
    if(!res.ok) throw new Error(`Não consegui abrir ${CSV_PATH} (status ${res.status}).`);

    const text = await res.text();
    const data = parseCSV(text);

    if(data.length === 0){
      elStatus.textContent = "CSV carregou, mas não encontrei linhas de dados. Confira o arquivo.";
      return;
    }

    rows = buildModel(data);

    // categorias
    fillSelect(elCat, uniqueSorted(rows.map(r => r.category)), "Categoria: todas");

    // regiões (flatten das tags)
    fillSelect(
      elReg,
      uniqueSorted(rows.flatMap(r => r.regions || [])),
      "Região/Bairro: todos"
    );

    elStatus.textContent = "Base carregada ✅";
    apply();

  }catch(err){
    console.error(err);
    elStatus.textContent = "Erro ao carregar o CSV. Veja o console (F12) para detalhes.";
  }
}

// eventos
elSearch.addEventListener("input", apply);
elCat.addEventListener("change", apply);
elReg.addEventListener("change", apply);
elSort.addEventListener("change", apply);
elClear.addEventListener("click", clearAll);

init();
