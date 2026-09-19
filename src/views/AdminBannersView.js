/**
 * AdminBannersView.js
 * =============================================================================
 * PROPOSITO:
 *   Franja de promociones mensuales del sitio publico (orden de trabajo I-01),
 *   administrada SIN tocar codigo:
 *     - version de escritorio y de celular,
 *     - enlace de destino y texto alternativo,
 *     - fecha de inicio y de fin (se publica y se retira sola),
 *     - orden de rotacion y opcion de desactivar.
 *
 *   Las imagenes se optimizan en el navegador antes de subirlas (se llevan al
 *   ancho recomendado y a WebP) para respetar el peso maximo y no volver lento
 *   el sitio.
 *
 * DATOS:
 *   /api/banners/admin (solo admin). En el demo se trabaja en memoria.
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';
import { formatDate } from '../utils/formatDate.js';
import { isDeployedBundle } from '../utils/env.js';
import { showToast } from '../utils/toast.js';
import { confirmDialog } from '../components/ConfirmDialog.js';

const SPECS = {
  desktop: { width: 1920, height: 160, maxBytes: 300 * 1024, label: 'Escritorio' },
  mobile: { width: 800, height: 200, maxBytes: 150 * 1024, label: 'Celular' },
};

let cached = [];
let editingId = '';
const pending = { desktop: '', mobile: '' }; // data URLs listas para subir

async function api(action, extra = {}) {
  const res = await fetch('/api/banners/admin', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

// Fechas "AAAA-MM-DD" en hora local (evita que el 18 se vea como 17).
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDay = (d) => (d ? formatDate(`${d}T12:00:00`) : '');

function stateOf(b) {
  const day = todayLocal();
  if (!b.active) return { key: 'off', label: 'Desactivado', badge: 'badge--gray' };
  if (b.endAt && day > b.endAt) return { key: 'past', label: 'Vencido', badge: 'badge--gray' };
  if (b.startAt && day < b.startAt) return { key: 'soon', label: 'Programado', badge: 'badge--blue' };
  return { key: 'live', label: 'En línea', badge: 'badge--green' };
}

/**
 * Lleva la imagen al ancho recomendado y la exporta a WebP, bajando la calidad
 * hasta que quepa en el peso maximo. Devuelve { dataUrl, width, height, bytes }.
 */
async function optimize(file, kind) {
  const spec = SPECS[kind];
  const src = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
    el.src = src;
  });
  const scale = Math.min(1, spec.width / img.naturalWidth);
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);

  let dataUrl = '';
  let bytes = Infinity;
  for (const quality of [0.9, 0.82, 0.74, 0.66, 0.58, 0.5]) {
    dataUrl = canvas.toDataURL('image/webp', quality);
    if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/jpeg', quality); // navegadores sin WebP
    bytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
    if (bytes <= spec.maxBytes) break;
  }
  if (bytes > spec.maxBytes) {
    throw new Error(`La imagen de ${spec.label.toLowerCase()} sigue pesando ${Math.round(bytes / 1024)} KB después de optimizarla (máximo ${Math.round(spec.maxBytes / 1024)} KB). Usa una imagen más simple.`);
  }
  const ratio = width / height;
  const expected = spec.width / spec.height;
  const warn = Math.abs(ratio - expected) / expected > 0.15
    ? `Proporción distinta a la recomendada (${spec.width}×${spec.height}): se recortará un poco al mostrarse.`
    : '';
  return { dataUrl, width, height, bytes, warn, naturalWidth: img.naturalWidth };
}

