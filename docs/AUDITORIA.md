# Auditoria técnica — Meu Financeiro

Data: 17/10/2026. **Não aprovado para produção nem gravações financeiras reais.**
Base GitHub: `4c00323114ceb9a04a3002a83c2a18fa46161d2e` (frontend 1.8).
Insumos adicionais: candidata frontend 1.9, API D1 0.3 e esquema SQL v1.
Branch proposta: `audit/integridade-offline-2026-10-17`.

## Conclusão

A arquitetura tem bons fundamentos: autenticação verificada no servidor, valores em centavos, partidas equilibradas, chaves de idempotência por usuário e gravação em lote. Porém, ainda existem dois sistemas de informação independentes: posições/registros locais e D1. O app não pode ser tratado como livro financeiro confiável enquanto a fila, o vínculo entre contas, a conciliação e a migração não forem concluídos e validados no ambiente real autorizado.

Este ciclo corrige falhas de preservação local, cache, validação e recuperação de resultados. Não entrega sincronização financeira completa. O fato de os testes passarem não elimina os bloqueios abaixo.

## Escopo e limites da evidência

- Revisão de todos os módulos frontend, Worker candidato, esquema SQL, logs e documento de continuidade; comparação com clone do GitHub.
- Inspeção somente leitura da estrutura da planilha histórica e de intervalos selecionados. Dados financeiros e IDs privados não foram copiados para este repositório público.
- Os scripts históricos `test_worker.mjs` e `test_front.mjs` NÃO estavam nos ZIPs nem no repositório. Seus logs foram lidos, mas não é possível reproduzir literalmente as 56 verificações sem esses scripts.
- Criada nova suíte de 24 testes, sem dependências externas, em Node 24.19.0. O cenário antigo de quatro transações foi reconstruído a partir do contrato do Worker e produziu os mesmos saldos fictícios: 3500, 2000 e 1000 centavos.
- SQLite em memória com adaptador D1 e transações locais; assinatura RSA real com chaves exclusivamente de teste. Chamadas ao Google substituídas por JWKS de teste. Nenhum token real usado.
- Concorrência testada por chamadas assíncronas no mesmo processo. Não prova concorrência distribuída no Cloudflare nem consistência de réplicas.
- Frontend executado com DOM simplificado; service worker com Cache API simulada. NÃO são testes visuais nem navegador Android.
- Chromium não estava instalado; tentativa de instalação falhou com arquivo ZIP inválido/truncado. E2E visual e S24 FE continuam pendentes.
- Nenhuma chamada de escrita a Worker/D1/Sheets/WhatsApp, nenhuma migração aplicada, nenhum deploy ou alteração de main.

## Arquitetura observada

| Camada | Responsabilidade atual | Lacuna |
|---|---|---|
| index/bootstrap/app | PWA estática; formulários e interface | app.js monolítico e fluxos locais diferentes |
| parser/operacoes | Interpretação e validação de registros locais | Cartão e investimento ainda sem contrato oficial completo |
| catalogo/rendimentos | Posições manuais e estimativas a partir de lotes | Não conciliam automaticamente com D1; estimativa não é crédito |
| localStorage | Registros, cadastros, posições, configurações | Sem transação entre abas; sem vínculo de titularidade Google |
| api.mjs | Google GIS e Bearer token em memória | Login não significa sincronização; expiração depende da próxima consulta |
| Worker | JWT RS256, allowlist, validação, rotas autenticadas | Rotação JWKS desconhecida, limites operacionais e paginação pendentes |
| D1 | Usuários, contas, transações, partidas, lotes, referências externas | Âncoras e estornos não implementados como fluxo completo |
| Service worker | Shell offline | Atualização de v1.8 para nova versão precisa teste real |
| Planilha histórica | Evidências, histórico e projeções | Várias representações do mesmo fato; não importar todas como movimentos |

## Riscos priorizados

