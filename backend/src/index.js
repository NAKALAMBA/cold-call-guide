import { createApp } from './app.js';
import { createStore } from './store.js';

const store = createStore();
const app = createApp({ store });
const port = Number(process.env.PORT) || 8080;

app.listen(port, () => {
  console.log(`call guide API on :${port} (store: ${store.kind}, llm: ${process.env.LLM_API_KEY ? process.env.LLM_MODEL || 'default models' : 'rules only'})`);
});
