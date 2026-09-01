// ═══════════════════════════════════════════════════════════════════════════
// CRIAR ANÚNCIO — TELA NOVA (v33k.2199, Ondas 3 e 4)
// ───────────────────────────────────────────────────────────────────────────
// Mora FORA do index.html, carregada sob demanda. Decisão do Alessandro em
// 31/08, e ela tem um preço que está pago junto: a REGRA DE OURO passa a valer
// para dois arquivos. O `qa_sintaxe_painel` parseia este arquivo também, e
// FALHA se ele não estiver ao lado do painel. Checagem que pode ser pulada em
// silêncio é como o painel morreu em 30/08.
//
// POR QUE FORA: o painel estava em 6,77 MB com teto de 7 MB, ou seja 237 KB de
// folga. Uma tela de sete etapas com matriz de variações e galeria por
// variação não cabe nisso com margem para melhorar depois.
//
// ★ O RASCUNHO É A MÁQUINA DE ESTADOS, ESTA TELA É UMA VISTA DELE. Nada aqui
//   guarda estado que não esteja no banco. Sem localStorage: o estado é do
//   rascunho (v33k.2196), e duas abas abertas na mesma conta não podem ter
//   duas verdades.
//
// ★ ONDAS 3 e 4 (esta): produto, variações, fotos e embalagem, com autosave.
//   Destinos e ficha por canal são a Onda 5, IA é a 6, envio é a 7. As etapas
//   que ainda não existem NÃO aparecem como aba vazia: a tela termina em
//   "Salvar rascunho" e diz o que vem depois.
//
// ★ REGRAS DA CASA: sem emoji, sem travessão no texto da tela, sem ícone de
//   interrogação, sem confirm/alert/prompt do navegador.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var API = '/api/anuncio-rascunhos';
  var ETAPAS = [
    // ★★ v33k.2210: VARIAÇÕES DEIXOU DE SER ETAPA. Pedido de 31/08: a escolha
    //   "com variações" ou "sem variação" e a montagem delas passam para a
    //   PRIMEIRA etapa, ANTES da descrição. O motivo não é arrumação: a IA
    //   escrevia guia de tamanhos em centímetros para um pneu, porque gerava a
    //   descrição sem saber se o produto tem variação. O dado precisa existir
    //   antes de a descrição ser gerada.
    { id: 'produto', titulo: 'Produto' },
    // ★ v33k.2205: DESTINOS VEM ANTES DE FOTOS, e não é preferência de ordem.
    //   As regras de foto dependem do canal: o Mercado Livre publica foto por
    //   variação e não usa foto geral; a Shopee usa foto geral e aceita
    //   exatamente UMA por variação, que é a capa. Pedir as fotos antes de
    //   saber para onde vai é pedir para a pessoa subir o que não serve.
    { id: 'destinos', titulo: 'Destinos' },
    { id: 'fotos', titulo: 'Fotos' },
    { id: 'embalagem', titulo: 'Embalagem' },
    { id: 'ficha', titulo: 'Ficha por canal' },
    { id: 'conferencia', titulo: 'Conferência e envio' },
  ];
  // A que falta, declarada para a tela poder dizer o que vem, sem fingir aba
  // que não funciona.
  // Todas as etapas existem agora. A lista fica vazia de propósito, e o
  // rodapé some quando ela está vazia: rodapé prometendo o que já chegou é
  // pior que rodapé nenhum.
  var ETAPAS_FUTURAS = [];

  // Cache das lojas e das fichas, por sessão da tela. Buscar de novo a cada
  // desenho faria uma chamada por tecla digitada.
  var cacheLojas = null;
  var cacheFichas = {};
  var buscandoFicha = false;

  var estado = {
    rascunhoId: null,
    etapa: 'produto',
    dados: {},
    destinos: [],
    sugestoes: {},
    enviando: false,
    envioErro: null,
    salvando: false,
    sujo: false,
    erro: null,
  };
  var timerSalvar = null;

  // ── infraestrutura mínima, sempre sob typeof: esta tela não pode derrubar
  //    o painel se um helper mudar de nome lá dentro.
  function toast(msg) {
    if (typeof window.showToast === 'function') window.showToast(msg);
  }
  function avisar(msg) {
    if (typeof window.lcAlert === 'function') window.lcAlert(msg);
    else toast(msg);
  }
  function confirmar(msg) {
    if (typeof window.lcConfirm === 'function') return window.lcConfirm(msg);
    return Promise.resolve(true);
  }
  function icones(el) {
    if (typeof window.lcHydrateIcons === 'function') window.lcHydrateIcons(el);
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function base() {
    return (typeof window.BACKEND_URL === 'string' && window.BACKEND_URL) ? window.BACKEND_URL : '';
  }
  function cabecalhos() {
    var h = { 'Content-Type': 'application/json' };
    if (typeof window.getApiToken === 'function') h['x-api-token'] = window.getApiToken();
    try {
      var t = localStorage.getItem('lider_token_login');
      if (t) h['Authorization'] = 'Bearer ' + t;
    } catch (e) { /* navegador sem storage: segue com o token de api */ }
    return h;
  }

  async function chamar(caminho, opcoes) {
    var o = opcoes || {};
    var r = await fetch(base() + API + (caminho || ''), {
      method: o.metodo || 'GET',
      headers: cabecalhos(),
      body: o.corpo ? JSON.stringify(o.corpo) : undefined,
    });
    var j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    // ★ Erro do servidor NÃO vira objeto vazio. Foi assim que exportação
    //   recusada virou "sumiu" para o usuário em 31/08.
    if (!r.ok || !j || j.ok !== true) {
      var erro = (j && j.erro) || ('O servidor respondeu ' + r.status + '.');
      throw new Error(erro);
    }
    return j;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // AUTOSAVE
  // O relógio das 72 horas conta da última edição, então salvar é também o que
  // mantém o rascunho vivo.
  // ═════════════════════════════════════════════════════════════════════════
  function marcarSujo() {
    estado.sujo = true;
    pintarStatus();
    if (timerSalvar) clearTimeout(timerSalvar);
    timerSalvar = setTimeout(function () { salvar(); }, 1200);
  }

  async function salvar(opts) {
    var o = opts || {};
    if (estado.salvando) return;
    if (!estado.sujo && !o.forcar) return;
    estado.salvando = true;
    estado.erro = null;
    pintarStatus();
    try {
      var corpo = { dados: estado.dados, etapa: estado.etapa, destinos: estado.destinos };
      if (Array.isArray(estado.dados.fotosStorage)) corpo.fotosStorage = estado.dados.fotosStorage;
      if (!estado.rascunhoId) {
        var criado = await chamar('', { metodo: 'POST', corpo: corpo });
        estado.rascunhoId = criado.rascunho.id;
      } else {
        await chamar('/' + estado.rascunhoId, { metodo: 'PUT', corpo: corpo });
      }
      estado.sujo = false;
    } catch (e) {
      // ★ Falha de gravação NÃO é silenciosa e NÃO limpa o sujo: o que a
      //   pessoa digitou continua na tela e continua pendente de salvar.
      estado.erro = e.message;
    }
    estado.salvando = false;
    pintarStatus();
  }

  function pintarStatus() {
    var el = document.getElementById('lcAnStatus');
    if (!el) return;
    if (estado.erro) {
      el.textContent = 'Não consegui salvar: ' + estado.erro;
      el.style.color = 'var(--lc-danger)';
      return;
    }
    if (estado.salvando) { el.textContent = 'Salvando...'; el.style.color = 'var(--lc-muted-2)'; return; }
    if (estado.sujo) { el.textContent = 'Alterações pendentes'; el.style.color = 'var(--lc-muted-2)'; return; }
    el.textContent = estado.rascunhoId ? 'Rascunho salvo' : 'Rascunho ainda não iniciado';
    el.style.color = 'var(--lc-primary)';
  }

  // ═════════════════════════════════════════════════════════════════════════
  // VARIAÇÕES: nome e valores LIVRES, digitados por quem cria.
  // Nada de cor e tamanho fixos: a tela precisa servir para qualquer nicho.
  // ═════════════════════════════════════════════════════════════════════════
  function variacoes() {
    if (!Array.isArray(estado.dados.variacoes)) estado.dados.variacoes = [];
    return estado.dados.variacoes;
  }

  function combinacoes() {
    // ★ Produto marcado como SEM variação não tem matriz, mesmo que sobrem
    //   dimensões montadas antes da troca. Senão o anúncio sairia com
    //   variações que a pessoa disse não ter.
    if (estado.dados.temVariacoes === false) return [];
    var vs = variacoes().filter(function (v) { return v.nome && (v.valores || []).length; });
    if (!vs.length) return [];
    var saida = [[]];
    vs.forEach(function (v) {
      var proxima = [];
      saida.forEach(function (linha) {
        v.valores.forEach(function (valor) {
          proxima.push(linha.concat([{ nome: v.nome, valor: valor }]));
        });
      });
      saida = proxima;
    });
    return saida;
  }

  function rotuloCombinacao(c) {
    return c.map(function (x) { return x.valor; }).join(' / ');
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ★★ A MATRIZ PRECISA EXISTIR NO RASCUNHO, NÃO SÓ NA TELA.
  // ───────────────────────────────────────────────────────────────────────
  // ACHADO ANDANDO PELA TELA, antes do teste em produção: a matriz era
  // desenhada na hora a partir das dimensões, e `dados.combinacoes` só ganhava
  // chave quando a pessoa DIGITAVA um SKU ou estoque naquela linha.
  //
  // Efeito: um produto com 4 combinações onde a pessoa preencheu o SKU de uma
  // ia para o marketplace com UMA variação. As outras três não existiam para
  // ninguém, nem na conferência (que contava 1) nem na exportação. Sem erro,
  // sem aviso: o anúncio subia menor do que a tela mostrava.
  //
  // Agora a matriz é materializada no rascunho a cada mudança de dimensão, e
  // as chaves que deixaram de existir são PODADAS: tirar uma variação não pode
  // deixar combinação fantasma que ninguém vê e o marketplace publica.
  // ═════════════════════════════════════════════════════════════════════════
  // ═════════════════════════════════════════════════════════════════════════
  // SKU E ESTOQUE EM MASSA (Onda 10)
  // ───────────────────────────────────────────────────────────────────────
  // Mesma normalização do gerador que o painel já usa (`gerarSkusEansProduto`):
  // sem acento, maiúscula, hífen entre os pedaços, e desempate por sufixo
  // numérico quando o SKU repetiria.
  //
  // ★ A DIFERENÇA: o do painel monta `SKU-COR-TAMANHO`, porque nasceu para
  //   calçado. Este monta `PREFIXO-<valor de cada dimensão>`, qualquer que
  //   seja o nome delas. Em "Voltagem / Potência" sai `AQ-110V-1500W`, e não
  //   um SKU com dois campos vazios.
  //
  // ★ NÃO SOBRESCREVE O QUE JÁ ESTÁ PREENCHIDO, igual ao do painel: quem
  //   digitou um SKU à mão tem motivo, e o botão é de preencher o que falta.
  function _pedacoSku(v) {
    return String(v == null ? '' : v)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9\s.\-\/]/g, '').trim().replace(/[\s-]+/g, '-');
  }

  function skusEmMassa(prefixo, combos, jaPreenchidos) {
    var base = String(prefixo == null ? '' : prefixo).replace(/^[.,;\s-]+|[.,;\s-]+$/g, '').trim();
    var usados = {};
    (jaPreenchidos || []).forEach(function (x) { if (x) usados[String(x).trim()] = true; });
    var saida = {};
    (combos || []).forEach(function (chave) {
      var pedacos = String(chave).split(' / ').map(_pedacoSku).filter(Boolean);
      var sku = [base].concat(pedacos).filter(Boolean).join('-');
      if (!sku) return;
      if (usados[sku]) {
        var n = 2;
        while (usados[sku + '-' + n]) n++;
        sku = sku + '-' + n;
      }
      usados[sku] = true;
      saida[chave] = sku;
    });
    return saida;
  }

  // ★★ v33k.2219: PREÇO, EAN E PROMOCIONAL VIVEM NA VARIAÇÃO.
  //   Pedido de 01/09. Antes o preço era um campo só, no nível do produto, o
  //   que só serve para catálogo onde toda variação custa igual. Chuteira 34 e
  //   44 não custam igual, e promoção quase nunca é a mesma em toda a grade.
  function _celulaCombo(chave, campo, valor, largura, dica) {
    return '<td style="padding:7px 10px;border-top:1px solid #f1f5f9">'
      + '<input class="lc-an-combo" data-chave="' + esc(chave) + '" data-campo="' + campo + '" '
      + 'value="' + esc(valor == null ? '' : valor) + '"'
      + (dica ? ' placeholder="' + esc(dica) + '"' : '')
      + ' style="width:' + largura + ';padding:5px 7px;border:1px solid var(--lc-border);border-radius:6px"></td>';
  }

  function sincronizarCombinacoes() {
    var atuais = combinacoes().map(rotuloCombinacao);
    if (!estado.dados.combinacoes || typeof estado.dados.combinacoes !== 'object') {
      estado.dados.combinacoes = {};
    }
    var mapa = estado.dados.combinacoes;
    var mudou = false;
    atuais.forEach(function (chave) {
      if (!mapa[chave]) { mapa[chave] = {}; mudou = true; }
    });
    Object.keys(mapa).forEach(function (chave) {
      if (atuais.indexOf(chave) < 0) { delete mapa[chave]; mudou = true; }
    });
    return mudou;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // DESENHO
  // ═════════════════════════════════════════════════════════════════════════
  // A ação de IA fica NO CAMPO que ela preenche, ao lado do rótulo. Barra de
  // botões no topo da etapa obriga a pessoa a adivinhar qual botão mexe em
  // qual campo.
  function campo(rotulo, id, valor, tipo, dica, acao) {
    return '<label style="display:block;margin-bottom:14px">'
      + '<span style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;font-weight:700;color:var(--lc-ink-2);margin-bottom:5px">'
      + '<span>' + esc(rotulo) + '</span>' + (acao || '') + '</span>'
      + '<input id="' + id + '" type="' + (tipo || 'text') + '" value="' + esc(valor || '') + '" '
      + 'style="width:100%;padding:9px 11px;border:1px solid var(--lc-border-2);border-radius:8px;font-size:14px">'
      + (dica ? '<span style="display:block;font-size:11px;color:var(--lc-muted-2);margin-top:4px">' + esc(dica) + '</span>' : '')
      + '</label>';
  }

  function etapaProduto() {
    var d = estado.dados;
    var comVar = d.temVariacoes === true;
    var escolheu = d.temVariacoes === true || d.temVariacoes === false;

    // ★★ A ESCOLHA VEM ANTES DE TUDO QUE A IA ESCREVE. Sem ela, a descrição
    //   saía com guia de tamanhos em centímetros para um pneu: a IA não tinha
    //   como saber que aquele produto não tem grade.
    var escolha = '<div style="border:1px solid var(--lc-border);border-radius:10px;padding:14px;margin-bottom:16px">'
      + '<div style="font-size:12px;font-weight:700;color:var(--lc-ink-2);margin-bottom:8px">Este anúncio tem variações?</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + ['sim', 'nao'].map(function (op) {
        var ativo = (op === 'sim') === comVar && escolheu;
        return '<button class="lc-an-temvar" data-op="' + op + '" style="border:1px solid '
          + (ativo ? 'var(--lc-primary)' : 'var(--lc-border-2)') + ';background:'
          + (ativo ? 'var(--lc-primary)' : '#fff') + ';color:' + (ativo ? '#fff' : 'var(--lc-ink-2)')
          + ';border-radius:8px;padding:9px 16px;cursor:pointer;font-size:13px;font-weight:700">'
          + (op === 'sim' ? 'Anúncio com variações' : 'Anúncio sem variação') + '</button>';
      }).join('')
      + '</div>'
      + (escolheu ? '' : '<div style="font-size:12px;color:var(--lc-muted-2);margin-top:8px">'
        + 'Escolha para liberar a descrição. A IA precisa saber disso antes de escrever.</div>')
      + '</div>';

    var identificacao = campo('Nome do anúncio', 'lcAnNome', d.nome, 'text', 'É o título que o comprador vê.', botaoIA('titulo'))
      + sugestaoDoCampo('titulo')
      + campo('SKU pai', 'lcAnSku', d.sku)
      + campo('Marca', 'lcAnMarca', d.marca)
      + campo('EAN ou GTIN', 'lcAnEan', d.ean, 'text', 'Deixe vazio se o produto não tiver código de barras.');

    var blocoVar = comVar ? blocoVariacoes() : '';

    // ★ Termos de busca ANTES da descrição, e eles entram no fim dela quando
    //   a descrição é gerada: é o que ajuda o comprador a achar o anúncio.
    var termos = campo('Termos de busca', 'lcAnPalavras', d.palavrasChave, 'text',
      'Separados por vírgula. Quando você gerar a descrição, eles entram no fim dela.',
      botaoIA('palavrasChave'))
      + sugestaoDoCampo('palavrasChave');

    var descricao = '<label style="display:block;margin-bottom:14px">'
      + '<span style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;font-weight:700;color:var(--lc-ink-2);margin-bottom:5px">'
      + 'Descrição' + (escolheu ? botaoIA('descricao') : '') + '</span>'
      + '<textarea id="lcAnDescricao" rows="7" style="width:100%;padding:9px 11px;border:1px solid var(--lc-border-2);border-radius:8px;font-size:14px;resize:vertical">'
      + esc(d.descricao || '') + '</textarea>'
      + '</label>'
      + sugestaoDoCampo('descricao');

    return '<div class="lc-an-etapa">'
      + identificacao + escolha + blocoVar + termos + descricao
      // ★ Sem variação, preço e estoque continuam aqui, porque não há linha
      //   onde colocá-los. COM variação, eles saem: dois lugares para o mesmo
      //   número é a pessoa preencher um e o outro valer.
      + (comVar ? ''
        : campo('Preço', 'lcAnPreco', d.preco, 'text', 'Obrigatório.')
          + campo('Estoque', 'lcAnEstoque', d.estoque))
      + '</div>';
  }

  function blocoVariacoes() {
    var vs = variacoes();
    if (sincronizarCombinacoes()) marcarSujo();
    var linhas = vs.map(function (v, i) {
      var chips = (v.valores || []).map(function (valor, k) {
        return '<span style="display:inline-flex;align-items:center;gap:6px;background:#f1f5f9;border-radius:999px;padding:4px 10px;font-size:13px;margin:0 6px 6px 0">'
          + esc(valor)
          + '<button data-var="' + i + '" data-valor="' + k + '" class="lc-an-tirar-valor" style="border:0;background:transparent;cursor:pointer;color:var(--lc-muted-2);font-size:14px;line-height:1">x</button>'
          + '</span>';
      }).join('');
      return '<div style="border:1px solid var(--lc-border);border-radius:10px;padding:14px;margin-bottom:12px">'
        + '<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px">'
        + '<input class="lc-an-nome-var" data-var="' + i + '" value="' + esc(v.nome || '') + '" placeholder="Nome da variação, por exemplo Cor" '
        + 'style="flex:1;padding:8px 10px;border:1px solid var(--lc-border-2);border-radius:8px;font-size:14px">'
        + '<button class="lc-an-tirar-var" data-var="' + i + '" style="border:1px solid var(--lc-danger-soft);background:#fff;color:var(--lc-danger);border-radius:8px;padding:8px 12px;cursor:pointer;font-size:13px">Remover</button>'
        + '</div>'
        + '<div>' + chips + '</div>'
        + '<input class="lc-an-novo-valor" data-var="' + i + '" placeholder="Digite um valor e pressione Enter" '
        + 'style="width:100%;padding:8px 10px;border:1px dashed var(--lc-border-2);border-radius:8px;font-size:13px;margin-top:6px">'
        + '</div>';
    }).join('');

    var combos = combinacoes();
    var tabela = '';
    if (combos.length) {
      tabela = '<div style="margin-top:18px">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px">'
        + '<span style="font-size:12px;font-weight:700;color:var(--lc-ink-2)">' + combos.length + ' combinação(ões)</span>'
        + '<span style="display:flex;gap:6px;flex-wrap:wrap">'
        + '<button id="lcAnSkuMassa" style="border:1px solid var(--lc-border-2);background:#fff;color:var(--lc-ink-2);'
        + 'border-radius:8px;padding:6px 11px;cursor:pointer;font-size:12px">Montar SKUs</button>'
        + '<button id="lcAnEanMassa" style="border:1px solid var(--lc-border-2);background:#fff;color:var(--lc-ink-2);'
        + 'border-radius:8px;padding:6px 11px;cursor:pointer;font-size:12px">Gerar EANs</button>'
        + '<button id="lcAnPrecoMassa" style="border:1px solid var(--lc-border-2);background:#fff;color:var(--lc-ink-2);'
        + 'border-radius:8px;padding:6px 11px;cursor:pointer;font-size:12px">Preço para todas</button>'
        + '<button id="lcAnPromoMassa" style="border:1px solid var(--lc-border-2);background:#fff;color:var(--lc-ink-2);'
        + 'border-radius:8px;padding:6px 11px;cursor:pointer;font-size:12px">Promoção para todas</button>'
        + '<button id="lcAnEstoqueMassa" style="border:1px solid var(--lc-border-2);background:#fff;color:var(--lc-ink-2);'
        + 'border-radius:8px;padding:6px 11px;cursor:pointer;font-size:12px">Estoque para todas</button>'
        + '</span></div>'
        + '<div style="max-height:260px;overflow:auto;border:1px solid var(--lc-border);border-radius:10px">'
        + '<table style="width:100%;border-collapse:collapse;font-size:13px">'
        + '<thead><tr style="background:#f8fafc"><th style="text-align:left;padding:8px 10px">Variação</th>'
        + '<th style="text-align:left;padding:8px 10px">SKU</th>'
        + '<th style="text-align:left;padding:8px 10px">Código de barras (EAN)</th>'
        + '<th style="text-align:left;padding:8px 10px">Preço</th>'
        + '<th style="text-align:left;padding:8px 10px">Promocional</th>'
        + '<th style="text-align:left;padding:8px 10px">Estoque</th></tr></thead><tbody>'
        + combos.map(function (c) {
          var chave = rotuloCombinacao(c);
          var linha = (estado.dados.combinacoes || {})[chave] || {};
          return '<tr><td style="padding:7px 10px;border-top:1px solid #f1f5f9">' + esc(chave) + '</td>'
            + _celulaCombo(chave, 'sku', linha.sku, '100%')
            + _celulaCombo(chave, 'ean', linha.ean, '150px')
            + _celulaCombo(chave, 'preco', linha.preco, '90px')
            + _celulaCombo(chave, 'precoPromo', linha.precoPromo, '90px', 'vazio = sem promoção')
            + _celulaCombo(chave, 'estoque', linha.estoque, '80px')
            + '</tr>';
        }).join('')
        + '</tbody></table></div></div>';
    }

    return '<div style="border:1px solid var(--lc-border);border-radius:10px;padding:14px;margin-bottom:16px">'
      + '<p style="font-size:13px;color:var(--lc-muted);margin:0 0 14px">Você decide quais variações existem, '
      + 'e com que nome. Nada aqui é fixo em cor ou tamanho.</p>'
      + linhas
      + '<button id="lcAnAddVar" style="border:1px solid var(--lc-primary);background:#fff;color:var(--lc-primary);border-radius:8px;padding:9px 14px;cursor:pointer;font-size:13px;font-weight:700">Adicionar variação</button>'
      + tabela
      + '</div>';
  }

  // ═════════════════════════════════════════════════════════════════════════
  // FOTOS (Onda 10)
  // ───────────────────────────────────────────────────────────────────────
  // ★ AS REGRAS SAEM DOS DESTINOS, não de um padrão fixo:
  //     só Mercado Livre     foto geral BLOQUEADA (ele não usa), até 10 por variação
  //     só Shopee ou TikTok  geral até 9, e EXATAMENTE 1 por variação, que é a capa
  //     misturado            geral até 9, até 10 por variação, e a PRIMEIRA de
  //                          cada variação é a capa que a Shopee e o TikTok usam
  //
  //   Por que o teto por variação é o MAIOR e não o menor no caso misturado: a
  //   exportação já corta as fotos por marketplace (`prepararProdutoParaExport`).
  //   Limitar a 1 aqui obrigaria a pessoa a subir de novo para o ML depois.
  //
  // ★ ARQUIVO, NÃO URL. Sobe pelo `/api/upload-foto`, que já existe e já
  //   recusa acima de 2 MB no servidor. A checagem também é feita aqui, antes
  //   de mandar, para a pessoa saber na hora qual arquivo passou do limite.
  var LIMITE_ARQUIVO = 2 * 1024 * 1024;

  function regrasDeFoto() {
    var canais = canaisDosDestinos();
    if (!canais.length) return null;
    // ★★ SEM VARIAÇÃO, O MERCADO LIVRE USA A FOTO GERAL. Relato de 31/08:
    //   "se o anúncio no Mercado Livre não tiver variação as fotos são
    //   gerais". A regra "só ML, geral desligada" nasceu certa e incompleta:
    //   ela vale porque o ML publica a foto DA VARIAÇÃO. Num produto simples
    //   não existe variação para carregar foto, e a tela bloqueava o único
    //   lugar que havia, deixando o anúncio sem imagem nenhuma.
    var temVariacao = combinacoes().length > 0;
    var soML = canais.length === 1 && canais[0] === 'mercadolivre' && temVariacao;
    var TETO_VAR = { mercadolivre: 10, shopee: 1, tiktok: 9, shein: 9 };
    var maiorPorVariacao = 1;
    canais.forEach(function (c) { maiorPorVariacao = Math.max(maiorPorVariacao, TETO_VAR[c] || 1); });
    // ★ Quem aceita EXATAMENTE UMA por variação é a Shopee. O TikTok aceita
    //   nove. Dizer "Shopee e TikTok" na tela seria informação errada, e é o
    //   tipo de erro que faz a pessoa subir de menos por precaução.
    var capaUnica = canais.indexOf('shopee') >= 0;
    return {
      geralBloqueada: soML,
      geralMax: soML ? 0 : 9,
      porVariacaoMax: maiorPorVariacao,
      capaUnica: capaUnica,
      temVariacao: temVariacao,
      canais: canais,
    };
  }

  function textoDasRegras(r) {
    if (r.geralBloqueada) {
      return 'Só Mercado Livre nos destinos, e o produto tem variações: ele publica a foto de cada '
        + 'variação, então a foto geral fica desligada. Até ' + r.porVariacaoMax + ' por variação.';
    }
    if (!r.temVariacao) {
      return 'Produto sem variação: as fotos são gerais. Até ' + r.geralMax + '.';
    }
    if (r.porVariacaoMax === 1) {
      return 'Até ' + r.geralMax + ' fotos gerais, e exatamente 1 por variação, que é a capa dela.';
    }
    return 'Até ' + r.geralMax + ' fotos gerais e até ' + r.porVariacaoMax + ' por variação. '
      + (r.capaUnica ? 'A Shopee usa só a PRIMEIRA de cada variação, que é a capa dela.' : '');
  }

  async function subirArquivos(arquivos, limite, atuais) {
    var restam = limite - (atuais || []).length;
    if (restam <= 0) { avisar('Este bloco já está no limite de fotos.'); return []; }
    var urls = [];
    var recusados = [];
    for (var i = 0; i < arquivos.length && urls.length < restam; i++) {
      var f = arquivos[i];
      if (f.size > LIMITE_ARQUIVO) {
        recusados.push(f.name + ' (' + (f.size / 1048576).toFixed(1) + ' MB)');
        continue;
      }
      var dataUrl = await new Promise(function (res, rej) {
        var fr = new FileReader();
        fr.onload = function () { res(fr.result); };
        fr.onerror = function () { rej(new Error('Não consegui ler ' + f.name)); };
        fr.readAsDataURL(f);
      });
      var r = await fetch(base() + '/api/upload-foto', {
        method: 'POST', headers: cabecalhos(), body: JSON.stringify({ dataUrl: dataUrl }),
      });
      var j = await r.json();
      if (!j || !j.ok || !j.url) throw new Error((j && j.erro) || ('Falha ao subir ' + f.name));
      urls.push(j.url);
    }
    if (recusados.length) {
      avisar('Acima de 2 MB, não subiram: ' + recusados.join(', ') + '. Reduza e tente de novo.');
    }
    if (arquivos.length > restam) {
      toast('Subi ' + urls.length + '. O limite deste bloco é ' + limite + '.');
    }
    return urls;
  }

  // ★★ O PAINEL ESCONDE TODO `input[type=file]` NO CSS GLOBAL (linha 14024:
  //   `input[type="file"] { display: none; }`). O resto do sistema convive com
  //   isso porque usa um BOTÃO visível que clica no input escondido.
  //
  //   A primeira versão desta tela desenhou o input cru: ele estava lá, no DOM,
  //   e simplesmente não aparecia. Relato de 31/08 com print: "não apareceu o
  //   local de subir as fotos". Não era render, era CSS de casa que eu não
  //   conhecia. Agora segue o mesmo padrão dos outros.
  function botaoArquivo(alvo, varias, rotulo) {
    var id = 'lcAnArq_' + String(alvo).replace(/[^A-Za-z0-9]/g, '_');
    return '<label for="' + id + '" '
      + 'style="display:inline-flex;align-items:center;gap:6px;border:1px dashed var(--lc-primary);'
      + 'color:var(--lc-primary);background:#fff;border-radius:8px;padding:8px 14px;cursor:pointer;'
      + 'font-size:13px;font-weight:700;margin-top:6px">'
      + esc(rotulo || 'Escolher arquivos') + '</label>'
      + '<input id="' + id + '" type="file" class="lc-an-arquivo" data-alvo="' + esc(alvo) + '" '
      + 'accept="image/*"' + (varias ? ' multiple' : '') + '>';
  }

  function tirasDeFoto(urls, alvo) {
    if (!urls.length) return '<div style="font-size:12px;color:var(--lc-muted-2);padding:6px 0">Nenhuma foto ainda.</div>';
    return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">'
      + urls.map(function (u, i) {
        return '<div style="position:relative;width:64px;height:64px;border:1px solid var(--lc-border);border-radius:8px;overflow:hidden">'
          + '<img src="' + esc(u) + '" style="width:100%;height:100%;object-fit:cover">'
          + (i === 0 ? '<span style="position:absolute;left:0;bottom:0;background:var(--lc-primary);color:var(--lc-primary-text);font-size:9px;padding:1px 4px">capa</span>' : '')
          + '<button class="lc-an-tirar-foto" data-alvo="' + esc(alvo) + '" data-i="' + i + '" '
          + 'style="position:absolute;top:2px;right:2px;border:0;background:rgba(255,255,255,.9);color:var(--lc-danger);'
          + 'border-radius:6px;width:18px;height:18px;cursor:pointer;font-size:12px;line-height:1">x</button>'
          // ★ v33k.2219: SETAS DE ORDEM. Relato de 01/09: "subi as fotos, mas
          //   não teve as setinhas para eu poder mudar as posições". A ordem
          //   não é estética: a PRIMEIRA é a capa, e é ela que a Shopee usa e
          //   que aparece na busca. Sem reordenar, a única saída era apagar
          //   tudo e subir de novo na ordem certa.
          + '<div style="position:absolute;left:0;top:2px;display:flex;gap:1px">'
          + (i > 0 ? '<button class="lc-an-mover-foto" data-alvo="' + esc(alvo) + '" data-i="' + i + '" data-dir="-1" '
            + 'style="border:0;background:rgba(255,255,255,.9);color:var(--lc-ink-2);border-radius:4px;'
            + 'width:16px;height:18px;cursor:pointer;font-size:11px;line-height:1" title="mover para a esquerda">&#8249;</button>' : '')
          + (i < urls.length - 1 ? '<button class="lc-an-mover-foto" data-alvo="' + esc(alvo) + '" data-i="' + i + '" data-dir="1" '
            + 'style="border:0;background:rgba(255,255,255,.9);color:var(--lc-ink-2);border-radius:4px;'
            + 'width:16px;height:18px;cursor:pointer;font-size:11px;line-height:1" title="mover para a direita">&#8250;</button>' : '')
          + '</div>'
          + '</div>';
      }).join('') + '</div>';
  }

  function etapaFotos() {
    var r = regrasDeFoto();
    if (!r) {
      return '<div class="lc-an-etapa"><p style="font-size:13px;color:var(--lc-muted)">'
        + 'Escolha os destinos primeiro. As regras de foto mudam conforme o canal: '
        + 'o Mercado Livre usa foto por variação, a Shopee usa foto geral e uma capa por variação.</p></div>';
    }
    var d = estado.dados;
    var geral = Array.isArray(d.fotos) ? d.fotos : [];
    var combos = combinacoes().map(rotuloCombinacao);

    var blocoGeral = r.geralBloqueada
      ? '<div style="border:1px dashed var(--lc-border-2);border-radius:10px;padding:14px;color:var(--lc-muted-2);font-size:13px">'
        + 'Foto geral desligada para este destino.</div>'
      : '<div style="border:1px solid var(--lc-border);border-radius:10px;padding:14px">'
        + '<div style="font-size:12px;font-weight:700;color:var(--lc-ink-2);margin-bottom:6px">'
        + 'Fotos do anúncio (' + geral.length + ' de ' + r.geralMax + ')</div>'
        + tirasDeFoto(geral, 'geral')
        + botaoArquivo('geral', true, 'Escolher arquivos')
        + '</div>';

    // ★★ v33k.2219: FOTO É POR VALOR DA PRIMEIRA DIMENSÃO, NÃO POR COMBINAÇÃO.
    //   Relato de 01/09: "as fotos por variações é apenas para a variação 1 e
    //   não para variação 1 + variação 2. No meu exemplo a variação 1 = Cor,
    //   então deveria aparecer apenas 1 com o nome Cor".
    //
    //   E é assim que os marketplaces funcionam: a foto é da COR, não do par
    //   cor+tamanho. Uma chuteira preta 34 e uma preta 44 usam a mesma foto.
    //   Pedir uma por combinação era pedir 11 vezes a mesma imagem, e foi o
    //   que a tela fazia.
    var primeira = (variacoes().filter(function (v) { return v.nome && (v.valores || []).length; }))[0];
    var gruposFoto = primeira ? primeira.valores.slice() : [];
    var blocoVars = '';
    if (gruposFoto.length) {
      blocoVars = '<div style="margin-top:16px">'
        + '<div style="font-size:12px;font-weight:700;color:var(--lc-ink-2);margin-bottom:8px">'
        + 'Fotos por ' + esc(primeira.nome) + ' (até ' + r.porVariacaoMax + ' em cada)</div>'
        + gruposFoto.map(function (c) {
          var fv = ((d.fotosPorGrupo || {})[c]) || [];
          return '<div style="border:1px solid var(--lc-border);border-radius:10px;padding:12px;margin-bottom:8px">'
            + '<div style="font-size:13px;font-weight:600;color:var(--lc-ink);margin-bottom:4px">'
            + esc(primeira.nome) + ': ' + esc(c)
            + ' <span style="font-weight:400;color:var(--lc-muted-2)">(' + fv.length + ' de ' + r.porVariacaoMax + ')</span></div>'
            + tirasDeFoto(fv, c)
            + botaoArquivo(c, r.porVariacaoMax > 1, fv.length ? 'Adicionar mais' : 'Escolher arquivos')
            + '</div>';
        }).join('') + '</div>';
    }

    return '<div class="lc-an-etapa">'
      + '<p style="font-size:13px;color:var(--lc-muted);margin:0 0 12px">' + esc(textoDasRegras(r)) + '</p>'
      + '<p style="font-size:12px;color:var(--lc-muted-2);margin:0 0 12px">Cada arquivo até 2 MB.</p>'
      + blocoGeral + blocoVars + '</div>';
  }

  function etapaEmbalagem() {
    var d = estado.dados;
    return '<div class="lc-an-etapa">'
      + '<p style="font-size:13px;color:var(--lc-muted);margin:0 0 14px">Peso e medidas da caixa fechada. '
      + 'Nenhum marketplace pede isso como atributo de categoria, e é o dado que mais falta no catálogo hoje.</p>'
      + '<div style="display:flex;justify-content:flex-end;margin-bottom:8px">'
      + botaoIA('embalagem', 'Estimar com IA') + '</div>'
      + sugestaoDoCampo('embalagem')
      + campo('Peso em gramas', 'lcAnPeso', d.peso)
      + campo('Comprimento em cm', 'lcAnComprimento', d.comprimento)
      + campo('Largura em cm', 'lcAnLargura', d.largura)
      + campo('Altura em cm', 'lcAnAltura', d.altura)
      + '</div>';
  }

  // ═════════════════════════════════════════════════════════════════════════
  // DESTINOS (Onda 5)
  // A unidade é a LOJA, nunca o marketplace. A tela agrupa por canal só para
  // ficar legível, que é a invariante da casa desde o começo: token, sync,
  // exportação e status são todos por loja.
  // Uma criação publica em várias lojas de uma vez (decisão de 31/08).
  // ═════════════════════════════════════════════════════════════════════════
  async function carregarLojas() {
    if (cacheLojas) return cacheLojas;
    var r = await fetch(base() + '/api/marketplaces/lojas', { headers: cabecalhos() });
    var j = await r.json();
    if (!j || !j.ok) throw new Error((j && j.erro) || 'Não consegui carregar suas lojas.');
    // Só entra loja que publica anúncio. O Frente de Caixa é loja de verdade e
    // não tem para onde exportar.
    cacheLojas = (j.lojas || []).filter(function (l) {
      var mk = String(l.marketplace || '').toLowerCase();
      return mk && mk !== 'pdv';
    });
    return cacheLojas;
  }

  function marcado(lojaId) {
    return estado.destinos.some(function (d) { return String(d.lojaId) === String(lojaId); });
  }

  function alternarDestino(loja) {
    var id = loja.lojaId || loja.idBanco || loja.id;
    if (marcado(id)) {
      estado.destinos = estado.destinos.filter(function (d) { return String(d.lojaId) !== String(id); });
    } else {
      estado.destinos = estado.destinos.concat([{
        lojaId: Number(id),
        canal: String(loja.marketplace || '').toLowerCase(),
        nome: loja.nome || ('Loja ' + id),
        resultado: 'pendente',
      }]);
    }
    // Trocar de destino muda quais fichas existem: o cache velho responderia
    // por um canal que saiu.
    cacheFichas = {};
    marcarSujo();
  }

  function etapaDestinos() {
    var lojas = cacheLojas;
    if (!lojas) return '<div class="lc-an-etapa"><p style="color:var(--lc-muted)">Carregando suas lojas...</p></div>';
    if (!lojas.length) {
      return '<div class="lc-an-etapa"><p style="color:var(--lc-muted)">'
        + 'Nenhuma loja conectada ainda. Conecte uma loja em Integrações para poder publicar.</p></div>';
    }
    var porCanal = {};
    lojas.forEach(function (l) {
      var c = String(l.marketplace || '').toLowerCase();
      if (!porCanal[c]) porCanal[c] = [];
      porCanal[c].push(l);
    });
    var NOMES = { shopee: 'Shopee', mercadolivre: 'Mercado Livre', tiktok: 'TikTok Shop', shein: 'Shein' };
    // ★ v33k.2219: as logos que o painel já usa, no mesmo caminho. Pedido de
    //   01/09: "em destino preciso que tenha a logo de cada marketplace na
    //   frente do nome e uma barra de pesquisa".
    var LOGOS = { shopee: 'mkt-shopee.png', mercadolivre: 'mkt-ml.png',
      tiktok: 'mkt-tiktok.png', shein: 'mkt-shein.png' };
    var termo = String(estado.buscaLoja || '').trim().toLowerCase();
    var blocos = Object.keys(porCanal).sort().map(function (c) {
      // Ordem alfabética dentro do canal, e não a ordem de integração.
      var doCanal = porCanal[c].slice().sort(function (a, b) {
        return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
      });
      // A busca filtra por nome da loja E pelo nome do canal, porque quem
      // digita "shopee" quer ver as lojas dela, não uma loja chamada shopee.
      if (termo) {
        doCanal = doCanal.filter(function (l) {
          return String(l.nome || '').toLowerCase().indexOf(termo) >= 0
            || String(NOMES[c] || c).toLowerCase().indexOf(termo) >= 0;
        });
      }
      if (!doCanal.length) return '';
      return '<div style="margin-bottom:16px">'
        + '<div style="display:flex;align-items:center;gap:7px;margin-bottom:8px">'
        + (LOGOS[c] ? '<img src="../assets/' + LOGOS[c] + '" alt="" style="width:18px;height:18px;object-fit:contain">' : '')
        + '<span style="font-size:12px;font-weight:800;color:var(--lc-ink-2)">' + esc(NOMES[c] || c) + '</span></div>'
        + doCanal.map(function (l) {
          var id = l.lojaId || l.idBanco || l.id;
          return '<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--lc-border);border-radius:8px;margin-bottom:6px;cursor:pointer">'
            + '<input type="checkbox" class="lc-an-destino" data-loja="' + esc(id) + '"'
            + (marcado(id) ? ' checked' : '') + '>'
            + (LOGOS[c] ? '<img src="../assets/' + LOGOS[c] + '" alt="" style="width:16px;height:16px;object-fit:contain">' : '')
            + '<span style="font-size:14px;color:var(--lc-ink)">' + esc(l.nome || ('Loja ' + id)) + '</span>'
            + '</label>';
        }).join('')
        + '</div>';
    }).join('');

    var vazioPorBusca = termo && !blocos.replace(/\s/g, '');
    return '<div class="lc-an-etapa">'
      + '<p style="font-size:13px;color:var(--lc-muted);margin:0 0 12px">'
      + 'Escolha todas as lojas de uma vez.</p>'
      + '<input id="lcAnBuscaLoja" value="' + esc(estado.buscaLoja || '') + '" '
      + 'placeholder="Buscar loja pelo nome ou pelo canal" '
      + 'style="width:100%;padding:9px 11px;border:1px solid var(--lc-border-2);border-radius:8px;'
      + 'font-size:13px;margin-bottom:14px">'
      + (vazioPorBusca
        ? '<p style="font-size:13px;color:var(--lc-muted-2)">Nenhuma loja com esse nome.</p>'
        : blocos)
      + '<div style="font-size:12px;color:var(--lc-muted-2);margin-top:6px">'
      + estado.destinos.length + ' loja(s) escolhida(s).</div></div>';
  }

  // ═════════════════════════════════════════════════════════════════════════
  // FICHA POR CANAL (Onda 5)
  // ★ A ficha NÃO é montada aqui. Ela vem do mesmo pré-voo que a conferência
  //   da exportação usa, em modo memória, montada pelo `util/prevoo-fichas`.
  //   Uma segunda montagem seria a segunda verdade que esta tela existe para
  //   não criar.
  // ═════════════════════════════════════════════════════════════════════════
  function canaisDosDestinos() {
    var out = [];
    estado.destinos.forEach(function (d) {
      if (d.canal && out.indexOf(d.canal) < 0) out.push(d.canal);
    });
    return out;
  }

  function lojaDoCanal(canal) {
    var d = estado.destinos.filter(function (x) { return x.canal === canal; })[0];
    return d ? d.lojaId : null;
  }

  async function buscarFicha(canal) {
    if (cacheFichas[canal]) return cacheFichas[canal];
    var lojaId = lojaDoCanal(canal);
    if (!lojaId) throw new Error('Escolha uma loja deste canal antes.');
    // Salva primeiro: o produto que vai para o pré-voo é lido do rascunho.
    await salvar({ forcar: true });
    if (!estado.rascunhoId) throw new Error('Não consegui salvar o rascunho antes de montar a ficha.');

    var pf = await chamar('/' + estado.rascunhoId + '/produto-para-ficha');
    var r = await fetch(base() + '/api/marketplaces/loja/' + lojaId + '/pre-voo', {
      method: 'POST', headers: cabecalhos(),
      body: JSON.stringify({ produtos: [pf.produto] }),
    });
    var j = await r.json();
    if (!j || !j.ok) throw new Error((j && j.erro) || 'Não consegui montar a ficha deste canal.');
    cacheFichas[canal] = (j.fichas && j.fichas[0]) || null;
    return cacheFichas[canal];
  }

  function etapaFicha() {
    var canais = canaisDosDestinos();
    if (!canais.length) {
      return '<div class="lc-an-etapa"><p style="color:var(--lc-muted)">'
        + 'Escolha os destinos primeiro. A ficha depende de quais canais você vai publicar.</p></div>';
    }
    var NOMES = { shopee: 'Shopee', mercadolivre: 'Mercado Livre', tiktok: 'TikTok Shop', shein: 'Shein' };
    var atual = estado.canalAba && canais.indexOf(estado.canalAba) >= 0 ? estado.canalAba : canais[0];
    estado.canalAba = atual;

    var abas = canais.map(function (c) {
      var ativo = c === atual;
      return '<button class="lc-an-aba" data-canal="' + c + '" style="border:1px solid '
        + (ativo ? 'var(--lc-primary)' : 'var(--lc-border-2)') + ';background:'
        + (ativo ? 'var(--lc-primary)' : '#fff') + ';color:'
        + (ativo ? 'var(--lc-primary-text)' : 'var(--lc-ink-2)')
        + ';border-radius:8px;padding:7px 13px;cursor:pointer;font-size:13px;font-weight:700;margin:0 6px 8px 0">'
        + esc(NOMES[c] || c) + '</button>';
    }).join('');

    var cat = (estado.dados.categoriasPorCanal || {})[atual] || '';
    var busca = '<div style="border:1px solid var(--lc-border);border-radius:10px;padding:14px;margin-bottom:14px">'
      + '<div style="font-size:12px;font-weight:700;color:var(--lc-ink-2);margin-bottom:6px">Categoria neste canal</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<input id="lcAnBuscaCat" placeholder="Digite parte do nome e pressione Enter" value="" '
      + 'style="flex:1;min-width:220px;padding:8px 10px;border:1px solid var(--lc-border-2);border-radius:8px;font-size:13px">'
      + '<button id="lcAnUsarTitulo" style="border:1px solid var(--lc-border-2);background:#fff;color:var(--lc-ink-2);border-radius:8px;padding:8px 12px;cursor:pointer;font-size:13px">Sugerir pelo título</button>'
      + '</div>'
      + '<div id="lcAnResultCat" style="margin-top:8px"></div>'
      + '<div style="font-size:12px;color:' + (cat ? 'var(--lc-primary)' : 'var(--lc-muted-2)') + ';margin-top:8px">'
      + (cat ? 'Categoria escolhida: ' + esc(cat) : 'Sem categoria escolhida. Sem ela não existe lista de campos para conferir.')
      + '</div></div>';

    var ficha = cacheFichas[atual];
    var corpo;
    if (!cat) {
      corpo = '<p style="font-size:13px;color:var(--lc-muted)">Escolha a categoria para ver os campos deste canal.</p>';
    } else if (buscandoFicha) {
      corpo = '<p style="font-size:13px;color:var(--lc-muted)">Carregando os campos...</p>';
    } else if (!ficha) {
      // ★★ v33k.2219: CARREGA SOZINHA. Pedido de 01/09: "após selecionar uma
      //   categoria preciso que carregue automaticamente os atributos e não
      //   precisa de existir esse botão". Um botão que só tem um caminho e é
      //   obrigatório para seguir não é escolha, é um passo a mais.
      corpo = '<p style="font-size:13px;color:var(--lc-muted)">Carregando os campos...</p>';
      if (!buscandoFicha) {
        buscandoFicha = true;
        setTimeout(function () {
          buscarFicha(atual)
            .catch(function (e) { avisar(e.message); })
            .then(function () { buscandoFicha = false; desenharEtapa(); });
        }, 0);
      }
    } else if (ficha.motivo && !(ficha.campos || []).length) {
      corpo = '<p style="font-size:13px;color:var(--lc-danger)">' + esc(ficha.motivo) + '</p>';
    } else {
      var campos = ficha.campos || [];
      var pendentes = campos.filter(function (c) { return c.pendente; }).length;
      corpo = '<div style="display:flex;justify-content:flex-end;margin-bottom:8px">'
        + '<button id="lcAnIaFicha" style="border:1px solid var(--lc-border-2);background:#fff;color:var(--lc-ink-2);'
        + 'border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px">Sugerir os campos com IA</button></div>'
        + (estado.sugestoes.atributos
          ? caixaSugestao('atributos',
              Object.keys(estado.sugestoes.atributos.valores || {}).map(function (id) {
                var nome = (campos.filter(function (c) { return String(c.id) === String(id); })[0] || {}).nome || id;
                return '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:5px 0;font-size:13px">'
                  + '<span style="color:var(--lc-ink-2)">' + esc(nome) + '</span>'
                  + '<span style="color:var(--lc-ink);font-weight:700">' + esc(estado.sugestoes.atributos.valores[id]) + '</span></div>';
              }).join('')
              + '<button id="lcAnUsarFicha" style="margin-top:8px;border:0;background:var(--lc-primary);color:var(--lc-primary-text);'
              + 'border-radius:8px;padding:7px 14px;cursor:pointer;font-size:13px;font-weight:700">Usar estes valores</button>'
              + '<button class="lc-an-descartar-ia" data-campo="atributos" style="margin-left:8px;border:1px solid var(--lc-border-2);'
              + 'background:#fff;color:var(--lc-ink-2);border-radius:8px;padding:7px 12px;cursor:pointer;font-size:13px">Descartar</button>')
          : '')
        + '<div style="font-size:12px;color:' + (pendentes ? 'var(--lc-danger)' : 'var(--lc-primary)') + ';margin-bottom:10px">'
        + (pendentes
          ? pendentes + ' campo(s) que o marketplace exige ainda em branco. Você pode enviar assim, e a recusa fica registrada no rascunho.'
          : 'Nenhum campo obrigatório em branco neste canal.')
        + '</div>'
        + campos.map(function (c) {
          var valor = ((estado.dados.atributosPorCanal || {})[atual] || {})[c.id];
          if (valor == null) valor = c.valor || '';
          var lista = (c.valores || []).length
            ? '<select class="lc-an-attr" data-id="' + esc(c.id) + '" style="width:100%;padding:8px 10px;border:1px solid var(--lc-border-2);border-radius:8px;font-size:13px">'
              + '<option value="">Escolha</option>'
              + c.valores.map(function (v) {
                return '<option value="' + esc(v.nome) + '"' + (String(valor) === String(v.nome) ? ' selected' : '') + '>' + esc(v.nome) + '</option>';
              }).join('') + '</select>'
            : '<input class="lc-an-attr" data-id="' + esc(c.id) + '" value="' + esc(valor) + '" style="width:100%;padding:8px 10px;border:1px solid var(--lc-border-2);border-radius:8px;font-size:13px">';
          return '<label style="display:block;margin-bottom:12px">'
            + '<span style="display:block;font-size:12px;font-weight:700;color:var(--lc-ink-2);margin-bottom:4px">'
            + esc(c.nome)
            + (c.obrigatorio ? '<span style="color:var(--lc-danger);font-weight:800"> exigido pelo canal</span>' : '')
            + '</span>' + lista + '</label>';
        }).join('');
    }

    return '<div class="lc-an-etapa"><div>' + abas + '</div>' + busca + corpo + '</div>';
  }

  // ═════════════════════════════════════════════════════════════════════════
  // CONFERÊNCIA E ENVIO (Onda 7)
  // ───────────────────────────────────────────────────────────────────────
  // ★ O ENVIO NÃO É ATÔMICO, E ISSO É ASSUMIDO. Uma loja recusar não pode
  //   derrubar as outras: o laço segue, cada resultado é gravado no rascunho
  //   assim que chega, e o estado vira `parcial`. Quem parasse no primeiro
  //   erro transformaria uma recusa em cinco anúncios não publicados.
  //
  // ★ CADA RESULTADO É GRAVADO NA HORA, não no fim. Fechar a aba no meio do
  //   envio deixa o que já foi publicado registrado, e o resto retomável. Foi
  //   exatamente o que faltou em 31/08.
  //
  // ★ O PRODUTO INTERNO NASCE PELA ROTA DE SEMPRE. `POST /api/produtos` valida,
  //   deduz o que dá (v33k.1871) e carimba o dono pelo escopo. Insert direto
  //   daqui pularia os três.
  // ═════════════════════════════════════════════════════════════════════════
  function etapaConferencia() {
    var d = estado.dados;
    var linha = function (rot, val) {
      return '<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--lc-border);font-size:13px">'
        + '<span style="color:var(--lc-muted)">' + esc(rot) + '</span>'
        + '<span style="color:var(--lc-ink);font-weight:600;text-align:right">' + esc(val || 'em branco') + '</span></div>';
    };
    // Conta pela MATRIZ, não pelo que foi digitado: era daqui que saía o
    // "1 combinação" numa tela que mostrava quatro.
    sincronizarCombinacoes();
    var combos = combinacoes().map(rotuloCombinacao);
    var resumo = linha('Nome', d.nome) + linha('SKU pai', d.sku) + linha('Marca', d.marca)
      + linha('Preço', d.preco) + linha('Estoque', d.estoque)
      + linha('Fotos', (Array.isArray(d.fotos) ? d.fotos.length : 0) + ' imagem(ns)')
      + linha('Variações', combos.length ? combos.length + ' combinação(ões)' : 'produto simples')
      + linha('Peso e medidas', [d.peso ? d.peso + ' g' : '', [d.comprimento, d.largura, d.altura].filter(Boolean).join(' x ')].filter(Boolean).join(' · '));

    var destinos = estado.destinos.map(function (dd) {
      var cor = dd.resultado === 'publicado' ? 'var(--lc-primary)'
        : (dd.resultado === 'recusado' ? 'var(--lc-danger)' : 'var(--lc-muted-2)');
      var texto = dd.resultado === 'publicado' ? 'publicado'
        : (dd.resultado === 'recusado' ? ('recusado: ' + (dd.motivo || 'sem motivo informado')) : 'ainda não enviado');
      var cat = (d.categoriasPorCanal || {})[dd.canal];
      return '<div style="border:1px solid var(--lc-border);border-radius:8px;padding:10px 12px;margin-bottom:8px">'
        + '<div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">'
        + '<span style="font-size:13px;font-weight:700;color:var(--lc-ink)">' + esc(dd.nome) + '</span>'
        + '<span style="font-size:12px;color:' + cor + '">' + esc(texto) + '</span></div>'
        + '<div style="font-size:11px;color:var(--lc-muted-2);margin-top:3px">'
        + (cat ? 'categoria ' + esc(cat) : 'sem categoria escolhida neste canal') + '</div></div>';
    }).join('');

    if (!estado.destinos.length) {
      destinos = '<p style="font-size:13px;color:var(--lc-muted)">Nenhum destino escolhido. Volte em Destinos.</p>';
    }

    var podeEnviar = estado.destinos.length && d.nome && !estado.enviando;
    var qtd = estado.dados.quantidadePorLoja || 1;
    return '<div class="lc-an-etapa">'
      + '<div style="font-size:12px;font-weight:800;color:var(--lc-ink-2);margin-bottom:8px">O ANÚNCIO</div>'
      + resumo
      + '<div style="font-size:12px;font-weight:800;color:var(--lc-ink-2);margin:18px 0 8px">PARA ONDE VAI</div>'
      + destinos
      + '<div style="font-size:12px;font-weight:800;color:var(--lc-ink-2);margin:18px 0 8px">QUANTOS ANÚNCIOS EM CADA LOJA</div>'
      + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
      + '<input id="lcAnQtd" type="number" min="1" max="50" value="' + esc(qtd) + '" '
      + 'style="width:90px;padding:8px 10px;border:1px solid var(--lc-border-2);border-radius:8px;font-size:14px">'
      + '<span style="font-size:13px;color:var(--lc-muted)">em cada uma das '
      + estado.destinos.length + ' loja(s), ou seja ' + (qtd * estado.destinos.length) + ' anúncio(s) no total.</span>'
      + '</div>'
      // ★★ v33k.2221: AS OPÇÕES DE VARIAÇÃO AUTOMÁTICA VÊM PARA CÁ.
      //   Pedido de 01/09: elas moravam num modal que aparecia DEPOIS, pedindo
      //   de novo o que esta tela já perguntou. Ficam cinzas com 1 cópia,
      //   porque variar existe para diferenciar cópias ENTRE SI: com uma só,
      //   não há de quem diferenciar, e o único efeito seria trocar o título
      //   que a pessoa acabou de escrever.
      + _blocoVariacaoAutomatica(qtd)
      + (estado.envioErro
        ? '<div style="border:1px solid var(--lc-danger-soft);background:#fff;border-radius:8px;padding:10px 12px;margin:10px 0;font-size:13px;color:var(--lc-danger)">'
          + esc(estado.envioErro) + '</div>'
        : '')
      + '<button id="lcAnEnviar"' + (podeEnviar ? '' : ' disabled')
      + ' style="margin-top:14px;border:0;background:' + (podeEnviar ? 'var(--lc-primary)' : 'var(--lc-border-2)')
      + ';color:var(--lc-primary-text);border-radius:8px;padding:11px 20px;'
      + (podeEnviar ? 'cursor:pointer' : 'cursor:not-allowed') + ';font-size:14px;font-weight:700">'
      + (estado.enviando ? 'Preparando...' : 'Continuar para a exportação') + '</button>'
      + '<div style="font-size:11px;color:var(--lc-muted-2);margin-top:8px">'
      + 'Esta tela não publica. Ela cria o produto e leva você para a tela de exportação de sempre, '
      + 'onde você confere anúncio por anúncio antes de qualquer coisa sair daqui.'
      + '</div></div>';
  }

  var OPCOES_AUTO = [
    { id: 'variarTitulo', rotulo: 'Gerar um título diferente para cada cópia' },
    { id: 'variarDescricao', rotulo: 'Gerar uma descrição diferente para cada cópia' },
    { id: 'rotacionarFotos', rotulo: 'Rotacionar a ordem das fotos entre as cópias' },
    { id: 'ativarAds', rotulo: 'Ativar no Ads depois de publicar' },
  ];

  function _blocoVariacaoAutomatica(qtd) {
    var liberado = qtd > 1;
    var op = estado.dados.opcoesAuto || {};
    return '<div style="margin-top:18px;border:1px solid var(--lc-border);border-radius:10px;padding:14px;'
      + (liberado ? '' : 'opacity:.55') + '">'
      + '<div style="font-size:12px;font-weight:800;color:var(--lc-ink-2);margin-bottom:4px">VARIAÇÕES AUTOMÁTICAS</div>'
      + '<div style="font-size:12px;color:var(--lc-muted-2);margin-bottom:10px">'
      + (liberado
        ? 'Cada cópia sai diferente das outras, para não competirem entre si.'
        : 'Disponível a partir de 2 cópias por loja. Com uma só, não há de quem diferenciar.')
      + '</div>'
      + OPCOES_AUTO.map(function (o) {
        return '<label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;'
          + 'color:var(--lc-ink-2);cursor:' + (liberado ? 'pointer' : 'not-allowed') + '">'
          + '<input type="checkbox" class="lc-an-auto" data-op="' + o.id + '"'
          + (op[o.id] && liberado ? ' checked' : '') + (liberado ? '' : ' disabled') + '>'
          + esc(o.rotulo) + '</label>';
      }).join('')
      + '</div>';
  }

  async function garantirProdutoInterno() {
    if (estado.dados.produtoIdCriado) return estado.dados.produtoIdCriado;
    var pc = await chamar('/' + estado.rascunhoId + '/produto-para-criacao');
    var r = await fetch(base() + '/api/produtos', {
      method: 'POST', headers: cabecalhos(), body: JSON.stringify(pc.produto),
    });
    var j = await r.json();
    if (!j || !j.ok || !j.produto) {
      var det = (j && j.detalhes) ? ' ' + j.detalhes.join(' ') : '';
      throw new Error(((j && j.erro) || 'Não consegui criar o produto interno.') + det);
    }
    estado.dados.produtoIdCriado = j.produto.id;
    // Grava o vínculo no rascunho na hora: se o envio falhar depois, o produto
    // já criado não vira órfão sem nada apontando para ele.
    await chamar('/' + estado.rascunhoId, {
      metodo: 'PUT', corpo: { dados: estado.dados, produtoId: j.produto.id },
    });
    return j.produto.id;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ENTREGA PARA A EXPORTAÇÃO QUE JÁ EXISTE (Onda 11)
  // ───────────────────────────────────────────────────────────────────────
  // ★★ ESTA TELA NÃO PUBLICA MAIS NADA, e é decisão de 31/08. O caminho é
  //   sempre o da DUPLICAÇÃO: `abrirDuplicarAnuncio` já tem quantidade por
  //   loja, seleção de várias lojas, título novo por cópia, rotação de fotos,
  //   ativação de Ads, e termina no portão de conferência anúncio por anúncio.
  //
  //   A versão anterior desta tela exportava direto, loja a loja. Funcionava,
  //   mas era um SEGUNDO caminho de publicação: dois lugares para corrigir o
  //   mesmo bug, e um deles sem a página de revisão que já é boa. Saiu inteiro.
  //
  // ★ MESMO COM UM ANÚNCIO SÓ EM UM MARKETPLACE a pessoa passa pela página de
  //   conferência. Foi o pedido, e é o que impede exportação no escuro.
  //
  // ★ O QUE ESTA TELA AINDA FAZ: cria o produto interno pela rota de sempre,
  //   marca as lojas escolhidas e preenche a quantidade. Daí em diante, quem
  //   manda é o fluxo antigo.
  async function entregarParaExportacao() {
    estado.enviando = true;
    estado.envioErro = null;
    desenharEtapa();
    try {
      await salvar({ forcar: true });
      var produtoIdBanco = await garantirProdutoInterno();

      // O modal da duplicação lê o cache do painel (`produtosErp`), não o
      // banco. Sem recarregar, o produto recém-criado não existe para ele.
      if (typeof window.carregarProdutosDoBackend === 'function') {
        await window.carregarProdutosDoBackend();
      }
      var lista = window.produtosErp || [];
      var local = lista.filter(function (p) {
        return String(p.idBanco) === String(produtoIdBanco) || String(p.id) === String(produtoIdBanco);
      })[0];
      // ★ FALHA ALTO. Sem achar o produto, abrir a duplicação mostraria
      //   "produto não encontrado" e a pessoa não saberia que ele foi criado.
      if (!local) {
        throw new Error('Criei o produto (id ' + produtoIdBanco + ') mas ele ainda não apareceu na lista. '
          + 'Recarregue a tela de Anúncios e duplique a partir dele.');
      }
      if (typeof window.abrirDuplicarAnuncio !== 'function') {
        throw new Error('A tela de exportação não está disponível nesta versão do painel.');
      }

      var _qtd = Math.max(1, parseInt(estado.dados.quantidadePorLoja, 10) || 1);
      var _op = (_qtd > 1 && estado.dados.opcoesAuto) ? estado.dados.opcoesAuto : {};
      fechar();
      // ★ v33k.2221: vai com `auto`, então o modal de duplicar não aparece:
      //   quantidade, lojas e opções já foram perguntadas aqui.
      window.abrirDuplicarAnuncio(local.id, {
        qtd: _qtd,
        lojas: estado.destinos.map(function (dd) { return dd.lojaId; }),
        variarTitulo: !!_op.variarTitulo,
        variarDescricao: !!_op.variarDescricao,
        rotacionarFotos: !!_op.rotacionarFotos,
        ativarAds: !!_op.ativarAds,
      });

      // ★ v33k.2221: o `auto` acima já preenche quantidade, lojas e opções
      //   dentro do próprio modal, antes de disparar. O ajuste por `setTimeout`
      //   que existia aqui saiu: era uma segunda escrita nos mesmos campos,
      //   correndo contra a primeira.
    } catch (e) {
      estado.envioErro = e.message;
      estado.enviando = false;
      desenharEtapa();
      return;
    }
    estado.enviando = false;
  }

  function desenharEtapa() {
    var alvo = document.getElementById('lcAnCorpo');
    if (!alvo) return;
    if (estado.etapa === 'produto') alvo.innerHTML = etapaProduto();
    else if (estado.etapa === 'fotos') alvo.innerHTML = etapaFotos();
    else if (estado.etapa === 'embalagem') alvo.innerHTML = etapaEmbalagem();
    else if (estado.etapa === 'destinos') {
      alvo.innerHTML = etapaDestinos();
      if (!cacheLojas) {
        carregarLojas().then(function () { if (estado.etapa === 'destinos') desenharEtapa(); })
          .catch(function (e) {
            alvo.innerHTML = '<div class="lc-an-etapa"><p style="color:var(--lc-danger)">' + esc(e.message) + '</p></div>';
          });
      }
    } else if (estado.etapa === 'ficha') alvo.innerHTML = etapaFicha();
    else alvo.innerHTML = etapaConferencia();
    ligarCampos();
    pintarPassos();
    pintarAcaoFinal();
    icones(alvo);
  }

  function pintarAcaoFinal() {
    var el = document.getElementById('lcAnAcaoFinal');
    if (!el) return;
    if (estado.etapa !== 'conferencia') {
      el.innerHTML = '<span style="font-size:12px;color:var(--lc-muted-2)">Salvo sozinho a cada etapa</span>';
      return;
    }
    el.innerHTML = '<button id="lcAnSalvar" style="border:1px solid var(--lc-border-2);background:#fff;'
      + 'color:var(--lc-ink-2);border-radius:8px;padding:9px 18px;cursor:pointer;font-size:13px;'
      + 'font-weight:700">Salvar e fechar</button>';
    var b = document.getElementById('lcAnSalvar');
    if (b) {
      b.addEventListener('click', async function () {
        estado.sujo = true;
        await salvar({ forcar: true });
        if (!estado.erro) { toast('Rascunho salvo.'); fechar(); }
      });
    }
  }

  function pintarPassos() {
    ETAPAS.forEach(function (e) {
      var b = document.getElementById('lcAnPasso_' + e.id);
      if (!b) return;
      var ativo = e.id === estado.etapa;
      b.style.background = ativo ? 'var(--lc-primary)' : '#fff';
      b.style.color = ativo ? '#fff' : 'var(--lc-ink-2)';
      b.style.borderColor = ativo ? 'var(--lc-primary)' : 'var(--lc-border-2)';
    });
  }

  function ligarCampos() {
    var mapa = {
      lcAnNome: 'nome', lcAnSku: 'sku', lcAnMarca: 'marca', lcAnEan: 'ean',
      lcAnDescricao: 'descricao', lcAnPalavras: 'palavrasChave', lcAnPreco: 'preco', lcAnEstoque: 'estoque',
      lcAnPeso: 'peso', lcAnComprimento: 'comprimento', lcAnLargura: 'largura', lcAnAltura: 'altura',
    };
    Object.keys(mapa).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function () {
        estado.dados[mapa[id]] = el.value;
        marcarSujo();
      });
    });

    function guardarFotos(alvo) {
      if (alvo === 'geral') {
        if (!Array.isArray(estado.dados.fotos)) estado.dados.fotos = [];
        return estado.dados.fotos;
      }
      // As fotos por variação moram em `fotosPorGrupo`, indexadas pelo VALOR
      // da primeira dimensão ("Preto", "Azul"), e não pela combinação.
      if (!estado.dados.fotosPorGrupo) estado.dados.fotosPorGrupo = {};
      if (!Array.isArray(estado.dados.fotosPorGrupo[alvo])) estado.dados.fotosPorGrupo[alvo] = [];
      return estado.dados.fotosPorGrupo[alvo];
    }

    Array.prototype.forEach.call(document.querySelectorAll('.lc-an-arquivo'), function (el) {
      el.addEventListener('change', async function () {
        var arquivos = Array.prototype.slice.call(el.files || []);
        if (!arquivos.length) return;
        var r = regrasDeFoto();
        if (!r) return;
        var alvo = el.dataset.alvo;
        var atuais = guardarFotos(alvo);
        var limite = alvo === 'geral' ? r.geralMax : r.porVariacaoMax;
        el.disabled = true;
        try {
          var urls = await subirArquivos(arquivos, limite, atuais);
          if (urls.length) {
            Array.prototype.push.apply(atuais, urls);
            // As fotos que ESTA tela subiu ficam registradas: é por elas que a
            // faxina de 72h sabe o que apagar se o rascunho for abandonado.
            if (!Array.isArray(estado.dados.fotosStorage)) estado.dados.fotosStorage = [];
            Array.prototype.push.apply(estado.dados.fotosStorage, urls);
            marcarSujo();
          }
        } catch (e) { avisar(e.message); }
        el.disabled = false;
        desenharEtapa();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('.lc-an-mover-foto'), function (el) {
      el.addEventListener('click', function () {
        var lista = guardarFotos(el.dataset.alvo);
        var i = Number(el.dataset.i);
        var j = i + Number(el.dataset.dir);
        // Borda: sem isto, mover a primeira para a esquerda jogaria a foto
        // para o fim da lista pelo índice -1.
        if (j < 0 || j >= lista.length) return;
        var t = lista[i]; lista[i] = lista[j]; lista[j] = t;
        marcarSujo();
        desenharEtapa();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('.lc-an-tirar-foto'), function (el) {
      el.addEventListener('click', function () {
        var lista = guardarFotos(el.dataset.alvo);
        lista.splice(Number(el.dataset.i), 1);
        marcarSujo();
        desenharEtapa();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('.lc-an-temvar'), function (el) {
      el.addEventListener('click', function () {
        var sim = el.dataset.op === 'sim';
        estado.dados.temVariacoes = sim;
        // Escolher "com variações" e não haver nenhuma ainda: começa uma, para
        // a pessoa não ter que caçar o botão.
        if (sim && !variacoes().length) variacoes().push({ nome: '', valores: [] });
        // Escolher "sem variação" NÃO apaga o que já foi montado: se ela
        // trocar sem querer, o trabalho continua ali ao voltar.
        marcarSujo();
        desenharEtapa();
      });
    });

    var add = document.getElementById('lcAnAddVar');
    if (add) {
      add.addEventListener('click', function () {
        variacoes().push({ nome: '', valores: [] });
        marcarSujo();
        desenharEtapa();
      });
    }

    Array.prototype.forEach.call(document.querySelectorAll('.lc-an-nome-var'), function (el) {
      el.addEventListener('input', function () {
        variacoes()[Number(el.dataset.var)].nome = el.value;
        marcarSujo();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('.lc-an-novo-valor'), function (el) {
      el.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        var valor = el.value.trim();
        if (!valor) return;
        var v = variacoes()[Number(el.dataset.var)];
        if ((v.valores || []).indexOf(valor) >= 0) { toast('Esse valor já está na lista.'); return; }
        v.valores = (v.valores || []).concat([valor]);
        el.value = '';
        marcarSujo();
        desenharEtapa();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('.lc-an-tirar-valor'), function (el) {
      el.addEventListener('click', function () {
        var v = variacoes()[Number(el.dataset.var)];
        v.valores.splice(Number(el.dataset.valor), 1);
        marcarSujo();
        desenharEtapa();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('.lc-an-tirar-var'), function (el) {
      el.addEventListener('click', function () {
        variacoes().splice(Number(el.dataset.var), 1);
        marcarSujo();
        desenharEtapa();
      });
    });

    // ── destinos ────────────────────────────────────────────────────────
    var buscaLoja = document.getElementById('lcAnBuscaLoja');
    if (buscaLoja) {
      buscaLoja.addEventListener('input', function () {
        // A busca é só da TELA: não entra no rascunho, e não desmarca nada.
        // Loja marcada que sai do filtro continua marcada.
        estado.buscaLoja = buscaLoja.value;
        var pos = buscaLoja.selectionStart;
        desenharEtapa();
        var novo = document.getElementById('lcAnBuscaLoja');
        if (novo) { novo.focus(); try { novo.setSelectionRange(pos, pos); } catch (e) {} }
      });
    }

    Array.prototype.forEach.call(document.querySelectorAll('.lc-an-destino'), function (el) {
      el.addEventListener('change', function () {
        var loja = (cacheLojas || []).filter(function (l) {
          return String(l.lojaId || l.idBanco || l.id) === String(el.dataset.loja);
        })[0];
        if (!loja) return;
        alternarDestino(loja);
        desenharEtapa();
      });
    });

    // ── ficha por canal ─────────────────────────────────────────────────
    Array.prototype.forEach.call(document.querySelectorAll('.lc-an-aba'), function (el) {
      el.addEventListener('click', function () {
        estado.canalAba = el.dataset.canal;
        desenharEtapa();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('.lc-an-auto'), function (el) {
      el.addEventListener('change', function () {
        if (!estado.dados.opcoesAuto) estado.dados.opcoesAuto = {};
        estado.dados.opcoesAuto[el.dataset.op] = el.checked;
        marcarSujo();
      });
    });

    var campoQtd = document.getElementById('lcAnQtd');
    if (campoQtd) {
      campoQtd.addEventListener('input', function () {
        var n = Math.max(1, Math.min(50, parseInt(campoQtd.value, 10) || 1));
        estado.dados.quantidadePorLoja = n;
        marcarSujo();
      });
      campoQtd.addEventListener('change', function () { desenharEtapa(); });
    }

    var buscaCat = document.getElementById('lcAnBuscaCat');
    if (buscaCat) {
      buscaCat.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        procurarCategoria(buscaCat.value, null);
      });
    }
    var porTitulo = document.getElementById('lcAnUsarTitulo');
    if (porTitulo) {
      porTitulo.addEventListener('click', function () {
        if (!estado.dados.nome) { avisar('Preencha o nome do anúncio primeiro.'); return; }
        procurarCategoria(null, estado.dados.nome);
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll('.lc-an-attr'), function (el) {
      el.addEventListener('change', function () {
        if (!estado.dados.atributosPorCanal) estado.dados.atributosPorCanal = {};
        var canal = estado.canalAba;
        if (!estado.dados.atributosPorCanal[canal]) estado.dados.atributosPorCanal[canal] = {};
        estado.dados.atributosPorCanal[canal][el.dataset.id] = el.value;
        marcarSujo();
      });
    });

    var enviar = document.getElementById('lcAnEnviar');
    if (enviar && !enviar.disabled) enviar.addEventListener('click', entregarParaExportacao);

    // ── IA ──────────────────────────────────────────────────────────────
    Array.prototype.forEach.call(document.querySelectorAll('.lc-an-ia'), function (el) {
      el.addEventListener('click', async function () {
        var antes = el.textContent;
        el.textContent = 'Pensando...';
        el.disabled = true;
        try { await sugerir(el.dataset.campo); desenharEtapa(); }
        catch (e) { avisar(e.message); el.textContent = antes; el.disabled = false; }
      });
    });

    var iaFicha = document.getElementById('lcAnIaFicha');
    if (iaFicha) {
      iaFicha.addEventListener('click', async function () {
        var f = cacheFichas[estado.canalAba];
        if (!f || !(f.campos || []).length) { avisar('Carregue os campos deste canal primeiro.'); return; }
        iaFicha.textContent = 'Pensando...';
        iaFicha.disabled = true;
        try { await sugerir('atributos', { campos: f.campos }); desenharEtapa(); }
        catch (e) { avisar(e.message); iaFicha.textContent = 'Sugerir os campos com IA'; iaFicha.disabled = false; }
      });
    }

    // ★ É AQUI, e só aqui, que sugestão vira dado.
    Array.prototype.forEach.call(document.querySelectorAll('.lc-an-usar'), function (el) {
      el.addEventListener('click', function () {
        var campo = el.dataset.campo;
        var valor = el.dataset.valor;
        // ★ Pedido de 31/08: os termos de busca entram NO FIM da descrição,
        //   para ajudar o comprador a achar o anúncio. Só quando existem, e
        //   sem repetir se já estiverem lá.
        if (campo === 'descricao' && estado.dados.palavrasChave) {
          var t = String(estado.dados.palavrasChave).trim();
          if (t && valor.indexOf(t) < 0) valor = valor + '\n\n' + t;
        }
        estado.dados[campo === 'titulo' ? 'nome' : campo] = valor;
        delete estado.sugestoes[campo];
        marcarSujo();
        desenharEtapa();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('.lc-an-usar-embalagem'), function (el) {
      el.addEventListener('click', function () {
        var e = estado.sugestoes.embalagem || {};
        if (e.peso) estado.dados.peso = String(e.peso);
        if (e.comprimento) estado.dados.comprimento = String(e.comprimento);
        if (e.largura) estado.dados.largura = String(e.largura);
        if (e.altura) estado.dados.altura = String(e.altura);
        delete estado.sugestoes.embalagem;
        marcarSujo();
        desenharEtapa();
      });
    });

    var usarFicha = document.getElementById('lcAnUsarFicha');
    if (usarFicha) {
      usarFicha.addEventListener('click', function () {
        var vals = (estado.sugestoes.atributos || {}).valores || {};
        if (!estado.dados.atributosPorCanal) estado.dados.atributosPorCanal = {};
        var canal = estado.canalAba;
        if (!estado.dados.atributosPorCanal[canal]) estado.dados.atributosPorCanal[canal] = {};
        Object.keys(vals).forEach(function (id) { estado.dados.atributosPorCanal[canal][id] = vals[id]; });
        delete estado.sugestoes.atributos;
        marcarSujo();
        desenharEtapa();
      });
    }

    Array.prototype.forEach.call(document.querySelectorAll('.lc-an-descartar-ia'), function (el) {
      el.addEventListener('click', function () {
        delete estado.sugestoes[el.dataset.campo];
        desenharEtapa();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('.lc-an-escolher-cat'), function (el) {
      el.addEventListener('click', function () {
        if (!estado.dados.categoriasPorCanal) estado.dados.categoriasPorCanal = {};
        estado.dados.categoriasPorCanal[estado.canalAba] = el.dataset.cat;
        // Categoria nova, ficha velha não serve: os campos são os da categoria.
        // O `desenharEtapa` dispara a carga sozinho, porque a ficha some do
        // cache e o ramo de "sem ficha" busca.
        delete cacheFichas[estado.canalAba];
        marcarSujo();
        desenharEtapa();
      });
    });

    var skuMassa = document.getElementById('lcAnSkuMassa');
    if (skuMassa) {
      skuMassa.addEventListener('click', async function () {
        // O prefixo é escolha dela: o SKU pai do produto ou uma referência
        // digitada. Foi o pedido de 29/08 para a coluna SKU da edição em massa.
        var padrao = estado.dados.sku || '';
        var prefixo = padrao;
        if (typeof window.lcPrompt === 'function') {
          prefixo = await window.lcPrompt('Prefixo dos SKUs (deixe o SKU pai ou digite outra referência):', padrao);
          if (prefixo === null) return;
        }
        var combos = combinacoes().map(rotuloCombinacao);
        var mapa = estado.dados.combinacoes || {};
        var jaTem = Object.keys(mapa).map(function (k) { return mapa[k] && mapa[k].sku; }).filter(Boolean);
        var vazios = combos.filter(function (c) { return !(mapa[c] && mapa[c].sku); });
        var novos = skusEmMassa(prefixo, vazios, jaTem);
        Object.keys(novos).forEach(function (c) {
          if (!mapa[c]) mapa[c] = {};
          mapa[c].sku = novos[c];
        });
        var n = Object.keys(novos).length;
        toast(n ? (n + ' SKU(s) preenchido(s).') : 'Todas as combinações já tinham SKU.');
        marcarSujo();
        desenharEtapa();
      });
    }

    // ★ Preenche em massa SÓ O QUE ESTÁ VAZIO nos campos que a pessoa costuma
    //   variar (EAN), e SOBRESCREVE nos que ela costuma igualar (preço,
    //   promoção, estoque). A diferença não é capricho: EAN é código único por
    //   variação, e sobrescrever destruiria códigos reais já digitados.
    async function _massa(rotulo, padrao, campo, soVazios, filtro) {
      var q = padrao;
      if (typeof window.lcPrompt === 'function') {
        q = await window.lcPrompt(rotulo, padrao);
        if (q === null) return;
      }
      var valor = filtro ? filtro(q) : String(q == null ? '' : q).trim();
      if (valor === null || valor === '') { avisar('Digite um valor.'); return; }
      var mapa = estado.dados.combinacoes || {};
      var n = 0;
      combinacoes().map(rotuloCombinacao).forEach(function (c) {
        if (!mapa[c]) mapa[c] = {};
        if (soVazios && String(mapa[c][campo] || '').trim()) return;
        mapa[c][campo] = valor;
        n++;
      });
      toast(n + ' linha(s) preenchida(s).');
      marcarSujo();
      desenharEtapa();
    }

    var precoMassa = document.getElementById('lcAnPrecoMassa');
    if (precoMassa) {
      precoMassa.addEventListener('click', function () {
        _massa('Preço para TODAS as combinações:', estado.dados.preco || '', 'preco', false);
      });
    }

    var promoMassa = document.getElementById('lcAnPromoMassa');
    if (promoMassa) {
      promoMassa.addEventListener('click', function () {
        _massa('Preço promocional para TODAS (vazio tira a promoção):', '', 'precoPromo', false,
          function (v) { return String(v == null ? '' : v).trim() || ' '; });
      });
    }

    // ★ EAN é gerado, não digitado: cada variação precisa do SEU. O gerador é
    //   o mesmo determinístico do painel quando ele está disponível.
    var eanMassa = document.getElementById('lcAnEanMassa');
    if (eanMassa) {
      eanMassa.addEventListener('click', function () {
        var mapa = estado.dados.combinacoes || {};
        var combos = combinacoes().map(rotuloCombinacao);
        var n = 0;
        // EAN repetido entre variações é anúncio recusado: guarda os que já
        // existem para não colidir.
        var usados = {};
        combos.forEach(function (c) { if (mapa[c] && mapa[c].ean) usados[mapa[c].ean] = true; });
        combos.forEach(function (c, i) {
          if (!mapa[c]) mapa[c] = {};
          if (String(mapa[c].ean || '').trim()) return;   // não mexe no que já existe
          // ★ `gerarEAN13Brasil(seed)` é o gerador do painel, DETERMINÍSTICO
          //   por semente: o mesmo produto gera sempre o mesmo código, e é o
          //   mesmo que a edição de variações usa. Semente com SKU pai, a
          //   combinação e o índice, igual ao `gerarEansVariacoesSomenteVazios`.
          if (typeof window.gerarEAN13Brasil !== 'function') return;
          var seed = [estado.dados.sku || 'X', c, i].join('|');
          var novo = window.gerarEAN13Brasil(seed);
          var t = 0;
          while (usados[novo] && t < 50) { t++; novo = window.gerarEAN13Brasil(seed + '|retry' + t); }
          usados[novo] = true;
          mapa[c].ean = novo;
          n++;
        });
        if (!n) toast('Nada a gerar: as combinações já têm EAN, ou o gerador do painel não está nesta tela.');
        else { toast(n + ' EAN(s) gerado(s).'); marcarSujo(); desenharEtapa(); }
      });
    }

    var estoqueMassa = document.getElementById('lcAnEstoqueMassa');
    if (estoqueMassa) {
      estoqueMassa.addEventListener('click', async function () {
        var q = '10';
        if (typeof window.lcPrompt === 'function') {
          q = await window.lcPrompt('Estoque para TODAS as combinações:', '10');
          if (q === null) return;
        }
        var limpo = String(q).replace(/\D/g, '');
        if (!limpo) { avisar('Digite um número.'); return; }
        var mapa = estado.dados.combinacoes || {};
        combinacoes().map(rotuloCombinacao).forEach(function (c) {
          if (!mapa[c]) mapa[c] = {};
          mapa[c].estoque = limpo;
        });
        marcarSujo();
        desenharEtapa();
      });
    }

    Array.prototype.forEach.call(document.querySelectorAll('.lc-an-combo'), function (el) {
      el.addEventListener('input', function () {
        if (!estado.dados.combinacoes) estado.dados.combinacoes = {};
        var chave = el.dataset.chave;
        if (!estado.dados.combinacoes[chave]) estado.dados.combinacoes[chave] = {};
        estado.dados.combinacoes[chave][el.dataset.campo] = el.value;
        marcarSujo();
      });
    });
  }

  async function procurarCategoria(termo, titulo) {
    var alvo = document.getElementById('lcAnResultCat');
    if (!alvo) return;
    var lojaId = lojaDoCanal(estado.canalAba);
    if (!lojaId) { alvo.innerHTML = '<span style="font-size:12px;color:var(--lc-danger)">Escolha uma loja deste canal antes.</span>'; return; }
    alvo.innerHTML = '<span style="font-size:12px;color:var(--lc-muted-2)">Procurando...</span>';
    try {
      var q = termo ? ('q=' + encodeURIComponent(termo)) : ('titulo=' + encodeURIComponent(titulo || ''));
      var r = await fetch(base() + '/api/marketplaces/loja/' + lojaId + '/categorias/buscar?' + q,
        { headers: cabecalhos() });
      var j = await r.json();
      var lista = (j && j.categorias) || [];
      if (!lista.length) {
        alvo.innerHTML = '<span style="font-size:12px;color:var(--lc-muted-2)">Nada encontrado'
          + (j && j.motivo ? ': ' + esc(j.motivo) : '.') + '</span>';
        return;
      }
      alvo.innerHTML = lista.slice(0, 12).map(function (c) {
        var id = c.id || c.category_id || c.categoryId;
        // A TRILHA é o que distingue: cinco categorias podem se chamar
        // "Tênis", e só o caminho até elas diz qual é qual.
        var folha = c.nome || c.name || id;
        var trilha = c.caminho && c.caminho !== folha ? c.caminho : null;
        return '<button class="lc-an-escolher-cat" data-cat="' + esc(id) + '" '
          + 'style="display:block;width:100%;text-align:left;border:1px solid var(--lc-border);background:#fff;'
          + 'border-radius:8px;padding:7px 10px;margin-bottom:5px;cursor:pointer;font-size:13px;color:var(--lc-ink)">'
          + (trilha
            ? '<span style="display:block;font-size:11px;color:var(--lc-muted-2)">' + esc(trilha) + '</span>'
              + '<span style="font-weight:700">' + esc(folha) + '</span>'
            : esc(folha))
          + '</button>';
      }).join('');
      ligarCampos();
    } catch (e) {
      alvo.innerHTML = '<span style="font-size:12px;color:var(--lc-danger)">' + esc(e.message) + '</span>';
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // IA POR CAMPO (Onda 6)
  // ★ SUGESTÃO NÃO É PREENCHIMENTO. O que volta da IA fica em
  //   `estado.sugestoes` e NÃO em `estado.dados`. Só o botão "Usar" move de um
  //   para o outro. Enquanto não move, nada é salvo no rascunho: o autosave
  //   grava `dados`, e a sugestão não está lá.
  // ═════════════════════════════════════════════════════════════════════════
  // ★★ TÍTULO E DESCRIÇÃO USAM O GERADOR QUE JÁ EXISTE.
  //   `gerarTituloVariadoIA` e `gerarDescricaoVariadaIA` são os MESMOS que a
  //   duplicação chama. Eles já sabem o limite por marketplace (60 no ML, 100
  //   na Shopee), os sinônimos regionais e a lista de títulos proibidos para
  //   não repetir entre anúncios do mesmo produto.
  //
  //   A primeira versão desta tela escreveu um prompt novo para a mesma
  //   coisa. Era a segunda verdade de sempre: dois prompts para o mesmo campo
  //   divergem na primeira correção, e o da tela nova nasceria pior, porque o
  //   outro já pagou meses de ajuste.
  //
  //   Sobra para a rota `/sugerir` o que NÃO existe em lugar nenhum: termos de
  //   busca e o preenchimento dos atributos da ficha do canal.
  function produtoParaGerador() {
    var d = estado.dados;
    // ★★ AS VARIAÇÕES VÃO JUNTO, e é isto que impede o guia de tamanhos em
    //   centímetros num pneu. O gerador de descrição da duplicação já usa as
    //   variações do produto quando elas existem; sem mandá-las, ele escrevia
    //   no escuro e completava com o que costuma aparecer em calçado.
    var vs = (d.temVariacoes === true) ? variacoes()
      .filter(function (v) { return v.nome && (v.valores || []).length; })
      .map(function (v) { return { nome: v.nome, valores: v.valores.slice() }; }) : [];
    return {
      nome: d.nome || '',
      categoria: d.categoriaInterna || '',
      marca: d.marca || '',
      descricao: d.descricao || '',
      atributosMl: (d.atributosPorCanal || {}).mercadolivre || {},
      temVariacoes: d.temVariacoes === true,
      dimensoesDeVariacao: vs,
      variacoes: combinacoes().map(rotuloCombinacao).map(function (c) { return { nome: c }; }),
    };
  }

  function canalPrincipal() {
    var c = canaisDosDestinos();
    return c.length ? c[0] : null;
  }

  async function sugerir(campo, extra) {
    if (campo === 'titulo') {
      if (typeof window.gerarTituloVariadoIA !== 'function') {
        throw new Error('O gerador de títulos do painel não está disponível nesta tela.');
      }
      var usados = [];
      if (estado.dados.nome) usados.push(estado.dados.nome);
      var opcoes = [];
      for (var i = 0; i < 3; i++) {
        var t = await window.gerarTituloVariadoIA(produtoParaGerador(), canalPrincipal(), usados);
        if (t && usados.indexOf(t) < 0) { opcoes.push(t); usados.push(t); }
      }
      if (!opcoes.length) throw new Error('Não consegui gerar título agora.');
      estado.sugestoes.titulo = { opcoes: opcoes };
      return { sugestao: estado.sugestoes.titulo };
    }
    if (campo === 'descricao') {
      if (typeof window.gerarDescricaoVariadaIA !== 'function') {
        throw new Error('O gerador de descrição do painel não está disponível nesta tela.');
      }
      var texto = await window.gerarDescricaoVariadaIA(produtoParaGerador());
      if (!texto) throw new Error('Não consegui gerar a descrição agora.');
      estado.sugestoes.descricao = { texto: texto };
      return { sugestao: estado.sugestoes.descricao };
    }

    if (!estado.rascunhoId) await salvar({ forcar: true });
    if (!estado.rascunhoId) throw new Error('Salve o rascunho antes de pedir sugestão.');
    var corpo = { campo: campo };
    if (extra && extra.campos) corpo.campos = extra.campos;
    var r = await chamar('/' + estado.rascunhoId + '/sugerir', { metodo: 'POST', corpo: corpo });
    estado.sugestoes[campo] = r.sugestao;
    return r;
  }

  function botaoIA(campo, rotulo) {
    return '<button class="lc-an-ia" data-campo="' + campo + '" '
      + 'style="border:1px solid var(--lc-border-2);background:#fff;color:var(--lc-ink-2);'
      + 'border-radius:8px;padding:5px 10px;cursor:pointer;font-size:12px;margin-left:8px">'
      + esc(rotulo || 'Sugerir com IA') + '</button>';
  }

  function caixaSugestao(campo, conteudo) {
    return '<div style="border:1px solid var(--lc-primary);background:var(--lc-primary-softer);'
      + 'border-radius:10px;padding:12px;margin:6px 0 14px">'
      + '<div style="font-size:11px;font-weight:800;color:var(--lc-primary);margin-bottom:6px">'
      + 'SUGESTÃO DA IA, ainda não aplicada</div>' + conteudo + '</div>';
  }

  function sugestaoDoCampo(campo) {
    var sg = estado.sugestoes[campo];
    if (!sg) return '';
    if (campo === 'titulo') {
      return caixaSugestao(campo, (sg.opcoes || []).map(function (o, i) {
        return '<button class="lc-an-usar" data-campo="titulo" data-valor="' + esc(o) + '" '
          + 'style="display:block;width:100%;text-align:left;border:1px solid var(--lc-border);background:#fff;'
          + 'border-radius:8px;padding:8px 10px;margin-bottom:6px;cursor:pointer;font-size:13px">'
          + esc(o) + '</button>';
      }).join('') + '<div style="font-size:11px;color:var(--lc-muted-2)">Clique na opção que você quer usar.</div>');
    }
    if (campo === 'descricao') {
      return caixaSugestao(campo,
        '<div style="font-size:13px;color:var(--lc-ink);white-space:pre-wrap;max-height:180px;overflow:auto">'
        + esc(sg.texto || '') + '</div>'
        + '<button class="lc-an-usar" data-campo="descricao" data-valor="' + esc(sg.texto || '') + '" '
        + 'style="margin-top:8px;border:0;background:var(--lc-primary);color:var(--lc-primary-text);'
        + 'border-radius:8px;padding:7px 14px;cursor:pointer;font-size:13px;font-weight:700">Usar esta descrição</button>'
        + '<button class="lc-an-descartar-ia" data-campo="descricao" '
        + 'style="margin-left:8px;border:1px solid var(--lc-border-2);background:#fff;color:var(--lc-ink-2);'
        + 'border-radius:8px;padding:7px 12px;cursor:pointer;font-size:13px">Descartar</button>');
    }
    if (campo === 'embalagem') {
      var e = sg;
      return caixaSugestao(campo,
        '<div style="font-size:13px;color:var(--lc-ink)">'
        + (e.peso ? e.peso + ' g' : 'peso não estimado')
        + (e.comprimento ? ' · ' + e.comprimento + ' x ' + (e.largura || '?') + ' x ' + (e.altura || '?') + ' cm' : '')
        + '</div>'
        + '<div style="font-size:11px;color:var(--lc-muted-2);margin-top:4px">'
        + 'Estimativa. Peso a menos faz o frete ser cobrado a menos em toda venda, então confira antes de usar.</div>'
        + '<button class="lc-an-usar-embalagem" style="margin-top:8px;border:0;background:var(--lc-primary);color:var(--lc-primary-text);'
        + 'border-radius:8px;padding:7px 14px;cursor:pointer;font-size:13px;font-weight:700">Usar esta estimativa</button>'
        + '<button class="lc-an-descartar-ia" data-campo="embalagem" style="margin-left:8px;border:1px solid var(--lc-border-2);'
        + 'background:#fff;color:var(--lc-ink-2);border-radius:8px;padding:7px 12px;cursor:pointer;font-size:13px">Descartar</button>');
    }
    if (campo === 'palavrasChave') {
      var termos = (sg.termos || []).join(', ');
      return caixaSugestao(campo,
        '<div style="font-size:13px;color:var(--lc-ink)">' + esc(termos) + '</div>'
        + '<button class="lc-an-usar" data-campo="palavrasChave" data-valor="' + esc(termos) + '" '
        + 'style="margin-top:8px;border:0;background:var(--lc-primary);color:var(--lc-primary-text);'
        + 'border-radius:8px;padding:7px 14px;cursor:pointer;font-size:13px;font-weight:700">Usar estes termos</button>');
    }
    return '';
  }

  function irPara(etapa) {
    if (timerSalvar) clearTimeout(timerSalvar);
    estado.etapa = etapa;
    salvar({ forcar: true });
    desenharEtapa();
  }

  function molde() {
    var passos = ETAPAS.map(function (e) {
      return '<button id="lcAnPasso_' + e.id + '" data-etapa="' + e.id + '" class="lc-an-passo" '
        + 'style="border:1px solid var(--lc-border-2);background:#fff;color:var(--lc-ink-2);border-radius:8px;padding:8px 14px;cursor:pointer;font-size:13px;font-weight:700">'
        + esc(e.titulo) + '</button>';
    }).join('');

    return '<div id="lcAnOverlay" style="position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:9000;display:flex;align-items:flex-start;justify-content:center;padding:26px;overflow:auto">'
      + '<div style="background:#fff;border-radius:14px;width:min(940px,100%);box-shadow:0 20px 50px rgba(15,23,42,.25)">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--lc-border)">'
      + '<div><div style="font-size:17px;font-weight:800;color:var(--lc-ink)">Criar anúncio</div>'
      + '<div id="lcAnStatus" style="font-size:12px;color:var(--lc-muted-2);margin-top:2px">Rascunho ainda não iniciado</div></div>'
      + '<button id="lcAnFechar" style="border:1px solid var(--lc-border-2);background:#fff;border-radius:8px;padding:8px 14px;cursor:pointer;font-size:13px">Fechar</button>'
      + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;padding:14px 22px;border-bottom:1px solid #f1f5f9">' + passos + '</div>'
      + '<div id="lcAnCorpo" style="padding:22px;max-height:60vh;overflow:auto"></div>'
      + '<div style="padding:16px 22px;border-top:1px solid var(--lc-border);display:flex;justify-content:space-between;align-items:center;gap:12px">'
      + '<div style="font-size:12px;color:var(--lc-muted-2)">'
      + (ETAPAS_FUTURAS.length ? 'Ainda vem: ' + ETAPAS_FUTURAS.join(', ') + '.' : '') + '</div>'
      + '<div style="display:flex;gap:10px">'
      + '<button id="lcAnDescartar" style="border:1px solid var(--lc-danger-soft);background:#fff;color:var(--lc-danger);border-radius:8px;padding:9px 14px;cursor:pointer;font-size:13px">Descartar</button>'
      // ★★ v33k.2219: O BOTÃO DE FECHAR SÓ NA ÚLTIMA ETAPA.
      //   Relato de 01/09: "cliquei sem querer em salvar rascunho". Ele ficava
      //   no rodapé em TODAS as etapas, colado no "Descartar", competindo com
      //   o fluxo de preencher. Agora só aparece na conferência, que é onde a
      //   decisão de encerrar existe. Nas outras, o rodapé conta o autosave,
      //   que é o que já protege o trabalho.
      + '<span id="lcAnAcaoFinal"></span>'
      + '</div></div></div></div>';
  }

  function fechar() {
    if (timerSalvar) clearTimeout(timerSalvar);
    var o = document.getElementById('lcAnOverlay');
    if (o && o.parentNode) o.parentNode.removeChild(o);
  }

  async function descartar() {
    if (!estado.rascunhoId) { fechar(); return; }
    var sim = await confirmar('Descartar este rascunho? O que você digitou será apagado.');
    if (!sim) return;
    try {
      await chamar('/' + estado.rascunhoId, { metodo: 'DELETE' });
      toast('Rascunho descartado.');
      fechar();
    } catch (e) {
      avisar('Não consegui descartar: ' + e.message);
    }
  }

  async function abrir(rascunhoId) {
    estado = { rascunhoId: null, etapa: 'produto', dados: {}, destinos: [], sugestoes: {}, enviando: false, envioErro: null, salvando: false, sujo: false, erro: null };
    cacheFichas = {};

    if (rascunhoId) {
      try {
        var r = await chamar('/' + rascunhoId);
        estado.rascunhoId = r.rascunho.id;
        estado.dados = r.rascunho.dados || {};
        estado.destinos = Array.isArray(r.rascunho.destinos) ? r.rascunho.destinos : [];
        // Rascunho salvo antes da v33k.2210 pode apontar para a etapa
        // 'variacoes', que deixou de existir: cai no produto, onde elas moram
        // agora, em vez de abrir numa etapa que não desenha nada.
        estado.etapa = ETAPAS.some(function (e) { return e.id === r.rascunho.etapa; })
          ? r.rascunho.etapa : 'produto';
      } catch (e) {
        avisar('Não consegui abrir o rascunho: ' + e.message);
        return;
      }
    }

    var div = document.createElement('div');
    div.innerHTML = molde();
    document.body.appendChild(div.firstChild);

    document.getElementById('lcAnFechar').addEventListener('click', function () {
      salvar({ forcar: estado.sujo });
      fechar();
    });
    document.getElementById('lcAnDescartar').addEventListener('click', descartar);
    Array.prototype.forEach.call(document.querySelectorAll('.lc-an-passo'), function (b) {
      b.addEventListener('click', function () { irPara(b.dataset.etapa); });
    });

    desenharEtapa();
    pintarStatus();
  }

  async function listar() {
    var r = await chamar('');
    return r.rascunhos || [];
  }

  window.lcAnuncioNovo = {
    abrir: abrir,
    listar: listar,
    // exposto para a suíte medir a regra sem navegador
    _combinacoes: combinacoes,
    _skusEmMassa: skusEmMassa,
    _estado: function () { return estado; },
    ETAPAS: ETAPAS,
  };
})();
