<script setup lang="ts">
// Editor rico único (Fase 8) sobre TipTap, con DOS configuraciones
// según la superficie, igual que la referencia:
//  - modo «slash» (compositor de posts): sin bordes ni barra fija;
//    menú «/» para insertar bloques y barra flotante al seleccionar.
//  - modo «clásico» (lecciones de texto y descripciones de curso y
//    evento): barra fija superior con el conjunto clásico
//    (B/I/U/S, títulos H1–H3, listas, cita, código, enlace, imagen,
//    incrustar YouTube, deshacer/rehacer). Sin slash ni flotante.
// El componente produce HTML; el SERVIDOR lo sanitiza siempre al
// guardar (ver server/utils/sanitize.ts), así que acá no se confía
// en nada que venga pegado. Es solo cliente (TipTap toca el DOM).
import { Editor, EditorContent, VueRenderer } from '@tiptap/vue-3'
import { Extension, Node as TiptapNode } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Image from '@tiptap/extension-image'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import Suggestion from '@tiptap/suggestion'
import SlashList from './editor/SlashList.vue'
import type { SlashItem } from './editor/SlashList.vue'

const props = withDefaults(defineProps<{
  modelValue: string
  mode?: 'slash' | 'classic'
  placeholder?: string
  uploadImage?: (file: File) => Promise<string>
}>(), { mode: 'slash', placeholder: 'Escribí acá…', uploadImage: undefined })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

// Nodo de audio: bloque atómico <audio controls src> (el sanitizador
// del servidor lo permite con esa forma exacta).
const AudioNode = TiptapNode.create({
  name: 'audio',
  group: 'block',
  atom: true,
  addAttributes() { return { src: { default: null } } },
  parseHTML() { return [{ tag: 'audio[src]' }] },
  renderHTML({ HTMLAttributes }) { return ['audio', { ...HTMLAttributes, controls: 'controls' }] },
})

// Nodo de video incrustado: <iframe> de YouTube/Vimeo dentro de un
// contenedor con proporción 16/9 al renderizar el post. Al volver a
// editar un HTML guardado, el iframe se reinterpreta como este nodo.
const VideoEmbedNode = TiptapNode.create({
  name: 'videoEmbed',
  group: 'block',
  atom: true,
  addAttributes() { return { src: { default: null } } },
  parseHTML() {
    return [{
      tag: 'iframe',
      getAttrs: (el) => {
        const src = (el as HTMLElement).getAttribute('src') || ''
        return /youtube(-nocookie)?\.com\/embed\/|player\.vimeo\.com\/video\//.test(src) ? { src } : false
      },
    }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { class: 'rich-video' }, ['iframe', { ...HTMLAttributes, allowfullscreen: '' }]]
  },
})

const editor = shallowRef<Editor | null>(null)
const wrap = ref<HTMLElement | null>(null)
const tick = ref(0) // refresca estados activos de la barra al mover el cursor
const bubble = reactive({ show: false, x: 0, y: 0 })
const linkForm = reactive({ open: false, url: '' })
const videoForm = reactive({ open: false, url: '' })
const fileInput = ref<HTMLInputElement | null>(null)

function pickImage() {
  if (!props.uploadImage) return
  if (!fileInput.value) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/gif'
    input.onchange = () => { const f = input.files?.[0]; if (f) void insertImageFile(f) }
    fileInput.value = input
  }
  fileInput.value.value = ''
  fileInput.value.click()
}

async function insertImageFile(file: File) {
  if (!props.uploadImage || !editor.value) return
  const url = await props.uploadImage(file)
  editor.value.chain().focus().setImage({ src: url }).run()
}

