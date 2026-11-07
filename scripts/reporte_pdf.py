# -*- coding: utf-8 -*-
"""Genera el reporte de avance de CS Travel (Etapa 1) en PDF."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
)

OUT = r"C:\Users\NICOLAS\Desktop\Reporte CS Travel - Etapa 1.pdf"

# Paleta de marca
BLUE_DEEP = colors.HexColor("#0a2540")
BLUE = colors.HexColor("#0058c1")
BLUE_SOFT = colors.HexColor("#e7f0fb")
GREEN = colors.HexColor("#1a7f4b")
GREEN_SOFT = colors.HexColor("#e3f3ea")
AMBER = colors.HexColor("#c77700")
AMBER_SOFT = colors.HexColor("#fdf1dd")
GRAY = colors.HexColor("#44505f")
GRAY_SOFT = colors.HexColor("#f1f4f8")
LINE = colors.HexColor("#d7dde5")

styles = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=styles["Heading1"], textColor=BLUE_DEEP,
                    fontSize=14, spaceBefore=14, spaceAfter=6, leading=18)
BODY = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10,
                      textColor=GRAY, leading=15, spaceAfter=4, alignment=TA_LEFT)
SMALL = ParagraphStyle("Small", parent=BODY, fontSize=8.5,
                       textColor=colors.HexColor("#6b7787"))
LEAD = ParagraphStyle("Lead", parent=BODY, fontSize=10, leading=15)
CELL = ParagraphStyle("Cell", parent=BODY, fontSize=9, leading=12, spaceAfter=0)
CELLB = ParagraphStyle("CellB", parent=CELL, textColor=BLUE_DEEP,
                       fontName="Helvetica-Bold")
WHITE_TITLE = ParagraphStyle("WT", parent=styles["Title"], textColor=colors.white,
                             fontSize=22, leading=24, spaceAfter=0)
WHITE_SUB = ParagraphStyle("WS", parent=styles["Normal"], textColor=colors.white,
                           fontSize=10.5, leading=14)


def badge(text, fg, bg):
    return Table([[Paragraph(f'<b>{text}</b>',
                  ParagraphStyle("b", parent=CELL, textColor=fg, fontSize=8,
                                 alignment=1))]],
                 colWidths=[26 * mm],
                 style=TableStyle([
                     ("BACKGROUND", (0, 0), (-1, -1), bg),
                     ("TOPPADDING", (0, 0), (-1, -1), 3),
                     ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                     ("ROUNDEDCORNERS", [4, 4, 4, 4]),
                     ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                 ]))


story = []

# ---- Banda de titulo ----
header = Table([
    [Paragraph("CS&nbsp;TRAVEL", WHITE_TITLE)],
    [Paragraph("Reporte de avance &mdash; Etapa 1: Empresas y Médicos", WHITE_SUB)],
    [Paragraph("Junio 2026", WHITE_SUB)],
], colWidths=[170 * mm])
header.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), BLUE_DEEP),
    ("LEFTPADDING", (0, 0), (-1, -1), 18),
    ("RIGHTPADDING", (0, 0), (-1, -1), 18),
    ("TOPPADDING", (0, 0), (0, 0), 16),
    ("BOTTOMPADDING", (0, -1), (-1, -1), 14),
    ("TOPPADDING", (0, 1), (-1, -1), 1),
]))
story += [header, Spacer(1, 14)]

# ---- 1. Estado de despliegue ----
story.append(Paragraph("1. Estado de despliegue", H1))
story.append(Paragraph(
    "Qué está publicado y dónde. Todos los arreglos de frontend de esta etapa "
    "están en vivo; al sitio del dominio se publica con cada release.", BODY))
story.append(Spacer(1, 4))

dep_rows = [
    [Paragraph("<b>Destino</b>", CELLB), Paragraph("<b>Enlace</b>", CELLB),
     Paragraph("<b>Estado</b>", CELLB)],
    [Paragraph("Landing pública", CELL), Paragraph("cstravelgroup.com", CELL),
     badge("EN VIVO", GREEN, GREEN_SOFT)],
    [Paragraph("Portal demo", CELL), Paragraph("theo272004.github.io/cs-travel", CELL),
     badge("EN VIVO", GREEN, GREEN_SOFT)],
    [Paragraph("Portal real (médicos / empresas / admin)", CELL),
     Paragraph("cstravelgroup.com/portal", CELL),
     badge("EN VIVO", GREEN, GREEN_SOFT)],
]
t = Table(dep_rows, colWidths=[62 * mm, 70 * mm, 38 * mm])
t.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), BLUE_SOFT),
    ("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
]))
story += [t, Spacer(1, 12)]

# ---- 2. Lo construido ----
story.append(Paragraph("2. Lo construido", H1))
built = [
    ("Landing y marca", "Sitio público en Wix Headless + Astro con la identidad visual de la marca."),
    ("Portal de 3 roles", "Médico, empresa y administrador. SPA compilada y servida desde el sitio real, con login real de Wix Members y cookie de sesión firmada (httpOnly, HMAC)."),
    ("Datos 100% reales sobre Wix", "Cada rol ve solo lo suyo (seguridad del lado del servidor): médico→sus casos, empresa→sus solicitudes, admin→todo. Un usuario nuevo arranca en cero, sin datos falsos."),
    ("Flujo del médico", "Crea casos, calculadora de margen en vivo (precio al paciente + ganancia + ahorro), descarga la cotización en PDF y ve su dashboard de ganancias."),
    ("Flujo del administrador", "Gestiona todo, crea usuarios con correo de activación en español, define costos y márgenes, y cotiza."),
    ("Modelo de 6 estados", "Solicitud enviada → cotización enviada → aprobada → en gestión → finalizada / cancelada."),
    ("Inventario real de viajes (Amadeus)", "El admin busca vuelos y hoteles reales para armar el costo base. API gratuita; funciona en modo demo hasta configurar la clave."),
    ("Correcciones de robustez", "Paginación de Wix, companyId real de empresa y borrado del miembro Wix al eliminar un usuario."),
    ("Pulido de frontend", "Selects con una sola flecha, datos del paciente con separación uniforme y tarjeta de Soporte CST responsive (móvil, tablet, portátil)."),
]
for title, desc in built:
    story.append(Paragraph(f'<b><font color="#0058c1">{title}.</font></b> {desc}', LEAD))
story.append(Spacer(1, 8))

# ---- 3. Evaluacion Etapa 1 ----
story.append(Paragraph("3. ¿La Etapa 1 está terminada?", H1))
assess = Table([[Paragraph(
    "<b>La Etapa 1 está sustancialmente completa y ya en producción.</b> El núcleo "
    "—portal seguro, datos reales y el ciclo médico → cotización → margen → PDF— "
    "funciona y está publicado. Puede darse por terminada para un piloto o "
    "lanzamiento controlado; queda 100% cerrada al resolver los 3 puntos de abajo.",
    LEAD)]], colWidths=[170 * mm])
assess.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), GREEN_SOFT),
    ("LEFTPADDING", (0, 0), (-1, -1), 12),
    ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ("TOPPADDING", (0, 0), (-1, -1), 10),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ("LINEBEFORE", (0, 0), (0, -1), 3, GREEN),
]))
story += [assess, Spacer(1, 10)]

story.append(Paragraph("Pendientes para cerrar al 100%", ParagraphStyle(
    "h2", parent=H1, fontSize=11, spaceBefore=2, spaceAfter=4)))
pend = [
    ("Clave de Amadeus (acción del cliente, ~5 min)",
     "Para que el inventario de viajes pase de demo a datos reales."),
    ("Vincular empresa ↔ compañía",
     "Al crear un usuario empresa, su companyId queda vacío hasta asociarlo a una Company; falta completar/verificar ese paso del flujo de empresas."),
    ("Prueba real de punta a punta",
     "Con un médico y un admin reales: crear caso → cotizar → margen → PDF, para confirmar el ciclo en producción."),
]
for i, (t1, t2) in enumerate(pend, 1):
    story.append(Paragraph(f'<b>{i}. {t1}.</b> {t2}', LEAD))
story.append(Spacer(1, 10))

# ---- 4. Etapa 2 ----
story.append(Paragraph("4. Para la Etapa 2 (futuro)", H1))
for it in [
    "Pasarela de pago (Wompi / ePayco para Colombia).",
    "Conversión de moneda USD → COP en el costo base.",
    "Reserva y emisión real vía la API de viajes (requiere cuenta de producción de Amadeus).",
]:
    story.append(Paragraph(f'&bull;&nbsp;&nbsp;{it}', LEAD))
story.append(Spacer(1, 12))

# ---- 5. Repositorios ----
story.append(Paragraph("5. Repositorios y enlaces", H1))
repo_rows = [
    [Paragraph("<b>Proyecto</b>", CELLB), Paragraph("<b>Repositorio</b>", CELLB),
     Paragraph("<b>GitHub Pages</b>", CELLB)],
    [Paragraph("Landing principal", CELL),
     Paragraph("theo272004/cs-travel-group", CELL),
     Paragraph("theo272004.github.io/cs-travel-group", CELL)],
    [Paragraph("Portal (prototipo/SPA)", CELL),
     Paragraph("theo272004/cs-travel", CELL),
     Paragraph("theo272004.github.io/cs-travel", CELL)],
    [Paragraph("Sitio real (producción)", CELL),
     Paragraph("theo272004/cstravelgroup", CELL),
     Paragraph("cstravelgroup.com", CELL)],
]
rt = Table(repo_rows, colWidths=[48 * mm, 62 * mm, 60 * mm])
rt.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), BLUE_SOFT),
    ("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
]))
story += [rt, Spacer(1, 16)]

story.append(HRFlowable(width="100%", thickness=0.6, color=LINE))
story.append(Paragraph(
    "Stack: Wix Headless + Astro (backend, datos y autenticación) · SPA en JavaScript "
    "vanilla + Vite (portal) · Wix Data v2 (base de datos) · Amadeus Self-Service "
    "(inventario de viajes). Reporte generado automáticamente.", SMALL))


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#97a1ad"))
    canvas.drawString(20 * mm, 12 * mm, "CS Travel — Reporte de avance · Etapa 1")
    canvas.drawRightString(190 * mm, 12 * mm, "Página %d" % doc.page)
    canvas.restoreState()


doc = SimpleDocTemplate(OUT, pagesize=A4,
                        leftMargin=20 * mm, rightMargin=20 * mm,
                        topMargin=16 * mm, bottomMargin=18 * mm,
                        title="Reporte CS Travel - Etapa 1",
                        author="CS Travel")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("PDF generado:", OUT)
