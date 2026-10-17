-- Meu Financeiro | D1 / SQLite | Esquema inicial v1 | HOMOLOGACAO
-- Compatibilidade: Cloudflare D1 (SQLite). Somente CREATE/INDEX/VIEW e marcador de versao.
-- NAO remove dados, NAO insere movimentacoes, NAO cria usuario real.
-- Aplicar apenas ao banco meu-financeiro-hml.
-- Dinheiro SEMPRE em centavos INTEGER. Datas civis em YYYY-MM-DD; timestamps em UTC.
-- A API devera validar usuario, titularidade, saldos, partidas equilibradas e idempotencia.

CREATE TABLE IF NOT EXISTS schema_versions (
    version INTEGER PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_sub TEXT NOT NULL UNIQUE,
    email TEXT,
    display_name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN (
        'bank','cash','pocket','investment','credit_card','loan','system'
    )),
    institution TEXT,
    currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id,id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('expense','income','other')),
    parent_id TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
    UNIQUE(user_id,id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY(user_id,parent_id) REFERENCES categories(user_id,id) ON DELETE RESTRICT
);

-- Transacao: fato financeiro efetivo no app. A origem indica de onde veio,
-- e nao se foi 'confirmado' depois pelo usuario.
-- Nao se usa D1 como controle de rascunhos futuros.
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    client_operation_id TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'app' CHECK(source IN ('app','whatsapp','sheet','bank_import','manual_migration')),
    external_id TEXT,
    kind TEXT NOT NULL CHECK(kind IN (
        'expense','income','transfer','card_purchase','card_payment','refund',
        'pocket_deposit','pocket_withdrawal','investment_deposit',
        'investment_withdrawal','yield_credit','fee','adjustment'
    )),
    status TEXT NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','reversed')),
    effective_date TEXT NOT NULL CHECK(length(effective_date)=10),
    description TEXT NOT NULL,
    category_id TEXT,
    amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
    note TEXT,
    reversal_of TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id,id),
    UNIQUE(user_id,client_operation_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY(user_id,category_id) REFERENCES categories(user_id,id) ON DELETE RESTRICT,
    FOREIGN KEY(user_id,reversal_of) REFERENCES transactions(user_id,id) ON DELETE RESTRICT
);