function slashItems(): SlashItem[] {
  const items: SlashItem[] = [
    { title: 'Texto', hint: 'Párrafo común', icon: 'i-lucide-text', command: ({ editor: e, range }) => e.chain().focus().deleteRange(range).setNode('paragraph').run() },
    { title: 'Encabezado 1', hint: 'Título grande', icon: 'i-lucide-heading-1', command: ({ editor: e, range }) => e.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run() },
    { title: 'Encabezado 2', hint: 'Título mediano', icon: 'i-lucide-heading-2', command: ({ editor: e, range }) => e.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run() },
    { title: 'Encabezado 3', hint: 'Título chico', icon: 'i-lucide-heading-3', command: ({ editor: e, range }) => e.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run() },
    { title: 'Lista', hint: 'Viñetas', icon: 'i-lucide-list', command: ({ editor: e, range }) => e.chain().focus().deleteRange(range).toggleBulletList().run() },
    { title: 'Lista numerada', hint: '1, 2, 3…', icon: 'i-lucide-list-ordered', command: ({ editor: e, range }) => e.chain().focus().deleteRange(range).toggleOrderedList().run() },
    { title: 'Lista de tareas', hint: 'Con casillas', icon: 'i-lucide-list-checks', command: ({ editor: e, range }) => e.chain().focus().deleteRange(range).toggleTaskList().run() },
    { title: 'Cita', hint: 'Bloque de cita', icon: 'i-lucide-quote', command: ({ editor: e, range }) => e.chain().focus().deleteRange(range).toggleBlockquote().run() },
    { title: 'Bloque de código', hint: 'Código con formato fijo', icon: 'i-lucide-code-xml', command: ({ editor: e, range }) => e.chain().focus().deleteRange(range).toggleCodeBlock().run() },
    { title: 'Divisor', hint: 'Línea horizontal', icon: 'i-lucide-minus', command: ({ editor: e, range }) => e.chain().focus().deleteRange(range).setHorizontalRule().run() },
  ]
  if (props.uploadImage) {
    items.push({
      title: 'Imagen', hint: 'Subir una imagen al texto', icon: 'i-lucide-image',
      command: ({ editor: e, range }) => { e.chain().focus().deleteRange(range).run(); pickImage() },
    })
  }
  return items
}

function makeSlashExtension() {
  return Extension.create({
    name: 'slashCommand',
    addOptions() {
      return {
        suggestion: {
          char: '/',
          startOfLine: false,
          items: ({ query }: { query: string }) => slashItems()
            .filter(i => i.title.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 8),
          command: ({ editor: e, range, props: item }: any) => (item as SlashItem).command({ editor: e, range }),
          render: () => {
            let component: VueRenderer | null = null
            let popup: HTMLElement | null = null
            return {
              onStart: (p: any) => {
                popup = document.createElement('div')
                popup.style.position = 'fixed'
                popup.style.zIndex = '9999'
                document.body.appendChild(popup)
                component = new VueRenderer(SlashList, { props: p, editor: p.editor })
                popup.appendChild(component.element as unknown as Node)
                position(p)
              },
              onUpdate: (p: any) => { component?.updateProps(p); position(p) },
              onKeyDown: (p: any) => {
                if (p.event.key === 'Escape') { popup?.remove(); return true }
                return (component?.ref as any)?.onKeyDown?.(p.event) ?? false
              },
              onExit: () => { component?.destroy(); popup?.remove(); component = null; popup = null },
            }
            function position(p: any) {
              if (!popup) return
              const rect = p.clientRect?.()
              if (!rect) return
              const height = 340
              const top = rect.bottom + height > window.innerHeight ? Math.max(8, rect.top - height - 4) : rect.bottom + 4
              popup.style.left = `${Math.min(rect.left, window.innerWidth - 280)}px`
              popup.style.top = `${top}px`
            }
          },
        },
      }
    },
    addProseMirrorPlugins() {
      return [Suggestion({ editor: this.editor, ...this.options.suggestion })]
    },
  })
}

function currentHtml(): string {
  if (!editor.value || editor.value.isEmpty) return ''
  return editor.value.getHTML()
}

function updateBubble() {
  if (props.mode !== 'slash' || !editor.value || !wrap.value) { bubble.show = false; return }
  const e = editor.value
  const { from, to } = e.state.selection
  if (from === to || !e.isFocused) { bubble.show = false; return }
  const coords = e.view.coordsAtPos(from)
  const box = wrap.value.getBoundingClientRect()
  bubble.x = Math.max(0, coords.left - box.left)
  bubble.y = Math.max(0, coords.top - box.top - 44)
  bubble.show = true
}

onMounted(() => {
  const extensions: any[] = [
    StarterKit.configure({ link: false, underline: false, heading: { levels: [1, 2, 3] } }),
    Underline,
    Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer' } }),
    Image,
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: props.placeholder }),
    AudioNode,
    VideoEmbedNode,
  ]
  if (props.mode === 'slash') extensions.push(makeSlashExtension())
  editor.value = new Editor({
    content: props.modelValue || '',
    extensions,
    editorProps: { attributes: { class: 'rich-area' } },
    onUpdate: () => { emit('update:modelValue', currentHtml()); tick.value++ },
    onSelectionUpdate: () => { tick.value++; updateBubble() },
    onFocus: () => updateBubble(),
    onBlur: () => { setTimeout(() => { bubble.show = false }, 150) },
  })
})

