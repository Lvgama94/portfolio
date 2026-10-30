// Página interativa do projeto Excel + automação: mostra o que o Power Query produziu nas duas pastas de trabalho
// (lido das tabelas dos arquivos por python/exportar_web.py) e deixa filtrar, buscar e explorar.

const estado = { aba: "conciliacao", ver: "pendencias", status: null, dia: null, busca: "", ano: 0, setor: null, mes: null };
const inteiro = (v) => numero(Math.round(v));
const centavos = (v) => (v == null ? "—" : `${sinal(v)}R$ ${numero(Math.abs(v), 2)}`);
const LIMITE = 100;                          // linhas mostradas na tabela de lançamentos
const conciliado = (s) => s <= 1;           // status 0 e 1: conciliado pelo documento ou por data e valor
const EXPLICACAO = {
  "Valor divergente": "Clientes que pagaram juros que não foram lançados no sistema",
  "Só no extrato": "Tarifas e IOF que o banco debitou e ninguém lançou",
  "Só no sistema": "Pagamentos do fim do mês que só compensaram em janeiro",
};

// ------------------------------------------------------------ conciliação
const dataDia = (d) => (d == null ? "—" : `${String(d).padStart(2, "0")}/${D.conciliacao.periodo.slice(5)}/${D.conciliacao.periodo.slice(0, 4)}`);
const diferenca = (l) => (l[6] != null && l[7] != null ? l[6] - l[7] : null);
// Valor de cada pendência: a diferença quando os dois lados existem, senão o valor do lado que existe
const valorPendencia = (l) => diferenca(l) ?? l[6] ?? l[7];

function linhasFiltradas() {
  const busca = estado.busca.trim().toLowerCase();
  return D.conciliacao.linhas.filter((l) =>
    (estado.status != null ? l[0] === estado.status : estado.ver === "todos" || !conciliado(l[0]))
    && (estado.dia == null || l[1] === estado.dia || l[2] === estado.dia)
    && (!busca || `${l[3]} ${l[4]} ${l[5]}`.toLowerCase().includes(busca)));
}

function tabelaLancamentos() {
  const linhas = linhasFiltradas().sort((a, b) => conciliado(a[0]) - conciliado(b[0]) || (a[1] ?? a[2]) - (b[1] ?? b[2]));
  const visiveis = linhas.slice(0, LIMITE);
  const tabela = document.getElementById("tabela-lancamentos");
  const cab = document.createElement("thead").appendChild(document.createElement("tr")).parentNode;
  ["Status", "Data no extrato", "Data no sistema", "Documento", "Histórico do banco", "Descrição no sistema", "Valor no extrato", "Valor no sistema", "Diferença"]
    .forEach((c) => cab.rows[0].appendChild(Object.assign(document.createElement("th"), { textContent: c })));
  const corpo = document.createElement("tbody");
  for (const l of visiveis) {
    const tr = corpo.insertRow();
    const st = tr.insertCell();
    st.append(Object.assign(document.createElement("b"), { className: `st ${conciliado(l[0]) ? "bom" : "ruim"}`, textContent: "● " }), D.conciliacao.status[l[0]]);
    [dataDia(l[1]), dataDia(l[2]), l[3] || "—", l[4] || "—", l[5] || "—", centavos(l[6]), centavos(l[7]), centavos(diferenca(l))]
      .forEach((v) => (tr.insertCell().textContent = v));
  }
  tabela.replaceChildren(cab, corpo);
  const filtros = [estado.status != null ? D.conciliacao.status[estado.status].toLowerCase() : estado.ver === "todos" ? "todos os status" : "só pendências",
                   estado.dia != null ? `dia ${estado.dia}` : null, estado.busca.trim() ? `busca "${estado.busca.trim()}"` : null].filter(Boolean);
  const plural = linhas.length === 1 ? "lançamento" : "lançamentos";
  document.getElementById("sub-lancamentos").textContent = linhas.length
    ? `${linhas.length > LIMITE ? `Mostrando ${LIMITE} de ${inteiro(linhas.length)}` : `${inteiro(linhas.length)}`} ${plural} · ${filtros.join(" · ")}`
    : `Nenhum lançamento com esses filtros (${filtros.join(" · ")})`;
}

