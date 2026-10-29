# La P’tite Bulle

Landing page de La P’tite Bulle, une expérience P’tit Kiwi.

- **Écran 1** : la bulle naît à l’ouverture, suit la souris et prend une palette unique selon l’adresse tapée. Le formulaire se fait en deux temps : l’adresse du site dans la page, puis l’e-mail sur un second écran plein fenêtre (`#etape-2` : logo et nom au centre, merci, question, champ e-mail ; « Dernière étape, 2 sur 2 » et l’adresse du site sont annoncées aux lecteurs d’écran), qui masque la page de présentation. Les formulaires du haut et du bas ouvrent ce même écran ; « Modifier l’adresse » (en haut à gauche du second écran) ou le bouton retour du navigateur ramènent à l’adresse, au même endroit, sans rien effacer. L’adresse du site est enregistrée dès sa validation, puis l’e-mail complète la même demande (voir « Deux temps, une seule demande » plus bas). Au second écran : une coche verte quand l’e-mail est complet, une correction proposée pour les fautes de frappe courantes (gmial.com, hotmial.fr, orange.fe…), jamais imposée et calculée dans la page sans rien envoyer, et un lien « 4,9/5 · 30 avis sur Wix » qui ouvre le panneau Avis.
- **Écran 2** : au défilement, la section se fige brièvement et le rouleau repeint un site sobre en site plus affirmé, sur le même sujet (exemple illustratif : un fleuriste). Étiquettes « Aujourd’hui » puis « Et demain ? ».
- **Écran final** : « Prêt à découvrir votre futur site ? ». Sur ordinateur, le message tient dans une bulle entière (`.final-orb`) dont la taille suit la hauteur de la fenêtre (600 à 900 px, textes en unités `cqi`) : bord fin irisé, reflet en arc, légère ondulation, et cinq bulles d’arguments à éclater posées en pentagone sur le bord ; quand on en éclate une, la grande bulle frémit, et les reflets suivent un peu la souris (rien de tout cela en animations réduites ou en pause). Sur tablette et mobile, la bulle entoure le bloc et les arguments deviennent des pastilles. Le formulaire est le même que celui de la hero (état partagé), suivi d’une ligne d’offre (première maquette « sous 24 h ouvrées », création offerte) et d’un avis client ; la note Wix et le badge partenaire sont juste sous la bulle. La date limite des demandes est rappelée par le bandeau du haut et la FAQ.
- **Après une demande** : pendant l’enregistrement, le bouton affiche « Enregistrement… » avec une petite animation. Seule une réponse `{ ok: true }` de `/api/lead` compte comme un enregistrement réussi ; sinon, les champs restent remplis et le visiteur peut réessayer. Une même demande (site + e-mail) n’est envoyée qu’une fois par page, et le serveur ignore aussi les doublons (voir plus bas). Si l’attribut `data-endpoint` manque, la page affiche une erreur au lieu d’un succès.
- **Remerciement plein écran** (`<dialog id="merci">`) : il s’ouvre uniquement après un enregistrement confirmé, puis redirige dans le même onglet vers https://www.ptit-kiwi.fr/ au bout de 15 secondes (décompte suspendu quand l’onglet n’est pas visible). Le bouton principal, la croix et la touche Échap y mènent tout de suite ; « Prendre le temps de lire » annule la redirection automatique. Aucune donnée n’est ajoutée à l’adresse, et rien n’est installé sur le site P’tit Kiwi.
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

La clôture des demandes (« Offre limitée à 250 clients Wix · Demandes jusqu’au jeudi 29 octobre 2026 à 23 h 59, heure de Paris ») est écrite en texte fixe dans `index.html` : bandeau d’offre (versions longue et courtes), note sous le formulaire final, FAQ « Qui peut en profiter ? » et texte pour lecteurs d’écran du bandeau. Pour changer la date, modifiez ces quatre endroits. Aucun compte à rebours n’est actif et rien ne change automatiquement à l’échéance.

Facultatif : pour remettre un compte à rebours réel, ajoutez `data-end="AAAA-MM-JJTHH:MM:SSZ"` (heure UTC) sur `<div id="offer">` et rétablissez le minuteur dans le bandeau : à l’échéance, la page passe en mode « offre terminée ».

## Enregistrement des contacts (Vercel + Upstash Redis)

- `api/lead.js` reçoit chaque demande, vérifie l’adresse et l’e-mail, écarte les robots (champ piège, envois depuis un autre site, 8 demandes maximum par IP et par heure) et l’ajoute à la liste Redis `lpb:leads` (format inchangé : `id`, `date`, `site`, `email`, `type`, `origine`, `page`). Anti-doublon côté serveur : une même demande (type + site + e-mail, sans tenir compte de `https://`, `www.` ni des majuscules) n’est ajoutée qu’une fois sur 7 jours, grâce à une clé `lpb:doublon:…` écrite en même temps que la demande (script Redis atomique, avec repli si les scripts sont indisponibles). Si la réponse se perd et que le visiteur réessaie, le serveur répond `{ ok: true }` sans rien ajouter.
- **Deux temps, une seule demande** : dès que le visiteur valide l’adresse de son site (formulaire du haut ou du bas), la page envoie `{ etape: 'site', ref }` et la demande apparaît tout de suite dans `lpb:leads`, avec un e-mail vide (« e-mail en attente » sur la page Contacts). À l’étape 2, `{ etape: 'email', ref }` complète **la même ligne** (même `id`, même `date`) avec l’e-mail. `ref` est un identifiant de visite tiré au hasard et gardé en mémoire dans la page (rien n’est stocké dans le navigateur) ; côté serveur, la clé `lpb:visite:…` (7 jours) relie la visite à sa ligne. Si l’adresse est modifiée avant l’e-mail, la même ligne est mise à jour. Si la même demande (site + e-mail) existe déjà, la ligne en attente est retirée au lieu de créer un doublon. Sans `ref` (ancien format), une demande complète est créée comme avant. Limites : 8 nouvelles demandes par IP et par heure (étape 1 ou demande complète directe) et 8 ajouts d’e-mail. Champ piège rempli au second écran : faux succès et la ligne en attente de la visite est retirée.
- `api/leads.js` affiche les contacts, protégés par mot de passe : `https://la-ptite-bulle-lp.vercel.app/api/leads` (identifiant au choix, mot de passe = `ADMIN_PASSWORD`). Bouton « Télécharger en CSV » pour Excel, Numbers ou Google Sheets.

Mise en place (une seule fois, avant de déployer ce code) :
1. Vercel → projet → onglet **Storage** → **Create Database** → **Upstash for Redis** (offre gratuite), région européenne (Francfort ou Irlande) → la relier au projet, environnements Production et Preview. Les variables `KV_REST_API_URL` et `KV_REST_API_TOKEN` (ou `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) sont ajoutées automatiquement.
2. **Settings → Environment Variables** : ajouter `ADMIN_PASSWORD` (un mot de passe long).
3. Déployer (git push). Les variables ne s’appliquent qu’aux nouveaux déploiements.

Supprimer un contact (droit à l’effacement) : console Upstash → Data Browser → clé `lpb:leads` (la clé `lpb:visite:…` correspondante expire seule au bout de 7 jours).