function renderRows(items) {
  if (!items.length) {
    return '<tr><td colspan="6" class="empty-state">Todavía no hay banners. Crea el primero con «+ Nuevo banner».</td></tr>';
  }
  return items.map((b) => {
    const st = stateOf(b);
    return `
      <tr>
        <td><img class="bn-thumb" src="${escapeHtml(b.desktopUrl)}" alt="" loading="lazy" /></td>
        <td>
          <strong>${escapeHtml(b.title || b.alt)}</strong>
          <div class="muted">${escapeHtml(b.link || 'Sin enlace')}</div>
          ${b.mobileUrl ? '' : '<div class="muted">Sin versión de celular: se usa la de escritorio</div>'}
        </td>
        <td>${b.startAt || b.endAt ? `${fmtDay(b.startAt) || 'Ya'} → ${fmtDay(b.endAt) || 'Sin fin'}` : '<span class="muted">Siempre</span>'}</td>
        <td class="col-center">${Number(b.order || 0)}</td>
        <td><span class="badge ${st.badge}">${st.label}</span></td>
        <td class="col-center">
          <div class="bn-actions">
            <button type="button" class="btn btn--ghost btn--sm" data-edit="${escapeHtml(b.id)}">Editar</button>
            <button type="button" class="btn btn--ghost btn--sm" data-toggle="${escapeHtml(b.id)}" data-active="${b.active ? '1' : ''}">${b.active ? 'Desactivar' : 'Activar'}</button>
            <button type="button" class="btn btn--ghost btn--sm text-red" data-delete="${escapeHtml(b.id)}">Eliminar</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function kpis(items) {
  const by = (k) => items.filter((b) => stateOf(b).key === k).length;
  return { live: by('live'), soon: by('soon'), past: by('past'), off: by('off') };
}

export const AdminBannersView = {
  async render() {
    const deployed = isDeployedBundle();
    let loadError = '';
    editingId = '';
    pending.desktop = '';
    pending.mobile = '';
    if (deployed) {
      try { cached = (await api('list')).items || []; } catch (e) { loadError = e.message; cached = []; }
    } else if (!cached.length) {
      cached = [];
    }
    const k = kpis(cached);

    return `
      <style>
        .bn-thumb { width: 180px; height: 15px; object-fit: cover; border-radius: 4px; display: block; background: #eef2fb; min-height: 15px; }
        .bn-actions { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; }
        .bn-drop { display: grid; gap: 8px; }
        .bn-preview { border: 1px dashed #cfdbe8; border-radius: 12px; background: #f7f9fc; min-height: 48px; display: grid; place-items: center; overflow: hidden; }
        .bn-preview img { display: block; width: 100%; height: auto; }
        .bn-preview--mobile { max-width: 320px; }
        .bn-spec { font-size: .8rem; color: #667386; }
        .bn-warn { font-size: .8rem; color: #a35b12; }
        .bn-note { margin: 0; padding: 12px 14px; border-radius: 12px; background: #eef4ff; color: #0a2d66; font-size: .86rem; line-height: 1.55; }
      </style>

      <div class="qb-page-hero">
        <div>
          <h1 class="page-title">Banners de promociones</h1>
          <p class="page-subtitle">La franja que aparece en Inicio, Empresas y Médicos. Se publica y se retira sola según sus fechas.</p>
        </div>
        <div class="qb-hero-kpis">
          <div class="qb-hero-kpi"><strong id="bn-k-live">${k.live}</strong><span>En línea hoy</span></div>
          <div class="qb-hero-kpi qb-hero-kpi--sep"><strong id="bn-k-soon">${k.soon}</strong><span>Programados</span></div>
          <div class="qb-hero-kpi qb-hero-kpi--sep"><strong id="bn-k-past">${k.past}</strong><span>Vencidos</span></div>
          <div class="qb-hero-kpi qb-hero-kpi--sep"><strong id="bn-k-off">${k.off}</strong><span>Desactivados</span></div>
        </div>
      </div>

      ${!deployed ? `
        <section class="panel"><p class="empty-state">Demo: los banners se guardan solo en esta pestaña. En el portal real se publican en cstravelgroup.com.</p></section>` : ''}

      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title" id="bn-form-title">Nuevo banner</h2>
          <button type="button" class="btn btn--primary" id="bn-toggle">+ Nuevo banner</button>
        </div>
        <form id="bn-form" class="form form--grid" novalidate hidden>
          <p class="bn-note form__group--full">
            Medidas recomendadas: <strong>escritorio 1920 × 160 px</strong> (máx. 300 KB) y <strong>celular 800 × 200 px</strong> (máx. 150 KB).
            Puedes subir JPG, PNG o WebP: la optimizamos automáticamente antes de publicarla.
          </p>
          <div class="form__group">
            <label class="form__label" for="bn-title">Nombre interno</label>
            <input id="bn-title" class="form__input" maxlength="120" placeholder="Ej: Promo septiembre · Cartagena" />
          </div>
          <div class="form__group">
            <label class="form__label" for="bn-alt">Texto alternativo *</label>
            <input id="bn-alt" class="form__input" maxlength="160" placeholder="Describe la imagen: «20% en paquetes a Cartagena»" />
          </div>
          <div class="form__group form__group--full">
            <label class="form__label" for="bn-link">Enlace de destino</label>
            <input id="bn-link" class="form__input" maxlength="500" placeholder="/empresas o https://..." />
            <small class="form__hint">Opcional. Una ruta del sitio (empieza con /) o una dirección https.</small>
          </div>
          <div class="form__group">
            <label class="form__label" for="bn-start">Se publica el</label>
            <input id="bn-start" type="date" class="form__input" />
          </div>
          <div class="form__group">
            <label class="form__label" for="bn-end">Se retira después del</label>
            <input id="bn-end" type="date" class="form__input" />
          </div>
          <div class="form__group">
            <label class="form__label" for="bn-order">Orden en la rotación</label>
            <input id="bn-order" type="number" min="0" max="999" value="0" class="form__input" />
            <small class="form__hint">El menor sale primero. Con varios banners vigentes, rotan cada 6 segundos.</small>
          </div>
          <div class="form__group">
            <label class="checkbox"><input type="checkbox" id="bn-active" checked /> <span>Activo</span></label>
          </div>
          <div class="form__group form__group--full bn-drop">
            <label class="form__label" for="bn-desktop">Imagen de escritorio *</label>
            <input id="bn-desktop" type="file" accept="image/webp,image/jpeg,image/png" class="form__input" />
            <span class="bn-spec" id="bn-desktop-info">1920 × 160 px recomendado</span>
            <div class="bn-preview" id="bn-desktop-preview"><span class="muted">Vista previa</span></div>
          </div>
          <div class="form__group form__group--full bn-drop">
            <label class="form__label" for="bn-mobile">Imagen de celular</label>
            <input id="bn-mobile" type="file" accept="image/webp,image/jpeg,image/png" class="form__input" />
            <span class="bn-spec" id="bn-mobile-info">800 × 200 px recomendado · si no la subes, se usa la de escritorio</span>
            <div class="bn-preview bn-preview--mobile" id="bn-mobile-preview"><span class="muted">Vista previa</span></div>
          </div>
          <div class="form__actions form__group--full">
            <button type="button" class="btn btn--ghost" id="bn-cancel">Cancelar</button>
            <button type="submit" class="btn btn--primary" id="bn-save">Guardar banner</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">Banners</h2>
          <span class="muted" id="bn-total">${cached.length} en total</span>
        </div>
        ${loadError ? `<p class="empty-state">No se pudo cargar la lista: ${escapeHtml(loadError)}</p>` : `
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Vista</th><th>Banner</th><th>Fechas</th><th class="col-center">Orden</th><th>Estado</th><th class="col-center">Acciones</th></tr></thead>
            <tbody id="bn-rows">${renderRows(cached)}</tbody>
          </table>
        </div>`}
      </section>
    `;
  },

  async afterRender() {
    const deployed = isDeployedBundle();
    const form = document.getElementById('bn-form');
    const toggle = document.getElementById('bn-toggle');
    const rows = document.getElementById('bn-rows');
    const $ = (id) => document.getElementById(id);

    const paint = () => {
      if (rows) rows.innerHTML = renderRows(cached);
      const k = kpis(cached);
      for (const key of ['live', 'soon', 'past', 'off']) {
        const el = $(`bn-k-${key}`);
        if (el) el.textContent = String(k[key]);
      }
      if ($('bn-total')) $('bn-total').textContent = `${cached.length} en total`;
    };

    const resetForm = () => {
      form.reset();
      $('bn-order').value = '0';
      $('bn-active').checked = true;
      pending.desktop = '';
      pending.mobile = '';
      editingId = '';
      $('bn-form-title').textContent = 'Nuevo banner';
      for (const kind of ['desktop', 'mobile']) {
        $(`bn-${kind}-preview`).innerHTML = '<span class="muted">Vista previa</span>';
        $(`bn-${kind}-info`).textContent = kind === 'desktop' ? '1920 × 160 px recomendado' : '800 × 200 px recomendado · si no la subes, se usa la de escritorio';
      }
    };

    const openForm = (banner) => {
      resetForm();
      form.hidden = false;
      if (banner) {
        editingId = banner.id;
        $('bn-form-title').textContent = 'Editar banner';
        $('bn-title').value = banner.title || '';
        $('bn-alt').value = banner.alt || '';
        $('bn-link').value = banner.link || '';
        $('bn-start').value = banner.startAt || '';
        $('bn-end').value = banner.endAt || '';
        $('bn-order').value = String(banner.order || 0);
        $('bn-active').checked = banner.active !== false;
        $('bn-desktop-preview').innerHTML = `<img src="${escapeHtml(banner.desktopUrl)}" alt="" />`;
        if (banner.mobileUrl) $('bn-mobile-preview').innerHTML = `<img src="${escapeHtml(banner.mobileUrl)}" alt="" />`;
        $('bn-desktop-info').textContent = 'Sube otra imagen solo si quieres reemplazarla.';
        $('bn-mobile-info').textContent = 'Sube otra imagen solo si quieres reemplazarla.';
      }
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('bn-alt').focus({ preventScroll: true });
    };

    toggle?.addEventListener('click', () => (form.hidden ? openForm(null) : (form.hidden = true)));
    $('bn-cancel')?.addEventListener('click', () => { resetForm(); form.hidden = true; });

    for (const kind of ['desktop', 'mobile']) {
      $(`bn-${kind}`)?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        pending[kind] = '';
        if (!file) return;
        const info = $(`bn-${kind}-info`);
        info.textContent = 'Optimizando…';
        try {
          const out = await optimize(file, kind);
          pending[kind] = out.dataUrl;
          $(`bn-${kind}-preview`).innerHTML = `<img src="${out.dataUrl}" alt="" />`;
          info.innerHTML = `${out.width} × ${out.height} px · ${Math.round(out.bytes / 1024)} KB listo para publicar${out.naturalWidth < SPECS[kind].width ? ' · <span class="bn-warn">más pequeña que lo recomendado: puede verse borrosa</span>' : ''}${out.warn ? ` · <span class="bn-warn">${escapeHtml(out.warn)}</span>` : ''}`;
        } catch (e) {
          event.target.value = '';
          info.textContent = e.message;
          showToast(e.message, 'error');
        }
      });
    }

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        title: $('bn-title').value.trim(),
        alt: $('bn-alt').value.trim(),
        link: $('bn-link').value.trim(),
        startAt: $('bn-start').value,
        endAt: $('bn-end').value,
        order: Number($('bn-order').value) || 0,
        active: $('bn-active').checked,
        desktopImage: pending.desktop || undefined,
        mobileImage: pending.mobile || undefined,
      };
      if (!payload.alt) return showToast('Escribe el texto alternativo.', 'error');
      if (!editingId && !payload.desktopImage) return showToast('Sube la imagen de escritorio.', 'error');
      if (payload.startAt && payload.endAt && payload.endAt < payload.startAt) return showToast('La fecha de fin es anterior a la de inicio.', 'error');

      const btn = $('bn-save');
      btn.disabled = true;
      btn.textContent = 'Publicando…';
      try {
        let item;
        if (deployed) {
          item = (await api(editingId ? 'update' : 'create', editingId ? { id: editingId, ...payload } : payload)).item;
        } else {
          const prev = cached.find((b) => b.id === editingId) || {};
          item = {
            ...prev, ...payload, id: editingId || `demo-${Date.now()}`,
            desktopUrl: payload.desktopImage || prev.desktopUrl, mobileUrl: payload.mobileImage || prev.mobileUrl || '',
            createdAt: prev.createdAt || new Date().toISOString(),
          };
        }
        cached = editingId ? cached.map((b) => (b.id === item.id ? item : b)) : [...cached, item];
        cached.sort((a, b) => (a.order || 0) - (b.order || 0));
        showToast(editingId ? 'Banner actualizado.' : 'Banner creado.', 'success', { title: 'Listo' });
        resetForm();
        form.hidden = true;
        paint();
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar banner';
      }
    });

    rows?.addEventListener('click', async (event) => {
      const btn = event.target.closest('button');
      if (!btn) return;
      if (btn.dataset.edit) return openForm(cached.find((b) => b.id === btn.dataset.edit));

      if (btn.dataset.toggle) {
        const active = !btn.dataset.active;
        try {
          const item = deployed
            ? (await api('toggle', { id: btn.dataset.toggle, active })).item
            : { ...cached.find((b) => b.id === btn.dataset.toggle), active };
          cached = cached.map((b) => (b.id === item.id ? { ...b, ...item } : b));
          showToast(active ? 'Banner activado.' : 'Banner desactivado.', 'success');
          paint();
        } catch (e) {
          showToast(e.message, 'error');
        }
        return;
      }

      if (btn.dataset.delete) {
        const ok = await confirmDialog({
          title: 'Eliminar banner',
          message: '<p>Se quita del sitio y sus imágenes van a la papelera de Wix Media. Si solo quieres pausarlo, usa «Desactivar».</p>',
          confirmLabel: 'Sí, eliminar',
          danger: true,
        });
        if (!ok) return;
        try {
          if (deployed) await api('delete', { id: btn.dataset.delete });
          cached = cached.filter((b) => b.id !== btn.dataset.delete);
          showToast('Banner eliminado.', 'success');
          paint();
        } catch (e) {
          showToast(e.message, 'error');
        }
      }
    });
  },
};
