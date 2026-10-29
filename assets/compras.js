// Painel Compras e Estoque interativo: lê o JSON exportado do SQL Server (python/exportar_web.py)
// e recalcula no navegador os mesmos indicadores das medidas DAX do Power BI.

const estado = { ano: 2025, categoria: null, fornecedor: null, mes: null, classe: null, aba: "compras" };
const inteiro = (v) => numero(Math.round(v));
const nomeCurto = (n) => n.replace(/\s+(Ltda|S\.A\.)\.?$/, "");
const diasNoMes = (i) => { const [a, m] = D.meses[i].split("-").map(Number); return new Date(a, m, 0).getDate(); };
const pctEixo = (v) => `${numero(v * 100)}%`;

// ------------------------------------------------------------ dados
// Cada fornecedor vende uma categoria só, e cada produto tem um fornecedor principal (como no modelo do Power BI)
const produtoNoFiltro = (p, { categoria = estado.categoria, fornecedor = estado.fornecedor } = {}) =>
  (categoria == null || D.produtos[p].categoria === categoria) && (fornecedor == null || D.produtos[p].fornecedor === fornecedor);
const fornecedorNoFiltro = (f, { categoria = estado.categoria, fornecedor = estado.fornecedor } = {}) =>
  (categoria == null || D.fornecedores[f].categoria === categoria) && (fornecedor == null || f === fornecedor);

/** Estoque no fim de cada mês: soma acumulada dos movimentos a custo dos produtos do filtro. */
function saldos(filtro) {
  const movimento = zeros(D.meses.length);
  for (const l of D.produto_mes) if (produtoNoFiltro(l[1], filtro)) movimento[l[0]] += l[6];
  let saldo = 0;
  return Array.from(movimento, (v) => (saldo += v));
}

/** Indicadores de compras, estoque e ruptura de um conjunto de meses, com as regras das medidas DAX. */
function indCE(ms, filtro = {}) {
  const noPeriodo = new Set(ms), ordenados = [...ms].sort((a, b) => a - b);
  const r = { valor: 0, pedidos: 0, entregues: 0, noPrazo: 0, atrasados: 0, diasAtraso: 0,
              pedidas: 0, faturadas: 0, perdida: 0, receita: 0, cmv: 0 };
  for (const [m, f, valor, pedidos, entregues, noPrazo, atrasados, dias] of D.compras) {
    if (!noPeriodo.has(m) || !fornecedorNoFiltro(f, filtro)) continue;
    r.valor += valor; r.pedidos += pedidos; r.entregues += entregues; r.noPrazo += noPrazo; r.atrasados += atrasados; r.diasAtraso += dias;
  }
  for (const [m, p, pedidas, faturadas, perdida, receita, , cmv] of D.produto_mes) {
    if (!noPeriodo.has(m) || !produtoNoFiltro(p, filtro)) continue;
    r.pedidas += pedidas; r.faturadas += faturadas; r.perdida += perdida; r.receita += receita; r.cmv += cmv;
  }
  const saldo = saldos(filtro);
  r.estoque = saldo[ordenados[ordenados.length - 1]];
  r.estoqueMedio = ordenados.reduce((a, m) => a + saldo[m], 0) / ordenados.length;
  r.pctPrazo = r.noPrazo / r.entregues;            // pontualidade por pedido, não por item
  r.atrasoMedio = r.diasAtraso / r.atrasados;      // só os pedidos que atrasaram
  r.ticket = r.valor / r.pedidos;
  r.nivelServico = r.faturadas / r.pedidas;
  r.naoAtendidas = r.pedidas - r.faturadas;
  r.ruptura = r.naoAtendidas / r.pedidas;
  r.giro = r.cmv / r.estoqueMedio;                 // CMV ÷ estoque médio
  r.cobertura = r.estoque / (r.cmv / ordenados.reduce((a, m) => a + diasNoMes(m), 0));   // estoque ÷ CMV por dia
  return r;
}

const comparacao = (ms) => {
  const antes = anterior(ms);
  const atual = indCE(ms), ant = antes && indCE(antes), rot = antes && rotuloPeriodo(antes);
  return { atual, d: (campo, tipo, sentido) => (ant ? delta(atual[campo], ant[campo], tipo, rot, sentido) : delta(0, null)) };
};
const cartao = (rotulo, valor, dl = {}) => ({ rotulo, valor, nota: dl.texto, classe: dl.classe });