function conciliacao() {
  const L = D.conciliacao.linhas, S = D.conciliacao.status;
  const porStatus = S.map((_, i) => L.filter((l) => l[0] === i));
  const pendencias = L.filter((l) => !conciliado(l[0]));
  cartoes("kpis-conciliacao", [
    { rotulo: "Lançamentos analisados", valor: inteiro(L.length),
      nota: `${inteiro(L.filter((l) => l[6] != null).length)} no extrato · ${inteiro(L.filter((l) => l[7] != null).length)} no sistema` },
    { rotulo: "Conciliados pelo documento", valor: inteiro(porStatus[0].length), nota: "1ª passada" },
    { rotulo: "Conciliados por data e valor", valor: inteiro(porStatus[1].length), nota: "2ª passada: PIX sem identificação" },
    { rotulo: "Pendências para investigar", valor: inteiro(pendencias.length), nota: `${pct(1 - pendencias.length / L.length)} conciliado automaticamente` },
  ]);

  desenhar("status", {
    opcao: barrasDeitadas({ nomes: S, valores: porStatus.map((x) => x.length), formato: inteiro, clicavel: true, destaque: estado.status,
                            cor: (v, i) => (conciliado(i) ? COR.serie1 : COR.negativo),
                            dicas: (i) => [{ valor: inteiro(porStatus[i].length), nome: "lançamentos" }, { valor: pct(porStatus[i].length / L.length), nome: "do total" }] }),
    aoClicar: (p) => { estado.status = estado.status === p.dataIndex ? null : p.dataIndex; atualizar(); mostrarLancamentos(); },
    tabela: { colunas: ["Status", "Lançamentos", "% do total"], linhas: S.map((s, i) => [s, inteiro(porStatus[i].length), pct(porStatus[i].length / L.length)]) },
  });

  // Cada tipo de pendência, com quantidade, valor e o que significa; clicar filtra a lista
  const lista = document.getElementById("lista-pendencias");
  lista.replaceChildren(...S.map((nome, i) => ({ nome, i, linhas: porStatus[i] })).filter((x) => !conciliado(x.i)).map((x) => {
    const li = document.createElement("li");
    const b = Object.assign(document.createElement("button"), { type: "button" });
    b.setAttribute("aria-pressed", String(estado.status === x.i));
    b.append(
      Object.assign(document.createElement("strong"), { textContent: `${x.linhas.length} · ${x.nome}` }),
      Object.assign(document.createElement("span"), { className: "valor-pendencia", textContent: centavos(x.linhas.reduce((a, l) => a + valorPendencia(l), 0)) }),
      Object.assign(document.createElement("span"), { className: "explicacao", textContent: EXPLICACAO[x.nome] || "" }));
    b.addEventListener("click", () => { estado.status = estado.status === x.i ? null : x.i; atualizar(); mostrarLancamentos(); });
    li.appendChild(b);
    return li;
  }));

  // Movimento do extrato por dia (entradas e saídas), clicável
  const dias = [...new Set(L.map((l) => l[1]).filter((d) => d != null))].sort((a, b) => a - b);
  const entradas = dias.map((d) => L.reduce((a, l) => a + (l[1] === d && l[6] > 0 ? l[6] : 0), 0));
  const saidas = dias.map((d) => L.reduce((a, l) => a + (l[1] === d && l[6] < 0 ? -l[6] : 0), 0));
  const destaque = estado.dia == null ? null : dias.indexOf(estado.dia);
  const modo = modoRotulos("dias", dias.length, 2, [...entradas, ...saidas].map(rotuloValor)), espaco = espacoRotulos(modo.girar, entradas);
  desenhar("dias", {
    opcao: opcaoBase({
      grid: espaco.grid,
      xAxis: eixoCategoria(dias.map(String)),
      yAxis: eixoValor(),
      tooltip: { ...opcaoBase().tooltip, formatter: (ps) => dica(dataDia(dias[ps[0].dataIndex]), [
        { cor: COR.serie1, valor: compacto(entradas[ps[0].dataIndex]), nome: "entradas" }, { cor: COR.serie2, valor: compacto(saidas[ps[0].dataIndex]), nome: "saídas" }]) },
      series: [
        { name: "Entradas", type: "bar", barMaxWidth: 24, barGap: "10%", cursor: "pointer",
          data: barras(entradas, COR.serie1, { destaque, ...modo.serie(0) }) },
        { name: "Saídas", type: "bar", barMaxWidth: 24, cursor: "pointer",
          data: barras(saidas, COR.serie2, { destaque, ...modo.serie(1) }) },
      ],
    }),
    aoClicar: (p) => {
      const d = dias[p.dataIndex];
      estado.dia = estado.dia === d ? null : d;
      if (estado.status == null) estado.ver = "todos";
      atualizar(); mostrarLancamentos();
    },
    tabela: { colunas: ["Dia", "Entradas", "Saídas"], linhas: dias.map((d, i) => [dataDia(d), reais(entradas[i]), reais(saidas[i])]) },
  });

  tabelaLancamentos();
}

