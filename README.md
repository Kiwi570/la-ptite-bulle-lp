# La P’tite Bulle

Landing page de La P’tite Bulle, une expérience P’tit Kiwi.

- **Écran 1** : la bulle naît à l’ouverture, suit la souris et prend une palette unique selon l’adresse tapée. Le formulaire se fait en deux temps (adresse ou activité, puis e-mail).
- **Écran 2** : au défilement, la section se fige brièvement et le rouleau repeint un site sobre en site plus affirmé, sur le même sujet (exemple illustratif : un fleuriste). Étiquettes « Aujourd’hui » puis « Et demain ? ».
- **Écran final** : « Prêt à souffler votre bulle ? », avec une bulle géante qui monte au défilement, le même formulaire que la hero (état partagé entre les deux), le délai de la première maquette (« sous 24 h ouvrées », sans heure précise affichée), la date limite des demandes et des bulles d’arguments à faire éclater.
- **Après une demande** : pendant l’enregistrement, le bouton affiche « Enregistrement… » avec une petite animation. Seule une réponse `{ ok: true }` de `/api/lead` compte comme un enregistrement réussi ; sinon, les champs restent remplis et le visiteur peut réessayer. Une même demande (site + e-mail) n’est envoyée qu’une fois par page.
- **Remerciement plein écran** (`<dialog id="merci">`) : il s’ouvre uniquement après un enregistrement confirmé, puis redirige dans le même onglet vers https://www.ptit-kiwi.fr/ au bout de 10 secondes (décompte suspendu quand l’onglet n’est pas visible). Le bouton principal, la croix et la touche Échap y mènent tout de suite ; « Prendre le temps de lire » annule la redirection automatique. Aucune donnée n’est ajoutée à l’adresse, et rien n’est installé sur le site P’tit Kiwi.
- **Avis et FAQ** : panneaux natifs (`<dialog>`) qui s’ouvrent par-dessus la page. Le panneau Avis reprend mot pour mot les 30 avis de la fiche partenaire Wix de P’tit Kiwi (https://fr.wix.com/studio/community/partners/kiwix), du plus récent au plus ancien : à mettre à jour à la main quand un nouvel avis est publié (note et nombre d’avis compris).

Site statique en HTML, CSS et JavaScript, sans étape de construction. Les polices (Manrope, Bricolage Grotesque, Caveat, licence OFL) sont hébergées dans `fonts/`.

## Recevoir les demandes

Les deux formulaires envoient les demandes à `/api/lead` (attribut `data-endpoint` de `<form id="lp-form">`, utilisé aussi par le formulaire du bas).
Indiquez une adresse qui accepte un envoi JSON en POST, par exemple un formulaire Formspree (`https://formspree.io/f/xxxxxx`), Web3Forms ou un webhook.

Données envoyées : `type` (site ou activité), `site`, `email`, `origine` (hero ou final), `page`, `date`. Un champ piège invisible (`lp_hp`) écarte les robots côté navigateur ; à transmettre au service de réception sous le nom qu’il attend (par exemple `botcheck` pour Web3Forms, `_gotcha` pour Formspree).

## À compléter avant de diffuser

- **Mentions légales et confidentialité** : obligatoires dès qu’on collecte des e-mails. Ajoutez le lien dans le pied de page (emplacement indiqué en commentaire).
- **Phrase sur les données** (étape 2 du formulaire) : à vérifier selon votre politique réelle.

## Mise en ligne

Hébergé sur Vercel : chaque `git push` sur `main` met le site à jour.

## Date de fin

La clôture des demandes (« Offre limitée à 250 clients Wix · Demandes jusqu’au mercredi 28 octobre 2026 à 23 h 59, heure de Paris ») est écrite en texte fixe dans `index.html` : bandeau d’offre (versions longue et courtes), note sous le formulaire final, FAQ « Qui peut en profiter ? » et texte pour lecteurs d’écran du bandeau. Pour changer la date, modifiez ces quatre endroits. Aucun compte à rebours n’est actif et rien ne change automatiquement à l’échéance.

Facultatif : pour remettre un compte à rebours réel, ajoutez `data-end="AAAA-MM-JJTHH:MM:SSZ"` (heure UTC) sur `<div id="offer">` et rétablissez le minuteur dans le bandeau : à l’échéance, la page passe en mode « offre terminée ».

## Enregistrement des contacts (Vercel + Upstash Redis)

- `api/lead.js` reçoit chaque demande, vérifie l’adresse et l’e-mail, écarte les robots (champ piège, envois depuis un autre site, 8 demandes maximum par IP et par heure) et l’ajoute à la liste Redis `lpb:leads`.
- `api/leads.js` affiche les contacts, protégés par mot de passe : `https://la-ptite-bulle-lp.vercel.app/api/leads` (identifiant au choix, mot de passe = `ADMIN_PASSWORD`). Bouton « Télécharger en CSV » pour Excel, Numbers ou Google Sheets.

Mise en place (une seule fois, avant de déployer ce code) :
1. Vercel → projet → onglet **Storage** → **Create Database** → **Upstash for Redis** (offre gratuite), région européenne (Francfort ou Irlande) → la relier au projet, environnements Production et Preview. Les variables `KV_REST_API_URL` et `KV_REST_API_TOKEN` (ou `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) sont ajoutées automatiquement.
2. **Settings → Environment Variables** : ajouter `ADMIN_PASSWORD` (un mot de passe long).
3. Déployer (git push). Les variables ne s’appliquent qu’aux nouveaux déploiements.

Supprimer un contact (droit à l’effacement) : console Upstash → Data Browser → clé `lpb:leads`.
