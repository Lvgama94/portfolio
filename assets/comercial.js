// Painel Comercial interativo: lê o JSON exportado do SQL Server (python/exportar_web.py)
// e recalcula no navegador os indicadores conferidos com dw.vw_conferencia_comercial.

const estado = { ano: 2025, filial: 0, tipo: null, mes: null, aba: "visao" };
const inteiro = (v) => numero(Math.round(v));
const pctEixo = (v) => `${numero(v * 100)}%`;
const dataBr = (iso) => iso.split("-").reverse().join("/");
const RECENCIA = [["Até 30 dias", 30], ["31 a 90 dias", 90], ["91 a 180 dias", 180], ["181 a 365 dias", 365], ["Mais de 1 ano", Infinity]];
let faturamentoTotal;          // faturamento de cada cliente nos dois anos (ranking dos que pararam de comprar)

// ------------------------------------------------------------ dados
// O cliente compra sempre na mesma filial, então filial e tipo vêm do cadastro do cliente
const noFiltro = (c, { filial = estado.filial, tipo = estado.tipo } = {}) =>
  (filial === 0 || D.clientes[c].filial === filial) && (tipo == null || D.clientes[c].tipo === tipo);

/** Indicadores comerciais de um conjunto de meses, com as mesmas regras da view de conferência. */
function indCom(ms, filtro = {}, vendedor = null) {
  const noPeriodo = new Set(ms);
  const vale = (m, c, v) => noPeriodo.has(m) && noFiltro(c, filtro) && (vendedor == null || v === vendedor);
  const r = { faturamento: 0, desconto: 0, custo: 0, notas: 0, devolucoes: 0, custoDevolvido: 0, porCliente: new Map() };
  for (const [m, c, v, desconto, fat, custo, notas] of D.vendas) {
    if (!vale(m, c, v)) continue;
    r.faturamento += fat; r.desconto += desconto; r.custo += custo; r.notas += notas;
    r.porCliente.set(c, (r.porCliente.get(c) || 0) + fat);
  }
  for (const [m, c, v, valor, custo] of D.devolucoes) {
    if (vale(m, c, v)) { r.devolucoes += valor; r.custoDevolvido += custo; }
  }
  r.vendaLiquida = r.faturamento - r.devolucoes;
  r.margem = (r.vendaLiquida - (r.custo - r.custoDevolvido)) / r.vendaLiquida;    // antes dos impostos
  r.descontoMedio = r.desconto / (r.faturamento + r.desconto);                       // sobre o valor de tabela
  r.ticket = r.faturamento / r.notas;
  r.clientes = r.porCliente.size;
  r.porClienteMedio = r.faturamento / r.clientes;
  r.ranking = [...r.porCliente.values()].sort((a, b) => b - a);
  r.top20 = r.ranking.slice(0, Math.ceil(r.ranking.length / 5)).reduce((a, b) => a + b, 0) / r.faturamento;   // NTILE(5)
  return r;
}

const comparacao = (ms) => {
  const antes = anterior(ms);
  const atual = indCom(ms), ant = antes && indCom(antes), rot = antes && rotuloPeriodo(antes);
  return { atual, ant, rot, d: (campo, tipo, sentido) => (ant ? delta(atual[campo], ant[campo], tipo, rot, sentido) : delta(0, null)) };
};
const cartao = (rotulo, valor, dl = {}) => ({ rotulo, valor, nota: dl.texto, classe: dl.classe });

/** Barras deitadas com duas séries por categoria: os nomes ficam à esquerda e cabem até no celular. */
function barrasDeitadasDuplas({ nomes, series, formato, destaque = null }) {
  return opcaoBase({
    grid: { left: 4, right: 48, top: 6, bottom: 4, containLabel: true },
    yAxis: eixoCategoria(nomes, { inverse: true }),
    xAxis: eixoValor(formato, { axisLabel: { show: false } }),     // cada barra já leva o próprio valor
    tooltip: { ...opcaoBase().tooltip, formatter: (ps) => dica(nomes[ps[0].dataIndex],
      series.map((s) => ({ cor: s.cor, valor: formato(s.valores[ps[0].dataIndex]), nome: s.nome.toLowerCase() }))) },
    series: series.map((s) => ({
      name: s.nome, type: "bar", barMaxWidth: 14, barGap: "15%", cursor: "pointer",
      data: barras(s.valores, s.cor, { deitado: true, destaque }).map((d, i) => ({
        ...d, label: { show: true, position: "right", distance: DISTANCIA_ROTULO, color: COR.texto, fontSize: 10, opacity: d.itemStyle.opacity < 1 ? 0.45 : 1, formatter: () => formato(s.valores[i]) },
      })),
    })),
  });
}

