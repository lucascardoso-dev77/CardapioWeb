// ============================================================
// Edge Function: webhook-mercadopago
// ------------------------------------------------------------
// O Mercado Pago chama essa URL sozinho toda vez que o status de
// um pagamento muda (foi criada, foi paga, etc). Quando confirma
// que foi PAGA, marcamos o pedido como pago=true no banco — daí o
// site do cliente (que está "escutando" essa mudança) atualiza a
// tela sozinho, na hora.
//
// Deploy:
//   supabase functions deploy webhook-mercadopago --no-verify-jwt
//
// Depois do deploy, essa é a URL que já foi configurada
// automaticamente (via notification_url) em cada pagamento criado
// pela função criar-pagamento-pix — não precisa cadastrar nada a
// mais manualmente no painel do Mercado Pago.
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    // O Mercado Pago manda o id do pagamento tanto na query quanto no corpo,
    // dependendo do tipo de notificação — checamos os dois formatos.
    const paymentId =
      body?.data?.id ||
      url.searchParams.get("data.id") ||
      url.searchParams.get("id");

    if (!paymentId) {
      return new Response("ok (sem payment id, ignorado)", { status: 200 });
    }

    // Nunca confiamos só no aviso — buscamos os dados reais e
    // atualizados direto na API do Mercado Pago antes de agir.
    const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });

    if (!mpResp.ok) {
      console.error("Não foi possível consultar o pagamento no Mercado Pago:", paymentId);
      return new Response("ok (erro ao consultar, ignorado)", { status: 200 });
    }

    const pagamento = await mpResp.json();

    if (pagamento?.status === "approved") {
      await fetch(`${SUPABASE_URL}/rest/v1/pedidos?mp_payment_id=eq.${paymentId}`, {
        method: "PATCH",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ pago: true }),
      });
      console.log(`✅ Pagamento ${paymentId} confirmado e marcado no pedido.`);
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error(err);
    // Sempre responde 200 pro Mercado Pago não ficar re-tentando em loop
    // por um erro nosso — o log acima já registra o problema.
    return new Response("erro registrado", { status: 200 });
  }
});
