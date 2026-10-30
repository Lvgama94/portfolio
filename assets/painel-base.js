// Base dos painéis interativos do portfólio: formatação, gráficos (ECharts), rótulos, tabelas,
// filtros e abas. Cada painel (financeiro.js, rh.js, compras.js) define `estado`, as páginas e `atualizar`.

const COR = {
  serie1: "#2a78d6", serie2: "#F18F01", negativo: "#e34948",
  texto: "#1B2631", suave: "#5B6775", grade: "#E8EDF2", eixo: "#C9D2DC", borda: "#E2E7EE",
  rampa: ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"],
};
const FONTE = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const emTabela = new Set();       // gráficos mostrados como tabela
const graficos = {};              // instâncias do ECharts
const cliques = {};               // ação de clique atual de cada gráfico
let D;                            // dados do painel, lidos do JSON

// ------------------------------------------------------------ formatação
const numero = (v, casas = 0) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const sinal = (v) => (v < 0 ? "−" : "");
const reais = (v) => `${sinal(v)}R$ ${numero(Math.abs(v))}`;
function compacto(v, prefixo = "R$ ") {
  const a = Math.abs(v);
  if (a >= 1e6) return `${sinal(v)}${prefixo}${numero(a / 1e6, 1)} mi`;
  if (a >= 1e3) return `${sinal(v)}${prefixo}${numero(a / 1e3)} mil`;
  return `${sinal(v)}${prefixo}${numero(a)}`;
}
function eixoReais(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return `${sinal(v)}${numero(a / 1e6, a % 1e6 ? 1 : 0)} mi`;
  if (a >= 1e3) return `${sinal(v)}${numero(a / 1e3)} mil`;
  return `${sinal(v)}${numero(a)}`;
}
const dias = (v) => (isFinite(v) ? `${sinal(v)}${numero(Math.abs(v), 1)}` : "—");
const pct = (v, casas = 1) => (v == null || !isFinite(v) ? "—" : `${sinal(v)}${numero(Math.abs(v) * 100, casas)}%`);
const pp = (v) => `${v >= 0 ? "+" : "−"}${numero(Math.abs(v) * 100, 1)} p.p.`;
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const nomeMes = (i) => `${MESES[Number(D.meses[i].slice(5)) - 1]}/${D.meses[i].slice(0, 4)}`;

// ------------------------------------------------------------ dados
const zeros = (n) => new Float64Array(n);
const grade = (a, b, n) => Array.from({ length: a }, () => Array.from({ length: b }, () => zeros(n)));

const mesesDoAno = (ano) => D.meses.map((m, i) => (m.startsWith(String(ano)) ? i : -1)).filter((i) => i >= 0);
const periodo = () => (estado.mes == null ? mesesDoAno(estado.ano) : [estado.mes]);
const anterior = (ms) => (ms.every((m) => m >= 12) ? ms.map((m) => m - 12) : null);

// ------------------------------------------------------------ indicadores (cartões)
/**
 * Comparação com o período anterior. tipo: "%" (variação), "pp" (pontos percentuais) ou "abs" (diferença).
 * sentido: 1 quando subir é bom, −1 quando subir é ruim (turnover, faltas), 0 quando é neutro.
 */
function delta(atual, antes, tipo, rotuloAntes, sentido = 1) {
  if (antes == null) return { texto: "primeiro ano da série" };
  // Variação % sobre base negativa ou zero não faz sentido: mostra a diferença em reais
  const emReais = tipo !== "pp" && tipo !== "abs" && antes <= 0;
  const d = tipo === "pp" || tipo === "abs" || emReais ? atual - antes : atual / antes - 1;
  if (!isFinite(d)) return { texto: "" };
  // Variação que some no arredondamento (0,0 p.p. ou 0,0%) é estabilidade, não queda nem alta
  if ((tipo === "pp" || (!emReais && tipo !== "abs")) && Math.abs(d) < 0.0005) return { texto: `= estável vs ${rotuloAntes}` };
  const seta = d > 0 ? "▲" : d < 0 ? "▼" : "=";
  const texto = tipo === "pp" ? pp(d) : tipo === "abs" ? `${d >= 0 ? "+" : "−"}${numero(Math.abs(d))}`
    : emReais ? `${d >= 0 ? "+" : ""}${compacto(d)}` : pct(d);
  const classe = sentido === 0 || d === 0 ? "" : (d > 0) === (sentido > 0) ? "bom" : "ruim";
  return { texto: `${seta} ${texto} vs ${rotuloAntes}`, classe };
}