| ID | Prioridade | Evidência e consequência | Tratamento |
|---|---|---|---|
| A01 | P0 | `load()` capturava erro e devolvia estado vazio; próximo persist sobrescreveria bytes originais | Corrigido: estado protegido, gravação bloqueada e exportação dos bytes originais |
| A02 | P0 | Duas abas mantêm cópias independentes do JSON | Mitigado: rejeita estado salvo por outra aba; corrida simultânea entre processos ainda exige IndexedDB/Web Locks |
| A03 | P0 | `saveQuick` salva localmente; `syncRecord` não transmite | Pendente: fila durável por usuário e operação; não habilitar writes |
| A04 | P0 | Home calcula posições manuais, não partidas D1; contas locais usam nomes | Pendente: mapeamento explícito ID local → ID D1 e contrato de saldo conciliado |
| A05 | P0 | Base confirmada + histórico podem duplicar saldo; data civil não ordena eventos dentro do mesmo dia | Utilitário puro de conciliação: exclui anteriores, exige classificação do mesmo dia; não integrado à UI/D1 |
| A06 | P0 | Rotas pocket alteravam ledger sem atualizar lotes | Corrigido por bloqueio dessas rotas até implementar lotes atomicamente. Aporte inicial de produto continua no contrato de testes |
| A07 | P0 | Resgate local não diminui lote usado na projeção | Mitigado: suspende projeção após resgate identificado por ID e exibe posição confirmada; lotes legados sem vínculo ainda precisam revisão |
| A08 | P0 | Planilha contém sobreposição de IDs, reclassificações, parcelas e rendimentos estimados | Dry-run sem writes; nenhuma deduplicação destrutiva ou importação automática |
| A09 | P1 | SW network-first + skipWaiting podia misturar HTML/módulos e interromper cliente antigo | Novo shell cache-first, instalação exige módulos, sem skipWaiting; não apaga caches anteriores |
| A10 | P1 | `validateDate` rejeitava vencimento futuro de investimento | Corrigido: vencimento valida calendário e ordem; data efetiva continua não futura |
| A11 | P1 | Regex permitia IR fixo 100.1 | Corrigido: limite numérico ≤100; teste de limite |
| A12 | P1 | Resultado idempotente só consultável em rota HML com flag ativa | Nova consulta autenticada `/api/operation-result`, sem mutação, disponível com writes desligados |
| A13 | P1 | CORS só removia cabeçalho, não bloqueava Origin divergente | Rejeição explícita antes do bootstrap; JWT continua obrigatório, CORS não é autenticação |
| A14 | P1 | Cliente podia aceitar resposta 200 sem JSON como objeto de erro | Resposta inválida agora lança erro; redirects bloqueados; aviso de timeout não manda recriar operação |
| A15 | P1 | Datas do frontend dependiam do fuso do aparelho e backend de UTC | Padronizadas datas efetivas em America/Porto_Velho, compatível com planilha |
| A16 | P1 | LIMIT 100 nas transações sem cursor ou indicador de completude | Pendente: paginação estável e consulta de integridade completa |
| A17 | P1 | Cadastro de conta verifica nome antes do batch sem unicidade de nome no SQL | Corrida com chaves distintas ainda possível; migração de índice exige levantamento prévio de duplicatas |
| A18 | P1 | Integridade SQL só verifica número de partidas e soma zero | Falta verificar magnitude/tipos contra transação e reconciliação produto/lotes/ledger; não confiar apenas na view |
| A19 | P1 | JWT escrito manualmente; kid desconhecido não força refresh JWKS | Pendente: refresh limitado, testes de rotação e política de sessão; evitar biblioteca sem avaliação |
| A20 | P1 | Importação de backup substitui estado; remoção individual não tem rollback em memória se persist falhar | Não usar essas ações no piloto. Exclusão total bloqueada neste ciclo; restauração/merge não validados |
| A21 | P1 | Saldo negativo é rejeitado pela apresentação local; passivos ausentes do total | Pendente: bancos negativos, cartão/passivo e patrimônio líquido |
| A22 | P1 | Novos aportes locais entram em lots e podem se sobrepor a aporte-base manual | Pendente conciliação por operação; interface passa a avisar vínculo dos aportes locais |
| A23 | P2 | Mensagens sem acentos e uso inconsistente de “rascunho” | Corrigidos textos selecionados; revisão integral PT-BR ainda pendente |
| A24 | P2 | Sem pipeline reproduzível | Criados npm test/check e workflow somente de testes, sem credenciais ou deploy |

## Correções propostas