/** Valores por categoria (a categoria é a dimensão do gráfico, então o filtro de categoria vira destaque). */
function porCategoria(ms, campo) {
  return D.categorias.map((nome, c) => ({ nome, c, ...indCE(ms, { categoria: c, fornecedor: estado.fornecedor }) }))
    .map((x) => ({ ...x, valor: x[campo] })).filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor);
}

function graficoCategorias(chave, ms, campo, dicas, formato = rotuloValor) {
  const lista = porCategoria(ms, campo);
  const destaque = estado.categoria == null ? null : lista.findIndex((x) => x.c === estado.categoria);
  desenhar(chave, lista.length ? {
    opcao: barrasDeitadas({ nomes: lista.map((x) => x.nome), valores: lista.map((x) => x.valor), formato, destaque, clicavel: true,
                            dicas: (i) => dicas(lista[i]) }),
    aoClicar: (p) => alternarCategoria(lista[p.dataIndex].c),
    tabela: { colunas: ["Categoria", "Valor"], linhas: lista.map((x) => [x.nome, formato(x.valor)]) },
  } : { vazio: "Sem dados no recorte escolhido." });
}

// ------------------------------------------------------------ página: Compras e Fornecedores
function compras() {
  const ms = periodo(), { atual: a, d } = comparacao(ms);
  cartoes("kpis-compras", [
    cartao("Valor comprado", compacto(a.valor), d("valor", "%", 0)),
    cartao("Pedidos de compra", inteiro(a.pedidos), d("pedidos", "abs", 0)),
    cartao("Valor médio por pedido", compacto(a.ticket), d("ticket", "%", 0)),
    cartao("Entregas no prazo", pct(a.pctPrazo), d("pctPrazo", "pp", 1)),
    cartao("Atraso médio quando atrasa", `${dias(a.atrasoMedio)} dias`, { texto: "só os pedidos que atrasaram" }),
    cartao("Nível de serviço", pct(a.nivelServico), d("nivelServico", "pp", 1)),
  ]);

  const doAno = mesesDoAno(estado.ano), porMes = doAno.map((m) => indCE([m]));
  const clicarMes = (p) => alternarMes(doAno[p.dataIndex]);
  desenhar("compras-mes", {
    opcao: colunasMensais("compras-mes", {
      meses: doAno,
      series: [{ nome: "Valor comprado", valores: porMes.map((x) => x.valor), cor: COR.serie1 }],
      dicas: (i) => [{ valor: compacto(porMes[i].valor), nome: "comprado" }, { valor: inteiro(porMes[i].pedidos), nome: "pedidos" },
                     { valor: pct(porMes[i].pctPrazo), nome: "no prazo" }],
    }),
    aoClicar: clicarMes,
    tabela: { colunas: ["Mês", "Valor comprado", "Pedidos"], linhas: porMes.map((x, i) => [nomeMes(doAno[i]), reais(x.valor), inteiro(x.pedidos)]) },
  });
  desenhar("prazo-mes", {
    opcao: colunasMensais("prazo-mes", {
      meses: doAno, formato: (v) => pct(v, 0), eixo: pctEixo,
      series: [{ nome: "No prazo", valores: porMes.map((x) => (isFinite(x.pctPrazo) ? x.pctPrazo : 0)), cor: COR.serie1 }],
      dicas: (i) => [{ valor: pct(porMes[i].pctPrazo), nome: "dos pedidos no prazo" },
                     { valor: `${inteiro(porMes[i].noPrazo)} de ${inteiro(porMes[i].entregues)}`, nome: "pedidos entregues" }],
    }),
    aoClicar: clicarMes,
    tabela: { colunas: ["Mês", "No prazo", "Pedidos entregues"], linhas: porMes.map((x, i) => [nomeMes(doAno[i]), pct(x.pctPrazo), inteiro(x.entregues)]) },
  });
  graficoCategorias("categorias", ms, "valor", (x) => [{ valor: reais(x.valor), nome: "comprado" }, { valor: pct(x.pctPrazo), nome: "no prazo" }]);

  // Ranking de fornecedores: pontualidade com cor + ícone + número (a cor nunca vem sozinha)
  const lista = D.fornecedores.map((f, i) => ({ ...f, i, ...indCE(ms, { categoria: estado.categoria, fornecedor: i }) }))
    .filter((f) => fornecedorNoFiltro(f.i, { fornecedor: null }) && f.pedidos > 0).sort((x, y) => y.valor - x.valor);
  const tabela = document.getElementById("tabela-fornecedores");
  const cab = document.createElement("thead").appendChild(document.createElement("tr")).parentNode;
  ["Fornecedor", "Categoria", "Valor comprado", "Pedidos", "No prazo", "Atraso médio"].forEach((c) =>
    cab.rows[0].appendChild(Object.assign(document.createElement("th"), { textContent: c })));
  const corpo = document.createElement("tbody");
  for (const f of lista) {
    const tr = corpo.insertRow();
    if (estado.fornecedor === f.i) tr.className = "selecionada";
    const b = Object.assign(document.createElement("button"), { type: "button", textContent: nomeCurto(f.nome) });
    b.addEventListener("click", () => alternarFornecedor(f.i));
    tr.insertCell().appendChild(b);
    tr.insertCell().textContent = D.categorias[f.categoria];
    tr.insertCell().textContent = reais(f.valor);
    tr.insertCell().textContent = inteiro(f.pedidos);
    const status = f.pctPrazo >= 0.75 ? "bom" : f.pctPrazo >= 0.6 ? "atencao" : "ruim";
    const celula = tr.insertCell();
    celula.append(Object.assign(document.createElement("b"), { className: `st ${status}`, textContent: "● " }), pct(f.pctPrazo));
    tr.insertCell().textContent = isFinite(f.atrasoMedio) ? `${dias(f.atrasoMedio)} dias` : "—";
  }
  tabela.replaceChildren(cab, corpo);
}