function cartoes(id, lista) {
  const alvo = document.getElementById(id);
  alvo.dataset.colunas = lista.length;   // o CSS divide a grade por igual (6 → 3 + 3 → 2 + 2 + 2)
  alvo.replaceChildren(...lista.map((k) => {
    const el = document.createElement("div");
    el.className = "kpi";
    const rotulo = Object.assign(document.createElement("div"), { className: "kpi-rotulo", textContent: k.rotulo });
    const valor = Object.assign(document.createElement("div"), { className: "valor", textContent: k.valor });
    const nota = Object.assign(document.createElement("div"), { className: `delta ${k.classe || ""}`, textContent: k.nota || "" });
    el.append(rotulo, valor, nota);
    return el;
  }));
}

function rotuloPeriodo(ms) {
  return ms.length === 1 ? nomeMes(ms[0]) : D.meses[ms[0]].slice(0, 4);
}

// ------------------------------------------------------------ gráficos (base comum)
function opcaoBase(extra) {
  return {
    animationDuration: 300,
    textStyle: { fontFamily: FONTE, color: COR.suave },
    grid: { left: 4, right: 16, top: 14, bottom: 4, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(31,59,87,0.06)" } },
      backgroundColor: "#FFFFFF", borderColor: COR.borda, borderWidth: 1, padding: [8, 12],
      textStyle: { color: COR.texto, fontSize: 12, fontFamily: FONTE },
      extraCssText: "box-shadow:0 4px 14px rgba(31,59,87,.12);border-radius:8px;",
    },
    ...extra,
  };
}
const eixoCategoria = (dados, extra = {}) => ({
  type: "category", data: dados, axisLine: { lineStyle: { color: COR.eixo } }, axisTick: { show: false },
  axisLabel: { color: COR.suave, fontSize: 11 }, ...extra,
});
const eixoValor = (formato = eixoReais, extra = {}) => ({
  type: "value", splitLine: { lineStyle: { color: COR.grade } }, axisLabel: { color: COR.suave, fontSize: 11, formatter: formato }, ...extra,
});
// Ponta arredondada de 4 px do lado do valor, reta do lado da base
const raio = (v, deitado) => (deitado ? (v >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4]) : (v >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4]));
// Rótulo de valor curto, sem "R$": 4,2 mi · 230 mil · −15 mil
function rotuloValor(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return `${sinal(v)}${numero(a / 1e6, 1)} mi`;
  if (a >= 1e3) return `${sinal(v)}${numero(a / 1e3)} mil`;
  return `${sinal(v)}${numero(a)}`;
}
/**
 * Como rotular as colunas: deitado quando cabe; em pé quando a coluna é estreita;
 * com duas séries e barras finas demais para dois rótulos em pé, só a primeira série leva rótulo.
 */
function modoRotulos(chave, categorias, series = 1) {
  const largura = (document.getElementById(`g-${chave}`).clientWidth || 480) - 60;   // menos o eixo de valores
  const coluna = largura / categorias;
  const barra = Math.min(24, coluna * 0.8 / (series + 0.1 * (series - 1)));
  // Um rótulo em pé ocupa ~14 px: abaixo de 22 px por coluna eles se encostam.
  // poucos: nem um rótulo por coluna cabe (24 meses em tela estreita), então rotula uma coluna a cada `passo`
  const poucos = coluna < 22;
  return { girar: coluna / series < 46, todas: series === 1 || barra >= 22, poucos, passo: poucos ? Math.ceil(22 / coluna) : 1, coluna };
}
/** Colunas rotuladas quando não cabe um rótulo em cada uma: uma a cada `passo`, sempre incluindo a última. */
function aCada(quantidade, passo) {
  const indices = new Set();
  for (let i = quantidade - 1; i >= 0; i -= passo) indices.add(i);   // conta a partir da última: o mês mais recente sempre tem rótulo
  return indices;
}
const rotuloColuna = (v, girar, apagado, formato = rotuloValor) => ({
  show: true, distance: 4, color: COR.texto, fontSize: 10, opacity: apagado ? 0.45 : 1,
  position: v >= 0 ? "top" : "bottom", rotate: girar ? 90 : 0,
  align: girar ? (v >= 0 ? "left" : "right") : "center", verticalAlign: "middle",
  formatter: () => formato(v),
});
const barras = (valores, cor, { destaque = null, deitado = false, girar = null, formato, apenas = null } = {}) => valores.map((v, i) => {
  const apagado = destaque != null && destaque !== i;
  const rotulado = girar != null && (apenas == null || apenas.has(i));
  return {
    value: v,
    itemStyle: { color: typeof cor === "function" ? cor(v, i) : cor, borderRadius: raio(v, deitado), opacity: apagado ? 0.35 : 1 },
    ...(rotulado ? { label: rotuloColuna(v, girar, apagado, formato) } : {}),
  };
});
/** Margens para os rótulos de valor não saírem do gráfico nem encostarem nos meses. */
function espacoRotulos(girar, valores) {
  const negativo = valores.some((v) => v < 0);
  return {
    grid: { left: 4, right: 16, top: girar ? 52 : 24, bottom: 4, containLabel: true },
    margem: negativo ? [girar ? "45%" : "15%", "0%"] : ["0%", "0%"],
  };
}
const corSinal = (v) => (v >= 0 ? COR.serie1 : COR.negativo);

