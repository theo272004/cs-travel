import { doctorService } from '../services/doctorService.js';
import { medicalCaseService } from '../services/medicalCaseService.js';
import { codeService } from '../services/codeService.js';
import { referralService } from '../services/referralService.js';
import { MedicalCaseTable } from '../components/MedicalCaseTable.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { escapeHtml } from '../utils/escapeHtml.js';

// ---------------------------------------------------------------------------
// Seguimiento de referidos del médico. Persiste vía referralService (misma
// coleccion "Referrals" que las empresas, pero con doctorId), para que lo que
// registra el admin aqui lo vea el propio medico en su dashboard.
// ---------------------------------------------------------------------------
const REF_STATUS_D = {
  escribio:   { label: 'Escribió',   css: 'escribio'  },
  cotizo:     { label: 'Cotizó',     css: 'cotizo'    },
  aprobado:   { label: 'Aprobado',   css: 'aprobado'  },
  finalizado: { label: 'Finalizado', css: 'finalizado'},
};
const COMM_STATUSES_D = ['aprobado', 'finalizado'];

function fmtCopD(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n || 0));
}

function renderRefSectionD() {
  return `
    <section class="panel" id="ref-panel">
      <div class="panel__header">
        <h2 class="panel__title">Seguimiento de Referidos</h2>
        <button type="button" class="btn btn--ghost" id="toggle-ref-form">+ Añadir</button>
      </div>
      <div class="ref-summary" id="ref-summary"></div>
      <form id="ref-add-form" class="form form--grid ref-add-form" hidden>
        <div class="form__group">
          <label class="form__label">Nombre del referido *</label>
          <input type="text" name="refName" class="form__input" placeholder="Ej: Juan García" />
        </div>
        <div class="form__group">
          <label class="form__label">Fecha de contacto</label>
          <input type="date" name="refDate" class="form__input" value="${new Date().toISOString().slice(0,10)}" />
        </div>
        <div class="form__group">
          <label class="form__label">Estado</label>
          <select name="refStatus" class="form__input">
            ${Object.entries(REF_STATUS_D).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}
          </select>
        </div>
        <div class="form__group">
          <label class="form__label">Monto del servicio (COP)</label>
          <input type="number" name="refAmount" class="form__input" min="0" value="0" placeholder="0" />
        </div>
        <div class="form__group">
          <label class="form__label">Comisión (%)</label>
          <input type="number" name="refCommPct" class="form__input" min="0" max="100" value="10" step="0.5" />
        </div>
        <div class="form__group form__group--full">
          <label class="form__label">Notas</label>
          <textarea name="refNotes" class="form__input" rows="2" placeholder="Servicio de interés, observaciones…"></textarea>
        </div>
        <div class="form__actions form__group--full">
          <button type="submit" class="btn btn--primary">Guardar referido</button>
          <button type="button" class="btn btn--ghost" id="cancel-ref-form">Cancelar</button>
        </div>
      </form>
      <div class="table-wrapper" id="ref-table-wrapper"></div>
    </section>
  `;
}