// ------------------------------------------------------------ página: Estoque e Ruptura
function estoque() {
  const ms = periodo(), { atual: a, d } = comparacao(ms);
  cartoes("kpis-estoque", [
    cartao("Estoque no fim do período", compacto(a.estoque), d("estoque", "%", -1)),
    cartao("Giro de estoque", `${numero(a.giro, 1)}×`, d("giro", "%", 1)),
    cartao("Cobertura", `${inteiro(a.cobertura)} dias`, { texto: "estoque ÷ custo vendido por dia" }),
    cartao("Nível de serviço", pct(a.nivelServico), d("nivelServico", "pp", 1)),
    cartao("Unidades não atendidas", inteiro(a.naoAtendidas), d("naoAtendidas", "%", -1)),
    cartao("Venda perdida por falta", compacto(a.perdida), d("perdida", "%", -1)),
  ]);

  const doAno = mesesDoAno(estado.ano), saldo = saldos({}), porMes = doAno.map((m) => indCE([m]));
  desenhar("estoque-mes", {
    opcao: colunasMensais("estoque-mes", {
      meses: doAno,
      series: [{ nome: "Estoque", valores: doAno.map((m) => saldo[m]), cor: COR.serie1 }],
      dicas: (i) => [{ valor: compacto(saldo[doAno[i]]), nome: "em estoque no fim do mês" }, { valor: `${inteiro(porMes[i].cobertura)} dias`, nome: "de cobertura" }],
    }),
    aoClicar: (p) => alternarMes(doAno[p.dataIndex]),
    tabela: { colunas: ["Mês", "Estoque", "Cobertura"], linhas: doAno.map((m, i) => [nomeMes(m), reais(saldo[m]), `${inteiro(porMes[i].cobertura)} dias`]) },
  });
  graficoCategorias("ruptura-categoria", ms, "perdida", (x) => [{ valor: reais(x.perdida), nome: "venda perdida" },
    { valor: pct(x.ruptura), nome: "das unidades pedidas faltaram" }, { valor: inteiro(x.naoAtendidas), nome: "unidades não atendidas" }]);

  // Os 10 produtos que mais perderam venda no período
  const noPeriodo = new Set(ms), perda = new Map();
  for (const [m, p, pedidas, faturadas, perdida] of D.produto_mes) {
    if (!noPeriodo.has(m) || !produtoNoFiltro(p)) continue;
    const x = perda.get(p) || { perdida: 0, falta: 0, pedidas: 0 };
    x.perdida += perdida; x.falta += pedidas - faturadas; x.pedidas += pedidas;
    perda.set(p, x);
  }
  const top = [...perda].map(([p, x]) => ({ p, ...x })).filter((x) => x.perdida > 0).sort((a, b) => b.perdida - a.perdida).slice(0, 10);
  desenhar("produtos-perda", top.length ? {
    opcao: barrasDeitadas({ nomes: top.map((x) => D.produtos[x.p].nome), valores: top.map((x) => x.perdida),
                            dicas: (i) => [{ valor: reais(top[i].perdida), nome: "venda perdida" }, { valor: inteiro(top[i].falta), nome: "unidades não atendidas" },
                                           { valor: D.categorias[D.produtos[top[i].p].categoria], nome: "" }] }),
    tabela: { colunas: ["Produto", "Categoria", "Venda perdida", "Unidades"], linhas: top.map((x) => [D.produtos[x.p].nome, D.categorias[D.produtos[x.p].categoria], reais(x.perdida), inteiro(x.falta)]) },
  } : { vazio: "Nenhuma venda perdida no recorte escolhido." });
}

