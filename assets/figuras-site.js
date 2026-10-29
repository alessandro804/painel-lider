/* ══════════════════════════════════════════════════════════════════════
   figuras-site.js  ·  AS IMAGENS QUE O PAINEL SOBE  (v33k.3168)
   ──────────────────────────────────────────────────────────────────────
   Pedido dele em 29/10: subir as imagens das paginas direto pelo painel,
   como superadmin, em vez de mandar os arquivos a cada leva.

   ★★★★ ENTAO A PAGINA NASCE COM OS ESPACOS, E ELES SE ENCHEM DEPOIS. Cada
     espaco e um elemento com `data-fig="<chave>"`. Este script pergunta
     ao backend quais chaves daquela pagina tem imagem e preenche as que
     tiverem. O resto fica como esta.

   ★★★ E SE ESTE SCRIPT NAO RODAR, A PAGINA CONTINUA INTEIRA. Sem rede,
     sem backend, sem tabela: os espacos de conteudo seguem mostrando o
     quadro do pedido e os laterais seguem invisiveis. Nada aqui e
     requisito para a pagina servir, e isso e de proposito: uma pagina de
     venda nao pode depender de uma chamada para existir.

   ★★ A URL VEM DO BANCO, E E ESCRITA NUM `src`. Entao ela e conferida
     antes: so `https://` entra. Sem isso, uma linha com `javascript:`
     dentro viraria codigo rodando na pagina, e quem escreve nessa tabela
     e o painel, nao a pagina.

   ★ O MOVIMENTO E CLASSE, NAO ESTILO INLINE. As animacoes moram no
     `site.css`, onde o `prefers-reduced-motion` ja desliga tudo. Estilo
     inline aqui passaria por cima dessa regra e faria a pagina se mexer
     para quem pediu que ela nao se mexesse.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var API = 'https://api.painel.lidercommerce.com.br/api/site/figuras';
  var MOVIMENTOS = ['nenhum', 'flutuar', 'circular', 'vertical', 'horizontal', 'aleatorio'];
  var VELOCIDADES = ['lenta', 'media', 'rapida'];

  var espacos = Array.prototype.slice.call(document.querySelectorAll('[data-fig]'));
  if (!espacos.length) return;

  var meta = document.querySelector('meta[name="lider10-pagina"]');
  var pagina = meta ? String(meta.getAttribute('content') || '') : '';

  function segura(u) {
    return typeof u === 'string' && /^https:\/\//.test(u) && u.length < 2000;
  }
  function umDe(v, lista, padrao) {
    return lista.indexOf(String(v)) !== -1 ? String(v) : padrao;
  }

  function porChave(lista) {
    var mapa = {};
    for (var i = 0; i < lista.length; i++) {
      var f = lista[i];
      if (f && f.chave && segura(f.url)) mapa[f.chave] = f;
    }
    return mapa;
  }

  function encher(el, f) {
    var img = document.createElement('img');
    img.src = f.url;
    img.alt = el.getAttribute('data-alt') || '';
    img.loading = 'lazy';
    img.decoding = 'async';

    if (el.className.indexOf('lat') === 0) {
      /* Lateral: o lado vem do painel e pode ser diferente do que a pagina
         trouxe, entao a classe antiga sai antes da nova entrar. */
      el.classList.remove('lat-esquerda', 'lat-direita');
      el.classList.add(f.lado === 'esquerda' ? 'lat-esquerda' : 'lat-direita');
      el.classList.add('lat-mov-' + umDe(f.movimento, MOVIMENTOS, 'flutuar'));
      el.classList.add('lat-vel-' + umDe(f.velocidade, VELOCIDADES, 'media'));
      /* A largura vai como VARIAVEL, nao como `style.width`: o `min()` do
         CSS continua por cima dela e segue apertando a imagem nas telas
         onde ela nao caberia. Escrever a largura direto tiraria essa
         trava e deixaria a imagem encostar no texto. */
      var larg = Math.round(Number(f.largura));
      if (isFinite(larg) && larg >= 140 && larg <= 460) {
        el.style.setProperty('--lat-w', larg + 'px');
      }
      el.innerHTML = '';
      el.appendChild(img);
      /* A imagem so acende depois de carregada: acender antes mostra o
         espaco em branco crescendo, que e pior que ela aparecer tarde. */
      if (img.complete) el.classList.add('acesa');
      else img.addEventListener('load', function () { el.classList.add('acesa'); });
      return;
    }

    /* Conteudo: troca o quadro do pedido pela imagem, mantendo a legenda. */
    var vazia = el.querySelector('.fig-vazia');
    var quadro = el.querySelector('.fig-quadro');
    var legenda = el.querySelector('.fig-legenda');
    if (legenda && !img.alt) img.alt = legenda.textContent || '';
    /* O espaco estava escondido ate agora: a imagem chegou, entao ele
       aparece. A ordem importa, e a classe sai DEPOIS de a imagem estar
       dentro, para a pagina nao piscar um quadro vazio antes. */
    if (quadro) {
      quadro.innerHTML = '';
      quadro.appendChild(img);
      el.classList.remove('fig-sem');
      return;
    }
    if (!vazia) return;
    var novo = document.createElement('div');
    novo.className = 'fig-quadro';
    novo.appendChild(img);
    el.replaceChild(novo, vazia);
    el.classList.remove('fig-sem');
  }

  function aplicar(lista) {
    var mapa = porChave(lista || []);
    for (var i = 0; i < espacos.length; i++) {
      var el = espacos[i];
      var f = mapa[el.getAttribute('data-fig')];
      if (f) { try { encher(el, f); } catch (e) { /* uma figura nao derruba as outras */ } }
    }
  }

  var url = API + (pagina ? '?pagina=' + encodeURIComponent(pagina) : '');
  fetch(url, { method: 'GET' })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d && d.ok) aplicar(d.figuras); })
    .catch(function () { /* sem rede a pagina fica como esta, e esta inteira */ });
})();