-- Livro de partidas: saldo de conta = posicao base + movimentos posteriores.
-- delta positivo aumenta o patrimonio/ativo, negativo diminui.
-- Compra no cartao torna saldo da conta de passivo mais negativo.
-- A contrapartida de despesa/receita e uma conta tecnica kind='system'.
-- REGRA OBRIGATORIA NA API: >= 2 partidas e soma(delta_cents) = 0.
-- A regra acima nao e imposta por CHECK SQL e deve ser garantida atomicamente pelo Worker.
CREATE TABLE IF NOT EXISTS ledger_postings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    sequence_no INTEGER NOT NULL CHECK(sequence_no>0),
    delta_cents INTEGER NOT NULL CHECK(delta_cents<>0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(transaction_id,sequence_no),
    FOREIGN KEY(user_id,transaction_id) REFERENCES transactions(user_id,id) ON DELETE RESTRICT,
    FOREIGN KEY(user_id,account_id) REFERENCES accounts(user_id,id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS credit_cards (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    name TEXT NOT NULL,
    statement_closes_day INTEGER CHECK(statement_closes_day BETWEEN 1 AND 31),
    payment_due_day INTEGER CHECK(payment_due_day BETWEEN 1 AND 31),
    credit_limit_cents INTEGER CHECK(credit_limit_cents >= 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
    UNIQUE(user_id,id),
    UNIQUE(user_id,account_id),
    FOREIGN KEY(user_id,account_id) REFERENCES accounts(user_id,id) ON DELETE RESTRICT
);

-- Parcelas organizam faturas; NAO sao despesas adicionais.
-- A compra entra uma vez no livro de partidas no valor total da compra.
CREATE TABLE IF NOT EXISTS card_installments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    purchase_transaction_id TEXT NOT NULL,
    installment_number INTEGER NOT NULL CHECK(installment_number >= 1),
    installment_count INTEGER NOT NULL CHECK(installment_count >= installment_number),
    invoice_month TEXT NOT NULL CHECK(length(invoice_month)=7),
    amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
    UNIQUE(user_id,purchase_transaction_id,installment_number),
    FOREIGN KEY(user_id,card_id) REFERENCES credit_cards(user_id,id) ON DELETE RESTRICT,
    FOREIGN KEY(user_id,purchase_transaction_id) REFERENCES transactions(user_id,id) ON DELETE RESTRICT
);

-- Cada CDB/cofrinho/produto tem conta patrimonial propria, sem confundir
-- produtos de mesmo tipo no mesmo banco.
CREATE TABLE IF NOT EXISTS investment_products (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    product_type TEXT NOT NULL CHECK(product_type IN (
        'CDB','RDB','LCI','LCA','TESOURO','FUNDO','POUPANCA','COFRINHO','OUTRO'
    )),
    name TEXT NOT NULL,
    yield_mode TEXT NOT NULL DEFAULT 'none' CHECK(yield_mode IN (
        'none','cdi_pct','fixed_annual','cdi_plus','ipca_plus','other'
    )),
    contracted_rate TEXT,
    started_on TEXT CHECK(started_on IS NULL OR length(started_on)=10),
    liquidity TEXT NOT NULL DEFAULT 'daily' CHECK(liquidity IN ('daily','grace','maturity')),
    grace_days INTEGER CHECK(grace_days IS NULL OR grace_days>0),
    maturity_date TEXT CHECK(maturity_date IS NULL OR length(maturity_date)=10),
    settlement_business_days INTEGER NOT NULL DEFAULT 0 CHECK(settlement_business_days >= 0),
    ir_mode TEXT NOT NULL DEFAULT 'regressive' CHECK(ir_mode IN ('regressive','fixed','exempt','other')),
    fixed_ir_rate TEXT,
    iof_applies INTEGER NOT NULL DEFAULT 1 CHECK(iof_applies IN (0,1)),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id,id),
    UNIQUE(user_id,account_id),
    FOREIGN KEY(user_id,account_id) REFERENCES accounts(user_id,id) ON DELETE RESTRICT
);

-- Ao cadastrar a aplicacao inicial real: 1 transacao de aporte + 1 lote,
-- criados juntos no mesmo lote atomico de escritas do Worker.
CREATE TABLE IF NOT EXISTS investment_lots (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    application_transaction_id TEXT NOT NULL,
    applied_on TEXT NOT NULL CHECK(length(applied_on)=10),
    original_principal_cents INTEGER NOT NULL CHECK(original_principal_cents>0),
    remaining_principal_cents INTEGER NOT NULL CHECK(
        remaining_principal_cents>=0 AND remaining_principal_cents<=original_principal_cents
    ),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id,id),
    UNIQUE(user_id,application_transaction_id),
    FOREIGN KEY(user_id,product_id) REFERENCES investment_products(user_id,id) ON DELETE RESTRICT,
    FOREIGN KEY(user_id,application_transaction_id) REFERENCES transactions(user_id,id) ON DELETE RESTRICT
);

-- Resgates parciais podem consumir um ou varios lotes.
-- O Worker deve impedir soma de principal resgatado > principal original.
CREATE TABLE IF NOT EXISTS lot_redemptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    lot_id TEXT NOT NULL,
    redemption_transaction_id TEXT NOT NULL,
    principal_redeemed_cents INTEGER NOT NULL CHECK(principal_redeemed_cents>0),
    gross_profit_cents INTEGER CHECK(gross_profit_cents IS NULL OR gross_profit_cents>=0),
    ir_cents INTEGER CHECK(ir_cents IS NULL OR ir_cents>=0),
    iof_cents INTEGER CHECK(iof_cents IS NULL OR iof_cents>=0),
    net_received_cents INTEGER CHECK(net_received_cents IS NULL OR net_received_cents>=0),
    UNIQUE(user_id,redemption_transaction_id,lot_id),
    FOREIGN KEY(user_id,lot_id) REFERENCES investment_lots(user_id,id) ON DELETE RESTRICT,
    FOREIGN KEY(user_id,redemption_transaction_id) REFERENCES transactions(user_id,id) ON DELETE RESTRICT
);

-- Referencias de CDI/IPCA nao sao creditos nem movimentacoes financeiras.
CREATE TABLE IF NOT EXISTS reference_rates (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    index_name TEXT NOT NULL CHECK(index_name IN ('CDI','IPCA','SELIC','OTHER')),
    reference_date TEXT NOT NULL CHECK(length(reference_date)=10),
    period TEXT NOT NULL CHECK(period IN ('daily','monthly','annual')),
    rate_text TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('official','manual','imported')),
    checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id,index_name,reference_date,period,source),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- Saldo confirmado e estimativa coexistem, cada qual rotulado.
