/* SQL na prática: monta as perguntas a partir de assets/data/sql.json (consulta + resultado). */
"use strict";

const GITHUB = "https://github.com/Lvgama94/distribuidora-sul/blob/main/sql/perguntas/";
const LINHAS_VISIVEIS = 12;

// ------------------------------------------------------------ realce de sintaxe
const PALAVRAS = new Set(("SELECT FROM WHERE JOIN LEFT FULL INNER ON AND OR NOT EXISTS AS WITH GROUP BY ORDER HAVING " +
  "CASE WHEN THEN ELSE END UNION ALL OVER PARTITION ROWS BETWEEN PRECEDING CURRENT ROW UNBOUNDED DESC ASC IS NULL IN " +
  "ROLLUP DISTINCT TOP INT DECIMAL").split(" "));
const FUNCOES = new Set("SUM AVG COUNT MIN MAX LAG LEAD ROW_NUMBER RANK NTILE CONCAT NULLIF ISNULL COALESCE CAST GROUPING ABS".split(" "));
const TOKEN = /(--[^\n]*|\/\*[\s\S]*?\*\/)|(N?'(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g;

const escapar = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function realcar(sql) {
  let html = "";
  let ultimo = 0;
  for (const m of sql.matchAll(TOKEN)) {
    html += escapar(sql.slice(ultimo, m.index));
    const [texto, comentario, cadeia, numero, palavra] = m;
    let classe = null;
    if (comentario) classe = "c";
    else if (cadeia) classe = "s";
    else if (numero) classe = "n";
    else if (PALAVRAS.has(palavra)) classe = "k";
    else if (FUNCOES.has(palavra)) classe = "f";
    html += classe ? `<span class="${classe}">${escapar(texto)}</span>` : escapar(texto);
    ultimo = m.index + texto.length;
  }
  return html + escapar(sql.slice(ultimo));
}

// ------------------------------------------------------------ formatação do resultado
const casas = (n) => ({ minimumFractionDigits: n, maximumFractionDigits: n });
const menos = (t) => t.replace(/^-/, "−");
const FORMATOS = {
  reais: (v) => menos(v.toLocaleString("pt-BR", casas(2))),
  pct: (v) => menos((v * 100).toLocaleString("pt-BR", casas(1))) + "%",
  num1: (v) => menos(v.toLocaleString("pt-BR", casas(1))),
  int: (v) => menos(v.toLocaleString("pt-BR")),
  data: (v) => v.split("-").reverse().join("/"),
  texto: (v) => escapar(v),
};

function celula(valor, coluna) {
  const classe = coluna.tipo === "texto" ? "texto" : "";
  if (valor === null) return `<td class="${classe}"><span class="nulo">NULL</span></td>`;
  // Ano e posição são códigos, não quantidades: sem separador de milhar
  const texto = coluna.nome === "ano" || coluna.nome === "posicao" ? String(valor) : FORMATOS[coluna.tipo](valor);
  return `<td class="${classe}">${texto}</td>`;
}

function tabela(p) {
  const cabecalho = p.colunas.map((c) => `<th class="${c.tipo === "texto" ? "texto" : ""}">${c.nome}</th>`).join("");
  const linhas = p.linhas.map((linha, i) => {
    const classes = [i >= LINHAS_VISIVEIS ? "extra" : "", linha[0] === "Total" ? "total" : ""].join(" ").trim();
    return `<tr${classes ? ` class="${classes}"` : ""}>${linha.map((v, j) => celula(v, p.colunas[j])).join("")}</tr>`;
  }).join("");
  return `<div class="tabela-rolagem"><table class="tabela-dados resultado">
    <thead><tr>${cabecalho}</tr></thead><tbody>${linhas}</tbody></table></div>`;
}

// Alguns navegadores bloqueiam a API da área de transferência: nesse caso copia por uma caixa de texto oculta
async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    area.style.cssText = "position: fixed; opacity: 0;";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

// ------------------------------------------------------------ montagem da página
function artigo(p, i) {
  const num = String(i + 1).padStart(2, "0");
  const total = p.linhas.length;
  const maisLinhas = total > LINHAS_VISIVEIS
    ? `<button class="mais-linhas" type="button" aria-expanded="false">Ver todas as ${total} linhas</button>` : "";
  return `<article class="pergunta" id="p${num}" data-indice="${i}">
    <header>
      <span class="num">${num}</span>
      <h2>${escapar(p.pergunta)}</h2>
      <ul class="tecnicas" aria-label="Técnicas">${p.tecnicas.map((t) => `<li>${escapar(t)}</li>`).join("")}</ul>
    </header>
    <p class="resposta">${escapar(p.leitura)}</p>
    <div class="rotulo-bloco"><span>Consulta</span>
      <span class="acoes">
        <button class="copiar" type="button">Copiar</button>
        <a href="${GITHUB}${p.arquivo}" target="_blank" rel="noopener">Ver no GitHub</a>
      </span>
    </div>
    <pre class="codigo" tabindex="0"><code>${realcar(p.sql)}</code></pre>
    <div class="rotulo-bloco"><span>Resultado · ${total} ${total === 1 ? "linha" : "linhas"}</span></div>
    ${tabela(p)}
    ${maisLinhas}
  </article>`;
}

function montar(dados) {
  const perguntas = dados.perguntas;
  document.getElementById("sumario").innerHTML = perguntas.map((p, i) => {
    const num = String(i + 1).padStart(2, "0");
    return `<li><a href="#p${num}"><span class="num">${num}</span><span>${escapar(p.pergunta)}</span>
      <span class="tec">${escapar(p.tecnicas.join(" · "))}</span></a></li>`;
  }).join("");
  const alvo = document.getElementById("perguntas");
  alvo.innerHTML = perguntas.map(artigo).join("");

  alvo.addEventListener("click", async (e) => {
    const botao = e.target.closest("button");
    if (!botao) return;
    const artigoAtual = botao.closest(".pergunta");
    if (botao.classList.contains("mais-linhas")) {
      const aberto = artigoAtual.classList.toggle("aberto");
      botao.setAttribute("aria-expanded", aberto);
      const total = perguntas[artigoAtual.dataset.indice].linhas.length;
      botao.textContent = aberto ? "Mostrar menos" : `Ver todas as ${total} linhas`;
      // Ao recolher, a tabela encolhe acima do botão: traz o botão de volta para a tela
      if (!aberto) botao.scrollIntoView({ block: "center" });
    } else if (botao.classList.contains("copiar")) {
      const ok = await copiar(perguntas[artigoAtual.dataset.indice].sql);
      botao.textContent = ok ? "Copiado" : "Não foi possível copiar";
      setTimeout(() => { botao.textContent = "Copiar"; }, 1800);
    }
  });

  // O endereço pode vir com #p05: rola até a pergunta depois de montar
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView({ behavior: "instant" });
}

fetch("assets/data/sql.json")
  .then((r) => r.json())
  .then(montar)
  .catch(() => {
    document.getElementById("perguntas").innerHTML = '<p class="aviso-carregando">Não foi possível carregar as consultas.</p>';
  });
