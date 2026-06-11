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

export const LoginView = {
  /** Devuelve el HTML de la pantalla de login. */
  async render() {
    return `
      <div class="login">
        <div class="login__card">
          <div class="login__brand">
            <span class="login__logo">CS</span>
            <div>
              <h1 class="login__title">CS Travel</h1>
              <p class="login__subtitle">Plataforma de viajes corporativos</p>
            </div>
          </div>

          <!-- noValidate: desactiva la validacion nativa para usar la nuestra. -->
          <form id="login-form" class="form" novalidate>
            <div class="form__group">
              <label for="email" class="form__label">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                class="form__input"
                placeholder="tucorreo@empresa.com"
                autocomplete="username"
              />
              <!-- Aqui se inyectan los mensajes de error por campo. -->
              <small class="form__error" data-error-for="email"></small>
            </div>

            <div class="form__group">
              <label for="password" class="form__label">Contrasena</label>
              <input
                type="password"
                id="password"
                name="password"
                class="form__input"
                placeholder="••••••••"
                autocomplete="current-password"
              />
              <small class="form__error" data-error-for="password"></small>
            </div>

            <!-- Mensaje de error general (credenciales invalidas, backend caido). -->
            <div class="form__alert" id="login-alert" hidden></div>

            <button type="submit" class="btn btn--primary btn--block" id="login-submit">
              Iniciar sesion
            </button>
          </form>

          <!-- Ayuda de credenciales de prueba (solo para el MVP/demo). -->
          <div class="login__hint">
            <p><strong>Usuarios de prueba</strong></p>
            <p>Admin: <code>admin@cstravel.com</code> / <code>admin123</code></p>
            <p>Empresa: <code>sara@clinicasalud.com</code> / <code>empresa123</code></p>
            <p>Medico: <code>valentina@clinicadermavital.com</code> / <code>medico123</code></p>
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
        submitBtn.textContent = 'Ingresando...';

        await authService.login(email, password);

        // 3) Login correcto -> redirigimos al dashboard segun el rol.
        navigate(redirectByRole());
      } catch (error) {
        // 4) Error: credenciales invalidas o backend no disponible.
        alert.textContent = error.message;
        alert.hidden = false;
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Iniciar sesion';
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
