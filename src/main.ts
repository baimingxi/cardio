import '@unocss/reset/tailwind.css';
import 'ant-design-vue/dist/reset.css';
import 'uno.css';

import { createApp } from 'vue';
import '@/style.less';
import App from './App.vue';
import router from './router';

const app = createApp(App);

app.use(router).mount('#app');