onBeforeUnmount(() => { editor.value?.destroy() })

// Cambios externos del modelo (p. ej. abrir un borrador para editar).
watch(() => props.modelValue, (v) => {
  if (editor.value && v !== currentHtml()) editor.value.commands.setContent(v || '', { emitUpdate: false })
})

function toggleLink() {
  if (!editor.value) return
  const prev = editor.value.getAttributes('link').href as string | undefined
  linkForm.url = prev || ''
  linkForm.open = !linkForm.open
  videoForm.open = false
}
function applyLink() {
  if (!editor.value) return
  const url = linkForm.url.trim()
  if (!url) editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
  else editor.value.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  linkForm.open = false
}
function applyVideo() {
  if (!editor.value) return
  const src = videoEmbedUrl(videoForm.url)
  if (src) editor.value.chain().focus().insertContent({ type: 'videoEmbed', attrs: { src } }).run()
  videoForm.open = false
  videoForm.url = ''
}

defineExpose({
  focus: () => editor.value?.chain().focus().run(),
  pickImage: () => pickImage(),
  isEmpty: () => !editor.value || editor.value.isEmpty,
  getHTML: () => currentHtml(),
  insertImage: (url: string) => editor.value?.chain().focus().setImage({ src: url }).run(),
  insertAudio: (url: string) => editor.value?.chain().focus().insertContent({ type: 'audio', attrs: { src: url } }).run(),
  insertVideo: (rawUrl: string) => {
    const src = videoEmbedUrl(rawUrl)
    if (src) editor.value?.chain().focus().insertContent({ type: 'videoEmbed', attrs: { src } }).run()
    return !!src
  },
  insertText: (text: string) => editor.value?.chain().focus().insertContent(text).run(),
  insertCodeBlock: () => editor.value?.chain().focus().toggleCodeBlock().run(),
  insertSlash: () => editor.value?.chain().focus().insertContent('/').run(),
})

const classicButtons = computed(() => {
  const e = editor.value
  const on = (name: string, attrs?: Record<string, unknown>) => !!e && e.isActive(name, attrs)
  void tick.value
  return [
    { icon: 'i-lucide-undo-2', title: 'Deshacer', active: false, run: () => e?.chain().focus().undo().run() },
    { icon: 'i-lucide-redo-2', title: 'Rehacer', active: false, run: () => e?.chain().focus().redo().run() },
    { icon: 'i-lucide-bold', title: 'Negrita', active: on('bold'), run: () => e?.chain().focus().toggleBold().run() },
    { icon: 'i-lucide-italic', title: 'Itálica', active: on('italic'), run: () => e?.chain().focus().toggleItalic().run() },
    { icon: 'i-lucide-underline', title: 'Subrayado', active: on('underline'), run: () => e?.chain().focus().toggleUnderline().run() },
    { icon: 'i-lucide-strikethrough', title: 'Tachado', active: on('strike'), run: () => e?.chain().focus().toggleStrike().run() },
    { icon: 'i-lucide-heading-1', title: 'Encabezado 1', active: on('heading', { level: 1 }), run: () => e?.chain().focus().toggleHeading({ level: 1 }).run() },
    { icon: 'i-lucide-heading-2', title: 'Encabezado 2', active: on('heading', { level: 2 }), run: () => e?.chain().focus().toggleHeading({ level: 2 }).run() },
    { icon: 'i-lucide-heading-3', title: 'Encabezado 3', active: on('heading', { level: 3 }), run: () => e?.chain().focus().toggleHeading({ level: 3 }).run() },
    { icon: 'i-lucide-list', title: 'Lista con viñetas', active: on('bulletList'), run: () => e?.chain().focus().toggleBulletList().run() },
    { icon: 'i-lucide-list-ordered', title: 'Lista numerada', active: on('orderedList'), run: () => e?.chain().focus().toggleOrderedList().run() },
    { icon: 'i-lucide-quote', title: 'Cita', active: on('blockquote'), run: () => e?.chain().focus().toggleBlockquote().run() },
    { icon: 'i-lucide-code-xml', title: 'Bloque de código', active: on('codeBlock'), run: () => e?.chain().focus().toggleCodeBlock().run() },
    { icon: 'i-lucide-link', title: 'Enlace', active: on('link'), run: toggleLink },
    { icon: 'i-lucide-image', title: 'Imagen', active: false, run: pickImage, hidden: !props.uploadImage },
    { icon: 'i-lucide-youtube', title: 'Incrustar video de YouTube/Vimeo', active: false, run: () => { videoForm.open = !videoForm.open; linkForm.open = false } },
  ].filter(b => !('hidden' in b && b.hidden))
})
</script>

