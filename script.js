const CSV_PATH = "curadoria_bsb.csv";

const elGrid = document.getElementById("grid");
const elStatus = document.getElementById("status");
const elCount = document.getElementById("count");
const elEmpty = document.getElementById("empty");

const elSearch = document.getElementById("search");
const elCat = document.getElementById("filter-category");
const elReg = document.getElementById("filter-region");
const elPrice = document.getElementById("filter-price");
const elClear = document.getElementById("clear");

let rows = [];

function norm(s) {
    return String(s || "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

// Parser CSV que lida com aspas e vírgulas dentro das aspas
function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    const headers = lines[0].split(",").map(h => h.trim());
    
    return lines.slice(1).map(line => {
        const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        const obj = {};
        headers.forEach((h, i) => {
            let val = (parts[i] || "").trim();
            obj[h] = val.replace(/^"|"$/g, ""); // Remove aspas extras
        });
        return obj;
    });
}

function render(list) {
    elGrid.innerHTML = "";
    if (list.length === 0) {
        elEmpty.classList.remove("hidden");
        elCount.textContent = "0 lugares";
        return;
    }
    elEmpty.classList.add("hidden");

    list.forEach(item => {
        const card = document.createElement("article");
        card.className = "card";
        
        // Formata link do Google Maps a partir das coordenadas
        const coords = item["Coordenadas"] ? `https://www.google.com/maps/search/?api=1&query=${item["Coordenadas"]}` : "#";

        card.innerHTML = `
            <div class="card-inner">
                <div class="card-title">
                    <h3 class="name">${item["Nome do Local"]}</h3>
                    <span class="badge badge-price">${item["Preço"]}</span>
                </div>
                
                <div class="badges">
                    <span class="badge">${item["Tipo de Comida"]}</span>
                    <span class="badge">${item["Localização"]}</span>
                </div>

                <p class="desc">${item["Recomendações de Pratos"] || "Sem recomendações de pratos disponíveis."}</p>

                <div class="location-row">
                    <span class="badge" style="border:none; padding:0">📍 ${item["Localização"]}</span>
                    <a href="${coords}" target="_blank" class="map-link">Ver no mapa</a>
                </div>
            </div>
        `;
        elGrid.appendChild(card);
    });
    elCount.textContent = `${list.length} lugares exibidos`;
}

function apply() {
    const q = norm(elSearch.value);
    const cat = elCat.value;
    const reg = elReg.value;
    const pri = elPrice.value;

    const filtered = rows.filter(r => {
        if (q && !norm(Object.values(r).join(" ")).includes(q)) return false;
        if (cat && r["Tipo de Comida"] !== cat) return false;
        if (reg && r["Localização"] !== reg) return false;
        if (pri && r["Preço"] !== pri) return false;
        return true;
    });
    render(filtered);
}

async function init() {
    try {
        const res = await fetch(CSV_PATH);
        const text = await res.text();
        rows = parseCSV(text);

        // Preencher filtros dinamicamente
        const cats = [...new Set(rows.map(r => r["Tipo de Comida"]))].filter(Boolean).sort();
        const regs = [...new Set(rows.map(r => r["Localização"]))].filter(Boolean).sort();
        const prices = [...new Set(rows.map(r => r["Preço"]))].filter(Boolean).sort();

        cats.forEach(c => elCat.innerHTML += `<option value="${c}">${c}</option>`);
        regs.forEach(r => elReg.innerHTML += `<option value="${r}">${r}</option>`);
        prices.forEach(p => elPrice.innerHTML += `<option value="${p}">${p}</option>`);

        elStatus.textContent = "Base carregada ✅";
        apply();
    } catch (err) {
        elStatus.textContent = "Erro ao carregar CSV.";
        console.error(err);
    }
}

// Eventos
[elCat, elReg, elPrice].forEach(el => el.addEventListener("change", apply));
elSearch.addEventListener("input", apply);
elClear.addEventListener("click", () => {
    elSearch.value = "";
    elCat.value = "";
    elReg.value = "";
    elPrice.value = "";
    apply();
});

init();
