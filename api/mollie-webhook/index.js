/* ===================================================================
   POST /api/mollie-webhook
   Appelée par Mollie (pas par le navigateur du client) dès que le
   statut d'un paiement change. Mollie envoie le body en
   application/x-www-form-urlencoded : id=tr_xxxxxxxxxx

   IMPORTANT : on ne fait jamais confiance au statut envoyé par le
   client — on re-demande toujours le statut réel à l'API Mollie ici.
   =================================================================== */
module.exports = async function (context, req) {
  try {
    let paymentId = null;

    if (req.body && typeof req.body === "object") {
      paymentId = req.body.id;
    } else if (typeof req.body === "string") {
      paymentId = new URLSearchParams(req.body).get("id");
    }

    if (!paymentId) {
      context.res = { status: 400 };
      return;
    }

    const apiKey = process.env.MOLLIE_API_KEY;
    const mollieRes = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });
    const payment = await mollieRes.json();

    const meta = payment.metadata || {};
    const ref = meta.bookingRef || meta.giftRef || "ref-inconnue";
    const isGift = meta.type === "giftcard";

    if (payment.status === "paid") {
      if (isGift) {
        // TODO : générer un vrai code de bon cadeau et l'envoyer par email
        // à meta.toEmail (ex. via Azure Communication Services / Resend).
        context.log.info(`Bon cadeau payé — ${ref} — ${meta.amount}€ pour ${meta.toEmail}`);
      } else {
        // TODO : marquer la réservation `ref` comme confirmée en base
        // TODO : envoyer un email/SMS de confirmation à meta.email
        context.log.info(`Réservation confirmée — ${ref}`);
      }
    } else if (["expired", "canceled", "failed"].includes(payment.status)) {
      // TODO : si réservation, libérer la table réservée temporairement pour `ref`
      context.log.info(`Paiement ${payment.status} — ${ref}`);
    } else {
      context.log.info(`Statut intermédiaire "${payment.status}" — ${ref}`);
    }

    // Toujours répondre 200 à Mollie, sinon il réessaiera inutilement.
    context.res = { status: 200 };
  } catch (err) {
    context.log.error("Erreur mollie-webhook:", err);
    context.res = { status: 500 };
  }
};
