/* ══════════════════════════════════════════════════════════════════════
   promo-site.js  ·  A PAGINA TEMATICA DA PROMOCAO  (v33k.3320)
   ──────────────────────────────────────────────────────────────────────
   Serve `/promo/`. Uma pagina so, para todos os temas e todos os anos:
   ela se decora com o tema que a campanha NO AR indicar.

   ★★★★★ O NATAL DE 2027 NAO PRECISA DE CODIGO NOVO. E uma campanha nova
     com `tema_slug = 'natal'` e datas novas. Nenhuma linha daqui muda,
     nenhuma pagina e publicada, nenhum endereco novo e indexado. Foi o
     pedido dele de 08/11: *"vamos ir reaproveitando esse natal de 2026 e
     para o de 2027, etc..."*.

   ★★★★★ NENHUMA DATA, ANO OU PRECO ESTA ESCRITO NESTA PAGINA. Tudo vem da
     rota publica no carregamento. Escrito aqui, viraria mentira no ar: uma
     pagina publicada com "termina em 2 dias" continua dizendo isso em
     marco do ano seguinte.

   ★★★★ SEM PROMOCAO NO AR, A PAGINA NAO FINGE: diz que nao ha oferta agora
     e manda a pessoa para a tabela normal. Pagina de promocao vencida com
     contador rodando vende desconfianca.

   ★★★ NENHUMA CONTA DE DINHEIRO AQUI. O preco promocional, a mensalidade
     equivalente e o quanto falta vem calculados da rota. Dividir por 12
     neste arquivo faria a pagina divergir do cobrado no centavo.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var ENDERECO = 'https://api.painel.lidercommerce.com.br/api/vitrine';

  var raiz = document.getElementById('prRaiz');
  if (!raiz) return;

  var elTitulo = document.getElementById('prTitulo');
  var elSub = document.getElementById('prSub');
  var elSelo = document.getElementById('prSelo');
  var elRelogio = document.getElementById('prRelogio');
  var elAcoes = document.getElementById('prAcoes');
  var elNada = document.getElementById('prNada');
  var elArea = document.getElementById('prTabelaArea');
  var elGrade = document.getElementById('prGrade');
  var elEnfeites = document.getElementById('prEnfeites');
  var elConta = document.getElementById('prConta');
  var elContaChamada = document.getElementById('prContaChamada');
  var elContaTexto = document.getElementById('prContaTexto');
  var palco = raiz.querySelector('.pr-palco');

  var TEMAS = {};
  try {
    var bruto = document.getElementById('prTemas');
    if (bruto) TEMAS = JSON.parse(bruto.textContent || '{}');
  } catch (e) { TEMAS = {}; }

  var PROMO = null;
  var fimLocal = 0;
  var timer = null;
  var periodo = 'anual';

  function moeda(v) {
    var n = Number(v);
    if (!isFinite(n)) return '';
    var t = n.toFixed(2).split('.');
    return t[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + t[1];
  }
  function dd(n) { return (n < 10 ? '0' : '') + n; }
  function texto(el, t) { if (el) el.textContent = t; }

  function quantoFalta() {
    var resta = fimLocal - Date.now();
    if (!(resta > 0)) return null;
    var seg = Math.floor(resta / 1000);
    return {
      dias: Math.floor(seg / 86400),
      horas: Math.floor((seg % 86400) / 3600),
      minutos: Math.floor((seg % 3600) / 60),
      segundos: seg % 60
    };
  }

  function pintarRelogio() {
    var f = quantoFalta();
    if (!f) return false;
    texto(document.getElementById('prDias'), String(f.dias));
    texto(document.getElementById('prHoras'), dd(f.horas));
    texto(document.getElementById('prMin'), dd(f.minutos));
    texto(document.getElementById('prSeg'), dd(f.segundos));
    return true;
  }

  // ★★★ Os enfeites sao SVG inline, desenhados aqui. Nao ha upload de arte
  //   para a pagina existir: tema novo e um bloco de CSS no gerador mais um
  //   desenho aqui, e nada mais.
  var DESENHOS = {
    floco: '<path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19"/>',
    estrela: '<path d="m12 3 2.6 6.3 6.8.5-5.2 4.4 1.6 6.6L12 17.3 6.2 20.8l1.6-6.6L2.6 9.8l6.8-.5z"/>',
    confete: '<path d="M4 20 14 4M8 20l8-14M14 20 20 9"/>',
    coracao: '<path d="M12 20s-7-4.5-7-9.5A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 7 2.5C19 15.5 12 20 12 20z"/>'
  };

  // ★★★★★ O TEXTO DE VENDA SAI DO TEMA, nao de um campo digitado (v33k.3322).
  //   Pedido dele em 08/11: a pagina estava *"com cara de tela sem muita
  //   coisa"* e *"nao esta explicando tao bem"*. O argumento de Black Friday
  //   nao serve para a Pascoa, entao cada tema carrega o seu, junto com a cor
  //   e o enfeite, na MESMA lista do gerador. Um lugar so para o tema inteiro:
  //   tema novo nasce com cor, desenho e texto de uma vez, ou nao nasce.
  //
  // ★★★ `textContent` em cada paragrafo, e nao `innerHTML` na secao: o texto
  //   vem de um JSON embutido na propria pagina, mas escrever HTML a partir de
  //   dado e um habito que cobra caro no dia em que a origem do dado mudar.
  function contar(tema) {
    if (!elConta) return;
    // ★★★ `tema` JA CHEGA NORMALIZADO por quem chama (`aplicar` troca o que o
    //   site nao conhece por 'padrao'), entao nao ha segundo `|| padrao` aqui:
    //   um mutante provou que aquele galho era inalcancavel, e galho que
    //   nenhuma medicao alcanca e galho que ninguem sabe se funciona.
    var t = TEMAS[tema] || {};
    var paras = (t.paragrafos && t.paragrafos.length) ? t.paragrafos : null;
    if (!t.chamada && !paras) { elConta.hidden = true; return; }
    texto(elContaChamada, t.chamada || '');
    if (elContaTexto) {
      elContaTexto.innerHTML = '';
      for (var i = 0; paras && i < paras.length; i++) {
        var pp = document.createElement('p');
        pp.textContent = paras[i];
        elContaTexto.appendChild(pp);
      }
    }
    elConta.hidden = false;
  }

  function enfeitar(tipo) {
    if (!elEnfeites) return;
    var d = DESENHOS[tipo] || DESENHOS.estrela;
    // posicoes fixas, nao aleatorias: pagina que muda de desenho a cada
    // carregamento parece instavel, e nao ha nada a ganhar com isso
    var postos = [
      [6, 12, 34, 0], [88, 18, 26, 1.4], [18, 70, 22, 2.8], [74, 66, 30, 0.7],
      [44, 8, 18, 2.1], [58, 82, 20, 3.5], [30, 34, 16, 1.1], [92, 48, 18, 2.4]
    ];
    var h = '';
    for (var i = 0; i < postos.length; i++) {
      var p = postos[i];
      h += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"'
        + ' stroke-linecap="round" width="' + p[2] + '" height="' + p[2] + '"'
        + ' style="left:' + p[0] + '%;top:' + p[1] + '%;animation-delay:' + p[3] + 's">'
        + d + '</svg>';
    }
    elEnfeites.innerHTML = h;
  }

  function cartao(id, nome, x) {
    var temDesconto = (x.promocional < x.cheio);
    var mes = (periodo === 'anual') ? x.promocional_mes : x.promocional;
    var mesCheio = (periodo === 'anual') ? x.cheio_mes : x.cheio;
    var h = '<div class="pr-card">'
      + '<div class="pr-card-nome">' + nome + '</div>';
    if (temDesconto) {
      h += '<div class="pr-card-de">R$ ' + moeda(mesCheio) + '/mês</div>'
        + '<div class="pr-card-por">R$ ' + moeda(mes) + '</div>'
        + '<div class="pr-card-unidade">por mês'
        + (periodo === 'anual' ? (', com R$ ' + moeda(x.promocional) + ' no primeiro ano') : ', no primeiro mês')
        + '</div>'
        + '<div class="pr-card-eco">economia de R$ ' + moeda(x.cheio - x.promocional) + '</div>';
    } else {
      h += '<div class="pr-card-por">R$ ' + moeda(mes) + '</div>'
        + '<div class="pr-card-unidade">por mês'
        + (periodo === 'anual' ? (', R$ ' + moeda(x.cheio) + ' por ano') : '') + '</div>';
    }
    // ★★★★★ O PRECO DEPOIS, EM TODO CARTAO. Dizer so "30% OFF" e deixar o
    //   cliente descobrir o cheio na renovacao e a reclamacao de cobranca
    //   indevida chegando com razao, um ciclo depois.
    h += '<div class="pr-card-depois">Depois: R$ ' + moeda(x.cheio)
      + (periodo === 'anual' ? '/ano' : '/mês') + '</div>';
    if (x.bonus_dias) {
      h += '<div class="pr-card-bonus">+' + x.bonus_dias + ' dias de cortesia</div>';
    }
    h += '<a href="/app" class="btn btn-acao pr-card-btn">Assinar ' + nome + '</a>'
      + '</div>';
    return h;
  }

  function pintarGrade() {
    if (!PROMO || !elGrade) return;
    var h = '';
    var ids = Object.keys(PROMO.precos);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var x = PROMO.precos[id][periodo];
      if (!x) continue;
      h += cartao(id, (PROMO.nomes && PROMO.nomes[id]) || id, x);
    }
    elGrade.innerHTML = h || '<p class="pr-nota-periodo">Esta oferta não vale para este período.</p>';
  }

  function trocarPeriodo(p) {
    periodo = (p === 'mensal') ? 'mensal' : 'anual';
    var botoes = document.querySelectorAll('[data-pr-periodo]');
    for (var i = 0; i < botoes.length; i++) {
      botoes[i].setAttribute('aria-selected',
        botoes[i].getAttribute('data-pr-periodo') === periodo ? 'true' : 'false');
    }
    pintarGrade();
  }

  // ★★★★ ACABOU: a pagina volta ao estado de "nao ha promocao", sem recarregar
  //   e sem contador zerado na tela.
  function encerrar() {
    if (timer) { clearInterval(timer); timer = null; }
    PROMO = null;
    semPromocao();
  }

  // ★★★ O TEXTO DA DATA SOME JUNTO COM A OFERTA. Ele fala de uma campanha no
  //   presente ("esta oferta e antes do pico"); deixado na tela depois do
  //   prazo, vira promessa de uma promocao que acabou. O bloco do que a
  //   assinatura entrega FICA, porque esse continua verdadeiro sempre.
  function semPromocao() {
    if (palco) palco.hidden = true;
    if (elConta) elConta.hidden = true;
    if (elNada) elNada.hidden = false;
    if (elArea) elArea.hidden = true;
  }

  function aplicar(p) {
    if (!p || !p.precos) { semPromocao(); return; }
    PROMO = p;
    fimLocal = Date.now() + (Number(p.resta_ms) || 0);
    if (!quantoFalta()) { semPromocao(); return; }

    var tema = (p.tema_slug && TEMAS[p.tema_slug]) ? p.tema_slug : 'padrao';
    raiz.setAttribute('data-tema', tema);
    enfeitar((TEMAS[tema] || {}).enfeite);
    contar(tema);

    var oferta = [];
    if (p.desconto_pct) oferta.push(p.desconto_pct + '% de desconto na primeira cobrança');
    if (p.bonus_meses) {
      oferta.push('+' + p.bonus_meses + (p.bonus_meses === 1 ? ' mês' : ' meses') + ' de cortesia');
    }

    texto(elTitulo, p.nome || 'Oferta por tempo limitado');
    texto(elSub, oferta.join(' e ') + '.');
    if (elSelo) { elSelo.textContent = 'oferta por tempo limitado'; elSelo.hidden = false; }
    if (elRelogio) elRelogio.hidden = false;
    if (elAcoes) elAcoes.hidden = false;
    if (palco) palco.hidden = false;
    if (elNada) elNada.hidden = true;
    if (elArea) elArea.hidden = false;

    pintarRelogio();
    trocarPeriodo(periodo);

    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      if (!document.getElementById('prSeg')) { clearInterval(timer); timer = null; return; }
      if (!pintarRelogio()) encerrar();
    }, 1000);
  }

  var botoes = document.querySelectorAll('[data-pr-periodo]');
  for (var i = 0; i < botoes.length; i++) {
    botoes[i].addEventListener('click', function () {
      trocarPeriodo(this.getAttribute('data-pr-periodo'));
    });
  }

  // ★★ Falha em silencio: sem rede, a pagina mostra "nao ha promocao agora" e
  //   o caminho para a tabela normal. Erro de rede nao pode virar tela em
  //   branco numa pagina que alguem abriu por causa de um anuncio.
  try {
    fetch(ENDERECO, { method: 'GET' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { semPromocao(); return; }
        // os nomes dos planos vem da tabela, que a rota manda junto
        if (d.promocao && d.tabela) {
          d.promocao.nomes = {};
          var ids = Object.keys(d.tabela);
          for (var j = 0; j < ids.length; j++) d.promocao.nomes[ids[j]] = d.tabela[ids[j]].nome;
        }
        aplicar(d.promocao);
      })
      .catch(function () { semPromocao(); });
  } catch (e) { semPromocao(); }
})();
