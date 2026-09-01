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
    { id: 'produto', titulo: 'Produto' },
    { id: 'variacoes', titulo: 'Variações' },
    { id: 'fotos', titulo: 'Fotos' },
    { id: 'embalagem', titulo: 'Embalagem' },
    { id: 'destinos', titulo: 'Destinos' },
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
  function campo(rotulo, id, valor, tipo, dica) {
    return '<label style="display:block;margin-bottom:14px">'
      + '<span style="display:block;font-size:12px;font-weight:700;color:var(--lc-ink-2);margin-bottom:5px">' + esc(rotulo) + '</span>'
      + '<input id="' + id + '" type="' + (tipo || 'text') + '" value="' + esc(valor || '') + '" '
      + 'style="width:100%;padding:9px 11px;border:1px solid var(--lc-border-2);border-radius:8px;font-size:14px">'
      + (dica ? '<span style="display:block;font-size:11px;color:var(--lc-muted-2);margin-top:4px">' + esc(dica) + '</span>' : '')
      + '</label>';
  }

  function etapaProduto() {
    var d = estado.dados;
    return '<div class="lc-an-etapa">'
      + '<div style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:10px">'
      + botaoIA('titulo', 'Sugerir títulos') + botaoIA('descricao', 'Sugerir descrição')
      + botaoIA('palavrasChave', 'Sugerir termos de busca') + '</div>'
      + campo('Nome do anúncio', 'lcAnNome', d.nome, 'text', 'É o título que o comprador vê.')
      + sugestaoDoCampo('titulo')
      + campo('SKU pai', 'lcAnSku', d.sku)
      + campo('Marca', 'lcAnMarca', d.marca)
      + campo('EAN ou GTIN', 'lcAnEan', d.ean, 'text', 'Deixe vazio se o produto não tiver código de barras.')
      + '<label style="display:block;margin-bottom:14px">'
      + '<span style="display:block;font-size:12px;font-weight:700;color:var(--lc-ink-2);margin-bottom:5px">Descrição</span>'
      + '<textarea id="lcAnDescricao" rows="7" style="width:100%;padding:9px 11px;border:1px solid var(--lc-border-2);border-radius:8px;font-size:14px;resize:vertical">' + esc(d.descricao || '') + '</textarea>'
      + '</label>'
      + sugestaoDoCampo('descricao')
      + campo('Termos de busca', 'lcAnPalavras', d.palavrasChave, 'text', 'Separados por vírgula. Ajudam o comprador a achar o anúncio.')
      + sugestaoDoCampo('palavrasChave')
      + campo('Preço', 'lcAnPreco', d.preco, 'text', 'Um preço só, que vale para todas as lojas de destino.')
      + campo('Estoque', 'lcAnEstoque', d.estoque, 'text')
      + '</div>';
  }

  function etapaVariacoes() {
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
        + '<div style="font-size:12px;font-weight:700;color:var(--lc-ink-2);margin-bottom:8px">'
        + combos.length + ' combinação(ões)</div>'
        + '<div style="max-height:260px;overflow:auto;border:1px solid var(--lc-border);border-radius:10px">'
        + '<table style="width:100%;border-collapse:collapse;font-size:13px">'
        + '<thead><tr style="background:#f8fafc"><th style="text-align:left;padding:8px 10px">Variação</th>'
        + '<th style="text-align:left;padding:8px 10px">SKU</th>'
        + '<th style="text-align:left;padding:8px 10px">Estoque</th></tr></thead><tbody>'
        + combos.map(function (c) {
          var chave = rotuloCombinacao(c);
          var linha = (estado.dados.combinacoes || {})[chave] || {};
          return '<tr><td style="padding:7px 10px;border-top:1px solid #f1f5f9">' + esc(chave) + '</td>'
            + '<td style="padding:7px 10px;border-top:1px solid #f1f5f9"><input class="lc-an-combo" data-chave="' + esc(chave) + '" data-campo="sku" value="' + esc(linha.sku || '') + '" style="width:100%;padding:5px 7px;border:1px solid var(--lc-border);border-radius:6px"></td>'
            + '<td style="padding:7px 10px;border-top:1px solid #f1f5f9"><input class="lc-an-combo" data-chave="' + esc(chave) + '" data-campo="estoque" value="' + esc(linha.estoque || '') + '" style="width:90px;padding:5px 7px;border:1px solid var(--lc-border);border-radius:6px"></td></tr>';
        }).join('')
        + '</tbody></table></div></div>';
    }

    return '<div class="lc-an-etapa">'
      + '<p style="font-size:13px;color:var(--lc-muted);margin:0 0 14px">Você decide quais variações existem. '
      + 'Sem variação nenhuma, o anúncio é simples.</p>'
      + linhas
      + '<button id="lcAnAddVar" style="border:1px solid var(--lc-primary);background:#fff;color:var(--lc-primary);border-radius:8px;padding:9px 14px;cursor:pointer;font-size:13px;font-weight:700">Adicionar variação</button>'
      + tabela
      + '</div>';
  }

  function etapaFotos() {
    var fotos = Array.isArray(estado.dados.fotos) ? estado.dados.fotos : [];
    return '<div class="lc-an-etapa">'
      + '<p style="font-size:13px;color:var(--lc-muted);margin:0 0 12px">Cole a URL das imagens, uma por linha. '
      + 'O envio direto de arquivo entra junto com os destinos, na próxima onda.</p>'
      + '<textarea id="lcAnFotos" rows="8" placeholder="https://..." '
      + 'style="width:100%;padding:9px 11px;border:1px solid var(--lc-border-2);border-radius:8px;font-size:13px;resize:vertical">'
      + esc(fotos.join('\n')) + '</textarea>'
      + '<div style="margin-top:14px;font-size:12px;color:var(--lc-muted);line-height:1.7">'
      + '<div style="font-weight:700;color:var(--lc-ink-2);margin-bottom:4px">Limites de cada canal</div>'
      + '<div>Shopee: 9 no produto e exatamente 1 por variação.</div>'
      + '<div>Mercado Livre: até 10 por variação, sem teto no produto.</div>'
      + '<div>TikTok Shop e Shein: 9 no produto.</div>'
      + '<div style="margin-top:6px">Você tem ' + fotos.length + ' no momento.</div>'
      + '</div></div>';
  }

  function etapaEmbalagem() {
    var d = estado.dados;
    return '<div class="lc-an-etapa">'
      + '<p style="font-size:13px;color:var(--lc-muted);margin:0 0 14px">Peso e medidas da caixa fechada. '
      + 'Nenhum marketplace pede isso como atributo de categoria, e é o dado que mais falta no catálogo hoje.</p>'
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
    var blocos = Object.keys(porCanal).sort().map(function (c) {
      // Ordem alfabética dentro do canal, e não a ordem de integração.
      var doCanal = porCanal[c].slice().sort(function (a, b) {
        return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
      });
      return '<div style="margin-bottom:16px">'
        + '<div style="font-size:12px;font-weight:800;color:var(--lc-ink-2);margin-bottom:8px">'
        + esc(NOMES[c] || c) + '</div>'
        + doCanal.map(function (l) {
          var id = l.lojaId || l.idBanco || l.id;
          return '<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--lc-border);border-radius:8px;margin-bottom:6px;cursor:pointer">'
            + '<input type="checkbox" class="lc-an-destino" data-loja="' + esc(id) + '"'
            + (marcado(id) ? ' checked' : '') + '>'
            + '<span style="font-size:14px;color:var(--lc-ink)">' + esc(l.nome || ('Loja ' + id)) + '</span>'
            + '</label>';
        }).join('')
        + '</div>';
    }).join('');

    return '<div class="lc-an-etapa">'
      + '<p style="font-size:13px;color:var(--lc-muted);margin:0 0 14px">'
      + 'Escolha todas as lojas de uma vez. O preço e o estoque são os mesmos para todas.</p>'
      + blocos
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
      corpo = '<button id="lcAnCarregarFicha" style="border:1px solid var(--lc-primary);background:#fff;color:var(--lc-primary);border-radius:8px;padding:9px 14px;cursor:pointer;font-size:13px;font-weight:700">Carregar os campos deste canal</button>';
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
    return '<div class="lc-an-etapa">'
      + '<div style="font-size:12px;font-weight:800;color:var(--lc-ink-2);margin-bottom:8px">O ANÚNCIO</div>'
      + resumo
      + '<div style="font-size:12px;font-weight:800;color:var(--lc-ink-2);margin:18px 0 8px">PARA ONDE VAI</div>'
      + destinos
      + (estado.envioErro
        ? '<div style="border:1px solid var(--lc-danger-soft);background:#fff;border-radius:8px;padding:10px 12px;margin:10px 0;font-size:13px;color:var(--lc-danger)">'
          + esc(estado.envioErro) + '</div>'
        : '')
      + '<button id="lcAnEnviar"' + (podeEnviar ? '' : ' disabled')
      + ' style="margin-top:14px;border:0;background:' + (podeEnviar ? 'var(--lc-primary)' : 'var(--lc-border-2)')
      + ';color:var(--lc-primary-text);border-radius:8px;padding:11px 20px;'
      + (podeEnviar ? 'cursor:pointer' : 'cursor:not-allowed') + ';font-size:14px;font-weight:700">'
      + (estado.enviando ? 'Enviando...' : 'Publicar nos destinos') + '</button>'
      + '<div style="font-size:11px;color:var(--lc-muted-2);margin-top:8px">'
      + 'Campo que o canal exige e está em branco não trava o envio. A recusa fica registrada aqui, com o motivo.'
      + '</div></div>';
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

  async function publicar() {
    estado.enviando = true;
    estado.envioErro = null;
    desenharEtapa();
    try {
      await salvar({ forcar: true });
      var produtoId = await garantirProdutoInterno();

      for (var i = 0; i < estado.destinos.length; i++) {
        var dest = estado.destinos[i];
        if (dest.resultado === 'publicado') continue;   // não republica o que já foi
        var resultado = 'recusado';
        var idExterno = null;
        var motivo = null;
        try {
          var r = await fetch(base() + '/api/marketplaces/loja/' + dest.lojaId + '/exportar/' + produtoId,
            { method: 'POST', headers: cabecalhos(), body: JSON.stringify({}) });
          var j = await r.json();
          if (j && j.ok) {
            resultado = 'publicado';
            idExterno = (j.dados && (j.dados.itemId || j.dados.id || j.dados.item_id)) || String(produtoId);
          } else {
            motivo = (j && j.erro) || ('O canal respondeu ' + r.status + '.');
            if (j && Array.isArray(j.detalhes) && j.detalhes.length) motivo += ' ' + j.detalhes.join(' ');
          }
        } catch (e) {
          motivo = e.message;
        }
        // ★ grava ANTES de seguir para a próxima loja
        try {
          var res = await chamar('/' + estado.rascunhoId + '/resultado', {
            metodo: 'POST',
            corpo: { lojaId: dest.lojaId, resultado: resultado, idExterno: idExterno, motivo: motivo },
          });
          estado.destinos = res.rascunho.destinos || estado.destinos;
        } catch (e) {
          // Não conseguir gravar o resultado é grave: sem ele o rascunho não
          // sabe o que já foi publicado e uma nova tentativa duplicaria.
          estado.envioErro = 'Publiquei em ' + dest.nome + ' mas não consegui registrar aqui: ' + e.message
            + '. Não tente de novo sem conferir a loja.';
          break;
        }
        desenharEtapa();
      }

      var publicados = estado.destinos.filter(function (x) { return x.resultado === 'publicado'; }).length;
      var recusados = estado.destinos.filter(function (x) { return x.resultado === 'recusado'; }).length;
      if (publicados && !recusados) toast('Publicado em ' + publicados + ' loja(s).');
      else if (publicados && recusados) toast('Publicado em ' + publicados + ', recusado em ' + recusados + '.');
      else if (recusados) toast('Nenhuma loja aceitou. Os motivos estão na lista.');
    } catch (e) {
      estado.envioErro = e.message;
    }
    estado.enviando = false;
    desenharEtapa();
  }

  function desenharEtapa() {
    var alvo = document.getElementById('lcAnCorpo');
    if (!alvo) return;
    if (estado.etapa === 'produto') alvo.innerHTML = etapaProduto();
    else if (estado.etapa === 'variacoes') alvo.innerHTML = etapaVariacoes();
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
    icones(alvo);
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

    var fotosEl = document.getElementById('lcAnFotos');
    if (fotosEl) {
      fotosEl.addEventListener('input', function () {
        estado.dados.fotos = fotosEl.value.split('\n')
          .map(function (x) { return x.trim(); }).filter(Boolean);
        marcarSujo();
      });
    }

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
    var carregarFicha = document.getElementById('lcAnCarregarFicha');
    if (carregarFicha) {
      carregarFicha.addEventListener('click', async function () {
        buscandoFicha = true;
        desenharEtapa();
        try { await buscarFicha(estado.canalAba); }
        catch (e) { avisar(e.message); }
        buscandoFicha = false;
        desenharEtapa();
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
    if (enviar && !enviar.disabled) enviar.addEventListener('click', publicar);

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
        estado.dados[campo === 'titulo' ? 'nome' : campo] = el.dataset.valor;
        delete estado.sugestoes[campo];
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
        delete cacheFichas[estado.canalAba];
        marcarSujo();
        desenharEtapa();
      });
    });

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
        var nome = c.caminho || c.nome || c.name || id;
        return '<button class="lc-an-escolher-cat" data-cat="' + esc(id) + '" '
          + 'style="display:block;width:100%;text-align:left;border:1px solid var(--lc-border);background:#fff;'
          + 'border-radius:8px;padding:7px 10px;margin-bottom:5px;cursor:pointer;font-size:13px;color:var(--lc-ink)">'
          + esc(nome) + '</button>';
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
  async function sugerir(campo, extra) {
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
      + '<button id="lcAnSalvar" style="border:0;background:var(--lc-primary);color:#fff;border-radius:8px;padding:9px 18px;cursor:pointer;font-size:13px;font-weight:700">Salvar rascunho</button>'
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
        estado.etapa = r.rascunho.etapa || 'produto';
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
    document.getElementById('lcAnSalvar').addEventListener('click', async function () {
      estado.sujo = true;
      await salvar({ forcar: true });
      if (!estado.erro) { toast('Rascunho salvo.'); fechar(); }
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
    _estado: function () { return estado; },
    ETAPAS: ETAPAS,
  };
})();