// ------------------------------------------------------------ página: Curva ABC
function abc() {
  // Receita de cada produto nos dois anos; as classes vêm prontas do SQL (dw.vw_curva_abc_produto)
  const receita = zeros(D.produtos.length);
  for (const [, p, , , , r] of D.produto_mes) receita[p] += r;
  const lista = D.produtos.map((x, p) => ({ ...x, p, receita: receita[p] })).filter((x) => produtoNoFiltro(x.p)).sort((a, b) => b.receita - a.receita);
  const total = lista.reduce((a, x) => a + x.receita, 0);
  let acumulado = 0;
  lista.forEach((x) => { x.participacao = x.receita / total; acumulado += x.receita; x.acumulada = acumulado / total; });
  const classes = ["A", "B", "C"].map((c) => {
    const da = lista.filter((x) => x.classe === c);
    return { c, produtos: da.length, receita: da.reduce((a, x) => a + x.receita, 0) };
  });
  const a = classes[0];
  cartoes("kpis-abc", [
    cartao("Receita em 2024 e 2025", compacto(total)),
    cartao("Produtos", inteiro(lista.length)),
    cartao("Produtos na classe A", inteiro(a.produtos), { texto: `${pct(a.produtos / lista.length, 0)} dos produtos` }),
    cartao("Receita da classe A", pct(a.receita / total, 0), { texto: "os itens que não podem faltar" }),
  ]);

  const destaque = estado.classe == null ? null : ["A", "B", "C"].indexOf(estado.classe);
  desenhar("classes", {
    opcao: opcaoBase({
      grid: { left: 4, right: 16, top: 24, bottom: 4, containLabel: true },
      xAxis: eixoCategoria(classes.map((x) => `Classe ${x.c}`)),
      yAxis: eixoValor(pctEixo),
      tooltip: { ...opcaoBase().tooltip, formatter: (ps) => {
        const x = classes[ps[0].dataIndex];
        return dica(`Classe ${x.c}`, [{ cor: COR.serie1, valor: `${inteiro(x.produtos)} (${pct(x.produtos / lista.length, 0)})`, nome: "produtos" },
                                      { cor: COR.serie2, valor: `${compacto(x.receita)} (${pct(x.receita / total, 0)})`, nome: "receita" }]);
      } },
      series: [
        { name: "% dos produtos", type: "bar", barMaxWidth: 32, barGap: "10%", cursor: "pointer",
          data: barras(classes.map((x) => x.produtos / lista.length), COR.serie1, { destaque, girar: false, formato: (v) => pct(v, 0) }) },
        { name: "% da receita", type: "bar", barMaxWidth: 32, cursor: "pointer",
          data: barras(classes.map((x) => x.receita / total), COR.serie2, { destaque, girar: false, formato: (v) => pct(v, 0) }) },
      ],
    }),
    aoClicar: (p) => { const c = classes[p.dataIndex].c; estado.classe = estado.classe === c ? null : c; atualizar(); },
    tabela: { colunas: ["Classe", "Produtos", "% dos produtos", "Receita", "% da receita"],
              linhas: classes.map((x) => [x.c, inteiro(x.produtos), pct(x.produtos / lista.length), reais(x.receita), pct(x.receita / total)]) },
  });

  // Curva de Pareto: receita acumulada pelo ranking; rótulo só no fim de cada classe
  const fimDaClasse = new Set(["A", "B"].map((c) => lista.map((x) => x.classe).lastIndexOf(c)).filter((i) => i >= 0));
  desenhar("pareto", {
    opcao: opcaoBase({
      grid: { left: 4, right: 24, top: 24, bottom: 4, containLabel: true },
      xAxis: eixoCategoria(lista.map((_, i) => i + 1), { boundaryGap: false, axisLabel: { color: COR.suave, fontSize: 11, interval: 9 } }),
      yAxis: eixoValor(pctEixo, { max: 1 }),
      tooltip: { ...opcaoBase().tooltip, axisPointer: { type: "line", lineStyle: { color: COR.eixo } }, formatter: ([p]) => {
        const x = lista[p.dataIndex];
        return dica(`${p.dataIndex + 1}º · ${x.nome}`, [{ valor: pct(x.acumulada), nome: "da receita acumulada" },
          { valor: reais(x.receita), nome: "receita do produto" }, { valor: `classe ${x.classe}`, nome: "" }]);
      } },
      series: [{
        type: "line", symbol: "none", lineStyle: { width: 2, color: COR.serie1 }, itemStyle: { color: COR.serie1 },
        areaStyle: { color: "rgba(42,120,214,0.10)" },
        data: lista.map((x, i) => ({
          value: x.acumulada,
          ...(fimDaClasse.has(i) ? { symbol: "circle", symbolSize: 8, label: { show: true, position: "left", distance: 8, color: COR.texto, fontSize: 11,
                                     formatter: () => `${i + 1} produtos = ${pct(x.acumulada, 0)}` } } : {}),
        })),
      }],
    }),
    tabela: { colunas: ["Posição", "Produto", "Receita acumulada", "Classe"], linhas: lista.map((x, i) => [`${i + 1}º`, x.nome, pct(x.acumulada), x.classe]) },
  });

  const visiveis = lista.map((x, i) => ({ ...x, posicao: i + 1 })).filter((x) => estado.classe == null || x.classe === estado.classe);
  document.getElementById("sub-produtos").textContent = estado.classe == null
    ? `${visiveis.length} produtos, pela receita dos dois anos` : `${visiveis.length} produtos da classe ${estado.classe}`;
  const tabela = tabelaDados({
    colunas: ["#", "Produto", "Categoria", "Receita", "Participação", "Acumulado", "Classe"],
    linhas: visiveis.map((x) => [`${x.posicao}º`, x.nome, D.categorias[x.categoria], reais(x.receita), pct(x.participacao), pct(x.acumulada), x.classe]),
  });
  document.getElementById("tabela-produtos").replaceChildren(...tabela.childNodes);
}

