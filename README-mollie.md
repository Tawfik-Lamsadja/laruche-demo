# Intégration Mollie — La Ruche

## Structure ajoutée

```
laruche-demo.html              (formulaire de réservation mis à jour)
api/
  host.json
  package.json
  create-payment/
    function.json
    index.js
  mollie-webhook/
    function.json
    index.js
  local.settings.json.example  (à copier en local.settings.json, ne JAMAIS committer)
```

Le dossier `api/` est reconnu automatiquement par Azure Static Web Apps comme des
"managed functions" — pas besoin d'une Function App séparée ni de la payer.

## Mise en place

1. **Compte Mollie** : créer un compte sur mollie.com, récupérer la clé API de
   **test** (commence par `test_...`) dans le tableau de bord → Développeurs.

2. **Variable d'environnement en production** : sur le portail Azure, dans la
   ressource Static Web App → *Configuration* → ajouter
   `MOLLIE_API_KEY` = ta clé Mollie. Ne jamais la mettre dans le code ou dans
   `staticwebapp.config.json`.

3. **Test en local** (optionnel, nécessite Azure Functions Core Tools +
   SWA CLI) :
   ```bash
   cp api/local.settings.json.example api/local.settings.json
   # éditer api/local.settings.json avec ta clé test_...
   swa start laruche-demo.html --api-location api
   ```
   Le webhook Mollie a besoin d'une URL HTTPS publique — en local, utiliser
   un tunnel (ex. `ngrok http 4280`) et coller l'URL ngrok comme origine, ou
   simplement tester directement en environnement de préproduction Azure.

4. **Déploiement** : une fois le workflow GitHub Actions en place (prochain
   chantier), `app_location` reste `/` (ou le dossier du HTML) et
   `api_location: "api"` — c'est ce qui active automatiquement ces fonctions.

## Tester un paiement

En clé de test, Mollie fournit une page de simulation où on choisit
manuellement le statut (payé / annulé / échoué) — aucune carte réelle
nécessaire. Après un paiement "payé" en test, vérifier dans les logs de la
fonction `mollie-webhook` (portail Azure → Functions → Monitor) que le
statut `paid` a bien été reçu.

## Ce qu'il reste à faire avant la mise en prod réelle

- **Persistance** : les fonctions actuelles ne stockent rien — le `TODO`
  dans `create-payment/index.js` et `mollie-webhook/index.js` indique où
  brancher une base (Azure Table Storage suffit largement pour ce volume)
  pour que la table ne redevienne pas "disponible" pour un autre client
  entre le clic sur "payer" et la confirmation webhook.
- **Email de confirmation** au client après paiement confirmé (ex. via
  Azure Communication Services ou un service comme Resend/SendGrid).
- **Basculer la clé `test_...` vers la clé `live_...`** une fois validé.
