/**
 * LoginView.js
 * =============================================================================
 * PROPOSITO:
 *   Pantalla de inicio de sesion. Permite autenticarse con email y password.
 *
 * RESPONSABILIDADES:
 *   - render(): devolver el HTML del formulario de login (pantalla "blank").
 *   - afterRender(): enlazar el evento submit, validar, llamar a authService y
 *     redirigir segun el rol. Manejar y mostrar errores.
 *
 * FLUJO DE AUTENTICACION:
 *   1) El usuario escribe email + password y envia el formulario.
 *   2) Validamos el formato en el cliente (validators.js).
 *   3) authService.login() consulta el backend (Fetch) y compara credenciales.
 *   4) Si es correcto, se guarda la sesion (localStorage) y redirigimos segun rol.
 *   5) Si falla, mostramos un mensaje de error sin recargar la pagina.
 * =============================================================================
 */

import { authService } from '../services/authService.js';
import { validateLoginForm } from '../utils/validators.js';
import { redirectByRole } from '../utils/guards.js';
import { navigate } from '../router/router.js';
import logoCs from '../assets/logo-cs.png';

export const LoginView = {
  /** Devuelve el HTML de la pantalla de login. */
  async render() {
    return `
      <div class="login">
        <a href="https://cstravelgroup.com/" class="login__masthead" target="_blank" rel="noopener noreferrer" aria-label="CS Travel - sitio principal">
          <img src="${logoCs}" alt="" class="login__masthead-logo" />
          <div>
            <p class="login__masthead-name">CS Travel</p>
            <p class="login__masthead-subtitle">Plataforma de viajes corporativos</p>
          </div>
        </a>

        <div class="login__card">
          <a href="https://cstravelgroup.com/" class="login__brand" target="_blank" rel="noopener noreferrer">
            <img src="${logoCs}" alt="CS Travel" class="login__logo" />
            <h1 class="login__title">CS Travel</h1>
            <p class="login__subtitle">Plataforma de viajes corporativos</p>
          </a>

          <div class="login__welcome">
            <h2>Bienvenido de nuevo</h2>
            <p>Inicia sesion para continuar gestionando los viajes de tu empresa.</p>
          </div>

          <!-- noValidate: desactiva la validacion nativa para usar la nuestra. -->
          <form id="login-form" class="form" novalidate>
            <div class="form__group">
              <label for="email" class="form__label">Correo electronico</label>
              <div class="login__field">
                <span class="login__field-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M4 6.5h16v11H4z" />
                    <path d="m4.5 7 7.5 6 7.5-6" />
                  </svg>
                </span>
                <input
                  type="email"
                  id="email"
                  name="email"
                  class="form__input"
                  placeholder="tucorreo@empresa.com"
                  autocomplete="username"
                />
              </div>
              <!-- Aqui se inyectan los mensajes de error por campo. -->
              <small class="form__error" data-error-for="email"></small>
            </div>

            <div class="form__group">
              <label for="password" class="form__label">Contrasena</label>
              <div class="login__field">
                <span class="login__field-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <rect x="5" y="10" width="14" height="10" rx="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  </svg>
                </span>
                <input
                  type="password"
                  id="password"
                  name="password"
                  class="form__input"
                  placeholder="••••••••"
                  autocomplete="current-password"
                />
                <button
                  type="button"
                  class="login__field-action"
                  id="password-visibility-toggle"
                  aria-label="Mostrar contrasena"
                  aria-pressed="false"
                >
                  <svg class="login__field-eye login__field-eye--show" viewBox="0 0 24 24" focusable="false">
                    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <svg class="login__field-eye login__field-eye--hide" viewBox="0 0 24 24" focusable="false">
                    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                    <circle cx="12" cy="12" r="3" />
                    <path d="M4 4l16 16" />
                  </svg>
                </button>
              </div>
              <small class="form__error" data-error-for="password"></small>
            </div>

            <a href="#/login" class="login__forgot">Olvidaste tu contrasena?</a>

            <!-- Mensaje de error general (credenciales invalidas, backend caido). -->
            <div class="form__alert" id="login-alert" hidden></div>

            <button type="submit" class="btn btn--primary btn--block" id="login-submit">
              <span>Iniciar sesion</span>
            </button>
          </form>
        </div>

        <div class="login__benefits" aria-label="Beneficios corporativos">
          <div class="login__benefit">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 2 4.5 5.5v5.5C4.5 15.75 7.8 20.2 12 21.7c4.2-1.5 7.5-5.95 7.5-10.7V5.5L12 2Z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
            <strong>Seguro y confiable</strong>
            <p>Tus datos siempre protegidos.</p>
          </div>
          <div class="login__benefit">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="9"/>
              <path d="M12 7v5.5l3.5 2"/>
              <path d="M16.5 3.5C18.5 5 20 7 20.5 9.5"/>
            </svg>
            <strong>Soporte 24/7</strong>
            <p>Estamos contigo en cada etapa de tu viaje.</p>
          </div>
          <div class="login__benefit">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M3 19h18"/>
              <path d="M7 19v-6"/>
              <path d="M11 19V9"/>
              <path d="M15 19V12"/>
              <path d="M19 19V4"/>
              <path d="m17 2 2 2 2-2"/>
            </svg>
            <strong>Retorno medible</strong>
            <p>Convertimos tus viajes en ingresos.</p>
          </div>
          <div class="login__benefit">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="9"/>
              <path d="M3 12h18"/>
              <ellipse cx="12" cy="12" rx="4" ry="9"/>
            </svg>
            <strong>Cobertura global</strong>
            <p>Red de proveedores en todo el mundo.</p>
          </div>
        </div>
      </div>
    `;
  },

  /** Enlaza los eventos del formulario despues de pintar el HTML. */
  async afterRender() {
    const form = document.getElementById('login-form');
    const alert = document.getElementById('login-alert');
    const submitBtn = document.getElementById('login-submit');
    const passwordInput = document.getElementById('password');
    const passwordToggle = document.getElementById('password-visibility-toggle');

    passwordToggle?.addEventListener('click', () => {
      const isHidden = passwordInput.type === 'password';
      passwordInput.type = isHidden ? 'text' : 'password';
      passwordToggle.setAttribute('aria-pressed', String(isHidden));
      passwordToggle.setAttribute('aria-label', isHidden ? 'Ocultar contrasena' : 'Mostrar contrasena');
      passwordToggle.classList.toggle('is-active', isHidden);
    });

    // Escuchamos el evento submit del formulario.
    form.addEventListener('submit', async (event) => {
      // Evitamos que el navegador recargue la pagina al enviar el form.
      event.preventDefault();

      // Limpiamos errores previos antes de validar de nuevo.
      clearErrors();
      alert.hidden = true;

      // Tomamos los valores escritos por el usuario.
      const email = form.email.value.trim();
      const password = form.password.value;

      // 1) Validacion en el cliente.
      const { isValid, errors } = validateLoginForm({ email, password });
      if (!isValid) {
        showFieldErrors(errors);
        return;
      }

      // 2) Intento de login contra el backend.
      try {
        submitBtn.disabled = true;
        submitBtn.querySelector('span').textContent = 'Ingresando...';

        await authService.login(email, password);

        // 3) Login correcto -> redirigimos al dashboard segun el rol.
        navigate(redirectByRole());
      } catch (error) {
        // 4) Error: credenciales invalidas o backend no disponible.
        alert.textContent = error.message;
        alert.hidden = false;
      } finally {
        submitBtn.disabled = false;
        submitBtn.querySelector('span').textContent = 'Iniciar sesion';
      }
    });

    /** Muestra los mensajes de error junto a cada campo. */
    function showFieldErrors(errors) {
      Object.entries(errors).forEach(([field, message]) => {
        const el = form.querySelector(`[data-error-for="${field}"]`);
        if (el) el.textContent = message;
      });
    }

    /** Limpia todos los mensajes de error del formulario. */
    function clearErrors() {
      form.querySelectorAll('.form__error').forEach((el) => (el.textContent = ''));
    }
  },
};
