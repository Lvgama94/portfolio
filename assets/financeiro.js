// Painel Financeiro interativo: lê o JSON exportado do SQL Server (python/exportar_web.py)
// e recalcula no navegador os mesmos indicadores das medidas DAX do Power BI.

const estado = { ano: 2025, filial: 0, mes: null, aba: "resumo", tipo: null };
const abertos = new Set();        // grupos abertos na DRE
let cubo;

// ------------------------------------------------------------ dados
function montarCubo() {
  const nF = D.filiais.length + 1, nM = D.meses.length;   // filial 0 = todas
  const c = {
    dre: grade(nF, nM, D.contas.length),
    orc: Array.from({ length: nM }, () => zeros(D.contas.length)),
    rec: grade(nF, nM, 4),                                 // recebido, valor, valor × prazo real, valor × prazo concedido
    pag: grade(nF, nM, D.grupos_caixa.length),
    pmp: grade(nF, nM, 2),                                 // valor das compras de mercadoria, valor × prazo real
    cart: grade(nF, D.tipos_cliente.length, D.faixas_aging.length),
  };
  for (const [m, f, conta, v] of D.dre) for (const x of [f, 0]) c.dre[x][m][conta] += v;
  for (const [m, conta, v] of D.orcamento) c.orc[m][conta] += v;
  for (const [m, f, ...vals] of D.recebido) for (const x of [f, 0]) vals.forEach((v, i) => (c.rec[x][m][i] += v));
  for (const [m, f, g, p, v, vp] of D.pago) for (const x of [f, 0]) { c.pag[x][m][g] += p; c.pmp[x][m][0] += v; c.pmp[x][m][1] += vp; }
  for (const [f, t, a, v] of D.carteira) for (const x of [f, 0]) c.cart[x][t][a] += v;
  return c;
}

/** Indicadores de um conjunto de meses, com as mesmas regras das medidas DAX. */
function indicadores(ms, f = estado.filial) {
  const r = { bruta: 0, deducoes: 0, cmv: 0, despesas: 0, resultado: 0, receitaOrcada: 0, resultadoOrcado: 0,
              recebido: 0, recValor: 0, recPrazo: 0, recConcedido: 0, pago: 0, pagValor: 0, pagPrazo: 0 };
  for (const m of ms) {
    D.contas.forEach((conta, i) => {
      const v = cubo.dre[f][m][i], o = cubo.orc[m][i];
      r.resultado += v * conta.sinal;
      r.resultadoOrcado += o * conta.sinal;
      if (conta.cod === "3.01") { r.bruta += v; r.receitaOrcada += o; }
      else if (conta.grupo === "Deduções da receita") r.deducoes += v;
      else if (conta.grupo === "CMV") r.cmv += v;
      else if (conta.ordem >= 4 && conta.ordem <= 7) r.despesas += v;
    });
    const [rec, val, prazo, concedido] = cubo.rec[f][m];
    r.recebido += rec; r.recValor += val; r.recPrazo += prazo; r.recConcedido += concedido;
    r.pago += cubo.pag[f][m].reduce((a, b) => a + b, 0);
    r.pagValor += cubo.pmp[f][m][0]; r.pagPrazo += cubo.pmp[f][m][1];
  }
  r.liquida = r.bruta - r.deducoes;
  r.lucroBruto = r.liquida - r.cmv;
  r.margemBruta = r.lucroBruto / r.liquida;
  r.margemLiquida = r.resultado / r.liquida;
  r.temOrcamento = f === 0;                     // o orçamento não é aberto por filial
  r.atingimento = r.temOrcamento ? r.bruta / r.receitaOrcada : null;
  r.desvio = r.temOrcamento ? r.resultado - r.resultadoOrcado : null;
  r.geracao = r.recebido - r.pago;
  r.pmr = r.recPrazo / r.recValor;
  r.pmp = r.pagPrazo / r.pagValor;
  return r;
}

