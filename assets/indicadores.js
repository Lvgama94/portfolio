/* Catálogo de indicadores: lista, busca e filtros sobre assets/data/indicadores.json. */
"use strict";

let C = null;
const filtro = { texto: "", painel: null, soConferidos: false };

const escapar = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const semAcento = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// O % entra na âncora: "Desvio" e "Desvio %" são indicadores diferentes
const ancora = (painel, nome) => "i-" + semAcento(`${painel} ${nome}`).replace(/%/g, " pct ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ------------------------------------------------------------ realce de DAX
// Comentário, texto, coluna ('Tabela'[Coluna] ou Tabela[Coluna]), medida ([Medida]), número e palavra
const TOKEN = /(\/\/[^\n]*|--[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"]|"")*")|((?:'(?:[^']|'')+'|[A-Za-zÀ-ÿ_][\wÀ-ÿ]*)\[[^\]]+\])|(\[[^\]]+\])|(\b\d+(?:\.\d+)?\b)|([A-Za-zÀ-ÿ_][\wÀ-ÿ]*)/g;
const PALAVRAS = new Set(["VAR", "RETURN", "TRUE", "FALSE", "NOT", "IN"]);

function realcarDax(formula, painel, medidas) {
  let html = "";
  let ultimo = 0;
  for (const m of formula.matchAll(TOKEN)) {
    html += escapar(formula.slice(ultimo, m.index));
    const [texto, comentario, cadeia, coluna, medida, numero, palavra] = m;
    const depois = formula.slice(m.index + texto.length);
    if (comentario) html += `<span class="c">${escapar(texto)}</span>`;
    else if (cadeia) html += `<span class="s">${escapar(texto)}</span>`;
    else if (coluna) html += `<span class="col">${escapar(texto)}</span>`;
    else if (medida) {
      // Medida do mesmo modelo vira link para o verbete dela
      const nome = medida.slice(1, -1);
      html += medidas.has(nome)
        ? `<a class="med" href="#${ancora(painel, nome)}">${escapar(texto)}</a>`
        : `<span class="med">${escapar(texto)}</span>`;
    } else if (numero) html += `<span class="n">${texto}</span>`;
    else if (PALAVRAS.has(palavra)) html += `<span class="k">${texto}</span>`;
    else if (/^\s*\(/.test(depois)) html += `<span class="f">${escapar(texto)}</span>`;
    else html += escapar(texto);
    ultimo = m.index + texto.length;
  }
  return html + escapar(formula.slice(ultimo));
}

// ------------------------------------------------------------ montagem
function unidade(formato) {
  if (formato.includes("R$")) return "R$";
  if (formato.includes("%")) return "%";
  if (formato.includes("dd")) return "data";
  return "número";
}

function listaLinks(nomes, painel) {
  return nomes.map((n) => `<a href="#${ancora(painel, n)}">${escapar(n)}</a>`).join(", ");
}

function verbete(ind, medidas) {
  const conferido = ind.conferido["2025"] || ind.conferido["posição"];
  const rotuloValor = ind.conferido["2025"] ? "2025" : "Em 31/12/2025";
  const valor = conferido
    ? `<span class="valor-conferido" title="Valor da medida no Power BI igual ao da view de conferência do SQL">${rotuloValor}: <strong>${conferido.texto}</strong> <span class="selo">conferido com o SQL</span></span>`
    : "";
  const fonte = ind.fontes.length
    ? ind.fontes.map((f) => `<code>${escapar(f.sql || f.tabela)}</code>`).join(" ")
    : "constante, sem tabela";
  const linhas = [`<span class="rotulo-meta">Fonte</span> ${fonte}`];
  if (ind.usa.length) linhas.push(`<span class="rotulo-meta">Usa</span> ${listaLinks(ind.usa, ind.painel)}`);
  if (ind.usado_por.length) linhas.push(`<span class="rotulo-meta">Usado por</span> ${listaLinks(ind.usado_por, ind.painel)}`);
  return `<article class="indicador" id="${ancora(ind.painel, ind.nome)}">
    <header>
      <h4>${escapar(ind.nome)}</h4>
      <span class="unidade">${unidade(ind.formato)}</span>
      ${valor}
    </header>
    <p class="definicao">${escapar(ind.descricao)}</p>
    <ul class="meta">${linhas.map((l) => `<li>${l}</li>`).join("")}</ul>
    <details>
      <summary>Fórmula DAX</summary>
      <pre class="codigo"><code>${realcarDax(ind.formula, ind.painel, medidas[ind.painel])}</code></pre>
    </details>
  </article>`;
}

function passa(ind) {
  if (filtro.painel && ind.painel !== filtro.painel) return false;
  if (filtro.soConferidos && !Object.keys(ind.conferido).length) return false;
  if (!filtro.texto) return true;
  const alvo = semAcento([ind.nome, ind.descricao, ind.formula, ind.pasta, ...ind.fontes.map((f) => `${f.tabela} ${f.sql}`)].join(" "));
  return semAcento(filtro.texto).split(/\s+/).every((p) => alvo.includes(p));
}

function desenhar() {
  const medidas = {};
  for (const ind of C.indicadores) (medidas[ind.painel] ??= new Set()).add(ind.nome);
  const visiveis = C.indicadores.filter(passa);
  const conferidos = visiveis.filter((i) => Object.keys(i.conferido).length).length;
  document.getElementById("contagem").textContent =
    `${visiveis.length} de ${C.indicadores.length} indicadores · ${conferidos} conferidos com o SQL`;

  let html = "";
  for (const p of C.paineis) {
    const doPainel = visiveis.filter((i) => i.painel === p.nome);
    if (!doPainel.length) continue;
    html += `<section class="painel-catalogo"><header><h2>${p.nome}</h2>
      <a href="${p.pagina}">Abrir o painel</a></header>`;
    for (const pasta of [...new Set(doPainel.map((i) => i.pasta))].sort()) {
      html += `<h3>${escapar(pasta.replace(/^\d+\.\s*/, ""))}</h3>`;
      html += doPainel.filter((i) => i.pasta === pasta).map((i) => verbete(i, medidas)).join("");
    }
    html += "</section>";
  }
  document.getElementById("catalogo").innerHTML = html || '<p class="aviso-carregando">Nenhum indicador com esse filtro.</p>';
  document.querySelectorAll("#filtro-painel button").forEach((b) =>
    b.setAttribute("aria-pressed", String((b.dataset.painel || null) === filtro.painel)));
}

function homonimos() {
  if (!C.homonimos.length) return;
  const alvo = document.getElementById("homonimos");
  alvo.hidden = false;
  alvo.innerHTML = `<h2>Nomes repetidos entre modelos</h2>
    <p>O gerador compara os quatro modelos e aponta o mesmo nome com fórmulas diferentes. Nesses casos, a definição precisa deixar claro qual é qual:</p>
    <ul>${C.homonimos.map((h) => `<li><strong>${escapar(h.nome)}</strong>: ${h.versoes.map((v) =>
      `<a href="#${ancora(v.painel, h.nome)}">${escapar(v.painel)}</a>`).join(" e ")}${h.mesma_formula ? " (mesma fórmula)" : ""}.
      ${escapar(h.versoes.map((v) => `${v.painel}: ${v.descricao}`).join(" "))}</li>`).join("")}</ul>`;
}

// Link para um verbete escondido pelo filtro: limpa o filtro antes de rolar até ele
function irPara(id) {
  let alvo = document.getElementById(id);
  if (!alvo) {
    Object.assign(filtro, { texto: "", painel: null, soConferidos: false });
    document.getElementById("busca").value = "";
    document.getElementById("so-conferidos").checked = false;
    desenhar();
    alvo = document.getElementById(id);
  }
  if (!alvo) return;
  alvo.scrollIntoView({ behavior: "instant", block: "start" });
  alvo.classList.remove("destaque");
  void alvo.offsetWidth;
  alvo.classList.add("destaque");
}

function iniciar(dados) {
  C = dados;
  const botoes = [["", "Todos"], ...C.paineis.map((p) => [p.nome, p.nome])];
  document.getElementById("filtro-painel").innerHTML = '<span class="rotulo-filtro">Painel</span>' +
    botoes.map(([v, t]) => `<button type="button" data-painel="${escapar(v)}" aria-pressed="false">${escapar(t)}</button>`).join("");
  document.getElementById("filtro-painel").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    filtro.painel = b.dataset.painel || null;
    desenhar();
  });
  let espera;
  document.getElementById("busca").addEventListener("input", (e) => {
    clearTimeout(espera);
    espera = setTimeout(() => { filtro.texto = e.target.value.trim(); desenhar(); }, 120);
  });
  document.getElementById("so-conferidos").addEventListener("change", (e) => { filtro.soConferidos = e.target.checked; desenhar(); });
  document.addEventListener("click", (e) => {
    const link = e.target.closest('a[href^="#i-"]');
    if (!link) return;
    e.preventDefault();
    history.replaceState(null, "", link.getAttribute("href"));
    irPara(link.getAttribute("href").slice(1));
  });
  homonimos();
  desenhar();
  if (location.hash.startsWith("#i-")) irPara(location.hash.slice(1));
}

fetch("assets/data/indicadores.json")
  .then((r) => r.json())
  .then(iniciar)
  .catch(() => {
    document.getElementById("catalogo").innerHTML = '<p class="aviso-carregando">Não foi possível carregar o catálogo.</p>';
  });
