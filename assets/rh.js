// Painel People Analytics interativo: lê o JSON exportado do SQL Server (python/exportar_web.py)
// e recalcula no navegador os mesmos indicadores das medidas DAX do Power BI.

const estado = { ano: 2025, filial: 0, setor: null, mes: null, aba: "visao" };
const inteiro = (v) => numero(Math.round(v));
const horas = (v) => (isFinite(v) ? `${numero(v, 1)} h` : "—");

// ------------------------------------------------------------ dados
/** Indicadores de RH de um conjunto de meses, com as mesmas regras das medidas DAX. */
function indRH(ms, { setor = estado.setor, filial = estado.filial, cargo = null } = {}) {
  const noPeriodo = new Set(ms);
  const ok = (l) => noPeriodo.has(l[0]) && (setor == null || l[1] === setor) && (filial === 0 || l[2] === filial)
    && (cargo == null || l[3] === cargo);
  const r = { admissoes: 0, desligamentos: 0, voluntarios: 0, experiencia: 0, primeiroAno: 0,
              porFaixa: zeros(D.faixas_tempo_casa.length), porMotivo: zeros(D.motivos.length),
              previstos: 0, ausencias: 0, faltas: 0, atestados: 0, horasExtras: 0, pessoasMes: 0, custo: 0,
              saiu: { faltas: 0, ausencias: 0, previstos: 0, pessoasMes: 0 }, ficou: { faltas: 0, ausencias: 0, previstos: 0, pessoasMes: 0 } };

  // Headcount é saldo (último mês); a base do turnover é a média mensal de (início + fim) ÷ 2
  const porMes = new Map();
  for (const l of D.quadro) {
    if (!ok(l)) continue;
    const x = porMes.get(l[0]) || [0, 0];
    x[0] += l[4]; x[1] += l[5];
    porMes.set(l[0], x);
    r.admissoes += l[6]; r.desligamentos += l[7]; r.voluntarios += l[8];
  }
  const meses = [...porMes.keys()].sort((a, b) => a - b);
  const pessoasMedias = meses.map((m) => (porMes.get(m)[0] + porMes.get(m)[1]) / 2);
  r.headcount = meses.length ? porMes.get(meses[meses.length - 1])[1] : 0;
  r.headcountMedio = meses.length ? pessoasMedias.reduce((a, b) => a + b, 0) / meses.length : 0;

  for (const l of D.desligados) {
    if (!ok(l)) continue;
    r.porFaixa[l[4]]++; r.porMotivo[l[5]]++;
    if (l[7] < 3) r.experiencia++;
    if (l[7] < 12) r.primeiroAno++;
  }
  if (cargo == null) {           // ponto e custo não são abertos por cargo
    for (const l of D.ponto) {
      if (!ok(l)) continue;
      const [, , , saiu, previstos, faltas, atestados, he, pessoas] = l;
      r.previstos += previstos; r.faltas += faltas; r.atestados += atestados; r.horasExtras += he; r.pessoasMes += pessoas;
      const g = saiu ? r.saiu : r.ficou;
      g.faltas += faltas; g.ausencias += faltas + atestados; g.previstos += previstos; g.pessoasMes += pessoas;
    }
    for (const l of D.custo) if (ok(l)) r.custo += l[3];
  }
  r.turnover = r.desligamentos / r.headcountMedio;
  r.turnoverVoluntario = r.voluntarios / r.headcountMedio;
  r.pctPrimeiroAno = r.primeiroAno / r.desligamentos;
  r.pctExperiencia = r.experiencia / r.desligamentos;
  r.absenteismo = (r.faltas + r.atestados) / r.previstos;
  r.hePorPessoa = r.horasExtras / r.pessoasMes;
  r.custoPorPessoa = r.custo / pessoasMedias.reduce((a, b) => a + b, 0);
  for (const g of [r.saiu, r.ficou]) { g.faltasPorMes = g.faltas / g.pessoasMes; g.absenteismo = g.ausencias / g.previstos; }
  return r;
}

/** Valores de todos os setores (ignorando o filtro de setor), do maior para o menor. */
function porSetor(ms, campo) {
  return D.setores.map((nome, s) => ({ nome, s, valor: indRH(ms, { setor: s })[campo] }))
    .filter((x) => isFinite(x.valor)).sort((a, b) => b.valor - a.valor);
}

