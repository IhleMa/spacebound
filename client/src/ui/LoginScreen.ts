import { h } from './dom';
import { authenticate } from '../net/api';

/** Pilot login / registration. Resolves with a session token. */
export function showLoginScreen(parent: HTMLElement, lastUsername: string, message?: string): Promise<{ token: string; username: string }> {
  return new Promise((resolve) => {
    const user = h('input', { type: 'text', autocomplete: 'username', maxlength: 16, placeholder: 'e.g. Nova_7', value: lastUsername });
    const pass = h('input', { type: 'password', autocomplete: 'current-password', placeholder: '••••••••' });
    const error = h('div', { class: 'login-error' }, message ?? '');
    const loginBtn = h('button', { class: 'btn', type: 'submit' }, 'Launch');
    const registerBtn = h('button', { class: 'btn secondary', type: 'button' }, 'Create pilot');

    const submit = async (mode: 'login' | 'register') => {
      error.textContent = '';
      loginBtn.disabled = registerBtn.disabled = true;
      try {
        const res = await authenticate(mode, user.value.trim(), pass.value);
        root.remove();
        resolve(res);
      } catch (e) {
        error.textContent = (e as Error).message || 'Could not reach the server.';
      } finally {
        loginBtn.disabled = registerBtn.disabled = false;
      }
    };

    const form = h('form', {
      onsubmit: (e: Event) => {
        e.preventDefault();
        void submit('login');
      },
    },
      h('label', { class: 'field' }, h('span', {}, 'Pilot name'), user),
      h('label', { class: 'field' }, h('span', {}, 'Password'), pass),
      h('div', { class: 'login-actions' }, loginBtn, registerBtn),
    );
    registerBtn.addEventListener('click', () => void submit('register'));

    const root = h('div', { class: 'login' },
      h('div', { class: 'login-card panel' },
        h('div', { class: 'logo' }, 'SPACEBOUND'),
        h('div', { class: 'tagline' }, 'Persistent multiplayer space frontier'),
        form,
        error,
        h('div', { class: 'login-foot' }, 'New here? Pick a pilot name and password, then press “Create pilot”. Your progress is saved on the server.'),
      ),
    );
    parent.append(root);
    (lastUsername ? pass : user).focus();
  });
}
