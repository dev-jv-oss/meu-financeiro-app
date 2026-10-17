# Continuação da auditoria — candidata 1.9.2

## Entregue para revisão

- IndexedDB separado do armazenamento legado, com operações imutáveis, UUID persistido, vínculo com titular Google validado no servidor e origem da API.
- Preparação explícita em Ajustes → Fila local de preparação. Apenas registros novos do formulário rápido desta candidata são elegíveis. Contas D1 escolhidas explicitamente; cartões, registros em revisão, cofrinhos e investimentos não entram nesta fila.
- Preparar mantém o registro original e guarda uma cópia. Não cria uma movimentação no D1. Edição/exclusão individual do original preparado fica bloqueada; falha ao consultar a fila bloqueia a alteração.
- Exportação da fila do titular separada do backup dos registros/cadastros locais. Não há restauração automática da fila. Guardar ambos antes de qualquer teste no aparelho.
- Motor de sincronização isolado, sem ligação com botões ou tarefas automáticas. Exige dois parâmetros booleanos de liberação, ambos falsos por padrão. Nenhum fluxo da interface chama esse motor.
- Retentativas consultam o resultado da mesma chave antes de reenviar o mesmo payload. Lease transacional reduz disputa entre abas; resposta antiga não sobrescreve tentativa nova. Confirmação incompleta não conclui a operação.
- `/api/me` retorna o identificador autenticado do titular. `/api/balances` é somente leitura: separa variação do livro e confirmações externas; mantém confirmações concorrentes e retorna saldo conciliado nulo. Não soma um snapshot ao histórico inteiro.
- Novo cache 1.9.2 inclui os módulos necessários à preparação offline. Não ativa por cima de uma sessão antiga nem apaga caches antigos.

## Evidência

`npm ci --ignore-scripts`, `npm run check` e `npm test`: **39 testes passaram**, incluindo os 24 testes anteriores. Log em `docs/evidence/offline-tests.txt`.

Os testes novos cobrem persistência/reabertura, identidade, conflito de payload, abas concorrentes, lease expirado, perda de resposta, consulta de recuperação indisponível, reenvio com mesma chave, troca de titular, origem diferente, resposta incompleta, falha de armazenamento, elegibilidade, preparação via interface simulada sem POST financeiro e isolamento de saldos.

IndexedDB usa fake-indexeddb 6.2.6; DOM e cache são simulados; backend usa SQLite local e assinatura RSA de teste. Isso não comprova comportamento real do Chrome/S24 FE, quota/evicção do Android, instalação PWA nem D1 remoto. Nenhum teste gravou dados financeiros reais.

## Pendências antes de liberar sincronização

1. Homologação isolada autorizada, com contas fictícias, para validar navegador real, autenticação, crash, expiração de token e atualização entre versões.
2. Definir recuperação/restauração de fila, retificação e conciliação após alterações/restauração do backup legado; não habilitar o motor antes disso.
3. Validar seleção de contas e perda de conectividade no S24 FE. A preparação precisa de sessão validada e catálogo D1; não promete cadastro offline sem login ou catálogo.
4. Concluir conciliação contábil, importação histórica idempotente com revisão humana dos conflitos, cartões e lotes. O endpoint não apresenta saldo disponível bancário.
5. Só após evidências e autorização explícita: integrar e habilitar o envio. Merge, deploy e flags de escrita continuam bloqueados por escopo.

Não desinstalar a PWA, limpar dados, importar backup por cima da instalação atual ou executar migrações durante esta revisão. A interface de restauração legada ainda exige validação específica e não restaura IndexedDB.
