/* ═══════════════════════════════════════════════════════════════════════
   livia-site.js  ·  O QUE TODA PAGINA DO SITE EXECUTA  (v33k.3175)
   ───────────────────────────────────────────────────────────────────────
   DUAS COISAS, nesta ordem: o MENU DO CELULAR e a LIVIA. Entraram no
   mesmo arquivo porque ele e o unico script que as 15 paginas carregam,
   e o porque de cada uma esta no comeco da sua propria funcao.
   ───────────────────────────────────────────────────────────────────────
   Saiu de dentro do index.html nesta leva, quando as paginas de recurso
   comecaram. Ate aqui existia uma pagina so, e ele cabia la dentro.

   ★★★★ E A FOLHA DA CONVERSA PASSOU A SER MONTADA AQUI, em vez de viver
     no HTML de cada pagina. Com vinte paginas, a marcacao copiada vinte
     vezes garante que uma delas vai ficar para tras numa mudanca, e o
     sintoma seria o chat quebrado em UMA pagina, que e justamente o tipo
     de defeito que ninguem encontra. A pagina so precisa ter a caixa de
     pergunta (`#pergForm`); o resto ele cria.

   ★★★ O HISTORICO VEM DO BANCO, nunca do corpo da requisicao. Aceitar o
     historico que o navegador manda deixaria qualquer um escrever as
     falas anteriores "da Livia" e, por elas, o que ela ja teria
     prometido. Quem responde e a rota publica `/api/site/chat`.

   ★★ O `localStorage` PODE SIMPLESMENTE NAO EXISTIR. Aba anonima,
     cookies bloqueados, navegador de dentro de aplicativo: ler ou
     escrever ali LANCA, nao devolve vazio. Tudo embrulhado, e sem ele a
     conversa funciona igual, so nao sobrevive ao F5.

   ★ O QUE CHEGA DO SERVIDOR E TEXTO, E VIRA HTML AQUI. Entao ele e
     ESCAPADO ANTES, sempre, e so depois os poucos marcadores (negrito,
     lista, paragrafo) viram marcacao. Na ordem inversa, uma resposta com
     um sinal de menor dentro vira markup na pagina.
   ══════════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════
   ★★★★★ O MENU DO CELULAR  (v33k.3175)
   ───────────────────────────────────────────────────────────────────────
   ★★★★ POR QUE ELE MORA NESTE ARQUIVO, que é o da Lívia. Porque este é o
     ÚNICO script que as 15 páginas carregam: a home, a página-índice de
     recursos e as 14 páginas de funcionalidade. Arquivo novo em assets/
     seria um quarto arquivo para subir à mão e uma tag <script> para
     acrescentar em 15 páginas — e a página que ficasse para trás numa
     leva perderia o menu no celular sem ninguém notar, que é exatamente
     o defeito que acabou de ser consertado.

   ★★★ É UMA FUNÇÃO SEPARADA, DE PROPÓSITO, e vem ANTES da Lívia. A da
     Lívia começa com `if (!form) return` para a página sem caixa de
     pergunta sair cedo; menu dentro dela morreria nesse return no dia em
     que uma página sem chat existir. São duas coisas no mesmo arquivo,
     não uma coisa só.

   ★★ O MESMO VOCABULÁRIO DA FOLHA DA LÍVIA, logo abaixo: Escape fecha,
     clique fora fecha, e o estado é uma classe no elemento, não uma
     variável que a tela tem de adivinhar. Padrão que já existe na casa.

   ★ E FECHA AO TOCAR NUM LINK, que é o detalhe sem o qual o menu fica
     errado na home: ali metade dos itens é âncora da mesma página
     (#integracoes, #precos), a página rola por baixo e o painel ficaria
     aberto tapando justamente o que a pessoa foi ver.
   ══════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var cabeca = document.getElementById('topo');
  var botao  = document.getElementById('menuBtn');
  var menu   = cabeca && cabeca.querySelector('.nav');
  if (!cabeca || !botao || !menu) return;

  var aberto = false;

  function marcar(){
    cabeca.classList.toggle('menu-aberto', aberto);
    botao.setAttribute('aria-expanded', aberto ? 'true' : 'false');
  }
  function abrir(){  if (!aberto){ aberto = true;  marcar(); } }
  function fechar(){ if (aberto){  aberto = false; marcar(); } }

  botao.addEventListener('click', function(ev){
    ev.stopPropagation();
    if (aberto) fechar(); else abrir();
  });

  /* Clique dentro do painel não fecha por si: quem fecha é o link, logo
     abaixo. Sem este `stopPropagation`, o clique subiria até o document
     e o fechamento de "clique fora" dispararia no clique de dentro. */
  menu.addEventListener('click', function(ev){ ev.stopPropagation(); });

  Array.prototype.slice.call(menu.querySelectorAll('a')).forEach(function(a){
    a.addEventListener('click', fechar);
  });

  document.addEventListener('click', fechar);
  document.addEventListener('keydown', function(ev){ if (ev.key === 'Escape') fechar(); });

  /* ★ Girar o aparelho ou abrir o teclado muda a largura. Passando de
     1040px o painel volta a ser a barra do desktop pelo CSS, e a classe
     ficaria pendurada: ao voltar para o retrato, o menu reapareceria
     aberto sozinho. */
  window.addEventListener('resize', function(){
    if (window.innerWidth > 1040) fechar();
  });
})();