// ------------------------------------------------------------ página: Visão Geral
function visao() {
  const ms = periodo(), { atual: a, d } = comparacao(ms);
  cartoes("kpis-visao", [
    cartao("Faturamento", compacto(a.faturamento), d("faturamento", "%", 1)),
    cartao("Margem comercial", pct(a.margem), d("margem", "pp", 1)),
    cartao("Notas fiscais", inteiro(a.notas), d("notas", "%", 0)),
    cartao("Ticket médio por nota", reais(a.ticket), d("ticket", "%", 1)),
    cartao("Clientes que compraram", inteiro(a.clientes), d("clientes", "abs", 1)),
    cartao("Desconto médio", pct(a.descontoMedio), d("descontoMedio", "pp", -1)),
  ]);

  const doAno = mesesDoAno(estado.ano), porMes = doAno.map((m) => indCom([m]));
  desenhar("mes", {
    opcao: colunasMensais("mes", {
      meses: doAno,
      series: [{ nome: "Faturamento", valores: porMes.map((x) => x.faturamento), cor: COR.serie1 }],
      dicas: (i) => [{ valor: compacto(porMes[i].faturamento), nome: "faturamento" }, { valor: inteiro(porMes[i].notas), nome: "notas" },
                     { valor: reais(porMes[i].ticket), nome: "ticket médio" }],
    }),
    aoClicar: (p) => alternarMes(doAno[p.dataIndex]),
    tabela: { colunas: ["Mês", "Faturamento", "Notas", "Ticket médio", "Margem"],
              linhas: porMes.map((x, i) => [nomeMes(doAno[i]), reais(x.faturamento), inteiro(x.notas), reais(x.ticket), pct(x.margem)]) },
  });

  // Por tipo de cliente: o tipo é a dimensão do gráfico, então o filtro de tipo vira destaque
  const tipos = D.tipos_cliente.map((nome, t) => ({ nome, t, ...indCom(ms, { tipo: t }) })).filter((x) => x.faturamento > 0)
    .sort((x, y) => y.faturamento - x.faturamento);
  const destaqueTipo = estado.tipo == null ? null : tipos.findIndex((x) => x.t === estado.tipo);
  const clicarTipo = (p) => alternarTipo(tipos[p.dataIndex].t);
  desenhar("tipos", {
    opcao: barrasDeitadas({ nomes: tipos.map((x) => x.nome), valores: tipos.map((x) => x.faturamento), destaque: destaqueTipo, clicavel: true,
                            dicas: (i) => [{ valor: compacto(tipos[i].faturamento), nome: "faturamento" }, { valor: pct(tipos[i].faturamento / a.faturamento), nome: "do total" },
                                           { valor: inteiro(tipos[i].clientes), nome: "clientes" }] }),
    aoClicar: clicarTipo,
    tabela: { colunas: ["Tipo de cliente", "Faturamento", "% do total", "Clientes"],
              linhas: tipos.map((x) => [x.nome, reais(x.faturamento), pct(x.faturamento / a.faturamento), inteiro(x.clientes)]) },
  });
  desenhar("desconto-margem", {
    opcao: barrasDeitadasDuplas({
      nomes: tipos.map((x) => x.nome), formato: (v) => pct(v), destaque: destaqueTipo,
      series: [{ nome: "Margem comercial", valores: tipos.map((x) => x.margem), cor: COR.serie1 },
               { nome: "Desconto médio", valores: tipos.map((x) => x.descontoMedio), cor: COR.serie2 }],
    }),
    aoClicar: clicarTipo,
    tabela: { colunas: ["Tipo de cliente", "Margem comercial", "Desconto médio"], linhas: tipos.map((x) => [x.nome, pct(x.margem), pct(x.descontoMedio)]) },
  });

  const filiais = D.filiais.map((f) => ({ ...f, ...indCom(ms, { filial: f.id }) })).sort((x, y) => y.faturamento - x.faturamento);
  desenhar("filiais", {
    opcao: barrasDeitadas({ nomes: filiais.map((x) => x.nome), valores: filiais.map((x) => x.faturamento), clicavel: true,
                            destaque: estado.filial === 0 ? null : filiais.findIndex((x) => x.id === estado.filial),
                            dicas: (i) => [{ valor: compacto(filiais[i].faturamento), nome: "faturamento" }, { valor: pct(filiais[i].margem), nome: "margem" }] }),
    aoClicar: (p) => { const f = filiais[p.dataIndex].id; estado.filial = estado.filial === f ? 0 : f; atualizar(); },
    tabela: { colunas: ["Filial", "Faturamento", "Margem"], linhas: filiais.map((x) => [x.nome, reais(x.faturamento), pct(x.margem)]) },
  });

  const noPeriodo = new Set(ms), porCategoria = zeros(D.categorias.length);
  for (const [m, f, t, cat, fat] of D.mix) {
    if (noPeriodo.has(m) && (estado.filial === 0 || f === estado.filial) && (estado.tipo == null || t === estado.tipo)) porCategoria[cat] += fat;
  }
  const categorias = D.categorias.map((nome, i) => ({ nome, valor: porCategoria[i] })).filter((x) => x.valor > 0).sort((x, y) => y.valor - x.valor);
  const totalMix = categorias.reduce((s, x) => s + x.valor, 0);
  desenhar("categorias", {
    opcao: barrasDeitadas({ nomes: categorias.map((x) => x.nome), valores: categorias.map((x) => x.valor),
                            dicas: (i) => [{ valor: compacto(categorias[i].valor), nome: "faturamento" }, { valor: pct(categorias[i].valor / totalMix), nome: "do total" }] }),
    tabela: { colunas: ["Categoria", "Faturamento", "% do total"], linhas: categorias.map((x) => [x.nome, reais(x.valor), pct(x.valor / totalMix)]) },
  });
}

