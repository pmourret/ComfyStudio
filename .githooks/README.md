# .githooks/

Git ne versionne pas `.git/hooks/` — ce dossier existe pour que le
pre-commit hook soit partagé avec le repo au lieu de vivre uniquement sur
ta machine.

## Activation (une fois par clone)

```
git config core.hooksPath .githooks
```

Le hook doit être exécutable (`chmod +x .githooks/pre-commit`) — déjà fait
si le mode fichier a survécu au commit, à revérifier sinon.
