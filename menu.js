// Harmoni — Menu hamburguer responsivo
// Incluir em todas as páginas com topbar

document.addEventListener('DOMContentLoaded', () => {
  const menu = document.querySelector('.menu');
  if (!menu) return;

  // Cria botão hamburguer
  const btn = document.createElement('button');
  btn.className = 'hamburger';
  btn.setAttribute('aria-label', 'Menu');
  btn.innerHTML = '<span></span><span></span><span></span>';

  // Insere antes do menu
  menu.parentNode.insertBefore(btn, menu);

  btn.addEventListener('click', () => {
    btn.classList.toggle('open');
    menu.classList.toggle('open');
  });

  // Fecha ao clicar em um link
  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      btn.classList.remove('open');
      menu.classList.remove('open');
    });
  });

  // Fecha ao clicar fora
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
      btn.classList.remove('open');
      menu.classList.remove('open');
    }
  });
});