<template>
  <div ref="wrap" class="relative">
    <!-- Barra fija del modo clásico -->
    <div v-if="mode === 'classic' && editor" class="mb-2 flex flex-wrap items-center gap-0.5 rounded-lg border border-default bg-elevated/60 p-1">
      <UButton
        v-for="b in classicButtons" :key="b.title" size="xs" :color="b.active ? 'primary' : 'neutral'"
        :variant="b.active ? 'soft' : 'ghost'" :icon="b.icon" :title="b.title" @click="b.run"
      />
    </div>

    <!-- Formulario de enlace (ambos modos) -->
    <div v-if="linkForm.open" class="absolute inset-x-0 top-0 z-20 flex items-center gap-2 rounded-lg border border-default bg-default p-2 shadow-lg">
      <UIcon name="i-lucide-link" class="ml-1 shrink-0 text-muted" />
      <UInput v-model="linkForm.url" placeholder="https://…" class="flex-1" size="sm" @keyup.enter="applyLink" />
      <UButton size="sm" label="Aplicar" @click="applyLink" />
      <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-x" @click="linkForm.open = false" />
    </div>
    <!-- Formulario de video (modo clásico) -->
    <div v-if="videoForm.open" class="absolute inset-x-0 top-0 z-20 flex items-center gap-2 rounded-lg border border-default bg-default p-2 shadow-lg">
      <UIcon name="i-lucide-youtube" class="ml-1 shrink-0 text-muted" />
      <UInput v-model="videoForm.url" placeholder="Pegá el enlace de YouTube o Vimeo…" class="flex-1" size="sm" @keyup.enter="applyVideo" />
      <UButton size="sm" label="Incrustar" @click="applyVideo" />
      <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-x" @click="videoForm.open = false" />
    </div>

    <!-- Barra flotante al seleccionar (modo slash) -->
    <div
      v-if="bubble.show && editor" class="absolute z-20 flex items-center gap-0.5 rounded-lg border border-default bg-default p-1 shadow-lg"
      :style="{ left: `${bubble.x}px`, top: `${bubble.y}px` }"
    >
      <UButton size="xs" :color="editor.isActive('bold') ? 'primary' : 'neutral'" :variant="editor.isActive('bold') ? 'soft' : 'ghost'" icon="i-lucide-bold" title="Negrita" @click="editor.chain().focus().toggleBold().run()" />
      <UButton size="xs" :color="editor.isActive('italic') ? 'primary' : 'neutral'" :variant="editor.isActive('italic') ? 'soft' : 'ghost'" icon="i-lucide-italic" title="Itálica" @click="editor.chain().focus().toggleItalic().run()" />
      <UButton size="xs" :color="editor.isActive('underline') ? 'primary' : 'neutral'" :variant="editor.isActive('underline') ? 'soft' : 'ghost'" icon="i-lucide-underline" title="Subrayado" @click="editor.chain().focus().toggleUnderline().run()" />
      <UButton size="xs" :color="editor.isActive('strike') ? 'primary' : 'neutral'" :variant="editor.isActive('strike') ? 'soft' : 'ghost'" icon="i-lucide-strikethrough" title="Tachado" @click="editor.chain().focus().toggleStrike().run()" />
      <UButton size="xs" :color="editor.isActive('code') ? 'primary' : 'neutral'" :variant="editor.isActive('code') ? 'soft' : 'ghost'" icon="i-lucide-code" title="Código" @click="editor.chain().focus().toggleCode().run()" />
      <UButton size="xs" :color="editor.isActive('link') ? 'primary' : 'neutral'" :variant="editor.isActive('link') ? 'soft' : 'ghost'" icon="i-lucide-link" title="Enlace" @click="toggleLink" />
    </div>

    <EditorContent v-if="editor" :editor="editor" />
    <div v-else class="min-h-24 animate-pulse rounded-lg bg-elevated/50" />
  </div>
</template>