function renderRefTableD(refs) {
  if (!refs.length) {
    return '<p class="ref-empty">Sin referidos registrados. Usa "+ Añadir" para registrar el primero.</p>';
  }
  const rows = refs.map((r) => {
    const meta = REF_STATUS_D[r.status] || REF_STATUS_D.escribio;
    const commission = COMM_STATUSES_D.includes(r.status) && r.amount > 0
      ? fmtCopD(r.amount * r.commissionPct / 100)
      : '<span class="muted">En proceso</span>';
    const amount = r.amount > 0 ? fmtCopD(r.amount) : '—';
    const dateStr = r.date ? new Date(r.date + 'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' }) : '—';
    return `
      <tr>
        <td><strong>${escapeHtml(r.name)}</strong>${r.notes ? `<br><small class="muted">${escapeHtml(r.notes)}</small>` : ''}</td>
        <td>${dateStr}</td>
        <td><span class="ref-status ref-status--${meta.css}">${meta.label}</span></td>
        <td>${amount}</td>
        <td>${commission}</td>
        <td class="ref-actions">
          <select class="form__input" style="padding:4px 8px;font-size:12px;min-height:unset;" data-ref-status="${escapeHtml(String(r.id))}">
            ${Object.entries(REF_STATUS_D).map(([k,v]) => `<option value="${k}"${r.status===k?' selected':''}>${v.label}</option>`).join('')}
          </select>
          <button type="button" class="btn btn--ghost" data-ref-delete="${escapeHtml(String(r.id))}" style="padding:4px 8px;font-size:12px;">✕</button>
        </td>
      </tr>`;
  }).join('');

  return `
    <table class="data-table ref-table">
      <thead>
        <tr>
          <th>Referido</th><th>Fecha</th><th>Estado</th><th>Monto</th><th>Comisión</th><th>Acciones</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderRefSummaryD(refs) {
  const total = refs.length;
  const approved = refs.filter(r => COMM_STATUSES_D.includes(r.status)).length;
  const totalComm = refs
    .filter(r => COMM_STATUSES_D.includes(r.status) && r.amount > 0)
    .reduce((s, r) => s + r.amount * r.commissionPct / 100, 0);
  return `
    <div class="ref-summary__stat"><span class="ref-summary__num ref-summary__num--blue">${total}</span><span class="ref-summary__lbl">Total referidos</span></div>
    <div class="ref-summary__stat"><span class="ref-summary__num ref-summary__num--amber">${approved}</span><span class="ref-summary__lbl">Aprobados / Finalizados</span></div>
    <div class="ref-summary__stat"><span class="ref-summary__num ref-summary__num--green">${fmtCopD(totalComm)}</span><span class="ref-summary__lbl">Comisión total generada</span></div>
  `;
}

function bindRefSectionD(id) {
  const toggleBtn = document.getElementById('toggle-ref-form');
  const addForm   = document.getElementById('ref-add-form');
  const cancelBtn = document.getElementById('cancel-ref-form');
  const wrapper   = document.getElementById('ref-table-wrapper');
  const summary   = document.getElementById('ref-summary');

  async function refresh() {
    let refs = [];
    try { refs = await referralService.getByDoctor(id); } catch { refs = []; }
    if (wrapper) wrapper.innerHTML = renderRefTableD(refs);
    if (summary) summary.innerHTML = renderRefSummaryD(refs);
    bindTableActions();
  }

  function bindTableActions() {
    wrapper?.querySelectorAll('[data-ref-status]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        try { await referralService.update(sel.dataset.refStatus, { status: sel.value }); } catch {}
        refresh();
      });
    });
    wrapper?.querySelectorAll('[data-ref-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try { await referralService.remove(btn.dataset.refDelete); } catch {}
        refresh();
      });
    });
  }

  toggleBtn?.addEventListener('click', () => { addForm.hidden = !addForm.hidden; });
  cancelBtn?.addEventListener('click', () => { addForm.hidden = true; addForm.reset(); });

  addForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = addForm.refName.value.trim();
    if (!name) { addForm.refName.focus(); return; }
    try {
      await referralService.create({
        doctorId: id,
        name,
        date: addForm.refDate.value,
        status: addForm.refStatus.value,
        amount: Number(addForm.refAmount.value) || 0,
        commissionPct: Number(addForm.refCommPct.value) || 0,
        notes: addForm.refNotes.value.trim(),
      });
    } catch (err) {
      // No bloqueamos la UI; si falla la persistencia el refresh mostrara el estado real.
    }
    addForm.hidden = true;
    addForm.reset();
    addForm.refDate.value = new Date().toISOString().slice(0, 10);
    addForm.refCommPct.value = '10';
    refresh();
  });

  refresh();
}

const EARNED = ['aprobada', 'en gestion', 'finalizada'];

/** Aporte del medico: ingreso a CS Travel, ganancia del medico y ahorro al paciente. */
function renderDoctorProfit(cases) {
  const incomeCST = cases.reduce((s, c) => s + (c.csTravelMargin || 0), 0);
  const doctorEarnings = cases
    .filter((c) => EARNED.includes(c.status))
    .reduce((s, c) => s + (c.doctorMargin || 0), 0);
  const patientSavings = cases.reduce((s, c) => {
    const market = c.marketReferenceCost || 0;
    const finalValue = c.finalPatientValue || 0;
    return s + (market > 0 && finalValue > 0 ? Math.max(0, market - finalValue) : 0);
  }, 0);

  return `
    <section class="panel profit-panel">
      <div class="panel__header">
        <h2 class="panel__title">Rentabilidad del aliado</h2>
        <span class="chip chip--ok">Aliado activo</span>
      </div>
      <div class="profit-grid">
        <div class="profit-stat">
          <span>Ingreso generado a CS Travel</span>
          <strong class="text-green">${formatCurrency(incomeCST)}</strong>
          <small>Margen propio sobre sus casos</small>
        </div>
        <div class="profit-stat">
          <span>Ganancia del medico</span>
          <strong class="text-amber">${formatCurrency(doctorEarnings)}</strong>
          <small>Margen ganado en casos cerrados</small>
        </div>
        <div class="profit-stat">
          <span>Ahorro entregado a pacientes</span>
          <strong class="text-green">${formatCurrency(patientSavings)}</strong>
          <small>Frente al precio de mercado</small>
        </div>
      </div>
    </section>
  `;
}

export const AdminDoctorDetailView = {
  async render(ctx) {
    const { id } = ctx.params;
    const [doctor, cases, assignedCodes] = await Promise.all([
      doctorService.getById(id),
      medicalCaseService.getByDoctor(id),
      codeService.getByOwner('doctor', id).catch(() => []),
    ]);

    const toggleLabel = doctor.status === 'active' ? 'Desactivar' : 'Activar';

    // Estado del codigo de referido del medico: asignado o pendiente.
    const codeChip = assignedCodes.length
      ? `<span class="chip chip--ok">Código referido: ${assignedCodes.map((c) => escapeHtml(c.code)).join(', ')} ✓</span>`
      : `<a href="#/admin/codes" class="chip chip--amber" style="text-decoration:none">Código referido: pendiente · asignar →</a>`;

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">${escapeHtml(doctor.clinicName)}</h1>
          <p class="page-subtitle">
            ${StatusBadge(doctor.status)}
            <span class="chip">${escapeHtml(doctor.name)}</span>
            <span class="chip">Codigo: ${escapeHtml(doctor.sharedCode)}</span>
            ${codeChip}
            <span class="muted">Actualizado: ${formatDate(doctor.lastUpdate, true)}</span>
          </p>
        </div>
        <div class="page-header__actions">
          <button class="btn btn--ghost" id="toggle-doctor-status">${toggleLabel}</button>
          <a href="#/admin/doctors" class="btn btn--ghost">← Volver</a>
        </div>
      </div>

      ${renderDoctorProfit(cases)}

      <section class="panel">
        <h2 class="panel__title">Datos y metricas del medico</h2>
        <form id="doctor-edit-form" class="form form--grid">
          <div class="form__group">
            <label class="form__label">Nombre del medico</label>
            <input type="text" name="name" class="form__input" value="${escapeHtml(doctor.name)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Clinica / consultorio</label>
            <input type="text" name="clinicName" class="form__input" value="${escapeHtml(doctor.clinicName)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Especialidad</label>
            <input type="text" name="specialty" class="form__input" value="${escapeHtml(doctor.specialty)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Email</label>
            <input type="email" name="email" class="form__input" value="${escapeHtml(doctor.email)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Telefono</label>
            <input type="text" name="phone" class="form__input" value="${escapeHtml(doctor.phone)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Codigo compartido</label>
            <input type="text" name="sharedCode" class="form__input" value="${escapeHtml(doctor.sharedCode)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Casos registrados</label>
            <input type="number" name="totalCases" class="form__input" value="${doctor.totalCases}" min="0" />
          </div>
          <div class="form__group">
            <label class="form__label">Casos activos</label>
            <input type="number" name="activeCases" class="form__input" value="${doctor.activeCases}" min="0" />
          </div>
          <div class="form__group">
            <label class="form__label">Logistica estimada</label>
            <input type="number" name="estimatedLogistics" class="form__input" value="${doctor.estimatedLogistics}" min="0" />
          </div>
          <div class="form__group">
            <label class="form__label">Margen estimado</label>
            <input type="number" name="estimatedMargin" class="form__input" value="${doctor.estimatedMargin}" min="0" />
          </div>
          <div class="form__alert form__group--full" id="doctor-edit-alert" hidden></div>
          <div class="form__actions form__group--full">
            <button type="submit" class="btn btn--primary">Guardar cambios</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">Casos del medico</h2>
        </div>
        ${MedicalCaseTable(cases, { detailBase: '#/admin/medical-cases' })}
      </section>

      ${renderRefSectionD()}
    `;
  },

  async afterRender(ctx) {
    const { id } = ctx.params;
    const form = document.getElementById('doctor-edit-form');
    const alert = document.getElementById('doctor-edit-alert');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      alert.hidden = true;

      const payload = {
        name: form.name.value.trim(),
        clinicName: form.clinicName.value.trim(),
        specialty: form.specialty.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim(),
        sharedCode: form.sharedCode.value.trim(),
        totalCases: Number(form.totalCases.value) || 0,
        activeCases: Number(form.activeCases.value) || 0,
        estimatedLogistics: Number(form.estimatedLogistics.value) || 0,
        estimatedMargin: Number(form.estimatedMargin.value) || 0,
      };

      try {
        await doctorService.update(id, payload);
        alert.textContent = 'Cambios guardados correctamente.';
        alert.className = 'form__alert form__alert--success';
        alert.hidden = false;
        setTimeout(() => window.dispatchEvent(new HashChangeEvent('hashchange')), 600);
      } catch (error) {
        alert.textContent = `Error al guardar: ${error.message}`;
        alert.className = 'form__alert';
        alert.hidden = false;
      }
    });

    document.getElementById('toggle-doctor-status').addEventListener('click', async () => {
      const doctor = await doctorService.getById(id);
      await doctorService.toggleStatus(doctor);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    // --- Seguimiento de referidos (referralService · doctorId) -------------
    bindRefSectionD(id);
  },
};
