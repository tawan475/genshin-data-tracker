<script setup lang="ts">
import DetailedProgression from '@/components/progression/DetailedProgression.vue'
import MonthlyAnalysisCard from '@/components/progression/MonthlyAnalysisCard.vue'
</script>

<template>
  <div class="max-w-7xl mx-auto space-y-8 relative min-h-[60vh]">
    <div>
      <DetailedProgression />
      <MonthlyAnalysisCard />
    </div>
  </div>
</template>