/** Fotografia da carteira em aberto, por filial e (opcionalmente) tipo de cliente. */
function carteira(f = estado.filial, tipo = estado.tipo) {
  const porFaixa = zeros(D.faixas_aging.length);
  cubo.cart[f].forEach((faixas, t) => { if (tipo == null || tipo === t) faixas.forEach((v, a) => (porFaixa[a] += v)); });
  const total = porFaixa.reduce((a, b) => a + b, 0);
  const vencido = total - porFaixa[D.faixas_aging.indexOf("A vencer")];
  return { porFaixa, total, vencido, acima90: porFaixa[D.faixas_aging.indexOf("Mais de 90 dias")], inadimplencia: vencido / total };
}

// ------------------------------------------------------------ página: Resumo
function resumo() {
  const ms = periodo(), atual = indicadores(ms), antes = anterior(ms), ant = antes && indicadores(antes);
  const rotAnt = antes && rotuloPeriodo(antes);
  const d = (campo, tipo) => (ant ? delta(atual[campo], ant[campo], tipo, rotAnt) : delta(0, null));
  const k = (rotulo, valor, dl) => ({ rotulo, valor, nota: dl.texto, classe: dl.classe });
  cartoes("kpis-resumo", [
    k("Receita líquida", compacto(atual.liquida), d("liquida")),
    k("Margem bruta", pct(atual.margemBruta), d("margemBruta", "pp")),
    k("Resultado líquido", compacto(atual.resultado), d("resultado")),
    k("Margem líquida", pct(atual.margemLiquida), d("margemLiquida", "pp")),
    atual.temOrcamento
      ? { rotulo: "Atingimento da receita", valor: pct(atual.atingimento), classe: atual.atingimento >= 1 ? "bom" : "ruim",
          nota: `${atual.atingimento >= 1 ? "▲" : "▼"} orçado: ${compacto(atual.receitaOrcada)}` }
      : { rotulo: "Atingimento da receita", valor: "—", nota: "orçamento só para a empresa toda" },
    { rotulo: "Geração de caixa", valor: compacto(atual.geracao), nota: "recebido − pago" },
  ]);

  const doAno = mesesDoAno(estado.ano), porMes = doAno.map((m) => indicadores([m]));
  const destaque = estado.mes == null ? null : doAno.indexOf(estado.mes);
  const rotulos = doAno.map((m) => MESES[Number(D.meses[m].slice(5)) - 1]);
  const clicarMes = (p) => alternarMes(doAno[p.dataIndex]);

  const receitas = porMes.map((x) => x.liquida), modoReceita = modoRotulos("receita", receitas.length, 1, receitas.map(rotuloValor));
  const espacoReceita = espacoRotulos(modoReceita.girar, receitas);
  desenhar("receita", {
    opcao: opcaoBase({
      grid: espacoReceita.grid,
      xAxis: eixoCategoria(rotulos), yAxis: eixoValor(eixoReais, { boundaryGap: espacoReceita.margem }),
      tooltip: { ...opcaoBase().tooltip, formatter: ([p]) => dica(nomeMes(doAno[p.dataIndex]), [
        { valor: compacto(porMes[p.dataIndex].liquida), nome: "receita líquida" },
        { valor: pct(porMes[p.dataIndex].margemLiquida), nome: "margem líquida" }]) },
      series: [{ type: "bar", barMaxWidth: 24, cursor: "pointer", data: barras(receitas, COR.serie1, { destaque, ...modoReceita.serie(0) }) }],
    }),
    aoClicar: clicarMes,
    tabela: { colunas: ["Mês", "Receita líquida", "Margem líquida"],
              linhas: porMes.map((x, i) => [nomeMes(doAno[i]), reais(x.liquida), pct(x.margemLiquida)]) },
  });

  const comOrcamento = estado.filial === 0;
  document.getElementById("sub-resultado").textContent = comOrcamento ? "Por mês · clique num mês para filtrar" : "O orçamento não é aberto por filial: só o realizado aparece";
  const realizados = porMes.map((x) => x.resultado), orcados = comOrcamento ? porMes.map((x) => x.resultadoOrcado) : [];
  const modoResultado = modoRotulos("resultado", realizados.length, comOrcamento ? 2 : 1, [...realizados, ...orcados].map(rotuloValor));
  const espacoResultado = espacoRotulos(modoResultado.girar, [...realizados, ...orcados]);
  const series = [{ name: "Realizado", type: "bar", barMaxWidth: 24, barGap: "10%", cursor: "pointer", data: barras(realizados, COR.serie1, { destaque, ...modoResultado.serie(0) }) }];
  if (comOrcamento) series.push({ name: "Orçado", type: "bar", barMaxWidth: 24, cursor: "pointer",
                                  data: barras(orcados, COR.serie2, { destaque, ...modoResultado.serie(1) }) });
  desenhar("resultado", {
    opcao: opcaoBase({
      grid: espacoResultado.grid,
      xAxis: eixoCategoria(rotulos), yAxis: eixoValor(eixoReais, { boundaryGap: espacoResultado.margem }),
      tooltip: { ...opcaoBase().tooltip, formatter: (ps) => {
        const x = porMes[ps[0].dataIndex];
        const linhas = [{ cor: COR.serie1, valor: compacto(x.resultado), nome: "realizado" }];
        if (comOrcamento) linhas.push({ cor: COR.serie2, valor: compacto(x.resultadoOrcado), nome: "orçado" }, { valor: compacto(x.desvio), nome: "desvio" });
        return dica(nomeMes(doAno[ps[0].dataIndex]), linhas);
      } },
      series,
    }),
    aoClicar: clicarMes,
    tabela: { colunas: comOrcamento ? ["Mês", "Realizado", "Orçado", "Desvio"] : ["Mês", "Realizado"],
              linhas: porMes.map((x, i) => [nomeMes(doAno[i]), reais(x.resultado), ...(comOrcamento ? [reais(x.resultadoOrcado), reais(x.desvio)] : [])]) },
  });
}