/**
 * Colunas por mês (uma ou duas séries), com rótulo de valor e destaque do mês escolhido.
 * series: [{ nome, valores, cor }]; dicas(i) devolve as linhas do tooltip do mês i.
 */
function colunasMensais(chave, { meses, series, dicas, formato = rotuloValor, eixo = eixoReais, clicavel = true }) {
  const destaque = estado.mes == null ? null : meses.indexOf(estado.mes);
  const modo = modoRotulos(chave, meses.length, series.length);
  const espaco = espacoRotulos(modo.girar, series.flatMap((s) => s.valores));
  const variosAnos = new Set(meses.map((m) => D.meses[m].slice(0, 4))).size > 1;   // "jan/24" quando o eixo passa de um ano
  return opcaoBase({
    grid: espaco.grid,
    xAxis: eixoCategoria(meses.map((m) => `${MESES[Number(D.meses[m].slice(5)) - 1]}${variosAnos ? `/${D.meses[m].slice(2, 4)}` : ""}`)),
    // Com dois anos no eixo, "jan/24" encostaria no 0 do eixo de valores: o 0 sai (cada coluna já leva o próprio valor)
    yAxis: eixoValor(eixo, { boundaryGap: espaco.margem, axisLabel: { color: COR.suave, fontSize: 11, formatter: eixo, showMinLabel: !variosAnos } }),
    tooltip: { ...opcaoBase().tooltip, formatter: (ps) => dica(nomeMes(meses[ps[0].dataIndex]), dicas(ps[0].dataIndex)) },
    series: series.map((s, i) => ({
      name: s.nome, type: "bar", barMaxWidth: 24, barGap: "10%", cursor: clicavel ? "pointer" : "default",
      data: barras(s.valores, s.cor, { destaque, formato, girar: i === 0 || (modo.todas && !modo.poucos) ? modo.girar : null,
                                       apenas: modo.poucos ? aCada(s.valores.length, modo.passo) : null }),
    })),
  });
}

/** Barras deitadas com o valor na ponta (ranking por setor, categoria, motivo...). */
function barrasDeitadas({ nomes, valores, dicas, formato = rotuloValor, cor = COR.serie1, destaque = null, clicavel = false }) {
  return opcaoBase({
    grid: { left: 4, right: 58, top: 6, bottom: 4, containLabel: true },
    yAxis: eixoCategoria(nomes, { inverse: true }),
    xAxis: eixoValor(formato, { axisLabel: { show: false } }),     // cada barra já leva o próprio valor
    tooltip: { ...opcaoBase().tooltip, formatter: ([p]) => dica(nomes[p.dataIndex], dicas(p.dataIndex)) },
    series: [{
      type: "bar", barMaxWidth: 18, cursor: clicavel ? "pointer" : "default",
      data: barras(valores, cor, { deitado: true, destaque }).map((d, i) => ({
        ...d, label: { show: true, position: "right", color: COR.texto, fontSize: 11, opacity: d.itemStyle.opacity < 1 ? 0.45 : 1, formatter: () => formato(valores[i]) },
      })),
    }],
  });
}

function dica(titulo, linhas) {
  return `<div class="dica-titulo">${esc(titulo)}</div>` + linhas.map((l) =>
    `<div class="dica-linha">${l.cor ? `<i class="dica-chave" style="background:${l.cor}"></i>` : ""}<strong>${esc(l.valor)}</strong><span>${esc(l.nome)}</span></div>`).join("");
}

/** Desenha um gráfico, ou a tabela equivalente quando o leitor pediu a tabela. */
function desenhar(chave, def) {
  const el = document.getElementById(`g-${chave}`);
  cliques[chave] = def.aoClicar;
  if (def.vazio || emTabela.has(chave)) {
    if (graficos[chave]) { graficos[chave].dispose(); delete graficos[chave]; }
    el.classList.toggle("vazio", Boolean(def.vazio));
    el.replaceChildren(def.vazio ? document.createTextNode(def.vazio) : tabelaDados(def.tabela));
    el.style.height = def.vazio ? "" : "auto";
    return;
  }
  el.classList.remove("vazio");
  el.style.height = "";
  if (!graficos[chave]) {
    el.replaceChildren();
    graficos[chave] = echarts.init(el, null, { renderer: "svg" });
    graficos[chave].on("click", (p) => cliques[chave]?.(p));
    // O gráfico acompanha o tamanho do cartão (aba que reaparece, tela que muda, painel lateral que abre)
    new ResizeObserver(() => { if (graficos[chave] && el.offsetParent) graficos[chave].resize(); }).observe(el);
  }
  graficos[chave].setOption(def.opcao, true);
}