1. Importar os candidatos como base revisável, preservando ícones existentes; frontend identificado como 1.9.1-audit e backend 0.3.1-audit.
2. `storage.mjs`: leitura defensiva, bloqueio em erro, retenção de bytes e detecção de aba desatualizada. Mantém a chave `meu-financeiro-pwa-local-v1` e IDs/status legados; nenhum autoenvio.
3. `sw.js`: cache do conjunto completo da versão; atualização aguarda clientes antigos fecharem. Módulo de outra versão não é buscado silenciosamente. Retenção de caches antigos é intencional nesta fase, com custo de armazenamento a controlar depois.
4. Backend: data de vencimento, limite IR, Origin e recuperação idempotente; bloqueio de mutações de cofrinho incompletas.
5. Projeções após resgate: fallback explícito, aplicado às telas de consulta, patrimônio e total.
6. `reconciliation.mjs` e CLI de dry-run: cálculos em centavos, exclusão de estimativas, revisão de ambiguidades e referências coincidentes. São ferramentas de análise, não importador nem motor contábil completo.
7. Configuração de exemplo local sem ID D1 real e todas as flags desligadas. Nenhum arquivo wrangler ativo para deploy acidental.

## Testes e reprodução

```sh
node --version          # Node >= 24
npm run check
npm test
```

Resultados em `docs/evidence/tests.txt`: **24 testes passaram**. Há teste de falha injetada cujo log `D1 batch error injected failure` é esperado e confirma rollback.

`baseline-worker.txt`: mesmos dez testes de backend contra a API original, seis passaram e quatro falharam. `fixed-worker.txt`: dez passaram após correções. A comparação foi executada com `WORKER_SOURCE` apontando ao candidato original fora do repo; para reproduzir, extraia o ZIP original e passe seu caminho relativo ao diretório `tests` ou URL absoluta de arquivo. Os demais testes exercitam funcionalidades novas, não são comparações históricas.

Cobertura comportamental: gates fechados; assinatura/claims JWT; isolamento entre titulares; balanceamento; reenvio concorrente com uma transação; conflito de hash; recuperação após resposta perdida; rollback parcial; centavos/datas; vencimento; resgate/projeções; JSON legado/corrompido; quota; aba desatualizada; navegação em DOM simulado; escape de texto; cache offline/instalação incompleta; dry-run e base temporal.

Não coberto: Android real, layout, teclado e toque, Google GIS real, quotas e comportamento D1 real, rede instável real, réplica, atualização sob Worker antigo, parcelamento, resgate tributado, estornos e recuperação de backup em outro aparelho.

## Contrato recomendado para sincronização (ainda não implementado)

- Evento financeiro realizado tem estado contábil independente de transmissão.
- Fila separada do JSON legado, durável e vinculada ao `sub` Google; jamais transmitir registros de outro usuário após troca de conta.
- UUID permanente criado e persistido antes de enviar; corpo normalizado congelado após primeira tentativa. Retificação depois de enviado é novo evento auditável, não edição do anterior.
- Estados: pendente → enviando → sincronizado; timeout → resultado incerto. Reinício nunca cria chave nova.
- Em resultado incerto, consultar `/api/operation-result`; se desconhecido, repetir a MESMA chave e corpo. 409 exige revisão, 401 novo login, 403 manter bloqueado, 503 retry com backoff.
- Transação + partidas + lotes + idempotência + auditoria no mesmo batch. Não limpar fila antes de persistir confirmação do servidor.
- Antes da UI, testar crash após commit e antes de resposta, expiração, abas concorrentes, conta trocada, atualização do app e fila antiga.

## Plano de migração

