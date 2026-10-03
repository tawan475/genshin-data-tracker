import './bootstrap-theme'
import './assets/main.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { useSettingsStore } from './stores/settings'

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)
useSettingsStore(pinia)

app.use(router)

app.mount('#app')
