<script setup lang="ts">
/**
 * Game art behind the top of a page: a faint tilted wall of round images
 * fading into the page's ground (design "Page backdrop", 2026-10-27). The
 * parent must be `relative isolate`; this sits under its content. Made for
 * the Music Game page's song covers, meant for other pages' art later.
 */
defineProps<{ images: readonly string[] }>()
</script>

<template>
  <div class="page-backdrop" aria-hidden="true">
    <div class="wall">
      <img v-for="(src, i) in images" :key="`${src}-${i}`" :src="src" alt="" loading="lazy" />
    </div>
    <div class="fade" />
  </div>
</template>

<style scoped>
.page-backdrop {
  position: absolute;
  left: 0;
  right: 0;
  top: -5rem;
  height: 560px;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}
.wall {
  position: absolute;
  top: -90px;
  left: -40px;
  right: -40px;
  display: grid;
  grid-template-columns: repeat(auto-fill, 84px);
  gap: 18px;
  transform: rotate(-8deg);
  opacity: 0.4;
  mask-image: linear-gradient(100deg, transparent 5%, #000 50%);
}
[data-theme='dark'] .wall {
  opacity: 0.32;
}
.wall img {
  width: 84px;
  height: 84px;
  border-radius: 9999px;
  object-fit: cover;
}
.fade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-base) 25%, transparent) 0%,
    var(--surface-base) 92%
  );
}
@media (max-width: 900px) {
  .page-backdrop {
    height: 400px;
  }
  .wall {
    grid-template-columns: repeat(auto-fill, 60px);
    gap: 12px;
  }
  .wall img {
    width: 60px;
    height: 60px;
  }
}
</style>
