# Proposta de PR — revisão em rascunho

Título: Protege dados locais e endurece API/cache com auditoria e testes

A candidata atual pode sobrescrever dados após falha de leitura, misturar versões offline e alterar saldos de cofrinhos sem atualizar lotes. Esta proposta importa as candidatas frontend/API para revisão e corrige essas falhas antes de qualquer liberação financeira.

Inclui proteção de armazenamento legado, cache por versão, recuperação idempotente autenticada, validações de investimento, bloqueio de movimentações incompletas de cofrinho e ferramentas puras de dry-run/conciliação. Preserva a chave local e não habilita gravações reais.

Validação inicial: 24 testes Node passaram; dez cenários de backend aplicados à API original reproduziram quatro falhas. SQLite transacional em memória, RSA real com chaves fictícias, DOM e cache simulados. Navegador real/S24 FE e Cloudflare D1 real não foram validados. Os scripts históricos não foram fornecidos.

Pendências de bloqueio: integração e validação real da fila por titular, saldos reconciliados, migração, cartões, lotes/resgates e E2E. Não aprovar para produção. Não fazer merge/deploy sem autorização.

Após o bloqueio inicial, o usuário autorizou explicitamente o envio SOMENTE da branch e abertura de PR em rascunho. Merge, deploy e gravações reais continuam proibidos.

Complemento: oito suítes dos Apps Script anexados passaram localmente com serviços externos bloqueados. Fontes privadas não incluídas no repositório público. Worker colado indica v0.2; pacote contém v0.3. Confirmar versão implantada antes de qualquer piloto.

Continuação 1.9.2: fila IndexedDB por titular/origem com preparação explícita sem transmissão, testes de falha/retentativa e consulta de saldos sem falsa conciliação. Total atual: **39 testes passaram**. Consulte `docs/FILA-OFFLINE.md` para limites e evidências.
