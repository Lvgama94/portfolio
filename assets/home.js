// Página inicial: blocos que entram ao rolar, números que contam até o valor e a linha da trajetória que se preenche.
(() => {
  const semMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ------------------------------------------------------------ números (topo e contadores dos projetos)
  // O valor vem de data-contar; data-formato="mi" escreve "R$ 62,8 mi" (ou "R$ 62.8M" em inglês) e "pct", "+6,6%"
  const numeros = [...document.querySelectorAll("[data-contar]")];
  const casas = (el) => (el.dataset.contar.split(".")[1] || "").length;

  function escrever(el, valor) {
    el.valorAtual = valor;
    const ingles = window.idioma?.atual === "en";
    const n = valor.toLocaleString(ingles ? "en-US" : "pt-BR", { minimumFractionDigits: casas(el), maximumFractionDigits: casas(el) });
    const formatos = { mi: ingles ? `R$ ${n}M` : `R$ ${n} mi`, pct: `+${n}%` };
    el.textContent = formatos[el.dataset.formato] ?? n;
  }

  function contar(el) {
    const alvo = Number(el.dataset.contar);
    if (semMovimento) { escrever(el, alvo); return; }
    const inicio = performance.now();
    const duracao = 1400;
    const passo = (agora) => {
      const t = Math.min((agora - inicio) / duracao, 1);
      const suave = 1 - Math.pow(1 - t, 3);
      escrever(el, t < 1 ? Number((alvo * suave).toFixed(casas(el))) : alvo);
      if (t < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  // Antes de aparecer, cada número fica no zero (sem animação, já no valor final)
  numeros.forEach((el) => escrever(el, semMovimento ? Number(el.dataset.contar) : 0));
  // Trocou o idioma: os números são reescritos com a pontuação do idioma, no ponto em que estão
  document.addEventListener("idioma", () => numeros.forEach((el) => escrever(el, el.valorAtual)));

  // As barras do painel do topo sobem uma depois da outra
  document.querySelectorAll(".pd-barras i").forEach((barra, i) => barra.style.setProperty("--n", i));

  // ------------------------------------------------------------ blocos que entram ao rolar
  const blocos = [...document.querySelectorAll(".revelar")];
  // Irmãos entram em sequência
  for (const bloco of blocos) {
    const irmaos = [...bloco.parentElement.children].filter((el) => el.classList.contains("revelar"));
    bloco.style.setProperty("--atraso", `${irmaos.indexOf(bloco) * 90}ms`);
  }

  function mostrar(el) {
    if (el.classList.contains("revelar")) {
      el.classList.add("visivel");
      // Depois da entrada, sai do controle da animação (o efeito de passar o mouse volta a valer)
      setTimeout(() => el.classList.remove("revelar", "visivel"), 1000 + parseInt(el.style.getPropertyValue("--atraso") || 0, 10));
    }
    el.querySelectorAll("[data-contar]").forEach(contar);
    if (el.matches("[data-contar]")) contar(el);
  }

  const vigiados = [...blocos, ...document.querySelectorAll(".painel-demo")];
  if (semMovimento || !("IntersectionObserver" in window)) {
    vigiados.forEach(mostrar);
  } else {
    const observador = new IntersectionObserver((entradas) => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        observador.unobserve(entrada.target);
        // O painel do topo espera as barras começarem a subir
        if (entrada.target.matches(".painel-demo")) setTimeout(() => mostrar(entrada.target), 500);
        else mostrar(entrada.target);
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    vigiados.forEach((el) => observador.observe(el));
  }

  // ------------------------------------------------------------ barra presa no topo
  // Ganha fundo quando a página rola, marca a seção em que a pessoa está e informa a própria altura ao CSS
  const barraNav = document.querySelector(".barra-nav");
  if (barraNav) {
    const linksNav = [...barraNav.querySelectorAll('.links a[href^="#"]')];
    const secoes = linksNav.map((a) => document.querySelector(a.getAttribute("href")));
    let pedidoNav = null;
    const medir = () => document.documentElement.style.setProperty("--altura-nav", `${barraNav.offsetHeight}px`);
    const atualizarNav = () => {
      pedidoNav = null;
      barraNav.classList.toggle("rolou", scrollY > 8);
      const linha = barraNav.offsetHeight + innerHeight * 0.35;
      let ativa = -1;
      secoes.forEach((secao, i) => { if (secao && secao.getBoundingClientRect().top <= linha) ativa = i; });
      // No fim da página, a última seção (Contato) mesmo que não chegue à linha
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) ativa = secoes.length - 1;
      linksNav.forEach((a, i) => {
        a.classList.toggle("ativo", i === ativa);
        if (i === ativa) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
      });
    };
    addEventListener("scroll", () => { if (!pedidoNav) pedidoNav = requestAnimationFrame(atualizarNav); }, { passive: true });
    addEventListener("resize", () => { medir(); atualizarNav(); });
    // A troca de idioma muda a largura dos links, e no celular a altura da barra
    document.addEventListener("idioma", medir);
    medir();
    atualizarNav();
  }

  // ------------------------------------------------------------ WhatsApp com mensagem pronta, no idioma da página
  const whatsapp = document.querySelector("a.whatsapp");
  if (whatsapp) {
    const numero = whatsapp.href;
    const mensagem = "Olá, Lucas! Vi seu portfólio e gostaria de conversar.";
    const montar = () => { whatsapp.href = `${numero}?text=${encodeURIComponent(window.idioma ? idioma.t(mensagem) : mensagem)}`; };
    document.addEventListener("idioma", montar);
    montar();
  }

  // ------------------------------------------------------------ linha da trajetória
  const trajetoria = document.querySelector(".trajetoria");
  if (trajetoria) {
    let pedido = null;
    const atualizar = () => {
      pedido = null;
      const caixa = trajetoria.getBoundingClientRect();
      // A linha acompanha o meio da tela: começa quando o topo da lista passa do meio e enche até o fim dela
      const progresso = semMovimento ? 1 : Math.min(Math.max((innerHeight * 0.6 - caixa.top) / caixa.height, 0), 1);
      trajetoria.style.setProperty("--progresso", progresso.toFixed(3));
    };
    const agendar = () => { if (!pedido) pedido = requestAnimationFrame(atualizar); };
    addEventListener("scroll", agendar, { passive: true });
    addEventListener("resize", agendar);
    atualizar();
  }
})();
