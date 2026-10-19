// Diálogo de reporte de contenido (Fase 12): estado compartido entre
// los menús «…» de publicaciones y comentarios (que lo abren) y el
// ReportDialog montado en el layout de miembro (que lo renderiza).
export interface ReportTarget { type: 'post' | 'comment', id: number, label: string }

export function useReportDialog() {
  const open = useState('report-dialog-open', () => false)
  const target = useState<ReportTarget | null>('report-dialog-target', () => null)
  function openReport(t: ReportTarget) {
    target.value = t
    open.value = true
  }
  function closeReport() { open.value = false }
  return { open, target, openReport, closeReport }
}