function graficoSetores(chave, ms, campo, formato, dicas) {
  const lista = porSetor(ms, campo);
  const destaque = estado.setor == null ? null : lista.findIndex((x) => x.s === estado.setor);
  desenhar(chave, {
    opcao: barrasDeitadas({ nomes: lista.map((x) => x.nome), valores: lista.map((x) => x.valor), formato, destaque, clicavel: true,
                            dicas: (i) => dicas(lista[i]) }),
    aoClicar: (p) => alternarSetor(lista[p.dataIndex].s),
    tabela: { colunas: ["Setor", "Valor"], linhas: lista.map((x) => [x.nome, formato(x.valor)]) },
  });
}

const comparacao = (ms) => {
  const antes = anterior(ms);
  const atual = indRH(ms), ant = antes && indRH(antes), rot = antes && rotuloPeriodo(antes);
  return { atual, d: (campo, tipo, sentido) => (ant ? delta(atual[campo], ant[campo], tipo, rot, sentido) : delta(0, null)) };
};
const cartao = (rotulo, valor, dl = {}) => ({ rotulo, valor, nota: dl.texto, classe: dl.classe });

// ------------------------------------------------------------ página: Visão Geral
function visao() {
  const ms = periodo(), { atual: a, d } = comparacao(ms);
  cartoes("kpis-visao", [
    cartao("Headcount no fim do período", inteiro(a.headcount), d("headcount", "abs", 0)),
    cartao("Admissões", inteiro(a.admissoes), d("admissoes", "abs", 0)),
    cartao("Desligamentos", inteiro(a.desligamentos), d("desligamentos", "abs", -1)),
    cartao("Turnover", pct(a.turnover), d("turnover", "pp", -1)),
    cartao("Absenteísmo", pct(a.absenteismo), d("absenteismo", "pp", -1)),
    cartao("Custo de pessoal", compacto(a.custo), d("custo", "%", 0)),
  ]);

  const doAno = mesesDoAno(estado.ano), porMes = doAno.map((m) => indRH([m]));
  const clicarMes = (p) => alternarMes(doAno[p.dataIndex]);
  desenhar("movimento", {
    opcao: colunasMensais("movimento", {
      meses: doAno, formato: inteiro, eixo: inteiro,
      series: [{ nome: "Admissões", valores: porMes.map((x) => x.admissoes), cor: COR.serie1 },
               { nome: "Desligamentos", valores: porMes.map((x) => x.desligamentos), cor: COR.serie2 }],
      dicas: (i) => [{ cor: COR.serie1, valor: inteiro(porMes[i].admissoes), nome: "admissões" },
                     { cor: COR.serie2, valor: inteiro(porMes[i].desligamentos), nome: "desligamentos" }],
    }),
    aoClicar: clicarMes,
    tabela: { colunas: ["Mês", "Admissões", "Desligamentos"], linhas: porMes.map((x, i) => [nomeMes(doAno[i]), inteiro(x.admissoes), inteiro(x.desligamentos)]) },
  });
  desenhar("headcount", {
    opcao: colunasMensais("headcount", {
      meses: doAno, formato: inteiro, eixo: inteiro,
      series: [{ nome: "Headcount", valores: porMes.map((x) => x.headcount), cor: COR.serie1 }],
      dicas: (i) => [{ valor: inteiro(porMes[i].headcount), nome: "pessoas no fim do mês" }, { valor: pct(porMes[i].turnover), nome: "turnover do mês" }],
    }),
    aoClicar: clicarMes,
    tabela: { colunas: ["Mês", "Headcount", "Turnover do mês"], linhas: porMes.map((x, i) => [nomeMes(doAno[i]), inteiro(x.headcount), pct(x.turnover)]) },
  });
  graficoSetores("setor-hc", ms, "headcount", inteiro, (x) => [{ valor: inteiro(x.valor), nome: "pessoas no fim do período" }]);
  graficoSetores("setor-custo", ms, "custo", rotuloValor, (x) => {
    const r = indRH(ms, { setor: x.s });
    return [{ valor: reais(x.valor), nome: "custo de pessoal" }, { valor: reais(r.custoPorPessoa), nome: "por pessoa por mês" }];
  });
}

