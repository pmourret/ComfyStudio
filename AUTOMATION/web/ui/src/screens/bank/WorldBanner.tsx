/* The world of the bank, in read-only.

   A scene is a composition INSIDE a world (ADR-0014). The world is frozen at
   the character's creation, like its type and its output style — no screen
   edits a sheet, and none exists to. This band says which world one is
   composing in, so the rule is visible BEFORE the server has to refuse
   something.

   IT ALSO SAYS WHEN THE FILE AND THE SHEET DISAGREE. Two cases, both real: a
   bank predating ADR-0014 carries no stamp at all, and a document pasted from
   another character carries a foreign one. Either way the next save comes back
   as a 400, and a banner that named neither would leave that refusal
   unexplained. */
export function WorldBanner({
  world,
  documentWorld,
}: {
  world: { id: string; label: string } | null
  documentWorld: string | null
}) {
  /* The sheet has not landed yet — say nothing rather than say « aucun ». */
  if (!world) return null
  const drift =
    documentWorld == null
      ? 'cette banque ne porte pas encore son monde — le prochain enregistrement sera refusé ' +
        'tant que la migration n’est pas passée'
      : documentWorld !== world.id
        ? `cette banque est estampillée « ${documentWorld} » : elle n’appartient pas à ce ` +
          'personnage, l’enregistrement la refusera'
        : null

  return (
    <div
      id="worldBanner"
      className="mb-[16px] flex flex-wrap items-baseline gap-x-[10px] gap-y-[4px]
                 rounded-card border border-line bg-panel2 px-[14px] py-[9px]"
    >
      <span className="text-[11px] tracking-[.6px] text-dim2 uppercase">Monde</span>
      <b className="text-[13.5px]" data-world={world.id}>
        {world.label}
      </b>
      <span className="tiny">
        figé à la création — toutes les scènes de cette banque s’y composent
      </span>
      {drift && (
        /* Never colour alone: the sentence carries the whole message, the
           warning tone only makes it findable. */
        <span className="w-full text-[12px] text-warn" data-world-drift>
          <span aria-hidden="true">⚠ </span>
          {drift}
        </span>
      )}
    </div>
  )
}