(function(){
  'use strict';

  var FOLHA = '<div class="lcc-veu" id="lccVeu" role="dialog" aria-modal="true" aria-label="Conversa com a Lívia">'
    + '  <div class="lcc">'
    + '    <div class="lcc-topo">'
    + '      <div class="lcc-ava" aria-hidden="true">L</div>'
    + '      <div class="lcc-quem">'
    + '        <div class="lcc-nome">Lívia</div>'
    + '        <div class="lcc-sub">Tira dúvidas sobre o Lider 10</div>'
    + '      </div>'
    + '      <button type="button" class="lcc-fechar" id="lccFechar" aria-label="Fechar conversa">'
    + '        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>'
    + '      </button>'
    + '    </div>'
    + '    <div class="lcc-fio" id="lccFio" aria-live="polite"></div>'
    + '    <div class="lcc-pe">'
    + '      <form class="lcc-caixa" id="lccForm" autocomplete="off">'
    + '        <label for="lccInput" class="sr-so">Escreva a sua pergunta</label>'
    + '        <input id="lccInput" type="text" maxlength="400" placeholder="Escreva a sua pergunta">'
    + '        <button type="submit" aria-label="Enviar">'
    + '          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
    + '        </button>'
    + '      </form>'
    + '      <p class="lcc-rodape">Respostas geradas por IA. Para falar com uma pessoa, chame no <a id="lccWa" href="#" target="_blank" rel="noopener">WhatsApp</a>.</p>'
    + '    </div>'
    + '  </div>'
    + '</div>';

  // A caixa de pergunta e o unico pre-requisito. Pagina sem ela nao tem
  // chat, e isso nao e erro: e uma pagina que nao convida a perguntar.
  var form = document.getElementById('pergForm');
  if (!form) return;

  // A folha entra uma vez por pagina, no fim do body, longe de qualquer
  // elemento posicionado que pudesse prende-la num contexto de empilhamento.
  if (!document.getElementById('lccVeu')) {
    var caixa = document.createElement('div');
    caixa.innerHTML = FOLHA;
    while (caixa.firstChild) document.body.appendChild(caixa.firstChild);
  }

  var API = 'https://api.painel.lidercommerce.com.br/api/site/chat';
  var WA  = '5537991960195';
  var CHAVE = 'lc_visitante';
  var ESPERA = 45000;

  var campo  = document.getElementById('pergInput');
  var veu    = document.getElementById('lccVeu');
  var fio    = document.getElementById('lccFio');
  var fForm  = document.getElementById('lccForm');
  var fCampo = document.getElementById('lccInput');
  if (!form || !veu || !fio) return;

  var waLink = document.getElementById('lccWa');
  if (waLink) waLink.href = 'https://wa.me/' + WA;

  /* ── quem é esta pessoa, só para o fio continuar ───────────────────── */
  var visitante = null;
  function sorteado(){
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    } catch (e) {}
    return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function quemSou(){
    if (visitante) return visitante;
    try {
      visitante = window.localStorage.getItem(CHAVE);
      if (!visitante) {
        visitante = sorteado();
        window.localStorage.setItem(CHAVE, visitante);
      }
    } catch (e) {
      /* sem armazenamento: vale só nesta visita, e está bom */
      visitante = visitante || sorteado();
    }
    return visitante;
  }

  /* ── texto para HTML, nesta ordem ──────────────────────────────────── */
  function esc(t){
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function enfeitar(t){
    var linhas = esc(t).split('\n');
    var saida = [], lista = null, paragrafo = [];
    function fechaP(){
      if (paragrafo.length){ saida.push('<p>' + paragrafo.join('<br>') + '</p>'); paragrafo = []; }
    }
    function fechaL(){
      if (lista){ saida.push('<ul>' + lista.join('') + '</ul>'); lista = null; }
    }
    for (var i = 0; i < linhas.length; i++){
      var l = linhas[i].trim();
      if (!l){ fechaL(); fechaP(); continue; }
      var item = l.match(/^[-*•]\s+(.*)$/);
      if (item){
        fechaP();
        if (!lista) lista = [];
        lista.push('<li>' + negrito(item[1]) + '</li>');
        continue;
      }
      fechaL();
      paragrafo.push(negrito(l));
    }
    fechaL(); fechaP();
    return saida.join('') || '<p>' + negrito(esc(t)) + '</p>';
  }
  function negrito(t){
    return String(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  }

  /* ── a folha ───────────────────────────────────────────────────────── */
  var aberta = false, ocupado = false, voltarFoco = null;

  function abrir(){
    if (aberta) return;
    voltarFoco = document.activeElement;
    veu.classList.add('aberta');
    document.body.style.overflow = 'hidden';
    aberta = true;
    setTimeout(function(){ try { fCampo.focus(); } catch (e) {} }, 60);
  }
  function fechar(){
    if (!aberta) return;
    veu.classList.remove('aberta');
    document.body.style.overflow = '';
    aberta = false;
    try { if (voltarFoco && voltarFoco.focus) voltarFoco.focus(); } catch (e) {}
  }

  function rolar(){ fio.scrollTop = fio.scrollHeight; }

  function dizer(quem, texto){
    var d = document.createElement('div');
    d.className = 'lcc-msg ' + (quem === 'eu' ? 'de-quem' : 'dela');
    if (quem === 'eu') d.textContent = texto;
    else d.innerHTML = enfeitar(texto);
    fio.appendChild(d);
    rolar();
    return d;
  }

  function pensando(){
    var d = document.createElement('div');
    d.className = 'lcc-pensando';
    d.innerHTML = '<i></i><i></i><i></i>';
    fio.appendChild(d);
    rolar();
    return d;
  }

  /* ★ As frases de falha não citam rede, servidor nem rota: quem está na
     home não sabe o que é isso, e não precisa saber. */
  var FALA_REDE = 'Não foi possível completar o envio agora. Tente de novo em instantes, '
    + 'ou chame no WhatsApp (37) 99196-0195 que a gente responde por lá.';

  function perguntar(texto){
    if (ocupado) return;
    var t = String(texto || '').trim();
    if (!t) return;
    ocupado = true;
    dizer('eu', t);
    var bolhas = pensando();

    var abortar = null, caiu = false;
    try { abortar = new AbortController(); } catch (e) { abortar = null; }
    var relogio = setTimeout(function(){
      caiu = true;
      try { if (abortar) abortar.abort(); } catch (e) {}
    }, ESPERA);

    var opcoes = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitante: quemSou(), pergunta: t })
    };
    if (abortar) opcoes.signal = abortar.signal;

    fetch(API, opcoes)
      .then(function(r){ return r.json(); })
      .then(function(d){
        clearTimeout(relogio);
        try { fio.removeChild(bolhas); } catch (e) {}
        dizer('ela', (d && d.resposta) ? d.resposta : FALA_REDE);
        ocupado = false;
        try { fCampo.focus(); } catch (e) {}
      })
      .catch(function(){
        clearTimeout(relogio);
        try { fio.removeChild(bolhas); } catch (e) {}
        dizer('ela', FALA_REDE);
        ocupado = false;
      });
  }

  /* ── os caminhos de entrada ────────────────────────────────────────── */
  form.addEventListener('submit', function(ev){
    ev.preventDefault();
    var t = campo.value.trim();
    if (!t) { campo.focus(); return; }
    campo.value = '';
    pronto();
    abrir();
    perguntar(t);
  });

  Array.prototype.slice.call(document.querySelectorAll('.perg-sug')).forEach(function(c){
    c.addEventListener('click', function(){
      abrir();
      perguntar(c.getAttribute('data-perg') || c.textContent);
    });
  });

  /* O botao de enviar so fica verde quando ha o que enviar. Verde cheio numa
     caixa vazia pede um clique que nao leva a lugar nenhum, e a pessoa que
     clica e descobre isso nao clica de novo. */
  var btnEnviar = form.querySelector('.perg-enviar');
  function pronto(){
    if (btnEnviar) btnEnviar.classList.toggle('pronto', campo.value.trim().length > 0);
  }
  campo.addEventListener('input', pronto);
  pronto();

  fForm.addEventListener('submit', function(ev){
    ev.preventDefault();
    var t = fCampo.value.trim();
    if (!t) return;
    fCampo.value = '';
    perguntar(t);
  });

  var btnFechar = document.getElementById('lccFechar');
  if (btnFechar) btnFechar.addEventListener('click', fechar);
  veu.addEventListener('click', function(ev){ if (ev.target === veu) fechar(); });
  document.addEventListener('keydown', function(ev){ if (ev.key === 'Escape') fechar(); });
})();