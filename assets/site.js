// Abre as imagens das galerias em tela cheia; fecha com clique, botão ou Esc.
const lightbox = document.getElementById("lightbox");
const imagem = lightbox.querySelector("img");
const legenda = lightbox.querySelector(".legenda");

function abrir(img) {
  imagem.src = img.src;
  imagem.alt = img.alt;
  legenda.textContent = img.alt;
  lightbox.hidden = false;
}

function fechar() {
  lightbox.hidden = true;
  imagem.src = "";
}

document.querySelectorAll(".galeria img").forEach((img) => img.addEventListener("click", () => abrir(img)));
lightbox.addEventListener("click", (evento) => { if (evento.target !== imagem) fechar(); });
document.addEventListener("keydown", (evento) => { if (evento.key === "Escape" && !lightbox.hidden) fechar(); });
