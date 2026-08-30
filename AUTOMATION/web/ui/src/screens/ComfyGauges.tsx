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
  return (
    <div>
      <div className="sonde-t">
        <span>
          {title}
          {detail ? ` · ${detail}` : ''}
        </span>
        <span className="sonde-v">
          {gb(used)} / {gb(total)} Go · {p}%
        </span>
      </div>
      <div className={`sonde-b${level ? ' ' + level : ''}`}>
        <i style={{ width: `${Math.min(100, p)}%` }} />
      </div>
    </div>
  )
}

/* Driver readings (temperature, load, power). Absent on a machine without
   nvidia-smi: the line disappears and the rest stands. */
function DriverReadings({ gpu }: { gpu: GpuProbe }) {
  return (
    <div className="sonde-gpu">
      {gpu.temperature != null && (
        <span>
          température <b>{gpu.temperature} °C</b>
        </span>
      )}
      {gpu.charge != null && (
        <span>
          charge <b>{gpu.charge} %</b>
        </span>
      )}
      {gpu.puissance != null && (
        <span>
          consommation <b>{gpu.puissance.toFixed(0)} W</b>
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
        <p className="sonde-ko">
          ComfyUI ne répond pas — la mémoire vive qu'il rapporte est donc inconnue.
          {anything ? ' Le reste vient du pilote.' : ''}
        </p>
        {anything && (
          <div className="sondes" style={{ marginTop: 12 }}>
            {vram && <Gauge title="VRAM" used={vram.utilisee} total={vram.total} detail={gpu?.nom || ''} />}
            {gpu && <DriverReadings gpu={gpu} />}
          </div>
        )}
      </>
    )
  }

  return (
    <div className="sondes" id="comfyStats">
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
        <p className="sonde-ko" style={{ margin: 0 }}>
          Température et charge indisponibles — elles viennent de{' '}
          <code>nvidia-smi</code>, absent sur cette machine.
        </p>
      )}
    </div>
  )
}
