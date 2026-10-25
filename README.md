# La P’tite Bulle

Landing page de La P’tite Bulle, une expérience P’tit Kiwi.

- **Écran 1** : la bulle naît à l’ouverture, suit la souris et prend une palette unique selon l’adresse tapée. Le formulaire se fait en deux temps (adresse ou activité, puis e-mail).
- **Écran 2** : au défilement, la section se fige et le rouleau repeint un site daté en site moderne.
- **Avis et FAQ** : panneaux natifs (`<dialog>`) qui s’ouvrent par-dessus la page.

Site statique en HTML, CSS et JavaScript, sans étape de construction. Les polices (Manrope, Bricolage Grotesque, Caveat, licence OFL) sont hébergées dans `fonts/`.

## Recevoir les demandes

Le formulaire est simulé tant que `data-endpoint` est vide (`index.html`, balise `<form id="bulle-form">`).
Indiquez une adresse qui accepte un envoi JSON en POST, par exemple un formulaire Formspree (`https://formspree.io/f/xxxxxx`), Web3Forms ou un webhook.

Données envoyées : `type` (site ou activité), `site`, `email`, `page`, `date`. Un champ piège invisible (`website`) écarte les robots.

## À compléter avant de diffuser

- **Avis clients** : collez vos avis dans le panneau Avis, puis retirez l’attribut `hidden` de la liste `.reviews` et du lien vers votre fiche Wix.
- **Mentions légales et confidentialité** : obligatoires dès qu’on collecte des e-mails. Ajoutez le lien dans le pied de page (emplacement indiqué en commentaire).
- **Phrase sur les données** (étape 2 du formulaire) : à vérifier selon votre politique réelle.

## Mise en ligne

Hébergé sur Vercel : chaque `git push` sur `main` met le site à jour.
