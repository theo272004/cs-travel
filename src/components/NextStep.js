/**
 * NextStep.js
 * =============================================================================
 * Tarjeta «Próximo paso» para la empresa (solicitudes) y el médico (casos):
 * dice en una frase en qué va, a quién le toca y qué hacer ahora, con el botón
 * que lleva directo a esa acción. Va entre el encabezado y la línea de tiempo.
 *
 * Reutiliza las clases .case-nextstep del panel del administrador, así las tres
 * miradas del mismo proceso se ven iguales. Los botones no hacen nada propio:
 * llevan a la acción que ya existe en la página (aprobar, fijar margen, pagar),
 * con data-go = selector del elemento al que hay que ir o que hay que pulsar.
 * =============================================================================
 */

import { icon } from '../utils/icons.js';
import { escapeHtml } from '../utils/escapeHtml.js';

function card(s) {
  const cta = s.href
    ? `<a class="btn btn--primary case-nextstep__cta" href="${s.href}">${escapeHtml(s.cta)}</a>`
    : s.cta
      ? `<button type="button" class="btn btn--primary case-nextstep__cta" data-go="${s.go}"${s.press ? ' data-press="1"' : ''}>${escapeHtml(s.cta)}</button>`
      : '';
  return `
    <section class="case-nextstep case-nextstep--${s.tone}" aria-label="Próximo paso" aria-live="polite">
      <span class="case-nextstep__icon" aria-hidden="true">${icon(s.icon, { size: 24, stroke: 2 })}</span>
      <div class="case-nextstep__body">
        ${s.step ? `<span class="case-nextstep__step">${s.step}</span>` : ''}
        <strong class="case-nextstep__title">${s.title}</strong>
        <p class="case-nextstep__desc">${s.desc}</p>
      </div>
      ${cta}
    </section>`;
}

/** Próximo paso de una solicitud, visto por la empresa. */
export function companyNextStep(request) {
  const S = {
    'solicitud enviada': {
      tone: 'wait', icon: 'clock', title: 'CS Travel está preparando tu cotización',
      desc: 'Te avisamos en la campana cuando esté lista. Mientras tanto puedes corregir los datos del viaje.',
      cta: 'Editar solicitud', href: `#/company/requests/new?edit=${request.id}`,
    },
    'cotizacion enviada': {
      tone: 'action', step: 'Paso 1 de 2 · Te toca a ti', icon: 'file', title: 'Revisa y aprueba tu cotización',
      desc: 'Mira el costo y el ahorro abajo. Si todo está bien, apruébala para pasar al pago.',
      cta: 'Aprobar cotización', go: '#approve-request', press: true,
    },
    aprobada: {
      tone: 'action', step: 'Paso 2 de 2 · Te toca a ti', icon: 'card', title: 'Paga para confirmar el viaje',
      desc: 'Con el pago, CS Travel reserva vuelos, hotel y traslados. Puedes pagar con tarjeta, PSE o transferencia.',
      cta: 'Ir al pago', go: '.panel--pay',
    },
    'en gestion': {
      tone: 'wait', icon: 'plane', title: 'CS Travel está gestionando tu viaje',
      desc: 'Pago recibido. Estamos reservando todo; cualquier novedad te llega a la campana.',
    },
    finalizada: { tone: 'done', icon: 'check', title: 'Viaje completado', desc: 'Esta solicitud quedó cerrada. ¡Gracias por viajar con CS Travel!' },
    cancelada: {
      tone: 'cancel', icon: 'x', title: 'Solicitud cancelada',
      desc: request.lostReason ? `Motivo: ${escapeHtml(request.lostReason)}` : 'Si fue un error, escríbenos y la retomamos.',
    },
  };
  return card(S[request.status] || S['solicitud enviada']);
}

/** Próximo paso de un caso médico, visto por el médico. */
export function doctorNextStep(item) {
  const patient = escapeHtml(item.patientName || 'tu paciente');
  const hasMargin = (item.doctorMargin || 0) > 0;
  const S = {
    'solicitud enviada': {
      tone: 'wait', icon: 'clock', title: 'CS Travel está preparando la cotización',
      desc: `Armamos la logística del viaje de ${patient}. Te avisamos en la campana cuando esté lista.`,
      cta: 'Editar caso', href: `#/doctor/cases/new?edit=${item.id}`,
    },
    'cotizacion enviada': hasMargin
      ? {
        tone: 'wait', step: 'Paso 2 de 3', icon: 'users', title: `Esperando que ${patient} apruebe`,
        desc: 'Ya fijaste tu margen y la cotización está lista para enviársela. Cuando tu paciente diga que sí, márcalo aquí.',
        cta: 'Mi paciente aprobó', go: '#approve-case', press: true,
      }
      : {
        tone: 'action', step: 'Paso 1 de 3 · Te toca a ti', icon: 'money', title: 'Fija tu margen',
        desc: 'Mueve el control de tu ganancia y guarda. Con eso se genera la cotización para tu paciente.',
        cta: 'Fijar mi margen', go: '.decision-center',
      },
    aprobada: {
      tone: 'action', step: 'Paso 3 de 3 · Te toca a ti', icon: 'card', title: 'Paga para poner el viaje en marcha',
      desc: 'Con el pago, CS Travel reserva todo y tu ganancia queda registrada.',
      cta: 'Ir al pago', go: '.btn--pay-quote',
    },
    'en gestion': {
      tone: 'wait', icon: 'plane', title: 'CS Travel está gestionando el viaje',
      desc: `Pago recibido. Coordinamos vuelos, hospedaje y traslados de ${patient}.`,
    },
    finalizada: { tone: 'done', icon: 'check', title: 'Caso finalizado', desc: 'El viaje terminó y tu ganancia quedó registrada.' },
    cancelada: {
      tone: 'cancel', icon: 'x', title: 'Caso cancelado',
      desc: item.lostReason ? `Motivo: ${escapeHtml(item.lostReason)}` : 'Este caso fue cancelado.',
    },
  };
  return card(S[item.status] || S['solicitud enviada']);
}

/**
 * Enlaza el botón de la tarjeta: lleva a la zona indicada (con desplazamiento
 * suave y un destello) y, si corresponde, pulsa el botón de esa acción.
 */
export function bindNextStep(root = document) {
  root.querySelector('.case-nextstep__cta[data-go]')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const target = document.querySelector(btn.dataset.go);
    if (!target) return;
    if (btn.dataset.press) { target.click(); return; }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    target.classList.remove('is-flash');
    void target.offsetWidth;
    target.classList.add('is-flash');
  });
}