// ------------------------------------------------------------ página: Vendedores
function vendedores() {
  const ms = periodo(), antes = anterior(ms), geral = indCom(ms);
  const lista = D.vendedores.map((v, i) => ({ ...v, i, ...indCom(ms, {}, i), ant: antes ? indCom(antes, {}, i) : null }))
    .filter((v) => v.faturamento > 0).sort((x, y) => y.faturamento - x.faturamento);
  cartoes("kpis-vendedores", [
    cartao("Vendedores com venda", inteiro(lista.length)),
    cartao("Faturamento médio por vendedor", compacto(geral.faturamento / lista.length)),
    cartao("Clientes por vendedor", numero(lista.reduce((s, v) => s + v.clientes, 0) / lista.length, 1), { texto: "média da carteira atendida" }),
    cartao("Desconto médio", pct(geral.descontoMedio), { texto: `de ${pct(Math.min(...lista.map((v) => v.descontoMedio)))} a ${pct(Math.max(...lista.map((v) => v.descontoMedio)))} entre vendedores` }),
  ]);

  const top = lista.slice(0, 15);
  desenhar("ranking", top.length ? {
    opcao: barrasDeitadas({ nomes: top.map((v) => v.nome), valores: top.map((v) => v.faturamento),
                            dicas: (i) => [{ valor: compacto(top[i].faturamento), nome: "faturamento" }, { valor: pct(top[i].margem), nome: "margem" },
                                           { valor: pct(top[i].descontoMedio), nome: "desconto médio" }, { valor: inteiro(top[i].clientes), nome: "clientes" }] }),
    tabela: { colunas: ["Vendedor", "Faturamento"], linhas: top.map((v) => [v.nome, reais(v.faturamento)]) },
  } : { vazio: "Nenhuma venda no recorte escolhido." });

  document.getElementById("sub-vendedores").textContent = `${lista.length} vendedores com venda no período, do que mais faturou para o que menos faturou`;
  const tabela = tabelaDados({
    colunas: ["Vendedor", "Cargo", "Faturamento", antes ? `vs ${rotuloPeriodo(antes)}` : "vs ano anterior", "Notas", "Ticket médio", "Desconto", "Margem", "Clientes"],
    linhas: lista.map((v) => [v.nome, v.cargo, reais(v.faturamento),
      v.ant && v.ant.faturamento > 0 ? pct(v.faturamento / v.ant.faturamento - 1) : "—",
      inteiro(v.notas), reais(v.ticket), pct(v.descontoMedio), pct(v.margem), inteiro(v.clientes)]),
  });
  document.getElementById("tabela-vendedores").replaceChildren(...tabela.childNodes);
}

