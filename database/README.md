# Banco de dados Aori

SQLite integrado à aplicação; requer Node.js 24+. O servidor prepara o banco
na inicialização, mantém dados existentes e sincroniza as seis hospedagens fictícias.

## Tabelas e relações

As três tabelas obrigatórias conservam integralmente suas colunas:

- Clientes: ID, Nome, CPF, Telefone, Email.
- Pagamentos: ID, ID_Reserva, Valor, Data_Pagamento, Método.
- Funcionários: ID, Nome, Cargo, Login, Senha.

Foram adicionadas quatro tabelas necessárias ao fluxo de favoritos por conta:

- Contas_Clientes: ID_Cliente (PK/FK de Clientes), Login (e-mail único), Senha (hash).
- Sessoes_Clientes: Token_Hash (PK), ID_Cliente (FK), Expira_Em (milissegundos).
- Hospedagens: ID (slug estável), Nome, Localidade, Regiao, Valor_Diaria (centavos).
- Favoritos: ID_Cliente e ID_Hospedagem (PK composta/FKs), Criado_Em.

Cada cliente pode ter vários favoritos; cada hospedagem pode ser favorita de
vários clientes. A chave composta impede duplicidades. A identidade vem da sessão,
nunca de um ID de cliente fornecido pelo navegador. Excluir um cliente remove
conta, sessões e favoritos por cascata. Não há rota pública de exclusão de clientes.

CPF é armazenado sem pontuação e validado por dígitos verificadores no cadastro.
Telefone é texto com 10 a 15 dígitos. O e-mail é único, ignorando maiúsculas.
Valores são centavos inteiros; datas de pagamento seguem AAAA-MM-DD.
ID_Reserva continua como referência lógica: a tabela Reservas ainda não existe.
Pagamentos/funcionários mantêm o esquema, sem telas ou endpoints de administração.

## Autenticação

E-mail e senha autenticam o cliente. A senha é derivada com scrypt e salt aleatório
por conta (N=32768, r=8, p=3, chave de 64 bytes). A comparação usa tempo constante.
O banco não armazena a senha em texto puro. A coluna Senha dos funcionários também
é destinada a hashes; autenticação de funcionários ainda não foi implementada.

Sessões duram sete dias; somente o hash SHA-256 do token aleatório é persistido.
O cookie aori_session é HttpOnly e SameSite=Lax. Logout revoga a sessão. Rotas de
alteração verificam Origin/Host e exigem JSON; tentativas de acesso são limitadas.
O servidor é local (HTTP em loopback). Antes de hospedar externamente, configure
HTTPS e cookie Secure, revisão de limites e estratégia de backup/acesso.

## API

- GET /api/me: conta atual ou user:null, com favorites.
- POST /api/register: nome, cpf, telefone, email, senha; cria conta e sessão.
- POST /api/login: email, senha; cria sessão.
- POST /api/logout: encerra e revoga a sessão.
- GET /api/favorites: lista favoritos da conta autenticada.
- PUT /api/favorites/:id: adiciona hospedagem existente, sem duplicar.
- DELETE /api/favorites/:id: remove somente o favorito da conta atual.

O banco fica fora de public e não pode ser baixado pelo site. Cadastros, senhas,
cookies e o arquivo aori.sqlite3 não entram no versionamento. Dados de teste são
sintéticos e usados em bancos isolados; nenhum cliente é criado automaticamente.

## Migração e testes

schema.sql é idempotente para a estrutura atual e adiciona as tabelas novas sem
apagar as antigas. A criação do índice de e-mails falha se um banco antigo tiver
e-mails duplicados; nesse caso, corrija os cadastros com orientação do responsável,
sem excluir dados automaticamente. Clientes previamente inseridos manualmente
não recebem conta/senha automaticamente. Não existe redefinição de senha nesta versão.

AORI_DATABASE_PATH permite escolher outro arquivo. O padrão é database/aori.sqlite3.
Use node --test tests/accounts.test.mjs para validar autenticação, isolamento,
persistência, integridade e proteção de dados em bancos temporários.
