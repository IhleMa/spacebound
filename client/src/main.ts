import './styles.css';
import { Game } from './game/Game';
import { tokenStore } from './net/api';
import { showLoginScreen } from './ui/LoginScreen';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const app = document.getElementById('app') as HTMLElement;

async function boot(message?: string): Promise<void> {
  let saved = tokenStore.get();
  if (!saved || message) {
    const res = await showLoginScreen(app, saved?.username ?? '', message);
    tokenStore.set(res.token, res.username);
    saved = res;
  }
  new Game({
    canvas,
    uiRoot: app,
    token: saved.token,
    onExit: (msg) => {
      tokenStore.clear();
      void boot(msg ?? 'Logged out.');
    },
  });
}

void boot();
