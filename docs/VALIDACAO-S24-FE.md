# Validação controlada no Samsung Galaxy S24 FE

## Antes de qualquer atualização

1. No aplicativo atual, exportar JSON. Guardar duas cópias e verificar número de registros, IDs, saldos, cofrinhos e investimentos. Não desinstalar, limpar dados do Chrome ou usar “limpar armazenamento”.
2. Registrar a versão atual e capturas privadas das telas principais. Não enviar dados pessoais para issues/PRs públicos.
3. Revisar esta branch e o relatório. Não fazer merge para main: pode acionar GitHub Pages.
4. Autorizar separadamente um ambiente de homologação isolado. Origem diferente tem armazenamento diferente; o piloto não terá automaticamente os registros do app atual. Usar cópia de backup, sem mover/apagar o original.
5. Manter ENABLE_FINANCIAL_WRITES, ENABLE_ACCOUNT_SETUP e ENABLE_HML_TESTS false. Testes fictícios no D1 exigem autorização própria; não habilitar gravações gerais para “ver se funciona”.

## Roteiro de aceitação (ainda não executado no aparelho)

| Teste | Resultado exigido |
|---|---|
| Abrir Chrome e PWA instalada, tela vertical e horizontal | Navegação legível, sem corte lateral ou tela em branco |
| Teclado decimal, R$ 0,01 / R$ 1,23 / R$ 1.234,56 | Mesmos centavos após salvar/reabrir |
| Abrir todas as telas e editar registro local na cópia | Mesmo ID; mudança e revisão persistidas |
| Modo avião após carga completa; fechar/reabrir | Shell e registros locais disponíveis; login indisponível explicado |
| Registrar offline na cópia | Salvo localmente; NÃO aparece como sincronizado |
| Voltar à rede | Nenhum envio automático de registros reais |
| Duas abas, salvar A e tentar salvar B desatualizada | B rejeita a gravação; A preservada |
| Login Google, sair, tentar consulta | Sem token persistido; sair bloqueia consulta; não transfere dados locais a outra conta |
| Investimento com vencimento futuro | Cadastro validado no contrato autorizado; sem gravação real neste piloto |
| Resgate local com lote antigo | Estimativa suspensa e pedido de conciliação; sem patrimônio inflado |
| Atualizar com formulário aberto | Worker novo aguarda fechamento; conteúdo não mistura módulos |
| Fechar todas as janelas PWA/abas e reabrir | Nova versão ativa; mesma chave/IDs e número de registros |
| Armazenamento corrompido/quota (somente cópia de teste) | Aviso; bytes originais preservados; nenhuma confirmação falsa de salvamento |

## Fase seguinte: API/D1 isolados, somente após autorização

Repetir cenário fixo receita 100, despesa 35, transferência 20, aporte 10. Esperar 4 transações, contas 35 e 20, principal 10 e nenhuma inconsistência. Reenviar a mesma chave várias vezes; quantidade deve permanecer 4. Injetar timeout após commit, consultar resultado e repetir o mesmo payload. Testar falha parcial e verificar ausência de registros parciais. Desligar flags novamente ao concluir.

## Rollback

Não executar rollback de banco como resposta automática a erro de interface. Preservar dados e fila antes de agir. Em piloto, interromper testes, bloquear writes e manter o estado para diagnóstico. Retorno do código depende da aprovação de publicação; cache pode manter versão anterior até todas as abas fecharem. Não instruir usuário a limpar cache/dados para forçar retorno. Mudança de esquema exige plano de compatibilidade e restauração testada separadamente.

## Pendências para aceite

Fila persistente por usuário, mapeamento de contas, saldos D1 conciliados, lotes de aporte/resgate, passivos/cartões, importação idempotente e E2E real. Enquanto pendentes, a versão continua sendo candidata de auditoria.
