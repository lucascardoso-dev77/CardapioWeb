// ============================================================
// Edge Function: criar-pagamento-pix
// ------------------------------------------------------------
// Recebe { pedido_id }, cria uma cobrança Pix de verdade no
// Mercado Pago (com QR Code dinâmico) e salva o resultado no
// próprio pedido. É chamada pelo site (delivery.html) na hora
// em que o cliente escolhe pagar com Pix.
//
// Deploy:
//   supabase functions deploy criar-pagamento-pix --no-verify-jwt
//
// Secret necessário (configurar ANTES de dar deploy):
//   supabase secrets set MP_ACCESS_TOKEN=SEU_ACCESS_TOKEN_DO_MERCADO_PAGO
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    if (!MP_ACCESS_TOKEN) {
      return jsonResponse({ error: "MERCADO_PAGO_NAO_CONFIGURADO" }, 400);
    }

    const { pedido_id } = await req.json();
    if (!pedido_id) {
      return jsonResponse({ error: "pedido_id é obrigatório" }, 400);
    }

    // Busca o pedido direto no banco (service role = ignora RLS).
    // Importante: o VALOR vem do banco, nunca do que o navegador manda,
    // pra ninguém conseguir manipular o preço do pedido.
    const pedidoResp = await fetch(
      `${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedido_id}&select=id,numero,total,nome_cliente`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );
    const pedidos = await pedidoResp.json();
    const pedido = pedidos?.[0];

    if (!pedido) {
      return jsonResponse({ error: "Pedido não encontrado" }, 404);
    }

    // Cria o pagamento Pix no Mercado Pago
    const mpResp = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "X-Idempotency-Key": `pedido-${pedido.id}`,
      },
      body: JSON.stringify({
        transaction_amount: Number(pedido.total),
        description: `Pedido #${pedido.numero}`,
        payment_method_id: "pix",
        payer: {
          email: `pedido${pedido.numero}@clientes.cardapiorapido.app`,
          first_name: (pedido.nome_cliente || "Cliente").split(" ")[0],
        },
        notification_url: `${SUPABASE_URL}/functions/v1/webhook-mercadopago`,
      }),
    });

    const mpData = await mpResp.json();

    if (!mpResp.ok) {
      console.error("Erro Mercado Pago:", JSON.stringify(mpData));
      return jsonResponse({ error: "Erro ao criar pagamento no Mercado Pago", detalhe: mpData }, 500);
    }

    const qrBase64 = mpData?.point_of_interaction?.transaction_data?.qr_code_base64 || null;
    const copiaCola = mpData?.point_of_interaction?.transaction_data?.qr_code || null;

    if (!qrBase64 || !copiaCola) {
      console.error("Resposta do Mercado Pago sem QR Code:", JSON.stringify(mpData));
      return jsonResponse({ error: "Mercado Pago não retornou o QR Code Pix" }, 500);
    }

    // Salva no pedido
    await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedido_id}`, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        mp_payment_id: String(mpData.id),
        pix_qr_code_base64: qrBase64,
        pix_copia_cola: copiaCola,
      }),
    });

    return jsonResponse({
      mp_payment_id: mpData.id,
      qr_code_base64: qrBase64,
      copia_cola: copiaCola,
    });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Erro inesperado", detalhe: String(err) }, 500);
  }
});