-- Nenhuma estimativa vira automaticamente credito em conta.
CREATE TABLE IF NOT EXISTS investment_valuations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('confirmed','estimated')),
    principal_cents INTEGER CHECK(principal_cents IS NULL OR principal_cents>=0),
    gross_cents INTEGER CHECK(gross_cents IS NULL OR gross_cents>=0),
    estimated_ir_cents INTEGER CHECK(estimated_ir_cents IS NULL OR estimated_ir_cents>=0),
    estimated_iof_cents INTEGER CHECK(estimated_iof_cents IS NULL OR estimated_iof_cents>=0),
    net_cents INTEGER NOT NULL CHECK(net_cents>=0),
    calculation_method TEXT,
    notes TEXT,
    UNIQUE(user_id,product_id,observed_at,kind),
    FOREIGN KEY(user_id,product_id) REFERENCES investment_products(user_id,id) ON DELETE RESTRICT
);

-- Posicoes bancarias confirmadas geram ancora de reconciliacao;
-- eventos anteriores a ancora nao devem ser reaplicados sobre ela.
CREATE TABLE IF NOT EXISTS balance_snapshots (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    as_of_utc TEXT NOT NULL,
    balance_cents INTEGER NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('bank','manual','imported')),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id,account_id,as_of_utc,source),
    FOREIGN KEY(user_id,account_id) REFERENCES accounts(user_id,id) ON DELETE RESTRICT
);

-- Pedido repetido com mesma chave e hash recupera resposta anterior;
-- mesma chave + outro conteudo deve ser rejeitado pela API.
CREATE TABLE IF NOT EXISTS idempotency_keys (
    user_id TEXT NOT NULL,
    request_key TEXT NOT NULL,
    payload_sha256 TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('processing','completed','review','failed')),
    transaction_id TEXT,
    response_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id,request_key),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY(user_id,transaction_id) REFERENCES transactions(user_id,id) ON DELETE RESTRICT
);

-- Identificadores externos para migrar Sheets / WhatsApp SEM duplicar fatos.
CREATE TABLE IF NOT EXISTS external_references (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    transaction_id TEXT,
    payload_sha256 TEXT,
    review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','linked','ignored','conflict')),
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id,source,source_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY(user_id,transaction_id) REFERENCES transactions(user_id,id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    summary TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- Indices orientados a consultas pelo aplicativo e relatorios financeiros.
CREATE INDEX IF NOT EXISTS idx_accounts_user_kind ON accounts(user_id,kind,status);
CREATE INDEX IF NOT EXISTS idx_categories_user_kind ON categories(user_id,kind);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id,effective_date DESC,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_kind ON transactions(user_id,kind,effective_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_external_source
    ON transactions(user_id,source,external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_postings_account_date ON ledger_postings(user_id,account_id,transaction_id);
CREATE INDEX IF NOT EXISTS idx_postings_transaction ON ledger_postings(user_id,transaction_id);
CREATE INDEX IF NOT EXISTS idx_cards_user ON credit_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_card_installments_month ON card_installments(user_id,card_id,invoice_month);
CREATE INDEX IF NOT EXISTS idx_investments_user ON investment_products(user_id,status);
CREATE INDEX IF NOT EXISTS idx_lots_product ON investment_lots(user_id,product_id,applied_on);
CREATE INDEX IF NOT EXISTS idx_redemptions_lot ON lot_redemptions(user_id,lot_id);
CREATE INDEX IF NOT EXISTS idx_rates_date ON reference_rates(user_id,index_name,reference_date DESC);
CREATE INDEX IF NOT EXISTS idx_valuations_product ON investment_valuations(user_id,product_id,observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON balance_snapshots(user_id,account_id,as_of_utc DESC);
CREATE INDEX IF NOT EXISTS idx_external_transaction ON external_references(user_id,transaction_id);
CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_events(user_id,created_at DESC);

-- Diagnostico: 'posted' deve ter ao menos 2 partidas e soma exatamente 0.
-- Nao e usado para 'consertar' automaticamente movimentos.
CREATE VIEW IF NOT EXISTS v_ledger_integrity AS
SELECT t.user_id, t.id AS transaction_id, t.kind,
       COUNT(p.id) AS postings_count,
       COALESCE(SUM(p.delta_cents),0) AS balance_cents,
       CASE WHEN COUNT(p.id)>=2 AND COALESCE(SUM(p.delta_cents),0)=0
            THEN 'ok' ELSE 'invalid' END AS integrity
FROM transactions t
LEFT JOIN ledger_postings p ON p.transaction_id=t.id AND p.user_id=t.user_id
GROUP BY t.user_id,t.id,t.kind;

INSERT OR IGNORE INTO schema_versions(version,description)
VALUES (1,'Estrutura financeira inicial para homologacao; sem transacoes importadas');