// ------------------------------------------------------------ estado e interação
const PAGINAS = { compras, estoque, abc };

function alternarCategoria(c) {
  estado.categoria = estado.categoria === c ? null : c;
  if (estado.fornecedor != null && D.fornecedores[estado.fornecedor].categoria !== estado.categoria) estado.fornecedor = null;
  atualizar();
}
function alternarFornecedor(f) { estado.fornecedor = estado.fornecedor === f ? null : f; atualizar(); }

function atualizar() {
  const anos = [...new Set(D.meses.map((m) => Number(m.slice(0, 4))))];
  const abcAtiva = estado.aba === "abc";
  botoesFiltro("filtro-ano", "Ano", anos.map((a) => [a, String(a)]), estado.ano,
    (a) => { estado.ano = a; estado.mes = null; atualizar(); }, abcAtiva);
  listaFiltro("filtro-categoria", "Categoria", [[-1, "Todas"], ...D.categorias.map((c, i) => [i, c])], estado.categoria ?? -1,
    (c) => alternarCategoria(c < 0 ? null : c));
  const fornecedores = D.fornecedores.map((f, i) => [i, nomeCurto(f.nome)])
    .filter(([i]) => estado.categoria == null || D.fornecedores[i].categoria === estado.categoria).sort((x, y) => x[1].localeCompare(y[1]));
  listaFiltro("filtro-fornecedor", "Fornecedor", [[-1, "Todos"], ...fornecedores], estado.fornecedor ?? -1,
    (f) => { estado.fornecedor = f < 0 ? null : f; atualizar(); });
  mostrarPagina(abcAtiva ? (estado.classe == null ? null : `Classe ${estado.classe}`) : (estado.mes == null ? null : nomeMes(estado.mes)));
}

iniciarPainel({
  arquivo: "assets/data/compras.json",
  limparSelecao: () => { if (estado.aba === "abc") estado.classe = null; else estado.mes = null; },
});