// ------------------------------------------------------------ página: DRE e Orçamento
const GRUPOS_DRE = [
  { grupo: "Receita bruta", rotulo: "Receita bruta" },
  { grupo: "Deduções da receita", rotulo: "(−) Deduções da receita" },
  { subtotal: "liquida", rotulo: "= Receita líquida" },
  { grupo: "CMV", rotulo: "(−) CMV" },
  { subtotal: "lucroBruto", rotulo: "= Lucro bruto" },
  { grupo: "Despesas com pessoal", rotulo: "(−) Despesas com pessoal" },
  { grupo: "Despesas administrativas", rotulo: "(−) Despesas administrativas" },
  { grupo: "Despesas logísticas", rotulo: "(−) Despesas logísticas" },
  { grupo: "Despesas comerciais", rotulo: "(−) Despesas comerciais" },
  { grupo: "Resultado financeiro", rotulo: "(−) Resultado financeiro" },
  { subtotal: "resultado", rotulo: "= Resultado líquido" },
];

/** Realizado e orçado de cada conta no período, com o sinal da conta (custos negativos). */
function dreContas(ms) {
  const f = estado.filial;
  return D.contas.map((conta, i) => {
    let real = 0, orc = 0;
    for (const m of ms) { real += cubo.dre[f][m][i] * conta.sinal; orc += cubo.orc[m][i] * conta.sinal; }
    return { ...conta, real, orc: f === 0 ? orc : null };
  });
}