// ------------------------------------------------------------ página: Clientes
function clientes() {
  const ms = periodo(), { atual: a, ant, rot, d } = comparacao(ms);
  const agora = new Set(a.porCliente.keys()), antes = ant ? new Set(ant.porCliente.keys()) : null;
  const novos = antes ? [...agora].filter((c) => !antes.has(c)).length : null;
  const perdidos = antes ? [...antes].filter((c) => !agora.has(c)).length : null;

  // Recência na data de corte, entre os clientes do filtro que já compraram
  const corte = new Date(`${D.data_corte}T00:00:00`);
  const comCompra = D.clientes.map((c, i) => ({ ...c, i })).filter((c) => c.ultima_compra && noFiltro(c.i))
    .map((c) => ({ ...c, dias: Math.round((corte - new Date(`${c.ultima_compra}T00:00:00`)) / 86400000) }));
  const parados = comCompra.filter((c) => c.dias > 90);

  cartoes("kpis-clientes", [
    cartao("Clientes que compraram", inteiro(a.clientes), d("clientes", "abs", 1)),
    cartao("Clientes novos", novos == null ? "—" : inteiro(novos), { texto: antes ? `não compraram em ${rot}` : "primeiro ano da série" }),
    cartao("Clientes perdidos", perdidos == null ? "—" : inteiro(perdidos), { texto: antes ? `compraram em ${rot} e não agora` : "primeiro ano da série",
                                                                             classe: perdidos > novos ? "ruim" : "" }),
    cartao("Sem compra há mais de 90 dias", inteiro(parados.length), { texto: "em 31/12/2025" }),
    cartao("Faturamento dos 20% maiores", pct(a.top20, 0), d("top20", "pp", 0)),
    cartao("Faturamento médio por cliente", compacto(a.porClienteMedio), d("porClienteMedio", "%", 1)),
  ]);

  // Curva de concentração: % acumulado do faturamento pela % de clientes, do maior para o menor
  let acumulado = 0;
  const pontos = a.ranking.map((v, i) => { acumulado += v; return [(i + 1) / a.ranking.length, acumulado / a.faturamento]; });
  const marco = Math.ceil(a.ranking.length / 5) - 1;
  desenhar("concentracao", pontos.length ? {
    opcao: opcaoBase({
      grid: { left: 4, right: 24, top: 24, bottom: 4, containLabel: true },
      xAxis: { type: "value", min: 0, max: 1, axisLine: { lineStyle: { color: COR.eixo } }, splitLine: { show: false },
               axisLabel: { color: COR.suave, fontSize: 11, formatter: pctEixo } },
      yAxis: eixoValor(pctEixo, { max: 1 }),
      tooltip: { ...opcaoBase().tooltip, trigger: "axis", axisPointer: { type: "line", lineStyle: { color: COR.eixo } },
                 formatter: ([p]) => dica(`${pct(p.value[0], 0)} dos clientes`, [{ valor: pct(p.value[1]), nome: "do faturamento" }]) },
      series: [{
        type: "line", symbol: "none", lineStyle: { width: 2, color: COR.serie1 }, areaStyle: { color: "rgba(42,120,214,0.10)" },
        data: pontos.map((p, i) => (i === marco ? { value: p, symbol: "circle", symbolSize: 8, itemStyle: { color: COR.serie1 },
          label: { show: true, position: "right", distance: 8, color: COR.texto, fontSize: 11, formatter: () => `${pct(p[0], 0)} dos clientes = ${pct(p[1], 0)}` } } : p)),
      }],
    }),
    tabela: { colunas: ["Clientes", "Faturamento acumulado"],
              linhas: [0.1, 0.2, 0.3, 0.5, 0.8, 1].map((q) => { const i = Math.max(0, Math.ceil(q * pontos.length) - 1); return [pct(pontos[i][0], 0), pct(pontos[i][1])]; }) },
  } : { vazio: "Nenhuma venda no recorte escolhido." });

  const porFaixa = RECENCIA.map(([nome, limite], i) => ({ nome, n: comCompra.filter((c) => c.dias <= limite && (i === 0 || c.dias > RECENCIA[i - 1][1])).length }));
  desenhar("recencia", {
    opcao: opcaoBase({
      grid: { left: 4, right: 16, top: 24, bottom: 4, containLabel: true },
      xAxis: eixoCategoria(porFaixa.map((x) => x.nome), { axisLabel: { color: COR.suave, fontSize: 10, interval: 0, formatter: (t) => t.replace(/ (dias|ano)$/, "\n$1") } }),
      yAxis: eixoValor(inteiro),
      tooltip: { ...opcaoBase().tooltip, formatter: ([p]) => dica(porFaixa[p.dataIndex].nome, [
        { valor: inteiro(porFaixa[p.dataIndex].n), nome: "clientes" }, { valor: pct(porFaixa[p.dataIndex].n / comCompra.length), nome: "dos clientes" }]) },
      series: [{ type: "bar", barMaxWidth: 32,
        data: porFaixa.map((x, i) => ({ value: x.n, itemStyle: { color: COR.rampa[i], borderRadius: [4, 4, 0, 0] } })),
        label: { show: true, position: "top", distance: DISTANCIA_ROTULO, color: COR.texto, fontSize: 11, formatter: (p) => inteiro(p.value) } }],
    }),
    tabela: { colunas: ["Última compra", "Clientes", "% dos clientes"], linhas: porFaixa.map((x) => [x.nome, inteiro(x.n), pct(x.n / comCompra.length)]) },
  });

  // Quem parou de comprar, dos que mais compravam para os que menos compravam (os primeiros 30)
  const lista = parados.map((c) => ({ ...c, total: faturamentoTotal[c.i] })).sort((x, y) => y.total - x.total);
  document.getElementById("sub-risco").textContent = lista.length
    ? `${lista.length} clientes sem compra há mais de 90 dias${lista.length > 30 ? ". A lista mostra os 30 que mais compravam" : ", dos que mais compravam para os que menos compravam"}`
    : "Nenhum cliente sem compra há mais de 90 dias no recorte escolhido";
  const tabela = tabelaDados({
    colunas: ["Cliente", "Tipo", "Cidade", "Última compra", "Dias sem comprar", "Faturamento em 2024 e 2025"],
    linhas: lista.slice(0, 30).map((c) => [c.nome, D.tipos_cliente[c.tipo], c.cidade, dataBr(c.ultima_compra), inteiro(c.dias), reais(c.total)]),
  });
  document.getElementById("tabela-risco").replaceChildren(...tabela.childNodes);
}

