/* The banner probes: an icon and a value, the rest in the tooltip.

   Ported from `peindreBandeau` in `static/sondes.js`. A 56 px banner has no room
   for one label per probe, and three labels there would be noise.

   WHAT IS KNOWN, and where it comes from — the three probes have different
   sources, so different lifetimes:

     - RAM  : /system_stats, so ComfyUI. It goes down, the probe disappears.
     - VRAM : BOTH know it. We prefer ComfyUI's figure (the one its generation
              sees) and fall back on nvidia-smi when it stops answering.
     - T°C  : nvidia-smi alone, always.

   Observed on 30/08 while building the banner: ComfyUI stopped, everything
   vanished — while the card still reported 1.6 GB held and 53 °C. Those are
   facts about the MACHINE, not about ComfyUI, and it is precisely when ComfyUI
   is down that one wants to know whether something is holding the VRAM. So we
   show what we know, and nothing more. */
import { useComfyStats, type ComfyStats } from '../state/ComfyStatsContext'
import { Icon } from './Icon'

/* The `gpu` field is `Optional[Any]` in the Pydantic model, so the generated
   schema types it as unknown. This is the narrow shape the UI actually READS —
   local on purpose, like the journal rows: writing it into the backend model
   would freeze a probe payload that varies with the driver. */
type GpuProbe = {
  nom?: string | null
  temperature?: number | null
  charge?: number | null
  puissance?: number | null
  vram_totale?: number | null
  vram_utilisee?: number | null
}

type Memory = { total: number; utilisee: number; nom?: string | null }

/** GB, not GiB: the unit nvidia-smi and the spec sheets use, so the one the
    user recognises on their own card. */
const gb = (bytes: number) => (bytes / 1e9).toFixed(1)
const percent = (used: number, total: number) => (total > 0 ? Math.round((100 * used) / total) : 0)

/* Two thresholds, not a gradient. For memory it is a measurable fact: beyond
   90 % a generation can fail for want of VRAM. For temperature, the usual steps
   of a consumer card before throttling. */
const memoryLevel = (p: number) => (p >= 90 ? 'haut' : p >= 70 ? 'mid' : '')
const tempLevel = (t: number) => (t >= 83 ? 'haut' : t >= 72 ? 'mid' : '')

function known(stats: ComfyStats | null) {
  if (!stats) return { ram: null, vram: null, gpu: null }
  const gpu = (stats.gpu ?? null) as GpuProbe | null
  const ram = (stats.en_ligne && stats.ram?.total ? stats.ram : null) as Memory | null
  const vram: (Memory & { source: 'comfy' | 'pilote' }) | null =
    stats.en_ligne && stats.vram?.total
      ? { ...(stats.vram as Memory), source: 'comfy' }
      : gpu?.vram_totale
        ? {
            utilisee: gpu.vram_utilisee ?? 0,
            total: gpu.vram_totale,
            nom: gpu.nom,
            source: 'pilote',
          }
        : null
  return { ram, vram, gpu }
}

/* `tabIndex=0` because the tooltip shows on focus too — a reading that exists
   only on hover would be lost to keyboard navigation. */
function Probe({ icon, value, hint, level }: { icon: string; value: string; hint: string; level: string }) {
  return (
    <span className={`sonde-hd${level ? ' ' + level : ''}`} tabIndex={0} data-hint-text={hint}>
      <Icon name={icon} className="sonde-hd-ic" />
      <b>{value}</b>
    </span>
  )
}

export function ProbeStrip() {
  const { stats } = useComfyStats()
  const { ram, vram, gpu } = known(stats)

  return (
    <div className="sondes-hd" id="sondesHd">
      {ram && (
        <Probe
          icon="ram"
          value={`${percent(ram.utilisee, ram.total)} %`}
          hint={`Mémoire vive — ${gb(ram.utilisee)} / ${gb(ram.total)} Go utilisés`}
          level={memoryLevel(percent(ram.utilisee, ram.total))}
        />
      )}
      {vram && (
        <Probe
          icon="vram"
          value={`${percent(vram.utilisee, vram.total)} %`}
          hint={
            `Mémoire de la carte (VRAM) — ${gb(vram.utilisee)} / ${gb(vram.total)} Go utilisés · ` +
            `${gpu?.nom || vram.nom || 'carte graphique'}` +
            (vram.source === 'pilote' ? ' · relevé par le pilote, ComfyUI étant arrêté' : '')
          }
          level={memoryLevel(percent(vram.utilisee, vram.total))}
        />
      )}
      {/* Absent on a machine without nvidia-smi, and that is a normal case: we
          drop the probe rather than show a dash that would read as a failure.
          The Application screen, itself, SAYS why it is missing. */}
      {gpu?.temperature != null && (
        <Probe
          icon="temp"
          value={`${Math.round(gpu.temperature)} °C`}
          hint={
            `Température du GPU — ${gpu.nom || 'carte graphique'}` +
            (gpu.charge != null ? ` · charge ${gpu.charge} %` : '') +
            (gpu.puissance != null ? ` · ${gpu.puissance.toFixed(0)} W` : '')
          }
          level={tempLevel(gpu.temperature)}
        />
      )}
    </div>
  )
}
