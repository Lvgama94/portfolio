// Página inicial: vitrine de projetos com abas numeradas e imagens ampliadas.

// ------------------------------------------------------------ imagens ampliadas
// O lightbox é uma janela (<dialog>): o Esc e o clique fora fecham.
const lightbox = document.getElementById("lightbox");
const imagemAmpliada = lightbox.querySelector("img");
const legenda = lightbox.querySelector(".legenda");

function ampliar(img) {
  imagemAmpliada.src = img.src;
  imagemAmpliada.alt = img.alt;
  legenda.textContent = img.alt;
  lightbox.showModal();
}

lightbox.addEventListener("click", (evento) => { if (evento.target !== imagemAmpliada) lightbox.close(); });

// ------------------------------------------------------------ vitrine de projetos
const vitrine = document.querySelector(".vitrine");
const barra = vitrine.querySelector(".abas-vitrine");
const marcador = vitrine.querySelector(".marcador-aba");
const abas = [...barra.querySelectorAll('[role="tab"]')];
const paineis = abas.map((aba) => document.getElementById(aba.getAttribute("aria-controls")));
const posicao = vitrine.querySelector(".posicao strong");
const area = vitrine.querySelector(".paineis-vitrine");
let atual = 0;
let soltarAltura = null;

/** Faz a troca de painel e anima a altura da vitrine da do projeto anterior até a do novo. */
function trocarComAltura(trocar, animar) {
  const antes = area.offsetHeight;
  clearTimeout(soltarAltura);
  area.classList.remove("redimensionando");
  area.style.height = "";
  trocar();
  const depois = area.offsetHeight;
  if (!animar || antes === depois || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  area.style.height = `${antes}px`;
  void area.offsetHeight;
  area.classList.add("redimensionando");
  area.style.height = `${depois}px`;
  // Terminada a transição, volta à altura automática (o timer não depende do transitionend)
  soltarAltura = setTimeout(() => {
    area.classList.remove("redimensionando");
    area.style.height = "";
  }, 550);
}

/** Leva o marcador branco até a aba ativa (sem animar na primeira vez). */
function moverMarcador(animar = true) {
  const aba = abas[atual];
  marcador.classList.toggle("sem-transicao", !animar);
  marcador.style.setProperty("--x-marcador", `${aba.offsetLeft}px`);
  marcador.style.setProperty("--y-marcador", `${aba.offsetTop}px`);
  marcador.style.setProperty("--largura-marcador", `${aba.offsetWidth}px`);
  marcador.style.setProperty("--altura-marcador", `${aba.offsetHeight}px`);
  // Na barra que rola de lado (celular), centraliza a aba sem mexer na rolagem da página
  barra.scrollTo({ left: aba.offsetLeft - (barra.clientWidth - aba.offsetWidth) / 2, behavior: animar ? "smooth" : "auto" });
}

function ativar(indice, { focar = false, endereco = true, animar = true } = {}) {
  indice = (indice + abas.length) % abas.length;
  if (indice === atual) return;
  const anterior = paineis[atual];
  const novo = paineis[indice];
  abas[atual].setAttribute("aria-selected", "false");
  abas[atual].tabIndex = -1;
  abas[indice].setAttribute("aria-selected", "true");
  abas[indice].tabIndex = 0;
  trocarComAltura(() => {
    anterior.classList.remove("ativo", "entrando");
    // O novo painel entra pelo lado para onde se andou; reiniciar a classe reinicia a animação
    novo.style.setProperty("--direcao", indice > atual ? 1 : -1);
    novo.classList.remove("entrando");
    void novo.offsetWidth;
    novo.classList.add("ativo", "entrando");
  }, animar);
  atual = indice;
  posicao.textContent = indice + 1;
  moverMarcador();
  if (focar) abas[indice].focus({ preventScroll: true });
  if (endereco) history.replaceState(null, "", `#${novo.id}`);
}

abas.forEach((aba, i) => aba.addEventListener("click", () => ativar(i)));
barra.addEventListener("keydown", (evento) => {
  const destino = { ArrowRight: atual + 1, ArrowLeft: atual - 1, Home: 0, End: abas.length - 1 }[evento.key];
  if (destino === undefined) return;
  evento.preventDefault();
  ativar(destino, { focar: true });
});

// Setas abaixo dos painéis: se o topo da vitrine saiu da tela, volta até ele para o próximo projeto começar do início
function andar(passo) {
  ativar(atual + passo);
  const topo = vitrine.getBoundingClientRect().top;
  if (topo < 0) vitrine.scrollIntoView({ behavior: "smooth", block: "start" });
}
vitrine.querySelector(".navegar-vitrine .anterior").addEventListener("click", () => andar(-1));
vitrine.querySelector(".navegar-vitrine .proximo").addEventListener("click", () => andar(1));

// No celular, arrastar para o lado troca de projeto
let toque = null;
area.addEventListener("touchstart", (evento) => {
  const t = evento.changedTouches[0];
  toque = { x: t.clientX, y: t.clientY };
}, { passive: true });
area.addEventListener("touchend", (evento) => {
  if (!toque) return;
  const t = evento.changedTouches[0];
  const dx = t.clientX - toque.x;
  const dy = t.clientY - toque.y;
  toque = null;
  if (Math.abs(dx) > 60 && Math.abs(dy) < 50) andar(dx < 0 ? 1 : -1);
}, { passive: true });

// Miniaturas trocam a imagem principal com um esmaecimento; a principal amplia no clique
for (const painel of paineis) {
  const principal = painel.querySelector(".imagem-principal");
  if (!principal) continue;
  const img = principal.querySelector("img");
  const miniaturas = [...painel.querySelectorAll(".miniatura")];
  img.addEventListener("load", () => img.classList.remove("trocando"));
  principal.addEventListener("click", () => ampliar(img));
  for (const miniatura of miniaturas) {
    miniatura.addEventListener("click", () => {
      if (miniatura.classList.contains("ativa")) return;
      for (const m of miniaturas) {
        m.classList.toggle("ativa", m === miniatura);
        m.setAttribute("aria-pressed", String(m === miniatura));
      }
      img.classList.add("trocando");
      setTimeout(() => {
        img.src = miniatura.dataset.src;
        img.alt = miniatura.getAttribute("aria-label");
        principal.setAttribute("aria-label", `Ampliar: ${img.alt}`);
        // Se o load não vier (imagem já em cache em alguns navegadores), reaparece mesmo assim
        setTimeout(() => img.classList.remove("trocando"), 400);
      }, 180);
    });
  }
}

// O endereço escolhe o projeto: as outras páginas voltam para index.html#comercial, por exemplo
function doEndereco(aoCarregar = false) {
  const indice = paineis.findIndex((p) => `#${p.id}` === location.hash);
  if (indice < 0) return;
  ativar(indice, { endereco: false, animar: !aoCarregar });
  if (aoCarregar) document.getElementById("projetos").scrollIntoView({ behavior: "instant", block: "start" });
}
window.addEventListener("hashchange", () => doEndereco());

new ResizeObserver(() => moverMarcador(false)).observe(barra);
doEndereco(true);
moverMarcador(false);