// ------------------------------------------------------------ estado e interação
const PAGINAS = { visao, vendedores, clientes };

function alternarTipo(t) { estado.tipo = estado.tipo === t ? null : t; atualizar(); }

function atualizar() {
  const anos = [...new Set(D.meses.map((m) => Number(m.slice(0, 4))))];
  botoesFiltro("filtro-ano", "Ano", anos.map((a) => [a, String(a)]), estado.ano, (a) => { estado.ano = a; estado.mes = null; atualizar(); });
  botoesFiltro("filtro-filial", "Filial", [[0, "Todas"], ...D.filiais.map((f) => [f.id, f.nome])], estado.filial,
    (f) => { estado.filial = f; atualizar(); });
  listaFiltro("filtro-tipo", "Tipo de cliente", [[-1, "Todos"], ...D.tipos_cliente.map((t, i) => [i, t])], estado.tipo ?? -1,
    (t) => { estado.tipo = t < 0 ? null : t; atualizar(); });
  mostrarPagina(estado.mes == null ? null : nomeMes(estado.mes));
}

iniciarPainel({
  arquivo: "assets/data/comercial.json",
  aoCarregar: () => {
    faturamentoTotal = zeros(D.clientes.length);
    for (const [, c, , , fat] of D.vendas) faturamentoTotal[c] += fat;
  },
  limparSelecao: () => { estado.mes = null; },
});
