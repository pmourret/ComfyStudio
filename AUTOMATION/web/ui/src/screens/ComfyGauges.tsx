/* The detailed view of the probes — the Application screen's half of the pair.
   Ported from `peindreApplication` in `static/sondes.js`.

   ONE CALL, TWO SURFACES. The banner (compact, ProbeStrip) and this one read the
   SAME result, held by ComfyStatsContext. Two fetches for the same data would
   double the nvidia-smi spawns and could show two truths. */
import type { ComfyStats } from '../state/ComfyStatsContext'

/* `gpu` is `Optional[Any]` in the Pydantic model, deliberately: it is a driver
   payload that varies. This is the narrow shape this view READS. */
type GpuProbe = {
  nom?: string | null
  temperature?: number | null
  charge?: number | null
  puissance?: number | null
  vram_totale?: number | null
  vram_utilisee?: number | null
}

type Memory = { total: number; utilisee: number; nom?: string | null }

/** GB, not GiB — the unit nvidia-smi and the spec sheets use. */
const gb = (bytes: number) => (bytes / 1e9).toFixed(1)
const percent = (used: number, total: number) => (total > 0 ? Math.round((100 * used) / total) : 0)
const memoryLevel = (p: number) => (p >= 90 ? 'haut' : p >= 70 ? 'mid' : '')

function Gauge({
  title,
  used,
  total,
  detail,
}: {
  title: string
  used: number
  total: number
  detail?: string
}) {
  const p = percent(used, total)
  const level = memoryLevel(p)
  /* Colour never carries the reading alone — the figure sits right next to the
     bar. Same steps as the banner probes (ProbeStrip). */
  const fill = level === 'haut' ? 'bg-bad' : level === 'mid' ? 'bg-warn' : 'bg-ok'
  return (
    <div data-gauge>
      <div className="flex items-baseline justify-between text-[12.5px] text-dim mb-[5px]">
        <span data-gauge-title>
          {title}
          {detail ? ` · ${detail}` : ''}
        </span>
        <span className="text-txt tabular-nums" data-gauge-value>
          {gb(used)} / {gb(total)} Go · {p}%
        </span>
      </div>
      <div className="h-[8px] overflow-hidden rounded-[4px] bg-panel2">
        <i
          className={`block h-full rounded-[4px] transition-[width] duration-300 ease-[ease] ${fill}`}
          style={{ width: `${Math.min(100, p)}%` }}
        />
      </div>
    </div>
  )
}

/* Driver readings (temperature, load, power). Absent on a machine without
   nvidia-smi: the line disappears and the rest stands. */
function DriverReadings({ gpu }: { gpu: GpuProbe }) {
  return (
    <div className="mt-[2px] flex flex-wrap gap-[18px] text-[12.5px] text-dim">
      {gpu.temperature != null && (
        <span>
          température <b className="font-semibold text-txt tabular-nums">{gpu.temperature} °C</b>
        </span>
      )}
      {gpu.charge != null && (
        <span>
          charge <b className="font-semibold text-txt tabular-nums">{gpu.charge} %</b>
        </span>
      )}
      {gpu.puissance != null && (
        <span>
          consommation <b className="font-semibold text-txt tabular-nums">{gpu.puissance.toFixed(0)} W</b>
        </span>
      )}
    </div>
  )
}

export function ComfyGauges({ stats }: { stats: ComfyStats | null }) {
  const gpu = (stats?.gpu ?? null) as GpuProbe | null

  /* ComfyUI stopped: say it, then show what the DRIVER still knows (VRAM,
     temperature). An empty panel would suggest we know nothing — while the card
     may still report memory held and a real temperature, which is exactly when
     one wants to know whether something is holding the VRAM. */
  if (!stats || !stats.en_ligne) {
    const vram: Memory | null = gpu?.vram_totale
      ? { utilisee: gpu.vram_utilisee ?? 0, total: gpu.vram_totale, nom: gpu.nom }
      : null
    const anything = vram || gpu
    return (
      <>
        <p className="mt-[2px] mb-[18px] text-[12.5px] text-dim2">
          ComfyUI ne répond pas — la mémoire vive qu'il rapporte est donc inconnue.
          {anything ? ' Le reste vient du pilote.' : ''}
        </p>
        {anything && (
          <div className="mt-[12px] mb-[18px] flex flex-col gap-[12px]" data-probes>
            {vram && <Gauge title="VRAM" used={vram.utilisee} total={vram.total} detail={gpu?.nom || ''} />}
            {gpu && <DriverReadings gpu={gpu} />}
          </div>
        )}
      </>
    )
  }

  return (
    <div className="mt-[2px] mb-[18px] flex flex-col gap-[12px]" id="comfyStats" data-probes>
      {stats.vram && (
        <Gauge
          title="VRAM"
          used={stats.vram.utilisee}
          total={stats.vram.total}
          detail={gpu?.nom || ''}
        />
      )}
      {stats.ram && <Gauge title="RAM" used={stats.ram.utilisee} total={stats.ram.total} />}
      {gpu ? (
        <DriverReadings gpu={gpu} />
      ) : (
        <p className="m-0 text-[12.5px] text-dim2">
          Température et charge indisponibles — elles viennent de{' '}
          <code>nvidia-smi</code>, absent sur cette machine.
        </p>
      )}
    </div>
  )
}
