import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { useLibraryStore } from './stores/library'
import { useSettingsStore } from './stores/settings'
import { setupStatusBar } from './services/native'
import '../style.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

const library = useLibraryStore(pinia)
const settings = useSettingsStore(pinia)

await library.hydrate()
await router.isReady()
app.mount('#app')
void setupStatusBar(settings.dark)
