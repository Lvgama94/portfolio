// Conta as visitas do portfólio, sem cookies: página, origem, tempo, rolagem e cliques.
// A cidade, o horário e o aparelho são acrescentados no servidor (api/visita.js), que grava na planilha.
(() => {
  const params = new URLSearchParams(location.search);

  // O dono do site não entra na conta: abrir uma vez com ?eu=1 marca este navegador (?eu=0 desfaz)
  try {
    if (params.get("eu") === "1") localStorage.setItem("naoContar", "1");
    if (params.get("eu") === "0") localStorage.removeItem("naoContar");
    if (localStorage.getItem("naoContar")) return;
  } catch { /* sem armazenamento, segue contando */ }
  if (location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(location.hostname) || navigator.webdriver) return;

  const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const guardar = (chave, criar) => {
    try {
      const salvo = sessionStorage.getItem(chave);
      if (salvo) return JSON.parse(salvo);
      const valor = criar();
      sessionStorage.setItem(chave, JSON.stringify(valor));
      return valor;
    } catch { return criar(); }
  };

  // Uma visita junta as páginas abertas na mesma aba; a origem é a da primeira página
  const visita = guardar("visita", novoId);
  const origem = guardar("origem", () => ({
    referencia: document.referrer && new URL(document.referrer).host !== location.host ? document.referrer : "",
    utm_source: params.get("utm_source") || "",
    utm_medium: params.get("utm_medium") || "",
    utm_campaign: params.get("utm_campaign") || "",
    de: params.get("de") || "",
  }));

  // Tira do endereço as marcas de origem, para quem copiar o link não levar a origem junto
  const limpo = new URL(location.href);
  ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "de", "eu"].forEach((p) => limpo.searchParams.delete(p));
  if (limpo.href !== location.href) history.replaceState(history.state, "", limpo);

  const vista = novoId();
  const cliques = [];
  let rolagem = 0;
  let visivelDesde = document.visibilityState === "visible" ? performance.now() : null;
  let tempoVisivel = 0;

  // Rótulo legível de cada clique: aba, botão ou link, com o projeto em que aconteceu
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
    const projeto = el.closest(".projeto")?.id;
    return projeto && !el.matches('[role="tab"]') ? `[${projeto}] ${nome}` : nome;
  }

  document.addEventListener("click", (evento) => {
    const el = evento.target.closest("a, button, summary, [role='tab']");
    if (!el || cliques.length >= 60) return;
    const nome = rotulo(el);
    if (nome && cliques[cliques.length - 1] !== nome) cliques.push(nome);
  }, { capture: true, passive: true });

  addEventListener("scroll", () => {
    const total = document.documentElement.scrollHeight - innerHeight;
    if (total > 0) rolagem = Math.max(rolagem, Math.round((scrollY / total) * 100));
  }, { passive: true });

  function enviar(tipo) {
    if (visivelDesde !== null) { tempoVisivel += performance.now() - visivelDesde; visivelDesde = document.visibilityState === "visible" ? performance.now() : null; }
    const dados = {
      tipo, visita, vista, ...origem,
      pagina: location.pathname,
      titulo: document.title.slice(0, 120),
      idioma: window.idioma?.atual || document.documentElement.lang,
      tela: `${screen.width}x${screen.height}`,
      tempo: Math.round(tempoVisivel / 1000),
      rolagem,
      cliques,
    };
    const corpo = JSON.stringify(dados);
    // sendBeacon chega mesmo quando a aba está fechando; se não der, fetch com keepalive
    if (!(navigator.sendBeacon && navigator.sendBeacon("/api/visita", new Blob([corpo], { type: "application/json" })))) {
      fetch("/api/visita", { method: "POST", body: corpo, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
  }

  enviar("entrada");
  // Ao sair ou trocar de aba, manda o tempo, a rolagem e os cliques (a planilha atualiza a mesma linha)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") enviar("saida");
    else visivelDesde = performance.now();
  });
  addEventListener("pagehide", () => enviar("saida"));

  // No celular o navegador costuma fechar a aba sem avisar, e o envio da saída nunca chega.
  // Por isso, enquanto a página está à vista, o tempo também vai aos 15 s, 30 s e 60 s e depois a cada minuto
  // (até 30 minutos): a planilha fica com o tempo até o último envio, mesmo sem o aviso de saída.
  const MARCOS = [15, 30, 60];
  let proximoMarco = 0;
  const segundosVisiveis = () => (tempoVisivel + (visivelDesde !== null ? performance.now() - visivelDesde : 0)) / 1000;
  const alvo = (n) => (n < MARCOS.length ? MARCOS[n] : MARCOS[MARCOS.length - 1] + 60 * (n - MARCOS.length + 1));
  const relogio = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    const segundos = segundosVisiveis();
    if (segundos > 1800) { clearInterval(relogio); return; }
    if (segundos >= alvo(proximoMarco)) {
      while (segundos >= alvo(proximoMarco)) proximoMarco++;
      enviar("parcial");
    }
  }, 5000);
})();
