/* ══════════════════════════════════════════════════════════════════════
   OS TRÊS CARDS QUE DESCEM DA BOLINHA  (leva 4)
   ──────────────────────────────────────────────────────────────────────
   ★★★★★ MEDIDO NA DUOKE, não inventado. Rolei o site deles amostrando os
     três `.duoke-hero-card`:
       rolagem   0 : empilhados sobre o visual da direita, escalas 0.97,
                     0.81 e 0.73, girados 1.1, 8.1 e 11.8 graus
       rolagem 300 : fileira de três, escala 1, giro 0
       depois      : transform congelado, rolam normal com a página
     A animação inteira cabe em 300px. É por isso que a faixa mora colada
     no hero: fosse lá embaixo, os cards teriam de cruzar a página inteira
     em 300px de scroll.

   ★★★★ NÃO USO getBoundingClientRect PARA MEDIR, e isso conserta dois
     defeitos reais que apareceram na primeira versão. Aquele método É
     AFETADO PELO TRANSFORM, então para ler a posição final eu tinha de
     zerar o transform antes. Daí vinham:
       1. piscada: zerar e repintar no mesmo quadro joga o card para a
          fileira e traz de volta. Num resize, que dispara dezenas de
          vezes por segundo, virava tremedeira;
       2. erro permanente: se a medição caísse num instante ruim (fonte
          ainda chegando), a posição saía errada e nunca mais se
          corrigia, porque eu só remedia em horários fixos.
     `offsetLeft`/`offsetTop` são posição de LAYOUT e ignoram transform.
     Medir deixou de ter efeito colateral, então pode ser feito a
     qualquer momento, inclusive no meio da animação.

   ★★★ A ÂNCORA É O CONTEÚDO, NÃO A JANELA. Antes era 72% da largura da
     TELA. Em monitor largo os 72% caem fora da coluna de 1200px: a
     bolinha foge para a borda e a pilha vai atrás dela. Ancorado no
     `.wrap`, o conjunto acompanha o conteúdo em qualquer largura. O
     `abertura-site.js` usa a MESMA conta para a esfera, senão os dois se
     desencontram quando a janela muda de tamanho.

   ★★ A CONTA É FEITA AO CONTRÁRIO: o card nasce na posição final, no
     fluxo normal da grade, e o script só o empurra de volta para a pilha.
     `q` vai de 1 (pilha) a 0 (fileira). A posição final é a do CSS, não
     um número aqui: se a grade mudar, a animação acompanha sozinha, e com
     o script desligado a página fica certa, só sem o efeito.

   ★ O BARALHO GIRA sozinho de 2 em 2 segundos, para quando o mouse
     encosta, e um card de trás vem para a frente quando clicado.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var JANELA = 300;    // a mesma da Duoke
  var GIRA   = 2000;   // troca de lugar a cada 2s
  var SUAVE  = 0.16;   // quanto do caminho o card anda por quadro na troca

  /* As três vagas do leque. Vaga 0 é a da frente. `dx`/`dy` são o desvio
     em relação ao centro da bolinha. */
  var VAGAS = [
    { dx: -52, dy: -26, esc: 0.80, giro:  -3, z: 3 },
    { dx:  74, dy:  10, esc: 0.69, giro:   8, z: 2 },
    { dx: 168, dy:  42, esc: 0.60, giro:  14, z: 1 }
  ];
  /* A pilha é menor que a da Duoke de propósito: lá o visual do hero é um
     canvas de tela cheia e aparece em volta de qualquer jeito. A nossa
     bolinha é uma esfera compacta, e com as proporções deles ela sumia
     inteira atrás dos cards, logo depois de uma abertura que termina
     justo formando essa esfera. */

  var doc = document;
  var faixa = doc.querySelector('.trio');
  var hero  = doc.querySelector('.duvida');
  var cards = Array.prototype.slice.call(doc.querySelectorAll('.trio .rec'));
  if (!faixa || !hero || cards.length !== 3) return;

  var reduzido = window.matchMedia &&
                 window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var natural = null, centro = null, sujo = true;
  var naVaga  = [0, 1, 2];                         // card i ocupa a vaga naVaga[i]
  var atual   = VAGAS.map(function (v) {           // valores correntes, que perseguem a vaga
    return { dx: v.dx, dy: v.dy, esc: v.esc, giro: v.giro };
  });
  var sobreMouse = 0, girando = false, limpo = false;

  function estreito() { return window.innerWidth < 1040; }

  function limpar() {
    if (limpo) return;
    cards.forEach(function (c) { c.style.transform = ''; c.style.zIndex = ''; });
    limpo = true;
  }

  function posDocumento(el) {
    var x = 0, y = 0;
    while (el) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
    return { x: x, y: y };
  }

  function medir() {
    natural = cards.map(function (c) {
      var p = posDocumento(c);
      return { cx: p.x + c.offsetWidth / 2, cy: p.y + c.offsetHeight / 2 };
    });
    var hp = posDocumento(hero);
    var wrap = hero.querySelector('.wrap');
    var wp = wrap ? posDocumento(wrap) : null;
    centro = {
      x: wp ? wp.x + wrap.offsetWidth * 0.74 : hp.x + hero.offsetWidth * 0.72,
      y: hp.y + hero.offsetHeight * 0.5
    };
  }

  /* ── a troca de lugar ─────────────────────────────────────────────── */

  /* Vaga 0 é a frente. O da frente vai para o fundo e os outros avançam:
     0 -> 2, 1 -> 0, 2 -> 1. Que é somar 2 e tirar o resto por 3. */
  function rodar() {
    for (var i = 0; i < 3; i++) naVaga[i] = (naVaga[i] + 2) % 3;
  }

  /* Põe o card `i` na frente e empurra para trás só quem estava à frente
     dele, preservando a ordem relativa do resto. */
  function trazerFrente(i) {
    var v = naVaga[i];
    if (v === 0) return;
    for (var j = 0; j < 3; j++) {
      if (j === i) naVaga[j] = 0;
      else if (naVaga[j] < v) naVaga[j] += 1;
    }
    ligar();
  }

  setInterval(function () {
    if (sobreMouse > 0 || reduzido || estreito()) return;
    if (rolagem() > JANELA * 0.75) return;   // só gira enquanto a pilha aparece
    rodar();
    ligar();
  }, GIRA);

  cards.forEach(function (c, i) {
    c.addEventListener('mouseenter', function () { sobreMouse++; });
    c.addEventListener('mouseleave', function () { sobreMouse = Math.max(0, sobreMouse - 1); });
    c.addEventListener('click', function (e) {
      /* Clique num link do card segue para o link; clique no resto do
         card traz ele para a frente. */
      if (e.target.closest && e.target.closest('a')) return;
      if (rolagem() > JANELA) return;        // já está na fileira: não há pilha
      trazerFrente(i);
    });
  });

  /* ── o desenho ────────────────────────────────────────────────────── */
  function rolagem() {
    return window.pageYOffset || doc.documentElement.scrollTop || 0;
  }

  function pintar() {
    if (reduzido || estreito()) { limpar(); return false; }
    if (sujo) { medir(); sujo = false; }
    if (!natural || !centro) return false;

    var p = rolagem() / JANELA;
    if (p < 0) p = 0; else if (p > 1) p = 1;
    var e = 1 - Math.pow(1 - p, 3);     // desacelera ao chegar na fileira
    var q = 1 - e;                      // 1 = pilha, 0 = fileira

    if (q < 0.002) { limpar(); return false; }
    limpo = false;

    // cada card persegue os valores da vaga que ocupa agora
    var mexendo = false;
    for (var i = 0; i < 3; i++) {
      var alvo = VAGAS[naVaga[i]], a = atual[i];
      for (var k in alvo) {
        if (k === 'z') continue;
        var d = alvo[k] - a[k];
        if (Math.abs(d) > 0.004) { a[k] += d * SUAVE; mexendo = true; }
        else a[k] = alvo[k];
      }
    }

    for (var j = 0; j < 3; j++) {
      var n = natural[j], c = cards[j], v = atual[j];
      var dx = (centro.x + v.dx - n.cx) * q;
      var dy = (centro.y + v.dy - n.cy) * q;
      c.style.transform = 'translate3d(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px,0)'
                        + ' rotate(' + (v.giro * q).toFixed(2) + 'deg)'
                        + ' scale(' + (1 + (v.esc - 1) * q).toFixed(4) + ')';
      c.style.zIndex = VAGAS[naVaga[j]].z;
    }
    return mexendo;
  }

  /* Um laço só, que roda enquanto a pilha pode estar à vista e para
     sozinho depois disso. Qualquer rolagem o religa. */
  function laco() {
    var mexendo = pintar();
    if (rolagem() < JANELA + 600 || mexendo) requestAnimationFrame(laco);
    else girando = false;
  }

  function ligar() {
    if (girando) return;
    girando = true;
    requestAnimationFrame(laco);
  }

  function remarcar() { sujo = true; ligar(); }

  window.addEventListener('scroll', ligar, { passive: true });
  window.addEventListener('resize', remarcar);
  window.addEventListener('load', remarcar);
  if (doc.fonts && doc.fonts.ready && doc.fonts.ready.then) doc.fonts.ready.then(remarcar);
  /* A abertura esconde o corpo enquanto roda; quando entrega, a altura
     final pode ter mudado. Como medir agora não tem efeito colateral,
     remarcar aqui não custa nem pisca. */
  setTimeout(remarcar, 1500);
  setTimeout(remarcar, 7000);

  ligar();
})();
