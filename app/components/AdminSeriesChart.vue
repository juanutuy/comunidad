<script setup lang="ts">
// Gráfica de series temporales del Panel (Fase 13): SVG inline propio,
// sin librerías de gráficas. Recibe 1 o 2 series con sus etiquetas ya
// formateadas y dibuja las líneas (con un área suave bajo la serie
// cuando hay una sola), una grilla mínima y las etiquetas del eje
// (primera, central y última). Si todos los valores son cero muestra
// el estado vacío que le pasen: el Panel nunca dibuja datos falsos.
const props = defineProps<{
  series: { label: string, color: string, values: number[] }[]
  labels: string[]
  emptyText?: string
}>()

const W = 640
const H = 200
const PAD_L = 30
const PAD_R = 10
const PAD_T = 12
const PAD_B = 24
const plotW = W - PAD_L - PAD_R
const plotH = H - PAD_T - PAD_B

const maxValue = computed(() => Math.max(1, ...props.series.flatMap(s => s.values)))
const hasData = computed(() => props.series.some(s => s.values.some(v => v > 0)))
const n = computed(() => props.labels.length)

function x(i: number) {
  return n.value <= 1 ? PAD_L + plotW / 2 : PAD_L + (i * plotW) / (n.value - 1)
}
function y(v: number) {
  return PAD_T + plotH - (v / maxValue.value) * plotH
}
function linePoints(values: number[]) {
  return values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
}
function areaPoints(values: number[]) {
  if (!values.length) return ''
  const base = PAD_T + plotH
  return `${PAD_L},${base} ${linePoints(values)} ${x(values.length - 1).toFixed(1)},${base}`
}
const axisIdx = computed(() => {
  if (n.value <= 1) return [0]
  const mid = Math.floor((n.value - 1) / 2)
  return [...new Set([0, mid, n.value - 1])]
})
const gridVals = computed(() => [...new Set([0, Math.round(maxValue.value / 2), maxValue.value])])
</script>

<template>
  <div>
    <div class="mb-2 flex flex-wrap gap-4">
      <span v-for="s in series" :key="s.label" class="flex items-center gap-1.5 text-xs text-muted">
        <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: s.color }" /> {{ s.label }}
      </span>
    </div>
    <p v-if="!hasData" class="py-8 text-center text-sm text-muted">
      {{ emptyText || 'Sin datos en este período' }}
    </p>
    <svg v-else :viewBox="`0 0 ${W} ${H}`" class="w-full" role="img" :aria-label="series.map(s => s.label).join(' y ')">
      <g v-for="gv in gridVals" :key="gv">
        <line :x1="PAD_L" :x2="W - PAD_R" :y1="y(gv)" :y2="y(gv)" stroke="#9ca3af" stroke-opacity="0.25" stroke-dasharray="3 3" />
        <text :x="PAD_L - 5" :y="y(gv) + 3" text-anchor="end" font-size="10" fill="#9ca3af">{{ gv }}</text>
      </g>
      <polygon v-if="series.length === 1 && series[0]" :points="areaPoints(series[0].values)" :fill="series[0].color" fill-opacity="0.12" stroke="none" />
      <g v-for="s in series" :key="s.label">
        <polyline :points="linePoints(s.values)" fill="none" :stroke="s.color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        <circle v-for="(v, i) in s.values" :key="i" :cx="x(i)" :cy="y(v)" r="2.4" :fill="s.color" />
      </g>
      <text v-for="i in axisIdx" :key="i" :x="x(i)" :y="H - 6" text-anchor="middle" font-size="10" fill="#9ca3af">{{ labels[i] }}</text>
    </svg>
  </div>
</template>
