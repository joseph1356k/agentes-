# ADR-005 · Evidencia capturada por el sistema y verificada por el ejecutor

Estado: accepted · 2026-10-01

## Problema
"No declarar pruebas aprobadas si no se ejecutaron" no se puede garantizar con instrucciones.

## Decisión
Cuatro capas: ledger de comandos (hook), `oficina-run` (registra comando, código y log y devuelve un id `ev_...`), informe final con JSON Schema que cita ids, y verificación cruzada en el ejecutor (pass ⇒ archivo con `exit_code 0`). Un informe con pruebas no verificadas nunca llega a `completed`; va a `review` con `unverified_tests`.

## Consecuencias
Los agentes deben usar `oficina-run` (los playbooks y el protocolo lo exigen); los hooks protegen `.oficina/evidence/` contra escritura directa; la verificación es barata y determinista.
