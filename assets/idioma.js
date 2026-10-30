// Idioma da página inicial: português (padrão) ou inglês, trocado na hora, sem recarregar.
// O HTML fica em português; assets/i18n/en.json traz a tradução de cada texto, pela própria frase em português.
(() => {
  const SELETOR = "h1, h2, h3, h4, p, li, a, button, span, small, label, th, td, figcaption";
  const ATRIBUTOS = ["alt", "aria-label", "title"];
  const METAS = ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]'];
  const temLetra = /\p{L}/u;
  const normalizar = (texto) => texto.replace(/\s+/g, " ").trim();

  let dicionario = null;
  let atual = "pt";
  const textos = new Map();      // elemento -> HTML original em português
  const atributos = new Map();   // elemento -> { atributo: valor em português }
  const faltando = new Set();

  /** Os blocos de texto que se traduzem inteiros: os mais externos, fora de código e do que pede para não traduzir. */
  function blocos() {
    return [...document.body.querySelectorAll(SELETOR)].filter((el) =>
      temLetra.test(el.textContent) && !el.closest('pre, code, [translate="no"]') && !el.parentElement.closest(SELETOR));
  }

  function traduzir(pt) {
    // Português, ou um valor sem palavras (alt="" das imagens decorativas, números): fica como está
    if (atual === "pt" || !temLetra.test(pt)) return pt;
    const en = dicionario[normalizar(pt)];
    if (en === undefined) faltando.add(normalizar(pt));
    return en ?? pt;
  }

  function aplicar() {
    for (const el of blocos()) {
      if (!textos.has(el)) textos.set(el, el.innerHTML);
      el.innerHTML = traduzir(textos.get(el));
    }
    for (const el of document.querySelectorAll(ATRIBUTOS.map((a) => `[${a}]`).join(", "))) {
      if (el.closest('[translate="no"]')) continue;
      if (!atributos.has(el)) atributos.set(el, Object.fromEntries(ATRIBUTOS.filter((a) => el.hasAttribute(a)).map((a) => [a, el.getAttribute(a)])));
      for (const [a, pt] of Object.entries(atributos.get(el))) el.setAttribute(a, traduzir(pt));
    }
    for (const meta of document.querySelectorAll(METAS.join(", "))) {
      if (!atributos.has(meta)) atributos.set(meta, { content: meta.content });
      meta.content = traduzir(atributos.get(meta).content);
    }
    if (!textos.has(document)) textos.set(document, document.title);
    document.title = traduzir(textos.get(document));
    document.documentElement.lang = atual === "en" ? "en" : "pt-BR";
    for (const b of document.querySelectorAll(".idioma [data-idioma]")) b.setAttribute("aria-pressed", String(b.dataset.idioma === atual));
    if (faltando.size) console.warn(`Sem tradução (${faltando.size}):`, [...faltando]);
    document.dispatchEvent(new CustomEvent("idioma", { detail: atual }));
  }

  async function trocar(idioma, { salvar = true } = {}) {
    if (idioma === "en" && !dicionario) {
      try {
        dicionario = await (await fetch("assets/i18n/en.json")).json();
      } catch {
        idioma = "pt";   // sem a tradução, a página continua em português
      }
    }
    atual = idioma;
    aplicar();
    document.documentElement.classList.remove("traduzindo");
    if (!salvar) return;
    try { localStorage.setItem("idioma", idioma); } catch { /* sem armazenamento, só não lembra a escolha */ }
    // O endereço leva o idioma, para o link em inglês poder ser compartilhado
    const url = new URL(location.href);
    if (idioma === "en") url.searchParams.set("lang", "en"); else url.searchParams.delete("lang");
    history.replaceState(null, "", url);
  }

  window.idioma = {
    get atual() { return atual; },
    /** Tradução de um texto montado pelo JavaScript (ou o próprio texto, em português). */
    t: (pt) => (atual === "en" && dicionario?.[pt]) || pt,
  };

  for (const botao of document.querySelectorAll(".idioma [data-idioma]")) {
    botao.addEventListener("click", () => { if (botao.dataset.idioma !== atual) trocar(botao.dataset.idioma); });
  }

  let inicial = "pt";
  try { inicial = new URLSearchParams(location.search).get("lang") || localStorage.getItem("idioma") || "pt"; } catch { /* fica em português */ }
  if (inicial === "en") trocar("en", { salvar: false });
  // Se a tradução demorar, a página aparece em português em vez de ficar em branco
  setTimeout(() => document.documentElement.classList.remove("traduzindo"), 2000);
})();
