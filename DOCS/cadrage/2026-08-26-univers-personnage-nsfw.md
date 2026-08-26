Mission

Q : Séparer les données de personnage (assets, réglages NSFW) du code versionné, en prévision d'un dépôt public un jour — d'accord sur le principe ? (pas bloquant maintenant, juste à acter)

R : Oui on sépare les données personnelles du dépôt distant

Univers
Q : 2. Sortir "Monde RPG" (lore/carte/PNJ/histoire/dialogue) de la V1, comme chantier à part entière pendant que les 3 autres univers avancent — d'accord ?
R : Oui on le sort de la V1 et on l'ajoute à la roadmap

Par personnage

Q : 3. "Registre de création" — je le lis comme : les types de contenu activés pour un personnage (image / vidéo-réel / voix / mise en scène à plusieurs), distinct de l'univers lui-même. C'est ça, ou tu vises autre chose ?
R : Oui distinct de l'univers lui même, l'univers décide des familles de modèles employés pour répondre au besoin du personnage, le type de contenu active les workflows correspondant en prenant en compte l'univers

Q : 4. Mise en scène de plusieurs personnages ensemble dans une même génération (implique plusieurs verrous d'identité actifs simultanément) — V1 ou repoussé en V2 ?
R : Repoussé en V2

Q : 5. NSFW "actif par défaut, pas une branche à part" — ça veut dire :

(a) chaque outil sait générer nativement en registre NSFW dès sa conception, ou
(b) on garde en interne le principe actuel de Léna (génération SFW puis édition NSFW), juste rendu invisible pour l'utilisateur — un seul bouton, le deux-temps reste caché
Un personnage nouvellement créé dans l'outil — NSFW activé par défaut, ou désactivé par défaut avec activation explicite à faire ? (pertinent surtout si le repo devient public un jour)
R : On garde le principe de Léna, reprise d'une image réelle, création NSFW manuelle (l'utilisateur sélectionne l'image et lance la création, il est ensuite en mesure de changer certaines choses via prompting et de traiter l'image par l'éditeur - Option activable dans le paramétrage de l'app, éteint par défaut. Donc le déroulement reste sur : Création d'une image de personnage > Reprise de l'image en NSFW > Edition par IA > Retouche si nécessaire (plus tard il faudra également se pencher sur la gestion de vidéos NSFW

Outils
Q : 7. Style de sortie (réaliste/fantastique/cartoon/manga) — figé par personnage à sa création, ou sélectionnable librement à chaque scène/génération ? (le deuxième complique le verrou d'identité, qui dépend aujourd'hui de la famille de modèle)
R : Figé par personnage à sa création, non modifiable

Autre chose :
- Intégration du protocole MCP pour les grosses IA généralistes
- Développement Backend et Frontend ++, l'application doit être impeccable et on doit pouvoir facilement repérer les bugs
