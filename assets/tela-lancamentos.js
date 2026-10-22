// ══════════════════════════════════════════════════════════════════
// ARQUIVO GERADO por ferramentas/minificar-painel.js. NAO EDITE.
// A fonte legivel e o trecho marcado TELA-EM-ARQUIVO dentro de
// painel-fonte/index-fonte.html, com os comentarios de decisao.
// ESTE ARQUIVO TEM DE SUBIR JUNTO COM O index.html da mesma leva.
// ══════════════════════════════════════════════════════════════════
window.LC_TELA_LANCAMENTOS_LEVA = "1cce0608e839";
function changeFilterMonth(e){if(null===currentMonthFilter)currentMonthFilter={mes:mesAtual,ano:anoAtual};else{let t=currentMonthFilter.mes+e,r=currentMonthFilter.ano;t<0&&(t=11,r--),t>11&&(t=0,r++),currentMonthFilter={mes:t,ano:r}}updateMonthFilterLabel(),renderAllTxList()}function clearMonthFilter(){currentMonthFilter=null,updateMonthFilterLabel(),renderAllTxList()}function toggleTxSort(){txSortOrder="recentes"===txSortOrder?"antigas":"recentes";const e=document.getElementById("sortToggleLabel");e&&(e.textContent="recentes"===txSortOrder?"Mais recentes ↓":"Mais antigas ↑"),renderAllTxList()}function setFilter(e,t){currentFilter=e,document.querySelectorAll(".filter-chip").forEach(e=>e.classList.remove("active")),t.classList.add("active"),renderAllTxList()}function changeAnnualYear(e){annualYear+=e,renderAnnualChart()}