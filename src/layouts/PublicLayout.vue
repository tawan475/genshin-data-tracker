<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useRouter } from 'vue-router';

const isLoaded = ref(false);
const authStore = useAuthStore();
const router = useRouter();

const handleLogout = () => {
  authStore.logout();
};

onMounted(() => {
  setTimeout(() => {
    isLoaded.value = true;
  }, 100);
});
</script>

<template>
  <div class="min-h-screen relative overflow-hidden flex flex-col bg-[#0f131f] text-gray-100" :class="{ 'loaded': isLoaded }">
    <!-- Ethereal Background -->
    <div class="absolute inset-0 bg-[url('/hero-bg.jpg')] bg-cover bg-center -z-20 scale-105 transition-transform duration-[2000ms] ease-out" :class="{'scale-100': isLoaded}"></div>
    <div class="absolute inset-0 bg-gradient-to-b from-[#0f131f]/40 to-[#0f131f]/95 -z-10"></div>

    <!-- Navigation -->
    <nav class="relative z-10 px-6 md:px-12 py-6 opacity-0 animate-fade-up" style="animation-delay: 200ms;">
      <div class="max-w-7xl mx-auto flex justify-between items-center">
        <router-link to="/" class="flex items-center gap-3 text-2xl font-bold tracking-tight text-white hover:opacity-90 transition">
          <span class="text-paimon text-3xl drop-shadow-[0_0_10px_var(--color-paimon-glow)]">✦</span>
          <span>Genshin Tracker</span>
        </router-link>
        <div class="hidden md:flex items-center gap-8">
          <router-link to="/" class="text-gray-400 hover:text-white font-medium transition" active-class="!text-white">Home</router-link>
          
          <template v-if="authStore.user">
            <router-link to="/dashboard" class="text-gray-400 hover:text-white font-medium transition">Dashboard</router-link>
            <div class="flex items-center gap-4 ml-4">
              <span class="text-paimon font-semibold">{{ authStore.user.username }}</span>
              <button @click="handleLogout" class="px-6 py-2 rounded-full border border-white/10 text-white font-semibold hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/50 transition">Log Out</button>
            </div>
          </template>
          
          <template v-else>
            <router-link to="/login" class="px-6 py-2 rounded-full border border-white/10 text-white font-semibold hover:bg-white/10 transition">Sign In</router-link>
          </template>
        </div>
      </div>
    </nav>

    <!-- Page Content -->
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </div>
</template>

<style scoped>
/* Route Transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