// ------------------------------------------------------------ ponto
function ponto() {
  const meses = estado.ano ? mesesDoAno(estado.ano) : D.meses.map((_, i) => i);
  const noPeriodo = new Set(meses);
  const soma = (setor = estado.setor) => {
    const r = { pessoas: 0, previstos: 0, faltas: 0, atestados: 0, he: 0 };
    for (const [m, s, pessoas, previstos, faltas, atestados, he] of D.ponto) {
      if (!noPeriodo.has(m) || (setor != null && s !== setor)) continue;
      r.pessoas += pessoas; r.previstos += previstos; r.faltas += faltas; r.atestados += atestados; r.he += he;
    }
    r.absenteismo = (r.faltas + r.atestados) / r.previstos;
    return r;
  };
  const porMes = meses.map((m) => {
    const r = { pessoas: 0, faltas: 0, he: 0 };
    for (const [mm, s, pessoas, , faltas, , he] of D.ponto) if (mm === m && (estado.setor == null || s === estado.setor)) { r.pessoas += pessoas; r.faltas += faltas; r.he += he; }
    return r;
  });
  const t = soma(), novos = meses.filter((m) => D.arquivos[m].layout === "novo").length;
  cartoes("kpis-ponto", [
    { rotulo: "Arquivos lidos", valor: inteiro(meses.length), nota: novos ? `${novos} no layout novo` : "todos no layout antigo" },
    { rotulo: "Registros (pessoa × mês)", valor: inteiro(t.pessoas), nota: "iguais à tabela do SQL" },
    { rotulo: "Faltas (dias)", valor: inteiro(t.faltas) },
    { rotulo: "Dias de atestado", valor: inteiro(t.atestados) },
    { rotulo: "Horas extras", valor: numero(t.he, 2), nota: "somadas depois da conversão" },
    { rotulo: "Absenteísmo", valor: pct(t.absenteismo), nota: "(faltas + atestados) ÷ previstos" },
  ]);

  const layout = (i) => D.arquivos[meses[i]].layout;
  desenhar("arquivos", {
    opcao: colunasMensais("arquivos", {
      meses, formato: inteiro, eixo: inteiro, clicavel: false,
      series: [{ nome: "Registros", valores: porMes.map((x) => x.pessoas), cor: (v, i) => (layout(i) === "novo" ? COR.serie2 : COR.serie1) }],
      dicas: (i) => [{ valor: D.arquivos[meses[i]].nome, nome: "" }, { valor: `layout ${layout(i)}`, nome: "" }, { valor: inteiro(porMes[i].pessoas), nome: "registros" }],
    }),
    tabela: { colunas: ["Arquivo", "Competência", "Layout", "Registros", "Faltas", "Horas extras"],
              linhas: meses.map((m, i) => [D.arquivos[m].nome, nomeMes(m), layout(i), inteiro(porMes[i].pessoas), inteiro(porMes[i].faltas), numero(porMes[i].he, 2)]) },
  });
  desenhar("he", {
    opcao: colunasMensais("he", {
      meses, formato: inteiro, eixo: inteiro, clicavel: false,
      series: [{ nome: "Horas extras", valores: porMes.map((x) => x.he), cor: COR.serie1 }],
      dicas: (i) => [{ valor: numero(porMes[i].he, 2), nome: "horas extras" }, { valor: `layout ${layout(i)}`, nome: "" }],
    }),
    tabela: { colunas: ["Mês", "Horas extras"], linhas: meses.map((m, i) => [nomeMes(m), numero(porMes[i].he, 2)]) },
  });

  const setores = D.setores.map((nome, s) => ({ nome, s, ...soma(s) })).filter((x) => x.previstos > 0).sort((a, b) => b.absenteismo - a.absenteismo);
  desenhar("setores", {
    opcao: barrasDeitadas({ nomes: setores.map((x) => x.nome), valores: setores.map((x) => x.absenteismo), formato: (v) => pct(v), clicavel: true,
                            destaque: estado.setor == null ? null : setores.findIndex((x) => x.s === estado.setor),
                            dicas: (i) => [{ valor: pct(setores[i].absenteismo), nome: "absenteísmo" }, { valor: inteiro(setores[i].faltas), nome: "faltas" },
                                           { valor: inteiro(setores[i].atestados), nome: "dias de atestado" }] }),
    aoClicar: (p) => { const s = setores[p.dataIndex].s; estado.setor = estado.setor === s ? null : s; atualizar(); },
    tabela: { colunas: ["Setor", "Absenteísmo", "Faltas", "Atestados"], linhas: setores.map((x) => [x.nome, pct(x.absenteismo), inteiro(x.faltas), inteiro(x.atestados)]) },
  });
}

