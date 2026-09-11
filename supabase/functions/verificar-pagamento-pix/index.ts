// ============================================================
// Edge Function: verificar-pagamento-pix
// ------------------------------------------------------------
// Reforço pro webhook: o site chama essa function de tempos em
// tempos (a cada poucos segundos) enquanto o cliente está vendo
// o QR Code Pix na tela, perguntando pro Mercado Pago "esse
// pagamento já caiu?". Isso garante a confirmação mesmo se o
// aviso automático do Mercado Pago (webhook) não chegar por
// algum motivo de rede/configuração.
//
// Deploy:
//   supabase functions deploy verificar-pagamento-pix --no-verify-jwt
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

    const pedidoResp = await fetch(
      `${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedido_id}&select=id,mp_payment_id,pago`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );
    const pedidos = await pedidoResp.json();
    const pedido = pedidos?.[0];

    if (!pedido) return jsonResponse({ error: "Pedido não encontrado" }, 404);
    if (pedido.pago) return jsonResponse({ pago: true });
    if (!pedido.mp_payment_id) return jsonResponse({ pago: false });

    const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${pedido.mp_payment_id}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    const pagamento = await mpResp.json();

    if (pagamento?.status === "approved") {
      await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedido_id}`, {
        method: "PATCH",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ pago: true }),
      });
      return jsonResponse({ pago: true });
    }

    return jsonResponse({ pago: false, status_mp: pagamento?.status || null });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Erro inesperado", detalhe: String(err) }, 500);
  }
});
