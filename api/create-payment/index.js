/* ===================================================================
   POST /api/create-payment
   Point d'entrée unique pour tout paiement Mollie du site : l'acompte
   de réservation ET les bons cadeaux, distingués par req.body.type.
   Renvoie l'URL de checkout vers laquelle rediriger le client.

   Variable d'environnement requise en fonctionnement normal :
   MOLLIE_API_KEY (Application settings de la Static Web App, jamais
   commitée dans le repo).

   MODE DÉMO — DEMO_MODE=true
   Tant que La Ruche n'a pas de compte Mollie professionnel (KBO/TVA
   requis même en mode test), cette variable bascule vers un simulateur
   local (/mock-checkout.html) au lieu d'appeler la vraie API Mollie.
   Volontairement verrouillé derrière une variable SÉPARÉE de
   MOLLIE_API_KEY : l'absence de clé Mollie seule ne suffit jamais à
   activer la simulation, pour éviter qu'un oubli de configuration en
   prod ne fasse passer un vrai client par un faux paiement. Pour
   repasser en réel : retirer DEMO_MODE et renseigner MOLLIE_API_KEY.
   =================================================================== */
module.exports = async function (context, req) {
  try {
    const body = req.body || {};
    const type = body.type === "giftcard" ? "giftcard" : "reservation";
    const demoMode = process.env.DEMO_MODE === "true";
    const origin = req.headers.origin || `https://${req.headers.host}`;

    let payload;

    if (type === "giftcard") {
      const amountNum = parseFloat(body.amount);
      if (!amountNum || amountNum < 5 || amountNum > 500) {
        context.res = { status: 400, body: { error: "Montant du bon cadeau invalide (entre 5€ et 500€)." } };
        return;
      }
      if (!body.toEmail) {
        context.res = { status: 400, body: { error: "Email du destinataire requis." } };
        return;
      }

      const giftRef = `LR-GIFT-${Date.now()}`;
      payload = {
        amount: { currency: "EUR", value: amountNum.toFixed(2) },
        description: `La Ruche — Bon cadeau ${giftRef}`,
        redirectUrl: `${origin}/?gift=${giftRef}&status=merci`,
        webhookUrl: `${origin}/api/mollie-webhook`,
        metadata: {
          type: "giftcard",
          giftRef,
          amount: amountNum,
          fromName: body.fromName || "",
          toEmail: body.toEmail
        }
      };
    } else {
      const { date, slot, table, party, name, phone, email } = body;
      if (!date || !slot || !table || !party || !email) {
        context.res = { status: 400, body: { error: "Champs manquants (date, slot, table, party, email requis)." } };
        return;
      }
      const partyNum = parseInt(party, 10);
      if (!partyNum || partyNum < 1 || partyNum > 10) {
        context.res = { status: 400, body: { error: "Nombre de personnes invalide." } };
        return;
      }

      const bookingRef = `LR-${Date.now()}`;
      const deposit = (partyNum * 10).toFixed(2);
      payload = {
        amount: { currency: "EUR", value: deposit },
        description: `La Ruche — Acompte réservation ${bookingRef}`,
        redirectUrl: `${origin}/?booking=${bookingRef}&status=merci`,
        webhookUrl: `${origin}/api/mollie-webhook`,
        metadata: {
          type: "reservation",
          bookingRef,
          date, slot, table,
          party: partyNum,
          name: name || "",
          phone: phone || "",
          email
        }
      };
    }

    const ref = payload.metadata.bookingRef || payload.metadata.giftRef;

    // ---- MODE DÉMO : simulateur local, aucun appel à Mollie ----
    if (demoMode) {
      context.log.info(`[DEMO_MODE] Paiement simulé — ${ref} — ${payload.amount.value}€`);
      const mockParams = new URLSearchParams({
        amount: payload.amount.value,
        ref: ref,
        kind: type,
        success_url: payload.redirectUrl,
        cancel_url: `${origin}/`
      });
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: { checkoutUrl: `${origin}/mock-checkout.html?${mockParams.toString()}`, ref }
      };
      return;
    }

    // ---- MODE RÉEL : vrai paiement Mollie ----
    const apiKey = process.env.MOLLIE_API_KEY;
    if (!apiKey) {
      context.log.error("MOLLIE_API_KEY absente des variables d'environnement.");
      context.res = { status: 500, body: { error: "Configuration de paiement manquante côté serveur." } };
      return;
    }

    const mollieRes = await fetch("https://api.mollie.com/v2/payments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await mollieRes.json();

    if (!mollieRes.ok) {
      context.log.error("Erreur API Mollie:", data);
      context.res = { status: 502, body: { error: "Erreur lors de la création du paiement Mollie." } };
      return;
    }

    // TODO (avant mise en prod réelle) : enregistrer ici la réservation ou
    // le bon cadeau avec le statut "en attente de paiement" dans une base
    // (Azure Table Storage suffit largement pour ce volume), clé =
    // metadata.bookingRef ou metadata.giftRef. Le webhook mollie-webhook
    // viendra la passer à "confirmée(e)". Sans ça : côté réservation, une
    // table peut être "prise" sans que ça se reflète dans le plan de
    // salle ; côté bon cadeau, aucun code cadeau n'est réellement généré
    // ni envoyé au destinataire.

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { checkoutUrl: data._links.checkout.href, ref }
    };
  } catch (err) {
    context.log.error("Erreur create-payment:", err);
    context.res = { status: 500, body: { error: "Erreur serveur." } };
  }
};
