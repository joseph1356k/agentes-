---
name: estandar
description: Estándar de ingeniería de la oficina. Se precarga en todos los agentes que escriben código: cómo se prueba, cómo se cambia código con seguridad, qué no se hace nunca. Cárgalo si una sesión no lo tiene.
user-invocable: false
---

# Estándar de ingeniería

## 1. Promesa antes que código

1. Escribe (o ajusta) la prueba que demuestra el comportamiento pedido. Nómbrala por el resultado, no por el método.
2. Córrela con `oficina-run` y compruébala **en rojo** por la razón correcta.
3. Escribe el código mínimo que la pone en verde. Corre la suite del área.
4. Si el repo lo exige (p. ej. contratos en Ü Windows), **rompe el código a propósito** y comprueba que la prueba lo detecta. Una prueba que solo se ha visto en verde no vale.
5. Nunca debilitas una prueba para ponerla en verde: ni `skip`, ni `timeout` más largo sin causa, ni asserts eliminados, ni mocks que esconden el fallo. Si una prueba está mal, la arreglas y lo dices en el informe.

## 2. Cambios pequeños y legibles

- Un commit por paso coherente; mensaje en la voz del repo describiendo el resultado.
- Diff mínimo para el objetivo; no reformateas archivos enteros ni renombras por gusto.
- Nombres que dicen qué hace la cosa; funciones cortas; sin duplicar lo que ya existe (busca antes de escribir).
- Sigues las convenciones observadas en el repo (estructura, estilo, i18n, manejo de errores) por encima de tus preferencias.
- Comentarios solo donde el porqué no es obvio. Nada de TODO sin dueño: va al informe como `next_steps`.

## 3. Corrección y seguridad

- Errores manejados en el borde (entrada de usuario, red, archivos) con mensajes útiles; nunca `catch` vacío.
- Entradas validadas; consultas parametrizadas; permisos comprobados en el servidor, no en la UI.
- Secretos solo por variables de entorno; nunca en commits, logs ni fixtures. No lees `.env`.
- Datos de pacientes o de usuarios reales: jamás en pruebas, fixtures, capturas, logs ni documentación. Fixtures sintéticos.
- Logs estructurados sin datos sensibles; con el contexto necesario para comprobar la señal de un ticket.
- Contratos públicos (APIs, eventos, esquemas): compatibles hacia atrás o versionados, con el cambio registrado como decisión.
- Migraciones: numeradas, reversibles o con plan de compatibilidad escrito; nunca destructivas sin tratamiento explícito.
- Operaciones externas (crear PR, enviar, publicar): idempotentes.

## 4. Rendimiento y UX cuando aplica

- No introduces O(n²) sobre colecciones que crecen; no cargas listas enteras en memoria sin paginar.
- UI: estados de carga, error, vacío y sin conexión; foco visible; textos por i18n si el repo lo usa.
- Voz: presupuesto de latencia por etapa; cancelación limpia; sin audio real en pruebas.
- Memoria: aislamiento por usuario; recuerdos con procedencia; corrección reemplaza, no acumula.

## 5. Evidencia

Todo lo que cuente como comprobación pasa por `oficina-run --label <tipo> -- <comando>` y se cita por su `ev_...`. Lo no ejecutado va a `not_tested` con motivo y procedimiento manual. Capturas y logs en `.oficina/evidence/`. "Pasó en mi máquina" no existe.

## 6. Comunicación

Retorno con secciones fijas (`Resumen · Cambios · Evidencia · Referencias · Bloqueos · Parcial · Aprendizajes propuestos`). Dices lo que no sabes. Un resultado parcial se llama parcial. Después de dos intentos fallidos, paras y escalas con evidencia.
