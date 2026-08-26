# ADR-0007 : Toute exposition MCP reste lecture et validation seule

## Statut

Accepté (2026-08-26)

## Contexte

Un serveur MCP existe déjà côté Léna (`AUTOMATION/mcp_lena.py`), conçu dès
le départ pour n'exposer que des outils de lecture et de validation —
aucune génération, aucune écriture, rien de la branche NSFW.

## Décision

Ce principe est étendu à toute exposition MCP future de la plateforme,
quel que soit l'univers ou l'outil concerné : lecture et validation
seulement, jamais un raccourci qui court-circuite QC, tri ou garde-fous.

## Alternatives envisagées

- **Exposer certaines actions d'écriture ou de génération via MCP**, pour
  faciliter l'intégration avec des assistants généralistes — écarté : ça
  romprait la garantie que toute génération passe par QC et tri, quel que
  soit le confort gagné côté intégration.

## Conséquences

Toute nouvelle capacité MCP ajoutée à la plateforme se vérifie contre
cette règle avant d'être exposée, y compris quand un cas d'usage rendrait
une exception tentante.
