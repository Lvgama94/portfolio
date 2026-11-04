// Recebe cada visita do site (assets/visitas.js), acrescenta horário, cidade aproximada e aparelho, e grava na planilha
// do Google por um Apps Script publicado como app da web na própria planilha. Não guarda IP nem nada que identifique a pessoa.
// Variáveis de ambiente na Vercel: PLANILHA_URL (endereço do app da web do Apps Script) e PLANILHA_SEGREDO.

const ROBOS = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|headless|lighthouse|pingdom|monitor/i;

const corta = (valor, max = 200) => String(valor ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

function horarioSaoPaulo(data = new Date()) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(data).map((p) => [p.type, p.value]));
  return { data: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}` };
}

function aparelho(ua) {
  const tipo = /iPad|Tablet/i.test(ua) ? "Tablet" : /Mobi|Android|iPhone/i.test(ua) ? "Celular" : "Computador";
  const navegador = /LinkedInApp/i.test(ua) ? "App do LinkedIn"
    : /Instagram/i.test(ua) ? "App do Instagram"
    : /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\/|CriOS/.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari" : "Outro";
  const sistema = /Windows/.test(ua) ? "Windows"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux" : "Outro";
  return { tipo, navegador, sistema };
}

/** De onde a pessoa veio, em português: link marcado (utm), link pessoal (?de=), app ou site de origem. */
function classificarOrigem(d, ua) {
  const fonte = d.utm_source.toLowerCase();
  let host = "";
  try { host = d.referencia ? new URL(d.referencia).host.replace(/^www\./, "") : ""; } catch { /* referência inválida */ }
  const nomes = [
    [/linkedin|lnkd\.in/, "LinkedIn"], [/google\./, "Google"], [/bing\./, "Bing"], [/github/, "GitHub"],
    [/whatsapp|wa\.me/, "WhatsApp"], [/instagram/, "Instagram"], [/facebook|fb\./, "Facebook"], [/vercel\.app/, "Vercel"],
  ];
  const nomear = (texto) => (nomes.find(([padrao]) => padrao.test(texto)) || [null, texto])[1];
  if (d.de) return { origem: "Link pessoal", detalhe: d.de };
  if (fonte) return { origem: nomear(fonte), detalhe: [d.utm_medium, d.utm_campaign].filter(Boolean).join(" · ") || "link marcado" };
  if (/LinkedInApp/i.test(ua)) return { origem: "LinkedIn", detalhe: "app do LinkedIn" };
  if (host) return { origem: nomear(host), detalhe: host };
  return { origem: "Direto", detalhe: "link digitado, favorito ou app que não informa a origem" };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).end(); return; }
  const ua = String(req.headers["user-agent"] || "");
  let d = req.body;
  try { if (typeof d === "string") d = JSON.parse(d); } catch { d = null; }
  // entrada (abriu), parcial (ainda na página, a cada marco de tempo) e saida (saiu ou trocou de aba)
  const valido = d && typeof d === "object" && ["entrada", "parcial", "saida"].includes(d.tipo)
    && typeof d.vista === "string" && typeof d.pagina === "string" && d.pagina.startsWith("/");
  if (!valido || ROBOS.test(ua) || !process.env.PLANILHA_URL) { res.status(204).end(); return; }

  for (const campo of ["referencia", "utm_source", "utm_medium", "utm_campaign", "de"]) d[campo] = corta(d[campo]);
  const { data, hora } = horarioSaoPaulo();
  const { origem, detalhe } = classificarOrigem(d, ua);
  const { tipo, navegador, sistema } = aparelho(ua);
  const cabecalho = (nome) => corta(decodeURIComponent(String(req.headers[nome] || "")), 80);

  const linha = {
    "Data": data,
    "Hora": hora,
    "Cidade": cabecalho("x-vercel-ip-city"),
    "Estado": cabecalho("x-vercel-ip-country-region"),
    "País": cabecalho("x-vercel-ip-country"),
    "Origem": origem,
    "Detalhe da origem": corta(detalhe),
    "Página": corta(d.pagina, 120),
    "Tempo (s)": Math.max(0, Math.min(Number(d.tempo) || 0, 86400)),
    "Rolagem (%)": Math.max(0, Math.min(Number(d.rolagem) || 0, 100)),
    "Cliques": (Array.isArray(d.cliques) ? d.cliques : []).slice(0, 60).map((c) => corta(c, 90)).join(" | "),
    "Aparelho": tipo,
    "Navegador": navegador,
    "Sistema": sistema,
    "Idioma": corta(d.idioma, 10),
    "Tela": corta(d.tela, 20),
    "Visita": corta(d.visita, 60),
    "Vista": corta(d.vista, 60),
  };

  try {
    await fetch(process.env.PLANILHA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segredo: process.env.PLANILHA_SEGREDO || "", tipo: d.tipo, linha }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (erro) {
    console.error("Falha ao gravar a visita na planilha:", erro.message);
  }
  res.status(204).end();
};

// Exportados também para testar a classificação fora da Vercel
module.exports.classificarOrigem = classificarOrigem;
module.exports.aparelho = aparelho;
module.exports.horarioSaoPaulo = horarioSaoPaulo;