function dre() {
  const ms = periodo(), contas = dreContas(ms), ind = indicadores(ms);
  const comOrcamento = estado.filial === 0;
  const soma = (lista, campo) => lista.reduce((a, c) => a + c[campo], 0);
  const linhaDe = (rotulo, real, orc, classe, grupo) => ({ rotulo, real, orc: comOrcamento ? orc : null, classe, grupo });
  const linhas = [];
  for (const g of GRUPOS_DRE) {
    if (g.subtotal) {
      const ate = contas.filter((c) => c.ordem <= { liquida: 2, lucroBruto: 3, resultado: 8 }[g.subtotal]);
      linhas.push(linhaDe(g.rotulo, soma(ate, "real"), comOrcamento ? soma(ate, "orc") : null, "subtotal"));
      continue;
    }
    const doGrupo = contas.filter((c) => c.grupo === g.grupo);
    linhas.push(linhaDe(g.rotulo, soma(doGrupo, "real"), comOrcamento ? soma(doGrupo, "orc") : null, `grupo${abertos.has(g.grupo) ? " aberto" : ""}`, g.grupo));
    if (abertos.has(g.grupo)) doGrupo.forEach((c) => linhas.push(linhaDe(`${c.cod} ${c.nome}`, c.real, c.orc, "conta")));
  }

  const periodoTexto = ms.length === 1 ? nomeMes(ms[0]) : String(estado.ano);
  document.getElementById("sub-dre").textContent = `${periodoTexto} · clique num grupo para abrir as contas`;
  const tabela = document.getElementById("tabela-dre");
  const cab = ["", "Realizado", "Orçado", "Desvio", "Desvio %", "% da RL"];
  const thead = document.createElement("thead");
  const trc = thead.insertRow();
  cab.forEach((c) => trc.appendChild(Object.assign(document.createElement("th"), { textContent: c })));
  const tbody = document.createElement("tbody");
  for (const l of linhas) {
    const tr = tbody.insertRow();
    tr.className = l.classe;
    const primeira = tr.insertCell();
    if (l.grupo) {
      const b = Object.assign(document.createElement("button"), { type: "button", textContent: l.rotulo });
      b.setAttribute("aria-expanded", String(abertos.has(l.grupo)));
      b.addEventListener("click", () => alternarGrupo(l.grupo));
      primeira.appendChild(b);
    } else primeira.textContent = l.rotulo;
    const desvio = l.orc == null ? null : l.real - l.orc;
    tr.insertCell().textContent = reais(l.real);
    tr.insertCell().textContent = l.orc == null ? "—" : reais(l.orc);
    const cd = tr.insertCell(), cp = tr.insertCell();
    if (desvio == null) { cd.textContent = "—"; cp.textContent = "—"; }
    else {
      const classe = Math.abs(desvio) < 0.5 ? "" : desvio > 0 ? "bom" : "ruim";
      cd.textContent = `${desvio > 0.5 ? "▲ " : desvio < -0.5 ? "▼ " : ""}${reais(desvio)}`;
      cp.textContent = l.orc ? pct(desvio / Math.abs(l.orc)) : "—";
      cd.className = cp.className = classe;
    }
    tr.insertCell().textContent = pct(l.real / ind.liquida);
  }
  tabela.replaceChildren(thead, tbody);

  // Cascata: da receita bruta ao resultado
  const passos = GRUPOS_DRE.filter((g) => g.grupo).map((g) => ({ ...g, valor: soma(contas.filter((c) => c.grupo === g.grupo), "real") }));
  const CURTO = { "Receita bruta": "Receita", "Deduções da receita": "Deduções", "CMV": "CMV", "Despesas com pessoal": "Pessoal",
                  "Despesas administrativas": "Admin.", "Despesas logísticas": "Logística", "Despesas comerciais": "Comercial",
                  "Resultado financeiro": "Financ." };
  const dados = [];
  let acumulado = 0;
  passos.forEach((p, i) => {
    const inicio = i === 0 ? 0 : acumulado;
    acumulado += p.valor;
    dados.push({ nome: p.grupo, curto: CURTO[p.grupo] || p.grupo, inicio, fim: acumulado, valor: p.valor, total: i === 0 });
  });
  dados.push({ nome: "Resultado líquido", curto: "Resultado", inicio: 0, fim: acumulado, valor: acumulado, total: true });
  const corPasso = (x) => (x.valor >= 0 ? COR.serie1 : COR.negativo);
  const modoCascata = modoRotulos("cascata", dados.length), girarCascata = modoCascata.girar;
  // Coluna estreita: nomes de até 4 letras no eixo (o nome completo fica no tooltip e na tabela)
  const MINIMO = { Receita: "Rec.", Deduções: "Ded.", CMV: "CMV", Pessoal: "Pes.", "Admin.": "Adm.", Logística: "Log.",
                   Comercial: "Com.", "Financ.": "Fin.", Resultado: "Res." };
  desenhar("cascata", {
    opcao: opcaoBase({
      grid: espacoRotulos(girarCascata, []).grid,
      xAxis: eixoCategoria(dados.map((x) => (modoCascata.coluna < 64 ? MINIMO[x.curto] : x.curto)), { axisLabel: { color: COR.suave, fontSize: 10, interval: 0 } }),
      yAxis: eixoValor(),
      tooltip: { ...opcaoBase().tooltip, trigger: "item", formatter: (p) => {
        const x = dados[p.dataIndex];
        return dica(x.nome, [{ valor: reais(x.valor), nome: x.total ? "" : "no período" }, { valor: pct(x.valor / ind.liquida), nome: "da receita líquida" }]);
      } },
      series: [{
        type: "custom", cursor: "pointer",
        encode: { x: 0, y: [1, 2] },
        data: dados.map((x, i) => [i, x.inicio, x.fim]),
        renderItem: (params, api) => {
          const x = dados[params.dataIndex];
          const topo = api.coord([api.value(0), Math.max(api.value(1), api.value(2))]);
          const base = api.coord([api.value(0), Math.min(api.value(1), api.value(2))]);
          const largura = Math.min(api.size([1, 0])[0] * 0.6, 24);
          // Rótulo de valor acima de cada barra (na vertical quando as colunas são estreitas)
          const rotulo = { type: "text", x: topo[0], y: topo[1] - DISTANCIA_ROTULO, rotation: girarCascata ? Math.PI / 2 : 0,
                           style: { text: rotuloValor(x.valor), fill: COR.texto, font: `10px ${FONTE}`,
                                    align: girarCascata ? "left" : "center", verticalAlign: girarCascata ? "middle" : "bottom" } };
          return { type: "group", children: [
            { type: "rect", shape: { x: topo[0] - largura / 2, y: topo[1], width: largura, height: Math.max(base[1] - topo[1], 1), r: 4 },
              style: { fill: corPasso(x) } },
            rotulo] };
        },
      }],
    }),
    aoClicar: (p) => { const x = dados[p.dataIndex]; if (!x.total || x.nome === "Receita bruta") alternarGrupo(x.nome, true); },
    tabela: { colunas: ["Etapa", "Valor", "% da RL"], linhas: dados.map((x) => [x.nome, reais(x.valor), pct(x.valor / ind.liquida)]) },
  });

  // Desvio das despesas por conta (grupos 4 a 7, como a medida DAX)
  if (!comOrcamento) {
    desenhar("desvio", { vazio: "O orçamento não é aberto por filial. Escolha \"Todas\" para ver o desvio das despesas." });
    return;
  }
  const despesas = contas.filter((c) => c.ordem >= 4 && c.ordem <= 7).map((c) => ({ ...c, desvio: c.real - c.orc }))
    .sort((a, b) => a.desvio - b.desvio);
  const folgaDesvio = document.getElementById("g-desvio").clientWidth < 420 ? 0.75 : 0.35;   // celular: mais espaço para o rótulo
  desenhar("desvio", {
    opcao: opcaoBase({
      grid: { left: 4, right: 16, top: 6, bottom: 4, containLabel: true },
      yAxis: eixoCategoria(despesas.map((c) => c.nome), { inverse: true, axisLabel: { color: COR.suave, fontSize: 11 } }),
      // Folga dos dois lados para o rótulo ficar na ponta da barra; sem números no eixo, cada barra já leva o valor
      xAxis: eixoValor(eixoReais, {
        axisLabel: { show: false },
        min: (e) => Math.min(e.min - (e.max - e.min) * folgaDesvio, 0),
        max: (e) => Math.max(e.max + (e.max - e.min) * 0.35, 0),
      }),
      tooltip: { ...opcaoBase().tooltip, formatter: ([p]) => {
        const c = despesas[p.dataIndex];
        return dica(c.nome, [{ valor: reais(c.desvio), nome: "desvio" }, { valor: pct(c.desvio / Math.abs(c.orc)), nome: "do orçado" },
                             { valor: reais(-c.real), nome: "realizado" }, { valor: reais(-c.orc), nome: "orçado" }]);
      } },
      series: [{
        type: "bar", barMaxWidth: 18,
        data: despesas.map((c) => ({
          value: c.desvio,
          itemStyle: { color: corSinal(c.desvio), borderRadius: raio(c.desvio, true) },
          label: { show: true, position: c.desvio >= 0 ? "right" : "left", distance: DISTANCIA_ROTULO, color: COR.texto, fontSize: 11,
                   formatter: () => (folgaDesvio > 0.35 ? rotuloValor(c.desvio) : compacto(c.desvio)) },   // celular: sem "R$" para caber
        })),
      }],
    }),
    tabela: { colunas: ["Conta", "Realizado", "Orçado", "Desvio", "Desvio %"],
              linhas: despesas.map((c) => [c.nome, reais(-c.real), reais(-c.orc), reais(c.desvio), pct(c.desvio / Math.abs(c.orc))]) },
  });
}

