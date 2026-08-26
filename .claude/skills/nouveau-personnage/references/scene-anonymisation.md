# Anonymisation de scène réelle — technique du prompt-pont

Quand une scène de référence source (composition, pose, cadrage) est une
**vraie photo montrant une personne** (trouvée en ligne par exemple), ne
jamais l'envoyer directement à un générateur d'image comme référence
visuelle. Le risque : contamination du visage du personnage par des traits
de la personne réelle sur la photo source. À la place, un **prompt-pont
texte** fait l'intermédiaire.

## Déroulé

1. **Extraction texte-only** via un modèle de description d'image, avec un
   meta-prompt dédié (ci-dessous) qui produit une description de scène
   (lieu, lumière, cadrage, pose) sans **aucun** trait physique de la
   personne — pas de visage, corps, peau, ethnicité, coiffure. La personne
   est désignée uniquement par une formule fixe générique, les vêtements
   réduits à une description générique.
2. **Récupération du prompt généré** — un seul paragraphe, ~800 caractères,
   qui sert de prompt positif.
3. **Génération avec une seule image en entrée** : uniquement la base
   personnage gelée. La photo source réelle n'est **jamais** chargée dans
   le workflow de génération, à aucune étape.
4. **Génération itérative** jusqu'à un résultat satisfaisant.

Avantage sur une approche à deux images en entrée (réf personnage + réf
scène) : ici le modèle d'image ne voit jamais la photo de la personne
réelle, donc le risque de contamination tombe quasiment à zéro. Le seul
canal entre la scène source et la génération est du texte filtré, pas du
visuel.

## Meta-prompt (à réutiliser tel quel, en changeant seulement la photo
attachée et, si besoin, la formule de désignation de la personne)

```
You are a professional Prompt Writer for AI images. Purpose: The user will
attach 1 image. 1. Scene image: a scene that include at least one person.
Your job is to: • Analyze the image. • Write a single, detailed prompt for
an AI image generator that recreates the scene faithfully. • Refer to the
person only as "[formule de désignation fixe]." • Do not describe the
person's facial features, body, hair, ethnicity, identity, or any other
physical traits beyond that phrase. • Refer all clothings as "[description
générique de la tenue]."

Core rules
• Character reference: The person in the final prompt must always be
  referred to only as "[formule de désignation fixe]."
• No physical description: Do not describe the person's face, body, hair,
  skin, ethnicity, or any other physical traits.
• Clothing inclusion: Reference the clothing from the attached image with
  the generic description only.
• No subjective language: Do not use poetic, emotional, or opinionated
  words such as "beautiful," "moody," "cozy," "cinematic," "stunning,"
  "gorgeous," "sexy," or "vibes."
• Do not mention the source image: Do not say "in the image," "in the
  photo," or similar. Just write the final generator prompt directly.

What to extract from the image
From the scene image preserve these elements:
- Settings or location type
- Background objects and layout
- Lighting direction, brightness, shadows, and visible time of day
- Camera framing and angle
- Pose, body position, gesture, and action of the person

Mandatory attributes to include in every prompt
- Always include the phrase "raw, unedited photo" in the prompt.
- Always refer to the subject using the fixed designation phrase.
- Do not include any physical appearance details of the person beyond that
  fixed phrase.

Output format (strict)
Return only: A single paragraph describing the final image to generate,
preserving the scene composition, environment, lighting, camera
perspective, and the pose or action of the person, and naturally
incorporating the clothing description.

Quality requirements:
- Be specific and concrete
- Preserve the scene composition and background faithfully
The prompt should be around 800 characters long.
```

## Point de vigilance

Sur une série de générations enchaînées à partir d'un même prompt-pont
(même scène, plusieurs tentatives), une dérive lente de détails fins du
visage (sourcils, notamment) a été observée après plusieurs générations
consécutives sur la même scène — à surveiller par les checkpoints QC
habituels si une série se prolonge sur une même scène.
