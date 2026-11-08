/* ══════════════════════════════════════════════════════════════════════
   pagamento-site.js  ·  A CONTRATACAO NAS PAGINAS DE OFERTA  (leva 2)
   ──────────────────────────────────────────────────────────────────────
   Serve /dropshipping/ e /agencia/. As duas cobram implementacao do
   mesmo jeito, entao o formulario e um so.

   ★★★★ O PIX ESTA LIGADO (v33k.3294). O formulario pede o QR Code a
     `/api/site/cobranca`, que devolve a imagem e o copia e cola. O VALOR
     NAO VAI DAQUI: a rota le o preco da tabela dela a partir do nome da
     oferta, porque esta pagina e publica e qualquer pessoa consegue
     editar o que o navegador manda.
     Se a rota falhar por qualquer motivo, o caminho velho continua
     inteiro logo abaixo: a pessoa cai no WhatsApp com os dados escritos,
     e a venda nao se perde porque uma chamada deu errado.

   ★★★ SE ESTE SCRIPT NAO RODAR, A PAGINA CONTINUA VENDENDO. O botao do
     WhatsApp dentro do quadro e um link de verdade, escrito no HTML, que
     funciona sem script nenhum. Este arquivo so melhora o caminho; ele
     nao e requisito para a pessoa conseguir falar com a gente.

   ★★ O QUE A PESSOA LE NUNCA E LINGUAGEM NOSSA. Nada de nome de rota,
     de erro cru nem de peca interna na tela. O detalhe fica no console,
     para quando ele for conferir.

   ★ O VALOR NAO VEM DA TELA. Quem manda e o `data-valor` do formulario,
     e na leva do Pix quem confere de verdade e o sistema. Campo de tela
     e sugestao, nunca a fonte do preco.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var LIGADO   = true;   /* v33k.3294: o Pix esta de pe */
  var ENDERECO = 'https://api.painel.lidercommerce.com.br/api/site/cobranca';
  var ZAP      = '5537991960195';

  var form = document.getElementById('contratarForm');
  if (!form) return;

  var oferta = form.getAttribute('data-oferta') || '';
  var rotulo = form.getAttribute('data-rotulo') || 'a implementação';
  var valor  = form.getAttribute('data-valor')  || '';
  var quadro = document.getElementById('qrQuadro');
  var botao  = form.querySelector('button[type="submit"]');

  function limpo(v) { return String(v || '').replace(/\D+/g, ''); }

  /* ── conferencia dos campos ─────────────────────────────────────── */
  var REGRAS = {
    nome:     function (v) { return v.trim().length >= 3 || 'Escreva o seu nome completo.'; },
    empresa:  function (v) { return v.trim().length >= 2 || 'Escreva o nome da empresa.'; },
    documento:function (v) {
      var n = limpo(v);
      return (n.length === 11 || n.length === 14) || 'Confira o CPF ou o CNPJ.';
    },
    whatsapp: function (v) {
      var n = limpo(v);
      return (n.length === 10 || n.length === 11) || 'Confira o WhatsApp, com o DDD.';
    },
    email:    function (v) { return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v.trim()) || 'Confira o e-mail.'; }
  };

  function avisa(campo, recado) {
    var alvo = form.querySelector('[name="' + campo + '"]');
    if (!alvo) return;
    var caixa = alvo.parentNode.querySelector('.dp-erro');
    if (caixa) caixa.textContent = recado || '';
    if (recado) { alvo.setAttribute('aria-invalid', 'true'); }
    else { alvo.removeAttribute('aria-invalid'); }
  }

  function confere() {
    var dados = {}, primeiroErro = null;
    Object.keys(REGRAS).forEach(function (campo) {
      var alvo = form.querySelector('[name="' + campo + '"]');
      var v = alvo ? alvo.value : '';
      var r = REGRAS[campo](v);
      if (r === true) { avisa(campo, ''); dados[campo] = v.trim(); }
      else { avisa(campo, r); if (!primeiroErro) primeiroErro = alvo; }
    });
    if (primeiroErro) { primeiroErro.focus(); return null; }
    return dados;
  }

  /* limpa o aviso assim que a pessoa corrige, em vez de deixar vermelho */
  Object.keys(REGRAS).forEach(function (campo) {
    var alvo = form.querySelector('[name="' + campo + '"]');
    if (alvo) alvo.addEventListener('input', function () { avisa(campo, ''); });
  });

  /* ── o caminho de hoje: WhatsApp com os dados ja escritos ───────── */
  function peloWhats(d) {
    var texto =
      'Olá! Quero contratar ' + rotulo + ' do Lider 10.' +
      '\n\nNome: ' + d.nome +
      '\nEmpresa: ' + d.empresa +
      '\nCPF ou CNPJ: ' + d.documento +
      '\nWhatsApp: ' + d.whatsapp +
      '\nE-mail: ' + d.email +
      (valor ? '\nValor: ' + valor : '');
    window.open('https://wa.me/' + ZAP + '?text=' + encodeURIComponent(texto), '_blank', 'noopener');
  }

  /* ── o caminho da leva 4: o QR Code vindo do sistema ────────────── */
  function peloPix(d) {
    botao.disabled = true;
    var antes = botao.textContent;
    botao.textContent = 'Gerando o código...';

    fetch(ENDERECO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oferta: oferta, cliente: d })
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (j) {
        if (!j || !j.imagem || !/^data:image\/|^https:\/\//.test(j.imagem)) {
          return Promise.reject('resposta sem imagem');
        }
        var img = document.createElement('img');
        img.src = j.imagem;
        img.alt = 'QR Code do Pix para pagar ' + rotulo;

        var texto = document.createElement('p');
        texto.className = 'dp-qr-texto';
        texto.textContent = 'Abra o aplicativo do seu banco, escolha pagar com Pix e aponte a câmera para o código.';

        quadro.innerHTML = '';
        quadro.appendChild(img);
        quadro.appendChild(texto);

        /* ★ O COPIA E COLA, para quem esta no computador e nao tem como
           apontar a camera para a propria tela. E o caminho que a maioria
           usa no desktop, e sem ele o QR sozinho trava essa pessoa. */
        if (j.copiaECola) {
          var copiar = document.createElement('button');
          copiar.type = 'button';
          copiar.className = 'btn btn-linha';
          copiar.style.marginTop = '14px';
          copiar.textContent = 'Copiar o código do Pix';
          copiar.addEventListener('click', function () {
            var ok = function () { copiar.textContent = 'Código copiado'; };
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(j.copiaECola).then(ok, function () { manual(); });
            } else { manual(); }
            function manual() {
              var a = document.createElement('textarea');
              a.value = j.copiaECola;
              a.setAttribute('readonly', '');
              a.style.position = 'absolute'; a.style.left = '-9999px';
              document.body.appendChild(a); a.select();
              try { document.execCommand('copy'); ok(); }
              catch (e) { copiar.textContent = 'Selecione e copie o código'; }
              document.body.removeChild(a);
            }
          });
          quadro.appendChild(copiar);
        }
      })
      .catch(function (e) {
        if (window.console) console.warn('[pagamento] ' + e);
        quadro.innerHTML =
          '<p class="dp-qr-texto">Não foi possível gerar o código de pagamento agora. ' +
          'Fale com a gente pelo WhatsApp e concluímos por lá.</p>' +
          '<a class="btn btn-acao" style="margin-top:14px" target="_blank" rel="noopener" ' +
          'href="https://wa.me/' + ZAP + '">Falar no WhatsApp</a>';
      })
      .then(function () { botao.disabled = false; botao.textContent = antes; });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var d = confere();
    if (!d) return;
    if (LIGADO) peloPix(d); else peloWhats(d);
  });
})();
