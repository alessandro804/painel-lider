/* ══════════════════════════════════════════════════════════════════════
   A MARCA VIVA DO HERO — e a abertura, que é a entrada dela
   ──────────────────────────────────────────────────────────────────────
   ★★★★★ A PEÇA PRINCIPAL NÃO É A ABERTURA, É A ESFERA. Este arquivo
     desenha um objeto PERMANENTE no hero: uma esfera de pontos na cor da
     marca, girando devagar na lateral direita. A abertura (túnel, frase,
     a poeira virando a folha da marca) é só a ENTRADA desse objeto, e ela
     só acontece na primeira visita da sessão.
     Quem já viu a abertura cai direto na esfera girando. O hero nunca
     fica sem a peça: era esse o defeito da versão anterior, em que a
     marca se montava e morria junto com a abertura.

   ★★★★ UM CANVAS SÓ, QUE TROCA DE MOLDURA. Durante a abertura ele é
     `position:fixed` e cobre a tela inteira; na entrega vira
     `position:absolute` dentro da `.duvida`. É a MESMA tag, só muda a
     classe: mover canvas no DOM apaga o bitmap e dá piscada. E como as
     duas molduras são alinhadas à tela, converter as posições guardadas
     é subtrair o canto da caixa nova, nada mais.

   ★★★ AS CORES SÃO BALDES, NÃO CONTAS POR PONTO. Na esfera a opacidade
     depende da profundidade de CADA ponto, então a conta por anel que
     barateava o túnel não serve. Trocar `fillStyle` 5 mil vezes por
     quadro numa animação que roda PARA SEMPRE criaria lixo de string sem
     fim. Os pontos entram em 12 baldes de profundidade numa passada e
     saem em 12 lotes: 12 trocas de estado por quadro.

   ★★ E ELA PARA QUANDO SAI DA TELA. `IntersectionObserver` suspende o
     laço quando a `.duvida` rola para fora. Animação permanente rodando
     escondida é bateria do visitante indo embora à toa.

   ★ PARA TROCAR A FRASE, mexa só na linha FRASE. O tempo de escrita é
     dividido pela quantidade de letras, então frase maior escreve mais
     rápido por letra e o total não muda.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── a frase ─────────────────────────────────────────────────────── */
  var FRASE = 'Lider 10 | seu novo sistema ERP em suas operações';

  /* ── os tempos, em milissegundos ─────────────────────────────────── */
  var ESPERA   = 300;   // túnel sozinho, antes da primeira letra
  var ESCRITA  = 2600;  // escrevendo a frase inteira
  var SEGURA   = 800;   // frase completa parada na tela
  var MONTAGEM = 1200;  // a poeira converge e vira a marca
  var POUSO    = 700;   // a marca montada, parada
  var VIRADA   = 900;   // a marca abre e vira esfera

  /* Onde a esfera mora, em fração da largura. 0.5 é o meio, 0.72 é a
     lateral direita: a mesma proporção do hero da Duoke, que põe a coluna
     de texto em 520px de um container de 1200. */
  var LADO = 0.74;   /* fração da largura do CONTEÚDO, não da tela */

  var CHAVE = 'lider10_abertura_vista_v1';

  var doc = document, raiz = doc.documentElement;
  var secao = doc.querySelector('.duvida');
  if (!secao) return;

  var comAbertura = raiz.classList.contains('abertura-ativa');

  /* ── a casca ──────────────────────────────────────────────────────── */
  var capa = doc.createElement('div');
  capa.className = 'abertura' + (comAbertura ? '' : ' ancorada');
  capa.setAttribute('role', 'presentation');

  var tela = doc.createElement('canvas');
  tela.className = 'abertura-tela';

  var ctx = null;
  try { ctx = tela.getContext('2d'); } catch (e) {}
  if (!ctx) { raiz.classList.remove('abertura-ativa'); return; }

  capa.appendChild(tela);

  var frase = null, letras = [], pular = null;

  if (comAbertura) {
    frase = doc.createElement('p');
    frase.className = 'abertura-frase';
    for (var i = 0; i < FRASE.length; i++) {
      var c = FRASE.charAt(i);
      var s = doc.createElement('span');
      s.textContent = c;
      /* `pre-wrap`, NUNCA `pre`: os dois preservam o espaço, mas `pre`
         também proíbe quebrar a linha nele. Com `pre` a frase inteira
         vira uma palavra só, estoura a largura e o fim some na borda. */
      if (c === ' ') s.style.whiteSpace = 'pre-wrap';
      /* A barra em pé é idêntica a um cursor de digitação parado, e numa
         frase sendo escrita a pessoa lê como travamento. Marcada aqui, o
         CSS a afasta e apaga para virar divisória. */
      if (c === '|') s.className = 'barra';
      frase.appendChild(s);
      letras.push(s);
    }

    pular = doc.createElement('button');
    pular.className = 'abertura-pular';
    pular.type = 'button';
    pular.textContent = 'Pular';
    pular.addEventListener('click', function () { entregar(true); });

    capa.appendChild(frase);
    capa.appendChild(pular);
  }

  secao.appendChild(capa);

  /* ── medidas ──────────────────────────────────────────────────────── */
  var l = 0, a = 0, cx = 0, cy = 0, escala = 0;

  function medir() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = capa.getBoundingClientRect();
    l = Math.max(1, Math.round(r.width));
    a = Math.max(1, Math.round(r.height));
    tela.width = Math.round(l * dpr);
    tela.height = Math.round(a * dpr);
    tela.style.width = l + 'px';
    tela.style.height = a + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = l / 2; cy = a / 2;
    escala = Math.min(l, a) * 0.62;
  }
  medir();

  var movel = window.matchMedia && window.matchMedia('(max-width:767px)').matches;
  var ANEIS   = movel ? 58 : 96;
  var PORANEL = movel ? 30 : 54;
  var PROF = 26, GIRO = 0.17;
  var total = ANEIS * PORANEL;

  /* Gerador próprio com semente fixa, não Math.random: o desenho é o
     MESMO em toda visita e em todo aparelho. Animação que sorteia a cada
     carregamento não dá para comparar entre levas nem conferir num print. */
  var semente = 0x9e3779b9;
  function sorteio() {
    semente ^= semente << 13; semente ^= semente >>> 17; semente ^= semente << 5;
    return ((semente >>> 0) % 100000) / 100000;
  }

  /* Posição de cada ponto no anel. Anel perfeito vira arame e a tela
     mostra raios saindo do centro; o desvio próprio de ângulo e de raio
     desmancha a grade e transforma o anel em nuvem. */
  var ux = new Float32Array(total), uy = new Float32Array(total);
  for (var i0 = 0; i0 < ANEIS; i0++) {
    for (var j0 = 0; j0 < PORANEL; j0++) {
      var ang = ((j0 + (sorteio() - 0.5) * 1.5) / PORANEL) * Math.PI * 2;
      var rad = 0.46 + 0.66 * Math.pow(sorteio(), 0.65);
      var n0 = i0 * PORANEL + j0;
      ux[n0] = Math.cos(ang) * rad;
      uy[n0] = Math.sin(ang) * rad;
    }
  }

  /* ── a esfera: pontos espalhados na casca por espiral de Fibonacci ── */
  var ex = new Float32Array(total), ey = new Float32Array(total), ez = new Float32Array(total);
  (function () {
    var passo = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < total; i++) {
      var y = 1 - (i / (total - 1)) * 2;
      var r = Math.sqrt(Math.max(0, 1 - y * y));
      /* ★ TREMOR AQUI TAMBÉM. A espiral de Fibonacci distribui perfeito
         demais: com 5 mil pontos o olho enxerga os braços da espiral e a
         esfera lê como globo de arame, com moiré. Um empurrãozinho no
         ângulo e na casca desmancha o padrão e mantém a esfera. */
      var th = passo * i + (sorteio() - 0.5) * 0.22;
      var casca = 0.9 + sorteio() * 0.12;
      ex[i] = Math.cos(th) * r * casca;
      ey[i] = y * casca;
      ez[i] = Math.sin(th) * r * casca;
    }
  })();

  /* ★★ A ÂNCORA É O CONTEÚDO, NÃO A JANELA. Era `l * 0.72`, ou seja 72%
     da largura da TELA. Em monitor largo esses 72% caem fora da coluna de
     1200px: a esfera foge para a borda, longe do texto que ela deveria
     acompanhar. Ancorada no `.wrap`, ela segue o conteúdo em qualquer
     largura.
     E o `trio-site.js` faz EXATAMENTE a mesma conta para a pilha de
     cards. Se as duas divergissem, a pilha e a esfera se desencontrariam
     a cada mudança de tamanho da janela, que é justo quando ninguém
     perdoa. Mexeu aqui, mexa lá. */
  function caixaConteudo() {
    var w = secao.querySelector('.wrap');
    if (!w) return { esq: 0, larg: l };
    var r = w.getBoundingClientRect(), c = capa.getBoundingClientRect();
    return { esq: r.left - c.left, larg: r.width };
  }
  function raioEsfera() {
    var b = caixaConteudo();
    return Math.min(b.larg * 0.21, a * 0.38, 205);
  }
  function centroX() {
    if (movel) return l * 0.5;
    var b = caixaConteudo();
    return b.esq + b.larg * LADO;
  }
  function centroY() { return a * 0.5; }

  /* ── alvos da marca ───────────────────────────────────────────────── */
  var alvoX = new Float32Array(total), alvoY = new Float32Array(total);
  var alvosProntos = false;

  function construirAlvos(fonte, fw, fh) {
    var off = doc.createElement('canvas');
    off.width = fw; off.height = fh;
    var octx = off.getContext('2d');
    if (!octx) return false;
    octx.drawImage(fonte, 0, 0, fw, fh);
    var d;
    try { d = octx.getImageData(0, 0, fw, fh).data; } catch (e) { return false; }

    var xs = [], ys = [];
    for (var y = 0; y < fh; y++) {
      for (var x = 0; x < fw; x++) {
        if (d[(y * fw + x) * 4 + 3] > 70) { xs.push(x); ys.push(y); }
      }
    }
    var n = xs.length;
    if (!n) return false;

    var altura  = Math.min(a * 0.40, 250);
    var escalaL = altura / fh;
    var ox = centroX() - (fw * escalaL) / 2;
    var oy = centroY() - altura / 2;

    /* Meia célula de tremor em cada alvo: sem isso todo ponto cai no
       centro da sua célula de amostragem e a marca ampliada mostra
       listras horizontais, que leem como imagem rasterizada. */
    var cel = escalaL * 0.5;
    for (var i = 0; i < total; i++) {
      var k = n >= total ? Math.floor(i * n / total) : (i % n);
      alvoX[i] = ox + xs[k] * escalaL + (sorteio() - 0.5) * cel;
      alvoY[i] = oy + ys[k] * escalaL + (sorteio() - 0.5) * cel;
    }
    alvosProntos = true;
    return true;
  }

  function alvosDeTexto() {
    var off = doc.createElement('canvas');
    off.width = 300; off.height = 92;
    var o = off.getContext('2d');
    if (!o) return;
    o.fillStyle = '#fff'; o.textAlign = 'center'; o.textBaseline = 'middle';
    o.font = '600 58px Sora, Inter, sans-serif';
    o.fillText('Lider 10', 150, 48);
    construirAlvos(off, 300, 92);
  }

  if (comAbertura) {
    var marca = new Image();
    marca.onload = function () {
      var prop = marca.naturalWidth / marca.naturalHeight;
      var fh0 = Math.max(24, Math.round(Math.sqrt(total / 0.33 / prop)));
      construirAlvos(marca, Math.round(fh0 * prop), fh0);
    };
    marca.src = 'assets/marca-abertura.png';
  }

  /* ── baldes de profundidade, para a esfera custar pouco ───────────── */
  var BALDES = 12;
  var bx = [], by = [], bn = new Int32Array(BALDES), bcor = [];
  for (var b = 0; b < BALDES; b++) {
    bx.push(new Float32Array(total));
    by.push(new Float32Array(total));
    // Fundo escuro e apagado, frente no verde claro da marca.
    var f = b / (BALDES - 1);
    bcor.push('rgba(' + Math.round(48 + f * 46) + ','
                      + Math.round(132 + f * 100) + ','
                      + Math.round(38 + f * 20) + ','
                      + (0.22 + f * 0.62).toFixed(2) + ')');
  }

  /* ── estado ───────────────────────────────────────────────────────── */
  var fase = comAbertura ? 'tunel' : 'ocioso';
  var t0 = 0, andado = 0, giroAtual = 0, rodando = true, visivel = true;
  var partX = null, opAnel = null, partY = null, tVirada = 0;
  var FIM = ESPERA + ESCRITA + SEGURA;
  var escritas = -1, comCursor = null;
  var entregue = !comAbertura;

  window.addEventListener('resize', medir);

  /* ══════════════════════════════════════════════════════════════════
     ENTREGA: revela a página e ancora o canvas na seção
     ──────────────────────────────────────────────────────────────────
     ★ Chamada uma vez. Como as duas molduras são alinhadas à tela,
       converter as posições guardadas é subtrair o canto da caixa nova.
     ══════════════════════════════════════════════════════════════════ */
  function entregar(cortar) {
    if (entregue) return;
    entregue = true;
    try { sessionStorage.setItem(CHAVE, '1'); } catch (e) {}
    raiz.classList.remove('abertura-ativa');
    if (frase) frase.classList.add('saindo');
    if (pular) pular.style.display = 'none';

    var antes = tela.getBoundingClientRect();
    capa.classList.add('ancorada');
    medir();
    var depois = tela.getBoundingClientRect();
    var dx = antes.left - depois.left, dy = antes.top - depois.top;
    if (partX) {
      for (var n = 0; n < total; n++) { partX[n] += dx; partY[n] += dy; }
    }
    for (var m = 0; m < total; m++) { alvoX[m] += dx; alvoY[m] += dy; }

    if (cortar === true) { fase = 'ocioso'; ctx.clearRect(0, 0, l, a); }
    setTimeout(function () {
      if (frase && frase.parentNode) frase.parentNode.removeChild(frase);
    }, 700);
  }

  /* ── fase 1: o túnel ──────────────────────────────────────────────── */
  function desenharTunel(t) {
    andado = (andado + 0.0062 * 16.7) % PROF;
    ctx.clearRect(0, 0, l, a);
    giroAtual = t * 0.00016;

    for (var i = 0; i < ANEIS; i++) {
      var z = ((i / ANEIS) * PROF - andado + PROF) % PROF;
      if (z < 0.05) z = 0.05;
      var k = escala / z;
      var tam = k * 0.011;
      if (tam < 0.6) tam = 0.6; else if (tam > 3.4) tam = 3.4;

      var op = 1;
      if (z > PROF - 3.5) op = (PROF - z) / 3.5;
      else if (z < 1.3) op = z / 1.3;
      if (op <= 0.01) continue;
      op *= 0.92;

      /* O ponto é BRANCO; o verde vem do brilho de fundo, que é CSS.
         Poeira de estrela é branca: quem dá a cor do ambiente é o brilho
         atrás dela. Pintar o ponto de verde cheio vira Matrix. */
      var perto = z < 5 ? (5 - z) / 5 : 0;
      ctx.fillStyle = 'rgba(' + Math.round(255 - perto * 104) + ',255,'
                    + Math.round(255 - perto * 126) + ',' + op.toFixed(3) + ')';

      var rot = i * GIRO + giroAtual;
      var cr = Math.cos(rot), sr = Math.sin(rot);
      var meio = tam / 2, base = i * PORANEL;
      for (var j = 0; j < PORANEL; j++) {
        var vx = ux[base + j], vy = uy[base + j];
        ctx.fillRect(cx + (vx * cr - vy * sr) * k - meio,
                     cy + (vx * sr + vy * cr) * k - meio, tam, tam);
      }
    }
  }

  /* ── a virada: congela onde cada ponto está neste instante ────────── */
  function fotografar() {
    partX = new Float32Array(total);
    partY = new Float32Array(total);
    opAnel = new Float32Array(ANEIS);
    for (var i = 0; i < ANEIS; i++) {
      var z = ((i / ANEIS) * PROF - andado + PROF) % PROF;
      if (z < 0.05) z = 0.05;
      var k = escala / z;
      var op = 1;
      if (z > PROF - 3.5) op = (PROF - z) / 3.5;
      else if (z < 1.3) op = z / 1.3;
      opAnel[i] = op < 0 ? 0 : op * 0.92;

      var rot = i * GIRO + giroAtual;
      var cr = Math.cos(rot), sr = Math.sin(rot), base = i * PORANEL;
      for (var j = 0; j < PORANEL; j++) {
        var vx = ux[base + j], vy = uy[base + j], n = base + j;
        partX[n] = cx + (vx * cr - vy * sr) * k;
        partY[n] = cy + (vx * sr + vy * cr) * k;
      }
    }
  }

  /* ── fase 2: a poeira vira a marca ────────────────────────────────── */
  function desenharMontagem(dt) {
    var p = dt / MONTAGEM; if (p > 1) p = 1;
    var e = 1 - Math.pow(1 - p, 3);

    /* O quadro não é apagado, é escurecido: o desenho anterior fica como
       rastro e a convergência ganha risco de movimento de graça. */
    ctx.fillStyle = p < 1 ? 'rgba(5,8,10,.30)' : 'rgba(5,8,10,.16)';
    ctx.fillRect(0, 0, l, a);

    var vm = Math.round(255 - e * 161);   // 255 -> 94
    var vd = Math.round(255 - e *  23);   // 255 -> 232
    var az = Math.round(255 - e * 197);   // 255 -> 58
    var tam = 1.1 + e * 1.0, meio = tam / 2;

    for (var i = 0; i < ANEIS; i++) {
      var op = opAnel[i];
      if (op <= 0.02) continue;
      ctx.fillStyle = 'rgba(' + vm + ',' + vd + ',' + az + ','
                    + (op * (0.55 + 0.45 * e)).toFixed(3) + ')';
      var base = i * PORANEL;
      for (var j = 0; j < PORANEL; j++) {
        var n = base + j;
        ctx.fillRect(partX[n] + (alvoX[n] - partX[n]) * e - meio,
                     partY[n] + (alvoY[n] - partY[n]) * e - meio, tam, tam);
      }
    }
  }

  /* ── fase 3: a marca abre e vira esfera ───────────────────────────── */
  function desenharVirada(dt) {
    var p = dt / VIRADA; if (p > 1) p = 1;
    var e = p * p * (3 - 2 * p);          // suave nas duas pontas
    ctx.clearRect(0, 0, l, a);
    desenharPontos(e, 0);
  }

  /* ── fase 4: a esfera girando, para sempre ────────────────────────── */
  function desenharEsfera(t) {
    ctx.clearRect(0, 0, l, a);
    desenharPontos(1, t * 0.00021);
  }

  /* `mistura` 0 = ainda na marca, 1 = esfera inteira. Os pontos entram
     nos baldes numa passada e saem em 12 lotes. */
  function desenharPontos(mistura, giro) {
    var R = raioEsfera(), ox = centroX(), oy = centroY();
    var cr = Math.cos(giro), sr = Math.sin(giro);
    var i;
    for (i = 0; i < BALDES; i++) bn[i] = 0;

    for (i = 0; i < total; i++) {
      var vx = ex[i], vz = ez[i];
      var px = vx * cr - vz * sr;
      var pz = vx * sr + vz * cr;
      var k = 1 + pz * 0.18;            // perspectiva leve
      var sx = ox + px * R * k;
      var sy = oy + ey[i] * R * k;

      if (mistura < 1) {
        sx = alvoX[i] + (sx - alvoX[i]) * mistura;
        sy = alvoY[i] + (sy - alvoY[i]) * mistura;
      }

      var b = Math.floor(((pz + 1) / 2) * (BALDES - 1) + 0.5);
      if (b < 0) b = 0; else if (b > BALDES - 1) b = BALDES - 1;
      var c = bn[b]++;
      bx[b][c] = sx; by[b][c] = sy;
    }

    for (var bb = 0; bb < BALDES; bb++) {
      var q = bn[bb];
      if (!q) continue;
      ctx.fillStyle = bcor[bb];
      var tam = 1.05 + (bb / (BALDES - 1)) * 1.05, meio = tam / 2;
      var ax = bx[bb], ay = by[bb];
      for (i = 0; i < q; i++) ctx.fillRect(ax[i] - meio, ay[i] - meio, tam, tam);
    }
  }

  /* ── o laço ───────────────────────────────────────────────────────── */
  function quadro(agora) {
    if (!rodando) return;
    if (!t0) t0 = agora;
    var t = agora - t0;

    if (fase === 'tunel') {
      desenharTunel(t);
      if (t > ESPERA) {
        var quantas = Math.min(letras.length,
          Math.ceil(((t - ESPERA) / ESCRITA) * letras.length));
        if (quantas !== escritas) mostrarLetras(quantas);
      }
      if (t >= FIM) { if (!alvosProntos) alvosDeTexto(); fotografar(); fase = 'montagem'; }

    } else if (fase === 'montagem') {
      var dt = t - FIM;
      desenharMontagem(dt);
      if (dt >= MONTAGEM + POUSO) { entregar(); tVirada = t; fase = 'virada'; }

    } else if (fase === 'virada') {
      var dv = t - tVirada;
      desenharVirada(dv);
      if (dv >= VIRADA) fase = 'ocioso';

    } else {
      desenharEsfera(t);
    }

    requestAnimationFrame(quadro);
  }

  /* O cursor é guardado pelo ELEMENTO, não pelo índice: tirar a classe de
     `letras[escritas]` e pôr em `letras[n-1]` são posições diferentes, e
     a frase enchia de barrinhas entre as letras. */
  function mostrarLetras(n) {
    for (var i = escritas < 0 ? 0 : escritas; i < n; i++) letras[i].style.visibility = 'visible';
    if (comCursor) comCursor.classList.remove('tem-cursor');
    comCursor = null;
    if (n > 0 && n < letras.length) {
      comCursor = letras[n - 1];
      comCursor.classList.add('tem-cursor');
    }
    if (n >= letras.length) frase.classList.add('pronta');
    escritas = n;
  }

  /* Suspende o laço quando a seção sai da tela. */
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (es) {
      var dentro = es[0].isIntersecting;
      if (dentro === visivel) return;
      visivel = dentro;
      if (dentro && !rodando) { rodando = true; t0 = 0; requestAnimationFrame(quadro); }
      else if (!dentro && fase === 'ocioso') rodando = false;
    }, { rootMargin: '120px' }).observe(secao);
  }

  /* Teto absoluto da abertura: se algo travar antes da entrega, a página
     se liberta sozinha e a esfera assume. */
  if (comAbertura) {
    setTimeout(function () { entregar(true); },
               FIM + MONTAGEM + POUSO + VIRADA + 1500);
  }

  requestAnimationFrame(quadro);
})();