// ------------------------------------------------------------ página: Contas a Receber
function receber() {
  const c = carteira(), geral = carteira(estado.filial, null);
  cartoes("kpis-receber", [
    { rotulo: "Carteira em aberto", valor: compacto(c.total) },
    { rotulo: "Vencido", valor: compacto(c.vencido) },
    { rotulo: "Vencido há mais de 90 dias", valor: compacto(c.acima90) },
    { rotulo: "Inadimplência", valor: pct(c.inadimplencia), nota: estado.tipo == null ? "vencido ÷ carteira" : `média geral: ${pct(geral.inadimplencia)}`,
      classe: estado.tipo == null ? "" : c.inadimplencia > geral.inadimplencia ? "ruim" : "bom" },
  ]);
  document.getElementById("sub-aging").textContent = estado.tipo == null ? "Todos os tipos de cliente" : `Tipo de cliente: ${D.tipos_cliente[estado.tipo]}`;

  const faixas = D.faixas_aging;
  desenhar("aging", {
    opcao: opcaoBase({
      grid: { left: 4, right: 16, top: 22, bottom: 4, containLabel: true },
      xAxis: eixoCategoria(faixas, { axisLabel: { color: COR.suave, fontSize: 11, interval: 0, formatter: (t) => t.replace(" dias", "\ndias") } }),
      yAxis: eixoValor(),
      tooltip: { ...opcaoBase().tooltip, formatter: ([p]) => dica(faixas[p.dataIndex], [
        { valor: reais(c.porFaixa[p.dataIndex]), nome: "em aberto" }, { valor: pct(c.porFaixa[p.dataIndex] / c.total), nome: "da carteira" }]) },
      series: [{
        type: "bar", barMaxWidth: 32,
        data: Array.from(c.porFaixa, (v, i) => ({ value: v, itemStyle: { color: COR.rampa[i], borderRadius: [4, 4, 0, 0] } })),
        label: { show: true, position: "top", distance: DISTANCIA_ROTULO, color: COR.texto, fontSize: 11, formatter: (p) => compacto(p.value) },
      }],
    }),
    tabela: { colunas: ["Faixa", "Em aberto", "% da carteira"], linhas: faixas.map((f, i) => [f, reais(c.porFaixa[i]), pct(c.porFaixa[i] / c.total)]) },
  });

  const tipos = D.tipos_cliente.map((nome, t) => ({ nome, t, ...carteira(estado.filial, t) }))
    .filter((x) => x.total > 0).sort((a, b) => b.inadimplencia - a.inadimplencia);
  desenhar("tipos", {
    opcao: opcaoBase({
      grid: { left: 4, right: 52, top: 6, bottom: 4, containLabel: true },
      yAxis: eixoCategoria(tipos.map((x) => x.nome), { inverse: true }),
      xAxis: eixoValor((v) => `${numero(v * 100)}%`),
      tooltip: { ...opcaoBase().tooltip, formatter: ([p]) => {
        const x = tipos[p.dataIndex];
        return dica(x.nome, [{ valor: pct(x.inadimplencia), nome: "inadimplência" }, { valor: reais(x.vencido), nome: "vencido" }, { valor: reais(x.total), nome: "em aberto" }]);
      } },
      series: [{
        type: "bar", barMaxWidth: 18, cursor: "pointer",
        data: barras(tipos.map((x) => x.inadimplencia), COR.serie1, { deitado: true, destaque: estado.tipo == null ? null : tipos.findIndex((x) => x.t === estado.tipo) }),
        label: { show: true, position: "right", distance: DISTANCIA_ROTULO, color: COR.texto, fontSize: 11, formatter: (p) => pct(p.value) },
      }],
    }),
    aoClicar: (p) => { const t = tipos[p.dataIndex].t; estado.tipo = estado.tipo === t ? null : t; atualizar(); },
    tabela: { colunas: ["Tipo de cliente", "Inadimplência", "Vencido", "Em aberto"], linhas: tipos.map((x) => [x.nome, pct(x.inadimplencia), reais(x.vencido), reais(x.total)]) },
  });
}

