---
name: playbook-voz
description: Playbook de la especialidad Voz y conversación. Cárgalo cuando la sesión principal vaya a trabajar directamente en audio, transcripción, síntesis, interrupciones, turnos o latencia sin delegar. Se complementa con docs/oficina/areas/voz.md del repo.
user-invocable: true
---

# Playbook · Voz y conversación

## Mapa del área (genérico; el real está en `docs/oficina/areas/voz.md`)

- **Captura**: permisos, dispositivos, formato/muestreo, detección de voz (VAD), cancelación de eco.
- **Transcripción**: proveedor, streaming vs lote, idioma y vocabulario (términos clínicos), confianza por segmento.
- **Diálogo**: turnos, barge-in, estados ("escuchando", "pensando", "hablando"), continuidad entre reconexiones.
- **Síntesis**: voz, velocidad, cancelación al interrumpir, caché de frases frecuentes.
- **Latencia**: presupuesto por etapa (captura → transcripción → respuesta → síntesis) y medición real.
- **Privacidad**: retención de audio, consentimiento, nada de audio real en pruebas.

## Decisiones vigentes

Las del repo. Si no hay, propón ADR `proposed` para: proveedor y modo de transcripción, política de interrupciones, presupuesto de latencia.

## Comandos y pruebas

| Caso | Entrada | Esperado |
|---|---|---|
| Transcripción | fixture sintético | texto esperado con tolerancia definida |
| Interrupción | audio de usuario durante síntesis | síntesis se cancela en < N ms y se procesa la nueva entrada |
| Reconexión | corte de red de 5 s | la conversación continúa sin perder el turno |
| Latencia | 20 turnos | p50/p95 por etapa dentro del presupuesto |
| Proveedor caído | fallo simulado | mensaje claro y modo degradado (texto) |

## Riesgos típicos

Doble respuesta tras interrupción; pérdida de audio en reconexión; latencia que crece con el historial; vocabulario clínico mal transcrito; audio retenido sin política.

## Referencias

`graphify query "audio transcripción síntesis turnos"`, pruebas del área, ADRs.