const redimensionar = () => Object.values(graficos).forEach((g) => { if (g.getDom().offsetParent) g.resize(); });

function tabelaDados({ colunas, linhas }) {
  const t = document.createElement("table");
  t.className = "tabela-dados";
  const cab = t.createTHead().insertRow();
  colunas.forEach((c) => cab.appendChild(Object.assign(document.createElement("th"), { textContent: c })));
  const corpo = t.createTBody();
  linhas.forEach((l) => { const tr = corpo.insertRow(); l.forEach((v) => (tr.insertCell().textContent = v)); });
  return t;
}

// ------------------------------------------------------------ interação
function alternarMes(m) { estado.mes = estado.mes === m ? null : m; atualizar(); }

function botoesFiltro(id, rotulo, opcoes, atual, aoEscolher, desativado = false) {
  const alvo = document.getElementById(id);
  const titulo = Object.assign(document.createElement("span"), { className: "rotulo-filtro", textContent: rotulo });
  alvo.replaceChildren(titulo, ...opcoes.map(([valor, texto]) => {
    const b = Object.assign(document.createElement("button"), { type: "button", textContent: texto, disabled: desativado });
    b.setAttribute("aria-pressed", String(valor === atual));
    b.addEventListener("click", () => aoEscolher(valor));
    return b;
  }));
}

/** Filtro com muitas opções (setor, categoria, fornecedor): lista suspensa em vez de botões. */
function listaFiltro(id, rotulo, opcoes, atual, aoEscolher) {
  const alvo = document.getElementById(id);
  const titulo = Object.assign(document.createElement("label"), { className: "rotulo-filtro", textContent: rotulo });
  const lista = document.createElement("select");
  lista.id = `${id}-lista`;
  titulo.htmlFor = lista.id;
  opcoes.forEach(([valor, texto]) => lista.appendChild(Object.assign(document.createElement("option"), { value: String(valor), textContent: texto })));
  lista.value = String(atual);
  lista.addEventListener("change", () => aoEscolher(opcoes.find(([v]) => String(v) === lista.value)[0]));
  alvo.replaceChildren(titulo, lista);
}

/** Mostra a aba ativa, o botão que limpa a seleção feita por clique e o texto dos botões de tabela. */
function mostrarPagina(selecao) {
  const chip = document.getElementById("chip-selecao");
  chip.hidden = selecao == null;
  chip.textContent = selecao == null ? "" : `${selecao}  ×`;
  chip.setAttribute("aria-label", selecao == null ? "" : `Limpar filtro ${selecao}`);
  document.querySelectorAll(".abas button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.aba === estado.aba)));
  document.querySelectorAll(".aba").forEach((s) => (s.hidden = s.id !== `aba-${estado.aba}`));
  document.querySelectorAll(".ver-tabela").forEach((b) => (b.textContent = emTabela.has(b.dataset.grafico) ? "Gráfico" : "Tabela"));
  PAGINAS[estado.aba]();
  redimensionar();
}

/** Carrega o JSON do painel e liga abas, botões de tabela, o botão de limpar seleção e o redimensionamento. */
async function iniciarPainel({ arquivo, aoCarregar, limparSelecao }) {
  try {
    D = await (await fetch(arquivo)).json();
  } catch {
    document.getElementById("carregando").textContent = "Não foi possível carregar os dados do painel.";
    return;
  }
  aoCarregar?.();
  document.getElementById("carregando").remove();
  // O endereço pode abrir uma aba direto (comercial.html#clientes), e a aba escolhida fica no endereço
  if (PAGINAS[location.hash.slice(1)]) estado.aba = location.hash.slice(1);
  document.querySelectorAll(".abas button").forEach((b) => b.addEventListener("click", () => {
    estado.aba = b.dataset.aba;
    history.replaceState(null, "", `#${estado.aba}`);
    atualizar();
  }));
  document.querySelectorAll(".ver-tabela").forEach((b) => b.addEventListener("click", () => {
    const g = b.dataset.grafico;
    if (emTabela.has(g)) emTabela.delete(g); else emTabela.add(g);
    atualizar();
  }));
  document.getElementById("chip-selecao").addEventListener("click", () => { limparSelecao(); atualizar(); });
  // Ao mudar o tamanho da tela, redesenha: os rótulos podem precisar girar ou voltar a deitar
  let espera;
  window.addEventListener("resize", () => { redimensionar(); clearTimeout(espera); espera = setTimeout(atualizar, 200); });
  atualizar();
}
