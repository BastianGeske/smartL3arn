<script setup lang="ts">
import { computed, type Component } from 'vue'
import {
  Archive,
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Coffee,
  Eye,
  FileJson,
  FileText,
  Flame,
  FolderOpen,
  Gauge,
  History,
  Keyboard,
  Layers3,
  Library,
  Languages,
  MessageSquareText,
  Moon,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Rows3,
  Search,
  Settings2,
  Sheet,
  Shuffle,
  Sparkles,
  Sun,
  Sprout,
  Lightbulb,
  Timer,
  Trash2,
  Upload,
  X,
} from '@lucide/vue'

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 18 })

const icons: Record<string, Component> = {
  'alert-circle': AlertCircle,
  archive: Archive,
  'arrow-left': ArrowLeft,
  'book-open': BookOpen,
  'calendar-days': CalendarDays,
  check: Check,
  'check-circle-2': CheckCircle2,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  'clock-3': Clock3,
  coffee: Coffee,
  eye: Eye,
  'file-json': FileJson,
  'file-text': FileText,
  flame: Flame,
  'folder-open': FolderOpen,
  gauge: Gauge,
  history: History,
  keyboard: Keyboard,
  'layers-3': Layers3,
  library: Library,
  languages: Languages,
  'message-square-text': MessageSquareText,
  moon: Moon,
  'more-horizontal': MoreHorizontal,
  pencil: Pencil,
  play: Play,
  plus: Plus,
  'rotate-ccw': RotateCcw,
  'rows-3': Rows3,
  search: Search,
  'settings-2': Settings2,
  sheet: Sheet,
  shuffle: Shuffle,
  sparkles: Sparkles,
  sun: Sun,
  sprout: Sprout,
  lightbulb: Lightbulb,
  timer: Timer,
  'trash-2': Trash2,
  upload: Upload,
  x: X,
}

const icon = computed(() => icons[props.name] || icons.sparkles)
</script>

<template>
  <component
    :is="icon"
    class="icon"
    :size="size"
    :style="{ '--icon-size': `${size}px` }"
    :stroke-width="1.8"
    aria-hidden="true"
  />
</template>