// ------------------------------------------------------------ página: Rotatividade
function rotatividade() {
  const ms = periodo(), { atual: a, d } = comparacao(ms);
  cartoes("kpis-rotatividade", [
    cartao("Turnover", pct(a.turnover), d("turnover", "pp", -1)),
    cartao("Turnover voluntário", pct(a.turnoverVoluntario), d("turnoverVoluntario", "pp", -1)),
    cartao("Saídas no 1º ano de casa", pct(a.pctPrimeiroAno), { texto: `${inteiro(a.primeiroAno)} de ${inteiro(a.desligamentos)} desligamentos` }),
    cartao("Saídas na experiência", pct(a.pctExperiencia), { texto: `${inteiro(a.experiencia)} com menos de 3 meses` }),
  ]);

  graficoSetores("turnover-setor", ms, "turnover", (v) => pct(v), (x) => {
    const r = indRH(ms, { setor: x.s });
    return [{ valor: pct(x.valor), nome: "turnover" }, { valor: inteiro(r.desligamentos), nome: "desligamentos" }, { valor: numero(r.headcountMedio, 1), nome: "headcount médio" }];
  });

  const faixas = D.faixas_tempo_casa, total = a.desligamentos;
  desenhar("tempo-casa", {
    opcao: opcaoBase({
      grid: { left: 4, right: 16, top: 24, bottom: 4, containLabel: true },
      xAxis: eixoCategoria(faixas, { axisLabel: { color: COR.suave, fontSize: 11, interval: 0, formatter: (t) => t.replace(/ (meses|anos)$/, "\n$1") } }),
      yAxis: eixoValor(inteiro),
      tooltip: { ...opcaoBase().tooltip, formatter: ([p]) => dica(faixas[p.dataIndex], [
        { valor: inteiro(a.porFaixa[p.dataIndex]), nome: "desligamentos" }, { valor: pct(a.porFaixa[p.dataIndex] / total), nome: "das saídas" }]) },
      series: [{ type: "bar", barMaxWidth: 32,
        data: Array.from(a.porFaixa, (v, i) => ({ value: v, itemStyle: { color: COR.rampa[i], borderRadius: [4, 4, 0, 0] } })),
        label: { show: true, position: "top", color: COR.texto, fontSize: 11, formatter: (p) => inteiro(p.value) } }],
    }),
    tabela: { colunas: ["Tempo de casa", "Desligamentos", "% das saídas"], linhas: faixas.map((f, i) => [f, inteiro(a.porFaixa[i]), pct(a.porFaixa[i] / total)]) },
  });

  const motivos = D.motivos.map((m, i) => ({ ...m, valor: a.porMotivo[i] })).filter((m) => m.valor > 0).sort((x, y) => y.valor - x.valor);
  desenhar("motivos", motivos.length ? {
    opcao: barrasDeitadas({ nomes: motivos.map((m) => m.nome), valores: motivos.map((m) => m.valor), formato: inteiro,
                            cor: (v, i) => (motivos[i].voluntario ? COR.serie2 : COR.serie1),
                            dicas: (i) => [{ valor: inteiro(motivos[i].valor), nome: motivos[i].voluntario ? "voluntários" : "involuntários" },
                                           { valor: pct(motivos[i].valor / total), nome: "das saídas" }] }),
    tabela: { colunas: ["Motivo", "Tipo", "Desligamentos"], linhas: motivos.map((m) => [m.nome, m.voluntario ? "Voluntário" : "Involuntário", inteiro(m.valor)]) },
  } : { vazio: "Nenhum desligamento no período escolhido." });

  // Tabela por cargo: turnover sobre o headcount médio do próprio cargo
  const cargos = D.cargos.map((nome, c) => ({ nome, ...indRH(ms, { cargo: c }) }))
    .filter((c) => c.desligamentos > 0).sort((x, y) => y.desligamentos - x.desligamentos || y.turnover - x.turnover);
  const tabela = tabelaDados({
    colunas: ["Cargo", "Headcount médio", "Desligamentos", "Voluntários", "Turnover"],
    linhas: cargos.map((c) => [c.nome, numero(c.headcountMedio, 1), inteiro(c.desligamentos), inteiro(c.voluntarios), pct(c.turnover)]),
  });
  document.getElementById("tabela-cargos").replaceChildren(...tabela.childNodes);
  document.getElementById("sub-cargos").textContent = cargos.length
    ? `${cargos.length} cargos com desligamento no período, do que mais perdeu gente para o que menos perdeu`
    : "Nenhum desligamento no período escolhido";
}

