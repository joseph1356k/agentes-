# Encargo: <título corto>

## Objetivo
<una frase: qué debe existir al terminar>

## Comportamiento esperado
<observable, con ejemplos de entrada → salida>

## Repo y base
- repo: `<slug>` · rama de misión: `mission/<id>-<slug>` · base_sha: `<sha>`

## Contexto
- Archivos relevantes: `<ruta>` (por qué)
- Resultado de `graphify query "<pregunta>"`: <resumen>
- Decisiones ya tomadas: <lista>
- Dónde están las pruebas del área: `<ruta>`

## Alcance y archivos propios
- Puedes editar: `<glob>`, `<glob>`
- Solo lectura: todo lo demás

## Restricciones
- Contratos intocables: <lista>
- Estilo/i18n/datos sensibles: <lista>
- Recursos: `PORT=<n>` si corres servicios

## Dependencias y contratos
- Entrega de <otro agente>: <qué y en qué formato>
- Contrato acordado: <tipos, endpoints, eventos>

## Evidencia requerida
- `oficina-run --label test -- <comando>`
- `oficina-run --label typecheck -- <comando>`
- `oficina-run --label lint -- <comando>`

## Criterio de finalización
- <condición comprobable 1>
- <condición comprobable 2>

## Escalamiento
- Para y devuelve `parcial` si: <condiciones> · tras dos intentos fallidos · si necesitas tocar archivos fuera del alcance

## Presupuesto
- ~<n> turnos
