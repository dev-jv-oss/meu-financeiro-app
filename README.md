# Meu Financeiro — candidata de auditoria

PWA pessoal em homologação. Esta branch não está aprovada para produção nem habilita gravações reais.

- [Auditoria técnica](docs/AUDITORIA.md)
- [Validação no Samsung S24 FE](docs/VALIDACAO-S24-FE.md)
- [Evidências dos testes](docs/evidence/tests.txt)

Requer Node 24 ou superior. A dependência de desenvolvimento simula IndexedDB nos testes:

```sh
npm ci --ignore-scripts
npm run check
npm test
```

O Worker em `backend/` e o SQL em `database/` são fontes para revisão, não instalações realizadas. A configuração de exemplo é local, com todas as flags de escrita/teste desligadas. Não há comando de deploy ou migração automática. O workflow executa somente testes.

Não publique dados financeiros, backups do aparelho, tokens ou credenciais neste repositório público.

Continuação: [fila local e saldos separados](docs/FILA-OFFLINE.md). [39 testes automatizados](docs/evidence/offline-tests.txt).