// ------------------------------------------------------------ estado e interação
const PAGINAS = { conciliacao, ponto };

/** Leva o leitor até a tabela, onde aparece o efeito do clique num status, numa pendência ou num dia. */
function mostrarLancamentos() {
  requestAnimationFrame(() => document.getElementById("cartao-lancamentos").scrollIntoView({ behavior: "smooth", block: "nearest" }));
}

/** Campo de busca criado uma vez só: redesenhar a cada tecla tiraria o foco de quem está digitando. */
function campoBusca() {
  const alvo = document.getElementById("filtro-busca");
  let campo = document.getElementById("busca");
  if (!campo) {
    const rotulo = Object.assign(document.createElement("label"), { className: "rotulo-filtro", htmlFor: "busca", textContent: "Buscar" });
    campo = Object.assign(document.createElement("input"), { id: "busca", type: "search", placeholder: "documento, cliente, histórico…" });
    campo.addEventListener("input", () => { estado.busca = campo.value; tabelaLancamentos(); });
    alvo.replaceChildren(rotulo, campo);
  }
  campo.value = estado.busca;
}

function atualizar() {
  if (estado.aba === "conciliacao") {
    // A barra do topo só leva filtros da página inteira; "Mostrar" e "Buscar" ficam no cartão da tabela
    document.getElementById("filtro-1").replaceChildren();
    document.getElementById("filtro-2").replaceChildren();
    botoesFiltro("filtro-ver", "Mostrar", [["pendencias", "Pendências"], ["todos", "Todos"]], estado.status == null ? estado.ver : null,
      (v) => { estado.ver = v; estado.status = null; atualizar(); });
    campoBusca();
  } else {
    const anos = [...new Set(D.meses.map((m) => Number(m.slice(0, 4))))];
    botoesFiltro("filtro-1", "Ano", [[0, "Todos"], ...anos.map((a) => [a, String(a)])], estado.ano, (a) => { estado.ano = a; atualizar(); });
    listaFiltro("filtro-2", "Setor", [[-1, "Todos"], ...D.setores.map((s, i) => [i, s])], estado.setor ?? -1,
      (s) => { estado.setor = s < 0 ? null : s; atualizar(); });
  }
  const selecao = estado.aba === "conciliacao"
    ? [estado.status != null ? D.conciliacao.status[estado.status] : null, estado.dia != null ? `dia ${estado.dia}` : null].filter(Boolean).join(" · ") || null
    : null;
  mostrarPagina(selecao);
}

iniciarPainel({ arquivo: "assets/data/excel.json", limparSelecao: () => { estado.status = null; estado.dia = null; } });