// ------------------------------------------------------------ página: Fluxo de Caixa
function caixa() {
  const ms = periodo(), atual = indicadores(ms), antes = anterior(ms), ant = antes && indicadores(antes);
  const dRecebido = ant ? delta(atual.recebido, ant.recebido, "", rotuloPeriodo(antes)) : {};
  cartoes("kpis-caixa", [
    { rotulo: "Recebido", valor: compacto(atual.recebido), nota: dRecebido.texto, classe: dRecebido.classe },
    { rotulo: "Pago", valor: compacto(atual.pago) },
    { rotulo: "Geração de caixa", valor: compacto(atual.geracao), classe: atual.geracao >= 0 ? "bom" : "ruim", nota: atual.geracao >= 0 ? "sobrou caixa" : "faltou caixa" },
    { rotulo: "PMR (dias)", valor: dias(atual.pmr), nota: "prazo médio de recebimento" },
    { rotulo: "PMP (dias)", valor: dias(atual.pmp), nota: "prazo médio de pagamento" },
    { rotulo: "PMR − PMP (dias)", valor: dias(atual.pmr - atual.pmp), classe: atual.pmr <= atual.pmp ? "bom" : "ruim",
      nota: atual.pmr <= atual.pmp ? "recebe antes de pagar" : "paga antes de receber" },
  ]);

  const doAno = mesesDoAno(estado.ano), porMes = doAno.map((m) => indicadores([m]));
  const destaque = estado.mes == null ? null : doAno.indexOf(estado.mes);
  const rotulos = doAno.map((m) => MESES[Number(D.meses[m].slice(5)) - 1]);
  const clicarMes = (p) => alternarMes(doAno[p.dataIndex]);
  const recebidos = porMes.map((x) => x.recebido), pagos = porMes.map((x) => x.pago);
  const modoCaixa = modoRotulos("caixa", recebidos.length, 2, [...recebidos, ...pagos].map(rotuloValor));
  desenhar("caixa", {
    opcao: opcaoBase({
      grid: espacoRotulos(modoCaixa.girar, []).grid,
      xAxis: eixoCategoria(rotulos), yAxis: eixoValor(),
      tooltip: { ...opcaoBase().tooltip, formatter: (ps) => {
        const x = porMes[ps[0].dataIndex];
        return dica(nomeMes(doAno[ps[0].dataIndex]), [{ cor: COR.serie1, valor: compacto(x.recebido), nome: "recebido" },
          { cor: COR.serie2, valor: compacto(x.pago), nome: "pago" }, { valor: compacto(x.geracao), nome: "geração de caixa" }]);
      } },
      series: [
        { name: "Recebido", type: "bar", barMaxWidth: 24, barGap: "10%", cursor: "pointer", data: barras(recebidos, COR.serie1, { destaque, ...modoCaixa.serie(0) }) },
        { name: "Pago", type: "bar", barMaxWidth: 24, cursor: "pointer", data: barras(pagos, COR.serie2, { destaque, ...modoCaixa.serie(1) }) },
      ],
    }),
    aoClicar: clicarMes,
    tabela: { colunas: ["Mês", "Recebido", "Pago", "Geração"], linhas: porMes.map((x, i) => [nomeMes(doAno[i]), reais(x.recebido), reais(x.pago), reais(x.geracao)]) },
  });
  const geracoes = porMes.map((x) => x.geracao), modoGeracao = modoRotulos("geracao", geracoes.length, 1, geracoes.map(rotuloValor));
  const espacoGeracao = espacoRotulos(modoGeracao.girar, geracoes);
  desenhar("geracao", {
    opcao: opcaoBase({
      grid: espacoGeracao.grid,
      xAxis: eixoCategoria(rotulos), yAxis: eixoValor(eixoReais, { boundaryGap: espacoGeracao.margem }),
      tooltip: { ...opcaoBase().tooltip, formatter: ([p]) => dica(nomeMes(doAno[p.dataIndex]), [{ valor: compacto(porMes[p.dataIndex].geracao), nome: "geração de caixa" }]) },
      series: [{ type: "bar", barMaxWidth: 24, cursor: "pointer", data: barras(geracoes, corSinal, { destaque, ...modoGeracao.serie(0) }) }],
    }),
    aoClicar: clicarMes,
    tabela: { colunas: ["Mês", "Geração de caixa"], linhas: porMes.map((x, i) => [nomeMes(doAno[i]), reais(x.geracao)]) },
  });

  const porGrupo = D.grupos_caixa.map((nome, g) => ({ nome, valor: ms.reduce((a, m) => a + cubo.pag[estado.filial][m][g], 0) }))
    .filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor);
  desenhar("grupos", {
    opcao: opcaoBase({
      grid: { left: 4, right: 70, top: 6, bottom: 4, containLabel: true },
      yAxis: eixoCategoria(porGrupo.map((x) => x.nome), { inverse: true }),
      xAxis: eixoValor(eixoReais, { axisLabel: { show: false } }),   // cada barra já leva o próprio valor
      tooltip: { ...opcaoBase().tooltip, formatter: ([p]) => dica(porGrupo[p.dataIndex].nome, [
        { valor: reais(porGrupo[p.dataIndex].valor), nome: "pago" }, { valor: pct(porGrupo[p.dataIndex].valor / atual.pago), nome: "do total pago" }]) },
      series: [{
        type: "bar", barMaxWidth: 18, data: barras(porGrupo.map((x) => x.valor), COR.serie1, { deitado: true }),
        label: { show: true, position: "right", distance: DISTANCIA_ROTULO, color: COR.texto, fontSize: 11, formatter: (p) => compacto(p.value) },
      }],
    }),
    tabela: { colunas: ["Grupo", "Pago", "% do total"], linhas: porGrupo.map((x) => [x.nome, reais(x.valor), pct(x.valor / atual.pago)]) },
  });
}

