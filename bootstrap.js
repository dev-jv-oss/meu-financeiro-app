/** Inicializador resistente a versões incompatíveis do cache. Não acessa nem altera os dados locais. */
(async () => {
  try {
    await import('./app.js?v=1.8.0');
  } catch (error) {
    console.error('Meu Financeiro: falha ao iniciar (v1.8.0)', error);
    const main = document.querySelector('#main');
    if (main) main.innerHTML = `<div class="page-intro"><h1 class="heading">Não foi possível carregar o aplicativo</h1><p class="lede">Um arquivo da atualização não foi carregado corretamente.</p></div><div class="card"><p><strong>Seus dados locais não foram apagados.</strong></p><p>Confirme sua conexão e atualize a página. Se persistir, envie uma captura desta mensagem para corrigirmos o erro. Não desinstale o aplicativo nem limpe os dados do site.</p><p class="small muted">Versão de inicialização: 1.8.0</p></div>`;
  }
})();
