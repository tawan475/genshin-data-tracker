<script setup lang="ts">
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { materialIcon } from '@/lib/assets'
import { materialName } from '@/utils/materials'

/** The Original Resin icon where a lucide icon would go (the Farm view's cost tabs); size from the class. */
</script>

<template>
  <span class="inline-block">
    <MaterialIcon :src="materialIcon('OriginalResin')" :name="materialName('OriginalResin')" />
  </span>
</template>
