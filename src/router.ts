import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import BrowseView from './views/BrowseView.vue'
import StudyView from './views/StudyView.vue'
import SmartSetupView from './views/SmartSetupView.vue'
import SmartStudyView from './views/SmartStudyView.vue'
import ApiUsageView from './views/ApiUsageView.vue'
import PreferencesView from './views/PreferencesView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/preferences', name: 'preferences', component: PreferencesView },
    { path: '/usage', name: 'api-usage', component: ApiUsageView },
    { path: '/', name: 'home', component: HomeView },
    { path: '/deck/:deckId', name: 'browse', component: BrowseView },
    { path: '/study/:deckId', name: 'study', component: StudyView },
    { path: '/smart', name: 'smart-setup', component: SmartSetupView },
    { path: '/smart/session', name: 'smart-study', component: SmartStudyView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
