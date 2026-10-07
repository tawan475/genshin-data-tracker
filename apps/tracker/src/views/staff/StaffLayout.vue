<script setup lang="ts">
import { useStaff } from '@/stores/staff'

/**
 * The staff dashboard's pages (lazy, behind `staff.view`; each page also
 * needs its own node, see the router). The roles are read for the top bar.
 */
void useStaff().ensureLoaded()
</script>

<template>
  <RouterView />
</template>
