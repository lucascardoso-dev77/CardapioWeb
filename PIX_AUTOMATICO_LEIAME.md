# Pix Automático com Mercado Pago — Guia de Deploy

Isso é a parte mais técnica do sistema até agora: envolve rodar código
no **servidor** do Supabase (não é HTML/JS que roda no navegador). Segue
o passo a passo com calma, uma vez só, e depois funciona sozinho.

## 0. Antes de tudo: crie sua conta no Mercado Pago

1. Crie uma conta em https://www.mercadopago.com.br (pode ser com CPF)
2. Vá em **https://www.mercadopago.com.br/developers/panel** → **Suas integrações** → **Criar aplicação**
3. Depois de criada, entre na aplicação → **Credenciais de produção**
4. Copie o **Access Token de produção** (começa com `APP_USR-...`) — vai precisar dele no passo 3

⚠️ Existe também um "Access Token de teste" (`TEST-...`) — sirva só pra testar
sem dinheiro real. Pra cobrar de verdade, precisa ser o de **produção**.

## 1. Instalar o Supabase CLI

No Terminal do Mac:
```
brew install supabase/tap/supabase
```
(se não tiver o Homebrew instalado, veja em https://brew.sh)

Confirme que instalou:
```
supabase --version
```

## 2. Conectar o CLI ao seu projeto

Dentro da pasta onde você vai guardar as functions (pode ser a mesma
pasta dos outros arquivos do sistema, numa subpasta `supabase`):

```
supabase login
```
(abre o navegador pra você autorizar)

Depois, link com o projeto Supabase **desse cliente específico**:
```
supabase link --project-ref SEU_PROJECT_REF
```
> O `PROJECT_REF` é o código que aparece na URL do seu projeto, tipo
> `xdcevntyknfuofktcjqh` (a parte antes de `.supabase.co`).

## 3. Configurar o Access Token do Mercado Pago (secreto, nunca no site)

```
supabase secrets set MP_ACCESS_TOKEN=APP_USR-SEU-TOKEN-AQUI
```

## 4. Colocar os arquivos das functions no lugar certo

Baixe os dois arquivos que te enviei e organize assim, dentro da pasta
onde você rodou `supabase link`:

```
supabase/
  functions/
    criar-pagamento-pix/
      index.ts
    webhook-mercadopago/
      index.ts
```

## 5. Publicar as duas functions

```
supabase functions deploy criar-pagamento-pix --no-verify-jwt
supabase functions deploy webhook-mercadopago --no-verify-jwt
```

Se dar certo, aparece uma URL parecida com:
```
https://SEU_PROJECT_REF.supabase.co/functions/v1/criar-pagamento-pix
https://SEU_PROJECT_REF.supabase.co/functions/v1/webhook-mercadopago
```

Não precisa cadastrar a URL do webhook manualmente no painel do Mercado
Pago — a própria function `criar-pagamento-pix` já avisa o Mercado Pago
dessa URL toda vez que cria uma cobrança.

## 6. Rodar o script SQL (se ainda não rodou)

SQL Editor do Supabase → cole o conteúdo de `pix_automatico.sql` → Run.

## 7. Testar

1. Suba o `delivery.html` novo (já ajustado pra chamar a function)
2. Faça um pedido de delivery escolhendo Pix
3. Na tela de acompanhamento, deve aparecer um QR Code de verdade (gerado
   na hora pelo Mercado Pago), com um código "copia e cola" abaixo
4. Pague de verdade (ou, se estiver testando com token de TESTE, use o
   [simulador de pagamentos do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/checkout-api/integration-test/test-cards))
5. Em poucos segundos, a tela deve trocar sozinha pra "✅ Pagamento confirmado!"
   — sem precisar dar F5, sem precisar ninguém conferir nada manualmente

## O que acontece se algo não estiver configurado

Se as functions não estiverem publicadas, ou o `MP_ACCESS_TOKEN` não
estiver configurado, o sistema **não quebra** — ele automaticamente cai
de volta no modo manual (mostra a chave Pix fixa cadastrada no admin e
pede pra mandar o comprovante pelo WhatsApp), exatamente como funcionava
antes dessa integração.

## Multiplicando para outros clientes (lembrete do seu modelo de negócio)

Como cada cliente tem seu próprio projeto Supabase, você precisa repetir
os passos 2, 3, 5 e 6 **para cada cliente novo**, usando o Access Token
do Mercado Pago **daquele cliente** (cada restaurante recebe o dinheiro
na própria conta dele, não na sua).
