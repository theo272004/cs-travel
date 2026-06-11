import { authService } from '../services/authService.js';
import { redirectByRole } from '../utils/guards.js';
import { navigate } from '../router/router.js';

export const FirstLoginView = {
  async render() {
    return `
      <div class="login">
        <div class="login__card">
          <div class="login__brand">
            <span class="login__logo">CS</span>
            <div>
              <h1 class="login__title">Configura tu acceso</h1>
              <p class="login__subtitle">Crea una nueva contrasena para continuar.</p>
            </div>
          </div>

          <form id="first-login-form" class="form" novalidate>
            <div class="form__group">
              <label class="form__label">Nueva contrasena</label>
              <input type="password" name="password" class="form__input" autocomplete="new-password" />
              <small class="form__error" data-error-for="password"></small>
            </div>
            <div class="form__group">
              <label class="form__label">Confirmar contrasena</label>
              <input type="password" name="confirmPassword" class="form__input" autocomplete="new-password" />
              <small class="form__error" data-error-for="confirmPassword"></small>
            </div>
            <div class="form__alert" id="first-login-alert" hidden></div>
            <button type="submit" class="btn btn--primary btn--block">Guardar y continuar</button>
          </form>
        </div>
      </div>
    `;
  },

  async afterRender() {
    const form = document.getElementById('first-login-form');
    const alert = document.getElementById('first-login-alert');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      form.querySelectorAll('.form__error').forEach((el) => (el.textContent = ''));
      alert.hidden = true;

      const password = form.password.value;
      const confirmPassword = form.confirmPassword.value;
      if (password.length < 8) {
        form.querySelector('[data-error-for="password"]').textContent = 'Usa al menos 8 caracteres.';
        return;
      }
      if (password !== confirmPassword) {
        form.querySelector('[data-error-for="confirmPassword"]').textContent = 'Las contrasenas no coinciden.';
        return;
      }

      try {
        await authService.completeFirstLogin(password);
        navigate(redirectByRole());
      } catch (error) {
        alert.textContent = error.message;
        alert.hidden = false;
      }
    });
  },
};
