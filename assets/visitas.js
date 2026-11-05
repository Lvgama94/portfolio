// Conta as visitas do portfólio, sem cookies: páginas, origem, tempo, rolagem e cliques.
// A cidade, o horário e o aparelho são acrescentados no servidor (api/visita.js), que grava na planilha.
// Uma visita é uma linha na planilha: junta as páginas abertas neste navegador até 30 minutos sem uso,
// mesmo em outra aba. Fica só um número aleatório e o resumo da visita no armazenamento do navegador.
(() => {
  const params = new URLSearchParams(location.search);

  // O dono do site não entra na conta: abrir uma vez com ?eu=1 marca este navegador (?eu=0 desfaz)
  try {
    if (params.get("eu") === "1") localStorage.setItem("naoContar", "1");
    if (params.get("eu") === "0") localStorage.removeItem("naoContar");
    if (localStorage.getItem("naoContar")) return;
  } catch { /* sem armazenamento, segue contando */ }
  if (location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(location.hostname) || navigator.webdriver) return;

  const CHAVE = "visitaPortfolio";
  const PAUSA = 30 * 60 * 1000; // depois de 30 minutos sem uso, começa outra visita
  const MAX_CLIQUES = 60;
  const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const ler = () => { try { return JSON.parse(localStorage.getItem(CHAVE)); } catch { return null; } };
  const gravar = (v) => { try { localStorage.setItem(CHAVE, JSON.stringify(v)); } catch { /* sem armazenamento: a visita fica só nesta página */ } };

  // Continua a visita aberta ou começa outra; a origem é sempre a da primeira página da visita
  let visita = ler();
  if (!visita || !visita.id || !visita.paginas || !Array.isArray(visita.cliques) || !(Date.now() - visita.ultima < PAUSA)) {
    visita = {
      id: novoId(),
      origem: {
        referencia: document.referrer && new URL(document.referrer).host !== location.host ? document.referrer : "",
        utm_source: params.get("utm_source") || "",
        utm_medium: params.get("utm_medium") || "",
        utm_campaign: params.get("utm_campaign") || "",
        de: params.get("de") || "",
      },
      paginas: {},
      cliques: [],
    };
  }
  const vista = novoId();
  visita.paginas[vista] = { pagina: location.pathname, tempo: 0, rolagem: 0 };
  visita.ultima = Date.now();
  gravar(visita);

  // Tira do endereço as marcas de origem, para quem copiar o link não levar a origem junto
  const limpo = new URL(location.href);
  ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "de", "eu"].forEach((p) => limpo.searchParams.delete(p));
  if (limpo.href !== location.href) history.replaceState(history.state, "", limpo);

  let rolagem = 0;
  let visivelDesde = document.visibilityState === "visible" ? performance.now() : null;
  let tempoVisivel = 0;
  const segundosVisiveis = () => (tempoVisivel + (visivelDesde !== null ? performance.now() - visivelDesde : 0)) / 1000;

  /** Junta o que esta página sabe com o que as outras páginas da visita já guardaram. */
  function atualizar(mudar) {
    const guardada = ler();
    if (guardada && guardada.id === visita.id) visita = guardada; // outra aba pode ter acrescentado páginas e cliques
    visita.paginas[vista] = { pagina: location.pathname, tempo: Math.round(segundosVisiveis()), rolagem };
    if (mudar) mudar(visita);
    if (document.visibilityState === "visible") visita.ultima = Date.now();
    if (!guardada || guardada.id === visita.id || !(Date.now() - guardada.ultima < PAUSA)) gravar(visita);
    return visita;
  }

  // Rótulo legível de cada clique: aba, botão ou link, com o projeto ou a página em que aconteceu
  function rotulo(el) {
    const texto = (s) => (s || "").replace(/\s+/g, " ").trim().slice(0, 70);
    let nome;
    if (el.matches('[role="tab"]')) nome = `Aba: ${texto(el.querySelector(".nome")?.textContent || el.textContent)}`;
    else if (el.matches("summary")) nome = `Abriu: ${texto(el.textContent)}`;
    else if (el.matches("a")) {
      const destino = new URL(el.href, location.href);
      nome = texto(el.textContent || el.getAttribute("aria-label"));
      if (destino.host !== location.host) nome += ` → ${destino.host.replace(/^www\./, "")}`;
    } else nome = texto(el.getAttribute("aria-label") || el.textContent || el.dataset.idioma);
    if (!nome) return "";
    const projeto = el.closest(".projeto")?.id;
    if (projeto && !el.matches('[role="tab"]')) return `[${projeto}] ${nome}`;
    const pagina = location.pathname.replace(/^\/|\.html$/g, "");
    return pagina && pagina !== "index" ? `[${pagina}.html] ${nome}` : nome;
  }

  document.addEventListener("click", (evento) => {
    const el = evento.target.closest("a, button, summary, [role='tab']");
    const nome = el && rotulo(el);
    if (!nome) return;
    atualizar((v) => {
      if (v.cliques.length < MAX_CLIQUES && v.cliques[v.cliques.length - 1] !== nome) v.cliques.push(nome);
    });
  }, { capture: true, passive: true });

  addEventListener("scroll", () => {
    const total = document.documentElement.scrollHeight - innerHeight;
    if (total > 0) rolagem = Math.max(rolagem, Math.round((scrollY / total) * 100));
  }, { passive: true });

  function enviar(tipo) {
    if (visivelDesde !== null) { tempoVisivel += performance.now() - visivelDesde; visivelDesde = document.visibilityState === "visible" ? performance.now() : null; }
    const v = atualizar();
    const paginas = Object.values(v.paginas);
    const inicio = paginas.filter((p) => p.pagina === "/" || p.pagina === "/index.html");
    const dados = {
      tipo, visita: v.id, vista, ...v.origem,
      pagina: location.pathname,
      paginas: paginas.map((p) => p.pagina),
      titulo: document.title.slice(0, 120),
      idioma: window.idioma?.atual || document.documentElement.lang,
      tela: `${screen.width}x${screen.height}`,
      // tempo somado de todas as páginas da visita; rolagem da página inicial (ou da maior, se ela não foi aberta)
      tempo: paginas.reduce((soma, p) => soma + (p.tempo || 0), 0),
      rolagem: Math.max(0, ...(inicio.length ? inicio : paginas).map((p) => p.rolagem || 0)),
      cliques: v.cliques,
    };
    const corpo = JSON.stringify(dados);
    // sendBeacon chega mesmo quando a aba está fechando; se não der, fetch com keepalive
    if (!(navigator.sendBeacon && navigator.sendBeacon("/api/visita", new Blob([corpo], { type: "application/json" })))) {
      fetch("/api/visita", { method: "POST", body: corpo, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
  }

  enviar("entrada");
  // Ao sair ou trocar de aba, manda o tempo, a rolagem e os cliques (a planilha atualiza a linha da visita)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") enviar("saida");
    else visivelDesde = performance.now();
  });
  addEventListener("pagehide", () => enviar("saida"));

  // No celular o navegador costuma fechar a aba sem avisar, e o envio da saída nunca chega.
  // Por isso, enquanto a página está à vista, o tempo também vai aos 15 s, 30 s e 60 s e depois a cada minuto
  // (até 30 minutos), e a cada 5 s o resumo fica guardado para a próxima página da visita somar.
  const MARCOS = [15, 30, 60];
  let proximoMarco = 0;
  const alvo = (n) => (n < MARCOS.length ? MARCOS[n] : MARCOS[MARCOS.length - 1] + 60 * (n - MARCOS.length + 1));
  const relogio = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    const segundos = segundosVisiveis();
    if (segundos > 1800) { clearInterval(relogio); return; }
    if (segundos >= alvo(proximoMarco)) {
      while (segundos >= alvo(proximoMarco)) proximoMarco++;
      enviar("parcial");
    } else atualizar();
  }, 5000);
})();
