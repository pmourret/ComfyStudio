/* The world of the bank, in read-only — consolidated with the scene count
   (31/08/2026 layout pass): one band at the top of the screen instead of a
   world banner plus a separate « Scènes N » heading elsewhere.

   A scene is a composition INSIDE a world (ADR-0014). The world is frozen at
   the character's creation, like its type and its output style — no screen
   edits a sheet, and none exists to. This band says which world one is
   composing in, so the rule is visible BEFORE the server has to refuse
   something. The educational sentence that used to spell that out here
   ("figé à la création…") is gone — the sheet screen already carries it;
   this band's job now is just to orient (which world, how many scenes).

   IT ALSO SAYS WHEN THE FILE AND THE SHEET DISAGREE. Two cases, both real: a
   bank predating ADR-0014 carries no stamp at all, and a document pasted from
   another character carries a foreign one. Either way the next save comes back
   as a 400, and a banner that named neither would leave that refusal
   unexplained — this stays, it is a safety signal, not decoration. */
export function WorldBanner({
  world,
  documentWorld,
  sceneCount,
}: {
  world: { id: string; label: string } | null
  documentWorld: string | null
  sceneCount: number
}) {
  /* The sheet has not landed yet — say nothing rather than say « aucun ». */
  if (!world) return null
  const drift =
    documentWorld == null
      ? 'cet atelier ne porte pas encore son monde — le prochain enregistrement sera refusé ' +
        'tant que la migration n’est pas passée'
      : documentWorld !== world.id
        ? `cet atelier est estampillé « ${documentWorld} » : il n’appartient pas à ce ` +
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
      <span className="text-[13px] text-dim2">·</span>
      <span className="text-[13px] text-dim">
        Scènes présentes : <b className="text-txt">{sceneCount}</b>
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