// ------------------------------------------------------------ página: Absenteísmo e Horas Extras
function absenteismo() {
  const ms = periodo(), { atual: a, d } = comparacao(ms);
  cartoes("kpis-absenteismo", [
    cartao("Absenteísmo", pct(a.absenteismo), d("absenteismo", "pp", -1)),
    cartao("Faltas (dias)", inteiro(a.faltas), d("faltas", "%", -1)),
    cartao("Dias de atestado", inteiro(a.atestados), d("atestados", "%", -1)),
    cartao("Horas extras", inteiro(a.horasExtras), d("horasExtras", "%", -1)),
    cartao("Horas extras por pessoa por mês", horas(a.hePorPessoa), d("hePorPessoa", "%", -1)),
    cartao("Custo médio por pessoa por mês", reais(a.custoPorPessoa), d("custoPorPessoa", "%", 0)),
  ]);

  graficoSetores("abs-setor", ms, "absenteismo", (v) => pct(v), (x) => {
    const r = indRH(ms, { setor: x.s });
    return [{ valor: pct(x.valor), nome: "absenteísmo" }, { valor: inteiro(r.faltas), nome: "faltas" }, { valor: inteiro(r.atestados), nome: "dias de atestado" }];
  });
  graficoSetores("he-setor", ms, "hePorPessoa", horas, (x) => {
    const r = indRH(ms, { setor: x.s });
    return [{ valor: horas(x.valor), nome: "por pessoa por mês" }, { valor: inteiro(r.horasExtras), nome: "horas extras no período" }];
  });

  const doAno = mesesDoAno(estado.ano), porMes = doAno.map((m) => indRH([m]));
  desenhar("he-mes", {
    opcao: colunasMensais("he-mes", {
      meses: doAno, formato: inteiro, eixo: inteiro,
      series: [{ nome: "Horas extras", valores: porMes.map((x) => x.horasExtras), cor: COR.serie1 }],
      dicas: (i) => [{ valor: inteiro(porMes[i].horasExtras), nome: "horas extras" }, { valor: horas(porMes[i].hePorPessoa), nome: "por pessoa" }],
    }),
    aoClicar: (p) => alternarMes(doAno[p.dataIndex]),
    tabela: { colunas: ["Mês", "Horas extras", "Por pessoa"], linhas: porMes.map((x, i) => [nomeMes(doAno[i]), inteiro(x.horasExtras), horas(x.hePorPessoa)]) },
  });

  const grupos = [{ nome: "Quem saiu", ...a.saiu, cor: COR.serie2 }, { nome: "Quem ficou", ...a.ficou, cor: COR.serie1 }];
  const amais = a.saiu.faltasPorMes / a.ficou.faltasPorMes - 1;
  document.getElementById("sub-saiu").textContent = isFinite(amais)
    ? `Quem saiu faltava ${pct(Math.abs(amais), 0)} ${amais >= 0 ? "a mais" : "a menos"} que quem ficou, nos meses em que trabalhou`
    : "Sem desligados no recorte escolhido";
  desenhar("saiu-ficou", a.saiu.pessoasMes && a.ficou.pessoasMes ? {
    opcao: barrasDeitadas({ nomes: grupos.map((g) => g.nome), valores: grupos.map((g) => g.faltasPorMes), formato: (v) => numero(v, 2),
                            cor: (v, i) => grupos[i].cor,
                            dicas: (i) => [{ valor: numero(grupos[i].faltasPorMes, 2), nome: "faltas por mês trabalhado" },
                                           { valor: pct(grupos[i].absenteismo), nome: "absenteísmo" }] }),
    tabela: { colunas: ["Grupo", "Faltas por mês", "Absenteísmo"], linhas: grupos.map((g) => [g.nome, numero(g.faltasPorMes, 2), pct(g.absenteismo)]) },
  } : { vazio: "Sem desligados no recorte escolhido." });
}

// ------------------------------------------------------------ estado e interação
const PAGINAS = { visao, rotatividade, absenteismo };

function alternarSetor(s) { estado.setor = estado.setor === s ? null : s; atualizar(); }

function atualizar() {
  const anos = [...new Set(D.meses.map((m) => Number(m.slice(0, 4))))];
  botoesFiltro("filtro-ano", "Ano", anos.map((a) => [a, String(a)]), estado.ano, (a) => { estado.ano = a; estado.mes = null; atualizar(); });
  botoesFiltro("filtro-filial", "Filial", [[0, "Todas"], ...D.filiais.map((f) => [f.id, f.nome])], estado.filial,
    (f) => { estado.filial = f; atualizar(); });
  listaFiltro("filtro-setor", "Setor", [[-1, "Todos"], ...D.setores.map((s, i) => [i, s])], estado.setor ?? -1,
    (s) => { estado.setor = s < 0 ? null : s; atualizar(); });
  mostrarPagina(estado.mes == null ? null : nomeMes(estado.mes));
}

iniciarPainel({ arquivo: "assets/data/rh.json", limparSelecao: () => { estado.mes = null; } });