1. Exportar o JSON do celular e obter backup consistente da planilha/D1 em ambiente autorizado. Registrar contagens, hashes, versão e data. Ensaiar restauração em cópia isolada.
2. Ler todas as abas relevantes, fórmulas e estado dos itens; os intervalos deste ciclo não constituem backup integral.
3. Estabelecer um fato canônico e múltiplas referências de origem. IDs LAN/WA vinculam registros; sem referência, data/valor/descrição são apenas candidatos a revisão, nunca exclusão automática.
4. Não converter receitas previstas, despesas recorrentes, parcelas futuras nem rendimentos estimados em fatos realizados. Compra gera passivo uma vez; parcelas organizam fatura, não nova despesa. Pagamento de fatura liquida passivo e caixa.
5. Reclassificação/anulação precisa preservar a trilha; não importar simultaneamente o débito e a compra anulada. Pagamento por terceiro requer regra explícita de responsabilidade e reembolso, sem debitar banco do usuário automaticamente.
6. Escolher saldo-base por conta com corte temporal explícito. Resolver operações do mesmo dia sem horário. Importar histórico como referência sem reaplicar contra base, ou reconstruir ledger completo; não misturar estratégias.
7. Emitir dry-run com correspondências, conflitos, totais por conta, diferença para posição confirmada e itens sem destino. Aprovação específica antes de qualquer importação.
8. Só então implementar importador idempotente e executar primeiro em banco isolado. Comparar totais, referências, contagens, integridade e trilha antes de autorizar ambiente real.

## Fontes técnicas consultadas

- Cloudflare D1Database.batch: https://developers.cloudflare.com/d1/worker-api/d1-database/ — lote transacional e rollback de sequência em erro. Nosso adaptador local reproduz essa expectativa, não substitui teste na plataforma.
- Google ID token: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token — assinatura, audiência, emissor e expiração; referência para testes de autenticação.

## Decisão de liberação

**NO-GO para gravações reais, migração e produção.** Esta proposta é adequada para revisão de código e ensaio em ambiente isolado após autorização. Consultar `VALIDACAO-S24-FE.md` antes de testar no aparelho usado diariamente.

## Complemento — anexos e autorização de 17/10/2026

O usuário autorizou explicitamente enviar somente a branch e abrir PR em rascunho, sem merge, deploy ou gravações reais. O bloqueio anterior de push foi resolvido por essa autorização; as demais restrições permanecem.

- O segundo ZIP tem SHA-256 idêntico ao primeiro (`5579ba770e35bf3a6467ac2b78b653376fe582d7ac98cf18f5c4876e33e1ea4f`).
- Os quatro arquivos TXT fornecem captura/interpretador, integração oficial, autopublicação e respostas WhatsApp em Apps Script. Foram lidos e executados apenas seus testes em memória. Nenhum script remoto ou Worker WhatsApp foi alterado.
- O arquivo Markdown do Worker declara API 0.2.0-hml; o ZIP continua contendo 0.3.0-hml. O conteúdo Markdown tem escapes e marcação, não deve ser colado diretamente no editor como código. A versão efetivamente implantada não foi confirmada por esses arquivos.
- O comentário de integração manual não descreve sozinho o sistema: existe módulo de autopublicação e rota `process_pending`. Antes da migração, confirmar flags/gatilhos realmente ativos; escolher um escritor oficial por fase e preservar chaves de origem entre Sheets e D1. A presença do código não prova que o gatilho está ativo.
- Escritas em múltiplas abas ocorrem sequencialmente, com locks e verificações de referência. Não equivalem a uma transação D1. Falhas entre abas e retomada precisam testes próprios antes de aposentar o fluxo legado.
- Oito suítes fornecidas passaram: cartões, interpretador V10, rota V11, variações de cofrinho V12, integração, automação, aprovação de cofrinhos e respostas V14. Os logs estão em `docs/evidence/apps-script-tests.txt`. São testes lógicos com `Utilities.formatDate` adaptado para Intl, não execução hospedada no Google.
- Runner reproduzível: `node tools/test-apps-script-local.mjs /pasta/dos/anexos`. Os arquivos originais não foram incorporados ao repositório público, pois contêm referências privadas de planilha. O runner bloqueia serviços de planilha, propriedades, locks, gatilhos e rede; não invoca ativação/publicação.
- As 24 verificações do aplicativo/API permanecem uma suíte separada. Os scripts originais `test_worker.mjs` e `test_front.mjs` ainda não foram fornecidos; os testes Apps Script não os substituem.

## Continuação 1.9.2

A03 avançou para preparação local durável por titular, sem envio. O endpoint de saldos separa livro e confirmações; conciliação continua pendente. Suíte atual: 39 testes, com fake-indexeddb como dependência de desenvolvimento. Detalhes e limites em [FILA-OFFLINE.md](FILA-OFFLINE.md). O resultado anterior de 24 testes permanece como evidência da primeira etapa.
