# Misión: Recordar una corrección enseñada por voz y usarla al manejar el computador

- Repo: `miracle` (por confirmar) · Tipo: feature
- Prioridad: 70 · Riesgo estimado: medium
- Pedida por: equipo · Fecha: 2026-10-01

## Objetivo
Cuando el usuario corrige por voz cómo debe diligenciarse un campo ("el diagnóstico va en el campo de impresión diagnóstica, no en observaciones"), el asistente guarda esa corrección y la aplica la próxima vez que ejecute esa acción en el sistema clínico, sin que el usuario la repita.

## Criterio de aceptación
- [ ] Una corrección dictada por voz queda persistida con procedencia (usuario, fecha, acción, campo).
- [ ] En una sesión posterior, la misma acción usa el campo corregido (prueba con el simulador del sistema clínico).
- [ ] Una segunda corrección reemplaza a la primera; la primera no reaparece.
- [ ] La corrección de un usuario no se aplica a otro usuario.
- [ ] Sin almacenamiento de memoria disponible, la acción se ejecuta como antes y se informa que no se pudo recordar.

## Decisiones ya tomadas
- Se recuerda el campo destino de la acción, no el texto dictado (equipo).

## Contexto y referencias
- Playbooks: memoria (lidera), computer-use (aplica la corrección). Voz no cambia: la captura ya existe.

## Restricciones
- Sin datos de pacientes en pruebas; usar el simulador.
- Contrato propuesto para registrar como ADR si se acepta: `Correction {source:"voice", target:{action, field}, value, confidence, user_id, created_at}`.

## Cómo se comprobará después de publicar
- Evaluación repetible de calidad: enseñar → aplicar → corregir de nuevo → aplicar; y métrica de "correcciones repetidas por el usuario" en los logs (debe bajar).
