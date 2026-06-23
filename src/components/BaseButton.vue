<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps({
  variant: {
    type: String,
    default: 'primary',
    validator: (val: string) => ['primary', 'secondary', 'danger', 'danger-outline', 'danger-soft', 'outline', 'ghost', 'success', 'warning', 'blue', 'purple', 'emerald'].includes(val)
  },
  size: {
    type: String,
    default: 'md',
    validator: (val: string) => ['xs', 'sm', 'md', 'lg'].includes(val)
  },
  type: {
    type: String as () => 'button' | 'submit' | 'reset',
    default: 'button'
  },
  disabled: {
    type: Boolean,
    default: false
  },
  loading: {
    type: Boolean,
    default: false
  },
  block: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['click'])

const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm dark:focus:ring-offset-slate-900 gap-1.5'

const variantClasses = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'bg-indigo-600 dark:bg-indigo-500 text-white hover:bg-indigo-700 dark:hover:bg-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 border border-transparent shadow-sm shadow-indigo-500/30'
    case 'secondary':
      return 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 focus:ring-slate-500'
    case 'danger':
      return 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 border border-red-500'
    case 'danger-soft':
      return 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 hover:bg-red-100 dark:hover:bg-red-900/40 focus:ring-red-500'
    case 'danger-outline':
      return 'bg-transparent text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20 focus:ring-red-500'
    case 'outline':
      return 'bg-transparent border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus:ring-slate-500'
    case 'ghost':
      return 'bg-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:ring-slate-500 shadow-none'
    case 'success':
      return 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500 border border-emerald-500'
    case 'emerald':
      return 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500 border border-emerald-500'
    case 'warning':
      return 'bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-500 border border-amber-500'
    case 'blue':
      return 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 border border-blue-500'
    case 'purple':
      return 'bg-purple-600 text-white hover:bg-purple-700 focus:ring-purple-500 border border-purple-500'
    default:
      return ''
  }
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'xs':
      return 'px-3 py-1.5 text-xs'
    case 'sm':
      return 'px-3 py-1.5 text-sm'
    case 'md':
      return 'px-4 py-2 text-sm'
    case 'lg':
      return 'px-6 py-3 text-base'
    default:
      return ''
  }
})

const widthClass = computed(() => props.block ? 'w-full' : '')

const handleClick = (event: MouseEvent) => {
  if (!props.disabled && !props.loading) {
    emit('click', event)
  }
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="[baseClasses, variantClasses, sizeClasses, widthClass]"
    @click="handleClick"
  >
    <!-- Loading Spinner -->
    <svg v-if="loading" class="animate-spin -ml-1 mr-1 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    
    <!-- Prefix Icon Slot -->
    <span v-if="$slots.icon && !loading" class="flex items-center">
      <slot name="icon"></slot>
    </span>

    <slot></slot>
    
    <!-- Suffix Icon Slot -->
    <span v-if="$slots.suffix" class="flex items-center">
      <slot name="suffix"></slot>
    </span>
  </button>
</template>
