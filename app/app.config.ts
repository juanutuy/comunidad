// ServGT visual system. Explicit small sizes remain available for dense tools.
const fieldTheme = {
  slots: { base: 'rounded-xl transition-[color,background-color,box-shadow] duration-150' },
  variants: { size: {
    md: { base: 'min-h-11 px-3.5 py-2.5 text-base', leading: 'ps-3.5', trailing: 'pe-3.5' },
    lg: { base: 'min-h-12 px-4 py-3 text-base', leading: 'ps-4', trailing: 'pe-4' },
  } },
}

export default defineAppConfig({
  ui: {
    colors: { primary: 'blue', neutral: 'slate' },
    input: fieldTheme,
    select: fieldTheme,
    selectMenu: fieldTheme,
    inputMenu: fieldTheme,
    textarea: {
      slots: { base: 'rounded-xl px-3.5 py-3 text-base leading-relaxed' },
    },
    button: {
      slots: { base: 'rounded-xl font-semibold transition-[color,background-color,box-shadow] duration-150' },
      variants: { size: {
        md: { base: 'min-h-11 px-4 py-2.5 gap-2' },
        lg: { base: 'min-h-12 px-5 py-3 gap-2' },
      } },
    },
    formField: { slots: { label: 'font-medium', container: 'mt-2' } },
    card: { slots: {
      root: 'rounded-2xl shadow-[0_2px_12px_rgb(15_23_42/0.03)]',
      header: 'p-5 sm:p-6', body: 'p-5 sm:p-6', footer: 'p-5 sm:p-6',
    } },
    modal: {
      slots: {
        overlay: 'bg-slate-950/65 backdrop-blur-sm',
        header: 'p-6 sm:p-8 items-start',
        body: 'p-6 sm:p-8', footer: 'p-6 sm:px-8',
        title: 'text-xl sm:text-2xl font-bold tracking-tight',
        description: 'mt-2 text-sm sm:text-base leading-relaxed',
        close: 'top-4 end-4',
      },
      variants: { fullscreen: { false: { content: 'rounded-3xl shadow-2xl' } } },
    },
  },
})