// ------------------------------------------------------------ estado e interação
const PAGINAS = { resumo, dre, receber, caixa };

function alternarGrupo(grupo, abrir = false) {
  if (abrir || !abertos.has(grupo)) abertos.add(grupo); else abertos.delete(grupo);
  atualizar();
  if (abrir) document.getElementById("tabela-dre").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function atualizar() {
  const anos = [...new Set(D.meses.map((m) => Number(m.slice(0, 4))))];
  const receberAtivo = estado.aba === "receber";
  botoesFiltro("filtro-ano", "Ano", anos.map((a) => [a, String(a)]), estado.ano,
    (a) => { estado.ano = a; estado.mes = null; atualizar(); }, receberAtivo);
  botoesFiltro("filtro-filial", "Filial", [[0, "Todas"], ...D.filiais.map((f) => [f.id, f.nome])], estado.filial,
    (f) => { estado.filial = f; atualizar(); });
  document.getElementById("nota-filial").hidden = estado.filial === 0 || receberAtivo;
  mostrarPagina(receberAtivo ? (estado.tipo == null ? null : D.tipos_cliente[estado.tipo]) : (estado.mes == null ? null : nomeMes(estado.mes)));
}

iniciarPainel({
  arquivo: "assets/data/financeiro.json",
  aoCarregar: () => (cubo = montarCubo()),
  limparSelecao: () => { if (estado.aba === "receber") estado.tipo = null; else estado.mes = null; },
});
